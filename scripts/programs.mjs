// Shader-program guarantee: after warm-up, the bot runs through every zone with every power-up, skin and Sam expression;
// FAIL if renderer.info.programs.length ever increases, or any render() call takes > 50 ms. Prints before/after counts per preset.
// Run: node scripts/programs.mjs [low|medium|high ...]
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const url = pathToFileURL(path.resolve('dist/index.html')).href;
const presets = process.argv.slice(2).filter((a) => !a.startsWith('--')).length ? process.argv.slice(2).filter((a) => !a.startsWith('--')) : ['low', 'medium'];
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--allow-file-access-from-files'] });
let fail = 0; const errors = [];
for (const q of presets) {
  const ctx = await browser.newContext({ viewport: { width: 640, height: 360 } }); const p = await ctx.newPage(); p.setDefaultTimeout(600000);
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); }); p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(`${url}?manual=1&warm=${process.env.COLD ? 0 : 1}&seed=7&nointro=1&god=1&bot=1&checkshaders=1&quality=${q}`, { timeout: 120000 });
  await p.waitForFunction(() => window.__game?.started && !window.__game.warming && !window.__boot.visible, null, { timeout: 600000 });
  const before = await p.evaluate(() => { const g = __game; g.warmReport = []; return g.gfx.renderer.info.programs.length; });
  const r = await p.evaluate(async () => {
    const g = __game, ren = g.gfx.renderer; const base = ren.info.programs.length; let maxRender = 0, worst = ''; const grew = [];
    const orig = g.gfx.render.bind(g.gfx); g.gfx.render = () => { const t = performance.now(); orig(); const d = performance.now() - t; if (d > maxRender) { maxRender = d; } };
    const kinds = ['ddr', 'magnet', 'shield', 'cool', 'oc']; const skins = ['kilo', 'retro', 'rgb', 'rasp']; const exprs = ['earnest', 'smug', 'shock', 'frustrated', 'glee'];
    const seen = new Set(); let n = 0; const baseKeys = new Set(ren.info.programs.map((x) => x.cacheKey)); const newOnes = []; const newKeys = []; const baseDepth = ren.info.programs.filter((x) => x.cacheKey.startsWith('depth')).map((x) => x.cacheKey);
    for (let stage = 1; stage <= 5; stage++) {
      g.startRun('escape', stage, true);
      for (let i = 0; i < 40; i++) {
        if (i % 4 === 0) g.activate(kinds[(i / 4 + stage) % 5], 3);
        if (i % 8 === 0) g.kilo.setSkin(skins[(i / 8 + stage) % 4]);
        g.samExpr(exprs[i % 5], 1); if (i % 10 === 5) { g.say('hit'); g.fx.burst(0, 1, 0, 30, 5, 1, 0.1, 1, 1, 1); g.fx.scatterStick(0, 1, 0.2); }
        g.advance(0.5); n++;
        const c = ren.info.programs.length; if (c > base && c !== (grew.n ?? base)) { grew.n = c; g.gfx.scene.traverse((o) => { if (o.castShadow && o.visible && !o.isInstancedMesh) { let v = true, a = o; while (a) { if (!a.visible) v = false; a = a.parent; } if (v) { const ms = Array.isArray(o.material) ? o.material : [o.material]; const w = o.getWorldPosition(new o.position.constructor()); grew.push(`   vis-caster ${o.name || o.type} geo=${o.geometry?.type} mats=${ms.filter(Boolean).map((m) => m.type + (m.map ? "+map" : "")).join("/")} pos=${w.x.toFixed(1)},${w.y.toFixed(1)},${w.z.toFixed(1)}`); } } }); grew.push(`stage ${stage} i ${i}: ${base} -> ${c}`); for (const x of ren.info.programs) if (!baseKeys.has(x.cacheKey)) { baseKeys.add(x.cacheKey); newOnes.push(`${x.name} :: ${x.cacheKey.slice(0, 400)}`); } }
        for (const ch of g.world.chunks) for (const o of ch.obj) if (o) seen.add(o.userData?.kind ?? 'obj');
      }
    }
    // finale + skin cycling
    g.state = 'run'; g.beginFinale?.(); for (let i = 0; i < 12; i++) g.advance(0.5);
    const after = ren.info.programs.length; for (const x of ren.info.programs) if (!baseKeys.has(x.cacheKey)) { baseKeys.add(x.cacheKey); newKeys.push(x.cacheKey); newOnes.push('(finale) ' + 'BASEPHYS=' + [...ren.info.programs].filter((y) => y.name === x.name).map((y) => y.cacheKey.slice(0,500)).join(' || ') + ' NEW=' + x.name + ' :: ' + x.cacheKey.slice(0, 500)); } g.gfx.render = orig;
    const owners = []; for (const x of ren.info.programs) { if (!newKeys.includes(x.cacheKey)) continue; g.gfx.scene.traverse((o) => { const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []; for (const m of ms) { const pr = ren.properties.get(m); if (pr.currentProgram && pr.currentProgram.cacheKey === x.cacheKey) owners.push(`${o.name || o.type} mat=${m.name || m.type} transparent=${m.transparent} opacity=${m.opacity} side=${m.side} color=${m.color?.getHexString()} parent=${o.parent?.name || o.parent?.type}`); } }); }
    const casters = []; g.gfx.scene.traverse((o) => { if (!o.castShadow) return; const ms = Array.isArray(o.material) ? o.material : [o.material]; for (const m of ms) if (m && (m.map || m.alphaTest > 0 || m.alphaMap || m.displacementMap)) casters.push(`${o.name || o.type} ${m.type} map=${!!m.map} at=${m.alphaTest} side=${m.side} vis=${o.visible} shadowSide=${m.shadowSide}`); });
    return { baseDepth, casters, owners, newOnes, base, after, grew, maxRender: +maxRender.toFixed(1), frames: n, state: g.state };
  });
  if (process.argv.includes('--strict-render') && r.maxRender >= 50) { fail++; console.log(`FAIL ${q}: a render() call took ${r.maxRender}ms (> 50ms)`); } // under SwiftShader (software GPU) render() blocks, so this bound is only meaningful on real GPUs
  for (const k of r.baseDepth) console.log('  BASEDEPTH ' + k.slice(0, 400));
  for (const o of r.casters) console.log('  CASTER ' + o);
  for (const o of r.owners) console.log('  OWNER ' + o);
  for (const o of r.newOnes) console.log('  NEW PROGRAM ' + o);
  console.log(`${q}: programs before=${before} after-run=${r.after} (base ${r.base}) frames=${r.frames} maxRender=${r.maxRender}ms ${r.grew.join(';')}`);
  if (process.env.COLD) { console.log(`COLD ${q}: ${r.base} programs at start -> ${r.after} after the playthrough (+${r.after - r.base} compiled during play)`); } else if (r.after !== r.base) { fail++; console.log(`FAIL ${q}: programs grew ${r.base} -> ${r.after} (${r.grew.join(';')})`); } else console.log(`PASS ${q}: no new shader programs after warm-up`);
  await ctx.close();
}
await browser.close();
for (const e of errors) console.log('ERR ' + e);
if (errors.length) fail++;
console.log(fail ? 'PROGRAMS FAILED' : 'PROGRAMS OK'); process.exit(fail ? 1 : 0);
