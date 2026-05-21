# Echo

Offline mesh communication for trekkers and riders. No internet, no servers — each phone relays for the others.

This repository is **Stage 1: a UI prototype that runs in Expo Go.** All UI is wired against a mock mesh layer (fake peers, fake messages, simulated voice activity) so the entire app architecture can be exercised on a stock phone with zero native code.

## Run it

```bash
npm install
npx expo start
```

Scan the QR with **Expo Go** on a physical phone. No native build required.

Useful scripts:

```bash
npm run typecheck   # TS strict mode, no any in domain types
npm run android     # open Android via Expo Go
npm run ios         # open iOS via Expo Go
```

## Screens

| Route       | Purpose                                                                 |
|-------------|-------------------------------------------------------------------------|
| `/`         | **Live Channel** — connection bar, Trek/Ride toggle, thread, voice, SOS |
| `/peers`    | **Group roster** — peer chips with platform + role + battery readouts   |
| `/map`      | **Group map** — stylized dark canvas (SVG) with peer pins, SOS markers  |
| `/groups`   | **Group select** — pick a group or join via code                        |

## Stage 1 / Stage 2 split

The whole point of Stage 1 is that the UI never talks to the transport directly. It depends only on the `MeshTransport` interface in `src/mesh/MeshTransport.ts`.

```
src/mesh/
  types.ts          # Peer, EchoMessage, MeshState, enums
  MeshTransport.ts  # the interface — STAGE-2 plug point
  MockTransport.ts  # Stage-1 fake mesh (timers + random)
  useMesh.ts        # Zustand store; subscribes to the active transport
```

**Stage 2 swap:** Replace `MockTransport` with a real native implementation of `MeshTransport`:
- Android: Nearby Connections / BLE advertising + GATT
- iOS: MultipeerConnectivity / Core Bluetooth

That change happens in **one line of `useMesh.ts`** (`const transport: MeshTransport = …`). No screens or components change.

## Design system

Dark-first “field instrument.” The motif is an expanding ripple = a signal leaving a node.

- One dominant signal color (`#00E6C7`) marks anything live/connected/transmitting.
- `sos` red (`#FF4438`) is reserved for emergencies — used nowhere else.
- Display font: **Saira Condensed** (UPPERCASE, condensed) for headings and buttons.
- Mono font: **JetBrains Mono** for every system readout — peer counts, hops, sender IDs, delivery status.

Tokens live in `src/theme/tokens.ts`.

## What this prototype does NOT do

- No BLE / WiFi / Nearby / Multipeer / WebRTC / audio streaming. All mocked.
- No real networking, no real audio. Timers + `Math.random` simulate peer churn, incoming messages, delivery progression, and remote talkers.
- All animation respects `AccessibilityInfo.isReduceMotionEnabled()` — falls back to static glows.

## Tech

- Expo SDK 51 (managed workflow) + React Native + TypeScript (strict).
- `expo-router` (file-based routing).
- `zustand` for state.
- `expo-haptics` for button feedback.
- `react-native-reanimated` for ripples / pulses / equalizer.
- `react-native-svg` for the map and markers.
