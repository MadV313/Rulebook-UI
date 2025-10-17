// scripts/fetch-shim.js
// Optional, safe fetch() URL rewriter for browser UIs.
// Rewrites relative API calls like `/user/123` → `${API_BASE}/user/123`
// for a whitelist of prefixes. No-ops on absolute URLs or already-proxied ones.
//
// Usage:
//   1) Include *after* scripts/api-base.js so window.API_BASE is available.
//   2) This file is safe to include multiple times (installs once).

(() => {
  if (typeof window === 'undefined') return;                 // browser only
  if (window.__FETCH_SHIM_INSTALLED__) return;               // idempotent
  window.__FETCH_SHIM_INSTALLED__ = true;

  // Whitelisted API path prefixes to rewrite
  const PREFIXES = [
    '/duel',
    '/bot',
    '/summary',
    '/user',
    '/packReveal',
    '/collection',
    '/reveal',
    '/spectate',
    '/watch',
    '/live',
  ];

  // Resolve base (prefer api-base.js; fallback '/api')
  const API_BASE = (window.API_BASE || '/api').replace(/\/+$/, '');
  const isSameOrigin = (u) => {
    try { return new URL(u, location.origin).origin === location.origin; }
    catch { return true; } // treat weird strings as same-origin relative
  };

  // Utilities
  const startsWithAny = (s, arr) => arr.some(p => s.startsWith(p));
  const shouldRewritePath = (path) => {
    // Only rewrite: relative, same-origin paths that match our prefixes
    if (!path || typeof path !== 'string') return false;
    if (!path.startsWith('/')) return false;                 // ignore bare 'duel/state'
    if (path.startsWith(API_BASE + '/')) return false;       // already rewritten
    if (path.startsWith('/api/')) return false;              // already going through /api
    return startsWithAny(path, PREFIXES);
  };

  const joinBase = (base, path) => {
    const left = String(base || '').replace(/\/+$/, '');
    const right = String(path || '').replace(/^\/+/, '');
    return `${left}/${right}`;
  };

  const origFetch = window.fetch.bind(window);

  window.fetch = function fetchShim(input, init) {
    try {
      // Case 1: string URL
      if (typeof input === 'string') {
        // skip absolute external URLs
        if (!/^https?:\/\//i.test(input) && shouldRewritePath(input)) {
          input = joinBase(API_BASE, input);
        } else if (isSameOrigin(input)) {
          // Support explicit same-origin absolute URLs like `${location.origin}/duel/state`
          const u = new URL(input, location.origin);
          if (shouldRewritePath(u.pathname)) {
            input = joinBase(API_BASE, u.pathname + u.search);
          }
        }
      }
      // Case 2: Request object
      else if (input && typeof input === 'object' && 'url' in input) {
        const req = input;
        const u = new URL(req.url, location.origin);
        if (isSameOrigin(u.href) && shouldRewritePath(u.pathname)) {
          const rewritten = joinBase(API_BASE, u.pathname + u.search);
          input = new Request(rewritten, req);
        }
      }
    } catch (e) {
      try { console.warn('[fetch-shim] rewrite warning:', e); } catch {}
    }
    return origFetch(input, init);
  };

  try {
    console.log('[fetch-shim] active', {
      API_BASE,
      PREFIXES,
    });
  } catch {}
})();
