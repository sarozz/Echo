import * as Location from 'expo-location';
import type { MeshTransport } from '../mesh/MeshTransport';

/**
 * Asks for foreground location permission, starts a watchPositionAsync
 * subscription, and broadcasts the device's coords to the active group as
 * an encrypted LOCATION_ADV frame on every update (rate-limited).
 *
 * Stop() removes the subscription. The caller is expected to gate this on
 * the user's `shareLocation` opt-in.
 */
export class LocationTracker {
  private sub: Location.LocationSubscription | null = null;
  private lastSentTs = 0;
  private lastLat: number | null = null;
  private lastLon: number | null = null;

  private getActiveGroupId: () => string;
  private transport: MeshTransport;

  constructor(transport: MeshTransport, getActiveGroupId: () => string) {
    this.transport = transport;
    this.getActiveGroupId = getActiveGroupId;
  }

  async start(): Promise<boolean> {
    if (this.sub) return true;
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== Location.PermissionStatus.GRANTED) return false;

    this.sub = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.Balanced,  // ~10-30m, kinder on battery
        distanceInterval: 25,                  // meters between updates
        timeInterval: 30_000,                  // or every 30s, whichever first
      },
      (pos) => this.handleUpdate(pos),
    );
    return true;
  }

  stop(): void {
    this.sub?.remove();
    this.sub = null;
    this.lastSentTs = 0;
    this.lastLat = null;
    this.lastLon = null;
  }

  isRunning(): boolean {
    return this.sub !== null;
  }

  private handleUpdate(pos: Location.LocationObject): void {
    const { latitude, longitude, accuracy } = pos.coords;
    const now = Date.now();

    // Throttle: don't send more often than every 20s and require ≥15m of movement.
    if (this.lastSentTs > 0 && now - this.lastSentTs < 20_000) {
      if (this.lastLat !== null && this.lastLon !== null) {
        if (haversineMeters(latitude, longitude, this.lastLat, this.lastLon) < 15) return;
      }
    }
    this.lastSentTs = now;
    this.lastLat = latitude;
    this.lastLon = longitude;

    const group = this.getActiveGroupId();
    if (this.transport.broadcastLocation) {
      this.transport.broadcastLocation(group, latitude, longitude, accuracy ?? 0);
    }
  }
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000;
  const toRad = (d: number): number => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
