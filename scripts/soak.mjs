// Soak test, one preset per run:  node scripts/soak.mjs low|medium|high [seconds]
// 3-minute bot run at a MacBook-like viewport (1728x1117 @2x). Logs renderer.info and the Chromium GPU-process RSS every 10 s.
// Under SwiftShader the GL memory lives in that process's RAM, so a climbing RSS means a GPU-memory leak.
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
const preset = process.argv[2] || 'low', total = Number(process.argv[3] || 180);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const url = pathToFileURL(path.join(root, 'dist', 'index.html')).href;
const gpuRss = () => { try { const out = execSync("ps -eo rss=,args= | grep -E -- '--type=(gpu-process|renderer)' | grep -v grep", { encoding: 'utf8' }).trim().split('\n'); let gpu = 0, ren = 0; for (const l of out) { const kb = Number(l.trim().split(/\s+/)[0]); if (l.includes('--type=gpu-process')) gpu += kb; else ren += kb; } return [gpu / 1024, ren / 1024]; } catch { return [0, 0]; } };
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info'] });
const ctx = await browser.newContext({ viewport: { width: 1728, height: 1117 }, deviceScaleFactor: 2 });
const page = await ctx.newPage(); page.setDefaultTimeout(240000);
const errs = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto(url + `?manual=1&quality=${preset}&stage=3&bot=1&god=1&skipcutscenes=1&seed=11`);
await page.waitForFunction(() => window.__game && window.__game.started);
const rows = [];
let t = 0;
while (t < total) {
  for (let k = 0; k < 10; k++) await page.evaluate(() => window.__game.advance(1, 30)); // 10 sim-seconds, 10 rendered frames
  t += 10;
  const m = await page.evaluate(() => { const g = window.__game, r = g.gfx.renderer, i = r.info; i.autoReset = false; i.reset(); g.gfx.render(); const o = { calls: i.render.calls, tris: i.render.triangles, geo: i.memory.geometries, tex: i.memory.textures, prog: i.programs.length, buf: g.gfx.bufferSize().join('x'), heap: performance.memory ? performance.memory.usedJSHeapSize / 1048576 : 0 }; i.autoReset = true; return o; });
  const [gpu, ren] = gpuRss();
  rows.push({ t, ...m, gpuMB: gpu, rendMB: ren });
  console.log(`t=${t}s buf=${m.buf} calls=${m.calls} tris=${m.tris} prog=${m.prog} tex=${m.tex} geo=${m.geo} jsHeap=${m.heap.toFixed(0)}MB gpuProcRSS=${gpu.toFixed(0)}MB rendererRSS=${ren.toFixed(0)}MB`);
}
await browser.close();
const a = rows[2] ?? rows[0], z = rows.at(-1);
const grow = (k) => (z[k] - a[k]);
let bad = 0; const chk = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) bad++; };
chk(z.prog <= a.prog + 6, `shader programs bounded (${a.prog} -> ${z.prog})`);
chk(z.tex <= a.tex + 4, `textures bounded (${a.tex} -> ${z.tex})`);
chk(z.geo <= a.geo + 40, `geometries bounded (${a.geo} -> ${z.geo})`);
if (a.gpuMB > 0) chk(z.gpuMB <= a.gpuMB * 1.25 + 60, `GPU-process RSS flat (${a.gpuMB.toFixed(0)} -> ${z.gpuMB.toFixed(0)} MB)`);
chk(z.rendMB <= a.rendMB * 1.25 + 80, `renderer RSS flat (${a.rendMB.toFixed(0)} -> ${z.rendMB.toFixed(0)} MB)`);
chk(errs.length === 0, 'no console errors ' + errs.slice(0, 2).join('|'));
console.log(`SOAK ${preset} ${bad ? 'FAILED' : 'OK'}`);
process.exit(bad ? 1 : 0);
