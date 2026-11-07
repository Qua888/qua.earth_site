const DEFAULT_ENTRY_DISTANCE = 3600;
const CLOSE_DISTANCE = 2;
const MAX_YAW = .65;
const MAX_PITCH = .48;
const RISE_START = 105;
const RISE_FULL = 55;
const RISE_EASE_OUT = 15;
const RISE_END = 8;
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const smooth = (value: number) => value * value * value * (10 + value * (-15 + 6 * value));
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
  };
  const turnEnd = Number.isFinite(candidate.turnEndDistance)
    && candidate.turnEndDistance > 0 && candidate.turnEndDistance < entry
    ? candidate.turnEndDistance : CLOSE_DISTANCE;
  const validRise = Object.values(candidate).every(Number.isFinite)
    && candidate.riseStartDistance > candidate.riseFullDistance
    && candidate.riseFullDistance > candidate.riseEaseOutDistance
    && candidate.riseEaseOutDistance > candidate.riseEndDistance
    && candidate.riseEndDistance > 0;
  const profile = validRise ? {...candidate, turnEndDistance: turnEnd} : {
    turnEndDistance: turnEnd, riseStartDistance: RISE_START,
    riseFullDistance: RISE_FULL, riseEaseOutDistance: RISE_EASE_OUT,
    riseEndDistance: RISE_END,
  };
  return {entryDistance: entry, closestDistance: entry, profile};
}

function yawAt(distance: number, entry: number, end: number) {
  const progress = clamp01(Math.log(entry / distance) / Math.log(entry / end));
  return MAX_YAW * smooth(progress);
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
  return MAX_PITCH * integral / (rampIn * .5 + middle + rampOut * .5);
}

/**
 * Positive right/up turns caused only by newly reached inward travel.
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
  target.yaw = yawAt(closest, state.entryDistance, state.profile.turnEndDistance)
    - yawAt(state.closestDistance, state.entryDistance, state.profile.turnEndDistance);
  target.pitch = pitchAt(closest, state.profile) - pitchAt(state.closestDistance, state.profile);
  state.closestDistance = closest;
  return target;
}
