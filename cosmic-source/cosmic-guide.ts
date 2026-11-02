import * as THREE from 'three';

export type GuideStage = 'hidden' | 'arrival' | 'wisdom' | 'question' | 'zero' | 'one';
export type GuideChoice = 0 | 1;
export const ASCENSION_START = 7.20;
export const ASCENSION_DURATION = 6.6;

export const GUIDE_DIALOGUE = {
  arrival: {
    eyebrow: 'BEYOND THE LAST STAR',
    title: 'Oh. You made it.',
    text: 'Welcome, traveller. Aligned, harmonic, and still wonderfully curious. Congratulations: you followed the many all the way back to the one.',
    action: 'Where am I?',
  },
  wisdom: {
    eyebrow: 'THE KEEPER OF THE INTERVAL',
    title: 'A little cosmic wisdom.',
    text: 'There is but one awake consciousness; its many forms are iterations. Zero is the infinite womb: no-thing, with the capacity for all creation. A little wisdom to carry lightly. Shall we put it into play?',
    action: 'Ask me.',
  },
  question: {
    eyebrow: 'TWO PATHS · NO WRONG ANSWER',
    title: 'Zero, or one?',
    text: '0 qua 1 — no-thing becoming conscious form. 1 qua 0 — consciousness as infinity. Neither is apart from the other. Which direction would you like to experience?',
    action: '',
  },
  zero: {
    eyebrow: '0 · THE OPEN CIRCLE',
    title: 'Nothing to prove. Everything to become.',
    text: 'Ah, zero. An infinity of room to begin. Return to the beginning, to the womb of stars—not empty, but possible. In joy, play. Bring that lovely curiosity with you.',
    action: 'Begin again',
  },
  one: {
    eyebrow: '1 · THE FIRST STEP',
    title: 'Infinity has put on a shape.',
    text: 'One, then. Consciousness taking form. Into the square you go—try not to mistake the frame for the whole picture. In joy, play. Peace, and elegant vitality.',
    action: 'Enter the square',
  },
} as const;

// A small, genuinely three-dimensional guide, not a video or another WebGL
// context. Only drawn while the white realm is visible; no lights or shadows.
export function createCosmicGuide() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 20);
  camera.position.set(0, 0, 5.5);
  const guide = new THREE.Group();
  scene.add(guide);

  const geometry = new THREE.ConeGeometry(0.84, 1.48, 4, 1, false);
  geometry.rotateY(Math.PI / 4);
  const uniforms = { uTime: { value: 0 }, uOpacity: { value: 0 } };
  const material = new THREE.ShaderMaterial({
    uniforms, transparent: true,
    vertexShader: `
      varying vec3 vNormal; varying vec3 vPosition; varying vec3 vLocal;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vLocal = position;
        vec4 p = modelViewMatrix * vec4(position, 1.0);
        vPosition = p.xyz;
        gl_Position = projectionMatrix * p;
      }
    `,
    fragmentShader: `
      uniform float uTime; uniform float uOpacity;
      varying vec3 vNormal; varying vec3 vPosition; varying vec3 vLocal;
      float crystalFold(vec3 p) {
        float f = 0.0; float weight = 0.5;
        for (int i = 0; i < 4; i++) {
          p = abs(p) / clamp(dot(p, p), 0.28, 2.0) - vec3(0.72, 0.63, 0.65);
          f += exp(-abs(p.x + p.y - p.z) * 12.0) * weight;
          weight *= 0.52;
        }
        return f;
      }
      void main() {
        vec3 n = normalize(vNormal);
        float facing = abs(dot(n, normalize(-vPosition)));
        float light = max(dot(n, normalize(vec3(-0.4, 0.8, 1.0))), 0.0);
        vec3 reflected = reflect(normalize(vPosition), n);
        float fold = crystalFold(vLocal * 2.1 + vec3(0.0, uTime * 0.012, 0.0));
        vec3 gold = mix(vec3(0.36, 0.22, 0.075), vec3(1.0, 0.84, 0.43), 0.3 + light * 0.7);
        vec3 rainbow = 0.56 + 0.44 * cos(vec3(0.0, 2.1, 4.2)
          + reflected.y * 4.5 + reflected.x * 2.7 + fold * 7.0 + uTime * 0.06);
        float chrome = pow(0.5 + 0.5 * sin(reflected.y * 9.0 + reflected.x * 3.0), 6.0);
        vec3 color = mix(gold, rainbow, 0.17 + fold * 0.24 + pow(1.0 - facing, 1.8) * 0.23);
        color = mix(color * 0.72, color + vec3(0.25), chrome * 0.65);
        color += rainbow * fold * 0.10;
        float glint = pow(max(dot(n, normalize(vec3(-0.25, 0.5, 1.0))), 0.0), 65.0);
        color += vec3(1.0, 0.97, 0.87) * glint * 0.8;
        gl_FragColor = vec4(color, uOpacity);
      }
    `,
  });
  guide.add(new THREE.Mesh(geometry, material));

  const avatar = new THREE.Group();
  avatar.name = 'traveller-light-body';
  scene.add(avatar);
  // One real ellipsoid replaces the old camera-facing aura card. Its rim
  // changes with viewing angle, and the body inside has actual depth.
  const auraGeometry = new THREE.SphereGeometry(1, 24, 16);
  auraGeometry.scale(0.63, 1.34, 0.43);
  auraGeometry.translate(0, -0.03, 0);
  const auraUniforms = { uOpacity: { value: 0 }, uTurn: { value: 0 } };
  const auraMaterial = new THREE.ShaderMaterial({
    uniforms: auraUniforms, transparent: true, depthWrite: false,
    vertexShader: `
      varying vec3 vNormal; varying vec3 vView; varying vec3 vLocal;
      void main() {
        vNormal = normalize(normalMatrix * normal); vLocal = position;
        vec4 p = modelViewMatrix * vec4(position, 1.0); vView = -p.xyz;
        gl_Position = projectionMatrix * p;
      }
    `,
    fragmentShader: `
      varying vec3 vNormal; varying vec3 vView; varying vec3 vLocal;
      uniform float uOpacity; uniform float uTurn;
      void main() {
        float rim = pow(1.0 - max(dot(normalize(vNormal), normalize(vView)), 0.0), 2.4);
        vec3 spectrum = 0.58 + 0.32 * cos(vec3(0.0, 2.1, 4.2)
          + vLocal.y * 2.4 + vLocal.z * 4.0 + uTurn * 0.12);
        vec3 color = mix(vec3(0.79, 0.72, 0.91), spectrum, 0.72);
        gl_FragColor = vec4(color, (0.012 + rim * 0.27) * uOpacity);
      }
    `,
  });
  const aura = new THREE.Mesh(auraGeometry, auraMaterial);
  aura.name = 'volumetric-aura';
  aura.renderOrder = 1;
  avatar.add(aura);

  // Merge the little rounded anatomical forms once: one body draw, no
  // skeletal animation, shadows, lighting rig, or per-frame mesh allocation.
  const bodyParts: THREE.BufferGeometry[] = [];
  const addEllipsoid = (x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
    const part = new THREE.SphereGeometry(1, 12, 8);
    part.scale(sx, sy, sz); part.translate(x, y, z); bodyParts.push(part);
  };
  const addLimb = (from: THREE.Vector3, to: THREE.Vector3, top: number, bottom: number) => {
    const direction = to.clone().sub(from);
    const part = new THREE.CylinderGeometry(top, bottom, direction.length(), 8, 1);
    part.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()));
    part.translate((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2);
    bodyParts.push(part);
  };
  addEllipsoid(0, 0.97, 0, 0.112, 0.143, 0.105);
  addEllipsoid(0, 0.22, 0, 0.125, 0.35, 0.085);
  addEllipsoid(0, -0.28, 0, 0.13, 0.15, 0.09);
  addLimb(new THREE.Vector3(0, 0.50, 0), new THREE.Vector3(0, 0.83, 0), 0.035, 0.041);
  addLimb(new THREE.Vector3(0, -0.30, 0), new THREE.Vector3(0, 0.17, 0), 0.09, 0.10);
  for (const side of [-1, 1]) {
    addLimb(new THREE.Vector3(side * 0.28, -0.31, 0.035), new THREE.Vector3(side * 0.12, 0.43, 0), 0.038, 0.022);
    addLimb(new THREE.Vector3(side * 0.16, -1.14, 0.015), new THREE.Vector3(side * 0.063, -0.34, 0), 0.047, 0.025);
  }
  const bodyPositions: number[] = [], bodyNormals: number[] = [];
  for (const part of bodyParts) {
    const triangles = part.toNonIndexed();
    bodyPositions.push(...Array.from(triangles.getAttribute('position').array));
    bodyNormals.push(...Array.from(triangles.getAttribute('normal').array));
    triangles.dispose(); part.dispose();
  }
  const bodyGeometry = new THREE.BufferGeometry();
  bodyGeometry.setAttribute('position', new THREE.Float32BufferAttribute(bodyPositions, 3));
  bodyGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(bodyNormals, 3));
  const bodyMaterial = new THREE.ShaderMaterial({
    uniforms: auraUniforms, transparent: true, depthWrite: true,
    vertexShader: `
      varying vec3 vNormal; varying vec3 vView; varying float vHeight;
      void main() {
        vNormal = normalize(normalMatrix * normal); vHeight = position.y;
        vec4 p = modelViewMatrix * vec4(position, 1.0); vView = -p.xyz;
        gl_Position = projectionMatrix * p;
      }
    `,
    fragmentShader: `
      varying vec3 vNormal; varying vec3 vView; varying float vHeight;
      uniform float uOpacity;
      void main() {
        vec3 n = normalize(vNormal);
        float facing = max(dot(n, normalize(vView)), 0.0);
        float light = 0.5 + 0.5 * dot(n, normalize(vec3(-0.5, 0.7, 1.0)));
        vec3 pearl = mix(vec3(0.58, 0.48, 0.73), vec3(0.96, 0.93, 1.0), light);
        vec3 spectrum = 0.65 + 0.28 * cos(vec3(0.0, 2.1, 4.2) + vHeight * 3.7 + n.z * 0.5);
        float glint = pow(max(dot(n, normalize(vec3(-0.3, 0.65, 1.0))), 0.0), 24.0);
        vec3 color = mix(pearl, spectrum, 0.24) + glint * 0.22;
        gl_FragColor = vec4(color, (0.38 + (1.0 - facing) * 0.26) * uOpacity);
      }
    `,
  });
  const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
  body.name = 'dimensional-light-body';
  avatar.add(body);
  const lightGeometry = new THREE.BufferGeometry();
  const lightPositions = new Float32Array(23 * 3);
  const lightColors = new Float32Array(23 * 3);
  const lightSizes = new Float32Array(23);
  const chakraColors = [0xb994ff, 0x7678ff, 0x7dd8ff, 0x8be4b2, 0xffe79c, 0xffb895, 0xff91ad];
  for (let i = 0; i < 23; i++) {
    const chakra = Math.max(0, Math.floor((i - 2) / 3));
    const color = new THREE.Color(i < 2 ? 0xffffff : chakraColors[chakra]);
    color.toArray(lightColors, i * 3);
    lightSizes[i] = i === 0 ? 0.62 : i === 1 ? 0.21 : (i - 2) % 3 === 0 ? 0.13 * (1 - chakra * 0.075) : 0.055;
  }
  lightGeometry.setAttribute('position', new THREE.BufferAttribute(lightPositions, 3));
  lightGeometry.setAttribute('color', new THREE.BufferAttribute(lightColors, 3));
  lightGeometry.setAttribute('aSize', new THREE.BufferAttribute(lightSizes, 1));
  const lightUniforms = { uOpacity: { value: 0 }, uHeight: { value: 720 } };
  const lightMaterial = new THREE.ShaderMaterial({
    uniforms: lightUniforms, transparent: true, depthWrite: false,
    vertexShader: `
      attribute vec3 color; attribute float aSize;
      uniform float uHeight; varying vec3 vColor; varying float vStrength;
      void main() {
        vec4 p = modelViewMatrix * vec4(position, 1.0);
        vColor = color; vStrength = clamp((position.y + 1.2) * 0.43, 0.18, 1.0);
        gl_PointSize = clamp(aSize * uHeight / -p.z, 2.0, 180.0);
        gl_Position = projectionMatrix * p;
      }
    `,
    fragmentShader: `
      uniform float uOpacity; varying vec3 vColor; varying float vStrength;
      void main() {
        float r = length(gl_PointCoord - 0.5) * 2.0;
        float halo = exp(-r * r * 5.0); float core = exp(-r * r * 38.0);
        vec3 color = mix(vColor, vec3(1.0), core * 0.75);
        gl_FragColor = vec4(color, (halo * 0.4 + core * 0.55) * vStrength * uOpacity);
      }
    `,
  });
  const lights = new THREE.Points(lightGeometry, lightMaterial);
  lights.frustumCulled = false;
  lights.name = 'chakra-lights';
  lights.renderOrder = 2;
  avatar.add(lights);
  let compactLandscape = false;

  return {
    scene, camera,
    resize(width: number, height: number) {
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
      compactLandscape = height <= 540 && width > height;
      const portrait = camera.aspect < 0.7;
      guide.scale.setScalar(compactLandscape ? 0.65 : portrait ? 0.45 : 0.94);
      guide.position.x = compactLandscape ? -1.8 : portrait ? -0.35 : -1.18;
      avatar.scale.setScalar(compactLandscape ? 0.55 : portrait ? 0.46 : 0.86);
      avatar.position.set(compactLandscape ? -0.65 : portrait ? 0.48 : 1.4, compactLandscape ? 0.18 : portrait ? 0.62 : -0.05, 0.7);
      lightUniforms.uHeight.value = height;
    },
    update(time: number, opacity: number, reducedMotion: boolean, avatarTurn = 0) {
      uniforms.uTime.value = time;
      uniforms.uOpacity.value = opacity;
      guide.position.y = (compactLandscape ? 0.35 : 0.78)
        + (reducedMotion ? 0 : Math.sin(time * 0.68) * 0.065);
      guide.rotation.set(0.06, reducedMotion ? 0.35 : 0.35 + time * 0.045, 0.0);
      auraUniforms.uOpacity.value = opacity;
      auraUniforms.uTurn.value = avatarTurn;
      avatar.rotation.y = avatarTurn + (reducedMotion ? 0.26 : 0.26 + time * 0.027);
      lightUniforms.uOpacity.value = opacity;
      lightPositions.set([0, 0.99, 0.06, 0, 0.99, 0.08]);
      for (let i = 0; i < 7; i++) {
        const y = 0.79 - i * 0.255;
        const phase = avatarTurn * 0.18 + i * 0.44;
        const radius = 0.18 + Math.sin(i * 0.5) * 0.045;
        const index = (2 + i * 3) * 3;
        lightPositions.set([Math.sin(phase) * 0.025, y, 0.1], index);
        lightPositions.set([Math.cos(phase) * radius, y + Math.sin(phase) * 0.055, Math.sin(phase) * radius], index + 3);
        lightPositions.set([-Math.cos(phase) * radius, y - Math.sin(phase) * 0.055, -Math.sin(phase) * radius], index + 6);
      }
      lightGeometry.attributes.position.needsUpdate = true;
    },
    dispose() {
      geometry.dispose(); material.dispose(); auraGeometry.dispose(); auraMaterial.dispose();
      bodyGeometry.dispose(); bodyMaterial.dispose();
      lightGeometry.dispose(); lightMaterial.dispose();
    },
  };
}

// Screen-space volumetric impression: six soft noise samples, no extra
// raymarch, texture downloads, postprocessing or particle allocations.
export const cloudRealmShader = /* glsl */ `
  vec3 cloudRealm(vec2 p) {
    float t = uAltBeat * 0.022;
    float lower = 1.0 - smoothstep(-0.9, 0.55, p.y);
    float n = noise2(p * vec2(1.5, 2.4) + vec2(t, -t * 0.3));
    float detail = noise2(p * 3.7 - vec2(t * 0.7, t * 0.2));
    float cloud = smoothstep(0.25, 0.78, n * 0.72 + detail * 0.28);
    vec3 color = mix(vec3(0.94, 0.954, 0.983), vec3(1.0, 0.986, 0.963), 0.5 + p.y * 0.22);
    color -= vec3(0.12, 0.11, 0.065) * cloud * lower;
    float bank = noise2(p * vec2(0.8, 3.1) + vec2(6.0 - t, t));
    color += vec3(0.085) * smoothstep(0.38, 0.68, bank) * lower;
    float billow = smoothstep(0.39, 0.68, n * 0.65 + detail * 0.35);
    float bankEdge = exp(-pow((p.y + 0.12 + bank * 0.38) / 0.28, 2.0));
    color += vec3(0.06, 0.055, 0.065) * billow * bankEdge;
    float halo = exp(-length((p - vec2(0.0, 0.28)) * vec2(0.9, 1.1)) * 2.5);
    color += vec3(0.04, 0.028, 0.008) * halo;
    float floorMist = exp(-pow((p.y + 0.03 + n * 0.11) / 0.17, 2.0));
    color = mix(color, vec3(0.99, 0.984, 1.0), floorMist * 0.4);
    // A faint pool of shadow gives the floating guide a position in space.
    float shadow = exp(-dot((p - vec2(0.0, -0.15)) * vec2(3.2, 18.0),
      (p - vec2(0.0, -0.15)) * vec2(3.2, 18.0)));
    return clamp(color - vec3(0.05, 0.042, 0.028) * shadow, 0.0, 1.0);
  }
`;
