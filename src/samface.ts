// Sam Altman, cartoon caricature (satire). Flat vector style, canvas-2D only, deterministic.
// Local units: 1 unit = size/100; head spans y -50 (hair top) .. +50 (chin), centred on x=0.
export type SamExpr = 'neutral' | 'smug' | 'shock' | 'glee' | 'worried' | 'blink' | 'frustrated';
export interface SamAnim { brow?: number; look?: number; blink?: number }

const INK = '#2a1a14';
const SKIN = '#f9dcc4';
const SKIN_SH = '#e8b592';
const BLUSH = 'rgba(240,120,110,0.26)';
const HAIR = '#7a5130';
const HAIR_HI = '#9a6e45';
const HAIR_LO = '#5a3a20';
const BROW = '#5a3a20';
const SWEAT = '#9ba1a8';
const SWEAT_SH = '#7f858d';
const SWEAT_HI = '#b6bbc1';
const LW = 2.7;

type Ctx = CanvasRenderingContext2D;

function fillStroke(c: Ctx, fill: string | CanvasGradient, lw = LW): void {
  c.fillStyle = fill;
  c.fill();
  c.lineWidth = lw;
  c.strokeStyle = INK;
  c.lineJoin = 'round';
  c.lineCap = 'round';
  c.stroke();
}

function faceShape(c: Ctx): void {
  // slim face: narrower jaw, slight cheek hollow; forehead top hidden under hair
  c.beginPath();
  c.moveTo(-28, -14);
  c.bezierCurveTo(-30, 4, -27, 16, -24, 26);
  c.bezierCurveTo(-22, 38, -11, 50, 0, 50);
  c.bezierCurveTo(11, 50, 22, 38, 24, 26);
  c.bezierCurveTo(27, 16, 30, 4, 28, -14);
  c.bezierCurveTo(24, -34, -24, -34, -28, -14);
  c.closePath();
}

function ear(c: Ctx, s: number): void {
  c.beginPath();
  c.moveTo(s * 26, -1);
  c.bezierCurveTo(s * 37, -6, s * 40, 8, s * 34, 16);
  c.bezierCurveTo(s * 31, 20, s * 28, 19, s * 26, 17);
  c.closePath();
  fillStroke(c, SKIN);
  c.beginPath();
  c.moveTo(s * 30, 5);
  c.quadraticCurveTo(s * 35, 5, s * 33, 12);
  c.lineWidth = 1.5;
  c.strokeStyle = SKIN_SH;
  c.stroke();
}

interface Look {
  lid: number; // fraction of eye covered from top
  low: number; // fraction covered from bottom (squint / crinkle)
  eyeScale: number;
  pupil: number;
  browL: number; // + = lower
  browR: number;
  tiltL: number; // inner end lift (positive = worried, negative = angry)
  tiltR: number;
  mouth: 'small' | 'smirk' | 'o' | 'grin' | 'wobble' | 'grit';
  gaze: number;
}

function look(e: SamExpr): Look {
  const d: Look = { lid: 0, low: 0, eyeScale: 1, pupil: 1, browL: -1.5, browR: -1.5, tiltL: 0.8, tiltR: 0.8, mouth: 'small', gaze: 0 };
  switch (e) {
    case 'smug': return { ...d, lid: 0.2, browL: 0.5, browR: -5.5, tiltL: -1, tiltR: 0.5, mouth: 'smirk', gaze: 1.2 };
    case 'shock': return { ...d, eyeScale: 1.13, pupil: 0.5, browL: -8, browR: -8, tiltL: 0, tiltR: 0, mouth: 'o' };
    case 'glee': return { ...d, lid: 0.12, low: 0.5, browL: -3, browR: -3, tiltL: 0, tiltR: 0, mouth: 'grin' };
    case 'worried': return { ...d, browL: -3, browR: -3, tiltL: 5, tiltR: 5, mouth: 'wobble', pupil: 0.9, gaze: -1 };
    case 'frustrated': return { ...d, lid: 0.1, browL: 2.5, browR: 2.5, tiltL: -4.5, tiltR: -4.5, mouth: 'grit', pupil: 0.85 };
    case 'blink': return { ...d, lid: 1 };
    default: return d;
  }
}

const EXC = 14.4, EYC = 8;

function eye(c: Ctx, s: number, L: Look, blinkAnim: number, lookAnim: number): void {
  const ex = s * EXC, ey = EYC;
  const rx = 10.2 * L.eyeScale, ry = 11.4 * L.eyeScale;
  const lid = Math.max(L.lid, blinkAnim);
  if (lid > 0.96) {
    c.beginPath();
    c.moveTo(ex - 9, ey + 1);
    c.quadraticCurveTo(ex, ey + 6.5, ex + 9, ey + 1);
    c.lineWidth = 3.2;
    c.strokeStyle = INK;
    c.lineCap = 'round';
    c.stroke();
    c.beginPath();
    c.moveTo(ex + s * 9, ey + 1);
    c.lineTo(ex + s * 11.5, ey - 1);
    c.lineWidth = 1.8;
    c.stroke();
    return;
  }
  c.beginPath();
  c.ellipse(ex, ey, rx, ry, 0, 0, Math.PI * 2);
  c.fillStyle = '#fffefa';
  c.fill();
  c.save();
  c.clip();
  // iris: dark limbal edge, vivid green, lighter inner ring, medium pupil, catch-lights
  const ix = ex + L.gaze + lookAnim * 2.6;
  const iy = ey + 0.6 + lid * ry * 0.35;
  const ir = 7.6 * L.eyeScale;
  c.beginPath();
  c.arc(ix, iy, ir, 0, Math.PI * 2);
  c.fillStyle = '#12b84f';
  c.fill();
  c.beginPath();
  c.arc(ix, iy, ir * 0.66, 0, Math.PI * 2);
  c.lineWidth = ir * 0.3;
  c.strokeStyle = '#8df06a';
  c.stroke();
  c.beginPath();
  c.arc(ix, iy, ir - 0.35, 0, Math.PI * 2);
  c.lineWidth = 1.6;
  c.strokeStyle = '#0a5a2a';
  c.stroke();
  c.beginPath();
  c.arc(ix, iy, ir * 0.36 * L.pupil + 0.7, 0, Math.PI * 2);
  c.fillStyle = '#06140c';
  c.fill();
  c.fillStyle = '#fff';
  c.beginPath();
  c.arc(ix - ir * 0.36, iy - ir * 0.4, ir * 0.27, 0, Math.PI * 2);
  c.fill();
  c.beginPath();
  c.arc(ix + ir * 0.4, iy + ir * 0.38, ir * 0.13, 0, Math.PI * 2);
  c.fill();
  // lids (top and bottom) in skin
  if (lid > 0) {
    const ly = ey - ry + ry * 2 * lid;
    c.beginPath();
    c.rect(ex - rx - 2, ey - ry - 4, rx * 2 + 4, ly - (ey - ry - 4));
    c.fillStyle = SKIN;
    c.fill();
    c.beginPath();
    c.moveTo(ex - rx - 1, ly);
    c.lineTo(ex + rx + 1, ly);
    c.lineWidth = 2.6;
    c.strokeStyle = INK;
    c.stroke();
  }
  if (L.low > 0) {
    const ly = ey + ry - ry * 2 * L.low;
    c.beginPath();
    c.moveTo(ex - rx - 2, ly + 3);
    c.quadraticCurveTo(ex, ly - 4, ex + rx + 2, ly + 3);
    c.lineTo(ex + rx + 2, ey + ry + 4);
    c.lineTo(ex - rx - 2, ey + ry + 4);
    c.closePath();
    c.fillStyle = SKIN;
    c.fill();
    c.lineWidth = 2;
    c.strokeStyle = INK;
    c.stroke();
  }
  c.restore();
  c.beginPath();
  if (lid < 0.5 && L.low === 0) c.ellipse(ex, ey, rx, ry, 0, 0, Math.PI * 2);
  else c.ellipse(ex, ey, rx, ry, 0, Math.PI * 1.02, Math.PI * 1.98);
  c.lineWidth = 1.8;
  c.strokeStyle = INK;
  c.stroke();
  if (lid === 0) {
    c.beginPath();
    c.ellipse(ex, ey, rx, ry, 0, Math.PI * 1.05, Math.PI * 1.95);
    c.lineWidth = 3.2;
    c.stroke();
  }
}

function brow(c: Ctx, s: number, raise: number, tilt: number): void {
  // thin, slightly raised, earnest. s=-1 left side of picture.
  const ox = s * 24, ix = s * 6;
  const base = -9 + raise;
  c.beginPath();
  c.moveTo(ix, base - tilt);
  c.quadraticCurveTo(s * 15, base - 4.6 - tilt * 0.3, ox, base + 1.8);
  c.lineWidth = 2.3;
  c.strokeStyle = BROW;
  c.lineCap = 'round';
  c.stroke();
}

function nose(c: Ctx): void {
  c.beginPath();
  c.moveTo(-0.6, 15);
  c.quadraticCurveTo(-3, 23, -2.4, 25.2);
  c.quadraticCurveTo(0.2, 26.8, 3, 25);
  c.lineWidth = 1.7;
  c.strokeStyle = '#b0705a';
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.stroke();
}

function mouth(c: Ctx, m: Look['mouth']): void {
  c.strokeStyle = INK;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  switch (m) {
    case 'small':
      c.beginPath();
      c.moveTo(-6.4, 36.6);
      c.quadraticCurveTo(0, 38.8, 6.4, 35.8);
      c.lineWidth = 2.2;
      c.stroke();
      c.beginPath();
      c.moveTo(6.4, 35.8); c.lineTo(7.8, 34.6);
      c.lineWidth = 1.6; c.stroke();
      break;
    case 'smirk':
      c.beginPath();
      c.moveTo(-5.5, 37.6);
      c.quadraticCurveTo(2, 38.4, 7.5, 34);
      c.lineWidth = 2.3;
      c.stroke();
      c.beginPath();
      c.moveTo(7.5, 34); c.lineTo(9.2, 32.4);
      c.lineWidth = 1.8; c.stroke();
      break;
    case 'o':
      c.beginPath();
      c.ellipse(0, 38, 3.4, 4.4, 0, 0, Math.PI * 2);
      fillStroke(c, '#5a1f1f', 2.2);
      break;
    case 'grin':
      c.beginPath();
      c.moveTo(-12, 31.5);
      c.quadraticCurveTo(0, 35, 12, 31.5);
      c.quadraticCurveTo(10, 46, 0, 46);
      c.quadraticCurveTo(-10, 46, -12, 31.5);
      c.closePath();
      fillStroke(c, '#5a1f1f', 2.4);
      c.save();
      c.clip();
      c.fillStyle = '#fffdf8';
      c.fillRect(-14, 30, 28, 6);
      c.fillStyle = '#e0626c';
      c.beginPath();
      c.ellipse(0, 47, 7.5, 5.5, 0, 0, Math.PI * 2);
      c.fill();
      c.restore();
      break;
    case 'wobble':
      c.beginPath();
      c.moveTo(-7, 38);
      c.bezierCurveTo(-4, 35, -2, 39, 1, 36.5);
      c.bezierCurveTo(3.5, 35, 5, 38, 7, 36);
      c.lineWidth = 2.3;
      c.stroke();
      break;
    default: { // grit: tight flat gritted teeth
      c.beginPath();
      c.roundRect(-7.5, 34.8, 15, 5.2, 2);
      fillStroke(c, '#fffdf8', 2.2);
      c.beginPath();
      c.moveTo(-7.5, 37.4); c.lineTo(7.5, 37.4);
      for (let x = -3.75; x < 4; x += 3.75) { c.moveTo(x, 34.8); c.lineTo(x, 40); }
      c.lineWidth = 1;
      c.stroke();
    }
  }
}

function hairBack(c: Ctx): void {
  c.beginPath();
  c.moveTo(-32, -4);
  c.bezierCurveTo(-40, -30, -26, -52, 2, -52);
  c.bezierCurveTo(30, -52, 41, -30, 32, -4);
  c.lineTo(28, -4);
  c.lineTo(-28, -4);
  c.closePath();
  fillStroke(c, HAIR_LO);
}

function hairFront(c: Ctx, tiltUp: number): void {
  const t = tiltUp - 7; // brow raise nudges fringe slightly up
  // short wavy hair pushed forward: soft rounded lobes, no spikes
  c.beginPath();
  c.moveTo(-30, 5);
  c.bezierCurveTo(-39, -14, -37, -36, -20, -46);
  c.bezierCurveTo(-18, -54, -8, -55, -3, -50);
  c.bezierCurveTo(1, -57, 12, -56, 14, -49);
  c.bezierCurveTo(22, -54, 33, -44, 33, -28);
  c.bezierCurveTo(35, -16, 33, -4, 30, 4);
  c.lineTo(28, -4);
  // wavy fringe right -> left, rounded locks sweeping forward and down to the picture-right
  c.bezierCurveTo(28, -13 + t, 27, -17 + t, 24, -18 + t);
  c.bezierCurveTo(22, -9 + t, 15, -7 + t, 12, -15 + t);
  c.bezierCurveTo(10, -9 + t, 3, -7 + t, 0, -18 + t);
  c.bezierCurveTo(-3, -11 + t, -10, -9 + t, -12, -19 + t);
  c.bezierCurveTo(-15, -12 + t, -22, -11 + t, -24, -17 + t);
  c.bezierCurveTo(-27, -10 + t, -28, -4, -27, 3);
  c.closePath();
  fillStroke(c, HAIR, LW);
  // wave highlights following the locks
  c.strokeStyle = HAIR_HI;
  c.lineWidth = 1.7;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(-26, -30); c.bezierCurveTo(-18, -44, -4, -44, 2, -38);
  c.moveTo(-8, -38); c.bezierCurveTo(2, -48, 18, -46, 22, -36);
  c.moveTo(-24, -24); c.bezierCurveTo(-14, -34, -2, -30, 4, -26);
  c.moveTo(8, -27); c.bezierCurveTo(14, -34, 24, -32, 27, -24);
  c.stroke();
  c.strokeStyle = HAIR_LO;
  c.lineWidth = 1.3;
  c.beginPath();
  c.moveTo(-14, -48); c.bezierCurveTo(-10, -38, -12, -30, -8, -24);
  c.moveTo(12, -49); c.bezierCurveTo(8, -40, 10, -32, 14, -26);
  c.stroke();
  // sideburns
  c.beginPath();
  c.moveTo(-29, -4); c.quadraticCurveTo(-30.5, 6, -29, 9); c.lineTo(-26.5, 1); c.closePath();
  fillStroke(c, HAIR_LO, 1.5);
  c.beginPath();
  c.moveTo(29, -4); c.quadraticCurveTo(30.5, 6, 29, 9); c.lineTo(26.5, 1); c.closePath();
  fillStroke(c, HAIR_LO, 1.5);
}

function sweatDrop(c: Ctx): void {
  c.beginPath();
  c.moveTo(31, -6);
  c.quadraticCurveTo(37, 3, 34.5, 7);
  c.quadraticCurveTo(31, 9, 29.5, 5);
  c.quadraticCurveTo(29, 1, 31, -6);
  fillStroke(c, '#bfe6ff', 1.8);
}

function headLocal(c: Ctx, expr: SamExpr, anim?: SamAnim): void {
  const L = look(expr);
  const ab = anim?.brow ?? 0;
  const al = anim?.look ?? 0;
  const bl = anim?.blink ?? 0;
  const bAdj = -ab * 3.6;
  const tAdj = ab * 1.2;
  hairBack(c);
  ear(c, -1);
  ear(c, 1);
  faceShape(c);
  fillStroke(c, SKIN);
  // jaw shade + cheek hollows
  c.save();
  faceShape(c);
  c.clip();
  c.beginPath();
  c.ellipse(0, 54, 24, 12, 0, 0, Math.PI * 2);
  c.fillStyle = 'rgba(220,160,130,0.3)';
  c.fill();
  c.lineWidth = 1.4;
  c.strokeStyle = 'rgba(200,130,105,0.5)';
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(-21, 26); c.quadraticCurveTo(-17, 33, -13, 40);
  c.moveTo(21, 26); c.quadraticCurveTo(17, 33, 13, 40);
  c.stroke();
  c.restore();
  c.fillStyle = BLUSH;
  c.beginPath(); c.ellipse(-18, 24, 5.5, 3.2, 0, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.ellipse(18, 24, 5.5, 3.2, 0, 0, Math.PI * 2); c.fill();
  eye(c, -1, L, bl, al);
  eye(c, 1, L, bl, al);
  nose(c);
  mouth(c, L.mouth);
  brow(c, -1, L.browL + bAdj, L.tiltL + tAdj);
  brow(c, 1, L.browR + bAdj, L.tiltR + tAdj);
  hairFront(c, Math.min(0, bAdj * 0.3));
  if (expr === 'worried' || expr === 'frustrated') sweatDrop(c);
}

function bustLocal(c: Ctx): void {
  // shoulders / sweater body
  c.beginPath();
  c.moveTo(-14, 40);
  c.lineTo(-14, 58);
  c.bezierCurveTo(-30, 62, -52, 66, -58, 84);
  c.lineTo(-62, 140);
  c.lineTo(62, 140);
  c.lineTo(58, 84);
  c.bezierCurveTo(52, 66, 30, 62, 14, 58);
  c.lineTo(14, 40);
  c.closePath();
  const g = c.createLinearGradient(-60, 60, 60, 60);
  g.addColorStop(0, SWEAT_SH);
  g.addColorStop(0.3, SWEAT);
  g.addColorStop(0.7, SWEAT);
  g.addColorStop(1, SWEAT_SH);
  fillStroke(c, g);
  // neck skin
  c.beginPath();
  c.moveTo(-11, 36);
  c.lineTo(-11, 58);
  c.quadraticCurveTo(0, 70, 11, 58);
  c.lineTo(11, 36);
  c.closePath();
  fillStroke(c, SKIN);
  c.beginPath();
  c.moveTo(-11, 40); c.quadraticCurveTo(0, 54, 11, 40); c.lineTo(11, 36); c.lineTo(-11, 36); c.closePath();
  c.fillStyle = 'rgba(200,140,110,0.5)';
  c.fill();
  // ribbed collar
  c.beginPath();
  c.moveTo(-15, 56);
  c.quadraticCurveTo(0, 78, 15, 56);
  c.lineTo(17, 60);
  c.quadraticCurveTo(0, 85, -17, 60);
  c.closePath();
  fillStroke(c, SWEAT_HI, 2.4);
  c.strokeStyle = SWEAT_SH;
  c.lineWidth = 1.1;
  for (let i = -3; i <= 3; i++) {
    const x = i * 4.2;
    c.beginPath();
    c.moveTo(x * 0.95, 61 + (1 - Math.abs(x) / 17) * 12 - 6.5);
    c.lineTo(x * 1.03, 61 + (1 - Math.abs(x) / 17) * 12 - 1);
    c.stroke();
  }
  // sleeve seams + folds
  c.strokeStyle = SWEAT_SH;
  c.lineWidth = 2;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(-44, 70); c.quadraticCurveTo(-40, 100, -42, 140);
  c.moveTo(44, 70); c.quadraticCurveTo(40, 100, 42, 140);
  c.stroke();
  c.lineWidth = 1.5;
  c.beginPath();
  c.moveTo(-26, 96); c.quadraticCurveTo(-20, 102, -22, 112);
  c.moveTo(24, 100); c.quadraticCurveTo(19, 106, 22, 116);
  c.moveTo(-6, 100); c.quadraticCurveTo(-2, 108, -8, 118);
  c.stroke();
}

function place(ctx: Ctx, cx: number, cy: number, size: number, fn: (c: Ctx) => void): void {
  ctx.save();
  ctx.translate(cx, cy);
  const u = size / 100;
  ctx.scale(u, u);
  fn(ctx);
  ctx.restore();
}

/** draws the head centred at (cx,cy); `size` = total head height in px (hair top to chin). */
export function drawSamFace(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, expr: SamExpr = 'neutral', anim?: SamAnim): void {
  place(ctx, cx, cy, size, (c) => headLocal(c, expr, anim));
}

/** head + neck + shoulders in a plain grey crewneck sweater; size = head height; bust extends below. */
export function drawSamBust(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, expr: SamExpr = 'neutral', anim?: SamAnim): void {
  place(ctx, cx, cy, size, (c) => {
    bustLocal(c);
    headLocal(c, expr, anim);
  });
}

/** fresh canvas (px x px) with the face drawn on a transparent background. */
export function makeSamFaceCanvas(px: number, expr: SamExpr = 'neutral', anim?: SamAnim): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = px;
  cv.height = px;
  const ctx = cv.getContext('2d', { willReadFrequently: true }); // CPU-backed (see ui_portraits.ts)
  if (ctx) drawSamFace(ctx, px / 2, px / 2 + px * 0.01, px * 0.86, expr, anim);
  return cv;
}
