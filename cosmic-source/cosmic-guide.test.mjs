import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createCosmicGuide, GuideFieldLoop} from './cosmic-guide.ts';

const point = new THREE.Vector3(), opposite = new THREE.Vector3();
for(let meridian=0;meridian<6;meridian++){
  const loop=new GuideFieldLoop(meridian*Math.PI/6);
  assert.ok(loop.getPoint(0).distanceTo(loop.getPoint(1))<1e-12,
    'Every outer hoop closes at the beam without a shortcut across the bottom.');
  assert.ok(loop.getTangent(0).distanceTo(loop.getTangent(1))<1e-12,
    'The closed seam has one continuous tangent instead of a pointed join.');
  for(let step=0;step<32;step++){
    const t=step/32;
    loop.getPoint(t,point);loop.getPoint(t+.5,opposite);
    assert.ok(point.clone().add(opposite).length()<1e-12,
      'Opposite points balance around the same center as the egg and beam.');
    const radial=point.x*point.x+point.z*point.z;
    assert.ok(Math.abs(radial/(.84*.84)+point.y*point.y/(1.5*1.5)-1)<1e-12);
    assert.ok(radial/(.63*.63)+point.y*point.y/(1.34*1.34)>1,
      'The smooth outer hoop surrounds the original egg rather than crossing its shell.');
  }
  assert.ok(Math.abs(loop.getTangent(0).y)<1e-12&&Math.abs(loop.getTangent(.5).y)<1e-12,
    'Top and bottom turn smoothly with horizontal tangents.');
  if(meridian>0)assert.ok(loop.getPoint(.25).distanceTo(new GuideFieldLoop(0).getPoint(.25))>.1,
    'Each hoop occupies a distinct meridian plane.');
}

const guide=createCosmicGuide();
const avatar=guide.scene.getObjectByName('traveller-light-body');
const aura=guide.scene.getObjectByName('volumetric-aura');
const lights=guide.scene.getObjectByName('chakra-lights');
const pyramid=guide.scene.children.find(child=>child!==avatar);
assert.equal(guide.scene.getObjectByName('toroidal-light-field').geometry.getAttribute('position').count,3528,
  'Smoother paths keep the original beam plus six 32-segment tubes vertex budget.');
const origin=new THREE.Vector3(),axis=new THREE.Vector3();

for(const [width,height]of[[1280,720],[390,844],[844,390]]){
  guide.resize(width,height);
  const anchored=avatar.position.clone();
  for(const time of[0,1,12,90]){
    guide.update(time,1,false,time*.15);
    guide.scene.updateMatrixWorld(true);
    avatar.localToWorld(origin.set(0,0,0));
    avatar.localToWorld(axis.set(0,1,0));
    axis.sub(origin);
    assert.ok(Math.abs(axis.x)<1e-12&&Math.abs(axis.z)<1e-12,
      'Ambient and user rotation keep the light field on a perfectly vertical axis.');
    assert.ok(avatar.position.distanceTo(anchored)<1e-12,
      'Turning does not orbit or displace the traveller from its foreground anchor.');
    const positions=lights.geometry.getAttribute('position');
    for(const index of[0,1,2,5,8,11,14,17,20]){
      assert.equal(positions.getX(index),0);
      assert.equal(positions.getZ(index),0,'Every central light remains aligned to the beam.');
    }
  }
}
aura.geometry.computeBoundingBox();
const size=new THREE.Vector3();aura.geometry.boundingBox.getSize(size);
assert.ok(Math.abs(size.x-size.z)<1e-7,
  'The egg has balanced horizontal radii, so its silhouette cannot wobble when turned.');
guide.update(1,1,true,0);const pausedTurn=avatar.rotation.y;
guide.update(99,1,true,0);
assert.equal(avatar.rotation.y,pausedTurn,'Reduced motion stops autonomous light-body rotation.');
assert.equal(pyramid.children[0].material.uniforms.uTime.value,0,
  'The living crystal pattern stays still for reduced motion.');
guide.update(99,1,true,.7);
assert.ok(Math.abs(avatar.rotation.y-pausedTurn-.7)<1e-12,'Deliberate user turning remains available.');
guide.dispose();
console.log('PASS: smooth closed centered meridian hoops at the original vertex budget, vertical rotation, fixed anchor, aligned lights, balanced egg and reduced motion.');
