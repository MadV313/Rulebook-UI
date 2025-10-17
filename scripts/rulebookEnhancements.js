// scripts/rulebookEnhancements.js
;(function (global) {
  'use strict';

  // ------------------------------
  // Config (you can override later via RulebookEnhancements.configure)
  // ------------------------------
  const cfg = {
    tokenKey: 'sv13.token',
    apiKey: 'sv13.api',
    // Hosts where we auto-append ?token&api for outbound links (same-origin is always allowed)
    passHosts: [
      'https://madv313.github.io/HUB-UI/',
      'https://madv313.github.io/Player-Stats-UI/',
      'https://madv313.github.io/Stats-Leaderboard-UI/',
      // Add your Duel UI host if needed:
      // 'https://your-duel-ui-host.example/',
    ],
    // BGM defaults
    bgm: {
      elementId: 'rb-bgm',
      toggleId: 'rbAudioToggle',
      storageKeyMuted: 'sv13_rulebook_bgm.muted',
      src: 'audio/bg/surviving_chernarus.mp3',
      autoinjectIfMissing: false,   // set true to inject <audio> if not in HTML
      startMuted: true,             // comply with autoplay policies
    },
  };

  // ------------------------------
  // Token/API bootstrap
  // ------------------------------
  function getParams() {
    const qs = new URLSearchParams(location.search);
    const tokenFromUrl = qs.get('token') || '';
    const apiFromUrl   = (qs.get('api') || '').replace(/\/+$/, '');
    let token = tokenFromUrl;
    let api   = apiFromUrl;

    try {
      if (!token) token = localStorage.getItem(cfg.tokenKey) || '';
      if (!api)   api   = localStorage.getItem(cfg.apiKey)   || '';
      if (tokenFromUrl) localStorage.setItem(cfg.tokenKey, tokenFromUrl);
      if (apiFromUrl)   localStorage.setItem(cfg.apiKey, apiFromUrl);
    } catch {}

    return { token, api };
  }

  function exposeGlobals({ token, api }) {
    try { global.PLAYER_TOKEN = token; } catch {}
    try { global.API_BASE     = api || '/api'; } catch {}
    try { global.UI_BASE      = location.origin; } catch {}
  }

  // ------------------------------
  // Link rewriting
  // ------------------------------
  function isWhitelisted(href) {
    try {
      const u = new URL(href, location.origin);
      if (u.origin === location.origin) return true; // same-origin always allowed
      return cfg.passHosts.some(prefix => u.href.startsWith(prefix));
    } catch {
      // treat non-parsable as relative → allow
      return true;
    }
  }

  function addParamsToUrl(href, token, api) {
    if (!token && !api) return href; // nothing to add
    try {
      const u = new URL(href, location.origin);
      if (token) u.searchParams.set('token', token);
      if (api)   u.searchParams.set('api', api);
      return u.toString();
    } catch {
      const sep = href.includes('?') ? '&' : '?';
      const parts = [];
      if (token) parts.push('token=' + encodeURIComponent(token));
      if (api)   parts.push('api=' + encodeURIComponent(api));
      return parts.length ? href + sep + parts.join('&') : href;
    }
  }

  function rewriteAnchors(root, token, api) {
    const anchors = root.querySelectorAll
      ? root.querySelectorAll('a[href]')
      : [];
    anchors.forEach(a => {
      // Respect opt-in markers first
      const explicit = a.hasAttribute('data-pass-params') || a.classList.contains('sv13-link');
      if (!explicit && !isWhitelisted(a.href)) return;
      a.href = addParamsToUrl(a.href, token, api);
    });
  }

  function observeNewAnchors(token, api) {
    // Cover dynamically inserted links
    const mo = new MutationObserver(muts => {
      for (const m of muts) {
        m.addedNodes?.forEach(node => {
          if (node.nodeType !== 1) return;
          if (node.tagName === 'A' && node.hasAttribute('href')) {
            const wrapper = document.createElement('div');
            wrapper.appendChild(node.cloneNode(false));
            rewriteAnchors(wrapper, token, api);
            node.href = wrapper.firstChild.href;
          } else if (node.querySelectorAll) {
            rewriteAnchors(node, token, api);
          }
        });
      }
    });
    mo.observe(document.documentElement, { subtree: true, childList: true });
    return mo;
  }

  // ------------------------------
  // Background music (autoplay-safe)
  // ------------------------------
  function ensureAudioElement() {
    let el = document.getElementById(cfg.bgm.elementId);
    if (!el && cfg.bgm.autoinjectIfMissing) {
      el = document.createElement('audio');
      el.id = cfg.bgm.elementId;
      el.src = cfg.bgm.src;
      el.autoplay = true;
      el.muted = cfg.bgm.startMuted;
      el.loop = true;
      el.playsInline = true;
      el.preload = 'auto';
      document.body.appendChild(el);
    }
    return el || null;
  }

  function installBgmControls() {
    const audio = ensureAudioElement();
    if (!audio) return;

    const toggle = document.getElementById(cfg.bgm.toggleId);
    const STORE  = cfg.bgm.storageKeyMuted;

    // Restore preference
    try {
      const stored = localStorage.getItem(STORE);
      if (stored !== null) audio.muted = (stored === 'true');
    } catch {}

    function updateBtn() {
      if (!toggle) return;
      toggle.textContent = audio.muted ? '🔇' : '🔊';
      toggle.setAttribute(
        'aria-label',
        audio.muted ? 'Play background music' : 'Mute background music'
      );
    }

    // Try starting (will be blocked until first gesture in many browsers)
    audio.play().catch(() => {});

    // Unlock on first interaction (unless user had previously chosen mute)
    const unlock = () => {
      audio.play().catch(() => {});
      try {
        if (localStorage.getItem(STORE) !== 'true') {
          audio.muted = false;
          updateBtn();
        }
      } catch {}
      cleanup();
    };
    const cleanup = () => {
      window.removeEventListener('pointerdown', unlock, opt);
      window.removeEventListener('keydown', unlock);
      document.removeEventListener('visibilitychange', vis);
    };
    const opt = { passive: true };
    window.addEventListener('pointerdown', unlock, opt);
    window.addEventListener('keydown', unlock);

    // Safari/iOS: retry when tab gets focus again
    const vis = () => { if (!document.hidden) audio.play().catch(() => {}); };
    document.addEventListener('visibilitychange', vis);

    if (toggle) {
      toggle.addEventListener('click', () => {
        audio.muted = !audio.muted;
        try { localStorage.setItem(STORE, String(audio.muted)); } catch {}
        updateBtn();
        audio.play().catch(() => {});
      });
      updateBtn();
    }
  }

  // ------------------------------
  // Public API
  // ------------------------------
  const API = {
    configure(partial) {
      // shallow merge; nested objects merged for bgm
      if (partial && typeof partial === 'object') {
        if (partial.bgm && typeof partial.bgm === 'object') {
          Object.assign(cfg.bgm, partial.bgm);
          delete partial.bgm;
        }
        Object.assign(cfg, partial);
      }
    },
    getCurrentParams: getParams,
    rewriteAllLinks() {
      const { token, api } = getParams();
      rewriteAnchors(document, token, api);
    },
    installBgm: installBgmControls,
  };

  // Attach globally
  global.RulebookEnhancements = API;

  // ------------------------------
  // Auto-init on DOM ready
  // ------------------------------
  function init() {
    const { token, api } = getParams();
    exposeGlobals({ token, api });
    rewriteAnchors(document, token, api);
    observeNewAnchors(token, api);
    installBgmControls();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})(window);
