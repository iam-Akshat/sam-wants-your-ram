// Renders the 1200x630 share card via the built game and writes public/og.png (+ dist/og.png).
// Run: node scripts/make-og.mjs   (after `npm run build`)
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { deflateSync, crc32 } from 'node:zlib';

// 256-colour indexed PNG (card is flat vector art; keeps og.png small). Palette = most popular 5-bit colours, nearest-match for the rest.
function indexedPng(rgba, W, H) {
  const hist = new Map();
  for (let i = 0; i < rgba.length; i += 4) { const k = ((rgba[i] >> 3) << 10) | ((rgba[i + 1] >> 3) << 5) | (rgba[i + 2] >> 3); hist.set(k, (hist.get(k) || 0) + 1); }
  const top = [...hist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 256).map(([k]) => [((k >> 10) << 3) | 4, (((k >> 5) & 31) << 3) | 4, ((k & 31) << 3) | 4]);
  const cache = new Map(); const raw = Buffer.alloc((W + 1) * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const o = (y * W + x) * 4; const k = ((rgba[o] >> 3) << 10) | ((rgba[o + 1] >> 3) << 5) | (rgba[o + 2] >> 3); let ix = cache.get(k);
    if (ix === undefined) { let best = 1e9; ix = 0; for (let j = 0; j < top.length; j++) { const d = (top[j][0] - rgba[o]) ** 2 + (top[j][1] - rgba[o + 1]) ** 2 + (top[j][2] - rgba[o + 2]) ** 2; if (d < best) { best = d; ix = j; } } cache.set(k, ix); }
    raw[y * (W + 1) + 1 + x] = ix;
  }
  const chunk = (t, d) => { const b = Buffer.concat([Buffer.from(t), d]); const o = Buffer.alloc(4); o.writeUInt32BE(crc32(b)); const l = Buffer.alloc(4); l.writeUInt32BE(d.length); return Buffer.concat([l, b, o]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(W, 0); ih.writeUInt32BE(H, 4); ih[8] = 8; ih[9] = 3;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('PLTE', Buffer.from(top.flat())), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const page_url = pathToFileURL(resolve(root, 'dist/index.html')).href + '?manual=1&quality=low';
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const pg = await b.newPage({ viewport: { width: 1280, height: 720 } });
  pg.on('pageerror', (e) => console.log('pageerror', e.message));
  await pg.goto(page_url);
  await pg.waitForFunction(() => typeof window.__ogCard === 'function', null, { timeout: 30000 });
  const url = await pg.evaluate(() => window.__ogCard());
  const px = await pg.evaluate(async (u) => { const im = new Image(); im.src = u; await im.decode(); const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d'); x.drawImage(im, 0, 0); return { w: c.width, h: c.height, d: Array.from(x.getImageData(0, 0, c.width, c.height).data) }; }, url);
  const buf = indexedPng(Uint8Array.from(px.d), px.w, px.h);
  mkdirSync(resolve(root, 'public'), { recursive: true });
  writeFileSync(resolve(root, 'public/og.png'), buf);
  if (existsSync(resolve(root, 'dist'))) writeFileSync(resolve(root, 'dist/og.png'), buf);
  console.log('wrote og.png', buf.length, 'bytes');
} finally { await b.close(); }
