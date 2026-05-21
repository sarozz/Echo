package expo.modules.echomesh

import android.content.Context
import com.google.android.gms.nearby.Nearby
import com.google.android.gms.nearby.connection.ConnectionsClient
import com.google.android.gms.nearby.connection.Strategy
import kotlinx.coroutines.CoroutineScope
import java.util.UUID

/**
 * Android Nearby Connections backend.
 *
 * Why Nearby: it auto-negotiates the best transport (BT Classic, BLE, Wi-Fi
 * Aware, Wi-Fi Hotspot) on Android↔Android. For Android↔iOS interop we fall
 * back to [BleMesh].
 *
 * STAGE 2 status: skeleton. The lifecycle hooks are wired and the module
 * surface is honoured (peers emit, sendText returns a stable ID), but the
 * Nearby Connections protocol — advertise, discover, request connection,
 * accept, payload framing — is left as a single integration TODO so that it
 * can be implemented and tested as a unit against real devices.
 */
internal class NearbyMesh(
  private val ctx: Context,
  private val scope: CoroutineScope,
  private val emit: (String, Any?) -> Unit,
) : MeshTransport {

  private val client: ConnectionsClient = Nearby.getConnectionsClient(ctx)
  private val strategy: Strategy = Strategy.P2P_CLUSTER

  // Peer table keyed by Nearby endpointId.
  private val peers: MutableMap<String, MutableMap<String, Any?>> = linkedMapOf()
  private var started = false
  private lateinit var self: SelfIdentity

  override fun isAvailable(): Boolean {
    // Nearby Connections is available wherever Google Play Services is. The
    // real check is at runtime — assume yes here and let `start` surface
    // failures.
    return true
  }

  override fun start(self: SelfIdentity) {
    if (started) return
    this.self = self
    started = true

    // TODO(stage-2): startAdvertising + startDiscovery against a stable
    // service ID derived from the active group. Sketch:
    //
    //   val serviceId = "app.echo.mesh"
    //   client.startAdvertising(self.name, serviceId, connLifecycle, AdvertisingOptions.Builder().setStrategy(strategy).build())
    //   client.startDiscovery(serviceId, discoveryCallback, DiscoveryOptions.Builder().setStrategy(strategy).build())
    //
    //   connLifecycle.onConnectionInitiated -> client.acceptConnection(endpointId, payloadCallback)
    //   payloadCallback.onPayloadReceived  -> Frame.parse(bytes) -> dispatch to bus
    //
    // Frame format defined in src/mesh/protocol.ts. Native must mirror it
    // byte-for-byte.

    emitState(conn = "discovering")
  }

  override fun stop() {
    if (!started) return
    started = false
    try {
      client.stopAdvertising()
      client.stopDiscovery()
      client.stopAllEndpoints()
    } catch (_: Throwable) { /* idempotent */ }
    peers.clear()
    emitState(conn = "offline")
  }

  override fun joinGroup(groupId: String) {
    // TODO(stage-2): rotate the advertised serviceId to include groupId,
    // or send a HELLO frame announcing the new group to existing peers.
  }

  override fun sendText(groupId: String, body: String): String {
    val id = "M_${UUID.randomUUID().toString().take(8).uppercase()}"
    // TODO(stage-2): encode Frame(TEXT, groupId, body) and Payload.fromBytes
    //                client.sendPayload(currentEndpoints, payload)
    emit("onMessage", mapOf(
      "id" to id,
      "groupId" to groupId,
      "senderId" to self.senderId,
      "senderName" to self.name,
      "kind" to "text",
      "body" to body,
      "ts" to System.currentTimeMillis(),
      "mine" to true,
      "status" to if (peers.isEmpty()) "queued" else "sent",
      "peerCount" to peers.size,
    ))
    return id
  }

  override fun startVoice(groupId: String) {
    // TODO(stage-2): connect to EchoAudio's frame stream and fan it out to
    //                connected endpoints as VOICE frames.
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
    // TODO(stage-2): broadcast SOS frame with location payload to every
    //                connected endpoint, marked high-priority.
    emit("onMessage", mapOf(
      "id" to id,
      "groupId" to groupId,
      "senderId" to self.senderId,
      "senderName" to self.name,
      "kind" to "sos",
      "body" to "SOS — broadcasting location to the group.",
      "ts" to System.currentTimeMillis(),
      "mine" to true,
      "status" to if (peers.isEmpty()) "queued" else "delivered",
      "peerCount" to peers.size,
      "deliveredCount" to peers.size,
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
      "backend" to "nearby",
    ))
  }
}
