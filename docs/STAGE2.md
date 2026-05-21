# Echo — Stage 2: real native mesh

This document describes how Stage 2 was scaffolded, what is real, what is stubbed, and how to take it from here to a working device-to-device build.

> Stage 1 (Expo Go UI prototype) is unaffected. With `EXPO_PUBLIC_FORCE_MOCK_MESH=1` or when running in Expo Go, the app still boots on the mock transport.

## What changed

### Toolchain

- App config moved from `app.json` to a typed `app.config.ts`. Permissions, NSDescriptions, Bonjour services, background modes, and `expo-build-properties` settings all live there.
- Added `expo-dev-client`, `expo-build-properties`, `expo-modules-core`, and `@expo/config-plugins`.
- `eas.json` defines `development` (dev-client), `preview`, and `production` build profiles.
- An in-tree config plugin (`plugin/`) registers the mesh foreground service in the Android manifest.

### Native modules

Two local Expo modules live under `modules/`:

| Module        | Purpose                                                              |
|---------------|----------------------------------------------------------------------|
| `echo-mesh`   | Discovery + transport: Nearby Connections (Android), Multipeer (iOS), BLE (cross-platform fallback). |
| `echo-audio`  | Voice pipeline: mic capture → VAD → Opus encode; jitter buffer → Opus decode → playback. |

Each module ships:

- A TypeScript bridge (`index.ts`) with strict types in `*.types.ts`.
- Android: Kotlin module DSL (`*Module.kt`) + per-backend implementation files (`NearbyMesh.kt`, `BleMesh.kt`, etc.).
- iOS: Swift module class (`*Module.swift`) + per-backend implementation files.
- `expo-module.config.json` so Expo autolinking picks them up at build time.

### JS-side wiring

- `src/mesh/NativeTransport.ts` — implements the existing `MeshTransport` interface over the two native modules. Conversion between the native event shapes and the JS domain types lives here.
- `src/mesh/useMesh.ts` — picks Mock or Native at runtime based on `Constants.executionEnvironment` (Expo Go → mock; dev-client/standalone → native), with `EXPO_PUBLIC_FORCE_MOCK_MESH=1` as an override.
- `src/mesh/protocol.ts` — wire frame spec shared between native backends.

## What's real vs. TODO

| Layer                                | Status                                                  |
|--------------------------------------|---------------------------------------------------------|
| App config + permissions             | ✅ Real                                                 |
| Config plugin (foreground service)   | ✅ Real                                                 |
| Native module surfaces (TS + native) | ✅ Real, methods + events callable end-to-end           |
| Wire-protocol codec (Kotlin)         | ✅ Real — `Frame.kt` mirrors `protocol.ts` byte-for-byte |
| Wire-protocol codec (Swift)          | ✅ Real — `Frame.swift` mirrors `Frame.kt` byte-for-byte |
| `EchoMesh` Android Nearby loop       | ✅ Real — advertise + discover + accept + payloads + HELLO + relay + dedup |
| `EchoMesh` iOS Multipeer loop        | ✅ Real — advertise + browse + auto-accept + HELLO + relay + dedup |
| `EchoMesh` Android BLE GATT loop     | 🟡 Skeleton — TODO(stage-2) at advertise/scan/subscribe |
| `EchoMesh` iOS Core Bluetooth loop   | 🟡 Skeleton — TODO(stage-2) at CB delegates             |
| Mesh foreground service (Android)    | 🟡 Service real, trigger from module is TODO(stage-2)   |
| `EchoAudio` mic capture (both OS)    | ✅ Real (`AudioRecord` / `AVAudioEngine`)                |
| `EchoAudio` playback (both OS)       | ✅ Real (`AudioTrack` / `AVAudioPlayerNode`)             |
| `EchoAudio` RMS VAD                  | ✅ Real                                                 |
| `EchoAudio` Opus codec               | 🟡 Passthrough PCM — TODO(stage-2) bind libopus         |
| `EchoAudio` jitter buffer            | 🟡 FIFO — TODO(stage-2) ts-sort + adaptive depth        |

Every TODO is tagged `TODO(stage-2)` in source so they can be located with grep.

## Wire protocol

Single source of truth: `src/mesh/protocol.ts`. The Kotlin and Swift backends are required to encode/decode identically (BLE is the cross-platform fallback, so a misaligned byte breaks interop between Android and iOS).

Frame:

```
0       1  magic   = 0xE0
1       1  version = 1
2       1  kind    (TEXT/SOS/VOICE/HELLO/ACK/PEER_ADV)
3       1  hop count
4       2  sender-id (ASCII, 2 chars)
6       8  group-id  (ASCII, 8 bytes, NUL-padded)
14      4  message-id (LE u32, sender-local)
18      4  ts (LE u32, unix seconds mod 2^32)
22      2  payload length (LE u16)
24      N  payload
```

## How to build and run

### Prerequisites

- Expo account + EAS CLI: `npm i -g eas-cli && eas login`
- For local builds: Android Studio (JDK 17) + Xcode 15+ command-line tools.

### Local dev (with native modules)

```bash
npm install
npx expo prebuild
npx expo run:android   # or run:ios
```

Once a dev client is installed on the device:

```bash
npm start              # = expo start --dev-client
```

Scan the QR with the dev-client app (not Expo Go).

### Remote build via EAS

```bash
eas build --profile development --platform android
eas build --profile development --platform ios   # needs Apple developer team
```

Install the resulting APK / .ipa, then `npm start` connects to it.

### Forcing the mock during dev-client work

Create `.env` with `EXPO_PUBLIC_FORCE_MOCK_MESH=1`. Useful when you're working on UI and don't have a peer device handy.

## Cross-platform interop notes

- **Android ↔ Android** uses Nearby Connections (best throughput, auto-negotiates the underlying medium).
- **iOS ↔ iOS** uses MultipeerConnectivity (Bonjour-discovered, encrypted, ~256kbps reliable).
- **Android ↔ iOS** falls back to BLE GATT. This is the slowest path (chunked frames, ~6–20 kbps real-world) — fine for text + SOS + 16kbps voice but not video.

The transport-selection preference order in `EchoMeshModule.start` controls this; native chooses the best available backend at start time.

## Next steps in priority order

1. ~~Fill in the Nearby Connections discovery → connection flow.~~ ✅ Done — Android↔Android text + SOS over Nearby with hop relay and dedup.
2. ~~Fill in the MultipeerConnectivity MCSession delegate on iOS.~~ ✅ Done — iOS↔iOS text + SOS over Multipeer with hop relay and dedup. `Frame.swift` mirrors `Frame.kt`.
3. Fill in the BLE GATT advertise/scan/subscribe/write loop on both platforms (cross-platform Android↔iOS fallback). Use the shared UUIDs in `BleMesh.{kt,swift}`.
4. Wire `pushIncomingFrame` calls from the mesh module to the audio module when a VOICE frame arrives — the two modules don't talk to each other natively yet. Easiest: a small shared singleton (`MeshAudioBridge`) on each platform.
5. Replace the Opus passthrough with a real binding.
6. Replace the FIFO jitter buffer with a ts-sorted variant + PLC.
7. Add ACK + retransmit for TEXT and SOS frames (so the UI can show real "delivered/N" status).
8. Plug `MeshForegroundService` start/stop into module lifecycle.
