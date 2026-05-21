// Wire-level types crossing the JS↔native bridge. Keep this file in sync with
// the Kotlin/Swift Module DSL. Native enums are serialized as strings so a
// future protocol bump only touches the constants, not the bridge shape.

export type NativePlatform = 'android' | 'ios';
export type NativeRole = 'relay' | 'leaf';
export type NativeConn = 'offline' | 'discovering' | 'connected' | 'leaf';
export type NativeBackend = 'nearby' | 'multipeer' | 'ble';
export type NativeMessageKind = 'text' | 'voice' | 'sos';
export type NativeDelivery = 'queued' | 'sent' | 'relayed' | 'delivered';

export interface NativePeer {
  senderId: string;
  name: string;
  platform: NativePlatform;
  role: NativeRole;
  battery: number;
  hops: number;
  rssi?: number;
  backend: NativeBackend;
  sos?: boolean;
}

export interface NativeMessageEvent {
  id: string;
  groupId: string;
  senderId: string;
  senderName: string;
  kind: NativeMessageKind;
  body: string;
  ts: number;
  mine: boolean;
  status: NativeDelivery;
  relayedHops?: number;
  deliveredCount?: number;
  peerCount?: number;
}

export interface NativeStateEvent {
  conn: NativeConn;
  peerCount: number;
  hops: number;
  selfRole: NativeRole;
  backend: NativeBackend | 'none';
}

export interface NativeVoiceEvent {
  active: boolean;
  talkerSenderId?: string;
  talkerName?: string;
}

export interface EchoMeshStartOptions {
  selfSenderId: string;
  selfName: string;
  /** preferred backends, tried in order; native picks the first viable one */
  prefer?: NativeBackend[];
}

export type EchoMeshEvents = {
  onPeers: { peers: NativePeer[] };
  onMessage: NativeMessageEvent;
  onState: NativeStateEvent;
  onVoiceActivity: NativeVoiceEvent;
};
