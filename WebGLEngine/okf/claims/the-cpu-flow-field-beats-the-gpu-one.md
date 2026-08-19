---
type: claim
title: The CPU flow field beats the GPU one
description: "CPU wins by <b>~50x</b> on 64-128 grids, and the GPU field disagrees with exact Dijkstra by <b>~40&deg;</b>."
tags: [open, "swek-engine", "v2156, restated v2506"]
timestamp: "v2156, restated v2506"
---

# The CPU flow field beats the GPU one

- **Status:** open  
- **Since:** v2156, restated v2506

## Prediction

CPU wins by <b>~50x</b> on 64-128 grids, and the GPU field disagrees with exact Dijkstra by <b>~40&deg;</b>.

## Why

Dijkstra is sequential and memory-bound -- the wrong SHAPE for a GPU, whatever the card. Not a story about a bad GPU: the brain's policy network is a dense matmul, the right shape, and it stays on the GPU.

## Kill condition

If brain-bench on the 1070/1080 shows the GPU faster AND agreeing (meanCos > 0.99), the default is WRONG and flowfieldAuto should be picking the GPU.

# Citations

- Code: Galaxina. Press 'Measure this machine'.
- Page: `/brain-bench.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
