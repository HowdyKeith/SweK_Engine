---
type: claim
title: "Cross-thread determinism was untestable"
description: "Box3D's thread-count determinism claim could not be tested through the binding."
tags: [broken, "swek-engine", "v2500, settled v2508"]
timestamp: "v2500, settled v2508"
---

# Cross-thread determinism was untestable

- **Status:** broken  
- **Since:** v2500, settled v2508

## Prediction

Box3D's thread-count determinism claim could not be tested through the binding.

## Why

I read b3ValidateReplay's doc -- 'workerCount: reserved for future; pass 1 for now' -- and generalised from one function to the whole API. Eight lines later, b3RecPlayer_Create says replaying at a different count IS the cross-thread test. One docstring read, an entire API assumed.

## Measured

It is testable. test/threads.mjs does it.

# Citations

- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
