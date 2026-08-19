---
type: claim
title: Greedy meshing wins on flat things and does nothing on noise
description: "v2573 found the gap: three voxel meshers, none of them full-3D greedy. v1 merges but is 2.5D top-faces-only and says so; v2 throws; and the LIVE page (voxel-viewer.html:208) merges"
tags: [settled, "swek-engine", v2574]
timestamp: v2574
---

# Greedy meshing wins on flat things and does nothing on noise

- **Status:** settled  
- **Since:** v2574

## Prediction

v2573 found the gap: three voxel meshers, none of them full-3D greedy. v1 merges but is 2.5D top-faces-only and says so; v2 throws; and the LIVE page (voxel-viewer.html:208) merges nothing -- 576 faces / 1152 triangles for a flat 16x16 slab. PREDICTION: port the algorithm (not the C#) from vercidium-patreon/meshing, and it can be PROVEN EXACTLY CORRECT ON A CPU, because greedy meshing has the same gift Panini had.

## Why

PANINI'S GIFT WAS AN IDENTITY: 'the linear projection at Ez=0 belongs to both families', so the maths could be proven without a GPU. GREEDY MESHING'S IS STRONGER: A GREEDY MESH MUST COVER EXACTLY THE SAME UNIT FACES AS A NAIVE MESH. NOT APPROXIMATELY -- EXACTLY. Merging is a re-description of the same surface. A merged quad covering a face the naive mesher never emitted is A WALL THAT IS NOT THERE; a missing one is A HOLE. Both are exactly detectable by decomposing quads back to unit faces and comparing SETS.

## Measured

SET-IDENTICAL ON ALL FIVE SHAPES, and the numbers are the finding: flat 16x16 slab 576 naive -> 6 greedy (96.0x); SOLID 16 CUBE 1536 -> 6 (256.0x); hollow shell 984 -> 12 (82.0x); CHECKERBOARD 1536 -> 1536 (1.0x); random cloud 1788 -> 1385 (1.3x). THE CUBE BECOMING SIX QUADS IS THE TELL THAT IT IS RIGHT -- A CUBE IS SIX QUADS; 7 would mean splitting a face for no reason and 5 would mean losing a wall. AND THE CHECKERBOARD IS THE HONEST LIMIT: NOTHING MERGES, because NO TWO ADJACENT FACES ARE COPLANAR. GREEDY MESHING WINS ON FLAT THINGS AND DOES NOTHING ON NOISE.

## Kill condition

Any shape where the greedy set and the naive set differ by one face. The gate compares SETS, per direction, on seven shapes including a hollow shell, a checkerboard, a random cloud, a single voxel and empty space. ALSO UNKNOWN AND SAID SO: nobody has run this on REAL TERRAIN. The real ratio is somewhere between the 256x cube and the 1.0x checkerboard, and that needs a chunk off the rig, not a shape I invented.

# Citations

- Code: mesh/greedyMesh3d.js + mesh/greedyMesh3d-selfcheck.mjs (12 checks, gated). 'THE VOXELS LOOK RIGHT' IS NOT A TEST -- a mesher that dropped one interior face passes it every time, and so does one that emits a face at the wrong normal. THIS GATE CANNOT BE PASSED BY A MESH THAT IS MERELY PLAUSIBLE. A version of it that only tested slabs would report 96x AND IMPLY A GENERAL SPEEDUP -- the shapes are chosen to make it admit otherwise. Also gated: the mesher ASKS about cells outside the volume, so solid() MUST answer false there -- one that answers true produces a mesh WITH NO OUTER WALLS, which does not throw, does not warn, and looks like a lighting bug. NOT YET WIRED INTO voxel-viewer.html: that is a live page, and replacing the mesher under it without a screenshot is how you break a working thing.
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
