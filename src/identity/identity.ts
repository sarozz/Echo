import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * The local user's identity. Persisted on first onboarding completion and
 * read on every app launch. The sender id is a 2-char ASCII label that goes
 * over the wire in every Frame — keep it short, uppercase, easy to read in
 * a compact mono badge.
 */
export interface Identity {
  senderId: string;   // exactly 2 ASCII uppercase chars
  name: string;       // display name, UPPERCASE for the field-instrument look
  modeDefault: 'trek' | 'ride';
  backendPref: 'auto' | 'nearby' | 'multipeer' | 'ble';
  /** Opt-in: broadcast GPS coords to the group via encrypted LOCATION_ADV. */
  shareLocation: boolean;
  createdAt: number;
}

const KEY = 'echo.identity';

const DEFAULT: Identity = {
  senderId: '0A',
  name: 'YOU',
  modeDefault: 'trek',
  backendPref: 'auto',
  shareLocation: false,
  createdAt: 0,
};

let cached: Identity | null = null;

export async function loadIdentity(): Promise<Identity | null> {
  if (cached) return cached;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Identity>;
    const id = sanitize({ ...DEFAULT, ...parsed });
    cached = id;
    return id;
  } catch {
    return null;
  }
}

export async function saveIdentity(next: Partial<Identity>): Promise<Identity> {
  const merged = sanitize({ ...(cached ?? DEFAULT), ...next });
  if (!merged.createdAt) merged.createdAt = Date.now();
  await AsyncStorage.setItem(KEY, JSON.stringify(merged));
  cached = merged;
  return merged;
}

export function snapshot(): Identity {
  return cached ?? DEFAULT;
}

export function suggestSenderId(name: string): string {
  const upper = name.replace(/[^a-zA-Z]/g, '').toUpperCase();
  if (upper.length === 0) return '0A';
  if (upper.length === 1) return (upper + 'X').slice(0, 2);
  return upper.slice(0, 2);
}

function sanitize(id: Identity): Identity {
  const sid = id.senderId.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 2).padEnd(2, 'X');
  return {
    senderId: sid,
    name: id.name.trim().slice(0, 24) || 'YOU',
    modeDefault: id.modeDefault === 'ride' ? 'ride' : 'trek',
    backendPref:
      id.backendPref === 'nearby' || id.backendPref === 'multipeer' || id.backendPref === 'ble'
        ? id.backendPref : 'auto',
    shareLocation: id.shareLocation === true,
    createdAt: id.createdAt,
  };
}
