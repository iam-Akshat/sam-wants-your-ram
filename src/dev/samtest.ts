import { drawSamFace, drawSamBust, makeSamFaceCanvas, type SamExpr } from '../samface';

const EX: SamExpr[] = ['neutral', 'smug', 'shock', 'glee', 'worried', 'blink', 'frustrated'];
const q = new URLSearchParams(location.search);
const page = q.get('p') ?? 'a';
const cv = document.getElementById('c') as HTMLCanvasElement;
const ctx = cv.getContext('2d')!;
function bg(x: number, y: number, w: number, h: number, col: string): void { ctx.fillStyle = col; ctx.fillRect(x, y, w, h); }

if (page === 'a') {
  cv.width = 1280; cv.height = 720;
  bg(0, 0, 1280, 720, '#7a7f86');
  EX.forEach((e, i) => drawSamFace(ctx, 160 + (i % 4) * 320, 175 + Math.floor(i / 4) * 355, 300, e));
} else if (page === 'b') {
  cv.width = 1280; cv.height = 720;
  bg(0, 0, 1280, 720, '#14172a');
  EX.forEach((e, i) => drawSamBust(ctx, 160 + (i % 4) * 320, 100 + Math.floor(i / 4) * 360, 190, e));
} else if (page === 'c') {
  cv.width = 1280; cv.height = 400;
  bg(0, 0, 640, 200, '#7a7f86'); bg(640, 0, 640, 200, '#14172a');
  EX.forEach((e, i) => { drawSamFace(ctx, 45 + i * 85, 100, 64, e); drawSamFace(ctx, 685 + i * 85, 100, 64, e); });
  for (let y = 0; y < 200; y += 20) for (let x = 0; x < 1280; x += 20) bg(x, 200 + y, 20, 20, ((x + y) / 20) % 2 ? '#3fa' : '#f6a');
  EX.forEach((e, i) => ctx.drawImage(makeSamFaceCanvas(128, e), 10 + i * 180, 236));
} else if (page === 'd') { // anim row
  cv.width = 1280; cv.height = 720;
  bg(0, 0, 1280, 720, '#7a7f86');
  const rows: Array<Array<{ brow?: number; look?: number; blink?: number }>> = [
    [{ brow: -1 }, { brow: -0.5 }, { brow: 0 }, { brow: 0.5 }, { brow: 1 }],
    [{ look: -1 }, { look: -0.5 }, { look: 0 }, { look: 0.5 }, { look: 1 }],
    [{ blink: 0 }, { blink: 0.3 }, { blink: 0.6 }, { blink: 0.9 }, { blink: 1 }],
  ];
  rows.forEach((r, ri) => r.forEach((a, i) => drawSamFace(ctx, 120 + i * 250, 120 + ri * 240, 210, 'neutral', a)));
} else {
  cv.width = 1280; cv.height = 720;
  bg(0, 0, 1280, 720, '#7a7f86');
  drawSamBust(ctx, 400, 300, 560, 'neutral');
  drawSamFace(ctx, 1000, 300, 560, (q.get('e') as SamExpr) ?? 'smug');
}
(window as unknown as { ready: boolean }).ready = true;
