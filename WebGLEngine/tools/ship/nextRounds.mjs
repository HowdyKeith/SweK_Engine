// WebGLEngine/tools/ship/nextRounds.mjs — v3340
// ---------------------------------------------------------------------------------------------------------------
// THE STANDING LIST OF WHAT IS DEFERRED AND WHY — because a backlog that lives in a conversation is not a backlog.
//
// v3314 audited the tree's fifteen "its own round" notes and found that SEVEN WERE ALREADY SETTLED, FOUR WERE
// NEVER DEFERRALS AT ALL, and one was a refusal recorded as an omission. The failure mode is not forgetting to
// write things down; it is writing them down in prose that nothing ever re-reads, so a finished item keeps
// advertising itself as open and the next reader spends a round rediscovering that.
//
// So each entry here carries a BLOCKER rather than a priority, and the blocker is the thing that can be checked.
// "Needs a rig" is a fact about the world. "High priority" is a fact about somebody's mood last Tuesday.
//
// THE THREE BLOCKER KINDS, and only the first is anyone's to schedule:
//   OPEN      -- doable in the sandbox now. Nothing is stopping it but the work.
//   HARDWARE  -- needs a GPU, a browser, a second machine, or a WASM build that does not exist here.
//   UPSTREAM  -- doable, but worth nothing until something else lands first, and the entry says which.
// ---------------------------------------------------------------------------------------------------------------
"use strict";

import { pathToFileURL } from "node:url";
export const NEXT_ROUNDS = [
    { id: "population-autopin", state: "CLOSED", note: "DONE at v3553. populationCensus.mjs records the population at ship time and diffs it, and gateReach-selfcheck now reads that record instead of a typed number. The verdicts distinguish routine growth from the thing that should stop a ship: GREW names every addition and reconciles the totals; REMOVALS is treated harder than a gain, because adding physics is routine and physics quietly disappearing is how a deletion ships unnoticed, and the old pin fired identically for both. NO-RECORD is its own verdict rather than a pass. And the gate does NOT rewrite the record it compares against -- writing is a ship step, comparing is the gate, deliberately different programs, because a check that repairs its own expectation can never fail twice." },
    { id: "flip3d-gate", state: "CLOSED", note: "DONE at v3427. Free fall to 1.4e-7, 9216 particles conserved exactly, divergence down 2.1e+4 and -- unlike 2D -- MONOTONICALLY. Two differences from the 2D sibling recorded: the monotone convergence, and that step() is synchronous here while 2D's is async, despite the header calling the pipeline identical." },
    { id: "beer-lambert", state: "CLOSED", note: "DONE at v3426. The exact half holds to 5.6e-17 and optical depths add bit-exactly, which is what makes a line integral the right object for CT. The failing half is measured: with a real spectrum the effective attenuation falls 4.4x with depth and a uniform cylinder cups by 30%. The cost to ct.js is now a number -- 12.0562 against a true line integral of 35.3854 for the same slab." },
    {
        id: "browser-screenshot-floor",
        blocker: "HARDWARE",
        what: "Measure the perceptual floor for browser screenshots, so render-QA's SSIM/pHash/IoU signals can gate instead of merely being recorded.",
        how: "On the rig: run render-qa twice with no code change between runs. The spread between two identical runs IS the floor -- antialiasing, font hinting, compositor timing. Two commands.",
        why: "v3339 wired the signals into all 54 pages as RECORDED, NOT GATING, because the headless floor is exactly zero (Jolt is deterministic) and a browser is not. Gating on an unmeasured number is the failure the whole perceptual line of work exists to avoid.",
    },
    {
        id: "cross-backend-envelope",
        blocker: "HARDWARE",
        what: "Record the box3d-vs-Jolt drift, pixel and perceptual envelope.",
        how: "On a rig where box3d's WASM builds: `node physics/backend-qa-check.mjs --update`. One command.",
        why: "backend-baseline.json has carried \"pairs\": {} since 2026-07-13 because box3d has never loaded wherever --update was run. v3338 made a missing envelope fail as UNMEASURED instead of passing silently, so the first run where box3d loads goes RED and names the command rather than measuring the pair and discarding it.",
    },
    {
        id: "device-verdicts",
        blocker: "HARDWARE",
        what: "Four pages owe a report from real hardware: hmc-bench, ising-bench, magmap-bench, consistency-fleet.",
        how: "Open each page on a machine with a GPU and press submit. They are parked in Arriving Pages with the reason attached, and `node tools/render-qa/deviceOwed.mjs` prints who still owes what.",
        why: "Received kinds: NONE. The ising kernel in particular is graded at ZERO tolerance -- bit-exact or rejected -- so there is no partial credit and no way to infer the answer from here.",
    },
    {
        id: "sys-lag-reading",
        blocker: "HARDWARE",
        what: "One `GET /sys/lag` on Keith's rig after a few minutes of uptime.",
        how: "curl it. The response names each blocking callback by its REGISTRATION site, not its fire site.",
        why: "v3317 re-read the v3278 samples and found the duty cycle FALLS to ~22% and plateaus rather than growing without bound -- so there are two problems, a startup burst and a steady periodic cost, and only a reading tells us which callback owns the second.",
    },
    {
        id: "image-pair-second-side",
        blocker: "UPSTREAM",
        what: "A second, independent renderer for the image-based consistency pair.",
        how: "The render-qa Playwright rig can capture a real render; wiring it to frame the same scene as the headless rasteriser would give two mechanisms.",
        why: "physics/imagePair.mjs declares the pair INCOMPLETE because only one side exists. A pair assembled from one mechanism twice is reproducibility wearing the costume of corroboration, and the board's admission rule does not bend for a pair that would be convenient.",
        upstream: "browser-screenshot-floor -- without a floor there is nothing to gate the pair against",
    },
    {
        id: "ensemble-weighting",
        blocker: "UPSTREAM",
        what: "Weight the soft signals rather than averaging them equally.",
        how: "Fit weights against cases where the right answer is known.",
        why: "Deferred twice for the same reason: there was nothing to tune against. v3340 changed that -- the CT sweep gives labelled degradation against exact ground truth, and it already showed edge overlap is worth far more than pHash there (0.223 vs 4 bits of 63 at 8 angles). An equal average is currently wrong in a measurable direction.",
        upstream: "reconQuality gives the first labelled data; more would come from the browser floor",
    },
    // ---- v4535: the first entries from the third-party repo sweep, WITH THE CORRECTIONS THAT SURVIVED
    // CHECKING. *** THREE OF THE SWEEP'S LOAD-BEARING CLAIMS WERE WRONG, AND TWO OF THEM SAT UNDER ITS
    // SECOND-RANKED ITEM. *** They are recorded in the `why` of each entry rather than in a conversation,
    // which is this file's entire reason to exist: a candidate list that arrives with an unchecked premise
    // costs the next reader the same afternoon it cost this one.
    {
        id: "sweep-budget-calibration",
        state: "CLOSED",
        note: "MEASURED AND REJECTED AT v4536, AND THE ROUND SHIPPED A DIFFERENT REPAIR. The diagnosis was " +
              "right -- a millisecond on a loaded box and one on a quiet box were being compared as the same " +
              "quantity -- and the proposed cure does not survive being built. Two reference workloads were " +
              "driven under load: a pure integer loop moved 1.02x while gates moved 1.22-2.26x, and `node -e " +
              "0` moved 2.43x. Neither tracks. AND THE DRIFT IS NOT A COMMON FACTOR, so no scalar could: on " +
              "code byte-identical since the earlier reading, microfacetVndf/water2d/slugReupload moved " +
              "1.12-1.13x while probeLab and meshLine moved 1.36x. *** WORSE, meshLine WALKS THE TREE, so " +
              "part of its 1.36x is the tree growing -- real work a normaliser would have divided away and " +
              "filed as a slow hour. *** What shipped instead is corroboration: quickSweep.MIN_CROSSINGS_TO_" +
              "EVICT, a crossing must be reproduced on a later sweep before it evicts, which is v4297's rule " +
              "for reds applied to time. See BUDGET_DRIFT_V4536 in sweepCoverage.mjs for every reading. " +
              "STILL OPEN AND LARGER THAN ANY OF THIS: the timings file mixes 8-way parallel readings with " +
              "serial ones and compares both against one budget -- twelve unchanged gates from a single " +
              "capture re-measured serially came in at 0.41x to 0.92x, a 2.24x spread. That is the next one.",
    },
    { id: "ibl-specular-half", state: "CLOSED", note: "DONE at v4539, and the round it replaced was aimed wrong. The sweep that raised this recorded IBL as absent; it was HALF absent -- render/splatProbes.mjs (v4513) bakes an order-2 SH irradiance volume and render/probeLit.mjs (v4514) evaluates it on both backends, so the DIFFUSE side had shipped. physics/render/splitSum.mjs adds the specular side: Karis's split sum, a BRDF table in (n.v, roughness) plus a GGX-prefiltered environment. *** GRADED AGAINST A NUMBER THE TREE ALREADY HAD RATHER THAN A TOLERANCE: *** at F0 = 1 Schlick's Fresnel is identically 1, so A + B IS the directional albedo, which energyCompensation.mjs computes by an unrelated route for an unrelated purpose -- median disagreement 4e-5 across alpha 0.1 to 1.0, and the worst (6.4e-3) lands exactly where that reference's own header says it is weakest. The factorisation's cost is measured, not waved at: 0% exactly on a constant environment, 2.1-4.6% on a gradient, 13.8-32.8% on a small bright light. *** WHAT IS NOT CLAIMED: *** no prefiltered mip CHAIN is baked and nothing on a device samples this yet -- prefilterEnv convolves an environment FUNCTION, so the cubemap capture, the mip layout and the WGSL that reads them are the next piece, and they are the piece that needs a GPU. The n = v = R simplification that lets one chain serve every view angle is named in the module and throws away the lobe's stretch at grazing angles, which is a second approximation stacked on the factorisation and is not yet measured." },
    { id: "terrain-controller", state: "OPEN", what: "physics/character/terrainWalk.mjs shipped at v4544 and does the GROUND; vertical velocity and capsule-vs-triangle are not built.", note: "DONE at v4544 for the part that was missing. The tree's only character controller, physics/character/kinematic.js, is an AABB against axis-aligned unit voxels, and a voxel world has no slopes -- only staircases of unit lips. MEASURED BEFORE ANYTHING WAS WRITTEN, which is what said a new file was owed rather than a patch: on voxelised ramps it either cannot climb at all (0.31x the requested speed at 14 degrees, 0.11x at 26.6, 0.01x and stuck at 45) or, with a step allowance, climbs while moving along the surface at EXACTLY sec(theta) -- 1.020x, 1.118x, 1.414x at those angles. That is the horizontal speed convention arrived at by accident rather than chosen, and it means you sprint up hills faster than you run on the flat. *** THE CENTRAL CLAIM IS THAT A SLOPE LIMIT IS A PROPERTY OF THE GROUND AND NOT OF THE FRAME RATE, AND THE CONTROL IS IN THE GATE RATHER THAN THE ARGUMENT: *** the tempting per-step height-difference test climbs a 76-degree wall at 60 and 240 fps and refuses the SAME WALL at 15 and 30, and climbs 26 units up a 63-degree face at every timestep against a 45-degree limit. A normal-based limit refuses both at all four. Two ground oracles are cross-checked rather than each trusted -- a bilinear heightfield gradient and a meshBVH raycast plus cross product agree to 4.8e-14 in height and exactly in normal over 200 samples. STILL OPEN: (1) NO VERTICAL VELOCITY. Jumping, falling and ceilings are not owned by this module; leaving the ground ends the step with airborne=true and the caller takes over. That contract is deliberate and it is also a hole: nothing in the tree currently plays the other half, so a body that walks off a ledge stops there. (2) CAPSULE AGAINST TRIANGLES. Overhangs, thin walls, moving platforms and stepping onto a floating deck all need depenetration against arbitrary geometry, built on meshBVH's trianglesInBox. Not started. On terrain it is not needed -- a wall IS a very steep slope and the slope limit is what stops you at it -- which is exactly why the scope stops where it does. (3) THE GROUND IS A FUNCTION OF (x, z). An overhang has two surfaces over one point and the oracle takes the topmost; this will be the first thing wrong on a real mesh. (4) NOTHING IS WIRED, the same state nav/funnel.mjs has been in since v4254 and nav/navmesh.mjs since v4543. *** (4) IS CLOSED AT v4545: *** simulation/BotManager.js follows the ground through this module instead of writing bot.y = _heightAt(x, z) + 1, so a bot moves at 5*cos(theta) horizontally rather than sec(theta) along the ground, stops at a wall it used to walk straight up, and slides along one approached at an angle rather than sticking. functionGround() was added for it, because a live world exposes a height FUNCTION and neither existing adapter fits that. (1), (2) and (3) are still open." },
    { id: "pathfinder-snapshot-window", state: "CLOSED", what: "simulation/BotPathfinderPool.js samples only the start/goal bbox padded by HM_PADDING = 24, so a detour wider than that is not in the data either planner receives -- measured at v4547, never written down before.", note: "MEASURED RATHER THAN SUSPECTED, in tools/ship/navWiringLive-selfcheck.mjs section 6, by walking a wall's gap outward from the straight line and asking the real pool for a path at each offset: found at 0, 8, 16, 22, 24 and 26 units off the line; LOST at 32, 48, 64, 72, 80 and 96. The edge sits where HM_PADDING plus the gap's own half-width puts it, and the gate DERIVES that expectation by reading the constant out of the source rather than pinning 24 -- set the constant to 64 and the edge moves to 64/72, set it to 12 and it moves to 16/22, while making _heightmapForJob ignore the constant altogether goes red. *** THE CONSEQUENCE IS THE PART WORTH A ROUND: A BOT WHOSE ONLY WAY ROUND IS WIDER THAN THE WINDOW DOES NOT GET A LONG PATH, IT GETS NO PATH *** -- both planners correctly return found:false, because neither can find a route that is not in the data it was given -- and simulation/BotManager.js then falls back to direct steering, which walks straight at the thing in the way. So the failure mode of a too-narrow window is not a slower bot, it is a bot that gives up and charges the wall. WHAT THE ROUND WOULD HAVE TO DECIDE: 24 is a RANGE LIMIT ON DETOURS and it is currently a single constant serving every caller, every world and every separation, with no measurement behind it anywhere in the tree. Widening it costs snapshot area quadratically -- the pool builds and TRANSFERS an Int16Array per query -- so the honest shapes are an adaptive window (grow and retry when a plan fails), a window derived from the world's own obstacle scale, or a persistent navmesh built once for a region rather than per query, which is the option nav/navmesh.mjs's own entry already lists as open. *** v4552 TOOK THAT NUMBER AND IT INVERTS THE QUESTION. *** Measured on 320x320 of main.js's own world._heightAt from a real boot, walked with the worker's own rule and planned by Dijkstra over the WHOLE slab so the route is the one a planner with no window would return: 240 routes, ZERO unreachable of 332 tried, excursion outside the start/goal box median 0, p90 0, p99 1, MAX 3 -- a pad of 4 covers 100%, and path length over straight line is median 1.066, max 1.336. HM_PADDING = 24 IS EIGHT TIMES THE WORST CASE THIS WORLD PRODUCES. The reason is the second measurement: at the worker's step rule the shipped heightfield is 0.18% blocked into ONE component covering 100.0% of the map -- an open field. Nothing to go round means nothing to detour for, so BOTH remaining shapes answer a question this world does not pose, and the ladder is insurance against a world this tree does not have (kept, because v4547 measured it to cost nothing unused). THE CONSTANT IS NOT CHANGED, and that is the finding rather than an omission: it is generous, it costs little, and what it lacked was anything able to SAY so. nav/detourScale.mjs is that instrument and nav/detourScale-selfcheck.mjs holds the shipped pad against a live census. Graded on a world that DOES have an obstacle: a wall with one gap returns an excursion of 58 where the geometry says 58, moving the gap moves it to 28 and then 0, and a census of that world asks for a pad of 184. What is left of this item is only the ceiling: 144 is still a CEILING, so a detour wider than that is a bot that charges the wall -- and on measured evidence nothing in this world comes within a factor of forty of it. *** v4547 BUILT THE FIRST OF THE THREE -- THE ADAPTIVE WINDOW -- AND MEASURED BOTH SIDES OF IT. *** BotPathfinderPool.plan() now climbs a padSchedule of [24, 60, 144], re-snapshotting only when the previous rung returned found:false, and the reach goes from 26 units of detour to 128, a 4.9x extension. The rung that answers is the one the geometry predicts rather than simply the last: 24 solves offsets 0 through 26, 60 solves 32/48/64, 144 solves 96/128. THE COST IS PAID ONLY WHEN IT BUYS SOMETHING: 8 plans that succeed on the first rung take 92 ms and widen ZERO times, because widening every query would have grown the snapshot quadratically -- at a separation of 90, pad 24 is 6,811 cells, pad 64 is 28,251 (4.2x) and pad 128 is 89,179 (13.1x), and the pool builds each by calling world._heightAt once per cell and TRANSFERS it. *** THE LADDER IS THREE RUNGS AND NOT A LOOP FOR THE WALLED-OFF CASE, WHICH IS THE ONE THAT REPEATS FOREVER: *** 8 hopeless plans against a sealed wall cost 448.8 ms, 16 widenings and 8 whole ladders climbed in vain -- 4.9x the easy case, about 56 ms per hopeless request, off the main thread, and _widenedInVain counts them so a world full of unreachable goals is visible rather than merely slow. STILL OPEN, and unchanged by this: the other two shapes. A window derived from the world's own obstacle scale would not need to fail first, and a persistent per-region navmesh would not need a window at all -- and choosing between them still needs the number nobody has taken, which is what real detours in real worlds look like. Also still true: 144 is a CEILING, so a detour wider than that is a bot that charges the wall, exactly as 24 was before." },
    { id: "navmesh-recast", state: "OPEN", what: "nav/navmesh.mjs shipped at v4543 and closes funnel-selfcheck's standing question; three named pieces of it are not built.", note: "DONE at v4543 for the part that was blocking. tools/ship/funnel-selfcheck.mjs ended with 'unchecked here: a NAVMESH' and its section 4 said why: on a wall with one gap, string-pulling a GRID corridor gives 302.20 m and walks through walls at 18 of 616 samples, and insetting it to the staircase's safety costs 319.59 m against that staircase's 318.39 -- LONGER than the thing it improved, because the whole saving was a margin the grid held by accident. Eroding by the agent radius BEFORE the polygons exist puts the clearance in the mesh instead: 297.42 m on the same wall at the same radius, 0 of 605 in a wall, measured clearance 2.687, and 0.27% off an optimum derived from the fixture's own inequalities. *** THE ROUND'S REAL DEFECT WAS FOUND BY CHANGING THE INSTRUMENT RATHER THAN THE FIXTURE: *** Recast's own chamfer 2/3 distance field passed 'in a wall: 0 of 599' while delivering 0.708 clearance where 1 was asked and 2.829 where 3 was, both exactly the diagonal a chamfer prices at 3 against 2.828. Not entering a wall is a much weaker property than standing clear of one, and only the second is what a navmesh is for. STILL OPEN, and each is a round rather than a gap: (1) WATERSHED PARTITION AND CONTOUR SIMPLIFICATION. The region step is a monotone row sweep, which Recast also ships, and rectangles are convex already so no contour trace and no convex merge is needed. The cost is measured: a 45-degree wall becomes 737 thin rectangles where a contour mesh would give a handful. What it does NOT cost is path quality -- that same mesh returns a five-corner path, because quality comes from the portals being real edges. So this buys memory and A* nodes, and nothing yet is short of either. (2) THE A* COST MODEL IS UNGUARDED. Replacing g + distance with a flat g + 1 changes NO path on any fixture, including a trap map built to punish it, because f = g + D(midpoint, goal) adds a polygon count to metres and the heuristic dominates outright. A fixture that discriminates it is owed; until one exists that line of corridor() is untested. (3) NOTHING IS WIRED. simulation/BotPathfinderPool.js still receives the grid staircase and no shipping module calls nav/navmesh.mjs -- the same state funnel.mjs has been in since v4254. Wiring it is not free: the mesh is built per connected component from a seed, so a caller needs one mesh per reachable region and a policy for rebuilding when the heightmap changes, and neither exists. ALSO NOT BUILT: multi-storey worlds, because a heightmap has one surface per column and real spans are what Recast carries; and off-mesh links, jumps and doors. *** (3) IS CLOSED AT v4545: *** worker/botPathfinder.worker.js tries this module first and falls back to its own grid A*, simulation/BotPathfinderPool.js exposes route and agentRadius, and tools/ship/navWiring-selfcheck.mjs grades it end to end on the snapshot shape the pool actually builds -- shorter (96.61 against 99.88 at a separation of 80), further from the walls (clearance 2.000 against 0.850) and 4 waypoints against 21, at 1.4-3.0 ms per query against 0.25-0.90. *** AND THE WIRING FOUND TWO DEFECTS THIS MODULE'S OWN GATE COULD NOT: *** portals oriented from polygon CENTRES returned 147.35 m against a taut 96.61 on the first realistic snapshot it was ever handed, because every fixture here walked its corridor monotonically; and a stride of 0 made hm.length/stride Infinity and HUNG the worker forever, which is worse than throwing because the fallback recovers from a throw. (1) and (2) are still open." },
    { id: "uv-unwrap", state: "CLOSED", note: "DONE in two halves, v4536 and v4537, and the three files that routed around the absence can stop. THE PLANAR HALF (physics/mesh/uvUnwrap.mjs): meshCSG's booleans emit convex planar polygons that already carry their plane, and projection into a polygon's own plane is an ISOMETRY, so it owed no stretch minimiser at all -- worst edge-length change 0.00e+0, texel-density spread 1.7e-15 across 60 edges of real subtract() output. THE CURVED HALF (physics/mesh/uvLscm.mjs): weld, segment into disk charts by normal deviation, least-squares conformal maps per chart, pack. RobotExpressive.glb -- the asset reskin.js called unavailable -- is 3,234 of 3,234 triangles unwrapped across 735 charts, 0 flipped, worst conformal 1.18, 100 ms. *** WHAT MEASURING IT FOUND FIRST: three quarters of that shipped vertex buffer is duplication (7,214 -> 1,759 across 19 primitives, valence 1.35 -> 5.52), and 71% of the welded mesh is CLOSED surface -- so 'unwrap the disks and report the rest' would have left most of the robot untextured, and segmentation is the job rather than an optimisation. *** WHAT IS NOT CLAIMED: LSCM minimises angle distortion and guarantees nothing about injectivity; a chart can be a topological disk and still fold over itself, which is exactly what the flips past a 100-degree normal limit are. And area distortion is not controlled and cannot be -- on a sphere cap it runs 1.15 to 4.61 as the cap widens, which is Gauss rather than a defect. *** v4538 GAVE IT A CONSUMABLE SHAPE AND PROVED IT END TO END: *** unwrapToMesh() splits the seams a per-vertex buffer needs -- 48.5% of RobotExpressive's welded vertices sit on one, so 1,759 + 1,187 copies = 2,946, still 59% fewer than the 7,214 the file ships -- and the result round-trips through tools/export/sceneGlb.mjs as a GLB carrying TEXCOORD_0, decoded by hand from the container and exact to 0.00e+0. polysToMesh() answers meshCSG directly, CUT faces only if asked, with texel-density spread 0.00e+0 because a cut face is planar by construction. *** STILL OPEN: NO SHIPPING MODULE CALLS EITHER. *** tools/ship/orphanTriage.mjs still lists physics/mesh/uvLscm.mjs in its actionable pile and is right to -- every caller is a gate. The two candidates both carry a problem: tools/export/reskin.js chose vertex colours BECAUSE UVs were unavailable, so wiring it re-opens a decision somebody already made, and world/worldGlbExport.js is colour-based by design and has never asked for UVs. Picking one needs a real want behind it, and inventing one is the exact trap this file exists to prevent. *** v4540 CLOSED IT, AND WITHOUT RE-OPENING ANYTHING: *** reskin.js gained ROUTE 3, a UV texture route, which does not touch route 1 -- it removes the limit route 1 STATES in its own header -- 7,214 vertices is about 85x85 if it were a texture, too coarse for photographic detail. 7,214 vertices shade at 7,214 samples; a 1024-square atlas at 51.1% coverage is 535,822 texels, 74x the budget, for 154 extra vertices (2.1%) and positions, normals, joints and weights bit-identical per vertex. THE MEASUREMENT THAT SHAPED IT: the weld that UNWRAPS is not the weld that EXPORTS -- of 5,455 coincident pairs uvLscm merges to recover connectivity, 229 have different SKINNING and 5,346 have different NORMALS, so rebuilding the output from the welded mesh would break the deform and flatten every hard edge. The UVs come back to the original vertices instead. orphanTriage no longer lists physics/mesh/uvLscm.mjs." },
    {
        id: "gltf-conformance-fixtures",
        blocker: "OPEN",
        what: "Conformance fixtures for gpu/GLBParser.js against the glTF feature matrix, starting with sparse accessors.",
        how: "KhronosGroup/glTF-Asset-Generator (MIT, one root licence, synthetic geometry -- none of the per-model licence trouble gpu/khronosSamples.mjs exists to handle). Assets ship in release zips, not as raw repo files. Strip them header-only the way gpu/fixtures/ already does, with the same PROVENANCE.md discipline.",
        why: "SPARSE ACCESSORS ARE GENUINELY UNSUPPORTED -- zero occurrences of `sparse` in gpu/GLBParser.js. Correcting the sweep on the other half: INTERLEAVED buffers ARE handled, via view.byteStride at GLBParser.js:1162 and 1236. And the exporters are not ungated: tools/ship/sceneGlb-selfcheck.mjs and voxelGlb-selfcheck.mjs check magic, version, chunk order, 4-byte alignment and space-padding -- the CONTAINER. Nothing checks spec SEMANTICS, which is the narrower and true form of \"no conformance check on the exported files\".",
    },
    {
        id: "spherical-gaussian-view-dependence",
        blocker: "UPSTREAM",
        what: "Spherical GAUSSIANS for view-dependent appearance, BakedSDF-style -- a lobe basis that can hold a sharp specular highlight, where the spherical harmonics already shipped here cannot.",
        how: "Read the technique, not the repositories: BakedSDF is Google Research's published 'Meshing Neural SDFs for Real-Time View Synthesis', and the tooling found for it (UnityBakedSDF and friends) is C#/ShaderLab/C++ for Unity and Unreal -- the wrong engine, so nothing is portable and nothing needs to be. What is worth taking is the pair of ideas: encode view dependence as a few spherical GAUSSIAN lobes per vertex rather than as SH bands, and bake the result onto a TRIANGLE MESH so it rasterises anywhere.",
        why: "*** THE SWEEP THAT RAISED THIS CALLED VIEW-DEPENDENT SHADING A CONFIRMED-ABSENT TECHNIQUE. IT IS NOT ABSENT; IT IS SHIPPED, AND IN A SHADER. *** render/SplatRenderer.js evaluates first-order spherical harmonics per splat in its vertex shader, with the basis constant written out (SH1 = sqrt(3/(4pi)) = 0.4886025119029199) and the three lobes summed against the view direction; gpu/SplatLoader.js parses f_rest_0..f_rest_8 to feed it and REFUSES a partial set rather than zero-filling, which tools/ship/splatRoundTrip-selfcheck.mjs asserts. Only the LITERAL claim survives -- there are no spherical Gaussians, no BakedSDF, no MobileNeRF and no binary opacity grids anywhere, all four greps empty.\n\nWHAT IS TRUE AND USEFUL IS NARROWER AND SHARPER: the tree carries TWO splat paths and they disagree about this. engine/SplatRenderer.js uses SH band 0 only and says so in its own 'what we still don't do' list -- 'so reflections/specular lose detail' -- while engine/splatParser.js 'deliberately skip[s] the higher SH coefficients (f_rest_*, 45 values)'. render/SplatRenderer.js and gpu/SplatLoader.js do the opposite. So the real gap is not view dependence; it is that ORDER ONE IS THREE LOBES AND A SPECULAR HIGHLIGHT IS NARROWER THAN THAT, which is precisely the case spherical Gaussians exist for and precisely what engine/SplatRenderer.js's header already complains about losing.",
        upstream: "Something that wants a sharp view-dependent highlight on a GENERATED asset, and a source that carries the data to make one. The tree's own splat generators are the obstacle: ai-bridge/kaggle_templates/ (triposr, triposg, triposplat, instantmesh) produce assets from images and text, and engine/SplatRenderer.js records that 'splats imported from CRM/Hunyuan already discard these in the parser anyway' -- so even the SH bands the tree CAN render are frequently not in the file. Fitting spherical Gaussians needs multi-view radiance to fit them FROM, which a single-image generator does not have. The cheaper question comes first and is entirely in-tree: unify the two splat paths so the band-0 renderer stops discarding SH the other one loads, and measure what order 1 is actually worth on the assets this tree really makes. If that turns out to be the ceiling, THEN the lobe basis is the next move.",
    },
    {
        id: "compact-state-serialization",
        blocker: "UPSTREAM",
        what: "Bit-packed, quantized serialization for state synced over WebSocket -- smallest-three quaternion compression, bounded-range float quantization, compressed unit vectors.",
        how: "isaac-mason/packcat (MIT, pure TypeScript) matches this tree's language, which is why it supersedes nxrighthere/NetStack -- the first source the sweep found, and C#. Read it as a technique; the three encodings are small and this tree writes its own binary formats elsewhere (tools/export/voxelGlb.mjs packs chunks by hand).",
        why: "*** THE ABSENCE IS WIDER THAN 'NO QUANTIZATION', MEASURED RATHER THAN GREPPED FOR. *** A search for quantiz/bitpack/smallest-three across net/, world/, multiplayer/ and ai-bridge/ returns five hits and NOT ONE is on the wire: four are int8 model quantization in ai-bridge/embedModel.js and one is a local per-column byte-array heat field in world/worleyBiomes.js. (Spelt that way ON PURPOSE: naming the constructor here would put the literal token in a STRING, and vba/runtimeGap.mjs's census strips comments but not strings -- the first draft of this entry moved that census's typed-arrays row 795 -> 796 on the strength of prose. Third instance of the same defect in two rounds, after the guardian search that counted a record MENTIONED in a header and the WebGL row that counted a --enable-webgl launch flag.) Then the files that actually send: world/universeWire.mjs is 1 JSON.stringify, 1 send and ZERO typed arrays; world/economyLockstep.mjs is 2 JSON.stringify, 2 sends and ZERO typed arrays. So state does not go over the wire at full float precision in a binary frame -- IT GOES AS JSON TEXT, and there is no binary encoder to quantize into. multiplayer/wadLevelHost.js is the one file with typed arrays (3) and quaternion/xyz handling (4 matches), and it has NO send at all: it builds buffers, it does not transmit them.",
        upstream: "A WANT, WHICH DOES NOT EXIST YET -- and that is why this is filed UPSTREAM although the sweep that raised it listed it as OPEN. Its own words were 'NO ESTABLISHED WANT yet -- logged as a read so it doesn't need re-deriving later, not because it's due now', and this file's rule is that OPEN means nothing is stopping it but the work. Nothing has complained about bandwidth; nothing has measured a frame that was too big; the two senders are JSON and neither has a message-rate problem on record. The day something does, the measurement above is the starting point and the ordering is clear: a binary frame FIRST, quantization second -- packing bits into a format that does not exist is not an optimisation. Repo: https://github.com/isaac-mason/packcat (MIT). Superseded: https://github.com/nxrighthere/NetStack (C#).",
    },
    {
        id: "cellocut-watertight-remesh",
        blocker: "UPSTREAM",
        what: "Read the technique behind CelloCut -- Constructive Watertight Remeshing via Tetrahedral Cell Cuts -- against the crack meshCSG.mjs has measured and not closed.",
        how: "Apache 2.0 and arXiv-published, so the technique is readable regardless of its toolchain: embed a defective mesh in a tetrahedral cell complex and solve an interior/exterior labelling by graph cut, which makes the boundary watertight BY CONSTRUCTION rather than by patching a boolean's output afterwards. The repository itself is C++/CUDA over CGAL, Eigen and libigl -- the wrong toolchain here, which is why this is a read rather than a port.",
        why: "*** THE WANT IS MEASURED, WRITTEN DOWN, AND ITS CAUSE IS UNKNOWN -- which is exactly the case a by-construction method answers. *** physics/mesh/meshCSG.mjs: on ONE blast its settle pass reaches 100.0%, every edge matched, zero T-junctions, zero gaps. Over twelve it does not -- 15 of 12,847 directed edges (0.12%) survive UNCOVERED, real cracks rather than T-junctions -- and the file states plainly that the reason is not known. THREE EXPLANATIONS WERE PROPOSED AND ALL THREE MEASURED AND REFUTED: dropped slivers (the counter says 0 of 37,708 splits), too tight a weld tolerance (identical 20 of 64,064 from 1e-9 to 1e-7, worse at 1e-5), and one corner spelled two ways by two split orders (snapVertices closes none of them at any tolerance from 1e-12 to 1e-6). What IS known is that the solid is right: volume 20.112588161 to the last digit across every combination of snap, merge and weld, and A-B plus A AND B reconstruct A to 9.7e-14. So a hairline of the surface is not sewn and nobody knows why, recorded as an open limit because 'a gate that asserted watertight here would be asserting something false'. A graph-cut interior/exterior labelling over a cell complex does not need the cause found: it cannot produce a hole in the first place.",
        upstream: "Nothing here needs a watertight guarantee badly enough yet to pay for a tetrahedral cell complex and a graph cut -- the 20 edges are recorded, attributed and survivable. It becomes worth doing when something downstream REFUSES a cracked solid: an export that must be printable, a fluid boundary, or a tet-mesh body (see tet-cut, which needs one too). NOT VERIFIED HERE: those figures are meshCSG's own recorded measurements on its twelve-blast fixture and were not reproduced for this entry -- an ad-hoc twelve-subtract fixture built while filing it dropped ZERO slivers and its unmatched edges were its own open boundary, a different thing, said so rather than counted as corroboration. *** v4542 NARROWED WHAT THE CRACK IS, WITHOUT CLOSING IT. *** An audit of meshCSG-selfcheck against a formal CSG property list added a ray-parity row: 100 rays across the twelve-blast wall's whole cross-section cross the surface an EVEN number of times, 652 crossings, 0 odd -- and a planted face-sized hole (settle() made to drop one polygon) reads 5 of 100 odd, so the row discriminates. So the 15 uncovered edges are HAIRLINES rather than missing faces, which is a weaker defect than the bare phrase not-watertight suggests and moves this item further down rather than up. The same audit found the eight degenerate CONTACT cases a watertight remesher would have to handle -- flush faces, a corner on an edge, an edge along an edge, a cutter identical to the solid -- are already exact here to 1e-12 against an interval oracle and settle to zero unmatched edges, so what CelloCut would buy is narrower than it looked: not correctness on hard contacts, only the last hairline.",
    },
    {
        id: "glb-export-conformance",
        blocker: "OPEN",
        what: "DONE at v4550 for the export side and the manifest intake -- tools/export/glbConformance.mjs, wired into both writers' own gates. STILL OPEN: the runtime intake path, where ui/cityPack.js discovers a GLB by filename and loads it unexamined.",
        how: "KhronosGroup/glTF-Validator (MIT) is the reference implementation of the spec's own error list and can be run over an exported file. CesiumGS/gltf-asset-auditor covers the asset-quality half (texture sizes, draw counts, unused data). Strip any fixture header-only under the PROVENANCE.md discipline gpu/fixtures/ already uses -- assets ship in release zips, not raw repo files.",
        why: "*** THE CONTAINER IS CHECKED AND THE SPEC IS NOT, AND THOSE ARE DIFFERENT FAILURE MODES. *** Measured: tools/ship/voxelGlb-selfcheck.mjs asserts the magic is 0x46546C67 and the version is 2 and that a FLOAT view never lands at an odd offset; dracoWeld-selfcheck refuses a second spelling of the glTF magic; componentType appears 4 times in sceneGlb-selfcheck and 3 in voxelGlb-selfcheck. So a file that is byte-legal but spec-invalid -- an accessor whose min/max disagree with its data, a primitive mode nothing supports, a sparse accessor -- passes everything this tree owns. AND NO VALIDATOR EXISTS ANYWHERE IN IT: a grep for gltf-validator across package.json and every .mjs/.js returns nothing. The intake half is unguarded too -- ui/cityPack.js carries 15 GLB references and nothing inspects a Kenney or Quaternius kit file before it is placed in a scene.",
        upstream: "*** v4550 BUILT IT, AND NOT BY VENDORING. *** tools/export/glbConformance.mjs implements the subset of glTF 2.0 that applies to what this tree writes and reads, each finding carrying the spec's own error code; glTF-Validator is named as the reference to check against if a dependency is ever wanted, but it is Dart compiled to JavaScript and would be the only build-output dependency here. THE RESULT ON REAL FILES IS A NULL RESULT AND IS RECORDED AS ONE: all 31 GLBs on disk and both writers are clean, so the value is not the 31 -- it is that fifteen spec MUSTs are broken one at a time against a real export and each is caught by its own code. Three of the checks read the BIN and not the JSON, which is the difference between a check and a restatement of the writer. WIRED into voxelGlb-selfcheck and sceneGlb-selfcheck, proved by breaking the WRITERS (a min off by one, an index set to 60000) and watching each writer's own gate redden; the 28-entry kit manifest is validated in the conformance gate rather than kenneyKit-selfcheck.mjs, which is 11,003 ms against a 3,000 ms budget and does not run at ship time. *** WHAT IS STILL OPEN IS THE RUNTIME PATH: *** ui/cityPack.js fetches a GLB in a browser, discovers it by filename, and hands it to the asset loader with no inspection, so a file arriving by any route other than the manifest is unchecked. glbConformance.mjs has zero node imports and would run in a browser as-is; the open question is whether a runtime check is worth its cost on a user's frame, which is a decision and not a gap. ALSO STILL OPEN: skins, animations, images, textures and Draco are unvalidated -- RobotExpressive carries 2 skins and 14 animations across 283 accessors, so its clean result is narrower than it looks. This is the EXPORT and INTAKE side of gltf-conformance-fixtures, which covers import into gpu/GLBParser.js; the two share fixtures and should probably be one round if either is taken. Repos: https://github.com/KhronosGroup/glTF-Validator (MIT), https://github.com/CesiumGS/gltf-asset-auditor, https://github.com/KhronosGroup/WebGL (conformance suite). https://github.com/KhronosGroup/glTF-Sample-Viewer is a reference to READ and not a dependency to take.",
    },
    {
        id: "atlas-packing-splits-a-chart",
        blocker: "CLOSED",
        what: "physics/mesh/uvLscm.mjs never splits a chart in order to PACK it better, and the reference oracle prices that at up to 2x the texture on a mesh with no distortion in it at all.",
        how: "Score a candidate cut by the atlas coverage it buys rather than by distortion, which is the axis nothing in this module currently has: splitOverlapping() splits only when a chart folds onto itself, and mergeCharts() only ever REDUCES the count. The cheapest shape is a post-pass over `laid` in unwrapCurved -- cut a chart whose bounding box is far from square along its long axis, re-pack, keep the cut only if measured coverage rose. Every ingredient exists: rasterPack already reports its own width and height, and tools/mesh/xatlasRef.mjs\'s density() is the metric that can tell whether the cut paid. The cost is seams, and seams are already counted in physics/mesh/uvLscm-selfcheck.mjs section 9.",
        why: "*** THE CYLINDER CONTROL IS WHY THIS IS A ROUND AND NOT A TUNING. *** A 16x6 cylinder is developable: an exact unwrap exists, and both this tree and vendor/xatlas find it -- stretchP90 is 1.000 on BOTH sides, zero distortion to argue about. xatlas still gets 2.01x the texture per unit surface at the worst-served tenth of the mesh, because it CUTS the strip into 3 charts that tile a rectangle at 85.7% utilisation while this tree keeps it as ONE 1 x 0.426 strip and lets 57% of the square go empty. With nothing left to blame on the solver or the segmentation, the whole gap is the atlas. The same effect is 1.31x to 1.66x on the sphere and torus fixtures, and it is why v4560 does NOT claim uvLscm beats the reference: on the scale-free stretch number it does on every fixture, and on absolute texture per unit surface it loses on every one.",
        done: "DONE at v4561, AND THE PREMISE IN `what` ABOVE IS WRONG AS A GENERAL RULE -- measuring it is what said so. Slicing every chart more than 1.5x from square, at k = 2, 3 and 4, LOSES coverage on four of five meshes (torus 44.6% -> 40.9%, RobotExpressive 37.4% -> 36.0%); only the cylinder gains. So the cut is offered by a DERIVED trigger -- the widest chart\'s span against sqrt(total box area), which asks whether any one chart is already wider than the square could be -- and accepted only if a real pack of the cut set covers more than a real pack of the uncut one. Cylinder: 1 chart at 42.2% -> 2 at 57.7%, densityP10 4.49e-2 -> 6.14e-2, gap to xatlas 2.01x -> 1.47x. *** AND THE BIGGER FINDING WAS NOT THE CUT AT ALL. *** Splitting the loss showed the cylinder is the ONLY mesh where the square costs anything -- 57.0 points there against 0.1 to 3.2 everywhere else -- so on a real asset the gap is elsewhere, and it was the CHART SCALE: LSCM fixes a chart up to a similarity, so the scale is the pinned pair\'s and not the surface\'s, and RobotExpressive\'s 448 charts span 34.7x in texels per unit surface. equaliseChartScale takes densityP10 3.94e+1 -> 7.20e+1 (+83%), p10/median 0.631 -> 0.980, stretchP90 1.178 -> 1.018 AND coverage 37.2% -> 41.1%. It is not free everywhere: on the 12x8 sphere, whose charts already differed by 1.2x, it costs 9% of densityP10 and 14% of coverage, and that is recorded rather than averaged away. *** AND A THIRD DEFECT FELL OUT: *** conservativeMask has taken a cellSize since v4536 because \'the two grids have to be the same grid\', rasterPack passes `cell` at the call site, and the arrow that built the shapes took TWO parameters and dropped it -- the whole fix existed in its own comment. Connected: the pad stops escalating (1 at every resolution 192 to 640, against 2 at 256 and 640), coverage becomes monotone in resolution, and repacking the robot\'s own charts is now EXACT where it used to move the pad 1 -> 2 and lose 14.1% of the atlas. STILL OPEN and now the whole of the remaining gap: xatlas is ahead by 1.22x to 1.57x on absolute texel density, it packs a NON-SQUARE atlas (1107x834 on the cylinder, 1220x838 on the 24x16 sphere) where this tree drives its packer toward a square, and whether this engine should ship a non-square texture is a decision about the texture rather than a defect in the packer.",
        upstream: "Nothing blocks it -- this is entirely local to physics/mesh/uvLscm.mjs, and the instrument to grade it by already shipped at v4560. vendor/xatlas is vendored (MIT, Jonathan Young, pinned f700c779) as a REFERENCE ORACLE and not a dependency: it is C++, there is no emscripten here, and nothing in the engine loads it. tools/mesh/xatlasRef-selfcheck.mjs is where a round on this would be graded, and its record (tools/mesh/xatlas-oracle.json) already carries xatlas\'s number for every fixture so the comparison costs nothing to re-take.",
    },
    {
        id: "sharp-edge-isosurface-survey",
        blocker: "OPEN",
        what: "Read two published alternatives to physics/mesh/dualContour.mjs's sharp-feature preservation, as a COMPARISON and not a replacement. Neither is vendorable; the point is that the comparison is on record instead of being re-derived.",
        how: "Faithful Contouring (FaithC, arXiv:2511.04029, CVPR 2026 Oral) and Aviz.Cms (Cubical Marching Squares). Read the technique, measure this tree's own dualContour against whatever property each claims, and write down where it loses -- the same posture nextRounds takes for CelloCut below.",
        why: "dualContour.mjs (v3432) exists for a measured reason its own header records: marching tetrahedra cuts a sharp corner by a FIXED FRACTION OF A CELL -- 0.377, 0.386, 0.387, 0.379 and 0.363 across a 4x refinement -- so HALVING THE GRID BUYS NOTHING, and the QEF minimisation is what fixes that rather than more resolution. Its gate carries 5 QEF/sharp-feature rows. That makes it exactly the kind of module where somebody will eventually ask whether a newer method is better, and answering from scratch costs a day.",
        upstream: "Nothing blocks the READ. VENDORING is blocked for both and for different reasons, and NEITHER LICENCE IS SETTLED ENOUGH TO ACT ON: https://github.com/Luo-Yihao/FaithC is Torch/CUDA (wrong language regardless) and carries an UNRESOLVED LICENCE DISCREPANCY -- the sweep that raised it recorded the paper as CC BY-NC 4.0, which would block vendoring outright, while a later look at the repo said Apache 2.0. Read the repo's own LICENSE file before trusting either summary; this entry deliberately does not pick one. https://github.com/metalisai/Aviz.Cms is Apache-2.0 but C#. So the deliverable is a comparison, not code.",
    },
    {
        id: "f82-tint-metal-fresnel",
        blocker: "CLOSED",
        what: "The F82-tint model for metal Fresnel -- the OpenPBR / Autodesk Standard Surface correction for Schlick's known inaccuracy on metals at grazing angles.",
        how: "It is a small closed-form edge-tint term, not a system: it sits directly beside the GGX + Smith lobe physics/render/microfacet.mjs already has and the multi-scatter compensation physics/render/energyCompensation.mjs already has. Grade it the way this tree graded the split-sum approximation -- against a number the tree already holds by another route, not against a tolerance.",
        why: "*** THE ABSENCE IS MEASURED, NOT ASSUMED, AND THE ONE GREP HIT IS A FALSE POSITIVE WORTH RECORDING. *** A case-insensitive search for f82, edgeTint or edge-tint across all of physics/ and render/ returns exactly ONE line, and it is a hex digest in a selfcheck comment (0df825cb06fa3785...) that happens to contain the characters f82. There is no edge-tint code in this tree. microfacet.mjs matches GGX/Smith/G1/G2 45 times, so the lobe this would correct is real and shipped.",
        closedAt: "v4575 -- READ, BUILT AND GRADED, AND NOTHING WAS VENDORED SO THE LICENCE QUESTION THIS ENTRY "
            + "RAISED DID NOT ARISE. The model is four lines of closed form; what took the round is that THE "
            + "TREE HAD NOTHING TO GRADE IT AGAINST. The entry asked for it to be measured 'against a number "
            + "the tree already holds by another route' and there was no such number: physics/render/fresnel.mjs "
            + "is exact and DIELECTRIC, and every metal in the engine is Schlick with a three-channel F0 -- a "
            + "curve fitted through ONE point. So physics/render/conductorFresnel.mjs builds the exact conductor "
            + "curve from the boundary conditions FIRST, and the route the entry wanted turns out to exist after "
            + "all: a conductor with kappa = 0 IS a dielectric, and the new closed form reproduces fresnel.mjs "
            + "over 306 (index, angle) pairs to 2.22e-16. Dropping the p-polarised branch takes that to 3.52e-1. "
            + "*** WHAT SCHLICK GETS WRONG ON A METAL IS THE SIGN OF THE SLOPE, NOT THE SIZE OF THE ERROR: *** "
            + "aluminium's green channel falls from 0.914 to 0.862 while Schlick rises to 0.954, because Schlick "
            + "interpolates F0 upward and has no shape that can dip. 0.0931 against F82-tint's 0.0065. The claim "
            + "is tested over a 4,800-point (eta, kappa) sweep rather than four hand-copied metal triples, and "
            + "it is NOT universal: 4,691 better, 105 WORSE, 4 level -- and all 105 losses sit at kappa <= 2.4 "
            + "on a grid running to 8.0, the weak-absorber corner where the curve is nearly the dielectric one "
            + "Schlick was designed for. Gold's blue channel is in that band and gains 1.02x. NOTHING IN THE "
            + "ENGINE USES IT YET and that is stated rather than implied; the safe default is proven instead -- "
            + "tint = 1 IS Schlick, identically. Substituting it in pathTracer and microsurfaceWalk is a "
            + "separate round with a picture to look at.",
        upstream: "Nothing blocks READING it. Licence for https://github.com/portsmouth/F82-tint-generator is NOT CHECKED and this entry does not claim it -- verify before vendoring, not before reading. One relevant signal, measured rather than inferred: world/licenceSweep.mjs already carries THREE portsmouth repos -- EON-diffuse, OpenPBR-viewer and snelly -- all recorded MIT with licenceExists true, and F82-tint-generator is NOT among them. Same author, consistent history, still unverified for this repo.",
    },
    {
        id: "engine-version-readers",
        state: "CLOSED",
        note: "DONE at v4556, AND THE FILED COUNT WAS ITSELF INFLATED BY PROSE -- which is the round's first "
            + "finding and its most familiar one. This entry said 38 of 44 readers, 35 remaining. Re-taken by "
            + "running every marker regex in the tree against the real main.js: 87 readers, 44 wrong, 35 files "
            + "-- until COMMENTS WERE STRIPPED, and then 51 readers, 32 wrong, 31 files. main.js's own "
            + "changelog blocks QUOTE these patterns in prose, and a raw scan counted the narration as three "
            + "readers in main.js and three more in brain/brain.js. Counting a pattern described in a comment "
            + "as an instance of the pattern is this tree's most repeated census defect, made again by the "
            + "round auditing it. A SECOND over-count was caught in the same pass: comparing what a reader "
            + "returned against the literal string of the live version called a digits-only capture WRONG, "
            + "because it yields the number without its letter -- a different capture convention, not a "
            + "defect. Raw comparison said 45; normalised, 44. *** AND THE CENSUS STILL MISSED THREE, BECAUSE "
            + "IT ONLY EVER ASKED main.js. *** brain/brain.js carries the same marker with the same "
            + "prepended-changelog shape -- commented copies BOTH ABOVE AND BELOW the live line -- and three "
            + "files read it unanchored and got v4487: ai-bridge/shipBridge.js, tools/ship/ship.mjs and "
            + "tools/ship/staleness.mjs. A census that tests readers against one file cannot see the readers "
            + "of the other, and only the tree-wide ratchet found them. THE FIX IS ONE DEFINITION: "
            + "tools/ship/versionMarker.js, holding the pattern, a parse over a source string, and a reader "
            + "per marker. It is CommonJS on purpose -- the readers split 26 ESM to 9 CommonJS, the latter all "
            + "in a directory that already uses that extension for shared helpers, and one such module can be "
            + "required by those nine AND default-imported by the twenty-six, where an ESM module would have "
            + "forced dynamic import into synchronous functions and a second copy beside it would be the very "
            + "duplicate markerSingleSource-selfcheck exists to forbid. Forty-two call sites across "
            + "thirty-eight files now share it. *** THE CONVERSION BROKE TWO THINGS AND THE GATE CATCHES BOTH "
            + "SHAPES. *** Three call sites consumed the number rather than the string, so the shared "
            + "capture's letter turned parseInt into NaN -- silently, in a version stamped onto reports. And "
            + "tools/ship/releaseLedger-selfcheck.mjs EXISTS to contrast an anchored read with an unanchored "
            + "one; pointing both at the shared pattern made its own row pass vacuously, turning a gate about "
            + "this defect into a gate that cannot see it. It keeps both spellings, is the ONE named "
            + "exemption, and the ratchet proves the exemption is earned by running its two literals against "
            + "the real file and requiring different answers. *** AND FIXING THE READERS EXPOSED A FRESHNESS "
            + "CHECK THAT COULD NOT FIRE. *** tools/ship/registerDrift-selfcheck.mjs holds the register's "
            + "audit to no more than 12 rounds old and was GREEN -- because its reader returned v4487 and the "
            + "audit was frozen at v4487, so a stale record measured against a stale reading of the tree "
            + "reported zero drift. Corrected, it said 48 rounds, which had been true for months. A clock as "
            + "stale as the thing it times cannot ring. NOT DONE: the artefacts already emitted under the "
            + "wrong reading -- OKF bundles, ledger entries, fingerprints, bench collections -- are NOT "
            + "retro-corrected. They record what the tree said at the time, and rewriting them would invent a "
            + "history in which this never happened.",
    },
    {
        id: "chunk-index-unbounded",
        state: "CLOSED",
        note: "DONE at v4555, AND THE ROUND'S SCOPE MOVED TWICE UNDER MEASUREMENT. As filed it was about rain: "
            + "Chunk.index() does no range check, so world.isAir answers FALSE above the ceiling and drops "
            + "land the instant they spawn. All of that is confirmed -- isAir(0, y, 0) false at y = 64, 65, 69 "
            + "and 84 on a world 64 tall; 335 spawned and 335 LANDED with none in flight; HydraulicErosion "
            + "making 1,674 discarded carves per boot with min, median AND max y all exactly 65 -- but rain is "
            + "a rounding error in the real blast radius. *** MEASURED IN A NINE-SECOND BOOT: 36,754 OF 100,982 "
            + "VOXEL READS (36.4%) WERE OUT OF RANGE. *** Every one on Y and every one off the end of the "
            + "array; x and z were in range on all 100,982, so the aliasing case (index() puts x fastest, so an "
            + "out-of-range x lands on a NEIGHBOURING voxel INSIDE the array) is real in the arithmetic and "
            + "does not arise in this engine -- a negative worth having, since it is the undetectable half. "
            + "The reads came from getLavaProximity (21,600), getWaterProximity (13,122), HydraulicErosion "
            + "(1,441), getCaveFactor (1,350), RainSystem (270) and FluidSystem (270). *** AND THE SAME "
            + "`undefined` MET TWO COMPARISONS, ONLY ONE OF WHICH WAS SAFE, WHICH IS WHY THIS SURVIVED: *** "
            + "_proximityScan asks `v === VOXEL.WATER`, which undefined fails, so 34,722 of the 36,754 bad "
            + "reads went somewhere harmless. getCaveFactor asks `v !== VOXEL.AIR`, which undefined PASSES, so "
            + "every sample above the ceiling counted as SOLID -- and its own comment says 0 is open sky and 1 "
            + "is fully enclosed, driving reverb. In an open-sky column topping out at y=24 it read 0 at y=54, "
            + "0.286 at y=59, 0.571 at y=62 and 0.857 at y=64: A LISTENER IN CLEAR AIR TOLD IT IS IN A CAVE, on "
            + "a ramp that is exactly the fraction of its 9x9x9 sample box past the ceiling, matching the "
            + "arithmetic to three decimals. After the bounds check all four read 0 and the control at y=27 "
            + "over real terrain holds at 0.331 both ways. *** THEN THE FIX WOKE A SYSTEM THAT HAD NEVER RUN "
            + "AND THE WORLD FLOODED. *** FluidSystem's particle count was 0 on every sample of a "
            + "thirty-second boot and the water voxel count sat at exactly 46,223 -- what generation put there "
            + "-- and never moved, because rain fed addWater at the spawn height of 65 where the system read "
            + "`undefined`, took its non-air branch, and killed every particle on tick one. With the index "
            + "bounded: 46,223 -> 108,086 -> 190,949 -> 258,808 -> 325,344 over thirty seconds, linear, about "
            + "10,000 voxels per second on 3,686,400 cells, with simulate() going 0.03 ms to 0.7 ms. TWO "
            + "SEPARABLE FAULTS AND ONLY THE SMALLER IS FIXED: the descent trail (update() placed water BEFORE "
            + "asking whether the particle could fall, so a drop painted a five-voxel PILLAR in open air, "
            + "measured at y = 2,3,4,5,6 in the spawn column) is repaired by falling first, and it was worth "
            + "23% -- 325,344 to 249,726 -- and left the curve just as linear. The flood is the LATERAL "
            + "SPREAD: a settled particle spreads into up to four air neighbours, each placing water and "
            + "spreading again, with nothing removing water behind the frontier. ONE drop on a flat floor wets "
            + "41 cells by tick 10, 421 by 20, 2,381 by 40 and 11,101 by 80, still accelerating. MAX_PARTICLES "
            + "bounds the FRONTIER, not the wetted area, which is why this file's own v2 cap did not stop it. "
            + "So the wetting path SHIPS OFF, explicitly, with the numbers beside the flag: that restores "
            + "exactly the behaviour this engine has always had while the two defects the bounds check really "
            + "fixes stay fixed, and shipping a flooding world to repair a reverb bug would be the worse "
            + "trade. Thirteen rows, EIGHT sabotages red by name -- and a NINTH went zero-red first: guarding "
            + "index() itself instead of get/set broke nothing, because the gate ASSERTED IN PROSE that "
            + "index() stays pure arithmetic and checked it nowhere. The aliasing is proved on index() now. "
            + "One claim was also dropped rather than softened: an earlier draft said the out-of-range writes "
            + "force a re-mesh, and the instrument found 0 dirty transitions across all 1,891 of them -- they "
            + "landed on chunks that were already dirty. *** AND THE ROUND'S OWN VERIFYING SWEEP FOUND A "
            + "TENTH THING: *** recordDrift-selfcheck went NEW RED inside it and passed every time it ran "
            + "alone, because recordDrift.mjs parsed sweep-timings.json bare -- the same torn read "
            + "recordReach.mjs was repaired for at v4550, in a module that had its own second reader and "
            + "never used the shared readTimings(). Fixed with a retry that reports UNREADABLE by name "
            + "rather than crashing, with both cases driven in the gate; the first retry BUSY-WAITED, which "
            + "blocks the event loop, and the test written to prove the heal is what caught it. Spun out: "
            + "fluid-has-no-sink, below.",
    },
    {
        id: "cjs-outside-every-census",
        blocker: "CLOSED",
        what: "Ten .cjs files in ai-bridge/ are invisible to every corpus this tree censuses. SOURCE_EXT is "
            + "/\\.(js|mjs|html)$/ in tools/ship/moduleRefs.mjs and /\\.(mjs|js)$/ in tools/ship/treeRead.mjs, "
            + "and the walk runtimeGap-selfcheck and recordDrift share matches the same set -- so file counts, "
            + "the assertion-shape census, the runtime-capability census and the knowledge index all skip them.",
        how: "Add the extension to the corpus definitions -- there are three and they should agree, which is "
            + "its own small finding -- then RE-TAKE every census that moves, one at a time, recording what "
            + "each one gains. The counts are frozen records, so this is not a one-line change: it is a "
            + "one-line change plus the honest re-take of everything downstream of it.",
        why: "*** FOUND BY WALKING INTO IT AT v4556. *** That round's shared version reader was first written "
            + "as tools/ship/versionMarker.cjs, and the file count moved by ONE where a module-plus-gate round "
            + "moves it by two: the module was there, imported by forty files, and no census could see it. "
            + "Renaming it to .js fixed that instance -- no package.json in this tree declares type module, so "
            + "a .js file is CommonJS here anyway and the extension bought nothing -- but the ten in "
            + "ai-bridge/ are still outside. What makes this worth a round rather than a shrug is the shape: "
            + "a census that cannot see a file cannot report it as missing either, so the gap is silent in "
            + "both directions, which is the same property that let 31 stale version readers survive.",
        done: "DONE at v4564, and the count in `what` above was wrong: there are SIX .cjs files in ai-bridge/, not "
            + "ten, and they are 1,477 lines of production code -- a WAD geometry parser, a WAD texture decoder, an "
            + "install checker, a tool prober, a Trellis source patcher and a mesh-generator readiness probe, every one "
            + "`require`d by ai-bridge/server.js at startup. The judgement `upstream` asks for was taken: they ARE "
            + "engine sources, because they run in production, and the corpus definitions now say so rather than "
            + "omitting the extension silently. *** AND THE BIGGER HALF WAS NOT THE CENSUS AT ALL. *** tools/check.mjs, "
            + "the tree's own syntax guard, walked `extname(p) === \".js\"` -- so of 4,143 source files it checked "
            + "1,527 and reported that as \"files checked\". The 2,608 .mjs files, which is every module written "
            + "since this project moved to ES modules, had NEVER been parsed by the thing whose job is parsing them. "
            + "Its CommonJS split was by DIRECTORY (everything under ai-bridge/ is a script), harmless only while the "
            + "walk could not see the 56 .mjs files there, and widening the walk without fixing the split would have "
            + "handed real ES modules to a script parser. The rule is one rule now in tools/ship/sourceKind.mjs and "
            + "the guard takes both its walk and its split from it: 1,527 files checked before and 4,155 after, ALL "
            + "GREEN -- a null result whose value is that the number it reports is the number it means, at 11 s to "
            + "31 s. Measured elsewhere: vba/runtimeGap.mjs's census moved files 4,044 -> 4,050, closures 3,629 -> "
            + "3,633 and TYPED ARRAYS 1,032 -> 1,034 with no file written, and ES modules did NOT move, which is the "
            + "control -- CommonJS files do not import or export. Nothing else moved: none of the six carries a frozen "
            + "record and none names a vendor path. FOUR SABOTAGES RED BY NAME, and the gate's own fixture caught the "
            + "shared predicate reading a RELATIVE \"ai-bridge/...\" path as a module, which no caller in the tree "
            + "would have shown. *** THE LIMIT IS STATED RATHER THAN GLOSSED: *** a dozen gates own PRIVATE walks with "
            + "their own extension rules -- orphanTriage, graveyard, shaderCensus, wgslCorpus, citedSources and more -- "
            + "and a .cjs file is still invisible to most of them. This round changed the SHARED definitions and the "
            + "vendor-dependant scan, because those are what other files build on.",
        upstream: "Nothing blocks it. The judgement it needs is whether .cjs SHOULD be in the corpus at all -- "
            + "these are bridge helpers rather than engine code, and a defensible answer is that the corpus is "
            + "deliberately the engine's own sources. If that is the answer then the definitions should SAY so "
            + "rather than omit the extension silently, because today nothing distinguishes a deliberate "
            + "exclusion from an oversight, and that is the actual defect.",
    },
    {
        id: "shader-files-outside-every-census",
        blocker: "CLOSED",
        what: "CLOSED AT v4581, AND THE NUMBER IN THIS ENTRY WAS WRONG IN BOTH DIRECTIONS. A standalone shader "
            + "file was in no reachability census in this tree: tools/ship/orphanScan.mjs's population was CODE, "
            + "and CODE was .js and .mjs. It is scanned now -- one implementation, two populations -- and the "
            + "answer is ELEVEN of 26 loaded by nothing, not the ten filed here. My ten included "
            + "brain/transport/shaders/filter-packed.wgsl, which tools/ship/wgslCorpus.mjs really does open with "
            + "readFileSync, and MISSED shaders/transitions/swekWipe.glsl and shaders/waterReflectRefract.frag"
            + ".glsl. BOTH MISSES HAVE ONE CAUSE: my v4579 scan did not strip comments, so four `//` lines "
            + "naming waterReflectRefract and one naming swekWipe.glsl counted as references. That is the "
            + "defect orphanScan's own header spends a paragraph on -- \"PROSE IS NOT REACHABILITY, and this "
            + "cost a round to learn\" -- committed by the person reading it.",
        how: "*** AND FILING THIS ITEM IS WHAT WOULD HAVE HIDDEN ITS OWN SUBJECT. *** The entry listed all ten "
            + "paths in its `what`, and FOUR of them -- shaders/ghost.frag.glsl, shaders/selection.frag.glsl, "
            + "shaders/selection.vert.glsl, shaders/biome.vert.glsl -- are named by nothing else in the tree. "
            + "The moment shaders entered the population, the backlog entry scheduling the round would have "
            + "made its subjects read as reached. That is the FIFTH face of a trap orphanScan's header already "
            + "describes four times: its own header comment, prose docs, its own output, and a tooltip. "
            + "tools/ship/nextRounds.mjs is a report module now, with render/exactHash.mjs -- whose "
            + "SHADER_SINHASH_V4578 carries a `notLoaded` array, a record whose CONTENT is \"nothing loads "
            + "these\" and which was the reason the scanner believed something did -- and tools/ship/gateSweep"
            + ".mjs, whose closing records hold 348 gate paths as history. Zeroing those three revealed "
            + "tools/mutate/mechanicalSweep.mjs among the MODULES, correctly: its only three importers are all "
            + "gates, and tools/mutate is the same class of directory as tools/ship, where being read by a gate "
            + "IS the module's purpose. The gate-tool rule named one directory where two qualify.",
        why: "shaders/biome.frag.glsl is the worked example and it cost a round to find. It picks desert / "
            + "plains / forest on `b < 0.33` and `b < 0.66` -- a THRESHOLD on a sin-hash, which v4569 "
            + "established is where CPU/GPU divergence changes what EXISTS rather than how it looks -- and it "
            + "carries \"BIOME DETECTION (matches JS logic conceptually)\", the same kind of claim "
            + "render/holoFoilShader.js's \"matching the model's hash2\" turned out to be false about. So "
            + "v4578 filed it as a threshold site worth its own round. NOTHING LOADS IT, and the tree had no "
            + "way to say so.",
        upstream: "WHAT IS NOT DONE: the eleven are a BASELINE, not a deletion list. orphan-baseline.json "
            + "carries them with the reason stated -- a shader kept as a reference, a demo somebody means to "
            + "rewire and a leftover from a deletion look identical from outside, and that judgement is Keith's "
            + "rather than a scanner's. The ratchet refuses growth; shrinking the list is the point. Also not "
            + "done: the dozen gates that own PRIVATE walks with their own extension rules are still blind to "
            + "shader files -- this round changed the SHARED census, which is what the others build on, and "
            + "#31's own note said the same thing about .cjs.",
    },
    {
        id: "sin-hash-everywhere-else",
        blocker: "CLOSED",
        what: "CLOSED AT v4582. fract(sin(dot(p, K)) * 43758.5453) amplifies the last bits of its input by four "
            + "orders of magnitude, and this entry has been re-counted three times because each count was taken "
            + "with a different rule: 29 files filed, 16 shipped at v4569, TWELVE at v4578 once prose was "
            + "separated from shader source, and of those twelve TWO were files no runtime code loads at all "
            + "(v4579). What the rounds actually fixed: three CPU/GPU twins at v4569-v4570 (grass 65.4% of its "
            + "draw decisions flipped, wormhole 70.0% of 14,400 lattice points, nebula 3,006 CPU stars against "
            + "2,509 GPU with 378 shared); a FOURTH twin at v4578 that the ratchet could not see because its "
            + "halves live in two files (holofoil, 29 of 184 flakes in the same place -- 15.8%); three "
            + "hand-copied starfields at v4579; and the engine's own night sky at v4580.",
        how: "*** THE THRESHOLD CLASS IS EMPTY AND THE LAST TWO-LANGUAGE SITE IS SHARED. *** v4582 took "
            + "nebula-device.html, the only one of the six remaining sites carrying the idiom in GLSL AND WGSL "
            + "and the only one whose page makes a cross-backend claim -- \"only the shader text differs per "
            + "backend, everything else is written once\". Two transcriptions of one hash, two compilers, and "
            + "nothing comparing them; sin() at those magnitudes is implementation-defined, so the page could "
            + "not have told you whether its own claim held. Both halves splice render/exactHash.mjs's exported "
            + "GLSL and WGSL now, so the two backends agree BY CONSTRUCTION rather than by hoping two "
            + "implementations of sin round alike.",
        why: "*** THE FIVE THAT REMAIN ARE A DECISION, NOT A REMAINDER, AND IT CARRIES ITS EVIDENCE. *** "
            + "atmosphere/AtmosphereSystem.js, demos_code/ant_colony.js, demos_code/slime_mold.js, "
            + "render/CloudVolume.js and render/voxelrenderer.js each average, mix, or add the hash as a small "
            + "offset -- a lightning jitter through a smoothstep, a heading nudge on a tie-break branch, a "
            + "dithered ray start over 48 march steps, a +/-4% per-voxel tint. v4580 measured that the idiom's "
            + "deficit is a TAIL effect that DEEPENS with the cut (0.987 of the fraction asked for at a cut of "
            + "0.900, 0.437 at 0.997, 0.243 at 0.999), so the property that made the other seven worth changing "
            + "does not reach a consumer that never thresholds. And measured rather than assumed: NOT ONE of "
            + "the five carries the idiom in two languages, so there is no second half to disagree with -- one "
            + "language, one shader, no CPU twin. tools/ship/exactHash-selfcheck.mjs section 5e holds both "
            + "facts, and requires each site to STILL carry the idiom, so this reads as a decision rather than "
            + "quietly passing once somebody changes one.",
        upstream: "WHAT IS NOT CLAIMED: that the five are correct. sin at these magnitudes is "
            + "implementation-defined ACROSS DEVICES, so two GPUs can draw different noise at every one of "
            + "them -- that is a real cost, recorded rather than repaired, and the repair is three lines a file "
            + "if a reason ever appears. What would supply one is a page that shows the same picture on two "
            + "devices and claims it, which is exactly what nebula-device.html did and why that one was fixed.",
    },
    {
        id: "fluid-has-no-sink",
        blocker: "CLOSED",
        what: "world/fluidSystem.js is a breadth-first flood fill, not a fluid. A settled particle spreads "
            + "into up to four air neighbours, each of which places a water voxel and spreads again, and "
            + "nothing ever removes water. ONE drop wets 41 cells by tick 10, 421 by 20, 2,381 by 40 and "
            + "11,101 by 80. It is switched OFF at v4555 (world.fluid.wetting, default false) rather than "
            + "repaired, because the round that found it was a bounds check.",
        how: "Conservation is the question, not the spreading. Options worth measuring against each other: a "
            + "per-particle water BUDGET so a drop can wet a bounded number of cells and no more; a settle "
            + "test that refuses to spread onto a cell whose neighbours are already water (a pool has an "
            + "edge); evaporation or drainage as an explicit sink with a rate; or a level-based pooling model "
            + "that fills to a surface rather than wetting cell by cell. Whichever is chosen, the gate row "
            + "that exists today -- one drop on a flat floor wets more than twenty cells in ten ticks -- is "
            + "written to go RED when the system gains a sink, so the round has a target that already fails.",
        why: "*** THE NUMBERS ARE MEASURED IN THE ENGINE AND ON A FIXTURE, AND THEY AGREE. *** In a real boot "
            + "with the index bounded and wetting on, water went 46,223 -> 108,086 -> 190,949 -> 258,808 -> "
            + "325,344 over thirty seconds -- linear, no equilibrium, about 10,000 voxels per second on a "
            + "world of 3,686,400 cells, taking simulate() from 0.03 ms to 0.7 ms. On a flat-floor fixture one "
            + "single drop reaches 11,101 wetted cells by tick 80 and is still accelerating, which is roughly "
            + "the area of a disc growing a cell per tick. The file's v2 header records that its author "
            + "already fought exponential growth once and added MAX_PARTICLES; that cap bounds the FRONTIER "
            + "and the wetted area is unbounded behind it. Fixing the separate descent-trail bug (five voxels "
            + "of pillar per drop) took the thirty-second flood down only 23%, which is what says the spread "
            + "is the cause rather than the trail.",
        done: "DONE at v4563, and the defect was that this code CREATED WATER rather than that it failed to remove it. "
            + "The spread handed each of up to four air neighbours a WHOLE NEW PARTICLE, every one of which placed its own "
            + "voxel: one drop became four, then sixteen. TWO things were missing and they bound different quantities. "
            + "CONSERVATION bounds one drop -- a particle carries a volume, a placed cell costs one unit of it, and what is "
            + "left is RATIONED to as many neighbours as it can actually fill rather than divided among all of them. Cells "
            + "wet by a drop <= its volume, and the bound is TIGHT at volumes 1, 2, 4 and 5 on a flat floor (1, 2, 4, 5 "
            + "cells) and slack above that (8->5, 16->12, 32->20) because water blocks its own neighbours and the stranded "
            + "volume dies. Rationing rather than dividing is what makes it tight: the first version divided the remainder "
            + "among EVERY air neighbour, which gives each less than a cell as soon as the volume is small, so at the "
            + "default volume 4 a drop wet exactly ONE cell and the spread branch was dead code. A SINK bounds the system "
            + "over time, which conservation alone does not: cells this system placed are remembered and returned to AIR "
            + "after dryTicks. Measured on the same flat-floor fixture -- one drop: 13 wet by tick 10, 313 by 20, 2,113 by "
            + "40, 10,513 by 80 and 74,113 by 200 BEFORE, exactly its volume AFTER; rain at one drop per tick: 160,684 "
            + "cells by tick 200 and still climbing BEFORE, and AFTER an equilibrium that OSCILLATES rather than settling "
            + "-- 512 standing at dryTicks 600, 143 at dryTicks 50, against the 4,800 that 1,200 drops would leave if "
            + "nothing dried. SIX SABOTAGES RED BY NAME, and two of them found holes in this round's own gate first: the "
            + "\"removes only what it placed\" row seeded its water in a far chunk, so a sink drying a NEIGHBOURING cell "
            + "went 0 RED until the seed was moved to where the rain actually lands (and the first attempt at that seeded "
            + "nine cells across a chunk boundary and wrote four, because v4555 correctly refuses an out-of-range set); and "
            + "nothing at all drove the sink's \"is it still water?\" guard until a fixture built a STONE block on a "
            + "puddle and watched the queue leave it alone. THE ROW THAT ASKED FOR THIS ROUND DID ITS JOB: "
            + "world/chunk-selfcheck.mjs asserted `placed > 20` and said in its own text that it would go red when "
            + "somebody gave the system a sink. It did, on the day the sink landed, and it now asserts the bound instead. "
            + "*** STILL OFF, AND FOR A NEW REASON. *** Not because it floods -- that is fixed and gated. Because no "
            + "particle of this system has ever run in the engine, so switching it on is a behaviour change nobody has "
            + "looked at. That is Keith's call and the numbers for it are in world/fluidSystem-selfcheck.mjs. ALSO NOT "
            + "CLAIMED: that this is a fluid. It has no pressure, no levelling and no flow rate -- a puddle wets outward "
            + "from where a drop fell until its volume runs out rather than finding its own surface.",
        upstream: "Nothing blocks it, and it is not urgent while the flag is off -- but the flag is the thing "
            + "to be honest about: this system is dead code today, and it was dead code before v4555 too "
            + "without anybody knowing. The round should decide whether rain-driven wetting is wanted at all "
            + "before building conservation for it. If it is not, DELETING FluidSystem and RainSystem's seed "
            + "call is the smaller and better change, and that is a product decision rather than an "
            + "engineering one. Related and also unmeasured: whether HydraulicErosion converges now that it "
            + "carves at real surface heights instead of at y=65 -- solid voxel counts held constant across "
            + "every window taken at v4555, which is not the same as proven.",
    },
    {
        id: "unstamped-generated-records",
        blocker: "CLOSED",
        what: "29 of the 35 JSON records under tools/ship/ carry NO provenance stamp, so the property-based rule "
            + "tools/ship/orphanScan.mjs uses to tell a RECORD of references from a MAKER of them covers six of "
            + "them. v3900 replaced a name list with that property precisely because a name list needs editing "
            + "every time somebody writes a report, which is the maintenance nobody does -- and then 29 records "
            + "arrived without the property.",
        how: "The convention already exists and costs one line: populationCensus stamps generatedFrom, the "
            + "baselines stamp captured. Add it at each WRITER, first key rather than merely present -- the "
            + "check reads the first 4 KB and input-sets.json's note alone runs to ~700 characters -- then let "
            + "orphanScan drop the file from its corpus by property. The narrower half is a gate: a record "
            + "under tools/ship/ that is written by a tool and names module paths must declare its provenance, "
            + "which is checkable and would have caught v4567 the day it landed. tools/ship/frozenRecords.mjs "
            + "already walks these records and knows which are generated.",
        why: "*** ONE UNSTAMPED RECORD TOOK orphanScan TO ZERO CANDIDATES OVER 4,058 FILES. *** input-sets.json "
            + "shipped at v4567 as a 3.5 MB list of every path every gate reads, with no stamp. Every module "
            + "named in it scanned as REACHED, the orphan candidate set collapsed to nothing, and "
            + "baselineHygiene reported all seven suppressions stale -- prescribing the deletion of protection "
            + "on files that are still orphans, two of which the v3159 sweep already deleted once and had to be "
            + "restored from a shipped zip. THIS IS THE THIRD TIME: v3126 excluded orphan-baseline.json by "
            + "name, v3900 found two more had walked in and made it a property, v4009 found a hand-written "
            + "report the property could not see, and v4571 found the property working perfectly against a "
            + "record that simply did not carry it. Each round fixed the instance in front of it. The remaining "
            + "28 are the instances not yet in front of anybody.",
        closedAt: "v4572 -- AND THE FILED PREMISE WAS WRONG IN BOTH DIRECTIONS, WHICH THE MEASUREMENT SAID "
            + "BEFORE ANYTHING WAS CHANGED. It said 29 of 35 and the count is 28 of 36; more to the point it "
            + "implied 28 latent instances of the v4567 collapse. MEASURED FIRST, by stamping every unstamped "
            + "record in place and re-running the scan: the candidate set did not move. ZERO orphans were "
            + "hidden. Every module those records named was reached by real code anyway, so the round is "
            + "PREVENTION and says so rather than claiming a rescue. *** AND THE REAL DEFECT WAS IN THE CHECK, "
            + "NOT IN THE RECORDS. *** orphan-baseline.json -- the file v3126 excluded by name and v3900 "
            + "replaced that name with a property for -- CARRIES `captured`, at byte 6,940, because its note "
            + "runs six and a half kilobytes first. isGeneratedRecord read text.slice(0, 4096), so the property "
            + "returned FALSE and the file stayed out of the corpus solely because its NAME was still sitting "
            + "in the SKIP regex: the list the property replaced, quietly propping up the property that "
            + "replaced it, for three rounds, because the two agreed about the outcome and disagreed about the "
            + "reason. v4571 walked straight past this -- it put generatedFrom FIRST in input-sets.json and "
            + "wrote a comment explaining that the note runs ~700 characters so the key must land inside the "
            + "window, treating a defect in the CHECK as a placement rule for every future writer. A record is "
            + "JSON; its top-level keys are exactly knowable by parsing it, at no window at all. The rule "
            + "parses now, the name is out of SKIP, and stripping that one `captured` key takes the candidate "
            + "set from 7 to ZERO -- so the property is demonstrably what holds it. The vocabulary gained "
            + "`producedBy` (gate-plan-snapshot declares it) and REFUSED `producedAt` and `refreshedAt`: a "
            + "timestamp says when a file was written and nothing about who wrote it, and widening this set "
            + "makes the scanner blinder. 19 records stamped AT THE WRITER as well as in the file, because a "
            + "key added to a file a tool rewrites is erased on the next run. The judgement this entry said it "
            + "needed -- which records are genuinely generated -- did not arise: the vocabulary already "
            + "distinguishes them, `generatedFrom` for a tool and `captured` for the five read-only three.js "
            + "fixtures, and calling a hand-maintained baseline `captured` is not a lie about its provenance. "
            + "prose-debt-baseline.json was a bare ARRAY and could carry no key at all; it names 27 modules and "
            + "has exactly one reader, so it was converted rather than given a permanent exception. "
            + "host-timings.local.json is out of scope: .local.json is this tree's convention for per-machine "
            + "state, three files carry it and all three are in .gitignore. Gated by "
            + "tools/ship/recordProvenance-selfcheck.mjs, 204 ms, which reads the vocabulary OUT OF "
            + "orphanScan.mjs rather than retyping it -- two lists that must agree is two lists that will not.",
        upstream: "Nothing blocks it. The judgement it needs is which records are genuinely GENERATED -- a "
            + "fixture somebody hand-wrote is not, and stamping it would be a lie about its provenance that "
            + "future rounds would read as licence to regenerate it. The tsl-*-fixture.json family is the "
            + "population to decide about first, and deciding is most of the round.",
    },
    {
        id: "hand-spelled-writers",
        blocker: "CLOSED",
        what: "A field-parity check between what each record file's WRITER emits and what its READERS consume. Three times in one session a writer that spells its fields by hand dropped one a reader needed, and every time the failure looked like success rather than like an error.",
        how: "The three instances share a shape: one module writes a JSON record with an object literal listing its fields, another reads a field that literal does not carry. Both halves are statically visible -- the writer's literal and the reader's property accesses on the parsed object -- so a census can compare them per record file, the way tools/ship/frozenRecords.mjs already walks records and tools/ship/recordReach.mjs already joins them to their guardians. Start with the files that have two writers (sweep-timings.json has quickSweep and sweepRotation; tsl-emitted-race.json has five sections of one gate), because a second writer is what turns a dropped field from a bug into a deletion.",
        why: "*** THREE INSTANCES AT v4566-v4568, AND NONE OF THEM REDDENED ANYTHING. *** (1) tools/ship/tslRace-selfcheck.mjs writes tsl-emitted-race.json in five sections, section 1 WHOLESALE and 5-8 merging into what it left; a contended run died after section 1 and the `atlas` key was deleted. tools/ship/wgslCorpus.mjs dropped tslSource.spriteAtlas behind an `EMITTED_RACE.atlas &&` presence guard and the corpus got one case smaller -- crossBackend asserts `results.length === corpus().length`, the corpus measured against itself, which holds at any size. Found by reading a git status line. (2) inputSets.encode listed its fields by hand and went on writing `spawned` after the recorder and the rule renamed it `spawnedNonNode`, so the flag was dropped on write, whyRun read nothing, and EVERY SPAWNING GATE BECAME SKIPPABLE -- browser gates included. The skip count went 956 to 1,121 and looked like the round succeeding. (3) quickSweep computed `finished` in its write loop and left it out of the object it actually writes, erasing 140 rows on the first sweep after KILLED_PASS_V4568 and returning sweepCoverage's graded/no-verdict split to knowing nothing. EACH ONE LOOKED LIKE A SMALLER SET OR A BETTER NUMBER, which is the direction that ships.",
        closedAt: "v4572 -- AND THE ROUND AS FILED WAS NOT REACHABLE, WHICH WAS MEASURED BEFORE IT WAS ABANDONED. The filed check was writer-literal against reader-accesses, both static. This tree has 584 writeFileSync call sites; 85 hand JSON.stringify an object literal; 15 name a path a static reader can resolve. tools/ship/quickSweep.mjs -- the writer of the third instance below -- is one of the misses, because its path arrives through DEFAULTS.timingsFile and a destructured argument. A check covering 15 of 584 while carrying the word WRITERS in its name is a proxy reported as a fact, which is this entry's own subject. So tools/ship/recordShape.mjs checks the RECORD instead: two levels of key set (the record's own, and the union across one level down, because the spawn flag lives there), ratcheted -- a record may GAIN a field, losing one fails. It needs no path resolution and cannot be fooled by a writer nothing parsed. All three instances are driven through it as fixtures, and the second was reproduced END TO END by restoring the old FLAGS name and re-recording all 1,255 gates. That reproduction corrected my own row: I had modelled the rename as a loss plus a gain, and encode() copies by out[g][f] = e[f], so the new name is assigned undefined and JSON.stringify DROPS IT -- the record gains nothing and just gets one field smaller on every entry. 201 records, 751 ms, wired as a ship step beside populationCensus. WHAT IT DOES NOT CATCH is stated in the gate: a field that NEVER existed, because the ratchet compares against what was recorded.",
        upstream: "Nothing. The material is already here: ROTATION_LOST_V4461 records the same mechanism ACROSS two processes -- a concurrent whole-file writer erasing rows another writer paid for -- and gave sweep-rotation.json its own writer as the fix, which is why v4568 could rebuild `finished` from the ledger instead of re-running a 75-minute pass. What is missing is the check that sees it INSIDE one process, before a reader notices. The three instances above are the fixtures: each is a real diff with a known dropped field, so a detector can be driven on them rather than on shapes somebody imagined.",
    },
    {
        id: "incremental-sweeps",
        blocker: "CLOSED",
        what: "Stop re-running the ~1,140 gates whose inputs did not change. Record each gate's REAL input set by wrapping fs during one full sweep, then invalidate against a content hash of that set.",
        how: "The instrument already exists in miniature: v4548 found its whole subject by wrapping fs.readFileSync and fs.readdirSync and counting calls per gate. Recording the PATHS rather than the count, for every gate, over one sweep, gives each gate an observed input set. A later sweep hashes those paths and runs only the gates whose set changed. Fail safe: a gate whose set is unknown, empty, or was recorded while it spawned a subprocess or a browser always runs.",
        why: "*** MEASURED AT v4548, IN ANSWER TO EXACTLY THE WRONG IDEA -- \"load all the file info into a database\". *** A shared file database is not the lever. Only 161 of 1,604 gates touch the tree at all; the walk is 42 ms; and the other 1,443 gates would gain nothing whatever from it. The sweep costs 725 s of gate time across 1,141 gates (374 s wall at 8 workers). Node process startup is 31 ms, so 1,141 spawns is 35 s -- 5%, real but not the prize. 415 gates finish under 200 ms and account for 57 s between them. THE COST IS THE GATES DOING THEIR WORK, and the only way to make that cheaper is not to do it when nothing it depends on has moved. A round touches five to fifteen files.",
        progressAt: "v4573 -- THE BLOCKER WAS A SENTENCE AND IT IS NOW TWO MEASURED PROPERTIES AND A PRICE. "
            + "The reason this shipped disarmed at v4566 was written down exactly: 'an input set is what a gate "
            + "read on ONE RUN -- a sample, not a specification -- so a gate that branches on something outside "
            + "the tree could have a set recorded on the narrow branch.' tools/ship/importClosure.mjs answers the "
            + "half a static reader can answer, at RECORD time, as a flag the rule reads. A STATIC import is "
            + "unconditional, so the whole closure must be in the set or the record is wrong: measured over all "
            + "1,258 recorded gates, ZERO miss one. A DYNAMIC import is the conditional the worry names: 152 "
            + "carry one to a file outside their set, and one gate statically imports a module ABOVE the engine "
            + "root, which no engine-relative record can hash. All of those now refuse to be skipped, which took "
            + "skippable from 1,098 to 975 of 1,257 -- 77.6%. *** THE FIRST INSTRUMENT WAS WRONG BY 75x AND IS "
            + "RECORDED RATHER THAN DELETED: *** following static and dynamic together it reported 135 "
            + "violations, and checking one case found populationCensus-selfcheck credited with 379 reachable "
            + "files against a probe's 9, because staleness.mjs reaches claimsGate through an await import() "
            + "inside a function that never ran. Its real static closure is FIVE. *** AND THE DYNAMIC HALF IS A "
            + "BOUND ON A RISK NOBODY DEMONSTRATED: *** kepler.js was made to throw on import and all three "
            + "gates that reach it dynamically still exited 0, so the exclusion stands on a structural argument "
            + "and not a measured catch, and it says so. BESIDE THE STRUCTURE: two independent probe passes "
            + "agreed on 1,246 of 1,258 sets (99.0%), the twelve differing by their own random temp directory or "
            + "by another gate's scratch file racing in an eight-wide probe -- pollution that errs SAFE. And the "
            + "differential test twice: break render/exactHash.mjs, run all 1,055 gates the sweep would have "
            + "skipped, ZERO verdicts moved; break sourceScan.mjs's codeOnly (272 gates read it), 882 skipped, "
            + "ZERO moved. STILL OPEN AND STILL THE WHOLE QUESTION: whether to change the default. quickSweep "
            + "skips nothing without --incremental, and the decision that remains is a judgement about a silent "
            + "failure mode, now with a standing measurement behind it instead of an argument.",
        closedAt: "v4574 -- ARMED, AT THE COMMAND LINE ONLY, AND THE FIRST WAY I ARMED IT WAS WRONG. "
            + "Flipping runQuickSweep's own default to true armed it for EVERY caller at once -- nine besides "
            + "the CLI, all fixtures driving the sweep to watch what it does plus budgetExile and verify -- and "
            + "tools/ship/sweepCoverage-selfcheck.mjs went red within the minute, correctly: its 1 ms-budget "
            + "fixture reported '0 gates run at a 1 ms budget, 0 confirmed alone' because the sweep it was "
            + "testing had skipped everything. A FIXTURE THAT SKIPS ITS OWN SUBJECT IS VACUOUS, and it would "
            + "have passed silently had it asserted a little less. So the default lives in the CLI block and "
            + "NOT in the function: typing the command skips, calling the function does not, and the caller "
            + "nobody has written yet inherits the safe one. verify.mjs passes skipUnchanged:false explicitly "
            + "anyway -- the saving buys iteration speed and spends a small measured chance that a gate which "
            + "should have run did not, and the one run this tree must not spend that on is the one whose "
            + "output is ALL GREEN. *** AND THE RECORD'S OWN FORMAT IS CHECKED NOW, WHICH IT NEVER WAS: *** "
            + "FORMAT has been written into every record since v4566 and nothing read it. While the mechanism "
            + "only counted that cost nothing; armed, it is the difference between a stale record and a wrong "
            + "one, because the encoding is INDEXED -- a record written under a different layout does not fail "
            + "to decode, it decodes to THE WRONG PATHS, hashes them, finds them unchanged and skips. The same "
            + "line covers a missing record. MEASURED: 926 of 1,258 gates skipped, 73.6% of gates but 54.1% of "
            + "recorded gate time, and 409 s of wall clock becomes 233 s -- 43%. The gap is the point and is "
            + "recorded rather than rounded away: the gates that always run are also the slow ones. What still "
            + "runs, by reason and by cost: 104 gates / 174 s spawn a child the probe cannot follow, 133 / "
            + "132 s reach a module their set does not carry (the v4573 bound, and that is its price), 73 / "
            + "93 s had an input change, 22 / 17 s open a socket.",
        upstream: "Nothing technical. What it needs is a decision about SOUNDNESS, and that decision is the round: a gate that reads the clock, the network, a GPU or a spawned browser has no stable input set, and a skipped gate that should have run is a silent false green -- the worst outcome this tree recognises. So the conservative shape (an allowlist of gates with proven-stable input sets, everything else always runs) is probably right, and it should be built measuring how many gates actually qualify rather than assuming most do. *** v4566 BUILT IT, MEASURED IT, AND SHIPPED IT DISARMED. *** tools/ship/inputProbe.mjs patches the fs default-export object -- which is what 786 of the 917 fs-using gates reach through -- and records the PATHS; the closure comes out TRANSITIVE, because a module load routes through the same object, and a CommonJS require does too. One pass over the sweep\'s own population (1,253 gates, 181 s at eight workers) gave 1,017 usable sets with a MEDIAN OF SIX PATHS, and 1,004 of 1,254 gates are skippable on an unchanged tree. The 250 that always run are named by reason: 121 spawn a child process, 102 take fs by NAMED import (Node binds those when the module links, so the patch may not be on the path), 13 open a socket, 14 have had an input move. Changing a file that 268 gates read still leaves 803 skippable, so the saving survives a real round. THE DECISION ABOUT SOUNDNESS WENT THE CONSERVATIVE WAY AND IS VISIBLE IN THE DEFAULT: quickSweep REPORTS what it would have skipped on every run and skips nothing until --incremental is passed, so the number earns trust in public over rounds instead of in an argument. WHAT IS STILL NOT CLAIMED is the thing that would make it safe to arm: an input set is what a gate read on ONE RUN -- a sample, not a specification -- so a gate that branches on something outside the tree could have a set recorded on the narrow branch. Two things bound that and neither is a proof: a path checked with existsSync IS recorded even when absent, so the file APPEARING invalidates the gate (measured in the gate, not asserted), and the sets came back identical on 60 of 60 gates probed twice. *** v4567 CLOSED BOTH DISQUALIFIERS AND THE ROUND\'S OWN RANKING OF THEM WAS BACKWARDS. *** They were the same hole: a named ESM import of a builtin does not route through a patched exports object -- measured, not assumed, since such a gate recorded an EMPTY set rather than a partial one -- and a module.register() resolve hook, which changes what the NAME is bound to, reaches both node:fs and node:child_process. NODE_OPTIONS carries the probe into every node CHILD that inherits the environment, so a child records itself into a shared directory the recorder unions. SKIPPABLE went 956 -> 1,102 of 1,254, 59% -> 72% of gate time. The child-process block was ranked FIRST at 23% of sweep time and delivered 17 gates; the named-import block was ranked SECOND at 7% and delivered 94 of its 102. Sampling the gates that still refused found NINETEEN OF TWENTY-FIVE spawning nothing whatever -- disqualified for merely REQUIRING child_process, which measures the import graph instead of the run; patching the required object rather than flagging the require freed about a hundred more. WHAT REMAINS IS GENUINELY UNFOLLOWABLE: 104 gates, 123 s, and of 24 sampled 16 launch Playwright\'s headless_shell, the rest git, python3, cargo, tar and a shell whose grammar this must not pretend to parse. A CHURN FLOOR IS NOW NAMED TOO: the sweep invalidates gates BY RUNNING -- 85 gates stat something under gate-reports/, 11 read sweep-timings.json, 16 read knowledge-index.json -- so a skip count moves by roughly 60 to 120 between a fresh record and a post-sweep one, and no amount of probing removes it. STILL DISARMED, and for the unchanged reason: an input set is one run\'s sample, not a specification. The remaining work is watching the reported number across rounds, and then a decision.",
    },
    {
        id: "lattice-voxel-lip",
        state: "CLOSED",
        note: "DONE at v4551, AND THE ITEM AS FILED WAS WRONG ABOUT ITS OWN CAUSE -- which is the finding. It read: the bot stops at a ONE-UNIT VOXEL LIP because the interpolated surface reads 65.9 degrees and the slope test runs before stepHeight can consider it, and the owed work was to tell a lip from a cliff without advancing the body to find out. The 65.9 is real and everything else is not. MEASURED by probing all 24 compass headings at the stall, both in a running index.html and reproduced offline from the engine's own integer heights: the cell the bot wanted (x 6..7, z 2..3) has corner heights 28, 29, 26, 27 -- A TWO-UNIT DROP across z -- so the bilinear gradient is (1, -2), magnitude 2.236, and the whole cell reads 65.9 degrees against a 55-degree limit. It is a cliff, refusing it is CORRECT, and two of the three refused headings were going DOWNHILL. contourSlide cannot help and is not at fault: the contour of a uniform face runs along that face, so the slide lands at 65.9 too and stepTerrain blocks. *** NOTHING IN THE PHYSICS WAS WRONG, AND 21 OF THE 24 HEADINGS WERE OPEN. *** simulation/BotManager.js read `if (r.grounded || r.blocked)` and treated a REFUSAL as HANDLED -- parking the bot at its own unchanged position, setting handled = true, and skipping every fallback -- three lines under a comment quoting this tree's v4187 ruling that refusing a move must not mean standing at the wall waiting to be killed. THE FIX IS A POLICY BESIDE THE PHYSICS, NOT INSIDE IT: stepTerrainFan tries the wish and, only when the wish moved nothing, fans 30/-30/60/-60/90/-90 and takes the smallest deviation that moves. In a real boot: 6.28 units and 429 stalled frames became 21.09 units and ZERO, over 20 distinct cells instead of 6, still standing exactly on the ground. Four sabotages red by name, including reverting BotManager to stepTerrain, which reproduces 429 of 600 exactly. *** WHAT IS NOT CLAIMED: that a bot now goes where it MEANT to. *** The fan is local steering, not pathfinding -- it gets a body off a wall, and a goal genuinely behind an unwalkable region still needs a route the planner has to supply. Related and still open: pathfinder-snapshot-window, since a detour wider than the snapshot is not in the data either planner receives.",
    },
    {
        id: "over-budget-record-detectors",
        blocker: "CLOSED",
        what: "DONE IN PART at v4548 -- the two detectors are back under the budget and the number is now ratcheted -- but 43 of 94 frozen records are STILL not checked at ship time, and that is the part left open.",
        how: "Either bring both under 3,000 ms, or give the ship ritual a second tier that runs the record gates unconditionally regardless of the sweep budget. The second is probably right: these two are not ordinary gates, they are the ritual's own integrity check, and pricing them by the same clock as a geometry fixture is what produced the failure below.",
        why: "*** THIS IS NO LONGER HYPOTHETICAL AND THE COST IS MEASURED. *** frozenRecords-selfcheck runs 3,446 ms and recordDrift-selfcheck runs 3,026 ms, against a 3,000 ms budget -- over by 446 ms and by 26 ms. BUDGET_DRIFT_V4536 was added to the tree by commit 4817a29b and that round did not re-take PROBE_AT_V4536\'s census; NINE SUBSEQUENT ROUNDS THEN SHIPPED ALL GREEN over a census that was wrong by one record, one withFields and one field, and it was found by hand at v4547 rather than by anything in the ritual. *** THE ROUND THAT ADDED THE UNCOUNTED RECORD WAS THE SWEEP-BUDGET ROUND ITSELF, *** which is as close to a proof as this file is going to get that the budget is the mechanism and not a coincidence.",
        closedAt: "v4576 -- AND THE FILED NUMBER WAS WRONG IN BOTH DIRECTIONS AGAIN: it said 43 of 94, and the "
            + "live reading was 38 of 104. TWO CAUSES, ONE FIXED IN THE INSTRUMENT AND ONE IN THE RITUAL. *** "
            + "FIRST, SEVEN RECORDS READ AS UNGUARDED AND WERE NOT. *** frozenRecords asks which gates NAME a "
            + "record, and redCensus.mjs defines RED_AT_V4531 = Object.freeze(RED_AT_V4531_GATES.map(...)) -- "
            + "so the ARRAY is consumed only through the derived constant and gates name the derived one. "
            + "Corrupting the array, by filing a green gate as a known red, DOES redden registerDrift-selfcheck; "
            + "measured. The census follows one level of derivation within the defining file now, and unguarded "
            + "went 20 -> 12, checked 66 -> 72. One level and one file on purpose: a transitive closure would "
            + "start crediting records with guardians that never touch their value. *** SECOND, THE TWENTY "
            + "RECORDS WHOSE GUARDIAN WORKS AND COSTS TOO MUCH. *** Both fixes this entry proposed were "
            + "measured. v4548 took 'make them cheaper' for two other gates and found they were doing the same "
            + "work six times over; that medicine does NOT apply here -- fs calls against unique paths give "
            + "1.0x, 1.1x, and samplerCheck-selfcheck does no file I/O at all, 9 s of pure arithmetic. So the "
            + "second tier is right: tools/ship/recordTier.mjs runs the nine guardian gates the sweep cannot "
            + "afford, 93 s, serially and with a cap, wired as a ship step beside population-census. Its list is "
            + "DERIVED from recordReach and its own gate asserts that not one of the nine names appears in its "
            + "source. *** ON ITS FIRST RUN IT FOUND TWO RED GUARDIANS COVERING EIGHT RECORDS, NEITHER ON ANY "
            + "REGISTER. *** orreryFleet-selfcheck was red because orrery-fleet.json's baked file sizes had "
            + "drifted on three files I EDITED THREE ROUNDS EARLIER, under sweeps that all reported ALL GREEN. "
            + "budgetExile-selfcheck was red on two rows that gated on the defect still being as bad as when it "
            + "was found -- 'gates ARE still exiled at the cap' (v4568 fixed that) and 'the inflation is STILL "
            + "above 1.5x' (it has fallen to 1.48). That file's own section 3 diagnosed this exact shape at "
            + "v4535 and wrote the fix down -- split the claim, assert the historical half from the record -- "
            + "and never applied it to these two. IT COULD NOT BE APPLIED IN FULL: MEASURED_V4425 froze "
            + "{ verdict, ms } where ms is the SERIAL time, so the INFLATED reading that actually did the "
            + "exiling was never written down and the historical half is unassertable. Recorded rather than "
            + "faked. STILL OPEN: 12 records have no guardian at all, which a tier cannot help with.",
        upstream: "Nothing -- both halves are available today. This sits here rather than in the round because raising or tiering the budget changes what every ship does, and backlog item #14 (487 gates over budget, 31% of the tree) is the wider question this is one measured instance of. Doing the narrow fix without the wide one is defensible; doing it silently is not. *** v4548 DID THE NARROW FIX, AND NEITHER BY RAISING THE BUDGET NOR BY TIERING IT. *** Both options in the `how` above were wrong. The gates were not doing expensive work: recordDrift-selfcheck issued 23,429 readFileSync and 12,397 readdirSync over 4,025 files -- every file SIX times, every directory EIGHTEEN times -- for 606 ms of actual work, because four censuses each re-derived the same read and the gate ran them six times over. tools/ship/treeRead.mjs memoises one read per process; the guardian search inside frozenRecords, ~95 record names against 1,602 gate sources recomputed per call, was memoised too. 3,289 -> 1,255 ms and 3,164 -> 1,820 ms, and quickSweep would not have noticed either (a gate recorded over budget is skipped, so it can never be re-timed -- budgetExile.mjs\'s one-way door) until sweepRotation --gate re-timed them through the owner. *** WHAT IS STILL OPEN IS THE GENERAL CASE, AND IT IS BIGGER THAN THE ROUND THAT FOUND IT: *** joining the record census to the sweep timings says 43 of 94 records are unchecked at ship time -- 23 guarded only by gates over the budget, 20 by nothing at all. Three guardians are recorded AT the 20,000 ms cap and do not finish (redCensus-selfcheck, transmission-selfcheck, dockFraming-selfcheck); one is a 14 s commit walk over a vendored repository (orreryFleet-selfcheck). Those are four separate rounds with four separate causes, and the honest next step is to take them one at a time rather than as a policy. tools/ship/recordReach.mjs RATCHETS the number so it cannot grow while nobody is looking, which is the specific failure that produced this item. *** AND v4557 MEASURED WHY THE WIDE ONE IS BIGGER THAN IT LOOKS, WHILE FIXING SOMETHING ELSE. *** budgetExile is a ONE-WAY DOOR -- a gate recorded over budget is skipped by the sweep, so it is never re-timed, so it stays over budget -- and 398 OF THE 465 OVER-BUDGET GATES CARRY A TIMING STAMPED \"unknown -- before v4408\", older than per-entry stamping itself. 164 of those sit under 8 seconds. Sixteen were sampled across that range and re-timed alone: FOURTEEN CAME IN UNDER THE 3,000 ms BUDGET, several by a wide margin (asciify 4,257 -> 339, dracoWeld 5,443 -> 76, twoFExperiment 7,097 -> 1,057). One instance was repaired at v4557 because its exile had a visible cost: staleness-selfcheck was recorded at 3,316 ms, runs in 558 alone and 1,462 under eight-way load, and while it sat outside the sweep a derived count on case-study.html drifted to 1,606 against 1,609 with its recorded exit code frozen at a stale 0. So \"31% of the tree never runs at ship time\" is substantially an artefact of readings nothing can refresh, and the round is a bulk re-time THROUGH sweepRotation --gate (which merges rather than replaces) followed by triage of whatever reds that surfaces -- the reds being why this is a round and not a script. *** v4565 RAN THAT BULK PASS AND HALF THE BAND CAME BACK. *** --band selects the pool by recorded cost instead of by staleness, because the returnees live at the cheap end and are also the fastest to measure; 210 gates filed between 3,000 and 7,922 ms were run serially, and 105 CAME BACK UNDER BUDGET (fresh readings 65 to 2,958 ms, filed/serial median 2.43x, biggest correction 89.5x). Outside the ship-time sweep went from 464 of 1,614 (28.7%) to 359 (22.2%) in one pass of about half an hour. It surfaced 12 reds, 8 of them new and every one green in the register until something ran it: absenceScope, reportDoors, brainTrail, frontDoor, mpmGpuPage, gateReport, scoreDirection all had real defects and are fixed; crtToggle is a flake, named as one rather than counted as a repair. OVER_BUDGET_PASS_V4565 in tools/ship/sweepCoverage.mjs carries the numbers and sweepCoverage-selfcheck re-derives them from the ledger and the live timings. *** WHAT IS LEFT IS THE HARD HALF AND IT HAS A DIFFERENT SHAPE. *** 219 gates are still over budget -- 91 in the 3-8 s band (the ones that really are slow) and 128 in 8-20 s, worth roughly another 24 minutes at a far worse rate of return -- AND 140 KILLED GATES THE ROTATION CANNOT REACH AT ALL, because rotation() walks c.over and c.killed is a separate bucket with no door in it whatsoever. That is 39% of everything outside the sweep sitting behind the exact one-way door v4408 opened for the other bucket, and it is the next item rather than this one. *** v4568 OPENED IT: 103 OF THE 140 NOW HAVE A VERDICT AND FIVE OF THEM ARE RED. *** rotation() takes includeKilled (pool 222 -> 362) and --killed runs the bucket serially at its own, larger cap, because re-running a capped gate AT the cap it died on can only reproduce the death. 140 gates at 90 s: 103 FINISHED (97 green, 6 red), 37 did not, 35 came in UNDER the 20,000 ms cap that exiled them, and ONE -- placementRender-selfcheck -- reads 51 MILLISECONDS against the 20,125 on file, a 395x correction on a reading that was never a measurement of that gate at all. 129 of the 140 carried a stamp older than per-entry stamping itself. THE DEEPER DEFECT WAS NOT SLOWNESS: `killed` was a proxy for 'over the cap' and the tree read it as 'no verdict', so a gate that ran green in 50 s, one cut off at 20 s, and one that ran RED were the same entry. `finished` is now written by the runner from what the process DID, and census splits the bucket on that recorded fact. The five reds are registered in redCensus.RED_AT_V4568 with what each says -- a gate passing on a COPYRIGHT COMMENT (commentFalsePass on qrChannel), a population census of 472 against a live 520 (gateReach), seven baseline entries that have outlived their reason (baselineHygiene), reachable gates no longer scheduled first (gateSelection), and a signal holding for 28 of 30 that therefore discriminates nothing (orphanDisposition). FIXING THOSE FIVE IS THE NEXT ITEM: each is a defect in a different subsystem and this round is about the door. *** AND THE CAP WAS LEAKING THE GATE'S CHILDREN, A LOOP THAT GREW THIS BUCKET. *** p.kill('SIGKILL') signals the direct child only, and headlessGpu-selfcheck spawns one that PINS A WEBGPU DEVICE on purpose; an orphan of that shape was found holding a device for forty-four minutes, competing with every GPU gate that ran meanwhile -- and a gate slowed past the cap is killed, orphaning more. Both kill sites signal the process GROUP now, and redCensus-selfcheck's register re-run went from unbounded (90,096 ms, killed, never completing) to a 45 s stalest-first slice. WHAT IS STILL OPEN: the 37 that survive 90 s have a floor under them rather than a verdict. *** AND THE PASS BROKE A RECORD, WHICH IS THE FINDING THAT TRANSFERS. *** tslRace-selfcheck hit the 20,000 ms cap under contention and died after its first section, which writes tsl-emitted-race.json WHOLESALE while its later sections merge into what that left -- so section 6\'s `atlas` key was truncated away and never rewritten, wgslCorpus dropped tslSource.spriteAtlas behind an `EMITTED_RACE.atlas &&` presence guard, and the corpus got one case smaller with NOT ONE ROW GOING RED (crossBackend asserts `results.length === corpus().length`, the corpus measured against itself, which holds at any size). Found by reading a git status line. Fixed at v4566: the section merges by key, wgslCorpus.GENERATED_CASES names all fifteen generated cases with the record and writer each comes from, and probeConvention-selfcheck is the census that sees one leave. A GATE THAT WRITES A RECORD IN SECTIONS CAN DESTROY IT BY FAILING PART-WAY, and any bulk re-time is a machine for making gates fail part-way.",
    },
    {
        id: "tet-cut",
        blocker: "UPSTREAM",
        what: "Cutting a tetrahedral mesh along an arbitrary path -- Ruprecht-Muller (1998) edge-cut subdivision, so a surface separates the way a scalpel does rather than the way a thread snaps.",
        how: "The algorithm is 1998 published academic work, not any repository's IP: 11 deterministically generated equivalence classes of cutting template, a 6-bit edge mask looked up against ~64 entries, corner-peeling and optimal-apex coning. matthias-research/tet-cut is a from-scratch WebGL prototype of it with a Node regression twin -- the same 'hand-written pair, gate with a runnable twin' shape this tree uses -- and carries no licence, which does not matter for a published algorithm reimplemented from the paper.",
        why: "*** THE CAPABILITY IS GENUINELY ABSENT AND GENUINELY DIFFERENT FROM WHAT IS HERE. *** physics/xpbd/tear.js is a FAILURE RESPONSE, and says so in its own first line: 'tearing REMOVES constraints whose strain, measured against a snapshot, has exceeded a breaking threshold ... a tear is PERMANENT'. Removing constraints is not refining topology along a path, and fx/fracture/cellFracture.js (Voronoi) is not either. Nothing in the tree cuts.",
        upstream: "A DEFORMABLE TETRAHEDRAL BODY, WHICH THIS TREE DOES NOT HAVE -- and the sweep that raised this assumed it does. Its words were that tet-cut 'pairs naturally with the volumetric soft-body constraints (volume.js, muscle.js, plastic.js) already built', and all three are edge- or surface-based: volume.js is ONE global pressure constraint over a closed TRIANGLE mesh whose 'tetrahedra' are the divergence-theorem signed tets used to integrate enclosed volume, not a mesh; muscle.js and plastic.js modulate per-constraint rest lengths. A grep for a deformable tet mesh across physics/, fx/ and world/ returns NOTHING. Tetrahedra appear in exactly two unrelated places: marching TETRAHEDRA in physics/mesh/marchingCubes.js (isosurface extraction) and finite-volume gradient reconstruction in physics/mesh/tetReconstruct.mjs (CFD). Ruprecht-Muller subdivides a tet mesh; there is none to subdivide, so the prerequisite is a tetrahedralised soft body with volumetric constraints -- a substantial piece this tree has never needed. Worth building the day something wants to be cut open rather than torn.",
    },
    {
        id: "transvoxel-transition-cells",
        blocker: "UPSTREAM",
        what: "Crack-free seams between volumetric chunks meshed at different resolutions (Transvoxel transition cells).",
        how: "Port the transition-cell table as data with citation -- the posture simulation/MarchingCubes.js already takes with the Bourke 256-case tables -- hand-write the stitching, and grade the seams with physics/mesh/manifoldCensus.mjs, which exists to catch exactly non-manifold and cracked output.",
        why: "*** THE SWEEP READ \"ZERO OCTREE ANYWHERE IN world/*.js\" AND CONCLUDED THE TREE HAS NO OCTREE. IT HAS THREE. *** physics/octree/ carries a CPU sparse octree that merges uniform regions (octree.js), a GPU-packed Laine-Karras SVO (svoGenerator.js), a CPU raymarcher holding the GLSL one honest (svoMarch.mjs), and gates for each. The substrate exists, so this is a smaller job than the sweep sized. Its second claim is also wrong: dualContour takes `n` and marchScalarField takes dimX/dimY/dimZ -- BOTH TAKE A RESOLUTION. What neither takes is a NEIGHBOUR'S resolution, which is the actual precondition. The real gap, grepped rather than inferred: physics/mesh, simulation, world and render contain ZERO references to octree, svoMarch or svoGenerator -- no mesher has ever consulted the octree.",
        upstream: "any mesher that consults physics/octree at all -- today none does, so a transition cell would have nothing to sit between. world/chunkMarchingCubes.js calls itself a near-camera cosmetic pass, so nothing is straining against this yet",
    },
    { id: "fbp-gain-normalisation", state: "CLOSED", note: "ANSWERED NO at v3378, and the measurement is in reconQuality.mjs. The gain is NOT a filter constant: it runs 0.4319 to 0.9340 across fixtures, nearly invariant in ANGLE COUNT but tracking N and nDet -- and gain*nDet/N collapses to 0.9456 with a spread of 0.0185. IT IS A SAMPLING RATIO. Correcting 0.649 in the filter would be right at N=96/nDet=140, this gate's own fixture, and wrong everywhere else." },
];

// *** v4549 -- THIS REPORT WAS HIDING THREE OF ITS OWN OPEN ITEMS, AND HAD BEEN FOR SEVERAL ROUNDS. ***
// Entries in this file carry their status in one of two fields: `blocker` on the ones written as forward
// plans, `state` on the ones written as answers to a question (CLOSED, or DONE-in-part and still OPEN).
// byBlocker filtered on `blocker` alone, so terrain-controller, pathfinder-snapshot-window and
// navmesh-recast -- every one of them carrying an explicit "STILL OPEN" clause naming unbuilt work -- were
// absent from the report entirely. It printed "OPEN (4)" where the honest number is 7.
//
// The fix is to read whichever field the entry has rather than to go and retype twenty-four entries into one
// shape: a migration would make the report right today and leave the same trap for the next entry written in
// the other style. `status()` is the single definition of "what state is this in", and reachable() below is
// what refuses an entry the report cannot see.
export const status = (r) => r.blocker || r.state || null;
export const byBlocker = (kind) => NEXT_ROUNDS.filter((r) => status(r) === kind);

/** Every entry, with the status the report will actually use -- so a gate can check nothing falls through. */
export const reachable = () => NEXT_ROUNDS.map((r) => ({ id: r.id, status: status(r) }));

export function lines() {
    // *** v3941 -- IT NAMES ITSELF, BECAUSE A REPORT WITH NO NAME ON IT IS UNATTRIBUTABLE THE MOMENT TWO OF
    // THEM SHARE A TERMINAL. *** That is toolFrontDoor's rule, and the reason this tool could not be added to
    // the REPORTING registry until now: it printed a bare "UPSTREAM (2):" and nothing said whose it was.
    const out = ["[nextRounds] what the next rounds are, and what is blocking each"];
    for (const kind of ["OPEN", "UPSTREAM", "HARDWARE"]) {
        const rows = byBlocker(kind);
        if (!rows.length) continue;
        out.push(`${kind} (${rows.length}):`);
        for (const r of rows) out.push(`  ${r.id} -- ${r.what}`);
    }
    out.push("");
    out.push("A blocker is a fact about the world. A priority is a fact about somebody's mood last Tuesday.");
    return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) for (const l of lines()) console.log(l);
