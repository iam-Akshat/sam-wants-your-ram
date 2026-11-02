import * as THREE from 'three';
import { Assets } from './assets';
import { Collectibles, C_RAM, C_GOLD, C_PU } from './collect';
import { BEAT_LEN, BEATS, CEIL_Y, CHUNK_LEN, ENDLESS_ZONE_LEN, LANE_X, LW, STAGE_GOALS, WALL_X, ZONES, stageStart } from './zones';
import { signTexture, boardTexture, paintBoard } from './textures';

// ---- obstacle kinds
export const K_RACK = 0, K_CABLE = 1, K_TRAY = 2, K_LASER = 3, K_CART = 4, K_DOOR = 5, K_DRONE = 6, K_LETTER = 7, K_PLAT = 8;
export const ST_DEAD = 1, ST_PASSED = 2, ST_NEAR = 4, ST_DISSOLVE = 8, ST_ARMED = 16;
const MAX_OBS = 44, MAX_SURF = 8;
const PLAT_H = 2.2;
const SIGNS: { lines: string[]; bg: string; fg: string; accent: string; w: number }[] = [
  { lines: ['RAM-as-a-Service', '$19.99/mo'], bg: '#101a3a', fg: '#ffffff', accent: '#ffd23f', w: 4.4 },
  { lines: ['WARNING:', '5% UTILIZATION DETECTED'], bg: '#2a0d0d', fg: '#ffd23f', accent: '#ff3b30', w: 4.4 },
  { lines: ['MAXIMUM UTILIZATION'], bg: '#0b2a1c', fg: '#48f0a8', accent: '#ffffff', w: 4.4 },
  { lines: ["Reportedly: up to 40% of", "the world's DRAM wafers"], bg: '#1a1038', fg: '#ffffff', accent: '#ff4fa3', w: 5.4 },
  { lines: ['YOUR RAM IS IDLE.', 'JUST RENT IT.'], bg: '#08283a', fg: '#46c8ff', accent: '#ffffff', w: 4.4 },
  { lines: ['LETTERS OF INTENT', '(non-binding)'], bg: '#f3ecd6', fg: '#1a2b6b', accent: '#c0392b', w: 4.4 },
];
const CAST = ['rack', 'cable', 'tray', 'laser', 'ramp', 'platBody'];

const M4 = new THREE.Matrix4(), Q4 = new THREE.Quaternion(), P3 = new THREE.Vector3(), S3 = new THREE.Vector3(), E3 = new THREE.Euler();
const ZERO_M = new THREE.Matrix4().makeScale(0, 0, 0);

export interface GenParams { mode: 'escape' | 'endless'; stage: number; startDist: number; goalDist: number; seed: number; quiet?: boolean; }
export function mulberry(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

class Layer {
  mesh: THREE.InstancedMesh; mirror: THREE.InstancedMesh | null = null; n = 0; cap: number;
  constructor(geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], cap: number, parent: THREE.Group, mirrorParent: THREE.Group | null, cast = false, colored = false) {
    this.cap = cap;
    this.mesh = new THREE.InstancedMesh(geo, mat, cap);
    this.mesh.castShadow = cast; this.mesh.receiveShadow = false;
    this.mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 3, -CHUNK_LEN / 2), CHUNK_LEN * 0.8);
    this.mesh.count = 0;
    if (colored) this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    parent.add(this.mesh);
    if (mirrorParent) {
      this.mirror = new THREE.InstancedMesh(geo, mat, cap);
      this.mirror.instanceMatrix = this.mesh.instanceMatrix;
      if (colored) this.mirror.instanceColor = this.mesh.instanceColor;
      this.mirror.boundingSphere = this.mesh.boundingSphere;
      this.mirror.count = 0; mirrorParent.add(this.mirror);
    }
  }
  setMat(m: THREE.Material | THREE.Material[]) { this.mesh.material = m; if (this.mirror) this.mirror.material = m; }
  reset() { this.n = 0; }
  add(x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, ry = 0, rx = 0): number {
    if (this.n >= this.cap) return -1;
    E3.set(rx, ry, 0); Q4.setFromEuler(E3); P3.set(x, y, z); S3.set(sx, sy, sz); M4.compose(P3, Q4, S3);
    this.mesh.setMatrixAt(this.n, M4); return this.n++;
  }
  addC(x: number, y: number, z: number, sx: number, sy: number, sz: number, col: THREE.Color): number {
    const i = this.add(x, y, z, sx, sy, sz); if (i >= 0) this.mesh.setColorAt(i, col); return i;
  }
  kill(i: number) { this.mesh.setMatrixAt(i, ZERO_M); this.mesh.instanceMatrix.needsUpdate = true; }
  finish() { this.mesh.count = this.n; if (this.mirror) this.mirror.count = this.n; this.mesh.instanceMatrix.needsUpdate = true; if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true; }
}

export class Chunk {
  group = new THREE.Group(); mirrorGroup = new THREE.Group();
  zOff = 0; trackStart = 0; zone = 0; active = false;
  L: Record<string, Layer> = {};
  // obstacle store
  n = 0;
  kind = new Uint8Array(MAX_OBS); st = new Uint8Array(MAX_OBS); lane = new Int8Array(MAX_OBS);
  bx0 = new Float32Array(MAX_OBS); bx1 = new Float32Array(MAX_OBS); by0 = new Float32Array(MAX_OBS); by1 = new Float32Array(MAX_OBS); bz0 = new Float32Array(MAX_OBS); bz1 = new Float32Array(MAX_OBS);
  pa = new Float32Array(MAX_OBS); pb = new Float32Array(MAX_OBS); pc = new Float32Array(MAX_OBS); // params
  lz = new Float32Array(MAX_OBS); // anchor z (dynamic)
  layer = new Int8Array(MAX_OBS).fill(-1); inst = new Int16Array(MAX_OBS);
  obj: (THREE.Object3D | null)[] = new Array(MAX_OBS).fill(null);
  // surfaces
  ns = 0; sk = new Uint8Array(MAX_SURF); sx0 = new Float32Array(MAX_SURF); sx1 = new Float32Array(MAX_SURF); sz0 = new Float32Array(MAX_SURF); sz1 = new Float32Array(MAX_SURF); sh = new Float32Array(MAX_SURF);
  fans: THREE.Group[] = [];
  signs: THREE.Mesh[] = [];
  floor: THREE.Mesh;
  layerList: Layer[] = [];
  constructor(a: Assets, mirror: boolean, mirrorObst: boolean, floorGeo: THREE.BufferGeometry) {
    const g = this.group, mg = mirror ? this.mirrorGroup : null, mo = mirrorObst ? this.mirrorGroup : null;
    this.mirrorGroup.scale.y = -1;
    const mk = (name: string, geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], cap: number, m: THREE.Group | null, cast = false, colored = false) => { const l = new Layer(geo, mat, cap, g, m, cast, colored); this.L[name] = l; this.layerList.push(l); };
    mk('wall', a.gWallRack, a.wallMat[0]!, 110, mg);
    mk('glow', a.gUnit, a.mGlow, 26, mg, false, true);
    mk('pipe', a.gPipe, a.pipeMat[0]!, 8, mg);
    mk('tank', a.gTank, a.tankMat[0]!, 24, mg);
    mk('post', a.gPost, a.mMetal, 40, mg);
    mk('rail', a.gRail, a.mMetal, 6, mg);
    mk('bg', a.gWallRack, a.wallMat[0]!, 30, null);
    mk('rack', a.gRack, [a.mObsRack, a.mHazard, a.mRedGlow], 24, mo, true);
    mk('cable', a.gCable, [a.mCable, a.mHazard], 24, mo, true);
    mk('tray', a.gTrayObs, [a.mCable, a.mMetal], 16, mo, true);
    mk('laser', a.gLaser, [a.mMetal, a.mRedGlow, a.mLaserPanel], 16, mo, true);
    mk('ramp', a.gWedge, a.mRamp, 4, mo, true);
    mk('platBody', a.gPlatBody, a.mPlat[0]!, 3, mo, true);
    mk('platTop', a.gPlatTop, a.mPlatTop, 3, mo, false);
    this.floor = new THREE.Mesh(floorGeo, a.floorMat[0]!);
    this.floor.receiveShadow = true; this.floor.frustumCulled = false;
    g.add(this.floor);
  }
}

class Pool<T extends THREE.Object3D> {
  free: T[] = [];
  constructor(public make: () => T, n: number) { for (let i = 0; i < n; i++) this.free.push(make()); }
  get(): T | null { return this.free.pop() ?? null; }
  put(o: T) { this.free.push(o); }
}

export interface Hit { chunk: Chunk | null; idx: number; }

export class World {
  assets: Assets; root = new THREE.Group();
  chunks: Chunk[] = [];
  collect: Collectibles;
  rand = mulberry(1);
  params: GenParams = { mode: 'endless', stage: 0, startDist: 0, goalDist: 0, seed: 1 };
  // generator state
  safe = 1; prevAll = false; platLane = -1; nextPower = 0; nextGold = 0; lastRackLane = -1; powerCount = 0;
  hist = [1, 1, 1, 1];
  noObstacleUntil = 0;
  signPool!: Pool<THREE.Mesh>; signMats: THREE.MeshBasicMaterial[] = []; tickerCtx!: CanvasRenderingContext2D; tickerTex!: THREE.CanvasTexture; tickerT = 0; tickerV = 412;
  carts: Pool<THREE.Group>; drones: Pool<THREE.Group>; doors: Pool<THREE.Group>; letters: Pool<THREE.Mesh>; fanPool: Pool<THREE.Group>;
  time = 0;
  hit: Hit = { chunk: null, idx: -1 };
  gate: THREE.Group; gateDist = 0; gateKind: 'door' | 'exit' = 'door'; gateOpen = 0; gateLeft!: THREE.Mesh; gateRight!: THREE.Mesh; gateSign!: THREE.Mesh; gateLights: THREE.Mesh[] = [];
  mirrorRoot = new THREE.Group();
  quality = { mirror: true, mirrorObst: true, chunks: 7 };
  floorGeo: THREE.BufferGeometry; tcL = new THREE.Color(); tcS = new THREE.Color();
  gateSigns: Record<string, THREE.CanvasTexture> = {};
  onSpawnKind: ((k: number) => void) | null = null;
  onSpawnEffect: ((kind: string, x: number, y: number, z: number) => void) | null = null;

  constructor(assets: Assets, q: { mirror: boolean; mirrorObst: boolean; chunks: number }) {
    this.assets = assets; this.quality = q;
    this.collect = new Collectibles(assets);
    this.root.add(this.collect.group); this.root.add(this.mirrorRoot);
    this.floorGeo = new THREE.PlaneGeometry(13.2, CHUNK_LEN, 1, 1);
    this.floorGeo.rotateX(-Math.PI / 2); this.floorGeo.translate(0, 0, -CHUNK_LEN / 2);
    const uv = this.floorGeo.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 6, uv.getY(i) * (CHUNK_LEN / LW));
    for (let i = 0; i < q.chunks; i++) {
      const c = new Chunk(assets, q.mirror, q.mirrorObst, this.floorGeo);
      this.chunks.push(c); this.root.add(c.group); this.mirrorRoot.add(c.mirrorGroup);
    }
    this.carts = new Pool(() => { const g = new THREE.Group(); const m = new THREE.Mesh(assets.gCart, assets.cartMats); m.castShadow = true; g.add(m); g.visible = false; this.root.add(g); return g; }, 6);
    this.drones = new Pool(() => this.makeDrone(), 4);
    this.doors = new Pool(() => this.makeDoor(), 6);
    this.letters = new Pool(() => this.makeLetter(), 8);
    this.fanPool = new Pool(() => this.makeFan(), q.chunks * 4);
    for (const d of SIGNS) this.signMats.push(new THREE.MeshBasicMaterial({ map: boardTexture(d.lines, d.bg, d.fg, d.accent), color: new THREE.Color(1.25, 1.25, 1.25) }));
    const tc = document.createElement('canvas'); tc.width = 1024; tc.height = 256; this.tickerCtx = tc.getContext('2d', { willReadFrequently: true })!; this.tickerTex = new THREE.CanvasTexture(tc); this.tickerTex.colorSpace = THREE.SRGBColorSpace;
    this.signMats.push(new THREE.MeshBasicMaterial({ map: this.tickerTex, color: new THREE.Color(1.25, 1.25, 1.25) })); this.drawTicker(0);
    const sg = new THREE.PlaneGeometry(1, 0.25);
    this.signPool = new Pool(() => { const m = new THREE.Mesh(sg, this.signMats[0]!); m.visible = false; this.root.add(m); return m; }, q.chunks * 2 + 2);
    this.gate = this.makeGate();
    this.root.add(this.gate);
  }

  // ---------- dynamic object builders
  private makeDrone(): THREE.Group {
    const a = this.assets, g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), a.mMetal); body.scale.set(1, 0.6, 1); body.castShadow = true; g.add(body);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.06, 8, 20), a.mDark); ring.rotation.x = Math.PI / 2; g.add(ring);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), a.mRedGlow); eye.position.set(0, 0.02, 0.36); g.add(eye);
    for (let i = 0; i < 4; i++) {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.025, 14), a.mDark); arm.position.set(i < 2 ? -0.6 : 0.6, 0.22, i % 2 ? 0.5 : -0.5); arm.name = 'rotor'; g.add(arm);
    }
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.2, 14, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 1.4, 2.0), transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    cone.position.y = -0.7; g.add(cone);
    g.visible = false; this.root.add(g); return g;
  }
  private makeDoor(): THREE.Group {
    const a = this.assets, g = new THREE.Group();
    const hd = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.5, 0.6), a.mMetal); hd.position.y = 3.15; g.add(hd);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.1), a.mAmberGlow); lamp.position.set(0, 3.15, 0.33); lamp.name = 'lamp'; g.add(lamp);
    for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.18, 3.0, 0.5), a.mMetal); p.position.set(s * 1.1, 1.5, 0); g.add(p); }
    const pg = new THREE.BoxGeometry(1.0, 2.9, 0.34);
    const l = new THREE.Mesh(pg, a.mHazard); l.name = 'L'; g.add(l);
    const r = new THREE.Mesh(pg, a.mHazard); r.name = 'R'; g.add(r);
    g.visible = false; this.root.add(g); return g;
  }
  private makeLetter(): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.9), new THREE.MeshBasicMaterial({ map: this.assets.letterTex, side: THREE.DoubleSide, transparent: true }));
    m.visible = false; this.root.add(m); return m;
  }
  private makeFan(): THREE.Group {
    const g = new THREE.Group(); const m = new THREE.Mesh(this.assets.gFan, this.assets.fanMats); m.name = 'spin'; g.add(m);
    g.visible = false; this.root.add(g); return g;
  }
  private makeGate(): THREE.Group {
    const a = this.assets, g = new THREE.Group();
    const W = 12.4;
    const frameM = a.mMetal;
    const top = new THREE.Mesh(new THREE.BoxGeometry(W, 1.6, 1.4), frameM); top.position.y = 6.2; g.add(top);
    for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(1.2, 6.5, 1.4), frameM); p.position.set(s * (W / 2 - 0.6), 3.25, 0); g.add(p); }
    const pg = new THREE.BoxGeometry(5.0, 5.5, 0.6);
    this.gateLeft = new THREE.Mesh(pg, a.mHazard); this.gateRight = new THREE.Mesh(pg, a.mHazard);
    for (const m of [this.gateLeft, this.gateRight]) { g.add(m); }
    this.gateSign = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 1.6), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
    this.gateSign.position.set(0, 6.2, 0.72); g.add(this.gateSign);
    for (let i = 0; i < 6; i++) { const l = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), a.mGreenGlow); l.position.set(-4.5 + i * 1.8, 5.2, 0.75); g.add(l); this.gateLights.push(l); }
    g.visible = false; return g;
  }
  setGate(dist: number, label: string, kind: 'door' | 'exit') {
    this.gateDist = dist; this.gateKind = kind; this.gateOpen = 0;
    let t = this.gateSigns[label]; if (!t) t = this.gateSigns[label] = signTexture(label, kind === 'exit' ? '#2a1038' : '#10203a', kind === 'exit' ? '#ff8ad0' : '#48f0a8');
    (this.gateSign.material as THREE.MeshBasicMaterial).map = t; (this.gateSign.material as THREE.MeshBasicMaterial).needsUpdate = true;
    this.gate.visible = dist > 0;
  }

  // ---------- run lifecycle
  reset(p: GenParams) {
    this.params = p; this.rand = mulberry(p.seed * 7919 + 13);
    this.collect.clear();
    for (const c of this.chunks) this.releaseChunk(c);
    this.safe = 1; this.prevAll = false; this.platLane = -1; this.hist = [1, 1, 1, 1];
    this.nextPower = p.startDist + 420; this.nextGold = p.startDist + 240; this.powerCount = 0;
    this.noObstacleUntil = p.quiet ? 1e12 : p.startDist + 70;
    this.gateDist = 0; this.gate.visible = false;
    const n = this.chunks.length;
    for (let i = 0; i < n; i++) {
      const c = this.chunks[i]!;
      c.zOff = 40 - i * CHUNK_LEN; c.trackStart = p.startDist - c.zOff;
      this.buildChunk(c);
    }
  }
  private releaseChunk(c: Chunk) {
    for (let i = 0; i < c.n; i++) {
      const o = c.obj[i];
      if (o) {
        o.visible = false; c.group.remove(o); this.root.add(o);
        const k = c.kind[i];
        if (k === K_CART) this.carts.put(o as THREE.Group); else if (k === K_DRONE) this.drones.put(o as THREE.Group); else if (k === K_DOOR) this.doors.put(o as THREE.Group); else if (k === K_LETTER) this.letters.put(o as THREE.Mesh);
        c.obj[i] = null;
      }
    }
    for (const m of c.signs) { m.visible = false; c.group.remove(m); this.root.add(m); this.signPool.put(m); }
    c.signs.length = 0;
    for (const f of c.fans) { f.visible = false; c.group.remove(f); this.root.add(f); this.fanPool.put(f); }
    c.fans.length = 0; c.n = 0; c.ns = 0; c.active = false;
  }

  /** difficulty 0..1 at track distance d */
  difficulty(d: number): number {
    const p = this.params;
    if (p.mode === 'escape') {
      const s = this.stageAt(d); const st = stageStart(s); const pr = Math.min(1, (d - st) / STAGE_GOALS[s]!);
      return Math.min(1, 0.1 + s * 0.17 + pr * 0.2);
    }
    return Math.min(1, 0.25 + d / 9000);
  }
  stageAt(d: number): number { let s = 0; while (s < 4 && d >= stageStart(s + 1)) s++; return s; }
  zoneAt(d: number): number {
    if (this.params.mode === 'escape') return this.stageAt(d);
    return Math.floor(Math.max(0, d) / ENDLESS_ZONE_LEN) % ZONES.length;
  }
  tierAt(d: number): number {
    if (this.params.mode === 'escape') return this.stageAt(d);
    return Math.min(4, Math.floor(Math.max(0, d) / 1300));
  }

  // ---------- chunk build
  private buildChunk(c: Chunk) {
    this.releaseChunk(c);
    const cz = c.trackStart + CHUNK_LEN / 2;
    c.zone = this.zoneAt(cz); c.active = true;
    for (const l of c.layerList) l.reset();
    this.buildDecor(c);
    this.buildTrack(c);
    for (const l of c.layerList) l.finish();
    c.group.position.z = c.zOff; c.mirrorGroup.position.z = c.zOff;
  }

  private buildDecor(c: Chunk) {
    const a = this.assets, z = c.zone, Z = ZONES[z]!, r = this.rand, L = c.L as Record<string, Layer>;
    c.floor.material = a.floorMat[z]!;
    (c.floor.material as THREE.MeshStandardMaterial).opacity = this.quality.mirror ? 0.86 : 1;
    (c.floor.material as THREE.MeshStandardMaterial).transparent = this.quality.mirror;
    L.wall!.setMat(a.wallMat[z]!); L.pipe!.setMat(a.pipeMat[z]!); L.tank!.setMat(a.tankMat[z]!); L.bg!.setMat(a.wallMat[z]!);
    for (const nm of ['platBody']) L[nm]!.setMat(a.mPlat[z]!);
    // strips (lane dividers + wall base)
    const sz = -CHUNK_LEN / 2;
    const lc = this.tcL.setHex(Z.light).multiplyScalar(Z.lightI), sc = this.tcS.setHex(Z.led[0]!).multiplyScalar(2.4);
    const strip = (x: number, y: number) => L.glow!.addC(x, y, sz, 0.07, 0.05, CHUNK_LEN, sc);
    for (const x of [-LW * 1.5, -LW * 0.5, LW * 0.5, LW * 1.5]) strip(x, 0.03);
    strip(-WALL_X + 0.3, 0.05); strip(WALL_X - 0.3, 0.05);
    if (Z.wall === 'rack') {
      for (const side of [-1, 1]) for (let i = 0; i < 42; i++) {
        const h = 0.9 + r() * 0.1; L.wall!.add(side * (WALL_X + 0.4), 2.3 * h, -i * 1.2 - 0.6, 1, h, 1, 0);
      }
      for (const side of [-1, 1]) strip(side * (WALL_X - 0.22), 4.7);
    } else if (Z.wall === 'tank') {
      for (const side of [-1, 1]) {
        for (let i = 0; i < 10; i++) L.tank!.add(side * (WALL_X + 0.3), 2.6, -i * 5 - 2.5, 1, 1, 1);
        for (let i = 0; i < 40; i++) L.wall!.add(side * (WALL_X + 2.1), 2.3, -i * 1.25 - 0.6, 1, 1, 1);
      }
    } else {
      for (const side of [-1, 1]) {
        for (let i = 0; i < 17; i++) L.post!.add(side * (WALL_X - 0.9), 0.75, -i * 3 - 1.5, 1, 1, 1);
        L.rail!.add(side * (WALL_X - 0.9), 1.45, -CHUNK_LEN / 2, 1, 1, CHUNK_LEN); L.rail!.add(side * (WALL_X - 0.9), 0.85, -CHUNK_LEN / 2, 1, 1, CHUNK_LEN);
        strip(side * (WALL_X - 0.9), 1.55);
        // distant skyline
        for (let i = 0; i < 7; i++) {
          const w = 3 + r() * 5, h = 4 + r() * 14, d = 3 + r() * 5;
          L.bg!.add(side * (WALL_X + 6 + r() * 26), h / 2 - 3, -i * 7 - r() * 4, w, h / 4.6, d / 1.15, 0);
        }
      }
    }
    if (Z.ceiling) {
      for (let i = 0; i < 8; i++) L.glow!.addC(0, CEIL_Y - 0.35, -i * 6.25 - 3.1, 6, 0.1, 0.3, lc);
      if (this.quality.chunks > 4) for (const x of [-4.6, -3.6, 3.6, 4.6]) L.pipe!.add(x, CEIL_Y - 0.8, -CHUNK_LEN / 2, 1, 1, CHUNK_LEN);
      if (this.quality.chunks > 4) L.pipe!.add(0, CEIL_Y - 0.1, -CHUNK_LEN / 2, 4, 0.4, CHUNK_LEN);
    }
    // meme signs on the walls (interior zones) + price ticker
    if (Z.ceiling) {
      const nS = this.quality.chunks <= 4 ? 1 : 2; const used: number[] = [];
      for (let k = 0; k < nS; k++) {
        const m = this.signPool.get(); if (!m) break;
        let ti = Math.floor(r() * (SIGNS.length + 1)); if (used.includes(ti)) ti = (ti + 1) % (SIGNS.length + 1); used.push(ti);
        const w = ti < SIGNS.length ? SIGNS[ti]!.w : 5.4, side = k === 0 ? -1 : 1;
        m.material = this.signMats[ti]!; m.scale.set(w * 1.4, w * 0.35, 1);
        this.root.remove(m); c.group.add(m); m.visible = true;
        m.position.set(side * (WALL_X - 0.62), 3.15 + r() * 0.5, -8 - r() * 34); m.rotation.set(0, -side * Math.PI / 2, 0); c.signs.push(m);
      }
    }
    // GPU hall: giant wall fans
    if (z === 2) {
      for (const side of [-1, 1]) for (let k = 0; k < 2; k++) {
        const f = this.fanPool.get(); if (!f) continue;
        this.root.remove(f); c.group.add(f); f.visible = true;
        f.position.set(side * (WALL_X - 0.5), 2.9, -12 - k * 22 - (side > 0 ? 5 : 0)); f.rotation.y = -side * Math.PI / 2; c.fans.push(f);
      }
    }
  }

  // ---- obstacle adders
  private addObs(c: Chunk, kind: number, lane: number, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): number {
    if (c.n >= MAX_OBS) return -1;
    const i = c.n++; if (this.onSpawnKind) this.onSpawnKind(kind);
    c.kind[i] = kind; c.st[i] = 0; c.lane[i] = lane; c.bx0[i] = x0; c.bx1[i] = x1; c.by0[i] = y0; c.by1[i] = y1; c.bz0[i] = z0; c.bz1[i] = z1;
    c.layer[i] = -1; c.inst[i] = -1; c.obj[i] = null; c.lz[i] = (z0 + z1) / 2; c.pa[i] = 0; c.pb[i] = 0; c.pc[i] = 0;
    return i;
  }
  private rack(c: Chunk, lane: number, lz: number) {
    const x = LANE_X[lane]!; const i = this.addObs(c, K_RACK, lane, x - 0.95, x + 0.95, 0, 3, lz - 0.75, lz + 0.75); if (i < 0) return;
    c.inst[i] = c.L.rack!.add(x, 1.5, lz); c.layer[i] = 0;
  }
  private cable(c: Chunk, lane: number, lz: number, y = 0) {
    const x = LANE_X[lane]!; const i = this.addObs(c, K_CABLE, lane, x - 0.95, x + 0.95, y, y + 0.62, lz - 0.6, lz + 0.6); if (i < 0) return;
    c.inst[i] = c.L.cable!.add(x, y, lz); c.layer[i] = 1;
  }
  private tray(c: Chunk, lane: number, lz: number, y = 0) {
    const x = LANE_X[lane]!; const i = this.addObs(c, K_TRAY, lane, x - 1.05, x + 1.05, y + 0.95, y + 3.0, lz - 0.55, lz + 0.55); if (i < 0) return;
    c.inst[i] = c.L.tray!.add(x, y, lz); c.layer[i] = 2;
  }
  private laser(c: Chunk, lane: number, lz: number, y = 0) {
    const x = LANE_X[lane]!; const i = this.addObs(c, K_LASER, lane, x - 1.0, x + 1.0, y + 0.95, y + 3.3, lz - 0.25, lz + 0.25); if (i < 0) return;
    c.inst[i] = c.L.laser!.add(x, y, lz); c.layer[i] = 3;
  }
  private dyn<T extends THREE.Object3D>(c: Chunk, pool: Pool<T>, kind: number, lane: number, lz: number): number {
    const o = pool.get(); if (!o) return -1;
    const i = this.addObs(c, kind, lane, 0, 0, 0, 0, lz, lz); if (i < 0) { pool.put(o); return -1; }
    this.root.remove(o); c.group.add(o); o.visible = true; c.obj[i] = o; c.lz[i] = lz; c.pa[i] = this.rand() * 6.28;
    return i;
  }
  private surface(c: Chunk, kind: number, lane: number, z0: number, z1: number, h: number) {
    if (c.ns >= MAX_SURF) return; const i = c.ns++;
    c.sk[i] = kind; c.sx0[i] = LANE_X[lane]! - 1.0; c.sx1[i] = LANE_X[lane]! + 1.0; c.sz0[i] = z0; c.sz1[i] = z1; c.sh[i] = h;
  }
  private ramp(c: Chunk, lane: number, z0: number, z1: number, up: boolean) {
    // wedge geometry rises toward -z. For a down ramp rotate by PI around y.
    const x = LANE_X[lane]!, len = z0 - z1;
    if (up) c.L.ramp!.add(x, 0, z0, 2.0, PLAT_H, len, 0);
    else c.L.ramp!.add(x, 0, z1, 2.0, PLAT_H, len, Math.PI);
    this.surface(c, up ? 1 : 2, lane, z0, z1, PLAT_H);
  }

  private line(c: Chunk, lane: number, lzFrom: number, n: number, step: number, y: number, kind = C_RAM) {
    for (let i = 0; i < n; i++) this.collect.spawn(kind, LANE_X[lane]!, y, c.zOff + lzFrom - i * step);
  }
  private arc(c: Chunk, lane: number, lzFrom: number, n: number, step: number, base: number, peak: number) {
    for (let i = 0; i < n; i++) { const t = n === 1 ? 0.5 : i / (n - 1); this.collect.spawn(C_RAM, LANE_X[lane]!, base + Math.sin(t * Math.PI) * peak, c.zOff + lzFrom - i * step); }
  }

  /** obstacle blocked? (static check by lane for beat planning) */
  private buildTrack(c: Chunk) {
    const r = this.rand, p = this.params;
    let beatPlat0 = -1, beatPlat1 = -1; let platL = -1;
    // maybe start a platform sequence occupying beats 0..3
    const d0 = c.trackStart;
    const tier0 = this.tierAt(d0);
    const gateNear = p.goalDist > 0 && d0 + CHUNK_LEN > p.goalDist - 60 && d0 < p.goalDist + 40;
    if (!gateNear && d0 > this.noObstacleUntil + 300 && r() < 0.17 + 0.03 * tier0) {
      platL = Math.floor(r() * 3);
      beatPlat0 = 0; beatPlat1 = 3;
      const top = PLAT_H;
      this.ramp(c, platL, -1, -9, true);
      const zA = -9, zB = -33, len = zA - zB;
      const x = LANE_X[platL]!;
      const body = this.addObs(c, K_PLAT, platL, x - 1.0, x + 1.0, 0, top - 0.3, zB, zA);
      if (body >= 0) { c.layer[body] = 14; c.inst[body] = c.L.platBody!.add(x, top / 2 - 0.05, (zA + zB) / 2, 2.0, top - 0.1, len); }
      c.L.platTop!.add(x, top - 0.03, (zA + zB) / 2, 2.0, 0.08, len);
      this.surface(c, 0, platL, zA, zB, top);
      this.ramp(c, platL, zB, zB - 7, false);
      // rewards on top
      for (let i = 0; i < 11; i++) this.collect.spawn(C_RAM, x, top + 0.85, c.zOff - 11 - i * 2);
      if (r() < 0.6) this.cable(c, platL, -21, top);
      else this.tray(c, platL, -21, top);
      // arcs over the top cable
      this.platLane = platL;
    } else this.platLane = -1;

    for (let b = 0; b < BEATS; b++) {
      const dBeat = d0 + b * BEAT_LEN + BEAT_LEN / 2; // track distance of beat centre
      const lzc = -(b * BEAT_LEN + BEAT_LEN / 2);
      const inPlat = platL >= 0 && b >= beatPlat0 && b <= beatPlat1;
      const dif = this.difficulty(dBeat), tier = this.tierAt(dBeat);
      // checkpoint gate: free zone
      const nearGate = p.goalDist > 0 && dBeat > p.goalDist - 50 && dBeat < p.goalDist + 30;
      const quiet = dBeat < this.noObstacleUntil || nearGate;
      // power ups / gold
      if (!quiet && dBeat >= this.nextPower) {
        const kinds = [0, 1, 2, 3, 4, 0, 1, 2, 4];
        const k = kinds[Math.floor(r() * kinds.length)]!;
        const lane = inPlat ? platL : this.safe;
        this.collect.spawn(C_PU + k, LANE_X[lane]!, (inPlat ? PLAT_H : 0) + 1.0, c.zOff + lzc - 3);
        this.nextPower = dBeat + 380 + r() * 220; this.powerCount++;
      }
      if (!quiet && dBeat >= this.nextGold) {
        const lane = inPlat ? platL : this.safe;
        this.collect.spawn(C_GOLD, LANE_X[lane]!, (inPlat ? PLAT_H : 0) + 1.0, c.zOff + lzc - 4);
        this.nextGold = dBeat + 230 + r() * 180;
      }
      if (inPlat) {
        // other lanes: sparse low-risk obstacles
        if (b === 2 || b === 3) {
          const ol = [0, 1, 2].filter((l) => l !== platL);
          const lane = ol[Math.floor(r() * 2)]!;
          if (r() < 0.6 + dif * 0.3) { if (r() < 0.5) this.cable(c, lane, lzc); else this.tray(c, lane, lzc); }
          this.line(c, lane === ol[0] ? ol[1]! : ol[0]!, lzc + 3, 4, 1.8, 0.9);
        } else {
          const ol = [0, 1, 2].filter((l) => l !== platL); this.line(c, ol[Math.floor(r() * 2)]!, lzc + 3, 4, 1.8, 0.9);
        }
        this.safe = platL;
        continue;
      }
      if (quiet || r() > 0.5 + dif * 0.42) {
        // empty beat: collectibles pattern
        const lane = this.safe;
        const pat = r();
        if (pat < 0.45) this.line(c, lane, lzc + 4, 5, 1.8, 0.9);
        else if (pat < 0.7) { const nl = Math.max(0, Math.min(2, lane + (r() < 0.5 ? -1 : 1))); this.line(c, lane, lzc + 4, 3, 1.8, 0.9); this.line(c, nl, lzc - 1, 3, 1.8, 0.9); this.safe = nl; }
        else if (pat < 0.85) this.arc(c, lane, lzc + 4, 7, 1.3, 0.9, 1.0);
        else { for (let l = 0; l < 3; l++) this.line(c, l, lzc + 3, 2, 3, 0.9); }
        this.hist = [this.hist[1]!, this.hist[2]!, this.hist[3]!, this.safe];
        this.prevAll = false;
        continue;
      }
      // pick a pattern
      type Pat = { n: string; w: number; all?: boolean };
      const pats: Pat[] = [{ n: 'rack', w: 3.2 }, { n: 'cable', w: 2.6, all: true }, { n: 'tray', w: 2.1, all: true }];
      if (d0 + b * BEAT_LEN > 300) { /* tutorial ordering: more racks early */ }
      if (tier >= 1) { pats.push({ n: 'laser', w: 1.7, all: true }, { n: 'letter', w: 1.1 }, { n: 'cart', w: 1.2 }); }
      if (tier >= 2) { pats.push({ n: 'door', w: 1.4 }, { n: 'drone', w: 1.4 }); }
      if (tier >= 3) { pats.push({ n: 'rack2', w: 1.6 }); }
      let tot = 0; for (const q of pats) if (!(this.prevAll && q.all)) tot += q.w;
      let pick = r() * tot, ch = pats[0]!;
      for (const q of pats) { if (this.prevAll && q.all) continue; pick -= q.w; if (pick <= 0) { ch = q; break; } }
      let all = false;
      const lanesBut = (s: number) => [0, 1, 2].filter((l) => l !== s);
      const nextSafe = () => { const opts = [this.safe - 1, this.safe, this.safe + 1].filter((l) => l >= 0 && l <= 2); return opts[Math.floor(r() * opts.length)]!; };
      switch (ch.n) {
        case 'rack': case 'rack2': {
          const ns = nextSafe();
          const blocked = lanesBut(ns);
          const cnt = ch.n === 'rack2' || (dif > 0.45 && r() < 0.55) ? 2 : 1;
          const shuffled = blocked.sort(() => r() - 0.5).slice(0, cnt);
          for (const l of shuffled) this.rack(c, l, lzc);
          this.safe = ns; this.line(c, ns, lzc + 4, 5, 1.8, 0.9);
          if (cnt === 1) { const other = blocked.find((l) => !shuffled.includes(l)); if (other !== undefined && r() < 0.5) this.line(c, other, lzc + 3, 3, 1.6, 0.9); }
          break;
        }
        case 'cable': {
          const k = (r() < 0.25 + dif * 0.4) ? 3 : (r() < 0.5 ? 2 : 1);
          const lanes = k === 3 ? [0, 1, 2] : k === 2 ? lanesBut(Math.floor(r() * 3)) : [Math.floor(r() * 3)];
          for (const l of lanes) this.cable(c, l, lzc);
          all = k === 3;
          const al = lanes.includes(this.safe) ? this.safe : lanes[0]!;
          this.arc(c, al, lzc + 4.2, 7, 1.2, 0.8, 1.15);
          break;
        }
        case 'tray': case 'laser': {
          const k = r() < 0.3 + dif * 0.45 ? 3 : (r() < 0.5 ? 2 : 1);
          const lanes = k === 3 ? [0, 1, 2] : k === 2 ? lanesBut(Math.floor(r() * 3)) : [Math.floor(r() * 3)];
          for (const l of lanes) { if (ch.n === 'tray') this.tray(c, l, lzc); else this.laser(c, l, lzc); }
          all = k === 3;
          const al = lanes.includes(this.safe) ? this.safe : lanes[0]!;
          this.line(c, al, lzc + 3, 6, 1.0, 0.35);
          break;
        }
        case 'letter': {
          const k = 1 + Math.floor(r() * (dif > 0.5 ? 3 : 2));
          const lanes = [0, 1, 2].sort(() => r() - 0.5).slice(0, k);
          for (const l of lanes) { const i = this.dyn(c, this.letters, K_LETTER, l, lzc); if (i >= 0) { const x = LANE_X[l]!; c.bx0[i] = x - 0.8; c.bx1[i] = x + 0.8; c.by0[i] = 0.2; c.by1[i] = 2.3; c.bz0[i] = lzc - 0.2; c.bz1[i] = lzc + 0.2; c.pa[i] = r() * 6.28; } }
          this.line(c, this.safe, lzc + 3, 5, 1.8, 0.9);
          break;
        }
        case 'cart': {
          // cart must not be in a lane that was safe in the previous 2 beats
          const cands = [0, 1, 2].filter((l) => l !== this.safe && l !== this.hist[1] && l !== this.hist[2] && l !== this.hist[3] && l !== this.hist[0]);
          const lane = (cands.length ? cands : lanesBut(this.safe))[Math.floor(r() * (cands.length || 2))]!;
          const i = this.dyn(c, this.carts, K_CART, lane, lzc - 2); if (i >= 0) { c.bx0[i] = LANE_X[lane]! - 0.9; c.bx1[i] = LANE_X[lane]! + 0.9; c.by0[i] = 0.1; c.by1[i] = 2.3; }
          this.line(c, this.safe, lzc + 4, 5, 1.8, 0.9);
          break;
        }
        case 'door': {
          const cnt = dif > 0.6 && r() < 0.5 ? 2 : 1; const ns = nextSafe();
          for (const l of lanesBut(ns).sort(() => r() - 0.5).slice(0, cnt)) { const i = this.dyn(c, this.doors, K_DOOR, l, lzc); if (i >= 0) { c.pb[i] = 0.9 + r() * 0.5; c.bx0[i] = LANE_X[l]! - 1.0; c.bx1[i] = LANE_X[l]! + 1.0; c.by0[i] = 0; c.by1[i] = 3.0; c.bz0[i] = lzc - 0.3; c.bz1[i] = lzc + 0.3; } }
          this.safe = ns; this.line(c, ns, lzc + 4, 5, 1.8, 0.9);
          break;
        }
        case 'drone': {
          const i = this.dyn(c, this.drones, K_DRONE, 1, lzc); if (i >= 0) { c.pb[i] = 0.9 + r() * 0.7 + dif * 0.6; c.by0[i] = 0.7; c.by1[i] = 1.5; }
          this.line(c, this.safe, lzc + 4, 4, 1.8, 0.35);
          break;
        }
      }
      this.prevAll = all;
      this.hist = [this.hist[1]!, this.hist[2]!, this.hist[3]!, this.safe];
    }
  }

  drawTicker(dir: number) {
    const up = dir >= 0; this.tickerV = Math.max(48, this.tickerV + (up ? 1 : -1) * Math.round(8 + Math.random() * 40) * (Math.random() < 0.5 ? 1 : -1));
    paintBoard(this.tickerCtx, ['DDR5 32GB  $' + this.tickerV, (up ? '▲ ' : '▼ ') + 'RAM PRICE LIVE'], '#07121f', up ? '#ff5a4a' : '#48f0a8', up ? '#ff5a4a' : '#48f0a8'); this.tickerTex.needsUpdate = true;
  }

  // ---------- per-frame
  update(dt: number, scroll: number, t: number, dist: number) {
    this.time = t;
    this.tickerT -= dt; if (this.tickerT <= 0) { this.tickerT = 1.6; this.drawTicker(Math.random() < 0.6 ? 1 : -1); }
    // scroll chunks, recycle
    for (const c of this.chunks) { c.zOff += scroll; c.group.position.z = c.zOff; c.mirrorGroup.position.z = c.zOff; }
    let far = Infinity; for (const c of this.chunks) if (c.zOff < far) far = c.zOff;
    for (const c of this.chunks) {
      if (c.zOff - CHUNK_LEN > 16) {
        const front = far; c.zOff = front - CHUNK_LEN; far = c.zOff; c.trackStart = this.params.startDist - c.zOff + (dist - this.params.startDist) * 0; // recomputed below
        c.trackStart = dist - c.zOff; // player at z=0 is at `dist`
        this.buildChunk(c);
      }
    }
    for (const c of this.chunks) { const near = c.zOff > -85 && c.zOff - CHUNK_LEN < 14; for (const nm of CAST) { const m = c.L[nm]!.mesh; if (m.castShadow !== near) m.castShadow = near; } }
    // dynamic objects + fans
    for (const c of this.chunks) {
      if (!c.active) continue;
      for (const f of c.fans) (f.getObjectByName('spin') as THREE.Object3D).rotation.z += dt * 3.2;
      const zo = c.zOff;
      for (let i = 0; i < c.n; i++) {
        const k = c.kind[i]!; const o = c.obj[i];
        if (!o || (c.st[i]! & ST_DEAD)) continue;
        if (k === K_CART) {
          if (!(c.st[i]! & ST_ARMED) && zo + c.lz[i]! > -88) c.st[i]! |= ST_ARMED;
          if (c.st[i]! & ST_ARMED) c.lz[i] = c.lz[i]! + 8.5 * dt;
          const lz = c.lz[i]!, x = LANE_X[c.lane[i]!]!;
          o.position.set(x, 0, lz); c.bz0[i] = lz - 1.05; c.bz1[i] = lz + 1.05;
          // wheels shake
          o.position.y = Math.sin(t * 40 + i) * 0.01;
        } else if (k === K_DRONE) {
          const x = Math.sin(t * c.pb[i]! + c.pa[i]!) * (LW + 0.4);
          const y = 1.1 + Math.sin(t * 3 + c.pa[i]!) * 0.08;
          o.position.set(x, y, c.lz[i]!); o.rotation.y = Math.cos(t * c.pb[i]! + c.pa[i]!) * 0.5;
          c.bx0[i] = x - 0.5; c.bx1[i] = x + 0.5; c.bz0[i] = c.lz[i]! - 0.5; c.bz1[i] = c.lz[i]! + 0.5;
          for (const ch of o.children) if (ch.name === 'rotor') ch.rotation.y += dt * 40;
        } else if (k === K_DOOR) {
          const op = 0.5 + 0.5 * Math.sin(t * c.pb[i]! * 1.6 + c.pa[i]!);
          const L = o.getObjectByName('L')!, R = o.getObjectByName('R')!;
          const off = 0.5 + op * 0.55; L.position.set(-off, 1.5, 0); R.position.set(off, 1.5, 0);
          o.position.set(LANE_X[c.lane[i]!]!, 0, c.lz[i]!);
          const lamp = o.getObjectByName('lamp') as THREE.Mesh;
          lamp.material = op < 0.5 ? this.assets.mRedGlow : this.assets.mGreenGlow;
          c.pc[i] = op;
        } else if (k === K_LETTER) {
          const lz = c.lz[i]!, x = LANE_X[c.lane[i]!]!;
          const m = o as THREE.Mesh; const mat = m.material as THREE.MeshBasicMaterial;
          if (!(c.st[i]! & ST_DISSOLVE) && zo + lz > -11) { c.st[i]! |= ST_DISSOLVE; c.pb[i] = t; if (this.onSpawnEffect) this.onSpawnEffect('letter', x, 1.3, zo + lz); }
          let a = 1;
          if (c.st[i]! & ST_DISSOLVE) { a = 1 - (t - c.pb[i]!) / 0.45; if (a <= 0) { m.visible = false; c.st[i]! |= ST_DEAD; continue; } }
          mat.opacity = a;
          m.position.set(x + Math.sin(t * 2 + c.pa[i]!) * 0.12, 1.3 + Math.sin(t * 2.6 + c.pa[i]!) * 0.1, lz);
          m.rotation.set(0.1 * Math.sin(t * 3 + c.pa[i]!), 0.25 * Math.sin(t * 1.7 + c.pa[i]!), 0.08 * Math.sin(t * 2.3));
          m.scale.setScalar(1 + (1 - a) * 0.6);
        }
      }
    }
    // gate
    if (this.gateDist > 0) {
      const dz = -(this.gateDist - dist);
      this.gate.position.z = dz; this.gate.visible = dz > -280 && dz < 30;
      const near = -dz; const open = near < 20 ? 1 : near < 60 ? 1 - (near - 20) / 40 : 0;
      this.gateOpen += (open - this.gateOpen) * Math.min(1, dt * 4);
      const o = this.gateOpen; const x = 2.5 + o * 2.9;
      this.gateLeft.position.set(-x, 2.75, 0); this.gateRight.position.set(x, 2.75, 0);
      this.gateLeft.visible = this.gateRight.visible = this.gateKind === 'door';
      for (let i = 0; i < this.gateLights.length; i++) { const l = this.gateLights[i]!; l.scale.setScalar(0.8 + 0.4 * Math.sin(t * 6 - i)); }
    }
  }

  // ---------- queries
  groundAt(x: number, py: number, wz: number): number {
    let h = 0;
    for (const c of this.chunks) {
      if (!c.active || c.ns === 0) continue;
      const lz = wz - c.zOff;
      for (let s = 0; s < c.ns; s++) {
        if (lz > c.sz0[s]! + 0.02 || lz < c.sz1[s]! - 0.02) continue;
        if (x < c.sx0[s]! - 0.05 || x > c.sx1[s]! + 0.05) continue;
        const k = c.sk[s]!, top = c.sh[s]!; let y = top;
        if (k === 1) y = top * Math.min(1, Math.max(0, (c.sz0[s]! - lz) / (c.sz0[s]! - c.sz1[s]!)));
        else if (k === 2) y = top * Math.min(1, Math.max(0, (lz - c.sz1[s]!) / (c.sz0[s]! - c.sz1[s]!)));
        if (y <= py + 0.45 && y > h) h = y;
      }
    }
    return h;
  }

  /** first overlapping hostile obstacle for player box (world coordinates) */
  collide(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): boolean {
    for (const c of this.chunks) {
      if (!c.active) continue;
      const lz0 = z0 - c.zOff, lz1 = z1 - c.zOff;
      for (let i = 0; i < c.n; i++) {
        const s = c.st[i]!; const k = c.kind[i]!;
        if (s & ST_DEAD) continue;
        if (k === K_LETTER) { if (s & ST_DISSOLVE) continue; }
        else if (k === K_DOOR) { if (c.pc[i]! >= 0.5) continue; }
        if (c.bx1[i]! <= x0 || c.bx0[i]! >= x1 || c.by1[i]! <= y0 || c.by0[i]! >= y1 || c.bz1[i]! <= lz0 || c.bz0[i]! >= lz1) continue;
        this.hit.chunk = c; this.hit.idx = i; return true;
      }
    }
    return false;
  }

  /** destroy obstacle (hit knocked it away / smashed by overclock) */
  destroy(c: Chunk, i: number) {
    c.st[i]! |= ST_DEAD;
    const l = c.layer[i]!;
    if (l >= 0 && c.inst[i]! >= 0) {
      const lay = c.L[l === 0 ? 'rack' : l === 1 ? 'cable' : l === 2 ? 'tray' : l === 3 ? 'laser' : 'platBody']!;
      lay.kill(c.inst[i]!);
    }
    const o = c.obj[i]; if (o) { o.visible = false; }
    if (c.kind[i] === K_DOOR) c.pc[i] = 1;
  }
  obstacleCenter(c: Chunk, i: number, out: THREE.Vector3): THREE.Vector3 { return out.set((c.bx0[i]! + c.bx1[i]!) / 2, (c.by0[i]! + c.by1[i]!) / 2, c.zOff + (c.bz0[i]! + c.bz1[i]!) / 2); }

  /** free GPU buffers/geometries owned by this world (shared Assets are kept) */
  dispose() {
    const shared = new Set<unknown>();
    for (const v of Object.values(this.assets)) { if (Array.isArray(v)) v.forEach((x) => shared.add(x)); else shared.add(v); }
    const done = new Set<unknown>();
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose();
      if (m.geometry && !shared.has(m.geometry) && !done.has(m.geometry)) { m.geometry.dispose(); done.add(m.geometry); }
      const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
      for (const mt of mats) if (!shared.has(mt) && !done.has(mt)) { (mt as THREE.MeshBasicMaterial).map?.dispose?.(); mt.dispose(); done.add(mt); }
    });
    for (const k of Object.values(this.gateSigns)) k.dispose();
    for (const m of this.signMats) { m.map?.dispose(); m.dispose(); }
    this.letters.free.forEach((l) => { (l.material as THREE.MeshBasicMaterial).dispose(); });
    this.floorGeo.dispose();
    this.root.removeFromParent();
  }
  setVisible(v: boolean) { for (const c of this.chunks) { c.group.visible = v; c.mirrorGroup.visible = v; } this.collect.group.visible = v; }
}
