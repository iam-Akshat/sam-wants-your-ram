import * as THREE from 'three';
import type { Assets } from './assets';
import { POWER_KINDS, type PowerKind } from './types';

export const C_RAM = 0, C_GOLD = 1, C_PU = 2; // power kinds: C_PU + index in POWER_KINDS
const MAX = 460;
function upd(a: THREE.BufferAttribute, n: number) { a.clearUpdateRanges(); if (n > 0) a.addUpdateRange(0, n * 16); a.needsUpdate = n > 0; }
const M = new THREE.Matrix4(), P = new THREE.Vector3(), Qt = new THREE.Quaternion(), Sc = new THREE.Vector3(), Eu = new THREE.Euler();
const UP = new THREE.Vector3(0, 1, 0);

export class Collectibles {
  kind = new Uint8Array(MAX); alive = new Uint8Array(MAX);
  x = new Float32Array(MAX); y = new Float32Array(MAX); z = new Float32Array(MAX); ph = new Float32Array(MAX);
  pulled = new Uint8Array(MAX);
  n = 0;
  ram: THREE.InstancedMesh; gold: THREE.InstancedMesh; coins: THREE.InstancedMesh[] = [];
  group = new THREE.Group();
  // outputs of last update (no allocs)
  gotKind = new Uint8Array(64); gotX = new Float32Array(64); gotY = new Float32Array(64); gotZ = new Float32Array(64); gotN = 0;
  cursor = 0;
  private nc = [0, 0, 0, 0, 0];
  constructor(a: Assets) {
    this.ram = new THREE.InstancedMesh(a.gStick, a.stickMats, MAX);
    this.gold = new THREE.InstancedMesh(a.gGold, a.goldMats, 40);
    for (const k of POWER_KINDS) this.coins.push(new THREE.InstancedMesh(a.gCoin, a.coinMats[k], 14));
    for (const m of [this.ram, this.gold, ...this.coins]) { m.frustumCulled = false; m.count = 0; m.castShadow = false; this.group.add(m); }
  }
  clear() { this.alive.fill(0); this.pulled.fill(0); this.n = 0; }
  spawn(kind: number, x: number, y: number, z: number) {
    let i = -1;
    for (let k = 0; k < MAX; k++) { const j = (this.cursor + k) % MAX; if (!this.alive[j]) { i = j; break; } }
    if (i < 0) return;
    this.cursor = (i + 1) % MAX;
    this.kind[i] = kind; this.alive[i] = 1; this.x[i] = x; this.y[i] = y; this.z[i] = z; this.ph[i] = Math.random() * 6.28; this.pulled[i] = 0;
    if (i >= this.n) this.n = i + 1;
  }
  /** Remove collectibles overlapping a box (used by smashed obstacles etc.) not needed; kept minimal */
  update(dt: number, scroll: number, t: number, px: number, py: number, magnet: boolean, magRange: number, collectR: number) {
    this.gotN = 0;
    let nr = 0, ng = 0; const nc = this.nc; nc.fill(0);
    const spin = t * 3.2;
    for (let i = 0; i < this.n; i++) {
      if (!this.alive[i]) continue;
      let z = (this.z[i] = this.z[i]! + scroll);
      let x = this.x[i]!, y = this.y[i]!;
      const k = this.kind[i]!;
      if (z > 6) { this.alive[i] = 0; continue; }
      if (magnet && k < C_PU && z > -magRange && z < 2) this.pulled[i] = 1;
      if (this.pulled[i]) {
        const tx = px - x, ty = py + 0.7 - y, tz = -z; const d = Math.hypot(tx, ty, tz) + 1e-4;
        const sp = Math.min(d, (26 + (14 - Math.min(14, d)) * 2.5) * dt);
        x += tx / d * sp; y += ty / d * sp; z += tz / d * sp - scroll * 0.0;
        this.x[i] = x; this.y[i] = y; this.z[i] = z;
      }
      if (z < -190) continue;
      // pickup test
      const r = k >= C_PU ? collectR + 0.35 : collectR;
      if (Math.abs(z) < 1.0 + (k >= C_PU ? 0.3 : 0) && Math.abs(x - px) < r && Math.abs(y - (py + 0.65)) < r + 0.45) {
        this.alive[i] = 0;
        if (this.gotN < 64) { const g = this.gotN++; this.gotKind[g] = k; this.gotX[g] = x; this.gotY[g] = y; this.gotZ[g] = z; }
        continue;
      }
      const bob = Math.sin(t * 3 + this.ph[i]!) * 0.08;
      P.set(x, y + bob, z);
      if (k === C_RAM) {
        Eu.set(0, spin + this.ph[i]!, 0.18); Qt.setFromEuler(Eu); Sc.set(1.3, 1.3, 1.3); M.compose(P, Qt, Sc); this.ram.setMatrixAt(nr++, M);
      } else if (k === C_GOLD) {
        Eu.set(0.2, spin * 0.7, 0.1); Qt.setFromEuler(Eu); Sc.setScalar(1.35); M.compose(P, Qt, Sc); if (ng < 40) this.gold.setMatrixAt(ng++, M);
      } else {
        const ci = k - C_PU; Qt.setFromAxisAngle(UP, spin * 0.8 + this.ph[i]!); Sc.setScalar(1.0 + Math.sin(t * 5 + i) * 0.05); M.compose(P, Qt, Sc);
        if (nc[ci]! < 14) this.coins[ci]!.setMatrixAt(nc[ci]!++, M);
      }
    }
    this.ram.count = nr; upd(this.ram.instanceMatrix, nr);
    this.gold.count = ng; upd(this.gold.instanceMatrix, ng);
    for (let c = 0; c < 5; c++) { const m = this.coins[c]!; m.count = nc[c]!; upd(m.instanceMatrix, nc[c]!); }
  }
}
export type { PowerKind };
