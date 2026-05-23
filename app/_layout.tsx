import React, { useCallback, useEffect, useState } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { Tabs } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts as useSaira, SairaCondensed_700Bold, SairaCondensed_800ExtraBold } from '@expo-google-fonts/saira-condensed';
import { HankenGrotesk_400Regular, HankenGrotesk_600SemiBold } from '@expo-google-fonts/hanken-grotesk';
import { JetBrainsMono_500Medium } from '@expo-google-fonts/jetbrains-mono';
import { color, font } from '../src/theme/tokens';
import { setActiveIdentity, useMeshBootstrap } from '../src/mesh/useMesh';
import { loadIdentity, type Identity } from '../src/identity/identity';
import { loadStoredLocale, t, useLocale } from '../src/i18n/strings';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

type BootState =
  | { phase: 'loading' }
  | { phase: 'onboarding' }
  | { phase: 'ready'; identity: Identity };

export default function RootLayout(): React.JSX.Element | null {
  const [loaded] = useSaira({
    SairaCondensed_700Bold,
    SairaCondensed_800ExtraBold,
    HankenGrotesk_400Regular,
    HankenGrotesk_600SemiBold,
    JetBrainsMono_500Medium,
  });

  const [boot, setBoot] = useState<BootState>({ phase: 'loading' });

  useEffect(() => {
    (async () => {
      await loadStoredLocale();
      const id = await loadIdentity();
      if (id) {
        setActiveIdentity(id);
        setBoot({ phase: 'ready', identity: id });
      } else {
        setBoot({ phase: 'onboarding' });
      }
    })().catch(() => setBoot({ phase: 'onboarding' }));
  }, []);

  const onLayout = useCallback(() => {
    if (loaded) SplashScreen.hideAsync().catch(() => undefined);
  }, [loaded]);

  useEffect(() => {
    if (loaded && boot.phase !== 'loading') {
      SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [loaded, boot.phase]);

  if (!loaded || boot.phase === 'loading') return null;

  return (
    <View style={styles.root} onLayout={onLayout}>
      <StatusBar style="light" />
      <AppTabs onboardingOnly={boot.phase === 'onboarding'} />
    </View>
  );
}

function AppTabs({ onboardingOnly }: { onboardingOnly: boolean }): React.JSX.Element {
  // Hooking up the live mesh bootstrap once we have an identity.
  useMeshBootstrap();
  useLocale();
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: color.bg },
        headerTintColor: color.tx,
        headerTitleStyle: { fontFamily: font.displayHeavy, fontSize: 18, letterSpacing: 2 },
        tabBarStyle: {
          backgroundColor: color.bg2,
          borderTopColor: color.hairline,
          borderTopWidth: 1,
          height: 68,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarActiveTintColor: color.signal,
        tabBarInactiveTintColor: color.tx3,
        tabBarLabelStyle: { fontFamily: font.display, fontSize: 11, letterSpacing: 1.4 },
        // Keep tap targets large enough for gloved use.
        tabBarItemStyle: { paddingVertical: 4, minHeight: 48 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'ECHO',
          tabBarLabel: t('tab.channel'),
          tabBarIcon: ({ color: c }) => <TabIcon glyph="◉" tint={c} />,
          href: onboardingOnly ? null : '/',
        }}
      />
      <Tabs.Screen
        name="peers"
        options={{
          title: t('tab.peers'),
          tabBarLabel: t('tab.peers'),
          tabBarIcon: ({ color: c }) => <TabIcon glyph="◎" tint={c} />,
          href: onboardingOnly ? null : '/peers',
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: t('tab.map'),
          tabBarLabel: t('tab.map'),
          tabBarIcon: ({ color: c }) => <TabIcon glyph="◇" tint={c} />,
          href: onboardingOnly ? null : '/map',
        }}
      />
      <Tabs.Screen
        name="groups"
        options={{
          title: t('tab.groups'),
          tabBarLabel: t('tab.groups'),
          tabBarIcon: ({ color: c }) => <TabIcon glyph="≡" tint={c} />,
          href: onboardingOnly ? null : '/groups',
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t('tab.settings'),
          tabBarLabel: t('tab.settings'),
          tabBarIcon: ({ color: c }) => <TabIcon glyph="⚙" tint={c} />,
          href: onboardingOnly ? null : '/settings',
        }}
      />
      <Tabs.Screen name="onboarding" options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="privacy" options={{ href: null, headerShown: false }} />
    </Tabs>
  );
}

function TabIcon({ glyph, tint }: { glyph: string; tint: string }): React.JSX.Element {
  return <Text style={{ color: tint, fontSize: 20, fontFamily: font.displayHeavy }}>{glyph}</Text>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
});
