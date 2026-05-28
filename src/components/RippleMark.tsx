import React, { useEffect } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { color } from '../theme/tokens';

interface Props {
  size?: number;
  active?: boolean;
  tint?: string;
  /** How many concentric ripples (default 3). */
  rings?: number;
}

export function RippleMark({
  size = 96,
  active = true,
  tint = color.signal,
  rings = 3,
}: Props): React.JSX.Element {
  const [reduce, setReduce] = React.useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (mounted) setReduce(v);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => setReduce(v));
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  const animate = active && !reduce;

  return (
    <View style={[styles.wrap, { width: size, height: size }]} pointerEvents="none">
      {Array.from({ length: rings }).map((_, i) => (
        <Ring key={i} index={i} count={rings} tint={tint} animate={animate} size={size} />
      ))}
      <View
        style={[
          styles.core,
          {
            backgroundColor: tint,
            width: size * 0.18,
            height: size * 0.18,
            borderRadius: size,
            shadowColor: tint,
          },
        ]}
      />
    </View>
  );
}

function Ring({
  index,
  count,
  tint,
  animate,
  size,
}: {
  index: number;
  count: number;
  tint: string;
  animate: boolean;
  size: number;
}): React.JSX.Element {
  const progress = useSharedValue(0);

  useEffect(() => {
    if (!animate) {
      cancelAnimation(progress);
      progress.value = 0.6;
      return;
    }
    progress.value = 0;
    progress.value = withRepeat(
      withTiming(1, { duration: 2400, easing: Easing.out(Easing.cubic) }),
      -1,
      false,
    );
    return () => cancelAnimation(progress);
  }, [animate, progress]);

  const delay = (index / count) * 2400;

  const aStyle = useAnimatedStyle(() => {
    const p = (progress.value + index / count) % 1;
    const scale = 0.25 + p * 0.95;
    const opacity = (1 - p) * 0.55;
    return {
      transform: [{ scale }],
      opacity: animate ? opacity : 0.25,
      borderColor: tint,
    };
  }, [animate, tint]);

  // delay is encoded via index offset; var unused but kept for readability
  void delay;

  return (
    <Animated.View
      style={[
        styles.ring,
        { width: size, height: size, borderRadius: size, borderColor: tint },
        aStyle,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    borderWidth: 1.5,
  },
  core: {
    shadowOpacity: 0.9,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
  },
});
