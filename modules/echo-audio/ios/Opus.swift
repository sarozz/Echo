import Foundation

/**
 * Opus encoder/decoder placeholders — PCM16 little-endian passthrough.
 *
 * STAGE 2 status: passthrough. Replace with a real binding (libopus via
 * CocoaPods 'libopus', or Apple's AudioConverter set to .opus on iOS 17+).
 */
final class OpusEncoder {
  func encode(pcm: [Int16]) -> Data {
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
