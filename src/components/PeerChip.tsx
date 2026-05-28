import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { color, font, radius, space } from '../theme/tokens';
import type { Peer } from '../mesh/types';
import { StatusPill } from './StatusPill';

interface Props { peer: Peer; }

export function PeerChip({ peer }: Props): React.JSX.Element {
  const platformTint = peer.platform === 'android' ? color.android : color.ios;
  const platformLabel = peer.platform === 'android' ? 'ANDROID' : 'IOS';
  const roleTone = peer.role === 'relay' ? 'signal' : 'mute';
  const batteryTone =
    peer.battery <= 20 ? 'warn' : peer.battery <= 40 ? 'warn' : 'mute';

  return (
    <View style={[styles.row, peer.sos && styles.sosBorder]}>
      <View style={[styles.avatar, { borderColor: platformTint }]}>
        <Text style={styles.avatarText}>{peer.name.slice(0, 1)}</Text>
      </View>
      <View style={styles.body}>
        <View style={styles.nameRow}>
          <Text style={styles.name}>{peer.name}</Text>
          {peer.sos && <StatusPill label="SOS" tone="sos" />}
        </View>
        <Text style={styles.sub}>
          SENDER#{peer.senderId} · {peer.battery}% · {peer.hops} HOPS
        </Text>
      </View>
      <View style={styles.tags}>
        <View style={[styles.platformDot, { backgroundColor: platformTint }]} />
        <Text style={[styles.platformText, { color: platformTint }]}>{platformLabel}</Text>
        <View style={{ width: space.s }} />
        <StatusPill
          label={peer.role === 'relay' ? 'RELAY' : 'LEAF'}
          tone={roleTone}
        />
        <View style={{ width: space.s }} />
        <StatusPill label={`${peer.battery}%`} tone={batteryTone} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: color.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: color.hairline,
    padding: space.m,
    gap: space.m,
  },
  sosBorder: {
    borderColor: color.sos,
    backgroundColor: 'rgba(255,68,56,0.05)',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 40,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.bg2,
  },
  avatarText: {
    fontFamily: font.displayHeavy,
    color: color.tx,
    fontSize: 18,
  },
  body: { flex: 1, minWidth: 0 },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s,
  },
  name: {
    fontFamily: font.display,
    fontSize: 16,
    letterSpacing: 0.8,
    color: color.tx,
  },
  sub: {
    fontFamily: font.mono,
    fontSize: 11,
    color: color.tx3,
    marginTop: 2,
    letterSpacing: 0.4,
  },
  tags: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    maxWidth: 140,
    rowGap: 4,
  },
  platformDot: {
    width: 7,
    height: 7,
    borderRadius: 7,
    marginRight: 4,
  },
  platformText: {
    fontFamily: font.mono,
    fontSize: 10,
    letterSpacing: 0.7,
  },
});
