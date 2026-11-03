import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {createEnvironment} from './environment.js';

const scene=new THREE.Scene(),environment=createEnvironment(scene,{lowPower:true});
const water=scene.getObjectByName('rainbow-chrome-shallows');
assert.ok(water,'The lake surface remains in the room.');
assert.equal(scene.children.length,4,'Sky, stars, water and limestone retain the same main-scene draw budget.');
assert.equal(environment.renderReflection,undefined,'The environment cannot start another scene render.');
for(const object of scene.children){
  for(const uniform of Object.values(object.material?.uniforms||{})){
    assert.ok(!uniform.value?.isTexture,'The surface needs no capture texture.');
  }
}
environment.update(3);environment.emitRipple(12,0);environment.update(3.1);
assert.equal(water.material.uniforms.uRipples.value.filter(p=>p.w>0).length,1,'Local water ripples still work.');
const main=readFileSync(new URL('./main.js',import.meta.url),'utf8');
const source=readFileSync(new URL('./environment.js',import.meta.url),'utf8');
assert.equal((main.match(/renderer\.render\(/g)||[]).length,1,'Each animation frame renders the scene once.');
assert.doesNotMatch(main,/renderReflection|setRenderTarget/);
assert.doesNotMatch(source,/WebGLRenderTarget|createPlanarReflection|sampler2D|texture2D/);
environment.dispose();assert.equal(scene.children.length,0);
console.log('PASS: one scene render, no capture targets or mirror samples, intact lake/ripples and cleanup.');
