// SAM WANTS YOUR RAM server: static site + tiny API. Run: ~/.bun/bin/bun server/index.ts   (PORT env, default 8088, 127.0.0.1 only)
import { join, normalize, resolve, sep } from 'node:path';
import { existsSync, statSync } from 'node:fs';
import { handleApi, MemLimiter } from './core';
import { SqliteStorage } from './sqlite';

const ROOT = resolve(import.meta.dir, '..');
const DIST = join(ROOT, 'dist');
const PORT = Number(process.env.PORT ?? 8088);
const store = new SqliteStorage(process.env.DB ?? join(import.meta.dir, 'data.sqlite'));
const limiter = new MemLimiter();
const MIME: Record<string, string> = { html: 'text/html; charset=utf-8', js: 'text/javascript', css: 'text/css', png: 'image/png', jpg: 'image/jpeg', svg: 'image/svg+xml', json: 'application/json', ico: 'image/x-icon', webp: 'image/webp', mp3: 'audio/mpeg', woff2: 'font/woff2', txt: 'text/plain' };

function safeFile(base: string, rel: string): string | null {
  const full = normalize(join(base, rel));
  if (full !== base && !full.startsWith(base + sep)) return null;
  return existsSync(full) && statSync(full).isFile() ? full : null;
}
function origin(req: Request): string {
  const h = req.headers;
  const host = (h.get('x-forwarded-host') ?? h.get('host') ?? `127.0.0.1:${PORT}`).split(',')[0]!.trim().replace(/[^a-zA-Z0-9.\-:\[\]]/g, '');
  const proto = (h.get('x-forwarded-proto') ?? (/^(127\.|localhost|\[::1\])/.test(host) ? 'http' : 'https')).split(',')[0]!.trim() === 'http' ? 'http' : 'https';
  return `${proto}://${host}`;
}
async function serveFile(path: string, req: Request, cache: string): Promise<Response> {
  const ext = path.split('.').pop()!.toLowerCase();
  return new Response(Bun.file(path), { headers: { 'content-type': MIME[ext] ?? 'application/octet-stream', 'cache-control': cache, 'x-content-type-options': 'nosniff' } });
}
async function serveIndex(base: string, req: Request): Promise<Response> {
  const f = safeFile(base, 'index.html'); if (!f) return new Response('not built yet', { status: 503 });
  const o = origin(req);
  const html = (await Bun.file(f).text()).replaceAll('%ORIGIN%', o);
  return new Response(html, { headers: { 'content-type': MIME.html!, 'cache-control': 'no-cache' } });
}

const server = Bun.serve({
  hostname: '127.0.0.1', port: PORT, maxRequestBodySize: 4096,
  async fetch(req, srv) {
    const url = new URL(req.url);
    const ip = req.headers.get('cf-connecting-ip') ?? srv.requestIP(req)?.address ?? 'local';
    const api = await handleApi(req, url, ip, { store, limiter, now: () => Date.now() });
    if (api) return api;
    if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('method not allowed', { status: 405 });
    let p = decodeURIComponent(url.pathname);
    if (p === '/' || p === '/index.html') return serveIndex(DIST, req);
    const f = safeFile(DIST, p.slice(1));
    if (!f) return new Response('not found', { status: 404 });
    return serveFile(f, req, p.endsWith('.png') ? 'public, max-age=300' : 'no-cache');
  },
});
console.log(`sam-wants-your-ram listening on http://127.0.0.1:${server.port}`);
