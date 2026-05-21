import React, { useEffect, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { color, font, radius, space } from '../src/theme/tokens';
import { useMesh } from '../src/mesh/useMesh';
import { ConnectionBar } from '../src/components/ConnectionBar';
import { ModeToggle } from '../src/components/ModeToggle';
import { MessageBubble } from '../src/components/MessageBubble';
import { VoiceButton } from '../src/components/VoiceButton';
import { SosButton } from '../src/components/SosButton';
import { t, useLocale } from '../src/i18n/strings';

export default function ChannelScreen(): React.JSX.Element {
  const state = useMesh((s) => s.state);
  const messages = useMesh((s) => s.messages);
  const voice = useMesh((s) => s.voice);
  const activeGroupId = useMesh((s) => s.activeGroupId);
  const group = useMesh((s) => s.groups.find((g) => g.id === s.activeGroupId));
  const setMode = useMesh((s) => s.setMode);
  const sendText = useMesh((s) => s.sendText);
  const startVoice = useMesh((s) => s.startVoice);
  const stopVoice = useMesh((s) => s.stopVoice);
  const triggerSOS = useMesh((s) => s.triggerSOS);
  useLocale();

  const [draft, setDraft] = useState('');
  const [voxOn, setVoxOn] = useState(false);
  const listRef = useRef<FlatList>(null);

  useEffect(() => {
    if (messages.length > 0) {
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    }
  }, [messages.length]);

  const onSend = (): void => {
    const body = draft.trim();
    if (!body) return;
    sendText(body);
    setDraft('');
    Haptics.selectionAsync();
  };

  return (
    <SafeAreaView style={styles.root} edges={['bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
      >
        <View style={styles.header}>
          <ConnectionBar conn={state.conn} peerCount={state.peerCount} hops={state.hops} />
          <View style={styles.subHeader}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.groupName} numberOfLines={1}>
                {group?.name ?? 'NO GROUP'}
              </Text>
              <Text style={styles.groupCode}>
                CODE {group?.code ?? '—'} · GROUP#{activeGroupId.toUpperCase()}
              </Text>
            </View>
            <ModeToggle mode={state.mode} onChange={setMode} />
          </View>
        </View>

        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          renderItem={({ item }) => <MessageBubble msg={item} />}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<EmptyState />}
        />

        <View style={styles.voiceRegion}>
          {state.mode === 'trek' ? (
            <VoiceButton variant="ptt" voice={voice} onStart={startVoice} onStop={stopVoice} />
          ) : (
            <VoiceButton
              variant="vox"
              active={voxOn}
              voice={voice}
              onToggle={() => {
                const next = !voxOn;
                setVoxOn(next);
                if (next) startVoice();
                else stopVoice();
              }}
            />
          )}
        </View>

        <View style={styles.inputRow}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={t('channel.send.placeholder')}
            accessibilityLabel={t('channel.send.placeholder')}
            placeholderTextColor={color.tx3}
            style={styles.input}
            returnKeyType="send"
            onSubmitEditing={onSend}
            multiline={false}
          />
          <Pressable
            onPress={onSend}
            disabled={draft.trim().length === 0}
            style={({ pressed }) => {
              const empty = draft.trim().length === 0;
              return [
                styles.sendBtn,
                empty ? styles.sendBtnDisabled : null,
                pressed && !empty ? styles.sendBtnPressed : null,
              ];
            }}
          >
            <Text style={[styles.sendLabel, draft.trim().length === 0 ? styles.sendLabelDisabled : null]}>{t('channel.send.button')}</Text>
          </Pressable>
        </View>

        <View style={styles.sosWrap}>
          <SosButton onConfirm={triggerSOS} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function EmptyState(): React.JSX.Element {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>{t('channel.empty.title')}</Text>
      <Text style={styles.emptyBody}>{t('channel.empty.body')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  header: {
    paddingHorizontal: space.m,
    paddingTop: space.s,
    paddingBottom: space.s,
    gap: space.s,
    backgroundColor: color.bg,
  },
  subHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s,
  },
  groupName: {
    fontFamily: font.displayHeavy,
    color: color.tx,
    fontSize: 18,
    letterSpacing: 1.6,
  },
  groupCode: {
    fontFamily: font.mono,
    fontSize: 10,
    color: color.tx3,
    letterSpacing: 0.7,
    marginTop: 2,
  },
  list: { paddingVertical: space.s, paddingBottom: space.m, flexGrow: 1 },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.l,
  },
  emptyTitle: {
    fontFamily: font.displayHeavy,
    color: color.signal,
    fontSize: 22,
    letterSpacing: 3,
  },
  emptyBody: {
    fontFamily: font.body,
    color: color.tx3,
    textAlign: 'center',
    marginTop: space.s,
    maxWidth: 280,
  },
  voiceRegion: {
    alignItems: 'center',
    paddingVertical: space.s,
    paddingHorizontal: space.m,
    borderTopWidth: 1,
    borderTopColor: color.hairline,
    backgroundColor: color.bg2,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.m,
    paddingVertical: space.s,
    gap: space.s,
    backgroundColor: color.bg2,
  },
  input: {
    flex: 1,
    backgroundColor: color.surface2,
    color: color.tx,
    fontFamily: font.body,
    fontSize: 15,
    borderRadius: radius.input,
    paddingHorizontal: space.m,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: color.hairline,
  },
  sendBtn: {
    backgroundColor: color.signal,
    paddingVertical: 10,
    paddingHorizontal: space.m,
    borderRadius: radius.input,
  },
  sendBtnDisabled: {
    backgroundColor: color.surface2,
    borderWidth: 1,
    borderColor: color.hairline,
  },
  sendBtnPressed: {
    backgroundColor: color.signal2,
  },
  sendLabel: {
    fontFamily: font.displayHeavy,
    fontSize: 13,
    letterSpacing: 1.6,
    color: color.txOn,
  },
  sendLabelDisabled: {
    color: color.tx3,
  },
  sosWrap: {
    paddingHorizontal: space.m,
    paddingBottom: space.s,
    backgroundColor: color.bg2,
  },
});
