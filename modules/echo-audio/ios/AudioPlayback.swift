import Foundation
import AVFoundation

/**
 * JitterBuffer -> Opus decode -> AVAudioPlayerNode.
 *
 * STAGE 2 status: real AVAudioEngine + AVAudioPlayerNode. PCM passthrough
 * decoder. Simple FIFO jitter buffer.
 */
final class AudioPlayback {
  private let engine = AVAudioEngine()
  private let player = AVAudioPlayerNode()
  private let decoder = OpusDecoder()
  private let jitter: JitterBuffer
  private let stats: AudioStats
  private var started = false
  private var pumpTask: Task<Void, Never>?
  private var format: AVAudioFormat?

  init(jitter: JitterBuffer, stats: AudioStats) {
    self.jitter = jitter
    self.stats = stats
  }

  func start(sampleRate: Double) {
    if started { return }
    started = true

    let fmt = AVAudioFormat(commonFormat: .pcmFormatInt16, sampleRate: sampleRate, channels: 1, interleaved: true)
    format = fmt

    engine.attach(player)
    engine.connect(player, to: engine.mainMixerNode, format: fmt)

    do {
      try engine.start()
      player.play()
    } catch {
      started = false
      return
    }

    pumpTask = Task.detached(priority: .userInitiated) { [weak self] in
      while !Task.isCancelled {
        guard let self else { return }
        guard let frame = self.jitter.pop(), let fmt = self.format else {
          try? await Task.sleep(nanoseconds: 5_000_000)
          continue
        }
        guard let data = Data(base64Encoded: frame.data) else {
          self.stats.dropped += 1
          continue
        }
        let pcm = self.decoder.decode(bytes: [UInt8](data))
        guard let buffer = AVAudioPCMBuffer(pcmFormat: fmt, frameCapacity: AVAudioFrameCount(pcm.count)) else { continue }
        buffer.frameLength = AVAudioFrameCount(pcm.count)
        if let int16Channel = buffer.int16ChannelData?.pointee {
          for i in 0..<pcm.count { int16Channel[i] = pcm[i] }
        }
        self.player.scheduleBuffer(buffer, completionHandler: nil)
        self.stats.played += 1
      }
    }
  }

  func stop() {
    guard started else { return }
    started = false
    pumpTask?.cancel()
    pumpTask = nil
    player.stop()
    engine.stop()
    jitter.clear()
  }
}
