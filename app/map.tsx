import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';
import * as Location from 'expo-location';
import { color, font, radius, space } from '../src/theme/tokens';
import { useMesh, self } from '../src/mesh/useMesh';
import { MapMarker } from '../src/components/MapMarker';
import type { Peer } from '../src/mesh/types';
import { t, useLocale } from '../src/i18n/strings';

const W = 360;
const H = 480;

function contour(seed: number, baseY: number): string {
  let d = `M 0 ${baseY}`;
  for (let x = 0; x <= W; x += 24) {
    const y = baseY + Math.sin((x + seed * 47) / 38) * (12 + seed) + Math.cos((x + seed * 13) / 64) * 8;
    d += ` L ${x} ${y.toFixed(1)}`;
  }
  d += ` L ${W} ${baseY + 200} L 0 ${baseY + 200} Z`;
  return d;
}

function hashPos(seed: string, idx: number): { x: number; y: number } {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const x = 60 + ((h ^ (idx * 991)) % (W - 120));
  const y = 90 + (((h >>> 8) ^ (idx * 547)) % (H - 200));
  return { x, y };
}

interface SelfCoords { lat: number; lon: number }

/** Computes a viewport that contains every point with comfortable padding. */
function viewport(points: Array<{ lat: number; lon: number }>): { minLat: number; maxLat: number; minLon: number; maxLon: number } | null {
  if (points.length === 0) return null;
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
  for (const p of points) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lon < minLon) minLon = p.lon;
    if (p.lon > maxLon) maxLon = p.lon;
  }
  // Add ~10% padding plus a minimum span so a single point isn't a single pixel.
  const latPad = Math.max(0.001, (maxLat - minLat) * 0.1);
  const lonPad = Math.max(0.001, (maxLon - minLon) * 0.1);
  return { minLat: minLat - latPad, maxLat: maxLat + latPad, minLon: minLon - lonPad, maxLon: maxLon + lonPad };
}

function project(lat: number, lon: number, vp: { minLat: number; maxLat: number; minLon: number; maxLon: number }): { x: number; y: number } {
  const fx = (lon - vp.minLon) / (vp.maxLon - vp.minLon || 1);
  // y flips: higher latitude = top of screen.
  const fy = 1 - (lat - vp.minLat) / (vp.maxLat - vp.minLat || 1);
  return { x: fx * (W - 80) + 40, y: fy * (H - 200) + 80 };
}

export default function MapScreen(): React.JSX.Element {
  const peers = useMesh((s) => s.peers);
  useLocale();

  const [selfPos, setSelfPos] = useState<SelfCoords | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status === Location.PermissionStatus.GRANTED) {
        const last = await Location.getLastKnownPositionAsync();
        if (last && !cancelled) {
          setSelfPos({ lat: last.coords.latitude, lon: last.coords.longitude });
        }
      }
    })().catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  const positions = useMemo(() => {
    // Use real coords when both self and at least one peer have them, otherwise
    // fall back to the deterministic hashed layout from earlier stages.
    const realPeers = peers.filter((p): p is Peer & { lat: number; lon: number } =>
      typeof p.lat === 'number' && typeof p.lon === 'number',
    );
    if (selfPos && realPeers.length > 0) {
      const allPoints: Array<{ lat: number; lon: number }> = [selfPos, ...realPeers];
      const vp = viewport(allPoints);
      if (vp) {
        return {
          self: project(selfPos.lat, selfPos.lon, vp),
          peers: realPeers.map((p) => ({ peer: p, ...project(p.lat, p.lon, vp) })),
          // Peers without coords get hashed positions appended so they still show.
          stragglers: peers
            .filter((p) => p.lat === undefined || p.lon === undefined)
            .map((p, i) => ({ peer: p, ...hashPos(p.senderId, i) })),
          mode: 'real' as const,
        };
      }
    }
    return {
      self: { x: W / 2, y: H / 2 },
      peers: [] as Array<{ peer: Peer; x: number; y: number }>,
      stragglers: peers.map((p, i) => ({ peer: p, ...hashPos(p.senderId, i) })),
      mode: 'fallback' as const,
    };
  }, [peers, selfPos]);

  const sosPeer = peers.find((p: Peer) => p.sos);

  return (
    <SafeAreaView style={styles.root} edges={['bottom']}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{t('map.title')}</Text>
          <Text style={styles.sub}>{t('map.sub')}</Text>
        </View>
        {sosPeer && (
          <View style={styles.sosBadge}>
            <Text style={styles.sosBadgeText}>! SOS · {sosPeer.name}</Text>
          </View>
        )}
      </View>

      <View style={styles.canvasWrap}>
        <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice">
          <Defs>
            <LinearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={color.bg2} />
              <Stop offset="1" stopColor={color.bg} />
            </LinearGradient>
          </Defs>
          <Rect x={0} y={0} width={W} height={H} fill="url(#bg)" />

          <G opacity={0.35}>
            {Array.from({ length: 9 }).map((_, i) => (
              <Line
                key={`v${i}`}
                x1={(W / 9) * i}
                y1={0}
                x2={(W / 9) * i}
                y2={H}
                stroke={color.hairline}
                strokeWidth={0.5}
              />
            ))}
            {Array.from({ length: 12 }).map((_, i) => (
              <Line
                key={`h${i}`}
                x1={0}
                y1={(H / 12) * i}
                x2={W}
                y2={(H / 12) * i}
                stroke={color.hairline}
                strokeWidth={0.5}
              />
            ))}
          </G>

          {[0, 1, 2, 3, 4].map((i) => (
            <Path
              key={`c${i}`}
              d={contour(i + 1, 90 + i * 60)}
              stroke={color.signal3}
              strokeOpacity={0.35 - i * 0.04}
              fill="none"
              strokeWidth={1}
            />
          ))}

          <Circle cx={positions.self.x} cy={positions.self.y} r={9} fill={color.signal} stroke={color.bg} strokeWidth={2} />
          <Circle cx={positions.self.x} cy={positions.self.y} r={18} fill="none" stroke={color.signal} strokeOpacity={0.5} />
          <Circle cx={positions.self.x} cy={positions.self.y} r={34} fill="none" stroke={color.signal} strokeOpacity={0.25} />
          <SvgText
            x={positions.self.x}
            y={positions.self.y + 30}
            fontFamily="monospace"
            fontSize={10}
            fill={color.signal}
            textAnchor="middle"
          >
            {`YOU · #${self.senderId}`}
          </SvgText>

          {positions.peers.map(({ peer, x, y }) => (
            <MapMarker key={peer.senderId} peer={peer} cx={x} cy={y} />
          ))}
          {positions.stragglers.map(({ peer, x, y }) => (
            <MapMarker key={peer.senderId} peer={peer} cx={x} cy={y} />
          ))}
        </Svg>

        <View style={styles.legend}>
          <Legend dot={color.android} label="ANDROID" />
          <Legend dot={color.ios} label="IOS" />
          <Legend dot={color.signal} label="YOU" />
          <Legend dot={color.sos} label="SOS" />
        </View>
      </View>
    </SafeAreaView>
  );
}

function Legend({ dot, label }: { dot: string; label: string }): React.JSX.Element {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: dot }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  header: {
    paddingHorizontal: space.m,
    paddingTop: space.s,
    paddingBottom: space.m,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s,
    borderBottomWidth: 1,
    borderBottomColor: color.hairline,
  },
  title: {
    fontFamily: font.displayHeavy,
    fontSize: 20,
    letterSpacing: 2,
    color: color.tx,
  },
  sub: {
    fontFamily: font.mono,
    fontSize: 10,
    color: color.tx3,
    letterSpacing: 0.7,
    marginTop: 3,
  },
  sosBadge: {
    paddingHorizontal: space.s,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,68,56,0.12)',
    borderWidth: 1,
    borderColor: color.sos,
  },
  sosBadgeText: {
    fontFamily: font.mono,
    fontSize: 10,
    color: color.sos,
    letterSpacing: 0.6,
  },
  canvasWrap: {
    flex: 1,
    margin: space.m,
    borderRadius: radius.panel,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: color.hairline,
    backgroundColor: color.bg2,
  },
  legend: {
    position: 'absolute',
    bottom: space.s,
    left: space.s,
    right: space.s,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.s,
    padding: space.s,
    backgroundColor: 'rgba(8,11,12,0.7)',
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: color.hairline,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 8,
  },
  legendText: {
    fontFamily: font.mono,
    fontSize: 10,
    color: color.tx2,
    letterSpacing: 0.6,
  },
});
