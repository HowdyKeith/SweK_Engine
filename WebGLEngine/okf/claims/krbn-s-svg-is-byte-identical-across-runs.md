---
type: claim
title: "Krbn's SVG is byte-identical across runs"
description: "vpalos/Krbn says: <b>the same scene always emits the same, byte-identical, diffable SVG</b>."
tags: [settled, "swek-engine", "their claim, tested at v2521"]
timestamp: "their claim, tested at v2521"
---

# Krbn's SVG is byte-identical across runs

- **Status:** settled  
- **Since:** their claim, tested at v2521

## Prediction

vpalos/Krbn says: <b>the same scene always emits the same, byte-identical, diffable SVG</b>.

## Why

Someone else's claim, run through this gate rather than taken on trust. Fetched the repo, installed it, ran its own suite (326 tests, 0 fail, 60,518 assertions in 15s on a box its author never saw), then rendered the full gallery TWICE into separate directories and byte-compared every file. This is the first external claim all session to meet the gate and survive.

## Measured

22/22 identical (7.3 MB). SweK's own rig as a scene: identical, 347,017 bytes. And SweK's FLESH -- a 904-triangle marched mesh -- rendered twice: identical, 487,385 bytes, sha aeb98e52. THE CLAIM HOLDS ON THEIR SCENES, ON OUR PRIMITIVES, AND ON OUR MESH. Separately measured: their mesh path is QUADRATIC in triangle count (exponent 2.0 across 904/1,732/2,608 triangles), which predicts ~542s for a 10,520-triangle mesh -- and that is exactly what timed out.

# Citations

- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
