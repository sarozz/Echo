import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { color, font, radius, space } from '../theme/tokens';
import type { ConnState } from '../mesh/types';

interface Props {
  conn: ConnState;
  peerCount: number;
  hops: number;
}

export function ConnectionBar({ conn, peerCount, hops }: Props): React.JSX.Element {
  const connected = conn === 'connected' || conn === 'leaf';
  const tint =
    conn === 'connected' ? color.signal :
    conn === 'leaf'      ? color.warn :
    conn === 'discovering' ? color.warn :
                           color.tx3;

  const label =
    conn === 'connected'   ? `CONNECTED · ${peerCount} PEERS · ${hops} HOPS · RELAY` :
    conn === 'leaf'        ? `LEAF · ${peerCount} PEERS · ${hops} HOPS` :
    conn === 'discovering' ? 'SCANNING FOR PEERS…' :
                             'OFFLINE · NO MESH';

  return (
    <View style={styles.row}>
      <Pulse tint={tint} active={connected || conn === 'discovering'} />
      <Text style={[styles.label, { color: tint }]} numberOfLines={1}>
        {label}
      </Text>
      <View style={styles.spacer} />
      <HopBars hops={hops} tint={tint} active={connected} />
    </View>
  );
}

function Pulse({ tint, active }: { tint: string; active: boolean }): React.JSX.Element {
  const v = useSharedValue(0);
  useEffect(() => {
    if (!active) {
      cancelAnimation(v);
      v.value = 0;
      return;
    }
    v.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.quad) }), -1, true);
    return () => cancelAnimation(v);
  }, [active, v]);

  const ring = useAnimatedStyle(() => ({
    opacity: 0.15 + v.value * 0.55,
    transform: [{ scale: 1 + v.value * 1.5 }],
    borderColor: tint,
  }));

  return (
    <View style={styles.pulseWrap}>
      <Animated.View style={[styles.pulseRing, ring]} />
      <View style={[styles.pulseDot, { backgroundColor: tint, shadowColor: tint }]} />
    </View>
  );
}

function HopBars({ hops, tint, active }: { hops: number; tint: string; active: boolean }): React.JSX.Element {
  const bars = 4;
  return (
    <View style={styles.hopBars}>
      {Array.from({ length: bars }).map((_, i) => {
        const filled = active && hops >= i + 1;
        return (
          <View
            key={i}
            style={[
              styles.hopBar,
              { height: 4 + i * 3, backgroundColor: filled ? tint : color.hairline2 },
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.m,
    paddingVertical: space.s,
    backgroundColor: color.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: color.hairline,
    gap: space.s,
  },
  pulseWrap: {
    width: 14,
    height: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseRing: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  pulseDot: {
    width: 7,
    height: 7,
    borderRadius: 7,
    shadowOpacity: 0.9,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  label: {
    fontFamily: font.mono,
    fontSize: 11,
    letterSpacing: 0.7,
    flexShrink: 1,
  },
  spacer: { flex: 1 },
  hopBars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
    height: 14,
  },
  hopBar: {
    width: 3,
    borderRadius: 1.5,
  },
});
