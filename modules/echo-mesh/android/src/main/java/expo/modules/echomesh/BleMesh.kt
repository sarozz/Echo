package expo.modules.echomesh

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattServer
import android.bluetooth.BluetoothGattServerCallback
import android.bluetooth.BluetoothGattService
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.bluetooth.le.AdvertiseCallback
import android.bluetooth.le.AdvertiseData
import android.bluetooth.le.AdvertiseSettings
import android.bluetooth.le.BluetoothLeAdvertiser
import android.bluetooth.le.BluetoothLeScanner
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.os.BatteryManager
import android.os.Build
import android.os.ParcelUuid
import android.util.Base64
import android.util.Log
import kotlinx.coroutines.CoroutineScope
import org.json.JSONObject
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicLong

/**
 * BLE GATT backend — Echo's cross-platform fallback (Android ↔ iOS).
 *
 * Topology: every device runs both a GATT server (peripheral) and a GATT
 * client (central). Devices discover one another via service-uuid scan +
 * advertise, then connect both directions and write Frame bytes into the
 * peer's writable characteristic. Inbound writes arrive at the GATT server.
 *
 * Constraints: BLE MTU caps at ~512 bytes. We request a larger MTU
 * post-connect and assume each Frame fits in one write. Frames larger than
 * the negotiated MTU are dropped with a warning — chunking + reassembly is
 * TODO(stage-2). For TEXT + SOS this is fine; VOICE is the real customer.
 */
@SuppressLint("MissingPermission")
internal class BleMesh(
  private val ctx: Context,
  private val scope: CoroutineScope,
  private val emit: (String, Any?) -> Unit,
) : MeshTransport {

  private val bluetoothMgr: BluetoothManager? =
    ctx.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
  private val adapter: BluetoothAdapter? = bluetoothMgr?.adapter

  internal companion object {
    val SERVICE_UUID: UUID = UUID.fromString("e3000001-1c01-7e57-b1ad-1ea5deadbeef")
    val CHAR_WRITE_UUID: UUID = UUID.fromString("e3000002-1c01-7e57-b1ad-1ea5deadbeef")
    val CHAR_NOTIFY_UUID: UUID = UUID.fromString("e3000003-1c01-7e57-b1ad-1ea5deadbeef")
    private const val TAG = "EchoBleMesh"
    private const val DESIRED_MTU = 512
  }

  // Outbound connections — devices we connected to as central.
  private val centrals = ConcurrentHashMap<String /* deviceAddress */, CentralLink>()
  // Inbound connections — devices currently connected to our GATT server.
  private val serverPeers = ConcurrentHashMap<String /* deviceAddress */, BluetoothDevice>()
  // App-level peer table, keyed by sender-id (post-HELLO). One mesh peer can
  // touch us via both an inbound and an outbound link; we collapse to one
  // logical peer here.
  private val peers = ConcurrentHashMap<String /* senderId */, PeerState>()

  private val seq = AtomicLong(1)
  private val seen = SeenSet(capacity = 512)

  private var gattServer: BluetoothGattServer? = null
  private var advertiser: BluetoothLeAdvertiser? = null
  private var scanner: BluetoothLeScanner? = null
  private var advertiseCallback: AdvertiseCallback? = null
  private var scanCallback: ScanCallback? = null
  private var started = false
  private lateinit var self: SelfIdentity
  private var currentGroup = "main"

  override fun isAvailable(): Boolean = adapter?.isEnabled == true

  override fun start(self: SelfIdentity) {
    if (started) return
    val ad = adapter ?: run { emitState("offline"); return }
    if (!ad.isEnabled) { emitState("offline"); return }
    this.self = self
    started = true

    emitState("discovering")
    openGattServer()
    startAdvertising(ad)
    startScanning(ad)
    Log.i(TAG, "BLE start sender=${self.senderId} name=${self.name}")
  }

  override fun stop() {
    if (!started) return
    started = false
    try { scanner?.stopScan(scanCallback ?: return@try) } catch (t: Throwable) { Log.w(TAG, "stopScan", t) }
    try { advertiseCallback?.let { advertiser?.stopAdvertising(it) } } catch (t: Throwable) { Log.w(TAG, "stopAdv", t) }
    for ((_, c) in centrals) c.close()
    centrals.clear()
    serverPeers.clear()
    try { gattServer?.close() } catch (t: Throwable) { Log.w(TAG, "gattServer close", t) }
    gattServer = null
    advertiser = null
    scanner = null
    advertiseCallback = null
    scanCallback = null
    peers.clear()
    seen.clear()
    emitPeers()
    emitState("offline")
  }

  override fun joinGroup(groupId: String) {
    currentGroup = groupId
    broadcastFrame(makeHelloFrame())
  }

  override fun sendText(groupId: String, body: String): String {
    val jsId = "M_${UUID.randomUUID().toString().take(8).uppercase()}"
    val frame = Frame(
      kind = Frame.KIND_TEXT,
      hopCount = 0,
      senderId = self.senderId,
      groupId = groupId,
      messageId = seq.getAndIncrement(),
      timestamp = System.currentTimeMillis() / 1000L,
      payload = Frame.textPayload(body),
    )
    seen.add(messageKey(frame))
    val n = broadcastFrame(frame)
    emit("onMessage", mapOf(
      "id" to jsId,
      "groupId" to frame.groupId,
      "senderId" to self.senderId,
      "senderName" to self.name,
      "kind" to "text",
      "body" to body,
      "ts" to System.currentTimeMillis(),
      "mine" to true,
      "status" to if (n == 0) "queued" else "sent",
      "peerCount" to peers.size,
      "deliveredCount" to n,
    ))
    return jsId
  }

  override fun startVoice(groupId: String) {
    // Fanout happens via relayVoiceFrame; this call only signals UI state.
    emit("onVoiceActivity", mapOf(
      "active" to true,
      "talkerSenderId" to self.senderId,
      "talkerName" to self.name,
    ))
  }

  override fun stopVoice(groupId: String) {
    emit("onVoiceActivity", mapOf("active" to false))
  }

  override fun relayVoiceFrame(groupId: String, dataB64: String) {
    if (centrals.isEmpty()) return
    val payload = try { Base64.decode(dataB64, Base64.NO_WRAP) } catch (t: Throwable) {
      Log.w(TAG, "bad voice b64", t); return
    }
    // TODO(stage-2): chunk if Frame size > MTU. For Opus 20ms @ 16kbps
    //                payload is ~40-80 bytes, well under MTU even with
    //                BLE's 23-byte default; we request 512 post-connect.
    val frame = Frame(
      kind = Frame.KIND_VOICE,
      hopCount = 0,
      senderId = self.senderId,
      groupId = groupId,
      messageId = seq.getAndIncrement(),
      timestamp = System.currentTimeMillis() / 1000L,
      payload = payload,
    )
    seen.add(messageKey(frame))
    broadcastFrame(frame)
  }

  override fun triggerSOS(groupId: String): String {
    val jsId = "SOS_${UUID.randomUUID().toString().take(8).uppercase()}"
    val body = "SOS — broadcasting location to the group."
    val frame = Frame(
      kind = Frame.KIND_SOS,
      hopCount = 0,
      senderId = self.senderId,
      groupId = groupId,
      messageId = seq.getAndIncrement(),
      timestamp = System.currentTimeMillis() / 1000L,
      payload = Frame.textPayload(body),
    )
    seen.add(messageKey(frame))
    val n = broadcastFrame(frame)
    emit("onMessage", mapOf(
      "id" to jsId,
      "groupId" to frame.groupId,
      "senderId" to self.senderId,
      "senderName" to self.name,
      "kind" to "sos",
      "body" to body,
      "ts" to System.currentTimeMillis(),
      "mine" to true,
      "status" to if (n == 0) "queued" else "delivered",
      "peerCount" to peers.size,
      "deliveredCount" to n,
    ))
    return jsId
  }

  override fun snapshotPeers(): List<Map<String, Any?>> = peers.values.map { it.toMap() }

  // --- GATT server (peripheral) ----------------------------------------

  private fun openGattServer() {
    val mgr = bluetoothMgr ?: return
    val server = mgr.openGattServer(ctx, serverCallback) ?: run {
      Log.w(TAG, "openGattServer returned null")
      return
    }
    gattServer = server

    val service = BluetoothGattService(SERVICE_UUID, BluetoothGattService.SERVICE_TYPE_PRIMARY)
    val writeChar = BluetoothGattCharacteristic(
      CHAR_WRITE_UUID,
      BluetoothGattCharacteristic.PROPERTY_WRITE,
      BluetoothGattCharacteristic.PERMISSION_WRITE,
    )
    service.addCharacteristic(writeChar)
    // NOTIFY_UUID is reserved for future use (peripheral-pushed frames).
    // We do not subscribe to it in the central flow today; symmetric writes
    // cover both directions.
    val notifyChar = BluetoothGattCharacteristic(
      CHAR_NOTIFY_UUID,
      BluetoothGattCharacteristic.PROPERTY_NOTIFY,
      BluetoothGattCharacteristic.PERMISSION_READ,
    )
    service.addCharacteristic(notifyChar)
    server.addService(service)
  }

  private val serverCallback = object : BluetoothGattServerCallback() {
    override fun onConnectionStateChange(device: BluetoothDevice, status: Int, newState: Int) {
      when (newState) {
        BluetoothProfile.STATE_CONNECTED -> {
          Log.i(TAG, "server inbound connect: ${device.address}")
          serverPeers[device.address] = device
        }
        BluetoothProfile.STATE_DISCONNECTED -> {
          Log.i(TAG, "server inbound disconnect: ${device.address}")
          serverPeers.remove(device.address)
        }
      }
    }

    override fun onCharacteristicWriteRequest(
      device: BluetoothDevice,
      requestId: Int,
      characteristic: BluetoothGattCharacteristic,
      preparedWrite: Boolean,
      responseNeeded: Boolean,
      offset: Int,
      value: ByteArray,
    ) {
      if (characteristic.uuid == CHAR_WRITE_UUID) {
        val frame = Frame.decode(value)
        if (frame != null) {
          handleIncomingFrame(device.address, frame)
        } else {
          Log.w(TAG, "bad frame from ${device.address} (${value.size} bytes)")
        }
      }
      if (responseNeeded) {
        try {
          gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, offset, null)
        } catch (t: Throwable) {
          Log.w(TAG, "sendResponse", t)
        }
      }
    }
  }

  // --- advertise + scan -------------------------------------------------

  private fun startAdvertising(adapter: BluetoothAdapter) {
    val adv = adapter.bluetoothLeAdvertiser ?: run {
      Log.w(TAG, "no advertiser (not supported on this device)")
      return
    }
    advertiser = adv

    val settings = AdvertiseSettings.Builder()
      .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_BALANCED)
      .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_MEDIUM)
      .setConnectable(true)
      .build()

    val data = AdvertiseData.Builder()
      .setIncludeDeviceName(false) // device name eats advertising room
      .addServiceUuid(ParcelUuid(SERVICE_UUID))
      .build()

    val cb = object : AdvertiseCallback() {
      override fun onStartSuccess(settingsInEffect: AdvertiseSettings?) {
        Log.i(TAG, "advertising")
      }
      override fun onStartFailure(errorCode: Int) {
        Log.w(TAG, "advertise failed code=$errorCode")
      }
    }
    advertiseCallback = cb
    adv.startAdvertising(settings, data, cb)
  }

  private fun startScanning(adapter: BluetoothAdapter) {
    val sc = adapter.bluetoothLeScanner ?: run {
      Log.w(TAG, "no scanner")
      return
    }
    scanner = sc

    val filters = listOf(
      ScanFilter.Builder().setServiceUuid(ParcelUuid(SERVICE_UUID)).build()
    )
    val settings = ScanSettings.Builder()
      .setScanMode(ScanSettings.SCAN_MODE_BALANCED)
      .build()

    val cb = object : ScanCallback() {
      override fun onScanResult(callbackType: Int, result: ScanResult) {
        val device = result.device ?: return
        val addr = device.address
        if (centrals.containsKey(addr)) return  // already connected
        Log.i(TAG, "scan result: $addr rssi=${result.rssi}")
        val link = CentralLink(device, result.rssi)
        centrals[addr] = link
        link.connect()
      }

      override fun onScanFailed(errorCode: Int) {
        Log.w(TAG, "scan failed code=$errorCode")
      }
    }
    scanCallback = cb
    sc.startScan(filters, settings, cb)
  }

  // --- GATT client per peer --------------------------------------------

  private inner class CentralLink(val device: BluetoothDevice, val rssi: Int) {
    private var gatt: BluetoothGatt? = null
    private var writeChar: BluetoothGattCharacteristic? = null
    private var peerSenderId: String? = null  // set after HELLO

    fun connect() {
      val cb = object : BluetoothGattCallback() {
        override fun onConnectionStateChange(g: BluetoothGatt, status: Int, newState: Int) {
          when (newState) {
            BluetoothProfile.STATE_CONNECTED -> {
              Log.i(TAG, "client connected to ${device.address}, requesting MTU")
              g.requestMtu(DESIRED_MTU)
            }
            BluetoothProfile.STATE_DISCONNECTED -> {
              Log.i(TAG, "client disconnected from ${device.address}")
              close()
              centrals.remove(device.address)
              peerSenderId?.let { peers.remove(it) }
              emitPeers()
              if (peers.isEmpty()) emitState("discovering")
            }
          }
        }

        override fun onMtuChanged(g: BluetoothGatt, mtu: Int, status: Int) {
          Log.i(TAG, "MTU = $mtu (status=$status) for ${device.address}")
          g.discoverServices()
        }

        override fun onServicesDiscovered(g: BluetoothGatt, status: Int) {
          if (status != BluetoothGatt.GATT_SUCCESS) {
            Log.w(TAG, "discoverServices failed status=$status")
            return
          }
          val svc = g.getService(SERVICE_UUID)
          val w = svc?.getCharacteristic(CHAR_WRITE_UUID)
          if (w == null) {
            Log.w(TAG, "service or write characteristic missing on ${device.address}")
            return
          }
          writeChar = w
          // Identify ourselves once we have a write channel.
          writeFrame(makeHelloFrame())
        }

        override fun onCharacteristicWrite(
          g: BluetoothGatt,
          c: BluetoothGattCharacteristic,
          status: Int,
        ) {
          if (status != BluetoothGatt.GATT_SUCCESS) {
            Log.w(TAG, "char write failed status=$status to ${device.address}")
          }
        }
      }
      gatt = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        device.connectGatt(ctx, false, cb, BluetoothDevice.TRANSPORT_LE)
      } else {
        device.connectGatt(ctx, false, cb)
      }
    }

    fun writeFrame(frame: Frame): Boolean {
      val g = gatt ?: return false
      val c = writeChar ?: return false
      val bytes = frame.encode()
      if (bytes.size > DESIRED_MTU - 3) {
        // 3-byte ATT header overhead; we treat the negotiated MTU as a cap.
        Log.w(TAG, "frame too large for BLE write (${bytes.size} > $DESIRED_MTU): dropping")
        return false
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        g.writeCharacteristic(c, bytes, BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT)
      } else {
        @Suppress("DEPRECATION")
        c.value = bytes
        @Suppress("DEPRECATION")
        g.writeCharacteristic(c)
      }
      return true
    }

    fun setPeerSenderId(sid: String) { peerSenderId = sid }

    fun close() {
      try { gatt?.disconnect() } catch (_: Throwable) {}
      try { gatt?.close() } catch (_: Throwable) {}
      gatt = null
      writeChar = null
    }
  }

  // --- frame dispatch ---------------------------------------------------

  private fun handleIncomingFrame(fromAddress: String, frame: Frame) {
    if (frame.senderId == self.senderId) return  // our own echo
    if (!seen.add(messageKey(frame))) return     // dedup

    when (frame.kind) {
      Frame.KIND_HELLO -> applyHello(fromAddress, frame)

      Frame.KIND_TEXT, Frame.KIND_SOS -> {
        emit("onMessage", incomingEventMap(frame))
        relayFrame(frame, exceptAddress = fromAddress)
      }

      Frame.KIND_VOICE -> {
        emit("onVoiceFrame", mapOf(
          "senderId" to frame.senderId,
          "data" to Base64.encodeToString(frame.payload, Base64.NO_WRAP),
          "ts" to System.currentTimeMillis(),
          "durationMs" to 20,
        ))
        relayFrame(frame, exceptAddress = fromAddress)
      }

      Frame.KIND_ACK -> {
        // TODO(stage-2): mark mine messages as delivered.
      }

      Frame.KIND_PEER_ADV -> {
        // TODO(stage-2): multi-hop visibility.
      }
    }
  }

  private fun applyHello(fromAddress: String, frame: Frame) {
    val obj = try { JSONObject(String(frame.payload, Charsets.UTF_8)) } catch (_: Throwable) { return }
    val name = obj.optString("name", "PEER")
    val platform = obj.optString("platform", "android")
    val role = obj.optString("role", "relay")
    val battery = obj.optInt("battery", 0)

    val existing = peers[frame.senderId]
    peers[frame.senderId] = PeerState(
      senderId = frame.senderId,
      name = name,
      platform = platform,
      role = role,
      battery = battery,
      hops = existing?.hops ?: 1,
      rssi = centrals[fromAddress]?.rssi,
    )
    // Tag the central link with the peer's senderId so disconnect cleans
    // up the right entry.
    centrals[fromAddress]?.setPeerSenderId(frame.senderId)
    emitPeers()
  }

  private fun relayFrame(frame: Frame, exceptAddress: String) {
    if (frame.hopCount >= Frame.MAX_HOPS) return
    val bumped = frame.bumpedHop()
    for ((addr, link) in centrals) {
      if (addr == exceptAddress) continue
      link.writeFrame(bumped)
    }
  }

  private fun broadcastFrame(frame: Frame): Int {
    if (centrals.isEmpty()) return 0
    var n = 0
    for ((_, link) in centrals) {
      if (link.writeFrame(frame)) n++
    }
    return n
  }

  // --- HELLO + helpers --------------------------------------------------

  private fun makeHelloFrame(): Frame {
    val payload = JSONObject().apply {
      put("name", self.name)
      put("platform", "android")
      put("role", "relay")
      put("battery", readBatteryPercent())
    }.toString().toByteArray(Charsets.UTF_8)

    return Frame(
      kind = Frame.KIND_HELLO,
      hopCount = 0,
      senderId = self.senderId,
      groupId = currentGroup,
      messageId = seq.getAndIncrement(),
      timestamp = System.currentTimeMillis() / 1000L,
      payload = payload,
    )
  }

  private fun readBatteryPercent(): Int {
    val mgr = ctx.getSystemService(Context.BATTERY_SERVICE) as? BatteryManager ?: return 0
    return mgr.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
  }

  private fun messageKey(frame: Frame): String = "${frame.senderId}:${frame.messageId}"

  private fun emitPeers() {
    emit("onPeers", mapOf("peers" to peers.values.map { it.toMap() }))
    emitState(if (peers.isEmpty()) "discovering" else "connected")
  }

  private fun emitState(conn: String) {
    val maxHops = peers.values.maxOfOrNull { it.hops } ?: 0
    emit("onState", mapOf(
      "conn" to conn,
      "peerCount" to peers.size,
      "hops" to maxHops,
      "selfRole" to "relay",
      "backend" to "ble",
    ))
  }

  private fun incomingEventMap(frame: Frame): Map<String, Any?> {
    val sender = peers[frame.senderId]
    return mapOf(
      "id" to "M_${frame.senderId}_${frame.messageId}",
      "groupId" to frame.groupId,
      "senderId" to frame.senderId,
      "senderName" to (sender?.name ?: "PEER"),
      "kind" to Frame.kindWire(frame.kind),
      "body" to Frame.textBody(frame.payload),
      "ts" to (frame.timestamp * 1000L),
      "mine" to false,
      "status" to if (frame.hopCount > 0) "relayed" else "delivered",
      "relayedHops" to frame.hopCount,
    )
  }

  internal data class PeerState(
    val senderId: String,
    val name: String,
    val platform: String,
    val role: String,
    val battery: Int,
    val hops: Int,
    val rssi: Int?,
  ) {
    fun toMap(): Map<String, Any?> = buildMap {
      put("senderId", senderId)
      put("name", name)
      put("platform", platform)
      put("role", role)
      put("battery", battery)
      put("hops", hops)
      if (rssi != null) put("rssi", rssi)
      put("backend", "ble")
    }
  }
}
