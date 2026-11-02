// 1200x630 share card, drawn procedurally on a canvas. No external assets, no logos.
import type { Challenge } from './types';
import { QUOTES } from './jokes';
import { drawSamBust } from './samface';

const INK = '#060a1f';
const FONT = "'Arial Rounded MT Bold','Nunito','Trebuchet MS',system-ui,sans-serif";

function rr(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
function stext(c: CanvasRenderingContext2D, t: string, x: number, y: number, size: number, fill: string, lw = size * 0.2, align: CanvasTextAlign = 'left'): void {
  c.font = `900 ${size}px ${FONT}`; c.textAlign = align; c.textBaseline = 'alphabetic'; c.lineJoin = 'round';
  c.lineWidth = lw; c.strokeStyle = INK; c.strokeText(t, x, y); c.fillStyle = fill; c.fillText(t, x, y);
}
function wrap(c: CanvasRenderingContext2D, t: string, maxW: number): string[] {
  const out: string[] = []; let cur = '';
  for (const w of t.split(' ')) { const n = cur ? cur + ' ' + w : w; if (c.measureText(n).width > maxW && cur) { out.push(cur); cur = w; } else cur = n; }
  if (cur) out.push(cur); return out;
}

function background(c: CanvasRenderingContext2D, W: number, H: number): void {
  const g = c.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#0d1544'); g.addColorStop(0.55, '#10205c'); g.addColorStop(1, '#2a0f55');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  // perspective floor grid
  c.save(); c.strokeStyle = 'rgba(70,200,255,.18)'; c.lineWidth = 2;
  for (let i = -12; i <= 12; i++) { c.beginPath(); c.moveTo(W / 2 + i * 36, H * 0.72); c.lineTo(W / 2 + i * 150, H); c.stroke(); }
  for (let j = 0; j < 7; j++) { const y = H * 0.72 + Math.pow(j / 7, 1.8) * H * 0.28; c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
  c.restore();
  // server racks silhouette with RAM-stick slots and LEDs
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const racks = 9;
  for (let r = 0; r < racks; r++) {
    const rw = 118, x = r * (W / racks) + 6, y = 40 + (r % 3) * 22, h = H * 0.72 - y + 8;
    c.fillStyle = '#0a1036'; rr(c, x, y, rw, h, 8); c.fill(); c.strokeStyle = 'rgba(70,200,255,.35)'; c.lineWidth = 3; c.stroke();
    for (let s = 0; s < 11; s++) {
      const sy = y + 12 + s * ((h - 20) / 11); const on = rnd() > 0.35;
      c.fillStyle = on ? 'rgba(31,191,117,.55)' : 'rgba(34,50,122,.6)'; rr(c, x + 10, sy, rw - 20, 11, 3); c.fill();
      c.fillStyle = on ? '#ffd23f' : '#394070'; c.fillRect(x + 16, sy + 8, rw - 32, 2);
      const col = ['#46f0ff', '#ff4fa3', '#48f0a8'][Math.floor(rnd() * 3)];
      c.fillStyle = col; c.shadowColor = col; c.shadowBlur = on ? 10 : 0; c.beginPath(); c.arc(x + rw - 18, sy + 5.5, 2.6, 0, 7); c.fill(); c.shadowBlur = 0;
    }
  }
  const v = c.createRadialGradient(W * 0.72, H * 0.4, 60, W * 0.5, H * 0.5, W * 0.75); v.addColorStop(0, 'rgba(255,79,163,.28)'); v.addColorStop(1, 'rgba(6,10,31,.78)');
  c.fillStyle = v; c.fillRect(0, 0, W, H);
  const sh = c.createLinearGradient(0, 0, W * 0.72, 0); sh.addColorStop(0, 'rgba(6,10,31,.5)'); sh.addColorStop(0.7, 'rgba(6,10,31,.3)'); sh.addColorStop(1, 'rgba(6,10,31,0)'); c.fillStyle = sh; c.fillRect(0, 0, W * 0.72, H);
}

function ramStick(c: CanvasRenderingContext2D, x: number, y: number, s: number, rot: number): void {
  c.save(); c.translate(x, y); c.rotate(rot); c.scale(s, s);
  c.fillStyle = '#1fbf75'; c.strokeStyle = INK; c.lineWidth = 5; rr(c, -44, -14, 88, 28, 5); c.fill(); c.stroke();
  c.fillStyle = INK; for (let i = 0; i < 4; i++) c.fillRect(-34 + i * 17, -8, 11, 14);
  c.fillStyle = '#ffd23f'; for (let i = 0; i < 9; i++) c.fillRect(-40 + i * 9.5, 14, 6, 8);
  c.restore();
}

export function renderShareCard(opts: { gb: number; nick?: string; challenge?: Challenge | null }): HTMLCanvasElement {
  const W = 1200, H = 630;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c = cv.getContext('2d'); if (!c) return cv;
  background(c, W, H);

  // Sam, big, right side, with a cartoon taunt bubble
  ramStick(c, 760, 560, 1.1, -0.3); ramStick(c, 1120, 120, 0.9, 0.5); ramStick(c, 1135, 470, 0.8, -0.6);
  drawSamBust(c, 905, 300, 400, 'smug');
  c.save(); c.translate(1010, 60); c.rotate(0.04);
  c.fillStyle = '#fff'; c.strokeStyle = INK; c.lineWidth = 6; rr(c, -120, -2, 210, 58, 20); c.fill(); c.stroke();
  c.beginPath(); c.moveTo(-60, 54); c.lineTo(-84, 92); c.lineTo(-24, 54); c.closePath(); c.fill(); c.stroke();
  c.fillStyle = '#fff'; c.fillRect(-72, 50, 46, 8);
  c.fillStyle = INK; c.font = `900 26px ${FONT}`; c.textAlign = 'center'; c.fillText('Just rent it!', -15, 38);
  c.restore();

  // title strip
  const gb = Math.max(0, Math.floor(opts.gb));
  stext(c, 'SAM WANTS YOUR RAM', 48, 66, 38, '#ffd23f', 9);
  // headline
  stext(c, 'I SAVED', 48, 168, 64, '#fff', 13);
  const big = `${gb.toLocaleString('en-US')} GB`;
  let fs = 210; c.font = `900 ${fs}px ${FONT}`; while (c.measureText(big).width > 600 && fs > 80) { fs -= 8; c.font = `900 ${fs}px ${FONT}`; }
  stext(c, big, 44, 168 + fs * 0.92, fs, '#48f0a8', fs * 0.09);
  const yb = 168 + fs * 0.92;
  stext(c, 'OF RAM, FROM SAM', 50, yb + 52, 40, '#ff86c4', 10);
  const who = opts.nick ? `${opts.nick}` : '';
  if (who) stext(c, `- ${who}`, 52, yb + 92, 28, '#46c8ff', 7);

  // quote card
  const q = QUOTES[1]; const qy = 428;
  c.fillStyle = 'rgba(6,10,31,.82)'; c.strokeStyle = INK; c.lineWidth = 5; rr(c, 40, qy, 700, 150, 18); c.fill(); c.stroke();
  c.strokeStyle = 'rgba(255,79,163,.9)'; c.lineWidth = 3; rr(c, 46, qy + 6, 688, 138, 14); c.stroke();
  c.font = `700 22px ${FONT}`; c.textAlign = 'left'; c.fillStyle = '#f4f7ff';
  const lines = wrap(c, `“${q.text}”`, 660).slice(0, 3);
  lines.forEach((l, i) => c.fillText(l, 62, qy + 42 + i * 28));
  c.font = `800 17px ${FONT}`; c.fillStyle = '#ffd23f'; c.fillText(`- ${q.attribution}`, 62, qy + 42 + lines.length * 28 + 8);

  // footer
  c.font = `800 22px ${FONT}`; c.textAlign = 'left'; c.fillStyle = '#9fb0e8';
  const host = (typeof location !== 'undefined' && location.host) ? location.host : 'SAM WANTS YOUR RAM';
  c.fillText(host.toUpperCase() + '   •   BEAT ME', 48, 604);
  c.font = `600 13px ${FONT}`; c.fillStyle = 'rgba(190,203,245,.9)'; c.textAlign = 'left';
  c.fillText('Parody. Not affiliated with or endorsed by Sam Altman or OpenAI.', 48, 623);

  if (opts.challenge) {
    c.save(); c.translate(1040, 540); c.rotate(-0.06);
    c.fillStyle = '#ffd23f'; c.strokeStyle = INK; c.lineWidth = 5; rr(c, -150, -34, 300, 68, 16); c.fill(); c.stroke();
    c.fillStyle = INK; c.font = `900 22px ${FONT}`; c.textAlign = 'center';
    c.fillText(`${opts.challenge.from.slice(0, 16)}: ${opts.challenge.beat} GB`, 0, -2);
    c.font = `800 17px ${FONT}`; c.fillText(gb > opts.challenge.beat ? 'BEATEN!' : 'STILL TO BEAT', 0, 22);
    c.restore();
  }
  return cv;
}

(window as unknown as { __shareCard: (gb: number) => string }).__shareCard = (gb: number) => renderShareCard({ gb }).toDataURL('image/png');

/** Link-preview card (og.png): no score claim. Earnest wide-eyed Sam, headline, one verbatim quote, disclaimer. */
export function renderOgCard(): HTMLCanvasElement {
  const W = 1200, H = 630;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c = cv.getContext('2d'); if (!c) return cv;
  background(c, W, H);
  ramStick(c, 700, 575, 1.1, -0.3); ramStick(c, 1130, 90, 0.9, 0.5); ramStick(c, 1140, 520, 0.85, -0.6);
  drawSamBust(c, 895, 330, 440, 'neutral');
  stext(c, 'SAM WANTS YOUR RAM', 48, 78, 54, '#ffd23f', 12);
  stext(c, 'HOW MUCH RAM', 48, 168, 70, '#fff', 14);
  stext(c, 'CAN YOU SAVE', 48, 244, 70, '#fff', 14);
  stext(c, 'FROM SAM?', 48, 326, 86, '#48f0a8', 16);
  const q = QUOTES[1]; const qy = 372;
  c.fillStyle = 'rgba(6,10,31,.84)'; c.strokeStyle = INK; c.lineWidth = 5; rr(c, 40, qy, 640, 150, 18); c.fill(); c.stroke();
  c.strokeStyle = 'rgba(255,79,163,.9)'; c.lineWidth = 3; rr(c, 46, qy + 6, 628, 138, 14); c.stroke();
  c.font = `700 25px ${FONT}`; c.textAlign = 'left'; c.fillStyle = '#f4f7ff';
  const lines = wrap(c, `“${q.text}”`, 590).slice(0, 3);
  lines.forEach((l, i) => c.fillText(l, 66, qy + 44 + i * 32));
  c.font = `800 17px ${FONT}`; c.fillStyle = '#ffd23f'; c.fillText(`- ${q.attribution}`, 66, qy + 44 + lines.length * 32 + 6);
  c.font = `700 15px ${FONT}`; c.fillStyle = 'rgba(205,216,250,.95)'; c.textAlign = 'left';
  c.fillText('Parody. Not affiliated with or endorsed by Sam Altman or OpenAI.', 48, 600);
  return cv;
}
(window as unknown as { __ogCard: () => string }).__ogCard = () => renderOgCard().toDataURL('image/png');
