import { useEffect } from 'react';
import { create } from 'zustand';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { mockTransport, selfName, selfSenderId } from './MockTransport';
import type { MeshTransport } from './MeshTransport';
import type {
  EchoMessage,
  Group,
  MeshState,
  Mode,
  Peer,
  VoiceActivity,
} from './types';
import {
  hydrateGroup,
  initStoreAndForward,
  onPeersChanged,
  persistMessage,
} from './storeAndForward';

/**
 * Transport selection.
 *
 * - Expo Go (StoreClient) cannot load native modules → MockTransport.
 * - Dev client / standalone (Bare, Standalone) → NativeTransport.
 *
 * Forcing the mock during a dev-client build is occasionally useful (UI work
 * without devices nearby); set `EXPO_PUBLIC_FORCE_MOCK_MESH=1` in `.env` to
 * opt in. `EXPO_PUBLIC_*` is the only env scheme Expo Router exposes to JS.
 */
function pickTransport(): MeshTransport {
  const forceMock = process.env['EXPO_PUBLIC_FORCE_MOCK_MESH'] === '1';
  const env = Constants.executionEnvironment;
  const isExpoGo = env === ExecutionEnvironment.StoreClient;
  if (forceMock || isExpoGo) return mockTransport;

  try {
    // Lazy require — keeps Expo Go bundles clean of native imports.
    const mod = require('./NativeTransport') as typeof import('./NativeTransport');
    return new mod.NativeTransport({ senderId: selfSenderId(), name: selfName() });
  } catch (e) {
    if (__DEV__) {
      console.warn('[echo] NativeTransport unavailable, falling back to mock:', e);
    }
    return mockTransport;
  }
}

const transport: MeshTransport = pickTransport();

const INITIAL_GROUPS: Group[] = [
  { id: 'main', name: 'ANNAPURNA CIRCUIT', code: 'ANP-7Q', peerCount: 4 },
  { id: 'ride', name: 'KTM → POKHARA', code: 'KTM-3F', peerCount: 2 },
  { id: 'camp', name: 'BASE CAMP', code: 'BC-91', peerCount: 0 },
];

interface MeshStore {
  state: MeshState;
  peers: Peer[];
  voice: VoiceActivity;
  messages: EchoMessage[];
  groups: Group[];
  activeGroupId: string;

  // actions
  setMode: (m: Mode) => void;
  sendText: (body: string) => void;
  startVoice: () => void;
  stopVoice: () => void;
  triggerSOS: () => void;
  switchGroup: (groupId: string) => void;
  joinByCode: (code: string) => void;
}

export const useMesh = create<MeshStore>((set, get) => ({
  state: { conn: 'offline', peerCount: 0, hops: 0, selfRole: 'relay', mode: 'trek' },
  peers: [],
  voice: { active: false },
  messages: [],
  groups: INITIAL_GROUPS,
  activeGroupId: 'main',

  setMode: (mode) => {
    set((s) => ({ state: { ...s.state, mode } }));
  },

  sendText: (body) => {
    const trimmed = body.trim();
    if (!trimmed) return;
    transport.sendText(get().activeGroupId, trimmed);
  },

  startVoice: () => {
    transport.startVoice(get().activeGroupId);
  },

  stopVoice: () => {
    transport.stopVoice(get().activeGroupId);
  },

  triggerSOS: () => {
    transport.triggerSOS(get().activeGroupId);
  },

  switchGroup: (groupId) => {
    transport.joinGroup(groupId);
    set({ activeGroupId: groupId, messages: hydrateGroup(groupId) });
  },

  joinByCode: (code) => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;
    const existing = get().groups.find((g) => g.code === trimmed);
    if (existing) {
      get().switchGroup(existing.id);
      return;
    }
    const fresh: Group = {
      id: `g_${Date.now().toString(36)}`,
      name: `GROUP ${trimmed}`,
      code: trimmed,
      peerCount: 0,
    };
    set((s) => ({ groups: [...s.groups, fresh] }));
    get().switchGroup(fresh.id);
  },
}));

let started = false;

/** Wires the transport into the store. Mount once at app root. */
export function useMeshBootstrap(): void {
  useEffect(() => {
    if (!started) {
      started = true;
      initStoreAndForward();
      transport.start();
      const initialGroup = useMesh.getState().activeGroupId;
      transport.joinGroup(initialGroup);
      // Hydrate the active group's history before any new events land.
      useMesh.setState({ messages: hydrateGroup(initialGroup) });
    }

    const replayFn = transport.replay?.bind(transport);

    const offPeers = transport.onPeers((peers) => {
      useMesh.setState({ peers });
      if (replayFn) onPeersChanged(peers, async (g, sid, wid, ts, kind, body) => {
        replayFn(g, sid, wid, ts, kind, body);
      });
    });
    const offState = transport.onState((state) => {
      useMesh.setState((prev) => ({ state: { ...state, mode: prev.state.mode } }));
    });
    const offVoice = transport.onVoiceActivity((voice) => {
      useMesh.setState({ voice });
    });
    const offMsg = transport.onMessage((m) => {
      persistMessage(m);
      useMesh.setState((prev) => {
        const idx = prev.messages.findIndex((x) => x.id === m.id);
        if (idx >= 0) {
          const next = prev.messages.slice();
          next[idx] = m;
          return { messages: next };
        }
        return { messages: [...prev.messages, m] };
      });
    });

    return () => {
      offPeers();
      offState();
      offVoice();
      offMsg();
    };
  }, []);
}

export const self = {
  senderId: selfSenderId(),
  name: selfName(),
};
