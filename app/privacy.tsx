import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { color, font, radius, space } from '../src/theme/tokens';
import { t, useLocale } from '../src/i18n/strings';

const SECTIONS_EN: Array<{ h: string; p: string }> = [
  { h: 'What Echo does',         p: 'Echo is a peer-to-peer messenger that runs entirely on the phones in your group. No data goes to any server. Messages, voice, peer presence, and your location only ever travel directly between phones in radio range, or via other phones in the same group that relay for you.' },
  { h: 'What we collect',        p: 'Nothing on a server, because there is no server. Your display name and 2-character sender ID stay on your phone (and are broadcast over the local mesh so peers can see who you are). Messages are stored only on the phones that participate — yours and the people in your group.' },
  { h: 'Permissions we ask for', p: 'Bluetooth (to find and message nearby phones), Microphone (push-to-talk voice), Location (for the group map and for Android BLE to scan, never sent to any server), Local Network on iOS (Multipeer over Bonjour).' },
  { h: 'Stored on your device',  p: 'Messages are kept for up to 24 hours (text) or 72 hours (SOS) so the app can re-deliver them when peers reconnect. Your identity is kept until you reset Echo from Settings.' },
  { h: 'Encryption',             p: 'BLE GATT writes use platform-link-layer security where available. MultipeerConnectivity sessions are encrypted by Apple. Nearby Connections is encrypted by Google. Application-layer end-to-end encryption with a shared group key is on the roadmap.' },
  { h: 'Children',               p: 'Echo is built for adults in outdoor environments. It is not directed at children.' },
  { h: 'Contact',                p: 'Open an issue on the Echo repository to ask a question or report a problem.' },
];

const SECTIONS_NE: Array<{ h: string; p: string }> = [
  { h: 'Echo ले के गर्छ',         p: 'Echo एक उपकरण-देखि-उपकरण च्याट हो जुन तपाईंको समूहका फोनहरूमा मात्र चल्छ। कुनै पनि डाटा सर्भरमा जाँदैन। सन्देश, आवाज, र स्थान फोनहरू बीच मात्र यात्रा गर्छन्।' },
  { h: 'हामी के संकलन गर्छौं',    p: 'सर्भरमा केही पनि होइन, किनकि सर्भर छैन। तपाईंको नाम र २-अक्षरको ID तपाईंको फोनमा रहन्छ र समूहका साथीहरूले देख्न मात्र प्रसारण हुन्छ।' },
  { h: 'अनुमतिहरू',               p: 'ब्लुटुथ (नजिकका फोन भेट्न), माइक्रोफोन (आवाज), स्थान (नक्साको लागि, बाहिर पठाइँदैन), iOS मा स्थानीय नेटवर्क।' },
  { h: 'तपाईंको फोनमा भण्डारित',  p: 'पाठ सन्देश २४ घण्टा, SOS ७२ घण्टा सम्म राखिन्छ ताकि साथीहरू पुनः जोडिँदा सन्देश डेलिभर हुन सक्छ।' },
  { h: 'एन्क्रिप्शन',              p: 'BLE, Multipeer र Nearby एप्पल/गुगलले प्रदान गरेको लिङ्क-लेयर एन्क्रिप्शन प्रयोग गर्छन्। समूह-कुञ्जी आधारित अन्त्य-देखि-अन्त्य एन्क्रिप्शन रोडम्यापमा छ।' },
  { h: 'बालबालिका',                p: 'Echo वयस्कहरूको लागि बनाइएको हो र बालबालिकालाई लक्षित गरिएको होइन।' },
  { h: 'सम्पर्क',                  p: 'Echo को रिपोजिटरीमा issue खोलेर सम्पर्क गर्नुहोस्।' },
];

export default function PrivacyScreen(): React.JSX.Element {
  const locale = useLocale();
  const sections = locale === 'ne' ? SECTIONS_NE : SECTIONS_EN;
  return (
    <SafeAreaView style={styles.root} edges={['bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back} accessibilityRole="button" accessibilityLabel={t('onb.back')}>
          <Text style={styles.backLabel}>‹  {t('onb.back')}</Text>
        </Pressable>
        <Text style={styles.title}>{t('privacy.title')}</Text>
        <View style={{ width: 80 }} />
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        {sections.map((s, i) => (
          <View key={i} style={styles.section}>
            <Text style={styles.h}>{s.h}</Text>
            <Text style={styles.p}>{s.p}</Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.m,
    paddingTop: space.m,
    paddingBottom: space.s,
    justifyContent: 'space-between',
  },
  back: { paddingVertical: 8, paddingHorizontal: 8, minHeight: 44, minWidth: 80, justifyContent: 'center' },
  backLabel: { fontFamily: font.display, fontSize: 13, color: color.tx2, letterSpacing: 1.2 },
  title: { fontFamily: font.displayHeavy, fontSize: 16, letterSpacing: 2, color: color.tx },
  scroll: { padding: space.m, paddingBottom: space.xl, gap: space.m },
  section: {
    backgroundColor: color.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: color.hairline,
    padding: space.m,
    gap: 8,
  },
  h: { fontFamily: font.displayHeavy, fontSize: 14, letterSpacing: 1.2, color: color.signal },
  p: { fontFamily: font.body, fontSize: 14, lineHeight: 20, color: color.tx },
});
