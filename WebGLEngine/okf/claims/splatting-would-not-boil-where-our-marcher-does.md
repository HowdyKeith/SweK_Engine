---
type: claim
title: Splatting would not boil where our marcher does
description: "An animated Gaussian-splat scene keeps <b>primitive identity across frames</b>; an animated marched isosurface does not, and the strokes drawn on it have nothing to be stable about"
tags: [settled, "swek-engine", "v2532, tested v2533"]
timestamp: "v2532, tested v2533"
---

# Splatting would not boil where our marcher does

- **Status:** settled  
- **Since:** v2532, tested v2533

## Prediction

An animated Gaussian-splat scene keeps <b>primitive identity across frames</b>; an animated marched isosurface does not, and the strokes drawn on it have nothing to be stable about.

## Why

v2530 measured it: our marched blob re-tessellates under motion (1548 -> 1546 triangles at a 0.05 nudge), so Krbn's stroke-identity coherence -- which HOLDS, 89/89 paths at 0.056px on an analytic scene -- has nothing to hold onto. A Gaussian is a PERSISTENT PRIMITIVE: it moves, it is not re-created. Scthe/gaussian-splatting-webgpu is the reference (VERIFIED LIVE, master branch).

## Measured

<b>HOLDS.</b> Built a 44-splat cloud as Krbn Ellipsoids with stable ids and moved exactly ONE of them: <b>385 of 419 paths stayed BYTE-IDENTICAL (91.9%)</b>. Our marched blob under a nudge: <b>0%</b>, and the triangle count changed too. The 8% that moved is splat 7's own strokes plus what it newly occludes -- which SHOULD change. And the mechanism is now known, not guessed: src/pipeline/wobble.ts keys its noise field on each vertex's OBJECT-SPACE position, so a splat carries its wobble with it while a marched blob's vertices SLIDE THROUGH a stationary field.

## Kill condition

If an animated splat scene shows the same per-frame identity churn a marched isosurface does, the idea is dead.

# Citations

- Code: Done in the sandbox. NOT extrapolated: 44 splats renders in 7s, a real splat scene is a million+, and the last cost model I extrapolated (v2524) was 43% wrong.
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
