---
type: claim
title: The Krbn mesh cost is quadratic in triangle count
description: "Measured 904/1,732/2,608 triangles at 4/14/34s -- exponent 2.0. Predicted <b>106s</b> for a 4,662-triangle blob."
tags: [broken, "swek-engine", "v2524, tested v2529"]
timestamp: "v2524, tested v2529"
---

# The Krbn mesh cost is quadratic in triangle count

- **Status:** broken  
- **Since:** v2524, tested v2529

## Prediction

Measured 904/1,732/2,608 triangles at 4/14/34s -- exponent 2.0. Predicted <b>106s</b> for a 4,662-triangle blob.

## Why

The model was fitted on ONE shape family: the ragdoll flesh, which is mostly limbs -- cylinder-ish, with little silhouette per triangle. A blob is nothing but curvature and folds over itself constantly, so it carries far more silhouette per triangle. Triangle count was never the whole cost; I folded a second variable into the first and called it an exponent.

## Measured

152s. 1.43x off. The scaling is still roughly quadratic, but the CONSTANT is a property of the shape, not the mesh size. Measured honestly, generalised carelessly.

# Citations

- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
