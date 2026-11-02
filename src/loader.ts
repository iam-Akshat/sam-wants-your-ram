/** Thin wrapper over the inline boot screen in index.html (window.__boot). The same overlay is the boot loader (full) and a lighter veil for later heavy work. */
interface Boot { visible: boolean; pct: number; log: number[]; onLow: (() => void) | null; show(label: string, veil?: boolean): void; set(p: number, label?: string): void; hide(): void; fail(e: unknown): void }
declare global { interface Window { __boot?: Boot } }
const B = (): Boot | undefined => window.__boot;

/** resolves after the browser had a chance to paint (rAF + timeout fallback so a stalled rAF can never hang us) */
export function paint(): Promise<void> {
  return new Promise((res) => { let d = false; const f = () => { if (!d) { d = true; res(); } }; requestAnimationFrame(() => setTimeout(f, 0)); setTimeout(f, 50); });
}
export const loader = {
  get visible(): boolean { return !!B()?.visible; },
  /** shows the overlay synchronously (visible in the very next paint) */
  showNow(label: string, veil = true): void { B()?.show(label, veil); },
  /** show and yield so the overlay is painted before heavy synchronous work starts */
  async show(label: string, veil = true): Promise<void> { B()?.show(label, veil); await paint(); },
  set(p: number, label?: string): void { B()?.set(p, label); },
  /** progress step + yield so the bar visibly advances between chunks of work */
  async step(p: number, label?: string): Promise<void> { B()?.set(p, label); await paint(); },
  hide(): void { B()?.hide(); },
  fail(e: unknown): void { B()?.fail(e); },
  setOnLow(fn: (() => void) | null): void { const b = B(); if (b) b.onLow = fn; },
};
