/** ?perf=1 overlay: fps, frame-time graph, quality/resScale/backbuffer, hitch log + "Copy report". Zero cost when off. */
import { diag } from './diag';
export interface PerfSnap { state: string; dist: number; zone: number; programs: number; textures: number; geometries: number; calls: number; tris: number }
export interface PerfCtx { quality: string; resScale: number; backbuffer: string; refreshMs: number; warm: boolean; extra: () => Record<string, unknown> }
interface Hitch { t: number; ms: number; step: number; render: number; dProg: number; dTex: number; dGeo: number; state: string; dist: number; zone: number; warm: boolean }

const N = 150;
export class PerfMon {
  private el: HTMLDivElement; private cv: HTMLCanvasElement; private g: CanvasRenderingContext2D;
  private head: HTMLDivElement; private logEl: HTMLDivElement;
  private ring = new Float32Array(N); private cost = new Float32Array(N); private pos = 0; private n = 0;
  hitches: Hitch[] = []; notes: { t: number; msg: string }[] = [];
  private prev: PerfSnap | null = null; private t0 = performance.now(); private txtT = 0; private total = 0; private over25 = 0; private over50 = 0;
  private all: number[] = [];
  constructor(private ctxFn: () => PerfCtx) {
    const el = document.createElement('div'); this.el = el;
    el.style.cssText = 'position:fixed;left:6px;bottom:6px;z-index:99999;width:330px;max-height:60vh;overflow:hidden;background:rgba(0,0,0,.78);color:#9ff;font:11px/1.35 ui-monospace,Menlo,monospace;padding:6px 8px;border-radius:8px;pointer-events:none;white-space:pre';
    this.head = document.createElement('div'); el.appendChild(this.head);
    this.cv = document.createElement('canvas'); this.cv.width = 314; this.cv.height = 50; this.cv.style.cssText = 'display:block;width:314px;height:50px;margin:3px 0;background:#001018';
    el.appendChild(this.cv); this.g = this.cv.getContext('2d')!;
    const b = document.createElement('button'); b.textContent = 'Copy report'; b.style.cssText = 'font:11px system-ui;padding:2px 8px;margin-bottom:3px;cursor:pointer;pointer-events:auto';
    b.addEventListener('click', (e) => { e.stopPropagation(); this.copy(b); }); b.addEventListener('pointerdown', (e) => e.stopPropagation());
    el.appendChild(b);
    const fb = document.createElement('button'); fb.textContent = 'Copy last freeze report'; fb.style.cssText = 'font:11px system-ui;padding:2px 8px;margin:0 0 3px 6px;cursor:pointer;pointer-events:auto';
    fb.addEventListener('click', (e) => { e.stopPropagation(); const t = diag.lastSaved() ?? 'no freeze or context loss recorded on this machine'; const ta = document.createElement('textarea'); ta.value = t; ta.style.cssText = 'position:fixed;left:-999px'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch { /* */ } ta.remove(); try { void navigator.clipboard?.writeText(t); } catch { /* */ } fb.textContent = diag.lastSaved() ? 'Copied!' : 'None recorded'; setTimeout(() => { fb.textContent = 'Copy last freeze report'; }, 1500); });
    fb.addEventListener('pointerdown', (e) => e.stopPropagation()); el.appendChild(fb);
    this.logEl = document.createElement('div'); el.appendChild(this.logEl);
    document.body.appendChild(el);
  }
  note(msg: string) { this.notes.push({ t: +((performance.now() - this.t0) / 1000).toFixed(2), msg }); if (this.notes.length > 100) this.notes.shift(); }
  private states = new Map<string, { n: number; dropped: number; iv: number[] }>();
  frame(interval: number, step: number, render: number, target: number, s: PerfSnap) {
    const c = this.ctxFn();
    this.ring[this.pos] = interval; this.cost[this.pos] = step + render; this.pos = (this.pos + 1) % N; this.n = Math.min(N, this.n + 1);
    this.total++; if (interval > 25) this.over25++; if (interval > 50) this.over50++;
    if (this.all.length < 20000) this.all.push(interval);
    const p = this.prev;
    // honest hitch rule: any interval > 1.5x the state's target interval (so one dropped 60 Hz vsync, ~33 ms, is recorded)
    const dropped = interval > target * 1.5;
    let st = this.states.get(s.state); if (!st) { st = { n: 0, dropped: 0, iv: [] }; this.states.set(s.state, st); }
    st.n++; if (dropped) st.dropped++; if (st.iv.length < 6000) st.iv.push(interval);
    if (dropped || step + render > 25) {
      this.hitches.push({ t: +((performance.now() - this.t0) / 1000).toFixed(2), ms: +interval.toFixed(1), step: +step.toFixed(1), render: +render.toFixed(1),
        dProg: p ? s.programs - p.programs : 0, dTex: p ? s.textures - p.textures : 0, dGeo: p ? s.geometries - p.geometries : 0, state: s.state, dist: Math.round(s.dist), zone: s.zone, warm: c.warm });
      if (this.hitches.length > 200) this.hitches.shift();
    }
    this.prev = s;
    const now = performance.now();
    if (now - this.txtT > 250) { this.txtT = now; this.draw(c, s); }
  }
  private avg(): number { let a = 0; for (let i = 0; i < this.n; i++) a += this.ring[i]!; return this.n ? a / this.n : 16.7; }
  private draw(c: PerfCtx, s: PerfSnap) {
    const a = this.avg();
    this.head.textContent = `fps ${(1000 / a).toFixed(0)}  ${a.toFixed(1)}ms  dropped:${[...this.states.values()].reduce((x, v) => x + v.dropped, 0)} >25ms:${this.over25} >50ms:${this.over50}\nq=${c.quality} res=${c.resScale.toFixed(2)} buf=${c.backbuffer} hz~${(1000 / c.refreshMs).toFixed(0)}${c.warm ? ' [warm-up]' : ''}\n${s.state} d=${Math.round(s.dist)} z${s.zone} calls=${s.calls} tris=${(s.tris / 1000).toFixed(0)}k prog=${s.programs} tex=${s.textures} geo=${s.geometries}`;
    const g = this.g, W = 314, H = 50; g.clearRect(0, 0, W, H);
    g.fillStyle = '#134'; g.fillRect(0, H - 16.7 * 0.6, W, 1); g.fillStyle = '#531'; g.fillRect(0, H - 33.3 * 0.6, W, 1);
    for (let i = 0; i < this.n; i++) {
      const k = (this.pos - this.n + i + N) % N; const v = this.ring[k]!; const h = Math.min(H, v * 0.6);
      g.fillStyle = v > 50 ? '#f33' : v > 25 ? '#fc3' : '#3d8'; g.fillRect(i * (W / N), H - h, W / N - 0.3, h);
    }
    this.logEl.textContent = this.hitches.slice(-6).map((h) => `${h.t}s ${h.ms}ms (s${h.step}/r${h.render}) +p${h.dProg} +t${h.dTex} +g${h.dGeo} ${h.state} d${h.dist} z${h.zone}${h.warm ? ' W' : ''}`).join('\n');
  }
  report(): string {
    const c = this.ctxFn(); const s = this.all.slice().sort((a, b) => a - b); const q = (p: number) => s.length ? +s[Math.min(s.length - 1, Math.floor(s.length * p))]!.toFixed(1) : 0;
    return JSON.stringify({
      ua: navigator.userAgent, dpr: devicePixelRatio, window: `${innerWidth}x${innerHeight}`, quality: c.quality, resScale: c.resScale, backbuffer: c.backbuffer, refreshHz: +(1000 / c.refreshMs).toFixed(0),
      seconds: +((performance.now() - this.t0) / 1000).toFixed(1), frames: this.total, intervalMs: { p50: q(0.5), p95: q(0.95), p99: q(0.99), max: s.length ? +s[s.length - 1]!.toFixed(1) : 0 }, over25: this.over25, over50: this.over50,
      perState: this.stateReport(), ...c.extra(), hitches: this.hitches, notes: this.notes,
    }, null, 1);
  }
  private stateReport() {
    const q = (a: number[], p: number) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return +s[Math.min(s.length - 1, Math.floor(s.length * p))]!.toFixed(1); };
    const one = (names: string[]) => { let n = 0, d = 0; const iv: number[] = []; for (const k of names) { const v = this.states.get(k); if (v) { n += v.n; d += v.dropped; iv.push(...v.iv); } } return { frames: n, p50: q(iv, 0.5), p95: q(iv, 0.95), dropped: d }; };
    const out: Record<string, unknown> = {};
    for (const [k, v] of this.states) out[k] = { frames: v.n, p50: q(v.iv, 0.5), p95: q(v.iv, 0.95), dropped: v.dropped };
    out['GROUP_play(countdown+run)'] = one(['countdown', 'run', 'dying', 'clear']);
    out['GROUP_menus(attract+paused+over+cutscene)'] = one(['attract', 'paused', 'over', 'cutscene']);
    return out;
  }
  private copy(btn: HTMLButtonElement) {
    const txt = this.report(); const done = (ok: boolean) => { btn.textContent = ok ? 'Copied!' : 'Copy failed'; setTimeout(() => { btn.textContent = 'Copy report'; }, 1500); };
    const fallback = () => { const ta = document.createElement('textarea'); ta.value = txt; ta.style.cssText = 'position:fixed;left:-999px'; document.body.appendChild(ta); ta.select(); let ok = false; try { ok = document.execCommand('copy'); } catch { /* */ } ta.remove(); done(ok); };
    try { if (navigator.clipboard?.writeText) void navigator.clipboard.writeText(txt).then(() => done(true), fallback); else fallback(); } catch { fallback(); }
  }
}
