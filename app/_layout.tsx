import React, { useCallback, useEffect } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { Tabs } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts as useSaira, SairaCondensed_700Bold, SairaCondensed_800ExtraBold } from '@expo-google-fonts/saira-condensed';
import { HankenGrotesk_400Regular, HankenGrotesk_600SemiBold } from '@expo-google-fonts/hanken-grotesk';
import { JetBrainsMono_500Medium } from '@expo-google-fonts/jetbrains-mono';
import { color, font } from '../src/theme/tokens';
import { useMeshBootstrap } from '../src/mesh/useMesh';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout(): React.JSX.Element | null {
  const [loaded] = useSaira({
    SairaCondensed_700Bold,
    SairaCondensed_800ExtraBold,
    HankenGrotesk_400Regular,
    HankenGrotesk_600SemiBold,
    JetBrainsMono_500Medium,
  });

  useMeshBootstrap();

  const onLayout = useCallback(() => {
    if (loaded) SplashScreen.hideAsync().catch(() => undefined);
  }, [loaded]);

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync().catch(() => undefined);
  }, [loaded]);

  if (!loaded) return null;

  return (
    <View style={styles.root} onLayout={onLayout}>
      <StatusBar style="light" />
      <Tabs
        screenOptions={{
          headerStyle: { backgroundColor: color.bg },
          headerTintColor: color.tx,
          headerTitleStyle: { fontFamily: font.displayHeavy, fontSize: 18, letterSpacing: 2 },
          tabBarStyle: {
            backgroundColor: color.bg2,
            borderTopColor: color.hairline,
            borderTopWidth: 1,
            height: 64,
            paddingBottom: 8,
            paddingTop: 6,
          },
          tabBarActiveTintColor: color.signal,
          tabBarInactiveTintColor: color.tx3,
          tabBarLabelStyle: { fontFamily: font.display, fontSize: 11, letterSpacing: 1.4 },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'ECHO',
            tabBarLabel: 'CHANNEL',
            tabBarIcon: ({ color: c }) => <TabIcon glyph="◉" tint={c} />,
          }}
        />
        <Tabs.Screen
          name="peers"
          options={{
            title: 'PEERS',
            tabBarLabel: 'PEERS',
            tabBarIcon: ({ color: c }) => <TabIcon glyph="◎" tint={c} />,
          }}
        />
        <Tabs.Screen
          name="map"
          options={{
            title: 'MAP',
            tabBarLabel: 'MAP',
            tabBarIcon: ({ color: c }) => <TabIcon glyph="◇" tint={c} />,
          }}
        />
        <Tabs.Screen
          name="groups"
          options={{
            title: 'GROUPS',
            tabBarLabel: 'GROUPS',
            tabBarIcon: ({ color: c }) => <TabIcon glyph="≡" tint={c} />,
          }}
        />
      </Tabs>
    </View>
  );
}

function TabIcon({ glyph, tint }: { glyph: string; tint: string }): React.JSX.Element {
  return <Text style={{ color: tint, fontSize: 20, fontFamily: font.displayHeavy }}>{glyph}</Text>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
});
