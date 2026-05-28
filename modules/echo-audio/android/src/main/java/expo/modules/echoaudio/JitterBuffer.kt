package expo.modules.echoaudio

import java.util.PriorityQueue
import java.util.concurrent.atomic.AtomicLong
import kotlin.math.abs

/**
 * Adaptive jitter buffer.
 *
 * Goals:
 *  1. Reorder out-of-order frames using their `ts` timestamp.
 *  2. Hold a small target depth (3 frames ≈ 60ms) so packets that arrive
 *     a hair late still play in order.
 *  3. Grow depth when arrival jitter is high; shrink it back when calm.
 *  4. Drop frames older than the most-recently-played one (we can't unplay).
 *  5. Surface a "missing frame" signal so callers can do simple PLC
 *     (packet-loss concealment) — repeat-last-frame at low volume.
 */
internal class JitterBuffer(
  initialDepth: Int = 3,
  private val minDepth: Int = 2,
  private val maxDepth: Int = 12,
) {
  data class Frame(val data: String, val ts: Long, val durationMs: Int)

  // Min-heap by ts so earliest-timestamped frame is always next out.
  private val q = PriorityQueue<Frame>(compareBy { it.ts })
  private val lock = Any()

  @Volatile private var targetDepth: Int = initialDepth
  @Volatile private var lastPlayedTs: Long = Long.MIN_VALUE
  @Volatile private var lastArrivalMs: Long = 0L
  @Volatile private var jitterEmaMs: Double = 0.0
  private val pushCount = AtomicLong(0)

  /** Result of a pop attempt — either a frame or a hint that PLC should run. */
  sealed class Pop {
    object NotReady : Pop()           // buffer below target depth, wait
    data class Play(val frame: Frame) : Pop()
    object Conceal : Pop()            // gap detected, caller may repeat last
  }

  fun push(f: Frame) {
    synchronized(lock) {
      // Reject "too old" frames.
      if (f.ts < lastPlayedTs) return

      // Update jitter estimate (EMA of inter-arrival deviation).
      val now = System.currentTimeMillis()
      if (lastArrivalMs > 0) {
        val arrivalGap = now - lastArrivalMs
        val expectedGap = f.durationMs.toLong()
        val deviation = abs(arrivalGap - expectedGap).toDouble()
        jitterEmaMs = jitterEmaMs * 0.9 + deviation * 0.1
        // Adapt target depth: 2 frames + ceil(jitterEma / frameDur).
        val want = (minDepth + (jitterEmaMs / expectedGap).toInt()).coerceIn(minDepth, maxDepth)
        targetDepth = want
      }
      lastArrivalMs = now

      q.add(f)
      while (q.size > maxDepth) q.poll()  // hard cap; drop oldest
      pushCount.incrementAndGet()
    }
  }

  fun pop(): Pop = synchronized(lock) {
    if (q.size < targetDepth && lastPlayedTs == Long.MIN_VALUE) {
      // Initial fill — wait until we've accumulated target depth.
      return Pop.NotReady
    }
    val head = q.peek() ?: return Pop.Conceal  // we expect a frame but have none
    if (lastPlayedTs != Long.MIN_VALUE && head.ts > lastPlayedTs + head.durationMs + GAP_MS) {
      // Big gap between what we last played and what's next — emit PLC hint
      // but DO advance lastPlayedTs so we don't loop forever.
      lastPlayedTs += head.durationMs
      return Pop.Conceal
    }
    q.poll()
    lastPlayedTs = head.ts
    return Pop.Play(head)
  }

  fun depth(): Int = synchronized(lock) { q.size }

  fun targetDepth(): Int = targetDepth

  fun clear() = synchronized(lock) {
    q.clear()
    lastPlayedTs = Long.MIN_VALUE
    lastArrivalMs = 0L
    jitterEmaMs = 0.0
    targetDepth = minDepth + 1
  }

  companion object {
    /** Gap in ms beyond expected cadence that we treat as a loss. */
    private const val GAP_MS = 25L
  }
}
