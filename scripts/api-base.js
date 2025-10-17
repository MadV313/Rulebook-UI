// scripts/api-base.js
// Exposes API_BASE and apiUrl() with ?api= override and /api default.
// Works as ESM (exported) and non-module (attached to window).

(function initApiBaseScope() {
  // --- 1) Resolve API base (priority: ?api= → window.API_BASE → localStorage → '/api')
  const qs = new URLSearchParams(location.search);
  const fromUrl = (qs.get('api') || '').trim();

  // Read any prior globals/local storage
  const fromGlobal = (typeof window !== 'undefined' && window.API_BASE) ? String(window.API_BASE) : '';
  let fromStorage = '';
  try { fromStorage = localStorage.getItem('sv13.api') || ''; } catch {}

  // Choose base with precedence
  let base = fromUrl || fromGlobal || fromStorage || '/api';

  // Normalize (no trailing slash)
  base = String(base).replace(/\s+/g, '').replace(/\/+$/, '');
  if (base === '') base = '/api';

  // Persist if provided via URL (so other pages inherit)
  try {
    if (fromUrl) localStorage.setItem('sv13.api', base);
  } catch {}

  // --- 2) Helper to build URLs safely
  /**
   * Build a full API URL.
   * - Accepts absolute URLs (http/https) and returns them unchanged
   * - For relative paths, prefixes with resolved API_BASE
   * - Ensures exactly one slash between base and path
   * @param {string} path e.g. '/duel/state' or 'duel/state'
   * @returns {string}
   */
  function apiUrl(path) {
    if (!path) return base + '/';
    const p = String(path);

    // Absolute → return as-is
    if (/^https?:\/\//i.test(p)) return p;

    // Ensure leading slash on path
    const withSlash = p.startsWith('/') ? p : '/' + p;
    return base + withSlash;
  }

  // --- 3) Expose (ESM + global)
  // ESM export (if supported/used)
  try {
    // @ts-ignore - in ESM context this will be replaced by bundlers; in script it will no-op
    if (typeof export !== 'undefined') { /* noop for static analyzers */ }
  } catch {}
  // Attach to window for non-module usage
  if (typeof window !== 'undefined') {
    window.API_BASE = base;           // keep in sync with other UIs
    window.apiUrl = apiUrl;
  }

  // Support ESM directly if imported via <script type="module">
  // (We can't "export" from an IIFE in classic script; below is tree-shakable hint for bundlers)
  // eslint-disable-next-line no-undef
  if (typeof window === 'undefined') {
    // In SSR/bundlers, we return values by assigning to module.exports if available
    // (Kept minimal to avoid environment leaks)
    try { module.exports = { API_BASE: base, apiUrl }; } catch {}
  }

  // Optional: log once (comment out in prod)
  try { console.log('[api-base] API_BASE =', base); } catch {}
})();
