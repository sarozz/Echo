import React, { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { color, font, radius, space } from '../src/theme/tokens';
import { useMesh } from '../src/mesh/useMesh';
import type { Group } from '../src/mesh/types';
import { t, useLocale } from '../src/i18n/strings';

export default function GroupsScreen(): React.JSX.Element {
  const groups = useMesh((s) => s.groups);
  const activeGroupId = useMesh((s) => s.activeGroupId);
  const switchGroup = useMesh((s) => s.switchGroup);
  const joinByCode = useMesh((s) => s.joinByCode);
  const [code, setCode] = useState('');
  useLocale();

  const onSelect = (id: string): void => {
    switchGroup(id);
    Haptics.selectionAsync();
    router.push('/');
  };

  const onJoin = (): void => {
    const trimmed = code.trim();
    if (!trimmed) return;
    joinByCode(trimmed);
    setCode('');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.push('/');
  };

  return (
    <SafeAreaView style={styles.root} edges={['bottom']}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('groups.title')}</Text>
        <Text style={styles.sub}>{t('groups.sub')}</Text>
      </View>

      <View style={styles.joinCard}>
        <Text style={styles.joinLabel}>{t('groups.join.label')}</Text>
        <View style={styles.joinRow}>
          <TextInput
            value={code}
            onChangeText={(v) => setCode(v.toUpperCase())}
            placeholder={t('groups.join.placeholder')}
            placeholderTextColor={color.tx3}
            style={styles.input}
            autoCapitalize="characters"
            autoCorrect={false}
            returnKeyType="go"
            onSubmitEditing={onJoin}
          />
          <Pressable
            onPress={onJoin}
            disabled={code.trim().length === 0}
            style={({ pressed }) => {
              const empty = code.trim().length === 0;
              return [
                styles.joinBtn,
                empty ? styles.joinBtnDisabled : null,
                pressed && !empty ? { backgroundColor: color.signal2 } : null,
              ];
            }}
          >
            <Text style={[styles.joinBtnLabel, code.trim().length === 0 ? { color: color.tx3 } : null]}>{t('groups.join.button')}</Text>
          </Pressable>
        </View>
      </View>

      <FlatList
        data={groups}
        keyExtractor={(g) => g.id}
        renderItem={({ item }) => (
          <GroupRow group={item} active={item.id === activeGroupId} onPress={() => onSelect(item.id)} />
        )}
        contentContainerStyle={{ padding: space.m, paddingTop: 0 }}
        ItemSeparatorComponent={() => <View style={{ height: space.s }} />}
      />
    </SafeAreaView>
  );
}

function GroupRow({
  group,
  active,
  onPress,
}: {
  group: Group;
  active: boolean;
  onPress: () => void;
}): React.JSX.Element {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        active && styles.rowActive,
        pressed && { opacity: 0.85 },
      ]}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.name} numberOfLines={1}>{group.name}</Text>
        <Text style={styles.code}>CODE {group.code} · GROUP#{group.id.toUpperCase()}</Text>
      </View>
      <View style={styles.right}>
        <Text style={styles.peers}>{group.peerCount} {t('groups.peers')}</Text>
        {active && <Text style={styles.activeTag}>{t('groups.active')}</Text>}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  header: {
    paddingHorizontal: space.m,
    paddingTop: space.s,
    paddingBottom: space.m,
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
    fontSize: 11,
    color: color.tx3,
    letterSpacing: 0.7,
    marginTop: 4,
  },
  joinCard: {
    margin: space.m,
    padding: space.m,
    borderRadius: radius.card,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.hairline,
  },
  joinLabel: {
    fontFamily: font.display,
    fontSize: 12,
    letterSpacing: 1.4,
    color: color.signal,
    marginBottom: space.s,
  },
  joinRow: {
    flexDirection: 'row',
    gap: space.s,
  },
  input: {
    flex: 1,
    backgroundColor: color.surface2,
    color: color.tx,
    fontFamily: font.mono,
    fontSize: 14,
    letterSpacing: 1.2,
    borderRadius: radius.input,
    paddingHorizontal: space.m,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: color.hairline,
  },
  joinBtn: {
    backgroundColor: color.signal,
    paddingHorizontal: space.m,
    paddingVertical: 10,
    borderRadius: radius.input,
    justifyContent: 'center',
  },
  joinBtnDisabled: {
    backgroundColor: color.surface2,
    borderWidth: 1,
    borderColor: color.hairline,
  },
  joinBtnLabel: {
    fontFamily: font.displayHeavy,
    color: color.txOn,
    fontSize: 13,
    letterSpacing: 1.6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: space.m,
    borderRadius: radius.card,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.hairline,
    gap: space.m,
  },
  rowActive: {
    borderColor: color.signal,
    backgroundColor: 'rgba(0,230,199,0.06)',
  },
  name: {
    fontFamily: font.displayHeavy,
    fontSize: 16,
    letterSpacing: 1.2,
    color: color.tx,
  },
  code: {
    fontFamily: font.mono,
    fontSize: 11,
    color: color.tx3,
    letterSpacing: 0.7,
    marginTop: 2,
  },
  right: {
    alignItems: 'flex-end',
    gap: 4,
  },
  peers: {
    fontFamily: font.mono,
    fontSize: 11,
    color: color.tx2,
    letterSpacing: 0.7,
  },
  activeTag: {
    fontFamily: font.display,
    fontSize: 10,
    letterSpacing: 1.2,
    color: color.signal,
  },
});
