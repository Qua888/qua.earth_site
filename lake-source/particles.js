import * as THREE from 'three';

export const PARTICLE_SPHERES = Object.freeze([
  Object.freeze({ x: -8.2, y: 4.1, z: -2.5, radius: 3.39 }),
  Object.freeze({ x: 0, y: 5.4, z: -9.2, radius: 3.69 }),
  Object.freeze({ x: 8.2, y: 4.1, z: -2.5, radius: 3.39 }),
]);

const STEP = 1 / 120;
const POINTER_GAIN = 1.2;
const TAU = Math.PI * 2;
const BUBBLE_BOUNDARY = 13.1;

function constrainBubble(center, velocity) {
  const dx = center.x, dz = center.z + 5;
  const radial = Math.max(0.0001, Math.hypot(dx, dz));
  const limit = BUBBLE_BOUNDARY - center.w - 0.001;
  if (radial > limit) {
    const nx = dx / radial, nz = dz / radial;
    center.x = nx * limit;
    center.z = -5 + nz * limit;
    const outward = velocity.x * nx + velocity.z * nz;
    if (outward > 0) {
      velocity.x -= nx * outward * 1.96;
      velocity.z -= nz * outward * 1.96;
    }
  }
  const floor = center.w + 0.45, ceiling = center.w + 3.2;
  if (center.y < floor) { center.y = floor; if (velocity.y < 0) velocity.y *= -0.8; }
  if (center.y > ceiling) { center.y = ceiling; if (velocity.y > 0) velocity.y *= -0.8; }
}

function driftBubbles(centers, velocities, dt, age) {
  for (let i = 0; i < centers.length; i++) {
    const center = centers[i], velocity = velocities[i];
    const hoverHeight = PARTICLE_SPHERES[i].y + Math.sin(age * 0.18 + i * 1.7) * 0.24;
    velocity.y += ((hoverHeight - center.y) * 0.025 - velocity.y * 0.04) * dt;
    const speed = Math.hypot(velocity.x, velocity.y, velocity.z);
    if (speed > 0.42) velocity.multiplyScalar(0.42 / speed);
    center.x += velocity.x * dt;
    center.y += velocity.y * dt;
    center.z += velocity.z * dt;
  }
  // Soft contact first, then a tiny penetration correction. Fixed steps and
  // approach-only impulses prevent grazing contacts from chattering.
  for (let pass = 0; pass < 4; pass++) {
    for (let i = 0; i < centers.length; i++) {
      for (let j = i + 1; j < centers.length; j++) {
        const a = centers[i], b = centers[j], va = velocities[i], vb = velocities[j];
        let dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
        let distance = Math.hypot(dx, dy, dz);
        if (distance < 0.0001) { dx = 1; dy = 0; dz = 0; distance = 1; }
        const separation = a.w + b.w + 0.035;
        if (distance >= separation + 0.14) continue;
        const nx = dx / distance, ny = dy / distance, nz = dz / distance;
        const inverseA = 1 / (a.w * a.w * a.w);
        const inverseB = 1 / (b.w * b.w * b.w);
        const totalInverse = inverseA + inverseB;
        if (pass === 0) {
          const cushion = Math.max(0, separation + 0.14 - distance) * 1.1 * dt;
          va.x -= nx * cushion; va.y -= ny * cushion; va.z -= nz * cushion;
          vb.x += nx * cushion; vb.y += ny * cushion; vb.z += nz * cushion;
          const approaching = (vb.x - va.x) * nx + (vb.y - va.y) * ny + (vb.z - va.z) * nz;
          if (distance < separation && approaching < 0) {
            const impulse = -approaching * 1.96 / totalInverse;
            va.x -= nx * impulse * inverseA; va.y -= ny * impulse * inverseA; va.z -= nz * impulse * inverseA;
            vb.x += nx * impulse * inverseB; vb.y += ny * impulse * inverseB; vb.z += nz * impulse * inverseB;
          }
        }
        if (distance < separation) {
          const correction = (separation - distance) / totalInverse;
          a.x -= nx * correction * inverseA; a.y -= ny * correction * inverseA; a.z -= nz * correction * inverseA;
          b.x += nx * correction * inverseB; b.y += ny * correction * inverseB; b.z += nz * correction * inverseB;
        }
      }
    }
    for (let i = 0; i < centers.length; i++) constrainBubble(centers[i], velocities[i]);
  }
}

const pointVertex = /* glsl */ `
  attribute vec3 aColor;
  attribute float aSize;
  attribute float aAlpha;
  uniform float uTime;
  uniform float uEnergy;
  uniform float uSize;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec4 eye = modelViewMatrix * vec4(position, 1.0);
    float shimmer = 0.92 + 0.08 * sin(uTime * 0.8 + aColor.r * 19.0 + aSize * 11.0);
    vColor = aColor * (shimmer + uEnergy * 0.35);
    vAlpha = aAlpha;
    gl_PointSize = clamp(aSize * uSize / max(1.0, -eye.z), 1.1, 6.0);
    gl_Position = projectionMatrix * eye;
  }
`;
const pointFragment = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float r2 = dot(p, p);
    if (r2 > 1.0) discard;
    float core = exp(-r2 * 9.0);
    float halo = exp(-r2 * 3.2) * 0.16;
    float alpha = (core * 0.93 + halo) * vAlpha;
    if (alpha < 0.012) discard;
    vec3 light = mix(vColor, vec3(1.32), core * 0.85);
    gl_FragColor = vec4(light, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;
const shellVertex = /* glsl */ `
  uniform float uTime;
  uniform float uPhase;
  uniform float uEnergy;
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec3 vLocal;
  void main() {
    vLocal = position;
    float breathe = sin(position.y * 4.0 + uTime * 0.18 + uPhase)
      * sin(position.x * 3.0 - uTime * 0.13) * 0.035;
    vec3 p = position * (1.0 + breathe + uEnergy * 0.025);
    vec4 eye = modelViewMatrix * vec4(p, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vView = -eye.xyz;
    gl_Position = projectionMatrix * eye;
  }
`;
const shellFragment = /* glsl */ `
  uniform float uTime;
  uniform float uPhase;
  uniform float uEnergy;
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec3 vLocal;
  void main() {
    vec3 n = normalize(vNormal);
    float rim = pow(1.0 - abs(dot(n, normalize(vView))), 2.0);
    float folded = sin(vLocal.y * 5.0 + vLocal.x * 2.5 + uTime * 0.16 + uPhase);
    float curl = sin(vLocal.z * 6.0 - vLocal.y * 3.0 + uTime * 0.12);
    vec3 pearl = 0.5 + 0.5 * cos(vec3(0.0, 2.1, 4.2) + n.y * 4.0 + n.x * 2.0 + uPhase);
    vec3 purple = mix(vec3(0.04, 0.012, 0.16), vec3(0.24, 0.018, 0.24), folded * 0.5 + 0.5);
    vec3 color = purple + pearl * rim * 0.22;
    color += vec3(0.06, 0.018, 0.09) * pow(abs(folded * curl), 3.0);
    color += vec3(0.12, 0.20, 0.24) * uEnergy * rim;
    gl_FragColor = vec4(color, 0.07 + rim * 0.21);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function makeRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    return (value >>> 0) / 4294967296;
  };
}

function makeField(count, isRing, index, lowPower) {
  const random = makeRandom(1741 + index * 1097);
  const position = new Float32Array(count * 3);
  // Three rendered samples cover a real fifty-millisecond dotted arc.
  // A small fixed ring buffer keeps its length independent of display Hz.
  const history = new Float32Array(count * 3 * 9);
  const display = new Float32Array(count * 9);
  const colors = new Float32Array(count * 9);
  const sizes = new Float32Array(count * 3);
  const alphas = new Float32Array(count * 3);
  const home = new Float32Array(count);
  const height = new Float32Array(count);
  const phases = new Float32Array(count);
  const sphereRadius = isRing ? 13.5 : PARTICLE_SPHERES[index].radius;
  const physicalScale = isRing ? 13.5 / 6.9 : sphereRadius / 1.13;
  const tilt = 0.15;
  const ct = Math.cos(tilt), st = Math.sin(tilt);
  for (let i = 0; i < count; i++) {
    const o = i * 3;
    const theta = i * Math.PI * (3 - Math.sqrt(5));
    phases[i] = random() * TAU;
    if (isRing) {
      const angle = random() * TAU;
      const tubeAngle = random() * TAU;
      const tube = Math.sqrt(random()) * 0.35 * physicalScale;
      const radius = sphereRadius + Math.cos(tubeAngle) * tube;
      const py = Math.sin(tubeAngle) * tube;
      const pz = Math.sin(angle) * radius;
      position[o] = Math.cos(angle) * radius;
      position[o + 1] = py * ct + pz * st;
      position[o + 2] = pz * ct - py * st;
      home[i] = radius;
      height[i] = py;
    } else {
      const y = 1 - 2 * (i + 0.5) / count;
      const radial = Math.sqrt(Math.max(0, 1 - y * y));
      const radius = sphereRadius * (0.91 + random() * 0.14);
      position[o] = Math.cos(theta) * radial * radius;
      position[o + 1] = y * radius;
      position[o + 2] = Math.sin(theta) * radial * radius;
      home[i] = radius;
    }
    const tint = random();
    const red = 0.94 + tint * 0.06;
    const green = 0.94 + Math.sin(tint * Math.PI) * 0.06;
    const blue = 0.98 + random() * 0.02;
    const size = (isRing ? 0.85 : 1.0) * (0.8 + random() * 0.8);
    for (let tail = 0; tail < 3; tail++) {
      const target = i * 9 + tail * 3;
      colors[target] = red;
      colors[target + 1] = green;
      colors[target + 2] = blue;
      sizes[i * 3 + tail] = size * (1 - tail * 0.13);
      alphas[i * 3 + tail] = tail === 0 ? 1.0 : tail === 1 ? 0.72 : 0.40;
    }
  }
  for (let sample = 0; sample < 9; sample++) history.set(position, sample * count * 3);
  const geometry = new THREE.BufferGeometry();
  const positionAttribute = new THREE.BufferAttribute(display, 3).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', positionAttribute);
  geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1));
  const uniforms = {
    uTime: { value: 0 }, uEnergy: { value: 0 }, uSize: { value: lowPower ? 46 : 58 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms, vertexShader: pointVertex, fragmentShader: pointFragment,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geometry, material);
  points.name = isRing ? 'outer-particle-torus' : `reactive-sphere-${index + 1}`;
  points.frustumCulled = false;
  points.renderOrder = 2;
  if (isRing) points.position.set(0, 4.0, -5.0);
  else {
    const center = PARTICLE_SPHERES[index];
    points.position.set(center.x, center.y, center.z);
  }
  return {
    count, isRing, index, position, history, historyCursor: 0, display, home, height, phases,
    geometry, positionAttribute, material, points, uniforms, ct, st, physicalScale,
  };
}

function publishPositions(field) {
  const { position, history, display, count } = field;
  const previousOffset = ((field.historyCursor + 9 - 2) % 9) * count * 3;
  const olderOffset = ((field.historyCursor + 9 - 5) % 9) * count * 3;
  for (let i = 0; i < count; i++) {
    const source = i * 3, target = i * 9;
    display[target] = position[source];
    display[target + 1] = position[source + 1];
    display[target + 2] = position[source + 2];
    display[target + 3] = history[previousOffset + source];
    display[target + 4] = history[previousOffset + source + 1];
    display[target + 5] = history[previousOffset + source + 2];
    display[target + 6] = history[olderOffset + source];
    display[target + 7] = history[olderOffset + source + 1];
    display[target + 8] = history[olderOffset + source + 2];
  }
  field.positionAttribute.needsUpdate = true;
}

// Hover repulsion is evaluated against the visible cursor ray, so looking
// around, moving, and hovering all continue to stir the same physical field.
function simulate(field, dt, age, ray, active, reducedMotion) {
  const { position, count, points, isRing, ct, st } = field;
  field.historyCursor = (field.historyCursor + 1) % 9;
  field.history.set(position, field.historyCursor * count * 3);
  const spin = reducedMotion ? 0 : isRing ? 0.42 : 5.8 + 16.2 * (1 - Math.exp(-age * 0.12));
  const handedness = isRing || field.index !== 1 ? 1 : -1;
  const angle = spin * dt * handedness;
  const ca = Math.cos(angle), sa = Math.sin(angle);
  const smallAngle = isRing || reducedMotion ? 0 : angle * 0.21;
  const cb = Math.cos(smallAngle), sb = Math.sin(smallAngle);
  const hasRay = active && ray && ray.origin && ray.direction;
  const rox = hasRay ? ray.origin.x - points.position.x : 0;
  const roy = hasRay ? ray.origin.y - points.position.y : 0;
  const roz = hasRay ? ray.origin.z - points.position.z : 0;
  const rdx = hasRay ? ray.direction.x : 0;
  const rdy = hasRay ? ray.direction.y : 0;
  const rdz = hasRay ? ray.direction.z : -1;
  const influence = (isRing ? 1.15 : 1.12) * field.physicalScale;
  const influenceSquared = influence * influence;
  const push = (isRing ? 3.5 : 5.0) * field.physicalScale * POINTER_GAIN * dt * (reducedMotion ? 0.55 : 1);
  const restore = 1 - Math.exp(-(isRing ? 0.9 : 0.72) * dt);
  for (let i = 0; i < count; i++) {
    const o = i * 3;
    let x = position[o], y = position[o + 1], z = position[o + 2];
    if (isRing) {
      const planarZ = y * st + z * ct;
      const perpendicular = y * ct - z * st;
      const nx = x * ca - planarZ * sa;
      const nz = x * sa + planarZ * ca;
      x = nx; y = perpendicular * ct + nz * st; z = nz * ct - perpendicular * st;
    } else {
      const nx = x * ca - y * sa;
      const ny = x * sa + y * ca;
      x = nx * cb + z * sb;
      y = ny;
      z = -nx * sb + z * cb;
    }
    if (hasRay) {
      const vx = x - rox, vy = y - roy, vz = z - roz;
      const along = vx * rdx + vy * rdy + vz * rdz;
      const dx = vx - along * rdx, dy = vy - along * rdy, dz = vz - along * rdz;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (along > 0 && d2 < influenceSquared) {
        const distance = Math.sqrt(Math.max(d2, 0.0001));
        const f = 1 - distance / influence;
        const strength = push * f * f * (0.86 + Math.sin(field.phases[i]) * 0.14) / distance;
        const curl = isRing ? 0.55 : 0.95;
        let fx = dx + (rdy * dz - rdz * dy) * curl;
        let fy = dy + (rdz * dx - rdx * dz) * curl;
        let fz = dz + (rdx * dy - rdy * dx) * curl;
        if (!isRing) {
          // Slide along the sphere to gather bright curved rims/rosettes,
          // rather than simply inflating all points away from its surface.
          const inverseRadius = 1 / Math.max(0.001, Math.hypot(x, y, z));
          const nx = x * inverseRadius, ny = y * inverseRadius, nz = z * inverseRadius;
          const outward = (fx * nx + fy * ny + fz * nz) * 0.94;
          fx -= nx * outward; fy -= ny * outward; fz -= nz * outward;
        }
        x += fx * strength;
        y += fy * strength;
        z += fz * strength;
      }
    }
    if (isRing) {
      let planarZ = y * st + z * ct;
      let perpendicular = y * ct - z * st;
      const radius = Math.max(0.001, Math.hypot(x, planarZ));
      const targetRadius = field.home[i];
      const nextRadius = Math.max(5.5 * field.physicalScale,
        Math.min(8.6 * field.physicalScale, radius + (targetRadius - radius) * restore));
      const factor = nextRadius / radius;
      x *= factor; planarZ *= factor;
      perpendicular += (field.height[i] - perpendicular) * restore;
      perpendicular = Math.max(-1.3 * field.physicalScale, Math.min(1.3 * field.physicalScale, perpendicular));
      y = perpendicular * ct + planarZ * st;
      z = planarZ * ct - perpendicular * st;
    } else {
      const radius = Math.max(0.001, Math.hypot(x, y, z));
      const nextRadius = Math.max(0.4 * field.physicalScale, Math.min(field.home[i] * 1.78,
        radius + (field.home[i] - radius) * restore));
      const factor = nextRadius / radius;
      x *= factor; y *= factor; z *= factor;
    }
    position[o] = x; position[o + 1] = y; position[o + 2] = z;
  }
}

export function createParticleWorld(scene, { lowPower = false } = {}) {
  const reducedMotion = typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const fields = [];
  const shells = [];
  // Live world positions: x/y/z are the drifting centre; w is its radius.
  // Stable Vector4 references let the water follow them without allocations.
  const centers = PARTICLE_SPHERES.map(sphere => new THREE.Vector4(sphere.x, sphere.y, sphere.z, sphere.radius));
  const velocities = [
    new THREE.Vector3(0.23, 0.012, -0.12),
    new THREE.Vector3(-0.20, -0.009, 0.21),
    new THREE.Vector3(-0.18, 0.010, -0.16),
  ];
  const shellGeometry = new THREE.SphereGeometry(1, lowPower ? 24 : 32, lowPower ? 16 : 24);
  for (let index = 0; index < 3; index++) {
    const field = makeField(lowPower ? 360 : 1050, false, index, lowPower);
    fields.push(field);
    publishPositions(field);
    scene.add(field.points);
    const center = PARTICLE_SPHERES[index];
    const uniforms = {
      uTime: { value: 0 }, uPhase: { value: index * 1.7 }, uEnergy: { value: 0 },
    };
    const material = new THREE.ShaderMaterial({
      uniforms, vertexShader: shellVertex, fragmentShader: shellFragment,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
    const shell = new THREE.Mesh(shellGeometry, material);
    shell.name = `liquid-orb-${index + 1}`;
    shell.scale.setScalar(center.radius * 0.98);
    shell.position.copy(field.points.position);
    shell.renderOrder = 1;
    scene.add(shell);
    shells.push({ mesh: shell, material, uniforms });
  }
  const ring = makeField(lowPower ? 300 : 500, true, 4, lowPower);
  fields.push(ring);
  publishPositions(ring);
  scene.add(ring.points);
  let age = 0;
  let accumulator = 0;
  let disposed = false;
  return {
    centers,
    update(time, delta, ray, active = true, audioEnergy = 0) {
      if (disposed) return;
      const frameDelta = Math.max(0, Math.min(0.05, Number.isFinite(delta) ? delta : 0));
      const energy = Math.max(0, Math.min(1, audioEnergy || 0));
      accumulator = Math.min(accumulator + frameDelta, STEP * 6);
      while (accumulator + 1e-9 >= STEP) {
        age += STEP;
        if (!reducedMotion) driftBubbles(centers, velocities, STEP, age);
        for (let index = 0; index < 3; index++) fields[index].points.position.copy(centers[index]);
        for (let index = 0; index < fields.length; index++) {
          simulate(fields[index], STEP, age, ray, active, reducedMotion);
        }
        accumulator -= STEP;
      }
      for (let index = 0; index < 3; index++) {
        shells[index].mesh.position.copy(fields[index].points.position);
        shells[index].uniforms.uTime.value = reducedMotion ? 0 : time;
        shells[index].uniforms.uEnergy.value = energy;
      }
      for (let index = 0; index < fields.length; index++) {
        const field = fields[index];
        field.uniforms.uTime.value = reducedMotion ? 0 : time;
        field.uniforms.uEnergy.value = energy;
        publishPositions(field);
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (let index = 0; index < fields.length; index++) {
        const field = fields[index];
        scene.remove(field.points);
        field.geometry.dispose();
        field.material.dispose();
      }
      for (let index = 0; index < shells.length; index++) {
        scene.remove(shells[index].mesh);
        shells[index].material.dispose();
      }
      shellGeometry.dispose();
    },
  };
}
