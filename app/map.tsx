import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';
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

export default function MapScreen(): React.JSX.Element {
  const peers = useMesh((s) => s.peers);
  useLocale();

  const positions = useMemo(
    () => peers.map((p, i) => ({ peer: p, ...hashPos(p.senderId, i) })),
    [peers],
  );

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

          <Circle cx={W / 2} cy={H / 2} r={9} fill={color.signal} stroke={color.bg} strokeWidth={2} />
          <Circle cx={W / 2} cy={H / 2} r={18} fill="none" stroke={color.signal} strokeOpacity={0.5} />
          <Circle cx={W / 2} cy={H / 2} r={34} fill="none" stroke={color.signal} strokeOpacity={0.25} />
          <SvgText
            x={W / 2}
            y={H / 2 + 30}
            fontFamily="monospace"
            fontSize={10}
            fill={color.signal}
            textAnchor="middle"
          >
            {`YOU · #${self.senderId}`}
          </SvgText>

          {positions.map(({ peer, x, y }) => (
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
