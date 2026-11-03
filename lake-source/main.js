import * as THREE from 'three';
import {createEnvironment} from './environment.js';
import {createParticleWorld} from './particles.js';
import {createLightAvatar} from './avatar.js';
import {stepFlight} from './flight.js';
import './style.css';

const canvas=document.querySelector('#lake');
const coarse=matchMedia('(pointer:coarse)').matches;
const lowPower=coarse||innerWidth<760;
let renderer;
try{renderer=new THREE.WebGLRenderer({canvas,antialias:false,powerPreference:'high-performance'});}
catch{document.querySelector('#sceneError').hidden=false;throw new Error('WebGL unavailable');}
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.08;
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(60,1,.08,240);
const environment=createEnvironment(scene,{lowPower});
const particles=createParticleWorld(scene,{lowPower});
const avatar=createLightAvatar(scene,{lowPower});
const player=new THREE.Vector3(0,0,5.3);
const velocity=new THREE.Vector2();
const flight={height:0,velocity:0};
const travellerVelocity=new THREE.Vector3();
const traveller={position:player,velocity:travellerVelocity,radius:.45};
const keys=new Set();
const cursor=new THREE.Vector2(0,0);
const raycaster=new THREE.Raycaster();
const cameraAim=new THREE.Vector3();
const cameraGoal=new THREE.Vector3();
const lookTarget=new THREE.Vector3();
const stick=new THREE.Vector2();
const thumb=document.querySelector('#moveThumb');
const pad=document.querySelector('#movePad');
let yaw=0,targetYaw=0,pitch=0,targetPitch=0;
let distance=lowPower?13:7.2,targetDistance=distance;
let cursorActive=false,drag=null,stickId=null;
let visible=!document.hidden,lastTime=performance.now(),frame=0,time=0,stepDistance=0;
let welcomeTimer;
let flyInput=0;

function quietWelcome(){
  document.querySelector('#welcome').classList.add('is-quiet');
  clearTimeout(welcomeTimer);
}
welcomeTimer=setTimeout(quietWelcome,15000);
function reset(){
  player.set(0,environment.groundHeight(0,5.3)+.51,5.3);
  flight.height=player.y;flight.velocity=0;flyInput=0;
  velocity.set(0,0);keys.clear();stick.set(0,0);
  yaw=targetYaw=0;pitch=targetPitch=0;
  distance=targetDistance=lowPower?13:7.2;
  stepDistance=0;
  cameraAim.copy(player).add(new THREE.Vector3(0,1.5,0));
  positionCamera(1);
  document.querySelector('#status').textContent='Back on the limestone. Move your pointer through the light.';
}
function positionCamera(ease){
  lookTarget.copy(player);lookTarget.y+=1.5;
  cameraAim.lerp(lookTarget,ease);
  const horizontal=Math.cos(pitch)*distance;
  cameraGoal.set(cameraAim.x+Math.sin(yaw)*horizontal,cameraAim.y+Math.sin(pitch)*distance,cameraAim.z+Math.cos(yaw)*horizontal);
  cameraGoal.y=Math.max(.12,environment.groundHeight(cameraGoal.x,cameraGoal.z)+.20,cameraGoal.y);
  camera.position.copy(cameraGoal);camera.lookAt(cameraAim);
  camera.updateMatrixWorld();
}
function pointer(event){
  const rect=canvas.getBoundingClientRect();
  cursor.set((event.clientX-rect.left)/rect.width*2-1,1-(event.clientY-rect.top)/rect.height*2);
  cursorActive=true;
}
canvas.addEventListener('pointerdown',event=>{
  if(event.pointerType==='mouse'&&event.button!==0)return;
  pointer(event);drag={id:event.pointerId,x:event.clientX,y:event.clientY};
  canvas.setPointerCapture(event.pointerId);canvas.focus({preventScroll:true});
});
canvas.addEventListener('pointermove',event=>{
  pointer(event);
  if(!drag||drag.id!==event.pointerId)return;
  targetYaw-=(event.clientX-drag.x)*.0045;
  targetPitch=THREE.MathUtils.clamp(targetPitch+(event.clientY-drag.y)*.0035,-.09,.78);
  drag.x=event.clientX;drag.y=event.clientY;quietWelcome();
});
function endDrag(event){
  if(drag?.id===event.pointerId)drag=null;
  if(event.pointerType!=='mouse')cursorActive=false;
}
canvas.addEventListener('pointerup',endDrag);canvas.addEventListener('pointercancel',endDrag);
canvas.addEventListener('lostpointercapture',endDrag);
canvas.addEventListener('pointerleave',()=>{if(!drag)cursorActive=false;});
canvas.addEventListener('wheel',event=>{
  event.preventDefault();pointer(event);
  const unit=event.deltaMode===1?16:event.deltaMode===2?innerHeight:1;
  targetDistance=THREE.MathUtils.clamp(targetDistance*Math.exp(THREE.MathUtils.clamp(event.deltaY*unit*.001,-.25,.25)),3.2,28);
  quietWelcome();
},{passive:false});
window.addEventListener('keydown',event=>{
  if(event.target.closest?.('button,a,input,select,textarea')&&event.key!=='Escape')return;
  const key=event.key.toLowerCase();
  if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright','shift','q','e','c',' '].includes(key)){
    event.preventDefault();keys.add(key);quietWelcome();
  }
  if(key==='r'){reset();quietWelcome();}
});
window.addEventListener('keyup',event=>keys.delete(event.key.toLowerCase()));
function release(){keys.clear();velocity.set(0,0);flight.velocity=0;flyInput=0;stick.set(0,0);thumb.style.transform='';drag=null;stickId=null;cursorActive=false;}
window.addEventListener('blur',release);
pad.addEventListener('pointerdown',event=>{
  event.preventDefault();event.stopPropagation();stickId=event.pointerId;
  pad.setPointerCapture(event.pointerId);setStick(event);quietWelcome();
});
function setStick(event){
  const rect=pad.getBoundingClientRect(),radius=rect.width*.34;
  const dx=event.clientX-rect.left-rect.width/2,dy=event.clientY-rect.top-rect.height/2;
  const length=Math.hypot(dx,dy),scale=length>radius?radius/length:1;
  stick.set(dx*scale/radius,-dy*scale/radius);
  thumb.style.transform=`translate(${dx*scale}px,${dy*scale}px)`;
}
pad.addEventListener('pointermove',event=>{if(event.pointerId===stickId)setStick(event);});
function endStick(event){if(event.pointerId===stickId){stickId=null;stick.set(0,0);thumb.style.transform='';}}
pad.addEventListener('pointerup',endStick);pad.addEventListener('pointercancel',endStick);pad.addEventListener('lostpointercapture',endStick);
for(const button of document.querySelectorAll('[data-fly]')){
  const direction=Number(button.dataset.fly);
  button.addEventListener('pointerdown',event=>{event.preventDefault();event.stopPropagation();button.setPointerCapture(event.pointerId);flyInput=direction;quietWelcome();});
  const stop=()=>{flyInput=0;};
  button.addEventListener('pointerup',()=>{stop();canvas.focus({preventScroll:true});});
  button.addEventListener('pointercancel',stop);button.addEventListener('lostpointercapture',stop);button.addEventListener('blur',stop);
  button.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();flyInput=direction;quietWelcome();}});
  button.addEventListener('keyup',stop);
}
document.querySelector('#recenter').addEventListener('click',()=>{reset();canvas.focus({preventScroll:true});});
const fullscreenButton=document.querySelector('#fullscreen');
fullscreenButton.addEventListener('click',async()=>{
  try{if(document.fullscreenElement)await document.exitFullscreen();else if(document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();}
  catch{document.querySelector('#status').textContent='The lake already fills the available screen.';}
  canvas.focus({preventScroll:true});
});
document.addEventListener('fullscreenchange',()=>{const on=!!document.fullscreenElement;fullscreenButton.setAttribute('aria-pressed',String(on));fullscreenButton.innerHTML=`${on?'Exit full screen':'Full screen'} <span aria-hidden="true">⤢</span>`;});
function resize(){
  const width=canvas.clientWidth,height=canvas.clientHeight;
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,lowPower?1.15:1.6));
  renderer.setSize(width,height,false);camera.aspect=width/Math.max(1,height);camera.updateProjectionMatrix();
  positionCamera(1);
}
reset();resize();
const observer=new ResizeObserver(resize);observer.observe(canvas);
function render(now){
  frame=requestAnimationFrame(render);
  const delta=Math.min(.04,Math.max(0,(now-lastTime)/1000));lastTime=now;
  if(!visible)return;
  time+=delta;
  const ease=1-Math.exp(-7*delta);
  yaw+=(targetYaw-yaw)*ease;pitch+=(targetPitch-pitch)*ease;distance+=(targetDistance-distance)*ease;
  let x=stick.x+(keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0);
  let z=stick.y+(keys.has('w')||keys.has('arrowup')?1:0)-(keys.has('s')||keys.has('arrowdown')?1:0);
  const inputLength=Math.hypot(x,z);if(inputLength>1){x/=inputLength;z/=inputLength;}
  const speed=keys.has('shift')?4.4:2.7;
  const dx=(Math.cos(yaw)*x-Math.sin(yaw)*z)*speed;
  const dz=(-Math.sin(yaw)*x-Math.cos(yaw)*z)*speed;
  velocity.x+=(dx-velocity.x)*ease;velocity.y+=(dz-velocity.y)*ease;
  player.x+=velocity.x*delta;player.z+=velocity.y*delta;
  const radius=Math.hypot(player.x,player.z);if(radius>32){player.x*=32/radius;player.z*=32/radius;}
  const vertical=Math.max(-1,Math.min(1,flyInput+(keys.has('e')||keys.has(' ')?1:0)-(keys.has('q')||keys.has('c')?1:0)));
  const ground=environment.groundHeight(player.x,player.z);
  stepFlight(flight,vertical,ground,delta);player.y=flight.height;
  const moving=Math.hypot(velocity.length(),flight.velocity);stepDistance+=moving*delta;
  if(stepDistance>.46){stepDistance=0;if(ground<.06&&player.y-ground<.72)environment.emitRipple(player.x,player.z);}
  avatar.group.position.copy(player);
  avatar.update(time,delta,moving);
  positionCamera(1-Math.exp(-8*delta));
  raycaster.setFromCamera(cursor,camera);
  travellerVelocity.set(velocity.x,flight.velocity,velocity.y);
  particles.update(time,delta,raycaster.ray,cursorActive,0,traveller);
  environment.update(time,delta);
  renderer.render(scene,camera);
}
document.addEventListener('visibilitychange',()=>{visible=!document.hidden;lastTime=performance.now();release();});
frame=requestAnimationFrame(render);
canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();cancelAnimationFrame(frame);document.querySelector('#sceneError').textContent='The lake is resting. Reload to return.';document.querySelector('#sceneError').hidden=false;});
window.addEventListener('pagehide',event=>{
  if(event.persisted)return;
  cancelAnimationFrame(frame);clearTimeout(welcomeTimer);observer.disconnect();
  environment.dispose();particles.dispose();avatar.dispose();renderer.dispose();
},{once:true});
