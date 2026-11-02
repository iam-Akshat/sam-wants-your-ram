import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ZONES } from './zones';
import * as TX from './textures';
import { POWER_COLORS, type PowerKind } from './types';

const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), V = new THREE.Vector3(), S = new THREE.Vector3();

export function part(g: THREE.BufferGeometry, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, color?: number): THREE.BufferGeometry {
  const c = g.clone();
  E.set(rx, ry, rz); Q.setFromEuler(E); V.set(x, y, z); S.set(sx, sy, sz);
  M4.compose(V, Q, S); c.applyMatrix4(M4);
  if (color !== undefined) {
    const col = new THREE.Color(color); const n = c.getAttribute('position').count; const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = col.r; a[i * 3 + 1] = col.g; a[i * 3 + 2] = col.b; }
    c.setAttribute('color', new THREE.BufferAttribute(a, 3));
  }
  return c;
}
/** merge parts grouped by material index -> one geometry with groups */
export function mergeByMat(groups: THREE.BufferGeometry[][]): THREE.BufferGeometry {
  const needColor = groups.some((g) => g.some((x) => x.getAttribute('color')));
  const merged = groups.map((g) => {
    if (needColor) for (const x of g) if (!x.getAttribute('color')) { const n = x.getAttribute('position').count; const a = new Float32Array(n * 3).fill(1); x.setAttribute('color', new THREE.BufferAttribute(a, 3)); }
    return mergeGeometries(g, false)!;
  });
  return mergeGeometries(merged, true)!;
}
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const cyl = (r: number, h: number, seg = 10) => new THREE.CylinderGeometry(r, r, h, seg);

function wedge(): THREE.BufferGeometry {
  // unit ramp: x -0.5..0.5, near (z=0) low, far (z=-1) high (y=1)
  const p = [
    [-0.5, 0, 0], [0.5, 0, 0], [0.5, 0, -1], [-0.5, 0, -1], [-0.5, 1, -1], [0.5, 1, -1],
  ];
  const tri: number[][] = [
    // slope
    [0, 1, 5], [0, 5, 4],
    // back
    [3, 4, 5], [3, 5, 2],
    // left
    [0, 4, 3], // x=-0.5 side
    // right
    [1, 2, 5],
    // bottom
    [0, 3, 2], [0, 2, 1],
  ];
  const pos: number[] = [], uv: number[] = [];
  for (const t of tri) for (const i of t) { const v = p[i]!; pos.push(v[0]!, v[1]!, v[2]!); uv.push(v[0]! + 0.5, -v[2]!); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

export class Assets {
  // ---- decor materials per zone
  wallMat: THREE.MeshStandardMaterial[] = [];
  lightMat: THREE.MeshBasicMaterial[] = [];
  floorMat: THREE.MeshStandardMaterial[] = [];
  stripMat: THREE.MeshBasicMaterial[] = [];
  tankMat: THREE.MeshStandardMaterial[] = [];
  pipeMat: THREE.MeshStandardMaterial[] = [];
  // ---- obstacle materials
  hazardTex = TX.hazardTexture();
  glowTex = TX.glowTexture();
  letterTex = TX.letterTexture();
  mHazard = new THREE.MeshStandardMaterial({ map: this.hazardTex, roughness: 0.55, metalness: 0.2 });
  mRedGlow = new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 0.35, 0.25), toneMapped: true });
  mAmberGlow = new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 3.2, 0.4) });
  mGreenGlow = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 5, 1.2) });
  mMetal = new THREE.MeshStandardMaterial({ color: 0x59627a, roughness: 0.35, metalness: 0.85 });
  mDark = new THREE.MeshStandardMaterial({ color: 0x1b2030, roughness: 0.6, metalness: 0.5 });
  mRubber = new THREE.MeshStandardMaterial({ color: 0x15151a, roughness: 0.85, metalness: 0.0 });
  mCable = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.1 });
  mObsRack: THREE.MeshStandardMaterial;
  mLaserPanel = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 0.12, 0.1), transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  mPlat: THREE.MeshStandardMaterial[] = [];
  mPlatTop: THREE.MeshStandardMaterial;
  mRamp: THREE.MeshStandardMaterial;
  // ---- geometries
  gUnit = box(1, 1, 1);
  mGlow = new THREE.MeshBasicMaterial({ color: 0xffffff });
  gWallRack = box(1.15, 4.6, 1.15);
  gCeilLight = box(6.0, 0.1, 0.3);
  gStrip = box(0.07, 0.05, CHUNK_LEN_G);
  gPipe = (() => { const g = new THREE.CylinderGeometry(0.28, 0.28, 1, 10); g.rotateX(Math.PI / 2); return g; })();
  gTray = box(1.3, 0.12, 1);
  gTank = new THREE.CylinderGeometry(1.0, 1.0, 5.2, 14);
  gPost = box(0.14, 1.5, 0.14);
  gRail = box(0.12, 0.12, 1);
  gRack: THREE.BufferGeometry;
  gCable: THREE.BufferGeometry;
  gTrayObs: THREE.BufferGeometry;
  gLaser: THREE.BufferGeometry;
  gWedge = wedge();
  gPlatBody = box(1, 1, 1);
  gPlatTop: THREE.BufferGeometry;
  gStick: THREE.BufferGeometry;
  stickMats: THREE.Material[];
  gGold: THREE.BufferGeometry;
  goldMats: THREE.Material[];
  gCoin: THREE.BufferGeometry;
  coinMats: Record<PowerKind, THREE.Material[]> = {} as Record<PowerKind, THREE.Material[]>;
  gCart: THREE.BufferGeometry;
  cartMats: THREE.Material[];
  gFan: THREE.BufferGeometry;
  fanMats: THREE.Material[];

  constructor() {
    const [rd, re] = TX.rackTextures([0xffffff], 1); void rd; void re;
    const [floorD, floorE, floorR] = TX.floorTextures();
    floorD.offset.set(0.5, 0); floorE.offset.set(0.5, 0); floorR.offset.set(0.5, 0);
    const [orD, orE] = TX.obstacleRackTextures();
    const [rackD] = TX.rackTextures([0xffffff], 2);
    for (let z = 0; z < ZONES.length; z++) {
      const Z = ZONES[z]!;
      const [, emi] = TX.rackTextures(Z.led, 30 + z);
      this.wallMat.push(new THREE.MeshStandardMaterial({ map: rackD, emissiveMap: emi, emissive: new THREE.Color(1.6, 1.6, 1.6), roughness: 0.4, metalness: 0.7, color: 0xaaaaaa }));
      const lc = new THREE.Color(Z.light).multiplyScalar(Z.lightI);
      this.lightMat.push(new THREE.MeshBasicMaterial({ color: lc }));
      this.stripMat.push(new THREE.MeshBasicMaterial({ color: new THREE.Color(Z.led[0]!).multiplyScalar(2.4) }));
      const fm = new THREE.MeshStandardMaterial({ map: floorD, emissiveMap: floorE, emissive: new THREE.Color(Z.led[0]!).multiplyScalar(0.55), roughnessMap: floorR, roughness: 1, metalness: 0.75, color: Z.floorTint, transparent: true, opacity: 0.9 });
      this.floorMat.push(fm);
      this.tankMat.push(new THREE.MeshPhysicalMaterial({ color: 0x9fe8ff, roughness: 0.08, metalness: 0.1, transmission: 0, transparent: true, opacity: 0.55, emissive: new THREE.Color(Z.led[0]!).multiplyScalar(0.6), clearcoat: 1 }));
      this.pipeMat.push(new THREE.MeshStandardMaterial({ color: z === 0 ? 0xe4f2ff : z === 1 ? 0x8a4a2a : z === 3 ? 0x8fc8e0 : 0x6a7486, roughness: 0.35, metalness: 0.8 }));
      this.mPlat.push(new THREE.MeshStandardMaterial({ map: rackD, emissiveMap: emi, emissive: new THREE.Color(2, 2, 2), roughness: 0.4, metalness: 0.7, color: 0xb8b8c8 }));
    }
    this.mObsRack = new THREE.MeshStandardMaterial({ map: orD, emissiveMap: orE, emissive: new THREE.Color(1.8, 1.8, 1.8), roughness: 0.4, metalness: 0.6 });
    this.mPlatTop = new THREE.MeshStandardMaterial({ map: floorD, emissiveMap: floorE, emissive: new THREE.Color(0.2, 1.1, 1.4), roughness: 0.3, metalness: 0.8, color: 0x8fb4d0 });
    this.mRamp = new THREE.MeshStandardMaterial({ map: floorD, emissiveMap: floorE, emissive: new THREE.Color(1.4, 0.8, 0.2), roughness: 0.35, metalness: 0.7, color: 0xd0b890 });
    floorD.repeat.set(1, 1);

    // --- obstacle rack
    this.gRack = mergeByMat([
      [box(1.9, 3.0, 1.5)],
      [box(1.98, 0.35, 1.58).translate(0, -1.32, 0), box(1.98, 0.14, 1.58).translate(0, 1.5, 0)],
      [cyl(0.12, 0.2).translate(0, 1.68, 0)],
    ]);
    // --- cable bundle (vertex-colored cylinders along X)
    const cc = [0xff5a2a, 0x2a8cff, 0xffd23a, 0x33d17a, 0xc04bff];
    const cabs: THREE.BufferGeometry[] = [];
    const R = 0.21;
    const pos2: [number, number][] = [[-0.45, R], [0, R], [0.45, R], [-0.22, R + 0.36], [0.22, R + 0.36], [0, R + 0.7]];
    pos2.forEach(([zz, yy], i) => cabs.push(part(cyl(R * 1.0, 1.9, 10), 0, yy - 0.05, zz, 0, 0, Math.PI / 2, 1, 1, 1, cc[i % cc.length])));
    this.gCable = mergeByMat([cabs, [part(box(0.16, 0.62, 1.2), -0.5, 0.31, 0), part(box(0.16, 0.62, 1.2), 0.5, 0.31, 0)].map((g) => g)]);
    // --- hanging tray of cables
    const hang: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 9; i++) {
      const hx = -0.85 + i * 0.2125, h = 0.95 + (i % 3) * 0.18;
      hang.push(part(cyl(0.075, 2.6 - h, 8), hx, (2.6 + h) / 2, ((i * 37) % 7) / 7 * 0.5 - 0.25, 0, 0, 0, 1, 1, 1, cc[i % cc.length]));
      hang.push(part(new THREE.SphereGeometry(0.1, 8, 6), hx, h, ((i * 37) % 7) / 7 * 0.5 - 0.25, 0, 0, 0, 1, 1, 1, cc[i % cc.length]));
    }
    this.gTrayObs = mergeByMat([hang, [box(2.1, 0.16, 1.1).translate(0, 2.62, 0), cyl(0.04, 4, 6).translate(-1.0, 4.6, 0), cyl(0.04, 4, 6).translate(1.0, 4.6, 0), box(2.1, 0.5, 0.2).translate(0, 2.9, 0)]]);
    // --- rate limiter gantry: mats [metal, redGlow, panel]
    this.gLaser = mergeByMat([
      [box(0.22, 3.2, 0.36).translate(-1.02, 1.6, 0), box(0.22, 3.2, 0.36).translate(1.02, 1.6, 0), box(2.3, 0.32, 0.46).translate(0, 3.1, 0)],
      [box(1.84, 0.07, 0.1).translate(0, 1.0, 0), box(1.84, 0.04, 0.06).translate(0, 1.55, 0), box(1.84, 0.04, 0.06).translate(0, 2.1, 0), box(1.84, 0.04, 0.06).translate(0, 2.6, 0), new THREE.SphereGeometry(0.1, 8, 6).translate(-1.02, 3.35, 0), new THREE.SphereGeometry(0.1, 8, 6).translate(1.02, 3.35, 0)],
      [new THREE.PlaneGeometry(1.84, 1.9).translate(0, 1.97, 0)],
    ]);
    this.gPlatTop = box(1, 1, 1);
    // --- RAM stick: mats [pcb, chips, gold, glow]
    const stickParts = (): THREE.BufferGeometry[][] => {
      const pcb = [box(0.9, 0.3, 0.05)];
      const chips: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 4; i++) chips.push(box(0.14, 0.14, 0.07).translate(-0.28 + i * 0.2, 0.02, 0));
      const gold = [box(0.8, 0.045, 0.058).translate(0, -0.14, 0)];
      const glow = [box(0.86, 0.025, 0.06).translate(0, 0.14, 0), box(0.025, 0.2, 0.06).translate(0.44, 0, 0)];
      return [pcb, chips, gold, glow];
    };
    const stickBody = (scale: number): THREE.BufferGeometry[][] => {
      const [pcb, chips, gold, glow] = stickParts();
      const c = (arr: THREE.BufferGeometry[], col: number) => arr.map((g) => { const n = g.getAttribute('position').count; const a = new Float32Array(n * 3); const cc = new THREE.Color(col); for (let i = 0; i < n; i++) { a[i * 3] = cc.r; a[i * 3 + 1] = cc.g; a[i * 3 + 2] = cc.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; });
      void scale;
      return [[...c(pcb!, 0x16c46e), ...c(chips!, 0x14161d), ...c(gold!, 0xffd45a)], glow!];
    };
    this.gStick = mergeByMat(stickBody(1));
    this.stickMats = [
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.45, emissive: 0x0b6a3a, emissiveIntensity: 0.9 }),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 2.6, 2.9) }),
    ];
    const gp = stickBody(1);
    const goldKit: THREE.BufferGeometry[][] = [[], []];
    const tintGold = (g: THREE.BufferGeometry, hexc: number) => { const n = g.getAttribute('position').count; const a = new Float32Array(n * 3); const cc = new THREE.Color(hexc); for (let i = 0; i < n; i++) { a[i * 3] = cc.r; a[i * 3 + 1] = cc.g; a[i * 3 + 2] = cc.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
    for (let k = 0; k < 4; k++) gp.forEach((arr, mi) => arr.forEach((g, gi) => { const c = g.clone().translate(0, 0, (k - 1.5) * 0.14); if (mi === 0) tintGold(c, gi % 5 === 0 ? 0xffc233 : gi % 5 === 4 ? 0xfff0a0 : 0x4a3410); goldKit[mi]!.push(c); }));
    this.gGold = mergeByMat(goldKit);
    this.goldMats = [
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.25, metalness: 0.9, emissive: 0x6a4a00, emissiveIntensity: 0.9 }),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(4.5, 3.2, 0.6) }),
    ];
    // --- power-up coin: mats [side, top, bottom, ring]
    const coinR = 0.5, coinH = 0.16;
    const side = new THREE.CylinderGeometry(coinR, coinR, coinH, 28, 1, true).rotateX(Math.PI / 2);
    const capT = new THREE.CircleGeometry(coinR, 28).translate(0, 0, coinH / 2);
    const capB = new THREE.CircleGeometry(coinR, 28).rotateY(Math.PI).translate(0, 0, -coinH / 2);
    const ring = new THREE.TorusGeometry(coinR + 0.1, 0.045, 8, 32);
    this.gCoin = mergeByMat([[side], [capT], [capB], [ring]]);
    for (const k of Object.keys(POWER_COLORS) as PowerKind[]) {
      const col = new THREE.Color(POWER_COLORS[k]);
      const t = iconTexture(k, POWER_COLORS[k]);
      const capM = new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: new THREE.Color(1, 1, 1), emissiveIntensity: 0.9, roughness: 0.3, metalness: 0.3 });
      this.coinMats[k] = [
        new THREE.MeshStandardMaterial({ color: col, roughness: 0.25, metalness: 0.9, emissive: col, emissiveIntensity: 0.4 }),
        capM, capM,
        new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(3.2) }),
      ];
    }
    // --- cart: mats [metal, serverbody, hazard, redglow, rubber]
    const wheels: THREE.BufferGeometry[] = [];
    for (const sx of [-0.8, 0.8]) for (const sz of [-0.8, 0.8]) wheels.push(part(cyl(0.2, 0.16, 12), sx, 0.2, sz, 0, 0, Math.PI / 2));
    this.gCart = mergeByMat([
      [box(1.9, 0.18, 2.1).translate(0, 0.42, 0), box(0.1, 1.2, 0.1).translate(-0.9, 1.1, 1.0), box(0.1, 1.2, 0.1).translate(0.9, 1.1, 1.0), box(1.9, 0.1, 0.1).translate(0, 1.7, 1.0)],
      [box(1.7, 1.7, 1.7).translate(0, 1.35, -0.1)],
      [box(1.74, 0.16, 1.74).translate(0, 0.62, -0.1), box(1.74, 0.12, 1.74).translate(0, 2.25, -0.1)],
      [new THREE.SphereGeometry(0.14, 8, 6).translate(0, 2.4, -0.1)],
      wheels,
    ]);
    this.cartMats = [this.mMetal, this.mObsRack, this.mHazard, this.mRedGlow, this.mRubber];
    // --- giant fan: mats [dark, glow]
    const blades: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 9; i++) blades.push(part(box(0.9, 0.12, 0.32), 0.75, 0, 0, 0.0, 0, 0).rotateZ((i / 9) * Math.PI * 2).rotateY(0));
    // tilt blades slightly
    const bl2 = blades.map((b) => b);
    this.gFan = mergeByMat([
      [...bl2, new THREE.CylinderGeometry(0.35, 0.35, 0.3, 16).rotateX(Math.PI / 2), new THREE.TorusGeometry(1.75, 0.12, 8, 32)],
      [new THREE.TorusGeometry(1.5, 0.03, 6, 32), new THREE.CylinderGeometry(0.12, 0.12, 0.34, 10).rotateX(Math.PI / 2)],
    ]);
    this.fanMats = [this.mMetal, this.mGreenGlow];
  }
}
const CHUNK_LEN_G = 50;

function iconTexture(kind: PowerKind, color: string): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d')!;
  x.fillStyle = '#10182e'; x.fillRect(0, 0, 128, 128);
  const g = x.createRadialGradient(64, 64, 10, 64, 64, 64); g.addColorStop(0, color + '55'); g.addColorStop(1, '#00000000');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  x.strokeStyle = color; x.fillStyle = color; x.lineWidth = 9; x.lineCap = 'round'; x.lineJoin = 'round';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  switch (kind) {
    case 'ddr': x.font = '900 62px Arial, sans-serif'; x.fillText('2x', 64, 70); break;
    case 'magnet': x.lineWidth = 16; x.beginPath(); x.arc(64, 62, 28, Math.PI, 0); x.lineTo(92, 96); x.moveTo(36, 62); x.lineTo(36, 96); x.stroke(); x.strokeStyle = '#fff'; x.lineWidth = 12; x.beginPath(); x.moveTo(26, 98); x.lineTo(46, 98); x.moveTo(82, 98); x.lineTo(102, 98); x.stroke(); break;
    case 'shield': x.beginPath(); x.moveTo(64, 24); x.lineTo(98, 38); x.lineTo(94, 76); x.quadraticCurveTo(84, 100, 64, 108); x.quadraticCurveTo(44, 100, 34, 76); x.lineTo(30, 38); x.closePath(); x.fill(); x.fillStyle = '#10182e'; x.font = '900 34px Arial'; x.fillText('ECC', 64, 66); break;
    case 'cool': x.beginPath(); x.moveTo(64, 20); x.quadraticCurveTo(100, 66, 64, 108); x.quadraticCurveTo(28, 66, 64, 20); x.fill(); x.strokeStyle = '#fff'; x.lineWidth = 6; x.beginPath(); x.arc(64, 80, 16, 0.4, 1.9); x.stroke(); break;
    case 'oc': x.beginPath(); x.moveTo(74, 16); x.lineTo(36, 70); x.lineTo(62, 70); x.lineTo(52, 112); x.lineTo(94, 52); x.lineTo(68, 52); x.closePath(); x.fill(); break;
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
