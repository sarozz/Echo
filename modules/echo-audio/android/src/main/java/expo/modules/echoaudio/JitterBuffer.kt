package expo.modules.echoaudio

import java.util.concurrent.ConcurrentLinkedDeque

/**
 * Bounded FIFO with newest-wins eviction once depth exceeds maxDepth. Frames
 * are kept in arrival order — we don't yet sort by sequence/timestamp, which
 * means out-of-order delivery causes audible artifacts.
 *
 * STAGE 2 status: simple. TODO(stage-2): sort by ts, adaptive depth based on
 * RTT variance, packet-loss concealment.
 */
internal class JitterBuffer(private val maxDepth: Int) {
  data class Frame(val data: String, val ts: Long, val durationMs: Int)

  private val q = ConcurrentLinkedDeque<Frame>()

  fun push(f: Frame) {
    q.addLast(f)
    while (q.size > maxDepth) {
      q.pollFirst() // drop oldest
    }
  }

  fun pop(): Frame? = q.pollFirst()

  fun depth(): Int = q.size

  fun clear() { q.clear() }
}
