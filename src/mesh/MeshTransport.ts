import type {
  MessageListener,
  PeersListener,
  StateListener,
  VoiceListener,
} from './types';

// STAGE 2: Replace MockTransport with a real implementation of this interface,
// backed by native modules:
//   - Android: Nearby Connections / BLE advertising + GATT
//   - iOS: MultipeerConnectivity / Core Bluetooth
// The UI never touches transports directly — it only depends on this contract,
// so swapping in a real backend requires zero UI changes.
export interface MeshTransport {
  start(): void;
  stop(): void;

  joinGroup(groupId: string): void;

  sendText(groupId: string, body: string): void;

  startVoice(groupId: string): void;
  stopVoice(groupId: string): void;

  triggerSOS(groupId: string): void;

  /**
   * Re-broadcasts a previously-sent TEXT/SOS frame with its original wire IDs.
   * Used by store-and-forward when a peer reconnects. May be a no-op on the
   * mock transport.
   */
  replay?(
    groupId: string,
    senderId: string,
    wireMessageId: number,
    ts: number,
    kind: 'text' | 'sos',
    body: string,
  ): void;

  /**
   * Sets the AES-GCM key for `groupId` derived from the group's join code.
   * Once set, outbound TEXT/SOS/VOICE frames for this group are encrypted
   * and inbound frames in that group are decrypted. Optional on mock.
   */
  setGroupSecret?(groupId: string, code: string): void;
  clearGroupSecret?(groupId: string): void;

  onPeers(cb: PeersListener): () => void;
  onMessage(cb: MessageListener): () => void;
  onState(cb: StateListener): () => void;
  onVoiceActivity(cb: VoiceListener): () => void;
}
