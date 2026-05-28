import { useEffect } from 'react';
import { create } from 'zustand';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { mockTransport } from './MockTransport';
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
import type { Identity } from '../identity/identity';
import { LocationTracker } from '../location/locationTracker';
import { configureNotifications, notifyIncoming } from '../notifications/notifications';

/**
 * Transport selection.
 *
 * - Expo Go (StoreClient) cannot load native modules → MockTransport.
 * - Dev client / standalone (Bare, Standalone) → NativeTransport.
 *
 * Forcing the mock during a dev-client build is occasionally useful (UI work
 * without devices nearby); set `EXPO_PUBLIC_FORCE_MOCK_MESH=1` in `.env` to
 * opt in.
 */
function pickTransport(id: Identity): MeshTransport {
  const forceMock = process.env['EXPO_PUBLIC_FORCE_MOCK_MESH'] === '1';
  const env = Constants.executionEnvironment;
  const isExpoGo = env === ExecutionEnvironment.StoreClient;
  if (forceMock || isExpoGo) return mockTransport;

  try {
    const mod = require('./NativeTransport') as typeof import('./NativeTransport');
    return new mod.NativeTransport({
      senderId: id.senderId,
      name: id.name,
      backendPref: id.backendPref,
    });
  } catch (e) {
    if (__DEV__) {
      console.warn('[echo] NativeTransport unavailable, falling back to mock:', e);
    }
    return mockTransport;
  }
}

let _transport: MeshTransport | null = null;
let _identity: Identity | null = null;

function getTransport(): MeshTransport {
  if (!_transport) {
    // The store should always be initialized via setActiveIdentity before any
    // action is invoked — but if a screen reaches in early, fall back to mock.
    _transport = pickTransport(_identity ?? {
      senderId: '0A', name: 'YOU', modeDefault: 'trek',
      backendPref: 'auto', shareLocation: false, createdAt: 0,
    });
  }
  return _transport;
}

let _locationTracker: LocationTracker | null = null;

export function setActiveIdentity(id: Identity): void {
  _identity = id;
  // Force re-construction next time a transport is needed (e.g. after onboarding).
  _transport = null;
  // Surface the identity into the store so UI code that reads `self` sees it.
  selfRef.senderId = id.senderId;
  selfRef.name = id.name;
  // Reflect the location toggle. Tracker is created lazily once the transport
  // is up; useMeshBootstrap reconciles on every render.
  applyLocationShareSetting(id.shareLocation);
}

function applyLocationShareSetting(shareLocation: boolean): void {
  if (!_transport) return;  // bootstrap will reconcile later
  if (shareLocation) {
    if (!_locationTracker) {
      _locationTracker = new LocationTracker(_transport, () => useMesh.getState().activeGroupId);
    }
    void _locationTracker.start();
  } else {
    _locationTracker?.stop();
  }
}

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
    getTransport().sendText(get().activeGroupId, trimmed);
  },

  startVoice: () => {
    getTransport().startVoice(get().activeGroupId);
  },

  stopVoice: () => {
    getTransport().stopVoice(get().activeGroupId);
  },

  triggerSOS: () => {
    getTransport().triggerSOS(get().activeGroupId);
  },

  switchGroup: (groupId) => {
    const t = getTransport();
    const code = get().groups.find((g) => g.id === groupId)?.code;
    if (code && t.setGroupSecret) t.setGroupSecret(groupId, code);
    t.joinGroup(groupId);
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

/** Wires the transport into the store. Mount once at app root, AFTER identity is loaded. */
export function useMeshBootstrap(): void {
  useEffect(() => {
    const transport = getTransport();

    if (!started) {
      started = true;
      initStoreAndForward();
      void configureNotifications();
      transport.start();
      const s = useMesh.getState();
      // Push every known group's secret to native up front so we can
      // decrypt frames for any group we might be relaying for.
      if (transport.setGroupSecret) {
        for (const g of s.groups) transport.setGroupSecret(g.id, g.code);
      }
      const initialGroup = s.activeGroupId;
      transport.joinGroup(initialGroup);
      useMesh.setState({
        messages: hydrateGroup(initialGroup),
        state: { ...s.state, mode: _identity?.modeDefault ?? 'trek' },
      });
      // Start the location tracker if the identity opted in.
      if (_identity?.shareLocation) {
        _locationTracker = new LocationTracker(transport, () => useMesh.getState().activeGroupId);
        void _locationTracker.start();
      }
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
      void notifyIncoming(m);
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

const selfRef = { senderId: '0A', name: 'YOU' };
export const self = selfRef;
