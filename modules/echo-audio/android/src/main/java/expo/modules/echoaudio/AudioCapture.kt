package expo.modules.echoaudio

import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.util.Base64
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlin.math.min
import kotlin.math.sqrt

/**
 * Mic → 20ms PCM frame → (VAD gate) → Opus encode → onCapturedFrame.
 *
 * STAGE 2 status: capture loop + RMS VAD are real. Opus encoder is real on
 * API 29+ (MediaCodec audio/opus) and falls back to PCM passthrough on
 * older devices.
 */
internal class AudioCapture(
  private val scope: CoroutineScope,
  private val onFrame: (b64: String, ts: Long, durationMs: Int, voiced: Boolean) -> Unit,
  private val onTalker: (active: Boolean) -> Unit,
) {
  private var job: Job? = null
  private var encoder: OpusEncoder? = null
  private var voiceActive: Boolean = false

  fun start(mode: String, vadThreshold: Float, sampleRate: Int) {
    if (job != null) return
    val frameDurMs = 20
    val enc = OpusEncoder(sampleRate = sampleRate).also { encoder = it }
    val frameSamples = sampleRate * frameDurMs / 1000
    val minBuf = AudioRecord.getMinBufferSize(
      sampleRate,
      AudioFormat.CHANNEL_IN_MONO,
      AudioFormat.ENCODING_PCM_16BIT,
    ).coerceAtLeast(frameSamples * 2 * 4)

    val record = try {
      AudioRecord(
        MediaRecorder.AudioSource.VOICE_COMMUNICATION,
        sampleRate,
        AudioFormat.CHANNEL_IN_MONO,
        AudioFormat.ENCODING_PCM_16BIT,
        minBuf,
      )
    } catch (e: SecurityException) {
      // RECORD_AUDIO permission not granted at runtime.
      onTalker(false)
      return
    }

    if (record.state != AudioRecord.STATE_INITIALIZED) {
      onTalker(false)
      return
    }

    job = scope.launch {
      record.startRecording()
      val pcm = ShortArray(frameSamples)
      try {
        while (true) {
          if (!kotlinx.coroutines.isActive) break
          var read = 0
          while (read < frameSamples) {
            val n = record.read(pcm, read, frameSamples - read)
            if (n <= 0) break
            read += n
          }
          if (read < frameSamples) continue

          val rms = rms(pcm, read)
          val voiced = rms > vadThreshold

          // PTT always sends; VOX gates on VAD.
          val shouldSend = mode == "ptt" || voiced
          if (voiced != voiceActive) {
            voiceActive = voiced
            onTalker(voiceActive)
          }
          if (!shouldSend) continue

          val opus = enc.encode(pcm, read)
          if (opus.isEmpty()) continue // warm-up frame from MediaCodec; drop
          onFrame(
            Base64.encodeToString(opus, Base64.NO_WRAP),
            System.currentTimeMillis(),
            frameDurMs,
            voiced,
          )
        }
      } finally {
        try { record.stop() } catch (_: Throwable) {}
        try { record.release() } catch (_: Throwable) {}
        enc.close()
        encoder = null
      }
    }
  }

  fun stop() {
    job?.cancel()
    job = null
    if (voiceActive) {
      voiceActive = false
      onTalker(false)
    }
  }

  private fun rms(buf: ShortArray, len: Int): Float {
    var sum = 0.0
    val n = min(len, buf.size)
    for (i in 0 until n) {
      val s = buf[i].toDouble() / Short.MAX_VALUE
      sum += s * s
    }
    return sqrt(sum / n).toFloat()
  }
}
