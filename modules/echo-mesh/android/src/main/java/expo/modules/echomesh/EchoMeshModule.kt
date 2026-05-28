package expo.modules.echomesh

import android.content.Context
import android.content.Intent
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel

/**
 * EchoMesh — Android side.
 *
 * Bridges JS to the platform-native mesh transports. The module DSL is the
 * stable contract; the actual transport implementations live in NearbyMesh
 * and BleMesh and can be swapped or layered without touching JS.
 *
 * STAGE 2 status (this file):
 *   - Module surface complete (methods + events).
 *   - Event emission wired through `MeshEventBus` so transports can publish
 *     without holding a reference to the module.
 *   - Transport implementations are skeletons (see NearbyMesh.kt, BleMesh.kt)
 *     — they accept calls and emit shaped events, but the wire-level discovery
 *     and framing is marked TODO.
 */
class EchoMeshModule : Module() {
  private val scope: CoroutineScope = CoroutineScope(Dispatchers.Default + SupervisorJob())
  private lateinit var nearby: NearbyMesh
  private lateinit var ble: BleMesh
  private var activeBackend: Backend = Backend.NONE
  private var currentGroup: String = "main"
  private var self: SelfIdentity = SelfIdentity(senderId = "00", name = "YOU")

  override fun definition(): ModuleDefinition = ModuleDefinition {
    Name("EchoMesh")

    Events("onPeers", "onMessage", "onState", "onVoiceActivity", "onVoiceFrame")

    OnCreate {
      val ctx = appContext.reactContext ?: error("react context missing")
      nearby = NearbyMesh(ctx, scope, ::emit)
      ble = BleMesh(ctx, scope, ::emit)
      MeshEventBus.bind(::emit)
    }

    OnDestroy {
      stopInternal()
      stopForegroundService()
      scope.cancel()
      MeshEventBus.unbind()
    }

    AsyncFunction("start") { opts: Map<String, Any?> ->
      self = SelfIdentity(
        senderId = (opts["selfSenderId"] as? String) ?: self.senderId,
        name = (opts["selfName"] as? String) ?: self.name,
      )
      @Suppress("UNCHECKED_CAST")
      val prefer = (opts["prefer"] as? List<String>) ?: listOf("nearby", "ble")

      activeBackend = chooseBackend(prefer)
      emit("onState", mapOf(
        "conn" to "discovering",
        "peerCount" to 0,
        "hops" to 0,
        "selfRole" to "relay",
        "backend" to activeBackend.wire,
      ))
      when (activeBackend) {
        Backend.NEARBY -> { nearby.start(self); startForegroundService() }
        Backend.BLE -> { ble.start(self); startForegroundService() }
        Backend.NONE -> {
          emit("onState", mapOf(
            "conn" to "offline",
            "peerCount" to 0,
            "hops" to 0,
            "selfRole" to "relay",
            "backend" to "none",
          ))
        }
      }
    }

    AsyncFunction("stop") {
      stopInternal()
      stopForegroundService()
    }

    AsyncFunction("joinGroup") { groupId: String ->
      currentGroup = groupId
      activeTransport()?.joinGroup(groupId)
    }

    AsyncFunction("sendText") { groupId: String, body: String ->
      activeTransport()?.sendText(groupId, body) ?: error("transport not started")
    }

    AsyncFunction("startVoice") { groupId: String ->
      activeTransport()?.startVoice(groupId)
    }

    AsyncFunction("stopVoice") { groupId: String ->
      activeTransport()?.stopVoice(groupId)
    }

    AsyncFunction("triggerSOS") { groupId: String ->
      activeTransport()?.triggerSOS(groupId) ?: error("transport not started")
    }

    AsyncFunction("relayVoiceFrame") { groupId: String, dataB64: String ->
      activeTransport()?.relayVoiceFrame(groupId, dataB64)
    }

    AsyncFunction("replay") { groupId: String, senderId: String, wireMessageId: Double, ts: Double, kind: String, body: String ->
      activeTransport()?.replay(groupId, senderId, wireMessageId.toLong(), ts.toLong(), kind, body)
    }

    AsyncFunction("broadcastLocation") { groupId: String, lat: Double, lon: Double, accuracy: Double ->
      activeTransport()?.broadcastLocation(groupId, lat, lon, accuracy)
    }

    AsyncFunction("setGroupSecret") { groupId: String, code: String ->
      Crypto.setSecret(groupId, code)
    }

    AsyncFunction("clearGroupSecret") { groupId: String ->
      Crypto.clearSecret(groupId)
    }

    AsyncFunction("getCurrentPeers") {
      activeTransport()?.snapshotPeers() ?: emptyList<Map<String, Any?>>()
    }
  }

  private fun chooseBackend(prefer: List<String>): Backend {
    for (name in prefer) {
      when (name) {
        "nearby" -> if (nearby.isAvailable()) return Backend.NEARBY
        "ble" -> if (ble.isAvailable()) return Backend.BLE
        "multipeer" -> { /* iOS only — ignored on Android */ }
      }
    }
    return Backend.NONE
  }

  private fun activeTransport(): MeshTransport? = when (activeBackend) {
    Backend.NEARBY -> nearby
    Backend.BLE -> ble
    Backend.NONE -> null
  }

  private fun stopInternal() {
    nearby.stop()
    ble.stop()
    activeBackend = Backend.NONE
    emit("onState", mapOf(
      "conn" to "offline",
      "peerCount" to 0,
      "hops" to 0,
      "selfRole" to "relay",
      "backend" to "none",
    ))
  }

  // Type-erased emit so transports can publish without touching the Module API.
  private fun emit(name: String, payload: Any?) {
    sendEvent(name, payload as? Map<String, Any?> ?: mapOf("value" to payload))
  }

  private fun startForegroundService() {
    val ctx = appContext.reactContext ?: return
    try {
      val intent = Intent(ctx, MeshForegroundService::class.java)
      ContextCompat.startForegroundService(ctx, intent)
    } catch (t: Throwable) {
      android.util.Log.w("EchoMesh", "startForegroundService failed", t)
    }
  }

  private fun stopForegroundService() {
    val ctx = appContext.reactContext ?: return
    try {
      val intent = Intent(ctx, MeshForegroundService::class.java)
      ctx.stopService(intent)
    } catch (t: Throwable) {
      android.util.Log.w("EchoMesh", "stopForegroundService failed", t)
    }
  }
}

internal data class SelfIdentity(val senderId: String, val name: String)

internal enum class Backend(val wire: String) {
  NEARBY("nearby"),
  BLE("ble"),
  NONE("none"),
}
