package expo.modules.echoaudio

import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * Opus encoder/decoder placeholders.
 *
 * STAGE 2 status: passthrough. We serialize raw PCM16 (little-endian) so the
 * rest of the pipeline can be wired end-to-end and listened to on real
 * devices. This wastes bandwidth versus real Opus (16kbps target) and there
 * is no PLC or DTX — replace before any field testing.
 *
 * Drop-in replacement guidance: any binding that exposes
 *   encode(pcm: ShortArray, len: Int) : ByteArray
 *   decode(bytes: ByteArray, sampleRate: Int, durationMs: Int) : ShortArray
 * fits without changing the rest of the pipeline.
 */
internal class OpusEncoder {
  fun encode(pcm: ShortArray, len: Int): ByteArray {
    val buf = ByteBuffer.allocate(len * 2).order(ByteOrder.LITTLE_ENDIAN)
    for (i in 0 until len) buf.putShort(pcm[i])
    return buf.array()
  }
}

internal class OpusDecoder {
  fun decode(bytes: ByteArray, sampleRate: Int, durationMs: Int): ShortArray {
    val samples = bytes.size / 2
    val out = ShortArray(samples)
    val buf = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
    for (i in 0 until samples) out[i] = buf.short
    return out
  }
}
