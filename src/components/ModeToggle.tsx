import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { color, font, radius, space } from '../theme/tokens';
import type { Mode } from '../mesh/types';

interface Props {
  mode: Mode;
  onChange: (m: Mode) => void;
}

export function ModeToggle({ mode, onChange }: Props): React.JSX.Element {
  return (
    <View style={styles.wrap}>
      <Segment label="TREK" active={mode === 'trek'} onPress={() => { onChange('trek'); Haptics.selectionAsync(); }} />
      <Segment label="RIDE" active={mode === 'ride'} onPress={() => { onChange('ride'); Haptics.selectionAsync(); }} />
    </View>
  );
}

function Segment({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}): React.JSX.Element {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.seg, active && styles.segActive]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.segLabel, active && styles.segLabelActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    backgroundColor: color.surface,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.hairline,
    padding: 3,
    alignSelf: 'flex-start',
  },
  seg: {
    paddingVertical: space.s - 2,
    paddingHorizontal: space.m,
    borderRadius: radius.pill,
  },
  segActive: {
    backgroundColor: color.signal,
  },
  segLabel: {
    fontFamily: font.display,
    fontSize: 12,
    letterSpacing: 1.4,
    color: color.tx2,
  },
  segLabelActive: {
    color: color.txOn,
  },
});
