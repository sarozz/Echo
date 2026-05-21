import { EventEmitter, requireNativeModule, Subscription } from 'expo-modules-core';

import type {
  EchoMeshEvents,
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
  getCurrentPeers(): Promise<NativePeer[]>;
};

const emitter = new EventEmitter(Native as unknown as ConstructorParameters<typeof EventEmitter>[0]);

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

export function getCurrentPeers(): Promise<NativePeer[]> {
  return Native.getCurrentPeers();
}

export function onPeers(cb: (peers: NativePeer[]) => void): Subscription {
  return emitter.addListener<EchoMeshEvents['onPeers']>('onPeers', (e) => cb(e.peers));
}

export function onMessage(cb: (m: NativeMessageEvent) => void): Subscription {
  return emitter.addListener<NativeMessageEvent>('onMessage', cb);
}

export function onState(cb: (s: NativeStateEvent) => void): Subscription {
  return emitter.addListener<NativeStateEvent>('onState', cb);
}

export function onVoiceActivity(cb: (v: NativeVoiceEvent) => void): Subscription {
  return emitter.addListener<NativeVoiceEvent>('onVoiceActivity', cb);
}

export function onVoiceFrame(cb: (f: NativeVoiceFrame) => void): Subscription {
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
