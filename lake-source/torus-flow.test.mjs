import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createParticleWorld,PARTICLE_SPHERES} from './particles.js';

function headPositions(scene){
  const array=scene.getObjectByName('reactive-sphere-1').geometry.attributes.position.array;
  const heads=new Float32Array(array.length/3);
  for(let i=0;i<heads.length/3;i++)heads.set(array.subarray(i*9,i*9+3),i*3);
  return heads;
}
function fixture(){const scene=new THREE.Scene();return {scene,world:createParticleWorld(scene,{lowPower:true})};}
const initial=fixture(),radius=PARTICLE_SPHERES[0].radius;
const before=headPositions(initial.scene);
initial.world.update(1/120,1/120,null,false);
const after=headPositions(initial.scene);
let channel=0,outer=0,poles=0,up=0,down=0;
for(let i=0;i<before.length;i+=3){
  const r=Math.hypot(before[i],before[i+2]),y=before[i+1];
  if(r<radius*.16&&Math.abs(y)<radius*.35){channel++;if(after[i+1]>y)up++;}
  if(r>radius*.76&&Math.abs(y)<radius*.35){outer++;if(after[i+1]<y)down++;}
  if(Math.abs(y)>radius*.65)poles++;
}
assert.ok(channel>25&&outer>25&&poles>100,'The field contains a narrow core, broad return and both polar arches.');
assert.ok(up/channel>.95,'Central current rises through the bubble.');
assert.ok(down/outer>.95,'The outer meridians return downward.');
assert.equal(initial.scene.children.length,7,'Toroidal flow adds no draw calls.');
initial.world.dispose();

const ray=new THREE.Ray(new THREE.Vector3(-8.2,6.3,15),new THREE.Vector3(0,0,-1));
function run(hz,hover){
  const f=fixture();let stirred;
  for(let frame=0;frame<hz*8;frame++){
    f.world.update((frame+1)/hz,1/hz,ray,hover&&frame<hz*2);
    if(frame===hz*2-1)stirred=headPositions(f.scene);
  }
  const settled=headPositions(f.scene);
  f.world.dispose();return {stirred,settled};
}
const base=run(60,false),hover=run(60,true),hover120=run(120,true);
assert.deepEqual(hover.stirred,hover120.stirred,'Pointer-carved flow is refresh-rate independent.');
assert.deepEqual(hover.settled,hover120.settled);
let displaced=0,remaining=0;
for(let i=0;i<base.stirred.length;i++){
  displaced+=Math.abs(base.stirred[i]-hover.stirred[i]);
  remaining+=Math.abs(base.settled[i]-hover.settled[i]);
  assert.ok(Number.isFinite(hover.settled[i]));
}
assert.ok(displaced/base.stirred.length>.05,'Pointer visibly curls and displaces the current.');
assert.ok(remaining<displaced*.04,'After hovering, the transported distortion returns gracefully to the field.');
console.log('PASS: upward core, polar/outer return, pointer-carved torus, recovery, draw budget and 60/120 Hz agreement.');
