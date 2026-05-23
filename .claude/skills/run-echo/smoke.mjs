/**
 * Smoke driver for Echo: launches the web bundle in headless Chromium,
 * walks through the onboarding wizard, and screenshots the major screens.
 *
 *   PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node smoke.mjs
 *
 * Assumes a dev server is already running on http://localhost:8080 (the
 * exported web bundle). For ad-hoc runs without a separate server, see
 * SKILL.md — the launch loop wraps both pieces.
 *
 * Output: writes screenshots to ./screenshots/<step>.png and prints a
 * summary table on stdout. Exits non-zero if any step fails.
 */

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const URL = process.env.ECHO_URL ?? 'http://localhost:8080';
const OUT = resolve(process.cwd(), 'screenshots');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 412, height: 915 },  // Pixel-ish phone portrait
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const page = await ctx.newPage();

const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
});

async function shot(name) {
  const path = `${OUT}/${name}.png`;
  await page.screenshot({ path });
  console.log(`  screenshot: ${path}`);
  return path;
}

async function waitForText(text, opts = {}) {
  await page.waitForFunction(
    (t) => document.body && document.body.innerText.includes(t),
    text,
    { timeout: opts.timeout ?? 8000 },
  );
}

async function tapByText(text) {
  // The app uses RN Pressables; on web they render as divs with the text.
  const handle = await page.evaluateHandle((t) => {
    const all = Array.from(document.querySelectorAll('*'));
    return all.find((el) => {
      const own = el.childNodes && Array.from(el.childNodes).some(
        (n) => n.nodeType === 3 && n.textContent.trim() === t,
      );
      return own;
    });
  }, text);
  const el = handle.asElement();
  if (!el) throw new Error(`tap target not found: "${text}"`);
  await el.click();
}

const steps = [];
async function step(name, fn) {
  const t0 = Date.now();
  try {
    await fn();
    steps.push({ name, ok: true, ms: Date.now() - t0 });
    console.log(`✓ ${name}  (${Date.now() - t0}ms)`);
  } catch (e) {
    steps.push({ name, ok: false, ms: Date.now() - t0, err: e.message });
    console.log(`✗ ${name}  (${Date.now() - t0}ms)  ${e.message}`);
    await shot(`fail-${name.replace(/\s+/g, '-')}`);
    throw e;
  }
}

try {
  await step('load app', async () => {
    await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
    await waitForText('ECHO');
    await shot('01-welcome');
  });

  await step('welcome → language', async () => {
    await tapByText('CONTINUE');
    await waitForText('ENGLISH');
    await shot('02-language');
  });

  await step('language → name', async () => {
    await tapByText('CONTINUE');
    await waitForText('CHOOSE YOUR NAME');
    await shot('03-name');
  });

  await step('enter name', async () => {
    // Find the visible name input by placeholder.
    const input = page.locator('input').first();
    await input.fill('PEMA');
    await shot('04-name-filled');
  });

  await step('name → id', async () => {
    await tapByText('CONTINUE');
    await waitForText('CHOOSE A 2-CHAR ID');
    await shot('05-id');
  });

  await step('id → mode', async () => {
    await tapByText('CONTINUE');
    await waitForText('PRIMARY MODE');
    await shot('06-mode');
  });

  await step('mode → privacy', async () => {
    await tapByText('CONTINUE');
    await waitForText('PRIVACY');
    await shot('07-privacy');
  });

  await step('finish onboarding → channel', async () => {
    await tapByText('JOIN THE MESH');
    await waitForText('ANNAPURNA CIRCUIT', { timeout: 15000 });
    await shot('08-channel');
  });

  // expo-router renders tabs differently on web (often the bar is offscreen
  // in a small viewport); navigate directly by URL — that's what the tab
  // press does under the hood anyway.
  async function goTo(path, expectText, name) {
    await page.goto(URL + path, { waitUntil: 'domcontentloaded' });
    await waitForText(expectText, { timeout: 8000 });
    await shot(name);
  }

  await step('go to /peers', () => goTo('/peers', 'GROUP ROSTER', '09-peers'));
  await step('go to /map', () => goTo('/map', 'GROUP MAP', '10-map'));
  await step('go to /groups', () => goTo('/groups', 'SELECT A MESH GROUP', '11-groups'));
  await step('go to /settings', () => goTo('/settings', 'IDENTITY', '12-settings'));
} finally {
  console.log('\n— summary —');
  for (const s of steps) {
    console.log(`  ${s.ok ? '✓' : '✗'}  ${s.name.padEnd(40)} ${s.ms}ms`);
  }
  if (errors.length) {
    console.log('\n— page errors —');
    for (const e of errors.slice(0, 20)) console.log(`  ${e}`);
  }
  await browser.close();
  const failed = steps.filter((s) => !s.ok).length;
  process.exit(failed > 0 ? 1 : 0);
}
