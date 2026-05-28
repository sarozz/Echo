import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { color, font, radius, space } from '../src/theme/tokens';
import { RippleMark } from '../src/components/RippleMark';
import { saveIdentity, suggestSenderId, type Identity } from '../src/identity/identity';
import { setActiveIdentity } from '../src/mesh/useMesh';
import { LOCALES, t, useLocale, setLocale, type Locale } from '../src/i18n/strings';

type Step = 'welcome' | 'language' | 'name' | 'id' | 'mode' | 'privacy';
const ORDER: Step[] = ['welcome', 'language', 'name', 'id', 'mode', 'privacy'];

export default function OnboardingScreen(): React.JSX.Element {
  const [step, setStep] = useState<Step>('welcome');
  const [name, setName] = useState('');
  const [senderId, setSenderId] = useState('');
  const [mode, setMode] = useState<'trek' | 'ride'>('trek');
  useLocale();

  useEffect(() => {
    if (!senderId && name) setSenderId(suggestSenderId(name));
  }, [name, senderId]);

  const goNext = (): void => {
    const i = ORDER.indexOf(step);
    if (i < ORDER.length - 1) {
      const next = ORDER[i + 1];
      if (next !== undefined) {
        setStep(next);
        Haptics.selectionAsync();
      }
    }
  };
  const goBack = (): void => {
    const i = ORDER.indexOf(step);
    if (i > 0) {
      const prev = ORDER[i - 1];
      if (prev !== undefined) setStep(prev);
    }
  };

  const finish = async (): Promise<void> => {
    const id: Partial<Identity> = {
      name: name.trim() || 'YOU',
      senderId: senderId.trim() || suggestSenderId(name),
      modeDefault: mode,
      backendPref: 'auto',
    };
    const saved = await saveIdentity(id);
    setActiveIdentity(saved);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.replace('/');
  };

  return (
    <SafeAreaView style={styles.root}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.brand}>
            <RippleMark size={120} active rings={3} />
            <Text style={styles.brandText}>ECHO</Text>
          </View>

          {step === 'welcome' && (
            <Card title={t('onb.welcome.title')} body={t('onb.welcome.body')}>
              <PrimaryButton label={t('onb.welcome.cta')} onPress={goNext} />
            </Card>
          )}

          {step === 'language' && (
            <Card title={t('settings.language')} body="">
              <LanguagePicker />
              <NavRow onBack={goBack} onNext={goNext} />
            </Card>
          )}

          {step === 'name' && (
            <Card title={t('onb.name.title')} body={t('onb.name.body')}>
              <TextInput
                value={name}
                onChangeText={(v) => setName(v.toUpperCase())}
                placeholder={t('onb.name.placeholder')}
                placeholderTextColor={color.tx3}
                style={styles.input}
                maxLength={24}
                autoCapitalize="characters"
                autoCorrect={false}
                accessibilityLabel={t('settings.name')}
              />
              <NavRow onBack={goBack} onNext={goNext} nextDisabled={!name.trim()} />
            </Card>
          )}

          {step === 'id' && (
            <Card title={t('onb.id.title')} body={t('onb.id.body')}>
              <TextInput
                value={senderId}
                onChangeText={(v) => setSenderId(v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 2))}
                placeholder="0A"
                placeholderTextColor={color.tx3}
                style={[styles.input, { textAlign: 'center', fontSize: 28, letterSpacing: 8 }]}
                maxLength={2}
                autoCapitalize="characters"
                autoCorrect={false}
                accessibilityLabel={t('settings.id')}
              />
              <NavRow onBack={goBack} onNext={goNext} nextDisabled={senderId.length !== 2} />
            </Card>
          )}

          {step === 'mode' && (
            <Card title={t('onb.mode.title')} body={t('onb.mode.body')}>
              <View style={styles.modeRow}>
                <ModeOption
                  label={t('mode.trek')}
                  active={mode === 'trek'}
                  onPress={() => { setMode('trek'); Haptics.selectionAsync(); }}
                />
                <ModeOption
                  label={t('mode.ride')}
                  active={mode === 'ride'}
                  onPress={() => { setMode('ride'); Haptics.selectionAsync(); }}
                />
              </View>
              <NavRow onBack={goBack} onNext={goNext} />
            </Card>
          )}

          {step === 'privacy' && (
            <Card title={t('onb.privacy.title')} body={t('onb.privacy.body')}>
              <NavRow onBack={goBack} onNext={finish} nextLabel={t('onb.done')} />
            </Card>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Card({ title, body, children }: { title: string; body: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      {body ? <Text style={styles.cardBody}>{body}</Text> : null}
      <View style={{ marginTop: space.m, gap: space.s }}>{children}</View>
    </View>
  );
}

function PrimaryButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }): React.JSX.Element {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.primary,
        disabled ? styles.primaryDisabled : null,
        pressed && !disabled ? { backgroundColor: color.signal2 } : null,
      ]}
    >
      <Text style={[styles.primaryLabel, disabled ? { color: color.tx3 } : null]}>{label}</Text>
    </Pressable>
  );
}

function SecondaryButton({ label, onPress }: { label: string; onPress: () => void }): React.JSX.Element {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.secondary, pressed && { opacity: 0.8 }]}>
      <Text style={styles.secondaryLabel}>{label}</Text>
    </Pressable>
  );
}

function NavRow({ onBack, onNext, nextLabel, nextDisabled }: { onBack?: () => void; onNext: () => void; nextLabel?: string; nextDisabled?: boolean }): React.JSX.Element {
  return (
    <View style={styles.navRow}>
      {onBack ? <SecondaryButton label={t('onb.back')} onPress={onBack} /> : <View />}
      <PrimaryButton label={nextLabel ?? t('onb.continue')} onPress={onNext} disabled={nextDisabled} />
    </View>
  );
}

function ModeOption({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }): React.JSX.Element {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.modeOption, active ? styles.modeOptionActive : null]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.modeOptionLabel, active ? { color: color.txOn } : null]}>{label}</Text>
    </Pressable>
  );
}

function LanguagePicker(): React.JSX.Element {
  const current = useLocale();
  return (
    <View style={{ gap: space.s }}>
      {LOCALES.map((loc) => (
        <Pressable
          key={loc.code}
          onPress={() => { void setLocale(loc.code as Locale); Haptics.selectionAsync(); }}
          style={[styles.langRow, current === loc.code ? styles.langRowActive : null]}
          accessibilityRole="radio"
          accessibilityState={{ selected: current === loc.code }}
        >
          <Text style={styles.langText}>{loc.native}</Text>
          {current === loc.code ? <Text style={styles.langCheck}>●</Text> : null}
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  scroll: { padding: space.m, paddingBottom: space.xl, gap: space.l },
  brand: { alignItems: 'center', marginTop: space.l, gap: space.s },
  brandText: { fontFamily: font.displayHeavy, fontSize: 36, letterSpacing: 8, color: color.signal },

  card: {
    backgroundColor: color.surface,
    borderRadius: radius.panel,
    borderWidth: 1,
    borderColor: color.hairline,
    padding: space.l,
  },
  cardTitle: { fontFamily: font.displayHeavy, fontSize: 22, letterSpacing: 2, color: color.tx },
  cardBody: { fontFamily: font.body, fontSize: 14, lineHeight: 20, color: color.tx2, marginTop: space.s },

  input: {
    backgroundColor: color.surface2,
    color: color.tx,
    fontFamily: font.bodyMed,
    fontSize: 18,
    borderRadius: radius.input,
    paddingHorizontal: space.m,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: color.hairline,
    minHeight: 52,
  },

  navRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: space.m, gap: space.s },

  primary: {
    backgroundColor: color.signal,
    paddingVertical: 14,
    paddingHorizontal: space.l,
    borderRadius: radius.input,
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryDisabled: { backgroundColor: color.surface2, borderWidth: 1, borderColor: color.hairline },
  primaryLabel: { fontFamily: font.displayHeavy, color: color.txOn, fontSize: 14, letterSpacing: 1.6 },

  secondary: {
    paddingVertical: 14,
    paddingHorizontal: space.l,
    borderRadius: radius.input,
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.hairline2,
  },
  secondaryLabel: { fontFamily: font.display, color: color.tx, fontSize: 14, letterSpacing: 1.4 },

  modeRow: { flexDirection: 'row', gap: space.s, marginTop: space.s },
  modeOption: {
    flex: 1,
    paddingVertical: space.m,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: color.hairline,
    backgroundColor: color.bg2,
    minHeight: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modeOptionActive: { backgroundColor: color.signal, borderColor: color.signal },
  modeOptionLabel: { fontFamily: font.displayHeavy, fontSize: 20, letterSpacing: 2, color: color.tx },

  langRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: space.m,
    paddingHorizontal: space.m,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: color.hairline,
    backgroundColor: color.bg2,
    minHeight: 52,
  },
  langRowActive: { borderColor: color.signal, backgroundColor: 'rgba(0,230,199,0.06)' },
  langText: { fontFamily: font.displayHeavy, color: color.tx, fontSize: 16, letterSpacing: 1.2 },
  langCheck: { color: color.signal, fontSize: 16 },
});
