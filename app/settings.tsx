import React, { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Constants from 'expo-constants';
import { color, font, radius, space } from '../src/theme/tokens';
import { LOCALES, t, useLocale, setLocale, type Locale } from '../src/i18n/strings';
import { loadIdentity, saveIdentity, suggestSenderId, type Identity } from '../src/identity/identity';
import { setActiveIdentity, useMesh } from '../src/mesh/useMesh';

type BackendPref = Identity['backendPref'];

const BACKENDS: Array<{ key: BackendPref; label: string }> = [
  { key: 'auto',      label: 'settings.backend.auto' },
  { key: 'nearby',    label: 'settings.backend.nearby' },
  { key: 'multipeer', label: 'settings.backend.multipeer' },
  { key: 'ble',       label: 'settings.backend.ble' },
];

export default function SettingsScreen(): React.JSX.Element {
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [dirty, setDirty] = useState(false);
  const peers = useMesh((s) => s.peers);
  const state = useMesh((s) => s.state);
  const messages = useMesh((s) => s.messages);
  useLocale();

  useEffect(() => {
    void loadIdentity().then((id) => {
      if (id) setIdentity(id);
    });
  }, []);

  if (!identity) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.empty}>
          <Text style={styles.emptyText}>…</Text>
        </View>
      </SafeAreaView>
    );
  }

  const update = (patch: Partial<Identity>): void => {
    setIdentity({ ...identity, ...patch });
    setDirty(true);
  };

  const save = async (): Promise<void> => {
    const saved = await saveIdentity(identity);
    setActiveIdentity(saved);
    setDirty(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const reset = (): void => {
    Alert.alert(
      t('settings.reset'),
      t('settings.reset.confirm'),
      [
        { text: t('sos.confirm.cancel'), style: 'cancel' },
        {
          text: t('settings.reset'),
          style: 'destructive',
          onPress: async () => {
            await AsyncStorage.multiRemove(['echo.identity', 'echo.locale']);
            router.replace('/onboarding');
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.root} edges={['bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.h1}>{t('settings.title')}</Text>

          <Section title={t('settings.identity')}>
            <Field label={t('settings.name')}>
              <TextInput
                value={identity.name}
                onChangeText={(v) => update({ name: v.toUpperCase() })}
                style={styles.input}
                maxLength={24}
                autoCapitalize="characters"
                accessibilityLabel={t('settings.name')}
              />
            </Field>
            <Field label={t('settings.id')}>
              <TextInput
                value={identity.senderId}
                onChangeText={(v) => update({ senderId: v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 2) })}
                style={[styles.input, styles.idInput]}
                maxLength={2}
                autoCapitalize="characters"
                placeholder={suggestSenderId(identity.name)}
                placeholderTextColor={color.tx3}
                accessibilityLabel={t('settings.id')}
              />
            </Field>
          </Section>

          <Section title={t('settings.mode')}>
            <View style={styles.row}>
              <ChoiceChip label={t('mode.trek')} active={identity.modeDefault === 'trek'} onPress={() => update({ modeDefault: 'trek' })} />
              <ChoiceChip label={t('mode.ride')} active={identity.modeDefault === 'ride'} onPress={() => update({ modeDefault: 'ride' })} />
            </View>
          </Section>

          <Section title={t('settings.backend')}>
            <View style={styles.col}>
              {BACKENDS.map((b) => (
                <Pressable
                  key={b.key}
                  onPress={() => { update({ backendPref: b.key }); Haptics.selectionAsync(); }}
                  style={[styles.optionRow, identity.backendPref === b.key ? styles.optionRowActive : null]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: identity.backendPref === b.key }}
                >
                  <Text style={styles.optionLabel}>{t(b.label)}</Text>
                  {identity.backendPref === b.key ? <Text style={styles.optionCheck}>●</Text> : null}
                </Pressable>
              ))}
            </View>
          </Section>

          <Section title={t('settings.language')}>
            <View style={styles.col}>
              {LOCALES.map((loc) => (
                <Pressable
                  key={loc.code}
                  onPress={() => { void setLocale(loc.code as Locale); Haptics.selectionAsync(); }}
                  style={[styles.optionRow, useLocale() === loc.code ? styles.optionRowActive : null]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: useLocale() === loc.code }}
                >
                  <Text style={styles.optionLabel}>{loc.native}</Text>
                </Pressable>
              ))}
            </View>
          </Section>

          <Section title={t('settings.diagnostics')}>
            <Diag label={t('settings.diag.backend')} value={state.conn.toUpperCase()} />
            <Diag label={t('settings.diag.peers')} value={`${peers.length}`} />
            <Diag label={t('settings.diag.hops')} value={`${state.hops}`} />
            <Diag label={t('settings.diag.messages')} value={`${messages.length}`} />
          </Section>

          <Pressable
            onPress={() => router.push('/privacy')}
            style={styles.linkRow}
            accessibilityRole="link"
          >
            <Text style={styles.linkText}>{t('settings.privacy')}</Text>
            <Text style={styles.linkArrow}>›</Text>
          </Pressable>

          <View style={styles.aboutRow}>
            <Text style={styles.aboutLabel}>{t('settings.version')}</Text>
            <Text style={styles.aboutValue}>{Constants.expoConfig?.version ?? '0.0.0'}</Text>
          </View>

          {dirty && (
            <Pressable onPress={save} style={styles.save} accessibilityRole="button">
              <Text style={styles.saveLabel}>{t('settings.save')}</Text>
            </Pressable>
          )}

          <Pressable onPress={reset} style={styles.danger} accessibilityRole="button">
            <Text style={styles.dangerLabel}>{t('settings.reset')}</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

function ChoiceChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }): React.JSX.Element {
  return (
    <Pressable
      onPress={() => { onPress(); Haptics.selectionAsync(); }}
      style={[styles.chip, active ? styles.chipActive : null]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.chipLabel, active ? { color: color.txOn } : null]}>{label}</Text>
    </Pressable>
  );
}

function Diag({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <View style={styles.diagRow}>
      <Text style={styles.diagLabel}>{label}</Text>
      <Text style={styles.diagValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  scroll: { padding: space.m, paddingBottom: space.xl, gap: space.l },
  h1: { fontFamily: font.displayHeavy, fontSize: 22, letterSpacing: 2, color: color.tx },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: color.tx3, fontFamily: font.mono },

  section: {
    backgroundColor: color.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: color.hairline,
    padding: space.m,
    gap: space.m,
  },
  sectionTitle: {
    fontFamily: font.displayHeavy,
    fontSize: 12,
    letterSpacing: 1.6,
    color: color.signal,
  },
  sectionBody: { gap: space.m },

  field: { gap: space.xs },
  fieldLabel: {
    fontFamily: font.mono,
    fontSize: 10,
    letterSpacing: 0.8,
    color: color.tx3,
  },
  input: {
    backgroundColor: color.surface2,
    color: color.tx,
    fontFamily: font.bodyMed,
    fontSize: 16,
    borderRadius: radius.input,
    paddingHorizontal: space.m,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: color.hairline,
    minHeight: 48,
  },
  idInput: { textAlign: 'center', fontSize: 24, letterSpacing: 6 },

  row: { flexDirection: 'row', gap: space.s, flexWrap: 'wrap' },
  col: { gap: space.s },

  chip: {
    paddingVertical: 12,
    paddingHorizontal: space.l,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.hairline,
    backgroundColor: color.bg2,
    minHeight: 44,
    justifyContent: 'center',
  },
  chipActive: { backgroundColor: color.signal, borderColor: color.signal },
  chipLabel: { fontFamily: font.displayHeavy, fontSize: 14, letterSpacing: 1.4, color: color.tx },

  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: space.m,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: color.hairline,
    backgroundColor: color.bg2,
    minHeight: 48,
  },
  optionRowActive: { borderColor: color.signal, backgroundColor: 'rgba(0,230,199,0.06)' },
  optionLabel: { fontFamily: font.display, color: color.tx, fontSize: 14, letterSpacing: 1.2 },
  optionCheck: { color: color.signal, fontSize: 14 },

  diagRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  diagLabel: { fontFamily: font.mono, fontSize: 11, color: color.tx3, letterSpacing: 0.6 },
  diagValue: { fontFamily: font.mono, fontSize: 12, color: color.signal, letterSpacing: 0.8 },

  linkRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: color.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: color.hairline,
    padding: space.m,
    minHeight: 56,
  },
  linkText: { fontFamily: font.display, fontSize: 14, color: color.tx, letterSpacing: 1.2 },
  linkArrow: { fontFamily: font.display, fontSize: 20, color: color.tx3 },

  aboutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: space.m,
    paddingVertical: space.s,
  },
  aboutLabel: { fontFamily: font.mono, fontSize: 11, color: color.tx3, letterSpacing: 0.6 },
  aboutValue: { fontFamily: font.mono, fontSize: 11, color: color.tx2, letterSpacing: 0.6 },

  save: {
    backgroundColor: color.signal,
    paddingVertical: 14,
    borderRadius: radius.input,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  saveLabel: { fontFamily: font.displayHeavy, color: color.txOn, fontSize: 14, letterSpacing: 1.6 },

  danger: {
    paddingVertical: 14,
    borderRadius: radius.input,
    borderWidth: 1,
    borderColor: color.sos2,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  dangerLabel: { fontFamily: font.display, color: color.sos, fontSize: 13, letterSpacing: 1.4 },
});
