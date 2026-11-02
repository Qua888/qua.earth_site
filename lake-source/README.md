# The chromatic lake

An interactive QUA listening-room experiment, separate from Happier Earth.
No audio is loaded or played in this room yet.

Build with `npm run build:lake`; output lives in `original/particle-lake/`.
Run the numerical scene checks with `node lake-source/scene.test.mjs`.

WASD/arrow keys move the light avatar, dragging looks around, and the wheel
changes camera distance. Touch devices use the left movement pad and drag
elsewhere to look. The visible pointer ray stirs each spherical particle field
and the surrounding particle ring.

Three bubble centres use a fixed 120 Hz simulation, gentle elastic contacts,
and full-radius containment inside the ring. Particle recurrence preserves the
accelerating rotation and pointer-carved patterns from `original/track2.html`.
The existing page has a 1.2× pointer-force multiplier and a direct lake link.

The lake uses one displaced water surface, fixed ripple slots, and a shared
procedural sky/reflection sampler. Mobile devices use smaller particle and
geometry budgets. No postprocessing or per-frame reflection capture is used.
