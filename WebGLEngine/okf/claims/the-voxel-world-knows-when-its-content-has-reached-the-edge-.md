---
type: claim
title: "The voxel world knows when its content has reached the edge -- extremity bound checking, proven not assumed"
description: "The voxel world can report the bounding box of its solid content and exactly which of the six world faces that content touches -- whether a structure has reached the extremity of t"
tags: [settled, "swek-engine", v2765]
timestamp: v2765
---

# The voxel world knows when its content has reached the edge -- extremity bound checking, proven not assumed

- **Status:** settled  
- **Since:** v2765

## Prediction

The voxel world can report the bounding box of its solid content and exactly which of the six world faces that content touches -- whether a structure has reached the extremity of the world (about to be clipped, or needing a bigger grid). Interior content touches nothing; a voxel on a face flags that face and only that face; the far corner flags three at once. inBounds is the single boundary predicate that accepts in-range and rejects out-of-range on every axis.

## Why

extremityBounds scans the solid voxels for min/max on each axis and compares against 0 and size-1; those comparisons are the load-bearing lines. A control that silently lets content run off the extremity is how a kaiju walks through a wall that was never there.

## Measured

voxelExtremity-selfcheck.mjs, 9 checks: empty world touches nothing; interior blob has an exact bounding box and touches no face; a voxel on x=0 flags xMin and nothing else; the far corner flags xMax/yMax/zMax together; inBounds accepts (0,0,0) and (s-1,s-1,s-1), rejects -1 and s on every axis; the generated terrain sits on the floor and spans the footprint without reaching the ceiling. SABOTAGE (minX === 0 -> minX === 1) makes the x=0 face go undetected and the gate catches it.

## Kill condition

tools/voxelExtremity-selfcheck.mjs. HONEST SCOPE: this proves the extremity REPORT is correct on a CPU voxel chunk -- it does not itself clamp or resize the world; it is the signal a caller acts on.

# Citations

- Code: voxel/voxelworld.js (inBounds + extremityBounds) + tools/voxelExtremity-selfcheck.mjs.
- Page: `case-study.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
