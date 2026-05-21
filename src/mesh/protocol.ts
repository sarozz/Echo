/**
 * Echo wire protocol — single source of truth.
 *
 * All native transports (Nearby, Multipeer, BLE GATT) MUST encode/decode
 * frames byte-for-byte identically so that an Android phone speaking BLE
 * can talk to an iOS phone speaking BLE, etc.
 *
 * Frame layout (network order):
 *   offset  bytes  field
 *   0       1      magic = 0xE0  ("Echo")
 *   1       1      version (currently 1)
 *   2       1      kind   (see PROTOCOL_KIND)
 *   3       1      hop count (0..15, capped)
 *   4       2      sender sender-id (2 ASCII chars, uppercase)
 *   6       8      group-id (8 bytes; ASCII, NUL-padded)
 *  14       4      message-id (LE u32; sender-local sequence)
 *  18       4      timestamp (LE u32; seconds since unix epoch, mod 2^32)
 *  22       2      payload-length (LE u16)
 *  24       N      payload bytes (per kind)
 *
 * Payload by kind:
 *   TEXT, SOS:  UTF-8 string, no framing
 *   VOICE:      raw Opus frame (~20ms, 16kHz, mono, ~50–80 bytes after Opus)
 *   HELLO:      JSON object { name, platform, role, battery }
 *   ACK:        u32 ack-target message-id
 *   PEER_ADV:   JSON object { name, platform, role, battery, rssi }
 *
 * NOTE: this file describes the contract — actual encoding lives in native
 * code (per platform) and a TS test harness used by both NativeTransport and
 * MockTransport for parity testing.
 */

export const PROTOCOL_MAGIC = 0xe0;
export const PROTOCOL_VERSION = 1;

export const PROTOCOL_KIND = {
  TEXT: 0x01,
  SOS: 0x02,
  VOICE: 0x03,
  HELLO: 0x04,
  ACK: 0x05,
  PEER_ADV: 0x06,
} as const;

export type ProtocolKind = (typeof PROTOCOL_KIND)[keyof typeof PROTOCOL_KIND];

export const MAX_HOPS = 8;
export const MAX_PAYLOAD = 65535;

/** The 24-byte fixed header size; payloads append after this. */
export const HEADER_SIZE = 24;

export const SENDER_ID_BYTES = 2;
export const GROUP_ID_BYTES = 8;
