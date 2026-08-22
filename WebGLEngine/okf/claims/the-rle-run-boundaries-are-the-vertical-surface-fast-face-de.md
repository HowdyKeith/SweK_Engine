---
type: claim
title: "The RLE run boundaries ARE the vertical surface -- fast face detection at run cost, not voxel cost"
description: "Because the chunk is stored Y-fastest, every run boundary is a place where the voxel type changes, and a visible horizontal face is exactly where a solid voxel meets air. So walkin"
tags: [settled, "swek-engine", v2769]
timestamp: v2769
---

# The RLE run boundaries ARE the vertical surface -- fast face detection at run cost, not voxel cost

- **Status:** settled  
- **Since:** v2769

## Prediction

Because the chunk is stored Y-fastest, every run boundary is a place where the voxel type changes, and a visible horizontal face is exactly where a solid voxel meets air. So walking the ~4,000 runs and emitting a face wherever solid meets not-solid yields the EXACT same +Y/-Y faces a full 262,144-voxel scan finds -- the surface falls out of how the data was stored. A solid-to-different-solid boundary (stone under dirt) is correctly hidden; only solid-to-air is a face.

## Why

The load-bearing line is the solid-meets-not-solid test at each boundary. Fire it between two solids as well and the fast path emits interior faces you cannot see, so the set-equality against the brute scan fails -- which is the exact danger, meshing hidden faces.

## Measured

rleSurface-selfcheck.mjs, 5 checks: the run-boundary faces are the SAME SET as the voxel-scan faces (1024 faces both ways) but found by touching 4096 runs instead of 262144 voxels (64x fewer touches); a 100-tall solid column yields exactly ONE top face, not 100; a stone/dirt boundary produces zero interior faces (only the dirt/air top); empty space has no surface. SABOTAGE (emit solid/solid interior faces) breaks the set equality.

## Kill condition

tools/rleSurface-selfcheck.mjs. HONEST SCOPE: this gives the +Y/-Y faces directly (tops and undersides, the bulk of a terrain's surface). The +X/-Z side faces need adjacent columns compared -- a run-vs-run merge, cheaper than a voxel scan but not free -- which is a later step.

# Citations

- Code: voxel/rleSurface.js (yFacesFromRLE, rleUnindex, yFacesBrute) + tools/rleSurface-selfcheck.mjs.
- Page: `case-study.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
