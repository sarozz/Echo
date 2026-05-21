package expo.modules.echomesh

import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.content.Context
import kotlinx.coroutines.CoroutineScope
import java.util.UUID

/**
 * BLE backend — Echo's cross-platform fallback (Android ↔ iOS).
 *
 * Topology: each device is both a GATT peripheral (advertising the Echo
 * service UUID + a writable + notifiable characteristic) and a GATT central
 * (scanning for the same service, then subscribing). Frames are written to
 * the peer's writable characteristic and received via notification on the
 * notifiable one.
 *
 * STAGE 2 status: skeleton. The shape and lifecycle are wired so calling
 * sendText / triggerSOS emits valid events back to JS. The actual GATT
 * advertise / scan / subscribe / write loop is a single integration TODO.
 */
internal class BleMesh(
  private val ctx: Context,
  private val scope: CoroutineScope,
  private val emit: (String, Any?) -> Unit,
) : MeshTransport {

  private val adapter: BluetoothAdapter? =
    (ctx.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter

  // Public UUIDs — must match iOS BleMesh.swift.
  internal companion object {
    val SERVICE_UUID: UUID = UUID.fromString("e3000001-1c01-7e57-b1ad-1ea5deadbeef")
    val CHAR_WRITE_UUID: UUID = UUID.fromString("e3000002-1c01-7e57-b1ad-1ea5deadbeef")
    val CHAR_NOTIFY_UUID: UUID = UUID.fromString("e3000003-1c01-7e57-b1ad-1ea5deadbeef")
  }

  private val peers: MutableMap<String, MutableMap<String, Any?>> = linkedMapOf()
  private var started = false
  private lateinit var self: SelfIdentity

  override fun isAvailable(): Boolean = adapter?.isEnabled == true

  override fun start(self: SelfIdentity) {
    if (started) return
    this.self = self
    started = true
    emitState("discovering")

    // TODO(stage-2):
    //   1. Open GattServer with SERVICE_UUID + CHAR_WRITE_UUID (write) + CHAR_NOTIFY_UUID (notify)
    //   2. BluetoothLeAdvertiser.startAdvertising(<SERVICE_UUID>, name=self.senderId)
    //   3. BluetoothLeScanner.startScan(<SERVICE_UUID>) -> connectGatt -> subscribe to CHAR_NOTIFY_UUID
    //   4. Inbound frames -> Frame.parse(bytes) -> dispatch to JS via emit()
  }

  override fun stop() {
    if (!started) return
    started = false
    // TODO(stage-2): stopAdvertising, stopScan, close GATT server + clients
    peers.clear()
    emitState("offline")
  }

  override fun joinGroup(groupId: String) {
    // Carried in the HELLO frame; no transport-level group switch.
  }

  override fun sendText(groupId: String, body: String): String {
    val id = "M_${UUID.randomUUID().toString().take(8).uppercase()}"
    // TODO(stage-2): Frame.encodeText(...) -> writeCharacteristic for each peer
    emit("onMessage", mapOf(
      "id" to id, "groupId" to groupId, "senderId" to self.senderId,
      "senderName" to self.name, "kind" to "text", "body" to body,
      "ts" to System.currentTimeMillis(), "mine" to true,
      "status" to if (peers.isEmpty()) "queued" else "sent",
      "peerCount" to peers.size,
    ))
    return id
  }

  override fun startVoice(groupId: String) {
    // TODO(stage-2): mark voice channel open; framed Opus packets are
    //                forwarded by EchoAudio. BLE MTU constrains frame size
    //                — chunk at <=180 bytes and reassemble on the other side.
    emit("onVoiceActivity", mapOf(
      "active" to true,
      "talkerSenderId" to self.senderId,
      "talkerName" to self.name,
    ))
  }

  override fun stopVoice(groupId: String) {
    emit("onVoiceActivity", mapOf("active" to false))
  }

  override fun triggerSOS(groupId: String): String {
    val id = "SOS_${UUID.randomUUID().toString().take(8).uppercase()}"
    // TODO(stage-2): high-priority SOS frame, retransmit until ACKed.
    emit("onMessage", mapOf(
      "id" to id, "groupId" to groupId, "senderId" to self.senderId,
      "senderName" to self.name, "kind" to "sos",
      "body" to "SOS — broadcasting location to the group.",
      "ts" to System.currentTimeMillis(), "mine" to true,
      "status" to if (peers.isEmpty()) "queued" else "delivered",
      "peerCount" to peers.size, "deliveredCount" to peers.size,
    ))
    return id
  }

  override fun snapshotPeers(): List<Map<String, Any?>> = peers.values.toList()

  private fun emitState(conn: String) {
    emit("onState", mapOf(
      "conn" to conn,
      "peerCount" to peers.size,
      "hops" to (peers.values.maxOfOrNull { (it["hops"] as? Int) ?: 0 } ?: 0),
      "selfRole" to "relay",
      "backend" to "ble",
    ))
  }
}
