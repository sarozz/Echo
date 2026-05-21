package expo.modules.echomesh

import android.content.Context
import android.os.BatteryManager
import android.util.Base64
import android.util.Log
import com.google.android.gms.nearby.Nearby
import com.google.android.gms.nearby.connection.AdvertisingOptions
import com.google.android.gms.nearby.connection.ConnectionInfo
import com.google.android.gms.nearby.connection.ConnectionLifecycleCallback
import com.google.android.gms.nearby.connection.ConnectionResolution
import com.google.android.gms.nearby.connection.ConnectionsClient
import com.google.android.gms.nearby.connection.DiscoveredEndpointInfo
import com.google.android.gms.nearby.connection.DiscoveryOptions
import com.google.android.gms.nearby.connection.EndpointDiscoveryCallback
import com.google.android.gms.nearby.connection.Payload
import com.google.android.gms.nearby.connection.PayloadCallback
import com.google.android.gms.nearby.connection.PayloadTransferUpdate
import com.google.android.gms.nearby.connection.Strategy
import kotlinx.coroutines.CoroutineScope
import org.json.JSONObject
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicLong

/**
 * Android Nearby Connections backend.
 *
 * Lifecycle: each device both advertises and discovers under the same
 * service id. When an endpoint is discovered, the discoverer initiates a
 * connection; both sides auto-accept. On connection success, each side
 * sends a HELLO frame describing itself (name, platform, role, battery).
 *
 * Frames are exchanged as Nearby `Payload.BYTES` (reliable, ordered).
 * Voice frames are bridged in from the audio module — currently TODO.
 *
 * Relay: every received frame is checked against a bounded LRU dedup set;
 * first-sight frames are emitted to JS and (if hopCount < MAX_HOPS)
 * re-broadcast to every other connected endpoint with hopCount + 1.
 */
internal class NearbyMesh(
  private val ctx: Context,
  private val scope: CoroutineScope,
  private val emit: (String, Any?) -> Unit,
) : MeshTransport {

  private val client: ConnectionsClient = Nearby.getConnectionsClient(ctx)
  private val strategy: Strategy = Strategy.P2P_CLUSTER
  private val serviceId = SERVICE_ID

  /** endpointId -> peer state */
  private val peers: MutableMap<String, PeerState> = ConcurrentHashMap()
  /** sender-local sequence for outbound frames */
  private val seq = AtomicLong(1)
  /** dedup set keyed by "$senderId:$messageId" */
  private val seen = SeenSet(capacity = 512)

  private var started = false
  private lateinit var self: SelfIdentity
  private var currentGroup: String = "main"

  override fun isAvailable(): Boolean = true

  override fun start(self: SelfIdentity) {
    if (started) return
    this.self = self
    started = true

    emitState("discovering")
    Log.i(TAG, "start: sender=${self.senderId} name=${self.name}")

    client.startAdvertising(
      localName(),
      serviceId,
      connectionLifecycle,
      AdvertisingOptions.Builder().setStrategy(strategy).build(),
    )
      .addOnSuccessListener { Log.i(TAG, "advertising") }
      .addOnFailureListener { e ->
        Log.w(TAG, "advertising failed", e)
        emitState("offline")
      }

    client.startDiscovery(
      serviceId,
      endpointDiscovery,
      DiscoveryOptions.Builder().setStrategy(strategy).build(),
    )
      .addOnSuccessListener { Log.i(TAG, "discovering") }
      .addOnFailureListener { e ->
        Log.w(TAG, "discovery failed", e)
        emitState("offline")
      }
  }

  override fun stop() {
    if (!started) return
    started = false
    try {
      client.stopAdvertising()
      client.stopDiscovery()
      client.stopAllEndpoints()
    } catch (t: Throwable) {
      Log.w(TAG, "stop cleanup", t)
    }
    peers.clear()
    seen.clear()
    emitPeers()
    emitState("offline")
  }

  override fun joinGroup(groupId: String) {
    // Group is tagged per-frame, so switching doesn't require reconnecting.
    // Announce the new group to existing peers via HELLO so they can
    // refresh PEER_ADV decisions.
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
    emit("onMessage", outboundEventMap(jsId, frame, body, status = if (n == 0) "queued" else "sent"))
    return jsId
  }

  override fun startVoice(groupId: String) {
    // The actual frame fanout happens via relayVoiceFrame, called from JS
    // for each onCapturedFrame from echo-audio. This call just signals
    // local UI state.
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
    if (peers.isEmpty()) return
    val payload = try { Base64.decode(dataB64, Base64.NO_WRAP) } catch (t: Throwable) {
      Log.w(TAG, "bad voice b64", t); return
    }
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

  override fun snapshotPeers(): List<Map<String, Any?>> =
    peers.values.map { it.toMap() }

  // --- Nearby callbacks --------------------------------------------------

  private val endpointDiscovery = object : EndpointDiscoveryCallback() {
    override fun onEndpointFound(endpointId: String, info: DiscoveredEndpointInfo) {
      Log.i(TAG, "onEndpointFound: $endpointId name=${info.endpointName}")
      client.requestConnection(localName(), endpointId, connectionLifecycle)
        .addOnFailureListener { e -> Log.w(TAG, "requestConnection failed for $endpointId", e) }
    }

    override fun onEndpointLost(endpointId: String) {
      Log.i(TAG, "onEndpointLost: $endpointId")
      // Lost-while-discovering — actual disconnect comes via onDisconnected.
    }
  }

  private val connectionLifecycle = object : ConnectionLifecycleCallback() {
    override fun onConnectionInitiated(endpointId: String, info: ConnectionInfo) {
      Log.i(TAG, "onConnectionInitiated: $endpointId from=${info.endpointName}")
      // Auto-accept. Real apps should pin info.authenticationDigits (a 4-digit
      // confirmation code) for out-of-band verification. STAGE 2: skip,
      // we trust the mesh.
      client.acceptConnection(endpointId, payloadHandler)
        .addOnFailureListener { e -> Log.w(TAG, "acceptConnection failed for $endpointId", e) }

      // Stash the discovered name (senderId:displayName) until HELLO arrives.
      val parsed = parseLocalName(info.endpointName)
      peers[endpointId] = PeerState(
        senderId = parsed.senderId,
        name = parsed.name,
        platform = "android",
        role = "relay",
        battery = 0,
        hops = 1,
        rssi = null,
      )
    }

    override fun onConnectionResult(endpointId: String, result: ConnectionResolution) {
      if (result.status.isSuccess) {
        Log.i(TAG, "onConnectionResult: $endpointId connected")
        emitPeers()
        emitState("connected")
        // Send HELLO so the peer learns who we are at the app layer.
        val hello = makeHelloFrame()
        sendFrameTo(endpointId, hello)
      } else {
        Log.w(TAG, "onConnectionResult: $endpointId status=${result.status}")
        peers.remove(endpointId)
        emitPeers()
        if (peers.isEmpty()) emitState("discovering")
      }
    }

    override fun onDisconnected(endpointId: String) {
      Log.i(TAG, "onDisconnected: $endpointId")
      peers.remove(endpointId)
      emitPeers()
      if (peers.isEmpty()) emitState("discovering")
    }
  }

  private val payloadHandler = object : PayloadCallback() {
    override fun onPayloadReceived(endpointId: String, payload: Payload) {
      if (payload.type != Payload.Type.BYTES) return
      val bytes = payload.asBytes() ?: return
      val frame = Frame.decode(bytes) ?: run {
        Log.w(TAG, "bad frame from $endpointId (${bytes.size} bytes)")
        return
      }
      handleIncomingFrame(endpointId, frame)
    }

    override fun onPayloadTransferUpdate(endpointId: String, update: PayloadTransferUpdate) {
      // Reliable BYTES are fire-and-forget; no per-message ack callback.
      // TODO(stage-2): wire app-level ACK frames here if delivery receipts
      //                are needed at the UI layer.
    }
  }

  // --- internal helpers --------------------------------------------------

  private fun handleIncomingFrame(fromEndpoint: String, frame: Frame) {
    if (frame.senderId == self.senderId) return  // our own relayed echo
    val key = messageKey(frame)
    if (!seen.add(key)) return  // dedup

    when (frame.kind) {
      Frame.KIND_HELLO -> applyHello(fromEndpoint, frame)

      Frame.KIND_TEXT, Frame.KIND_SOS -> {
        emit("onMessage", incomingEventMap(frame))
        relayFrame(frame, exceptEndpoint = fromEndpoint)
      }

      Frame.KIND_VOICE -> {
        emit("onVoiceFrame", mapOf(
          "senderId" to frame.senderId,
          "data" to Base64.encodeToString(frame.payload, Base64.NO_WRAP),
          "ts" to System.currentTimeMillis(),
          "durationMs" to 20,
        ))
        relayFrame(frame, exceptEndpoint = fromEndpoint)
      }

      Frame.KIND_PEER_ADV -> applyPeerAdv(frame)

      Frame.KIND_ACK -> {
        // TODO(stage-2): match ack-target message-id and bump delivery state.
      }
    }
  }

  private fun applyHello(endpointId: String, frame: Frame) {
    val obj = try { JSONObject(String(frame.payload, Charsets.UTF_8)) } catch (_: Throwable) { return }
    val name = obj.optString("name", peers[endpointId]?.name ?: "PEER")
    val platform = obj.optString("platform", "android")
    val role = obj.optString("role", "relay")
    val battery = obj.optInt("battery", 0)

    val updated = (peers[endpointId] ?: PeerState(frame.senderId, name, platform, role, battery, 1, null))
      .copy(senderId = frame.senderId, name = name, platform = platform, role = role, battery = battery)
    peers[endpointId] = updated
    emitPeers()
  }

  private fun applyPeerAdv(frame: Frame) {
    // Multi-hop advertisement of a peer we can't directly see. STAGE 2: noted
    // but not surfaced — the JS layer treats only direct peers as connected.
  }

  private fun relayFrame(frame: Frame, exceptEndpoint: String) {
    if (frame.hopCount >= Frame.MAX_HOPS) return
    val bumped = frame.bumpedHop()
    val bytes = bumped.encode()
    for ((id, _) in peers) {
      if (id == exceptEndpoint) continue
      client.sendPayload(id, Payload.fromBytes(bytes))
        .addOnFailureListener { e -> Log.w(TAG, "relay to $id failed", e) }
    }
  }

  /** Sends `frame` to every connected endpoint. Returns dispatch count. */
  private fun broadcastFrame(frame: Frame): Int {
    if (peers.isEmpty()) return 0
    val bytes = frame.encode()
    var n = 0
    for ((id, _) in peers) {
      client.sendPayload(id, Payload.fromBytes(bytes))
        .addOnFailureListener { e -> Log.w(TAG, "send to $id failed", e) }
      n++  // Nearby BYTES is reliable in-order; count dispatches optimistically.
    }
    return n
  }

  private fun sendFrameTo(endpointId: String, frame: Frame) {
    client.sendPayload(endpointId, Payload.fromBytes(frame.encode()))
      .addOnFailureListener { e -> Log.w(TAG, "send to $endpointId failed", e) }
  }

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

  private fun localName(): String = "${self.senderId}:${self.name}"

  private fun parseLocalName(s: String): SelfIdentity {
    val ix = s.indexOf(':')
    return if (ix > 0 && ix < s.length - 1) {
      SelfIdentity(senderId = s.substring(0, ix).take(2), name = s.substring(ix + 1))
    } else {
      SelfIdentity(senderId = s.take(2), name = s)
    }
  }

  private fun messageKey(frame: Frame): String = "${frame.senderId}:${frame.messageId}"

  private fun emitPeers() {
    emit("onPeers", mapOf("peers" to peers.values.map { it.toMap() }))
    if (peers.isNotEmpty()) emitState("connected") else emitState("discovering")
  }

  private fun emitState(conn: String) {
    val maxHops = peers.values.maxOfOrNull { it.hops } ?: 0
    emit("onState", mapOf(
      "conn" to conn,
      "peerCount" to peers.size,
      "hops" to maxHops,
      "selfRole" to "relay",
      "backend" to "nearby",
    ))
  }

  private fun outboundEventMap(jsId: String, frame: Frame, body: String, status: String): Map<String, Any?> =
    mapOf(
      "id" to jsId,
      "groupId" to frame.groupId,
      "senderId" to self.senderId,
      "senderName" to self.name,
      "kind" to Frame.kindWire(frame.kind),
      "body" to body,
      "ts" to System.currentTimeMillis(),
      "mine" to true,
      "status" to status,
      "peerCount" to peers.size,
      "deliveredCount" to if (status == "delivered" || status == "sent") peers.size else 0,
    )

  private fun incomingEventMap(frame: Frame): Map<String, Any?> {
    val sender = peers.values.firstOrNull { it.senderId == frame.senderId }
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

  // --- companions --------------------------------------------------------

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
      put("backend", "nearby")
    }
  }

  companion object {
    private const val TAG = "EchoNearbyMesh"
    private const val SERVICE_ID = "app.echo.mesh"
  }
}
