import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules, Platform } from 'react-native';

export type Locale = 'en' | 'ne';

export const LOCALES: Array<{ code: Locale; label: string; native: string }> = [
  { code: 'en', label: 'English', native: 'ENGLISH' },
  { code: 'ne', label: 'Nepali',  native: 'नेपाली' },
];

type Strings = Record<string, string>;

const EN: Strings = {
  // status / connection
  'status.scanning':    'SCANNING FOR PEERS…',
  'status.connected':   'CONNECTED',
  'status.leaf':        'LEAF',
  'status.offline':     'OFFLINE · NO MESH',
  'status.peers':       'PEERS',
  'status.hops':        'HOPS',
  'status.relay':       'RELAY',

  // modes
  'mode.trek': 'TREK',
  'mode.ride': 'RIDE',

  // channel
  'channel.empty.title':  'CHANNEL CLEAR',
  'channel.empty.body':   'Send a message, hold to talk, or wait for peers to chime in. The mesh is alive.',
  'channel.send.placeholder': 'Send message…',
  'channel.send.button':  'SEND',

  // voice
  'voice.ptt.hold':       'HOLD TO TALK',
  'voice.ptt.transmitting': 'TRANSMITTING',
  'voice.ptt.release':    'RELEASE TO STOP',
  'voice.ptt.label':      'PUSH-TO-TALK',
  'voice.vox.on':         'VOX ON',
  'voice.vox.off':        'VOX OFF',
  'voice.vox.sub':        'HANDS-FREE · VOICE-ACTIVATED',
  'voice.remote.talking': 'TALKING',

  // SOS
  'sos.button.label':     'SOS',
  'sos.button.sub':       'BROADCASTS YOUR LOCATION TO THE WHOLE GROUP',
  'sos.confirm.title':    'SEND SOS?',
  'sos.confirm.body':     'This broadcasts your location and an emergency flag to every peer in the group. Use only for real emergencies.',
  'sos.confirm.cancel':   'CANCEL',
  'sos.confirm.send':     'SEND SOS',
  'sos.message.broadcast':'SOS — broadcasting location to the group.',

  // tabs
  'tab.channel': 'CHANNEL',
  'tab.peers':   'PEERS',
  'tab.map':     'MAP',
  'tab.groups':  'GROUPS',
  'tab.settings':'SETTINGS',

  // peers
  'peers.title': 'GROUP ROSTER',
  'peers.sub':   'YOU · #{senderId} · {role} · {count} PEER{plural} REACHED',
  'peers.empty.title': 'NO PEERS YET',
  'peers.empty.body':  'Scanning for nearby devices.',

  // map
  'map.title': 'GROUP MAP',
  'map.sub':   'POSITIONS APPROXIMATE · LAST RX VIA MESH',

  // groups
  'groups.title':         'GROUPS',
  'groups.sub':           'SELECT A MESH GROUP OR JOIN WITH A CODE',
  'groups.join.label':    'JOIN VIA CODE',
  'groups.join.placeholder': 'E.G. ANP-7Q',
  'groups.join.button':   'JOIN',
  'groups.peers':         'PEERS',
  'groups.active':        'ACTIVE',

  // onboarding
  'onb.welcome.title':    'ECHO',
  'onb.welcome.body':     'A small group radio for the mountains, no internet required. Each phone relays for the others.',
  'onb.welcome.cta':      'CONTINUE',
  'onb.name.title':       'CHOOSE YOUR NAME',
  'onb.name.body':        'Peers will see this in the channel.',
  'onb.name.placeholder': 'E.G. PEMA',
  'onb.id.title':         'CHOOSE A 2-CHAR ID',
  'onb.id.body':          'Short tag shown next to your name on the wire.',
  'onb.mode.title':       'PRIMARY MODE',
  'onb.mode.body':        'You can change this any time from settings.',
  'onb.privacy.title':    'PRIVACY',
  'onb.privacy.body':     'Echo never sends anything to the internet. Messages stay on phones in your group. Read the full privacy policy in Settings.',
  'onb.done':             'JOIN THE MESH',
  'onb.back':             'BACK',
  'onb.continue':         'CONTINUE',

  // settings
  'settings.title':       'SETTINGS',
  'settings.identity':    'IDENTITY',
  'settings.name':        'NAME',
  'settings.id':          'SENDER ID',
  'settings.mode':        'DEFAULT MODE',
  'settings.backend':     'PREFERRED BACKEND',
  'settings.backend.auto':      'AUTO',
  'settings.backend.nearby':    'NEARBY (ANDROID)',
  'settings.backend.multipeer': 'MULTIPEER (IOS)',
  'settings.backend.ble':       'BLE (CROSS-PLATFORM)',
  'settings.language':    'LANGUAGE',
  'settings.diagnostics': 'DIAGNOSTICS',
  'settings.diag.backend':    'ACTIVE BACKEND',
  'settings.diag.peers':      'CONNECTED PEERS',
  'settings.diag.hops':       'MAX HOPS',
  'settings.diag.messages':   'STORED MESSAGES',
  'settings.privacy':     'PRIVACY POLICY',
  'settings.save':        'SAVE',
  'settings.reset':       'RESET ECHO',
  'settings.reset.confirm': 'CLEAR ALL DATA AND START OVER?',
  'settings.about':       'ABOUT',
  'settings.version':     'VERSION',

  // privacy policy
  'privacy.title':        'PRIVACY POLICY',
};

const NE: Strings = {
  'status.scanning':    'साथीहरू खोज्दै…',
  'status.connected':   'जोडिएको',
  'status.leaf':        'पात',
  'status.offline':     'जडान छैन',
  'status.peers':       'साथीहरू',
  'status.hops':        'हपहरू',
  'status.relay':       'रिले',

  'mode.trek': 'ट्रेक',
  'mode.ride': 'राइड',

  'channel.empty.title':  'च्यानल खाली',
  'channel.empty.body':   'सन्देश पठाउनुहोस्, बोल्न थिच्नुहोस्, वा साथीहरूको प्रतीक्षा गर्नुहोस्।',
  'channel.send.placeholder': 'सन्देश पठाउनुहोस्…',
  'channel.send.button':  'पठाउनुहोस्',

  'voice.ptt.hold':       'बोल्न थिच्नुहोस्',
  'voice.ptt.transmitting': 'प्रसारण',
  'voice.ptt.release':    'छोड्नुहोस्',
  'voice.ptt.label':      'थिचेर बोल्ने',
  'voice.vox.on':         'VOX सक्रिय',
  'voice.vox.off':        'VOX निष्क्रिय',
  'voice.vox.sub':        'हात-मुक्त · आवाजबाट सक्रिय',
  'voice.remote.talking': 'बोल्दै',

  'sos.button.label':     'SOS',
  'sos.button.sub':       'समूहलाई तपाईंको स्थान प्रसारण गर्दछ',
  'sos.confirm.title':    'SOS पठाउने?',
  'sos.confirm.body':     'यो प्रत्येक साथीलाई आपतकालीन संकेत पठाउँछ। साँचो आपतकालमा मात्र प्रयोग गर्नुहोस्।',
  'sos.confirm.cancel':   'रद्द',
  'sos.confirm.send':     'SOS पठाउनुहोस्',
  'sos.message.broadcast':'SOS — समूहलाई स्थान प्रसारण गर्दै।',

  'tab.channel': 'च्यानल',
  'tab.peers':   'साथी',
  'tab.map':     'नक्सा',
  'tab.groups':  'समूह',
  'tab.settings':'सेटिङ',

  'peers.title': 'समूह सूची',
  'peers.sub':   'तपाईं · #{senderId} · {role} · {count} साथी पुग्यो',
  'peers.empty.title': 'कुनै साथी छैन',
  'peers.empty.body':  'नजिकका उपकरणहरू खोज्दै।',

  'map.title': 'समूह नक्सा',
  'map.sub':   'अनुमानित स्थानहरू',

  'groups.title':         'समूहहरू',
  'groups.sub':           'समूह छान्नुहोस् वा कोडले जोडिनुहोस्',
  'groups.join.label':    'कोडले जोडिनुहोस्',
  'groups.join.placeholder': 'जस्तै ANP-7Q',
  'groups.join.button':   'जोडिनुहोस्',
  'groups.peers':         'साथी',
  'groups.active':        'सक्रिय',

  'onb.welcome.title':    'ECHO',
  'onb.welcome.body':     'पहाडमा सानो समूहको लागि रेडियो — इन्टरनेट चाहिँदैन। प्रत्येक फोनले अरूको लागि रिले गर्दछ।',
  'onb.welcome.cta':      'अगाडि',
  'onb.name.title':       'आफ्नो नाम छान्नुहोस्',
  'onb.name.body':        'साथीहरूले यो देख्नेछन्।',
  'onb.name.placeholder': 'जस्तै PEMA',
  'onb.id.title':         '२-अक्षरको ID छान्नुहोस्',
  'onb.id.body':          'तपाईंको नामसँगै देखिने छोटो ट्याग।',
  'onb.mode.title':       'मुख्य मोड',
  'onb.mode.body':        'पछि सेटिङबाट बदल्न सकिन्छ।',
  'onb.privacy.title':    'गोपनीयता',
  'onb.privacy.body':     'Echo ले कुनै पनि कुरा इन्टरनेटमा पठाउँदैन। सन्देश तपाईंको समूहका फोनहरूमै रहन्छन्।',
  'onb.done':             'समूहमा जोडिनुहोस्',
  'onb.back':             'पछाडि',
  'onb.continue':         'अगाडि',

  'settings.title':       'सेटिङ',
  'settings.identity':    'पहिचान',
  'settings.name':        'नाम',
  'settings.id':          'पठाउने ID',
  'settings.mode':        'पूर्वनिर्धारित मोड',
  'settings.backend':     'रुचाइएको ब्याकेन्ड',
  'settings.backend.auto':      'स्वतः',
  'settings.backend.nearby':    'NEARBY (एन्ड्रोइड)',
  'settings.backend.multipeer': 'MULTIPEER (IOS)',
  'settings.backend.ble':       'BLE (दुवै)',
  'settings.language':    'भाषा',
  'settings.diagnostics': 'डायग्नोस्टिक्स',
  'settings.diag.backend':    'सक्रिय ब्याकेन्ड',
  'settings.diag.peers':      'जोडिएका साथी',
  'settings.diag.hops':       'अधिकतम हपहरू',
  'settings.diag.messages':   'भण्डारित सन्देश',
  'settings.privacy':     'गोपनीयता नीति',
  'settings.save':        'सुरक्षित गर्नुहोस्',
  'settings.reset':       'Echo रिसेट',
  'settings.reset.confirm': 'सबै डाटा मेटाएर पुनः सुरु गर्ने?',
  'settings.about':       'बारेमा',
  'settings.version':     'संस्करण',

  'privacy.title':        'गोपनीयता नीति',
};

const TABLE: Record<Locale, Strings> = { en: EN, ne: NE };

let active: Locale = detectInitialLocale();
const subs = new Set<(l: Locale) => void>();

function detectInitialLocale(): Locale {
  let raw: string | undefined;
  if (Platform.OS === 'ios') {
    raw = NativeModules.SettingsManager?.settings?.AppleLocale
       ?? NativeModules.SettingsManager?.settings?.AppleLanguages?.[0];
  } else {
    raw = NativeModules.I18nManager?.localeIdentifier;
  }
  if (raw && raw.toLowerCase().startsWith('ne')) return 'ne';
  return 'en';
}

export function getLocale(): Locale { return active; }

export async function setLocale(loc: Locale): Promise<void> {
  active = loc;
  await AsyncStorage.setItem('echo.locale', loc);
  subs.forEach((cb) => cb(loc));
}

export async function loadStoredLocale(): Promise<void> {
  try {
    const stored = await AsyncStorage.getItem('echo.locale');
    if (stored === 'en' || stored === 'ne') {
      active = stored;
      subs.forEach((cb) => cb(active));
    }
  } catch {
    // ignore
  }
}

/** Lookup a string by key. Optional vars are interpolated with {name}. */
export function t(key: string, vars?: Record<string, string | number>): string {
  const table = TABLE[active] ?? EN;
  let s = table[key] ?? EN[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return s;
}

/** Hook that re-renders when locale changes. */
export function useLocale(): Locale {
  const [, setN] = useState(0);
  useEffect(() => {
    const cb = () => setN((n) => n + 1);
    subs.add(cb);
    return () => { subs.delete(cb); };
  }, []);
  return active;
}
