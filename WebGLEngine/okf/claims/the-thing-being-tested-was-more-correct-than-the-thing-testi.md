---
type: claim
title: The thing being tested was more correct than the thing testing it
description: "Port Amanatides & Woo voxel ray traversal (1987) -- the primary source DeadlockCode/voxel_ray_traversal names, and a better dependency than anybody's port. FIRST: check what is her"
tags: [settled, "swek-engine", v2583]
timestamp: v2583
---

# The thing being tested was more correct than the thing testing it

- **Status:** settled  
- **Since:** v2583

## Prediction

Port Amanatides & Woo voxel ray traversal (1987) -- the primary source DeadlockCode/voxel_ray_traversal names, and a better dependency than anybody's port. FIRST: check what is here. THE ENGINE ALREADY HAD ONE: editor/voxelSelectionRaycast.js, 'v2 FACE-AWARE DDA PICKER', and it is a real DDA -- proper tDelta/tMax, not fixed-step marching.

## Why

DDA has the same gift Panini had: EXACT INVARIANTS, provable on a CPU. The oracle is dense sampling -- march tiny steps, record the voxel, dedupe -- which does not know what tMax is, WHICH IS EXACTLY WHY IT CAN JUDGE IT. Same role naiveFaces played for the greedy mesher.

## Measured

IT HAD A REAL BUG AND NOTHING HAD EVER SEEN IT. `let tMaxX = tDeltaX * (stepX > 0 ? (1 - (origin.x % 1)) : (origin.x % 1))`. JAVASCRIPT'S % KEEPS THE SIGN OF THE DIVIDEND: -4.5 % 1 === -0.5, NOT 0.5. So a ray from x=-4.5 heading +x computed tMaxX = tDelta * 1.5 when the true distance to the boundary is 0.5 -- THREE TIMES TOO FAR -- and the x axis LOST RACES IT SHOULD HAVE WON. Measured on a diagonal from (-4.5,-2.5,-3.5): IT SKIPPED THE VOXEL AT z=-3 ENTIRELY and walked a different line through the grid. AND IT WAS INVISIBLE TO EVERY TEST ANYONE WOULD WRITE: the axis-aligned ray from the same negative origin HITS CORRECTLY EVEN WHEN BROKEN, because a wrong tMax on a straight ray changes WHEN the step happens, not WHICH voxel is entered. IT ONLY SHOWS ON A DIAGONAL, where tMax DECIDES THE ORDER BETWEEN AXES -- and a camera looking down an axis at a world in positive coordinates is every test anyone would think to write. world/VoxelWorld.js RUNS x AND z FROM -5 TO +5: HALF OF THAT WORLD WAS IN THE BROKEN HALF OF THAT LINE. Fixed with x - Math.floor(x), the fractional part for all reals, which is what the 1987 paper means by it.

## Kill condition

Any ray whose path has an illegal jump. THE GATE ASSERTS THE INVARIANT, NOT THE ORACLE: consecutive voxels on a ray differ by EXACTLY 1 IN EXACTLY 1 AXIS -- a path with a hole in it is A RAY THAT PASSES THROUGH A WALL.

# Citations

- Code: editor/voxelSelectionRaycast.js (fixed) + editor/voxelRaycast-selfcheck.mjs (14 checks, gated, sabotage-tested). TWO THINGS THIS ROUND TAUGHT, AND BOTH ARE ABOUT TESTING. (1) THE ORACLE IS NOT GOD. On that same diagonal the dense sampler reports a jump of TWO AXES AT ONCE -- AT EVERY RESOLUTION DOWN TO h=0.00001, so it is not undersampling. Check the arithmetic: x travels 2.5 units at rate 1.0, y travels 1.5 at rate 0.6, AND 2.5/1 == 1.5/0.6 EXACTLY. THE RAY PASSES THROUGH THE POINT WHERE FOUR VOXELS MEET, and there 'which voxel does it visit' HAS NO ANSWER. The sampler jumps the corner; the DDA breaks the tie and inserts the intermediate voxel. BOTH ARE DEFENSIBLE -- ONLY ONE IS SAFE TO RENDER WITH. THE THING BEING TESTED WAS MORE CORRECT THAN THE THING TESTING IT, and the only way to know that was to have an INVARIANT THAT OUTRANKS BOTH. An oracle is not God; it is a second opinion that fails differently. (2) MY FIRST GATE WAS DECORATION: it RE-IMPLEMENTED the DDA in order to watch it walk, and then tested the copy. I PUT THE BUG BACK AND ZERO CHECKS FAILED. The fix: raycastVoxel calls world.voxelAt ON EVERY VOXEL IT VISITS, IN ORDER -- SO THE WORLD IS THE INSTRUMENT, nothing is re-implemented, and the module under test does the walking. Bug restored now: 2 checks fail. A CHECK THAT TESTS A COPY IS GRADING A COPY.
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
