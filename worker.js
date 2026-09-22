const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'no-store'
};

function response(body, status = 200, headers = {}) {
  return new Response(body, { status, headers: { ...CORS, ...headers } });
}

function targetFor(ally, path, page) {
  const base = `https://swgoh.gg/p/${ally}`;
  if (path === 'profile') return `${base}/`;
  if (path === 'characters') return `${base}/characters/`;
  if (path === 'mods') return `${base}/mods/${page && page > 1 ? `?page=${page}` : ''}`;
  return null;
}

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') return response('', 204);
    if (request.method !== 'GET') return response('Method not allowed', 405);

    const url = new URL(request.url);
    const ally = (url.searchParams.get('ally') || '').replace(/\D/g, '').slice(0, 9);
    const path = url.searchParams.get('path') || 'profile';
    const page = Math.max(1, Math.min(50, Number(url.searchParams.get('page') || 1)));

    if (!/^\d{9}$/.test(ally)) return response('Invalid ally code', 400);
    if (!['profile', 'characters', 'mods'].includes(path)) return response('Invalid path', 400);

    const target = targetFor(ally, path, page);
    try {
      const upstream = await fetch(target, {
        redirect: 'follow',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.8,fr;q=0.6'
        },
        cf: { cacheTtl: 60, cacheEverything: true }
      });
      const contentType = upstream.headers.get('content-type') || 'text/plain; charset=utf-8';
      const text = await upstream.text();
      return response(text, upstream.status, { 'Content-Type': contentType, 'X-Relay-Target': target });
    } catch (err) {
      return response(`Upstream fetch failed: ${err?.message || err}`, 502, { 'Content-Type': 'text/plain; charset=utf-8' });
    }
  }
};
