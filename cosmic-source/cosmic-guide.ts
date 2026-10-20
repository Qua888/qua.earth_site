import * as THREE from 'three';

export type GuideStage = 'hidden' | 'arrival' | 'wisdom' | 'question' | 'zero' | 'one';
export type GuideChoice = 0 | 1;
export const ASCENSION_START = 7.20;
export const ASCENSION_DURATION = 6.6;

export const GUIDE_DIALOGUE = {
  arrival: {
    eyebrow: 'BEYOND THE LAST STAR',
    title: 'Oh. You made it.',
    text: 'Welcome, traveller. Congratulations. Most people stop at the edge. You appear to have misplaced yours.',
    action: 'Where am I?',
  },
  wisdom: {
    eyebrow: 'THE KEEPER OF THE INTERVAL',
    title: 'A little cosmic wisdom.',
    text: 'I bestow upon you the wisdom of the cosmos: an ending is often a beginning wearing better lighting. One simple question will decide the direction of your journey.',
    action: 'Ask me.',
  },
  question: {
    eyebrow: 'TWO PATHS · NO WRONG ANSWER',
    title: 'Are you a zero, or a one?',
    text: 'The open circle, or the first step. Not what you are forever. Only where you wish to go next.',
    action: '',
  },
  zero: {
    eyebrow: '0 · THE OPEN CIRCLE',
    title: 'Nothing? How expansive of you.',
    text: 'Zero holds room for everything. Back to the beginning, then. You may find the black hole has been looking into you, too.',
    action: 'Begin again',
  },
  one: {
    eyebrow: '1 · THE FIRST STEP',
    title: 'One. A promising start.',
    text: 'Even infinity had to begin somewhere. Take your first step into the square. Try not to let its corners limit your thinking.',
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

  const shape = new THREE.Shape();
  shape.moveTo(0, 0.96);
  shape.lineTo(-0.83, -0.48);
  shape.lineTo(0.83, -0.48);
  shape.closePath();
  const hole = new THREE.Path();
  hole.moveTo(0, 0.64);
  hole.lineTo(0.55, -0.32);
  hole.lineTo(-0.55, -0.32);
  hole.closePath();
  shape.holes.push(hole);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.16, bevelEnabled: true, bevelSegments: 3,
    steps: 1, bevelSize: 0.045, bevelThickness: 0.045,
  });
  geometry.translate(0, 0, -0.08);
  const uniforms = { uTime: { value: 0 }, uOpacity: { value: 0 } };
  const material = new THREE.ShaderMaterial({
    uniforms, transparent: true,
    vertexShader: `
      varying vec3 vNormal; varying vec3 vPosition;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 p = modelViewMatrix * vec4(position, 1.0);
        vPosition = p.xyz;
        gl_Position = projectionMatrix * p;
      }
    `,
    fragmentShader: `
      uniform float uTime; uniform float uOpacity;
      varying vec3 vNormal; varying vec3 vPosition;
      void main() {
        vec3 n = normalize(vNormal);
        float facing = abs(dot(n, normalize(-vPosition)));
        float light = max(dot(n, normalize(vec3(-0.4, 0.8, 1.0))), 0.0);
        vec3 gold = mix(vec3(0.30, 0.12, 0.025), vec3(1.0, 0.79, 0.32), light);
        vec3 rainbow = 0.58 + 0.42 * cos(vec3(0.0, 2.1, 4.2)
          + n.y * 4.5 + n.x * 2.7 + uTime * 0.23);
        vec3 color = mix(gold, rainbow, 0.20 + pow(1.0 - facing, 1.8) * 0.42);
        float glint = pow(max(dot(n, normalize(vec3(-0.25, 0.5, 1.0))), 0.0), 65.0);
        color += vec3(1.0, 0.97, 0.87) * glint * 0.8;
        gl_FragColor = vec4(color, uOpacity);
      }
    `,
  });
  guide.add(new THREE.Mesh(geometry, material));
  const coreGeometry = new THREE.OctahedronGeometry(0.09, 0);
  const core = new THREE.Mesh(coreGeometry, material);
  core.position.y = 0.06;
  guide.add(core);
  let compactLandscape = false;

  return {
    scene, camera,
    resize(width: number, height: number) {
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
      compactLandscape = height <= 540 && width > height;
      guide.scale.setScalar(compactLandscape ? 0.65 : camera.aspect < 0.7 ? 0.74 : 1);
      guide.position.x = compactLandscape ? -1.6 : 0;
    },
    update(time: number, opacity: number, reducedMotion: boolean) {
      uniforms.uTime.value = time;
      uniforms.uOpacity.value = opacity;
      guide.position.y = (compactLandscape ? 0.05 : 0.62)
        + (reducedMotion ? 0 : Math.sin(time * 0.68) * 0.065);
      guide.rotation.set(-0.06, reducedMotion ? -0.22 : Math.sin(time * 0.24) * 0.32, 0.025);
      core.rotation.y = reducedMotion ? 0 : time * 0.5;
    },
    dispose() { geometry.dispose(); coreGeometry.dispose(); material.dispose(); },
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
