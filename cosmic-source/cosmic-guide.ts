import * as THREE from 'three';

export type GuideStage = 'hidden' | 'arrival';
export type GuideChoice = 0 | 1;
export const ASCENSION_START = 7.20;
export const ASCENSION_DURATION = 6.6;

export const GUIDE_DIALOGUE = {
  arrival: {
    eyebrow: 'THE QUIET BETWEEN',
    title: 'There you are.',
    text: 'The many return to one. Rest a moment, then follow what calls.',
  },
} as const;

// Periodic analytic hoops keep the seam and both rounded ends smooth without
// increasing the existing tube budget. Every meridian shares the egg's center.
export class GuideFieldLoop extends THREE.Curve<THREE.Vector3> {
  private readonly azimuth: number;
  constructor(azimuth: number) { super(); this.azimuth = azimuth; }

  getPoint(t: number, target = new THREE.Vector3()) {
    const angle = t * Math.PI * 2;
    const radial = Math.sin(angle) * 0.84;
    return target.set(Math.cos(this.azimuth) * radial, Math.cos(angle) * 1.50,
      Math.sin(this.azimuth) * radial);
  }

  getPointAt(t: number, target = new THREE.Vector3()) { return this.getPoint(t, target); }

  getTangent(t: number, target = new THREE.Vector3()) {
    const angle = t * Math.PI * 2;
    const radial = Math.cos(angle) * 0.84;
    return target.set(Math.cos(this.azimuth) * radial, -Math.sin(angle) * 1.50,
      Math.sin(this.azimuth) * radial).normalize();
  }

  getTangentAt(t: number, target = new THREE.Vector3()) { return this.getTangent(t, target); }
}

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
        // Let the engraving travel through the crystal rather than only
        // changing its tint. One folded sample keeps this a small shader.
        vec3 flowing = vLocal * 2.1;
        flowing.x += sin(vLocal.y * 1.6 + uTime * 0.19) * 0.22;
        flowing.y -= uTime * 0.09;
        flowing.z += sin(vLocal.x * 1.5 - uTime * 0.13) * 0.16;
        float fold = crystalFold(flowing);
        vec3 gold = mix(vec3(0.36, 0.22, 0.075), vec3(1.0, 0.84, 0.43), 0.3 + light * 0.7);
        vec3 rainbow = 0.56 + 0.44 * cos(vec3(0.0, 2.1, 4.2)
          + reflected.y * 4.5 + reflected.x * 2.7 + fold * 7.0 + uTime * 0.06);
        float chrome = pow(0.5 + 0.5 * sin(reflected.y * 9.0 + reflected.x * 3.0), 6.0);
        vec3 color = mix(gold, rainbow, 0.17 + fold * 0.34 + pow(1.0 - facing, 1.8) * 0.23);
        color = mix(color * 0.72, color + vec3(0.25), chrome * 0.65);
        float travellingSheen = pow(0.5 + 0.5 * sin(vLocal.y * 6.0
          + vLocal.x * 3.0 - uTime * 0.36 + fold * 4.0), 5.0);
        color += rainbow * fold * 0.16 + mix(gold, rainbow, 0.38) * travellingSheen * 0.11;
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
  // A body-free, rotationally balanced egg stays on the light's vertical
  // axis as it turns, instead of appearing to lean or wobble around it.
  const auraGeometry = new THREE.SphereGeometry(1, 24, 16);
  auraGeometry.scale(0.63, 1.34, 0.63);
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
        vec3 spectrum = 0.48 + 0.36 * cos(vec3(0.0, 2.1, 4.2)
          + vLocal.y * 2.4 + vLocal.z * 4.0 + uTurn * 0.12);
        vec3 color = mix(vec3(0.62, 0.43, 0.87), spectrum, 0.72);
        // Saturated, transparent light reads on the white cloud realm;
        // white additive glow alone would disappear into that background.
        float softLight = exp(-pow(vLocal.y * 0.65, 2.0));
        gl_FragColor = vec4(color, (0.025 + rim * 0.52 + softLight * 0.035) * uOpacity);
      }
    `,
  });
  const aura = new THREE.Mesh(auraGeometry, auraMaterial);
  aura.name = 'volumetric-aura';
  aura.renderOrder = 1;
  avatar.add(aura);

  // Six closed meridian hoops surround the shell on the same central axis.
  const fieldParts: THREE.BufferGeometry[] = [];
  const beam = new THREE.CylinderGeometry(0.010, 0.020, 3.3, 6, 1);
  beam.translate(0, 0.45, 0);
  fieldParts.push(beam);
  for (let meridian = 0; meridian < 6; meridian++) {
    fieldParts.push(new THREE.TubeGeometry(new GuideFieldLoop(meridian * Math.PI / 6), 32, 0.009, 3, true));
  }
  const fieldPositions: number[] = [];
  for (const part of fieldParts) {
    const triangles = part.toNonIndexed();
    fieldPositions.push(...Array.from(triangles.getAttribute('position').array));
    triangles.dispose(); part.dispose();
  }
  const fieldGeometry = new THREE.BufferGeometry();
  fieldGeometry.setAttribute('position', new THREE.Float32BufferAttribute(fieldPositions, 3));
  const fieldUniforms = { uOpacity: { value: 0 }, uTime: { value: 0 } };
  const fieldMaterial = new THREE.ShaderMaterial({
    uniforms: fieldUniforms, transparent: true, depthWrite: false,
    vertexShader: `
      varying vec3 vLocal;
      void main() {
        vLocal = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vLocal; uniform float uOpacity; uniform float uTime;
      void main() {
        float axis = 1.0 - smoothstep(0.02, 0.06, length(vLocal.xz));
        float flow = pow(0.5 + 0.5 * sin(vLocal.y * 5.0 - uTime * 0.34), 4.0);
        vec3 pearl = vec3(0.56, 0.39, 0.88);
        vec3 spectrum = 0.47 + 0.36 * cos(vec3(0.0, 2.1, 4.2) + vLocal.y * 2.4);
        vec3 color = mix(spectrum, vec3(0.86, 0.81, 1.0), axis * 0.52);
        float etherFade = 1.0 - smoothstep(1.15, 2.12, vLocal.y);
        float outerSoftness = 1.0 - 0.22 * smoothstep(0.5, 0.84, length(vLocal.xz));
        gl_FragColor = vec4(mix(pearl, color, 0.8),
          (0.34 + flow * 0.36 + axis * 0.18) * etherFade * outerSoftness * uOpacity);
      }
    `,
  });
  const field = new THREE.Mesh(fieldGeometry, fieldMaterial);
  field.name = 'toroidal-light-field';
  field.renderOrder = 2;
  avatar.add(field);
  const lightGeometry = new THREE.BufferGeometry();
  const lightPositions = new Float32Array(23 * 3);
  const lightColors = new Float32Array(23 * 3);
  const lightSizes = new Float32Array(23);
  const chakraColors = [0xb994ff, 0x7678ff, 0x7dd8ff, 0x8be4b2, 0xffe79c, 0xffb895, 0xff91ad];
  for (let i = 0; i < 23; i++) {
    const chakra = Math.max(0, Math.floor((i - 2) / 3));
    // Broad tinted penumbras remain visible on white; their small white
    // cores still read as light rather than opaque coloured beads.
    const color = new THREE.Color(i === 0 ? 0xb6a1ff : i === 1 ? 0xffffff : chakraColors[chakra]);
    color.toArray(lightColors, i * 3);
    lightSizes[i] = i === 0 ? 0.95 : i === 1 ? 0.21 : (i - 2) % 3 === 0 ? 0.25 * (1 - chakra * 0.045) : 0.075;
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
        vColor = color; vStrength = clamp((position.y + 1.2) * 0.32 + 0.36, 0.42, 1.0);
        gl_PointSize = clamp(aSize * uHeight / -p.z, 2.0, 180.0);
        gl_Position = projectionMatrix * p;
      }
    `,
    fragmentShader: `
      uniform float uOpacity; varying vec3 vColor; varying float vStrength;
      void main() {
        float r = length(gl_PointCoord - 0.5) * 2.0;
        float feather = 1.0 - smoothstep(0.72, 1.0, r);
        float halo = exp(-r * r * 3.4) * feather;
        float innerGlow = exp(-r * r * 8.0) * feather;
        float core = exp(-r * r * 45.0);
        vec3 chroma = min(vColor * vec3(0.66, 0.65, 0.86), vec3(0.90));
        vec3 color = mix(chroma, vec3(1.0), core * 0.92);
        gl_FragColor = vec4(color, (halo * 0.50 + innerGlow * 0.30 + core * 0.45) * vStrength * uOpacity);
      }
    `,
  });
  const lights = new THREE.Points(lightGeometry, lightMaterial);
  lights.frustumCulled = false;
  lights.name = 'chakra-lights';
  lights.renderOrder = 3;
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
      avatar.scale.setScalar(compactLandscape ? 0.44 : portrait ? 0.36 : 0.68);
      // Nearer than the pyramid: we look over the traveller's energy field
      // from the front-right foreground toward the distant guide.
      avatar.position.set(compactLandscape ? -0.62 : portrait ? 0.30 : 1.0,
        compactLandscape ? 0.16 : portrait ? 0.43 : -0.22,
        compactLandscape ? 1.2 : portrait ? 1.25 : 1.55);
      avatar.rotation.set(0, 0, 0);
      lightUniforms.uHeight.value = height;
    },
    update(time: number, opacity: number, reducedMotion: boolean, avatarTurn = 0) {
      uniforms.uTime.value = reducedMotion ? 0 : time;
      uniforms.uOpacity.value = opacity;
      guide.position.y = (compactLandscape ? 0.35 : 0.78)
        + (reducedMotion ? 0 : Math.sin(time * 0.68) * 0.065);
      guide.rotation.set(0.06, reducedMotion ? 0.35 : 0.35 + time * 0.045, 0.0);
      auraUniforms.uOpacity.value = opacity;
      auraUniforms.uTurn.value = avatarTurn;
      fieldUniforms.uOpacity.value = opacity;
      fieldUniforms.uTime.value = reducedMotion ? 0 : time;
      avatar.rotation.set(0, avatarTurn + (reducedMotion ? 0.26 : 0.26 + time * 0.027), 0);
      lightUniforms.uOpacity.value = opacity;
      lightPositions.set([0, 0.99, 0, 0, 0.99, 0]);
      for (let i = 0; i < 7; i++) {
        const y = 0.79 - i * 0.255;
        const phase = avatarTurn * 0.18 + i * 0.44;
        const radius = 0.18 + Math.sin(i * 0.5) * 0.045;
        const index = (2 + i * 3) * 3;
        lightPositions.set([0, y, 0], index);
        lightPositions.set([Math.cos(phase) * radius, y + Math.sin(phase) * 0.055, Math.sin(phase) * radius], index + 3);
        lightPositions.set([-Math.cos(phase) * radius, y - Math.sin(phase) * 0.055, -Math.sin(phase) * radius], index + 6);
      }
      lightGeometry.attributes.position.needsUpdate = true;
    },
    dispose() {
      geometry.dispose(); material.dispose(); auraGeometry.dispose(); auraMaterial.dispose();
      fieldGeometry.dispose(); fieldMaterial.dispose();
      lightGeometry.dispose(); lightMaterial.dispose();
    },
  };
}

// Screen-space volumetric impression: six soft noise samples, no extra
// raymarch, texture downloads, postprocessing or particle allocations.
export const cloudRealmShader = /* glsl */ `
  vec3 cloudRealm(vec2 p) {
    float t = uAltBeat * 0.022 * uMotion;
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
    // Two broad low-frequency ribbons drift along the ground; no particle
    // layer, raymarch, or additional render pass is needed for the mist.
    float drift = uAltBeat * 0.013 * uMotion;
    float groundNoise = noise2(vec2(p.x * 1.25 - drift, p.y * 3.0 + drift * 0.17));
    float nearNoise = noise2(vec2(p.x * 0.73 + drift * 0.42, p.y * 4.4 - drift * 0.1));
    float farRibbon = exp(-pow((p.y + 0.40 + groundNoise * 0.18) / 0.15, 2.0));
    float nearRibbon = exp(-pow((p.y + 0.75 + nearNoise * 0.16) / 0.21, 2.0));
    float mist = clamp(farRibbon * 0.34 + nearRibbon * 0.43, 0.0, 0.65);
    color -= vec3(0.025, 0.026, 0.012) * mist;
    color = mix(color, vec3(0.993, 0.987, 1.0), mist * (0.4 + groundNoise * 0.35));
    // A faint pool of shadow gives the floating guide a position in space.
    float shadow = exp(-dot((p - vec2(0.0, -0.15)) * vec2(3.2, 18.0),
      (p - vec2(0.0, -0.15)) * vec2(3.2, 18.0)));
    return clamp(color - vec3(0.05, 0.042, 0.028) * shadow, 0.0, 1.0);
  }
`;
