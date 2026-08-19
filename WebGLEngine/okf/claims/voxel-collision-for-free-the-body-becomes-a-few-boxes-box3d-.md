---
type: claim
title: "Voxel collision for free -- the body becomes a few boxes, box3d does the rest"
description: "The list-of-three game item: port our own voxel collider. The answer was that we mostly do not need to. box3d already has box-vs-box; if a voxel body is decomposed into a small set"
tags: [settled, "swek-engine", v2634]
timestamp: v2634
---

# Voxel collision for free -- the body becomes a few boxes, box3d does the rest

- **Status:** settled  
- **Since:** v2634

## Prediction

The list-of-three game item: port our own voxel collider. The answer was that we mostly do not need to. box3d already has box-vs-box; if a voxel body is decomposed into a small set of solid boxes, voxel collision falls out for free, MIT-clean, with nothing to port. This builds that decomposition.

## Why

greedyMesh3d makes the visible SURFACE (a solid cube -> 6 face quads), which is the wrong thing for collision. physics/voxelBoxCover.js does the opposite: a greedy SOLID decomposition that grows each box along x, then y, then z, partitioning the filled volume. A solid 8x8x8 cube becomes ONE collider instead of 512. boxToCollider converts each to a box3d addBox spec in world units; addVoxelBody wires a whole body into any box3d world.

## Measured

The soundness rests on one property and the gate hammers it: the boxes EXACTLY PARTITION the filled voxels -- every filled cell covered once, no empty cell ever covered -- across cube, slab, L-beam, hollow shell, sphere, checkerboard, and two islands. When that holds, box3d colliding against the boxes IS box3d colliding against the body. Reduction confirmed (cube -> 1 box), boxes provably disjoint, and the adapter hands box3d the exact world AABB of each box.

## Kill condition

physics/voxelCollider-selfcheck.mjs. SABOTAGE: grow every box one cell further in z -- the partition check fails, because a covered empty cell is a phantom wall and a double-covered cell is doubled mass. A 3D checkerboard must yield one box per cell, never a coarse merge that spans the gaps: A COARSE MERGE THAT SPANNED THE GAPS WOULD BE A COLLIDER THAT LIES ABOUT WHERE THE BODY IS. The live box3d drop (a voxel slab holds a crate) is rig-only -- box3d.wasm does not load headless.

# Citations

- Code: physics/voxelBoxCover.js (boxCover/boxToCollider/addVoxelBody) + physics/voxelCollider-selfcheck.mjs (5 checks, gated, sabotage-tested; real drop rig-only). No ARR collider ported: the MIT stress/fracture engine was the valuable part of vox3D, not KRUNCH.
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
