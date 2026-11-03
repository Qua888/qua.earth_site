import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createParticleWorld,PARTICLE_SPHERES} from './particles.js';

function headPositions(scene,name='reactive-sphere-1'){
  const array=scene.getObjectByName(name).geometry.attributes.position.array;
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
  const f=fixture();let stirred,ringStirred;
  for(let frame=0;frame<hz*8;frame++){
    f.world.update((frame+1)/hz,1/hz,ray,hover&&frame<hz*2);
    if(frame===hz*2-1){stirred=headPositions(f.scene);ringStirred=headPositions(f.scene,'outer-particle-torus');}
  }
  const settled=headPositions(f.scene),ringSettled=headPositions(f.scene,'outer-particle-torus');
  f.world.dispose();return {stirred,settled,ringStirred,ringSettled};
}
const base=run(60,false),hover=run(60,true),hover120=run(120,true);
assert.deepEqual(hover.stirred,hover120.stirred,'Pointer-carved flow is refresh-rate independent.');
assert.deepEqual(hover.settled,hover120.settled);
let displaced=0,remaining=0;
for(let i=0;i<base.stirred.length;i+=3){
  displaced+=Math.hypot(base.stirred[i]-hover.stirred[i],base.stirred[i+1]-hover.stirred[i+1],base.stirred[i+2]-hover.stirred[i+2]);
  remaining+=Math.hypot(base.settled[i]-hover.settled[i],base.settled[i+1]-hover.settled[i+1],base.settled[i+2]-hover.settled[i+2]);
  assert.ok(Number.isFinite(hover.settled[i]+hover.settled[i+1]+hover.settled[i+2]));
}
assert.ok(displaced/(base.stirred.length/3)>.1,'Pointer visibly curls and displaces the current.');
assert.ok(Math.abs(remaining/displaced-1)<1e-5,'Cursor-carved material offsets persist without relaxation while the pattern keeps circulating.');
let ringEdit=0,ringMemory=0;
for(let i=0;i<base.ringStirred.length;i+=3){
  ringEdit+=Math.hypot(base.ringStirred[i]-hover.ringStirred[i],base.ringStirred[i+1]-hover.ringStirred[i+1],base.ringStirred[i+2]-hover.ringStirred[i+2]);
  ringMemory+=Math.hypot(base.ringSettled[i]-hover.ringSettled[i],base.ringSettled[i+1]-hover.ringSettled[i+1],base.ringSettled[i+2]-hover.ringSettled[i+2]);
}
assert.ok(ringEdit>1&&ringMemory>ringEdit*.99,'The surrounding ring also retains cursor-carved formations while rotating.');


// A long quiet interval must not erase the pattern. Further cursor encounters
// can reshape the same material particles instead of resetting their memory.
const f=fixture(),control=fixture(),pristine=fixture();
for(let frame=0;frame<60*30;frame++){
  const time=(frame+1)/60;
  f.world.update(time,1/60,ray,frame<120);
  control.world.update(time,1/60,ray,frame<120);
  pristine.world.update(time,1/60,null,false);
}
const quiet=headPositions(f.scene),quietControl=headPositions(control.scene);
assert.deepEqual(quiet,quietControl);
const untouchedTorus=headPositions(pristine.scene);let longMemory=0;
for(let i=0;i<quiet.length;i+=3)longMemory+=Math.hypot(quiet[i]-untouchedTorus[i],quiet[i+1]-untouchedTorus[i+1],quiet[i+2]-untouchedTorus[i+2]);
assert.ok(Math.abs(longMemory/displaced-1)<1e-5,'A thirty-second quiet interval cannot erase the formation.');
const nextRay=new THREE.Ray(new THREE.Vector3(f.world.centers[0].x+.7,f.world.centers[0].y+.3,f.world.centers[0].z+18),new THREE.Vector3(0,0,-1));
for(let frame=0;frame<60;frame++){
  const time=30+(frame+1)/60;
  f.world.update(time,1/60,nextRay,true);control.world.update(time,1/60,null,false);
}
const recarved=headPositions(f.scene),untouched=headPositions(control.scene);
let edit=0;for(let i=0;i<recarved.length;i++)edit+=Math.abs(recarved[i]-untouched[i]);
assert.ok(edit/recarved.length>.05,'Another cursor pass reshapes the persistent formation.');
f.world.dispose();control.world.dispose();pristine.world.dispose();
console.log('PASS: torus baseline, persistent material-space patterns, cursor re-carving, bounded geometry, draw budget and 60/120 Hz agreement.');
