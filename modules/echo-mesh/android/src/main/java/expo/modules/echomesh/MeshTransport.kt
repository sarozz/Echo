package expo.modules.echomesh

/**
 * Internal interface shared by the Android backends. JS sees a single
 * EchoMesh module — the per-backend split lives entirely on the native side.
 */
internal interface MeshTransport {
  fun isAvailable(): Boolean
  fun start(self: SelfIdentity)
  fun stop()
  fun joinGroup(groupId: String)
  fun sendText(groupId: String, body: String): String
  fun startVoice(groupId: String)
  fun stopVoice(groupId: String)
  fun triggerSOS(groupId: String): String
  /** Broadcasts a captured Opus frame as a VOICE wire frame. dataB64 is the encoded payload. */
  fun relayVoiceFrame(groupId: String, dataB64: String)
  /**
   * Re-broadcasts a stored TEXT/SOS message with its original wire IDs. Used
   * by store-and-forward when a peer reconnects. SeenSet on the receiver
   * absorbs duplicates within a session; JS-side persistence dedups across
   * restarts.
   */
  fun replay(groupId: String, senderId: String, wireMessageId: Long, ts: Long, kind: String, body: String)
  fun snapshotPeers(): List<Map<String, Any?>>
}

/**
 * Single channel for transports to emit events back to JS. Bound at module
 * construction so transports stay decoupled from Expo's Module API.
 */
internal object MeshEventBus {
  private var emitter: ((String, Any?) -> Unit)? = null
  fun bind(fn: (String, Any?) -> Unit) { emitter = fn }
  fun unbind() { emitter = null }
  fun emit(name: String, payload: Any?) { emitter?.invoke(name, payload) }
}
