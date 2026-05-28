#!/usr/bin/env node
/**
 * Generates marketing-grade mockup screenshots for the App Store and Play
 * Store directly from the Echo design tokens.
 *
 * This script doesn't run the app — it composes a PNG from the same colours
 * and typography rules the runtime uses, sized for each store's exact spec:
 *
 *   - iPhone 6.7" portrait:        1290 × 2796 (Apple App Store)
 *   - Android phone portrait:      1080 × 1920 (Google Play Store)
 *
 * For real device screenshots, run the dev client on a phone and capture
 * via Xcode / adb screencap. These mockups are placeholders for first
 * submission and for marketing pages.
 */

import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const COLORS = {
  bg:      [0x08, 0x0B, 0x0C],
  bg2:     [0x0C, 0x11, 0x13],
  surface: [0x11, 0x18, 0x1B],
  surface2:[0x18, 0x22, 0x26],
  hairline:[0x22, 0x2F, 0x34],
  tx:      [0xEA, 0xF3, 0xF2],
  tx2:     [0x9F, 0xB3, 0xB4],
  tx3:     [0x5E, 0x73, 0x76],
  txOn:    [0x04, 0x10, 0x0E],
  signal:  [0x00, 0xE6, 0xC7],
  signal3: [0x0A, 0x63, 0x56],
  sos:     [0xFF, 0x44, 0x38],
  ok:      [0x39, 0xD9, 0x8A],
  android: [0x3D, 0xDC, 0x84],
  ios:     [0x64, 0xC8, 0xFF],
};

/* ----- 5x7 bitmap font (uppercase, digits, basic punct) --------------- */

const FONT = {
  ' ': '00000\n00000\n00000\n00000\n00000\n00000\n00000',
  'A': '01110\n10001\n10001\n11111\n10001\n10001\n10001',
  'B': '11110\n10001\n10001\n11110\n10001\n10001\n11110',
  'C': '01111\n10000\n10000\n10000\n10000\n10000\n01111',
  'D': '11110\n10001\n10001\n10001\n10001\n10001\n11110',
  'E': '11111\n10000\n10000\n11110\n10000\n10000\n11111',
  'F': '11111\n10000\n10000\n11110\n10000\n10000\n10000',
  'G': '01111\n10000\n10000\n10011\n10001\n10001\n01111',
  'H': '10001\n10001\n10001\n11111\n10001\n10001\n10001',
  'I': '11111\n00100\n00100\n00100\n00100\n00100\n11111',
  'J': '00001\n00001\n00001\n00001\n00001\n10001\n01110',
  'K': '10001\n10010\n10100\n11000\n10100\n10010\n10001',
  'L': '10000\n10000\n10000\n10000\n10000\n10000\n11111',
  'M': '10001\n11011\n10101\n10001\n10001\n10001\n10001',
  'N': '10001\n11001\n10101\n10101\n10011\n10001\n10001',
  'O': '01110\n10001\n10001\n10001\n10001\n10001\n01110',
  'P': '11110\n10001\n10001\n11110\n10000\n10000\n10000',
  'Q': '01110\n10001\n10001\n10001\n10101\n10010\n01101',
  'R': '11110\n10001\n10001\n11110\n10100\n10010\n10001',
  'S': '01111\n10000\n10000\n01110\n00001\n00001\n11110',
  'T': '11111\n00100\n00100\n00100\n00100\n00100\n00100',
  'U': '10001\n10001\n10001\n10001\n10001\n10001\n01110',
  'V': '10001\n10001\n10001\n10001\n10001\n01010\n00100',
  'W': '10001\n10001\n10001\n10001\n10101\n11011\n10001',
  'X': '10001\n10001\n01010\n00100\n01010\n10001\n10001',
  'Y': '10001\n10001\n01010\n00100\n00100\n00100\n00100',
  'Z': '11111\n00001\n00010\n00100\n01000\n10000\n11111',
  '0': '01110\n10001\n10011\n10101\n11001\n10001\n01110',
  '1': '00100\n01100\n00100\n00100\n00100\n00100\n01110',
  '2': '01110\n10001\n00001\n00010\n00100\n01000\n11111',
  '3': '11110\n00001\n00001\n01110\n00001\n00001\n11110',
  '4': '00010\n00110\n01010\n10010\n11111\n00010\n00010',
  '5': '11111\n10000\n11110\n00001\n00001\n10001\n01110',
  '6': '01110\n10000\n10000\n11110\n10001\n10001\n01110',
  '7': '11111\n00001\n00010\n00100\n01000\n01000\n01000',
  '8': '01110\n10001\n10001\n01110\n10001\n10001\n01110',
  '9': '01110\n10001\n10001\n01111\n00001\n00001\n01110',
  '·': '00000\n00000\n00000\n00100\n00000\n00000\n00000',
  '#': '01010\n01010\n11111\n01010\n11111\n01010\n01010',
  '-': '00000\n00000\n00000\n11111\n00000\n00000\n00000',
  '.': '00000\n00000\n00000\n00000\n00000\n00000\n00100',
  ':': '00000\n00100\n00000\n00000\n00000\n00100\n00000',
  '!': '00100\n00100\n00100\n00100\n00100\n00000\n00100',
  '?': '01110\n10001\n00001\n00010\n00100\n00000\n00100',
  '%': '11001\n11010\n00100\n01000\n10000\n01011\n10011',
  ',': '00000\n00000\n00000\n00000\n00100\n00100\n01000',
  '✓': '00001\n00010\n00100\n10100\n01000\n00000\n00000',
  '⟳': '01110\n10001\n10000\n01110\n00010\n10001\n01110',
};

function drawChar(canvas, ch, x, y, scale, rgb) {
  const glyph = FONT[ch] || FONT[' '];
  const rows = glyph.split('\n');
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    for (let c = 0; c < row.length; c++) {
      if (row[c] !== '1') continue;
      fillRect(canvas, x + c * scale, y + r * scale, scale, scale, rgb);
    }
  }
}

function drawText(canvas, text, x, y, scale, rgb, letterSpacing = 0) {
  const text2 = String(text).toUpperCase();
  let cx = x;
  for (const ch of text2) {
    drawChar(canvas, ch, cx, y, scale, rgb);
    cx += 5 * scale + letterSpacing + scale; // 1 px gap
  }
  return cx - x;
}

function textWidth(text, scale, letterSpacing = 0) {
  const text2 = String(text).toUpperCase();
  return text2.length * (5 * scale + letterSpacing + scale) - (letterSpacing + scale);
}

function fillRect(canvas, x, y, w, h, rgb, alpha = 1) {
  const { width, height, pixels } = canvas;
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(width, Math.floor(x + w));
  const y1 = Math.min(height, Math.floor(y + h));
  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      const i = (py * width + px) * 4;
      pixels[i] = Math.round(pixels[i] * (1 - alpha) + rgb[0] * alpha);
      pixels[i + 1] = Math.round(pixels[i + 1] * (1 - alpha) + rgb[1] * alpha);
      pixels[i + 2] = Math.round(pixels[i + 2] * (1 - alpha) + rgb[2] * alpha);
      pixels[i + 3] = 0xFF;
    }
  }
}

function strokeRect(canvas, x, y, w, h, rgb, lineWidth = 2) {
  fillRect(canvas, x, y, w, lineWidth, rgb);
  fillRect(canvas, x, y + h - lineWidth, w, lineWidth, rgb);
  fillRect(canvas, x, y, lineWidth, h, rgb);
  fillRect(canvas, x + w - lineWidth, y, lineWidth, h, rgb);
}

function fillCircle(canvas, cx, cy, r, rgb, alpha = 1) {
  const { width, height, pixels } = canvas;
  const x0 = Math.max(0, Math.floor(cx - r - 1));
  const y0 = Math.max(0, Math.floor(cy - r - 1));
  const x1 = Math.min(width, Math.ceil(cx + r + 1));
  const y1 = Math.min(height, Math.ceil(cy + r + 1));
  const r2 = r * r;
  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      const dx = px - cx, dy = py - cy;
      if (dx * dx + dy * dy > r2) continue;
      const i = (py * width + px) * 4;
      pixels[i] = Math.round(pixels[i] * (1 - alpha) + rgb[0] * alpha);
      pixels[i + 1] = Math.round(pixels[i + 1] * (1 - alpha) + rgb[1] * alpha);
      pixels[i + 2] = Math.round(pixels[i + 2] * (1 - alpha) + rgb[2] * alpha);
      pixels[i + 3] = 0xFF;
    }
  }
}

function strokeCircle(canvas, cx, cy, r, rgb, lineWidth = 2, alpha = 1) {
  const { width, height, pixels } = canvas;
  const x0 = Math.max(0, Math.floor(cx - r - 1));
  const y0 = Math.max(0, Math.floor(cy - r - 1));
  const x1 = Math.min(width, Math.ceil(cx + r + 1));
  const y1 = Math.min(height, Math.ceil(cy + r + 1));
  const rOut = r + lineWidth / 2;
  const rIn = r - lineWidth / 2;
  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      const dx = px - cx, dy = py - cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < rIn || d > rOut) continue;
      const i = (py * width + px) * 4;
      pixels[i] = Math.round(pixels[i] * (1 - alpha) + rgb[0] * alpha);
      pixels[i + 1] = Math.round(pixels[i + 1] * (1 - alpha) + rgb[1] * alpha);
      pixels[i + 2] = Math.round(pixels[i + 2] * (1 - alpha) + rgb[2] * alpha);
      pixels[i + 3] = 0xFF;
    }
  }
}

/* ----- PNG writer (no deps) ----------------------------------------- */

function be32(n) { const b = Buffer.alloc(4); b.writeUInt32BE(n, 0); return b; }
function crc32(buf) {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    table[i] = c >>> 0;
  }
  let c = 0xFFFFFFFF;
  for (const b of buf) c = (table[(c ^ b) & 0xFF] ^ (c >>> 8)) >>> 0;
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type, data) {
  const len = be32(data.length);
  const typed = Buffer.concat([Buffer.from(type), data]);
  return Buffer.concat([len, typed, be32(crc32(typed))]);
}
function writePng(canvas, filePath) {
  const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const ihdr = Buffer.concat([be32(canvas.width), be32(canvas.height), Buffer.from([8, 6, 0, 0, 0])]);
  const raw = Buffer.alloc(canvas.height * (canvas.width * 4 + 1));
  for (let y = 0; y < canvas.height; y++) {
    raw[y * (canvas.width * 4 + 1)] = 0;
    canvas.pixels.copy(raw, y * (canvas.width * 4 + 1) + 1, y * canvas.width * 4, (y + 1) * canvas.width * 4);
  }
  const idat = zlib.deflateSync(raw);
  const png = Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
  fs.writeFileSync(filePath, png);
  return png.length;
}

/* ----- Scenes ------------------------------------------------------- */

function makeCanvas(width, height) {
  const pixels = Buffer.alloc(width * height * 4);
  // initial bg vignette
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = (x - width / 2) / width;
      const dy = (y - height / 2) / height;
      const t = Math.min(1, Math.sqrt(dx * dx + dy * dy) * 1.4);
      const r = Math.round(COLORS.bg2[0] * (1 - t) + COLORS.bg[0] * t);
      const g = Math.round(COLORS.bg2[1] * (1 - t) + COLORS.bg[1] * t);
      const b = Math.round(COLORS.bg2[2] * (1 - t) + COLORS.bg[2] * t);
      const i = (y * width + x) * 4;
      pixels[i] = r; pixels[i + 1] = g; pixels[i + 2] = b; pixels[i + 3] = 0xFF;
    }
  }
  return { width, height, pixels };
}

function drawConnectionBar(c, x, y, w, h, peerCount, hops, scale) {
  // card bg
  fillRect(c, x, y, w, h, COLORS.surface);
  strokeRect(c, x, y, w, h, COLORS.hairline, 2);
  // pulse dot
  const cy = y + h / 2;
  fillCircle(c, x + 28, cy, 8, COLORS.signal);
  strokeCircle(c, x + 28, cy, 20, COLORS.signal, 2, 0.6);
  // label
  const text = `CONNECTED · ${peerCount} PEERS · ${hops} HOPS · RELAY`;
  drawText(c, text, x + 60, cy - 7, scale, COLORS.signal, 1);
  // hop bars (right)
  for (let i = 0; i < 4; i++) {
    fillRect(c, x + w - 60 + i * 10, cy + 6 - (4 + i * 4), 5, 4 + i * 4, COLORS.signal);
  }
}

function drawModeToggle(c, x, y, scale) {
  fillRect(c, x, y, 220, 60, COLORS.surface);
  strokeRect(c, x, y, 220, 60, COLORS.hairline, 2);
  // TREK pill (active)
  fillRect(c, x + 6, y + 6, 100, 48, COLORS.signal);
  drawText(c, 'TREK', x + 26, y + 22, scale, COLORS.txOn, 2);
  drawText(c, 'RIDE', x + 130, y + 22, scale, COLORS.tx2, 2);
}

function drawBubbleLeft(c, x, y, w, lines, senderLabel, statusText, statusColor, scale) {
  // bubble bg
  const h = 28 + lines.length * 26 + 26;
  fillRect(c, x, y, w, h, COLORS.surface2);
  strokeRect(c, x, y, w, h, COLORS.hairline, 1);
  drawText(c, senderLabel, x + 18, y + 14, scale - 1, COLORS.signal, 1);
  for (let i = 0; i < lines.length; i++) {
    drawText(c, lines[i], x + 18, y + 40 + i * 24, scale, COLORS.tx, 1);
  }
  drawText(c, statusText, x + 18, y + h - 22, scale - 1, statusColor, 1);
}

function drawBubbleRight(c, x, y, w, lines, statusText, statusColor, scale) {
  const h = 28 + lines.length * 26 + 26;
  fillRect(c, x, y, w, h, COLORS.signal3);
  // gradient feel: brighter top half
  for (let i = 0; i < h / 2; i++) {
    fillRect(c, x, y + i, w, 1, COLORS.signal3, 0.3);
  }
  for (let i = 0; i < lines.length; i++) {
    drawText(c, lines[i], x + 18, y + 16 + i * 24, scale, COLORS.txOn, 1);
  }
  drawText(c, statusText, x + 18, y + h - 22, scale - 1, statusColor, 1);
}

function drawSosCard(c, x, y, w, scale) {
  const h = 130;
  fillRect(c, x, y, w, h, COLORS.bg2);
  strokeRect(c, x, y, w, h, COLORS.sos, 3);
  drawText(c, 'SOS', x + 18, y + 14, scale + 4, COLORS.sos, 6);
  drawText(c, 'BROADCASTING LOCATION TO THE GROUP.', x + 18, y + 64, scale - 1, COLORS.tx, 1);
  drawText(c, 'FROM PEMA · #PE · 14:32', x + 18, y + 96, scale - 2, COLORS.sos, 1);
}

function drawRipple(c, cx, cy, baseR, scale = 1) {
  for (let i = 0; i < 4; i++) {
    strokeCircle(c, cx, cy, baseR + i * 26 * scale, COLORS.signal, 2, 0.55 - i * 0.12);
  }
  fillCircle(c, cx, cy, 18 * scale, COLORS.signal);
  fillCircle(c, cx, cy, 28 * scale, COLORS.signal, 0.4);
}

function drawTabBar(c, x, y, w, h, activeIndex, scale) {
  fillRect(c, x, y, w, h, COLORS.bg2);
  fillRect(c, x, y, w, 2, COLORS.hairline);
  const tabs = ['CHANNEL', 'PEERS', 'MAP', 'GROUPS', 'SET'];
  const tw = w / tabs.length;
  for (let i = 0; i < tabs.length; i++) {
    const cx = x + tw * i + tw / 2;
    const active = i === activeIndex;
    const tint = active ? COLORS.signal : COLORS.tx3;
    // glyph dot
    fillCircle(c, cx, y + h / 2 - 12, 7, tint);
    const lbl = tabs[i];
    const lw = textWidth(lbl, scale - 2, 1);
    drawText(c, lbl, cx - lw / 2, y + h / 2 + 8, scale - 2, tint, 1);
  }
}

function drawChannelScreen(width, height) {
  const c = makeCanvas(width, height);
  const margin = 32;

  // marketing band (top): tagline + image
  // (status bar simulated)
  fillRect(c, 0, 0, width, 60, COLORS.bg);
  drawText(c, '09:24', margin, 22, 3, COLORS.tx, 1);
  drawText(c, 'LTE· OFF', width - 250, 22, 3, COLORS.tx3, 1);

  // header
  drawConnectionBar(c, margin, 90, width - margin * 2, 64, 4, 2, 3);
  drawText(c, 'ANNAPURNA CIRCUIT', margin, 178, 5, COLORS.tx, 2);
  drawText(c, 'CODE ANP-7Q · GROUP#MAIN', margin, 236, 3, COLORS.tx3, 1);
  drawModeToggle(c, width - 280, 178, 3);

  // thread
  let y = 300;
  drawBubbleLeft(c, margin, y, width - margin * 2 - 200, [
    'STOPPING FOR WATER',
    'AT THE NEXT RIDGE.',
  ], 'PEMA · #PE', 'RELAYED 2 HOPS', COLORS.signal, 3);
  y += 160;
  drawBubbleRight(c, margin + 200, y, width - margin * 2 - 200, [
    'GOT IT. SEE YOU IN',
    '20 MIN.',
  ], 'DELIVERED · 3/3 ✓', COLORS.txOn, 3);
  y += 160;
  drawBubbleLeft(c, margin, y, width - margin * 2 - 200, [
    'BATTERY AT 30%, SWITCHING',
    'TO RELAY ONLY.',
  ], 'KARMA · #KA', 'RELAYED 1 HOPS', COLORS.signal, 3);
  y += 180;
  // SOS callout
  drawSosCard(c, margin, y, width - margin * 2, 3);

  // voice region
  const voiceY = height - 540;
  fillRect(c, 0, voiceY - 20, width, 2, COLORS.hairline);
  drawRipple(c, width / 2, voiceY + 200, 60, 2.6);
  drawText(c, 'HOLD TO TALK', width / 2 - textWidth('HOLD TO TALK', 4, 2) / 2, voiceY + 380, 4, COLORS.signal, 2);

  // SOS button
  fillRect(c, margin, height - 200, width - margin * 2, 100, [0x33, 0x10, 0x10]);
  strokeRect(c, margin, height - 200, width - margin * 2, 100, COLORS.sos, 3);
  drawText(c, 'SOS', margin + 30, height - 174, 7, COLORS.sos, 6);
  drawText(c, 'BROADCASTS YOUR LOCATION TO THE WHOLE GROUP', margin + 240, height - 158, 2, COLORS.sos, 1);

  // tab bar
  drawTabBar(c, 0, height - 80, width, 80, 0, 3);

  return c;
}

function drawPeersScreen(width, height) {
  const c = makeCanvas(width, height);
  // status bar
  fillRect(c, 0, 0, width, 60, COLORS.bg);
  drawText(c, '09:24', 32, 22, 3, COLORS.tx, 1);

  drawText(c, 'GROUP ROSTER', 32, 100, 6, COLORS.tx, 2);
  drawText(c, 'YOU · #0A · RELAY · 4 PEERS REACHED', 32, 168, 3, COLORS.tx3, 1);

  const chipH = 130;
  const chipW = width - 64;
  const chips = [
    { name: 'PEMA', id: 'PE', plat: 'android', role: 'RELAY', bat: 87, hops: 1 },
    { name: 'KARMA', id: 'KA', plat: 'ios', role: 'RELAY', bat: 63, hops: 2 },
    { name: 'DAWA', id: 'DA', plat: 'android', role: 'LEAF', bat: 31, hops: 1 },
    { name: 'TENZIN', id: 'TZ', plat: 'ios', role: 'RELAY', bat: 92, hops: 3 },
  ];
  let y = 240;
  for (const chip of chips) {
    fillRect(c, 32, y, chipW, chipH, COLORS.surface);
    strokeRect(c, 32, y, chipW, chipH, COLORS.hairline, 2);
    const platTint = chip.plat === 'android' ? COLORS.android : COLORS.ios;
    // avatar
    strokeCircle(c, 100, y + chipH / 2, 36, platTint, 3);
    drawText(c, chip.name[0], 88, y + chipH / 2 - 16, 6, COLORS.tx, 2);
    // name + meta
    drawText(c, chip.name, 168, y + 28, 5, COLORS.tx, 2);
    drawText(c, `SENDER#${chip.id} · ${chip.bat}% · ${chip.hops} HOPS`, 168, y + 80, 3, COLORS.tx3, 1);
    // right: platform + role + battery
    drawText(c, chip.plat.toUpperCase(), chipW - 220, y + 28, 3, platTint, 1);
    drawText(c, chip.role, chipW - 220, y + 60, 3, chip.role === 'RELAY' ? COLORS.signal : COLORS.tx2, 1);
    drawText(c, `${chip.bat}%`, chipW - 100, y + 60, 3, chip.bat < 35 ? COLORS.sos : COLORS.tx2, 1);
    y += chipH + 16;
  }

  drawTabBar(c, 0, height - 80, width, 80, 1, 3);
  return c;
}

function drawMapScreen(width, height) {
  const c = makeCanvas(width, height);
  fillRect(c, 0, 0, width, 60, COLORS.bg);
  drawText(c, '09:24', 32, 22, 3, COLORS.tx, 1);

  drawText(c, 'GROUP MAP', 32, 100, 6, COLORS.tx, 2);
  drawText(c, 'POSITIONS APPROXIMATE · LAST RX VIA MESH', 32, 168, 3, COLORS.tx3, 1);

  // canvas region
  const cx = width / 2;
  const cy = 240 + (height - 80 - 240) / 2;
  const cw = width - 64;
  const ch = height - 80 - 260;
  fillRect(c, 32, 240, cw, ch, COLORS.bg2);
  strokeRect(c, 32, 240, cw, ch, COLORS.hairline, 2);
  // contour lines
  for (let i = 0; i < 8; i++) {
    const y = 280 + i * 90;
    for (let x = 32; x < cw + 32; x += 12) {
      const wave = Math.sin((x + i * 80) / 60) * 12 + Math.cos((x + i * 30) / 100) * 8;
      fillRect(c, x, y + wave, 8, 2, COLORS.signal3);
    }
  }
  // self at center with rings
  drawRipple(c, cx, cy, 28, 2);
  drawText(c, 'YOU · #0A', cx - 60, cy + 70, 3, COLORS.signal, 1);
  // peer pins
  const pins = [
    { dx: -190, dy: -150, c: COLORS.android, label: '#PE' },
    { dx: 220, dy: -90, c: COLORS.ios, label: '#KA' },
    { dx: -120, dy: 210, c: COLORS.android, label: '#DA' },
    { dx: 240, dy: 240, c: COLORS.sos, label: '!' },
  ];
  for (const p of pins) {
    fillCircle(c, cx + p.dx, cy + p.dy, 22, [0, 0, 0], 0.5);
    fillCircle(c, cx + p.dx, cy + p.dy, 16, p.c);
    strokeCircle(c, cx + p.dx, cy + p.dy, 16, COLORS.bg, 3);
    drawText(c, p.label, cx + p.dx - 18, cy + p.dy + 32, 2, COLORS.tx2, 1);
  }
  // legend
  fillRect(c, 64, height - 200, cw - 64, 80, [0x08, 0x0B, 0x0C]);
  strokeRect(c, 64, height - 200, cw - 64, 80, COLORS.hairline, 2);
  const legend = [
    { c: COLORS.android, l: 'ANDROID' },
    { c: COLORS.ios,     l: 'IOS' },
    { c: COLORS.signal,  l: 'YOU' },
    { c: COLORS.sos,     l: 'SOS' },
  ];
  let lx = 96;
  for (const li of legend) {
    fillCircle(c, lx, height - 160, 8, li.c);
    drawText(c, li.l, lx + 22, height - 168, 2, COLORS.tx2, 1);
    lx += 220;
  }

  drawTabBar(c, 0, height - 80, width, 80, 2, 3);
  return c;
}

function drawSplashScreen(width, height) {
  const c = makeCanvas(width, height);
  // big ripple at center
  drawRipple(c, width / 2, height / 2 - 60, 100, 4);
  const title = 'ECHO';
  const tw = textWidth(title, 12, 14);
  drawText(c, title, width / 2 - tw / 2, height / 2 + 240, 12, COLORS.signal, 14);
  drawText(c, 'MESH RADIO FOR THE MOUNTAINS',
    width / 2 - textWidth('MESH RADIO FOR THE MOUNTAINS', 4, 4) / 2,
    height / 2 + 380, 4, COLORS.tx2, 4);
  return c;
}

/* ----- Run ---------------------------------------------------------- */

const SPECS = [
  { key: 'ios-1-channel',  fn: drawChannelScreen, w: 1290, h: 2796, name: 'ios-iphone-67-channel' },
  { key: 'ios-2-peers',    fn: drawPeersScreen,   w: 1290, h: 2796, name: 'ios-iphone-67-peers' },
  { key: 'ios-3-map',      fn: drawMapScreen,     w: 1290, h: 2796, name: 'ios-iphone-67-map' },
  { key: 'ios-4-splash',   fn: drawSplashScreen,  w: 1290, h: 2796, name: 'ios-iphone-67-splash' },
  { key: 'android-1-channel', fn: drawChannelScreen, w: 1080, h: 1920, name: 'android-phone-channel' },
  { key: 'android-2-peers',   fn: drawPeersScreen,   w: 1080, h: 1920, name: 'android-phone-peers' },
  { key: 'android-3-map',     fn: drawMapScreen,     w: 1080, h: 1920, name: 'android-phone-map' },
  { key: 'android-4-splash',  fn: drawSplashScreen,  w: 1080, h: 1920, name: 'android-phone-splash' },
];

const outDir = path.join(__dirname, 'assets');
fs.mkdirSync(outDir, { recursive: true });
for (const spec of SPECS) {
  const canvas = spec.fn(spec.w, spec.h);
  const file = path.join(outDir, `${spec.name}.png`);
  const bytes = writePng(canvas, file);
  console.log(`${spec.name}.png  ${spec.w}×${spec.h}  ${(bytes / 1024).toFixed(0)} KB`);
}
