# Echo — store submission kit

This directory packages everything needed for a first App Store + Play Store
submission, generated from the same design tokens the app uses at runtime.

```
store/
  README.md                       ← this file
  copy/
    listing.en.md                 ← English listing copy (Apple + Play)
    listing.ne.md                 ← Nepali listing copy
  assets/                         ← generated images, regenerate with the scripts below
  generate-screenshots.mjs        ← screenshots for Apple/Play at exact spec sizes
  generate-feature-graphic.mjs    ← Play Store feature graphic (1024 × 500)
```

## Regenerate the screenshots

```bash
node store/generate-screenshots.mjs
```

Outputs PNGs at the exact spec sizes the stores require:

- **App Store (iPhone 6.7"):** 1290 × 2796, one per scene (channel, peers, map, splash)
- **Play Store (phone):** 1080 × 1920, same scenes

## Regenerate the Play Store feature graphic

```bash
node store/generate-feature-graphic.mjs
```

Outputs `feature-graphic.png` at 1024 × 500 RGB (no alpha, no rounded
corners) — the spec the Play Console requires for the top-of-listing
banner. Drawn from the same design tokens, so the wordmark, vignette,
and signal teal match the in-app look.

These are marketing mockups, not device captures — they're useful for the
first submission and for marketing pages. For ongoing store assets, capture
on real devices with the dev client:

```bash
# Android
adb shell screencap -p /sdcard/echo-channel.png && adb pull /sdcard/echo-channel.png

# iOS (Xcode)
Window → Devices and Simulators → select your device → Take Screenshot
```

## What's NOT in this kit (yet)

- App icon variants — `assets/icon.png` at the root is the canonical source.
- App preview videos — TODO, capture from device.
- Localized screenshots for `ne` — the same scenes render fine, but the
  in-app text is currently English-only in the mockups. Generate from a
  device set to Nepali for the real submission.
