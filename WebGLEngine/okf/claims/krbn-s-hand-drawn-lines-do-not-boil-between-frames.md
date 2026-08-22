---
type: claim
title: "Krbn's hand-drawn lines do not boil between frames"
description: "Wobble is seeded on stable stroke identity and never re-randomised per frame."
tags: [settled, "swek-engine", "their claim, tested v2530"]
timestamp: "their claim, tested v2530"
---

# Krbn's hand-drawn lines do not boil between frames

- **Status:** settled  
- **Since:** their claim, tested v2530

## Prediction

Wobble is seeded on stable stroke identity and never re-randomised per frame.

## Why

Tested on an ANALYTIC scene, deliberately -- a marched mesh would have contaminated the answer, because marching cubes re-tessellates and I would have measured my own marcher. Camera nudged 0.004 units (0.1%): 89 paths -> 89 paths, ALL 89 with matching point-counts, mean coordinate shift 0.056px. A re-dealt wobble would change the point counts and shift by pixels.

## Measured

Holds. Sub-pixel tracking, structure identical. AND the corollary is ours: our MARCHED blob restructures under motion (1548 -> 1546 triangles at a 0.05 nudge), and a stroke on a triangle that did not exist last frame has no identity to be stable about. An animated blob WOULD boil -- and it would be our marcher, not his wobble.

# Citations

- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
