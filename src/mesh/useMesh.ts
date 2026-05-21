import { useEffect } from 'react';
import { create } from 'zustand';
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

// STAGE 2: swap `mockTransport` for the native transport instance.
const transport: MeshTransport = mockTransport;

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
    set({ activeGroupId: groupId, messages: [] });
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
      transport.start();
      transport.joinGroup(useMesh.getState().activeGroupId);
    }

    const offPeers = transport.onPeers((peers) => {
      useMesh.setState({ peers });
    });
    const offState = transport.onState((state) => {
      useMesh.setState((prev) => ({ state: { ...state, mode: prev.state.mode } }));
    });
    const offVoice = transport.onVoiceActivity((voice) => {
      useMesh.setState({ voice });
    });
    const offMsg = transport.onMessage((m) => {
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
