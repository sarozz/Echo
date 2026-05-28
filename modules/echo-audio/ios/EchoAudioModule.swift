import ExpoModulesCore
import AVFoundation

/**
 * EchoAudio — iOS voice pipeline.
 *
 * AVAudioEngine input tap -> 20ms PCM frames -> RMS VAD -> Opus encode ->
 * onCapturedFrame. pushIncomingFrame -> Opus decode -> JitterBuffer ->
 * AVAudioPlayerNode.
 *
 * STAGE 2 status:
 *  - Capture (AVAudioEngine) and playback (AVAudioPlayerNode) are real.
 *  - RMS-based VAD is real.
 *  - Opus encode/decode are stubbed (PCM passthrough).
 *  - JitterBuffer is FIFO.
 */
public class EchoAudioModule: Module {
  private var capture: AudioCapture?
  private var playback: AudioPlayback?
  private let jitter = JitterBuffer(maxDepth: 10)
  private let stats = AudioStats()

  public func definition() -> ModuleDefinition {
    Name("EchoAudio")
    Events("onCapturedFrame", "onTalker")

    OnCreate {
      self.capture = AudioCapture(
        onFrame: { [weak self] b64, ts, durationMs, voiced in
          guard let self else { return }
          self.stats.captured += 1
          self.sendEvent("onCapturedFrame", [
            "data": b64,
            "ts": ts,
            "durationMs": durationMs,
            "voiced": voiced,
          ])
        },
        onTalker: { [weak self] active in
          self?.sendEvent("onTalker", ["active": active])
        }
      )
      self.playback = AudioPlayback(jitter: self.jitter, stats: self.stats)
    }

    OnDestroy {
      self.capture?.stop()
      self.playback?.stop()
    }

    AsyncFunction("startCapture") { (opts: [String: Any]) -> Void in
      let mode = (opts["mode"] as? String) ?? "ptt"
      let vad = (opts["vadThreshold"] as? Double) ?? 0.05
      let sr = (opts["sampleRateHz"] as? Int) ?? 16000
      self.capture?.start(mode: mode, vadThreshold: Float(vad), sampleRate: Double(sr))
      self.playback?.start(sampleRate: Double(sr))
    }

    AsyncFunction("stopCapture") {
      self.capture?.stop()
      self.playback?.stop()
    }

    AsyncFunction("pushIncomingFrame") { (frame: [String: Any]) in
      guard let data = frame["data"] as? String else { return }
      let ts = (frame["ts"] as? Double) ?? Date().timeIntervalSince1970 * 1000
      let dur = (frame["durationMs"] as? Int) ?? 20
      self.jitter.push(JitterFrame(data: data, ts: ts, durationMs: dur))
    }

    AsyncFunction("getStats") { () -> [String: Any] in
      return [
        "capturedFrames": self.stats.captured,
        "playedFrames": self.stats.played,
        "droppedFrames": self.stats.dropped,
        "jitterBufferDepth": self.jitter.depth(),
      ]
    }
  }
}

final class AudioStats {
  var captured: Int = 0
  var played: Int = 0
  var dropped: Int = 0
}
