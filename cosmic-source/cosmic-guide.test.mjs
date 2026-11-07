import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createCosmicGuide} from './cosmic-guide.ts';

const guide=createCosmicGuide();
const avatar=guide.scene.getObjectByName('traveller-light-body');
const aura=guide.scene.getObjectByName('volumetric-aura');
const lights=guide.scene.getObjectByName('chakra-lights');
const pyramid=guide.scene.children.find(child=>child!==avatar);
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
console.log('PASS: centered vertical rotation, fixed foreground anchor, aligned core lights, balanced egg silhouette, and reduced-motion sculpture.');
