---
type: claim
title: "The sinogram shader's error was its own sin/cos"
description: "GPU vs the analytic shadow should now be <b>~1e-7</b>, down from the <b>6.48e-4</b> measured on a 1070 at v2489."
tags: [open, "swek-engine", v2490]
timestamp: v2490
---

# The sinogram shader's error was its own sin/cos

- **Status:** open  
- **Since:** v2490

## Prediction

GPU vs the analytic shadow should now be <b>~1e-7</b>, down from the <b>6.48e-4</b> measured on a 1070 at v2489.

## Why

The shader was computing its own sin/cos per texel. Passing them in as uniforms removes the divergence between what the CPU thinks the angle is and what the GPU computes it to be.

## Kill condition

If it still reads ~1e-4 on the 1070, the sin/cos was NOT the cause and the real one is still in there.

# Citations

- Code: Galaxina. Read 'GPU vs the analytic shadow'.
- Page: `/sinogram-gpu.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
