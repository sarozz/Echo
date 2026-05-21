package expo.modules.echoaudio

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
import android.util.Base64
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * JitterBuffer → Opus decode → AudioTrack.
 *
 * STAGE 2 status: AudioTrack playback is real. OpusDecoder is stubbed (passes
 * PCM through). Jitter handling is a simple bounded FIFO — see [JitterBuffer].
 */
internal class AudioPlayback(
  private val scope: CoroutineScope,
  private val jitter: JitterBuffer,
  private val stats: AudioStats,
) {
  private var track: AudioTrack? = null
  private var job: Job? = null
  private val decoder = OpusDecoder()

  fun start(sampleRate: Int) {
    if (track != null) return

    val attrs = AudioAttributes.Builder()
      .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
      .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
      .build()
    val fmt = AudioFormat.Builder()
      .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
      .setSampleRate(sampleRate)
      .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
      .build()
    val minBuf = AudioTrack.getMinBufferSize(
      sampleRate, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT,
    )
    track = AudioTrack(attrs, fmt, minBuf, AudioTrack.MODE_STREAM, AudioManager.AUDIO_SESSION_ID_GENERATE)
    track?.play()

    job = scope.launch {
      while (true) {
        if (!kotlinx.coroutines.isActive) break
        val frame = jitter.pop()
        if (frame == null) {
          delay(5)
          continue
        }
        val payload = try { Base64.decode(frame.data, Base64.NO_WRAP) } catch (_: Throwable) {
          stats.dropped++
          continue
        }
        val pcm = decoder.decode(payload, sampleRate, frame.durationMs)
        track?.write(pcm, 0, pcm.size)
        stats.played++
      }
    }
  }

  fun stop() {
    job?.cancel()
    job = null
    try { track?.stop() } catch (_: Throwable) {}
    try { track?.release() } catch (_: Throwable) {}
    track = null
    jitter.clear()
  }
}
