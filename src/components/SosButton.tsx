import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { color, font, radius, space } from '../theme/tokens';
import { t, useLocale } from '../i18n/strings';

interface Props { onConfirm: () => void; }

export function SosButton({ onConfirm }: Props): React.JSX.Element {
  const [open, setOpen] = useState(false);
  useLocale();

  return (
    <>
      <Pressable
        onPress={() => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          setOpen(true);
        }}
        style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
        accessibilityRole="button"
        accessibilityLabel={`${t('sos.button.label')} — ${t('sos.button.sub')}`}
      >
        <Text style={styles.label}>{t('sos.button.label')}</Text>
        <Text style={styles.sub}>{t('sos.button.sub')}</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <Text style={styles.title}>{t('sos.confirm.title')}</Text>
            <Text style={styles.copy}>{t('sos.confirm.body')}</Text>
            <View style={styles.actions}>
              <Pressable style={[styles.action, styles.cancel]} onPress={() => setOpen(false)} accessibilityRole="button">
                <Text style={styles.cancelText}>{t('sos.confirm.cancel')}</Text>
              </Pressable>
              <Pressable
                style={[styles.action, styles.confirm]}
                onPress={() => {
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                  setOpen(false);
                  onConfirm();
                }}
                accessibilityRole="button"
              >
                <Text style={styles.confirmText}>{t('sos.confirm.send')}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  btn: {
    backgroundColor: 'rgba(255,68,56,0.10)',
    borderColor: color.sos,
    borderWidth: 1.5,
    borderRadius: radius.card,
    paddingVertical: space.s + 2,
    paddingHorizontal: space.m,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
  },
  btnPressed: {
    backgroundColor: 'rgba(255,68,56,0.20)',
  },
  label: {
    fontFamily: font.displayHeavy,
    color: color.sos,
    fontSize: 22,
    letterSpacing: 4,
  },
  sub: {
    fontFamily: font.mono,
    fontSize: 9,
    color: color.sos,
    letterSpacing: 0.6,
    flex: 1,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: space.l,
  },
  sheet: {
    width: '100%',
    backgroundColor: color.bg2,
    borderColor: color.sos,
    borderWidth: 1.5,
    borderRadius: radius.panel,
    padding: space.l,
  },
  title: {
    fontFamily: font.displayHeavy,
    color: color.sos,
    fontSize: 26,
    letterSpacing: 3,
  },
  copy: {
    fontFamily: font.body,
    color: color.tx2,
    fontSize: 14,
    marginTop: space.s,
    lineHeight: 20,
  },
  actions: {
    flexDirection: 'row',
    gap: space.s,
    marginTop: space.l,
  },
  action: {
    flex: 1,
    paddingVertical: space.m,
    borderRadius: radius.card,
    alignItems: 'center',
  },
  cancel: {
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.hairline2,
  },
  cancelText: {
    fontFamily: font.display,
    fontSize: 14,
    color: color.tx,
    letterSpacing: 1.4,
  },
  confirm: {
    backgroundColor: color.sos,
  },
  confirmText: {
    fontFamily: font.displayHeavy,
    fontSize: 14,
    color: '#1A0807',
    letterSpacing: 1.6,
  },
});
