import Foundation

/// In-flight outbound messages awaiting ACKs. Mirrors PendingTable.kt.
final class PendingTable {
  final class Entry {
    let jsId: String
    let groupId: String
    let body: String
    let kind: UInt8
    let frame: Frame
    let expectedAcks: Int
    var ackedBy: Set<String> = []
    var attempt: Int = 1
    init(jsId: String, groupId: String, body: String, kind: UInt8, frame: Frame, expectedAcks: Int) {
      self.jsId = jsId; self.groupId = groupId; self.body = body
      self.kind = kind; self.frame = frame; self.expectedAcks = expectedAcks
    }
  }

  private var map: [UInt32: Entry] = [:]
  private let lock = NSLock()

  func put(_ messageId: UInt32, _ e: Entry) {
    lock.lock(); defer { lock.unlock() }
    map[messageId] = e
  }

  func get(_ messageId: UInt32) -> Entry? {
    lock.lock(); defer { lock.unlock() }
    return map[messageId]
  }

  func remove(_ messageId: UInt32) -> Entry? {
    lock.lock(); defer { lock.unlock() }
    return map.removeValue(forKey: messageId)
  }

  func ack(_ messageId: UInt32, by senderId: String) -> Entry? {
    lock.lock(); defer { lock.unlock() }
    let e = map[messageId]
    e?.ackedBy.insert(senderId)
    return e
  }
}
