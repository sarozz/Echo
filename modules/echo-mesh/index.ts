import { LegacyEventEmitter, requireNativeModule, type EventSubscription } from 'expo-modules-core';

import type {
  EchoMeshStartOptions,
  NativeMessageEvent,
  NativePeer,
  NativeStateEvent,
  NativeVoiceEvent,
  NativeVoiceFrame,
} from './EchoMesh.types';

// Resolved by Expo at build time via expo-module.config.json.
// In a JS-only context (Expo Go, web) this throws — callers must guard.
const Native = requireNativeModule('EchoMesh') as {
  start(opts: EchoMeshStartOptions): Promise<void>;
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
  getCurrentPeers(): Promise<NativePeer[]>;
};

// LegacyEventEmitter is the SDK-56 replacement for the old EventEmitter
// constructor that takes a native-module shape; the new EventEmitter is
// constructed without args and intended for use by the native module itself.
const emitter = new LegacyEventEmitter(Native as unknown as ConstructorParameters<typeof LegacyEventEmitter>[0]);

export function start(opts: EchoMeshStartOptions): Promise<void> {
  return Native.start(opts);
}

export function stop(): Promise<void> {
  return Native.stop();
}

export function joinGroup(groupId: string): Promise<void> {
  return Native.joinGroup(groupId);
}

export function sendText(groupId: string, body: string): Promise<string> {
  return Native.sendText(groupId, body);
}

export function startVoice(groupId: string): Promise<void> {
  return Native.startVoice(groupId);
}

export function stopVoice(groupId: string): Promise<void> {
  return Native.stopVoice(groupId);
}

export function triggerSOS(groupId: string): Promise<string> {
  return Native.triggerSOS(groupId);
}

export function relayVoiceFrame(groupId: string, dataB64: string): Promise<void> {
  return Native.relayVoiceFrame(groupId, dataB64);
}

export function replay(
  groupId: string,
  senderId: string,
  wireMessageId: number,
  ts: number,
  kind: 'text' | 'sos',
  body: string,
): Promise<void> {
  return Native.replay(groupId, senderId, wireMessageId, ts, kind, body);
}

export function setGroupSecret(groupId: string, code: string): Promise<void> {
  return Native.setGroupSecret(groupId, code);
}

export function clearGroupSecret(groupId: string): Promise<void> {
  return Native.clearGroupSecret(groupId);
}

export function broadcastLocation(groupId: string, lat: number, lon: number, accuracy: number): Promise<void> {
  return Native.broadcastLocation(groupId, lat, lon, accuracy);
}

export function getCurrentPeers(): Promise<NativePeer[]> {
  return Native.getCurrentPeers();
}

export function onPeers(cb: (peers: NativePeer[]) => void): EventSubscription {
  return emitter.addListener<{ peers: NativePeer[] }>('onPeers', (e) => cb(e.peers));
}

export function onMessage(cb: (m: NativeMessageEvent) => void): EventSubscription {
  return emitter.addListener<NativeMessageEvent>('onMessage', cb);
}

export function onState(cb: (s: NativeStateEvent) => void): EventSubscription {
  return emitter.addListener<NativeStateEvent>('onState', cb);
}

export function onVoiceActivity(cb: (v: NativeVoiceEvent) => void): EventSubscription {
  return emitter.addListener<NativeVoiceEvent>('onVoiceActivity', cb);
}

export function onVoiceFrame(cb: (f: NativeVoiceFrame) => void): EventSubscription {
  return emitter.addListener<NativeVoiceFrame>('onVoiceFrame', cb);
}

export type {
  NativePeer,
  NativeMessageEvent,
  NativeStateEvent,
  NativeVoiceEvent,
  NativeVoiceFrame,
  EchoMeshStartOptions,
} from './EchoMesh.types';
