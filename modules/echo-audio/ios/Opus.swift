import Foundation

/**
 * Opus encoder/decoder for iOS.
 *
 * STAGE 2 status: passthrough PCM16 LE. Real Opus on iOS requires one of:
 *
 *  A) Bundling libopus (CocoaPods 'libopus' or an .xcframework). The pod
 *     adds opus_encoder_create / opus_decode etc.; the wrapper here would
 *     call those from Swift with a small C-bridging header. This works on
 *     every iOS deployment we care about and is the most predictable path.
 *
 *  B) AudioToolbox's AudioConverter with `kAudioFormatOpus` — available on
 *     iOS 17.0+. Lower-effort but limits us to fresh iOS. Format
 *     descriptor handling (Magic Cookie / OpusHead) is the tricky part.
 *
 * Recommendation: ship A — predictable, no version gate, matches Android's
 * built-in MediaCodec OPUS path. Replace `OpusEncoder.encode` and
 * `OpusDecoder.decode` with the libopus calls; everything upstream
 * (AudioCapture / AudioPlayback / JitterBuffer) is already shaped right.
 */
final class OpusEncoder {
  func encode(pcm: [Int16]) -> Data {
    // STAGE 2: passthrough. See file header for migration path.
    var d = Data(capacity: pcm.count * 2)
    for s in pcm {
      d.append(UInt8(truncatingIfNeeded: s))
      d.append(UInt8(truncatingIfNeeded: s >> 8))
    }
    return d
  }
}

final class OpusDecoder {
  func decode(bytes: [UInt8]) -> [Int16] {
    // STAGE 2: passthrough. See file header for migration path.
    let n = bytes.count / 2
    var out = [Int16](repeating: 0, count: n)
    for i in 0..<n {
      let lo = Int16(bytes[2 * i])
      let hi = Int16(bytes[2 * i + 1]) << 8
      out[i] = hi | lo
    }
    return out
  }
}
