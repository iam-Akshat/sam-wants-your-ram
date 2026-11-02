import * as THREE from 'three';
import { Gfx, QUALITY } from './gfx';
import { Assets } from './assets';
import { World, K_CABLE, K_CART, K_DOOR, K_DRONE, K_LASER, K_PLAT, K_RACK, K_TRAY, K_LETTER, ST_DEAD, ST_NEAR, type Chunk } from './world';
import { Particles } from './fx';
import { C_GOLD, C_PU, C_RAM } from './collect';
import { buildKilo, buildAllocman, type KiloRig, type AllocmanRig, type KiloState } from './models';
import { UI } from './ui';
import { audio } from './audio';
import { SaveStore } from './save';
import { apiLeaderboard, apiStats, apiSubmit, parseChallenge } from './api';
import { MISSION_POOL, newMissionState, newStats, type RunStats } from './missions';
import { CUTSCENES, GAMEOVER_TITLES, KILO_LINES, PRICE_TICKER, TAUNTS } from './jokes';
import { ENDLESS_ZONE_LEN, LANE_X, STAGE_GOALS, STAGE_SPEED, ZONES, stageStart } from './zones';
import { PerfMon } from './perf';
import { loader, paint } from './loader';
import { diag } from './diag';
import { POWER_COLORS, POWER_KINDS, type HudState, type PowerHud, type PowerKind, type QualityName, type RunResult, type Settings } from './types';

type State = 'attract' | 'countdown' | 'run' | 'paused' | 'clear' | 'cutscene' | 'dying' | 'over' | 'finale';
const ALLOC_SCALE = 0.45, KILO_SCALE = 1.35;
const GRAV = 40, JUMP_V = 13.4, STACK_MAX = 3, START_STACK = 3; // exactly 3 fixed lives: nothing (RAM, shop, missions, skins, power-ups) can change this
const rnd = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)]!;
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const smooth = (x: number) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const hexRGB = (h: string): [number, number, number] => { const n = parseInt(h.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };

/** Every session starts at 'low' (desktop included); quality only ever ramps up to medium after steady 60fps, high is manual-only. */
/** minimum ms between processed frames: 12 => <=60 fps (also on 120 Hz); only the static paused scene is allowed 30 fps */
export function capMs(state: string): number { return state === 'paused' ? 28 : 12; }
export function autoQuality(): QualityName { return 'low'; }

export class Game {
  params = new URLSearchParams(location.search);
  save = new SaveStore();
  canvas: HTMLCanvasElement; gfx!: Gfx; assets!: Assets; world!: World; fx!: Particles; kilo!: KiloRig; alloc!: AllocmanRig; ui!: UI;
  state: State = 'attract';
  mode: 'escape' | 'endless' = 'escape'; stage = 1;
  god = false; skipCut = false; quality: QualityName = 'medium'; qualityLocked = false;
  t = 0; dist = 0; startDist = 0; goalDist = 0; speed = 0; timeScale = 1; seed = 1;
  // player
  lane = 1; prevLane = 1; px = 0; py = 0; vy = 0; grounded = true; slideT = 0; slideQueued = false; landSquash = 0; jumpBuf = 0; leanV = 0;
  invuln = 0; hitSlow = 0; stack = 3; ramCount = 0; ramToStack = 0; shield = false; hits = 0; streak = 0; streakT = 0; hitPulse = 0;
  powers: Record<PowerKind, number> = { ddr: 0, magnet: 0, shield: 0, cool: 0, oc: 0 }; powerTotal: Record<PowerKind, number> = { ddr: 1, magnet: 1, shield: 1, cool: 1, oc: 1 };
  railY = 0; railSpawn = 0;
  score = 0; stats: RunStats = newStats(); runStartMissions = 0; ramThisRun = 0; completed: string[] = [];
  // flow
  countT = 0; dyingT = 0; clearT = 0; finaleT = 0; shakeT = 0; camX = 0; camY = 5; camZ = 9;
  bubbleT = 0; bubbleText = ''; chaseT = 6; popT = 0; closeT = 0; tipT = 0; hintStage = 0;
  tmpV = new THREE.Vector3(); tmpV2 = new THREE.Vector3(); tmpV3 = new THREE.Vector3();
  hud: HudState; hudPowers: PowerHud[] = POWER_KINDS.map((k) => ({ kind: k, left: 0, total: 1 }));
  fpsAcc = 0; fpsN = 0; fpsVal = 60; resScale = 1; slowFrames = 0; fastFrames = 0;
  keys = new Set<string>(); swipe = { x: 0, y: 0, id: -1, on: false };
  rail!: THREE.Mesh; railTex!: THREE.CanvasTexture; shadowBlob!: THREE.Mesh; shield3d!: THREE.Mesh;
  finaleG: THREE.Group | null = null; chute: THREE.Group | null = null;
  zoneMoteMode = 0; lastZoneBlend: [number, number, number] = [0, 0, 0]; attractZone = 0;
  last = 0; acc = 0; started = false; dtFixed = 1 / 60;
  stepOnly = false; manual = false;
  tune = { back: Number(new URLSearchParams(location.search).get('cb') ?? 8.2), up: Number(new URLSearchParams(location.search).get('cu') ?? 5.6), gap: Number(new URLSearchParams(location.search).get('ag') ?? 3.8), scale: 0.5, ly: Number(new URLSearchParams(location.search).get('ly') ?? 0.7), lz: Number(new URLSearchParams(location.search).get('lz') ?? -5) };

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.hud = { score: 0, ram: 0, multiplier: 1, ddr: false, stack: 0, stackMax: STACK_MAX, dist: 0, goal: 0, stage: 1, zoneName: '', powers: [], shield: false, speed: 0, threat: 0, mode: 'escape', fps: 60 };
  }

  async init() {
    const p = this.params;
    loader.setOnLow(() => this.continueLow());
    await loader.step(0.04, 'Reading your save');
    this.manual = p.get('manual') === '1'; this.bot = p.get('bot') === '1';
    this.god = p.get('god') === '1'; this.skipCut = p.get('skipcutscenes') === '1';
    this.seed = Number(p.get('seed') ?? 0) || (Math.random() * 1e6 | 0);
    const qp = p.get('quality') as QualityName | null;
    const qs = this.save.data.settings.quality;
    this.qualityLocked = !!qp;
    this.dbg = new Set((p.get('dbg') || '').split(',').filter(Boolean));
    let lowSession = false; try { lowSession = sessionStorage.getItem('ramrun.lowsession') === '1'; } catch { /* ignore */ }
    if (lowSession || this.save.data.gpuTrouble) this.rampLocked = true;
    this.quality = lowSession && !qp ? 'low' : qp && QUALITY[qp] ? qp : (qs === 'auto' || !QUALITY[qs as QualityName]) ? autoQuality() : (qs as QualityName);
    if (!['kilo', 'retro', 'rgb', 'rasp'].includes(this.save.data.skins.selected)) this.save.data.skins.selected = 'kilo';
    await loader.step(0.08, 'Starting graphics');
    this.gfx = new Gfx(this.canvas, this.quality);
    // production: don't synchronously wait for each program to link on first use (onFirstUse); tests/dev keep checks on via ?checkshaders=1
    if (this.dbg.has('nocomp')) this.gfx.composer = null;
    this.gfx.renderer.debug.checkShaderErrors = !import.meta.env.PROD || p.get('checkshaders') === '1';
    await loader.step(0.2, 'Generating textures');
    this.assets = new Assets();
    await loader.step(0.32, 'Building the world');
    this.buildWorld();
    if (p.get('failload') === '1') throw new Error('Forced load failure (test hook ?failload=1)');
    await loader.step(0.42, 'Building Kilo and Sam');
    this.fx = new Particles(this.assets); this.gfx.scene.add(this.fx.group);
    this.kilo = buildKilo(this.save.data.skins.selected); this.kilo.root.scale.setScalar(KILO_SCALE); this.gfx.scene.add(this.kilo.root);
    this.alloc = buildAllocman(); this.tune.scale = Number(this.params.get('as') ?? ALLOC_SCALE); this.alloc.root.scale.set(this.tune.scale, this.tune.scale, this.tune.scale * 0.72); this.gfx.scene.add(this.alloc.root);
    // blob shadow (cheap fallback)
    const bt = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: this.assets.glowTex, color: 0x000000, transparent: true, opacity: 0.55, depthWrite: false }));
    bt.position.y = 0.04; this.shadowBlob = bt; this.gfx.scene.add(bt);
    // cooling rail
    const wt = new THREE.CanvasTexture(makeStripe()); wt.wrapS = wt.wrapT = THREE.RepeatWrapping; wt.repeat.set(1, 30); wt.colorSpace = THREE.SRGBColorSpace; this.railTex = wt;
    this.rail = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 90, 14, 1, true).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x9fe8ff, map: wt, emissiveMap: wt, emissive: new THREE.Color(0.5, 1.4, 2.0), roughness: 0.15, metalness: 0.5, transparent: true, opacity: 0.92 }));
    this.rail.visible = false; this.rail.frustumCulled = false; this.gfx.scene.add(this.rail);
    this.shield3d = new THREE.Mesh(new THREE.IcosahedronGeometry(0.95, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 2.0, 1.2), transparent: true, opacity: 0.0 }));
    // ui
    await loader.step(0.5, "Painting Sam's portraits");
    this.ui = new UI(document.getElementById('ui')!, () => this.save.data, {
      startEscape: (s) => this.startRun('escape', s), startEndless: () => this.startRun('endless', 1),
      resume: () => this.resume(), restart: () => this.startRun(this.mode, this.stage), quitToMenu: () => this.toMenu(), requestPause: () => this.togglePause(),
      buy: (id) => { const ok = this.save.buy(id); if (ok && id.startsWith('skin_')) this.kilo.setSkin(this.save.data.skins.selected as 'kilo'); return ok; },
      selectSkin: (id) => { const s = id.replace(/^skin_/, ''); if (this.save.data.skins.owned.includes(s)) { this.save.data.skins.selected = s; this.save.save(); this.kilo.setSkin(s as 'kilo'); } },
      getShopItems: () => this.save.shopItems(),
      setSettings: (pt) => this.applySettings(pt),
      cutsceneDone: () => this.cutsceneDone(), finaleDone: () => this.finaleDone(),
      sfx: (n, pr) => audio.sfx(n as never, pr),
      submitScore: async (nick, r) => { const res = await apiSubmit(nick, r.gb, Math.max(3, r.durationSec)); return res && res.ok ? { rank: res.rank } : null; },
      getLeaderboard: () => apiLeaderboard(), getStats: () => apiStats(),
    });
    if (this.params.get('perf') === '1') this.perf = new PerfMon(() => ({ quality: this.quality, resScale: this.resScale, backbuffer: this.gfx.bufferSize().join('x'), refreshMs: this.refreshMs, warm: this.warmT > 0,
      extra: () => ({ events: diag.events, frozen: this.frozen, gpuTrouble: !!this.save.data.gpuTrouble, pendingQuality: this.pendingQuality, rampLocked: this.rampLocked, state: this.state, info: { programs: this.gfx.renderer.info.programs?.length, ...this.gfx.renderer.info.memory } }) }));
    this.challenge = parseChallenge(this.params); if (this.challenge) this.ui.setChallenge(this.challenge);
    this.applySettings({}); this.ui.setQualityChip(this.quality);
    world_hook(this);
    window.addEventListener('resize', () => this.resize()); this.resize(); this.setupContextGuards();
    this.setupInput();
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { if (this.state === 'run' || this.state === 'countdown') this.togglePause(); }
      else { this.last = 0; this.hiddenGap = true; this.warmT = Math.max(this.warmT, 2); this.wdT = 0; this.wdCount = 0; }
    });
    // start
    const st = Number(p.get('stage') ?? 0);
    const doWarm = !this.manual || p.get('warm') === '1';

    if (p.get('endless') === '1') this.startRun('endless', 1);
    else if (st >= 1 && st <= 5) { this.save.data.stageReached = Math.max(this.save.data.stageReached, st); this.startRun('escape', st, true); }
    else this.toMenu();
    this.started = true;
    this.startHeartbeat();
    await loader.step(0.58, 'Compiling shaders');
    if (doWarm) { this.warmFrom = 0.6; this.warmTo = 0.92; await this.warmUp(true); }
    if (doWarm && !this.manual) await this.settle();
    loader.hide();
  }
  /** run real title frames behind the boot screen until they are steady (first-frame work: portraits, DOM, GPU uploads, JIT) so the title appears without a hitch */
  private async settle() {
    loader.set(0.94, 'Warm-up frames'); this.warming = true; this.ui.setWarming(true);
    const raf = () => new Promise<number>((r) => { let d = false; const f = (t: number) => { if (!d) { d = true; r(t); } }; requestAnimationFrame(f); setTimeout(() => f(performance.now()), 120); });
    let prev = await raf(), good = 0, n = 0, worst = 0; const t0 = performance.now();
    while (good < 8 && n < 90 && performance.now() - t0 < 3500) {
      const t = await raf(); const iv = t - prev; prev = t; n++;
      const a = performance.now(); this.step(1 / 60); if (!this.ctxLost) this.gfx.render(); const cost = performance.now() - a;
      worst = Math.max(worst, iv); if (iv < 22 && cost < 12 || (iv < 40 && n > 2 && cost < 6)) good++; else good = 0;
      loader.set(Math.min(0.99, 0.94 + n * 0.004));
    }
    this.note(`settle: ${n} frames, worst interval ${worst.toFixed(1)}ms, steady=${good >= 8}`);
    this.last = 0; this.warming = false; this.ui.setWarming(false); this.warmT = Math.max(this.warmT, 2);
  }
  warmFrom = 0.3; warmTo = 0.9; warmAborted = false; abortWarm: (() => void) | null = null;
  /** "Continue in Low quality" from the slow-loading panel: stop waiting for shaders, go Low, never block again */
  continueLow() {
    this.warmAborted = true; this.abortWarm?.(); this.rampLocked = true; if (this.quality !== 'low') this.pendingQuality = 'low';
    this.note('user chose Continue in Low quality'); this.warming = false; this.busy = false; loader.hide();
  }

  private buildWorld() {
    const q = QUALITY[this.quality];
    if (this.world) this.world.dispose();
    this.world = new World(this.assets, { mirror: q.mirror, mirrorObst: q.mirrorObst, chunks: q.chunks });
    this.gfx.scene.add(this.world.root);
    world_hook(this);
  }

  applySettings(patch: Partial<Settings>) {
    const s = this.save.data.settings; Object.assign(s, patch);
    audio.setVolumes(s.master, s.music, s.sfx, s.muted);
    if (patch.quality !== undefined && patch.quality !== 'low' && patch.quality !== 'auto') { let ls = false; try { ls = sessionStorage.getItem('ramrun.lowsession') === '1'; } catch { /* */ } if (ls) { this.ui.toast('Graphics are locked to Low after a freeze on this machine', '#ffd23f'); patch = { ...patch, quality: 'low' }; s.quality = 'low'; } }
    if (patch.quality !== undefined && !this.qualityLocked) {
      const nq = s.quality === 'auto' ? autoQuality() : s.quality;
      this.rampLocked = s.quality !== 'auto'; this.pendingQuality = null;
      this.changeQuality(nq);
    }
    this.save.save();
  }

  /** Quality/world rebuilds happen ONLY between runs (title/attract); mid-run requests are queued until the next run starts. Runs behind the loading veil. */
  busy = false; busyP: Promise<void> = Promise.resolve();
  changeQuality(nq: QualityName, force = false): Promise<void> {
    if (nq === this.quality) { if (!force) this.pendingQuality = null; return Promise.resolve(); }
    if (!force && this.state !== 'attract') { this.pendingQuality = nq; this.ui.setQualityChip(nq); return Promise.resolve(); }
    this.busyP = this.switchQuality(nq); return this.busyP;
  }
  private async switchQuality(nq: QualityName): Promise<void> {
    const sync = this.manual && this.params.get('veil') !== '1'; // plain manual test mode stays fully synchronous
    this.busy = true; this.warming = true;
    try {
      if (!sync) await loader.show(`Switching to ${nq.toUpperCase()} graphics…`);
      diag.log(`quality switch -> ${nq}`); this.quality = nq; this.gfx.setQuality(nq);
      if (!sync) await loader.step(0.2, 'Building the world');
      this.buildWorld(); this.resScale = 1; this.gfx.scale = 1; this.gfx.resize(this.gfx.w, this.gfx.h);
      if (!sync) await loader.step(0.35, 'Restoring the scene');
      if (this.state === 'attract') this.startAttract();
      else { this.world.reset({ ...this.world.params, startDist: this.dist }); if (this.goalDist > 0) this.world.setGate(this.goalDist, this.stage === 5 ? 'ROOFTOP EXIT' : `CHECKPOINT ${this.stage}`, this.stage === 5 ? 'exit' : 'door'); world_hook(this); }
      this.ui.setQualityChip(nq); this.warmT = Math.max(this.warmT, 3);
      if (!sync && this.started) { this.warmFrom = 0.4; this.warmTo = 0.95; await this.warmUp(true); }
    } finally { this.warming = false; this.busy = false; if (!sync) loader.hide(); }
  }
  resize() { diag.log(`resize ${window.innerWidth}x${window.innerHeight}`); this.gfx.resize(window.innerWidth, window.innerHeight); }

  // ------------------------------------------------------------ flow
  toMenu() {
    if (this.state === 'run' || this.state === 'paused') this.bankRun();
    this.ui.hideAll(); this.ui.showHud(false); this.ui.setBubble(null, 0, 0); this.ui.showHint(null);
    this.startAttract(); this.ui.showTitle();
    if (this.pendingQuality) this.applyPendingQuality();
  }
  startAttract() {
    this.state = 'attract'; this.finaleCleanup();
    this.attractZone = Math.floor(Math.random() * 5);
    this.setupRun('endless', 1, this.attractZone * ENDLESS_ZONE_LEN + 300, true);
    this.speed = 17; this.stack = STACK_MAX; this.kilo.setStack(STACK_MAX, STACK_MAX); this.samExpr('smug', 0);
    audio.setMusic('menu', this.attractZone, 0.3);
  }
  private setupRun(mode: 'escape' | 'endless', stage: number, startDist: number, attract = false) {
    this.finaleCleanup();
    this.mode = mode; this.stage = stage;
    this.startDist = startDist; this.dist = startDist;
    this.goalDist = mode === 'escape' ? stageStart(stage) : 0;
    this.world.reset({ mode, stage: stage - 1, startDist, goalDist: this.goalDist, seed: this.seed + stage * 17, quiet: attract });
    if (mode === 'escape' && !attract) this.world.setGate(this.goalDist, stage === 5 ? 'ROOFTOP EXIT' : `CHECKPOINT ${stage}`, stage === 5 ? 'exit' : 'door');
    this.fx.clear(); this.world.collect.clear();
    this.t = 0; this.speed = 0; this.timeScale = 1;
    this.lane = this.prevLane = 1; this.px = 0; this.py = 0; this.vy = 0; this.grounded = true; this.slideT = 0; this.slideQueued = false; this.jumpBuf = 0;
    this.hintStage = 0; this.invuln = 0; this.hitSlow = 0; this.hits = 0; this.streak = 0; this.hitPulse = 0;
    this.stack = START_STACK; this.shield = this.save.data.upgrades.shield > 0 && !attract;
    for (const k of POWER_KINDS) this.powers[k] = 0;
    this.score = 0; this.ramThisRun = 0; this.gbRun = 0; this.runTime = 0; this.stats = newStats(); this.completed.length = 0;
    this.rail.visible = false; this.alloc.setCatch(0); this.samExpr('earnest', 0); this.alloc.root.visible = true; this.kilo.root.visible = true; this.kilo.root.scale.setScalar(KILO_SCALE);
    this.bubbleT = 0; this.chaseT = 5 + Math.random() * 3;
    for (const m of this.save.data.missions) m.progress = 0;
    this.mBase = {};
    this.kilo.setStack(this.stack, STACK_MAX); this.kilo.setShield(this.shield); this.kilo.setOverclock(false);
    this.world.setVisible(true);
  }
  /** runs wait for warm-up / a pending quality switch (shown as a brief veil), never mid-run */
  startRun(mode: 'escape' | 'endless', stage: number, noCountdown = false) {
    if (!this.dbg.has('noaudio')) audio.init();
    if (this.state === 'run' || this.state === 'paused') this.bankRun();
    if (this.pendingQuality) { const q = this.pendingQuality; this.pendingQuality = null; this.state = 'attract'; void this.changeQuality(q, true); }
    const wait = this.busy ? this.busyP : this.warming ? this.warmP : null;
    if (wait) {
      if (!loader.visible) loader.showNow('Getting ready…');
      void wait.then(() => { loader.hide(); this.startRunNow(mode, stage, noCountdown); });
      return;
    }
    this.startRunNow(mode, stage, noCountdown);
  }
  private startRunNow(mode: 'escape' | 'endless', stage: number, noCountdown = false) {
    if (this.state === 'run' || this.state === 'paused') this.bankRun();
    this.warmT = Math.max(this.warmT, 2);
    this.ui.hideAll(); if (!this.dbg.has('nohud')) this.ui.showHud(true); this.ui.setBubble(null, 0, 0);
    this.setupRun(mode, stage, mode === 'escape' ? stageStart(stage - 1) : 0);
    this.state = 'countdown'; this.countT = noCountdown ? 0.54 : 0; this.countShown = -1; this.goDone = false;
    this.intro = false;
    if (!noCountdown && !this.introDone && !this.manualNoIntro && this.params.get('nointro') !== '1') { this.introDone = true; this.intro = true; this.countT = -0.9; this.say('chase'); }
    audio.setMusic('run', this.zoneIdx(), 0.2); audio.setPaused(false);
    this.ui.showStageBanner(mode === 'escape' ? stage : 0, ZONES[this.zoneIdx()]!.name, mode === 'escape' ? STAGE_GOALS[stage - 1]! : 0);
    this.runStartMissions = this.save.data.missionsDone;
    this.kilo.pose(0, { state: 'idle', speed: 0, t: 0, lean: 0, vy: 0, landSquash: 0 });
  }
  countShown = -1;
  zoneIdx(): number { return this.world.zoneAt(this.dist); }

  togglePause() {
    if (this.state === 'run' || this.state === 'countdown') { this.prevState = this.state; this.state = 'paused'; this.ui.showPause(); audio.setPaused(true); }
    else if (this.state === 'paused') this.resume();
  }
  prevState: State = 'run';
  resume() { if (this.state === 'paused') { this.state = this.prevState; this.ui.hidePause(); audio.hold(false); audio.setPaused(false); } }

  // ------------------------------------------------------------ input
  private setupInput() {
    const first = () => audio.init();
    window.addEventListener('pointerdown', first, true); window.addEventListener('keydown', first, true); window.addEventListener('touchstart', first, true);
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    const skipIntro = () => { if (this.intro) { this.intro = false; this.countT = Math.max(this.countT, 0.45); } };
    window.addEventListener('pointerdown', skipIntro, true); window.addEventListener('keydown', skipIntro, true);
    window.addEventListener('keydown', (e) => {
      if (e.repeat || loader.visible) return;
      const k = e.key.toLowerCase();
      if (this.state !== 'run' && this.state !== 'countdown') { if (k === 'p' && this.state === 'paused') this.togglePause(); return; }
      if (k === 'arrowleft' || k === 'a') this.moveLane(-1);
      else if (k === 'arrowright' || k === 'd') this.moveLane(1);
      else if (k === 'arrowup' || k === 'w' || k === ' ') { this.jumpBuf = 0.14; e.preventDefault(); }
      else if (k === 'arrowdown' || k === 's') { this.doSlide(); e.preventDefault(); }
      else if (k === 'p') this.togglePause();
    });
    const sw = this.swipe;
    window.addEventListener('pointerdown', (e) => { if ((e.target as HTMLElement).closest?.('button,input,a,[data-act],.sheet,.menu')) { sw.on = false; return; } sw.x = e.clientX; sw.y = e.clientY; sw.id = e.pointerId; sw.on = true; });
    window.addEventListener('pointermove', (e) => {
      if (!sw.on || e.pointerId !== sw.id) return;
      const dx = e.clientX - sw.x, dy = e.clientY - sw.y; const T = 26;
      if (Math.abs(dx) < T && Math.abs(dy) < T) return;
      this.doSwipe(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
      sw.x = e.clientX; sw.y = e.clientY;
    });
    const end = (e: PointerEvent) => { if (e.pointerId === sw.id) sw.on = false; };
    window.addEventListener('pointerup', end); window.addEventListener('pointercancel', end);
  }
  doSwipe(d: 'left' | 'right' | 'up' | 'down') {
    if (this.state !== 'run' && this.state !== 'countdown') return;
    if (d === 'left') this.moveLane(-1); else if (d === 'right') this.moveLane(1); else if (d === 'up') this.jumpBuf = 0.14; else this.doSlide();
  }
  moveLane(d: number) {
    if (this.state !== 'run' && this.state !== 'countdown') return;
    const nl = clamp(this.lane + d, 0, 2); if (nl === this.lane) return;
    this.prevLane = this.lane; this.lane = nl; this.leanV = d; this.stats.lanes++; audio.sfx('lane');
  }
  doSlide() {
    if (this.state !== 'run' && this.state !== 'countdown') return;
    if (this.powers.cool > 0) return;
    if (this.grounded) { this.slideT = 0.78; this.stats.slides++; audio.sfx('slide'); this.slideQueued = false; }
    else { this.vy = Math.min(this.vy, -24); this.slideQueued = true; }
  }

  // ------------------------------------------------------------ main loop
  perf: PerfMon | null = null; warming = false;
  rafPrev = 0; rafRing = new Float32Array(60); rafN = 0; refreshMs = 16.7;
  cpuAcc = 0; cpuN = 0; longN = 0; lastCpu = 0; lastStep = 0; lastRender = 0;
  frame = (now: number) => {
    requestAnimationFrame(this.frame);
    this.rafAt = now; if (this.frozen) this.afterFreeze();
    // detect the display refresh from raw rAF deltas (25th percentile of the last 60, never reported slower than 60Hz)
    if (this.rafPrev) { const d = now - this.rafPrev; if (d > 3 && d < 40) { this.rafRing[this.rafN++ % 60] = d; if (this.rafN % 60 === 0) { const a = Array.from(this.rafRing).sort((x, y) => x - y); this.refreshMs = Math.min(16.7, Math.max(4, a[15]!)); } } }
    this.rafPrev = now;
    if (!this.started || this.manual || this.warming) { this.last = 0; return; }
    // frame cap: <=60fps in EVERY state where anything moves (title attract, cutscene, game over, run...); the 12 ms threshold keeps 120 Hz displays at 60.
    // Only 'paused' (a static scene) may drop to 30.
    const calm = this.state === 'paused';
    if (this.last && now - this.last < capMs(this.state)) return;
    if (!this.last) this.last = now;
    const rawMs = now - this.last;
    let dt = rawMs / 1000; this.last = now;
    if (dt > 0.1) dt = 0.1;
    this.fpsAcc += dt; this.fpsN++;
    const t0 = performance.now(); this.frameAt = t0;
    let t1 = t0;
    try {
      this.step(dt); t1 = performance.now();
      if (!this.ctxLost && !this.dbg.has('norender')) this.gfx.render();
      this.errN = 0;
    } catch (err) {
      // never let one bad frame freeze the game: log it, keep the loop alive, and bail to the menu if it keeps failing
      console.error(err); this.note('frame error: ' + String(err));
      if (++this.errN >= 30) { this.errN = 0; try { this.ui.hideAll(); this.toMenu(); } catch { /* ignore */ } }
    }
    const t2 = performance.now();
    this.logEvents();
    this.lastStep = t1 - t0; this.lastRender = t2 - t1; this.cpuAcc += t2 - t0; this.cpuN++;
    if (rawMs > 40 && !this.hiddenGap) this.longN++;
    this.hiddenGap = false;
    if (this.fpsAcc > 0.5) { this.fpsVal = this.fpsN / this.fpsAcc; this.adaptRes(this.fpsAcc / this.fpsN * 1000, this.cpuN ? this.cpuAcc / this.cpuN : 0, calm); this.fpsAcc = 0; this.fpsN = 0; this.cpuAcc = 0; this.cpuN = 0; this.longN = 0; }
    this.watchdog(Math.min(rawMs, 1000) / 1000);
    if (this.perf) { const i = this.gfx.renderer.info; this.perf.frame(Math.min(rawMs, 2000), this.lastStep, this.lastRender, (calm ? 33.3 : Math.max(16.7, this.refreshMs)), { state: this.state, dist: this.dist, zone: this.adZone, programs: i.programs?.length ?? 0, textures: i.memory.textures, geometries: i.memory.geometries, calls: i.render.calls, tris: i.render.triangles }); }
  };
  hiddenGap = false; errN = 0;

  // ---- adaptive quality. Judged by measured frame interval relative to the target interval (not raw "<14ms", which can never happen
  // under the 60fps cap) plus CPU frame cost. Warm-up windows (load, world rebuild, zone change, tab return, run start) are ignored.
  steadyT = 0; rampLocked = false; lastScaleChange = -99; lastDown = -99; slowChecks = 0; goodChecks = 0; clock = 0; warmT = 5; adZone = -1; upDelay = 6;
  pendingQuality: QualityName | null = null;
  adaptRes(avgMs: number, cpuMs: number, calm: boolean) {
    this.clock += 0.5;
    const z = this.zoneIdx(); if (z !== this.adZone) { if (this.adZone >= 0) this.warmT = Math.max(this.warmT, 2); this.adZone = z; }
    const live = this.state === 'run' || this.state === 'attract';
    if (this.qualityLocked || !live) { this.steadyT = 0; this.slowChecks = this.goodChecks = 0; return; }
    if (this.warmT > 0) { this.warmT -= 0.5; this.slowChecks = this.goodChecks = 0; this.steadyT = 0; return; }
    const tgt = calm ? 33.3 : 16.7; // calm = paused only
    const bad = avgMs > tgt * 1.4 || cpuMs > tgt * 0.85 || this.longN >= 2;
    const good = avgMs < tgt * 1.2 && cpuMs < tgt * 0.6 && this.longN === 0;
    this.slowChecks = bad ? this.slowChecks + 1 : 0;
    this.goodChecks = good ? this.goodChecks + 1 : 0;
    this.steadyT = good ? this.steadyT + 0.5 : bad ? 0 : this.steadyT;
    const auto = this.save.data.settings.quality === 'auto';
    // resolution scaler: down after 3 consecutive bad half-seconds; back up after 2s of good frames
    if (this.slowChecks >= 3 && this.resScale > 0.6 && this.clock - this.lastScaleChange >= 3) {
      this.upDelay = this.clock - this.lastUp < 15 ? 30 : 6; // bounced up->down quickly: wait longer before trying again
      this.resScale = Math.max(0.6, +(this.resScale - 0.15).toFixed(2)); this.gfx.setScale(this.resScale); this.lastScaleChange = this.lastDown = this.clock; this.slowChecks = 0;
      this.note(`resScale down -> ${this.resScale} (avg ${avgMs.toFixed(1)}ms cpu ${cpuMs.toFixed(1)}ms)`);
      if (auto && this.quality === 'medium' && this.resScale <= 0.75) { this.rampLocked = true; this.pendingQuality = 'low'; this.note('quality low queued (applies between runs)'); }
    } else if (this.goodChecks >= 4 && this.resScale < 1 && this.clock - this.lastDown >= this.upDelay && this.clock - this.lastScaleChange >= 2.5) {
      this.resScale = Math.min(1, +(this.resScale + 0.2).toFixed(2)); this.gfx.setScale(this.resScale); this.lastScaleChange = this.lastUp = this.clock; this.goodChecks = 0;
      this.note(`resScale up -> ${this.resScale}`);
    }
    // low -> medium: after ~8s of healthy frames at full resolution; applied only BETWEEN runs (title now, or at the next run start)
    if (auto && this.quality === 'low' && !this.rampLocked && this.resScale >= 1 && this.steadyT >= 8 && !this.pendingQuality) { this.pendingQuality = 'medium'; this.note('quality medium queued'); }
    if (this.pendingQuality && this.state === 'attract') this.applyPendingQuality();
  }
  lastUp = -99;
  applyPendingQuality() {
    const q = this.pendingQuality; this.pendingQuality = null; if (!q || q === this.quality) return;
    this.changeQuality(q, true);
  }
  /** per-frame stuck detection: countdown/intro > 5s forces GO; run with no progress for 3s is logged and recovered */
  wdCount = 0; wdDist = 0; wdT = 0;
  watchdog(dt: number) {
    if (this.state === 'countdown') { this.wdCount += dt; if (this.wdCount > 5) { this.wdCount = 0; this.note('watchdog: countdown stuck > 5s, forced GO'); this.intro = false; this.countT = Math.max(this.countT, 0.56); this.startGo(); } } else this.wdCount = 0;
    if (this.state === 'run') {
      if (this.dist > this.wdDist + 0.01) { this.wdDist = this.dist; this.wdT = 0; }
      else { this.wdT += dt; if (this.wdT > 3) { this.wdT = 0; this.note(`watchdog: run not advancing (speed ${this.speed.toFixed(1)} ts ${this.timeScale} inv ${this.invuln.toFixed(1)}); recovered`); this.timeScale = 1; this.speed = Math.max(this.speed, 8); this.invuln = Math.max(this.invuln, 1); this.px = LANE_X[this.lane]!; } }
    } else { this.wdT = 0; this.wdDist = this.dist; }
  }
  dbg = new Set<string>();
  note(msg: string) { diag.log(msg); this.perf?.note(msg); }
  lastLogState = ''; lastRes = [0, 0, 0]; seenKinds = new Set<number>();
  // ---- freeze detector (always on): page visible but no rAF for >1 s while the main thread is alive => the GPU process is hung
  rafAt = performance.now(); hbPrev = performance.now(); frozen = false; freezeAt = 0; freezeNote = false; hbTimer = 0;
  startHeartbeat() {
    this.rafAt = this.hbPrev = performance.now();
    this.hbTimer = window.setInterval(() => {
      const now = performance.now(); const gap = now - this.hbPrev; this.hbPrev = now;
      if (document.visibilityState !== 'visible' || !this.started) { this.rafAt = now; return; }
      if (gap > 1500) { diag.log(`main thread blocked ${Math.round(gap)}ms (heartbeat late; not an rAF-only freeze)`); this.note(`main thread blocked ${Math.round(gap)}ms`); this.rafAt = now; return; }
      if (!this.frozen && now - this.rafAt > 1000 && !this.manual) this.onFreeze(now - this.rafAt);
    }, 250);
  }
  private onFreeze(sinceRaf: number) {
    this.frozen = true; this.freezeAt = performance.now();
    const wasPlaying = this.state === 'run' || this.state === 'countdown';
    audio.hold(true); // silence music/SFX while nothing is painted
    this.lockLow('freeze');
    const msg = `FREEZE: no rAF for ${Math.round(sinceRaf)}ms while visible (heartbeat alive) state=${this.state} d=${this.dist.toFixed(1)} q=${this.quality} res=${this.resScale}`;
    diag.log(msg); this.note(msg);
    diag.save('freeze', { state: this.state, dist: this.dist, zone: this.adZone, quality: this.quality, resScale: this.resScale, wasPlaying, info: this.glInfo() });
  }
  /** called from frame() when frames resume after a freeze: pause (never lose a life during it) and apologise */
  private afterFreeze() {
    this.frozen = false; this.last = 0; this.warmT = Math.max(this.warmT, 3);
    const ms = Math.round(performance.now() - this.freezeAt);
    diag.log(`frames resumed after ~${ms}ms freeze`);
    if (this.state === 'run' || this.state === 'countdown') { this.togglePause(); this.ui.pauseNote('The graphics froze for a moment, sorry. Press RESUME when ready.'); }
    else { audio.hold(false); this.ui.toast('The graphics froze for a moment, sorry. Switched to Low quality.', '#ffd23f'); }
  }
  /** after any freeze / context loss: Low quality for the rest of this browser session; the auto ramp never rises again on this machine */
  lockLow(why: string) {
    this.rampLocked = true; this.pendingQuality = this.quality === 'low' ? null : 'low';
    try { sessionStorage.setItem('ramrun.lowsession', '1'); } catch { /* ignore */ }
    if (!this.save.data.gpuTrouble) { this.save.data.gpuTrouble = true; this.save.save(); }
    diag.log(`quality locked to Low (${why})`);
  }
  /** cheap per-frame event log: state changes + GPU resource count changes (texture/geometry uploads, new programs) */
  private logEvents() {
    if (this.state !== this.lastLogState) { diag.log(`state ${this.lastLogState || '-'} -> ${this.state} d=${this.dist.toFixed(1)} v=${this.speed.toFixed(1)} zone=${this.adZone}`); this.lastLogState = this.state; if (this.state === 'countdown') this.seenKinds.clear(); }
    const i = this.gfx.renderer.info; const pr = i.programs?.length ?? 0, tx = i.memory.textures, ge = i.memory.geometries; const r = this.lastRes;
    if (pr !== r[0] || tx !== r[1] || ge !== r[2]) { if (r[0] || r[1]) diag.log(`gpu resources: programs ${r[0]}->${pr} textures ${r[1]}->${tx} geometries ${r[2]}->${ge} (state ${this.state}, d=${this.dist.toFixed(1)})`); r[0] = pr; r[1] = tx; r[2] = ge; }
  }
  private glInfo() { const i = this.gfx.renderer.info; return { programs: i.programs?.length, textures: i.memory.textures, geometries: i.memory.geometries, calls: i.render.calls, tris: i.render.triangles }; }
  visSince = performance.now(); frameAt = 0;
  private lossInfo(e: Event): string {
    const heap = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize;
    return `webglcontextlost: visibility=${document.visibilityState} sinceVisible=${((performance.now() - this.visSince) / 1000).toFixed(1)}s sinceLastFrame=${this.frameAt ? Math.round(performance.now() - this.frameAt) : -1}ms status="${(e as WebGLContextEvent).statusMessage ?? ''}" heapMB=${heap ? (heap / 1048576).toFixed(0) : '?'} state=${this.state} q=${this.quality} res=${this.resScale}`;
  }
  /** WebGL context lost: stop rendering; on restore drop to low once */
  ctxLost = false;
  setupContextGuards() {
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.visSince = performance.now(); });
    this.canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.ctxLost = true; this.rampLocked = true; { const li = this.lossInfo(e); this.note(li); diag.log(li); this.lockLow('contextlost'); diag.save('contextlost', { info: li, gl: this.glInfo() }); } loader.showNow('Graphics context lost, recovering…'); });
    this.canvas.addEventListener('webglcontextrestored', () => {
      this.ctxLost = false; this.quality = 'medium' as QualityName; this.resScale = 1; this.gfx.scale = 1;
      loader.showNow('Restoring graphics…');
      try { void this.changeQuality('low', true).then(() => this.ui.toast('Graphics reset: continuing in Low quality', '#ffd23f')); } catch (err) { console.warn(err); loader.hide(); }
    });
  }

  // ---- warm-up: touch every pooled object / texture / program once behind the title so nothing compiles or uploads during play
  private forceShowAll(): () => void {
    const saved: { o: THREE.Object3D; v: boolean; f: boolean; c?: number }[] = [];
    this.gfx.scene.traverse((o) => { const im = o as THREE.InstancedMesh; saved.push({ o, v: o.visible, f: o.frustumCulled, c: im.isInstancedMesh ? im.count : undefined }); });
    const hiddenAlloc = !this.alloc.root.visible;
    for (const r of saved) { r.o.visible = true; r.o.frustumCulled = false; if (r.c !== undefined && r.c < 1) (r.o as THREE.InstancedMesh).count = 1; }
    this.rail.visible = true;
    return () => { for (const r of saved) { r.o.visible = r.v; r.o.frustumCulled = r.f; if (r.c !== undefined) (r.o as THREE.InstancedMesh).count = r.c; } this.alloc.root.visible = !hiddenAlloc; };
  }
  /** returns a promise that resolves once everything is compiled + uploaded and the scene is restored */
  warmP: Promise<void> = Promise.resolve(); finaleKeep: THREE.Object3D[] = [];
  warmUp(async_ = true): Promise<void> { this.warmP = this.warmUp0(async_); return this.warmP; }
  private async warmUp0(async_: boolean): Promise<void> {
    const t0 = performance.now(); this.warming = true; this.ui.setWarming(true); this.warmAborted = false;
    const abort = new Promise<void>((r) => { this.abortWarm = r; });
    const EXPECT = { low: 90, medium: 97, high: 97 }[this.quality]; const poll = window.setInterval(() => { if (loader.visible) { const n = this.gfx.renderer.info.programs?.length ?? 0; loader.set(this.warmFrom + (this.warmTo - this.warmFrom) * Math.min(1, n / EXPECT), `Compiling shaders ${Math.min(n, EXPECT)}/${EXPECT}`); } }, 80);
    // finale objects (city, parachute) and every Kilo skin are built/touched too so their programs exist before they are needed
    let finale = false; try { if (!this.finaleG && !this.finaleKeep.length) { this.buildFinale(); finale = true; } } catch (e) { console.warn(e); }
    const restore = this.forceShowAll();
    try {
      this.gfx.camera.updateMatrixWorld();
      const comp = async () => { if (this.warmAborted) return; if (async_ && this.gfx.renderer.compileAsync) await Promise.race([this.gfx.renderer.compileAsync(this.gfx.scene, this.gfx.camera), abort]); else this.gfx.renderer.compile(this.gfx.scene, this.gfx.camera); };
      // skins can change a material's program variant: compile each one
      const sel = this.save.data.skins.selected as 'kilo';
      for (const sk of ['retro', 'rgb', 'rasp', 'kilo'] as const) { this.kilo.setSkin(sk); await comp(); this.gfx.render(); }
      this.kilo.setSkin(sel);
      // every Kilo animation state and Sam expression/catch state (some toggle materials or hidden parts)
      const kp = { speed: 20, t: 0, lean: 0, vy: 0, landSquash: 0 };
      for (const ks of ['jump', 'slide', 'stumble', 'dead', 'ride', 'parachute', 'celebrate', 'idle', 'run'] as KiloState[]) { this.kilo.pose(0.016, { ...kp, state: ks }); }
      this.kilo.setShield(true); this.kilo.setOverclock(true); this.kilo.flashHit(); this.kilo.setStack(STACK_MAX, STACK_MAX);
      for (const ex of ['neutral', 'smug', 'shock', 'worried', 'glee'] as const) this.alloc.setExpression(ex);
      this.alloc.setCatch(1); this.alloc.setMad(1);
      await comp(); this.gfx.render();
      this.kilo.pose(0.016, { ...kp, state: 'parachute' }); this.kilo.setShield(false); this.kilo.setOverclock(false);
      await comp(); this.gfx.render();
      this.kilo.pose(0.016, { ...kp, state: 'idle' }); this.alloc.setCatch(0); this.alloc.setMad(0); this.alloc.setExpression('neutral'); this.kilo.setStack(this.stack, STACK_MAX);
      await comp();
      this.gfx.render(); // uploads every geometry/texture, compiles composer + shadow programs
    } catch (e) { console.warn('warmUp failed', e); }
    finally { clearInterval(poll); this.abortWarm = null; restore();
      if (finale) { // keep the warmed finale objects (hidden, never disposed) so their shader programs stay referenced until the real finale
        const g = this.finaleG, ch = this.chute; this.finaleG = null; this.chute = null;
        if (g) { g.visible = false; this.finaleKeep.push(g); } if (ch) { ch.removeFromParent(); ch.visible = false; this.gfx.scene.add(ch); this.finaleKeep.push(ch); }
      }
      this.gfx.render(); this.warming = false; this.ui.setWarming(false); this.last = 0; this.warmT = Math.max(this.warmT, 3); this.note(`warm-up ${(performance.now() - t0).toFixed(0)}ms`); }
  }

  step(dtReal: number) {
    const st = this.state;
    if (dtReal * this.timeScale * Math.max(10, this.speed) > 0.7 && !this.sub) { this.sub = true; const n = Math.ceil(dtReal / 0.02); for (let i = 0; i < n; i++) this.step(dtReal / n); this.sub = false; return; }
    let dt = dtReal * this.timeScale;
    if (st === 'paused') { this.renderOnly(0); return; }
    if (st === 'cutscene' || st === 'over') { this.timeScale = 0; this.renderOnly(dtReal); return; }
    if (st === 'finale') { this.stepFinale(dtReal); return; }
    this.t += dt;
    if (st === 'countdown') this.stepCountdown(dt);
    if (st === 'run' || st === 'attract' || st === 'countdown' || st === 'clear') this.stepRun(dt);
    if (st === 'dying') this.stepDying(dtReal);
    if (st === 'clear') this.stepClear(dtReal);
    this.updateVisuals(dt, dtReal);
  }

  stepCountdown(dt: number) {
    this.countT += dt;
    if (this.intro && this.countT >= 0) this.intro = false;
    // instant play: a quick READY... GO within ~0.7s
    if (this.countShown !== 0 && this.countT >= 0.55) { this.countShown = 0; this.ui.showCountdown('GO'); audio.sfx('go'); this.startGo(); }
    else if (this.countShown === -1 && this.countT > 0.05) { this.countShown = 3; }
  }
  goDone = false;
  startGo() {
    if (this.state === 'run' && this.goDone) return; this.goDone = true;
    this.state = 'run'; this.speed = 6;
    const h = this.save.data.upgrades.head;
    if (h > 0) this.activate('oc', 1.6 + h * 1.0);
    this.showTutorialHints();
  }
  showTutorialHints() { if (!this.save.data.tutorialSeen && (this.mode === 'endless' || this.stage === 1)) this.ui.showHint(matchMedia('(pointer: coarse)').matches ? 'Swipe left / right to change lanes' : 'Use ← → (or A / D) to change lanes'); }

  targetSpeed(): number {
    if (this.mode === 'escape') {
      const [b, e] = STAGE_SPEED[this.stage - 1]!; const len = STAGE_GOALS[this.stage - 1]!; const p = clamp((this.dist - stageStart(this.stage - 1)) / len, 0, 1);
      return b + (e - b) * p;
    }
    return Math.min(34, 15 + this.dist / 260);
  }

  stepRun(dt: number) {
    const attract = this.state === 'attract', running = this.state === 'run';
    // ---- speed
    let ts = this.targetSpeed();
    if (this.powers.oc > 0) ts *= 1.42; else if (this.powers.cool > 0) ts *= 1.12;
    ts *= 1 - this.hitSlow * 0.35;
    if (attract) ts = 17;
    if (this.state === 'countdown') ts = 0;
    if (this.state === 'clear') ts = 6;
    this.speed += (ts - this.speed) * Math.min(1, dt * (running ? 1.6 : 3));
    this.hitSlow = Math.max(0, this.hitSlow - dt * 1.2);
    const scroll = this.speed * dt;
    if (running || attract || this.state === 'clear') this.dist += scroll;
    // ---- attract autopilot
    if (attract) {
      this.ap = (this.ap ?? 0) - dt;
      if (this.ap <= 0) { this.ap = 1.3 + Math.random() * 1.6; const nl = clamp(this.lane + (Math.random() < 0.5 ? -1 : 1), 0, 2); this.lane = nl; }
      if (Math.random() < dt * 0.25 && this.grounded) this.jumpBuf = 0.1;
    }
    // ---- player physics
    const cool = this.powers.cool > 0;
    this.px += (LANE_X[this.lane]! - this.px) * (1 - Math.exp(-dt * 19));
    this.leanV *= Math.exp(-dt * 7);
    this.jumpBuf -= dt; this.invuln = Math.max(0, this.invuln - dt); this.hitPulse = Math.max(0, this.hitPulse - dt * 0.8);
    this.slideT = Math.max(0, this.slideT - dt);
    if (cool) {
      this.railY += ((3.55) - this.railY) * Math.min(1, dt * 5); this.py = this.railY; this.vy = 0; this.grounded = false; this.slideT = 0;
    } else {
      if (this.jumpBuf > 0 && this.grounded && (running || attract)) { this.vy = JUMP_V; this.grounded = false; this.slideT = 0; this.jumpBuf = 0; this.stats.jumps++; audio.sfx('jump'); this.fx.burst(this.px, 0.15, 0, 5, 3, 0.35, 0.12, 0.7, 0.9, 1.0, 5); }
      this.vy -= GRAV * dt; this.py += this.vy * dt;
      const g = this.world.groundAt(this.px, this.py + Math.max(0, -this.vy * dt), 0);
      if (this.vy <= 0 && this.py <= g + (this.grounded ? 0.45 : 0.0001)) {
        if (!this.grounded && this.vy < -7) { this.landSquash = clamp(-this.vy / 20, 0.2, 1); audio.sfx('land', this.landSquash); this.fx.burst(this.px, g + 0.1, 0, 7, 3.5, 0.4, 0.14, 0.8, 0.9, 1, 4); if (this.slideQueued) { this.slideT = 0.7; this.slideQueued = false; } }
        this.py = g; this.vy = 0; this.grounded = true;
      } else this.grounded = false;
      if (this.py < 0) { this.py = 0; this.vy = Math.max(0, this.vy); this.grounded = true; }
    }
    this.landSquash *= Math.exp(-dt * 9);
    // ---- powers countdown
    for (const k of POWER_KINDS) if (this.powers[k] > 0 && k !== 'shield') {
      this.powers[k] -= dt;
      if (this.powers[k] <= 0) this.endPower(k);
    }
    if (cool) this.spawnRailRam(scroll);
    // ---- world
    this.world.update(dt, scroll, this.t, this.dist);
    const ph = this.powers.magnet > 0;
    this.world.collect.update(dt, scroll, this.t, this.px, this.py, ph, 17, 0.75);
    this.processPickups();
    // ---- collisions
    if (running && this.bot) this.botStep();
    if (running || attract) this.checkObstacles(attract);
    // ---- progress / stats
    if (running) {
      this.runTime += dt;
      const mult = this.mult();
      this.score += scroll * mult * 0.5; this.stats.dist = this.dist - this.startDist; this.stats.noHitDist += scroll; this.stats.score = this.score;
      if (this.grounded && this.py > 1.5) this.stats.platformM += scroll / 20;
      this.streakT -= dt; if (this.streakT <= 0) this.streak = 0;
      this.missionTick(dt);
      if (this.mode === 'escape' && this.dist >= this.goalDist) this.reachGoal();
      this.tutorialTick();
    }
    // allocman taunts
    if (running) { this.chaseT -= dt; if (this.chaseT <= 0) { this.say(this.threat() > 0.65 ? 'near' : 'chase'); this.chaseT = 7 + Math.random() * 6; } }
    this.bubbleT = Math.max(0, this.bubbleT - dt);
    if (this.exprT > 0) { this.exprT -= dt; if (this.exprT <= 0) this.samExpr('earnest', 0); }
    // god-mode helper
    void this.god;
  }
  manualNoIntro = false; intro = false; introDone = false; camV = new THREE.Vector3();
  exprT = 0;
  /** Sam's reaction: updates the 3D rig and the Sam Cam, holds `hold` seconds then returns to earnest */
  samExpr(e: 'earnest' | 'smug' | 'shock' | 'frustrated' | 'glee', hold: number) {
    diag.log(`sam cam ${e}`);
    this.alloc.setExpression(e === 'earnest' ? 'neutral' : e === 'frustrated' ? 'worried' : e);
    (this.ui as unknown as { setSamExpr?: (x: string) => void }).setSamExpr?.(e);
    this.exprT = hold;
  }
  gbRun = 0; runTime = 0; challenge: { from: string; beat: number } | null = null;
  ap = 0; sub = false; mBase: Record<string, number> = {};
  bot = false;
  /** simple look-ahead autopilot for tests (?bot=1): dodges racks, jumps cables, slides under trays */
  botStep() {
    if (this.state !== 'run') return;
    const reach = 7 + this.speed * 0.55, px = this.px;
    const danger = [0, 0, 0] as number[]; // per lane: 1 blocked-by-wall, 2 jump, 3 slide
    let jump = false, slide = false;
    for (const c of this.world.chunks) {
      if (!c.active) continue;
      for (let i = 0; i < c.n; i++) {
        const s = c.st[i]!; if (s & ST_DEAD) continue;
        const k = c.kind[i]!;
        const z1 = c.bz1[i]! + c.zOff, z0 = c.bz0[i]! + c.zOff; // z1 is the near edge
        if (z0 > 0.6 || z1 < -reach) continue;
        const lane = LANE_X.findIndex((x) => x >= c.bx0[i]! - 0.2 && x <= c.bx1[i]! + 0.2);
        if (k === K_PLAT || k === K_LETTER) continue;
        if (k === K_DOOR && c.pc[i]! > 0.62) continue;
        if (k === K_DRONE) { if (z1 > -3.5 && z0 < 0.6) { slide = true; } continue; }
        if (lane < 0) { // dynamic box with moving x
          continue;
        }
        if (k === K_RACK || k === K_CART || k === K_DOOR) danger[lane] = 1;
        else if (k === K_CABLE) { if (danger[lane] === 0) danger[lane] = 2; if (-z1 < this.speed * 0.26 + 0.4 && lane === this.lane) jump = true; }
        else if (k === K_TRAY || k === K_LASER) { if (danger[lane] === 0) danger[lane] = 3; if (-z1 < this.speed * 0.2 + 1.0 && lane === this.lane) slide = true; }
      }
    }
    if (danger[this.lane] === 1) {
      const opts = [this.lane - 1, this.lane + 1].filter((l) => l >= 0 && l <= 2 && danger[l] !== 1);
      if (opts.length) { opts.sort((a, b) => danger[a]! - danger[b]!); this.moveLane(opts[0]! - this.lane); }
    }
    if (jump && this.grounded) this.jumpBuf = 0.1;
    if (slide && this.grounded && this.slideT <= 0) this.doSlide();
    void px;
  }

  mult(): number { return this.save.missionMult() * (this.powers.ddr > 0 ? 2 : 1); }
  threat(): number {
    const base = clamp(0.88 - this.stack * 0.22, 0, 0.88);
    return clamp(base + this.hitPulse * 0.25, 0, 1);
  }

  // ---- pickups
  private processPickups() {
    const c = this.world.collect;
    for (let g = 0; g < c.gotN; g++) {
      const k = c.gotKind[g]!, x = c.gotX[g]!, y = c.gotY[g]!, z = c.gotZ[g]!;
      if (k === C_RAM) {
        this.stats.ram++; this.ramThisRun++; this.streak++; this.streakT = 1.1; if (this.powers.cool > 0) this.stats.coolRam++;
        this.score += 10 * this.mult(); audio.sfx('collect', this.streak);
        this.fx.burst(x, y, z, 4, 2.2, 0.35, 0.09, 0.3, 1, 1);
        if (this.streak > 0 && (this.streak === 20 || this.streak % 50 === 0)) { this.samExpr('frustrated', 2.0); this.ui.popup(`x${this.streak} STREAK!`, 'combo', '#ffd23f'); }
        if (this.streak === 30 && Math.random() < 0.6) this.say('collect');
      } else if (k === C_GOLD) {
        this.stats.gold++; this.ramThisRun += 64; this.stats.ram += 64; this.score += 250 * this.mult(); audio.sfx('gold');
        this.samExpr('shock', 2.0);
        this.fx.burst(x, y, z, 26, 5, 0.8, 0.14, 1, 0.8, 0.2); this.ui.popup('64 GB KIT! +64', 'pickup', '#ffd23f');
      } else {
        const pk = POWER_KINDS[k - C_PU]!; this.stats.powerups++; this.stats[pk]++;
        this.activate(pk, this.save.duration(pk)); audio.sfx('powerup');
        this.ui.popup(({ ddr: 'DDR x2!', magnet: 'DMA MAGNET!', shield: 'ECC SHIELD!', cool: 'LIQUID COOLING!', oc: 'OVERCLOCK!' } as const)[pk], 'power', POWER_COLORS[pk]);
        this.ui.flash('power', POWER_COLORS[pk]);
        const [r, g2, b] = hexRGB(POWER_COLORS[pk]); this.fx.burst(x, y, z, 24, 5, 0.7, 0.16, r, g2, b);
        if (Math.random() < 0.3) this.say('powerup');
      }
    }
  }
  activate(k: PowerKind, dur: number) {
    diag.log(`power-up ${k} ${dur.toFixed(1)}s`);
    if (k === 'shield') { this.shield = true; this.kilo.setShield(true); audio.sfx('shield'); return; }
    const wasCool = this.powers.cool > 0;
    this.powers[k] = dur; this.powerTotal[k] = dur;
    if (k === 'oc') { this.kilo.setOverclock(true); audio.sfx('overclock'); this.gfx.chroma = 0.004; }
    if (k === 'cool') {
      audio.sfx('cool'); this.railY = Math.max(this.py, 0.5); this.rail.visible = true; this.railSpawn = 0;
      // pre-spawn a high route
      if (!wasCool) for (let z = -6; z > -62; z -= 2.1) this.spawnRailAt(z);
    }
    if (k === 'magnet') audio.sfx('magnet'); if (k === 'ddr') audio.sfx('ddr');
  }
  private endPower(k: PowerKind) {
    this.powers[k] = 0;
    if (k === 'oc') { this.kilo.setOverclock(false); this.invuln = Math.max(this.invuln, 0.8); }
    if (k === 'cool') { this.rail.visible = false; this.invuln = Math.max(this.invuln, 2.4); this.vy = 0; this.grounded = false; }
  }
  private railLane(d: number): number { return clamp(Math.round(1 + Math.sin(d / 17) * 1.2), 0, 2); }
  private spawnRailAt(z: number) {
    const d = this.dist - z;
    this.world.collect.spawn(C_RAM, LANE_X[this.railLane(d)]!, 4.45 + Math.sin(d * 0.9) * 0.15, z);
  }
  private spawnRailRam(scroll: number) {
    this.railSpawn += scroll;
    while (this.railSpawn > 2.1) { this.railSpawn -= 2.1; this.spawnRailAt(-62 + this.railSpawn); }
  }

  // ---- obstacles
  private checkObstacles(attract: boolean) {
    const w = this.world; const slide = this.slideT > 0;
    const hh = slide ? 0.55 : 1.15, x0 = this.px - 0.3, x1 = this.px + 0.3, y0 = this.py, y1 = this.py + hh, z0 = -0.35, z1 = 0.35;
    if (this.powers.cool > 0) { this.railPass(); return; }
    for (const c of w.chunks) {
      if (!c.active) continue;
      for (let i = 0; i < c.n; i++) {
        const s = c.st[i]!; if (s & ST_DEAD) continue;
        const k = c.kind[i]!;
        const lz0 = c.bz0[i]! + c.zOff, lz1 = c.bz1[i]! + c.zOff;
        if (lz1 < -0.5 || lz0 > 0.5) continue;
        if (k === K_LETTER && (s & 8)) continue;
        if (k === K_DOOR && c.pc[i]! >= 0.5) { this.nearEval(c, i, k, x0, x1, y0, y1, false); continue; }
        const hit = !(c.bx1[i]! <= x0 || c.bx0[i]! >= x1 || c.by1[i]! <= y0 || c.by0[i]! >= y1 || lz1 <= z0 || lz0 >= z1);
        if (hit && !attract) { this.onHit(c, i, k); }
        else if (!(s & ST_NEAR)) this.nearEval(c, i, k, x0, x1, y0, y1, hit);
      }
    }
  }
  private railPass() { /* invulnerable on rail */ }
  private nearEval(c: Chunk, i: number, k: number, x0: number, x1: number, y0: number, y1: number, hit: boolean) {
    if (c.st[i]! & ST_NEAR) return;
    if (!(c.bz1[i]! + c.zOff >= -0.35)) return;
    c.st[i]! |= ST_NEAR;
    if (hit || this.state === 'attract') return;
    const xo = !(c.bx1[i]! <= x0 || c.bx0[i]! >= x1);
    const hg = Math.max(0, Math.max(x0 - c.bx1[i]!, c.bx0[i]! - x1)), vg = Math.max(0, Math.max(y0 - c.by1[i]!, c.by0[i]! - y1));
    let close = false;
    if (k === K_CABLE) { if (xo && y0 >= c.by1[i]! - 0.05) { this.stats.cableJumps++; close = vg < 0.28; } }
    else if (k === K_TRAY || k === K_LASER) { if (xo && y1 <= c.by0[i]! + 0.02) { if (k === K_LASER) this.stats.limiterSlides++; else this.stats.limiterSlides++; close = vg < 0.25; } }
    else if (k === K_RACK || k === K_CART || k === K_DOOR) { if (!xo) close = hg < 0.28 && hg >= 0; if (k === K_CART && !xo) this.stats.carts++; }
    else if (k === K_DRONE) { this.stats.drones++; close = hg < 0.2 && vg < 0.2; }
    if (close && this.closeT <= 0) { this.alloc.grab(); this.samExpr('frustrated', 1.6); this.closeT = 0.9; this.stats.closeCalls++; this.ui.popup('CLOSE CALL!', 'close', '#ff4fa3'); this.ui.flash('close'); audio.sfx('closecall'); this.score += 50 * this.mult(); }
  }
  lastHit = '';
  private onHit(c: Chunk, i: number, k: number) {
    this.lastHit = `kind=${k} lane=${c.lane[i]} x=${c.bx0[i]!.toFixed(1)}..${c.bx1[i]!.toFixed(1)} y=${c.by0[i]!.toFixed(1)}..${c.by1[i]!.toFixed(1)} py=${this.py.toFixed(2)} px=${this.px.toFixed(2)} slide=${this.slideT.toFixed(2)} grounded=${this.grounded}`;
    if (this.god) { this.world.destroy(c, i); return; }
    const center = this.world.obstacleCenter(c, i, this.tmpV);
    if (k === K_PLAT) { this.lane = this.prevLane; return; }
    if (this.powers.oc > 0) { this.smash(c, i); return; }
    if (this.invuln > 0) return;
    if (this.shield) {
      this.shield = false; this.kilo.setShield(false); this.stats.shieldBlocks++; this.invuln = 1.1; audio.sfx('shieldbreak');
      this.fx.burst(this.px, 0.8, 0, 28, 6, 0.6, 0.15, 0.3, 1, 0.7); this.shake(0.5); this.gfx.chroma = 0.006; this.ui.popup('BLOCKED!', 'power', '#48f0a8'); this.world.destroy(c, i); return;
    }
    // damage
    this.stats.noHitDist = 0; this.hits++;
    this.world.destroy(c, i);
    void center;
    if (this.stack > 1) {
      const lose = 1; this.stack -= lose;
      for (let n = 0; n < lose; n++) this.fx.scatterStick(this.px + (Math.random() - 0.5) * 0.5, 0.9 + n * 0.1, 0.2);
      this.kilo.setStack(this.stack, STACK_MAX); this.kilo.flashHit();
      this.invuln = 1.5; this.hitSlow = 1; this.hitPulse = 1; this.streak = 0;
      audio.sfx('hit'); this.buzz(70); this.shake(0.9); this.gfx.chroma = 0.012; this.ui.flash('hit'); this.say('hit');
      this.fx.burst(this.px, 0.8, 0, 22, 6, 0.5, 0.14, 1, 0.6, 0.2, 8);
      this.alloc.setMad(0.8); this.samExpr('smug', 2.2);
    } else {
      this.stack = 0; this.kilo.setStack(0, STACK_MAX); this.ui.flash('hit');
      this.beginDying();
    }
  }
  private smash(c: Chunk, i: number) {
    this.world.destroy(c, i); this.stats.smashed++; audio.sfx('smash'); this.shake(0.35); this.gfx.chroma = 0.004;
    const ctr = this.world.obstacleCenter(c, i, this.tmpV);
    this.fx.burst(ctr.x, Math.min(ctr.y, 2.5), ctr.z, 22, 9, 0.9, 0.2, 1, 0.55, 0.15, 14);
    this.fx.burst(ctr.x, 1, ctr.z, 10, 5, 0.5, 0.1, 1, 0.95, 0.5);
    this.score += 40 * this.mult();
  }

  // ---- missions
  private missTimer = 0;
  private missionTick(dt: number) {
    this.missTimer -= dt; if (this.missTimer > 0) return; this.missTimer = 0.35;
    const d = this.save.data; let changed = false;
    for (let i = d.missions.length - 1; i >= 0; i--) {
      const m = d.missions[i]!; const def = MISSION_POOL.find((p) => p.id === m.id); if (!def) continue;
      const v = Math.floor(this.stats[def.stat] - (this.mBase[m.id] ?? 0));
      if (v > m.progress) m.progress = Math.min(m.target, v);
      if (m.progress >= m.target) {
        d.ram += m.reward; d.totalRam += m.reward; d.missionsDone++; this.completed.push(m.text);
        this.ui.toast(`MISSION COMPLETE: ${m.text}  +${m.reward} RAM  (score x${this.save.missionMult()})`, '#48f0a8'); audio.sfx('stagecomplete');
        d.missions.splice(i, 1); changed = true;
        const pool = MISSION_POOL.filter((p) => !d.missions.some((q) => q.id === p.id) && p.id !== m.id);
        const np = pool[Math.floor(Math.random() * pool.length)]!; const ns = newMissionState(np, d.missionsDone); d.missions.push(ns); this.mBase[ns.id] = this.stats[np.stat];
      }
    }
    if (changed) this.save.save();
  }
  private tutorialTick() {
    if (this.save.data.tutorialSeen || (this.mode === 'escape' && this.stage !== 1)) return;
    const d = this.dist - this.startDist; const touch = matchMedia('(pointer: coarse)').matches;
    const stg = d < 70 ? 0 : d < 160 ? 1 : d < 260 ? 2 : 3;
    if (stg !== this.hintStage) { this.hintStage = stg; this.ui.showHint(stg === 1 ? (touch ? 'Swipe UP to jump over cables' : 'Press ↑ / W to jump over cables') : stg === 2 ? (touch ? 'Swipe DOWN to slide under lasers' : 'Press ↓ / S to slide under lasers') : null); }
  }

  // ---- allocman speech
  say(kind: keyof typeof TAUNTS) { const arr = TAUNTS[kind]; if (!arr || !arr.length) return; this.bubbleText = rnd(arr); this.bubbleT = kind.startsWith('stage') ? 5 : 2.6; audio.sfx('taunt'); }

  shake(a: number) { this.shakeT = Math.max(this.shakeT, a); }

  // ---- stage flow
  private reachGoal() {
    if (this.state !== 'run') return;
    const d = this.save.data;
    this.bankRun();
    if (this.stage < 5) d.stageReached = Math.max(d.stageReached, this.stage + 1);
    this.save.save();
    if (this.stage === 5) { this.beginFinale(); return; }
    this.state = 'clear'; this.clearT = 0; this.ui.showStageClear(this.stage, { score: Math.floor(this.score), ram: this.ramThisRun }); audio.sfx('stagecomplete');
    this.ui.flash('stage', '#48f0a8'); this.ui.setBubble(null, 0, 0); this.ui.showHint(null);
  }
  private stepClear(dtReal: number) {
    this.clearT += dtReal;
    this.timeScale = Math.max(0.0, 1 - this.clearT * 0.7);
    if (this.clearT > 1.9) {
      this.ui.hideAll(); this.timeScale = 0;
      if (this.skipCut) { this.cutsceneDone(); return; }
      this.state = 'cutscene'; this.ui.showCutscene(this.stage - 1, rnd(TAUNTS[`stage${this.stage}` as 'stage1']));
    }
  }
  transition = false;
  cutsceneDone() {
    if ((this.state !== 'cutscene' && this.state !== 'clear') || this.transition) return;
    if (this.manual && this.params.get('veil') !== '1') { this.cutsceneDone0(); return; }
    this.transition = true;
    void (async () => {
      try {
        await loader.show(`Entering ${ZONES[Math.min(4, this.stage)]!.name}…`);
        await loader.step(0.4, 'Building the next zone');
        this.cutsceneDone0();
        await loader.step(0.85, 'Almost there');
        await loader.step(1);
      } finally { loader.hide(); this.transition = false; }
    })();
  }
  private cutsceneDone0() {
    this.timeScale = 1;
    this.stage++; this.goalDist = stageStart(this.stage);
    this.world.params.stage = this.stage - 1; this.world.params.goalDist = this.goalDist;
    this.world.setGate(this.goalDist, this.stage === 5 ? 'ROOFTOP EXIT' : `CHECKPOINT ${this.stage}`, this.stage === 5 ? 'exit' : 'door');
    this.hitPulse = 0;
    for (const m of this.save.data.missions) m.progress = Math.min(m.progress, m.target);
    this.state = 'run'; this.goDone = true; this.invuln = 1.2; this.speed = Math.max(this.speed, 8);
    this.ui.hideAll(); this.ui.showHud(true);
    this.ui.showStageBanner(this.stage, ZONES[this.stage - 1]!.name, STAGE_GOALS[this.stage - 1]!);
    this.runStartMissions = this.save.data.missionsDone;
  }

  // ---- death
  buzz(p: number | number[]) { try { navigator.vibrate?.(p); } catch { /* ignore */ } }
  private beginDying() {
    if (this.state === 'dying') return;
    this.buzz([90, 40, 180]);
    this.samExpr('glee', 99);
    this.state = 'dying'; this.dyingT = 0; audio.sfx('catch'); this.shake(1); this.gfx.chroma = 0.02;
    this.ui.setBubble(null, 0, 0); this.say('catch'); this.ui.showHint(null);
    for (const k of POWER_KINDS) this.powers[k] = 0;
    this.rail.visible = false; this.kilo.setShield(false); this.kilo.setOverclock(false); this.kilo.flashHit();
    this.dyStart = this.tmpV2.set(this.px, this.py, 0).clone();
  }
  dyStart = new THREE.Vector3();
  private stepDying(dtReal: number) {
    this.dyingT += dtReal;
    this.timeScale = this.dyingT < 0.4 ? 0.3 : 0.5;
    const dt = dtReal * this.timeScale; const t = this.dyingT;
    this.speed *= Math.exp(-dt * 2.5);
    this.world.update(dt, this.speed * dt, this.t += dt, this.dist += this.speed * dt);
    this.world.collect.update(dt, this.speed * dt, this.t, 999, 999, false, 0, 0);
    const p = clamp((t - 0.4) / 1.5, 0, 1);
    this.alloc.setCatch(p);
    // Kilo is dragged into the nozzle
    this.alloc.nozzleAnchor.getWorldPosition(this.tmpV);
    const e = smooth(clamp((t - 0.7) / 1.0, 0, 1));
    this.px = THREE.MathUtils.lerp(this.dyStart.x, this.tmpV.x, e); this.py = THREE.MathUtils.lerp(this.dyStart.y, this.tmpV.y, e);
    this.kilo.root.position.set(this.px, this.py, THREE.MathUtils.lerp(0, this.tmpV.z, e));
    this.kilo.root.scale.setScalar(KILO_SCALE * (1 - 0.85 * e));
    this.fx.target.copy(this.tmpV);
    if (t > 2.3) this.finishDeath();
  }
  private finishDeath() {
    this.state = 'over'; this.timeScale = 0;
    this.gbRun = this.ramThisRun;
    const res = this.bankRun();
    const r: RunResult = { mode: this.mode, stage: this.stage, score: Math.floor(this.score), ram: this.gbRun, dist: Math.floor(this.dist - this.startDist), newBest: res, completedMissions: this.completed.slice(), reason: 'caught', gb: this.gbRun, durationSec: Math.round(this.runTime), challenge: this.challenge };
    this.ui.showHud(false); this.ui.setBubble(null, 0, 0);
    this.save.data.tutorialSeen = true; this.save.save();
    audio.sfx('gameover'); audio.setMusic('menu', this.zoneIdx(), 0.2);
    this.ui.showGameOver(r, rnd(TAUNTS.catch));
  }
  /** bank run RAM and records; returns newBest */
  private bankRun(): boolean {
    const d = this.save.data; let nb = false;
    const gb = this.ramThisRun;
    d.ram += this.ramThisRun; d.totalRam += this.ramThisRun; this.ramThisRun = 0;
    if (this.mode === 'endless') { if (gb > d.bestEndless) { d.bestEndless = gb; nb = true; } d.bestEndlessDist = Math.max(d.bestEndlessDist, Math.floor(this.dist)); }
    this.save.save(); return nb;
  }

  // ---- finale
  private beginFinale() {
    this.state = 'finale'; this.finaleT = 0; this.ui.hideAll(); this.ui.showHud(false); this.ui.hideBanner(); this.ui.setBubble(null, 0, 0); this.ui.showHint(null);
    audio.setMusic('win', 4, 1); audio.sfx('win');
    this.finaleVy = 15;
  }
  finaleVy = 0;
  private buildFinale() {
    const g = new THREE.Group(); this.finaleG = g; this.gfx.scene.add(g);
    // distant town: boxes with lit windows + glowing PCs
    const winTex = (() => { const c = document.createElement('canvas'); c.width = 64; c.height = 128; const x = c.getContext('2d')!; x.fillStyle = '#1a1d33'; x.fillRect(0, 0, 64, 128); for (let j = 0; j < 8; j++) for (let i = 0; i < 4; i++) { x.fillStyle = Math.random() < 0.55 ? '#ffd88a' : '#2a2f55'; x.fillRect(6 + i * 14, 8 + j * 15, 9, 9); } const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
    const bm = new THREE.MeshStandardMaterial({ map: winTex, emissiveMap: winTex, emissive: new THREE.Color(1.2, 1.1, 0.9), roughness: 0.8 });
    const bg = new THREE.BoxGeometry(1, 1, 1);
    const inst = new THREE.InstancedMesh(bg, bm, 90);
    const m4 = new THREE.Matrix4(), rs = (a: number) => (Math.sin(a * 91.7) * 43758.5453) % 1;
    for (let i = 0; i < 90; i++) { const a = Math.abs(rs(i)), b = Math.abs(rs(i + 100)), c = Math.abs(rs(i + 200)); const w = 4 + a * 6, h = 4 + b * 14, x = (i % 10 - 4.5) * 14 + c * 4, z = (Math.floor(i / 10) - 4.5) * 14 - 20 + a * 4; m4.compose(new THREE.Vector3(x, -62 + h / 2, z), new THREE.Quaternion(), new THREE.Vector3(w, h, w)); inst.setMatrixAt(i, m4); }
    g.add(inst);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x1a2a3a, roughness: 0.9 })); ground.position.y = -62; g.add(ground);
    // parachute: canopy of coloured gores + lines
    const ch = new THREE.Group(); this.chute = ch;
    const cols = [0x1fb86a, 0xffd45a, 0x35d6ff, 0xff4fa3];
    for (let i = 0; i < 8; i++) {
      const gore = new THREE.Mesh(new THREE.SphereGeometry(2.4, 8, 10, (i / 8) * Math.PI * 2, Math.PI / 4, 0, Math.PI / 2.2), new THREE.MeshStandardMaterial({ color: cols[i % 4], roughness: 0.5, side: THREE.DoubleSide, emissive: cols[i % 4], emissiveIntensity: 0.25 }));
      gore.scale.y = 0.62; gore.position.y = 3.2; ch.add(gore);
    }
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; const l = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 3.3, 4), new THREE.MeshBasicMaterial({ color: 0xffffff })); l.position.set(Math.cos(a) * 1.0, 1.7, Math.sin(a) * 1.0); l.rotation.set(Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3); ch.add(l); }
    this.kilo.root.add(ch); ch.visible = false;
    ch.position.set(0, 0.9, 0);
  }
  private stepFinale(dt: number) {
    if (!this.finaleG) this.buildFinale();
    this.finaleT += dt; const t = this.finaleT;
    this.t += dt;
    // phase A (0..1.4): run off the edge and launch; B: parachute drift
    if (t < 1.4) {
      this.speed += (this.speed < 30 ? 30 - this.speed : 0) * Math.min(1, dt * 3);
      const scroll = this.speed * dt; this.dist += scroll;
      this.world.update(dt, scroll, this.t, this.dist);
      this.kilo.pose(dt, { state: 'jump', speed: this.speed, t: this.t, lean: 0, vy: 5, landSquash: 0 });
      this.py += this.finaleVy * dt; this.finaleVy -= 12 * dt; this.world.collect.update(dt, scroll, this.t, 999, 999, false, 0, 0);
      if (t > 1.0) { this.world.setVisible(false); }
    } else {
      if (this.world.chunks[0]!.group.visible) this.world.setVisible(false);
      if (!this.finaleStarted) { this.finaleStarted = true; this.ui.showFinale(PRICE_TICKER); this.chute!.visible = true; this.gfx.skyAmt = 1; this.py = 0; this.finaleY0 = 0; for (let i = 0; i < 40; i++) this.fx.burst(0, 0, 0, 1, 1, 0.1, 0.1, 1, 1, 1); this.fx.clear(); this.alloc.root.visible = false; }
      const tt = t - 1.4; const y = -tt * 3.8;
      this.py = y; this.px = Math.sin(tt * 0.5) * 1.2;
      this.kilo.pose(dt, { state: 'parachute', speed: 0, t: this.t, lean: Math.sin(tt * 0.8) * 0.4, vy: -3, landSquash: 0 });
      this.chute!.rotation.z = Math.sin(tt * 0.7) * 0.06;
      if (this.py < -38) { this.py = -38; }
      // RAM rain
      if (Math.random() < 0.35) this.fx.rain((Math.random() - 0.5) * 18, this.py + 12 + Math.random() * 5, -Math.random() * 12 + 2);
      if (Math.random() < 0.9) for (let i = 0; i < 4; i++) this.fx.emit((Math.random() - 0.5) * 30, y + 14 + Math.random() * 6, -Math.random() * 20 + 4, 0, -9 - Math.random() * 6, 0, 3.2, 0.25 + Math.random() * 0.2, 0.2, 1, 0.9);
      if (Math.random() < 0.15) this.fx.emit((Math.random() - 0.5) * 24, y + 12, -Math.random() * 14, 0, -12, 0, 3, 0.55, 1, 0.8, 0.2);
    }
    this.kilo.root.position.set(this.px, this.py, 0);
    this.kilo.root.rotation.y = 0;
    // camera
    const cy = this.py + 3.6, cx = this.finaleT > 1.4 ? Math.sin((t - 1.4) * 0.4) * 4.5 : 0, cz = t < 1.4 ? 8 : 10.5;
    this.camX += (cx - this.camX) * Math.min(1, dt * 3); this.camY += (cy - this.camY) * Math.min(1, dt * 4);
    this.gfx.camera.position.set(this.camX, this.camY, cz); this.gfx.camera.lookAt(this.px * 0.5, this.py + (t < 1.4 ? 0.4 : 2.2), -2);
    this.gfx.camera.fov = 58; this.gfx.camera.updateProjectionMatrix();
    this.gfx.applyZone(4, 4, 0); this.gfx.update(dt, 0, 4);
    this.gfx.speedFx = 0;
    this.fx.update(dt, 0);
    this.shadowBlob.visible = false;
    const cp = this.gfx.camera.position; this.key_follow(cp);
    if (t > 1.4 && this.finaleG) this.finaleG.position.y = 0;
    audio.setThreat(0);
  }
  finaleStarted = false; finaleY0 = 0;
  private key_follow(_cp: THREE.Vector3) { /* key light static */ }
  finaleDone() {
    if (this.state !== 'finale') return;
    this.save.data.escapeDone = true; this.save.data.stageReached = 5; this.save.data.bestEscape = Math.max(this.save.data.bestEscape, Math.floor(this.score)); this.save.save();
    this.ui.hideFinale(); this.finaleCleanup(); this.toMenu();
  }
  private finaleCleanup() {
    const free = (root: THREE.Object3D) => root.traverse((o) => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); const ms = Array.isArray(m.material) ? m.material : m.material ? [m.material] : []; for (const mt of ms) { (mt as THREE.MeshStandardMaterial).map?.dispose(); mt.dispose(); } });
    if (this.finaleG) { free(this.finaleG); this.gfx.scene.remove(this.finaleG); this.finaleG = null; }
    if (this.chute) { free(this.chute); this.chute.removeFromParent(); this.chute = null; }
    this.finaleStarted = false; this.shadowBlob.visible = true; this.kilo.root.rotation.set(0, 0, 0); this.goDone = false;
    this.alloc.root.visible = true;
  }

  // ------------------------------------------------------------ visuals
  private renderOnly(dt: number) {
    // keep animating the scene idle (paused/cutscene/gameover)
    this.updateVisuals(0, dt, true);
  }

  private zoneBlend(): [number, number, number] {
    const d = this.dist, out = this.lastZoneBlend;
    if (this.mode === 'escape') {
      for (let k = 1; k <= 4; k++) { const b = stageStart(k); if (d > b - 150 && d < b + 70) { out[0] = k - 1; out[1] = k; out[2] = smooth((d - (b - 150)) / 220); return out; } }
      const z = this.world.zoneAt(d); out[0] = z; out[1] = z; out[2] = 0; return out;
    }
    const k = Math.round(d / ENDLESS_ZONE_LEN);
    const b = k * ENDLESS_ZONE_LEN;
    if (k >= 1 && Math.abs(d - b) < 110) { out[0] = (k - 1) % 5; out[1] = k % 5; out[2] = smooth((d - (b - 110)) / 220); return out; }
    const z = this.world.zoneAt(d); out[0] = z; out[1] = z; out[2] = 0; return out;
  }

  private updateVisuals(dt: number, dtReal: number, frozen = false) {
    const g = this.gfx; const st: State = this.state as State; const attract = st === 'attract';
    const zb = this.zoneBlend(); g.applyZone(zb[0], zb[1], zb[2]);
    const zoneNow = zb[2] > 0.5 ? zb[1] : zb[0];
    const sp = this.speed;
    const norm = clamp((sp - 12) / 20, 0, 1);
    g.speedFx += (clamp((sp - 19) / 12, 0, 1) * (this.powers.oc > 0 ? 1.4 : 1) * (st === 'run' ? 1 : attract ? 0.3 : 0) - g.speedFx) * Math.min(1, dtReal * 3);
    g.update(dtReal, frozen ? 0 : sp * dt, ZONES[zoneNow]!.moteMode);
    // kilo
    const k = this.kilo;
    if (st !== 'dying' && st !== 'finale' && st !== 'over') {
      k.root.position.set(this.px, this.py, 0);
      let ks: KiloState = 'run';
      if (this.powers.cool > 0) ks = 'ride'; else if (!this.grounded) ks = 'jump'; else if (this.slideT > 0) ks = 'slide'; else if (st === 'countdown' || st === 'cutscene') ks = 'idle'; else if (st === 'clear') ks = 'celebrate';
      if (this.invuln > 0.9 && this.hitSlow > 0.5 && this.grounded && ks === 'run') ks = 'stumble';
      k.root.visible = !this.intro && !(this.invuln > 0 && st === 'run' && this.powers.oc <= 0 && this.invuln % 0.2 < 0.1);
      const lean = clamp((LANE_X[this.lane]! - this.px) / 1.6 + this.leanV * 0.3, -1, 1);
      k.pose(dtReal * (frozen ? 0 : 1), { state: ks, speed: sp, t: this.t, lean, vy: this.vy, landSquash: this.landSquash });
      // dust / slide sparks
      if (st === 'run' && this.grounded && !frozen) {
        this.tipT -= dt;
        if (this.tipT <= 0) { this.tipT = this.slideT > 0 ? 0.02 : 0.07; const z = ZONES[zoneNow]!; const sl = this.slideT > 0; const led = z.led[0]!; const r = sl ? 1 : (led >> 16 & 255) / 255, gg = sl ? 0.7 : (led >> 8 & 255) / 255, b = sl ? 0.2 : (led & 255) / 255;
          this.fx.emit(this.px + (Math.random() - 0.5) * 0.3, this.py + 0.05, 0.1, (Math.random() - 0.5) * 1.4, 0.7 + Math.random(), 2 + Math.random() * 2, this.slideT > 0 ? 0.4 : 0.3, this.slideT > 0 ? 0.08 : 0.1, r, gg, b, this.slideT > 0 ? 8 : 0); }
      }
      if (this.powers.oc > 0 && st === 'run') this.fx.emit(this.px + (Math.random() - 0.5) * 0.5, this.py + 0.6 + Math.random() * 0.5, 0.4, 0, 0.3, 6, 0.4, 0.2, 1, 0.5, 0.1);
    }
    this.shadowBlob.position.set(this.px, 0.045, 0); this.shadowBlob.visible = st !== 'finale' && this.gfx.q.shadows === 0 && this.py < 2.5;
    const bs = clamp(1 - this.py * 0.2, 0.3, 1); this.shadowBlob.scale.setScalar(bs * 1.3);
    // rail
    if (this.rail.visible) { this.rail.position.set(this.px, this.railY - 0.3, -30); this.railTex.offset.y -= dtReal * sp * 0.05; }
    // allocman
    const thr = this.threat();
    if (st !== 'finale') {
      const a = this.alloc;
      const gapT = attract ? 6.0 : this.tune.gap + (1 - thr) * 1.6;
      this.gap += (gapT - this.gap) * Math.min(1, dtReal * 2.5);
      if (st !== 'dying' && st !== 'over') { this.ax += (this.px - this.ax) * Math.min(1, dtReal * 2.6); a.root.position.set(this.ax * 0.8, 0, this.gap); }
      else { a.root.position.set(this.ax, 0, THREE.MathUtils.lerp(this.gap, 2.5, clamp(this.dyingT / 1.2, 0, 1))); }
      const talking = this.bubbleT > 0;
      const frontCam = this.intro || st === 'dying' || st === 'over'; // camera is in FRONT of Sam: he already faces it, don't twist away
      this.face += ((frontCam ? 0 : (talking || attract ? 1 : 0)) * (attract ? 0.85 : 1) - this.face) * Math.min(1, dtReal * 4);
      a.update(dtReal, { t: this.t, speed: sp, threat: thr, talking, faceCamera: this.face, grow: 1 + Math.min(0.3, this.hits * 0.04) });
      a.setMad(Math.max(thr * 0.7, 0));
      this.fx.target.copy(a.nozzleAnchor.getWorldPosition(this.tmpV3));
      this.fx.update(dt, frozen ? 0 : sp * dt);
      audio.setThreat(st === 'run' ? thr : 0);
      // bubble
      if (st === 'run' || st === 'clear') {
        if (talking) { a.headAnchor.getWorldPosition(this.tmpV2); this.tmpV2.project(g.camera); const behind = this.tmpV2.z > 1; const x = (this.tmpV2.x * 0.5 + 0.5) * window.innerWidth, y = behind ? window.innerHeight * 0.8 : (-this.tmpV2.y * 0.5 + 0.5) * window.innerHeight; this.ui.setBubble(this.bubbleText, x, y); }
        else this.ui.setBubble(null, 0, 0);
      }
    }
    // camera
    this.updateCamera(dtReal, attract);
    // shake decays
    this.shakeT = Math.max(0, this.shakeT - dtReal * 1.8);
    // hud + audio
    if (st === 'run' || st === 'countdown' || st === 'clear' || st === 'dying') this.updateHud();
    if (st === 'run' || attract) { audio.setMusic(attract ? 'menu' : 'run', zoneNow, attract ? 0.3 : norm); }
    this.hintClear();
    this.closeT -= dtReal;
  }
  gap = 7; ax = 0; face = 0;
  private hintClear() { if (this.state === 'run' && !this.save.data.tutorialSeen && this.dist - this.startDist > 330 && this.hintStage !== 9) { this.hintStage = 9; this.ui.showHint(null); this.save.data.tutorialSeen = true; this.save.save(); } }

  private updateCamera(dt: number, attract: boolean) {
    const cam = this.gfx.camera; const asp = this.gfx.w / this.gfx.h; const portrait = asp < 0.85;
    const cool = this.powers.cool > 0;
    let tx: number, ty: number, tz: number, lx: number, ly: number, lz: number, fov: number;
    if (attract) {
      const a = this.t * 0.22; tx = (portrait ? 1.2 : 4.6) + Math.sin(a) * 1.2; ty = 3.4 + Math.sin(a * 0.7) * 0.4; tz = portrait ? 15 : 10.2; lx = portrait ? 0.6 : -6.5; ly = portrait ? 3.6 : 1.7; lz = 1.5; fov = portrait ? 66 : 54;
    } else {
      const back = portrait ? this.tune.back * 1.3 : this.tune.back, up = portrait ? this.tune.up * 1.3 : this.tune.up;
      tx = this.px * 0.55; ty = Math.min(up + (cool ? 1.6 : 0) + this.py * 0.5, this.gfx.skyAmt < 0.5 ? 5.7 : 9); tz = back;
      lx = this.px * 0.32; ly = this.tune.ly + this.py * 0.5 + (cool ? 0.6 : 0); lz = this.tune.lz;
      fov = (portrait ? 70 : 62) + this.gfx.speedFx * 6;
    }
    let forced = false;
    if (this.intro || ((this.state === 'dying' || this.state === 'over') && this.dyingT > 0.4)) {
      const hp = this.alloc.headAnchor.getWorldPosition(this.camV);
      if (this.intro) { tx = hp.x + 0.7; ty = hp.y - 0.5; tz = hp.z - 3.6; lx = hp.x; ly = hp.y - 0.9; lz = hp.z; fov = 44; forced = true; }
      else {
        const k = smooth((this.dyingT - 0.4) / 0.9), L = THREE.MathUtils.lerp;
        tx = L(tx, hp.x - 1.7, k); ty = L(ty, hp.y - 0.1, k); tz = L(tz, hp.z - 2.4, k); lx = L(lx, hp.x, k); ly = L(ly, hp.y - 0.6, k); lz = L(lz, hp.z, k); fov = L(fov, 42, k);
        if (k > 0.95) forced = true;
      }
    }
    if (forced) { this.camX = tx; this.camY = ty; this.camZ = tz; cam.fov = fov; cam.updateProjectionMatrix(); }
    const f = 1 - Math.exp(-dt * (attract ? 2 : forced ? 30 : 9));
    if (dt === 0) { /* frozen: keep */ } else { this.camX += (tx - this.camX) * f; this.camY += (ty - this.camY) * f; this.camZ += (tz - this.camZ) * f; }
    let sx = 0, sy = 0, roll = 0;
    if (this.shakeT > 0 && this.save.data.settings.shake) { const a = this.shakeT * this.shakeT * 0.35, tt = this.t * 55; sx = Math.sin(tt * 1.3) * a; sy = Math.cos(tt * 1.7) * a; roll = Math.sin(tt) * a * 0.04; }
    cam.position.set(this.camX + sx, this.camY + sy, this.camZ);
    cam.lookAt(lx, ly, lz); cam.rotation.z += roll + (cool ? 0 : -this.leanV * 0.01);
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov += (fov - cam.fov) * Math.min(1, dt * 4 + 0.001); cam.updateProjectionMatrix(); }
  }

  private updateHud() {
    const h = this.hud;
    h.score = this.ramThisRun; h.ram = this.ramThisRun + this.save.data.ram; h.multiplier = this.mult(); h.ddr = this.powers.ddr > 0;
    h.stack = this.stack; h.stackMax = STACK_MAX; h.stage = this.mode === 'escape' ? this.stage : 0; h.mode = this.mode;
    h.dist = this.mode === 'escape' ? Math.max(0, this.dist - stageStart(this.stage - 1)) : this.dist; h.goal = this.mode === 'escape' ? STAGE_GOALS[this.stage - 1]! : 0;
    h.zoneName = ZONES[this.zoneIdx()]!.name; h.shield = this.shield; h.speed = this.speed; h.threat = clamp((this.threat() - 0.45) * 1.8, 0, 1); h.fps = this.fpsVal;
    h.powers.length = 0;
    for (let i = 0; i < POWER_KINDS.length; i++) { const k = POWER_KINDS[i]!; if (k === 'shield') continue; if (this.powers[k] > 0) { const p = this.hudPowers[i]!; p.left = this.powers[k]; p.total = this.powerTotal[k]; h.powers.push(p); } }
    this.ui.updateHud(h);
  }

  // ------------------------------------------------------------ test hooks / sim
  /** test hook: advance simulation then render exactly one frame */
  advance(seconds: number, hz = 30) { this.simulate(seconds, hz); this.step(0.0001); this.gfx.render(); }
  /** run N simulated seconds without rendering (tests) */
  simulate(seconds: number, hz = 30) { const n = Math.round(seconds * hz); for (let i = 0; i < n; i++) this.step(1 / hz); }
  skipCutsceneUi() { if (this.state === 'cutscene') { this.ui.hideAll(); this.cutsceneDone(); } }
  teleport(d: number) { this.dist = d; this.world.reset({ ...this.world.params, startDist: d }); }
}
function hexRGBn(n: number): [number, number, number] { return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; }
function makeStripe(): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = 32; c.height = 128; const x = c.getContext('2d')!;
  x.fillStyle = '#2a7ca8'; x.fillRect(0, 0, 32, 128); x.fillStyle = '#bff3ff'; for (let i = 0; i < 6; i++) x.fillRect(0, i * 22 + 4, 32, 6); x.fillStyle = '#ffffff'; x.fillRect(12, 0, 4, 128);
  return c;
}
function world_hook(game: Game) {
  game.world.onSpawnKind = (k) => { if (!game.seenKinds.has(k)) { game.seenKinds.add(k); diag.log(`first spawn of obstacle kind ${k} at d=${game.dist.toFixed(1)}`); } };
  game.world.onSpawnEffect = (kind, x, y, z) => {
    if (kind === 'letter') { game.stats.letters++; game.fx.burst(x, y, z, 14, 3, 0.6, 0.12, 1, 1, 0.9); audio.sfx('letter'); if (game.closeT < 0.2) game.ui.popup('NON-BINDING!', 'pickup', '#ffffff'); }
  };
}
export { KILO_LINES, GAMEOVER_TITLES, CUTSCENES };
