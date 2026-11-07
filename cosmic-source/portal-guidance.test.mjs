import assert from 'node:assert/strict';
import {createPortalGuidance, advancePortalGuidance, PORTAL_LOOK_RATE, PORTAL_FORWARD_LOG_RATE} from './portal-guidance.ts';

const close = (actual, expected, epsilon = 1e-10) => assert.ok(Math.abs(actual - expected) < epsilon, `${actual} differs from ${expected}`);
const state = createPortalGuidance(3600);
const reused = {yaw: 123, pitch: 456};
assert.equal(advancePortalGuidance(state, 3600, 3600, reused), reused);
assert.deepEqual(reused, {yaw: 0, pitch: 0}, 'Resting adds no rotation or travel.');
assert.equal(state.entryDistance, 3600); assert.equal(state.closestDistance, 3600);
assert.deepEqual(advancePortalGuidance(state, 3600, 4000), {yaw: 0, pitch: 0}, 'Retreat does not steer.');

// Far approach keeps turning left while preserving the level view.
const farTurn = advancePortalGuidance(state, 3600, 180);
assert.ok(farTurn.yaw < -4 && farTurn.yaw > -4.3);
assert.equal(farTurn.pitch, 0);
assert.deepEqual(advancePortalGuidance(state, 180, 300), {yaw: 0, pitch: 0});
assert.deepEqual(advancePortalGuidance(state, 300, 180), {yaw: 0, pitch: 0}, 'Backtracking cannot repeatedly accumulate turns.');
const nearTurn = advancePortalGuidance(state, 180, 55);
assert.ok(nearTurn.yaw < 0 && nearTurn.pitch > .05 && nearTurn.pitch < .15, 'The left turn continues as upward rotation begins beside the large frames.');
const innerTurn = advancePortalGuidance(state, 55, 8);
assert.ok(innerTurn.pitch > .35);
const lastTurn = advancePortalGuidance(state, 8, 1.1);
const totalLeftTurn = (entry, end) => -PORTAL_LOOK_RATE / PORTAL_FORWARD_LOG_RATE
  * (Math.log(entry / end) - Math.min(.2, Math.log(entry / end) * .5));
close(farTurn.yaw + nearTurn.yaw + innerTurn.yaw + lastTurn.yaw, totalLeftTurn(3600, 2));
close(farTurn.pitch + nearTurn.pitch + innerTurn.pitch + lastTurn.pitch, .48);
assert.equal(lastTurn.pitch, 0, 'The rise has gently finished before the central crossing.');
assert.deepEqual(advancePortalGuidance(state, 1.1, .5), {yaw: 0, pitch: 0});

function travel(hz) {
  const route = createPortalGuidance(3600);
  let previous = 3600, yaw = 0, pitch = 0, peakStep = 0;
  for (let frame = 1; frame <= hz * 18; frame++) {
    const current = Math.max(1.1, 3600 * Math.exp(-.52 * frame / hz));
    const step = advancePortalGuidance(route, previous, current);
    yaw += step.yaw; pitch += step.pitch;
    peakStep = Math.max(peakStep, Math.abs(step.yaw), Math.abs(step.pitch));
    previous = current;
  }
  return {yaw, pitch, peakStep, route};
}
const reference = travel(120);
for (const hz of [30, 60, 144]) {
  const result = travel(hz);
  close(result.yaw, reference.yaw);
  close(result.pitch, reference.pitch);
  close(result.route.closestDistance, reference.route.closestDistance);
  assert.ok(result.peakStep < .025, 'Continuous forward movement stays at or below the held-arrow turn rate.');
}

// A split at every ramp boundary agrees with a single inward jump, including
// starts part-way through the realm and large wheel/pinch travel deltas.
for (const entry of [3600, 12000, 80]) {
  const split = createPortalGuidance(entry), whole = createPortalGuidance(entry);
  let previous = entry, yaw = 0, pitch = 0;
  for (const point of [105, 55, 15, 8, 2, 1.1].filter(point => point < entry)) {
    const step = advancePortalGuidance(split, previous, point);
    yaw += step.yaw; pitch += step.pitch; previous = point;
  }
  const once = advancePortalGuidance(whole, entry, 1.1);
  close(yaw, once.yaw); close(pitch, once.pitch);
  close(yaw, totalLeftTurn(entry, 2));
  assert.ok(pitch >= 0 && pitch <= .48);
}

// The integrated rise velocity joins continuously at each threshold.
for (const distance of [105, 55, 15, 8]) {
  const epsilon = 1e-5;
  const before = createPortalGuidance(3600), after = createPortalGuidance(3600);
  advancePortalGuidance(before, 3600, distance * Math.exp(epsilon));
  advancePortalGuidance(after, 3600, distance);
  const left = advancePortalGuidance(before, distance * Math.exp(epsilon), distance).pitch / epsilon;
  const right = advancePortalGuidance(after, distance, distance * Math.exp(-epsilon)).pitch / epsilon;
  close(left, right, .00001);
}

const invalid = createPortalGuidance(3600);
for (const [previous, current] of [[NaN, 20], [20, Infinity], [20, 0], [-1, 20]]) {
  assert.deepEqual(advancePortalGuidance(invalid, previous, current), {yaw: 0, pitch: 0});
  assert.equal(invalid.closestDistance, 3600);
}
assert.equal(createPortalGuidance(NaN).entryDistance, 3600);
assert.equal(createPortalGuidance(-3).entryDistance, 3600);
const reset = createPortalGuidance(3600);
assert.deepEqual(advancePortalGuidance(reset, 3600, 180), farTurn, 'A fresh realm entry recreates the same unspent route.');

// The outermost red-frame flight can supply its visually calibrated scale
// without tying steering to seconds or to the familiar central cube's size.
const tidal = exponent => 180 * Math.exp(exponent);
const outerProfile = {
  turnEndDistance: 90,
  riseStartDistance: tidal(6.8), riseFullDistance: tidal(6.3),
  riseEaseOutDistance: tidal(5), riseEndDistance: tidal(4.6),
};
function outerTravel(hz) {
  const route = createPortalGuidance(tidal(7.4), outerProfile);
  let previous = route.entryDistance, yaw = 0, pitch = 0;
  for(let frame = 1; frame <= hz * 20; frame++) {
    const current = route.entryDistance * Math.exp(-PORTAL_FORWARD_LOG_RATE * frame / hz);
    const step = advancePortalGuidance(route, previous, current);
    yaw += step.yaw; pitch += step.pitch; previous = current;
  }
  return {yaw, pitch};
}
const outerStart = createPortalGuidance(tidal(7.4), outerProfile);
const outerEarly = advancePortalGuidance(outerStart, tidal(7.4), tidal(6.8));
assert.ok(outerEarly.yaw < 0 && outerEarly.pitch === 0, 'The left turn starts before the upward turn.');
const outerNear = advancePortalGuidance(outerStart, tidal(6.8), tidal(6.3));
assert.ok(outerNear.pitch > .05 && outerNear.pitch < .1);
const outerInside = advancePortalGuidance(outerStart, tidal(6.3), tidal(4.5));
assert.ok(outerInside.yaw < -2, 'Passing the first large frames does not end the left turn.');
close(outerNear.pitch + outerInside.pitch, .48);
const remaining = advancePortalGuidance(outerStart, tidal(4.5), 90);
assert.ok(remaining.yaw < -7, 'The sustained sweep continues all the way to the two central boxes.');
const outerYaw = outerEarly.yaw + outerNear.yaw + outerInside.yaw + remaining.yaw;
close(outerYaw, totalLeftTurn(tidal(7.4), 90));
assert.ok(outerYaw < -Math.PI * 3.5 && outerYaw > -Math.PI * 4, 'The journey has a held-key sweep, rather than a small one-time nudge.');
assert.deepEqual(advancePortalGuidance(outerStart, 90, 28), {yaw: 0, pitch: 0}, 'Guidance finishes beside the main boxes, leaving their centre steady.');
for(const hz of [30, 60, 120, 144]) {
  const totals = outerTravel(hz);
  close(totals.yaw, outerYaw); close(totals.pitch, .48);
}

// In the sustained portion, a second of normal inward travel matches a
// second holding ArrowLeft exactly. A boost changes travel speed, not route.
for (const speed of [1, 2.15]) {
  const route = createPortalGuidance(tidal(7.4), outerProfile);
  advancePortalGuidance(route, route.entryDistance, 12000);
  const end = 12000 * Math.exp(-PORTAL_FORWARD_LOG_RATE * speed);
  close(advancePortalGuidance(route, 12000, end).yaw, -PORTAL_LOOK_RATE * speed);
}
for (const distance of [tidal(7.4) * Math.exp(-.2), 90 * Math.exp(.2), 90]) {
  const epsilon = 1e-5;
  const before = createPortalGuidance(tidal(7.4), outerProfile);
  const after = createPortalGuidance(tidal(7.4), outerProfile);
  advancePortalGuidance(before, before.entryDistance, distance * Math.exp(epsilon));
  advancePortalGuidance(after, after.entryDistance, distance);
  const left = advancePortalGuidance(before, distance * Math.exp(epsilon), distance).yaw / epsilon;
  const right = advancePortalGuidance(after, distance, distance * Math.exp(-epsilon)).yaw / epsilon;
  close(left, right, .00001);
}
const invalidProfile = createPortalGuidance(3600, {turnEndDistance: 10000, riseEndDistance: -1});
assert.equal(invalidProfile.profile.turnEndDistance, 2);
assert.equal(invalidProfile.profile.riseEndDistance, 8);
console.log('PASS: sustained held-arrow left turn to central boxes, upward passage, frame-rate/input-independent travel, smooth steering endpoints, no backtracking accumulation, reusable result, reset and invalid input.');
