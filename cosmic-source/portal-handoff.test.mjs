import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../original/index.html', import.meta.url), 'utf8');
const script = html.match(/<body>\s*<script>([\s\S]*?)<\/script>/)[1];
const now = 1800000000000;
const flush = () => new Promise(resolve => setImmediate(resolve));

function visit({ stamp = String(now), reduced = false, blocked = false, readyState = 'loading', inert = false } = {}) {
  const rootClasses = new Set();
  const bodyEvents = new Map(), documentEvents = new Map(), windowEvents = new Map(), timers = new Map();
  let frames = [], timerId = 0, consumed = false, resolveFonts, rejectFonts;
  const fontsReady = new Promise((resolve, reject) => { resolveFonts = resolve; rejectFonts = reject; });
  const classes = values => ({
    add: (...names) => names.forEach(name => values.add(name)),
    remove: (...names) => names.forEach(name => values.delete(name)),
  });
  const body = {
    inert,
    addEventListener: (name, callback) => bodyEvents.set(name, callback),
    removeEventListener: name => bodyEvents.delete(name),
  };
  const tapScreen = { id: 'tapScreen' };
  const root = { classList: classes(rootClasses) };
  vm.runInNewContext(script, {
    Date: { now: () => now },
    sessionStorage: {
      getItem: () => { if (blocked) throw Error('Storage unavailable'); return stamp; },
      removeItem: () => { consumed = true; },
    },
    document: {
      body, documentElement: root, readyState, fonts: { ready: fontsReady },
      addEventListener: (name, callback) => documentEvents.set(name, callback),
      removeEventListener: name => documentEvents.delete(name),
    },
    window: {
      addEventListener: (name, callback) => windowEvents.set(name, callback),
      removeEventListener: name => windowEvents.delete(name),
    },
    matchMedia: () => ({ matches: reduced }),
    requestAnimationFrame: callback => { frames.push(callback); },
    setTimeout: (callback, delay) => { timers.set(++timerId, { callback, delay }); return timerId; },
    clearTimeout: id => timers.delete(id),
  });
  return {
    body, rootClasses, timers, consumed, resolveFonts, rejectFonts,
    domReady: () => documentEvents.get('DOMContentLoaded')?.(),
    frame: () => { const pending = frames; frames = []; pending.forEach(callback => callback()); },
    animate: (target = tapScreen, animationName = 'portal-arrival-reveal') => bodyEvents.get('animationend')?.({ target, animationName }),
    hide: () => windowEvents.get('pagehide')?.(),
    expire: delay => { const timer = [...timers.values()].find(timer => timer.delay === delay); assert.ok(timer); timer.callback(); },
  };
}

for (const options of [
  { stamp: null }, { stamp: 'bad' }, { stamp: String(now - 20000) },
  { stamp: String(now + 1) }, { blocked: true },
]) {
  const page = visit(options);
  assert.equal(page.rootClasses.size, 0);
  assert.equal(page.timers.size, 0, 'Ordinary, stale and blocked-storage visits never prepare a reveal.');
  assert.equal(page.body.inert, false);
  if (!options.blocked) assert.ok(page.consumed, 'The marker is consumed even when its reveal is skipped.');
}

const page = visit();
assert.ok(page.consumed);
assert.match(html, /--portal-arrival-light:#f7fbff;/, 'The preparation overlay matches the source portal endpoint.');
assert.ok(page.rootClasses.has('portal-arrival'));
assert.equal(page.body.inert, true, 'Input stays blocked behind the white cover.');
assert.equal(page.timers.size, 1);
assert.equal([...page.timers.values()][0].delay, 8000, 'Only the preparation watchdog exists before readiness.');
page.frame();
assert.ok(!page.rootClasses.has('portal-arrival--revealing'));
page.domReady();
await flush();
page.frame();
assert.ok(!page.rootClasses.has('portal-arrival--revealing'), 'DOM readiness alone does not start an animation while fonts are pending.');
page.resolveFonts();
await flush();
page.frame();
assert.ok(!page.rootClasses.has('portal-arrival--revealing'), 'The first ready frame does not start the reveal.');
page.frame();
assert.ok(page.rootClasses.has('portal-arrival--revealing'));
assert.deepEqual([...page.timers.values()].map(timer => timer.delay), [2700], 'Cleanup is measured from the actual reveal start.');
page.animate({}, 'portal-arrival-reveal');
page.animate(undefined, 'unrelated-animation');
assert.ok(page.rootClasses.has('portal-arrival--revealing'), 'Only the arrival screen animation can finish the handoff.');
assert.equal(page.body.inert, true, 'Input stays blocked during the reveal.');
page.animate();
assert.equal(page.rootClasses.size, 0);
assert.equal(page.body.inert, false);
assert.equal(page.timers.size, 0);
page.animate();

const fontFailure = visit({ readyState: 'complete', inert: true });
fontFailure.rejectFonts(Error('Font loading failed'));
await flush();
fontFailure.frame(); fontFailure.frame();
assert.ok(fontFailure.rootClasses.has('portal-arrival--revealing'), 'Failed fonts settle the gate rather than trapping the page.');
fontFailure.expire(2700);
assert.equal(fontFailure.rootClasses.size, 0, 'The animation deadline also cleans up if animationend is missing.');
assert.equal(fontFailure.body.inert, true, 'Cleanup preserves a pre-existing inert state.');

const reduced = visit({ reduced: true, readyState: 'complete' });
assert.ok(reduced.rootClasses.has('portal-arrival'), 'Reduced motion starts on the same white cover.');
reduced.resolveFonts();
await flush();
reduced.frame(); reduced.frame();
assert.ok(reduced.rootClasses.has('portal-arrival--revealing'));
assert.deepEqual([...reduced.timers.values()].map(timer => timer.delay), [1000], 'The opacity-only dissolve has a shorter fallback.');
reduced.animate();
assert.equal(reduced.body.inert, false);

const stalled = visit();
stalled.domReady();
stalled.expire(8000);
stalled.resolveFonts();
await flush();
stalled.frame(); stalled.frame();
assert.equal(stalled.rootClasses.size, 0);
assert.equal(stalled.body.inert, false);
assert.equal(stalled.timers.size, 0, 'A late readiness resolution cannot restart a reveal after watchdog cleanup.');

const leaving = visit();
leaving.domReady();
leaving.hide();
leaving.resolveFonts();
await flush();
leaving.frame(); leaving.frame();
assert.equal(leaving.rootClasses.size, 0, 'A page saved in history does not keep the white cover.');
assert.equal(leaving.body.inert, false);
assert.equal(leaving.timers.size, 0);
console.log('PASS: matching white handoff waits for DOM, fonts and two frames, blocks input until ready, and cleans up on animation end, timeout or pagehide.');
