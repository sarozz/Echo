package expo.modules.echoaudio

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel

/**
 * EchoAudio — Android voice pipeline.
 *
 * Layout: AudioCapture -> VAD -> OpusEncoder -> emit 'onCapturedFrame'
 *         pushIncomingFrame -> OpusDecoder -> JitterBuffer -> AudioPlayback
 *
 * STAGE 2 status:
 *  - Capture (AudioRecord) and playback (AudioTrack) are real.
 *  - RMS-based VAD is real.
 *  - OpusEncoder / OpusDecoder are stubbed — they pass PCM through. Wire a
 *    JNI Opus binding (e.g. concentus) to harden voice quality and reduce
 *    bandwidth before shipping.
 *  - JitterBuffer is a simple FIFO with a max depth. TODO(stage-2): jitter
 *    estimation + adaptive delay.
 */
class EchoAudioModule : Module() {
  private val scope = CoroutineScope(Dispatchers.Default + SupervisorJob())
  private lateinit var capture: AudioCapture
  private lateinit var playback: AudioPlayback
  private val jitterBuffer = JitterBuffer(maxDepth = 10)
  private val stats = AudioStats()

  override fun definition(): ModuleDefinition = ModuleDefinition {
    Name("EchoAudio")
    Events("onCapturedFrame", "onTalker")

    OnCreate {
      capture = AudioCapture(scope, ::onFrameCaptured, ::onTalker)
      playback = AudioPlayback(scope, jitterBuffer, stats)
    }

    OnDestroy {
      capture.stop()
      playback.stop()
      scope.cancel()
    }

    AsyncFunction("startCapture") { opts: Map<String, Any?> ->
      val mode = (opts["mode"] as? String) ?: "ptt"
      val vadThreshold = (opts["vadThreshold"] as? Number)?.toFloat() ?: 0.05f
      val sampleRate = (opts["sampleRateHz"] as? Number)?.toInt() ?: 16000
      capture.start(mode = mode, vadThreshold = vadThreshold, sampleRate = sampleRate)
      playback.start(sampleRate)
    }

    AsyncFunction("stopCapture") {
      capture.stop()
      playback.stop()
    }

    AsyncFunction("pushIncomingFrame") { frame: Map<String, Any?> ->
      val data = (frame["data"] as? String) ?: return@AsyncFunction
      val ts = (frame["ts"] as? Number)?.toLong() ?: System.currentTimeMillis()
      val duration = (frame["durationMs"] as? Number)?.toInt() ?: 20
      jitterBuffer.push(JitterBuffer.Frame(data, ts, duration))
    }

    AsyncFunction("getStats") {
      mapOf(
        "capturedFrames" to stats.captured,
        "playedFrames" to stats.played,
        "droppedFrames" to stats.dropped,
        "jitterBufferDepth" to jitterBuffer.depth(),
      )
    }
  }

  private fun onFrameCaptured(b64: String, ts: Long, durationMs: Int, voiced: Boolean) {
    stats.captured++
    sendEvent("onCapturedFrame", mapOf(
      "data" to b64,
      "ts" to ts,
      "durationMs" to durationMs,
      "voiced" to voiced,
    ))
  }

  private fun onTalker(active: Boolean) {
    sendEvent("onTalker", mapOf("active" to active))
  }
}

internal class AudioStats {
  @Volatile var captured: Long = 0
  @Volatile var played: Long = 0
  @Volatile var dropped: Long = 0
}
