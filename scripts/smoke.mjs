// Smoke / visual test: Playwright Chromium (software WebGL). Run: npm run build && node scripts/smoke.mjs
// Screenshots land in shots/. Fails on any console error / uncaught exception.
import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shots = path.join(root, 'shots');
fs.mkdirSync(shots, { recursive: true });
const url = pathToFileURL(path.join(root, 'dist', 'index.html')).href;
if (!fs.existsSync(path.join(root, 'dist', 'index.html'))) { console.error('Run `npm run build` first'); process.exit(2); }

const errors = [];
const LAUNCH = { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--allow-file-access-from-files', '--autoplay-policy=no-user-gesture-required', '--enable-precise-memory-info'] };
let browser = await chromium.launch(LAUNCH);
let failures = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) failures++; };

async function open(query, w = 1280, h = 720) {
  // SwiftShader occasionally stalls a page for minutes on startup; retry once with a fresh context
  for (let attempt = 1; ; attempt++) {
    const e0 = errors.length;
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: w < 600, isMobile: w < 600 });
    const page = await ctx.newPage();
    page.setDefaultTimeout(180000);
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console.error] ${query}: ${m.text()}`); });
    page.on('pageerror', (e) => errors.push(`[pageerror] ${query}: ${e.message}`));
    try {
      await page.goto(url + '?manual=1&seed=7' + (query.includes('noq') ? '' : '&quality=medium') + query, { timeout: 120000 });
      await page.waitForFunction(() => !!window.__game && window.__game.started || document.querySelector('#boot .b-err:not([hidden])'), null, { timeout: 120000 });
      if (await page.evaluate(() => !window.__game?.started)) throw new Error('init failed (boot error panel)');
      return { page, ctx };
    } catch (e) {
      console.log(`  (open retry ${attempt}: ${String(e.message).split('\n')[0]})`);
      errors.length = e0;
      await ctx.close().catch(() => {});
      if (attempt >= 2) throw e;
      // Chrome blocks WebGL after repeated context loss in one browser: retry in a fresh browser
      await browser.close().catch(() => {}); browser = await chromium.launch(LAUNCH);
    }
  }
}
const adv = (page, s) => page.evaluate((s) => window.__game.advance(s), s);
// 3D-only capture straight from the WebGL canvas (avoids compositor stalls of full-page screenshots under SwiftShader)
const canvasShot = async (page, name, sec) => {
  const d = await page.evaluate((sec) => {
    const g = window.__game; g.advance(sec);
    const gl = g.gfx.renderer.getContext(), W = gl.drawingBufferWidth, H = gl.drawingBufferHeight, px = new Uint8Array(W * H * 4);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'), im = x.createImageData(W, H);
    for (let y = 0; y < H; y++) im.data.set(px.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
    for (let i = 3; i < im.data.length; i += 4) im.data[i] = 255;
    x.putImageData(im, 0, 0); return c.toDataURL('image/png');
  }, sec);
  fs.writeFileSync(path.join(shots, name), Buffer.from(d.split(',')[1], 'base64')); console.log('  canvas shot', name);
};
const shot = async (page, name) => { try { await page.screenshot({ path: path.join(shots, name), timeout: 60000 }); console.log('  shot', name); } catch { console.log('  (screenshot ' + name + ' skipped: SwiftShader compositor stall)'); } };

// 1. title screen (live 3D behind)
{
  const { page, ctx } = await open('');
  await adv(page, 4); await shot(page, '01-title.png');
  // stage select
  await page.click('text=ESCAPE'); await adv(page, 0.5); await shot(page, '02-stage-select.png');
  await ctx.close();
}
// 2. each zone mid-run (god mode) with key presses
for (let s = 1; s <= 5; s++) {
  const { page, ctx } = await open(`&stage=${s}&god=1&skipcutscenes=1`);
  await adv(page, 3.6);
  await page.keyboard.press('ArrowLeft'); await adv(page, 1.0);
  await page.keyboard.press('ArrowUp'); await adv(page, 0.25);
  await shot(page, `10-zone-${s}-run.png`);
  const st = await page.evaluate(() => ({ state: window.__game.state, speed: window.__game.speed, dist: window.__game.dist }));
  check(st.state === 'run' && st.speed > 5, `zone ${s} running (speed ${st.speed.toFixed(1)}, dist ${st.dist.toFixed(0)})`);
  await ctx.close();
}
// 3. power-ups
for (const k of ['oc', 'cool', 'magnet', 'shield', 'ddr']) {
  const { page, ctx } = await open('&stage=3&god=1');
  await adv(page, 4);
  await page.evaluate((k) => window.__game.activate(k, 9), k);
  await adv(page, 1.2);
  await page.keyboard.press('ArrowRight'); await adv(page, 0.4);
  await shot(page, `20-power-${k}.png`);
  await ctx.close();
}
// 4. swipes on touch viewport (phone) -> gameplay + title
{
  const { page, ctx } = await open('', 390, 844);
  await adv(page, 3); await shot(page, '30-phone-title.png');
  await ctx.close();
  const r = await open('&stage=1', 390, 844);
  await adv(r.page, 4);
  const lane0 = await r.page.evaluate(() => window.__game.lane);
  await r.page.mouse.move(200, 500); await r.page.mouse.down(); await r.page.mouse.move(280, 505, { steps: 4 }); await r.page.mouse.up();
  await adv(r.page, 0.6);
  const lane1 = await r.page.evaluate(() => window.__game.lane);
  check(lane1 === lane0 + 1, `swipe right changes lane (${lane0} -> ${lane1})`);
  await r.page.mouse.move(200, 500); await r.page.mouse.down(); await r.page.mouse.move(205, 420, { steps: 4 }); await r.page.mouse.up();
  await adv(r.page, 0.15);
  const air = await r.page.evaluate(() => !window.__game.grounded);
  check(air, 'swipe up jumps');
  await adv(r.page, 1.0);
  await shot(r.page, '31-phone-run.png');
  await r.ctx.close();
}
// 5. shop + missions + settings
{
  const { page, ctx } = await open('');
  await page.evaluate(() => { window.__game.save.data.ram = 2600; });
  await adv(page, 1);
  await page.click('text=SHOP'); await adv(page, 0.5); await shot(page, '40-shop.png');
  await page.keyboard.press('Escape'); await adv(page, 0.3);
  await page.click('text=MISSIONS'); await adv(page, 0.5); await shot(page, '41-missions.png');
  await ctx.close();
}
// 5b. settings screen + pause + endless mode
{
  const { page, ctx } = await open('');
  await adv(page, 1);
  await page.click('text=SETTINGS'); await adv(page, 0.5); await shot(page, '42-settings.png');
  await ctx.close();
}
{
  const { page, ctx } = await open('&stage=2&god=1');
  await adv(page, 4);
  await page.keyboard.press('p'); await adv(page, 0.5);
  const paused = await page.evaluate(() => window.__game.state);
  check(paused === 'paused', 'P pauses the game');
  await shot(page, '43-pause.png');
  await page.keyboard.press('p'); await adv(page, 0.5);
  check((await page.evaluate(() => window.__game.state)) === 'run', 'P resumes the game');
  await ctx.close();
}
{
  const { page, ctx } = await open('&endless=1&bot=1&skipcutscenes=1');
  await adv(page, 2);
  await page.evaluate(() => window.__game.simulate(45, 60)); await adv(page, 0.2); await shot(page, '44-endless.png');
  const e = await page.evaluate(() => ({ s: window.__game.state, d: window.__game.dist, sc: window.__game.score }));
  check(e.s === 'run' && e.d > 300 && e.sc > 0, `endless run works (dist ${e.d | 0}, score ${e.sc | 0})`);
  await page.evaluate(() => { const g = window.__game; g.stack = 0; g.invuln = 0; g.beginDying(); });
  await adv(page, 4);
  const sv = await page.evaluate(() => window.__game.save.data.bestEndless);
  check(sv > 0, 'endless best score saved (' + sv + ')');
  await ctx.close();
}
// 5b2. perf report at a MacBook-like viewport (1728x1117 @2x) per preset: backbuffer, draw calls, triangles, programs, textures, geometries
{
  const budgets = { low: [150, 300000, 1.05e6], medium: [300, 800000, 1.7e6], high: [600, 1500000, 2.5e6] };
  console.log('  preset  backbuffer   calls   tris     programs textures geometries');
  for (const q of ['low', 'medium', 'high']) {
    const c = await browser.newContext({ viewport: { width: 1728, height: 1117 }, deviceScaleFactor: 2 });
    const page = await c.newPage(); page.setDefaultTimeout(240000);
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console.error] perf ${q}: ${m.text()}`); }); page.on('pageerror', (e) => errors.push(`[pageerror] perf ${q}: ${e.message}`));
    await page.goto(url + `?manual=1&quality=${q}&stage=3&bot=1&god=1&skipcutscenes=1&seed=7`);
    await page.waitForFunction(() => window.__game && window.__game.started);
    await adv(page, 4); await page.evaluate(() => window.__game.simulate(20, 30)); await adv(page, 0.1);
    const m = await page.evaluate(() => { const g = window.__game, i = g.gfx.renderer.info; i.autoReset = false; i.reset(); g.gfx.render(); const o = { calls: i.render.calls, tris: i.render.triangles, prog: i.programs.length, tex: i.memory.textures, geo: i.memory.geometries, buf: g.gfx.bufferSize() }; i.autoReset = true; return o; });
    console.log(`  ${q.padEnd(7)} ${(m.buf[0] + 'x' + m.buf[1]).padEnd(11)} ${String(m.calls).padEnd(7)} ${String(m.tris).padEnd(8)} ${String(m.prog).padEnd(8)} ${String(m.tex).padEnd(8)} ${m.geo}`);
    const [bc, bt, bp] = budgets[q];
    check(m.calls <= bc && m.tris <= bt, `${q}: draw calls ${m.calls} <= ${bc}, triangles ${m.tris} <= ${bt}`);
    check(m.buf[0] * m.buf[1] <= bp, `${q}: backbuffer ${m.buf[0]}x${m.buf[1]} within the pixel budget`);
    await c.close();
  }
}
// 5c. memory leak checks (rendering loop, quality cycling, DOM growth). All sample renderer.info.memory + heap + DOM nodes.
const memSample = (page) => page.evaluate(() => { const g = window.__game, i = g.gfx.renderer.info.memory; const seen = new Set(); g.gfx.scene.traverse((o) => { if (o.geometry) seen.add(o.geometry.uuid); }); return { reach: seen.size, geo: i.geometries, tex: i.textures, heap: performance.memory ? performance.memory.usedJSHeapSize / 1048576 : 0, dom: document.getElementsByTagName('*').length }; });
{
  const { page, ctx } = await open('&stage=3&bot=1&god=1&skipcutscenes=1');
  await adv(page, 2);
  const samples = [];
  for (let i = 0; i < 10; i++) {
    for (let k = 0; k < 20; k++) await page.evaluate(() => window.__game.advance(0.75, 60)); // render ~20 frames per sample, 15 sim-seconds
    const m = await memSample(page); samples.push(m); console.log(`  mem t=${(i + 1) * 15}s geo=${m.geo} reach=${m.reach} tex=${m.tex} heapMB=${m.heap.toFixed(1)} dom=${m.dom}`);
  }
  const last = samples.at(-1), prev = samples.at(-4);
  check(last.geo <= last.reach + 2, `no orphaned geometries (uploaded ${last.geo}, reachable ${last.reach})`);
  // uploads happen lazily the first time each obstacle type is drawn, so bound growth by what the scene can reach
  check(last.geo <= last.reach + 2 && last.tex <= prev.tex + 4, `GPU resources bounded (geo ${prev.geo}->${last.geo} of ${last.reach} reachable, tex ${prev.tex}->${last.tex})`);
  check(last.heap < samples[2].heap * 1.5 + 30, `JS heap stable (${samples[2].heap.toFixed(0)}MB -> ${last.heap.toFixed(0)}MB)`);
  check(last.dom <= samples[2].dom + 25, `DOM node count stable (${samples[2].dom} -> ${last.dom})`);
  await ctx.close();
}
{
  // quality cycling (unlocked quality) + dynamic resolution path
  const { page, ctx } = await open('&noq&stage=2&god=1');
  await adv(page, 2);
  await page.evaluate(() => window.__game.applySettings({ quality: 'medium' })); await adv(page, 2);
  const s0 = await memSample(page);
  const qs = ['low', 'medium', 'high', 'low', 'high', 'medium', 'low', 'high'];
  let m;
  for (const q of qs) { await page.evaluate((q) => { window.__game.applySettings({ quality: q }); window.__game.resScale = 0.7; window.__game.gfx.setScale(0.7); }, q); await adv(page, 1); }
  await page.evaluate(() => { window.__game.applySettings({ quality: 'medium' }); });
  await adv(page, 2); m = await memSample(page);
  check(m.geo <= s0.geo + 40 && m.reach <= s0.reach + 40, `quality cycling does not leak (geo ${s0.geo} -> ${m.geo}, reachable ${s0.reach} -> ${m.reach})`);
  console.log(`  quality-cycle heapMB ${s0.heap.toFixed(0)} -> ${m.heap.toFixed(0)}, tex ${s0.tex} -> ${m.tex}`);
  check(m.tex <= s0.tex + 12, 'quality cycling does not leak textures');
  await ctx.close();
}
// 5d. skins in game + a real cutscene
for (const skin of ['retro', 'rgb', 'rasp']) {
  const { page, ctx } = await open('&stage=1&god=1');
  await page.evaluate((s) => { window.__game.kilo.setSkin(s); }, skin);
  await adv(page, 4); await shot(page, `70-skin-${skin}.png`);
  await ctx.close();
}
{
  const { page, ctx } = await open('&stage=1&god=1');
  await adv(page, 2);
  await page.evaluate(() => { const g = window.__game; g.dist = g.goalDist - 30; });
  let guard = 0; while (guard++ < 30 && (await page.evaluate(() => window.__game.state)) !== 'cutscene') await page.evaluate(() => window.__game.simulate(0.5, 30));
  await adv(page, 0.3); await shot(page, '71-cutscene.png');
  check((await page.evaluate(() => window.__game.state)) === 'cutscene', 'stage clear plays the cutscene');
  await page.keyboard.press('Space'); await adv(page, 0.2); await shot(page, '72-cutscene-panel2.png');
  await ctx.close();
}
// 5e. challenge link (?beat=&from=) + share/leaderboard UI in the game over screen
{
  const { page, ctx } = await open('&beat=48&from=akshat%3Cb%3E&noq');
  await adv(page, 4); await shot(page, '80-challenge-title.png');
  const banner = await page.evaluate(() => document.body.innerText.includes('akshat') && document.body.innerText.includes('48 GB'));
  check(banner, 'challenge banner shows "<from> saved 48 GB from Sam"');
  check(await page.evaluate(() => document.body.innerText.includes('akshatb') && !document.body.innerText.includes('<')), 'challenge name is sanitized (no markup survives)');
  await page.evaluate(() => { const g = window.__game; g.startRun('endless', 1, true); });
  await adv(page, 3);
  await page.evaluate(() => { const g = window.__game; g.ramThisRun = 61; g.runTime = 40; g.stack = 0; g.invuln = 0; g.beginDying(); });
  await adv(page, 4); await shot(page, '81-challenge-gameover-win.png');
  const win = await page.evaluate(() => /beat/i.test(document.body.innerText));
  check(win, 'game over compares against the challenge');
  await ctx.close();
}
// 5f. run intro shot + Sam Cam expressions (desktop and phone)
{
  const { page, ctx } = await open('&noq&quality=low', 640, 360); // small viewport: SwiftShader can stall for minutes on the first big frame of a new scene
  await adv(page, 2);
  await page.evaluate(() => window.__game.startRun('endless', 1));
  await canvasShot(page, '90-intro.png', 0.35);
  check(await page.evaluate(() => window.__game.intro === true), 'first run starts with the Sam intro shot');
  await page.keyboard.press('ArrowLeft'); await adv(page, 2.5);
  check(await page.evaluate(() => window.__game.intro === false && window.__game.state === 'run'), 'any input skips the intro');
  for (const e of ['earnest', 'smug', 'shock', 'frustrated', 'glee']) {
    await page.evaluate((e) => window.__game.samExpr(e, 99), e); await adv(page, 0.5);
    await page.screenshot({ path: path.join(shots, `91-samcam-${e}.png`), clip: { x: 380, y: 0, width: 260, height: 200 }, timeout: 180000 });
  }
  await shot(page, '92-run-samcam.png');
  await ctx.close();
  const r = await open('&stage=1&god=1', 390, 844);
  await adv(r.page, 4); await r.page.evaluate(() => { window.__game.samExpr('shock', 99); window.__game.say('chase'); }); await adv(r.page, 0.6);
  await shot(r.page, '93-phone-samcam.png');
  await r.ctx.close();
}
// 6. game over (caught)
{
  const { page, ctx } = await open('&stage=2');
  await adv(page, 4);
  await page.evaluate(() => { const g = window.__game; g.stack = 0; g.invuln = 0; g.beginDying(); });
  await adv(page, 1.4); await shot(page, '50-catch.png');
  await adv(page, 3); await shot(page, '51-gameover.png');
  const st = await page.evaluate(() => window.__game.state);
  check(st === 'over', 'caught -> game over screen (' + st + ')');
  await ctx.close();
}
// 7. full escape: complete all 5 stages via test hooks, expect credits
{
  const { page, ctx } = await open('&stage=1&god=1&skipcutscenes=1');
  await adv(page, 4);
  for (let s = 1; s <= 5; s++) {
    await page.evaluate(() => { const g = window.__game; g.dist = g.goalDist - 30; });
    let guard = 0;
    while (guard++ < 40) {
      await page.evaluate(() => window.__game.simulate(1, 30));
      const st = await page.evaluate(() => ({ s: window.__game.state, stage: window.__game.stage }));
      if (s < 5 ? st.stage === s + 1 : st.s === 'finale') break;
    }
    const st = await page.evaluate(() => ({ s: window.__game.state, stage: window.__game.stage }));
    check(s < 5 ? st.stage === s + 1 : st.s === 'finale', `stage ${s} completed -> ${s < 5 ? 'stage ' + st.stage : st.s}`);
    if (s < 5) { await adv(page, 0.5); if (s === 2) await shot(page, '60-stage-transition.png'); }
  }
  await adv(page, 3.5); await shot(page, '61-finale-chute.png');
  await adv(page, 8); await shot(page, '62-finale-prices.png');
  await page.waitForTimeout(14000); await adv(page, 0.1); await shot(page, '63-credits.png');
  const credits = await page.evaluate(() => !!document.querySelector('.scr-final:not([hidden])'));
  check(credits, 'credits screen is shown after the finale');
  await page.evaluate(() => window.__game.finaleDone());
  const done = await page.evaluate(() => ({ esc: window.__game.save.data.escapeDone, st: window.__game.state }));
  check(done.esc === true && done.st === 'attract', 'escape complete flag saved, back at the title');
  await ctx.close();
}

await browser.close();
if (errors.length) { console.error('\nERRORS:\n' + errors.slice(0, 20).join('\n')); failures += errors.length; }
console.log(failures ? `\nSMOKE FAILED (${failures})` : '\nSMOKE OK');
process.exit(failures ? 1 : 0);
