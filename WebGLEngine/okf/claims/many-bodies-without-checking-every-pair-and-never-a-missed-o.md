---
type: claim
title: "Many bodies without checking every pair -- and never a missed overlap"
description: "One voxel body is a box3d rigid body now. A kaiju swarm or an asteroid field is hundreds of them, and checking every pair is quadratic. This buckets each body world AABB (from voxe"
tags: [settled, "swek-engine", v2637]
timestamp: v2637
---

# Many bodies without checking every pair -- and never a missed overlap

- **Status:** settled  
- **Since:** v2637

## Prediction

One voxel body is a box3d rigid body now. A kaiju swarm or an asteroid field is hundreds of them, and checking every pair is quadratic. This buckets each body world AABB (from voxelPose.worldAABB) into a uniform grid and returns only the pairs that share a cell, so the narrow phase runs on a short list instead of all N-squared.

## Why

physics/broadPhase.js: AabbGrid inserts each AABB into every cell it overlaps, pairs() returns the deduped candidates that share a cell, queryAABB answers a single box. The safety is by construction: if two AABBs overlap, the overlap region is non-empty and any cell in it is occupied by BOTH bodies, so overlapping bodies always share a cell. The candidate set is therefore a superset of the true overlaps -- it cannot miss one.

## Measured

Across 40 random scenes of 120 bodies, every brute-forced overlap appears in the grid pair list (10 candidate pairs where the all-pairs list is 3160 on a sparse scene -- the pruning is real). The output is deterministic for lockstep. Boundary cases hold: a body spanning 100 cells, negative coordinates, and bodies on integer cell borders all resolve.

## Kill condition

physics/broadPhase-selfcheck.mjs. SABOTAGE: insert each body into only its min-corner cell instead of every cell it spans -- the superset check fails at once, because a body that spans cells then registers in one and its overlaps are dropped. A DROPPED PAIR IS A COLLISION THAT SILENTLY DOES NOT HAPPEN. The narrow-phase confirm is exact AABB overlap.

# Citations

- Code: physics/broadPhase.js (AabbGrid.insert/queryAABB/pairs + aabbOverlap) + physics/broadPhase-selfcheck.mjs (5 checks, gated, sabotage-tested, brute-force cross-checked). Consumes voxelPose.worldAABB -- the voxel-body physics now scales to a scene.
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
