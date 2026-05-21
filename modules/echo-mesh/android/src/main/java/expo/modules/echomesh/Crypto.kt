package expo.modules.echomesh

import java.security.SecureRandom
import java.util.concurrent.ConcurrentHashMap
import javax.crypto.Cipher
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.PBEKeySpec
import javax.crypto.spec.SecretKeySpec

/**
 * Per-group symmetric key storage + AES-GCM-256 AEAD.
 *
 * Key derivation must match `Crypto.swift` on iOS:
 *   key = PBKDF2-HMAC-SHA256(code, "echo:"+groupId, 100_000, 32)
 *
 * Frame encryption layout (when bit 7 of hopCount is set on the wire):
 *   payload = nonce(12) | ciphertext | tag(16)
 *
 * Plaintext outputs `nonce + ciphertext+tag` packed; Java's Cipher returns
 * `ciphertext+tag` from `doFinal()` so we just prepend the nonce.
 */
internal object Crypto {
  private const val PBKDF2_ITERS = 100_000
  private const val KEY_BITS = 256
  private const val NONCE_LEN = 12
  private const val TAG_BITS = 128

  private val keys = ConcurrentHashMap<String, ByteArray>()
  private val rng = SecureRandom()

  fun setSecret(groupId: String, code: String) {
    val salt = ("echo:$groupId").toByteArray(Charsets.US_ASCII)
    val spec = PBEKeySpec(code.toCharArray(), salt, PBKDF2_ITERS, KEY_BITS)
    val factory = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256")
    val key = factory.generateSecret(spec).encoded
    keys[groupId] = key
  }

  fun clearSecret(groupId: String) {
    keys.remove(groupId)
  }

  fun hasSecret(groupId: String): Boolean = keys.containsKey(groupId)

  /** Returns nonce(12) | ciphertext | tag(16). */
  fun encrypt(groupId: String, plaintext: ByteArray): ByteArray? {
    val key = keys[groupId] ?: return null
    val nonce = ByteArray(NONCE_LEN).also { rng.nextBytes(it) }
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.ENCRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(TAG_BITS, nonce))
    val ct = cipher.doFinal(plaintext)
    return nonce + ct
  }

  /** Accepts nonce(12) | ciphertext | tag(16); returns plaintext or null on bad input/key. */
  fun decrypt(groupId: String, blob: ByteArray): ByteArray? {
    val key = keys[groupId] ?: return null
    if (blob.size < NONCE_LEN + TAG_BITS / 8) return null
    val nonce = blob.copyOfRange(0, NONCE_LEN)
    val ct = blob.copyOfRange(NONCE_LEN, blob.size)
    return try {
      val cipher = Cipher.getInstance("AES/GCM/NoPadding")
      cipher.init(Cipher.DECRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(TAG_BITS, nonce))
      cipher.doFinal(ct)
    } catch (_: Throwable) {
      null
    }
  }
}
