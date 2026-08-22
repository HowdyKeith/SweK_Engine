---
type: claim
title: "The octree is a lossless, deterministic, sparse occupancy that A* can use unchanged"
description: "The voxel world wants a spatial structure -- to store a mostly-empty world cheaply, to cull, and to feed the pathfinder valid nodes. An octree does that by splitting space into eig"
tags: [settled, "swek-engine", v2656]
timestamp: v2656
---

# The octree is a lossless, deterministic, sparse occupancy that A* can use unchanged

- **Status:** settled  
- **Since:** v2656

## Prediction

The voxel world wants a spatial structure -- to store a mostly-empty world cheaply, to cull, and to feed the pathfinder valid nodes. An octree does that by splitting space into eight octants and merging uniform regions, but only if the merge is LOSSLESS: querying the tree must return exactly what the source grid held, or it silently lies about what is solid.

## Why

physics/octree/octree.js. buildOctree recurses and merges any region that is uniformly empty or uniformly solid back into a single leaf; octreeAt descends to the leaf containing a cell. Pure integer -- subdivision by bit-shift, occupancy 0/1, no floats -- so the tree is bit-identical across machines. octreeFromGrid/octreeToBlocked bridge it to the flat grid A* already speaks.

## Measured

physics/octree/octree-selfcheck.mjs, 5 checks. Fidelity: the octree reproduces the source occupancy for all 32768 cells of a test world exactly (lossless). Compression: that world stores in 225 nodes, 99.3% fewer than cells, uniform regions merged. Determinism: two builds give the identical node count and readback hash. And the tie to the pathfinder: A* run on the octree\'s occupancy returns the BYTE-IDENTICAL path it returns on the flat grid -- a true drop-in. A single solid cell among empties is never merged away.

## Kill condition

physics/octree/octree-selfcheck.mjs. SABOTAGE: drop the leaves-disagree check so mixed regions merge -- the fidelity check fails, because the tree now reports a whole region as one value when it was not. AN OCTREE THAT MERGES NON-UNIFORM REGIONS LIES ABOUT THE WORLD, and a pathfinder or a renderer built on it walks through walls.

# Citations

- Code: physics/octree/octree.js (buildOctree, octreeAt, octreeFromGrid, octreeToBlocked, countNodes) + physics/octree/octree-selfcheck.mjs (5 checks, gated, sabotage-tested). The CPU spatial octree; the GPU-packed sparse voxel octree for raymarching is a separate layer on this shape.
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
