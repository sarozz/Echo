import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { color, font, radius, space } from '../theme/tokens';
import { RippleMark } from './RippleMark';
import { EqualizerBars } from './EqualizerBars';
import type { VoiceActivity } from '../mesh/types';
import { t, useLocale } from '../i18n/strings';

interface PTTProps {
  variant: 'ptt';
  onStart: () => void;
  onStop: () => void;
  voice: VoiceActivity;
}
interface VOXProps {
  variant: 'vox';
  active: boolean;
  onToggle: () => void;
  voice: VoiceActivity;
}
type Props = PTTProps | VOXProps;

export function VoiceButton(props: Props): React.JSX.Element {
  if (props.variant === 'ptt') return <PTT {...props} />;
  return <VOX {...props} />;
}

function PTT({ onStart, onStop, voice }: PTTProps): React.JSX.Element {
  const [pressed, setPressed] = React.useState(false);
  useLocale();
  const remoteTalking = voice.active && voice.talkerName && voice.talkerName !== 'YOU';

  return (
    <View style={styles.pttWrap}>
      <Pressable
        onPressIn={() => {
          setPressed(true);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          onStart();
        }}
        onPressOut={() => {
          setPressed(false);
          Haptics.selectionAsync();
          onStop();
        }}
        style={({ pressed: p }) => [
          styles.pttBtn,
          (p || pressed) && styles.pttBtnActive,
        ]}
        accessibilityRole="button"
        accessibilityLabel={t('voice.ptt.hold')}
      >
        <View style={StyleSheet.absoluteFill}>
          <View style={styles.ripplePos}>
            <RippleMark size={170} active={pressed} rings={3} />
          </View>
        </View>
        <Text style={[styles.pttLabel, (pressed) && styles.pttLabelActive]}>
          {pressed ? t('voice.ptt.transmitting') : t('voice.ptt.hold')}
        </Text>
        <Text style={styles.pttSub}>
          {pressed
            ? t('voice.ptt.release')
            : remoteTalking
              ? `${voice.talkerName} ${t('voice.remote.talking')}`
              : t('voice.ptt.label')}
        </Text>
      </Pressable>
      {remoteTalking && !pressed && (
        <View style={styles.remoteRow}>
          <EqualizerBars active tint={color.signal} />
          <Text style={styles.remoteText}>{voice.talkerName}</Text>
        </View>
      )}
    </View>
  );
}

function VOX({ active, onToggle, voice }: VOXProps): React.JSX.Element {
  useLocale();
  const remoteTalking = voice.active && voice.talkerName && voice.talkerName !== 'YOU';
  return (
    <View style={styles.voxWrap}>
      <Pressable
        onPress={() => {
          onToggle();
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        }}
        style={[styles.voxBtn, active && styles.voxBtnActive]}
        accessibilityRole="switch"
        accessibilityState={{ checked: active }}
        accessibilityLabel={active ? t('voice.vox.on') : t('voice.vox.off')}
      >
        <View style={styles.voxLeft}>
          <Text style={[styles.voxLabel, active && styles.voxLabelActive]}>
            {active ? t('voice.vox.on') : t('voice.vox.off')}
          </Text>
          <Text style={styles.voxSub}>{t('voice.vox.sub')}</Text>
        </View>
        <View style={styles.voxRight}>
          <EqualizerBars active={!!(active && (voice.active || remoteTalking))} tint={active ? color.signal : color.tx3} height={22} />
        </View>
      </Pressable>
      {remoteTalking && (
        <Text style={styles.remoteText}>{voice.talkerName} {t('voice.remote.talking')}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  pttWrap: { alignItems: 'center', gap: space.s },
  pttBtn: {
    width: 168,
    height: 168,
    borderRadius: 168,
    backgroundColor: color.surface,
    borderWidth: 2,
    borderColor: color.signal3,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  pttBtnActive: {
    backgroundColor: color.signal,
    borderColor: color.signal,
  },
  ripplePos: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pttLabel: {
    fontFamily: font.displayHeavy,
    color: color.signal,
    fontSize: 18,
    letterSpacing: 2,
  },
  pttLabelActive: {
    color: color.txOn,
  },
  pttSub: {
    fontFamily: font.mono,
    color: color.tx3,
    fontSize: 10,
    letterSpacing: 0.7,
    marginTop: 4,
  },
  remoteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s,
  },
  remoteText: {
    fontFamily: font.mono,
    color: color.signal,
    fontSize: 11,
    letterSpacing: 0.7,
  },
  voxWrap: { gap: space.s, width: '100%' },
  voxBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.hairline,
    borderRadius: radius.card,
    padding: space.m,
    gap: space.m,
  },
  voxBtnActive: {
    borderColor: color.signal,
    backgroundColor: 'rgba(0,230,199,0.06)',
  },
  voxLeft: { flex: 1 },
  voxLabel: {
    fontFamily: font.displayHeavy,
    fontSize: 22,
    letterSpacing: 2,
    color: color.tx2,
  },
  voxLabelActive: {
    color: color.signal,
  },
  voxSub: {
    fontFamily: font.mono,
    fontSize: 10,
    color: color.tx3,
    letterSpacing: 0.6,
    marginTop: 2,
  },
  voxRight: {
    alignItems: 'flex-end',
  },
});
