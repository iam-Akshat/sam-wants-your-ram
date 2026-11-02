import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  EffectComposer, RenderPass, EffectPass, BloomEffect, SMAAEffect, VignetteEffect, ToneMappingEffect, ToneMappingMode,
  BrightnessContrastEffect, HueSaturationEffect, Effect, EffectAttribute, BlendFunction,
} from 'postprocessing';
import { ZONES } from './zones';
import { cloudTexture, glowTexture } from './textures';
import type { QualityName } from './types';

export interface QualityCfg { budget: number; bloomLevels: number; softShadow: boolean; dpr: number; shadows: number; mirror: boolean; mirrorObst: boolean; smaa: boolean; motes: number; chunks: number; msaa: number; bloomRes: number }
/** budget = max backbuffer pixels (regardless of DPR / window size), so Retina and 5K displays can't multiply the cost */
export const QUALITY: Record<QualityName, QualityCfg> = {
  low: { budget: 1.0e6, bloomLevels: 3, softShadow: false, dpr: 1, shadows: 0, mirror: false, mirrorObst: false, smaa: false, motes: 60, chunks: 4, msaa: 0, bloomRes: 0.35 },
  medium: { budget: 1.6e6, bloomLevels: 5, softShadow: false, dpr: 1.5, shadows: 1024, mirror: false, mirrorObst: false, smaa: true, motes: 120, chunks: 6, msaa: 0, bloomRes: 0.5 },
  high: { budget: 2.4e6, bloomLevels: 7, softShadow: true, dpr: 2, shadows: 2048, mirror: true, mirrorObst: true, smaa: true, motes: 240, chunks: 6, msaa: 0, bloomRes: 0.7 },
};

const FRAG = /* glsl */ `
uniform float uStrength; uniform float uTime; uniform float uChroma; uniform float uHeat; uniform vec2 uCenter;
float hsh(float n){ return fract(sin(n*127.1)*43758.5453); }
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec2 p = uv;
  p.x += sin(uv.y*70.0 + uTime*7.0) * 0.0011 * uHeat * (0.3 + (1.0-uv.y));
  vec2 d = p - uCenter; float r = length(d);
  if (uStrength < 0.01 && uChroma < 0.0004) { outputColor = (uHeat > 0.01) ? texture2D(inputBuffer, p) : inputColor; return; }
  vec2 dir = d / (r + 1e-4); float ca = uChroma * (0.35 + r);
  vec3 acc = vec3(0.0);
  float zoom = uStrength * 0.07 * smoothstep(0.08, 0.75, r);
  for (int i = 0; i < 5; i++) {
    float f = float(i) / 4.0; vec2 q = p - d * f * zoom;
    acc.r += texture2D(inputBuffer, q + dir * ca).r;
    acc.g += texture2D(inputBuffer, q).g;
    acc.b += texture2D(inputBuffer, q - dir * ca).b;
  }
  vec3 col = acc / 5.0;
  float ang = atan(d.y, d.x);
  float h = hsh(floor(ang * 46.0) + floor(uTime * 16.0) * 13.0);
  float line = step(0.9, h) * smoothstep(0.38, 0.95, r) * uStrength;
  col += vec3(line * 0.32);
  outputColor = vec4(col, inputColor.a);
}`;

class FxEffect extends Effect {
  constructor() {
    super('FxEffect', FRAG, {
      attributes: EffectAttribute.CONVOLUTION, blendFunction: BlendFunction.NORMAL,
      uniforms: new Map<string, THREE.Uniform>([
        ['uStrength', new THREE.Uniform(0)], ['uTime', new THREE.Uniform(0)], ['uChroma', new THREE.Uniform(0)], ['uHeat', new THREE.Uniform(0)], ['uCenter', new THREE.Uniform(new THREE.Vector2(0.5, 0.46))],
      ]),
    });
  }
  set(name: string, v: number) { (this.uniforms.get(name) as THREE.Uniform).value = v; }
}

const SKY_VERT = `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const SKY_FRAG = `varying vec3 vP; uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uSun; uniform float uA;
void main(){ float h = clamp(vP.y*1.6 + 0.12, 0.0, 1.0); vec3 c = mix(uHorizon, uTop, pow(h, 0.6));
  vec3 sd = normalize(vec3(0.0,0.07,-1.0)); float s = max(dot(normalize(vP), sd), 0.0); c += uSun * (pow(s, 90.0)*1.6 + pow(s, 8.0)*0.35);
  gl_FragColor = vec4(c, uA); }`;

export class Gfx {
  renderer: THREE.WebGLRenderer; scene = new THREE.Scene(); camera: THREE.PerspectiveCamera;
  composer: EffectComposer | null = null;
  hemi = new THREE.HemisphereLight(0xffffff, 0x223355, 1); key = new THREE.DirectionalLight(0xffffff, 2.5);
  rim = new THREE.DirectionalLight(0xffffff, 0.8);
  fogC = new THREE.Color(); q: QualityCfg; qName: QualityName = 'medium';
  bloom!: BloomEffect; fx!: FxEffect; bc!: BrightnessContrastEffect; hs!: HueSaturationEffect; vig!: VignetteEffect; smaaPass: EffectPass | null = null;
  sky: THREE.Group = new THREE.Group(); skyMat: THREE.ShaderMaterial; skyAmt = 0;
  motes!: THREE.Points; moteArr!: Float32Array; moteVel!: Float32Array; moteMat!: THREE.PointsMaterial;
  time = 0; chroma = 0; speedFx = 0; scrollSpeed = 0;
  w = 1; h = 1; pmrem: THREE.PMREMGenerator; envTex: THREE.Texture;
  private tc = new THREE.Color(); private tc2 = new THREE.Color();
  clouds: THREE.Sprite[] = [];

  constructor(canvas: HTMLCanvasElement, quality: QualityName) {
    this.q = QUALITY[quality]; this.qName = quality;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false, alpha: false });
    const r = this.renderer;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.0; r.outputColorSpace = THREE.SRGBColorSpace;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.pmrem = new THREE.PMREMGenerator(r);
    this.envTex = this.pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = this.envTex; this.scene.environmentIntensity = 0.9;
    this.scene.fog = new THREE.Fog(0x0a2a4a, 30, 175);
    this.scene.background = new THREE.Color(0x0a2a4a);
    this.camera = new THREE.PerspectiveCamera(66, 1, 0.1, 420);
    this.scene.add(this.camera);
    this.scene.add(this.hemi, this.key, this.key.target, this.rim);
    this.key.position.set(7, 15, 9); this.key.target.position.set(0, 0, -6);
    this.rim.position.set(-6, 5, -14); this.rim.target.position.set(0, 1, 0); this.scene.add(this.rim.target);
    // sky
    this.skyMat = new THREE.ShaderMaterial({ vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, transparent: true, depthWrite: false, fog: false,
      uniforms: { uTop: { value: new THREE.Color(0x2a3a8a) }, uHorizon: { value: new THREE.Color(0xff9a68) }, uSun: { value: new THREE.Color(1.0, 0.7, 0.4) }, uA: { value: 0 } } });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(380, 24, 16), this.skyMat); dome.renderOrder = -10; dome.frustumCulled = false; this.sky.add(dome);
    const ct = cloudTexture();
    for (let i = 0; i < 16; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: ct, color: new THREE.Color(1.1, 0.75, 0.7), transparent: true, opacity: 0.8, depthWrite: false, fog: false }));
      const a = (i / 16) * Math.PI * 2; s.position.set(Math.sin(a) * 260, 18 + (i % 4) * 14, -Math.cos(a) * 260 - 20); s.scale.set(120 + (i % 3) * 40, 40 + (i % 3) * 12, 1); this.sky.add(s); this.clouds.push(s);
    }
    this.sky.visible = false; this.scene.add(this.sky);
    this.buildMotes();
    this.setQuality(quality);
  }

  private buildMotes() {
    const n = 260; this.moteArr = new Float32Array(n * 3); this.moteVel = new Float32Array(n * 3);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(this.moteArr, 3));
    for (let i = 0; i < n; i++) this.resetMote(i, true);
    this.moteMat = new THREE.PointsMaterial({ map: glowTexture(), size: 5, sizeAttenuation: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffffff, opacity: 0.8 });
    this.motes = new THREE.Points(g, this.moteMat); this.motes.frustumCulled = false; this.scene.add(this.motes);
  }
  private resetMote(i: number, init: boolean) {
    const a = this.moteArr, v = this.moteVel;
    a[i * 3] = (Math.random() - 0.5) * 12; a[i * 3 + 1] = 0.2 + Math.random() * 6; a[i * 3 + 2] = init ? -Math.random() * 90 : -90 - Math.random() * 10;
    v[i * 3] = (Math.random() - 0.5) * 0.4; v[i * 3 + 1] = (Math.random() - 0.5) * 0.4; v[i * 3 + 2] = Math.random() * 0.3;
  }

  setQuality(name: QualityName) {
    this.qName = name; this.q = QUALITY[name];
    const r = this.renderer;
    r.shadowMap.enabled = this.q.shadows > 0; r.shadowMap.type = this.q.softShadow ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    if (this.q.shadows > 0) {
      this.key.castShadow = true; this.key.shadow.mapSize.set(this.q.shadows, this.q.shadows);
      const c = this.key.shadow.camera; c.left = -15; c.right = 15; c.top = 24; c.bottom = -12; c.near = 1; c.far = 50; c.updateProjectionMatrix();
      this.key.shadow.bias = -0.0004; this.key.shadow.normalBias = 0.03; this.key.shadow.radius = 3;
      if (this.key.shadow.map) { this.key.shadow.map.dispose(); (this.key.shadow as unknown as { map: null }).map = null; }
    } else this.key.castShadow = false;
    this.motes.geometry.setDrawRange(0, this.q.motes);
    this.buildComposer();
    this.resize(this.w, this.h);
    this.scene.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.Material | undefined; if (m) m.needsUpdate = true; });
  }

  private buildComposer() {
    if (this.composer) { this.composer.dispose(); this.composer = null; }
    try {
      const comp = new EffectComposer(this.renderer, { frameBufferType: THREE.HalfFloatType, multisampling: this.q.msaa });
      comp.addPass(new RenderPass(this.scene, this.camera));
      this.bloom = new BloomEffect({ intensity: 0.9, luminanceThreshold: 0.72, luminanceSmoothing: 0.25, mipmapBlur: true, radius: 0.72, levels: this.q.bloomLevels });
      this.bloom.resolution.scale = this.q.bloomRes;
      this.bc = new BrightnessContrastEffect({ brightness: 0.02, contrast: 0.08 });
      this.hs = new HueSaturationEffect({ hue: 0, saturation: 0.12 });
      this.vig = new VignetteEffect({ offset: 0.3, darkness: 0.62 });
      const tm = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC });
      comp.addPass(new EffectPass(this.camera, this.bloom, this.bc, this.hs, tm, this.vig));
      this.fx = new FxEffect(); comp.addPass(new EffectPass(this.camera, this.fx));
      if (this.q.smaa) { comp.addPass(new EffectPass(this.camera, new SMAAEffect())); }
      this.composer = comp;
    } catch (e) { console.warn('postprocessing disabled', e); this.composer = null; }
  }

  scale = 1;
  /** effective pixel ratio: DPR capped by preset, then by total-pixel budget, times the dynamic-resolution scale */
  effectiveDpr(): number {
    let d = Math.min(window.devicePixelRatio || 1, this.q.dpr);
    const px = this.w * this.h * d * d; if (px > this.q.budget) d = Math.sqrt(this.q.budget / (this.w * this.h));
    return Math.max(0.5, d * this.scale);
  }
  setScale(sc: number) { this.scale = sc; this.resize(this.w, this.h); }
  /** backbuffer size in pixels (for perf reports) */
  bufferSize(): [number, number] { const v = this.renderer.getDrawingBufferSize(new THREE.Vector2()); return [v.x, v.y]; }
  resize(w: number, h: number) {
    this.w = w; this.h = h;
    this.renderer.setPixelRatio(this.effectiveDpr()); this.renderer.setSize(w, h, false);
    if (this.composer) this.composer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }

  /** blend two zones (a -> b by t), environment grade */
  applyZone(a: number, b: number, t: number) {
    const A = ZONES[a]!, B = ZONES[b]!, L = (x: number, y: number) => x + (y - x) * t;
    const f = this.scene.fog as THREE.Fog;
    this.fogC.setHex(A.fog).lerp(this.tc.setHex(B.fog), t);
    f.color.copy(this.fogC); const fs = this.qName === 'low' ? 0.7 : 1; f.near = L(A.fogNear, B.fogNear) * fs; f.far = L(A.fogFar, B.fogFar) * fs;
    (this.scene.background as THREE.Color).copy(this.fogC);
    this.hemi.color.setHex(A.hemiSky).lerp(this.tc.setHex(B.hemiSky), t); this.hemi.groundColor.setHex(A.hemiGround).lerp(this.tc.setHex(B.hemiGround), t); this.hemi.intensity = L(A.hemiI, B.hemiI);
    this.key.color.setHex(A.key).lerp(this.tc.setHex(B.key), t); this.key.intensity = L(A.keyI, B.keyI);
    this.rim.color.copy(this.key.color).lerp(this.tc2.setHex(0xff3ea5), 0.35); this.rim.intensity = 0.9;
    this.scene.environmentIntensity = L(A.env, B.env);
    this.bloom.intensity = L(A.bloom, B.bloom);
    this.hs.saturation = L(A.sat, B.sat); this.bc.contrast = L(A.contrast, B.contrast); this.bc.brightness = L(A.bright, B.bright);
    this.fx.set('uHeat', L(A.heat, B.heat));
    this.moteMat.color.setHex(A.mote).lerp(this.tc.setHex(B.mote), t);
    const sa = L(A.ceiling ? 0 : 1, B.ceiling ? 0 : 1); this.skyAmt = sa;
    this.sky.visible = sa > 0.01; this.skyMat.uniforms.uA!.value = sa;
    (this.skyMat.uniforms.uHorizon!.value as THREE.Color).setHex(0xff9a68);
    (this.skyMat.uniforms.uTop!.value as THREE.Color).setHex(0x3a4fb0);
  }

  update(dt: number, scroll: number, moteMode: number) {
    this.time += dt;
    this.chroma *= Math.exp(-dt * 7);
    this.fx.set('uTime', this.time); this.fx.set('uChroma', this.chroma); this.fx.set('uStrength', this.speedFx);
    // motes
    const a = this.moteArr, v = this.moteVel, n = this.q.motes;
    for (let i = 0; i < n; i++) {
      const k = i * 3;
      let dy = v[k + 1]!, dx = v[k]!;
      if (moteMode === 0) dy = -0.5 - (i % 5) * 0.12; else if (moteMode === 1) { dy = 1.1 + (i % 4) * 0.3; dx += Math.sin(this.time * 2 + i) * 0.3; } else if (moteMode === 2) { dy = 0; dx = v[k]! * 3; } else if (moteMode === 3) { dy = 0.1; dx = v[k]! * 1.5; }
      a[k]! += dx * dt; a[k + 1]! += dy * dt; a[k + 2]! += (scroll + v[k + 2]! * dt);
      if (a[k + 2]! > 6 || a[k + 1]! < 0 || a[k + 1]! > 6.5) this.resetMote(i, false);
      if (a[k + 2]! > 6) a[k + 2] = -90;
    }
    (this.motes.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    this.moteMat.size = moteMode === 3 ? 12 : moteMode === 1 ? 4 : 5; // fixed pixel sizes: bounded fill cost even when the camera is inside the dust
    this.moteMat.opacity = moteMode === 4 ? 0.0 : 0.75;
    if (this.sky.visible) { this.sky.position.copy(this.camera.position); for (let i = 0; i < this.clouds.length; i++) this.clouds[i]!.position.x += Math.sin(i) * dt * 0.8; }
    this.motes.position.set(this.camera.position.x * 0.0, 0, 0);
  }

  render() { if (this.composer) this.composer.render(); else this.renderer.render(this.scene, this.camera); }
}
