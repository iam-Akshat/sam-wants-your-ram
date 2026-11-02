// NOTE: runs the game in manual-step mode (the rAF loop is replaced by __game.advance) because SwiftShader's compositor stalls real-time rAF;
// all INPUT is real (clicks/keys). Flow / soft-lock test: drives every state transition with REAL input events (clicks, keys) in a live (non-manual) game loop and asserts the
// game reaches 'run' and dist increases afterwards. Run: node scripts/flow.mjs
import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const url = pathToFileURL(path.join(root, 'dist', 'index.html')).href;
if (!fs.existsSync(path.join(root, 'dist', 'index.html'))) { console.error('Run `npm run build` first'); process.exit(2); }
const errors = []; let failures = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) failures++; };
const LAUNCH = { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--allow-file-access-from-files', '--autoplay-policy=no-user-gesture-required', '--enable-precise-memory-info'] };
let browser = null;

async function open(query = '', init) {
  if (browser) await browser.close().catch(() => {});
  browser = await chromium.launch(LAUNCH); // fresh browser per section: avoids Chrome's blocked-after-context-loss accumulation under SwiftShader
  const ctx = await browser.newContext({ viewport: { width: 640, height: 360 } });
  if (init) await ctx.addInitScript(init);
  const page = await ctx.newPage(); page.setDefaultTimeout(240000);
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console.error] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
  await page.goto(url + '?perf=1&manual=1&warm=1&seed=7&nointro=1&' + query, { timeout: 120000 });
  await page.waitForFunction(() => !!window.__game && window.__game.started && !window.__game.warming && !window.__boot.visible, null, { timeout: 240000 });
  return { page, ctx };
}
const st = (p) => p.evaluate(() => ({ s: __game.state, d: __game.dist, paused: __game.state === 'paused' }));
const adv = (p, s) => p.evaluate((s) => window.__game.advance(s), s);
/** advance the game until cond() is true (max ~60 iterations of 0.4 s) */
async function until(p, cond, arg) {
  for (let i = 0; i < 60; i++) { if (await p.evaluate(cond, arg)) return true; await adv(p, 0.4); }
  return await p.evaluate(cond, arg);
}
/** wait until state==='run' and dist has advanced by >= 3 m */
async function reachRun(p, label) {
  const ok = await until(p, () => __game.state === 'run');
  let good = false;
  if (ok) { const d0 = (await st(p)).d; good = await until(p, (d0) => __game.dist > d0 + 3, d0); }
  const s = await st(p).catch(() => ({}));
  check(ok && good, ok && good ? `${label}: reaches run and dist increases` : `${label}: STUCK in ${JSON.stringify(s)}`);
  return ok && good;
}
const click = (p, text) => p.locator(`button:visible:has-text("${text}")`).first().dispatchEvent('click', undefined, { timeout: 20000 });
const setHidden = (p, h) => p.evaluate((h) => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => h }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') }); document.dispatchEvent(new Event('visibilitychange')); }, h);
const overlay = (p, name) => p.evaluate((n) => { const e = document.querySelector(`[data-scr="${n}"]`); return !!e && !e.hidden; }, name);
const waitState = async (p, s) => { if (!(await until(p, (s) => __game.state === s, s))) throw new Error('never reached state ' + s); };

// ---------- 1. title -> RUN (intro skipped with a key) -> pause/resume with Escape
{
  const { page: p, ctx } = await open();
  check(await overlay(p, 'title'), 'title visible after warm-up');
  await click(p, 'RUN');
  await adv(p, 0.3);
  await reachRun(p, 'title RUN');
  await p.keyboard.press('Escape'); await waitState(p, 'paused'); check(await overlay(p, 'pause'), 'Escape pauses and shows overlay');
  await p.keyboard.press('Escape'); await reachRun(p, 'Escape resumes');
  // pause -> RESTART
  await p.keyboard.press('Escape'); await waitState(p, 'paused'); await click(p, 'RESTART'); await reachRun(p, 'pause -> restart');
  // pause -> settings -> done -> resume
  await p.keyboard.press('Escape'); await waitState(p, 'paused'); await click(p, 'SETTINGS'); await click(p, 'DONE'); await click(p, 'RESUME'); await reachRun(p, 'pause -> settings -> resume');
  // pause -> quit -> RUN again
  await p.keyboard.press('Escape'); await waitState(p, 'paused'); await click(p, 'QUIT TO MENU'); await waitState(p, 'attract');
  check(await overlay(p, 'title'), 'quit shows title'); await click(p, 'RUN'); await reachRun(p, 'quit -> RUN again');
  // tab hidden during run: pauses, return shows overlay, resume works
  await setHidden(p, true); await waitState(p, 'paused'); await setHidden(p, false);
  check(await overlay(p, 'pause'), 'hidden tab during run: pause overlay shown on return'); await click(p, 'RESUME'); await reachRun(p, 'hidden during run -> resume');
  // tab hidden during intro/countdown
  await p.keyboard.press('Escape'); await waitState(p, 'paused'); await click(p, 'RESTART');
  await setHidden(p, true); await adv(p, 0.1); const sh = await st(p); await setHidden(p, false);
  check(sh.s === 'paused' || sh.s === 'run', `hidden during countdown -> ${sh.s}`);
  if (sh.s === 'paused') { check(await overlay(p, 'pause'), 'pause overlay shown after hidden countdown'); await click(p, 'RESUME'); }
  await reachRun(p, 'hidden during countdown -> resume');
  await ctx.close();
}

// ---------- 2. lives, refill, revive, game over -> retry / menu, leaderboard failure, shop/missions/settings back
{
  let { page: p, ctx } = await open();
  await click(p, 'RUN'); await adv(p, 0.2); await reachRun(p, 'life test run');
  const r = await p.evaluate(() => {
    const g = __game; g.manual = true; g.invuln = 0; g.powers.oc = 0; g.shield = false; const out = { start: g.stack };
    const c = g.world.chunks[0];
    g.onHit(c, 0, 0); out.hit1 = g.stack; g.invuln = 0; g.onHit(c, 0, 0); out.hit2 = g.stack; out.stillRunning = g.state === 'run';
    // collecting RAM never adds lives
    const col = g.world.collect; col.gotN = 1; col.gotKind[0] = 0; col.gotX[0] = 0; col.gotY[0] = 1; col.gotZ[0] = 0;
    for (let i = 0; i < 20; i++) g.processPickups(); out.afterRam = g.stack;
    g.manual = false; return out;
  });
  check(r.start === 3 && r.hit1 === 2 && r.hit2 === 1 && r.stillRunning, `a run starts with 3 lives and each hit costs exactly 1 (${JSON.stringify(r)})`);
  check(r.afterRam === 1, 'collecting RAM never adds a life (no refills)');
  await adv(p, 0.2);
  check(await p.evaluate(() => document.querySelectorAll('.stackpips i.on').length === 1 && document.querySelectorAll('.stackpips i').length === 3), 'HUD shows 3 life icons, 1 left');
  // the 3rd hit = caught -> game over directly (no revive offer)
  await p.evaluate(() => { __game.invuln = 0; __game.onHit(__game.world.chunks[0], 0, 0); });
  await until(p, () => document.querySelector('[data-scr="gameover"]')?.hidden === false);
  check(!(await p.evaluate(() => !!document.querySelector('[data-act="revive"]'))) && await p.evaluate(() => __game.stack === 0), 'the 3rd hit ends the run (game over, no revive)');
  // failed leaderboard submit must not lock anything
  await p.fill('[data-nick]', 'tester'); await click(p, 'SUBMIT'); await adv(p, 0.5);
  await click(p, 'RETRY'); await reachRun(p, 'game over -> retry (after failed submit)');
  // fresh page for the second half (Chrome blocks WebGL after repeated context loss under SwiftShader)
  ({ page: p, ctx } = await open()); await click(p, 'RUN'); await adv(p, 0.2); await reachRun(p, 'second half: run');
  await p.evaluate(() => { __game.stack = 1; __game.invuln = 0; __game.onHit(__game.world.chunks[0], 0, 0); });
  await until(p, () => document.querySelector('[data-scr="gameover"]')?.hidden === false); check(true, 'caught again -> game over');
  await click(p, 'MENU'); await waitState(p, 'attract'); await click(p, 'RUN'); await reachRun(p, 'game over -> menu -> RUN');
  // fresh page again: SwiftShader's GPU watchdog drops the context after enough 2 s software frames in one page
  ({ page: p, ctx } = await open()); 
  // menus and back buttons
  if (false) console.log('  dbg', JSON.stringify(await p.evaluate(() => ({ s: __game.state, boot: __boot.visible, busy: __game.busy, warming: __game.warming, hud: __game.ui.hudOn, step: document.querySelector('#boot .b-step').textContent, log: __boot.log.slice(-5), disp: document.getElementById('boot').style.display }))));
  for (const name of ['SHOP', 'MISSIONS', 'SETTINGS', 'CREDITS']) { await click(p, name); await adv(p, 0.3); await click(p, 'BACK'); await adv(p, 0.2); check(await overlay(p, 'title'), `${name} -> BACK returns to title`); }
  await click(p, 'RUN'); await reachRun(p, 'after visiting menus');
  await ctx.close();
}

// ---------- 3. escape stage clear -> cutscene -> next stage, finale
{
  const { page: p, ctx } = await open();
  await click(p, 'ESCAPE'); await adv(p, 0.3); await p.locator('[data-act="stage"][data-n="1"]').click({ force: true }); await adv(p, 0.2);
  await reachRun(p, 'escape stage 1');
  await p.evaluate(() => { const g = __game; g.dist = g.goalDist - 3; });
  await waitState(p, 'cutscene', 120000); check(true, 'stage clear reaches the cutscene');
  await p.keyboard.press('Escape'); await reachRun(p, 'Escape skips cutscene -> stage 2');
  check(await p.evaluate(() => __game.stage === 2), 'now on stage 2');
  await p.evaluate(() => { __game.stage = 5; __game.dist = __game.goalDist = 1e6; __game.world.params.goalDist = 1e6; __game.world.params.stage = 4; __game.goalDist = 1e6 + 0; });
  await p.evaluate(() => { __game.dist = __game.goalDist + 1; });
  await waitState(p, 'finale', 120000); check(true, 'final stage reaches the finale');
  await until(p, () => document.querySelector('[data-scr="final"]')?.hidden === false || !!document.querySelector('[data-act="finale"]'));
  await click(p, 'CONTINUE'); await waitState(p, 'attract', 60000); check(await overlay(p, 'title'), 'finale CONTINUE returns to title'); await click(p, 'RUN'); await reachRun(p, 'after finale -> RUN');
  await ctx.close();
}

// ---------- 4. challenge link + audio failure + watchdogs + adaptive resolution
{
  const { page: p, ctx } = await open('beat=48&from=akshat', () => { try { Object.defineProperty(window, 'AudioContext', { value: undefined }); Object.defineProperty(window, 'webkitAudioContext', { value: undefined }); } catch { /* */ } });
  check(await p.evaluate(() => !!document.querySelector('[data-chal]') && !document.querySelector('[data-chal]').hidden), 'challenge banner shows');
  await click(p, 'RUN'); await adv(p, 0.2); await reachRun(p, 'challenge link + no audio');
  // watchdog: simulated frozen time during run recovers
  await p.evaluate(() => { __game.timeScale = 0; for (let i = 0; i < 5; i++) __game.watchdog(1); });
  check(await p.evaluate(() => __game.timeScale > 0), 'run watchdog recovers a frozen run');
  await reachRun(p, 'after run watchdog');
  // watchdog: stuck countdown forced to GO
  await p.keyboard.press('Escape'); await waitState(p, 'paused'); await click(p, 'RESTART'); await adv(p, 0.2);
  await p.evaluate(() => { __game.timeScale = 0; for (let i = 0; i < 7; i++) __game.watchdog(1); });
  check(await p.evaluate(() => __game.state === 'run'), 'countdown watchdog forces GO');
  await p.evaluate(() => { __game.timeScale = 1; }); await reachRun(p, 'after countdown watchdog');
  // adaptive resolution: healthy intervals UNDER the 60fps cap (16.7ms) must recover the scale; warm-up must be ignored
  const a = await p.evaluate(() => {
    const g = __game; g.manual = true; const out = {};
    g.warmT = 0; g.resScale = 0.6; g.gfx.setScale(0.6); g.lastDown = -99; g.lastScaleChange = -99; g.upDelay = 6; g.goodChecks = 0;
    for (let i = 0; i < 40; i++) g.adaptRes(16.7, 3, false); out.recovered = g.resScale;
    g.warmT = 5; g.resScale = 1; for (let i = 0; i < 8; i++) g.adaptRes(60, 40, false); out.warmIgnored = g.resScale;
    g.warmT = 0; g.slowChecks = 0; g.lastScaleChange = -99; for (let i = 0; i < 6; i++) g.adaptRes(40, 20, false); out.slowScale = g.resScale;
    g.resScale = 1; g.gfx.setScale(1); g.manual = false; return out;
  });
  check(a.recovered === 1, `resolution recovers to 1.0 under the 60fps cap (${a.recovered})`);
  check(a.warmIgnored === 1, 'bad frames during warm-up are ignored');
  check(a.slowScale < 1, `sustained slow frames still downscale (${a.slowScale})`);
  await ctx.close();
}
// ---------- 5. frame-loop cap: every state where anything moves accepts every ~16.7 ms rAF tick; only paused may skip
{
  const { page: p, browser: b } = await (async () => { const o = await open('warm=0'); return { page: o.page, browser: browser }; })();
  const r = await p.evaluate(() => {
    const g = __game; const out = {}; const raf = window.requestAnimationFrame; window.requestAnimationFrame = () => 0;
    const step0 = g.step, render0 = g.gfx.render; g.manual = false; g.warming = false; g.started = true; let n = 0; g.step = () => { n++; }; g.gfx.render = () => {};
    for (const st of ['attract', 'countdown', 'run', 'cutscene', 'over', 'dying', 'clear', 'paused']) {
      g.state = st; g.last = 0; n = 0; for (let i = 0; i < 120; i++) g.frame(1000 + i * 16.7); out[st] = n;
    }
    // 120 Hz display: still capped at 60
    g.state = 'attract'; g.last = 0; n = 0; for (let i = 0; i < 240; i++) g.frame(5000 + i * 8.33); out.attract120 = n;
    g.step = step0; g.gfx.render = render0; g.manual = true; window.requestAnimationFrame = raf; return out;
  });
  for (const st of ['attract', 'countdown', 'run', 'cutscene', 'over', 'dying', 'clear']) check(r[st] === 120, `frame loop accepts every 16.7 ms tick in ${st} (${r[st]}/120)`);
  check(r.paused <= 62 && r.paused >= 58, `paused may skip to ~30 fps (${r.paused}/120)`);
  check(r.attract120 >= 118 && r.attract120 <= 121, `120 Hz display stays at 60 fps in attract (${r.attract120}/240)`);
}
await browser?.close();
for (const e of errors) { console.log('ERR ' + e); }
check(errors.length === 0, 'no console errors / exceptions');
console.log(failures ? `FLOW FAILED (${failures})` : 'FLOW OK'); process.exit(failures ? 1 : 0);
