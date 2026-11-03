import * as THREE from 'three';

// The same reflected-camera / oblique-plane construction as Three's Reflector,
// scheduled explicitly so the lake can reuse a modest, throttled render target.
export function createPlanarReflection(water, { lowPower = false } = {}) {
  const longestSide = lowPower ? 384 : 768;
  const interval = 1 / (lowPower ? 24 : 30);
  const renderTarget = new THREE.WebGLRenderTarget(longestSide, longestSide, {
    type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    depthBuffer: true, stencilBuffer: false, samples: 0,
  });
  renderTarget.texture.name = 'still-lake-planar-reflection';
  renderTarget.texture.generateMipmaps = false;
  const camera = new THREE.PerspectiveCamera();
  const textureMatrix = new THREE.Matrix4();
  const plane = new THREE.Plane();
  const normal = new THREE.Vector3(0, 1, 0);
  const waterPosition = new THREE.Vector3();
  const eye = new THREE.Vector3(), view = new THREE.Vector3(), look = new THREE.Vector3(), target = new THREE.Vector3();
  const rotation = new THREE.Matrix4(), clip = new THREE.Vector4(), q = new THREE.Vector4();
  const oldViewport = new THREE.Vector4();
  const drawingBufferSize = new THREE.Vector2();
  const pointUniforms = [];
  let pointScene = null;
  let lastTime = -Infinity, hasFrame = false, rendering = false, disposed = false, sized = false;

  function resize(width, height) {
    const aspect = Math.max(.1, Number(width) || 1) / Math.max(.1, Number(height) || 1);
    const w = Math.max(1, Math.round(aspect >= 1 ? longestSide : longestSide * aspect));
    const h = Math.max(1, Math.round(aspect >= 1 ? longestSide / aspect : longestSide));
    if (renderTarget.width !== w || renderTarget.height !== h) {
      renderTarget.setSize(w, h); hasFrame = false; lastTime = -Infinity;
    }
    sized = true;
  }

  return {
    texture: renderTarget.texture, textureMatrix,
    get ready() { return hasFrame; },
    resize,
    render(renderer, scene, sourceCamera, time) {
      if (disposed || rendering || (hasFrame && time >= lastTime && time - lastTime < interval)) return false;
      if (!sized) resize(sourceCamera.aspect, 1);
      scene.updateMatrixWorld(); sourceCamera.updateMatrixWorld();
      waterPosition.setFromMatrixPosition(water.matrixWorld);
      eye.setFromMatrixPosition(sourceCamera.matrixWorld);
      // The water is horizontal. Looking from below it needs no reflected pass.
      if (eye.y <= waterPosition.y + .001) return false;
      view.subVectors(waterPosition, eye).reflect(normal).negate().add(waterPosition);
      rotation.extractRotation(sourceCamera.matrixWorld);
      look.set(0, 0, -1).applyMatrix4(rotation).add(eye);
      target.subVectors(waterPosition, look).reflect(normal).negate().add(waterPosition);
      camera.position.copy(view);
      camera.up.set(0, 1, 0).applyMatrix4(rotation).reflect(normal);
      camera.lookAt(target);
      camera.near = sourceCamera.near; camera.far = sourceCamera.far; camera.aspect = sourceCamera.aspect;
      camera.updateMatrixWorld();
      camera.projectionMatrix.copy(sourceCamera.projectionMatrix);
      textureMatrix.set(.5, 0, 0, .5, 0, .5, 0, .5, 0, 0, .5, .5, 0, 0, 0, 1)
        .multiply(camera.projectionMatrix).multiply(camera.matrixWorldInverse);

      // Clip away everything below the actual water plane without adding a
      // clipping variant to every sculpture, particle, and avatar material.
      plane.setFromNormalAndCoplanarPoint(normal, waterPosition).applyMatrix4(camera.matrixWorldInverse);
      clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
      const projection = camera.projectionMatrix.elements;
      q.set((Math.sign(clip.x) + projection[8]) / projection[0],
        (Math.sign(clip.y) + projection[9]) / projection[5], -1, (1 + projection[10]) / projection[14]);
      clip.multiplyScalar(2 / clip.dot(q));
      projection[2] = clip.x; projection[6] = clip.y;
      projection[10] = clip.z + 1 - .002; projection[14] = clip.w;
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();

      const previousTarget = renderer.getRenderTarget();
      if (renderer.getCurrentViewport) renderer.getCurrentViewport(oldViewport);
      else renderer.getViewport(oldViewport);
      const previousScissorTest = renderer.getScissorTest();
      const previousAutoClear = renderer.autoClear;
      const previousXr = renderer.xr.enabled;
      const previousShadow = renderer.shadowMap.autoUpdate;
      const previousVisible = water.visible;
      if (pointScene !== scene) {
        pointScene = scene; pointUniforms.length = 0;
        const seen = new Set();
        scene.traverse(object => {
          if (!object.isPoints) return;
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          for (const material of materials) for (const key of ['uSize', 'uHeight']) {
            const uniform = material.uniforms?.[key];
            if (uniform && typeof uniform.value === 'number' && !seen.has(uniform)) {
              seen.add(uniform); pointUniforms.push({ uniform, original: uniform.value });
            }
          }
        });
      }
      renderer.getDrawingBufferSize(drawingBufferSize);
      const pointScale = renderTarget.height / Math.max(1, drawingBufferSize.y);
      rendering = true; water.visible = false;
      try {
        for (const point of pointUniforms) { point.original = point.uniform.value; point.uniform.value *= pointScale; }
        renderer.xr.enabled = false; renderer.shadowMap.autoUpdate = false; renderer.autoClear = true;
        renderer.setRenderTarget(renderTarget);
        // setRenderTarget selects its physical-pixel viewport. setViewport here
        // would multiply it by the canvas DPR and crop high-DPI reflections.
        renderer.setScissorTest(false);
        renderer.state.buffers.depth.setMask(true);
        renderer.render(scene, camera);
        hasFrame = true; lastTime = time;
      } finally {
        for (const point of pointUniforms) point.uniform.value = point.original;
        renderer.setRenderTarget(previousTarget);
        renderer.state.viewport?.(oldViewport);
        renderer.setScissorTest(previousScissorTest);
        renderer.autoClear = previousAutoClear; renderer.xr.enabled = previousXr;
        renderer.shadowMap.autoUpdate = previousShadow; water.visible = previousVisible; rendering = false;
      }
      return true;
    },
    dispose() { if (!disposed) { disposed = true; renderTarget.dispose(); pointUniforms.length = 0; pointScene = null; } },
  };
}
