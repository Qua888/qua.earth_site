import * as THREE from 'three';

// A little cloud of light, rather than a solid character. The three draws
// share their clock; all of the fine movement happens on the GPU.
export function createLightAvatar(scene, { lowPower = false } = {}) {
  const group = new THREE.Group();
  group.name = 'rainbow-light-traveller';
  scene.add(group);
  const reducedMotion = typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const uniforms = {
    uTime: { value: 0 }, uSpeed: { value: 0 },
    uHeight: { value: typeof window === 'undefined' ? 800 : window.innerHeight },
  };

  const geometry = new THREE.SphereGeometry(0.31, lowPower ? 20 : 28, lowPower ? 14 : 20);
  const coreMaterial = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false,
    vertexShader: `
      uniform float uTime;
      varying vec3 vNormal; varying vec3 vView; varying vec3 vLocal;
      void main() {
        float breath = sin(position.y * 19.0 + uTime * .62)
          * sin(position.x * 16.0 - uTime * .37) * .007;
        vec3 q = position + normal * breath;
        vLocal = q; vNormal = normalize(normalMatrix * normal);
        vec4 p = modelViewMatrix * vec4(q, 1.0); vView = -p.xyz;
        gl_Position = projectionMatrix * p;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      varying vec3 vNormal; varying vec3 vView; varying vec3 vLocal;
      void main() {
        vec3 n = normalize(vNormal); vec3 eye = normalize(vView);
        float facing = max(dot(n, eye), 0.0);
        vec3 reflected = reflect(-eye, n);
        float drift = reflected.y * 4.2 + reflected.x * 2.3 + uTime * .08;
        vec3 spectrum = .68 + .30 * cos(vec3(0., 2.1, 4.2) + drift);
        float chrome = pow(.5 + .5 * sin(reflected.y * 11.0 + reflected.x * 4.0), 5.0);
        float filigree = sin(vLocal.y * 51.0 + vLocal.x * 23.0 + uTime * .26);
        float glint = pow(max(dot(n, normalize(vec3(-.4,.8,1.))),0.0),28.0);
        vec3 color = mix(spectrum, vec3(.95,.96,1.), .23 + chrome * .45);
        color += glint * .34 + spectrum * filigree * .035;
        // Both the pearl and its aura dissolve before their geometric edge.
        float opacity = smoothstep(.03,.65,facing) * (.34 + chrome * .22);
        gl_FragColor = vec4(color, opacity);
      }
    `,
  });
  const core = new THREE.Mesh(geometry, coreMaterial);
  core.name = 'soft-chrome-light';
  core.renderOrder = 3;
  group.add(core);

  const glowGeometry = new THREE.SphereGeometry(.425, 20, 14);
  const glowMaterial = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      varying vec3 vNormal; varying vec3 vView;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 p = modelViewMatrix * vec4(position,1.); vView = -p.xyz;
        gl_Position = projectionMatrix * p;
      }
    `,
    fragmentShader: `
      uniform float uTime; varying vec3 vNormal; varying vec3 vView;
      void main() {
        vec3 n = normalize(vNormal);
        float facing = max(dot(n,normalize(vView)),0.);
        vec3 tint = .65 + .32 * cos(vec3(0.,2.1,4.2) + n.y*3. + uTime*.06);
        gl_FragColor = vec4(tint, pow(facing,2.8) * .16);
      }
    `,
  });
  const glow = new THREE.Mesh(glowGeometry, glowMaterial);
  glow.name = 'soft-light-aura';
  glow.renderOrder = 4;
  group.add(glow);

  const count = lowPower ? 96 : 144;
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const phases = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const y = 1 - (i + .5) / count * 2;
    const phi = i * 2.3999632297;
    const r = Math.sqrt(1 - y * y);
    const depth = .315 + (Math.sin(i * 12.9898) * .5 + .5) * .092;
    positions.set([Math.cos(phi) * r * depth, y * depth, Math.sin(phi) * r * depth], i * 3);
    sizes[i] = .028 + (.5 + .5 * Math.sin(i * 7.13)) * .040;
    phases[i] = i * 1.73;
  }
  const tuftGeometry = new THREE.BufferGeometry();
  tuftGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  tuftGeometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  tuftGeometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  const tuftMaterial = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      uniform float uTime; uniform float uHeight; uniform float uSpeed;
      attribute float aSize; attribute float aPhase;
      varying vec3 vTint; varying float vStrength;
      void main() {
        vec3 q = position * (1.0 + sin(aPhase + uTime*.55) * .035);
        q.y += sin(aPhase*.7 + uTime*.7) * .008;
        vec4 p = modelViewMatrix * vec4(q,1.);
        gl_Position = projectionMatrix * p;
        gl_PointSize = clamp(aSize * uHeight / max(-p.z,.1),1.25,22.);
        vTint = .72 + .26 * cos(vec3(0.,2.1,4.2) + aPhase*.5 + uTime*.075);
        vStrength = .24 + (.5+.5*sin(aPhase+uTime*.36))*.13 + uSpeed*.06;
      }
    `,
    fragmentShader: `
      varying vec3 vTint; varying float vStrength;
      void main() {
        vec2 p = gl_PointCoord-.5;
        float cloud = exp(-dot(p,p)*17.) * (1.-smoothstep(.29,.5,length(p)));
        gl_FragColor = vec4(vTint, cloud*vStrength);
      }
    `,
  });
  const tufts = new THREE.Points(tuftGeometry, tuftMaterial);
  tufts.name = 'fluffy-light-tufts';
  tufts.renderOrder = 5;
  group.add(tufts);

  return {
    group,
    update(time, delta, speed = 0) {
      uniforms.uTime.value = reducedMotion ? 0 : time;
      uniforms.uSpeed.value = Math.min(1, Math.max(0, speed * .25));
      uniforms.uHeight.value = typeof window === 'undefined' ? 800 : window.innerHeight;
      if (!reducedMotion) core.rotation.y += Math.min(delta, .05) * .14;
    },
    dispose() {
      scene.remove(group);
      geometry.dispose(); coreMaterial.dispose();
      glowGeometry.dispose(); glowMaterial.dispose();
      tuftGeometry.dispose(); tuftMaterial.dispose();
    },
  };
}
