---
type: claim
title: "Three meshers, and the live one is the naive one"
description: "Keith asked three words -- 'Our tree calls it?' -- about v2572's claim that half the tree called a greedy mesher that throws. PREDICTION IMPLIED BY THE QUESTION: check whether the "
tags: [settled, "swek-engine", v2573]
timestamp: v2573
---

# Three meshers, and the live one is the naive one

- **Status:** settled  
- **Since:** v2573

## Prediction

Keith asked three words -- 'Our tree calls it?' -- about v2572's claim that half the tree called a greedy mesher that throws. PREDICTION IMPLIED BY THE QUESTION: check whether the CALLERS are themselves called. I had not.

## Why

v2572 verified that world/VoxelWorld.js:18 and voxel/VoxelMesh.js:15 call the broken v2 mesher, and stopped there. TRACING ONE LEVEL UP IS NOT OPTIONAL: a caller that nothing calls is not a wound, it is a fossil.

## Measured

THE TRUE COUNT OF LIVE CALLERS IS ZERO. world/VoxelWorld.js: 0 importers. voxel/VoxelMesh.js: 0 importers. THEY ARE ORPHANS CALLING AN ORPHAN. And the live page -- voxel-viewer.html -- DEFINES ITS OWN buildVoxelMesh INLINE AT LINE 208 and imports neither. SO THIS ENGINE HAS THREE VOXEL MESHERS: (1) mesh/greedyMesher.js v1, WORKS, merges a flat 16x16 slab into ONE quad, imported by mesh/chunkMeshBuilder.js WHICH HAS 2 IMPORTERS -- SO THE GOOD ONE IS LIVE; (2) voxel/greedyMesh.js v2, THROWS on chunk.getIndex, DEAD; (3) voxel-viewer.html:208 inline, THE ONE A HUMAN ACTUALLY LOOKS AT, which culls hidden faces against a Set and MERGES NOTHING: 576 FACES / 1152 TRIANGLES for that same flat slab that v1 does in 1 quad. AND THE PART THAT FLIPS v2572'S ADVICE: v1 CANNOT REPLACE THE VIEWER'S MESHER. v1 is 2.5D, TOP FACES ONLY, and says so in its own comment; the viewer needs all six. THEY DO DIFFERENT JOBS, and the gap between them -- FULL-3D GREEDY MESHING -- IS EXACTLY WHAT THIS ENGINE DOES NOT HAVE. That is the gap vercidium-patreon/meshing (MIT, C#, Part 1 of the Free Friday series) fills.

## Kill condition

Show a live import path into world/VoxelWorld.js or voxel/VoxelMesh.js and this claim is wrong -- the search was for `from '...VoxelWorld.js'` across js/mjs/html, so a dynamic import built from a string would evade it.

# Citations

- Code: mesh/greedyMesh-selfcheck.mjs extended to pin the IMPORTER COUNTS, not just the callers. THE LESSON, AND IT IS MINE NOT THE CODEBASE'S: v2572 said 'half your tree calls something that cannot run' AND THE TRUE COUNT WAS ZERO. Second time this session I found a real bug and overstated its reach -- v2568 did it to v2556 -- AND I WROTE THE LAW AGAINST IT MYSELF IN v2569, FOUR VERSIONS AGO: A REAL FINDING DOES NOT LICENSE A GUESS ABOUT WHAT ELSE IT BROKE. A THREE-WORD QUESTION CAUGHT IT. NOW THE CORRECTED ADVICE ON VERCIDIUM: PORT THE ALGORITHM AFTER ALL -- not because ours is broken, but because the live path is naive and the working one is 2.5D. The code is C#/desktop-GL and does not port; the algorithm does.
- Page: `/voxel-viewer.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
