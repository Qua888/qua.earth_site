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
  const auraGeometry = new THREE.PlaneGeometry(1.9, 3.05);
  const auraUniforms = { uOpacity: { value: 0 }, uTurn: { value: 0 } };
  const auraMaterial = new THREE.ShaderMaterial({
    uniforms: auraUniforms, transparent: true, depthWrite: false,
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      varying vec2 vUv; uniform float uOpacity; uniform float uTurn;
      float segment(vec2 p, vec2 a, vec2 b) {
        vec2 q = p - a; vec2 d = b - a;
        return length(q - d * clamp(dot(q, d) / dot(d, d), 0.0, 1.0));
      }
      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        float d = length(p * vec2(1.25, 0.95));
        float shell = exp(-pow((d - 0.80) / 0.13, 2.0));
        float inner = exp(-pow((d - 0.60) / 0.17, 2.0));
        vec3 spectrum = 0.55 + 0.45 * cos(vec3(0.0, 2.1, 4.2) + d * 25.0 + uTurn * 0.18);
        float spine = exp(-pow(p.x / 0.08, 2.0)) * smoothstep(-0.9, 0.5, p.y);
        float head = exp(-dot((p - vec2(0.0, 0.63)) * vec2(6.5, 9.0),
          (p - vec2(0.0, 0.63)) * vec2(6.5, 9.0)));
        float body = min(segment(p, vec2(0.0, 0.36), vec2(0.0, -0.35)),
          min(segment(p, vec2(-0.12, 0.28), vec2(-0.3, -0.2)), segment(p, vec2(0.12, 0.28), vec2(0.3, -0.2))));
        body = min(body, min(segment(p, vec2(-0.03, -0.31), vec2(-0.15, -0.78)),
          segment(p, vec2(0.03, -0.31), vec2(0.15, -0.78))));
        float outline = exp(-body * 85.0);
        float alpha = (shell * 0.19 + inner * 0.09 + spine * 0.035 + head * 0.15 + outline * 0.12) * uOpacity;
        vec3 color = mix(vec3(0.83, 0.73, 0.98), spectrum, shell * 0.75);
        gl_FragColor = vec4(color, alpha);
      }
    `,
  });
  avatar.add(new THREE.Mesh(auraGeometry, auraMaterial));
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
      avatar.scale.setScalar(compactLandscape ? 0.55 : portrait ? 0.50 : 0.86);
      avatar.position.set(compactLandscape ? 0.6 : portrait ? 0.48 : 1.4, portrait ? 0.25 : -0.05, 0.7);
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
      lightUniforms.uOpacity.value = opacity;
      lightPositions.set([0, 0.99, 0.06, 0, 0.99, 0.08]);
      for (let i = 0; i < 7; i++) {
        const y = 0.79 - i * 0.255;
        const phase = avatarTurn + i * 0.44;
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
