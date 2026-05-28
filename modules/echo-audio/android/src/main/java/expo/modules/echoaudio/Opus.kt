package expo.modules.echoaudio

import android.media.MediaCodec
import android.media.MediaCodec.BufferInfo
import android.media.MediaCodecInfo
import android.media.MediaFormat
import android.os.Build
import android.util.Log
import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * Opus encoder/decoder backed by Android's built-in MediaCodec.
 *
 * Codec: `audio/opus` (MIMETYPE_AUDIO_OPUS). Decoder available since API 21;
 * encoder requires API 29+. Echo's minSdk is 26, so the encoder is gated on
 * runtime version — on API 26-28 we fall back to PCM passthrough.
 *
 * Frame contract: PCM16 mono @ 16kHz, 20ms = 320 samples = 640 bytes per
 * frame. Opus output is variable (≈40-100 bytes @ 16kbps).
 *
 * MediaCodec is stateful; warm-up latency is a couple of frames. We drop
 * "no output yet" frames silently — voice users notice the first ~40ms but
 * the channel stabilizes immediately afterwards.
 */
internal class OpusEncoder(
  private val sampleRate: Int = 16000,
  private val bitrate: Int = 16000,
) {
  private var codec: MediaCodec? = null
  private val info = BufferInfo()
  private var ptsUs: Long = 0
  private var passthrough = false

  init {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      try {
        val c = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_AUDIO_OPUS)
        val fmt = MediaFormat.createAudioFormat(MediaFormat.MIMETYPE_AUDIO_OPUS, sampleRate, 1)
        fmt.setInteger(MediaFormat.KEY_BIT_RATE, bitrate)
        fmt.setInteger(MediaFormat.KEY_AAC_PROFILE, MediaCodecInfo.CodecProfileLevel.AACObjectLC) // ignored, here for completeness
        c.configure(fmt, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
        c.start()
        codec = c
      } catch (t: Throwable) {
        Log.w(TAG, "MediaCodec OPUS encoder unavailable, using passthrough", t)
        passthrough = true
      }
    } else {
      // OPUS encoder MIME type isn't guaranteed before API 29.
      Log.i(TAG, "API < 29: using PCM passthrough for outgoing voice")
      passthrough = true
    }
  }

  fun encode(pcm: ShortArray, len: Int): ByteArray {
    if (passthrough) return pcmPassthrough(pcm, len)
    val c = codec ?: return pcmPassthrough(pcm, len)

    // Feed PCM in. 20ms @ 16kHz = 320 samples = 640 bytes.
    val inIx = c.dequeueInputBuffer(2_000)
    if (inIx < 0) return ByteArray(0)
    val inBuf = c.getInputBuffer(inIx) ?: return ByteArray(0)
    inBuf.clear()
    val bb = ByteBuffer.allocate(len * 2).order(ByteOrder.nativeOrder())
    for (i in 0 until len) bb.putShort(pcm[i])
    bb.flip()
    inBuf.put(bb)
    c.queueInputBuffer(inIx, 0, len * 2, ptsUs, 0)
    ptsUs += (len.toLong() * 1_000_000L / sampleRate)

    // Drain whatever output is currently ready (codec is asynchronous-ish).
    val out = ByteArray(0)
    var built: ByteArray? = null
    while (true) {
      val outIx = c.dequeueOutputBuffer(info, 0)
      if (outIx == MediaCodec.INFO_TRY_AGAIN_LATER) break
      if (outIx == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) continue
      if (outIx < 0) break
      val outBuf = c.getOutputBuffer(outIx) ?: continue
      outBuf.position(info.offset)
      outBuf.limit(info.offset + info.size)
      val bytes = ByteArray(info.size)
      outBuf.get(bytes)
      c.releaseOutputBuffer(outIx, false)
      // First output is often codec-config (CSD); skip those.
      if (info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG != 0) continue
      built = bytes
    }
    return built ?: out
  }

  fun close() {
    try { codec?.stop() } catch (_: Throwable) {}
    try { codec?.release() } catch (_: Throwable) {}
    codec = null
  }

  private fun pcmPassthrough(pcm: ShortArray, len: Int): ByteArray {
    val bb = ByteBuffer.allocate(len * 2).order(ByteOrder.LITTLE_ENDIAN)
    for (i in 0 until len) bb.putShort(pcm[i])
    return bb.array()
  }

  companion object { private const val TAG = "EchoOpusEnc" }
}

internal class OpusDecoder(
  private val sampleRate: Int = 16000,
) {
  private var codec: MediaCodec? = null
  private val info = BufferInfo()
  private var ptsUs: Long = 0
  private var passthrough = false

  init {
    try {
      val c = MediaCodec.createDecoderByType(MediaFormat.MIMETYPE_AUDIO_OPUS)
      val fmt = MediaFormat.createAudioFormat(MediaFormat.MIMETYPE_AUDIO_OPUS, sampleRate, 1)
      // OPUS decoder needs csd-0 (OpusHead, 19 bytes) and optionally
      // csd-1 + csd-2 (pre-skip + seek pre-roll, in nanoseconds, 8 bytes LE i64 each).
      fmt.setByteBuffer("csd-0", ByteBuffer.wrap(opusHead(sampleRate)))
      fmt.setByteBuffer("csd-1", ByteBuffer.wrap(longLE(80_000_000L))) // 80ms in ns
      fmt.setByteBuffer("csd-2", ByteBuffer.wrap(longLE(80_000_000L)))
      c.configure(fmt, null, null, 0)
      c.start()
      codec = c
    } catch (t: Throwable) {
      Log.w(TAG, "MediaCodec OPUS decoder unavailable, using passthrough", t)
      passthrough = true
    }
  }

  fun decode(bytes: ByteArray, sampleRate: Int, durationMs: Int): ShortArray {
    if (passthrough) return pcmPassthrough(bytes)
    val c = codec ?: return pcmPassthrough(bytes)

    val inIx = c.dequeueInputBuffer(2_000)
    if (inIx >= 0) {
      val inBuf = c.getInputBuffer(inIx)
      if (inBuf != null) {
        inBuf.clear()
        inBuf.put(bytes)
        c.queueInputBuffer(inIx, 0, bytes.size, ptsUs, 0)
        ptsUs += durationMs.toLong() * 1_000L
      }
    }

    while (true) {
      val outIx = c.dequeueOutputBuffer(info, 0)
      if (outIx == MediaCodec.INFO_TRY_AGAIN_LATER) break
      if (outIx == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) continue
      if (outIx < 0) break
      val outBuf = c.getOutputBuffer(outIx) ?: continue
      outBuf.position(info.offset)
      outBuf.limit(info.offset + info.size)
      val bb = outBuf.order(ByteOrder.nativeOrder())
      val samples = info.size / 2
      val out = ShortArray(samples)
      for (i in 0 until samples) out[i] = bb.short
      c.releaseOutputBuffer(outIx, false)
      return out
    }
    return ShortArray(0)
  }

  fun close() {
    try { codec?.stop() } catch (_: Throwable) {}
    try { codec?.release() } catch (_: Throwable) {}
    codec = null
  }

  private fun pcmPassthrough(bytes: ByteArray): ShortArray {
    val samples = bytes.size / 2
    val out = ShortArray(samples)
    val bb = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
    for (i in 0 until samples) out[i] = bb.short
    return out
  }

  companion object {
    private const val TAG = "EchoOpusDec"

    private fun opusHead(sampleRate: Int): ByteArray {
      val bb = ByteBuffer.allocate(19).order(ByteOrder.LITTLE_ENDIAN)
      bb.put("OpusHead".toByteArray(Charsets.US_ASCII)) // magic, 8 bytes
      bb.put(1.toByte())                                // version
      bb.put(1.toByte())                                // channel count
      bb.putShort(3000.toShort())                       // pre-skip
      bb.putInt(sampleRate)                             // input sample rate
      bb.putShort(0.toShort())                          // output gain (Q7.8 dB)
      bb.put(0.toByte())                                // channel mapping family
      return bb.array()
    }

    private fun longLE(v: Long): ByteArray {
      val bb = ByteBuffer.allocate(8).order(ByteOrder.LITTLE_ENDIAN)
      bb.putLong(v)
      return bb.array()
    }
  }
}
