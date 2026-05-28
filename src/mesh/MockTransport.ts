import type { MeshTransport } from './MeshTransport';
import type {
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

const SELF_SENDER_ID = '0A';
const SELF_NAME = 'YOU';

const NAMES = ['ANISH', 'PEMA', 'DAWA', 'KARMA', 'TENZIN', 'NIMA', 'SONAM'];

const SAMPLE_INCOMING = [
  'Approaching the pass, low visibility.',
  'Stopping for water at the next ridge.',
  'Anyone behind me? Lost sight.',
  'Switchbacks ahead — single file.',
  'Battery at 30%, switching to relay only.',
  'Camp set up at the marked point.',
];

function rand<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)] as T;
}

function id(prefix = ''): string {
  return prefix + Math.random().toString(36).slice(2, 8).toUpperCase();
}

export class MockTransport implements MeshTransport {
  private peers: Peer[] = [];
  private state: MeshState = {
    conn: 'offline',
    peerCount: 0,
    hops: 0,
    selfRole: 'relay',
    mode: 'trek',
  };
  private voice: VoiceActivity = { active: false };
  private currentGroup = 'main';
  private started = false;

  private peerCbs = new Set<PeersListener>();
  private msgCbs = new Set<MessageListener>();
  private stateCbs = new Set<StateListener>();
  private voiceCbs = new Set<VoiceListener>();

  private timers: ReturnType<typeof setTimeout>[] = [];
  private intervals: ReturnType<typeof setInterval>[] = [];

  start(): void {
    if (this.started) return;
    this.started = true;

    this.setState({ conn: 'discovering' });

    this.timers.push(
      setTimeout(() => {
        this.peers = this.makeInitialPeers();
        this.setState({
          conn: 'connected',
          peerCount: this.peers.length,
          hops: this.maxHops(),
        });
        this.emitPeers();
      }, 1500),
    );

    this.intervals.push(setInterval(() => this.jitterPeers(), 4500));
    this.intervals.push(setInterval(() => this.maybeIncomingMessage(), 6500));
    this.intervals.push(setInterval(() => this.maybeRemoteTalker(), 11000));
  }

  stop(): void {
    this.timers.forEach(clearTimeout);
    this.intervals.forEach(clearInterval);
    this.timers = [];
    this.intervals = [];
    this.started = false;
    this.peers = [];
    this.setState({ conn: 'offline', peerCount: 0, hops: 0 });
    this.emitPeers();
  }

  joinGroup(groupId: string): void {
    this.currentGroup = groupId;
  }

  sendText(groupId: string, body: string): void {
    const peerCount = this.peers.length;
    const msg: EchoMessage = {
      id: id('M_'),
      groupId,
      senderId: SELF_SENDER_ID,
      senderName: SELF_NAME,
      kind: 'text',
      body,
      ts: Date.now(),
      mine: true,
      status: 'queued',
      peerCount,
    };
    this.emitMessage(msg);

    if (peerCount === 0) {
      // STAGE-1 demo: stays queued so the user sees the offline UX.
      return;
    }

    this.timers.push(
      setTimeout(() => {
        this.emitMessage({ ...msg, status: 'sent' });
      }, 500),
    );
    this.timers.push(
      setTimeout(() => {
        this.emitMessage({
          ...msg,
          status: 'delivered',
          deliveredCount: peerCount,
          peerCount,
        });
      }, 1400),
    );
  }

  startVoice(_groupId: string): void {
    this.voice = { active: true, talkerSenderId: SELF_SENDER_ID, talkerName: SELF_NAME };
    this.emitVoice();
  }

  stopVoice(_groupId: string): void {
    this.voice = { active: false };
    this.emitVoice();
  }

  triggerSOS(groupId: string): void {
    const msg: EchoMessage = {
      id: id('SOS_'),
      groupId,
      senderId: SELF_SENDER_ID,
      senderName: SELF_NAME,
      kind: 'sos',
      body: 'SOS — broadcasting location to the group.',
      ts: Date.now(),
      mine: true,
      status: this.peers.length > 0 ? 'delivered' : 'queued',
      peerCount: this.peers.length,
      deliveredCount: this.peers.length,
    };
    this.emitMessage(msg);

    // Flag a random peer as in-distress too, to make the map come alive.
    const idx = Math.floor(Math.random() * this.peers.length);
    if (this.peers[idx]) {
      this.peers = this.peers.map((p, i) => (i === idx ? { ...p, sos: true } : p));
      this.emitPeers();
    }
  }

  onPeers(cb: PeersListener): () => void {
    this.peerCbs.add(cb);
    cb(this.peers);
    return () => { this.peerCbs.delete(cb); };
  }

  onMessage(cb: MessageListener): () => void {
    this.msgCbs.add(cb);
    return () => { this.msgCbs.delete(cb); };
  }

  onState(cb: StateListener): () => void {
    this.stateCbs.add(cb);
    cb(this.state);
    return () => { this.stateCbs.delete(cb); };
  }

  onVoiceActivity(cb: VoiceListener): () => void {
    this.voiceCbs.add(cb);
    cb(this.voice);
    return () => { this.voiceCbs.delete(cb); };
  }

  // --- internals --------------------------------------------------------

  private setState(patch: Partial<MeshState>): void {
    this.state = { ...this.state, ...patch };
    this.stateCbs.forEach((cb) => cb(this.state));
  }

  private emitPeers(): void {
    const next = [...this.peers];
    this.peerCbs.forEach((cb) => cb(next));
    this.setState({ peerCount: next.length, hops: this.maxHops() });
  }

  private emitMessage(m: EchoMessage): void {
    this.msgCbs.forEach((cb) => cb(m));
  }

  private emitVoice(): void {
    this.voiceCbs.forEach((cb) => cb(this.voice));
  }

  private maxHops(): number {
    return this.peers.reduce((h, p) => Math.max(h, p.hops), 0);
  }

  private makeInitialPeers(): Peer[] {
    const picks: Peer[] = [];
    const used = new Set<string>();
    const count = 3 + Math.floor(Math.random() * 2); // 3 or 4
    for (let i = 0; i < count; i++) {
      let name = rand(NAMES);
      while (used.has(name)) name = rand(NAMES);
      used.add(name);
      const platform = Math.random() < 0.5 ? 'android' : 'ios';
      const role: Role = Math.random() < 0.75 ? 'relay' : 'leaf';
      picks.push({
        senderId: id('').slice(0, 2),
        name,
        platform,
        role,
        battery: 35 + Math.floor(Math.random() * 60),
        hops: 1 + Math.floor(Math.random() * 3),
      });
    }
    return picks;
  }

  private jitterPeers(): void {
    if (this.peers.length === 0) return;
    this.peers = this.peers.map((p) => {
      const drift = Math.random() < 0.5 ? -1 : 1;
      const battery = Math.max(5, Math.min(100, p.battery + drift * Math.floor(Math.random() * 3)));
      let role: Role = p.role;
      if (p.platform === 'ios' && Math.random() < 0.12) {
        role = p.role === 'relay' ? 'leaf' : 'relay';
      }
      const hops = Math.random() < 0.2
        ? Math.max(1, Math.min(4, p.hops + (Math.random() < 0.5 ? -1 : 1)))
        : p.hops;
      return { ...p, battery, role, hops };
    });
    this.emitPeers();
  }

  private maybeIncomingMessage(): void {
    if (this.peers.length === 0) return;
    if (Math.random() > 0.6) return;
    const from = rand(this.peers);
    const msg: EchoMessage = {
      id: id('M_'),
      groupId: this.currentGroup,
      senderId: from.senderId,
      senderName: from.name,
      kind: 'text',
      body: rand(SAMPLE_INCOMING),
      ts: Date.now(),
      mine: false,
      status: 'relayed',
      relayedHops: 1 + Math.floor(Math.random() * 3),
    };
    this.emitMessage(msg);
  }

  private maybeRemoteTalker(): void {
    if (this.voice.active) return;
    if (this.peers.length === 0) return;
    if (Math.random() > 0.5) return;
    const talker = rand(this.peers);
    this.voice = { active: true, talkerSenderId: talker.senderId, talkerName: talker.name };
    this.emitVoice();
    this.timers.push(
      setTimeout(() => {
        this.voice = { active: false };
        this.emitVoice();
      }, 2500 + Math.random() * 2500),
    );
  }
}

export const mockTransport = new MockTransport();

export function selfSenderId(): string {
  return SELF_SENDER_ID;
}

export function selfName(): string {
  return SELF_NAME;
}
