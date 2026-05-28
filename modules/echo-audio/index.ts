import { LegacyEventEmitter, requireNativeModule, type EventSubscription } from 'expo-modules-core';

import type {
  CapturedFrame,
  IncomingFrame,
  StartCaptureOptions,
  TalkerEvent,
} from './EchoAudio.types';

const Native = requireNativeModule('EchoAudio') as {
  startCapture(opts: StartCaptureOptions): Promise<void>;
  stopCapture(): Promise<void>;
  /** Push a peer's Opus frame into the jitter buffer for playback. */
  pushIncomingFrame(frame: IncomingFrame): Promise<void>;
  /** Drain stats — debug only. */
  getStats(): Promise<{
    capturedFrames: number;
    playedFrames: number;
    droppedFrames: number;
    jitterBufferDepth: number;
  }>;
};

const emitter = new LegacyEventEmitter(Native as unknown as ConstructorParameters<typeof LegacyEventEmitter>[0]);

export function startCapture(opts: StartCaptureOptions): Promise<void> {
  return Native.startCapture(opts);
}

export function stopCapture(): Promise<void> {
  return Native.stopCapture();
}

export function pushIncomingFrame(frame: IncomingFrame): Promise<void> {
  return Native.pushIncomingFrame(frame);
}

export function getStats(): ReturnType<typeof Native.getStats> {
  return Native.getStats();
}

export function onCapturedFrame(cb: (f: CapturedFrame) => void): EventSubscription {
  return emitter.addListener<CapturedFrame>('onCapturedFrame', cb);
}

export function onTalker(cb: (t: TalkerEvent) => void): EventSubscription {
  return emitter.addListener<TalkerEvent>('onTalker', cb);
}

export type {
  CapturedFrame,
  IncomingFrame,
  StartCaptureOptions,
  TalkerEvent,
  VoiceMode,
} from './EchoAudio.types';
