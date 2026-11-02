import * as THREE from 'three';
import type { Assets } from './assets';

/** upload only the live part of an instance buffer (never the whole capacity), and never resize it */
function upd(a: THREE.BufferAttribute | null | undefined, n: number, stride: number) { if (!a) return; a.clearUpdateRanges(); if (n > 0) a.addUpdateRange(0, n * stride); a.needsUpdate = n > 0; }
const N = 900, NS = 48, NR = 70;
const M = new THREE.Matrix4(), P = new THREE.Vector3(), Qt = new THREE.Quaternion(), Sc = new THREE.Vector3(), Eu = new THREE.Euler(), C = new THREE.Color();

export class Particles {
  group = new THREE.Group();
  mesh: THREE.InstancedMesh;
  x = new Float32Array(N); y = new Float32Array(N); z = new Float32Array(N);
  vx = new Float32Array(N); vy = new Float32Array(N); vz = new Float32Array(N);
  life = new Float32Array(N); max = new Float32Array(N); size = new Float32Array(N); grav = new Float32Array(N);
  cr = new Float32Array(N); cg = new Float32Array(N); cb = new Float32Array(N); spin = new Float32Array(N);
  n = 0; cur = 0;
  // scattered RAM sticks (sucked by Allocman)
  sticks: THREE.InstancedMesh;
  sx = new Float32Array(NS); sy = new Float32Array(NS); sz = new Float32Array(NS); svx = new Float32Array(NS); svy = new Float32Array(NS); svz = new Float32Array(NS); sl = new Float32Array(NS); sa = new Float32Array(NS);
  target = new THREE.Vector3(0, 3, 6);
  rainM: THREE.InstancedMesh; rx = new Float32Array(NR); ry = new Float32Array(NR); rz = new Float32Array(NR); rv = new Float32Array(NR); rr = new Float32Array(NR); rl = new Float32Array(NR);
  constructor(a: Assets) {
    const g = new THREE.BoxGeometry(1, 1, 1);
    this.mesh = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: true }), N);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3);
    this.mesh.frustumCulled = false; this.mesh.count = 0; this.group.add(this.mesh);
    this.rainM = new THREE.InstancedMesh(a.gStick, a.stickMats, NR); this.rainM.frustumCulled = false; this.rainM.count = 0; this.group.add(this.rainM);
    this.sticks = new THREE.InstancedMesh(a.gStick, a.stickMats, NS); this.sticks.frustumCulled = false; this.sticks.count = 0; this.group.add(this.sticks);
  }
  clear() { this.n = 0; this.life.fill(0); this.sl.fill(0); this.rl.fill(0); }
  rain(x: number, y: number, z: number) { for (let i = 0; i < NR; i++) if (this.rl[i]! <= 0) { this.rl[i] = 6; this.rx[i] = x; this.ry[i] = y; this.rz[i] = z; this.rv[i] = 5 + Math.random() * 4; this.rr[i] = Math.random() * 6; return; } }
  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, r: number, g: number, b: number, grav = 0) {
    const i = this.cur; this.cur = (this.cur + 1) % N; if (i >= this.n) this.n = i + 1;
    this.x[i] = x; this.y[i] = y; this.z[i] = z; this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz; this.life[i] = life; this.max[i] = life; this.size[i] = size;
    this.cr[i] = r; this.cg[i] = g; this.cb[i] = b; this.grav[i] = grav; this.spin[i] = Math.random() * 6;
  }
  burst(x: number, y: number, z: number, count: number, speed: number, life: number, size: number, r: number, g: number, b: number, grav = 0) {
    for (let k = 0; k < count; k++) {
      const a = Math.random() * 6.283, e = Math.random() * 2 - 1, s = speed * (0.4 + Math.random() * 0.6), q = Math.sqrt(1 - e * e);
      this.emit(x, y, z, Math.cos(a) * q * s, e * s + speed * 0.25, Math.sin(a) * q * s, life * (0.6 + Math.random() * 0.5), size * (0.6 + Math.random() * 0.8), r, g, b, grav);
    }
  }
  scatterStick(x: number, y: number, z: number) {
    for (let i = 0; i < NS; i++) if (this.sl[i]! <= 0) {
      this.sl[i] = 2.2; this.sx[i] = x; this.sy[i] = y; this.sz[i] = z;
      this.svx[i] = (Math.random() - 0.5) * 5; this.svy[i] = 4 + Math.random() * 4; this.svz[i] = 3 + Math.random() * 5; this.sa[i] = Math.random() * 6; return;
    }
  }
  update(dt: number, scroll: number): number {
    let sucked = 0;
    let top = 0;
    for (let i = 0; i < this.n; i++) {
      if (this.life[i]! <= 0) continue;
      this.life[i]! -= dt;
      if (this.life[i]! <= 0) continue;
      this.vy[i]! -= this.grav[i]! * dt;
      this.x[i]! += this.vx[i]! * dt; this.y[i]! += this.vy[i]! * dt; this.z[i]! += (this.vz[i]! * dt + scroll);
      if (this.y[i]! < 0.03 && this.grav[i]! > 0) { this.y[i] = 0.03; this.vy[i] = Math.abs(this.vy[i]!) * 0.35; }
      const t = this.life[i]! / this.max[i]!; const s = this.size[i]! * (0.3 + t * 0.7);
      P.set(this.x[i]!, this.y[i]!, this.z[i]!); this.spin[i]! += dt * 8; Eu.set(this.spin[i]!, this.spin[i]! * 1.3, 0); Qt.setFromEuler(Eu); Sc.set(s, s, s);
      M.compose(P, Qt, Sc); this.mesh.setMatrixAt(top, M);
      this.mesh.setColorAt(top, C.setRGB(this.cr[i]! * t * 2, this.cg[i]! * t * 2, this.cb[i]! * t * 2));
      top++;
    }
    this.mesh.count = top; upd(this.mesh.instanceMatrix, top, 16); upd(this.mesh.instanceColor, top, 3);
    let ns = 0;
    for (let i = 0; i < NS; i++) {
      if (this.sl[i]! <= 0) continue;
      this.sl[i]! -= dt;
      // homing toward target after a short pop
      const age = 2.2 - this.sl[i]!;
      const tx = this.target.x - this.sx[i]!, ty = this.target.y - this.sy[i]!, tz = this.target.z - this.sz[i]!;
      const d = Math.hypot(tx, ty, tz) + 1e-3;
      if (age > 0.35) { const acc = 40 * Math.min(1, (age - 0.35) * 2); this.svx[i]! += tx / d * acc * dt; this.svy[i]! += ty / d * acc * dt; this.svz[i]! += tz / d * acc * dt; this.svx[i]! *= 0.96; this.svy[i]! *= 0.96; this.svz[i]! *= 0.96; }
      else this.svy[i]! -= 14 * dt;
      this.sx[i]! += this.svx[i]! * dt; this.sy[i]! += this.svy[i]! * dt; this.sz[i]! += this.svz[i]! * dt + scroll;
      if (age > 0.35 && d < 1.0) { this.sl[i] = 0; sucked++; continue; }
      this.sa[i]! += dt * 9; P.set(this.sx[i]!, Math.max(0.1, this.sy[i]!), this.sz[i]!); Eu.set(this.sa[i]!, this.sa[i]! * 0.7, this.sa[i]! * 0.5); Qt.setFromEuler(Eu);
      const sc = age > 0.35 ? Math.max(0.3, Math.min(1, d / 4)) : 1; Sc.set(sc, sc, sc); M.compose(P, Qt, Sc); this.sticks.setMatrixAt(ns++, M);
    }
    this.sticks.count = ns; upd(this.sticks.instanceMatrix, ns, 16);
    let nr = 0;
    for (let i = 0; i < NR; i++) {
      if (this.rl[i]! <= 0) continue; this.rl[i]! -= dt; this.ry[i]! -= this.rv[i]! * dt; this.rr[i]! += dt * 2.5;
      P.set(this.rx[i]!, this.ry[i]!, this.rz[i]!); Eu.set(this.rr[i]!, this.rr[i]! * 0.6, 0.3); Qt.setFromEuler(Eu); Sc.set(1.5, 1.5, 1.5); M.compose(P, Qt, Sc); this.rainM.setMatrixAt(nr++, M);
    }
    this.rainM.count = nr; upd(this.rainM.instanceMatrix, nr, 16);
    return sucked;
  }
}
