# The chromatic lake

An interactive QUA listening-room experiment, separate from Happier Earth.
No audio is loaded or played in this room yet.

Build with `npm run build:lake`; output lives in `original/particle-lake/`.
Run the numerical scene checks with `node lake-source/scene.test.mjs`.

WASD/arrow keys move the light avatar; E/Space rises and Q/C descends.
Releasing the height control leaves the avatar hovering. Dragging looks around,
and the wheel changes camera distance. Touch devices use the left movement
pad, right up/down buttons, and drag elsewhere to look. The visible pointer ray stirs each spherical particle field
and the surrounding particle ring.

Three bubble centres use a fixed 120 Hz simulation, gentle elastic contacts,
and full-radius containment inside the ring. Approaching or touching a bubble
with the avatar produces a soft, speed-limited nudge. Particle recurrence preserves the
accelerating rotation and pointer-carved patterns from `original/track2.html`.
The existing page has a 1.2× pointer-force multiplier and a direct lake link.

The lake uses nearly still water, fixed ripple slots, and continuous direction-
based cloud mapping. A small, throttled planar reflection target mirrors the
spheres, particles and traveller in the same WebGL context. Mobile devices use
smaller reflection, particle and geometry budgets. No postprocessing is used.
