/* Anonymous traffic only. No names, room codes, resource hands, game records,
   board layouts, persistent visitor IDs, or arbitrary query parameters. */
(() => {
  'use strict';
  if (window.__catanAnalyticsInstalled) return;
  window.__catanAnalyticsInstalled = true;
  const sources = new Set(['x', 'youtube', 'instagram']);
  const names = new Set(['arrival_x', 'arrival_youtube', 'arrival_instagram', 'game_started', 'game_completed']);
  const canonical = new URL('/', location.origin).href;
  window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
  // Register before loading Vercel's official client, including its first PV.
  window.va('beforeSend', event => {
    if (!event || !['pageview', 'event'].includes(event.type)) return null;
    const clean = { type: event.type, url: canonical };
    if (event.type === 'event') {
      // Vercel's beforeSend receives {type, url, payload: {name, data}}.
      const payload = event.payload;
      if (!payload || !names.has(payload.name)) return null;
      clean.payload = { name: payload.name, data: {} };
      if (sources.has(payload.data?.source)) clean.payload.data.source = payload.data.source;
      if (['solo', 'online'].includes(payload.data?.mode)) clean.payload.data.mode = payload.data.mode;
    }
    return clean;
  });
  const script = document.createElement('script');
  script.defer = true;
  script.src = '/_vercel/insights/script.js';
  document.head.appendChild(script);
  function send(name, data) {
    try { window.va('event', { name, data }); } catch (_) { /* Analytics must never stop a game. */ }
  }
  const source = new URLSearchParams(location.search).get('utm_source');
  if (sources.has(source)) {
    const key = 'catan-arrival:v1:' + source, now = Date.now();
    let duplicate = false;
    try {
      const last = Number(sessionStorage.getItem(key));
      duplicate = last > 0 && now - last < 1800000;
      if (!duplicate) sessionStorage.setItem(key, String(now));
    } catch (_) { /* Blocked storage does not block page views or gameplay. */ }
    if (!duplicate) send('arrival_' + source, { source });
  }
  let active = false, completed = false, previousPhase = null;
  function observeGame() {
    const screen = document.getElementById('startScreen');
    if (!screen || !screen.classList.contains('hidden')) {
      active = false; completed = false; previousPhase = null; return;
    }
    if ((typeof replay !== 'undefined' && replay?.active) ||
        document.body?.classList?.contains('composing')) return;
    if (typeof game === 'undefined' || !game || !['setup', 'roll', 'main', 'discard', 'robber', 'steal', 'over'].includes(game.phase)) return;
    const phase = game.phase;
    // Opening an already-ended room or a loaded replay is not a new completion.
    if (!active && phase === 'over') return;
    const mode = typeof MP !== 'undefined' && (MP.active || MP.code) ? 'online' : 'solo';
    if (!active || (phase === 'setup' && previousPhase !== 'setup') || (completed && phase !== 'over')) {
      active = true; completed = false; send('game_started', { mode });
    }
    if (phase === 'over' && !completed) {
      completed = true; send('game_completed', { mode });
    }
    previousPhase = phase;
  }
  // Observe the existing rendering boundary without modifying rules, AI, or
  // synchronization. Count at most once per browser view of each game.
  const original = window.updateGamePanel;
  if (typeof original === 'function') {
    window.updateGamePanel = function () {
      const result = original.apply(this, arguments);
      try { observeGame(); } catch (_) { /* Non-blocking telemetry. */ }
      return result;
    };
  }
})();
