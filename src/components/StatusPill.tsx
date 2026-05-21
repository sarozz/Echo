import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { color, font, radius, space } from '../theme/tokens';

type Tone = 'signal' | 'warn' | 'sos' | 'mute' | 'ok';

interface Props {
  label: string;
  tone?: Tone;
}

const TONE: Record<Tone, { bg: string; fg: string; border: string }> = {
  signal: { bg: 'rgba(0,230,199,0.10)', fg: color.signal,  border: color.signal3 },
  ok:     { bg: 'rgba(57,217,138,0.10)', fg: color.ok,      border: 'rgba(57,217,138,0.45)' },
  warn:   { bg: 'rgba(255,176,32,0.10)', fg: color.warn,    border: 'rgba(255,176,32,0.45)' },
  sos:    { bg: 'rgba(255,68,56,0.12)',  fg: color.sos,     border: color.sos2 },
  mute:   { bg: color.surface2,          fg: color.tx2,     border: color.hairline },
};

export function StatusPill({ label, tone = 'mute' }: Props): React.JSX.Element {
  const t = TONE[tone];
  return (
    <View style={[styles.pill, { backgroundColor: t.bg, borderColor: t.border }]}>
      <Text style={[styles.text, { color: t.fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: space.s,
    paddingVertical: 3,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  text: {
    fontFamily: font.mono,
    fontSize: 10,
    letterSpacing: 0.6,
  },
});
