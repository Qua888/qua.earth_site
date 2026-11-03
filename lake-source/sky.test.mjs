import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {createEnvironment} from './environment.js';

// Check both sides of the old longitude cut at several elevations and times.
const fract=x=>x-Math.floor(x);
const mix=(a,b,t)=>a+(b-a)*t;
function hash(x,y){return fract(Math.sin(x*127.1+y*311.7)*43758.5453);}
function noise(x,y){
  const ix=Math.floor(x),iy=Math.floor(y);
  let fx=fract(x),fy=fract(y);fx=fx*fx*(3-2*fx);fy=fy*fy*(3-2*fy);
  return mix(mix(hash(ix,iy),hash(ix+1,iy),fx),mix(hash(ix,iy+1),hash(ix+1,iy+1),fx),fy);
}
function clouds(angle,y,time){
  const radius=Math.sqrt(1-y*y);
  const u=Math.cos(angle)*radius*2.5+y*13;
  const v=Math.sin(angle)*radius*2.5+y*8.3;
  return noise(u+time*.003,v)*.69+noise(u*2.13+8.7,v*2.13-time*.002)*.31;
}
for(const y of [0,.02,.1,.3,.6,.9,.999])for(const time of [0,12,120,500]){
  const left=clouds(-Math.PI+1e-7,y,time),right=clouds(Math.PI-1e-7,y,time);
  assert.ok(Math.abs(left-right)<1e-5,'Clouds remain continuous across the old longitude seam.');
}
const source=readFileSync(new URL('./environment.js',import.meta.url),'utf8');
assert.match(source,/vec2 uv=d\.xz\*2\.5\+vec2\(d\.y\*13\.,d\.y\*8\.3\)/);
assert.doesNotMatch(source,/float azimuth=atan/);
const scene=new THREE.Scene(),environment=createEnvironment(scene,{lowPower:true});
const sky=scene.children.find(o=>o.material?.fragmentShader?.includes('sampleSky(vDirection)'));
const water=scene.getObjectByName('rainbow-chrome-shallows');
assert.ok(sky&&water);
assert.match(sky.material.fragmentShader,/vec2 uv=d\.xz/);
assert.doesNotMatch(water.material.fragmentShader,/sampleSky|sampler2D|texture2D|reflect\(/,'Water has no mirrored scene or sky samples.');
environment.dispose();
console.log('PASS: seamless sky mapping and a reflection-free lake surface.');
