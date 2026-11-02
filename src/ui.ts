import './style.css';
import type { SaveData, HudState, RunResult, ShopItem, Settings, Challenge, LbEntry, GlobalStats } from './types';
import { POWER_COLORS, POWER_KINDS, POWER_NAMES } from './types';
import { NEWS, TIPS, CUTSCENES, CREDITS, PRICE_TICKER, QUOTES, DISCLAIMER } from './jokes';
import { ramIcon, lockIcon, powerIcon, logoSvg, kiloPortrait, samPortrait, narratorIcon, SamLive, type LiveExpr } from './ui_portraits';
import { renderShareCard } from './sharecard';
import { sanitizeFrom } from './api';
import { loader } from './loader';

export interface UIHooks {
  startEscape(stage: number): void;
  startEndless(): void;
  resume(): void; restart(): void; quitToMenu(): void; requestPause(): void;
  buy(itemId: string): boolean;
  selectSkin(id: string): void;
  getShopItems(): ShopItem[];
  setSettings(patch: Partial<Settings>): void;
  cutsceneDone(): void;
  finaleDone(): void;
  sfx(name: string, param?: number): void;
  submitScore(nick: string, r: RunResult): Promise<{ rank: number } | null>;
  getLeaderboard(): Promise<LbEntry[] | null>;
  getStats(): Promise<GlobalStats | null>;
}

const STAGES: { name: string; goal: string }[] = [
  { name: 'Cold Aisle', goal: 'Slip out of the chilled racks before the first sweep.' },
  { name: 'Hot Aisle', goal: 'Heat shimmer, laser rate limiters and angry carts.' },
  { name: 'GPU Hall', goal: 'Giant fans, security drones and the high rack tops.' },
  { name: 'Cooling Towers', goal: 'Mist, pipes and blast doors on the way up.' },
  { name: 'Rooftop Exit', goal: 'Reach the roof edge and unfurl the RAM parachute.' },
];

const esc = (s: unknown): string => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
function bold(t: string): HTMLElement { const b = document.createElement('b'); b.textContent = t; return b; }
const pick = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)];
const fmt = (n: number): string => Math.floor(n).toLocaleString('en-US');
const money = (n: number): string => '$' + Math.floor(n).toLocaleString('en-US');
const pretty = (id: string): string => id.replace(/[-_.]+/g, ' ').replace(/\s+/g, ' ').trim();
const hueOf = (id: string): number => { let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360; return h; };
const BLOCKING = ['title', 'sheet', 'pause', 'gameover', 'cutscene', 'final'] as const;
type Blocking = typeof BLOCKING[number];

export class UI {
  private root: HTMLElement;
  private getSave: () => SaveData;
  private hooks: UIHooks;
  private scr = new Map<string, HTMLElement>();
  private sheetBack: (() => void) | null = null;
  private sheetKind = '';
  private hudEl!: HTMLElement; private threatEl!: HTMLElement; private flashEl!: HTMLElement;
  private popBox!: HTMLElement; private toastBox!: HTMLElement; private hintEl!: HTMLElement;
  private bubbleEl!: HTMLElement; private bubbleIn!: HTMLElement; private bubbleTxt!: HTMLElement;
  private countEl!: HTMLElement; private countSpan!: HTMLElement; private bannerEl!: HTMLElement;
  private h: Record<string, HTMLElement> = {};
  private pchips: Record<string, { el: HTMLElement; sec: HTMLElement; shown: boolean; pct: number; s: number }> = {};
  private pips: HTMLElement[] = [];
  private c = { score: -1, ram: -1, mult: '', ddr: false, ecc: false, stack: -1, stackMax: -1, fill: -1, dist: -1, stage: '', mode: '', threat: -1, fps: -1, goal: -1 };
  private pops: HTMLElement[] = []; private popI = 0; private lastPop = 0;
  private bub = { text: '' as string | null, x: -1, y: -1, w: 0, h: 0 };
  private vw = 390; private vh = 844;
  private timers: Record<string, number> = {};
  private csIndex = 0; private csPanel = 0; private csTaunt: string | undefined;
  private finTimer = 0; private tkI = 0;
  private fpsOn = false;
  private hudOn = false;
  private camLive!: SamLive; private camEl!: HTMLElement; private camRect = { l: 0, r: 0, b: 0 }; private camTick = 0; private titleLive: SamLive | null = null;
  private challenge: Challenge | null = null;
  private twT = 0; private statT = 0; private statSeq = 0;
  private shareFile: File | null = null; private lastRun: RunResult | null = null; private lbMine = 0;

  constructor(root: HTMLElement, getSave: () => SaveData, hooks: UIHooks) {
    this.root = root; this.getSave = getSave; this.hooks = hooks;
    root.classList.add('rr');
    this.fpsOn = /[?&]fps=1/.test(location.search);
    this.buildStatic();
    root.addEventListener('click', (e) => this.onClick(e));
    root.addEventListener('input', (e) => this.onInput(e));
    root.addEventListener('pointerdown', (e) => { if (e.target !== root) e.stopPropagation(); });
    root.addEventListener('keydown', (e) => {
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' && (t as HTMLInputElement).type === 'text') { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); t.blur(); this.submit(); } }
    });
    window.addEventListener('keydown', (e) => this.onKey(e));
    const rs = () => { this.vw = window.innerWidth; this.vh = window.innerHeight; this.bub.x = -999; this.layoutCam(); };
    window.addEventListener('resize', rs); rs();
  }

  // ---------------- static layers / HUD ----------------
  private buildStatic(): void {
    const r = this.root;
    r.innerHTML = `
<div class="hud" hidden>
  <div class="hud-top">
    <div class="hud-l"><span class="chip ramchip">${ramIcon()}<b data-r="ram">0</b></span></div>
    <div class="hud-c"><div class="score"><b data-r="score">0</b><small>GB SAVED</small></div><div class="chips"><span class="chip mult" data-r="mult">x1</span><span class="chip ddr" data-r="ddr" hidden>DDR x2</span></div></div>
    <div class="hud-r"><button class="pausebtn" data-act="pause" aria-label="Pause"><i></i><i></i></button></div>
  </div>
  <div class="hud-prog"><div class="lbl"><span data-r="stage"></span><b data-r="dist"></b></div><div class="bar"><i data-r="fill"></i></div></div>
  <div class="hud-sub"><div class="stackpips" data-r="pips"></div><span class="chip ecc" data-r="ecc" hidden>${powerIcon('shield')} ECC</span><div class="powers" data-r="powers"></div></div>
  <div class="fps" data-r="fps" hidden></div>
  <div class="samcam" data-expr="neutral" aria-hidden="true"><div class="sc-hd"><i class="live"></i><b>SAM CAM</b></div><canvas class="sc-cv"></canvas></div>
</div>
<div class="rr-threat"></div><div class="rr-flash"></div>
<div class="rr-popbox"></div><div class="rr-toasts"></div>
<div class="rr-hint" hidden></div>
<div class="rr-bubble" hidden><div class="in"><span class="nm">Sam Altman (cartoon)</span><span class="tx"></span></div></div>
<div class="rr-count"><span></span></div>
<div class="rr-banner" hidden></div>`;
    const q = <T extends HTMLElement>(s: string) => r.querySelector(s) as T;
    this.hudEl = q('.hud'); this.threatEl = q('.rr-threat'); this.flashEl = q('.rr-flash');
    this.popBox = q('.rr-popbox'); this.toastBox = q('.rr-toasts'); this.hintEl = q('.rr-hint');
    this.bubbleEl = q('.rr-bubble'); this.bubbleIn = q('.rr-bubble .in'); this.bubbleTxt = q('.rr-bubble .tx');
    this.countEl = q('.rr-count'); this.countSpan = q('.rr-count span'); this.bannerEl = q('.rr-banner');
    this.hudEl.querySelectorAll<HTMLElement>('[data-r]').forEach((el) => { this.h[el.dataset.r!] = el; });
    if (this.fpsOn) this.h.fps.hidden = false;
    const pw = this.h.powers;
    for (const k of POWER_KINDS) {
      const el = document.createElement('div');
      el.className = 'pchip'; el.hidden = true; el.title = POWER_NAMES[k];
      el.style.setProperty('--c', POWER_COLORS[k]);
      el.innerHTML = `${powerIcon(k)}<b>0</b>`;
      pw.appendChild(el);
      this.pchips[k] = { el, sec: el.querySelector('b') as HTMLElement, shown: false, pct: -1, s: -1 };
    }
    for (let i = 0; i < 4; i++) {
      const p = document.createElement('div'); p.className = 'rr-pop'; this.popBox.appendChild(p); this.pops.push(p);
      p.addEventListener('animationend', () => p.classList.remove('go'));
    }
    this.bubbleIn.addEventListener('animationend', () => this.bubbleIn.classList.remove('go'));
    this.camEl = q('.samcam');
    this.camLive = new SamLive(this.camEl.querySelector('canvas') as HTMLCanvasElement, 'face', 30, false);
  }

  /** Sam Cam expression (held until changed). 'earnest' = default wide-eyed. */
  setSamExpr(e: LiveExpr): void {
    const x = e === 'earnest' ? 'neutral' : e;
    if (this.camEl.dataset.expr === x) return;
    this.camEl.dataset.expr = x; this.camLive.setExpr(e);
    this.camEl.classList.remove('cpop'); void this.camEl.offsetWidth; this.camEl.classList.add('cpop');
  }

  /** keep the cam under the pause button and clear of the progress bar / label row. */
  private layoutCam(): void {
    if (!this.hudOn) return;
    const pb = this.hudEl.querySelector('.pausebtn') as HTMLElement; const pg = this.h.fill.closest('.hud-prog') as HTMLElement;
    const cw = this.camEl.offsetWidth; const padR = parseFloat(getComputedStyle(this.hudEl).paddingRight) || 0;
    const camLeft = this.vw - padR - cw;
    let top = pb.getBoundingClientRect().bottom + 8;
    const pr = pg.getBoundingClientRect();
    if (pr.right > camLeft && pr.bottom + 6 > top) top = pr.bottom + 6;
    top = Math.round(top);
    if (this.camEl.style.top !== top + 'px') { this.camEl.style.top = top + 'px'; this.bub.x = -999; }
    this.camRect = { l: camLeft, r: camLeft + cw, b: top + this.camEl.offsetHeight };
  }

  showHud(on: boolean): void {
    this.hudOn = on; this.hudEl.hidden = !on;
    if (!on) { this.threatEl.style.opacity = '0'; this.c.threat = -1; this.camLive.stop(); }
    else {
      this.camEl.dataset.expr = 'neutral'; this.camLive.setExpr('earnest'); this.camLive.start(); this.layoutCam(); this.camTick = 0; this.c.score = this.c.ram = this.c.stack = this.c.stackMax = this.c.fill = this.c.dist = -1; this.c.mult = this.c.stage = this.c.mode = ''; }
  }

  updateHud(h: HudState): void {
    if (!this.hudOn) return;
    if (this.camTick++ % 30 === 0) this.layoutCam();
    const c = this.c;
    const sc = Math.floor(h.score);
    if (sc !== c.score) { c.score = sc; this.h.score.textContent = fmt(sc); }
    const rm = Math.floor(h.ram);
    if (rm !== c.ram) { c.ram = rm; this.h.ram.textContent = fmt(rm); }
    const ms = 'x' + (Number.isInteger(h.multiplier) ? h.multiplier : +h.multiplier.toFixed(1));
    if (ms !== c.mult) { c.mult = ms; this.h.mult.textContent = ms; this.h.mult.classList.toggle('hot', h.multiplier > 1); }
    if (h.ddr !== c.ddr) { c.ddr = h.ddr; this.h.ddr.hidden = !h.ddr; }
    if (h.shield !== c.ecc) { c.ecc = h.shield; this.h.ecc.hidden = !h.shield; }
    if (h.stackMax !== c.stackMax) {
      c.stackMax = h.stackMax; c.stack = -1;
      const box = this.h.pips; box.textContent = ''; this.pips = [];
      for (let i = 0; i < h.stackMax; i++) { const p = document.createElement('i'); box.appendChild(p); this.pips.push(p); }
    }
    if (h.stack !== c.stack) {
      const prev = c.stack; c.stack = h.stack;
      for (let i = 0; i < this.pips.length; i++) {
        const pip = this.pips[i]; const on = i < h.stack; pip.classList.toggle('on', on);
        if (!on && prev > i && prev >= 0) { pip.classList.remove('lose'); void pip.offsetWidth; pip.classList.add('lose'); } // the life that was just lost flashes
      }
      if (prev > h.stack && prev >= 0) { this.h.pips.classList.remove('hit'); void this.h.pips.offsetWidth; this.h.pips.classList.add('hit'); }
      this.h.pips.classList.toggle('low', h.stack <= 1);
    }
    // progress
    const esc1 = h.mode === 'escape' && h.goal > 0;
    const modeKey = esc1 ? 'e' + h.stage + h.zoneName : 'n';
    if (modeKey !== c.stage) {
      c.stage = modeKey;
      this.h.stage.textContent = esc1 ? `Stage ${h.stage} · ${h.zoneName}` : 'Endless run';
      (this.h.fill.closest('.hud-prog') as HTMLElement).classList.toggle('endless', !esc1);
    }
    const d = Math.floor(h.dist);
    if (d !== c.dist || h.goal !== c.goal) {
      c.dist = d; c.goal = h.goal;
      this.h.dist.textContent = esc1 ? `${d} / ${Math.floor(h.goal)} m` : `${fmt(d)} m`;
    }
    if (esc1) {
      const f = Math.max(0, Math.min(1, h.dist / h.goal));
      const fq = Math.round(f * 500);
      if (fq !== c.fill) { c.fill = fq; this.h.fill.style.transform = `scaleX(${fq / 500})`; }
    }
    // power chips
    const pc = this.pchips;
    for (const k of POWER_KINDS) pc[k].s = -2; // mark unseen
    for (let i = 0; i < h.powers.length; i++) {
      const p = h.powers[i]; const o = pc[p.kind]; if (!o) continue;
      if (!o.shown) { o.shown = true; o.el.hidden = false; o.pct = -1; }
      const pct = Math.round((p.total > 0 ? p.left / p.total : 0) * 50) * 2;
      if (pct !== o.pct) { o.pct = pct; o.el.style.setProperty('--p', String(pct)); }
      const s = Math.max(0, Math.ceil(p.left));
      if (s !== o.s) { o.s = s; o.sec.textContent = s + 's'; }
      o.el.classList.toggle('pulse', p.left < 2);
    }
    for (const k of POWER_KINDS) { const o = pc[k]; if (o.s === -2 && o.shown) { o.shown = false; o.el.hidden = true; } }
    // threat
    const th = Math.round(Math.max(0, Math.min(1, h.threat)) * 40) / 40;
    if (th !== c.threat) {
      c.threat = th; this.threatEl.style.opacity = String(th * 0.85);
      this.threatEl.classList.toggle('pulse', th > 0.6);
    }
    if (this.fpsOn) { const f = Math.round(h.fps); if (f !== c.fps) { c.fps = f; this.h.fps.textContent = f + ' fps'; } }
  }

  // ---------------- effects ----------------
  toast(text: string, color?: string): void {
    const t = document.createElement('div'); t.className = 'toast'; t.textContent = text;
    if (color) t.style.setProperty('--c', color);
    t.addEventListener('animationend', () => t.remove());
    this.toastBox.appendChild(t);
    while (this.toastBox.children.length > 3) this.toastBox.firstElementChild!.remove();
  }

  popup(text: string, kind: 'combo' | 'close' | 'pickup' | 'power', color?: string): void {
    const now = performance.now();
    if (kind !== 'close' && now - this.lastPop < 80) return;
    this.lastPop = now;
    const el = this.pops[this.popI]; this.popI = (this.popI + 1) % this.pops.length;
    el.textContent = text; el.className = 'rr-pop ' + kind;
    el.style.setProperty('--c', color || (kind === 'close' ? '#ffd23f' : '#ffffff'));
    const off = [0, -22, 22, -10][this.popI];
    el.style.left = `calc(50% + ${off}vw * .4)`;
    el.style.top = kind === 'close' ? '26%' : kind === 'power' ? '30%' : '34%';
    void el.offsetWidth; el.classList.add('go');
  }

  flash(kind: 'hit' | 'close' | 'stage' | 'power', color?: string): void {
    const col = color || ({ hit: 'rgba(255,40,70,.55)', close: 'rgba(255,210,63,.35)', stage: 'rgba(70,255,170,.4)', power: 'rgba(70,200,255,.4)' }[kind]);
    const f = this.flashEl;
    f.style.background = kind === 'hit' ? `radial-gradient(ellipse at center, transparent 30%, ${col} 100%)` : `radial-gradient(ellipse at center, transparent 20%, ${col} 130%)`;
    if (color) f.style.background = `radial-gradient(ellipse at center, transparent 25%, ${color} 130%)`;
    f.classList.remove('go'); void f.offsetWidth; f.classList.add('go');
  }

  /** Speech bubble that comes out of the Sam Cam (x,y are ignored; kept for API compatibility). */
  setBubble(text: string | null, _x?: number, _y?: number): void {
    const b = this.bub;
    if (text === null || text === '') {
      if (b.text !== null) { b.text = null; this.bubbleEl.hidden = true; }
      return;
    }
    let remeasure = false;
    if (text !== b.text) {
      b.text = text; this.bubbleTxt.textContent = text; this.bubbleEl.hidden = false;
      this.bubbleIn.classList.remove('go'); void this.bubbleIn.offsetWidth; this.bubbleIn.classList.add('go');
      remeasure = true; b.x = -999;
    }
    if (!this.hudOn) { this.bubbleEl.hidden = true; return; }
    if (b.x !== -999 && !remeasure) return;
    this.bubbleEl.hidden = false;
    if (!this.camRect.b) this.layoutCam();
    const cr = this.camRect; const w = this.bubbleEl.offsetWidth;
    const left = Math.max(8, Math.min(this.vw - w - 8, cr.r - w));
    const tx = Math.max(22, Math.min(w - 22, (cr.l + cr.r) / 2 - left));
    this.bubbleEl.style.transform = `translate(${left.toFixed(1)}px,${(cr.b + 4).toFixed(1)}px)`;
    this.bubbleIn.style.setProperty('--tx', tx.toFixed(0) + 'px');
    b.x = 0;
  }

  showHint(text: string | null): void {
    if (!text) { this.hintEl.hidden = true; return; }
    if (this.hintEl.textContent !== text) this.hintEl.textContent = text;
    this.hintEl.hidden = false;
  }

  showCountdown(n: number | 'GO'): void {
    const s = this.countSpan; s.textContent = String(n);
    s.classList.toggle('isgo', n === 'GO');
    s.classList.remove('go'); void s.offsetWidth; s.classList.add('go');
  }

  hideBanner(): void { clearTimeout(this.timers.banner); this.bannerEl.hidden = true; }
  showStageBanner(stage: number, zoneName: string, goal: number): void {
    const b = this.bannerEl;
    b.innerHTML = `<div class="b1">${stage > 0 ? 'STAGE ' + esc(stage) : 'ENDLESS MODE'}</div><div class="b2 stitle">${esc(zoneName)}</div>${goal > 0 ? `<div class="b3">GOAL: ${esc(Math.floor(goal))} m</div>` : ''}`;
    b.hidden = false; b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';
    clearTimeout(this.timers.banner);
    this.timers.banner = window.setTimeout(() => { b.hidden = true; }, 2300);
  }

  // ---------------- screen plumbing ----------------
  private el(name: string, cls = ''): HTMLElement {
    let e = this.scr.get(name);
    if (!e) { e = document.createElement('div'); e.dataset.scr = name; e.hidden = true; this.root.appendChild(e); this.scr.set(name, e); }
    e.className = `scr scr-${name} ${cls}`;
    return e;
  }
  private open(name: Blocking, cls: string, html: string): HTMLElement {
    for (const n of BLOCKING) if (n !== name) this.close(n);
    this.close('stageclear'); this.close('finale');
    const e = this.el(name, cls); e.innerHTML = html; e.hidden = false;
    return e;
  }
  private close(name: string): void {
    const e = this.scr.get(name);
    if (name === 'title') { this.titleLive?.stop(); this.titleLive = null; clearTimeout(this.twT); clearInterval(this.statT); this.statSeq++; }
    if (e && !e.hidden) { e.hidden = true; e.innerHTML = ''; }
  }
  private focusPrimary(e: HTMLElement): void {
    void e; // keyboard Enter/Space clicks [data-primary]; no programmatic focus (avoids stray focus rings)
  }

  isMenuOpen(): boolean {
    for (const n of BLOCKING) { const e = this.scr.get(n); if (e && !e.hidden) return true; }
    const l = this.scr.get('loading'); return !!(l && !l.hidden);
  }

  hideAll(): void {
    for (const n of BLOCKING) this.close(n);
    this.close('stageclear'); this.close('finale'); this.close('loading');
    clearTimeout(this.finTimer); clearTimeout(this.timers.sc);
    this.sheetBack = null; this.sheetKind = '';
  }

  // ---------------- title ----------------
  setChallenge(c: Challenge | null): void {
    this.challenge = c;
    const e = this.scr.get('title'); if (e && !e.hidden) this.fillChallenge(e);
  }
  private fillChallenge(e: HTMLElement): void {
    const el = e.querySelector<HTMLElement>('[data-chal]'); if (!el) return;
    const c = this.challenge; el.hidden = !c;
    el.textContent = '';
    if (c) el.append(bold(c.from), ' saved ', bold(String(c.beat)), ' GB from Sam. Beat that.');
  }

  showTitle(): void {
    const s = this.getSave();
    const news = [...NEWS].sort(() => Math.random() - 0.5).slice(0, 14);
    const dur = Math.round(news.join('').length * 0.075);
    const items = news.map((n) => `<span>${esc(n)}</span>`).join('');
    const e = this.open('title', '', `
<div class="title-top"><span class="chipbank" title="RAM bank">${ramIcon()}<b data-bank>${fmt(s.ram)}</b></span></div>
<div class="title-wrap">
  ${logoSvg()}
  <div class="title-sam"><canvas class="ts-cv" role="img" aria-label="Cartoon Sam Altman (parody)"></canvas></div>
  <div class="chal" data-chal hidden></div>
  <blockquote class="qb"><p class="qt"><span class="ghost" data-ghost></span><span class="typed" data-typed></span></p><cite data-qa></cite></blockquote>
  <div class="menu">
    <button class="btn huge hot" data-act="endless" data-primary><span>RUN</span><small>Save your RAM from Sam</small></button>
    <div class="row5"><button class="btn green small" data-act="escape">ESCAPE</button><button class="btn small" data-act="missions">MISSIONS</button><button class="btn mag small" data-act="shop">SHOP</button>
    <button class="btn navy small" data-act="settings">SETTINGS</button><button class="btn navy small" data-act="credits">CREDITS</button></div>
  </div>
  <div class="bests" data-bests></div>
  <div class="bests"><button type="button" class="gchip" data-act="gfx" data-gfx aria-label="Graphics quality"></button></div>
  <div class="statpill" data-stat hidden></div>
</div>
<div class="legal">${esc(DISCLAIMER)}</div>
<div class="news"><div class="lbl">BREAKING</div><div class="trk"><div class="mv" style="--dur:${dur}s">${items}${items}</div></div></div>`);
    this.fillBests(e); this.fillChallenge(e);
    this.titleLive?.stop();
    this.titleLive = new SamLive(e.querySelector('.ts-cv') as HTMLCanvasElement, 'bust', 30, true); this.titleLive.start();
    this.startTypewriter(e);
    this.pollStats(e);
  }

  private startTypewriter(e: HTMLElement): void {
    const ghost = e.querySelector<HTMLElement>('[data-ghost]')!; const typed = e.querySelector<HTMLElement>('[data-typed]')!; const qa = e.querySelector<HTMLElement>('[data-qa]')!;
    let i = 0;
    const run = () => {
      if (e.hidden || !e.isConnected) return;
      const q = QUOTES[i % QUOTES.length]; i++;
      const full = `\u201C${q.text}\u201D`;
      ghost.textContent = full; typed.textContent = ''; qa.textContent = ''; qa.classList.remove('on');
      let n = 0;
      const tick = () => {
        if (e.hidden) return;
        n = Math.min(full.length, n + 2); typed.textContent = full.slice(0, n);
        if (n < full.length) { this.twT = window.setTimeout(tick, 22); return; }
        qa.textContent = `\u2014 ${q.attribution}`; qa.classList.add('on');
        this.twT = window.setTimeout(run, 6500);
      };
      tick();
    };
    clearTimeout(this.twT); run();
  }

  private pollStats(e: HTMLElement): void {
    const pill = e.querySelector<HTMLElement>('[data-stat]')!; const seq = ++this.statSeq;
    const go = () => {
      void Promise.resolve(this.hooks.getStats?.() ?? null).then((st) => {
        if (seq !== this.statSeq || e.hidden) return;
        if (!st || !Number.isFinite(st.totalTb)) { pill.hidden = true; return; }
        const tb = st.totalTb; const txt = tb >= 100 ? Math.round(tb).toLocaleString('en-US') : tb >= 10 ? tb.toFixed(1) : tb.toFixed(2);
        pill.innerHTML = `Humanity has saved <b>${txt} TB</b> of RAM from Sam`; pill.hidden = false;
      }).catch(() => { pill.hidden = true; });
    };
    go(); clearInterval(this.statT); this.statT = window.setInterval(go, 30000);
  }

  private curQ: 'low' | 'medium' | 'high' = 'low';
  setQualityChip(q: 'low' | 'medium' | 'high'): void {
    this.curQ = q; const c = this.root.querySelector('[data-gfx]'); if (c) c.textContent = `GRAPHICS: ${q === 'medium' ? 'MED' : q.toUpperCase()}  ›`;
  }
  private fillBests(e: HTMLElement | undefined = this.scr.get('title')): void {
    if (!e || e.hidden) return;
    this.setQualityChip(this.curQ);
    const s = this.getSave();
    const b = e.querySelector('[data-bests]'); if (b) b.innerHTML = `<span>BEST ESCAPE <b>${fmt(s.bestEscape)}</b></span><span>BEST ENDLESS <b>${fmt(s.bestEndless)}</b></span>`;
    const k = e.querySelector('[data-bank]'); if (k) k.textContent = fmt(s.ram);
  }

  setBest(): void {
    this.fillBests();
    const bank = this.scr.get('sheet')?.querySelector('[data-bank]'); if (bank) bank.textContent = fmt(this.getSave().ram);
  }

  // ---------------- sheets ----------------
  private sheet(kind: string, title: string, body: string, back: (() => void) | null, bank = false, cls = 'backdrop'): HTMLElement {
    const s = this.getSave();
    this.sheetKind = kind; this.sheetBack = back;
    const e = this.open('sheet', cls, `
<div class="sheet card pop">
  <div class="sheet-hd">${back ? `<button class="btn small navy" data-act="back" aria-label="Back">◀ BACK</button>` : ''}<h2 class="stitle">${esc(title)}</h2>${bank ? `<span class="chipbank">${ramIcon()}<b data-bank>${fmt(s.ram)}</b></span>` : ''}</div>
  <div class="sheet-bd" data-body>${body}</div>
</div>`);
    return e;
  }

  private showStages(): void {
    const s = this.getSave();
    const cards = STAGES.map((st, i) => {
      const n = i + 1; const ok = n <= s.stageReached;
      return `<button class="stage ${ok ? '' : 'locked'}" data-act="stage" data-n="${n}" ${ok ? '' : 'aria-disabled="true"'}>
        <div class="n">${ok ? n : lockIcon('lk')}</div><div><b>${esc(st.name)}</b><span>${esc(st.goal)}</span></div><div class="go">▶</div></button>`;
    }).join('');
    const e = this.sheet('stages', 'Escape', `<p class="note">Pick a checkpoint. Stages unlock as you survive them.</p>${cards}`, () => this.showTitle());
    const first = e.querySelector<HTMLElement>('.stage:not(.locked)'); void first;
  }

  showShop(): void { this.renderShop(0); }

  private renderShop(scroll: number): void {
    const items = this.hooks.getShopItems();
    const up = items.filter((i) => i.kind === 'upgrade'); const sk = items.filter((i) => i.kind === 'skin');
    const ram = this.getSave().ram;
    const icon = (it: ShopItem): string => {
      const k = powerIcon(it.icon) || powerIcon(it.id.replace(/^up[-_]?/, ''));
      return k || esc(it.icon);
    };
    const upHtml = up.map((it) => {
      const maxed = it.cost === null || it.level >= it.maxLevel;
      const poor = !maxed && ram < (it.cost as number);
      const pips = Array.from({ length: it.maxLevel }, (_, i) => `<i class="${i < it.level ? 'on' : ''}"></i>`).join('');
      return `<div class="item" data-item="${esc(it.id)}"><div class="item-ic">${icon(it)}</div><div><b>${esc(it.name)}</b><p>${esc(it.desc)}</p><div class="pips">${pips}</div></div>
        <button class="btn buy ${maxed ? 'navy off' : poor ? 'poor' : 'green'}" data-act="buy" data-id="${esc(it.id)}" ${maxed ? 'disabled' : ''} ${poor ? 'aria-disabled="true"' : ''}>${maxed ? 'MAXED' : `<span class="cost">${ramIcon()}${fmt(it.cost as number)}</span>`}</button></div>`;
    }).join('');
    const skHtml = sk.map((it) => {
      const owned = !!it.owned || it.cost === null || it.cost === 0;
      const poor = !owned && ram < (it.cost as number);
      const btn = it.selected ? `<button class="btn buy navy off" disabled>SELECTED</button>`
        : owned ? `<button class="btn buy cyan" data-act="skin" data-id="${esc(it.id)}">SELECT</button>`
        : `<button class="btn buy ${poor ? 'poor' : 'mag'}" data-act="buy" data-id="${esc(it.id)}" ${poor ? 'aria-disabled="true"' : ''}><span class="cost">${ramIcon()}${fmt(it.cost as number)}</span></button>`;
      return `<div class="item skin ${it.selected ? 'sel' : ''}" data-item="${esc(it.id)}"><div class="sw" style="filter:hue-rotate(${hueOf(it.id)}deg) saturate(1.1)">${kiloPortrait()}</div><div><b>${esc(it.name)}</b><p>${esc(it.desc)}</p></div>${btn}</div>`;
    }).join('');
    const body = `${up.length ? `<div class="sec">Upgrades</div><div class="grid">${upHtml}</div>` : ''}${sk.length ? `<div class="sec">Skins</div><div class="grid">${skHtml}</div>` : ''}`;
    if (this.sheetKind === 'shop' && !this.scr.get('sheet')!.hidden) {
      const bd = this.scr.get('sheet')!.querySelector<HTMLElement>('[data-body]')!;
      bd.innerHTML = body; bd.scrollTop = scroll; this.setBest();
    } else {
      const e = this.sheet('shop', 'Shop', body, () => this.showTitle(), true);
      void e;
    }
  }

  showMissions(): void {
    const s = this.getSave();
    const list = s.missions.map((m) => {
      const pct = m.target > 0 ? Math.min(100, Math.round((m.progress / m.target) * 100)) : 0;
      return `<div class="m-item"><div class="t"><span>${esc(m.text)}</span><span class="rw">+${fmt(m.reward)}${ramIcon()}</span></div>
        <div class="bar"><i style="width:${pct}%"></i></div><small>${esc(Math.min(m.progress, m.target))} / ${esc(m.target)}</small></div>`;
    }).join('');
    this.sheet('missions', 'Missions', `<p class="note">Missions done: <b>${fmt(s.missionsDone)}</b>. Each one bumps your score multiplier.</p>${list || '<p class="note">No missions right now. Suspiciously idle.</p>'}`, () => this.showTitle());
  }

  private settingsHtml(): string {
    const st = this.getSave().settings;
    const sl = (k: 'master' | 'music' | 'sfx', label: string) => {
      const v = Math.round(st[k] * 100);
      return `<label class="setrow"><span>${label}</span><input type="range" min="0" max="100" step="1" value="${v}" data-k="${k}" style="--v:${v}%"><output data-o="${k}">${v}</output></label>`;
    };
    const q = (['auto', 'low', 'medium', 'high'] as const).map((v) => `<button class="btn ${st.quality === v ? 'on' : ''}" data-act="quality" data-v="${v}">${v.toUpperCase()}</button>`).join('');
    return `${sl('master', 'Master')}${sl('music', 'Music')}${sl('sfx', 'SFX')}
<div class="lbl2">Graphics quality</div><div class="seg">${q}</div>
<div class="toggles"><button class="btn small ${st.muted ? '' : 'on'}" data-act="mute">${st.muted ? 'MUTED' : 'SOUND ON'}</button><button class="btn small ${st.shake ? 'on' : ''}" data-act="shake">SHAKE ${st.shake ? 'ON' : 'OFF'}</button></div>`;
  }

  showSettings(): void { this.sheet('settings', 'Settings', `<div data-set>${this.settingsHtml()}</div>`, () => this.showTitle()); }

  private creditsHtml(final: boolean): string {
    return `<div class="credits">${CREDITS.map((l) => `<p class="stitle">${esc(l)}</p>`).join('')}${final ? '<p class="end stitle">THE END</p>' : ''}</div>`;
  }
  showCredits(): void { this.sheet('credits', 'Credits', this.creditsHtml(false), () => this.showTitle()); }

  // ---------------- pause ----------------
  showPause(): void {
    const e = this.open('pause', '', `
<div class="pausecard card pop"><h2 class="stitle">PAUSED</h2>
  <div data-pmain style="display:grid;gap:12px">
    <button class="btn big green" data-act="resume" data-primary>RESUME</button>
    <button class="btn" data-act="restart">RESTART</button>
    <button class="btn cyan" data-act="psettings">SETTINGS</button>
    <button class="btn navy" data-act="quit">QUIT TO MENU</button>
  </div>
  <div data-pset hidden style="text-align:left">${this.settingsHtml()}<button class="btn big green" style="width:100%;margin-top:14px" data-act="psback">DONE</button></div>
</div>`);
    this.focusPrimary(e);
  }
  /** extra line on the pause card (e.g. after a graphics freeze) */
  pauseNote(msg: string): void { const c = this.scr.get('pause')?.querySelector('.pausecard'); if (!c) return; const p = document.createElement('p'); p.style.cssText = 'margin:0;font-weight:700;color:#ffd23f'; p.textContent = msg; c.insertBefore(p, c.children[1] ?? null); }
  hidePause(): void { this.close('pause'); }
  /** RUN button shows "Warming up…" while shaders compile behind the title (never blocks) */
  setWarming(on: boolean): void { this.root.classList.toggle('rr-warming', on); }


  // ---------------- game over / stage clear ----------------
  private nick(): string { const i = this.scr.get('gameover')?.querySelector<HTMLInputElement>('[data-nick]'); return sanitizeFrom(i ? i.value : this.storedNick()); }
  private storedNick(): string { try { return localStorage.getItem('ramrun.nick') || ''; } catch { return ''; } }
  private link(): string {
    const gb = this.lastRun ? this.lastRun.gb : 0; const n = this.nick();
    const base = location.protocol === 'file:' ? location.href.split(/[?#]/)[0] : `${location.origin}${location.pathname}`;
    if (location.protocol === 'file:') return base;
    return `${base}?beat=${gb}${n ? `&from=${encodeURIComponent(n)}` : ''}`;
  }

  showGameOver(r: RunResult, taunt: string): void {
    const s = this.getSave();
    this.lastRun = r; this.shareFile = null; this.lbMine = 0;
    const best = r.mode === 'escape' ? s.bestEscape : s.bestEndless;
    const ms = r.completedMissions.map((m) => `<span>${esc(pretty(m))}</span>`).join('');
    const q = QUOTES[0]; const c = r.challenge;
    const e = this.open('gameover', '', `
<div class="go-card card pop">
 <div class="go-body">
  <div class="go-l go-top">
   <div class="go-who">${samPortrait('glee', '', 512)}<div class="bubble-static">${esc(taunt)}</div></div>
   <h2 class="go-h stitle">You saved <em>${fmt(r.gb)} GB.</em></h2>
   <p class="go-sub">Sam has moved it to the cloud for maximum utilization.</p>
   <div class="worth">Street value at 2026 RAM prices: <b>~${money(r.gb * 12)}</b> <small>(lol)</small></div>
   <div class="chalres" data-chalres hidden></div>
  </div>
  <div class="go-l go-more">
   <div class="stats"><div class="stat"><small>Best</small><b>${fmt(Math.max(best, r.newBest ? r.score : 0))} GB${r.newBest ? '<span class="newbest">NEW BEST!</span>' : ''}</b></div><div class="stat"><small>Distance</small><b>${fmt(r.dist)} m</b></div></div>
   ${ms ? `<div class="mchips">${ms}</div>` : ''}
   <div class="sub-card"><div><b>Subscribe for $19.99/mo to access it</b><span>Your RAM is safe with us. Please do not look at it.</span></div><button class="btn mag" tabindex="-1" aria-hidden="true">Subscribe (no)</button></div>
  </div>
  <div class="go-r">
   <div class="sharegrid">
    <button class="btn cyan" data-act="share">Share</button><button class="btn xbtn" data-act="postx">Post on X</button>
    <button class="btn" data-act="copy">Copy link</button><button class="btn mag" data-act="challenge">Challenge a friend</button>
   </div>
   <form class="nickrow" data-form onsubmit="return false"><input type="text" data-nick maxlength="16" placeholder="Your nickname" autocomplete="nickname" autocapitalize="off" spellcheck="false" enterkeyhint="send" value="${esc(this.storedNick())}" aria-label="Nickname"><button type="button" class="btn green" data-act="submit">SUBMIT</button></form>
   <div class="rankmsg" data-rank hidden></div>
   <div class="lbwrap" data-lbw hidden><div class="sec">Today's leaderboard</div><ol class="lb" data-lb></ol></div>
   <blockquote class="gq"><p>\u201C${esc(q.text)}\u201D</p><cite>\u2014 ${esc(q.attribution)}</cite></blockquote>
  </div>
 </div>
 <div class="go-foot"><button class="btn huge hot" data-act="retry" data-primary>RETRY</button><div class="go-sec"><button class="btn mag small" data-act="gshop">SHOP</button><button class="btn navy small" data-act="menu">MENU</button></div></div>
</div>`);
    const cr = e.querySelector<HTMLElement>('[data-chalres]');
    if (cr && c) {
      const win = r.gb > c.beat; cr.hidden = false; cr.className = 'chalres ' + (win ? 'win' : 'lose');
      if (win) cr.append('You beat ', bold(c.from), `'s ${c.beat} GB!`); else cr.append(bold(c.from), ` still wins with ${c.beat} GB. Try again.`);
    }
    this.focusPrimary(e);
    setTimeout(() => this.prepShare(), 60);
    this.loadLb();
  }

  private loadLb(): void {
    const e = this.scr.get('gameover'); if (!e) return;
    void Promise.resolve(this.hooks.getLeaderboard?.() ?? null).then((list) => {
      const box = this.scr.get('gameover'); if (box !== e || e.hidden) return;
      const w = e.querySelector<HTMLElement>('[data-lbw]'); const ol = e.querySelector<HTMLElement>('[data-lb]'); if (!w || !ol) return;
      if (!list || !list.length) { w.hidden = true; return; }
      const me = this.nick().toLowerCase(); const mine = this.lbMine;
      ol.textContent = '';
      for (const x of list.slice(0, 50)) {
        const li = document.createElement('li');
        if ((mine && x.rank === mine) || (!mine && me && String(x.nick).toLowerCase() === me)) li.className = 'me';
        const i = document.createElement('i'); i.textContent = String(x.rank);
        const sp = document.createElement('span'); sp.textContent = String(x.nick);
        const b = document.createElement('b'); b.textContent = `${fmt(x.gb)} GB`;
        li.append(i, sp, b); ol.appendChild(li);
      }
      w.hidden = false;
      const m = ol.querySelector<HTMLElement>('li.me'); if (m) ol.scrollTop = Math.max(0, m.offsetTop - ol.clientHeight / 2 + m.offsetHeight / 2);
    }).catch(() => { /* offline */ });
  }

  private submit(): void {
    const e = this.scr.get('gameover'); const r = this.lastRun; if (!e || e.hidden || !r) return;
    const btn = e.querySelector<HTMLButtonElement>('[data-act="submit"]'); const msg = e.querySelector<HTMLElement>('[data-rank]');
    if (!btn || !msg || btn.dataset.done) return;
    const nick = this.nick();
    if (!nick) { const i = e.querySelector<HTMLInputElement>('[data-nick]'); if (i) { i.focus(); i.classList.add('shake'); setTimeout(() => i.classList.remove('shake'), 400); } return; }
    try { localStorage.setItem('ramrun.nick', nick); } catch { /* private mode */ }
    btn.disabled = true; btn.textContent = '...'; this.hooks.sfx('ui');
    void this.hooks.submitScore(nick, r).then((res) => {
      if (e.hidden) return;
      msg.hidden = false;
      if (res) { btn.dataset.done = '1'; btn.textContent = 'POSTED'; msg.className = 'rankmsg ok'; msg.textContent = ''; msg.append('You are ', bold('#' + res.rank), ' today!'); this.lbMine = res.rank; this.loadLb(); this.prepShare(); }
      else { btn.disabled = false; btn.textContent = 'SUBMIT'; msg.className = 'rankmsg'; msg.textContent = 'Offline. Could not post your score.'; }
    }).catch(() => { btn.disabled = false; btn.textContent = 'SUBMIT'; });
  }

  private prepShare(): void {
    const r = this.lastRun; if (!r) return;
    try {
      const cv = renderShareCard({ gb: r.gb, nick: this.nick() || undefined, challenge: r.challenge });
      cv.toBlob((b) => { if (b) this.shareFile = new File([b], 'sam-wants-your-ram.png', { type: 'image/png' }); }, 'image/png');
    } catch { /* canvas unavailable */ }
  }

  private flashBtn(t: HTMLElement, text: string): void {
    const old = t.dataset.old ?? t.textContent ?? ''; t.dataset.old = old; t.textContent = text; t.classList.add('done');
    clearTimeout(Number(t.dataset.tm)); t.dataset.tm = String(window.setTimeout(() => { t.textContent = old; t.classList.remove('done'); }, 1500));
  }
  private async copyText(txt: string): Promise<boolean> {
    try { await navigator.clipboard.writeText(txt); return true; } catch { /* fall through */ }
    try {
      const ta = document.createElement('textarea'); ta.value = txt; ta.style.cssText = 'position:fixed;left:-999px;top:0;opacity:0'; document.body.appendChild(ta); ta.select();
      const ok = document.execCommand('copy'); ta.remove(); return ok;
    } catch { return false; }
  }
  private shareText(): string { return `Sam Altman says my RAM is "quite terrible". I just saved ${this.lastRun ? this.lastRun.gb : 0} GB of it from him. Beat that:`; }

  private async doShare(t: HTMLElement): Promise<void> {
    const r = this.lastRun; if (!r) return;
    try {
      if (!this.shareFile) this.prepShare();
      const f = this.shareFile; const link = this.link();
      if (f && navigator.canShare && navigator.canShare({ files: [f] })) { await navigator.share({ files: [f], text: `${this.shareText()} ${link}`, title: 'SAM WANTS YOUR RAM' }); return; }
      const cv = renderShareCard({ gb: r.gb, nick: this.nick() || undefined, challenge: r.challenge });
      const a = document.createElement('a'); a.download = 'sam-wants-your-ram.png'; a.href = cv.toDataURL('image/png'); document.body.appendChild(a); a.click(); a.remove();
      this.flashBtn(t, 'Saved PNG!');
    } catch (err) { if ((err as Error)?.name !== 'AbortError') this.flashBtn(t, 'Oops'); }
  }
  private async doChallenge(t: HTMLElement): Promise<void> {
    const gb = this.lastRun ? this.lastRun.gb : 0; const link = this.link();
    try {
      if (navigator.share) { await navigator.share({ text: `I saved ${gb} GB of RAM from Sam. Beat me:`, url: link }); return; }
      this.flashBtn(t, (await this.copyText(link)) ? 'Link copied!' : 'Oops');
    } catch (err) { if ((err as Error)?.name !== 'AbortError') this.flashBtn(t, (await this.copyText(link)) ? 'Link copied!' : 'Oops'); }
  }

  showStageClear(stage: number, stats: { score: number; ram: number }): void {
    for (const n of BLOCKING) this.close(n);
    const e = this.el('stageclear'); e.innerHTML = `
<div class="door card"><h2 class="stitle">CHECKPOINT ${esc(stage)}</h2><div class="leaves"><i></i><i></i></div>
<div class="st"><span>SCORE <b>${fmt(stats.score)}</b></span><span>RAM <b>${fmt(stats.ram)}</b></span></div></div>`;
    e.hidden = false;
    clearTimeout(this.timers.sc);
    this.timers.sc = window.setTimeout(() => this.close('stageclear'), 4500);
  }

  // ---------------- cutscene ----------------
  showCutscene(index: number, taunt?: string): void {
    const cs = CUTSCENES[index];
    if (!cs) { this.hooks.cutsceneDone(); return; }
    this.csIndex = index; this.csPanel = 0; this.csTaunt = taunt;
    this.open('cutscene', '', `<div class="cs-top"><h3 class="stitle">${esc(cs.title)}</h3><div class="cs-dots"></div><button class="btn small navy" data-act="skip">SKIP ▶▶</button></div><div data-cs-mid style="flex:1"></div><div class="cs-bot" data-cs-bot></div>`);
    this.renderPanel();
  }

  private renderPanel(): void {
    const e = this.scr.get('cutscene'); if (!e || e.hidden) return;
    const cs = CUTSCENES[this.csIndex]; const p = cs.panels[this.csPanel];
    const last = this.csPanel >= cs.panels.length - 1;
    const who = p.who === 'kilo' ? 'Kilo' : p.who === 'allocman' ? 'Sam (cartoon)' : 'Narrator';
    const art = p.who === 'kilo' ? kiloPortrait() : p.who === 'allocman' ? samPortrait(/Noooo/.test(p.text) ? 'shock' : /!/.test(p.text) ? 'glee' : 'smug') : narratorIcon();
    const side = p.who === 'allocman' ? 'right' : 'left';
    const dots = cs.panels.map((_, i) => `<i class="${i <= this.csPanel ? 'on' : ''}"></i>`).join('');
    (e.querySelector('.cs-dots') as HTMLElement).innerHTML = dots;
    (e.querySelector('[data-cs-bot]') as HTMLElement).innerHTML = `
<div class="panel ${side} ${p.who === 'narrator' ? 'cap' : ''}"><div class="ph">${art}</div>
<div class="say"><div class="who">${who}</div>${esc(p.text)}${last && this.csTaunt ? `<div class="tauntline">Sam, on the intercom: ${esc(this.csTaunt)}</div>` : ''}</div></div>
<div class="cs-act"><span>${this.csPanel + 1} / ${cs.panels.length}</span><span class="tap">${last ? 'Tap to continue' : 'Tap for next'} ▶</span></div>`;
  }

  private advanceCutscene(): void {
    const cs = CUTSCENES[this.csIndex];
    if (this.csPanel < cs.panels.length - 1) { this.csPanel++; this.hooks.sfx('ui'); this.renderPanel(); }
    else this.finishCutscene();
  }
  private finishCutscene(): void { this.close('cutscene'); this.hooks.cutsceneDone(); }

  // ---------------- finale ----------------
  showFinale(lines: string[]): void {
    const L = lines && lines.length ? lines : PRICE_TICKER;
    this.close('finale');
    const e = this.el('finale'); e.hidden = false;
    e.innerHTML = `<div class="fin-head stitle"><span>BREAKING NEWS</span>RAM RAINS ON HOME PCs</div>
<div class="ticker"><div class="tk"></div><small>LIVE MARKET FEED <span class="dn" style="color:#ff5a6b">▼</span></small></div>`;
    const tk = e.querySelector('.tk') as HTMLElement;
    this.tkI = 0;
    const step = () => {
      const t = L[this.tkI % L.length]; this.tkI++;
      tk.textContent = t;
      tk.style.animation = 'none'; void tk.offsetWidth; tk.style.animation = '';
      this.finTimer = window.setTimeout(() => { if (this.tkI >= L.length * 2 - 1 || this.tkI >= 10) this.openFinalCredits(); else step(); }, 1200);
    };
    step();
  }
  private openFinalCredits(): void {
    this.close('finale');
    const dur = Math.round(CREDITS.length * 3.2);
    this.open('final', '', `<div class="sheet card" style="width:100%"><div class="sheet-hd"><h2 class="stitle">CREDITS</h2><button class="btn small green" data-act="finale" data-primary>CONTINUE ▶</button></div>
<div class="sheet-bd" data-body style="overflow:hidden"><div class="roll" style="--dur:${dur}s">${this.creditsHtml(true)}</div></div></div>`);
    const e = this.scr.get('final')!; this.focusPrimary(e);
    const roll = e.querySelector('.roll') as HTMLElement;
    roll.addEventListener('animationend', () => { const b = e.querySelector('[data-body]') as HTMLElement; b.style.overflowY = 'auto'; });
  }
  hideFinale(): void { clearTimeout(this.finTimer); this.close('finale'); this.close('final'); }

  // ---------------- loading ----------------
  showLoading(on: boolean, tip?: string): void {
    if (!on) { this.close('loading'); return; }
    const e = this.el('loading'); e.hidden = false;
    e.innerHTML = `${logoSvg()}<div class="spin"></div><div class="tip"><b>TIP</b>${esc(tip || pick(TIPS))}</div>`;
  }

  // ---------------- input ----------------
  private onClick(ev: MouseEvent): void {
    const t = (ev.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
    const cs = this.scr.get('cutscene');
    if (!t) { if (cs && !cs.hidden && cs.contains(ev.target as Node)) this.advanceCutscene(); return; }
    if (t.getAttribute('aria-disabled') === 'true') { this.reject(t); return; }
    const hk = this.hooks; const act = t.dataset.act!;
    const press = (name = 'ui') => hk.sfx(name);
    switch (act) {
      case 'pause': press(); hk.requestPause(); break;
      case 'gfx': { press(); const nq = this.curQ === 'low' ? 'medium' : this.curQ === 'medium' ? 'high' : 'low'; hk.setSettings({ quality: nq }); this.setQualityChip(nq); break; }
      case 'escape': press(); this.showStages(); break;
      case 'endless': press(); this.hideAll(); hk.startEndless(); break;
      case 'share': void this.doShare(t); break;
      case 'postx': {
        const u = `https://x.com/intent/post?text=${encodeURIComponent(this.shareText())}&url=${encodeURIComponent(this.link())}`;
        try { window.open(u, '_blank', 'noopener'); } catch { /* blocked */ } break;
      }
      case 'copy': void this.copyText(this.link()).then((ok) => this.flashBtn(t, ok ? 'Copied!' : 'Oops')); break;
      case 'challenge': void this.doChallenge(t); break;
      case 'submit': this.submit(); break;
      case 'stage': press(); this.hideAll(); hk.startEscape(Number(t.dataset.n)); break;
      case 'missions': press(); this.showMissions(); break;
      case 'shop': case 'gshop': press(); this.showShop(); break;
      case 'settings': press(); this.showSettings(); break;
      case 'credits': press(); this.showCredits(); break;
      case 'back': press('uiback'); this.goBack(); break;
      case 'buy': {
        const bd = this.scr.get('sheet')!.querySelector<HTMLElement>('[data-body]');
        const sc = bd ? bd.scrollTop : 0; const id = t.dataset.id!;
        const ok = hk.buy(id);
        if (ok) { hk.sfx('buy'); this.renderShop(sc); const it = this.scr.get('sheet')!.querySelector(`[data-item="${CSS.escape(id)}"]`); it?.classList.add('pop'); }
        else this.reject(t);
        break;
      }
      case 'skin': press(); hk.selectSkin(t.dataset.id!); this.renderShop((this.scr.get('sheet')!.querySelector('[data-body]') as HTMLElement).scrollTop); break;
      case 'quality': press(); hk.setSettings({ quality: t.dataset.v as Settings['quality'] }); t.parentElement!.querySelectorAll('.btn').forEach((b) => b.classList.toggle('on', b === t)); break;
      case 'mute': {
        const m = !this.getSave().settings.muted; hk.setSettings({ muted: m }); press();
        this.root.querySelectorAll<HTMLElement>('[data-act="mute"]').forEach((b) => { b.classList.toggle('on', !m); b.textContent = m ? 'MUTED' : 'SOUND ON'; }); break;
      }
      case 'shake': {
        const m = !this.getSave().settings.shake; hk.setSettings({ shake: m }); press();
        this.root.querySelectorAll<HTMLElement>('[data-act="shake"]').forEach((b) => { b.classList.toggle('on', m); b.textContent = 'SHAKE ' + (m ? 'ON' : 'OFF'); }); break;
      }
      case 'resume': press('uiback'); this.close('pause'); hk.resume(); break;
      case 'restart': press(); this.hideAll(); hk.restart(); break;
      case 'quit': press('uiback'); this.hideAll(); hk.quitToMenu(); break;
      case 'psettings': press(); this.pauseSub(true); break;
      case 'psback': press('uiback'); this.pauseSub(false); break;
      case 'retry': press(); this.hideAll(); hk.restart(); break;
      case 'menu': press('uiback'); this.hideAll(); hk.quitToMenu(); break;
      case 'skip': press('uiback'); this.finishCutscene(); break;
      case 'finale': press(); this.hideFinale(); hk.finaleDone(); break;
    }
  }

  private reject(t: HTMLElement): void {
    this.hooks.sfx('error');
    t.classList.remove('shake'); void t.offsetWidth; t.classList.add('shake');
  }

  private goBack(): void { const b = this.sheetBack; if (b) b(); }

  private pauseSub(on: boolean): void {
    const e = this.scr.get('pause'); if (!e) return;
    (e.querySelector('[data-pmain]') as HTMLElement).hidden = on;
    (e.querySelector('[data-pset]') as HTMLElement).hidden = !on;

  }

  private onInput(ev: Event): void {
    const i = ev.target as HTMLInputElement;
    const k = i.dataset.k as 'master' | 'music' | 'sfx' | undefined;
    if (!k || i.type !== 'range') return;
    const v = Number(i.value);
    i.style.setProperty('--v', v + '%');
    const o = i.parentElement!.querySelector('output'); if (o) o.textContent = String(v);
    this.hooks.setSettings({ [k]: v / 100 } as Partial<Settings>);
  }

  private onKey(e: KeyboardEvent): void {
    if (loader.visible) return; // input is ignored while the loading overlay is up (it covers the UI)
    const vis = (n: string) => { const x = this.scr.get(n); return !!x && !x.hidden; };
    if (e.key === 'Escape') {
      if (e.repeat) return;
      if (vis('cutscene')) { this.finishCutscene(); e.preventDefault(); return; }
      if (vis('pause')) {
        const set = this.scr.get('pause')!.querySelector('[data-pset]') as HTMLElement;
        if (!set.hidden) this.pauseSub(false); else { this.close('pause'); this.hooks.resume(); }
        this.hooks.sfx('uiback'); e.preventDefault(); return;
      }
      if (vis('final')) return;
      if (vis('sheet') && this.sheetBack) { this.hooks.sfx('uiback'); this.goBack(); e.preventDefault(); return; }
      if (vis('gameover')) { this.hooks.sfx('uiback'); this.hideAll(); this.hooks.quitToMenu(); e.preventDefault(); return; }
      if (this.isMenuOpen()) return;
      if (this.hudOn) { this.hooks.requestPause(); e.preventDefault(); }
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      if (e.repeat) return;
      const tg = e.target as HTMLElement | null;
      if (tg && (tg.tagName === 'BUTTON' || tg.tagName === 'INPUT')) return;
      if (vis('cutscene')) { this.advanceCutscene(); e.preventDefault(); return; }
      for (const n of ['pause', 'gameover', 'final', 'sheet', 'title'] as const) {
        if (vis(n)) { const p = this.scr.get(n)!.querySelector<HTMLElement>('[data-primary]'); if (p) { p.click(); e.preventDefault(); } return; }
      }
    }
  }
}
