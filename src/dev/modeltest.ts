import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildKilo, buildAllocman, type KiloState, type SamExpr } from '../models';

const q = new URLSearchParams(location.search);
const what = q.get('what') ?? 'kilo';
const view = q.get('view') ?? 'back';
const state = (q.get('state') ?? 'run') as KiloState;
const T = parseFloat(q.get('t') ?? '0.3');
const W = parseInt(q.get('w') ?? '900'), H = parseInt(q.get('h') ?? '700');
const num = (k: string, d: number) => parseFloat(q.get(k) ?? String(d));

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(W, H);
renderer.setPixelRatio(1);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8fb7d8);
const pm = new THREE.PMREMGenerator(renderer);
scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.7;
const sun = new THREE.DirectionalLight(0xfff1dd, 2.4);
sun.position.set(-5, 9, 6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
const sc = 8;
Object.assign(sun.shadow.camera, { left: -sc, right: sc, top: sc, bottom: -sc, near: 1, far: 30 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02; sun.shadow.radius = 3;
scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color: 0x5b6b7c, roughness: 0.9 }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
const grid = new THREE.GridHelper(40, 40, 0x334455, 0x445566); (grid.material as THREE.Material).opacity = 0.3; (grid.material as THREE.Material).transparent = true; scene.add(grid);

const cam = new THREE.PerspectiveCamera(q.has('fov') ? num('fov', 40) : 40, W / H, 0.1, 100);
scene.add(cam);

const dirs: Record<string, [number, number, number]> = { back: [0.0, 0.25, 1], front: [0.0, 0.2, -1], side: [1, 0.15, 0], top: [0, 1.6, 0.35], q: [0.7, 0.35, 0.8], qf: [-0.7, 0.3, -0.8] };
let target = new THREE.Vector3(), dist = 3;
const dv = new THREE.Vector3(...(dirs[view] ?? dirs.back)).normalize();

let step: (dt: number, t: number) => void;
let subject: THREE.Object3D;
if (what === 'kilo') {
  const k = buildKilo(q.get('skin') ?? 'kilo');
  scene.add(k.root); subject = k.root;
  const maxS = num('max', 12);
  k.setStack(num('stack', 7), maxS);
  if (q.get('shield') === '1') k.setShield(true);
  if (q.get('oc') === '1') k.setOverclock(true);
  target.set(0, 0.62, 0); dist = num('dist', 3.2);
  const vy = num('vy', 0);
  const speed = num('speed', 12);
  step = (dt, t) => k.pose(dt, { state, speed, t, lean: num('lean', 0), vy, landSquash: num('land', 0) });
  if (q.get('hit') === '1') k.flashHit();
} else {
  const a = buildAllocman();
  scene.add(a.root); subject = a.root;
  a.setMad(num('mad', 0));
  if (q.has('catch')) a.setCatch(num('catch', 0));
  a.setExpression((q.get('expr') ?? 'neutral') as SamExpr);
  if (q.get('grab') === '1') a.grab();
  target.set(num('tx', 0), num('ty', 2.6), num('tz', -0.4)); dist = num('dist', 15);
  step = (dt, t) => a.update(dt, { t, speed: num('speed', 12), threat: num('threat', 0.5), talking: q.get('talk') === '1', faceCamera: num('face', 0), grow: num('grow', 1) });
}
cam.position.copy(target).addScaledVector(dv, dist);
cam.lookAt(target);

let t = 0;
const dt = 1 / 60;
const frames = Math.round(T / dt);
for (let i = 0; i < frames; i++) { t += dt; step(dt, t); }
if (q.get('live') === '1') {
  const loop = () => { t += 1 / 60; step(1 / 60, t); renderer.render(scene, cam); requestAnimationFrame(loop); };
  loop();
} else {
  renderer.render(scene, cam);
}
const countDraws = (root: THREE.Object3D): number => {
  let n = 0;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) return;
    if ((m as THREE.InstancedMesh).isInstancedMesh && (m as THREE.InstancedMesh).count === 0) return;
    n += Array.isArray(m.material) ? m.material.length : 1;
  });
  return n;
};
(window as any).__calls = countDraws(subject);
(window as any).__shadowCasters = (() => { let n = 0; subject.traverse((o) => { if ((o as THREE.Mesh).isMesh && o.castShadow) n++; }); return n; })();
(window as any).__ready = true;
