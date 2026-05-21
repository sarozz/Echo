export type Platform = 'android' | 'ios';
export type Role = 'relay' | 'leaf';
export type ConnState = 'offline' | 'discovering' | 'connected' | 'leaf';
export type Mode = 'trek' | 'ride';
export type DeliveryStatus = 'queued' | 'sent' | 'relayed' | 'delivered';
export type MessageKind = 'text' | 'voice' | 'sos';

export interface Peer {
  senderId: string;
  name: string;
  platform: Platform;
  role: Role;
  battery: number;
  hops: number;
  sos?: boolean;
}

export interface EchoMessage {
  id: string;
  groupId: string;
  senderId: string;
  senderName: string;
  kind: MessageKind;
  body: string;
  ts: number;
  mine: boolean;
  status: DeliveryStatus;
  relayedHops?: number;
  deliveredCount?: number;
  peerCount?: number;
}

export interface MeshState {
  conn: ConnState;
  peerCount: number;
  hops: number;
  selfRole: Role;
  mode: Mode;
}

export interface VoiceActivity {
  active: boolean;
  talkerSenderId?: string;
  talkerName?: string;
}

export interface Group {
  id: string;
  name: string;
  code: string;
  peerCount: number;
}

export type PeersListener = (peers: Peer[]) => void;
export type MessageListener = (m: EchoMessage) => void;
export type StateListener = (s: MeshState) => void;
export type VoiceListener = (a: VoiceActivity) => void;
