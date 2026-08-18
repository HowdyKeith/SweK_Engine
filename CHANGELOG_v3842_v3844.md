## v3844 -- THE COCKPIT'S HIT VFX PORTED TO THE 3D FIGHT, AND THE PER-FRAME DRAG LEFT BEHIND

Keith asked for cockpit.html's particle effect on the 3D dogfight. The spray is the easy half; the part worth
taking is the RULE UNDER IT. cockpit's hit() absorbs damage into shields first and then picks the burst from the
shield state AFTER absorption -- shields still up gives 6 cyan sparks, shields gone gives 12 red, and a kill adds
40 amber ON TOP of the second rather than replacing it. So the shot that BREAKS a shield already throws hull-
coloured debris, and a killing blow throws two bursts. es-box3d-fly3d already runs the same damage model
(ev/combat.js applyDamage: shield absorbs, overflow hits armour, dead at armour <= 0), so the rule maps onto it
without being invented.

THE PURE HALF. render/hitBurst.js: burstsFor (which tiers a hit throws), spawnBurst (a burst as a pure function of
its seed), stepBurst (integrate and retire), fadeOf and packPoints (fill a points buffer, colour already
multiplied by the fade). No Three, no GL, no DOM, no Math.random.

TWO THINGS DELIBERATELY NOT COPIED, AND THE SECOND IS A DEFECT IN THE SOURCE. (1) Math.random: a burst is a pure
function of its seed here, off the tree's one integer hash (render/nebulaSkybox.js's, already shared by the
skybox, star, planet and greeble), so the same hit throws the same debris and a gate can hold it still. (2) THE
PER-FRAME DRAG. cockpit does `q.vx *= 0.94` ONCE PER FRAME, so its spray reaches further on a faster machine --
the decay is per frame, not per second. Here drag is exponential in TIME and the position is its analytic integral
(x += v*(1-e^-kdt)/k), which composes exactly: ONE STEP OF 0.1 s EQUALS TEN OF 0.01 s TO 3.3e-16, and a hundred of
0.001 s to the same. Restoring cockpit's own per-frame form as a plant fires four checks.

WHY NOT render/particleSystem.js, WHICH ALREADY EXISTS: that pool is raw WebGL -- it takes a `gl` context and owns
its own instanced-billboard draw -- and its ImpactBurstEmitter is wired to the voxel eventBus. es-box3d-fly3d is a
Three scene that already draws its shots as a Points cloud. Sharing a GL context between the two draw paths is not
reuse, it is a state fight. So hitBurst.js owns ARITHMETIC ONLY and the page packs the result into a Points buffer.

GATED in render/hitBurst-selfcheck.mjs, 37 checks, and the first one is the port itself: COCKPIT'S OWN hit() IS
TRANSCRIBED INTO THE GATE and swept against burstsFor over all 3600 shield/armour/damage combinations. If the port
drifts, that says so -- not somebody's memory of what the 2D page did. Also pinned: the shield-emptying shot is
already a hull burst; a kill throws two bursts, hull first; the counts are the source's 6/12/40; the burst has no
favoured direction and its polar fraction is the sphere's own 0.10 (a cube-normalised sampler gives 0.07, and that
is a plant); speeds and lives stay inside their declared bands; inherit 0 reproduces cockpit exactly; the pool
never exceeds its cap and drops the OLDEST first; stepping retires the expired without disturbing the survivors;
packPoints stops at the buffer's edge. Five plants fire, tree restored each: read the tier from the shield BEFORE
absorption; let a kill REPLACE the hull burst; restore the per-frame drag; normalise directions from a uniform
cube; drop the pool cap.

ONE ADDITION OVER THE SOURCE, NAMED AS ONE: debris carries 35 percent of the victim's velocity. cockpit does not
(its ships are slow and its space is 2D); at this scene's speeds a burst that ignores the ship's motion visibly
hangs in the air behind it. inherit 0 is cockpit's behaviour exactly, and the gate pins that.

FRONT DOOR: es-box3d-fly3d, a Hit FX button. The burst is spawned at the SHOT's position -- the impact point, not
the ship's centre -- and drawn as ONE Points draw over a 900-particle pool with per-particle size. Mock run at the
scene's own scale (S = 0.01579): a Raider taking 26-damage hits reads shield, shield, shield, hull, hull,
hull+kill -- exactly cockpit's cadence; 40 simultaneous kills fill the pool to its 900 cap; all debris retires
1.30 s after the last hit.

NOT CHECKED, AND NO HEADLESS CHECK CAN: whether it LOOKS right -- spark size, how bright additive blending reads
against the nebula, whether 900 is too many or too few in a real brawl. Keith's first hard-reload; no GPU here.

A PAIRED EDIT NAMED HERE FOR frozenReferee: render/hitBurst-selfcheck.mjs grades and imports its new subject
render/hitBurst.js. The gate imports nothing else; nebulaSkybox.js did not change. es-box3d-fly3d.html changed
only to wire the front door.

CARRIED REDS: the same four measured byte-identical against pristine v3841 in v3842 (gateQuality, gateReach,
registryOrphans, pageReach), unchanged again here. No device added. gate count 1092 -> 1093 (hitBurst-selfcheck).
## v3843 -- LONG SILENCE: GREEBLING AS AN EXACT PARTITION, AND SOMETHING TO FLY PAST

The rest of Keith's element audit: greebling, and asteroids/stations/structures -- the three that were genuinely
absent (parallaxOcclusion.js mentions "greebles" once, in a comment, as an example use for parallax mapping; that
was the whole of it). The scene had a star, a sky and a planet and NOTHING AT SHIP SCALE. Both new modules are
built out of parts already here rather than new ones.

GREEBLING, AND THE PROPERTY WORTH HAVING. render/greeble.js splits a face recursively into panels and extrudes
them on quantised tiers. THE CLAIM IS NOT THAT IT LOOKS LIKE MACHINERY -- nothing headless can say that. The
claim is that the panels PARTITION the face: areas sum to the parent's, no two overlap, none escapes. That is
exactly what separates greebling from scattering, and on a hull a gap is a hole and a double-cover is z-fighting.
It always cuts the LONGER side (so panels cannot become slivers -- worst measured aspect 5.4 over 400 greebles,
against 50.0 when the axis is fixed), refuses a cut that would breach minSize rather than shaving it, and is
STATELESS: every decision is a hash of the panel's own path through the recursion, so depth and tone are a
function of the panel alone and no traversal order enters the result. The hash is nebulaSkybox's -- the tree's one
integer hash, now shared by the skybox, the star, the planet and the greeble, rather than a fourth PRNG.

ASTEROIDS AND STATIONS. world/spaceStructures.js: an icosphere displaced by world/procPlanet.js's OWN fbm3 (the
planet's terrain noise, at asteroid frequencies) with a per-body axis squash; and stations as hull modules strung
along a spine, each wearing greeble plates. TWO PROPERTIES PINNED, AND THEY ARE THE TWO THAT ACTUALLY BREAK:
(1) AN ASTEROID IS A CLOSED SOLID -- every edge shared by exactly two triangles, V - E + F = 2, and the SIGNED
VOLUME POSITIVE, so the winding is consistent and outward. A displaced sphere loses this silently if the seam
vertices are not shared, and it is invisible until something lights it. (2) NOTHING INTERPENETRATES -- field rocks
are placed by rejection with a clearance, and station modules are laid along the spine without overlapping.

THE ICOSPHERE IS GRADED AGAINST A CONSTANT NOBODY TOLD IT: an inscribed polyhedron must be SMALLER than its
sphere and must converge on 4*pi/3, and the shortfall must fall ~4x per subdivision. Measured 4.152741 at subdiv
3 and 4.179739 at subdiv 4 against 4.188790, ratios 3.93 and 3.98.

GATED in render/greeble-selfcheck.mjs (24 checks) and world/spaceStructures-selfcheck.mjs (34 checks). Beyond the
above: the flat fraction delivered is the fraction declared (0.341 against 0.350); every extrusion is an exact
multiple of the tier step; every plate's inner face is flush with the hull face it grew from and none hangs over
the edge; plates on one face never overlap each other; opposite faces are salted differently so a hull is not
symmetrical junk; a SATURATED shell UNDER-DELIVERS rather than overlapping (104 placed of 200 requested, with
`requested` reported beside `placed` so the shortfall is visible, and the 104 still clear). Ten plants fire, tree
restored each: open a gap between the two halves of a split; fix the cut axis (slivers); unquantise the extrusion
depth; sink the plates into the hull; give every face the same salt; stop sharing icosphere midpoints (the mesh
opens, Euler breaks); reverse the winding (volume goes negative); drop the field's clearance test (rocks 10.4
units inside one another); drop the module length from the spine cursor; leave the plates in local space.

FRONT DOOR: es-box3d-fly3d, a Structures button. A 34-rock belt from six baked varieties (1920 triangles of
geometry total, instanced), each rock tumbling on its own axis; and a station at 0.16 scale -- 14 hull parts and
890 plates in TWO instanced draws, which is the only way 890 plates are free. Mock run: 34 of 34 rocks placed,
station span 92.2 -> 14.75 scene units, furthest plate 7.41 units from centre.

NOT CHECKED, AND NO HEADLESS CHECK CAN: whether the belt reads as a belt, whether the station reads as machinery
at 0.16 scale, whether 890 plates is too busy or not busy enough. Keith's first hard-reload.

PAIRED EDITS NAMED HERE FOR frozenReferee: render/greeble-selfcheck.mjs grades and imports its new subject
render/greeble.js; world/spaceStructures-selfcheck.mjs grades and imports its new subject
world/spaceStructures.js. spaceStructures.js also imports procPlanet.js and greeble.js, neither of which changed
this round for it. es-box3d-fly3d.html changed only to wire the front door.

CARRIED REDS: the same four measured byte-identical against pristine v3841 in v3842 (gateQuality, gateReach,
registryOrphans, pageReach), unchanged again here. No device added. gate count 1090 -> 1092 (greeble-selfcheck,
spaceStructures-selfcheck).
## v3842 -- LONG SILENCE: THE PLANET'S SURFACE, CUBE-BAKED WITH RELIEF

Keith's audit of the Long Silence element list against this tree found planets already built (v3830) and asked
for the SURFACE. The gap is real and it is the PROJECTION. v3830 paints its planet into an EQUIRECTANGULAR
texture, which has two defects a backdrop can hide and a place cannot: a POLE PINCH (measured here at 81.5x --
the top row's texels cover 1/81 the sky the equator's do at 256x128, so the poles are baked at eighty times the
resolution of the part you fly past) and a WRAP SEAM held together by wrapS rather than by construction. This
round bakes the same surface into a CUBEMAP -- the shape the skybox (v3833) and the star (v3835) already proved
out, where colour is a pure function of DIRECTION so the six faces agree at their shared edges for free.

ONE OWNER, TWO BAKES. world/planetSurface.js imports heightAt and surfaceColor from world/procPlanet.js and
faceTexelDir from render/nebulaSkybox.js. It grows NO second noise, NO second palette, NO second cube geometry.
procPlanet changed in exactly one way: the biome rule (sea below sea level, a land gradient above, ice past the
cap) was extracted out of bakeEquirect into an exported surfaceColor() with its behaviour unchanged -- its own
gate still passes all 419, which is the evidence that the extraction moved nothing.

WHAT A SURFACE NEEDS AND A PAINTED BALL DOES NOT. The bake now carries a NORMAL, differenced from the height
field's own tangent-plane gradient in a GEOGRAPHIC frame (east/north), so terrain catches the key light instead
of reading as a decal; a ROUGHNESS mask so seas are smooth and land is not; and the HEIGHT itself, read back on
the CPU through dirToTexel (gated as the exact inverse of faceTexelDir) to push the sphere's vertices out, so the
silhouette carries the terrain too. Default relief is 0.08 because that is where the MEASURED mean tilt is 0.27
rad and nothing clips the tip-past-the-horizon cap -- the cap guards a violent seed, it is not the working regime.

GATED in world/planetSurface-selfcheck.mjs, 43 checks. The ones that matter: a BANDED WORLD PROVES THE AXES (a
gas giant's height varies with latitude only, so its gradient must run north and all but vanish east -- measured
14.9x, against 1.00x isotropic on a rocky world, which is the check a swapped or rotated tangent frame fails and
no magnitude test can see); the normal leans AWAY from uphill (195/195); relief 0 returns the sphere normal
EXACTLY; relief 40 still cannot tip a normal past the horizon; every baked texel equals surfaceSample of its own
direction (no per-face contamination -- the seamlessness property); the cube's texel-area spread stays under
3^1.5 = 5.196 at EVERY resolution while equirect's is 81.5x at 256x128 and GROWS with height; and the bake's
geometry checks itself against a constant nobody told it -- six faces of texel solid angles sum to 4*pi, with the
error falling 4.00x per doubling (second order). Five plants fire, tree restored each: swap east/north in the
tangent frame; flip the sign of the normal perturbation; drop cos(lat) from the equirect solid angle (the pinch
vanishes); drop the 1/L^3 projection from the cube one (the 4*pi sum goes to 11.4 off); tint one face of the bake.

FRONT DOOR: es-box3d-fly3d, the planet is now the cube-baked one and a Relief button swaps BOTH halves at once --
the displaced vertices back to smooth AND the baked normals back to the sphere's -- so the toggle shows the whole
of what the bake buys rather than half of it. A mock run of the page's own arithmetic: a terran planet bakes 128^2
x 6 in 753 ms, displaced radius 17.000 to 17.429 against a 17.595 cap, sea 45.8 percent and level (the
displacement clamps at sea level, so water stays a level surface).

NOT CHECKED, AND NO HEADLESS CHECK CAN: the LOOK -- whether the relief reads at this scale, whether the specular
sea is too hot, how the terminator sits. Keith's first hard-reload; no GPU here. bakeEquirect is NOT deleted: it
stays exported and gated, it is simply no longer what the front door wears.

A PAIRED EDIT NAMED HERE FOR frozenReferee: world/planetSurface-selfcheck.mjs grades and imports its new subject
world/planetSurface.js. The gate also imports world/procPlanet.js and render/nebulaSkybox.js; procPlanet.js
changed this round only to EXTRACT the biome rule it already had into an export (419/419 unchanged), and
nebulaSkybox.js did not change at all. es-box3d-fly3d.html changed only to wire the front door.

CARRIED REDS, ALL PRE-EXISTING AND UNCHANGED, and this round MEASURED that rather than asserting it: gateQuality,
gateReach, registryOrphans and pageReach were run against BOTH the pristine v3841 extract and this tree and their
failure text is BYTE-IDENTICAL (gateQuality mpmGpuPage prose-as-code 41 against baseline 40; gateReach population
464 against 418; registryOrphans 22 instruments outside the registry; pageReach Arriving row 40 against 30).
deviceInstrumentMap is red in the pristine extract too. No device added. gate count 1089 -> 1090
(planetSurface-selfcheck).
