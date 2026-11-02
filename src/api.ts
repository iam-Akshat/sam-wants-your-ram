import type { GlobalStats, LbEntry } from './types';
// Same-origin API client. Everything resolves to null when the API is unreachable (file://, server stopped, offline).
const ok = () => typeof location !== 'undefined' && /^https?:$/.test(location.protocol);
async function call<T>(path: string, init?: RequestInit): Promise<T | null> {
  if (!ok()) return null;
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 3500);
  try {
    const r = await fetch(path, { ...init, signal: ac.signal, cache: 'no-store' });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch { return null; } finally { clearTimeout(t); }
}
export const apiStats = () => call<GlobalStats>('/api/stats');
export const apiLeaderboard = async (): Promise<LbEntry[] | null> => (await call<{ entries: LbEntry[] }>('/api/leaderboard'))?.entries ?? null;
export const apiSubmit = (nickname: string, gb: number, duration: number) =>
  call<{ ok: boolean; rank: number; nick: string }>('/api/score', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nickname, gb, duration }) });
export function sanitizeFrom(raw: string | null): string { return (raw ?? '').replace(/[^A-Za-z0-9 _.\-]/g, '').trim().slice(0, 16); }
export function parseChallenge(q: URLSearchParams): { from: string; beat: number } | null {
  const beat = Math.floor(Number(q.get('beat')));
  if (!Number.isFinite(beat) || beat < 1 || beat > 100000) return null;
  return { from: sanitizeFrom(q.get('from')) || 'a friend', beat };
}
