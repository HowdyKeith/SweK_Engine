---
type: claim
title: "The isosurface papers optimise 10% of the flesh frame"
description: "Handed Wald et al. 'Faster Isosurface Ray Tracing using Implicit KD-Trees' (IEEE TVCG 11(5) 2005, 84 citations -- a correct paper) plus a summary recommending speculative raycastin"
tags: [settled, "swek-engine", v2550]
timestamp: v2550
---

# The isosurface papers optimise 10% of the flesh frame

- **Status:** settled  
- **Since:** v2550

## Prediction

Handed Wald et al. 'Faster Isosurface Ray Tracing using Implicit KD-Trees' (IEEE TVCG 11(5) 2005, 84 citations -- a correct paper) plus a summary recommending speculative raycasting, dual contouring, temporal reprojection and TAA for isosurface popping. PREDICTION: all of it optimises a minority of this engine's frame, and the honest first move is to profile before adopting.

## Why

Amdahl. A technique that HALVES a stage worth 10% buys 5%. It does not matter how good the paper is.

## Measured

MEASURED, 500 particles, hybrid skin: SPH step 5.31ms (81%), hybridGrid 0.83ms (13%), marchScalarField 0.40ms (6%). THE ISOSURFACE IS 6-12% OF THE FRAME depending on size. Make the marcher INFINITELY FAST and the frame gets ~10% shorter. AND THE SKIP IS ALREADY TAKEN: Wald's whole idea is that an annotated kd-tree skips subtrees that cannot contain the isovalue, because 'the isosurface is only located within a small subset of all cells'. fitGrid ALREADY FITS THE BOX TO THE BONES -- 28x10x10 = 2,187 cells, not 28^3 = 21,952. A 7-10x skip, taken earlier in the pipeline, better suited to a limb than a tree over a 256^3 cube. That is WHY the grid measures 76% empty rather than the >99% of a CT volume, which is why HE needed a tree and this does not. A block min/max pass (the cheapest expression of his idea, since his volumes are STATIC and this field changes every frame) measured 0.095ms to save at most 0.362ms of a 0.476ms march: it would win 2% of a frame.

## Kill condition

Profile the flesh on the rig at a size that actually ships. If marchScalarField exceeds ~40% of the frame there, the isosurface papers become worth reading and this claim dies. frame-budget-selfcheck asserts the shape, so the flip would arrive as a build failure rather than as someone's hunch in eight months.

# Citations

- Code: tools/frame-budget.mjs + frame-budget-selfcheck.mjs (7 checks, gated). The bottleneck is the SPH, and v2536 already measured that the spatial grid LOSES below ~1000 particles -- so at 500 this is brute force BY MEASUREMENT, not by neglect. RIG-ONLY caveat: this box is 1 CPU, so the SHAPE is pinned and the milliseconds are not.
- Page: `/flesh.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
