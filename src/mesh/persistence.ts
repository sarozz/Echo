import * as SQLite from 'expo-sqlite';
import type { EchoMessage } from './types';

/**
 * SQLite-backed persistence for messages and their per-peer delivery state.
 *
 * Schema:
 *
 *   messages(wireKey TEXT PRIMARY KEY,        // "<senderId>:<wireMessageId>"
 *            id TEXT,                          // JS-side display id
 *            groupId TEXT,
 *            senderId TEXT,
 *            senderName TEXT,
 *            kind TEXT,                        // 'text' | 'sos' | 'voice'
 *            body TEXT,
 *            ts INTEGER,
 *            mine INTEGER,                     // 0/1
 *            status TEXT,                      // queued | sent | relayed | delivered
 *            wireMessageId INTEGER,            // u32 sender-local sequence
 *            deliveredCount INTEGER,
 *            peerCount INTEGER,
 *            relayedHops INTEGER)
 *
 *   deliveries(wireKey TEXT, peerSenderId TEXT,
 *              PRIMARY KEY(wireKey, peerSenderId))
 *
 * Wire-level (senderId, wireMessageId) is globally unique across devices, so it
 * works as both the dedup key and the per-message identity used by replay.
 */

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS messages (
    wireKey        TEXT PRIMARY KEY,
    id             TEXT,
    groupId        TEXT NOT NULL,
    senderId       TEXT NOT NULL,
    senderName     TEXT,
    kind           TEXT NOT NULL,
    body           TEXT,
    ts             INTEGER NOT NULL,
    mine           INTEGER NOT NULL DEFAULT 0,
    status         TEXT NOT NULL,
    wireMessageId  INTEGER,
    deliveredCount INTEGER,
    peerCount      INTEGER,
    relayedHops    INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_messages_group_ts ON messages(groupId, ts DESC);
  CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(senderId);

  CREATE TABLE IF NOT EXISTS deliveries (
    wireKey      TEXT NOT NULL,
    peerSenderId TEXT NOT NULL,
    PRIMARY KEY (wireKey, peerSenderId)
  );
`;

let dbCache: SQLite.SQLiteDatabase | null = null;

function getDb(): SQLite.SQLiteDatabase {
  if (dbCache) return dbCache;
  const db = SQLite.openDatabaseSync('echo.db');
  db.execSync(SCHEMA);
  dbCache = db;
  return db;
}

function wireKey(senderId: string, wireMessageId: number | undefined): string | null {
  if (wireMessageId === undefined) return null;
  return `${senderId}:${wireMessageId}`;
}

/** Heuristic wireMessageId extractor from incoming JS message ids like "M_<sid>_<wireId>". */
function inferWireMessageId(m: EchoMessage): number | undefined {
  const parts = m.id.split('_');
  // Expected shape: M_<sid>_<wireId> — only for incoming events.
  if (parts[0] === 'M' && parts.length === 3) {
    const n = Number(parts[2]);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

export interface StoredMessage extends EchoMessage {
  wireMessageId?: number;
  deliveredTo: string[];
}

export function init(): void {
  getDb();
}

export function upsertMessage(m: EchoMessage): void {
  const db = getDb();
  const wireMsgId = (m as StoredMessage).wireMessageId ?? inferWireMessageId(m);
  const key = wireKey(m.senderId, wireMsgId);
  // Without a wire id we can't dedup across restarts; index by JS id only.
  const effectiveKey = key ?? `js:${m.id}`;
  db.runSync(
    `INSERT INTO messages (wireKey, id, groupId, senderId, senderName, kind, body, ts, mine, status, wireMessageId, deliveredCount, peerCount, relayedHops)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(wireKey) DO UPDATE SET
       status         = excluded.status,
       deliveredCount = excluded.deliveredCount,
       peerCount      = excluded.peerCount`,
    [
      effectiveKey,
      m.id,
      m.groupId,
      m.senderId,
      m.senderName,
      m.kind,
      m.body,
      m.ts,
      m.mine ? 1 : 0,
      m.status,
      wireMsgId ?? null,
      m.deliveredCount ?? null,
      m.peerCount ?? null,
      m.relayedHops ?? null,
    ],
  );
}

export function markDelivered(senderId: string, wireMessageId: number, peerSenderId: string): void {
  const db = getDb();
  const key = `${senderId}:${wireMessageId}`;
  db.runSync(
    `INSERT OR IGNORE INTO deliveries (wireKey, peerSenderId) VALUES (?, ?)`,
    [key, peerSenderId],
  );
}

export function loadRecent(groupId: string, limit = 200): EchoMessage[] {
  const db = getDb();
  const rows = db.getAllSync<{
    id: string;
    groupId: string;
    senderId: string;
    senderName: string;
    kind: 'text' | 'sos' | 'voice';
    body: string;
    ts: number;
    mine: number;
    status: 'queued' | 'sent' | 'relayed' | 'delivered';
    deliveredCount: number | null;
    peerCount: number | null;
    relayedHops: number | null;
  }>(
    `SELECT id, groupId, senderId, senderName, kind, body, ts, mine, status, deliveredCount, peerCount, relayedHops
     FROM messages WHERE groupId = ? ORDER BY ts ASC LIMIT ?`,
    [groupId, limit],
  );
  return rows.map((r) => ({
    id: r.id,
    groupId: r.groupId,
    senderId: r.senderId,
    senderName: r.senderName,
    kind: r.kind,
    body: r.body,
    ts: r.ts,
    mine: r.mine === 1,
    status: r.status,
    ...(r.deliveredCount !== null ? { deliveredCount: r.deliveredCount } : {}),
    ...(r.peerCount !== null ? { peerCount: r.peerCount } : {}),
    ...(r.relayedHops !== null ? { relayedHops: r.relayedHops } : {}),
  }));
}

/** Returns messages this device originated that haven't been ACKed by `peerSenderId`. */
export function pendingForPeer(peerSenderId: string, sinceMs: number): Array<{
  groupId: string;
  senderId: string;
  senderName: string;
  kind: 'text' | 'sos';
  body: string;
  ts: number;
  wireMessageId: number;
}> {
  const db = getDb();
  const rows = db.getAllSync<{
    groupId: string;
    senderId: string;
    senderName: string;
    kind: string;
    body: string;
    ts: number;
    wireMessageId: number;
  }>(
    `SELECT groupId, senderId, senderName, kind, body, ts, wireMessageId
     FROM messages
     WHERE mine = 1
       AND ts >= ?
       AND wireMessageId IS NOT NULL
       AND kind IN ('text', 'sos')
       AND wireKey NOT IN (
         SELECT wireKey FROM deliveries WHERE peerSenderId = ?
       )`,
    [sinceMs, peerSenderId],
  );
  return rows.map((r) => ({
    groupId: r.groupId,
    senderId: r.senderId,
    senderName: r.senderName,
    kind: r.kind as 'text' | 'sos',
    body: r.body,
    ts: r.ts,
    wireMessageId: r.wireMessageId,
  }));
}

/** Purges messages older than `cutoffMs`. Call on app start or daily. */
export function purgeOlderThan(cutoffMs: number): void {
  const db = getDb();
  db.runSync(`DELETE FROM messages WHERE ts < ?`, [cutoffMs]);
  db.runSync(
    `DELETE FROM deliveries WHERE wireKey NOT IN (SELECT wireKey FROM messages)`,
  );
}

/** TTLs by kind (ms). SOS retained longer than TEXT. */
export const TTL_MS = {
  text: 24 * 60 * 60 * 1000,       // 24h
  sos: 72 * 60 * 60 * 1000,        // 72h
} as const;
