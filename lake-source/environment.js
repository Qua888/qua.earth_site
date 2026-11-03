import * as THREE from 'three';
import { createPlanarReflection } from './planar-reflection.js';

// One almost-still water surface, with a small planar reflection target reused
// between updates. Footsteps add local ripples without disturbing the lake.
export function createEnvironment(scene, { lowPower = false } = {}) {
  const objects = [];
  const resources = [];
  const add = (object) => { scene.add(object); objects.push(object); return object; };
  const keep = (resource) => { resources.push(resource); return resource; };
  const fogColor = new THREE.Color(0x796371);
  const timeUniform = { value: 0 };
  scene.background = new THREE.Color(0x796371);
  scene.fog = new THREE.FogExp2(fogColor, 0.006);
  // One inexpensive atmosphere function is used for both the actual sky and
  // the reflected sky. Cloud bands therefore meet at the same quiet horizon.
  const skyShader = `
    uniform float uTime;
    float skyHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float skyNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(skyHash(i),skyHash(i+vec2(1,0)),f.x),mix(skyHash(i+vec2(0,1)),skyHash(i+1.),f.x),f.y);}
    vec3 sampleSky(vec3 direction){
      vec3 d=normalize(direction);d.y=abs(d.y);
      float horizon=exp(-d.y*5.4);
      vec3 color=mix(vec3(.018,.026,.066),vec3(.22,.135,.17),horizon);
      vec3 horizonDirection=normalize(vec3(d.x,.001,d.z));
      float warm=exp(-(1.-dot(horizonDirection,normalize(vec3(-.62,0.,-.78))))*21.)*exp(-d.y*d.y*54.);
      color+=vec3(.29,.12,.035)*warm;
      // Sample the direction itself. Unlike an atan longitude, this circular
      // path has no branch cut to expose in either the sky or its reflection.
      vec2 uv=d.xz*2.5+vec2(d.y*13.,d.y*8.3);
      float n=skyNoise(uv+vec2(uTime*.003,0.))*.69
        +skyNoise(uv*2.13+vec2(8.7,-uTime*.002))*.31;
      float cloud=smoothstep(.45,.73,n)*smoothstep(.015,.075,d.y)*(1.-smoothstep(.48,.87,d.y));
      float edge=smoothstep(.60,.72,n)*(1.-smoothstep(.72,.83,n));
      vec3 cloudColor=mix(vec3(.095,.085,.125),vec3(.29,.195,.205),horizon);
      cloudColor+=vec3(.16,.065,.025)*warm;
      color=mix(color,cloudColor,cloud*.63);
      color+=vec3(.047,.023,.03)*edge*cloud;
      float cosmicBand=exp(-pow((d.y-d.x*.2-.38)/.16,2.));
      color+=vec3(.014,.006,.027)*cosmicBand*n;
      return color;
    }`;

  const sky = add(new THREE.Mesh(
    keep(new THREE.SphereGeometry(125, 32, 16)),
    keep(new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, uniforms: { uTime: timeUniform },
      vertexShader: `varying vec3 vDirection; void main(){vDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `
        varying vec3 vDirection;
        ${skyShader}
        void main(){
          gl_FragColor=vec4(sampleSky(vDirection),1.);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }))
  ));
  sky.renderOrder = -10;

  // Quiet fixed stars leave the moving particle sculptures as the focal point.
  const starCount = lowPower ? 430 : 760;
  const positions = new Float32Array(starCount * 3);
  const colors = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const a = i * 2.399963229728653;
    const y = 0.015 + ((i * 0.61803398875) % 1) * 0.985;
    const r = Math.sqrt(1 - y * y);
    positions.set([Math.cos(a) * r * 110, y * 110, Math.sin(a) * r * 110], i * 3);
    const c = new THREE.Color().setHSL(0.57 + (i % 13) * 0.015, 0.13, 0.55 + (i % 5) * 0.07);
    c.toArray(colors, i * 3);
  }
  const starGeometry = keep(new THREE.BufferGeometry());
  starGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  starGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  add(new THREE.Points(starGeometry, keep(new THREE.PointsMaterial({
    size: lowPower ? 1.05 : 1.25, sizeAttenuation: false, vertexColors: true,
    transparent: true, opacity: 0.72, depthWrite: false, fog: false,
  }))));

  const rippleCount = lowPower ? 5 : 8;
  const ripples = Array.from({ length: rippleCount }, () => new THREE.Vector4(0, 0, -100, 0));
  const sphereCenters = [new THREE.Vector4(-8.2, 6.3, -2.5, 4.2375), new THREE.Vector4(0, 7.6, -9.2, 4.6125), new THREE.Vector4(8.2, 6.3, -2.5, 4.2375)];
  const waterUniforms = {
    uTime: timeUniform, uRipples: { value: ripples }, uFogColor: { value: fogColor },
    uSphereCenters: { value: sphereCenters },
    uReflection: { value: null }, uReflectionMatrix: { value: new THREE.Matrix4() }, uReflectionReady: { value: 0 },
  };
  const waterGeometry = keep(new THREE.PlaneGeometry(384, 384, lowPower ? 64 : 96, lowPower ? 64 : 96));
  waterGeometry.rotateX(-Math.PI / 2);
  const waterMaterial = keep(new THREE.ShaderMaterial({
    uniforms: waterUniforms, defines: { RIPPLE_COUNT: rippleCount },
    vertexShader: `
      uniform float uTime; uniform vec4 uRipples[RIPPLE_COUNT]; uniform mat4 uReflectionMatrix;
      varying vec3 vWorld; varying vec3 vNormal; varying vec4 vMirrorCoord;
      void main(){
        vec3 p=position; float t=uTime;
        float a=p.x*.43+p.z*.28+t*.25;
        float b=p.x*-.22+p.z*.57-t*.19;
        float c=p.x*.79+p.z*-.13+t*.11;
        float h=sin(a)*.0015+sin(b)*.001+sin(c)*.0005;
        vec2 slope=cos(a)*.0015*vec2(.43,.28)+cos(b)*.001*vec2(-.22,.57)+cos(c)*.0005*vec2(.79,-.13);
        for(int i=0;i<RIPPLE_COUNT;i++){
          vec4 r=uRipples[i]; float age=t-r.z;
          if(age<0. || age>6.)continue;
          vec2 d=p.xz-r.xy; float distance=max(length(d),.001);
          float front=distance-age*2.5;
          if(abs(front)>3.5)continue;
          float envelope=exp(-front*front*.55)*exp(-age*.48)*smoothstep(0.,.18,age)*r.w;
          // Broad, shallow physical motion remains resolvable by this mesh.
          // The precise circular wavefront is shaded analytically below.
          h+=sin(front*2.2)*envelope*.003;
        }
        p.y+=h; vWorld=(modelMatrix*vec4(p,1.)).xyz;
        vMirrorCoord=uReflectionMatrix*vec4(vWorld.x,0.,vWorld.z,1.);
        vNormal=normalize(vec3(-slope.x,1.,-slope.y));
        gl_Position=projectionMatrix*viewMatrix*vec4(vWorld,1.);
      }`,
    fragmentShader: `
      uniform vec3 uFogColor; uniform vec4 uRipples[RIPPLE_COUNT]; uniform vec4 uSphereCenters[3];
      uniform sampler2D uReflection; uniform float uReflectionReady;
      varying vec3 vWorld; varying vec3 vNormal; varying vec4 vMirrorCoord;
      ${skyShader}
      void main(){
        vec3 view=normalize(cameraPosition-vWorld);
        vec2 p=vWorld.xz; float t=uTime;
        // Fine capillary waves supply the liquid detail between mesh vertices.
        vec2 micro=vec2(cos(p.x*5.7+p.y*3.8+t*.34),sin(p.x*-3.2+p.y*5.1-t*.28))*.0007;
        vec2 rippleSlope=vec2(0.);float rippleGlint=0.;
        for(int i=0;i<RIPPLE_COUNT;i++){
          vec4 r=uRipples[i];float age=t-r.z;
          if(age<0. || age>5.8 || r.w<.01)continue;
          vec2 d=p-r.xy;float radius=max(length(d),.001);
          float front=radius-age*2.5;
          // The narrow annulus rejects almost all fragments before trig/exp.
          if(abs(front)>2.3)continue;
          float envelope=exp(-front*front*1.45)*exp(-age*.52)*smoothstep(0.,.18,age)*r.w;
          float wave=sin(front*6.2);
          float derivative=(6.2*cos(front*6.2)-2.9*front*wave)*envelope*.006;
          rippleSlope+=d/radius*derivative;
          rippleGlint+=(.5+.5*wave)*envelope;
        }
        vec3 n=normalize(vNormal+vec3(micro.x-rippleSlope.x,0.,micro.y-rippleSlope.y));
        vec3 reflected=reflect(-view,n);
        float fresnel=pow(1.-max(dot(n,view),0.),3.2);
        vec3 film=.52+.35*cos(vec3(0.,2.1,4.2)+reflected.y*5.8+reflected.x*2.4+p.x*.035+p.y*.052);
        vec3 shallow=mix(vec3(.16,.135,.18),vec3(.29,.27,.25),.5+.5*sin(p.x*.15+p.y*.1));
        vec3 sky=sampleSky(reflected);
        vec3 color=mix(shallow*film*.36,sky*(.98+film*.04),.91+fresnel*.07);
        float spec=pow(max(dot(reflected,normalize(vec3(-.62,.07,-.78))),0.),260.);
        color+=vec3(.32,.17,.085)*spec*.3;
        // First-frame fallback while the reflection target is being filled.
        float glow=0.;
        for(int i=0;i<3;i++){
          float radius=uSphereCenters[i].w;
          glow+=exp(-length((p-uSphereCenters[i].xz)*vec2(.85/radius,.47/radius))*1.2);
        }
        color+=film*glow*.035*(1.-uReflectionReady);
        vec2 mirrorUv=vMirrorCoord.xy/max(vMirrorCoord.w,.0001);
        mirrorUv+=rippleSlope*.003+micro*.012;
        float inMirror=step(0.,mirrorUv.x)*step(mirrorUv.x,1.)*step(0.,mirrorUv.y)*step(mirrorUv.y,1.)*step(.0001,vMirrorCoord.w);
        vec3 clearReflection=texture2D(uReflection,clamp(mirrorUv,vec2(.001),vec2(.999))).rgb;
        color=mix(color,clearReflection*(.98+film*.035),uReflectionReady*inMirror);
        color=mix(color,film,.025);
        color+=mix(vec3(.005,.003,.007),film*.008,.45)*min(rippleGlint,1.4);
        float distance=length(cameraPosition-vWorld);
        color=mix(color,uFogColor,1.-exp(-distance*distance*.000065));
        gl_FragColor=vec4(color,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  const water = add(new THREE.Mesh(waterGeometry, waterMaterial));
  water.name = 'rainbow-chrome-shallows';
  water.frustumCulled = false;
  const reflection = createPlanarReflection(water, { lowPower });
  waterUniforms.uReflection.value = reflection.texture;
  waterUniforms.uReflectionMatrix.value = reflection.textureMatrix;

  const smooth = (a, b, value) => {
    const t = THREE.MathUtils.clamp((value - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };
  const rockRadius = (a) => 1 + Math.sin(a * 3 + 0.8) * 0.065 + Math.sin(a * 7 - 1) * 0.027;
  const groundHeight = (x, z) => {
    const nx = x / 3.6, nz = (z - 5) / 4.8;
    const a = Math.atan2(nz, nx);
    const rho = Math.hypot(nx, nz) / rockRadius(a);
    if (rho >= 1) return -0.12;
    const top = 0.18 + Math.sin(x * 0.73 + z * 0.18) * 0.018 + Math.cos(z * 0.62 - x * 0.17) * 0.014;
    return THREE.MathUtils.lerp(top, -0.12, smooth(0.76, 1, rho));
  };
  const rings = lowPower ? 20 : 28;
  const segments = lowPower ? 80 : 112;
  const rockVertices = [0, groundHeight(0, 5), 5];
  const rockIndices = [];
  for (let r = 1; r <= rings; r++) {
    const fraction = r / rings;
    for (let i = 0; i < segments; i++) {
      const a = i / segments * Math.PI * 2;
      const x = Math.cos(a) * 3.6 * rockRadius(a) * fraction;
      const z = 5 + Math.sin(a) * 4.8 * rockRadius(a) * fraction;
      rockVertices.push(x, groundHeight(x, z), z);
    }
  }
  for (let i = 0; i < segments; i++) rockIndices.push(0, 1 + (i + 1) % segments, 1 + i);
  for (let r = 1; r < rings; r++) {
    const before = 1 + (r - 1) * segments, next = before + segments;
    for (let i = 0; i < segments; i++) {
      const j = (i + 1) % segments;
      rockIndices.push(before + i, before + j, next + i, before + j, next + j, next + i);
    }
  }
  const rockGeometry = keep(new THREE.BufferGeometry());
  rockGeometry.setAttribute('position', new THREE.Float32BufferAttribute(rockVertices, 3));
  rockGeometry.setIndex(rockIndices); rockGeometry.computeVertexNormals();
  const rockMaterial = keep(new THREE.ShaderMaterial({
    uniforms: { uFogColor: { value: fogColor } },
    vertexShader: `varying vec3 vWorld;varying vec3 vNormal;void main(){vWorld=(modelMatrix*vec4(position,1.)).xyz;vNormal=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*viewMatrix*vec4(vWorld,1.);}`,
    fragmentShader: `
      uniform vec3 uFogColor;varying vec3 vWorld;varying vec3 vNormal;
      float hash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
      void main(){
        vec3 p=vWorld;
        float grain=hash(floor(p*115.));
        float strata=.5+.5*sin(p.x*1.7+p.z*2.9+sin(p.z*.8)*1.6+p.y*40.);
        float seams=pow(.5+.5*sin(p.x*.7+p.z*1.6+sin(p.x*2.5)*.4),18.);
        float lamination=pow(.5+.5*sin(p.z*14.+p.x*1.1+sin(p.x*2.)*.65+p.y*29.),22.);
        // Sparse rounded pores are stable world-space marks, rather than
        // subpixel white noise that disappears into a blank cream average.
        vec2 cell=floor(p.xz*32.),local=fract(p.xz*32.)-.5;
        float seed=hash(vec3(cell.x,2.,cell.y));
        vec2 offset=vec2(seed-.5,fract(seed*17.3)-.5)*.46;
        float poreRadius=.06+fract(seed*9.7)*.13;
        float aa=max(length(fwidth(p.xz*32.))*.5,.025);
        float pore=(1.-smoothstep(poreRadius-aa,poreRadius+aa,length(local-offset)))*smoothstep(.54,.78,seed);
        vec2 shallowFacet=vec2(sin(p.x*2.1+p.z*.31),cos(p.z*1.7-p.x*.24))*.075;
        vec3 normal=normalize(vNormal+vec3(shallowFacet.x,0.,shallowFacet.y));
        float light=.48+.52*max(dot(normal,normalize(vec3(-.3,.8,.5))),0.);
        vec3 limestone=mix(vec3(.33,.295,.265),vec3(.70,.64,.54),strata*.48+.31);
        limestone*=light*(.965+grain*.06);
        limestone-=seams*.045+lamination*.021+pore*.075;
        float wet=1.-smoothstep(-.025,.105,p.y);
        limestone*=1.-wet*.27;
        float facing=1.-abs(dot(normalize(cameraPosition-p),normal));
        limestone+=vec3(.045,.02,.065)*pow(facing,3.)*(.5+wet);
        float distance=length(cameraPosition-p);
        limestone=mix(limestone,uFogColor,1.-exp(-distance*distance*.00030));
        gl_FragColor=vec4(limestone,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  const stone = add(new THREE.Mesh(rockGeometry, rockMaterial));
  stone.name = 'weathered-limestone-island';

  // No enclosing mountain wall: the far water and mirrored atmosphere share
  // a broad, uninterrupted salt-flat horizon.

  let currentTime = 0, rippleIndex = 0;
  return {
    update(time) { currentTime = time; waterUniforms.uTime.value = time; },
    resize(width, height) { reflection.resize(width, height); },
    renderReflection(renderer, reflectedScene, camera, time) {
      const rendered = reflection.render(renderer, reflectedScene, camera, time);
      waterUniforms.uReflectionReady.value = reflection.ready ? 1 : 0;
      return rendered;
    },
    setSphereCenters(centers) {
      for (let i = 0; i < 3; i++) if (centers[i]) {
        const center=centers[i];
        sphereCenters[i].set(center.x,center.y,center.z,center.w??sphereCenters[i].w);
      }
    },
    groundHeight,
    emitRipple(x, z) {
      // The dry limestone does not send water ripples through solid ground.
      if (groundHeight(x, z) > 0.025) return;
      ripples[rippleIndex].set(x, z, currentTime, 1);
      rippleIndex = (rippleIndex + 1) % rippleCount;
    },
    dispose() {
      reflection.dispose();
      for (const object of objects) scene.remove(object);
      for (const resource of resources) resource.dispose();
    },
  };
}
