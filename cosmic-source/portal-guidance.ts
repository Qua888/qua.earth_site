const DEFAULT_ENTRY_DISTANCE = 3600;
const CLOSE_DISTANCE = 2;
// Match holding ArrowLeft while W moves inward. Integrating log-distance
// gives wheel/pinch travellers the same continuous sweep without a timer.
export const PORTAL_LOOK_RATE = .74;
export const PORTAL_PITCH_RATE = .62;
export const PORTAL_FORWARD_LOG_RATE = .52;
const TURN_RAMP_DISTANCE = .2;
const MAX_PITCH = .48;
const RISE_START = 105;
const RISE_FULL = 55;
const RISE_EASE_OUT = 15;
const RISE_END = 8;
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const smoothIntegral = (value: number) => value * value * value * (1 - value * .5);

export type PortalGuidanceState = {
  entryDistance: number;
  closestDistance: number;
  profile: Required<PortalGuidanceOptions>;
};
export type PortalGuidanceDelta = {yaw: number; pitch: number};
export type PortalGuidanceOptions = {
  turnEndDistance?: number;
  riseStartDistance?: number;
  riseFullDistance?: number;
  riseEaseOutDistance?: number;
  riseEndDistance?: number;
  sustainedRiseStartDistance?: number;
  sustainedRiseEndDistance?: number;
};

/** Start a fresh route without modifying the traveller's current view. */
export function createPortalGuidance(
  entryDistance = DEFAULT_ENTRY_DISTANCE,
  options: PortalGuidanceOptions = {},
): PortalGuidanceState {
  const entry = Number.isFinite(entryDistance) && entryDistance > CLOSE_DISTANCE
    ? entryDistance : DEFAULT_ENTRY_DISTANCE;
  const candidate = {
    turnEndDistance: options.turnEndDistance ?? CLOSE_DISTANCE,
    riseStartDistance: options.riseStartDistance ?? RISE_START,
    riseFullDistance: options.riseFullDistance ?? RISE_FULL,
    riseEaseOutDistance: options.riseEaseOutDistance ?? RISE_EASE_OUT,
    riseEndDistance: options.riseEndDistance ?? RISE_END,
    sustainedRiseStartDistance: options.sustainedRiseStartDistance ?? 0,
    sustainedRiseEndDistance: options.sustainedRiseEndDistance ?? 1.1,
  };
  const turnEnd = Number.isFinite(candidate.turnEndDistance)
    && candidate.turnEndDistance > 0 && candidate.turnEndDistance < entry
    ? candidate.turnEndDistance : CLOSE_DISTANCE;
  const validRise = [candidate.riseStartDistance, candidate.riseFullDistance,
    candidate.riseEaseOutDistance, candidate.riseEndDistance].every(Number.isFinite)
    && candidate.riseStartDistance > candidate.riseFullDistance
    && candidate.riseFullDistance > candidate.riseEaseOutDistance
    && candidate.riseEaseOutDistance > candidate.riseEndDistance
    && candidate.riseEndDistance > 0;
  const validSustainedRise = Number.isFinite(candidate.sustainedRiseStartDistance)
    && Number.isFinite(candidate.sustainedRiseEndDistance)
    && candidate.sustainedRiseStartDistance > candidate.sustainedRiseEndDistance
    && candidate.sustainedRiseEndDistance >= 1.1;
  const sustainedRise = {
    sustainedRiseStartDistance: validSustainedRise ? candidate.sustainedRiseStartDistance : 0,
    sustainedRiseEndDistance: validSustainedRise ? candidate.sustainedRiseEndDistance : 1.1,
  };
  const profile = validRise ? {...candidate, ...sustainedRise, turnEndDistance: turnEnd} : {
    turnEndDistance: turnEnd, riseStartDistance: RISE_START,
    riseFullDistance: RISE_FULL, riseEaseOutDistance: RISE_EASE_OUT,
    riseEndDistance: RISE_END, ...sustainedRise,
  };
  return {entryDistance: entry, closestDistance: entry, profile};
}

function sustainedTurnAt(distance: number, entry: number, end: number, rate: number) {
  if (entry <= end) return 0;
  const span = Math.log(entry / end);
  const travel = Math.max(0, Math.min(span, Math.log(entry / distance)));
  const ramp = Math.min(TURN_RAMP_DISTANCE, span * .5);
  let integral;
  if (travel < ramp) {
    integral = ramp * smoothIntegral(travel / ramp);
  } else if (travel < span - ramp) {
    integral = travel - ramp * .5;
  } else {
    const t = clamp01((travel - span + ramp) / ramp);
    integral = span - ramp * 1.5 + ramp * (t - smoothIntegral(t));
  }
  return rate / PORTAL_FORWARD_LOG_RATE * integral;
}

function pitchAt(distance: number, profile: Required<PortalGuidanceOptions>) {
  // Integrate a smooth velocity envelope in log-distance: ease in beside the
  // first large frames, hold a calm rise through them, then ease out inside.
  const rampIn = Math.log(profile.riseStartDistance / profile.riseFullDistance);
  const middle = Math.log(profile.riseFullDistance / profile.riseEaseOutDistance);
  const rampOut = Math.log(profile.riseEaseOutDistance / profile.riseEndDistance);
  const travel = Math.max(0, Math.log(profile.riseStartDistance / distance));
  let integral;
  if (travel < rampIn) {
    integral = rampIn * smoothIntegral(travel / rampIn);
  } else if (travel < rampIn + middle) {
    integral = rampIn * .5 + travel - rampIn;
  } else {
    const t = clamp01((travel - rampIn - middle) / rampOut);
    integral = rampIn * .5 + middle + rampOut * (t - smoothIntegral(t));
  }
  return MAX_PITCH * integral / (rampIn * .5 + middle + rampOut * .5)
    + sustainedTurnAt(distance, profile.sustainedRiseStartDistance,
      profile.sustainedRiseEndDistance, PORTAL_PITCH_RATE);
}

/**
 * Sustained left/up turns caused only by newly reached inward travel.
 * The profile is an exact distance integral, so keys, wheel and pinch share
 * the same route, regardless of frame rate. Retreating never rewinds or adds
 * steering, and re-approaching an already travelled section cannot add spins.
 * Callers may reuse `target` to avoid allocating a result in their render loop.
 */
export function advancePortalGuidance(
  state: PortalGuidanceState,
  previousDistance: number,
  distance: number,
  target: PortalGuidanceDelta = {yaw: 0, pitch: 0},
): PortalGuidanceDelta {
  target.yaw = target.pitch = 0;
  if (!Number.isFinite(previousDistance) || !Number.isFinite(distance)
    || previousDistance <= 0 || distance <= 0 || distance >= previousDistance) return target;
  const closest = Math.max(1.1, Math.min(state.entryDistance, distance, state.closestDistance));
  if (closest >= state.closestDistance) return target;
  target.yaw = sustainedTurnAt(closest, state.entryDistance, state.profile.turnEndDistance, -PORTAL_LOOK_RATE)
    - sustainedTurnAt(state.closestDistance, state.entryDistance, state.profile.turnEndDistance, -PORTAL_LOOK_RATE);
  target.pitch = pitchAt(closest, state.profile) - pitchAt(state.closestDistance, state.profile);
  state.closestDistance = closest;
  return target;
}
