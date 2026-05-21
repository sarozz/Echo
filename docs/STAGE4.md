# Echo — Stage 4: privacy, presence, polish

Stage 4 closes the gap between "works on a bench" and "could be shipped." It
adds end-to-end encryption, real GPS, background notifications, a CI
guard, and a store submission kit.

## What landed

### Group encryption (AES-GCM-256)

- New `Crypto.kt` / `Crypto.swift` per-group key store. Keys derive from
  the group's join code:

  ```
  key = PBKDF2-HMAC-SHA256(
          password = group.code,
          salt     = "echo:" + group.id,
          iters    = 100_000,
          outBytes = 32,
        )
  ```

- Wire-protocol change (still v1, fully backward-compatible):
  bit 7 of the `hopCount` byte now flags an encrypted frame. Low 7 bits
  remain the hop count. Encrypted payloads are `nonce(12) | ct | tag(16)`.
- Encrypted kinds: `TEXT`, `SOS`, `VOICE`, `LOCATION_ADV`. Clear kinds:
  `HELLO`, `ACK`, `PEER_ADV` — needed for discovery and delivery receipts.
- Relay preserves the encrypted bytes byte-for-byte at every hop. Devices
  without the key still relay so other group members can decode.
- `setGroupSecret(groupId, code)` / `clearGroupSecret(groupId)` expose
  key management to JS. `useMesh` pushes every known group's code at
  bootstrap.

### Real GPS via LOCATION_ADV

- New encrypted wire kind `LOCATION_ADV = 0x07`. Payload is JSON
  `{lat, lon, acc}`.
- `expo-location` watches position at Balanced accuracy / 30s / 25m
  thresholds, with 20s + 15m hysteresis on the broadcast to keep
  bandwidth available for messaging.
- Opt-in: `identity.shareLocation` defaults to false. Toggle in Settings.
- Map screen projects everyone with coords onto a computed viewport;
  peers without coords fall back to the hashed positions from earlier
  stages so the screen still works on partial data.

### Background notifications

- `expo-notifications` with two Android channels: `echo.messages`
  (DEFAULT importance) and `echo.sos` (MAX, DND bypass, red light).
- TEXT pops only when AppState != 'active'; SOS always pops, even
  in-foreground. VOICE / HELLO / ACK / LOCATION_ADV are silent.

### CI

- `.github/workflows/ci.yml` runs `npm ci && npm run typecheck` on push
  and PR. Node 22, matching the local dev environment.

### Store submission kit

- `store/copy/listing.en.md` and `listing.ne.md` cover the App Store /
  Play Store tagline, short description, promo text, full description,
  keywords, and a release-notes seed.
- `store/generate-screenshots.mjs` is a zero-dep Node script that draws
  marketing mockups (channel / peers / map / splash) at exact store sizes
  (1290 × 2796 for iPhone 6.7", 1080 × 1920 for Android phone) directly
  from the design tokens. Output: `store/assets/`.
- Real-device captures are documented in `store/README.md` for the
  ongoing store-page lifecycle.

## Transport selection (Stage 4 revision)

BLE was originally listed alongside Nearby Connections and MultipeerConnectivity in the Stage 1 spec, but its outdoor range (~10-30 m line-of-sight) is too short for the trekking and motorcycle-convoy use cases this app is built for. The native code remains as an opt-in fallback for emergencies, but:

- `identity.backendPref` defaults to `auto`.
- `auto` resolves to `prefer = ['nearby', 'multipeer']` — **no BLE by default**.
- BLE is selected only when the user explicitly picks "BLE FALLBACK · SHORT RANGE ~30M" in Settings → Preferred Backend.
- Same-platform mesh works out of the box: Android↔Android via Nearby Connections (Wi-Fi-mediated, ~100-200 m); iOS↔iOS via MultipeerConnectivity (Wi-Fi peer-to-peer, similar range).
- Android↔iOS interop is the open trade-off — only possible today by opting both sides into BLE, with the range cost. A future Wi-Fi hotspot pattern (one phone hosts an AP that the others join) would solve this without BLE.

## What's still TODO

- iOS Opus codec — Stage 2 documented the libopus pod vs. AudioConverter
  trade-off; still not wired.
- Cross-platform interop without BLE — Wi-Fi hotspot pattern is the
  candidate; needs UI for picking a host and acknowledging that hosting
  costs the host's cellular data.
- BLE chunking for VOICE frames over MTU — current cap is ~500 bytes,
  fine for TEXT/SOS, voice fragments need reassembly.
- Real-device build / on-device QA — none of the Stage 2-4 native code
  has touched real silicon. TS strict typecheck passes per commit.
- Onboarding tutorial — the wizard collects identity but doesn't walk
  users through their first message + SOS.
- Feature graphic / app preview video for Play Store.
- Localized screenshots for Nepali store pages.

## Build + test on a device

```bash
npm install
npx expo prebuild
npx expo run:android      # or run:ios
npm start                 # = expo start --dev-client

# Remote build:
eas build --profile development --platform android
eas build --profile development --platform ios
```

The CI workflow gates regressions; failing typecheck blocks merges.
