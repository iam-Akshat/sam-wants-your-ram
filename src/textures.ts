import * as THREE from 'three';

function cv(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  return [c, c.getContext('2d')!];
}
function tex(c: HTMLCanvasElement, srgb = true, repeat = false): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = 4;
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}
function rng(seed: number) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');

/** Server rack front: returns [diffuse, emissive] (emissive = LEDs only, colour palette per zone) */
export function rackTextures(palette: number[], seed: number): [THREE.CanvasTexture, THREE.CanvasTexture] {
  const W = 128, H = 256;
  const [d, dc] = cv(W, H); const [e, ec] = cv(W, H);
  const r = rng(seed);
  dc.fillStyle = '#10141f'; dc.fillRect(0, 0, W, H);
  ec.fillStyle = '#000'; ec.fillRect(0, 0, W, H);
  // frame
  dc.fillStyle = '#1b2233'; dc.fillRect(0, 0, 6, H); dc.fillRect(W - 6, 0, 6, H);
  const units = 16, uh = H / units;
  for (let i = 0; i < units; i++) {
    const y = i * uh;
    const shade = 22 + Math.floor(r() * 18);
    dc.fillStyle = `rgb(${shade},${shade + 6},${shade + 16})`;
    dc.fillRect(8, y + 2, W - 16, uh - 4);
    dc.fillStyle = 'rgba(255,255,255,0.08)'; dc.fillRect(8, y + 2, W - 16, 1);
    dc.fillStyle = 'rgba(0,0,0,0.5)'; dc.fillRect(8, y + uh - 3, W - 16, 1);
    // vent slots
    dc.fillStyle = '#05070c';
    const slots = 3 + Math.floor(r() * 4);
    for (let s = 0; s < slots; s++) dc.fillRect(46 + s * 6, y + 5, 3, uh - 10);
    // drive bays
    for (let b = 0; b < 3; b++) { dc.fillStyle = '#0a0d15'; dc.fillRect(12 + b * 9, y + 5, 7, uh - 10); }
    // LEDs
    const n = 2 + Math.floor(r() * 5);
    for (let l = 0; l < n; l++) {
      const col = hex(palette[Math.floor(r() * palette.length)]!);
      const lx = W - 14 - l * 8, ly = y + uh / 2 - 1;
      if (r() < 0.82) { ec.fillStyle = col; ec.fillRect(lx, ly, 4, 3); dc.fillStyle = '#222'; dc.fillRect(lx, ly, 4, 3); }
    }
    // activity bars
    if (r() < 0.5) { ec.fillStyle = hex(palette[0]!); ec.globalAlpha = 0.9; ec.fillRect(14, y + uh / 2, 5 + Math.floor(r() * 20), 2); ec.globalAlpha = 1; }
  }
  return [tex(d), tex(e)];
}

/** Raised floor tile. Tile edge (u=0) carries the bright seam so lane lines can be aligned. */
export function floorTextures(): [THREE.CanvasTexture, THREE.CanvasTexture, THREE.CanvasTexture] {
  const S = 256;
  const [d, dc] = cv(S, S); const [e, ec] = cv(S, S); const [rg, rc] = cv(S, S);
  dc.fillStyle = '#2a3142'; dc.fillRect(0, 0, S, S);
  rc.fillStyle = '#505050'; rc.fillRect(0, 0, S, S);
  // brushed noise
  const r = rng(7);
  for (let i = 0; i < 1500; i++) { dc.fillStyle = `rgba(255,255,255,${r() * 0.05})`; dc.fillRect(r() * S, r() * S, 1 + r() * 14, 1); }
  // perforations
  dc.fillStyle = '#10141e';
  for (let y = 24; y < S; y += 24) for (let x = 24; x < S; x += 24) { dc.beginPath(); dc.arc(x, y, 4, 0, 7); dc.fill(); }
  rc.fillStyle = '#d0d0d0';
  for (let y = 24; y < S; y += 24) for (let x = 24; x < S; x += 24) { rc.beginPath(); rc.arc(x, y, 5, 0, 7); rc.fill(); }
  // bevel edges
  dc.fillStyle = 'rgba(255,255,255,0.22)'; dc.fillRect(0, 0, S, 3); dc.fillRect(0, 0, 3, S);
  dc.fillStyle = 'rgba(0,0,0,0.7)'; dc.fillRect(0, S - 4, S, 4); dc.fillRect(S - 4, 0, 4, S);
  // seam glow
  ec.fillStyle = '#000'; ec.fillRect(0, 0, S, S);
  ec.fillStyle = '#9a9a9a'; ec.fillRect(0, 0, 3, S); ec.fillRect(0, 0, S, 2);
  ec.fillStyle = '#ffffff'; ec.fillRect(0, 0, 2, S);
  return [tex(d, true, true), tex(e, true, true), tex(rg, false, true)];
}

export function hazardTexture(): THREE.CanvasTexture {
  const [c, x] = cv(128, 128);
  x.fillStyle = '#ffcc00'; x.fillRect(0, 0, 128, 128);
  x.fillStyle = '#16120a';
  for (let i = -128; i < 256; i += 32) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 16, 0); x.lineTo(i + 16 + 128, 128); x.lineTo(i + 128, 128); x.fill(); }
  const t = tex(c, true, true); return t;
}

export function obstacleRackTextures(): [THREE.CanvasTexture, THREE.CanvasTexture] {
  const W = 128, H = 128;
  const [d, dc] = cv(W, H); const [e, ec] = cv(W, H);
  dc.fillStyle = '#3b2a30'; dc.fillRect(0, 0, W, H); ec.fillStyle = '#000'; ec.fillRect(0, 0, W, H);
  const r = rng(11);
  for (let i = 0; i < 8; i++) {
    const y = i * 16;
    dc.fillStyle = i % 2 ? '#4a343c' : '#43303a'; dc.fillRect(6, y + 2, W - 12, 12);
    dc.fillStyle = '#16090d'; for (let s = 0; s < 8; s++) dc.fillRect(16 + s * 6, y + 5, 3, 6);
    for (let l = 0; l < 4; l++) { ec.fillStyle = r() < 0.6 ? '#ff5a2a' : '#ffd23a'; ec.fillRect(W - 14 - l * 8, y + 7, 4, 3); }
  }
  // danger bars
  dc.fillStyle = '#ffcc00'; dc.fillRect(0, 0, W, 4); dc.fillRect(0, H - 4, W, 4);
  ec.fillStyle = '#aa7a00'; ec.fillRect(0, 0, W, 4); ec.fillRect(0, H - 4, W, 4);
  return [tex(d), tex(e)];
}

export function letterTexture(): THREE.CanvasTexture {
  const [c, x] = cv(256, 320);
  x.fillStyle = '#fbf6e6'; x.fillRect(0, 0, 256, 320);
  x.strokeStyle = '#d8cfb4'; x.lineWidth = 6; x.strokeRect(5, 5, 246, 310);
  x.fillStyle = '#1a2b6b'; x.font = 'bold 26px Georgia, serif'; x.textAlign = 'center';
  x.fillText('LETTER OF', 128, 52); x.fillText('INTENT', 128, 84);
  x.fillStyle = '#8a8a8a';
  for (let i = 0; i < 7; i++) x.fillRect(32, 112 + i * 17, 192 - (i % 3) * 30, 6);
  x.fillStyle = '#c0392b'; x.font = 'italic bold 20px Georgia, serif';
  x.save(); x.translate(128, 262); x.rotate(-0.2); x.strokeStyle = '#c0392b'; x.lineWidth = 3; x.strokeRect(-92, -22, 184, 40);
  x.fillText('NON-BINDING', 0, 7); x.restore();
  x.strokeStyle = '#1a2b6b'; x.lineWidth = 2; x.beginPath(); x.moveTo(40, 232); x.bezierCurveTo(60, 200, 80, 260, 110, 226); x.stroke();
  return tex(c);
}

export function glowTexture(): THREE.CanvasTexture {
  const [c, x] = cv(64, 64);
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return tex(c);
}

export function cloudTexture(): THREE.CanvasTexture {
  const [c, x] = cv(256, 128);
  const r = rng(5);
  for (let i = 0; i < 26; i++) {
    const cx = 40 + r() * 176, cy = 54 + r() * 30, rad = 18 + r() * 30;
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, rad);
    g.addColorStop(0, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
  }
  return tex(c);
}

/** Signs for the checkpoint gate etc. */
export function signTexture(text: string, bg = '#12203a', fg = '#ffd23f'): THREE.CanvasTexture {
  const [c, x] = cv(512, 128);
  x.fillStyle = bg; x.fillRect(0, 0, 512, 128);
  x.strokeStyle = fg; x.lineWidth = 8; x.strokeRect(6, 6, 500, 116);
  x.fillStyle = fg; x.font = 'bold 64px "Arial Rounded MT Bold", Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(text, 256, 68);
  return tex(c);
}

export function waterTexture(): THREE.CanvasTexture {
  const [c, x] = cv(64, 256);
  x.fillStyle = '#000'; x.fillRect(0, 0, 64, 256);
  const r = rng(3);
  for (let i = 0; i < 40; i++) { x.fillStyle = `rgba(140,230,255,${0.25 + r() * 0.6})`; x.fillRect(r() * 60, r() * 256, 2 + r() * 4, 10 + r() * 40); }
  return tex(c, true, true);
}

/** wall billboard: neon-bordered sign, 1024x256 */
export function boardTexture(lines: string[], bg: string, fg: string, accent: string): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 256; const x = c.getContext('2d')!;
  paintBoard(x, lines, bg, fg, accent);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
export function paintBoard(x: CanvasRenderingContext2D, lines: string[], bg: string, fg: string, accent: string) {
  x.fillStyle = bg; x.fillRect(0, 0, 1024, 256);
  x.strokeStyle = accent; x.lineWidth = 12; x.strokeRect(10, 10, 1004, 236);
  x.strokeStyle = fg; x.lineWidth = 3; x.strokeRect(26, 26, 972, 204);
  x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = fg;
  const n = lines.length; const fs = n === 1 ? 92 : 74;
  lines.forEach((l, i) => { x.font = `900 ${l.length > 26 ? fs * 0.72 : fs}px "Arial Rounded MT Bold", Arial, sans-serif`; x.fillStyle = i === 0 ? fg : accent; x.fillText(l, 512, 128 + (i - (n - 1) / 2) * 92, 940); });
}
