'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, 'js/analytics.js'), 'utf8');
function fixture(search = '', storage = new Map(), storageBlocked = false) {
  const scripts = [], events = []; let before, hidden = false;
  const window = { updateGamePanel() { return 71; }, va(kind, value) {
    if (kind === 'beforeSend') before = value;
    if (kind === 'event') events.push(value);
  } };
  const context = { window, location: { origin: 'https://catan.example', search }, URL, URLSearchParams, Date,
    document: { createElement: () => ({}), head: { appendChild: s => scripts.push(s) },
      body: { classList: { contains: () => context.composing } },
      getElementById: () => ({ classList: { contains: () => hidden } }) },
    sessionStorage: { getItem: k => { if (storageBlocked) throw Error('Blocked'); return storage.get(k); },
      setItem: (k, v) => { if (storageBlocked) throw Error('Blocked'); storage.set(k, v); } },
    game: { phase: 'setup', hands: { private: 'must never send' } }, replay: { active: false }, composing: false,
    MP: { active: false, code: '' } };
  vm.createContext(context); vm.runInContext(source, context);
  return { context, events, scripts, before: () => before, hidden: v => { hidden = v; } };
}
const f = fixture('?room=SECRET&token=PRIVATE&utm_source=x');
assert.equal(f.scripts.length, 1); assert.equal(f.scripts[0].src, '/_vercel/insights/script.js');
const pv = f.before()({ type: 'pageview', url: 'https://catan.example/?room=SECRET#PRIVATE', route: '/SECRET' });
assert.equal(pv.url, 'https://catan.example/'); assert.equal(pv.route, undefined);
assert.equal(f.before()({ type: 'event', payload: { name: 'unapproved', data: { name: 'PRIVATE' } } }), null);
const event = f.before()({ type: 'event', url: 'https://catan.example/?token=PRIVATE',
  payload: { name: 'game_started', data: { mode: 'online', name: 'PRIVATE', room: 'SECRET', hand: 'PRIVATE' } } });
assert.deepEqual(JSON.parse(JSON.stringify(event)), { type: 'event', url: 'https://catan.example/', payload: { name: 'game_started', data: { mode: 'online' } } });
for (const queued of f.events) {
  const sanitized = f.before()({ type: 'event', url: 'https://catan.example/?room=SECRET', payload: queued });
  assert.equal(sanitized.payload.name, queued.name);
}
assert.equal(f.events[0].name, 'arrival_x'); assert.deepEqual(Object.keys(f.events[0].data), ['source']);
assert.equal(f.context.window.updateGamePanel(), 71); assert.equal(f.events.length, 1);
f.hidden(true); f.context.window.updateGamePanel(); f.context.window.updateGamePanel();
assert.equal(f.events.filter(e => e.name === 'game_started').length, 1);
f.context.game.phase = 'main'; f.context.window.updateGamePanel();
f.context.game.phase = 'over'; f.context.window.updateGamePanel(); f.context.window.updateGamePanel();
assert.equal(f.events.filter(e => e.name === 'game_completed').length, 1);
f.context.game.phase = 'setup'; f.context.MP = { active: true, code: 'NEVERSEND' }; f.context.window.updateGamePanel();
assert.equal(f.events.filter(e => e.name === 'game_started').length, 2);
assert.equal(f.events.at(-1).data.mode, 'online');
f.context.replay.active = true; f.context.game.phase = 'over'; f.context.window.updateGamePanel();
assert.equal(f.events.filter(e => e.name === 'game_completed').length, 1);
vm.runInContext(source, f.context); assert.equal(f.scripts.length, 1);
const ended = fixture(); ended.hidden(true); ended.context.game.phase = 'over'; ended.context.window.updateGamePanel();
assert.equal(ended.events.length, 0);
const editor = fixture(); editor.hidden(true); editor.context.composing = true; editor.context.window.updateGamePanel();
assert.equal(editor.events.length, 0);
const storage = new Map(); fixture('?utm_source=youtube', storage);
assert.equal(fixture('?utm_source=youtube', storage).events.length, 0);
assert.equal(fixture('?utm_source=private-name').events.length, 0);
const blocked = fixture('?utm_source=instagram', new Map(), true); blocked.hidden(true);
assert.doesNotThrow(() => blocked.context.window.updateGamePanel()); assert.equal(blocked.events[0].name, 'arrival_instagram');
blocked.context.window.va = () => { throw Error('Blocked analytics'); }; blocked.context.game.phase = 'over';
assert.equal(blocked.context.window.updateGamePanel(), 71);
assert.ok(!JSON.stringify(f.events).includes('PRIVATE')); assert.ok(!JSON.stringify(f.events).includes('NEVERSEND'));
console.log(JSON.stringify({ passed: true, urlsAndPayloadsRedacted: true, lifecycleDeduplicated: true,
  replayExcluded: true, blockedStorageAndTelemetryNonBlocking: true, gameRulesChanged: false }));
