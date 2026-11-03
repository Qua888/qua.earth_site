# The chromatic lake

An interactive QUA listening-room experiment, separate from Happier Earth.
No audio is loaded or played in this room yet.

Build with `npm run build:lake`; output lives in `original/particle-lake/`.
Run the numerical scene checks with `node lake-source/scene.test.mjs`.

WASD/arrow keys move the light avatar; E/Space rises and Q/C descends.
Releasing the height control leaves the avatar hovering. Dragging looks around,
and the wheel changes camera distance. Touch devices use the left movement
pad, right up/down buttons, and drag elsewhere to look. The visible pointer ray stirs each toroidal particle field and the surrounding
particle ring. Ordered meridian streams rise through a narrow central channel,
fan over the poles, and circulate back around the outside; pointer distortions
are stored as material-space edits attached to each particle. They keep
circulating without fading or resetting to the plain torus until the pointer
reshapes them again. The outer ring likewise retains its carved radius/height
patterns while rotating. Untouched particles follow the original toroidal
baseline.

Three bubble centres use a fixed 120 Hz simulation, gentle elastic contacts,
and full-radius containment inside the ring. Baseline speeds are about
0.55–0.65 m/s, with soft elastic balloon-like collisions and bounded recoil. Approaching or touching a bubble
with the avatar produces a soft, speed-limited nudge. The avatar is never
blocked or displaced by bubble physics, so flying inside remains possible. Particle recurrence preserves the
accelerating rotation and pointer-carved patterns from `original/track2.html`.
The existing page has a 1.2× pointer-force multiplier and a direct lake link.

The lake keeps nearly still iridescent water, local ripple slots, and continuous
cloud mapping. There is one scene render per frame: no reflection capture,
render target, mirror texture, reflected objects, or second scene pass.
Mobile devices use smaller particle and geometry budgets. No postprocessing
is used.

Tunable bounds in `particles.js`: `DRIFT_SPEED` (0.65 m/s),
`CONTACT_SPEED_LIMIT` (1.45 m/s), and the material-displacement cap (0.64 of
each particle's home radius). The cap limits repeated edits without relaxing
existing formations. Fast baseline poloidal spin remains 5.8→22 rad/s.
