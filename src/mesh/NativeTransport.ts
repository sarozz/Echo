import type { MeshTransport } from './MeshTransport';
import type {
  ConnState,
  EchoMessage,
  MeshState,
  MessageListener,
  Peer,
  PeersListener,
  Role,
  StateListener,
  VoiceActivity,
  VoiceListener,
} from './types';

import type {
  NativeMessageEvent,
  NativePeer,
  NativeStateEvent,
  NativeVoiceEvent,
  NativeVoiceFrame,
} from '../../modules/echo-mesh/EchoMesh.types';
import type { CapturedFrame, IncomingFrame } from '../../modules/echo-audio/EchoAudio.types';
import type { Subscription } from 'expo-modules-core';

type BackendPref = 'auto' | 'nearby' | 'multipeer' | 'ble';

interface NativeMeshModule {
  start(opts: { selfSenderId: string; selfName: string; prefer?: string[] }): Promise<void>;
  stop(): Promise<void>;
  joinGroup(groupId: string): Promise<void>;
  sendText(groupId: string, body: string): Promise<string>;
  startVoice(groupId: string): Promise<void>;
  stopVoice(groupId: string): Promise<void>;
  triggerSOS(groupId: string): Promise<string>;
  relayVoiceFrame(groupId: string, dataB64: string): Promise<void>;
  replay(groupId: string, senderId: string, wireMessageId: number, ts: number, kind: 'text' | 'sos', body: string): Promise<void>;
  setGroupSecret(groupId: string, code: string): Promise<void>;
  clearGroupSecret(groupId: string): Promise<void>;
  broadcastLocation(groupId: string, lat: number, lon: number, accuracy: number): Promise<void>;
  onPeers(cb: (peers: NativePeer[]) => void): Subscription;
  onMessage(cb: (m: NativeMessageEvent) => void): Subscription;
  onState(cb: (s: NativeStateEvent) => void): Subscription;
  onVoiceActivity(cb: (v: NativeVoiceEvent) => void): Subscription;
  onVoiceFrame(cb: (f: NativeVoiceFrame) => void): Subscription;
}

interface NativeAudioModule {
  startCapture(opts: { mode: 'ptt' | 'vox'; vadThreshold?: number; sampleRateHz?: number }): Promise<void>;
  stopCapture(): Promise<void>;
  pushIncomingFrame(f: IncomingFrame): Promise<void>;
  onCapturedFrame(cb: (f: CapturedFrame) => void): Subscription;
}

/**
 * RealMeshTransport — implementation of MeshTransport backed by the
 * `echo-mesh` and `echo-audio` Expo native modules.
 *
 * STAGE 2: this file is the one place the UI's transport instance is
 * decided. Swapping MockTransport for this in `useMesh.ts` is the entire
 * "Stage 2 swap"; no screen or component changes.
 *
 * NOTE: `requireNativeModule` throws in Expo Go. Construction is lazy and
 * gated behind a feature flag in `useMesh.ts` — never import this file
 * eagerly from screens.
 */
export class NativeTransport implements MeshTransport {
  private mesh: NativeMeshModule;
  private audio: NativeAudioModule;
  private subs: Subscription[] = [];
  private selfSenderId: string;
  private selfName: string;
  private backendPref: BackendPref;
  private currentGroup = 'main';
  private currentVoiceGroup: string | null = null;

  private peerCbs = new Set<PeersListener>();
  private msgCbs = new Set<MessageListener>();
  private stateCbs = new Set<StateListener>();
  private voiceCbs = new Set<VoiceListener>();

  private lastPeers: Peer[] = [];
  private lastState: MeshState = {
    conn: 'offline', peerCount: 0, hops: 0, selfRole: 'relay', mode: 'trek',
  };
  private lastVoice: VoiceActivity = { active: false };

  constructor(self: { senderId: string; name: string; backendPref?: BackendPref }) {
    this.selfSenderId = self.senderId;
    this.selfName = self.name;
    this.backendPref = self.backendPref ?? 'auto';
    this.mesh = require('../../modules/echo-mesh') as NativeMeshModule;
    this.audio = require('../../modules/echo-audio') as NativeAudioModule;
  }

  /**
   * Backend preference order based on the user's setting. BLE is deliberately
   * excluded from 'auto' — its outdoor range (~10-30m line-of-sight) is too
   * short for the trekking / riding use case, and falling back to it would
   * fragment the group silently. Users who need cross-platform interop can
   * explicitly opt in via Settings → Preferred Backend → BLE.
   */
  private preferOrder(): string[] {
    switch (this.backendPref) {
      case 'nearby':    return ['nearby'];
      case 'multipeer': return ['multipeer'];
      case 'ble':       return ['ble'];
      case 'auto':
      default:          return ['nearby', 'multipeer'];
    }
  }

  start(): void {
    this.subs.push(this.mesh.onPeers((np) => this.handlePeers(np)));
    this.subs.push(this.mesh.onMessage((nm) => this.handleMessage(nm)));
    this.subs.push(this.mesh.onState((ns) => this.handleState(ns)));
    this.subs.push(this.mesh.onVoiceActivity((nv) => this.handleVoice(nv)));

    // Outbound voice: forward each captured Opus frame to the mesh
    // module which wraps it in a VOICE wire frame and fans it out.
    this.subs.push(this.audio.onCapturedFrame((f) => {
      const group = this.currentVoiceGroup;
      if (group === null) return;
      void this.mesh.relayVoiceFrame(group, f.data);
    }));

    // Inbound voice: each VOICE wire frame from a peer is pushed into the
    // audio module's jitter buffer for decoded playback.
    this.subs.push(this.mesh.onVoiceFrame((vf) => {
      void this.audio.pushIncomingFrame({
        senderId: vf.senderId,
        data: vf.data,
        ts: vf.ts,
        durationMs: vf.durationMs,
      });
    }));

    void this.mesh.start({
      selfSenderId: this.selfSenderId,
      selfName: this.selfName,
      prefer: this.preferOrder(),
    });
  }

  stop(): void {
    this.subs.forEach((s) => s.remove());
    this.subs = [];
    void this.mesh.stop();
    void this.audio.stopCapture();
  }

  joinGroup(groupId: string): void {
    this.currentGroup = groupId;
    void this.mesh.joinGroup(groupId);
  }

  sendText(groupId: string, body: string): void {
    void this.mesh.sendText(groupId, body);
  }

  startVoice(groupId: string): void {
    this.currentVoiceGroup = groupId;
    void this.audio.startCapture({ mode: 'ptt', sampleRateHz: 16000 });
    void this.mesh.startVoice(groupId);
  }

  stopVoice(groupId: string): void {
    this.currentVoiceGroup = null;
    void this.audio.stopCapture();
    void this.mesh.stopVoice(groupId);
  }

  triggerSOS(groupId: string): void {
    void this.mesh.triggerSOS(groupId);
  }

  replay(groupId: string, senderId: string, wireMessageId: number, ts: number, kind: 'text' | 'sos', body: string): void {
    void this.mesh.replay(groupId, senderId, wireMessageId, ts, kind, body);
  }

  setGroupSecret(groupId: string, code: string): void {
    void this.mesh.setGroupSecret(groupId, code);
  }

  clearGroupSecret(groupId: string): void {
    void this.mesh.clearGroupSecret(groupId);
  }

  broadcastLocation(groupId: string, lat: number, lon: number, accuracy: number): void {
    void this.mesh.broadcastLocation(groupId, lat, lon, accuracy);
  }

  onPeers(cb: PeersListener): () => void {
    this.peerCbs.add(cb);
    cb(this.lastPeers);
    return () => { this.peerCbs.delete(cb); };
  }

  onMessage(cb: MessageListener): () => void {
    this.msgCbs.add(cb);
    return () => { this.msgCbs.delete(cb); };
  }

  onState(cb: StateListener): () => void {
    this.stateCbs.add(cb);
    cb(this.lastState);
    return () => { this.stateCbs.delete(cb); };
  }

  onVoiceActivity(cb: VoiceListener): () => void {
    this.voiceCbs.add(cb);
    cb(this.lastVoice);
    return () => { this.voiceCbs.delete(cb); };
  }

  // --- conversions: native <-> JS domain --------------------------------

  private handlePeers(np: NativePeer[]): void {
    const peers: Peer[] = np.map((p) => ({
      senderId: p.senderId,
      name: p.name,
      platform: p.platform,
      role: p.role,
      battery: p.battery,
      hops: p.hops,
      sos: p.sos,
      ...(p.lat !== undefined ? { lat: p.lat } : {}),
      ...(p.lon !== undefined ? { lon: p.lon } : {}),
      ...(p.locationAccuracyMeters !== undefined ? { locationAccuracyMeters: p.locationAccuracyMeters } : {}),
      ...(p.locationTs !== undefined ? { locationTs: p.locationTs } : {}),
    }));
    this.lastPeers = peers;
    this.peerCbs.forEach((cb) => cb(peers));
  }

  private handleMessage(m: NativeMessageEvent): void {
    const echo: EchoMessage = {
      id: m.id,
      groupId: m.groupId,
      senderId: m.senderId,
      senderName: m.senderName,
      kind: m.kind,
      body: m.body,
      ts: m.ts,
      mine: m.mine,
      status: m.status,
      ...(m.relayedHops !== undefined ? { relayedHops: m.relayedHops } : {}),
      ...(m.deliveredCount !== undefined ? { deliveredCount: m.deliveredCount } : {}),
      ...(m.peerCount !== undefined ? { peerCount: m.peerCount } : {}),
    };
    this.msgCbs.forEach((cb) => cb(echo));
  }

  private handleState(s: NativeStateEvent): void {
    const conn: ConnState = s.conn;
    const selfRole: Role = s.selfRole;
    this.lastState = {
      conn,
      peerCount: s.peerCount,
      hops: s.hops,
      selfRole,
      mode: this.lastState.mode,
    };
    this.stateCbs.forEach((cb) => cb(this.lastState));
  }

  private handleVoice(v: NativeVoiceEvent): void {
    const next: VoiceActivity = {
      active: v.active,
      ...(v.talkerSenderId !== undefined ? { talkerSenderId: v.talkerSenderId } : {}),
      ...(v.talkerName !== undefined ? { talkerName: v.talkerName } : {}),
    };
    this.lastVoice = next;
    this.voiceCbs.forEach((cb) => cb(next));
  }
}
