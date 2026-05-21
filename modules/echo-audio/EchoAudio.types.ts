/**
 * EchoAudio — JS↔native voice pipeline contract.
 *
 * Frames are pre-encoded (Opus, ~20ms) by the time they cross the bridge.
 * The transport module is responsible for delivering them to peers; this
 * module is responsible for produce/consume on each device.
 */

export type VoiceMode = 'ptt' | 'vox';

export interface StartCaptureOptions {
  mode: VoiceMode;
  /** RMS energy threshold (0..1). Only applied in VOX mode. */
  vadThreshold?: number;
  /** Sample rate hint. Defaults to 16000 (Opus voice band). */
  sampleRateHz?: number;
}

export interface CapturedFrame {
  /** Opus-encoded payload, base64. */
  data: string;
  /** Native millisecond timestamp at frame end. */
  ts: number;
  /** Frame duration in ms (typically 20). */
  durationMs: number;
  /** True if VAD believes voice is present in this frame. */
  voiced: boolean;
}

export interface IncomingFrame {
  senderId: string;
  /** Opus-encoded payload, base64. */
  data: string;
  ts: number;
  durationMs: number;
}

export interface TalkerEvent {
  active: boolean;
  senderId?: string;
}

export type EchoAudioEvents = {
  /** Emitted ~50Hz while capture is active. */
  onCapturedFrame: CapturedFrame;
  /** Mirror of local VAD state, debounced — for UI only. */
  onTalker: TalkerEvent;
};
