import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
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
  active: boolean;
  tint?: string;
  bars?: number;
  height?: number;
}

export function EqualizerBars({
  active,
  tint = color.signal,
  bars = 5,
  height = 18,
}: Props): React.JSX.Element {
  return (
    <View style={[styles.row, { height }]}>
      {Array.from({ length: bars }).map((_, i) => (
        <Bar key={i} index={i} active={active} tint={tint} height={height} />
      ))}
    </View>
  );
}

function Bar({
  index,
  active,
  tint,
  height,
}: {
  index: number;
  active: boolean;
  tint: string;
  height: number;
}): React.JSX.Element {
  const v = useSharedValue(0.25);
  useEffect(() => {
    if (!active) {
      cancelAnimation(v);
      v.value = withTiming(0.18, { duration: 250 });
      return;
    }
    const duration = 320 + (index % 3) * 110;
    v.value = withRepeat(
      withTiming(1, { duration, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
    return () => cancelAnimation(v);
  }, [active, index, v]);

  const aStyle = useAnimatedStyle(() => ({
    height: Math.max(2, v.value * height),
    backgroundColor: tint,
    opacity: active ? 1 : 0.4,
  }));

  return <Animated.View style={[styles.bar, aStyle]} />;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
  },
  bar: {
    width: 3,
    borderRadius: 2,
  },
});
