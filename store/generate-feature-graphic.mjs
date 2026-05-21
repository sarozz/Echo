#!/usr/bin/env node
/**
 * Generates the Play Store feature graphic at the required 1024 × 500 RGB
 * size (no alpha, no rounded corners). Rendered directly from the Echo
 * design tokens so it stays visually consistent with the app and the
 * generated screenshots.
 *
 * Layout: ECHO wordmark + tagline + privacy badge on the left, a mountain
 * silhouette with three ripple emitters across the peaks on the right.
 *
 *   node store/generate-feature-graphic.mjs
 *
 * Output: store/assets/feature-graphic.png
 *
 * Helpers are intentionally duplicated from generate-screenshots.mjs to
 * keep each script self-contained.
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
  tx:      [0xEA, 0xF3, 0xF2],
  tx2:     [0x9F, 0xB3, 0xB4],
  tx3:     [0x5E, 0x73, 0x76],
  signal:  [0x00, 0xE6, 0xC7],
  signal2: [0x12, 0xA8, 0x92],
  signal3: [0x0A, 0x63, 0x56],
  sos:     [0xFF, 0x44, 0x38],
};

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
  'L': '10000\n10000\n10000\n10000\n10000\n10000\n11111',
  'M': '10001\n11011\n10101\n10001\n10001\n10001\n10001',
  'N': '10001\n11001\n10101\n10101\n10011\n10001\n10001',
  'O': '01110\n10001\n10001\n10001\n10001\n10001\n01110',
  'R': '11110\n10001\n10001\n11110\n10100\n10010\n10001',
  'S': '01111\n10000\n10000\n01110\n00001\n00001\n11110',
  'T': '11111\n00100\n00100\n00100\n00100\n00100\n00100',
  'U': '10001\n10001\n10001\n10001\n10001\n10001\n01110',
  'Y': '10001\n10001\n01010\n00100\n00100\n00100\n00100',
  '·': '00000\n00000\n00000\n00100\n00000\n00000\n00000',
  '.': '00000\n00000\n00000\n00000\n00000\n00000\n00100',
  ',': '00000\n00000\n00000\n00000\n00100\n00100\n01000',
  '-': '00000\n00000\n00000\n11111\n00000\n00000\n00000',
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
  let cx = x;
  for (const ch of text.toUpperCase()) {
    drawChar(canvas, ch, cx, y, scale, rgb);
    cx += 5 * scale + letterSpacing + scale; // 1 px gap per scale
  }
  return cx - x;
}

function textWidth(text, scale, letterSpacing = 0) {
  return text.length * (5 * scale + letterSpacing + scale) - (letterSpacing + scale);
}

function blend(c, x, y, rgb, alpha) {
  if (x < 0 || y < 0 || x >= c.width || y >= c.height) return;
  const i = (y * c.width + x) * 4;
  c.pixels[i]     = Math.round(c.pixels[i]     * (1 - alpha) + rgb[0] * alpha);
  c.pixels[i + 1] = Math.round(c.pixels[i + 1] * (1 - alpha) + rgb[1] * alpha);
  c.pixels[i + 2] = Math.round(c.pixels[i + 2] * (1 - alpha) + rgb[2] * alpha);
  c.pixels[i + 3] = 0xFF;
}

function fillRect(c, x, y, w, h, rgb, alpha = 1) {
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(c.width, Math.floor(x + w));
  const y1 = Math.min(c.height, Math.floor(y + h));
  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) blend(c, px, py, rgb, alpha);
  }
}

function fillCircle(c, cx, cy, r, rgb, alpha = 1) {
  const x0 = Math.max(0, Math.floor(cx - r - 1));
  const y0 = Math.max(0, Math.floor(cy - r - 1));
  const x1 = Math.min(c.width, Math.ceil(cx + r + 1));
  const y1 = Math.min(c.height, Math.ceil(cy + r + 1));
  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      const dx = px - cx, dy = py - cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > r) continue;
      // Anti-aliased edge in the last pixel of radius.
      const a = d > r - 1 ? alpha * (r - d) : alpha;
      blend(c, px, py, rgb, a);
    }
  }
}

function strokeCircle(c, cx, cy, r, rgb, lineWidth = 2, alpha = 1) {
  const x0 = Math.max(0, Math.floor(cx - r - lineWidth));
  const y0 = Math.max(0, Math.floor(cy - r - lineWidth));
  const x1 = Math.min(c.width, Math.ceil(cx + r + lineWidth));
  const y1 = Math.min(c.height, Math.ceil(cy + r + lineWidth));
  const half = lineWidth / 2;
  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      const dx = px - cx, dy = py - cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      const dist = Math.abs(d - r);
      if (dist > half + 0.5) continue;
      const a = dist > half ? alpha * (half + 0.5 - dist) : alpha;
      blend(c, px, py, rgb, a);
    }
  }
}

function fillPolygon(c, points, rgb, alpha = 1) {
  // Scanline fill with non-zero winding.
  let minY = Infinity, maxY = -Infinity;
  for (const [, y] of points) { if (y < minY) minY = y; if (y > maxY) maxY = y; }
  minY = Math.max(0, Math.floor(minY));
  maxY = Math.min(c.height - 1, Math.ceil(maxY));
  for (let y = minY; y <= maxY; y++) {
    const xs = [];
    for (let i = 0; i < points.length; i++) {
      const [x1, y1] = points[i];
      const [x2, y2] = points[(i + 1) % points.length];
      if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) {
        const t = (y - y1) / (y2 - y1);
        xs.push(x1 + t * (x2 - x1));
      }
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const x0 = Math.max(0, Math.floor(xs[i]));
      const x1 = Math.min(c.width - 1, Math.ceil(xs[i + 1]));
      for (let x = x0; x <= x1; x++) blend(c, x, y, rgb, alpha);
    }
  }
}

/* ----- PNG writer --------------------------------------------------- */

function be32(n) { const b = Buffer.alloc(4); b.writeUInt32BE(n, 0); return b; }
function crc32(buf) {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let v = i;
    for (let k = 0; k < 8; k++) v = (v & 1) ? (0xEDB88320 ^ (v >>> 1)) : (v >>> 1);
    table[i] = v >>> 0;
  }
  let v = 0xFFFFFFFF;
  for (const b of buf) v = (table[(v ^ b) & 0xFF] ^ (v >>> 8)) >>> 0;
  return (v ^ 0xFFFFFFFF) >>> 0;
}
function pngChunk(type, data) {
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
  return fs.writeFileSync(filePath, Buffer.concat([sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', idat), pngChunk('IEND', Buffer.alloc(0))]));
}

/* ----- Compose ------------------------------------------------------ */

function makeCanvas(width, height) {
  const pixels = Buffer.alloc(width * height * 4);
  // Vertical brand gradient: bg2 at top → bg at bottom, with a slight cool
  // horizontal vignette on the right where the mountains live.
  for (let y = 0; y < height; y++) {
    const t = y / height;
    for (let x = 0; x < width; x++) {
      const h = x / width;
      // Mix vertical
      let r = Math.round(COLORS.bg2[0] * (1 - t) + COLORS.bg[0] * t);
      let g = Math.round(COLORS.bg2[1] * (1 - t) + COLORS.bg[1] * t);
      let b = Math.round(COLORS.bg2[2] * (1 - t) + COLORS.bg[2] * t);
      // Subtle horizontal: slight teal tint on right
      const tint = Math.max(0, h - 0.55) * 0.25;
      r = Math.round(r + (COLORS.signal3[0] - r) * tint * 0.3);
      g = Math.round(g + (COLORS.signal3[1] - g) * tint * 0.3);
      b = Math.round(b + (COLORS.signal3[2] - b) * tint * 0.3);
      const i = (y * width + x) * 4;
      pixels[i] = r; pixels[i + 1] = g; pixels[i + 2] = b; pixels[i + 3] = 0xFF;
    }
  }
  return { width, height, pixels };
}

function drawMountains(c) {
  const horizon = c.height * 0.62;
  // Two ranges for depth: back range (paler) then front range (darker).
  const backPeaks = [
    [0,            horizon + 80],
    [80,           horizon + 30],
    [160,          horizon + 60],
    [240,          horizon - 10],
    [320,          horizon + 20],
    [400,          horizon - 30],
    [500,          horizon + 30],
    [580,          horizon - 5],
    [660,          horizon + 25],
    [740,          horizon - 15],
    [820,          horizon + 35],
    [900,          horizon - 20],
    [980,          horizon + 20],
    [c.width,      horizon + 50],
    [c.width,      c.height],
    [0,            c.height],
  ];
  fillPolygon(c, backPeaks, COLORS.bg2, 0.9);
  // soft signal3 outline on the back ridge
  for (let i = 0; i < backPeaks.length - 3; i++) {
    const [x1, y1] = backPeaks[i];
    const [x2, y2] = backPeaks[i + 1];
    drawLine(c, x1, y1, x2, y2, COLORS.signal3, 0.5);
  }
  const frontPeaks = [
    [0,            horizon + 130],
    [120,          horizon + 60],
    [240,          horizon + 90],
    [360,          horizon + 40],
    [460,          horizon + 70],
    [560,          horizon + 20],
    [680,          horizon + 50],
    [780,          horizon + 30],
    [880,          horizon + 60],
    [c.width,      horizon + 80],
    [c.width,      c.height],
    [0,            c.height],
  ];
  fillPolygon(c, frontPeaks, COLORS.bg, 1);
  // edge highlight
  for (let i = 0; i < frontPeaks.length - 3; i++) {
    const [x1, y1] = frontPeaks[i];
    const [x2, y2] = frontPeaks[i + 1];
    drawLine(c, x1, y1, x2, y2, COLORS.signal, 0.55);
  }
}

function drawLine(c, x1, y1, x2, y2, rgb, alpha = 1) {
  const dx = x2 - x1, dy = y2 - y1;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = Math.round(x1 + dx * t);
    const y = Math.round(y1 + dy * t);
    blend(c, x, y, rgb, alpha);
    blend(c, x, y + 1, rgb, alpha * 0.5);
    blend(c, x + 1, y, rgb, alpha * 0.5);
  }
}

function drawRippleEmitter(c, x, y, baseR, rings, alphaScale = 1) {
  for (let i = 0; i < rings; i++) {
    const r = baseR + i * 24;
    const a = (rings - i) / rings * 0.55 * alphaScale;
    strokeCircle(c, x, y, r, COLORS.signal, 2, a);
  }
  // glowing core
  fillCircle(c, x, y, baseR * 0.55, COLORS.signal, 1);
  fillCircle(c, x, y, baseR * 0.85, COLORS.signal, 0.35);
}

function drawTopoContours(c) {
  // Faint dotted contour pattern across the upper half — feels like a topo map.
  for (let y = 60; y < c.height * 0.55; y += 28) {
    for (let x = 0; x < c.width; x += 6) {
      const wave = Math.sin((x + y * 3) / 80) * 14 + Math.cos((x - y * 2) / 110) * 10;
      const py = y + wave;
      blend(c, Math.round(x), Math.round(py), COLORS.signal3, 0.18);
    }
  }
}

function drawWordmark(c) {
  // ECHO at scale 16 — bold, condensed-feel because pixel font is naturally narrow.
  const scale = 16;
  const text = 'ECHO';
  const x = 60;
  const y = 110;
  drawText(c, text, x, y, scale, COLORS.signal, scale);
  // Tagline below
  const tag = 'MESH RADIO FOR THE MOUNTAINS';
  const tagScale = 4;
  drawText(c, tag, x, y + 7 * scale + 28, tagScale, COLORS.tx, tagScale);
  // Mono badge bottom-left
  const badge = 'BLUETOOTH · NO INTERNET · OFFLINE';
  drawText(c, badge, x, c.height - 60, 3, COLORS.tx2, 3);
  // Hairline accent above the badge
  fillRect(c, x, c.height - 80, textWidth(badge, 3, 3), 2, COLORS.signal3);
}

function compose() {
  const W = 1024, H = 500;
  const c = makeCanvas(W, H);

  drawTopoContours(c);
  drawMountains(c);

  // Ripple emitters from three peaks (matched to the peak positions above).
  drawRippleEmitter(c, 360, H * 0.62 + 40, 12, 5, 1);   // back-right of front range
  drawRippleEmitter(c, 580, H * 0.62 + 20, 14, 6, 1);   // tall peak
  drawRippleEmitter(c, 820, H * 0.62 + 30, 11, 5, 0.85); // far right

  drawWordmark(c);

  const out = path.join(__dirname, 'assets', 'feature-graphic.png');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  writePng(c, out);
  console.log(`feature-graphic.png  ${W}×${H}`);
}

compose();
