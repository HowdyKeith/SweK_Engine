---
type: claim
title: "The caves cost 78% of the merge"
description: "v2574 shipped full-3D greedy meshing with ratios from 256x (solid cube) to 1.0x (checkerboard) and said, in its own kill condition: 'NOBODY HAS RUN THIS ON REAL TERRAIN. The real r"
tags: [settled, "swek-engine", v2576]
timestamp: v2576
---

# The caves cost 78% of the merge

- **Status:** settled  
- **Since:** v2576

## Prediction

v2574 shipped full-3D greedy meshing with ratios from 256x (solid cube) to 1.0x (checkerboard) and said, in its own kill condition: 'NOBODY HAS RUN THIS ON REAL TERRAIN. The real ratio is somewhere between the 256x cube and the 1.0x checkerboard, and THAT NEEDS A CHUNK OFF THE RIG, NOT A SHAPE I INVENTED.' PREDICTION: rig-only.

## Why

The demo shapes were all mine. A slab, a cube, a shell, a checkerboard -- every one chosen by me, and a mesher measured only on shapes its author picked is measured on nothing.

## Measured

IT WAS NOT RIG-ONLY. world/terrainGenerator.js EXISTS IN THIS TREE -- a true 3D voxel field, simplex heightmap surface with 3D caves carved out -- and its only dependency, simplex-noise, INSTALLS FROM THE ALLOWLISTED npm REGISTRY. I wrote 'that needs a chunk off the rig' ONE VERSION AFTER NAMING THE LAW AGAINST EXACTLY THIS (v2570: A REASON THAT EXPIRED IS A HABIT). THE REAL NUMBER, on the engine's own getVoxel copied line for line with real noise, SET-IDENTICAL TO THE NAIVE ORACLE AT EVERY SCALE: 16^3 at y=40 (48% solid) 1286 naive -> 216 greedy = 5.95x; 32^3 at y=40 (25% solid) 4512 -> 1113 = 4.05x; 32^3 at the surface (2% solid) 1124 -> 268 = 4.19x. SO THE ANSWER IS 4-6x, NOT 96x AND NOT 256x -- FAR CLOSER TO THE CHECKERBOARD THAN TO THE CUBE. AND THE CAUSE, ISOLATED ONE VARIABLE AT A TIME ON ONE 32^3 CHUNK: terrain as shipped 8750 naive -> 1905 greedy = 4.59x; THE SAME TERRAIN WITH CAVES OFF 6054 -> 295 = 20.52x. THE CAVES COST 78% OF THE MERGE. And they cost TWICE: they ADD faces (6054 -> 8750) AND they destroy the coplanarity greedy meshing feeds on. Half-frequency caves: 6.69x. Rarer caves (threshold 0.75 instead of 0.55): 6.88x.

## Kill condition

A terrain configuration where caves are on and the ratio still exceeds 15x. The measurement is one seed, one region, one cave rule -- 4.59x is a fact about THIS terrainGenerator, not about voxel terrain in general.

# Citations

- Code: measured against world/terrainGenerator.js's own getVoxel with simplex-noise from npm. THE CAVES ARE NOT A BUG -- THEY ARE A DESIGN CHOICE, AND NOW THE PRICE IS MEASURED RATHER THAN GUESSED: 4.5x of geometry. THE LESSON IS MINE AGAIN: v2574 declared a measurement rig-only WITHOUT CHECKING WHETHER THE TREE COULD ALREADY DO IT, which is the same habit v2570 caught (crossarch-flesh.mjs carried a 'box3d.wasm is not in the tree yet' comment for FOURTEEN VERSIONS after v2560 built it) and the same one v2560 caught (FIVE versions of 'rig-only: emsdk CDN 403s' without ever asking if emsdk was the only road). THREE TIMES NOW. THE DIFFERENCE BETWEEN A BLOCKER AND A HABIT IS WHETHER ANYONE HAS RE-CHECKED IT SINCE WRITING IT DOWN.
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
