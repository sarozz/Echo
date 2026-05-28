import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'Echo',
  slug: 'echo',
  version: '0.2.0',
  scheme: 'echo',
  orientation: 'portrait',
  userInterfaceStyle: 'dark',
  icon: './assets/icon.png',
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'app.echo.prototype',
    infoPlist: {
      // BLE
      NSBluetoothAlwaysUsageDescription:
        'Echo uses Bluetooth to find and message nearby phones when there is no internet.',
      NSBluetoothPeripheralUsageDescription:
        'Echo uses Bluetooth to relay messages to and from nearby phones.',
      // MultipeerConnectivity — Bonjour services advertised on the local network
      NSLocalNetworkUsageDescription:
        'Echo uses the local network to form a peer-to-peer mesh with nearby phones.',
      NSBonjourServices: ['_echo._tcp', '_echo._udp'],
      // Voice
      NSMicrophoneUsageDescription:
        'Echo uses your microphone for push-to-talk and hands-free voice on the mesh.',
      // Background modes — keep mesh + audio alive when screen locks
      UIBackgroundModes: ['bluetooth-central', 'bluetooth-peripheral', 'audio', 'voip'],
    },
  },
  android: {
    package: 'app.echo.prototype',
    adaptiveIcon: {
      foregroundImage: './assets/icon.png',
      backgroundColor: '#080B0C',
    },
    permissions: [
      // BLE (Android 12+)
      'android.permission.BLUETOOTH_CONNECT',
      'android.permission.BLUETOOTH_SCAN',
      'android.permission.BLUETOOTH_ADVERTISE',
      // BLE (pre-12)
      'android.permission.BLUETOOTH',
      'android.permission.BLUETOOTH_ADMIN',
      // Location — required for BLE scan and Nearby on older Android
      'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.ACCESS_COARSE_LOCATION',
      // Nearby Connections
      'android.permission.ACCESS_WIFI_STATE',
      'android.permission.CHANGE_WIFI_STATE',
      'android.permission.NEARBY_WIFI_DEVICES',
      // Voice
      'android.permission.RECORD_AUDIO',
      'android.permission.MODIFY_AUDIO_SETTINGS',
      // Keep mesh alive
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_CONNECTED_DEVICE',
      'android.permission.POST_NOTIFICATIONS',
    ],
  },
  plugins: [
    'expo-router',
    'expo-dev-client',
    'expo-location',
    'expo-notifications',
    [
      'expo-splash-screen',
      {
        image: './assets/splash.png',
        resizeMode: 'contain',
        backgroundColor: '#080B0C',
      },
    ],
    [
      'expo-build-properties',
      {
        android: {
          minSdkVersion: 26,
          compileSdkVersion: 34,
          targetSdkVersion: 34,
          // Nearby Connections requires play-services-nearby. Pinned here so EAS
          // builds include it deterministically.
          extraMavenRepos: [],
        },
        ios: {
          deploymentTarget: '16.4',
        },
      },
    ],
    './plugin/app.plugin.js',
  ],
  experiments: {
    typedRoutes: false,
  },
};

export default config;
