/** Always-on diagnostics that survive a freeze: ring buffer of recent game events + freeze reports saved to localStorage. */
const N = 80, KEY = 'ramrun.freeze.v1';
export interface DiagEvent { t: number; msg: string }
const t0 = performance.now();
export const diag = {
  events: [] as DiagEvent[],
  log(msg: string): void { this.events.push({ t: +((performance.now() - t0) / 1000).toFixed(3), msg }); if (this.events.length > N) this.events.shift(); },
  /** last saved freeze / context-loss report (from this or an earlier page load) */
  lastSaved(): string | null { try { const a = JSON.parse(localStorage.getItem(KEY) || '[]') as unknown[]; return a.length ? JSON.stringify(a[a.length - 1], null, 1) : null; } catch { return null; } },
  save(kind: string, extra: Record<string, unknown>): void {
    const rep = { kind, at: new Date().toISOString(), tSec: +((performance.now() - t0) / 1000).toFixed(2), ua: navigator.userAgent, dpr: devicePixelRatio, window: `${innerWidth}x${innerHeight}`, ...extra, events: this.events.slice() };
    this.log(`REPORT SAVED: ${kind}`);
    try { const a = JSON.parse(localStorage.getItem(KEY) || '[]') as unknown[]; a.push(rep); while (a.length > 3) a.shift(); localStorage.setItem(KEY, JSON.stringify(a)); } catch { /* storage unavailable */ }
  },
};
declare global { interface Window { __diag?: typeof diag } }
window.__diag = diag;
