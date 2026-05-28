# Echo

Offline mesh communication for trekkers and riders. No internet, no servers — each phone relays for the others.

This repo carries two stages of the build:

- **Stage 1 — Expo Go UI prototype.** Entire UI wired against `MockTransport` (timers + `Math.random`), runs on a stock phone via QR.
- **Stage 2 — real native mesh (in progress).** Dev-client conversion, in-tree Expo modules for BLE / Nearby Connections / MultipeerConnectivity, real mic capture + playback for voice. Discovery/payload loops are skeleton'd with `TODO(stage-2)` markers — see [`docs/STAGE2.md`](docs/STAGE2.md).

## Run it

### Stage 1 — Expo Go

```bash
npm install
npm run start:go          # = expo start (no dev client needed)
```

Scan the QR with **Expo Go**. App auto-selects `MockTransport` because Expo Go can't load native modules.

### Stage 2 — dev client (real modules)

```bash
npm install
npx expo prebuild
npx expo run:android      # or run:ios
npm start                 # = expo start --dev-client
```

Or remote build via EAS:

```bash
eas build --profile development --platform android
```

Force the mock during dev-client work by setting `EXPO_PUBLIC_FORCE_MOCK_MESH=1` in `.env`.

### Useful scripts

```bash
npm run typecheck         # TS strict mode
npm run prebuild          # generate ./android + ./ios from app.config.ts
npm run prebuild:clean    # wipe and regenerate
```

## Screens

| Route       | Purpose                                                                 |
|-------------|-------------------------------------------------------------------------|
| `/`         | **Live Channel** — connection bar, Trek/Ride toggle, thread, voice, SOS |
| `/peers`    | **Group roster** — peer chips with platform + role + battery readouts   |
| `/map`      | **Group map** — stylized dark canvas (SVG) with peer pins, SOS markers  |
| `/groups`   | **Group select** — pick a group or join via code                        |

## Architecture

The UI only ever depends on the `MeshTransport` interface. Mock and native are swapped in one place (`src/mesh/useMesh.ts`); screens are unaware.

```
src/mesh/
  types.ts            # Peer, EchoMessage, MeshState, enums
  MeshTransport.ts    # interface — the one seam
  MockTransport.ts    # Stage-1 fake mesh
  NativeTransport.ts  # Stage-2 impl over echo-mesh + echo-audio
  protocol.ts         # wire frame spec (Kotlin/Swift mirror it byte-for-byte)
  useMesh.ts          # Zustand store; runtime-picks Mock or Native
modules/
  echo-mesh/          # Nearby + Multipeer + BLE
  echo-audio/         # mic + playback + VAD + (passthrough) Opus
plugin/               # in-tree config plugin (foreground service)
```

See [`docs/STAGE2.md`](docs/STAGE2.md) for the full Stage 2 status table and build instructions.

## Design system

Dark-first "field instrument." The motif is an expanding ripple = a signal leaving a node.

- One dominant signal color (`#00E6C7`) marks anything live/connected/transmitting.
- `sos` red (`#FF4438`) is reserved for emergencies — used nowhere else.
- Display font: **Saira Condensed** (UPPERCASE, condensed) for headings and buttons.
- Mono font: **JetBrains Mono** for every system readout — peer counts, hops, sender IDs, delivery status.

Tokens live in `src/theme/tokens.ts`.

## Tech

- Expo SDK 51 + React Native 0.74 + TypeScript (strict).
- `expo-router` (file-based routing).
- `zustand` for state.
- `expo-haptics` for button feedback.
- `react-native-reanimated` for ripples / pulses / equalizer.
- `react-native-svg` for the map and markers.
- Stage 2: `expo-dev-client`, `expo-modules-core`, `expo-build-properties`, `@expo/config-plugins`. In-tree Kotlin (`play-services-nearby`) and Swift (`MultipeerConnectivity`, `CoreBluetooth`, `AVFoundation`) modules.
