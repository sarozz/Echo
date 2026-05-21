import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { color, font, radius, space } from '../theme/tokens';
import type { EchoMessage } from '../mesh/types';

interface Props { msg: EchoMessage; }

function statusLine(m: EchoMessage): { text: string; tone: 'signal' | 'warn' | 'sos' | 'mute' | 'ok' } {
  if (m.kind === 'sos') return { text: 'SOS · BROADCAST', tone: 'sos' };
  if (m.mine) {
    switch (m.status) {
      case 'queued':    return { text: 'QUEUED · NO PEERS ⟳', tone: 'warn' };
      case 'sent':      return { text: 'SENT · …', tone: 'mute' };
      case 'relayed':   return { text: `RELAYED ${m.relayedHops ?? 1} HOPS`, tone: 'signal' };
      case 'delivered': return { text: `DELIVERED · ${m.deliveredCount ?? 0}/${m.peerCount ?? 0} ✓`, tone: 'ok' };
    }
  }
  if (m.status === 'relayed') {
    return { text: `RELAYED ${m.relayedHops ?? 1} HOPS`, tone: 'signal' };
  }
  return { text: m.status.toUpperCase(), tone: 'mute' };
}

const TONE_COLOR = {
  signal: color.signal,
  warn:   color.warn,
  sos:    color.sos,
  mute:   color.tx3,
  ok:     color.ok,
} as const;

function fmtTime(ts: number): string {
  const d = new Date(ts);
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  return `${hh}:${mm}`;
}

export function MessageBubble({ msg }: Props): React.JSX.Element {
  const isSOS = msg.kind === 'sos';
  const mine = msg.mine;
  const status = statusLine(msg);

  if (isSOS) {
    return (
      <View style={styles.sosWrap}>
        <View style={styles.sosCard}>
          <Text style={styles.sosTitle}>SOS</Text>
          <Text style={styles.sosBody}>{msg.body}</Text>
          <Text style={styles.sosMeta}>
            FROM {msg.senderName} · #{msg.senderId} · {fmtTime(msg.ts)}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.row, mine ? styles.rowMine : styles.rowTheirs]}>
      <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
        {mine ? (
          <LinearGradient
            colors={[color.signal2, color.signal3]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        ) : null}
        {!mine && (
          <Text style={styles.sender}>
            {msg.senderName} · #{msg.senderId}
          </Text>
        )}
        <Text style={[styles.body, mine && styles.bodyMine]}>{msg.body}</Text>
        <View style={styles.meta}>
          <Text style={[styles.metaText, { color: mine ? 'rgba(4,16,14,0.6)' : color.tx3 }]}>
            {fmtTime(msg.ts)}
          </Text>
          <Text style={[styles.metaText, { color: TONE_COLOR[status.tone] }]}>
            {status.text}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: space.m,
    marginVertical: 4,
    flexDirection: 'row',
  },
  rowMine: { justifyContent: 'flex-end' },
  rowTheirs: { justifyContent: 'flex-start' },
  bubble: {
    maxWidth: '82%',
    borderRadius: radius.card,
    paddingHorizontal: space.m,
    paddingVertical: space.s + 2,
    overflow: 'hidden',
  },
  bubbleTheirs: {
    backgroundColor: color.surface2,
    borderWidth: 1,
    borderColor: color.hairline,
    borderTopLeftRadius: 4,
  },
  bubbleMine: {
    borderTopRightRadius: 4,
  },
  sender: {
    fontFamily: font.mono,
    fontSize: 10,
    color: color.signal,
    letterSpacing: 0.7,
    marginBottom: 2,
  },
  body: {
    fontFamily: font.body,
    fontSize: 15,
    color: color.tx,
    lineHeight: 20,
  },
  bodyMine: {
    color: color.txOn,
    fontFamily: font.bodyMed,
  },
  meta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
    gap: space.s,
  },
  metaText: {
    fontFamily: font.mono,
    fontSize: 10,
    letterSpacing: 0.6,
  },
  sosWrap: {
    paddingHorizontal: space.m,
    marginVertical: space.s,
  },
  sosCard: {
    borderRadius: radius.card,
    backgroundColor: 'rgba(255,68,56,0.10)',
    borderWidth: 1.5,
    borderColor: color.sos,
    padding: space.m,
  },
  sosTitle: {
    fontFamily: font.displayHeavy,
    fontSize: 22,
    letterSpacing: 4,
    color: color.sos,
  },
  sosBody: {
    fontFamily: font.bodyMed,
    color: color.tx,
    fontSize: 14,
    marginTop: 4,
  },
  sosMeta: {
    fontFamily: font.mono,
    color: color.sos,
    fontSize: 10,
    marginTop: 6,
    letterSpacing: 0.6,
  },
});
