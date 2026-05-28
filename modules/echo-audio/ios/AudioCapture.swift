import Foundation
import AVFoundation

/**
 * AVAudioEngine input tap -> 20ms PCM frames -> RMS VAD -> encode -> onFrame.
 *
 * STAGE 2 status: capture + VAD are real. Opus encoder is passthrough.
 */
final class AudioCapture {
  private let engine = AVAudioEngine()
  private let encoder = OpusEncoder()
  private var started = false
  private var voiceActive = false

  private let onFrame: (_ b64: String, _ ts: Double, _ durationMs: Int, _ voiced: Bool) -> Void
  private let onTalker: (_ active: Bool) -> Void

  init(
    onFrame: @escaping (String, Double, Int, Bool) -> Void,
    onTalker: @escaping (Bool) -> Void
  ) {
    self.onFrame = onFrame
    self.onTalker = onTalker
  }

  func start(mode: String, vadThreshold: Float, sampleRate: Double) {
    if started { return }
    started = true

    let session = AVAudioSession.sharedInstance()
    do {
      try session.setCategory(.playAndRecord, mode: .voiceChat, options: [.defaultToSpeaker, .allowBluetooth])
      try session.setPreferredSampleRate(sampleRate)
      try session.setPreferredIOBufferDuration(0.02)
      try session.setActive(true)
    } catch {
      onTalker(false)
      return
    }

    let input = engine.inputNode
    let format = input.outputFormat(forBus: 0)
    let frameCount = AVAudioFrameCount(format.sampleRate * 0.02)

    input.installTap(onBus: 0, bufferSize: frameCount, format: format) { [weak self] buffer, _ in
      guard let self else { return }
      guard let channelData = buffer.floatChannelData?.pointee else { return }
      let n = Int(buffer.frameLength)
      var sum: Float = 0
      var pcm = [Int16](repeating: 0, count: n)
      for i in 0..<n {
        let v = channelData[i]
        sum += v * v
        pcm[i] = Int16(max(-1.0, min(1.0, v)) * Float(Int16.max))
      }
      let rms = sqrt(sum / Float(n))
      let voiced = rms > vadThreshold

      let shouldSend = mode == "ptt" || voiced
      if voiced != self.voiceActive {
        self.voiceActive = voiced
        self.onTalker(voiced)
      }
      if !shouldSend { return }

      let bytes = self.encoder.encode(pcm: pcm)
      let b64 = bytes.base64EncodedString()
      self.onFrame(b64, Date().timeIntervalSince1970 * 1000, 20, voiced)
    }

    do {
      try engine.start()
    } catch {
      input.removeTap(onBus: 0)
      started = false
    }
  }

  func stop() {
    guard started else { return }
    started = false
    engine.inputNode.removeTap(onBus: 0)
    engine.stop()
    if voiceActive {
      voiceActive = false
      onTalker(false)
    }
  }
}
