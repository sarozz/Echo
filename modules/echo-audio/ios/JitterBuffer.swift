import Foundation

struct JitterFrame {
  let data: String
  let ts: Double  // ms
  let durationMs: Int
}

enum JitterPop {
  case notReady           // below target depth — wait
  case play(JitterFrame)
  case conceal            // gap detected — caller may run PLC
}

/**
 * Adaptive jitter buffer (iOS). Mirrors JitterBuffer.kt.
 *
 *  1. Frames are kept in a sorted array by `ts` so out-of-order arrivals
 *     play back in real order.
 *  2. A target depth keeps a small reorder window; depth adapts to
 *     observed inter-arrival jitter (EMA).
 *  3. Frames older than the most-recently-played one are rejected.
 *  4. `.conceal` is returned when there is an unexpected gap so the caller
 *     can play a synthesized (e.g. repeat-with-fade) frame in place.
 */
final class JitterBuffer {
  private let minDepth: Int
  private let maxDepth: Int
  private var targetDepth: Int
  private var q: [JitterFrame] = []
  private let lock = NSLock()
  private var lastPlayedTs: Double = -.greatestFiniteMagnitude
  private var lastArrivalMs: Double = 0
  private var jitterEmaMs: Double = 0

  init(maxDepth: Int) {
    self.minDepth = 2
    self.maxDepth = maxDepth
    self.targetDepth = 3
  }

  func push(_ f: JitterFrame) {
    lock.lock(); defer { lock.unlock() }
    if f.ts < lastPlayedTs { return }

    let now = Date().timeIntervalSince1970 * 1000
    if lastArrivalMs > 0 {
      let arrivalGap = now - lastArrivalMs
      let expected = Double(f.durationMs)
      let deviation = abs(arrivalGap - expected)
      jitterEmaMs = jitterEmaMs * 0.9 + deviation * 0.1
      let want = minDepth + Int(jitterEmaMs / expected)
      targetDepth = min(maxDepth, max(minDepth, want))
    }
    lastArrivalMs = now

    // Insert sorted by ts.
    if let i = q.firstIndex(where: { $0.ts > f.ts }) {
      q.insert(f, at: i)
    } else {
      q.append(f)
    }
    while q.count > maxDepth { q.removeFirst() }
  }

  func pop() -> JitterPop {
    lock.lock(); defer { lock.unlock() }
    if lastPlayedTs == -.greatestFiniteMagnitude && q.count < targetDepth {
      return .notReady
    }
    guard let head = q.first else { return .conceal }
    if lastPlayedTs > -.greatestFiniteMagnitude,
       head.ts > lastPlayedTs + Double(head.durationMs) + gapMs {
      // Big gap — return PLC hint but advance lastPlayedTs so we don't loop.
      lastPlayedTs += Double(head.durationMs)
      return .conceal
    }
    q.removeFirst()
    lastPlayedTs = head.ts
    return .play(head)
  }

  func depth() -> Int {
    lock.lock(); defer { lock.unlock() }
    return q.count
  }

  func clear() {
    lock.lock(); defer { lock.unlock() }
    q.removeAll()
    lastPlayedTs = -.greatestFiniteMagnitude
    lastArrivalMs = 0
    jitterEmaMs = 0
    targetDepth = minDepth + 1
  }

  private let gapMs: Double = 25
}
