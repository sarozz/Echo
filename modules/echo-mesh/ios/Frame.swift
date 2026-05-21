import Foundation

/**
 * Wire-format codec. Mirrors `Frame.kt` and `src/mesh/protocol.ts`
 * byte-for-byte so BLE-mediated Android↔iOS interop works.
 *
 * Layout (LE):
 *   0   1   magic    = 0xE0
 *   1   1   version  = 1
 *   2   1   kind
 *   3   1   hopCount
 *   4   2   senderId  (2 ASCII bytes)
 *   6   8   groupId   (8 ASCII bytes, NUL-padded)
 *  14   4   messageId (u32)
 *  18   4   timestamp (u32)
 *  22   2   payloadLen
 *  24   N   payload
 */
struct Frame {
  var kind: UInt8
  var hopCount: Int
  var senderId: String
  var groupId: String
  var messageId: UInt32
  var timestamp: UInt32
  var payload: Data
  /// True when the payload is AES-GCM ciphertext (nonce(12) | ct | tag(16)).
  var encrypted: Bool = false

  static let magic: UInt8 = 0xE0
  static let version: UInt8 = 1
  static let headerSize = 24
  static let senderIdBytes = 2
  static let groupIdBytes = 8
  static let maxHops = 8
  static let maxPayload = 65535
  static let flagEncrypted: UInt8 = 0x80
  static let hopMask: UInt8 = 0x7f

  static let KIND_TEXT: UInt8 = 0x01
  static let KIND_SOS: UInt8 = 0x02
  static let KIND_VOICE: UInt8 = 0x03
  static let KIND_HELLO: UInt8 = 0x04
  static let KIND_ACK: UInt8 = 0x05
  static let KIND_PEER_ADV: UInt8 = 0x06

  func encode() -> Data {
    precondition(senderId.count == Frame.senderIdBytes, "senderId must be \(Frame.senderIdBytes) chars")
    precondition(payload.count <= Frame.maxPayload, "payload too large")
    var d = Data()
    d.reserveCapacity(Frame.headerSize + payload.count)

    d.append(Frame.magic)
    d.append(Frame.version)
    d.append(kind)
    let hopByte = UInt8(min(Int(Frame.hopMask), max(0, hopCount))) | (encrypted ? Frame.flagEncrypted : 0)
    d.append(hopByte)

    if let sid = senderId.data(using: .ascii) { d.append(sid) } else { d.append(contentsOf: [0, 0]) }
    let gid = groupId.prefix(Frame.groupIdBytes).data(using: .ascii) ?? Data()
    d.append(gid)
    for _ in 0..<(Frame.groupIdBytes - gid.count) { d.append(0) }

    d.appendLE(messageId)
    d.appendLE(timestamp)
    d.appendLE(UInt16(payload.count))
    d.append(payload)
    return d
  }

  func bumpedHop() -> Frame {
    var copy = self
    copy.hopCount = min(Frame.maxHops, hopCount + 1)
    return copy
  }

  static func decode(_ bytes: Data) -> Frame? {
    guard bytes.count >= headerSize else { return nil }
    let base = bytes.startIndex
    guard bytes[base] == magic, bytes[base + 1] == version else { return nil }

    let kind = bytes[base + 2]
    let hopByte = bytes[base + 3]
    let encrypted = (hopByte & Frame.flagEncrypted) != 0
    let hop = Int(hopByte & Frame.hopMask)

    let sidData = bytes.subdata(in: (base + 4)..<(base + 6))
    let gidData = bytes.subdata(in: (base + 6)..<(base + 14))
    let sid = String(data: sidData, encoding: .ascii) ?? ""
    let gid = (String(data: gidData, encoding: .ascii) ?? "")
      .trimmingCharacters(in: CharacterSet(charactersIn: "\u{00}"))

    let msgId = bytes.readLE32(at: base + 14)
    let ts = bytes.readLE32(at: base + 18)
    let plen = Int(bytes.readLE16(at: base + 22))

    guard bytes.count >= headerSize + plen else { return nil }
    let payloadData = bytes.subdata(in: (base + headerSize)..<(base + headerSize + plen))

    return Frame(
      kind: kind,
      hopCount: hop,
      senderId: sid,
      groupId: gid,
      messageId: msgId,
      timestamp: ts,
      payload: payloadData,
      encrypted: encrypted,
    )
  }

  /// Returns a copy with the payload encrypted under the group key, or the
  /// original frame if the kind isn't encryptable or no key is set.
  static func maybeEncrypt(_ frame: Frame) -> Frame {
    if frame.encrypted { return frame }
    if !shouldEncrypt(frame.kind) { return frame }
    guard let ct = Crypto.encrypt(groupId: frame.groupId, plaintext: frame.payload) else { return frame }
    var copy = frame
    copy.payload = ct
    copy.encrypted = true
    return copy
  }

  /// Returns a copy with the payload decrypted, or nil if decryption failed.
  /// Clear frames pass through unchanged.
  static func maybeDecrypt(_ frame: Frame) -> Frame? {
    if !frame.encrypted { return frame }
    guard let pt = Crypto.decrypt(groupId: frame.groupId, blob: frame.payload) else { return nil }
    var copy = frame
    copy.payload = pt
    copy.encrypted = false
    return copy
  }

  private static func shouldEncrypt(_ kind: UInt8) -> Bool {
    return kind == KIND_TEXT || kind == KIND_SOS || kind == KIND_VOICE
  }

  static func textPayload(_ body: String) -> Data {
    return body.data(using: .utf8) ?? Data()
  }

  static func textBody(_ payload: Data) -> String {
    return String(data: payload, encoding: .utf8) ?? ""
  }

  /// ACK payload = u32 LE target message id.
  static func ackPayload(_ targetMessageId: UInt32) -> Data {
    var d = Data(capacity: 4)
    d.appendLE(targetMessageId)
    return d
  }

  static func parseAck(_ payload: Data) -> UInt32? {
    guard payload.count >= 4 else { return nil }
    return payload.readLE32(at: payload.startIndex)
  }

  static func kindWire(_ kind: UInt8) -> String {
    switch kind {
    case KIND_TEXT: return "text"
    case KIND_SOS: return "sos"
    case KIND_VOICE: return "voice"
    case KIND_HELLO: return "hello"
    case KIND_ACK: return "ack"
    case KIND_PEER_ADV: return "peer_adv"
    default: return "text"
    }
  }
}

extension Data {
  mutating func appendLE(_ v: UInt32) {
    append(UInt8(v & 0xFF))
    append(UInt8((v >> 8) & 0xFF))
    append(UInt8((v >> 16) & 0xFF))
    append(UInt8((v >> 24) & 0xFF))
  }
  mutating func appendLE(_ v: UInt16) {
    append(UInt8(v & 0xFF))
    append(UInt8((v >> 8) & 0xFF))
  }
  func readLE32(at offset: Int) -> UInt32 {
    return UInt32(self[offset])
      | (UInt32(self[offset + 1]) << 8)
      | (UInt32(self[offset + 2]) << 16)
      | (UInt32(self[offset + 3]) << 24)
  }
  func readLE16(at offset: Int) -> UInt16 {
    return UInt16(self[offset]) | (UInt16(self[offset + 1]) << 8)
  }
}

/**
 * Bounded LRU dedup set keyed by `"<senderId>:<messageId>"`. Returns true
 * on first sight, false if already seen.
 */
final class SeenSet {
  private let capacity: Int
  private var order: [String] = []
  private var set: Set<String> = []
  private let lock = NSLock()

  init(capacity: Int = 512) {
    self.capacity = capacity
  }

  func add(_ key: String) -> Bool {
    lock.lock(); defer { lock.unlock() }
    if set.contains(key) { return false }
    set.insert(key)
    order.append(key)
    while order.count > capacity {
      let dropped = order.removeFirst()
      set.remove(dropped)
    }
    return true
  }

  func clear() {
    lock.lock(); defer { lock.unlock() }
    order.removeAll()
    set.removeAll()
  }
}
