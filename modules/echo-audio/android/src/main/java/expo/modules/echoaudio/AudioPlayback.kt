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
 * STAGE 2 status: AudioTrack + MediaCodec decode are real. Jitter buffer
 * is ts-ordered with adaptive depth. Packet-loss concealment is
 * "repeat-last-frame at attenuated volume" — cheap, audible, and good
 * enough to mask single-frame drops at 20ms granularity.
 */
internal class AudioPlayback(
  private val scope: CoroutineScope,
  private val jitter: JitterBuffer,
  private val stats: AudioStats,
) {
  private var track: AudioTrack? = null
  private var job: Job? = null
  private var decoder: OpusDecoder? = null
  private var lastPcm: ShortArray? = null

  fun start(sampleRate: Int) {
    if (track != null) return
    val dec = OpusDecoder(sampleRate = sampleRate).also { decoder = it }

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

        when (val pop = jitter.pop()) {
          is JitterBuffer.Pop.NotReady -> {
            delay(5)
          }
          is JitterBuffer.Pop.Conceal -> {
            // Packet-loss concealment: replay the last decoded PCM at half
            // amplitude. Quick, audible, no codec round-trip.
            lastPcm?.let { prev ->
              val faded = ShortArray(prev.size)
              for (i in faded.indices) faded[i] = (prev[i].toInt() / 2).toShort()
              track?.write(faded, 0, faded.size)
            }
            stats.dropped++
          }
          is JitterBuffer.Pop.Play -> {
            val frame = pop.frame
            val payload = try { Base64.decode(frame.data, Base64.NO_WRAP) } catch (_: Throwable) {
              stats.dropped++
              continue
            }
            val pcm = dec.decode(payload, sampleRate, frame.durationMs)
            if (pcm.isEmpty()) continue // warm-up frame from MediaCodec
            track?.write(pcm, 0, pcm.size)
            lastPcm = pcm
            stats.played++
          }
        }
      }
    }
  }

  fun stop() {
    job?.cancel()
    job = null
    try { track?.stop() } catch (_: Throwable) {}
    try { track?.release() } catch (_: Throwable) {}
    track = null
    decoder?.close()
    decoder = null
    lastPcm = null
    jitter.clear()
  }
}
