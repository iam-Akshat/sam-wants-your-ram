// Portable API core: pure functions over a Storage interface (no Bun/SQLite imports) so it can move to a Cloudflare Worker + D1.
export interface ScoreRow { nick: string; gb: number; dur: number; ts: number }
export interface Storage {
  addScore(r: ScoreRow): Promise<void> | void;
  stats(): Promise<{ totalGb: number; runs: number }> | { totalGb: number; runs: number };
  top(sinceTs: number, limit: number): Promise<{ nick: string; gb: number; ts: number }[]> | { nick: string; gb: number; ts: number }[];
  rank(sinceTs: number, gb: number): Promise<number> | number;
}
export interface Limiter { hit(key: string, now: number): boolean }

export const MAX_BODY = 2048;
const BAD = ['fuck', 'shit', 'cunt', 'nigg', 'fagg', 'bitch', 'dick', 'cock', 'pussy', 'whore', 'slut', 'rape', 'nazi', 'hitler', 'retard', 'asshole', 'penis', 'vagina', 'porn', 'kike', 'spic', 'chink'];
const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's', '!': 'i' };
export function cleanNick(raw: unknown): string {
  if (typeof raw !== 'string') return 'Anonymous';
  let n = raw.replace(/[\u0000-\u001f\u007f<>&"'`\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16);
  if (!n) return 'Anonymous';
  const flat = n.toLowerCase().replace(/[01345 7@$!]/g, (c) => LEET[c] ?? '').replace(/[^a-z]/g, '');
  if (BAD.some((w) => flat.includes(w))) return 'Anonymous';
  return n;
}
/** best-effort plausibility: measured best case (bot at top speed 34 m/s, magnet on, every kit) is ~27 GB per second of play; allow ~30% headroom (36) and cap runs at 30 minutes */
export function plausible(gb: number, dur: number): boolean {
  if (!Number.isFinite(gb) || !Number.isFinite(dur)) return false;
  if (gb < 0 || gb > 70000 || dur < 3 || dur > 1800) return false;
  return gb <= dur * 36 + 70;
}
export const dayStart = (now: number) => Math.floor(now / 86400000) * 86400000;
const json = (data: unknown, status = 200, extra: Record<string, string> = {}) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra } });

export interface Deps { store: Storage; limiter: Limiter; now: () => number }
/** returns null when the path is not an API route */
export async function handleApi(req: Request, url: URL, ip: string, d: Deps): Promise<Response | null> {
  const p = url.pathname;
  if (!p.startsWith('/api/')) return null;
  const now = d.now();
  try {
    if (p === '/api/stats' && req.method === 'GET') {
      const s = await d.store.stats();
      return json({ totalGb: s.totalGb, totalTb: Math.round(s.totalGb / 1024 * 10) / 10, runs: s.runs });
    }
    if (p === '/api/leaderboard' && req.method === 'GET') {
      const rows = await d.store.top(dayStart(now), 50);
      return json({ day: new Date(dayStart(now)).toISOString().slice(0, 10), entries: rows.map((r, i) => ({ rank: i + 1, nick: r.nick, gb: r.gb })) });
    }
    if (p === '/api/score' && req.method === 'POST') {
      const len = Number(req.headers.get('content-length') ?? '0');
      if (len > MAX_BODY) return json({ ok: false, error: 'too large' }, 413);
      const text = await req.text();
      if (text.length > MAX_BODY) return json({ ok: false, error: 'too large' }, 413);
      let b: { nickname?: unknown; gb?: unknown; duration?: unknown };
      try { b = JSON.parse(text); } catch { return json({ ok: false, error: 'bad json' }, 400); }
      const gb = Math.round(Number(b.gb)), dur = Number(b.duration);
      if (!plausible(gb, dur)) return json({ ok: false, error: 'implausible' }, 422);
      if (!d.limiter.hit(ip, now)) return json({ ok: false, error: 'rate limited' }, 429, { 'retry-after': '10' });
      const nick = cleanNick(b.nickname);
      await d.store.addScore({ nick, gb, dur: Math.round(dur), ts: now });
      const rank = await d.store.rank(dayStart(now), gb);
      return json({ ok: true, rank, nick });
    }
    return json({ ok: false, error: 'not found' }, 404);
  } catch (e) {
    return json({ ok: false, error: 'server error' }, 500);
  }
}

/** sliding window: 1 submit / 8 s and 40 / hour per key */
export class MemLimiter implements Limiter {
  private last = new Map<string, number>(); private hourly = new Map<string, number[]>();
  hit(key: string, now: number): boolean {
    const l = this.last.get(key) ?? 0; if (now - l < 8000) return false;
    const arr = (this.hourly.get(key) ?? []).filter((t) => now - t < 3600000); if (arr.length >= 40) return false;
    arr.push(now); this.hourly.set(key, arr); this.last.set(key, now);
    if (this.last.size > 20000) { this.last.clear(); this.hourly.clear(); }
    return true;
  }
}
