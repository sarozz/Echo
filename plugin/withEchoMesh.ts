import {
  AndroidConfig,
  ConfigPlugin,
  withAndroidManifest,
} from '@expo/config-plugins';

/**
 * Adds the in-tree native pieces that Echo's mesh + audio modules expect:
 *   - declares a foreground service used to keep the mesh alive when the
 *     screen locks (mesh + connectedDevice service type).
 *
 * Permissions themselves come from app.config.ts (`android.permissions`) so
 * they remain reviewable in one place. NSDescriptions / NSBonjourServices /
 * UIBackgroundModes are likewise declared in app.config.ts under `ios.infoPlist`.
 */
export const withEchoMesh: ConfigPlugin = (config) => {
  config = withAndroidManifest(config, (cfg) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    app.service = app.service ?? [];

    const exists = app.service.some(
      (s) => s.$['android:name'] === 'expo.modules.echomesh.MeshForegroundService',
    );
    if (!exists) {
      // `foregroundServiceType` is a valid AndroidManifest attribute but
      // @expo/config-plugins' typings don't list it. The XML serializer
      // accepts any string keys, so the cast is purely a typings hack.
      const attrs = {
        'android:name': 'expo.modules.echomesh.MeshForegroundService',
        'android:exported': 'false',
        'android:foregroundServiceType': 'connectedDevice',
      } as unknown as { 'android:name': string; 'android:exported': 'false' };
      app.service.push({ $: attrs });
    }
    return cfg;
  });

  return config;
};
