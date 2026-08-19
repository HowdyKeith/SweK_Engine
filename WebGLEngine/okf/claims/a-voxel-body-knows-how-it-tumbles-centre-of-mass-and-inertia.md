---
type: claim
title: "A voxel body knows how it tumbles -- centre of mass and inertia, exact"
description: "The box cover lets box3d collide a STATIC voxel body. A moving one -- a kaiju knocked flying, an asteroid spinning -- has to travel as one rigid unit, and box3d is one-box-per-body"
tags: [settled, "swek-engine", v2635]
timestamp: v2635
---

# A voxel body knows how it tumbles -- centre of mass and inertia, exact

- **Status:** settled  
- **Since:** v2635

## Prediction

The box cover lets box3d collide a STATIC voxel body. A moving one -- a kaiju knocked flying, an asteroid spinning -- has to travel as one rigid unit, and box3d is one-box-per-body. So the moving body is driven as a single rigid body, which needs its centre of mass and its inertia tensor. This computes them exactly from the cover.

## Why

physics/voxelMassProps.js reuses boxCover: each cover box is a uniform solid whose own-centre inertia is the closed-form box tensor; the parallel-axis theorem shifts it to the body centre of mass; the boxes sum. The result is exact for the voxelised body -- no sampling. It returns mass, volume, COM, and the symmetric 3x3 inertia tensor in world units.

## Measured

Checked against physics, not against itself. A solid cube matches the textbook m*L^2/6 on the diagonal, centred, off-diagonals zero. A long rod has its least inertia about its long axis (easy to spin, hard to tumble end-over-end). A symmetric sphere comes out centred with a diagonal isotropic tensor -- symmetry the code never knew about. And composition closes: split an L-body in two, recombine by the parallel-axis theorem, and the whole tensor is reproduced.

## Kill condition

physics/voxelMassProps-selfcheck.mjs. SABOTAGE: drop the parallel-axis shift. The cube still passes -- a single box needs no shift -- but the composition check fails, because IF THE SHIFT OR THE SUM WERE WRONG, THE RECOMBINATION WOULD NOT CLOSE. That the cube alone cannot catch it is why the split-and-recombine check exists. The live tumble in box3d is rig-only (box3d.wasm does not load headless).

# Citations

- Code: physics/voxelMassProps.js (massProperties: boxCover + closed-form box tensor + parallel-axis sum) + physics/voxelMassProps-selfcheck.mjs (4 checks, gated, sabotage-tested). Completes the moving-voxel-body story: cover for collision, mass properties for rotation.
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
