---
type: claim
title: Transcription is guessing with extra steps
description: "Build the greedy drop-in for voxel-viewer.html's buildVoxelMesh: same buffer contract (positions/normals/colors/indices/bounds as typed arrays), tagged so it respects the palette i"
tags: [settled, "swek-engine", v2578]
timestamp: v2578
---

# Transcription is guessing with extra steps

- **Status:** settled  
- **Since:** v2578

## Prediction

Build the greedy drop-in for voxel-viewer.html's buildVoxelMesh: same buffer contract (positions/normals/colors/indices/bounds as typed arrays), tagged so it respects the palette index. PREDICTION: the risky part is the maths. IT WAS NOT.

## Why

A voxel mesh can have EVERY VERTEX IN THE RIGHT PLACE, every colour correct, the right triangle count, and STILL RENDER INSIDE OUT -- every face lit from behind, or vanishing under backface culling. That failure is invisible to triangle counts and invisible to set-equality of covered faces. IT IS ONLY VISIBLE IN A SCREENSHOT... OR IN A CROSS PRODUCT.

## Measured

THE WINDING TEST: for every quad, cross(v1-v0, v2-v0) . declaredNormal must be > 0, computed FROM THE VERTICES ACTUALLY EMITTED. Exact, arithmetic, no GPU. THE FIRST VERSION OF voxelMeshGreedy.js FAILED IT 48 QUADS OUT OF 58. It carried a hand-written per-direction corner table TRANSCRIBED OFF THE PAGE'S FACES ARRAY BY EYE -- six directions, each with a right answer and a wrong one, and most were wrong. THE FIX WAS NOT A BETTER TABLE: derive the order from cross(du, dv) . n -- traverse (0,0)->(1,0)->(1,1)->(0,1) when the cross points along the normal, reverse when it points against. ONE LINE OF ALGEBRA REPLACED SIX GUESSES, and it went 48/58 wrong to 0/58 wrong. Now gated on four models. Also gated: a single-colour 8x8x8 cube is SIX QUADS where the page's per-face path emits 384 faces; a striped cube CANNOT merge across the stripes; and A VOXEL OF PALETTE INDEX 0 STILL EXISTS -- the mesher reads 0 as EMPTY so tags are colourIndex+1, and off by one there makes every colour-0 voxel VANISH, a hole that looks like a content bug rather than a code bug.

## Kill condition

Any quad whose geometric normal opposes its declared normal. Gated per quad, on four models, not per direction.

# Citations

- Code: mesh/voxelMeshGreedy.js + mesh/voxelMeshGreedy-selfcheck.mjs (16 checks, gated). NOT WIRED IN: voxel-viewer.html's own buildVoxelMesh is untouched and still DEFAULT -- this is a drop-in that has never been dropped in, and calling it done before Keith sees both meshes side by side would be exactly the claim this engine exists to refuse. THE LESSON: TRANSCRIPTION IS GUESSING WITH EXTRA STEPS. Same disease as v2557 (the checker pushed x and z and never y), v2564 (the probe asked a SHIP whether the ENGINE had an up axis), v2568 (the mold never sensed), v2575 (an assertion read quads[0].w assuming an array order). I COPIED A TABLE INSTEAD OF DERIVING A RULE, AND THE GATE COUNTED THE COST IN QUADS.
- Page: `/voxel-viewer.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
