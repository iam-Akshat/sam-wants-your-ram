// Loading-screen tests: boot screen (+screenshot), quality-switch veil, stage-transition veil, forced failure panel with working Reload, 15 s "still working" panel.
// Asserts the overlay appears within 100 ms of the action, its progress increases, and it disappears when ready.
// Run: node scripts/loading.mjs
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
const root = path.resolve('.'); const url = pathToFileURL(path.join(root, 'dist', 'index.html')).href; const shots = path.join(root, 'shots'); fs.mkdirSync(shots, { recursive: true });
const LAUNCH = { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--allow-file-access-from-files'] };
let failures = 0; const errors = [];
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) failures++; };
const increasing = (a) => a.length >= 4 && a.every((v, i) => i === 0 || v >= a[i - 1]) && a[a.length - 1] > a[0] && new Set(a).size >= 4;
async function open(query, wait = true, expectErr = false) {
  const browser = await chromium.launch(LAUNCH); const ctx = await browser.newContext({ viewport: { width: 640, height: 360 } }); const page = await ctx.newPage(); page.setDefaultTimeout(300000);
  page.on('console', (m) => { if (m.type() === 'error' && !expectErr) errors.push(m.text()); }); page.on('pageerror', (e) => { if (!expectErr) errors.push(e.message); });
  await page.goto(`${url}?manual=1&veil=1&seed=7&nointro=1&${query}`, { waitUntil: 'domcontentloaded' });
  if (wait) await page.waitForFunction(() => window.__game?.started && !window.__boot.visible, null, { timeout: 300000 });
  return { browser, page };
}
const shot = async (page, name) => { try { await page.screenshot({ path: path.join(shots, name), timeout: 60000 }); console.log('  shot ' + name); } catch { console.log('  (screenshot ' + name + ' skipped: compositor busy)'); } };
const boot = (p) => p.evaluate(() => ({ vis: __boot.visible, log: __boot.log.slice(), display: document.getElementById('boot').style.display, step: document.querySelector('#boot .b-step').textContent }));
const until = async (p, fn, arg, ms = 240000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await p.evaluate(fn, arg)) return true; await p.waitForTimeout(150); } return false; };

// 1. boot loading screen
{
  const { browser, page } = await open('warm=1', false);
  const first = await page.evaluate(() => ({ vis: !!document.getElementById('boot') && getComputedStyle(document.getElementById('boot')).display !== 'none', step: document.querySelector('#boot .b-step').textContent, bar: !!document.querySelector('#boot .b-fill') }));
  check(first.vis && first.bar, `boot screen is visible at DOMContentLoaded (inline, before the bundle runs): "${first.step}"`);
  await shot(page, '90-boot.png');
  await page.waitForFunction(() => window.__game?.started && !window.__boot.visible, null, { timeout: 300000 });
  const b = await boot(page);
  check(increasing(b.log), `boot progress increases monotonically (${b.log.length} updates, ${[...new Set(b.log)].map((v) => Math.round(v * 100)).join('>')})`);
  check(b.log[b.log.length - 1] === 1 && !b.vis, 'boot overlay hides once warm-up is done');
  check(await page.evaluate(() => !__game.warming && __game.state === 'attract'), 'title is live (not warming) when the overlay goes away');
  await new Promise((r) => setTimeout(r, 600));
  // quality switch veil (title chip)
  await shot(page, '91-title-after-boot.png');
  const t = await page.evaluate(() => { const t0 = performance.now(); document.querySelector('[data-act="gfx"]').click(); return { ms: performance.now() - t0, vis: __boot.visible, step: document.querySelector('#boot .b-step').textContent, q: __game.quality }; });
  check(t.vis && t.ms < 100, `quality switch: overlay up within 100 ms (${t.ms.toFixed(1)} ms, "${t.step}")`);
  await new Promise((r) => setTimeout(r, 150)); await shot(page, '92-quality-switch-veil.png');
  const done = await until(page, () => !__boot.visible && !__game.busy);
  const q = await boot(page);
  check(done && increasing(q.log), `quality switch progress increases (${q.log.map((v) => Math.round(v * 100)).join('>')}) and overlay hides`);
  check(await page.evaluate(() => __game.quality) === 'medium', 'quality switched to medium behind the veil');
  // 15 s "still working" panel + Continue in Low
  await page.evaluate(() => __boot.show('Simulated slow step', true));
  await page.waitForTimeout(15500);
  check(await page.evaluate(() => !document.querySelector('#boot .b-slow').hidden), 'after 15 s without progress: "Still working..." panel with buttons');
  await shot(page, '93-still-working.png');
  await page.evaluate(() => document.getElementById('b-low').click());
  check(await until(page, () => !__boot.visible, null, 10000), '"Continue in Low quality" dismisses the overlay');
  check(await page.evaluate(() => __game.pendingQuality === 'low' && __game.rampLocked), 'Continue in Low queues Low and stops auto-ramping');
  await browser.close();
}

// 2. stage transition veil
{
  const { browser, page } = await open('warm=0');
  await page.evaluate(() => __game.startRun('escape', 1, true));
  await page.evaluate(() => { __game.advance(1); __game.dist = __game.goalDist - 3; __game.advance(3); });
  for (let i = 0; i < 30 && !(await page.evaluate(() => __game.state === 'cutscene')); i++) await page.evaluate(() => __game.advance(0.5));
  check(await page.evaluate(() => __game.state === 'cutscene'), 'stage clear reaches the cutscene');
  const t = await page.evaluate(() => { const t0 = performance.now(); __game.ui.hooks_cutsceneDone ? 0 : 0; __game.cutsceneDone(); return { ms: performance.now() - t0, vis: __boot.visible, step: document.querySelector('#boot .b-step').textContent }; });
  check(t.vis && t.ms < 100, `stage transition: overlay up within 100 ms (${t.ms.toFixed(1)} ms, "${t.step}")`);
  await new Promise((r) => setTimeout(r, 120)); await shot(page, '94-stage-transition-veil.png');
  const done = await until(page, () => !__boot.visible && !__game.transition, null, 60000);
  const b = await boot(page);
  check(done && increasing(b.log), `stage transition progress increases (${b.log.map((v) => Math.round(v * 100)).join('>')}) and overlay hides`);
  check(await page.evaluate(() => __game.state === 'run' && __game.stage === 2), 'stage 2 is running after the veil');
  await browser.close();
}

// 3. forced failure: error panel with working Reload + Copy
{
  const { browser, page } = await open('failload=1', false, true);
  const ok = await until(page, () => !document.querySelector('#boot .b-err').hidden, null, 120000);
  check(ok, 'forced load failure shows the error panel (no hang)');
  const txt = await page.evaluate(() => document.getElementById('b-pre').textContent);
  check(/Forced load failure/.test(txt), 'error panel shows the error details');
  await shot(page, '95-load-error.png');
  await page.evaluate(() => { window.__marker = 1; });
  const nav = page.waitForEvent('load', { timeout: 60000 }).then(() => true, () => false);
  await page.click('#b-reload2', { force: true });
  check(await nav, 'Reload button reloads the page');
  check(await until(page, () => !document.querySelector('#boot .b-err').hidden && !window.__marker, null, 120000), 'after reload the (still forced) failure panel shows again, fresh page');
  await page.click('#b-copy', { force: true }).catch(() => {});
  await browser.close();
}
// 4. freeze detector (rAF stops while the page is visible) + WEBGL_lose_context recovery (what chrome://gpucrash causes), in a real-time page
{
  const browser = await chromium.launch(LAUNCH); const page = await (await browser.newContext({ viewport: { width: 640, height: 360 } })).newPage(); page.setDefaultTimeout(240000);
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); }); page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${url}?nointro=1&god=1&bot=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game?.started && !window.__boot.visible, null, { timeout: 240000 });
  await page.evaluate(() => document.querySelector('[data-act="endless"]').click());
  check(await until(page, () => __game.state === 'run' && __game.dist > 2, null, 60000), 'real-time run starts (title -> RUN)');
  // a. freeze: stop rAF while visible
  await page.evaluate(() => { window.__raf0 = window.requestAnimationFrame; window.requestAnimationFrame = () => 0; });
  const fz = await until(page, () => __game.frozen === true, null, 8000);
  check(fz, 'freeze detector notices rAF stopped for > 1 s while the page is visible (heartbeat alive)');
  const saved = await page.evaluate(() => { const a = JSON.parse(localStorage.getItem('ramrun.freeze.v1') || '[]'); const r = a[a.length - 1]; return { n: a.length, kind: r?.kind, ev: r?.events?.length, low: sessionStorage.getItem('ramrun.lowsession'), trouble: __game.save.data.gpuTrouble, ramp: __game.rampLocked }; });
  check(saved.n >= 1 && saved.kind === 'freeze' && saved.ev > 3, `freeze report with event ring buffer saved to localStorage (${saved.ev} events)`);
  check(saved.low === '1' && saved.trouble === true && saved.ramp === true, 'freeze locks Low for the session, records it in the save, and stops the auto ramp');
  const lives = await page.evaluate(() => __game.stack);
  await page.evaluate(() => { window.requestAnimationFrame = window.__raf0; window.requestAnimationFrame(__game.frame); });
  check(await until(page, () => __game.state === 'paused', null, 20000), 'when frames return the game is paused (no life lost during the freeze)');
  check(await page.evaluate((l) => __game.stack === l, lives), 'lives unchanged by the freeze');
  check(await page.evaluate(() => /froze/.test(document.querySelector('[data-scr="pause"]')?.textContent || '')), 'pause screen says the graphics froze (with RESUME)');
  await shot(page, '96-freeze-pause.png');
  await page.evaluate(() => document.querySelector('[data-act="resume"]').click());
  check(await until(page, () => __game.state === 'run', null, 20000), 'RESUME returns to the run');
  // b. context loss + restore (as after chrome://gpucrash)
  await page.evaluate(() => { const gl = __game.gfx.renderer.getContext(); window.__ext = gl.getExtension('WEBGL_lose_context'); window.__ext.loseContext(); });
  check(await until(page, () => __game.ctxLost === true && __boot.visible, null, 10000), 'context loss shows the veil ("Graphics context lost, recovering")');
  await page.evaluate(() => window.__ext.restoreContext());
  check(await until(page, () => !__game.ctxLost && !__boot.visible && !__game.busy, null, 180000), 'context restore: veil, recovery on Low, veil hides');
  check(await page.evaluate(() => __game.quality === 'low'), 'recovered on Low quality');
  const rep = await page.evaluate(() => { const a = JSON.parse(localStorage.getItem('ramrun.freeze.v1') || '[]'); return a.map((r) => r.kind).join(','); });
  check(/contextlost/.test(rep), `context-loss report saved (${rep})`);
  await browser.close();
}
for (const e of errors) console.log('ERR ' + e);
check(errors.length === 0, 'no unexpected console errors');
console.log(failures ? `LOADING FAILED (${failures})` : 'LOADING OK'); process.exit(failures ? 1 : 0);
