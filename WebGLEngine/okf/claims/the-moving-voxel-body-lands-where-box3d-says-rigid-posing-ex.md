---
type: claim
title: "The moving voxel body lands where box3d says -- rigid posing, exact"
description: "Third piece of the moving-voxel-body story. The cover is the shape, the mass properties are how it rotates, and this places the cover boxes in the world as box3d moves the body. Ea"
tags: [settled, "swek-engine", v2636]
timestamp: v2636
---

# The moving voxel body lands where box3d says -- rigid posing, exact

- **Status:** settled  
- **Since:** v2636

## Prediction

Third piece of the moving-voxel-body story. The cover is the shape, the mass properties are how it rotates, and this places the cover boxes in the world as box3d moves the body. Each frame box3d returns a position and an orientation quaternion about the centre of mass; this maps every cover box under that transform so the whole body travels and tumbles as one rigid unit, and it gives the body tight world AABB for broad-phase.

## Why

physics/voxelPose.js: rotateByQuat normalises the quaternion (a non-unit quat cannot scale the body) and applies it; poseBoxes maps each cover box centre relative to the pivot (the COM), rotates, and translates to the world position, carrying the half-extents and the orientation. worldAABB expands over every rotated corner of every box to a tight axis-aligned box.

## Measured

Checked against geometry a bug cannot fake. The identity transform leaves every box where it was. A quarter turn about Z sends +x to +y and +y to -x. Pure translation shifts every box by the same vector. Rotation preserves every box-to-box distance -- it is an isometry, so the body cannot stretch when it turns. And the world AABB contains every rotated corner while hugging them on all six faces.

## Kill condition

physics/voxelPose-selfcheck.mjs. SABOTAGE: drop the w*t term from the quaternion formula -- the quarter-turn and isometry checks both fail. A NON-ISOMETRY WOULD BE A BODY THAT STRETCHED WHEN IT TURNED; a loose AABB culls things it should not and a too-small one misses collisions. The live drive in box3d is rig-only (box3d.wasm does not load headless).

# Citations

- Code: physics/voxelPose.js (rotateByQuat/poseBoxes/worldAABB) + physics/voxelPose-selfcheck.mjs (5 checks, gated, sabotage-tested). The trilogy is complete: cover for collision, mass properties for rotation, posing for placement -- a voxel body is now a box3d rigid body end to end.
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
