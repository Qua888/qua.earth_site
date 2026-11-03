import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createPlanarReflection} from './planar-reflection.js';

const water=new THREE.Mesh(new THREE.PlaneGeometry(20,20),new THREE.MeshBasicMaterial());
water.rotation.x=-Math.PI/2;
const scene=new THREE.Scene();scene.add(water);
const points=new THREE.Points(new THREE.BufferGeometry(),new THREE.ShaderMaterial({uniforms:{uSize:{value:100},uHeight:{value:844}}}));
scene.add(points);
const sourceCamera=new THREE.PerspectiveCamera(60,390/844,.08,240);
sourceCamera.position.set(0,3,10);sourceCamera.lookAt(0,1,0);sourceCamera.updateMatrixWorld();
const reflection=createPlanarReflection(water,{lowPower:true});
reflection.resize(390,844);
const previousTarget={name:'main-target'};
let currentTarget=previousTarget,renders=0,throwOnRender=false;
const viewport=new THREE.Vector4(10,20,800,600),scissor=new THREE.Vector4(12,22,790,590);
const currentViewport=new THREE.Vector4(16,32,1280,960);
let scissorTest=true;
const renderer={
  autoClear:false,xr:{enabled:true},shadowMap:{autoUpdate:true},state:{buffers:{depth:{setMask(){}}},viewport:v=>currentViewport.copy(v)},
  getRenderTarget:()=>currentTarget,setRenderTarget:t=>{currentTarget=t;if(t!==previousTarget)currentViewport.set(0,0,t.width,t.height);},
  getDrawingBufferSize:v=>v.set(624,1350),getCurrentViewport:v=>v.copy(currentViewport),
  getViewport:v=>v.copy(viewport),getScissor:v=>v.copy(scissor),getScissorTest:()=>scissorTest,
  setViewport(...v){assert.equal(currentTarget,previousTarget,'Never multiply an offscreen physical viewport by canvas DPR.');if(v[0]?.isVector4)viewport.copy(v[0]);else viewport.set(...v);},
  setScissor(...v){if(v[0]?.isVector4)scissor.copy(v[0]);else scissor.set(...v);},
  setScissorTest:v=>{scissorTest=v;},
  render(renderedScene,camera){
    renders++;
    assert.equal(renderedScene,scene);assert.equal(water.visible,false,'Water cannot recurse into its own mirror.');
    assert.equal(reflection.render(renderer,scene,sourceCamera,0),false,'Reentrant reflection is ignored.');
    assert.equal(camera.position.y,-sourceCamera.position.y,'Virtual eye is reflected across the lake.');
    assert.equal(Math.max(currentTarget.width,currentTarget.height),384,'Mobile target stays bounded.');
    assert.equal(points.material.uniforms.uSize.value,100*currentTarget.height/1350,'Point cores scale with reflection resolution.');
    assert.equal(points.material.uniforms.uHeight.value,844*currentTarget.height/1350,'Avatar glow keeps its projected size.');
    for(const value of camera.projectionMatrix.elements)assert.ok(Number.isFinite(value));
    const above=new THREE.Vector4(0,1,0,1).applyMatrix4(camera.matrixWorldInverse).applyMatrix4(camera.projectionMatrix);
    const below=new THREE.Vector4(0,-1,0,1).applyMatrix4(camera.matrixWorldInverse).applyMatrix4(camera.projectionMatrix);
    assert.ok(above.z>=-above.w,'Geometry above the lake remains reflected.');
    assert.ok(below.z<-below.w,'Geometry under the lake is clipped.');
    if(throwOnRender)throw new Error('test-render-failure');
  },
};
function restored(){
  assert.equal(currentTarget,previousTarget);assert.equal(water.visible,true);
  assert.deepEqual(viewport.toArray(),[10,20,800,600]);assert.deepEqual(scissor.toArray(),[12,22,790,590]);
  assert.deepEqual(currentViewport.toArray(),[16,32,1280,960]);
  assert.equal(points.material.uniforms.uSize.value,100);assert.equal(points.material.uniforms.uHeight.value,844);
  assert.equal(scissorTest,true);assert.equal(renderer.autoClear,false);
  assert.equal(renderer.xr.enabled,true);assert.equal(renderer.shadowMap.autoUpdate,true);
}
assert.equal(reflection.render(renderer,scene,sourceCamera,0),true);restored();
assert.equal(reflection.ready,true);
assert.equal(reflection.render(renderer,scene,sourceCamera,1/120),false,'Cached reflection throttles repeated frames.');
assert.equal(renders,1);
assert.equal(reflection.render(renderer,scene,sourceCamera,1/24),true);restored();
throwOnRender=true;
assert.throws(()=>reflection.render(renderer,scene,sourceCamera,1),/test-render-failure/);restored();
throwOnRender=false;
assert.equal(reflection.render(renderer,scene,sourceCamera,2),true,'Failed render cannot leave the guard locked.');restored();
reflection.dispose();
assert.equal(reflection.render(renderer,scene,sourceCamera,3),false);
water.geometry.dispose();water.material.dispose();
points.geometry.dispose();points.material.dispose();
console.log('PASS: planar camera/clip plane, target budget, cache throttle, recursion guard and renderer-state restoration.');
