import Foundation

struct JitterFrame {
  let data: String
  let ts: Double
  let durationMs: Int
}

/**
 * Bounded FIFO jitter buffer. Drops oldest when over depth.
 *
 * STAGE 2 status: simple. TODO(stage-2): sort by ts, adaptive depth based on
 * RTT variance, packet-loss concealment.
 */
final class JitterBuffer {
  private let maxDepth: Int
  private var q: [JitterFrame] = []
  private let lock = NSLock()

  init(maxDepth: Int) {
    self.maxDepth = maxDepth
  }

  func push(_ f: JitterFrame) {
    lock.lock(); defer { lock.unlock() }
    q.append(f)
    while q.count > maxDepth { q.removeFirst() }
  }

  func pop() -> JitterFrame? {
    lock.lock(); defer { lock.unlock() }
    return q.isEmpty ? nil : q.removeFirst()
  }

  func depth() -> Int {
    lock.lock(); defer { lock.unlock() }
    return q.count
  }

  func clear() {
    lock.lock(); defer { lock.unlock() }
    q.removeAll()
  }
}
