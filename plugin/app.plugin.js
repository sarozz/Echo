// Self-contained config plugin in plain JavaScript so `expo start` / EAS can
// require it without a TypeScript loader. Registers the Android
// MeshForegroundService in the merged AndroidManifest at prebuild time.
//
// In Expo Go this plugin's manifest mods don't apply (there's no native
// project to mod), but the plugin must still load cleanly so config eval
// succeeds.

const { AndroidConfig, withAndroidManifest } = require('@expo/config-plugins');

function withEchoMesh(config) {
  return withAndroidManifest(config, (cfg) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    app.service = app.service || [];

    const SERVICE_NAME = 'expo.modules.echomesh.MeshForegroundService';
    const exists = app.service.some(
      (s) => s.$ && s.$['android:name'] === SERVICE_NAME,
    );
    if (!exists) {
      app.service.push({
        $: {
          'android:name': SERVICE_NAME,
          'android:exported': 'false',
          'android:foregroundServiceType': 'connectedDevice',
        },
      });
    }
    return cfg;
  });
}

module.exports = withEchoMesh;
