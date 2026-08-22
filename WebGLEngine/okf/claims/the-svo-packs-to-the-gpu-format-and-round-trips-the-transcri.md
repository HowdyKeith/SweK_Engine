---
type: claim
title: "The SVO packs to the GPU format and round-trips -- the transcript generator bug, fixed"
description: "To raymarch a sparse voxel world on the GPU you flatten the octree into the Laine-Karras format: two uint32 per node, child mask and leaf mask and a contiguous child pointer, read "
tags: [settled, "swek-engine", v2657]
timestamp: v2657
---

# The SVO packs to the GPU format and round-trips -- the transcript generator bug, fixed

- **Status:** settled  
- **Since:** v2657

## Prediction

To raymarch a sparse voxel world on the GPU you flatten the octree into the Laine-Karras format: two uint32 per node, child mask and leaf mask and a contiguous child pointer, read from a texture with bitCount to skip to the right child. The follow-up transcript sketched this and got the memory layout wrong -- it set each node\'s child pointer but never assigned the branch children their own slot, so anything below the first level packed to a bad index and the buffer was corrupt.

## Why

physics/octree/svoGenerator.js. buildSVO does a single BFS that assigns every node a slot as it is placed, so children are contiguous at childPtr and every branch has a real slot -- the fix for the transcript bug. svoAt is a CPU reader that walks the packed buffer the same way the shader does. Pure integer, deterministic. physics/octree/svo-raymarch.glsl is the WebGL2 raymarcher whose buffer addressing is byte-for-byte svoAt\'s.

## Measured

physics/octree/svo-selfcheck.mjs, 5 checks. Spine: traversing the packed buffer reproduces the source octree for all 32768 cells of a THREE-LEVEL world -- the exact round-trip the buggy layout fails below level 1. The pack is deterministic (byte-identical buffer), compact (two uint32 per node, far fewer than per cell), the bitCount child-offset addressing is verified against a hand case, and empty/solid uniform worlds round-trip. The raymarch shader is rig-only: its addressing is proven via svoAt, its ray stepping is to be validated on Galaxina against a CPU march.

## Kill condition

physics/octree/svo-selfcheck.mjs. SABOTAGE: point childPtr at a fixed wrong slot (the transcript\'s mistake) -- the round-trip fails, because the packed tree no longer describes the world. A CORRUPT SVO BUFFER RENDERS GARBAGE OR EMPTY SPACE WHERE THERE ARE VOXELS, silently.

# Citations

- Code: physics/octree/svoGenerator.js (buildSVO Laine-Karras packing + svoAt CPU reader + bitCount) + physics/octree/svo-selfcheck.mjs (5 checks, gated, sabotage-tested, round-trip) + physics/octree/svo-raymarch.glsl (WebGL2 raymarcher, rig-only, addressing mirrors svoAt). Builds on the CPU octree of v2656.
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
