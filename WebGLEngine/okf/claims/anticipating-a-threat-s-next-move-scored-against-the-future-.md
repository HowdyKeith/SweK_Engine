---
type: claim
title: "Anticipating a threat's next move, scored against the future it actually reaches -- and the intercept folds into the fingerprint"
description: "A predictor that anticipates where a threat is going and a firing lead that solves where to aim so the shot arrives with it -- both graded against the future the sim actually produ"
tags: [settled, "swek-engine", v2756]
timestamp: v2756
---

# Anticipating a threat's next move, scored against the future it actually reaches -- and the intercept folds into the fingerprint

- **Status:** settled  
- **Since:** v2756

## Prediction

A predictor that anticipates where a threat is going and a firing lead that solves where to aim so the shot arrives with it -- both graded against the future the sim actually produces, not against an opinion. The quadratic predictor reads velocity and acceleration off three past samples and is exact for a threat under constant acceleration, where a linear predictor blind to the turn is off by the distance the acceleration curves it. The lead is a quadratic in the intercept time solved with one square root, correctly rounded, so it is bit-identical across the fleet -- and it folds into the fingerprint. Leading the threat hits; aiming where it is now misses; and a threat outrunning the projectile returns no solution rather than a fake aim.

## Why

physics/predict/predict.js: threatAt is the true trajectory, predictLinear and predictQuadratic extrapolate (the quadratic using a second-order backward-difference velocity so it is exact for constant acceleration), leadIntercept solves (V.V - s^2) t^2 + 2(P-S).V t + |P-S|^2 = 0 for the smallest positive intercept time, missDistance scores against the realized future. fpPredict hashes the predictions and intercepts on a fixed arithmetic scenario. predict.html animates a maneuvering threat with the predicted next position and a leading shot that connects while the no-lead shot sails behind.

## Measured

predict-selfcheck.mjs, 3 checks: the lead meets the threat to about 1e-15 across four intercepts while aiming at the current position misses by several units; the quadratic predictor is exact for a turning threat where the linear one is off by about 0.18 a step; and an unreachable intercept returns null. The fold took the fingerprint to 50 subsystems and moved the master to 347be101.

## Kill condition

physics/predict/predict-selfcheck.mjs and a fleet fingerprint check. SABOTAGE: forget to lead -- aim where the threat is now -- and the hits become misses. If a box solves the intercept differently its predict hash and its master diverge. HONEST SCOPE: the fingerprinted part is the arithmetic prediction and the sqrt intercept; the on-screen threat path uses trig and stays off the hash, as trig belongs. The lead assumes constant threat velocity over the shot's flight, which is why the quadratic predictor exists to refine it against a maneuvering target.

# Citations

- Code: physics/predict/predict.js (predictQuadratic + leadIntercept) + physics/predict/predict-selfcheck.mjs + the predict subsystem in the fingerprint + predict.html. Anticipation graded against the realized future, and the intercept the same to the bit on every box.
- Page: `predict.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
