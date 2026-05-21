import Foundation
import CryptoKit
import CommonCrypto

/**
 * Per-group symmetric key storage + AES-GCM-256 AEAD.
 *
 * Key derivation must match `Crypto.kt`:
 *   key = PBKDF2-HMAC-SHA256(code, "echo:"+groupId, 100_000, 32)
 *
 * Encryption output is `nonce(12) | ciphertext | tag(16)`, the same layout
 * Android writes, so BLE-mediated cross-platform messages decrypt cleanly.
 */
enum Crypto {
  private static let iters: UInt32 = 100_000
  private static let keyLen = 32
  private static let nonceLen = 12

  private static var keys: [String: SymmetricKey] = [:]
  private static let lock = NSLock()

  static func setSecret(groupId: String, code: String) {
    let salt = ("echo:" + groupId).data(using: .utf8) ?? Data()
    let codeBytes = code.data(using: .utf8) ?? Data()
    var derived = Data(count: keyLen)
    let status = derived.withUnsafeMutableBytes { kp -> Int32 in
      guard let kbase = kp.bindMemory(to: UInt8.self).baseAddress else { return -1 }
      return salt.withUnsafeBytes { sp -> Int32 in
        guard let sbase = sp.bindMemory(to: UInt8.self).baseAddress else { return -1 }
        return codeBytes.withUnsafeBytes { cp -> Int32 in
          guard let cbase = cp.bindMemory(to: Int8.self).baseAddress else { return -1 }
          return CCKeyDerivationPBKDF(
            CCPBKDFAlgorithm(kCCPBKDF2),
            cbase, codeBytes.count,
            sbase, salt.count,
            CCPseudoRandomAlgorithm(kCCPRFHmacAlgSHA256),
            iters,
            kbase, keyLen
          )
        }
      }
    }
    if status == 0 {
      lock.lock(); defer { lock.unlock() }
      keys[groupId] = SymmetricKey(data: derived)
    }
  }

  static func clearSecret(groupId: String) {
    lock.lock(); defer { lock.unlock() }
    keys.removeValue(forKey: groupId)
  }

  static func hasSecret(groupId: String) -> Bool {
    lock.lock(); defer { lock.unlock() }
    return keys[groupId] != nil
  }

  /// Returns `nonce(12) | ciphertext | tag(16)`, or nil if no key.
  static func encrypt(groupId: String, plaintext: Data) -> Data? {
    lock.lock()
    let key = keys[groupId]
    lock.unlock()
    guard let key = key else { return nil }
    do {
      let sealed = try AES.GCM.seal(plaintext, using: key)
      var out = Data()
      out.reserveCapacity(nonceLen + sealed.ciphertext.count + 16)
      out.append(Data(sealed.nonce))
      out.append(sealed.ciphertext)
      out.append(sealed.tag)
      return out
    } catch {
      return nil
    }
  }

  /// Accepts `nonce(12) | ciphertext | tag(16)`; returns plaintext or nil.
  static func decrypt(groupId: String, blob: Data) -> Data? {
    lock.lock()
    let key = keys[groupId]
    lock.unlock()
    guard let key = key else { return nil }
    guard blob.count >= nonceLen + 16 else { return nil }
    let base = blob.startIndex
    let nonceData = blob.subdata(in: base..<(base + nonceLen))
    let tagStart = blob.endIndex - 16
    let ciphertext = blob.subdata(in: (base + nonceLen)..<tagStart)
    let tag = blob.subdata(in: tagStart..<blob.endIndex)
    do {
      let nonce = try AES.GCM.Nonce(data: nonceData)
      let sealed = try AES.GCM.SealedBox(nonce: nonce, ciphertext: ciphertext, tag: tag)
      return try AES.GCM.open(sealed, using: key)
    } catch {
      return nil
    }
  }
}
