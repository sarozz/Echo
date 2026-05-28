---
name: run-echo
description: Run, launch, build, smoke-test, or screenshot the Echo app (Expo / React Native). Boots the web export under headless Chromium and walks through onboarding + every tab. Verifies UI changes survived without needing a phone.
---

# Run Echo

Echo is an offline-mesh React Native app (Expo SDK 51 + expo-router). It
targets phones, but the runtime auto-detects non-native environments and
falls back to `MockTransport` (the Stage 1 mock layer with fake peers and
messages). That makes the **web export** the realistic agent-drivable
surface: it boots in headless Chromium, the mock transport fakes the
mesh, and Playwright can drive the whole flow.

Paths in this file are relative to the project root.

## Prerequisites

This environment ships everything needed:

- Node 22, npm 10 at `/opt/node22/bin/`.
- Playwright + Chromium pre-installed; browsers at `/opt/pw-browsers`.

No `apt-get` needed.

## Run (agent path) — verified

One command. Builds the web bundle, serves it with SPA fallback, drives
through onboarding and every tab, leaves the server running for ad-hoc
poking.

```bash
bash .claude/skills/run-echo/run.sh
```

You'll see 12 ✓ steps:

```
✓ load app
✓ welcome → language
✓ language → name
✓ enter name
✓ name → id
✓ id → mode
✓ mode → privacy
✓ finish onboarding → channel
✓ go to /peers
✓ go to /map
✓ go to /groups
✓ go to /settings
```

Screenshots land in `./screenshots/` — `01-welcome.png` through
`12-settings.png`. Look at them, especially `08-channel.png` (mesh active
with mock peers) and `10-map.png` (topographic map with self pin).

After the script returns, the server stays up at `http://localhost:8080`
so you can poke at it:

```bash
# Inspect a specific route
curl -s http://localhost:8080/peers | grep -o '<title>.*</title>'

# Drive your own Playwright session
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node -e "
import('playwright').then(async ({ chromium }) => {
  const b = await chromium.launch();
  const p = await (await b.newContext()).newPage();
  await p.goto('http://localhost:8080');
  await p.screenshot({ path: 'foo.png' });
  await b.close();
});
"

# Stop the server when done
kill $(cat /tmp/echo-serve.pid)
```

## Re-run after a code change

```bash
bash .claude/skills/run-echo/run.sh
```

The script kills the previous server, rebuilds the bundle, restarts, and
re-runs the smoke. A full cycle is ~30–60 s depending on metro caching.

If you only want to rebuild without re-running smoke:

```bash
bash .claude/skills/run-echo/run.sh --no-smoke
```

## What the harness contains

```
.claude/skills/run-echo/
  SKILL.md         ← this file
  run.sh           ← export + serve + smoke launcher
  serve-spa.mjs    ← 50-line static server with SPA fallback (npm's
                     `serve` and `http-server` both have quirks here)
  smoke.mjs        ← Playwright driver: 12 named steps, screenshots
                     per step, summary table on exit
```

## Run (human path)

For interactive dev with hot reload, on a phone:

```bash
npx expo start --tunnel    # then scan with SDK 51 Expo Go
```

Useless headless — the QR points to a dev server expecting an actual
Expo Go client to connect.

## Direct invocation

Most layout / styling / state-management PRs only need the web smoke
above. For changes to the **native modules** under `modules/` (BLE,
Nearby Connections, MultipeerConnectivity, audio), there is no agent
path — they require a dev-client build on a real phone. `eas build
--profile development --platform android` is the relevant command;
expect 10–15 min.

The mesh layer behind those modules is testable in pure JS via the
`MockTransport` selected when `Constants.executionEnvironment !==
StoreClient`. The smoke already exercises this path.

## Gotchas

These all bit me when I built this harness; future-you will probably
hit them too if the relevant code changes.

- **Don't return `<Redirect>` from `app/_layout.tsx`.** It throws
  "Attempted to navigate before mounting the Root Layout" because the
  navigator isn't initialised at that point. Gate inside a screen
  (`app/index.tsx` does it for the onboarding check) — Tabs are mounted
  by the time a screen renders, so `<Redirect>` works there.

- **`expo-sqlite` doesn't load on web.** `SQLite.openDatabaseSync`
  throws `NativeDatabase is not a constructor`. `src/mesh/persistence.ts`
  detects `Platform.OS === 'web'` and uses an in-memory map instead.
  Any new function added there needs the same `USE_MEMORY` branch.

- **`expo-haptics` calls produce page errors on web** ("Haptic.X is not
  available on web"). They're harmless — the promise rejection is
  unhandled but doesn't break rendering. They're noise in the page-error
  log; ignore.

- **Don't call hooks inside `.map`.** Settings screen had
  `useLocale()` inside a `LOCALES.map(...)` callback, which violates
  rules of hooks and crashes the settings screen on first render
  (React error #310). Call `getLocale()` (non-hook) inside loops, lift
  `useLocale()` to component top.

- **`serve` and `http-server` both fail at one job each.** The
  `serve` CLI (v14+) ignores `-l 8080` and binds to an ephemeral port
  in some shells. `http-server` doesn't do SPA fallback by default,
  so deep links (`/peers`, `/onboarding`) 404. The bundled
  `serve-spa.mjs` does both correctly in ~50 lines.

- **Tab bar isn't where you'd expect on a small viewport.** The smoke
  navigates by URL (`page.goto(URL + '/peers')`) instead of clicking
  the tab. URL-based nav is more reliable across viewport sizes and
  matches what the tab press does internally anyway.

- **First export is slow.** Metro's font transform on the
  `@expo-google-fonts/*` weights takes ~30 s. Subsequent exports hit
  cache and finish in ~5 s. If a build is mysteriously frozen, tail
  `/tmp/echo-export.log` — it's chatty.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `EADDRINUSE: 0.0.0.0:8080` from `run.sh` | A previous server is alive. `run.sh` calls `fuser -k -TERM 8080/tcp` at the top, but if `fuser` isn't available, run `lsof -ti:8080 \| xargs -r kill` manually. |
| Smoke fails at `load app` with a blank screenshot | Page errors will be printed in the summary's "page errors" section — look there. If it's "Attempted to navigate before mounting" you've probably reintroduced a `<Redirect>` in `app/_layout.tsx`. |
| Smoke fails at `enter name` | The text input couldn't be filled — usually means `react-native-web` lost or changed how it renders `TextInput`. Inspect `screenshots/fail-enter-name.png`. |
| `npx expo export` exits 1 with no useful output | Tail `/tmp/echo-export.log`. Common cause: a missing import (TS typecheck would have caught it — run `npm run typecheck` first). |
| Smoke passes but Playwright says "Browser not found" | `PLAYWRIGHT_BROWSERS_PATH` isn't `/opt/pw-browsers`. The `run.sh` script sets it; if invoking `smoke.mjs` directly, export the var first. |
| All steps fail instantly with "tap target not found" | The text-finding helper in `smoke.mjs` is brittle to label changes. If you renamed e.g. `CONTINUE` to `NEXT`, update the corresponding `tapByText` arg in `smoke.mjs`. |
