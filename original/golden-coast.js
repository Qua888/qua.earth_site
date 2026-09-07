/* Endless coast: fixed terrain pool, shared materials, no shadow maps or postprocessing. */
(() => {
  'use strict';
  const host = document.getElementById('scene');
  const status = document.getElementById('status');
  const mobile = matchMedia('(pointer:coarse)').matches || innerWidth <= 768;
  const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
  const mix = (a,b,t) => a+(b-a)*t;
  const smooth = (a,b,x) => { const t=clamp((x-a)/(b-a),0,1); return t*t*(3-2*t); };
  const PHI = (1+Math.sqrt(5))/2;
  function hash(x,z) { let h = Math.imul(x|0,374761393) ^ Math.imul(z|0,668265263); h=Math.imul(h^(h>>>13),1274126177); return ((h^(h>>>16))>>>0)/4294967296; }
  function noise(x,z) { const ix=Math.floor(x), iz=Math.floor(z), fx=x-ix, fz=z-iz, u=fx*fx*(3-2*fx), v=fz*fz*(3-2*fz); return mix(mix(hash(ix,iz),hash(ix+1,iz),u),mix(hash(ix,iz+1),hash(ix+1,iz+1),u),v); }
  function coast(z) { return 160+Math.sin(z*.0011)*290+Math.sin(z*.0027)*85; }
  function height(x,z) {
    const n=noise(x*.003,z*.003), detail=noise(x*.012,z*.012), inland=x-coast(z);
    let h=-42+smooth(-90,270,inland)*(62+n*160)+detail*8;
    // Islets taper to zero at their cell boundary; neighboring terrain tiles share exact edges.
    const cell=540,cx=Math.floor(x/cell),cz=Math.floor(z/cell),sx=(cx+.5)*cell,sz=(cz+.5)*cell,seed=hash(cx,cz);
    const dx=(x-sx)/(135+seed*70),dz=(z-sz)/(140+hash(cz,cx)*70);
    const angle=Math.atan2(dz,dx),rim=1+Math.sin(angle*3+seed*8)*.12+Math.sin(angle*5+seed*20)*.06;
    const mound=Math.max(0,1-(dx*dx+dz*dz)/(rim*rim));
    if(sx<coast(sz)-110 && seed>.22) h=Math.max(h,-34+Math.pow(mound,1.3)*(100+seed*190)*(.7+noise(x*.014,z*.014)*.5)+detail*7);
    return h;
  }
  const renderer=new THREE.WebGLRenderer({antialias:!mobile,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,mobile?1.1:1.5)); renderer.setSize(innerWidth,innerHeight);
  renderer.outputColorSpace=THREE.SRGBColorSpace; renderer.setClearColor(0x7bb8c4); host.appendChild(renderer.domElement);
  const scene=new THREE.Scene(); scene.fog=new THREE.Fog(0x8bbfc7,1350,2500);
  const camera=new THREE.PerspectiveCamera(62,innerWidth/innerHeight,.5,6000);
  scene.add(new THREE.HemisphereLight(0xd5f6ff,0x485443,2.1));
  const sunLight=new THREE.DirectionalLight(0xffe1a5,2.6); sunLight.position.set(-700,1000,-600); scene.add(sunLight);
  const sky=new THREE.Mesh(new THREE.SphereGeometry(4300,24,12),new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms:{},vertexShader:'varying vec3 dir; void main(){dir=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',fragmentShader:`varying vec3 dir; void main(){vec3 d=normalize(dir);float h=max(d.y,0.0);vec3 c=mix(vec3(.64,.82,.83),vec3(.12,.43,.62),pow(h,.55));float s=max(dot(d,normalize(vec3(-.55,.32,-.8))),0.0);c+=vec3(1.0,.64,.25)*pow(s,26.0)*.28;c+=vec3(1.0,.86,.61)*pow(s,1700.0)*2.0;gl_FragColor=vec4(c,1.0);}`})); scene.add(sky);
  const groundMat=new THREE.MeshLambertMaterial({vertexColors:true});
  const decorationMat=new THREE.MeshLambertMaterial({vertexColors:true,side:THREE.DoubleSide});
  const TILE=800,RADIUS=3,SEG=mobile?24:36;
  const tiles=new Map(),pool=[];
  const rock=new THREE.Color(0x788c78),grass=new THREE.Color(0x3c8555),sand=new THREE.Color(0xf5d899),deep=new THREE.Color(0x21998d);
  function createTile() {
    const geo=new THREE.PlaneGeometry(TILE,TILE,SEG,SEG); geo.rotateX(-Math.PI/2);
    geo.setAttribute('color',new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count*3),3));
    const group=new THREE.Group(),mesh=new THREE.Mesh(geo,groundMat);group.add(mesh);scene.add(group);
    return {group,mesh,decor:null,x:0,z:0};
  }
  const tmpColor=new THREE.Color();
  function buildTile(tile,cx,cz) {
    tile.x=cx;tile.z=cz;
    const pos=tile.mesh.geometry.attributes.position,color=tile.mesh.geometry.attributes.color;
    for(let i=0;i<pos.count;i++) {
      const x=pos.getX(i)+cx*TILE,z=pos.getZ(i)+cz*TILE,h=height(x,z);pos.setY(i,h);
      if(h<0)tmpColor.copy(deep).lerp(sand,smooth(-35,3,h));
      else if(h<16)tmpColor.copy(sand).lerp(grass,smooth(5,16,h));
      else tmpColor.copy(grass).lerp(rock,smooth(70,190,h));
      tmpColor.multiplyScalar(.87+noise(x*.04,z*.04)*.23);color.setXYZ(i,tmpColor.r,tmpColor.g,tmpColor.b);
    }
    pos.needsUpdate=true;color.needsUpdate=true;tile.mesh.geometry.computeVertexNormals();tile.mesh.geometry.computeBoundingSphere();
    if(tile.decor){tile.group.remove(tile.decor);tile.decor.geometry.dispose();}
    const vertices=[],colors=[];
    function tri(a,b,c,col){for(const p of [a,b,c]){vertices.push(...p);colors.push(col.r,col.g,col.b);}}
    function box(x,y,z,w,h,d,col){const p=[[x-w,y,z-d],[x+w,y,z-d],[x+w,y+h,z-d],[x-w,y+h,z-d],[x-w,y,z+d],[x+w,y,z+d],[x+w,y+h,z+d],[x-w,y+h,z+d]];for(const [a,b,c,d0] of [[0,3,2,1],[4,5,6,7],[0,4,7,3],[1,2,6,5],[3,7,6,2],[0,1,5,4]]){tri(p[a],p[b],p[c],col);tri(p[a],p[c],p[d0],col);}}
    const trunk=new THREE.Color(0x8a7552),leaf=new THREE.Color(0x32825f),stone=new THREE.Color(0xc4b18a);
    for(let i=0;i<(mobile?32:48);i++){
      const angle=i*Math.PI*2/(PHI*PHI),radius=Math.sqrt((i+.5)/(mobile?32:48))*TILE*.46;
      const x=Math.cos(angle)*radius,z=Math.sin(angle)*radius,y=height(x+cx*TILE,z+cz*TILE);
      if(y<8||y>125)continue;
      const h=14+hash(cx*31+i,cz)*15;box(x,y,z,1,h,1,trunk);
      for(let k=0;k<6;k++){const a=k*Math.PI/3+i,dx=Math.cos(a),dz=Math.sin(a),tip=[x+dx*22,y+h-5,z+dz*22],l=[x+dx*10-dz*4,y+h+2,z+dz*10+dx*4],r=[x+dx*10+dz*4,y+h+2,z+dz*10-dx*4];tri([x,y+h,z],l,r,leaf);tri(l,tip,r,leaf);}
    }
    const shrineY=height(cx*TILE,cz*TILE);
    if(shrineY>18 && hash(cx+93,cz)>.56){box(0,shrineY,0,19,4,14,stone);box(-11,shrineY+4,0,3,24,4,stone);box(11,shrineY+4,0,3,24,4,stone);box(0,shrineY+28,0,17,5,6,stone);box(0,shrineY+33,0,11,3,5,new THREE.Color(0x64b7af));}
    if(vertices.length){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.computeVertexNormals();tile.decor=new THREE.Mesh(g,decorationMat);tile.group.add(tile.decor);}else tile.decor=null;
  }
  let streamCell='';
  function stream(x,z,initial=false){
    const cx=Math.round(x/TILE),cz=Math.round(z/TILE),want=new Set();
    const cellKey=`${cx},${cz}`;
    if(cellKey===streamCell && tiles.size===49)return;
    streamCell=cellKey;
    for(let dz=-RADIUS;dz<=RADIUS;dz++)for(let dx=-RADIUS;dx<=RADIUS;dx++)want.add(`${cx+dx},${cz+dz}`);
    for(const [key,tile]of tiles)if(!want.has(key)){tile.group.visible=false;tiles.delete(key);pool.push(tile);}
    const pending=[...want].filter(key=>!tiles.has(key)).sort((a,b)=>{const aa=a.split(',').map(Number),bb=b.split(',').map(Number);return (aa[0]-cx)**2+(aa[1]-cz)**2-(bb[0]-cx)**2-(bb[1]-cz)**2;});
    for(let count=0;pending.length && count<(initial?49:1);count++){const key=pending.shift(),[tx,tz]=key.split(',').map(Number),tile=pool.pop()||createTile();buildTile(tile,tx,tz);tile.group.visible=true;tiles.set(key,tile);}
  }
  const waterUniforms={time:{value:0},origin:{value:new THREE.Vector2()},energy:{value:0}};
  const water=new THREE.Mesh(new THREE.PlaneGeometry(10000,10000,1,1),new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:waterUniforms,vertexShader:`varying vec3 world;void main(){vec4 p=modelMatrix*vec4(position,1.);world=p.xyz;gl_Position=projectionMatrix*viewMatrix*p;}`,fragmentShader:`uniform float time;uniform float energy;uniform vec2 origin;varying vec3 world;void main(){vec2 p=world.xz+origin;float a=sin(p.x*.06+p.y*.12+time*1.8);float b=sin(p.x*.14-p.y*.035-time*1.1);vec3 N=normalize(vec3(a*.11,1.,b*.09));vec3 V=normalize(cameraPosition-world);vec3 L=normalize(vec3(-.55,.65,-.7));float fres=pow(1.-max(dot(N,V),0.),3.);float spec=pow(max(dot(N,normalize(V+L)),0.),100.);float ripple=sin(p.x*.15+p.y*.22+time)*sin(p.y*.17-time*.8);vec3 c=mix(vec3(.018,.43,.49),vec3(.24,.73,.71),.4+ripple*.06);c=mix(c,vec3(.58,.8,.82),fres*.68);c+=vec3(1.,.85,.53)*spec*(.7+energy*.25);float haze=smoothstep(1250.,2400.,length(world.xz-cameraPosition.xz));c=mix(c,vec3(.545,.75,.78),haze);gl_FragColor=vec4(c,mix(.76,1.,max(fres,haze)));}`}));
  water.rotation.x=-Math.PI/2;scene.add(water);
  const ship=new THREE.Group();scene.add(ship);
  const shape=new THREE.Shape();shape.moveTo(0,13);shape.lineTo(-10,-8);shape.lineTo(10,-8);shape.closePath();
  const cut=new THREE.Path();cut.moveTo(0,7);cut.lineTo(5.8,-5);cut.lineTo(-5.8,-5);cut.closePath();shape.holes.push(cut);
  const gold=new THREE.MeshStandardMaterial({color:0xffcb56,metalness:.6,roughness:.25,emissive:0xa6580b,emissiveIntensity:.3});
  const triangle=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:1.6,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:.45,bevelThickness:.4}),gold);triangle.rotation.x=-Math.PI/2;ship.add(triangle);
  const core=new THREE.Mesh(new THREE.OctahedronGeometry(1.6),new THREE.MeshBasicMaterial({color:0xffefb4}));core.position.set(0,1,0);ship.add(core);
  const flight={x:-220,y:105,z:180,yaw:0,turn:0,climb:0,altitude:105};
  const keys=new Set(),input={x:0,y:0,pointer:null,anchorX:0,anchorY:0};
  const joystick=document.getElementById('joystick'),stick=document.getElementById('stick');
  if(mobile)document.getElementById('guide').innerHTML='Drag to steer &amp; change height<br>Or hold the thumb control<br>Always in flight';
  function begin(e){if(input.pointer!==null)return;input.pointer=e.pointerId;input.anchorX=e.clientX;input.anchorY=e.clientY;try{e.currentTarget.setPointerCapture(e.pointerId);}catch{}e.preventDefault();}
  function move(e){if(e.pointerId!==input.pointer)return;input.x=clamp((e.clientX-input.anchorX)/65,-1,1);input.y=clamp((input.anchorY-e.clientY)/65,-1,1);stick.style.transform=`translate(${input.x*28}px,${-input.y*28}px)`;e.preventDefault();}
  function release(e){if(e && e.pointerId!==input.pointer)return;input.pointer=null;input.x=input.y=0;stick.style.transform='';}
  for(const surface of [host,joystick]){surface.addEventListener('pointerdown',begin,{passive:false});surface.addEventListener('pointermove',move,{passive:false});for(const type of ['pointerup','pointercancel','lostpointercapture'])surface.addEventListener(type,release);}
  const codes=['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','KeyA','KeyD','KeyW','KeyS'];
  addEventListener('keydown',e=>{if(codes.includes(e.code)){keys.add(e.code);e.preventDefault();}});addEventListener('keyup',e=>keys.delete(e.code));
  function clear(){keys.clear();release();}
  addEventListener('blur',clear);document.addEventListener('visibilitychange',clear);
  document.getElementById('reset').addEventListener('click',()=>{flight.x=coast(flight.z)-300;flight.altitude=105;flight.y=Math.max(105,height(flight.x,flight.z)+45);flight.yaw=0;flight.turn=0;clear();});
  // Set this when the next QUA track is supplied. Audio unlocks only on a gesture.
  const TRACK_URL='';
  const audio=document.getElementById('music'),musicButton=document.getElementById('musicButton');let context,analyser,bins;
  if(TRACK_URL){audio.src=TRACK_URL;musicButton.textContent='Play';}
  musicButton.addEventListener('click',async()=>{if(!TRACK_URL){status.textContent='A new QUA track is coming.';return;}try{if(!context){context=new (window.AudioContext||window.webkitAudioContext)();analyser=context.createAnalyser();analyser.fftSize=256;bins=new Uint8Array(analyser.frequencyBinCount);context.createMediaElementSource(audio).connect(analyser);analyser.connect(context.destination);}await context.resume();if(audio.paused){await audio.play();musicButton.textContent='Pause';}else{audio.pause();musicButton.textContent='Play';}status.textContent='';}catch{status.textContent='Tap Play to try the track again.';}});
  function resize(){camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);}
  addEventListener('resize',resize);stream(flight.x,flight.z,true);
  let last=0,time=0,energy=0;
  const follow=new THREE.Vector3(),look=new THREE.Vector3();
  camera.position.set(0,140,92);
  function animate(now){
    requestAnimationFrame(animate);if(document.hidden){last=now;return;}
    const dt=last?Math.min((now-last)/1000,.04):1/60;last=now;time+=dt;
    const tx=clamp(input.x+(keys.has('ArrowRight')||keys.has('KeyD')?1:0)-(keys.has('ArrowLeft')||keys.has('KeyA')?1:0),-1,1);
    const ty=clamp(input.y+(keys.has('ArrowUp')||keys.has('KeyW')?1:0)-(keys.has('ArrowDown')||keys.has('KeyS')?1:0),-1,1);
    const ease=1-Math.exp(-dt*4);flight.turn=mix(flight.turn,tx,ease);flight.climb=mix(flight.climb,ty,ease);
    flight.yaw-=flight.turn*dt*.72;flight.altitude=clamp(flight.altitude+flight.climb*dt*80,32,260);
    const vx=-Math.sin(flight.yaw)*105,vz=-Math.cos(flight.yaw)*105;flight.x+=vx*dt;flight.z+=vz*dt;
    const floor=Math.max(height(flight.x,flight.z),height(flight.x+vx*.8,flight.z+vz*.8),0)+32;
    flight.y=mix(flight.y,Math.max(flight.altitude,floor),1-Math.exp(-dt*5));
    // Render near the origin, keeping long journeys free of floating-point vibration.
    stream(flight.x,flight.z);for(const tile of tiles.values())tile.group.position.set(tile.x*TILE-flight.x,0,tile.z*TILE-flight.z);
    ship.position.set(0,flight.y,0);ship.rotation.set(flight.climb*.12,flight.yaw,-flight.turn*.42,'YXZ');
    follow.set(Math.sin(flight.yaw)*92,flight.y+35,Math.cos(flight.yaw)*92);camera.position.lerp(follow,1-Math.exp(-dt*5));look.set(-Math.sin(flight.yaw)*110,flight.y-16,-Math.cos(flight.yaw)*110);camera.lookAt(look);sky.position.copy(camera.position);
    if(analyser && !audio.paused){analyser.getByteFrequencyData(bins);let sum=0;for(let i=1;i<14;i++)sum+=bins[i];energy=mix(energy,sum/(13*255),ease);}else energy=mix(energy,0,ease);
    gold.emissiveIntensity=.3+energy*.7;core.scale.setScalar(1+energy*.25);waterUniforms.energy.value=energy;waterUniforms.time.value=time;waterUniforms.origin.value.set(flight.x%100000,flight.z%100000);
    renderer.render(scene,camera);
  }
  renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();status.textContent='Graphics paused. Reload to resume flight.';});
  requestAnimationFrame(animate);
})();
