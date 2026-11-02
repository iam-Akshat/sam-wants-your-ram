// Freeze bisect / regression: title -> RUN -> N s of play in a REAL-TIME (non-manual) page; fails if frame delivery stops for > 1 s.
// usage: node scripts/freeze.mjs [--runs 3] [--secs 30] [--flags a,b|c ...]   (flags = ?dbg= values, '|' separates combos)
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const url = pathToFileURL(path.resolve('dist/index.html')).href;
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const runs = +arg('--runs', 3), secs = +arg('--secs', 30); const combos = arg('--flags', '') ? arg('--flags', '').split('|') : [''];
const LAUNCH = { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--allow-file-access-from-files', '--autoplay-policy=no-user-gesture-required'] };
let fail = 0;
for (const flags of combos) for (let r = 1; r <= runs; r++) {
  const browser = await chromium.launch(LAUNCH); const page = await (await browser.newContext({ viewport: { width: 640, height: 360 } })).newPage(); page.setDefaultTimeout(240000);
  await page.goto(`${url}?nointro=1&god=1&bot=1&dbg=${flags}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game?.started && !window.__boot.visible, null, { timeout: 240000 });
  await page.evaluate(() => { window.__gaps = []; window.__maxGap = 0; window.__late = 0; window.__n = 0; let last = performance.now(); const t00 = last; const f = (t) => { window.__maxGap = Math.max(window.__maxGap, t - last); if (t - last > 700) window.__gaps.push(`+${((t - t00) / 1000).toFixed(1)}s gap ${Math.round(t - last)}ms ${__game.state} d=${__game.dist.toFixed(0)}`); if (__game.state === 'run' && __game.dist > 5) window.__late = Math.max(window.__late, t - last); window.__n++; last = t; requestAnimationFrame(f); }; requestAnimationFrame(f); window.__t0 = performance.now(); });
  await page.evaluate(() => document.querySelector('[data-act="endless"]').click());
  let stalled = false; const t0 = Date.now(); let lastN = -1, lastChange = Date.now(); let d = 0;
  while (Date.now() - t0 < secs * 1000) {
    await new Promise((r) => setTimeout(r, 400));
    const s = await page.evaluate(() => ({ n: window.__n, st: __game.state, d: __game.dist, frozen: __game.frozen }));
    d = s.d; if (s.n !== lastN) { lastN = s.n; lastChange = Date.now(); } else if (Date.now() - lastChange > 1000) { stalled = true; console.log(`  frame delivery stopped at +${((Date.now() - t0) / 1000).toFixed(1)}s state=${s.st} d=${s.d.toFixed(1)} n=${s.n} (detector frozen=${s.frozen})`); break; }
  }
  const gap = await page.evaluate(() => Math.round(window.__maxGap)).catch(() => -1);
  console.log('  gaps: ' + (await page.evaluate(() => window.__gaps.join(' | ')).catch(() => '?')));
  const late = await page.evaluate(() => Math.round(window.__late)).catch(() => -1);
  if (!stalled && late > 1000) { stalled = true; console.log(`  rAF gap of ${late}ms during play`); }
  const frozenFlag = await page.evaluate(() => __game.frozen).catch(() => null);
  console.log(`${stalled ? 'FAIL' : 'PASS'} dbg=[${flags}] run ${r}: ${stalled ? 'frames stopped' : `no stall in ${secs}s`} maxRafGap=${gap}ms dist=${d.toFixed(0)} detector=${frozenFlag}`);
  if (stalled) fail++;
  await browser.close();
}
console.log(fail ? `FREEZE TEST FAILED (${fail})` : 'FREEZE TEST OK'); process.exit(fail ? 1 : 0);
