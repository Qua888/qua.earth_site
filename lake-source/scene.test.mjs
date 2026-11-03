import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {createEnvironment} from './environment.js';
import {createParticleWorld,PARTICLE_SPHERES} from './particles.js';
import {createLightAvatar} from './avatar.js';

const scene=new THREE.Scene();
const environment=createEnvironment(scene,{lowPower:true});
const world=createParticleWorld(scene,{lowPower:true});
const avatar=createLightAvatar(scene,{lowPower:true});
assert.deepEqual(PARTICLE_SPHERES.map(s=>s.radius),[4.2375,4.6125,4.2375]);
assert.equal(world.centers.length,3);
assert.ok(environment.groundHeight(0,5)>.12);
assert.ok(environment.groundHeight(12,0)<0);
const start=world.centers.map(p=>new THREE.Vector3(p.x,p.y,p.z));
const ray=new THREE.Ray(new THREE.Vector3(-8,4,16),new THREE.Vector3(0,0,-1));
for(let frame=0;frame<600;frame++){
  const time=(frame+1)/60;
  world.update(time,1/60,ray,frame<300,0);
  environment.setSphereCenters(world.centers);
  environment.update(time,1/60);
  if(frame%30===0)environment.emitRipple(4,time*.1);
  avatar.update(time,1/60,1);
  for(let i=0;i<3;i++){
    const p=world.centers[i],r=PARTICLE_SPHERES[i].radius;
    assert.ok(Number.isFinite(p.x+p.y+p.z));
    assert.ok(Math.hypot(p.x,p.z+5)+r<13.55,'The full bubble remains within its enclosing particle ring.');
    assert.ok(p.y-r>.05,'Bubble stays above the water.');
  }
}
assert.ok(world.centers.some((p,i)=>Math.hypot(p.x-start[i].x,p.y-start[i].y,p.z-start[i].z)>.5),'Weightless spheres drift through the room.');
for(const child of scene.children){
  const a=child.geometry?.getAttribute('position');
  if(a)for(const value of a.array)assert.ok(Number.isFinite(value),'Scene geometry remains finite while stirring.');
}
assert.ok(scene.children.length<=15,'Keep the draw budget bounded.');
world.dispose();avatar.dispose();environment.dispose();
assert.equal(scene.children.length,0,'All scene resources detach on exit.');
const entry=readFileSync(new URL('./index.html',import.meta.url),'utf8');
const main=readFileSync(new URL('./main.js',import.meta.url),'utf8');
assert.doesNotMatch(entry,/<audio\b|<video\b|autoplay/i,'No audio is added to this room yet.');
assert.doesNotMatch(main,/new Audio\b|AudioContext|\.mp3/);
console.log('PASS: giant bubble containment, drift, hover stability, scene budget, cleanup and silent room.');
