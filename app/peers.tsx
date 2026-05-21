import React from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { color, font, space } from '../src/theme/tokens';
import { useMesh, self } from '../src/mesh/useMesh';
import { PeerChip } from '../src/components/PeerChip';

export default function PeersScreen(): React.JSX.Element {
  const peers = useMesh((s) => s.peers);
  const state = useMesh((s) => s.state);

  return (
    <SafeAreaView style={styles.root} edges={['bottom']}>
      <View style={styles.header}>
        <Text style={styles.title}>GROUP ROSTER</Text>
        <Text style={styles.sub}>
          YOU · #{self.senderId} · {state.selfRole.toUpperCase()} · {peers.length} PEER{peers.length === 1 ? '' : 'S'} REACHED
        </Text>
      </View>
      <FlatList
        data={peers}
        keyExtractor={(p) => p.senderId}
        renderItem={({ item }) => <PeerChip peer={item} />}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={{ height: space.s }} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>NO PEERS YET</Text>
            <Text style={styles.emptyBody}>Scanning for nearby devices.</Text>
          </View>
        }
      />
    </SafeAreaView>
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
  list: { padding: space.m },
  empty: { padding: space.xl, alignItems: 'center' },
  emptyTitle: {
    fontFamily: font.displayHeavy,
    color: color.tx2,
    fontSize: 18,
    letterSpacing: 2,
  },
  emptyBody: {
    fontFamily: font.body,
    color: color.tx3,
    marginTop: space.s,
  },
});
