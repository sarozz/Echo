import type { EchoMessage, Peer } from './types';
import {
  TTL_MS,
  init as initPersistence,
  loadRecent,
  markDelivered,
  pendingForPeer,
  purgeOlderThan,
  upsertMessage,
} from './persistence';

/**
 * Store-and-forward orchestrator.
 *
 * - Every message that crosses the mesh (sent or received) is persisted.
 * - On boot, the active group's recent history is hydrated into the store.
 * - When a peer newly appears, replay any TEXT/SOS frames they haven't ACKed
 *   yet via the native `replay()` method, which uses the original wire IDs
 *   so receiver-side `SeenSet` absorbs duplicates within a session and
 *   SQLite absorbs them across restarts.
 * - TTL-bounded — TEXT drops after 24h, SOS after 72h.
 */

type ReplayFn = (
  groupId: string,
  senderId: string,
  wireMessageId: number,
  ts: number,
  kind: 'text' | 'sos',
  body: string,
) => Promise<void>;

const seenPeers = new Set<string>();
let lastPurgeTs = 0;

export function initStoreAndForward(): void {
  initPersistence();
  // Purge once at boot.
  const cutoff = Date.now() - TTL_MS.sos;
  purgeOlderThan(cutoff);
  lastPurgeTs = Date.now();
}

export function hydrateGroup(groupId: string): EchoMessage[] {
  return loadRecent(groupId);
}

/** Persist a message event. Called for every onMessage from the native bridge. */
export function persistMessage(m: EchoMessage & { wireMessageId?: number; ackingSenderId?: string }): void {
  // Skip voice frames — high-volume, not S&F-worthy.
  if (m.kind === 'voice') return;
  upsertMessage(m);
  if (m.ackingSenderId && m.wireMessageId !== undefined) {
    markDelivered(m.senderId, m.wireMessageId, m.ackingSenderId);
  }
  // Daily purge.
  if (Date.now() - lastPurgeTs > 6 * 60 * 60 * 1000) {
    purgeOlderThan(Date.now() - TTL_MS.sos);
    lastPurgeTs = Date.now();
  }
}

/** Call on every onPeers event with the current peer list and a replay fn. */
export function onPeersChanged(peers: Peer[], replay: ReplayFn): void {
  const currentIds = new Set(peers.map((p) => p.senderId));
  for (const peer of peers) {
    if (seenPeers.has(peer.senderId)) continue;
    seenPeers.add(peer.senderId);
    void replayForPeer(peer.senderId, replay);
  }
  // Drop peers that disappeared so we replay again next time they reconnect.
  for (const id of Array.from(seenPeers)) {
    if (!currentIds.has(id)) seenPeers.delete(id);
  }
}

async function replayForPeer(peerSenderId: string, replay: ReplayFn): Promise<void> {
  const sinceMs = Date.now() - TTL_MS.sos;
  const pending = pendingForPeer(peerSenderId, sinceMs);
  for (const m of pending) {
    try {
      await replay(m.groupId, m.senderId, m.wireMessageId, m.ts, m.kind, m.body);
    } catch (e) {
      // Best-effort — surface but don't crash.
      if (__DEV__) console.warn('[echo] replay failed', e);
    }
  }
}

export function resetReplayMemory(): void {
  seenPeers.clear();
}
