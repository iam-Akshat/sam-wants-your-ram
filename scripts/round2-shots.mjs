// Quick visual pass for Sam-related shots (title, intro, Sam Cam expressions, catch). Run: node scripts/round2-shots.mjs
import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path'; import fs from 'node:fs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'); const shots = path.join(root, 'shots'); fs.mkdirSync(shots, { recursive: true });
const url = pathToFileURL(path.join(root, 'dist', 'index.html')).href;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
async function open(q, w, h) { const c = await browser.newContext({ viewport: { width: w, height: h } }); const p = await c.newPage(); p.setDefaultTimeout(240000); p.on('pageerror', (e) => console.log('ERR', e.message)); await p.goto(url + '?manual=1&quality=low&seed=7' + q); await p.waitForFunction(() => window.__game && window.__game.started, null, { timeout: 240000 }); return { p, c }; }
const adv = (p, s) => p.evaluate((s) => window.__game.advance(s), s);
const only = process.argv[2];
const sc = async (name, fn) => { if (only && !name.startsWith(only)) return; console.log('==', name); await fn(); };
await sc('title', async () => { for (const [w, h, n] of [[1280, 720, 'title-desktop'], [390, 844, 'title-phone']]) { const { p, c } = await open('', w, h); await adv(p, 4); await p.waitForTimeout(2500); await p.screenshot({ path: path.join(shots, `r2-${n}.png`), timeout: 240000 }); await c.close(); } });
await sc('run', async () => {
  const { p, c } = await open('&stage=2&god=1&skipcutscenes=1', 1280, 720); await adv(p, 4);
  for (const e of ['earnest', 'smug', 'shock', 'frustrated', 'glee']) { await p.evaluate((e) => { window.__game.samExpr(e, 99); window.__game.say('chase'); }, e); await adv(p, 0.6); await p.screenshot({ path: path.join(shots, `r2-samcam-${e}.png`), timeout: 240000 }); }
  await c.close();
  const r = await open('&stage=2&god=1', 390, 844); await adv(r.p, 4); await r.p.evaluate(() => { window.__game.samExpr('shock', 99); window.__game.say('chase'); }); await adv(r.p, 0.6); await r.p.screenshot({ path: path.join(shots, 'r2-samcam-phone.png'), timeout: 240000 }); await r.c.close();
});
await sc('catch', async () => {
  const { p, c } = await open('&stage=2&god=0', 1280, 720); await adv(p, 3);
  await p.evaluate(() => { const g = window.__game; g.stack = 0; g.invuln = 0; g.beginDying(); }); await adv(p, 1.9); await p.screenshot({ path: path.join(shots, 'r2-catch.png'), timeout: 240000 });
  await adv(p, 3); await p.screenshot({ path: path.join(shots, 'r2-gameover.png'), timeout: 240000 }); await c.close();
});
await browser.close(); process.exit(0);
