import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createParticleWorld,PARTICLE_SPHERES} from './particles.js';

function run(hz,contact=false,seconds=6){
  const scene=new THREE.Scene(),world=createParticleWorld(scene,{lowPower:true});
  const traveller=contact?{
    position:new THREE.Vector3(-8.2,6.3,-2.5+PARTICLE_SPHERES[0].radius+.65),
    velocity:new THREE.Vector3(0,0,-1),radius:.45,
  }:null;
  const previous=world.centers.map(p=>new THREE.Vector3(p.x,p.y,p.z));
  let minimumGap=Infinity,maximumExtent=0,maximumSpeed=0;
  for(let frame=0;frame<seconds*hz;frame++){
    world.update((frame+1)/hz,1/hz,null,false,0,traveller);
    for(let i=0;i<3;i++){
      const p=world.centers[i];
      maximumExtent=Math.max(maximumExtent,Math.hypot(p.x,p.z+5)+p.w);
      maximumSpeed=Math.max(maximumSpeed,Math.hypot(p.x-previous[i].x,p.y-previous[i].y,p.z-previous[i].z)*hz);
      previous[i].set(p.x,p.y,p.z);
      assert.ok(p.y-p.w>=.7999,'The lifted bubble never sinks into the water.');
      for(let j=i+1;j<3;j++){
        const q=world.centers[j];
        minimumGap=Math.min(minimumGap,Math.hypot(p.x-q.x,p.y-q.y,p.z-q.z)-p.w-q.w);
      }
    }
  }
  for(const object of scene.children){
    const position=object.geometry?.attributes.position;
    if(position)for(const n of position.array)assert.ok(Number.isFinite(n));
  }
  const result={centers:world.centers.map(p=>p.toArray()),minimumGap,maximumExtent,maximumSpeed};
  assert.equal(scene.children.filter(o=>o.isPoints).reduce((n,o)=>n+o.geometry.attributes.position.count,0),5175,
    'The mobile sphere and ring fields receive the requested density increase.');
  world.dispose();assert.equal(scene.children.length,0);
  return result;
}

assert.deepEqual(PARTICLE_SPHERES.map(p=>p.radius),[4.2375,4.6125,4.2375]);
const baseline=run(60),contact=run(60,true),contact120=run(120,true);
assert.ok(baseline.maximumSpeed>.5,'Baseline balloons visibly travel and bounce rather than barely drifting.');
assert.deepEqual(contact.centers,contact120.centers,'Contact physics is independent of display refresh rate.');
const passthrough=fixturePassthrough();
function fixturePassthrough(){
  const scene=new THREE.Scene(),world=createParticleWorld(scene,{lowPower:true});
  const traveller={position:new THREE.Vector3(-8.2,6.3,-2.5),velocity:new THREE.Vector3(0,0,-2),radius:.45};
  const position=traveller.position.clone();
  for(let frame=0;frame<120;frame++)world.update((frame+1)/60,1/60,null,false,0,traveller);
  assert.deepEqual(traveller.position,position,'Bubble contact never locks or displaces the avatar, so interiors remain traversable.');
  world.dispose();return true;
}
assert.ok(contact.centers[0][2]<baseline.centers[0][2]-.25,'Approaching the surface gently nudges the bubble away.');
for(const stress of [run(60,false,100),run(60,true,100)]){
  assert.ok(stress.maximumExtent<=13.101,'The full bubble stays within its ring.');
  assert.ok(stress.minimumGap>=.02,'Larger drifting bubbles do not overlap.');
  assert.ok(stress.maximumSpeed<=1.5,'Repeated contact remains playful without an explosive bounce.');
}
console.log('PASS: larger lifted bubbles, avatar contact, fixed-step agreement, density and 100-second containment.');
