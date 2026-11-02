// Cloudflare Worker: serves the built game from static assets and runs the tiny score API on D1.
// Same API logic as the Bun server (server/core.ts); only storage and rate limiting differ.
import { handleApi, type ScoreRow, type Storage } from '../server/core';

interface D1Stmt { bind(...v: unknown[]): D1Stmt; run(): Promise<unknown>; first<T>(): Promise<T | null>; all<T>(): Promise<{ results: T[] }> }
interface D1 { prepare(sql: string): D1Stmt }
interface Env {
  DB: D1;
  ASSETS: { fetch(req: Request | string): Promise<Response> };
  SCORE_LIMITER: { limit(o: { key: string }): Promise<{ success: boolean }> };
  IP_SALT?: string;
}

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
/** Same rule as the Bun server's MemLimiter: 1 submit per 8 s and 40 per hour per client, but exact across all Cloudflare locations.
 *  Cloudflare's rate-limit binding runs first as a cheap, approximate throttle. Only a salted IP hash is stored, for 1 hour. */
async function hitLimit(env: Env, ip: string, now: number): Promise<boolean> {
  if (!(await env.SCORE_LIMITER.limit({ key: ip })).success) return false;
  const ipk = hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${env.IP_SALT ?? ''}|${ip}`))).slice(0, 32);
  const r = await env.DB.prepare('SELECT SUM(ts > ?2) AS recent, COUNT(*) AS hour FROM hits WHERE ipk = ?1 AND ts > ?3').bind(ipk, now - 8000, now - 3600000).first<{ recent: number | null; hour: number }>();
  if ((r?.recent ?? 0) > 0 || (r?.hour ?? 0) >= 40) return false;
  await env.DB.prepare('INSERT INTO hits (ipk, ts) VALUES (?1, ?2)').bind(ipk, now).run();
  await env.DB.prepare('DELETE FROM hits WHERE ts < ?1').bind(now - 3600000).run();
  return true;
}

class D1Storage implements Storage {
  constructor(private db: D1) {}
  async addScore(r: ScoreRow) { await this.db.prepare('INSERT INTO scores (nick, gb, dur, ts) VALUES (?1, ?2, ?3, ?4)').bind(r.nick, r.gb, r.dur, r.ts).run(); }
  async stats() { const r = await this.db.prepare('SELECT COALESCE(SUM(gb),0) AS t, COUNT(*) AS n FROM scores').first<{ t: number; n: number }>(); return { totalGb: r?.t ?? 0, runs: r?.n ?? 0 }; }
  async top(since: number, limit: number) { return (await this.db.prepare('SELECT nick, gb, ts FROM scores WHERE ts >= ?1 ORDER BY gb DESC, ts ASC LIMIT ?2').bind(since, limit).all<{ nick: string; gb: number; ts: number }>()).results; }
  async rank(since: number, gb: number) { const r = await this.db.prepare('SELECT COUNT(*) AS n FROM scores WHERE ts >= ?1 AND gb > ?2').bind(since, gb).first<{ n: number }>(); return (r?.n ?? 0) + 1; }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const ip = req.headers.get('cf-connecting-ip') ?? 'unknown';
    const api = await handleApi(req, url, ip, {
      store: new D1Storage(env.DB),
      limiter: { hit: (key, now) => hitLimit(env, key, now) },
      now: () => Date.now(),
    });
    if (api) return api;
    if (url.pathname !== '/') return new Response('not found', { status: 404 });
    // The page: fill in absolute URLs for the share-card meta tags (og:url, og:image), like the Bun server does.
    const res = await env.ASSETS.fetch(new Request(new URL('/', url), req));
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('text/html')) return res;
    const html = (await res.text()).replaceAll('%ORIGIN%', url.origin);
    const h = new Headers(res.headers); h.set('cache-control', 'no-cache'); h.delete('content-length'); h.delete('etag');
    return new Response(html, { status: res.status, headers: h });
  },
};
