import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../original/index.html', import.meta.url), 'utf8');
const script = html.match(/<body>\s*<script>([\s\S]*?)<\/script>/)[1];
const now = 1800000000000;
const flush = () => new Promise(resolve => setImmediate(resolve));

function visit({ stamp = String(now), reduced = false, blocked = false, readyState = 'loading' } = {}) {
  const bodyClasses = new Set(), rootClasses = new Set();
  const bodyEvents = new Map(), documentEvents = new Map(), timers = new Map();
  let frames = [], timerId = 0, consumed = false, resolveFonts, rejectFonts;
  const fontsReady = new Promise((resolve, reject) => { resolveFonts = resolve; rejectFonts = reject; });
  const classes = values => ({
    add: (...names) => names.forEach(name => values.add(name)),
    remove: (...names) => names.forEach(name => values.delete(name)),
  });
  const body = {
    classList: classes(bodyClasses),
    addEventListener: (name, callback) => bodyEvents.set(name, callback),
    removeEventListener: name => bodyEvents.delete(name),
  };
  const root = { classList: classes(rootClasses), style: { background: 'original-background' } };
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
    matchMedia: () => ({ matches: reduced }),
    requestAnimationFrame: callback => { frames.push(callback); },
    setTimeout: (callback, delay) => { timers.set(++timerId, { callback, delay }); return timerId; },
    clearTimeout: id => timers.delete(id),
  });
  return {
    bodyClasses, rootClasses, root, timers, consumed, resolveFonts, rejectFonts,
    domReady: () => documentEvents.get('DOMContentLoaded')?.(),
    frame: () => { const pending = frames; frames = []; pending.forEach(callback => callback()); },
    animate: (target = body, animationName = 'portal-emerge') => bodyEvents.get('animationend')?.({ target, animationName }),
    expire: delay => { const timer = [...timers.values()].find(timer => timer.delay === delay); assert.ok(timer); timer.callback(); },
  };
}

for (const options of [
  { stamp: null }, { stamp: 'bad' }, { stamp: String(now - 20000) },
  { stamp: String(now + 1) }, { reduced: true }, { blocked: true },
]) {
  const page = visit(options);
  assert.equal(page.bodyClasses.size + page.rootClasses.size, 0);
  assert.equal(page.timers.size, 0, 'Ordinary, stale, reduced-motion and blocked-storage visits never prepare a reveal.');
  if (!options.blocked) assert.ok(page.consumed, 'The marker is consumed even when its reveal is skipped.');
}

const page = visit();
assert.ok(page.consumed);
assert.ok(page.bodyClasses.has('portal-arrival'));
assert.ok(page.rootClasses.has('portal-handoff'));
assert.equal(page.timers.size, 1);
assert.equal([...page.timers.values()][0].delay, 8000, 'Only the preparation watchdog exists before readiness.');
page.frame();
assert.ok(!page.bodyClasses.has('portal-arrival--revealing'));
page.domReady();
await flush();
page.frame();
assert.ok(!page.bodyClasses.has('portal-arrival--revealing'), 'DOM readiness alone does not start an animation while fonts are pending.');
page.resolveFonts();
await flush();
page.frame();
assert.ok(!page.bodyClasses.has('portal-arrival--revealing'), 'The first ready frame does not start the reveal.');
page.frame();
assert.ok(page.bodyClasses.has('portal-arrival--revealing'));
assert.ok(page.rootClasses.has('portal-handoff--revealing'));
assert.deepEqual([...page.timers.values()].map(timer => timer.delay), [5300], 'Cleanup is measured from the actual reveal start.');
page.animate({}, 'portal-emerge');
page.animate(undefined, 'unrelated-animation');
assert.ok(page.bodyClasses.has('portal-arrival--revealing'), 'Only this body animation can finish the handoff.');
page.animate();
assert.equal(page.bodyClasses.size + page.rootClasses.size, 0);
assert.equal(page.root.style.background, 'original-background');
assert.equal(page.timers.size, 0);
page.animate();

const fontFailure = visit({ readyState: 'complete' });
fontFailure.rejectFonts(Error('Font loading failed'));
await flush();
fontFailure.frame(); fontFailure.frame();
assert.ok(fontFailure.bodyClasses.has('portal-arrival--revealing'), 'Failed fonts settle the gate rather than trapping the page.');
fontFailure.expire(5300);
assert.equal(fontFailure.bodyClasses.size + fontFailure.rootClasses.size, 0, 'The animation deadline also cleans up if animationend is missing.');

const stalled = visit();
stalled.domReady();
stalled.expire(8000);
stalled.resolveFonts();
await flush();
stalled.frame(); stalled.frame();
assert.equal(stalled.bodyClasses.size + stalled.rootClasses.size, 0);
assert.equal(stalled.timers.size, 0, 'A late readiness resolution cannot restart a reveal after watchdog cleanup.');
console.log('PASS: one-shot portal handoff waits for DOM, fonts and two frames; cleanup starts with animation; failed/stalled readiness and skipped visits recover safely.');
