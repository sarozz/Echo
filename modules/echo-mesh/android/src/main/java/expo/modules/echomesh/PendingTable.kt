package expo.modules.echomesh

import java.util.concurrent.ConcurrentHashMap

/**
 * In-flight outbound messages awaiting ACKs. Keyed by wire messageId
 * (sender-local sequence). One pending entry per send.
 */
internal class PendingTable {
  data class Entry(
    val jsId: String,
    val groupId: String,
    val body: String,
    val kind: Byte,
    val frame: Frame,
    val expectedAcks: Int,
    val ackedBy: MutableSet<String> = mutableSetOf(),
    var attempt: Int = 1,
  )

  private val map = ConcurrentHashMap<Long, Entry>()

  fun put(messageId: Long, e: Entry) { map[messageId] = e }
  fun get(messageId: Long): Entry? = map[messageId]
  fun remove(messageId: Long): Entry? = map.remove(messageId)

  /**
   * Returns the entry and whether this ack newly transitions to "all
   * peers acked" (so the caller can emit final "delivered" once).
   */
  fun ack(messageId: Long, ackingSenderId: String): Entry? {
    val e = map[messageId] ?: return null
    e.ackedBy.add(ackingSenderId)
    return e
  }
}
