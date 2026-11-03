export const FLIGHT_CLEARANCE = .51;
export const FLIGHT_CEILING = 18;

// Exact integration of a gently damped vertical velocity. Releasing a key
// leaves the traveller hovering at the new height, rather than falling.
export function stepFlight(state, command, groundHeight, delta) {
  const dt=Math.min(.05,Math.max(0,delta));
  const target=Math.max(-1,Math.min(1,command))*2.1;
  const decay=Math.exp(-7*dt);
  state.height+=target*dt+(state.velocity-target)*(1-decay)/7;
  state.velocity=target+(state.velocity-target)*decay;
  const floor=groundHeight+FLIGHT_CLEARANCE;
  if(state.height<floor){state.height=floor;state.velocity=Math.max(0,state.velocity);}
  if(state.height>FLIGHT_CEILING){state.height=FLIGHT_CEILING;state.velocity=Math.min(0,state.velocity);}
  return state;
}
