import assert from 'node:assert/strict';
import {stepFlight,FLIGHT_CEILING,FLIGHT_CLEARANCE} from './flight.js';
function run(hz){
  const state={height:.7,velocity:0};
  for(let i=0;i<hz*6;i++)stepFlight(state,i<hz*3?1:0,.18,1/hz);
  return state;
}
const a=run(60),b=run(120);
assert.ok(a.height>6,'Traveller can rise to reach the bubbles.');
assert.ok(Math.abs(a.height-b.height)<1e-10,'Flight is independent of display refresh rate.');
assert.ok(Math.abs(a.velocity)<1e-7,'Releasing ascent settles into a hover.');
for(let i=0;i<1500;i++)stepFlight(a,1,-.12,1/60);
assert.equal(a.height,FLIGHT_CEILING);
for(let i=0;i<1500;i++)stepFlight(a,-1,.18,1/60);
assert.ok(Math.abs(a.height-(.18+FLIGHT_CLEARANCE))<1e-10,'Descending stops above the stone.');
console.log('PASS: ascent, hovering, descent, terrain clearance, ceiling and 60/120 Hz flight.');
