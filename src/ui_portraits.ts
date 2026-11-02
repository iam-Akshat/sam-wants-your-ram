// Inline-SVG art for RAM RUN UI. Pure strings, no deps. All parody; no real likenesses or logos.
import { makeSamFaceCanvas, drawSamBust, drawSamFace, type SamExpr } from './samface';
const INK = '#060a1f';

export function ramIcon(cls = ''): string {
  return `<svg class="ico ${cls}" viewBox="0 0 48 30" aria-hidden="true"><rect x="2" y="2" width="44" height="21" rx="4" fill="#1fbf75" stroke="${INK}" stroke-width="3"/><rect x="7" y="7" width="8" height="11" rx="1.5" fill="${INK}"/><rect x="18" y="7" width="8" height="11" rx="1.5" fill="${INK}"/><rect x="29" y="7" width="8" height="11" rx="1.5" fill="${INK}"/><path d="M8 9h6M19 9h6M30 9h6" stroke="#5b6a9a" stroke-width="1.5" stroke-linecap="round"/><path d="M5 25h15M26 25h17" stroke="#ffd23f" stroke-width="5"/><path d="M5 25h15M26 25h17" stroke="${INK}" stroke-width="1" stroke-dasharray="2 3" opacity=".5"/></svg>`;
}

export function lockIcon(cls = ''): string {
  return `<svg class="ico ${cls}" viewBox="0 0 32 36" aria-hidden="true"><path d="M8 16V11a8 8 0 0 1 16 0v5" fill="none" stroke="${INK}" stroke-width="7" stroke-linecap="round"/><path d="M8 16V11a8 8 0 0 1 16 0v5" fill="none" stroke="#c9d3f5" stroke-width="3.2" stroke-linecap="round"/><rect x="3" y="15" width="26" height="19" rx="5" fill="#ffd23f" stroke="${INK}" stroke-width="3"/><circle cx="16" cy="23.5" r="3" fill="${INK}"/><rect x="14.8" y="24" width="2.4" height="6" rx="1" fill="${INK}"/></svg>`;
}

export function powerIcon(kind: string, cls = ''): string {
  const s = `class="ico ${cls}" viewBox="0 0 32 32" aria-hidden="true"`;
  switch (kind) {
    case 'ddr':
      return `<svg ${s}><rect x="2" y="7" width="28" height="15" rx="3" fill="#ffd23f" stroke="${INK}" stroke-width="2.5"/><rect x="5" y="10" width="5" height="9" fill="${INK}"/><text x="21" y="19.5" text-anchor="middle" font-size="11" font-weight="900" fill="${INK}" font-family="Arial Black,Arial,sans-serif">x2</text><path d="M5 25h22" stroke="${INK}" stroke-width="3"/></svg>`;
    case 'magnet':
      return `<svg ${s}><path d="M6 6v12a10 10 0 0 0 20 0V6" fill="none" stroke="${INK}" stroke-width="10" stroke-linejoin="round"/><path d="M6 6v12a10 10 0 0 0 20 0V6" fill="none" stroke="#ff4fa3" stroke-width="5.5" stroke-linejoin="round"/><rect x="2.5" y="3" width="7" height="6" fill="#f4f7ff" stroke="${INK}" stroke-width="2"/><rect x="22.5" y="3" width="7" height="6" fill="#f4f7ff" stroke="${INK}" stroke-width="2"/></svg>`;
    case 'shield':
      return `<svg ${s}><path d="M16 2l12 4v9c0 8-5.5 12.5-12 15C9.500 27.500 4 23 4 15V6z" fill="#48f0a8" stroke="${INK}" stroke-width="2.8" stroke-linejoin="round"/><path d="M10 16l4.500 4.500L23 11" fill="none" stroke="${INK}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    case 'cool':
      return `<svg ${s}><path d="M16 2c6 8 9 12 9 17a9 9 0 0 1-18 0c0-5 3-9 9-17z" fill="#46c8ff" stroke="${INK}" stroke-width="2.8" stroke-linejoin="round"/><path d="M11.500 20a4.500 4.500 0 0 0 4 4" fill="none" stroke="#f4f7ff" stroke-width="2.500" stroke-linecap="round"/></svg>`;
    case 'oc':
      return `<svg ${s}><path d="M18 2L5 18h8l-3 12 17-17h-9z" fill="#ff7a2f" stroke="${INK}" stroke-width="2.8" stroke-linejoin="round"/><path d="M17 8l-6 8" stroke="#ffd23f" stroke-width="2.500" stroke-linecap="round"/></svg>`;
    case 'head':
      return `<svg ${s}><rect x="3" y="4" width="7" height="24" rx="2" fill="#1fbf75" stroke="${INK}" stroke-width="2.500"/><rect x="12.500" y="4" width="7" height="24" rx="2" fill="#1fbf75" stroke="${INK}" stroke-width="2.500"/><rect x="22" y="4" width="7" height="24" rx="2" fill="#2ee59d" stroke="${INK}" stroke-width="2.500" stroke-dasharray="3 2.500"/></svg>`;
    default:
      return '';
  }
}

export function logoSvg(): string {
  const F = "font-family=\"'Arial Rounded MT Bold','Nunito','Trebuchet MS',system-ui,sans-serif\" font-weight=\"900\"";
  const contacts = Array.from({ length: 14 }, (_, i) => `<rect x="${20 + i * 22}" y="130" width="15" height="17" rx="2"/>`).join('');
  return `<svg class="logo" viewBox="0 0 340 214" role="img" aria-label="SAM WANTS YOUR RAM - RAM RUN">
<defs><linearGradient id="lg1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3dffb0"/><stop offset="1" stop-color="#14a864"/></linearGradient>
<linearGradient id="lg2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff86c4"/><stop offset="1" stop-color="#ff2f92"/></linearGradient></defs>
<g transform="rotate(-3 170 100)">
<rect x="9" y="14" width="326" height="124" rx="14" fill="${INK}"/>
<rect x="4" y="8" width="326" height="124" rx="14" fill="url(#lg1)" stroke="${INK}" stroke-width="6"/>
<path d="M16 22h50M270 22h46M16 120h60M250 120h66" stroke="#0e7d49" stroke-width="3" stroke-linecap="round" opacity=".7"/>
<g fill="${INK}"><rect x="14" y="34" width="22" height="30" rx="4"/><rect x="298" y="34" width="22" height="30" rx="4"/><rect x="14" y="72" width="22" height="30" rx="4"/><rect x="298" y="72" width="22" height="30" rx="4"/></g>
<g stroke="#5b6a9a" stroke-width="3" stroke-linecap="round"><path d="M19 42h12M19 52h12M303 42h12M303 52h12M19 80h12M19 90h12M303 80h12M303 90h12"/></g>
<g fill="#ffd23f" stroke="${INK}" stroke-width="3">${contacts}</g>
<text x="167" y="64" text-anchor="middle" ${F} font-size="42" textLength="236" lengthAdjust="spacingAndGlyphs" fill="#fff" stroke="${INK}" stroke-width="11" stroke-linejoin="round" paint-order="stroke">SAM WANTS</text>
<text x="167" y="117" text-anchor="middle" ${F} font-size="56" textLength="256" lengthAdjust="spacingAndGlyphs" fill="#ffd23f" stroke="${INK}" stroke-width="12" stroke-linejoin="round" paint-order="stroke">YOUR RAM</text>
<g transform="translate(170 178) rotate(2)"><rect x="-70" y="-20" width="140" height="40" rx="20" fill="url(#lg2)" stroke="${INK}" stroke-width="6"/>
<text x="0" y="9" text-anchor="middle" ${F} font-style="italic" font-size="26" letter-spacing="3" fill="#fff" stroke="${INK}" stroke-width="5" paint-order="stroke">RAM RUN</text></g>
</g></svg>`;
}

const samCache = new Map<string, string>();
/** Sam cartoon face as a cached PNG data URL (canvas-drawn; flat-vector art from samface.ts). */
export function samUrl(expr: SamExpr = 'smug', px = 256): string {
  const k = expr + px; let u = samCache.get(k);
  if (!u) { try { u = makeSamFaceCanvas(px, expr).toDataURL(); } catch { u = ''; } samCache.set(k, u); }
  return u;
}
export function samPortrait(expr: SamExpr = 'smug', cls = '', px = 256): string {
  return `<img class="portrait sam ${cls}" src="${samUrl(expr, px)}" alt="Cartoon Sam Altman (parody)" draggable="false">`;
}

export function kiloPortrait(cls = ''): string {
  return `<svg class="portrait ${cls}" viewBox="0 0 200 200" role="img" aria-label="Kilo the bot">
<path d="M100 40Q94 20 112 12" fill="none" stroke="${INK}" stroke-width="12" stroke-linecap="round"/><path d="M100 40Q94 20 112 12" fill="none" stroke="#8a97c9" stroke-width="5" stroke-linecap="round"/>
<circle cx="114" cy="11" r="9" fill="#ffd23f" stroke="${INK}" stroke-width="5"/><circle cx="111" cy="8" r="2.500" fill="#fff"/>
<rect x="56" y="148" width="92" height="46" rx="16" fill="#5aa0c8" stroke="${INK}" stroke-width="6"/>
<rect x="72" y="160" width="26" height="10" rx="5" fill="#2e6d93"/><circle cx="116" cy="166" r="5" fill="#ffd23f" stroke="${INK}" stroke-width="3"/>
<rect x="20" y="82" width="24" height="46" rx="10" fill="#ff4fa3" stroke="${INK}" stroke-width="6"/><rect x="156" y="82" width="24" height="46" rx="10" fill="#ff4fa3" stroke="${INK}" stroke-width="6"/>
<rect x="34" y="36" width="132" height="120" rx="36" fill="#8fd0ee" stroke="${INK}" stroke-width="7"/>
<path d="M48 62q4-14 22-18" fill="none" stroke="#e8f8ff" stroke-width="6" stroke-linecap="round" opacity=".8"/>
<rect x="50" y="60" width="100" height="68" rx="24" fill="#0b1230" stroke="${INK}" stroke-width="5"/>
<circle cx="78" cy="92" r="16" fill="#46f0ff"/><circle cx="124" cy="94" r="14" fill="#46f0ff"/>
<circle cx="83" cy="86" r="5.500" fill="#fff"/><circle cx="128" cy="89" r="4.500" fill="#fff"/><circle cx="76" cy="97" r="3" fill="#0b8fb0"/><circle cx="122" cy="99" r="2.500" fill="#0b8fb0"/>
<path d="M86 114q15 12 30 0" fill="none" stroke="#46f0ff" stroke-width="5" stroke-linecap="round"/>
<g transform="rotate(-14 56 48)"><rect x="40" y="40" width="30" height="16" rx="3" fill="#ffd23f" stroke="${INK}" stroke-width="4"/><path d="M55 42v12M49 48h12" stroke="${INK}" stroke-width="2.500"/></g>
<circle cx="154" cy="140" r="4" fill="#5aa0c8" stroke="${INK}" stroke-width="3"/><circle cx="46" cy="140" r="4" fill="#5aa0c8" stroke="${INK}" stroke-width="3"/>
<g transform="translate(126 150)"><path d="M10 6q0-8 14-8t14 8" fill="none" stroke="${INK}" stroke-width="9" stroke-linecap="round"/><path d="M10 6q0-8 14-8t14 8" fill="none" stroke="#c9d3f5" stroke-width="4" stroke-linecap="round"/>
<rect x="14" y="-8" width="20" height="12" rx="2" fill="#1fbf75" stroke="${INK}" stroke-width="3"/>
<rect x="0" y="4" width="48" height="36" rx="8" fill="#ffd23f" stroke="${INK}" stroke-width="6"/><rect x="0" y="16" width="48" height="6" fill="${INK}" opacity=".25"/><circle cx="24" cy="26" r="5" fill="#ff4fa3" stroke="${INK}" stroke-width="3"/></g>
</svg>`;
}

export function narratorIcon(cls = ''): string {
  return `<svg class="portrait ${cls}" viewBox="0 0 200 200" role="img" aria-label="Narrator">
<rect x="62" y="18" width="76" height="112" rx="38" fill="#c9d3f5" stroke="${INK}" stroke-width="7"/>
<path d="M72 44h56M72 62h56M72 80h56M72 98h56" stroke="#5b6a9a" stroke-width="5" stroke-linecap="round"/>
<path d="M40 86v14a60 60 0 0 0 120 0V86" fill="none" stroke="${INK}" stroke-width="16" stroke-linecap="round"/><path d="M40 86v14a60 60 0 0 0 120 0V86" fill="none" stroke="#ffd23f" stroke-width="7" stroke-linecap="round"/>
<path d="M100 160v26M66 190h68" stroke="${INK}" stroke-width="16" stroke-linecap="round"/><path d="M100 160v26M66 190h68" stroke="#ffd23f" stroke-width="7" stroke-linecap="round"/>
</svg>`;
}

export type LiveExpr = SamExpr | 'earnest';

/** Animated 2D Sam on a canvas: idle bob, blinks, brow raises, glances; optional periodic smug/shock flicks. Runs only between start() and stop(). */
export class SamLive {
  private raf = 0; private last = 0; private t0 = 0; private expr: SamExpr = 'neutral'; private changeAt = -9; private w = 0;
  private flick: SamExpr | null = null; private nextFlick = 4; private flickEnd = 0; private fi = 0;
  constructor(private cv: HTMLCanvasElement, private mode: 'bust' | 'face', private fps: number, private flicks: boolean) {}
  setExpr(e: LiveExpr): void {
    const x: SamExpr = e === 'earnest' ? 'neutral' : e;
    if (x === this.expr) return;
    this.expr = x; this.changeAt = (performance.now() - this.t0) / 1000;
    if (!this.raf) this.draw(performance.now());
  }
  start(): void {
    if (this.raf) return;
    this.t0 = performance.now(); this.last = 0; this.nextFlick = 4;
    const loop = (now: number): void => {
      this.raf = requestAnimationFrame(loop);
      if (document.hidden || now - this.last < 1000 / this.fps - 2) return;
      this.last = now; this.draw(now);
    };
    this.raf = requestAnimationFrame(loop);
  }
  stop(): void { if (this.raf) cancelAnimationFrame(this.raf); this.raf = 0; }
  private draw(now: number): void {
    const cv = this.cv; const cssW = cv.clientWidth; const cssH = cv.clientHeight;
    if (!cssW || !cssH) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    if (this.w !== cssW) { this.w = cssW; cv.width = Math.round(cssW * dpr); cv.height = Math.round(cssH * dpr); }
    // CPU-backed canvas on purpose: painting this face with Skia's GPU raster hung Chrome's GPU process (frames stopped, then context loss); see README "Freeze root cause"
    const c = cv.getContext('2d', { willReadFrequently: true }); if (!c) return;
    const t = (now - this.t0) / 1000;
    if (this.flicks) {
      if (!this.flick && t > this.nextFlick) { this.flick = this.fi++ % 2 ? 'shock' : 'smug'; this.flickEnd = t + 1.1; }
      else if (this.flick && t > this.flickEnd) { this.flick = null; this.nextFlick = t + 5 + Math.random(); }
    }
    const ph = (t + 0.7) % 3.4; const b1 = ph < 0.18 ? Math.sin((ph / 0.18) * Math.PI) : 0;
    const ph2 = (t + 2) % 7.3; const b2 = ph2 < 0.16 ? Math.sin((ph2 / 0.16) * Math.PI) : 0;
    const bp = (t + 1.3) % 4.9; const brow = bp < 0.9 ? Math.sin((bp / 0.9) * Math.PI) : 0;
    const look = Math.max(-1, Math.min(1, Math.sin(t * 0.8) * 0.7 + Math.sin(t * 2.3) * 0.3));
    const ex = this.flick || this.expr;
    const dt = t - this.changeAt; const pop = dt < 0.5 ? Math.exp(-dt * 7) : 0;
    c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, cssW, cssH);
    c.save(); c.translate(cssW / 2, cssH / 2);
    c.rotate(Math.sin(dt * 38) * 0.07 * pop + Math.sin(t * 1.3) * 0.015);
    const sc = 1 + 0.14 * pop; c.scale(sc, sc);
    const bob = Math.sin(t * 2.2) * cssH * 0.012;
    const anim = { brow: brow, look, blink: Math.max(b1, b2) };
    if (this.mode === 'bust') drawSamBust(c, 0, -cssH * 0.1 + bob, cssH * 0.62, ex, anim);
    else drawSamFace(c, 0, bob, Math.min(cssW, cssH) * 0.86, ex, anim);
    c.restore();
  }
}
