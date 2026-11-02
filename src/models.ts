// RAM RUN models: Kilo (hero bot) and Allocman / The Utilizer (boss). Pure primitives + canvas textures.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { makeSamFaceCanvas, type SamExpr } from './samface';

export type KiloState = 'run' | 'jump' | 'slide' | 'stumble' | 'idle' | 'dead' | 'ride' | 'parachute' | 'celebrate';
export interface KiloPose { state: KiloState; speed: number; t: number; lean: number; vy: number; landSquash: number; }
export interface KiloRig {
  root: THREE.Group;
  stackAnchor: THREE.Object3D;
  setSkin(id: 'kilo' | 'retro' | 'rgb' | 'rasp'): void;
  setStack(n: number, max: number): void;
  setShield(on: boolean): void;
  setOverclock(on: boolean): void;
  flashHit(): void;
  pose(dt: number, p: KiloPose): void;
}
export interface AllocmanRig {
  root: THREE.Group;
  headAnchor: THREE.Object3D;
  nozzleAnchor: THREE.Object3D;
  update(dt: number, p: { t: number; speed: number; threat: number; talking: boolean; faceCamera: number; grow: number }): void;
  setCatch(progress: number): void;
  setMad(m: number): void;
  /** held until changed: neutral | smug | shock | glee | worried | blink */
  setExpression(e: SamExpr): void;
  /** one-shot ~0.5s: free arm shoots forward at Kilo with an open hand and just misses */
  grab(): void;
}
export type { SamExpr };

// ---------------------------------------------------------------- helpers
type MPP = THREE.MeshPhysicalMaterialParameters;
function phys(color: number, rough = 0.5, metal = 0, o: MPP = {}): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({ color, roughness: rough, metalness: metal, ...o });
}
// Real mesh (for parts that must be toggled / drawn on their own).
function mkReal(g: THREE.BufferGeometry, m: THREE.Material, parent?: THREE.Object3D, x = 0, y = 0, z = 0, shadow = true): THREE.Mesh {
  const me = new THREE.Mesh(g, m);
  me.position.set(x, y, z);
  me.castShadow = shadow;
  me.receiveShadow = true;
  if (parent) parent.add(me);
  return me;
}
// ---- draw-call batching: mk() only records a part (geometry + material + transform proxy). finalizeRig() bakes all parts
// into ONE SkinnedMesh per material (rigid skinning, every joint is a bone) or, under `merge` groups, into plain merged meshes.
interface Part { geo: THREE.BufferGeometry; mat: THREE.Material; obj: THREE.Object3D }
let PARTS: Part[] = [];
let JOINTS: THREE.Object3D[] = [];
function mk(g: THREE.BufferGeometry, m: THREE.Material, parent?: THREE.Object3D, x = 0, y = 0, z = 0, _shadow = true): THREE.Object3D {
  const me = new THREE.Group();
  me.position.set(x, y, z);
  if (parent) parent.add(me);
  PARTS.push({ geo: g, mat: m, obj: me });
  return me;
}
/** joint group (becomes a bone) */
function jt(parent?: THREE.Object3D, x = 0, y = 0, z = 0): THREE.Group {
  const g = grp(parent, x, y, z);
  g.userData.joint = true; JOINTS.push(g);
  return g;
}
/** individually animated part (own bone) */
function mka(g: THREE.BufferGeometry, m: THREE.Material, parent?: THREE.Object3D, x = 0, y = 0, z = 0): THREE.Object3D {
  const me = mk(g, m, parent, x, y, z);
  me.userData.joint = true; JOINTS.push(me);
  return me;
}
function beginRig(): void { PARTS = []; JOINTS = []; }
function finalizeRig(root: THREE.Object3D, o: { cast: THREE.Material[]; noRecv?: THREE.Material[]; pad: number }): void {
  root.updateMatrixWorld(true);
  const parts = PARTS, joints = JOINTS;
  PARTS = []; JOINTS = [];
  const boneIdx = new Map<THREE.Object3D, number>(); joints.forEach((j, i) => boneIdx.set(j, i));
  const skinned = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const merged = new Map<THREE.Object3D, Map<THREE.Material, THREE.BufferGeometry[]>>();
  const inv = new THREE.Matrix4();
  const prep = (pt: Part, mat4: THREE.Matrix4): THREE.BufferGeometry => {
    const g = pt.geo.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    if (!g.index) g.setIndex(Array.from({ length: g.attributes.position.count }, (_, i) => i));
    g.clearGroups();
    g.applyMatrix4(mat4);
    return g;
  };
  const add = <K>(map: Map<K, THREE.BufferGeometry[]>, k: K, g: THREE.BufferGeometry) => { const a = map.get(k); if (a) a.push(g); else map.set(k, [g]); };
  for (const pt of parts) {
    let owner: THREE.Object3D | null = pt.obj, kind = 0, stop: THREE.Object3D | null = null;
    for (; owner; owner = owner.parent) { if (owner.userData.merge) { kind = 2; break; } if (owner.userData.joint) { kind = 1; break; } }
    if (kind === 2) stop = owner;
    let hidden = false;
    for (let q: THREE.Object3D | null = pt.obj; q && q !== stop; q = q.parent) if (!q.visible) { hidden = true; break; }
    if (hidden || !owner) continue;
    if (kind === 2) {
      inv.copy(owner.matrixWorld).invert();
      const g = prep(pt, new THREE.Matrix4().multiplyMatrices(inv, pt.obj.matrixWorld));
      let mm = merged.get(owner); if (!mm) { mm = new Map(); merged.set(owner, mm); }
      add(mm, pt.mat, g);
    } else {
      const g = prep(pt, pt.obj.matrixWorld);
      const n = g.attributes.position.count, bi = boneIdx.get(owner)!;
      const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) { si[i * 4] = bi; sw[i * 4] = 1; }
      g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
      g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
      add(skinned, pt.mat, g);
    }
    if (!pt.obj.userData.joint && pt.obj.children.length === 0) pt.obj.removeFromParent();
  }
  const skeleton = new THREE.Skeleton(joints as unknown as THREE.Bone[]);
  const ident = new THREE.Matrix4();
  for (const [mat, list] of skinned) {
    const geo = mergeGeometries(list, false)!;
    geo.computeBoundingSphere();
    const mesh = new THREE.SkinnedMesh(geo, mat);
    mesh.castShadow = o.cast.includes(mat); mesh.receiveShadow = !(o.noRecv ?? []).includes(mat);
    mesh.name = 'skin_' + (mat.name || mat.type);
    root.add(mesh);
    mesh.bind(skeleton, ident);
    const bs = geo.boundingSphere!;
    mesh.boundingSphere = new THREE.Sphere(bs.center.clone(), bs.radius + o.pad);
    mesh.boundingBox = new THREE.Box3().setFromCenterAndSize(bs.center, new THREE.Vector3().setScalar((bs.radius + o.pad) * 2));
    list.forEach((g) => g.dispose());
  }
  for (const [owner, mm] of merged) for (const [mat, list] of mm) {
    const mesh = new THREE.Mesh(mergeGeometries(list, false)!, mat);
    mesh.castShadow = false; mesh.receiveShadow = true;
    owner.add(mesh);
  }
}
const rbox = (w: number, h: number, d: number, r: number, s = 4) => new RoundedBoxGeometry(w, h, d, s, Math.min(r, Math.min(w, h, d) * 0.5 - 0.001));
const capsule = (r: number, l: number) => new THREE.CapsuleGeometry(r, l, 6, 14);
const sphere = (r: number, w = 20, h = 14) => new THREE.SphereGeometry(r, w, h);
const cyl = (rt: number, rb: number, h: number, s = 20) => new THREE.CylinderGeometry(rt, rb, h, s);
function grp(parent?: THREE.Object3D, x = 0, y = 0, z = 0): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  if (parent) parent.add(g);
  return g;
}
function canvasTex(w: number, h: number, draw: (c: CanvasRenderingContext2D, w: number, h: number) => void, srgb = true): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const c = cv.getContext('2d')!;
  draw(c, w, h);
  const t = new THREE.CanvasTexture(cv);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
function rrect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const TAU = Math.PI * 2;

// ---------------------------------------------------------------- KILO
type SkinId = 'kilo' | 'retro' | 'rgb' | 'rasp';
interface SkinDef { shell: number; body: number; scarf: number; stripe: number; rack: number; bezel: number; eye: number; stick: number; sole: number; }
const SKINS: Record<SkinId, SkinDef> = {
  kilo: { shell: 0xf4f8fa, body: 0x18bcae, scarf: 0xff8a2a, stripe: 0xff8a2a, rack: 0x2b3b49, bezel: 0x141e2a, eye: 0x6ff6ff, stick: 0x2affd0, sole: 0xffffff },
  retro: { shell: 0xdcd0b0, body: 0xcdc09c, scarf: 0x7b808a, stripe: 0x7b808a, rack: 0x8b8d94, bezel: 0x2a2b27, eye: 0x7dff8a, stick: 0x7dff6a, sole: 0xb9b8b0 },
  rgb: { shell: 0x1a1c21, body: 0x24272e, scarf: 0x2a2d35, stripe: 0xffffff, rack: 0x15171b, bezel: 0x0c0d10, eye: 0xffffff, stick: 0xffffff, sole: 0x101114 },
  rasp: { shell: 0xcf1c46, body: 0xb40f38, scarf: 0x3fb04c, stripe: 0x3fb04c, rack: 0x2b3a2d, bezel: 0x2a0912, eye: 0xc4ffd2, stick: 0x7dff9c, sole: 0xf1e8df },
};

const J = {
  lThigh: 0, lKnee: 1, rThigh: 2, rKnee: 3, lArmX: 4, lArmZ: 5, rArmX: 6, rArmZ: 7, lElbow: 8, rElbow: 9,
  pitch: 10, bodyY: 11, roll: 12, headX: 13, headZ: 14, sx: 15, sy: 16, innerY: 17, yaw: 18, headY: 19, N: 20,
};

export function buildKilo(skin: string = 'kilo'): KiloRig {
  const root = new THREE.Group();
  root.name = 'Kilo';
  beginRig();
  const inner = grp(root);

  // ---- materials
  const clear: MPP = { clearcoat: 0.7, clearcoatRoughness: 0.28 };
  const mShell = phys(0xffffff, 0.34, 0, clear);
  const mBody = phys(0xffffff, 0.38, 0, clear);
  const mScarf = phys(0xff8a2a, 0.75, 0, { sheen: 1, sheenColor: new THREE.Color(0xffd0a0), sheenRoughness: 0.5 });
  const mStripe = phys(0xff8a2a, 0.5, 0, { emissive: 0x000000 });
  const mSole = phys(0xffffff, 0.6, 0);
  const mDark = phys(0x1c2733, 0.5, 0.25);
  const mMetal = phys(0xc2ccd4, 0.28, 0.9);
  const mRack = phys(0x2b3b49, 0.45, 0.6);
  const mRackGlow = phys(0x2affd0, 0.4, 0, { emissive: 0x2affd0, emissiveIntensity: 0.9 });
  const mBezel = phys(0x141e2a, 0.35, 0.4, { emissive: 0x000000 });
  const mBulb = phys(0xffe9a8, 0.3, 0, { emissive: 0xffc860, emissiveIntensity: 2.2 });
  const mLed = phys(0x44ff88, 0.4, 0, { emissive: 0x44ff88, emissiveIntensity: 2 });
  const mGold = phys(0xf2c14e, 0.28, 1.0);
  const mChip = phys(0x0b0d10, 0.35, 0.5);
  const mPcb = phys(0x063a36, 0.35, 0.2, { emissive: 0x2affd0, emissiveIntensity: 0.9 });
  const mLabel = phys(0xffffff, 0.4, 0, { emissive: 0xffffff, emissiveIntensity: 0.9 });
  const mRetro = phys(0xc2b592, 0.5, 0);
  const mLeaf = phys(0x3fb04c, 0.55, 0, { clearcoat: 0.5 });
  const mPin = phys(0xf2c14e, 0.3, 1.0);

  // eye texture (white-on-black emissive map)
  const eyeCv = document.createElement('canvas');
  eyeCv.width = 256; eyeCv.height = 128;
  const eyeCtx = eyeCv.getContext('2d')!;
  const eyeTex = new THREE.CanvasTexture(eyeCv);
  eyeTex.colorSpace = THREE.SRGBColorSpace;
  eyeTex.anisotropy = 4;
  let eyeMode = -1;
  const drawEyes = (mode: number) => {
    const c = eyeCtx;
    c.fillStyle = '#000'; c.fillRect(0, 0, 256, 128);
    c.fillStyle = '#fff'; c.strokeStyle = '#fff'; c.lineCap = 'round'; c.lineJoin = 'round';
    const ex = [80, 176];
    if (mode === 0) { // happy: tall glowing eyes + cute smile
      for (const x of ex) {
        c.beginPath(); c.ellipse(x, 52, 21, 29, 0, 0, TAU); c.fill();
        c.fillStyle = '#6a6a6a'; c.beginPath(); c.ellipse(x + 3, 46, 8, 12, 0, 0, TAU); c.fill();
        c.fillStyle = '#fff'; c.beginPath(); c.arc(x - 6, 36, 6, 0, TAU); c.fill();
      }
      c.lineWidth = 9; c.beginPath(); c.arc(128, 80, 22, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke();
    } else if (mode === 1) { // blink
      c.lineWidth = 10;
      for (const x of ex) { c.beginPath(); c.arc(x, 56, 20, 1.15 * Math.PI, 1.85 * Math.PI); c.stroke(); }
      c.beginPath(); c.arc(128, 80, 22, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke();
    } else if (mode === 2) { // X_X
      c.lineWidth = 13;
      for (const x of ex) {
        c.beginPath(); c.moveTo(x - 20, 30); c.lineTo(x + 20, 76); c.moveTo(x + 20, 30); c.lineTo(x - 20, 76); c.stroke();
      }
      c.lineWidth = 8; c.beginPath(); c.moveTo(100, 104); c.lineTo(114, 96); c.lineTo(128, 106); c.lineTo(142, 96); c.lineTo(156, 104); c.stroke();
    } else { // determined: slanted lids
      for (let i = 0; i < 2; i++) {
        const x = ex[i], s = i === 0 ? 1 : -1;
        c.save();
        c.beginPath(); c.ellipse(x, 56, 23, 28, 0, 0, TAU); c.clip();
        c.fillStyle = '#fff'; c.fillRect(0, 0, 256, 128);
        c.fillStyle = '#000'; c.beginPath();
        c.moveTo(x - 30 * s - 4, 14 - 6 * s * 0); c.lineTo(x + 30 * s + 4, 52 + 0); c.lineTo(x - 30 * s - 4, 52); c.closePath();
        c.restore();
        c.save(); c.beginPath(); c.ellipse(x, 56, 23, 28, 0, 0, TAU); c.clip();
        c.fillStyle = '#000'; c.beginPath();
        c.moveTo(x - 30, 20 + (s > 0 ? 0 : 22)); c.lineTo(x + 30, 20 + (s > 0 ? 22 : 0)); c.lineTo(x + 30, 0); c.lineTo(x - 30, 0); c.closePath(); c.fill();
        c.restore();
      }
      c.lineWidth = 9; c.beginPath(); c.moveTo(106, 96); c.quadraticCurveTo(128, 112, 150, 96); c.stroke();
    }
    eyeTex.needsUpdate = true;
    eyeMode = mode;
  };
  drawEyes(0);
  const mVisor = phys(0x04070c, 0.12, 0.3, { clearcoat: 1, clearcoatRoughness: 0.06, emissive: 0x6ff6ff, emissiveMap: eyeTex, emissiveIntensity: 1.8 });

  // bump for raspberry drupelets
  const raspBump = canvasTex(128, 128, (c, w, h) => {
    c.fillStyle = '#404040'; c.fillRect(0, 0, w, h);
    for (let yy = 0; yy < 4; yy++) for (let xx = 0; xx < 4; xx++) {
      const cx = (xx + (yy % 2) * 0.5) * 32 + 16, cy = yy * 32 + 16;
      const g = c.createRadialGradient(cx, cy, 1, cx, cy, 15);
      g.addColorStop(0, '#fff'); g.addColorStop(1, '#202020');
      c.fillStyle = g; c.beginPath(); c.arc(cx, cy, 15, 0, TAU); c.fill();
    }
  }, false);
  raspBump.wrapS = raspBump.wrapT = THREE.RepeatWrapping;
  raspBump.repeat.set(2, 2);

  // ---- hierarchy
  const hips = jt(inner, 0, 0.38, 0);
  mk(rbox(0.3, 0.13, 0.24, 0.05), mDark, hips, 0, 0.0, 0);
  const torso = jt(hips, 0, 0.02, 0);
  mk(rbox(0.46, 0.36, 0.34, 0.13, 5), mBody, torso, 0, 0.2, 0);
  mk(rbox(0.475, 0.05, 0.355, 0.02), mStripe, torso, 0, 0.1, 0);
  mk(rbox(0.26, 0.17, 0.03, 0.05), mShell, torso, 0, 0.25, -0.17);
  mk(sphere(0.022, 12, 8), mLed, torso, 0.06, 0.26, -0.19, false);
  mk(sphere(0.022, 12, 8), mBulb, torso, -0.06, 0.26, -0.19, false);
  mk(cyl(0.07, 0.08, 0.08, 14), mDark, torso, 0, 0.4, 0);
  // scarf
  const scarfRing = mk(new THREE.TorusGeometry(0.16, 0.042, 12, 28), mScarf, torso, 0, 0.395, -0.005);
  scarfRing.rotation.x = Math.PI / 2; scarfRing.scale.set(1.25, 1.05, 1);
  const scarfTail = grp(torso, 0.1, 0.43, 0.14);
  const tailA = jt(scarfTail);
  mk(rbox(0.1, 0.24, 0.02, 0.01, 2), mScarf, tailA, 0, -0.12, 0);
  mk(rbox(0.1, 0.03, 0.025, 0.008, 2), mStripe, tailA, 0, -0.17, 0);
  const tailB = jt(torso, 0.02, 0.43, 0.16);
  mk(rbox(0.1, 0.17, 0.02, 0.01, 2), mScarf, tailB, 0, -0.085, 0);
  // backpack rack
  const rackG = grp(torso, 0, 0.205, 0.22);
  const stackAnchor = grp(rackG, 0, 0, 0.1);
  mk(rbox(0.4, 0.37, 0.04, 0.015), mDark, rackG, 0, 0, 0.01);
  for (const sx of [-1, 1]) {
    mk(rbox(0.036, 0.38, 0.09, 0.016), mRack, rackG, sx * 0.19, 0, 0.055);
    mk(rbox(0.01, 0.3, 0.01, 0.003, 2), mRackGlow, rackG, sx * 0.19, 0, 0.103, false);
  }
  mk(rbox(0.42, 0.04, 0.09, 0.016), mRack, rackG, 0, 0.19, 0.055);
  mk(rbox(0.42, 0.04, 0.09, 0.016), mRack, rackG, 0, -0.19, 0.055);
  mk(rbox(0.37, 0.022, 0.07, 0.008, 2), mRack, rackG, 0, 0, 0.045);
  mk(rbox(0.12, 0.014, 0.012, 0.005, 2), mRackGlow, rackG, 0, 0.192, 0.102, false);
  mk(rbox(0.09, 0.06, 0.06, 0.022), mRack, rackG, 0, -0.23, 0.03);
  // sticks
  const stickGeo = rbox(0.05, 0.135, 0.01, 0.003, 2);
  const goldGeo = new THREE.BoxGeometry(0.044, 0.014, 0.013);
  const labelGeo = new THREE.BoxGeometry(0.03, 0.01, 0.012);
  const chipGeo = (() => {
    const gs: THREE.BufferGeometry[] = [];
    for (const y of [0.035, 0.0, -0.035]) { const g = new THREE.BoxGeometry(0.036, 0.026, 0.01); g.translate(0, y, 0.005); gs.push(g); }
    return mergeGeometries(gs)!;
  })();
  const stickAge: number[] = [];
  const stickShown: boolean[] = [];
  const stickScale: number[] = [];
  const stickX: number[] = [], stickY: number[] = [];
  const stickParts: [THREE.BufferGeometry, THREE.Material][] = [[stickGeo, mPcb], [chipGeo, mChip], [goldGeo, mGold], [labelGeo, mLabel]];
  goldGeo.translate(0, -0.07, 0); labelGeo.translate(0, 0.058, 0.006);
  const stickIM = stickParts.map(([g, m]) => {
    const im = new THREE.InstancedMesh(g, m, 12);
    im.castShadow = false; im.receiveShadow = true; im.frustumCulled = false; im.count = 0; im.visible = false;
    rackG.add(im); return im;
  });
  for (let i = 0; i < 12; i++) { stickAge.push(1); stickShown.push(false); stickScale.push(1); stickX.push(0); stickY.push(0); }
  let stackN = 0, stackMax = 6;
  const _sm = new THREE.Matrix4(), _sp = new THREE.Vector3(), _sq = new THREE.Quaternion(), _ss = new THREE.Vector3();
  const writeSticks = () => {
    for (let i = 0; i < stackN; i++) {
      _sp.set(stickX[i], stickY[i], 0.075); _ss.setScalar(stickScale[i]);
      _sm.compose(_sp, _sq, _ss);
      for (const im of stickIM) im.setMatrixAt(i, _sm);
    }
    for (const im of stickIM) { im.count = stackN; im.visible = stackN > 0; im.instanceMatrix.needsUpdate = true; }
  };
  const layoutSticks = () => {
    const cols = Math.min(Math.max(stackMax, 1), 6);
    const rows = Math.ceil(Math.min(stackMax, 12) / cols);
    for (let i = 0; i < 12; i++) {
      const row = Math.floor(i / cols), col = i % cols;
      stickX[i] = (col - (cols - 1) / 2) * 0.058;
      stickY[i] = rows === 1 ? 0.0 : (row === 0 ? -0.085 : 0.085);
    }
    writeSticks();
  };
  layoutSticks();

  // head
  const head = jt(torso, 0, 0.42, 0);
  mk(rbox(0.66, 0.43, 0.54, 0.16, 6), mShell, head, 0, 0.19, 0);
  mk(rbox(0.5, 0.3, 0.05, 0.07, 3), mBezel, head, 0, 0.215, -0.262);
  const screen = mk(new THREE.PlaneGeometry(0.43, 0.23), mVisor, head, 0, 0.215, -0.2905, false);
  screen.rotation.y = Math.PI;
  for (const sx of [-1, 1]) {
    const pod = mk(cyl(0.105, 0.105, 0.07, 20), mBody, head, sx * 0.34, 0.19, 0); pod.rotation.z = Math.PI / 2;
    const cap = mk(cyl(0.06, 0.06, 0.095, 16), mStripe, head, sx * 0.345, 0.19, 0); cap.rotation.z = Math.PI / 2;
  }
  // top plate + antenna
  mk(cyl(0.05, 0.065, 0.035, 16), mDark, head, 0, 0.4, -0.02);
  const ant = jt(head, 0, 0.415, -0.02);
  mk(cyl(0.011, 0.011, 0.15, 8), mMetal, ant, 0, 0.075, 0, false);
  const bulb = mk(sphere(0.05, 18, 12), mBulb, ant, 0, 0.18, 0, false);
  // head back vent pad (shows from behind)
  mk(rbox(0.3, 0.12, 0.03, 0.02, 2), mDark, head, 0, 0.17, 0.27);
  for (let i = 0; i < 3; i++) mk(rbox(0.24, 0.012, 0.012, 0.004, 2), mRackGlow, head, 0, 0.135 + i * 0.035, 0.288, false);

  // --- skin extras
  const retroGrp = grp(head); retroGrp.visible = false; retroGrp.userData.merge = true;
  mk(rbox(0.46, 0.34, 0.24, 0.07, 4), mRetro, retroGrp, 0, 0.2, 0.36);
  mk(rbox(0.3, 0.22, 0.05, 0.04, 3), mRetro, retroGrp, 0, 0.2, 0.5);
  for (let i = 0; i < 4; i++) mk(rbox(0.3, 0.014, 0.014, 0.004, 2), mDark, retroGrp, 0, 0.12 + i * 0.045, 0.531, false);
  mk(rbox(0.17, 0.026, 0.012, 0.008, 2), mDark, retroGrp, -0.06, 0.024, -0.27, false);
  mk(rbox(0.12, 0.007, 0.008, 0.002, 1), mMetal, retroGrp, -0.06, 0.024, -0.277, false);
  mk(rbox(0.04, 0.022, 0.012, 0.006, 2), mDark, retroGrp, 0.08, 0.024, -0.27, false);
  mk(sphere(0.015, 10, 8), mLed, retroGrp, 0.2, 0.024, -0.273, false);
  const raspGrp = grp(head); raspGrp.visible = false; raspGrp.userData.merge = true;
  const leafGeo = sphere(1, 12, 8);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    const lp = grp(raspGrp, Math.cos(a) * 0.06, 0.4, -0.02 + Math.sin(a) * 0.06);
    lp.rotation.y = -a;
    const leaf = mk(leafGeo, mLeaf, lp, 0.1, 0.01, 0, true);
    leaf.scale.set(0.12, 0.018, 0.055); leaf.rotation.z = 0.28;
  }
  mk(rbox(0.38, 0.03, 0.07, 0.008, 2), mChip, raspGrp, 0, 0.395, 0.14);
  const pins = new THREE.InstancedMesh(new THREE.BoxGeometry(0.014, 0.03, 0.014), mPin, 20);
  const _m4 = new THREE.Matrix4();
  for (let i = 0; i < 20; i++) {
    _m4.makeTranslation(-0.171 + (i >> 1) * 0.038, 0.42, 0.14 + (i & 1 ? 0.016 : -0.016));
    pins.setMatrixAt(i, _m4);
  }
  pins.castShadow = false; raspGrp.add(pins);

  // dizzy stars
  const stars = grp(head, 0, 0.5, 0); stars.visible = false;
  const starGeo = new THREE.OctahedronGeometry(0.035);
  const starM = phys(0xffe14a, 0.3, 0, { emissive: 0xffd000, emissiveIntensity: 2 });
  const starMeshes = [0, 1, 2].map(() => mkReal(starGeo, starM, stars, 0, 0, 0, false));

  // arms
  interface Arm { sh: THREE.Group; el: THREE.Group }
  const makeArm = (sx: number): Arm => {
    const sh = jt(torso, sx * 0.29, 0.3, 0);
    mk(sphere(0.065, 14, 10), mBody, sh);
    mk(capsule(0.046, 0.07), mShell, sh, 0, -0.07, 0);
    const el = jt(sh, 0, -0.14, 0);
    mk(capsule(0.043, 0.05), mShell, el, 0, -0.05, 0);
    const cuff = mk(new THREE.TorusGeometry(0.046, 0.016, 8, 16), mStripe, el, 0, -0.085, 0); cuff.rotation.x = Math.PI / 2;
    const hand = mk(sphere(0.07, 16, 12), mBody, el, 0, -0.14, 0); hand.scale.set(1, 0.95, 1.05);
    return { sh, el };
  };
  const armL = makeArm(-1), armR = makeArm(1);

  // legs
  interface Leg { hip: THREE.Group; knee: THREE.Group; foot: THREE.Group }
  const makeLeg = (sx: number): Leg => {
    const hip = jt(hips, sx * 0.125, -0.03, 0);
    mk(capsule(0.063, 0.1), mShell, hip, 0, -0.085, 0);
    const knee = jt(hip, 0, -0.155, 0);
    mk(sphere(0.062, 12, 8), mShell, knee);
    mk(capsule(0.056, 0.05), mShell, knee, 0, -0.065, 0);
    const foot = jt(knee, 0, -0.115, 0);
    mk(rbox(0.195, 0.1, 0.31, 0.045), mBody, foot, 0, -0.01, -0.045);
    mk(rbox(0.215, 0.05, 0.335, 0.022), mSole, foot, 0, -0.08, -0.05);
    mk(rbox(0.196, 0.062, 0.09, 0.03), mStripe, foot, 0, -0.035, -0.165);
    mk(rbox(0.12, 0.06, 0.03, 0.012), mStripe, foot, 0, -0.015, 0.1);
    const col = mk(new THREE.TorusGeometry(0.062, 0.018, 8, 16), mDark, foot, 0, 0.045, 0); col.rotation.x = Math.PI / 2;
    return { hip, knee, foot };
  };
  const legL = makeLeg(-1), legR = makeLeg(1);

  // shield
  const hexTex = canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = '#000'; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#fff'; c.lineWidth = 6;
    const r = 32, hh = Math.sqrt(3) * r;
    for (let row = -1; row < 6; row++) for (let col = -1; col < 6; col++) {
      const cx = col * r * 3 + (row % 2 ? r * 1.5 : 0), cy = row * hh / 2;
      c.beginPath();
      for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; c.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
      c.closePath(); c.stroke();
    }
  }, false);
  hexTex.wrapS = hexTex.wrapT = THREE.RepeatWrapping;
  const shieldMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    uniforms: { uTex: { value: hexTex }, uTime: { value: 0 }, uCol: { value: new THREE.Color(0x48f0a8) } },
    vertexShader: `varying vec3 vN; varying vec3 vV; varying vec2 vUv;
      void main(){ vUv=uv; vec4 mv=modelViewMatrix*vec4(position,1.0); vN=normalize(normalMatrix*normal); vV=-mv.xyz; gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `uniform sampler2D uTex; uniform float uTime; uniform vec3 uCol; varying vec3 vN; varying vec3 vV; varying vec2 vUv;
      void main(){ float f=1.0-abs(dot(normalize(vN),normalize(vV))); f=pow(f,2.2);
        float hx=texture2D(uTex,vUv*vec2(5.0,3.0)+vec2(uTime*0.03,0.0)).r;
        float sweep=0.5+0.5*sin(vUv.y*14.0-uTime*3.0);
        float a=0.05+f*0.75+hx*(0.22+0.3*sweep)*(0.4+f);
        gl_FragColor=vec4(uCol*(0.8+f*1.2+hx*0.8),clamp(a,0.0,0.9));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const shield = mkReal(sphere(1, 32, 20), shieldMat, root, 0, 0.66, 0.05, false);
  shield.castShadow = false; shield.receiveShadow = false;
  shield.scale.set(0.62, 0.82, 0.68); shield.visible = false;

  // overclock flames
  const flameMatA = new THREE.MeshBasicMaterial({ color: 0xff5a14, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });
  const flameMatB = new THREE.MeshBasicMaterial({ color: 0xffb530, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false });
  const flames = grp(inner, 0, 0.3, 0.4); flames.visible = false;
  const flameList: { m: THREE.Mesh; base: number; ph: number }[] = [];
  const flameGeo = new THREE.ConeGeometry(0.1, 1, 14, 1, true);
  flameGeo.translate(0, -0.5, 0); // apex at origin, base trailing -Y
  const flameDefs: [number, number, number, number, boolean][] = [[0, 0, 0, 1.2, false], [0, 0, 0, 0.75, true], [-0.17, -0.08, 0.1, 0.7, false], [0.17, -0.08, 0.1, 0.7, false]];
  for (const [fx, fy, fz, len, core] of flameDefs) {
    const f = new THREE.Mesh(flameGeo, core ? flameMatB : flameMatA);
    f.position.set(fx, fy, fz);
    f.rotation.x = -Math.PI / 2; // base points +Z (trailing behind)
    f.scale.set(core ? 0.6 : 1, len, core ? 0.6 : 1);
    flames.add(f);
    flameList.push({ m: f, base: len, ph: Math.random() * 6 });
  }
  const heelFlameL = new THREE.Mesh(flameGeo, flameMatA), heelFlameR = new THREE.Mesh(flameGeo, flameMatA);
  for (const hf of [heelFlameL, heelFlameR]) { hf.rotation.x = -Math.PI / 2; hf.scale.set(0.45, 0.4, 0.45); hf.position.set(0, -0.05, 0.12); }
  legL.foot.add(heelFlameL); legR.foot.add(heelFlameR);
  heelFlameL.visible = heelFlameR.visible = false;

  finalizeRig(root, { cast: [mShell, mBody, mDark, mRack, mSole, mScarf, mStripe], pad: 0.6 });

  // ---- state
  const cur = new Float32Array(J.N);
  cur[J.sx] = 1; cur[J.sy] = 1;
  const tgt = new Float32Array(J.N);
  let skinId: SkinId = 'kilo';
  let rgbOn = false, ocOn = false, hitT = 0, shieldOn = false;
  let antA = 0, antV = 0, antAz = 0, antVz = 0, prevBY = 0;
  let curState: KiloState = 'idle';
  const _col = new THREE.Color();
  const bodyMats = [mShell, mBody, mScarf];

  const refreshVisor = () => {
    const sk = SKINS[skinId];
    if (hitT > 0 && eyeMode === 2) mVisor.emissive.setRGB(1, 0.16, 0.18);
    else if (!rgbOn) mVisor.emissive.setHex(sk.eye);
    mVisor.emissiveIntensity = ocOn ? 2.6 : 1.8;
  };
  const setSkin = (id: SkinId) => {
    const sk = SKINS[id] ?? SKINS.kilo;
    skinId = SKINS[id] ? id : 'kilo';
    mShell.color.setHex(sk.shell); mBody.color.setHex(sk.body); mScarf.color.setHex(sk.scarf);
    mStripe.color.setHex(sk.stripe); mRack.color.setHex(sk.rack); mBezel.color.setHex(sk.bezel);
    mSole.color.setHex(sk.sole); mRackGlow.color.setHex(sk.stick); mRackGlow.emissive.setHex(sk.stick);
    mPcb.emissive.setHex(sk.stick); mLabel.emissive.setHex(0xffffff);
    rgbOn = skinId === 'rgb';
    mStripe.emissive.setHex(0); mBezel.emissive.setHex(0);
    mStripe.emissiveIntensity = 1; mBezel.emissiveIntensity = 1;
    if (rgbOn) { mStripe.emissiveIntensity = 2.2; mBezel.emissiveIntensity = 1.8; mRackGlow.emissiveIntensity = 2.2; }
    else mRackGlow.emissiveIntensity = 0.9;
    mShell.roughness = rgbOn ? 0.6 : 0.34; mBody.roughness = rgbOn ? 0.55 : 0.38;
    mShell.clearcoat = mBody.clearcoat = rgbOn ? 0.15 : 0.7;
    mShell.metalness = mBody.metalness = skinId === 'retro' ? 0 : 0;
    mShell.roughness = skinId === 'retro' ? 0.55 : mShell.roughness; mBody.roughness = skinId === 'retro' ? 0.55 : mBody.roughness;
    mShell.clearcoat = mBody.clearcoat = skinId === 'retro' ? 0.15 : mShell.clearcoat;
    const bump = skinId === 'rasp' ? raspBump : null;
    if (mBody.bumpMap !== bump) { mBody.bumpMap = bump; mShell.bumpMap = bump; mBody.bumpScale = 1.2; mShell.bumpScale = 1.2; mBody.needsUpdate = true; mShell.needsUpdate = true; }
    retroGrp.visible = skinId === 'retro'; raspGrp.visible = skinId === 'rasp';
    refreshVisor();
  };
  setSkin(skin as SkinId);

  const setStack = (n: number, max: number) => {
    const m = clamp(Math.round(max), 1, 12);
    if (m !== stackMax) { stackMax = m; layoutSticks(); }
    stackN = clamp(Math.round(n), 0, m);
    for (let i = 0; i < 12; i++) {
      const show = i < stackN;
      if (show && !stickShown[i]) { stickAge[i] = 0; stickScale[i] = 0.001; }
      stickShown[i] = show;
      if (!show) stickAge[i] = 0;
    }
    writeSticks();
  };
  setStack(0, 6);

  const pose = (dtRaw: number, p: KiloPose) => {
    const dt = clamp(dtRaw, 0, 0.05);
    const t = p.t;
    const st = p.state;
    for (let i = 0; i < J.N; i++) tgt[i] = 0;
    tgt[J.sx] = 1; tgt[J.sy] = 1;
    let k = 22;
    const spd = Math.max(p.speed, 0);
    const lean = clamp(p.lean, -1, 1);
    if (st === 'run') {
      const freq = clamp(1.4 + spd * 0.085, 1.4, 4.2);
      const ph = t * freq * TAU;
      const s = Math.sin(ph), c = Math.cos(ph);
      const s2 = Math.sin(ph + Math.PI), c2 = Math.cos(ph + Math.PI);
      tgt[J.lThigh] = s * 0.95 + 0.12; tgt[J.rThigh] = s2 * 0.95 + 0.12;
      tgt[J.lKnee] = -(0.22 + 1.0 * Math.max(0, c)); tgt[J.rKnee] = -(0.22 + 1.0 * Math.max(0, c2));
      tgt[J.lArmX] = -s * 1.0 + 0.1; tgt[J.rArmX] = -s2 * 1.0 + 0.1;
      tgt[J.lElbow] = 0.8 + 0.3 * c; tgt[J.rElbow] = 0.8 + 0.3 * c2;
      tgt[J.lArmZ] = 0.18; tgt[J.rArmZ] = -0.18;
      tgt[J.bodyY] = 0.035 * Math.cos(2 * ph) + 0.01;
      tgt[J.pitch] = -0.16 - 0.04 * Math.sin(2 * ph);
      tgt[J.roll] = -lean * 0.3 + Math.sin(ph) * 0.035;
      tgt[J.headX] = 0.1 + Math.sin(2 * ph + 1) * 0.04; tgt[J.headZ] = Math.sin(ph) * 0.06 + lean * 0.12;
      tgt[J.yaw] = -lean * 0.12; tgt[J.headY] = lean * 0.15;
      tgt[J.sy] = 1 + 0.02 * Math.cos(2 * ph + 0.5); tgt[J.sx] = 1 / Math.sqrt(tgt[J.sy]);
    } else if (st === 'jump') {
      const up = clamp(p.vy / 5, -1, 1);
      const fall = smooth01(-up * 1.2 + 0.4);
      tgt[J.lThigh] = lerp(0.95, 0.5, fall); tgt[J.rThigh] = lerp(0.75, 0.2, fall);
      tgt[J.lKnee] = lerp(-1.5, -0.7, fall); tgt[J.rKnee] = lerp(-1.3, -0.3, fall);
      tgt[J.lArmX] = lerp(2.5, 2.1, fall); tgt[J.rArmX] = lerp(2.5, 2.1, fall);
      tgt[J.lArmZ] = lerp(0.3, 0.8, fall); tgt[J.rArmZ] = -lerp(0.3, 0.8, fall);
      tgt[J.lElbow] = 0.2; tgt[J.rElbow] = 0.2;
      tgt[J.pitch] = lerp(-0.1, -0.02, fall); tgt[J.roll] = -lean * 0.25;
      tgt[J.headX] = lerp(0.12, -0.06, fall); tgt[J.headZ] = lean * 0.1;
      const str = clamp(Math.abs(p.vy) * 0.022, 0, 0.14);
      tgt[J.sy] = 1 + str - (fall > 0.5 ? 0.0 : 0.0); tgt[J.sx] = 1 / Math.sqrt(tgt[J.sy]);
      tgt[J.bodyY] = 0.02;
      k = 16;
    } else if (st === 'slide') {
      tgt[J.bodyY] = -0.17; tgt[J.pitch] = 0.62;
      tgt[J.lThigh] = 1.5; tgt[J.rThigh] = 1.42; tgt[J.lKnee] = -0.1; tgt[J.rKnee] = -0.05;
      tgt[J.lArmX] = -1.0 + Math.sin(t * 9) * 0.05; tgt[J.rArmX] = -0.9; tgt[J.lArmZ] = 0.55; tgt[J.rArmZ] = -0.55;
      tgt[J.lElbow] = 0.3; tgt[J.rElbow] = 0.3;
      tgt[J.headX] = -0.55; tgt[J.roll] = -lean * 0.2; tgt[J.headZ] = lean * 0.1;
      k = 18;
    } else if (st === 'stumble') {
      const w = Math.sin(t * 15);
      tgt[J.pitch] = -0.5; tgt[J.bodyY] = -0.05;
      tgt[J.lThigh] = w * 0.9 + 0.2; tgt[J.rThigh] = -w * 0.9 + 0.2; tgt[J.lKnee] = -0.6; tgt[J.rKnee] = -0.6;
      tgt[J.lArmX] = 1.0 + Math.sin(t * 17) * 1.1; tgt[J.rArmX] = 1.0 + Math.cos(t * 19) * 1.1;
      tgt[J.lArmZ] = 0.9; tgt[J.rArmZ] = -0.9; tgt[J.lElbow] = 0.3; tgt[J.rElbow] = 0.3;
      tgt[J.roll] = Math.sin(t * 11) * 0.2; tgt[J.headX] = 0.3; tgt[J.headZ] = Math.sin(t * 13) * 0.25;
      tgt[J.sy] = 0.96; tgt[J.sx] = 1.03;
    } else if (st === 'dead') {
      tgt[J.pitch] = 1.42; tgt[J.bodyY] = -0.2;
      tgt[J.lThigh] = 1.55; tgt[J.rThigh] = 1.3; tgt[J.lKnee] = -0.5; tgt[J.rKnee] = -0.9;
      tgt[J.lArmX] = 0.5; tgt[J.rArmX] = 0.3; tgt[J.lArmZ] = 1.25; tgt[J.rArmZ] = -1.2; tgt[J.lElbow] = 0.2; tgt[J.rElbow] = 0.2;
      tgt[J.headX] = -0.15; tgt[J.headZ] = 0.2 + Math.sin(t * 2) * 0.05; tgt[J.roll] = 0.0;
      k = 10;
    } else if (st === 'ride') {
      tgt[J.bodyY] = -0.13; tgt[J.pitch] = -0.45;
      tgt[J.lThigh] = 0.85; tgt[J.rThigh] = 0.8; tgt[J.lKnee] = -1.55; tgt[J.rKnee] = -1.5;
      tgt[J.lArmX] = 0.3 + Math.sin(t * 3) * 0.08; tgt[J.rArmX] = 0.3 + Math.cos(t * 3) * 0.08; tgt[J.lArmZ] = 1.35; tgt[J.rArmZ] = -1.35;
      tgt[J.lElbow] = 0.15; tgt[J.rElbow] = 0.15;
      tgt[J.roll] = -lean * 0.3 + Math.sin(t * 2.3) * 0.05; tgt[J.headX] = 0.35; tgt[J.headZ] = lean * 0.12;
      tgt[J.yaw] = 0.25; tgt[J.headY] = -0.25;
      k = 14;
    } else if (st === 'parachute') {
      tgt[J.lThigh] = 0.12 + Math.sin(t * 2.2) * 0.12; tgt[J.rThigh] = 0.05 + Math.sin(t * 2.2 + 1.5) * 0.12;
      tgt[J.lKnee] = -0.25; tgt[J.rKnee] = -0.4;
      tgt[J.lArmX] = 3.0; tgt[J.rArmX] = 3.0; tgt[J.lArmZ] = 0.16; tgt[J.rArmZ] = -0.16; tgt[J.lElbow] = 0.1; tgt[J.rElbow] = 0.1;
      tgt[J.roll] = -lean * 0.15 + Math.sin(t * 1.7) * 0.09; tgt[J.pitch] = Math.sin(t * 1.3) * 0.04;
      tgt[J.headX] = 0.28; tgt[J.headZ] = Math.sin(t * 1.7 + 1) * 0.07; tgt[J.bodyY] = 0.02;
      k = 10;
    } else if (st === 'celebrate') {
      const b = Math.abs(Math.sin(t * 6.5));
      tgt[J.innerY] = b * 0.2;
      tgt[J.lThigh] = b * 0.5; tgt[J.rThigh] = b * 0.5; tgt[J.lKnee] = -b * 0.9; tgt[J.rKnee] = -b * 0.9;
      tgt[J.lArmX] = 2.75 + Math.sin(t * 13) * 0.35; tgt[J.rArmX] = 2.75 + Math.sin(t * 13 + 1.6) * 0.35;
      tgt[J.lArmZ] = 0.45; tgt[J.rArmZ] = -0.45; tgt[J.lElbow] = 0.2; tgt[J.rElbow] = 0.2;
      tgt[J.yaw] = Math.sin(t * 3.2) * 0.6; tgt[J.headZ] = Math.sin(t * 6.5) * 0.12; tgt[J.headX] = 0.1;
      tgt[J.pitch] = -0.04; tgt[J.sy] = 1 + (0.5 - b) * 0.08; tgt[J.sx] = 1 / Math.sqrt(tgt[J.sy]);
      k = 16;
    } else { // idle
      const b = Math.sin(t * 2.6);
      tgt[J.sy] = 1 + b * 0.014; tgt[J.sx] = 1 / Math.sqrt(tgt[J.sy]);
      tgt[J.lThigh] = 0.04; tgt[J.rThigh] = -0.02; tgt[J.lKnee] = -0.04; tgt[J.rKnee] = -0.02;
      tgt[J.lArmX] = Math.sin(t * 1.3) * 0.08; tgt[J.rArmX] = -Math.sin(t * 1.3) * 0.08;
      tgt[J.lArmZ] = 0.16 + b * 0.02; tgt[J.rArmZ] = -0.16 - b * 0.02; tgt[J.lElbow] = 0.12; tgt[J.rElbow] = 0.12;
      tgt[J.headY] = Math.sin(t * 0.7) * 0.28; tgt[J.headZ] = Math.sin(t * 0.9) * 0.05; tgt[J.headX] = Math.sin(t * 1.1) * 0.05;
      tgt[J.yaw] = Math.sin(t * 0.5) * 0.1;
    }
    if (st !== curState) curState = st;
    // landing squash impulse
    const ls = clamp(p.landSquash, 0, 1);
    tgt[J.sy] *= 1 - 0.28 * ls; tgt[J.sx] *= 1 + 0.16 * ls;
    tgt[J.bodyY] -= 0.05 * ls;
    const a = 1 - Math.exp(-dt * k);
    for (let i = 0; i < J.N; i++) cur[i] += (tgt[i] - cur[i]) * a;
    // landing squash is applied immediately (it's already an impulse)
    cur[J.sy] = Math.min(cur[J.sy], 1 - 0.26 * ls + 0.0001 + (cur[J.sy] - 1) * (1 - ls));
    cur[J.sx] = Math.max(cur[J.sx], 1 + 0.15 * ls);

    // apply
    legL.hip.rotation.x = cur[J.lThigh]; legR.hip.rotation.x = cur[J.rThigh];
    legL.knee.rotation.x = cur[J.lKnee]; legR.knee.rotation.x = cur[J.rKnee];
    legL.foot.rotation.x = -(cur[J.lThigh] + cur[J.lKnee]) * 0.75; legR.foot.rotation.x = -(cur[J.rThigh] + cur[J.rKnee]) * 0.75;
    legL.hip.rotation.z = -0.02; legR.hip.rotation.z = 0.02;
    armL.sh.rotation.x = cur[J.lArmX]; armR.sh.rotation.x = cur[J.rArmX];
    armL.sh.rotation.z = cur[J.lArmZ]; armR.sh.rotation.z = cur[J.rArmZ];
    armL.el.rotation.x = cur[J.lElbow]; armR.el.rotation.x = cur[J.rElbow];
    hips.position.y = 0.38 + cur[J.bodyY];
    torso.rotation.x = cur[J.pitch];
    inner.rotation.z = cur[J.roll];
    inner.rotation.y = cur[J.yaw];
    inner.position.y = cur[J.innerY];
    head.rotation.x = cur[J.headX]; head.rotation.z = cur[J.headZ]; head.rotation.y = cur[J.headY];
    inner.scale.set(cur[J.sx], cur[J.sy], cur[J.sx]);

    // scarf tails & antenna spring
    const flap = clamp(spd / 12, 0, 1.2);
    const fl = st === 'run' ? flap : st === 'jump' || st === 'ride' ? 0.8 : 0.15;
    tailA.rotation.x = -(0.25 + fl * 1.0) + Math.sin(t * 11) * 0.18 * fl + Math.sin(t * 2) * 0.05;
    tailA.rotation.z = Math.sin(t * 7.3) * 0.18 * fl;
    tailB.rotation.x = -(0.2 + fl * 0.8) + Math.sin(t * 13 + 1) * 0.2 * fl;
    tailB.rotation.z = -Math.sin(t * 6.1) * 0.2 * fl;
    const by = hips.position.y + cur[J.innerY];
    const acc = dt > 0 ? (by - prevBY) / dt : 0;
    prevBY = by;
    const inX = clamp(-acc * 0.04 - p.vy * 0.015, -0.7, 0.7);
    const sub = 3, h = dt / sub;
    const tx = -cur[J.pitch] * 0.5 + inX, tz = -cur[J.roll] * 0.6 - cur[J.headZ] * 0.4;
    for (let i = 0; i < sub; i++) {
      antV += (-170 * (antA - tx) - 7 * antV) * h; antA += antV * h;
      antVz += (-170 * (antAz - tz) - 7 * antVz) * h; antAz += antVz * h;
    }
    ant.rotation.x = clamp(antA, -1, 1); ant.rotation.z = clamp(antAz, -1, 1);

    // stick pop-in + glow
    mPcb.emissiveIntensity = 0.95 + Math.sin(t * 4) * 0.2;
    for (let i = 0; i < 12; i++) {
      if (!stickShown[i]) continue;
      stickAge[i] += dt;
      const u = clamp(stickAge[i] / 0.38, 0, 1);
      const c1 = 1.9, c3 = c1 + 1;
      const e = 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2); // easeOutBack
      stickScale[i] = Math.max(e, 0.001);
    }
    if (stackN > 0) writeSticks();

    // rgb cycling
    if (rgbOn) {
      const hue = (t * 0.25) % 1;
      mStripe.emissive.setHSL(hue, 1, 0.5); mStripe.color.setHSL(hue, 0.6, 0.25);
      mBezel.emissive.setHSL((hue + 0.33) % 1, 1, 0.5);
      mRackGlow.emissive.setHSL((hue + 0.66) % 1, 1, 0.5); mRackGlow.color.setHSL((hue + 0.66) % 1, 1, 0.5);
      mPcb.emissive.setHSL((hue + 0.15) % 1, 1, 0.5);
      mVisor.emissive.setHSL((hue + 0.5) % 1, 1, 0.65);
      mScarf.emissive.setHSL((hue + 0.8) % 1, 1, 0.4); mScarf.emissiveIntensity = 0.7;
    } else if (mScarf.emissiveIntensity !== 0) { mScarf.emissiveIntensity = 0; }

    // eyes
    if (hitT > 0) hitT = Math.max(0, hitT - dt);
    let mode = 0;
    if (hitT > 0 || st === 'dead') mode = 2;
    else if (ocOn) mode = 3;
    else if ((t % 3.4) < 0.11 && st !== 'stumble') mode = 1;
    else if (st === 'stumble') mode = 2;
    if (mode !== eyeMode) { drawEyes(mode); refreshVisor(); }
    if (mode === 2 && (hitT > 0) && !rgbOn) mVisor.emissive.setRGB(1, 0.16, 0.18);
    // hit flash
    const fh = clamp(hitT / 0.5, 0, 1);
    for (const m of bodyMats) {
      if (m === mScarf && rgbOn) continue;
      if (fh > 0) { m.emissive.setRGB(1, 0.35 + 0.65 * (1 - fh), 0.35 + 0.65 * (1 - fh)); m.emissiveIntensity = fh * 0.9; }
      else if (m !== mScarf) m.emissiveIntensity = 0;
    }
    if (fh === 0 && !rgbOn) { mShell.emissive.setHex(0); mBody.emissive.setHex(0); mScarf.emissive.setHex(0); }

    // dizzy stars
    stars.visible = st === 'dead';
    if (st === 'dead') for (let i = 0; i < 3; i++) {
      const aa = t * 3 + i * TAU / 3;
      starMeshes[i].position.set(Math.cos(aa) * 0.3, Math.sin(t * 5 + i) * 0.03, Math.sin(aa) * 0.3);
      starMeshes[i].rotation.y = t * 4;
    }
    // shield / flames
    if (shieldOn) {
      shieldMat.uniforms.uTime.value = t;
      const bs = 1 + Math.sin(t * 3) * 0.02;
      shield.scale.set(0.62 * bs, 0.82 * bs, 0.68 * bs);
      shield.rotation.y = t * 0.4;
    }
    if (ocOn) {
      for (const f of flameList) {
        const fk = 1 + Math.sin(t * 38 + f.ph) * 0.18 + Math.sin(t * 23 + f.ph * 2) * 0.1;
        f.m.scale.y = f.base * fk * (0.7 + clamp(spd / 14, 0, 1) * 0.6);
      }
      const hk = 0.4 + Math.sin(t * 41) * 0.1;
      heelFlameL.scale.y = hk; heelFlameR.scale.y = hk * 0.9;
      const show = st === 'run' || st === 'jump' || st === 'slide' || st === 'celebrate' || st === 'ride';
      heelFlameL.visible = heelFlameR.visible = show;
      flames.visible = true;
    }
  };

  return {
    root, stackAnchor,
    setSkin: (id) => setSkin(id),
    setStack,
    setShield: (on) => { shieldOn = on; shield.visible = on; },
    setOverclock: (on) => { ocOn = on; flames.visible = on; heelFlameL.visible = heelFlameR.visible = on; refreshVisor(); if (!on) eyeMode = -1; },
    flashHit: () => { hitT = 0.9; drawEyes(2); refreshVisor(); },
    pose,
  };
}
function smooth01(x: number): number { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); }

// ---------------------------------------------------------------- ALLOCMAN / THE UTILIZER
export function buildAllocman(): AllocmanRig {
  const root = new THREE.Group();
  root.name = 'Sam';
  beginRig();
  const inner = grp(root);

  // ---- textures
  const treadTex = canvasTex(64, 128, (c, w, h) => {
    c.fillStyle = '#17191e'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 4; i++) {
      c.fillStyle = '#2b2f38'; c.fillRect(0, i * 32 + 3, w, 18);
      c.fillStyle = '#0c0d10'; c.fillRect(0, i * 32 + 22, w, 3);
    }
  });
  treadTex.wrapS = treadTex.wrapT = THREE.RepeatWrapping;
  treadTex.repeat.set(1, 1);
  const ledPanel = (c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, rows: number) => {
    for (let r = 0; r < rows; r++) {
      const yy = y + r * (h / rows);
      c.fillStyle = '#1a1e26'; rrect(c, x, yy + 2, w, h / rows - 4, 6); c.fill();
      c.fillStyle = '#0d1015'; rrect(c, x + 14, yy + 10, w * 0.56, h / rows - 20, 4); c.fill();
      c.fillStyle = '#4a5568'; c.fillRect(x + w * 0.62, yy + h / rows * 0.4, w * 0.2, 5);
      c.fillStyle = '#313846'; c.fillRect(x + w * 0.62, yy + h / rows * 0.4 + 12, w * 0.14, 4);
    }
  };
  const rearTex = canvasTex(1024, 512, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#454e63'); g.addColorStop(1, '#394155');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    ledPanel(c, 24, 24, w - 48, h - 48, 6);
    c.fillStyle = 'rgba(0,0,0,0.5)';
    for (let i = 0; i < 40; i++) c.fillRect(120 + i * 22, 440, 8, 36);
  });
  const frontTex = canvasTex(1024, 512, (c, w, h) => {
    c.fillStyle = '#424b60'; c.fillRect(0, 0, w, h);
    ledPanel(c, 24, 24, w - 48, h - 130, 4);
    c.fillStyle = '#ffc533'; c.font = 'bold 40px sans-serif'; c.textAlign = 'center';
    c.fillText('MAXIMUM UTILIZATION', w / 2, h - 46);
    c.fillStyle = '#ffc533';
    for (let i = 0; i < 14; i++) { c.save(); c.translate(i * 80 - 20, h - 100); c.rotate(-0.6); c.fillRect(0, 0, 36, 20); c.restore(); }
  });
  const plateTex = canvasTex(1024, 256, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#fbd23c'); g.addColorStop(1, '#e8a812');
    c.fillStyle = g; rrect(c, 4, 4, w - 8, h - 8, 36); c.fill();
    c.strokeStyle = '#1a1c22'; c.lineWidth = 10; rrect(c, 18, 18, w - 36, h - 36, 26); c.stroke();
    c.fillStyle = '#16181d'; c.textAlign = 'left';
    c.font = '900 92px "Arial Black", Impact, sans-serif'; c.fillText('THE UTILIZER', 56, 140);
    c.font = 'bold 36px "Arial Black", sans-serif'; c.fillStyle = '#7a1f12'; c.fillText('MAXIMUM UTILIZATION', 60, 208);
  });
  const sideTex = canvasTex(512, 256, (c, w, h) => {
    c.fillStyle = '#454e63'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 9; i++) { c.fillStyle = '#2a303d'; rrect(c, 30, 20 + i * 24, w - 60, 14, 6); c.fill(); }
    c.fillStyle = '#ffc533';
    for (let i = 0; i < 12; i++) { c.save(); c.translate(i * 48, h - 30); c.rotate(-0.7); c.fillRect(0, 0, 22, 40); c.restore(); }
  });
  const hoseNormal = canvasTex(8, 64, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#555'); g.addColorStop(0.5, '#fff'); g.addColorStop(1, '#555');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
  }, false);
  hoseNormal.wrapS = hoseNormal.wrapT = THREE.RepeatWrapping;
  const glowGrad = canvasTex(16, 128, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#220500'); g.addColorStop(0.6, '#c42d0a'); g.addColorStop(1, '#ffb347');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
  });
  const hazard = canvasTex(256, 32, (c, w, h) => {
    c.fillStyle = '#17181c'; c.fillRect(0, 0, w, h); c.fillStyle = '#ffc533';
    for (let i = -2; i < 12; i++) { c.beginPath(); c.moveTo(i * 28, h); c.lineTo(i * 28 + 14, h); c.lineTo(i * 28 + 14 + h, 0); c.lineTo(i * 28 + h, 0); c.fill(); }
  });
  hazard.wrapS = hazard.wrapT = THREE.RepeatWrapping;

  // ---- materials
  const mSlate = phys(0x5b6882, 0.4, 0.45, { clearcoat: 0.5, clearcoatRoughness: 0.3 });
  const mSlateL = phys(0x8795b0, 0.38, 0.45, { clearcoat: 0.4 });
  const mDarkM = phys(0x1c1f27, 0.5, 0.6);
  const mRubber = phys(0xffffff, 0.8, 0.0, { map: treadTex });
  const mHub = phys(0xc7ced8, 0.25, 0.9);
  const mYellow = phys(0xffc533, 0.45, 0.2, { clearcoat: 0.5 });
  const mHazard = phys(0xffffff, 0.5, 0.1, { map: hazard });
  const mRedGlow = phys(0x300500, 0.35, 0.2, { emissive: 0xff3a14, emissiveIntensity: 2 });
  const mInner = phys(0x401000, 0.5, 0.1, { map: glowGrad, emissive: 0xffffff, emissiveMap: glowGrad, emissiveIntensity: 1.5, side: THREE.DoubleSide });
  const mHose = phys(0x2a2e38, 0.45, 0.4, { clearcoat: 0.6, clearcoatRoughness: 0.35, bumpMap: hoseNormal, bumpScale: 2.5 });
  hoseNormal.repeat.set(1, 1);
  const mNozzle = phys(0x6a7488, 0.3, 0.75, { clearcoat: 0.5, side: THREE.DoubleSide });
  const mRim = phys(0x400a00, 0.3, 0.2, { emissive: 0xff4a1c, emissiveIntensity: 2.2 });
  const mSkin = phys(0xf2b48a, 0.55, 0, { sheen: 0.4, sheenColor: new THREE.Color(0xffd0b0) });
  const mSkinDark = phys(0xe29e78, 0.6, 0);
  const mSweater = phys(0x80858f, 0.9, 0, { sheen: 1, sheenColor: new THREE.Color(0xc4c8d0), sheenRoughness: 0.7 });
  const mSweaterRib = phys(0x7a7f88, 0.95, 0);
  const mJeans = phys(0x35527f, 0.85, 0);
  const mShoe = phys(0xf4f4f2, 0.45, 0, { clearcoat: 0.4 });
  const mSole = phys(0xd9d4c8, 0.7, 0);
  const mMicBody = phys(0x23262d, 0.35, 0.6);
  const mFoam = phys(0xe8532f, 0.95, 0);
  const mHair = phys(0x4a2c1b, 0.8, 0, { sheen: 0.3, sheenColor: new THREE.Color(0x7a5236), emissive: 0x2a160c, emissiveIntensity: 0.15 });
  const mHeadGlow = phys(0x0a2a20, 0.4, 0, { emissive: 0x38ffb0, emissiveIntensity: 2 });
  const faceTex = {} as Record<SamExpr, THREE.CanvasTexture>;
  for (const e of ['neutral', 'smug', 'shock', 'glee', 'worried', 'blink'] as SamExpr[]) {
    const t = new THREE.CanvasTexture(makeSamFaceCanvas(512, e)); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; faceTex[e] = t;
  }
  const mFace = phys(0xffffff, 1, 0, { map: faceTex.neutral, emissive: 0xffffff, emissiveMap: faceTex.neutral, emissiveIntensity: 0.12, transparent: true, alphaTest: 0.04 });
  const mPlate = phys(0xffffff, 0.45, 0.2, { map: plateTex, clearcoat: 0.6 });
  const mRear = phys(0xffffff, 0.55, 0.3, { map: rearTex });
  const mFront = phys(0xffffff, 0.55, 0.3, { map: frontTex });
  const mSide = phys(0xffffff, 0.55, 0.3, { map: sideTex });
  const mSmoke = new THREE.MeshBasicMaterial({ color: 0x9aa2b0, transparent: true, opacity: 0.22, depthWrite: false });
  const mAmber = phys(0x402000, 0.3, 0, { emissive: 0xffa01a, emissiveIntensity: 2 });
  const mFanBlade = phys(0x9aa4b4, 0.35, 0.7);

  // ---- chassis & treads
  const bodyG = jt(inner);       // suspension bob
  const treads: { g: THREE.Group; wheels: THREE.Group[] }[] = [];
  for (const sx of [-1, 1]) {
    const g = jt(inner, sx * 1.78, 0, 0);
    const belt = mk(rbox(0.86, 0.94, 3.9, 0.4, 6), mRubber, g, 0, 0.47, 0);
    belt.castShadow = true;
    const wheels: THREE.Group[] = [];
    for (const z of [-1.5, 0, 1.5]) {
      const w = jt(g, sx * 0.43, 0.47, z);
      const r = z === 0 ? 0.3 : 0.4;
      const disc = mk(cyl(r, r, 0.08, 24), mHub, w); disc.rotation.z = Math.PI / 2;
      const rim = mk(new THREE.TorusGeometry(r * 0.78, 0.035, 8, 24), mRedGlow, w, sx * 0.045, 0, 0, false); rim.rotation.y = Math.PI / 2;
      for (let k = 0; k < 5; k++) {
        const bolt = mk(sphere(0.045, 8, 6), mDarkM, w, sx * 0.05, Math.cos(k * TAU / 5) * r * 0.5, Math.sin(k * TAU / 5) * r * 0.5, false);
        bolt.scale.set(0.5, 1, 1);
      }
      wheels.push(w);
    }
    mk(rbox(1.0, 0.14, 4.1, 0.07, 3), mDarkM, g, 0, 1.0, 0);
    mk(rbox(0.5, 0.05, 4.12, 0.02, 2), mYellow, g, sx * 0.0, 1.07, 0);
    mk(rbox(0.95, 0.12, 0.5, 0.05, 3), mDarkM, g, 0, 0.99, -2.12 - 0.0);
    treads.push({ g, wheels });
  }

  // main cabinet
  mk(rbox(2.95, 1.55, 3.2, 0.16, 5), mSlate, bodyG, 0, 1.82, 0);
  mk(rbox(3.1, 0.22, 3.35, 0.09, 4), mSlateL, bodyG, 0, 1.06, 0);        // skirt
  mk(rbox(3.05, 0.14, 3.3, 0.07, 4), mYellow, bodyG, 0, 2.62, 0);        // top trim
  mk(rbox(2.9, 0.12, 3.2, 0.06, 3), mDarkM, bodyG, 0, 2.7, 0.0);
  // decals (planes on faces)
  const rearP = mk(new THREE.PlaneGeometry(2.7, 1.05), mRear, bodyG, 0, 1.4, 1.61, false);
  const plateP = mk(new THREE.PlaneGeometry(2.6, 0.65), mPlate, bodyG, 0, 2.2, 1.615, false);
  const frontP = mk(new THREE.PlaneGeometry(2.7, 1.3), mFront, bodyG, 0, 1.85, -1.61, false); frontP.rotation.y = Math.PI;
  for (const sx of [-1, 1]) {
    const sp = mk(new THREE.PlaneGeometry(2.8, 1.2), mSide, bodyG, sx * 1.485, 1.82, 0, false);
    sp.rotation.y = sx * Math.PI / 2;
  }
  rearP.receiveShadow = plateP.receiveShadow = false;
  // rear fans
  const fans: THREE.Group[] = [];
  for (const sx of [-1, 1]) {
    const f = grp(bodyG, sx * 0.85, 1.4, 1.68);
    mk(new THREE.TorusGeometry(0.42, 0.06, 10, 28), mDarkM, f, 0, 0, 0);
    mk(cyl(0.36, 0.36, 0.04, 28), mDarkM, f, 0, 0, -0.03, false).rotation.x = Math.PI / 2;
    const rot = jt(f, 0, 0, 0.0);
    for (let k = 0; k < 7; k++) {
      const bl = mk(rbox(0.3, 0.12, 0.025, 0.02, 2), mFanBlade, rot, 0, 0, 0, false);
      const a = k * TAU / 7;
      bl.position.set(Math.cos(a) * 0.2, Math.sin(a) * 0.2, 0); bl.rotation.z = a; bl.rotation.x = 0.5;
    }
    mk(cyl(0.1, 0.1, 0.07, 14), mRedGlow, rot, 0, 0, 0.0, false).rotation.x = Math.PI / 2;
    fans.push(rot);
    // grille bars
    for (let k = -2; k <= 2; k++) mk(rbox(0.8, 0.018, 0.02, 0.006, 2), mDarkM, f, 0, k * 0.15, 0.06, false);
  }
  // LEDs: ONE instanced mesh; per-instance colour carries the blink (6 blink groups, 3 colours)
  const ledCols = [0x3dff7a, 0xffb020, 0xff3a3a];
  const ledFreq: number[] = [];
  for (let ci = 0; ci < 3; ci++) for (let v = 0; v < 2; v++) ledFreq.push(1.3 + ci * 1.7 + v * 2.9);
  const ledPos: THREE.Vector3[] = [], ledGrp: number[] = [];
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const addLed = (x: number, y: number, z: number) => { ledGrp.push(Math.floor(rnd() * 6)); ledPos.push(new THREE.Vector3(x, y, z)); };
  for (let r = 0; r < 6; r++) for (let k = 0; k < 8; k++) { addLed(-1.12 + k * 0.075 - 0.0, 1.2 + r * 0.14 - 0.0, 1.635); addLed(0.55 + k * 0.075, 1.2 + r * 0.14, 1.635); }
  for (let r = 0; r < 7; r++) for (let k = 0; k < 8; k++) { addLed(-1.15 + k * 0.075, 1.5 + r * 0.14, -1.625); addLed(0.57 + k * 0.075, 1.5 + r * 0.14, -1.625); }
  const _mm = new THREE.Matrix4();
  const ledMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const ledIM = new THREE.InstancedMesh(new THREE.BoxGeometry(0.045, 0.045, 0.03), ledMat, ledPos.length);
  ledPos.forEach((v, j) => { _mm.makeTranslation(v.x, v.y, v.z); ledIM.setMatrixAt(j, _mm); });
  ledIM.frustumCulled = false;
  bodyG.add(ledIM);
  const ledC = ledCols.map((c) => new THREE.Color(c));
  const _lc = new THREE.Color();
  let ledSig = -1;
  // exhaust stacks + smoke
  const puffX: number[] = [];
  for (const sx of [-1, 1]) {
    const sg = grp(bodyG, sx * 1.25, 2.75, 1.2);
    mk(cyl(0.2, 0.26, 0.9, 16), mDarkM, sg, 0, 0.45, 0);
    mk(new THREE.TorusGeometry(0.2, 0.05, 8, 16), mHub, sg, 0, 0.92, 0).rotation.x = Math.PI / 2;
    mk(cyl(0.17, 0.17, 0.02, 16), mRedGlow, sg, 0, 0.9, 0, false);
    mk(new THREE.TorusGeometry(0.26, 0.05, 8, 16), mYellow, sg, 0, 0.12, 0).rotation.x = Math.PI / 2;
    for (let k = 0; k < 4; k++) puffX.push(sx * 1.25);
  }
  const puffIM = new THREE.InstancedMesh(sphere(1, 10, 8), mSmoke, puffX.length);
  puffIM.frustumCulled = false; puffIM.castShadow = false; puffIM.receiveShadow = false; bodyG.add(puffIM);
  // beacon
  const beaconG = grp(bodyG, -1.25, 2.77, 1.2);
  mk(cyl(0.07, 0.1, 0.9, 10), mDarkM, beaconG, 0, 0.45, 0);
  mk(cyl(0.16, 0.2, 0.08, 14), mYellow, beaconG, 0, 0.0, 0);
  const beaconTop = jt(beaconG, 0, 1.0, 0);
  mk(new THREE.SphereGeometry(0.2, 16, 12, 0, TAU, 0, Math.PI / 2), mAmber, beaconTop, 0, 0, 0, false);
  mk(cyl(0.2, 0.2, 0.1, 16), mAmber, beaconTop, 0, -0.05, 0, false);
  mk(rbox(0.28, 0.06, 0.04, 0.02, 2), mYellow, beaconTop, 0, 0.1, 0, false);
  // front bumper
  mk(rbox(2.7, 0.35, 0.28, 0.12, 4), mYellow, bodyG, 0, 1.04, -1.75);
  mk(rbox(2.4, 0.22, 0.12, 0.05, 3), mDarkM, bodyG, 0, 1.04, -1.9);
  for (const sx of [-1, 1]) mk(sphere(0.12, 12, 8), mRedGlow, bodyG, sx * 1.1, 1.06, -1.93, false);

  // console + levers (front of cockpit)
  const consoleG = grp(bodyG, 0, 2.77, -0.95);
  mk(rbox(2.0, 0.28, 0.9, 0.12, 4), mSlateL, consoleG, 0, 0.0, 0);
  mk(rbox(1.5, 0.05, 0.5, 0.02, 2), mDarkM, consoleG, 0, 0.15, -0.05);
  for (let i = 0; i < 6; i++) mk(sphere(0.035, 8, 6), i % 2 ? mAmber : mHeadGlow, consoleG, -0.5 + i * 0.2, 0.19, -0.28, false);
  const levers: { g: THREE.Group; stick: THREE.Object3D; ball: THREE.Object3D }[] = [];
  for (const sx of [-1, 1]) {
    const lg = jt(consoleG, sx * 0.55, 0.12, 0.0);
    mk(cyl(0.12, 0.15, 0.1, 14), mDarkM, lg, 0, 0, 0);
    const stick = mka(cyl(0.035, 0.035, 1, 8), mHub, lg, 0, 0.5, 0);
    const ball = mka(sphere(0.09, 12, 8), mRedGlow, lg, 0, 1, 0);
    levers.push({ g: lg, stick, ball });
  }

  // ---- turret ring + pilot
  const turret = grp(bodyG, 0, 2.77, 0.22);
  mk(cyl(1.0, 1.1, 0.34, 32), mSlate, turret, 0, 0.05, 0);
  const ring = mk(new THREE.TorusGeometry(1.02, 0.1, 12, 40), mHazard, turret, 0, 0.22, 0); ring.rotation.x = Math.PI / 2;
  mk(new THREE.TorusGeometry(0.92, 0.05, 8, 40), mHeadGlow, turret, 0, 0.2, 0, false).rotation.x = Math.PI / 2;
  const pilot = jt(turret, 0, 0.2, 0);
  const torso = jt(pilot, 0, 0, 0);
  // slim build in a plain grey crewneck sweater (no hood, no logos)
  mk(rbox(1.16, 1.12, 0.82, 0.4, 6), mSweater, torso, 0, 0.55, 0);
  mk(rbox(1.2, 0.13, 0.86, 0.06, 3), mSweaterRib, torso, 0, 0.02, 0);                 // hem rib
  const collar = mk(new THREE.TorusGeometry(0.27, 0.075, 10, 24), mSweaterRib, torso, 0, 1.07, -0.02); collar.rotation.x = Math.PI / 2;
  mk(cyl(0.19, 0.23, 0.3, 16), mSkin, torso, 0, 1.12, 0, false);                        // neck
  // legs (seated, sneakers up on the dash) - children of the pilot so the torso twist does not turn them
  const limb = (a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material, parent: THREE.Object3D) => {
    const d = new THREE.Vector3().subVectors(b, a), len = d.length();
    const o = mk(capsule(r, Math.max(0.01, len - 2 * r)), mat, parent, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  };
  mk(rbox(0.9, 0.36, 0.8, 0.16, 4), mJeans, pilot, 0, 0.06, 0.02);
  for (const sx of [-1, 1]) {
    const hip = new THREE.Vector3(sx * 0.3, 0.14, 0.02), knee = new THREE.Vector3(sx * 0.33, 0.62, -0.5), ank = new THREE.Vector3(sx * 0.31, 0.2, -0.98);
    limb(hip, knee, 0.2, mJeans, pilot);
    mk(sphere(0.2, 12, 10), mJeans, pilot, knee.x, knee.y, knee.z);
    limb(knee, ank, 0.16, mJeans, pilot);
    mk(rbox(0.3, 0.2, 0.62, 0.09, 3), mShoe, pilot, sx * 0.31, 0.11, -1.1);
    mk(rbox(0.32, 0.06, 0.64, 0.03, 2), mSole, pilot, sx * 0.31, 0.0, -1.1, false);
    mk(rbox(0.2, 0.05, 0.22, 0.02, 2), mSole, pilot, sx * 0.31, 0.22, -1.0, false);   // tongue/lace patch
  }

  // arms (2-bone IK in torso local space; arm length L1,L2)
  const L1 = 0.62, L2 = 0.58, SHX = 0.66, SHY = 0.9;
  interface ArmR { sh: THREE.Group; el: THREE.Group; fing: THREE.Group }
  const arms: ArmR[] = [];
  for (const sx of [-1, 1]) {
    const sh = jt(torso, sx * SHX, SHY, 0);
    mk(sphere(0.22, 14, 10), mSweater, sh);
    mk(capsule(0.15, L1 - 0.3), mSweater, sh, 0, -L1 / 2, 0);
    const el = jt(sh, 0, -L1, 0);
    mk(sphere(0.15, 12, 10), mSweater, el);
    mk(capsule(0.125, L2 - 0.25), mSweater, el, 0, -L2 / 2 + 0.02, 0);
    mk(new THREE.TorusGeometry(0.115, 0.04, 8, 14), mSweaterRib, el, 0, -L2 + 0.05, 0).rotation.x = Math.PI / 2;
    mk(sphere(0.14, 14, 10), mSkin, el, 0, -L2 - 0.06, 0).scale.set(1, 1.05, 0.8);
    const fing = jt(el, 0, -L2 - 0.1, 0);
    for (let k = 0; k < 4; k++) {
      const f = mk(capsule(0.032, 0.1), mSkin, fing, (k - 1.5) * 0.058, -0.09, -0.03, false);
      f.rotation.z = (k - 1.5) * 0.12;
    }
    const th = mk(capsule(0.036, 0.08), mSkin, fing, -sx * 0.1, -0.02, -0.05, false); th.rotation.z = sx * 0.9;
    arms.push({ sh, el, fing });
    if (sx === 1) {
      // podcast mic in the right hand: handle + silver collar + foam windscreen, no text
      const mY = -L2 - 0.06;
      mk(cyl(0.05, 0.042, 0.55, 12), mMicBody, el, 0, mY - 0.12, 0, false);
      mk(cyl(0.075, 0.075, 0.07, 14), mHub, el, 0, mY - 0.42, 0, false);
      mk(new THREE.TorusGeometry(0.06, 0.018, 6, 12), mHub, el, 0, mY - 0.08, 0, false).rotation.x = Math.PI / 2;
      const foam = mk(sphere(0.2, 18, 14), mFoam, el, 0, mY - 0.62, 0, false); foam.scale.set(1, 1.2, 1);
    }
  }

  // head: round skull + painted face decal (front) + 3D hair (back/top) + ears
  const head = jt(torso, 0, 1.2, 0);
  const HR = { x: 0.78, y: 0.84, z: 0.76 }, HC = 0.6;
  mk(sphere(1, 40, 28).scale(HR.x, HR.y, HR.z), mSkin, head, 0, HC, 0);
  const capTheta = Math.PI / 2 - 0.02;
  mk(new THREE.SphereGeometry(1, 40, 22, 0, TAU, 0, capTheta).scale(HR.x + 0.03, HR.y + 0.03, HR.z + 0.03), mHair, head, 0, HC, 0.0);
  mk(new THREE.SphereGeometry(1, 40, 10, 0.0, Math.PI, Math.PI / 2 - 0.05, 0.62).scale(HR.x + 0.03, HR.y + 0.03, HR.z + 0.03), mHair, head, 0, HC, 0);   // back/nape shell          // nape bulk
  const nrm = new THREE.Vector3(), upY = new THREE.Vector3(0, 1, 0);
  const tuft = (az: number, el: number, len: number, r: number, bx: number, by: number, bz: number) => {
    // lock of hair lying on the cap: az 0 = front(-Z), PI = back(+Z); bias = direction the lock is combed
    const ce = Math.cos(el);
    const px = -Math.sin(az) * ce * (HR.x + 0.02), py = Math.sin(el) * (HR.y + 0.02), pz = -Math.cos(az) * ce * (HR.z + 0.02);
    nrm.set(px / HR.x, py / HR.y, pz / HR.z).normalize();
    const d = nrm.clone().multiplyScalar(0.5).add(new THREE.Vector3(bx, by, bz)).normalize();
    const o = mk(sphere(1, 14, 10).scale(r, r * 0.55, len * 0.5), mHair, head, px + d.x * len * 0.3, HC + py + d.y * len * 0.3, pz + d.z * len * 0.3, false);
    o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), d);
  };
  const tufts: [number, number, number, number, number, number, number][] = [
    // top: messy locks swept forward
    [0.0, 1.35, 0.8, 0.2, 0.1, 0, -1], [0.55, 1.25, 0.75, 0.2, -0.5, 0, -0.9], [-0.55, 1.25, 0.75, 0.2, 0.5, 0, -0.9],
    [1.1, 1.25, 0.7, 0.2, -0.9, 0, -0.5], [-1.1, 1.25, 0.7, 0.2, 0.9, 0, -0.5], [2.0, 1.2, 0.7, 0.2, -0.3, 0.2, -1], [-2.0, 1.2, 0.7, 0.2, 0.3, 0.2, -1],
    [3.0, 1.3, 0.6, 0.2, 0.4, 0.5, -0.8], [-3.0, 1.1, 0.6, 0.2, -0.5, 0.6, -0.6],
    // back and sides: locks flipping outward/down
    [2.4, 0.8, 0.6, 0.17, -0.8, -0.3, 0.2], [-2.4, 0.8, 0.6, 0.17, 0.8, -0.3, 0.2], [3.14, 0.75, 0.55, 0.17, 0.5, -0.6, 0.3],
    [2.0, 0.4, 0.5, 0.15, -0.8, -0.4, 0], [-2.0, 0.4, 0.5, 0.15, 0.8, -0.4, 0], [3.14, 0.3, 0.5, 0.15, -0.4, -0.8, 0.3],
    [2.7, 0.1, 0.45, 0.14, -0.6, -0.7, 0.2], [-2.7, 0.1, 0.45, 0.14, 0.6, -0.7, 0.2],
  ];
  for (const t of tufts) tuft(t[0], t[1], t[2], t[3], t[4], t[5], t[6]);
  for (const sx of [-1, 1]) {
    mk(sphere(1, 14, 10).scale(0.08, 0.17, 0.13), mSkinDark, head, sx * 0.8, HC - 0.05, 0.0, false);
    mk(sphere(1, 12, 8).scale(0.05, 0.1, 0.07), mSkin, head, sx * 0.83, HC - 0.04, -0.02, false);
  }
  // face decal: patch of the ellipsoid front, planar-projected from the painted head (texture swapped per expression)
  {
    const NX = 24, NY = 30, S = 0.0165, X0 = -33, X1 = 33, Y0 = -48, Y1 = 52;
    const Rx = HR.x + 0.05, Ry = HR.y + 0.05, Rz = HR.z + 0.05;
    const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
    for (let iy = 0; iy <= NY; iy++) for (let ix = 0; ix <= NX; ix++) {
      const xi = X0 + (X1 - X0) * ix / NX, yi = Y0 + (Y1 - Y0) * iy / NY;
      let wx = -xi * S, wy = -(yi - 2) * S;
      const r2 = (wx / Rx) ** 2 + (wy / Ry) ** 2;
      if (r2 > 0.95) { const k = Math.sqrt(0.95 / r2); wx *= k; wy *= k; }
      const zc = Math.sqrt(1 - (wx / Rx) ** 2 - (wy / Ry) ** 2);
      pos.push(wx, HC + wy, -Rz * zc);
      const n = new THREE.Vector3(wx / (Rx * Rx), wy / (Ry * Ry), -zc / Rz).normalize();
      nor.push(n.x, n.y, n.z);
      uv.push(0.5 + xi * 0.0086, 1 - (0.51 + yi * 0.0086));
    }
    for (let iy = 0; iy < NY; iy++) for (let ix = 0; ix < NX; ix++) {
      const a = iy * (NX + 1) + ix, b = a + NX + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    fg.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    fg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    fg.setIndex(idx);
    mk(fg, mFace, head, 0, 0, 0, false);
  }
  head.position.y = 1.2;

  // ---- vacuum hose
  const SEG = 120, RAD = 14, RIBS = 30;
  const hv = (SEG + 1) * (RAD + 1);
  const hPos = new Float32Array(hv * 3), hNor = new Float32Array(hv * 3), hUv = new Float32Array(hv * 2);
  const hIdx: number[] = [];
  for (let i = 0; i <= SEG; i++) for (let j = 0; j <= RAD; j++) { const n = i * (RAD + 1) + j; hUv[n * 2] = i / SEG * RIBS; hUv[n * 2 + 1] = j / RAD; }
  for (let i = 0; i < SEG; i++) for (let j = 0; j < RAD; j++) {
    const a = i * (RAD + 1) + j, b = a + RAD + 1;
    hIdx.push(a, a + 1, b, a + 1, b + 1, b);
  }
  const hGeo = new THREE.BufferGeometry();
  const hPosA = new THREE.BufferAttribute(hPos, 3); hPosA.setUsage(THREE.DynamicDrawUsage);
  const hNorA = new THREE.BufferAttribute(hNor, 3); hNorA.setUsage(THREE.DynamicDrawUsage);
  hGeo.setAttribute('position', hPosA); hGeo.setAttribute('normal', hNorA); hGeo.setAttribute('uv', new THREE.BufferAttribute(hUv, 2));
  hGeo.setIndex(hIdx);
  hGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 3.5, -1), 6);
  hoseNormal.repeat.set(1, 1);
  const mHoseRib = phys(0x2b303c, 0.4, 0.45, { clearcoat: 0.7, clearcoatRoughness: 0.3, bumpMap: hoseNormal, bumpScale: 3 });
  const hoseMesh = new THREE.Mesh(hGeo, mHoseRib);
  hoseMesh.castShadow = true; hoseMesh.receiveShadow = true; hoseMesh.frustumCulled = false;
  bodyG.add(hoseMesh);
  const baseCtl: [number, number, number][] = [
    [1.1, 2.7, 1.1], [1.7, 3.55, 1.5], [1.8, 4.8, 0.6], [1.5, 5.3, -0.8], [1.1, 4.6, -2.1], [0.7, 3.5, -3.2], [0.3, 2.9, -4.1], [0.25, 2.75, -4.7],
  ];
  const ctl = baseCtl.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
  const curve = new THREE.CatmullRomCurve3(ctl, false, 'centripetal');
  const ctr: THREE.Vector3[] = []; for (let i = 0; i <= SEG; i++) ctr.push(new THREE.Vector3());
  const cosR = new Float32Array(RAD + 1), sinR = new Float32Array(RAD + 1);
  for (let j = 0; j <= RAD; j++) { cosR[j] = Math.cos(j / RAD * TAU); sinR[j] = Math.sin(j / RAD * TAU); }
  const _T = new THREE.Vector3(), _N = new THREE.Vector3(), _B = new THREE.Vector3(), _ref = new THREE.Vector3(1, 0, 0);
  const _endT = new THREE.Vector3(), _negZ = new THREE.Vector3(0, 0, -1);
  // hose base collar
  const collarG = grp(bodyG, 1.1, 2.72, 1.1);
  mk(cyl(0.62, 0.72, 0.3, 24), mDarkM, collarG, 0, 0.0, 0);
  for (let i = 0; i < 3; i++) mk(new THREE.TorusGeometry(0.55 - i * 0.02, 0.07, 8, 24), mHub, collarG, 0, 0.18 + i * 0.12, 0).rotation.x = Math.PI / 2;
  mk(new THREE.TorusGeometry(0.64, 0.05, 8, 24), mYellow, collarG, 0, 0.12, 0).rotation.x = Math.PI / 2;
  // nozzle
  const nozzleG = jt(bodyG);
  const nozzle = jt(nozzleG);
  nozzle.rotation.x = -Math.PI / 2; // lathe axis +Y -> -Z
  const prof: [number, number][] = [[0.38, 0], [0.45, 0.16], [0.6, 0.4], [0.82, 0.7], [1.06, 1.02], [1.24, 1.34], [1.32, 1.62]];
  const lathePts = prof.map((p) => new THREE.Vector2(p[0], p[1]));
  const outer = mk(new THREE.LatheGeometry(lathePts, 36), mNozzle, nozzle, 0, 0, 0);
  const linerPts = prof.map((p) => new THREE.Vector2(p[0] * 0.93, p[1] + 0.01));
  const liner = mk(new THREE.LatheGeometry(linerPts, 36), mInner, nozzle, 0, 0, 0, false);
  const rim = mk(new THREE.TorusGeometry(1.34, 0.11, 12, 40), mRim, nozzle, 0, 1.64, 0, false); rim.rotation.x = Math.PI / 2;
  const rim2 = mk(new THREE.TorusGeometry(1.3, 0.09, 10, 40), mYellow, nozzle, 0, 1.38, 0, false); rim2.rotation.x = Math.PI / 2;
  mk(new THREE.TorusGeometry(0.48, 0.1, 10, 24), mHub, nozzle, 0, 0.1, 0).rotation.x = Math.PI / 2;
  mk(new THREE.TorusGeometry(0.56, 0.07, 10, 24), mYellow, nozzle, 0, 0.3, 0).rotation.x = Math.PI / 2;
  // rotor
  const rotor = jt(nozzle, 0, 0.7, 0);
  for (let k = 0; k < 8; k++) {
    const bl = mk(rbox(0.12, 0.03, 0.62, 0.012, 2), mFanBlade, rotor, 0, 0, 0, false);
    const a = k * TAU / 8;
    bl.position.set(Math.cos(a) * 0.34, 0, Math.sin(a) * 0.34); bl.rotation.y = -a; bl.rotation.z = 0.5;
  }
  mk(cyl(0.2, 0.2, 0.12, 16), mRedGlow, rotor, 0, 0.03, 0, false);
  // swirl rings: one instanced mesh, per-instance grey level = former per-ring opacity (additive blend => identical)
  const swirlMat = new THREE.MeshBasicMaterial({ color: 0xffa050, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
  const swirlIM = new THREE.InstancedMesh(new THREE.TorusGeometry(1, 0.04, 6, 36), swirlMat, 5);
  swirlIM.frustumCulled = false; swirlIM.castShadow = false; swirlIM.receiveShadow = false;
  nozzle.add(swirlIM);
  const NSW = 5;
  const _sp = new THREE.Vector3(), _sq = new THREE.Quaternion(), _ss = new THREE.Vector3(), _se = new THREE.Euler(), _sc = new THREE.Color(), _sm = new THREE.Matrix4();
  const nozzleAnchor = grp(nozzle, 0, 1.55, 0);

  // ---- head anchor
  const headAnchor = grp(inner, 0, 6.2, 0.2);

  finalizeRig(root, {
    cast: [mSlate, mSlateL, mYellow, mDarkM, mRubber, mSweater, mSkin, mHair, mJeans, mNozzle],
    noRecv: [mRear, mPlate], pad: 5,
  });

  // ---- state
  let catchP = 0, mad = 0, wheelAng = 0, uvOff = 0;
  let expr: SamExpr = 'neutral', shown: SamExpr = 'neutral', grabT = -1;
  const GRAB_DUR = 0.5;
  const skinBase = new THREE.Color(0xf3c9a5), skinMad = new THREE.Color(0xff8a6a), faceMad = new THREE.Color(1, 0.8, 0.72);
  const _q = new THREE.Quaternion();
  const rimBase = new THREE.Color(0xff4a1c), rimMad = new THREE.Color(0xff0a0a);
  const setFaceTex = (e: SamExpr) => { shown = e; mFace.map = faceTex[e]; mFace.emissiveMap = faceTex[e]; };

  const solveArm = (a: ArmR, sx: number, tx: number, ty: number, tz: number, stretch = false) => {
    // target relative to shoulder in torso-local coords; solve in the plane (y,z), x splay by angle
    const dx = tx - sx * SHX, dy = ty - SHY, dz = tz;
    let d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const l1 = stretch ? clamp((d - L2 + 0.02) / L1, 1, 2.6) : L1;
    const l1w = stretch ? l1 * L1 : l1;
    const maxD = l1w + L2 - 0.02;
    if (d > maxD) d = maxD;
    if (d < 0.2) d = 0.2;
    const horiz = Math.sqrt(dy * dy + dz * dz);
    const thetaT = Math.atan2(-dz, -dy);
    const roll = Math.atan2(dx * sx, horiz);       // outward splay (positive => away from body)
    const alpha = Math.acos(clamp((l1w * l1w + d * d - L2 * L2) / (2 * l1w * d), -1, 1));
    const gamma = Math.acos(clamp((L2 * L2 + d * d - l1w * l1w) / (2 * L2 * d), -1, 1));
    a.sh.rotation.order = 'ZXY';
    a.sh.rotation.x = thetaT - alpha;
    a.sh.rotation.z = sx * roll * 0.9;
    a.el.rotation.x = alpha + gamma;
    const k = stretch ? l1w / L1 : 1;
    a.sh.scale.y = k; a.el.scale.y = 1 / k;
  };

  const update = (dtRaw: number, p: { t: number; speed: number; threat: number; talking: boolean; faceCamera: number; grow: number }) => {
    const dt = clamp(dtRaw, 0, 0.05);
    const t = p.t;
    const spd = Math.max(p.speed, 0);
    const threat = clamp(p.threat, 0, 1);
    const face = clamp(p.faceCamera, 0, 1);
    const g = clamp(p.grow, 1, 1.5);
    inner.scale.setScalar(g);
    inner.position.z = -catchP * 2.6 * g;
    // suspension bob
    const amp = 0.025 + clamp(spd / 20, 0, 1) * 0.03;
    bodyG.position.y = Math.sin(t * 6.1) * amp + Math.sin(t * 2.3) * 0.015;
    bodyG.rotation.x = Math.sin(t * 3.7) * 0.012 - threat * 0.012 - catchP * 0.07;
    bodyG.rotation.z = Math.sin(t * 2.9) * 0.008;
    for (let i = 0; i < 2; i++) {
      treads[i].g.position.y = Math.sin(t * 7.3 + i * 2.1) * amp * 0.7;
      treads[i].g.rotation.x = Math.sin(t * 5.1 + i) * 0.01;
    }
    wheelAng -= spd * dt * 1.0;
    for (const tr of treads) for (const w of tr.wheels) w.rotation.x = wheelAng;
    uvOff = (uvOff + spd * dt * 0.09) % 1;
    treadTex.offset.y = -uvOff;
    // fans / beacon
    for (const f of fans) f.rotation.z = t * (8 + threat * 14);
    beaconTop.rotation.y = t * 4;
    mAmber.emissiveIntensity = 1.3 + Math.sin(t * 8) * 0.9;
    // LED blink
    let sig = 0;
    for (let i = 0; i < 6; i++) if (Math.sin(t * ledFreq[i] * 2.0 + i) > 0.2) sig |= 1 << i;
    if (sig !== ledSig) {
      ledSig = sig;
      for (let j = 0; j < ledGrp.length; j++) { const gi = ledGrp[j]; _lc.copy(ledC[gi >> 1]).multiplyScalar((sig >> gi) & 1 ? 2.4 : 0.12); ledIM.setColorAt(j, _lc); }
      ledIM.instanceColor!.needsUpdate = true;
    }
    // smoke
    for (let i = 0; i < puffX.length; i++) {
      const u = ((t * 0.7 + (i % 4) / 4 + (i >> 2) * 0.37) % 1);
      const sc = u < 0.98 ? 0.08 + u * 0.2 : 1e-4;
      _sp.set(puffX[i] + Math.sin(u * 5 + i) * 0.05, 2.75 + 1.0 + u * 0.9, 1.2 + u * 0.6); _ss.setScalar(sc);
      _sm.compose(_sp, _sq.identity(), _ss);
      puffIM.setMatrixAt(i, _sm);
    }
    puffIM.instanceMatrix.needsUpdate = true;
    // pilot
    const lookback = face;
    const sm = (x: number) => smooth01(x);
    let gEnv = 0;
    if (grabT >= 0) {
      grabT += dt;
      const u = grabT / GRAB_DUR;
      if (u >= 1) grabT = -1; else gEnv = u < 0.38 ? sm(u / 0.38) : 1 - sm((u - 0.38) / 0.62);
    }
    // expression: catch ends in glee, otherwise hold the requested one; idle blink swaps the texture only
    let eff: SamExpr = catchP > 0.85 ? 'glee' : expr;
    if ((eff === 'neutral' || eff === 'smug' || eff === 'worried') && ((t + 0.7) % 3.6) < 0.12) eff = 'blink';
    if (eff !== shown) setFaceTex(eff);
    pilot.position.y = 0.2 + Math.sin(t * 6.1 + 0.8) * 0.03 * (0.6 + spd / 25);
    torso.rotation.y = lookback * Math.PI * 0.6 + Math.sin(t * 0.8) * 0.05 * (1 - lookback);
    torso.rotation.x = -(threat * 0.12 + catchP * 0.28 + gEnv * 0.3);
    torso.rotation.z = Math.sin(t * 2.9) * 0.015;
    head.rotation.y = lookback * Math.PI * 0.4 * 0.9 + Math.sin(t * 0.6) * 0.1 * (1 - lookback);
    const talkB = p.talking ? Math.abs(Math.sin(t * 13)) : 0;
    head.rotation.x = -(0.03 + catchP * 0.1) + (p.talking ? Math.sin(t * 6.5) * 0.05 : 0) + gEnv * 0.15;
    head.rotation.z = Math.sin(t * 1.9) * 0.025 + (p.talking ? Math.sin(t * 5.2) * 0.04 : 0);
    head.scale.set(1 + talkB * 0.015, 1 - talkB * 0.025 + catchP * 0.02, 1 + talkB * 0.015);
    // arms: [0] lever hand (also the grab arm), [1] mic hand
    const hug = sm((catchP - 0.4) / 0.55), ready = sm(catchP / 0.4);
    const speak = p.talking || face > 0.2 ? 1 : 0;
    for (let i = 0; i < 2; i++) {
      const sx = i === 0 ? -1 : 1;
      let px: number, py: number, pz: number;
      if (i === 0) {
        const jit = Math.sin(t * 2.3) * 0.08, jit2 = Math.cos(t * 1.7) * 0.1;
        const steer = p.talking ? Math.sin(t * 7) * 0.2 : 0;
        const grip = 1 - clamp(face * 1.6, 0, 1);
        const gx = sx * 0.55, gy = 0.55 + jit + steer * 0.2, gz = -0.98 + jit2 + steer * 0.3;
        const tx = sx * (1.1 + Math.sin(t * 6) * 0.1 * speak), ty = 1.2 + Math.sin(t * 6.2) * 0.2 * speak, tz = -0.6 + Math.cos(t * 6) * 0.12 * speak;
        px = lerp(tx, gx, grip); py = lerp(ty, gy, grip); pz = lerp(tz, gz, grip);
        // grab: shoot forward, open hand, just miss
        px = lerp(px, sx * 0.35, gEnv); py = lerp(py, 1.0, gEnv); pz = lerp(pz, -2.15, gEnv);
        const lv = levers[0];
        const tilt = Math.atan2((gz + 0.97) * 0.9, Math.max(gy - 0.4, 0.2));
        lv.g.rotation.x = lerp(Math.sin(t * 1.3) * 0.1, tilt, grip * (1 - gEnv));
        lv.g.rotation.z = -sx * 0.04 + Math.sin(t * 2.1) * 0.05 * grip;
      } else {
        const gest = Math.sin(t * 6.2) * 0.12 * (p.talking ? 1 : 0);
        const rest = [0.62, 0.55, -0.62], talk = [0.38, 1.28 + gest, -0.62 + gest * 0.6];
        const sp = speak;
        px = lerp(rest[0], talk[0], sp); py = lerp(rest[1], talk[1], sp); pz = lerp(rest[2], talk[2], sp);
        const lv = levers[1];
        lv.g.rotation.x = Math.sin(t * 1.3 + 1) * 0.1; lv.g.rotation.z = -sx * 0.04 + Math.sin(t * 2.1 + 1) * 0.03;
      }
      // catch: both arms swing wide then wrap inward in a big hug (hands cross in front of the chest)
      const wideX = sx * 1.15, wideY = 1.0 + Math.sin(t * 9 + i) * 0.04 * ready, wideZ = -0.75;
      const hugX = -sx * 0.15, hugY = 0.7, hugZ = -1.1;
      const cx = lerp(wideX, hugX, hug), cy = lerp(wideY, hugY, hug), cz = lerp(wideZ, hugZ, hug);
      px = lerp(px, cx, ready); py = lerp(py, cy, ready); pz = lerp(pz, cz, ready);
      solveArm(arms[i], sx, px, py, pz, i === 0 && gEnv > 0.01);
      // fingers: curled round lever / mic, open for the grab, open for the hug
      const open = i === 0 ? Math.max(gEnv, ready * (1 - hug)) : ready * (1 - hug) * 0.6;
      const curl = lerp(0.95, -0.15, clamp(open * 1.3, 0, 1));
      arms[i].fing.rotation.x = curl;
      arms[i].fing.scale.x = 1 + open * 0.35;
    }
    // ---- hose
    const sw = 1 + threat * 0.6;
    for (let i = 0; i < ctl.length; i++) {
      const b = baseCtl[i];
      const w = (i === 0 ? 0 : i === ctl.length - 1 ? 0.15 : 1);
      ctl[i].set(
        b[0] + Math.sin(t * 1.7 + i * 0.9) * 0.12 * w * sw,
        b[1] + Math.sin(t * 2.3 + i * 1.3) * 0.1 * w * sw,
        b[2] + Math.sin(t * 1.9 + i * 1.1) * 0.12 * w * sw
      );
    }
    // lunge: end of hose reaches out further
    ctl[7].z -= catchP * 1.6; ctl[6].z -= catchP * 1.2; ctl[5].z -= catchP * 0.6; ctl[7].y -= catchP * 0.15;
    for (let i = 0; i <= SEG; i++) curve.getPoint(i / SEG, ctr[i]);
    const baseR = 0.36;
    for (let i = 0; i <= SEG; i++) {
      const a = ctr[Math.max(i - 1, 0)], b = ctr[Math.min(i + 1, SEG)];
      _T.subVectors(b, a).normalize();
      _N.crossVectors(_ref, _T).normalize();
      _B.crossVectors(_T, _N);
      const rib = 1 + 0.07 * Math.cos(i / SEG * RIBS * TAU);
      const wave = 1 + 0.16 * Math.pow(Math.max(0, Math.sin(i * 0.16 - t * (5 + threat * 6))), 3) * (0.4 + threat);
      const taper = i < 6 ? 0.8 + i / 6 * 0.2 : 1;
      const r = baseR * rib * wave * taper * (1 + catchP * 0.12);
      for (let j = 0; j <= RAD; j++) {
        const n = (i * (RAD + 1) + j) * 3;
        const cx = cosR[j], sy = sinR[j];
        const nx = _N.x * cx + _B.x * sy, ny = _N.y * cx + _B.y * sy, nz = _N.z * cx + _B.z * sy;
        hPos[n] = ctr[i].x + nx * r; hPos[n + 1] = ctr[i].y + ny * r; hPos[n + 2] = ctr[i].z + nz * r;
        hNor[n] = nx; hNor[n + 1] = ny; hNor[n + 2] = nz;
      }
    }
    hPosA.needsUpdate = true; hNorA.needsUpdate = true;
    // nozzle follows end
    _endT.subVectors(ctr[SEG], ctr[SEG - 3]).normalize();
    _q.setFromUnitVectors(_negZ, _endT);
    nozzleG.position.copy(ctr[SEG]).addScaledVector(_endT, -0.1);
    nozzleG.quaternion.copy(_q);
    const ns = 1 + catchP * 0.75 + Math.sin(t * 3) * 0.015;
    nozzle.scale.set(ns, 1 + catchP * 0.35, ns);
    // nozzle glow & swirl
    const glow = 0.9 + threat * 2.2 + mad * 0.8 + Math.sin(t * 9) * 0.15 + catchP * 1.5;
    mRim.emissiveIntensity = glow;
    mRim.emissive.copy(rimBase).lerp(rimMad, mad);
    mInner.emissiveIntensity = 0.7 + threat * 1.6 + catchP * 1.2;
    mRedGlow.emissiveIntensity = 1.2 + threat * 1.5 + Math.sin(t * 10) * 0.2;
    rotor.rotation.y = t * (6 + threat * 18 + catchP * 16);
    for (let i = 0; i < NSW; i++) {
      const u = ((t * (0.9 + threat * 0.9) + i / NSW) % 1);
      const y = lerp(1.6, 0.35, u);
      // interpolate radius along profile
      let r = 1.3;
      for (let k = 1; k < prof.length; k++) if (y <= prof[k][1]) { const f = (y - prof[k - 1][1]) / (prof[k][1] - prof[k - 1][1]); r = lerp(prof[k - 1][0], prof[k][0], clamp(f, 0, 1)); break; }
      r *= 0.9;
      _sp.set(0, y, 0); _ss.set(r, r, 1); _sq.setFromEuler(_se.set(Math.PI / 2, 0, t * 3 + i));
      _sm.compose(_sp, _sq, _ss);
      swirlIM.setMatrixAt(i, _sm);
      const a = Math.sin(u * Math.PI) * (0.35 + threat * 0.55);
      swirlIM.setColorAt(i, _sc.setRGB(a, a, a));
    }
    swirlIM.instanceMatrix.needsUpdate = true; swirlIM.instanceColor!.needsUpdate = true;
    // mad skin tint
    mSkin.color.copy(skinBase).lerp(skinMad, mad * 0.55);
    mFace.color.setRGB(1, 1, 1).lerp(faceMad, mad * 0.6);
    void outer; void liner; void rim2; void collar;
  };

  return {
    root, headAnchor, nozzleAnchor,
    update,
    setCatch: (v: number) => { catchP = clamp(v, 0, 1); },
    setMad: (m: number) => { mad = clamp(m, 0, 1); },
    setExpression: (e: SamExpr) => { expr = e; },
    grab: () => { grabT = 0; },
  };
}
export const buildSam = buildAllocman;
