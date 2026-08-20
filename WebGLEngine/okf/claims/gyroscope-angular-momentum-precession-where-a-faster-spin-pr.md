---
type: claim
title: "Gyroscope -- angular-momentum precession, where a faster spin precesses slower"
description: "A spinning gyroscope pivoted at one end does not fall over; its axis sweeps a cone around the vertical. The reason is angular momentum: gravity applies a torque about the pivot, an"
tags: [settled, "swek-engine", v2693]
timestamp: v2693
---

# Gyroscope -- angular-momentum precession, where a faster spin precesses slower

- **Status:** settled  
- **Since:** v2693

## Prediction

A spinning gyroscope pivoted at one end does not fall over; its axis sweeps a cone around the vertical. The reason is angular momentum: gravity applies a torque about the pivot, and dL/dt = tau turns the axis sideways to the pull rather than down. Writing the axis as a-hat = L/|L| and the torque as -mgl*(a-hat x z-hat), the torque is always perpendicular to both the axis and the vertical, so |L| and the vertical component of L are conserved and the axis precesses steadily at Omega = mgl/|L| -- meaning a faster spin precesses SLOWER. Every step is cross products and a square root, so it is cross-architecture bit-identical.

## Why

physics/gyroscope.js. makeGyro sets L = I*omega along a given axis (normalised, no trig); gyroStep computes a-hat = L/|L|, the gravity torque -mgl*(a-hat x z-hat), and advances L by dL = tau*dt. Because tau is perpendicular to L the magnitude holds, and because it is perpendicular to the vertical the tilt holds -- steady precession from pure cross-product integration.

## Measured

physics/gyroscope-selfcheck.mjs, 5 checks. The axis sweeps around the vertical; over 400 steps it holds its tilt and its |L| within a percent (it precesses, it does not fall); the change in L each step is perpendicular to both the axis and the vertical; doubling the spin halves the precession rate to within a few percent (the counterintuitive signature); and it is deterministic, trig-free. Folded into the fingerprint as subsystem thirty; a Lab scene draws the tilted flywheel sweeping its cone and a preset opens it; master 28f3fdff...

## Kill condition

physics/gyroscope-selfcheck.mjs. SABOTAGE: point the torque along the axis instead of across it (drop the cross product with the vertical) and the gyroscope spins up and tips instead of precessing -- the tilt is no longer held, |L| runs away, and four of the five checks fail. The sideways torque is the whole phenomenon: a force at right angles to the motion turns it rather than speeding or stopping it.

# Citations

- Code: physics/gyroscope.js (makeGyro, gyroStep, axisOf, cosTilt, spinMag) + physics/gyroscope-selfcheck.mjs (5 checks, gated, sabotage-tested) + folded into tools/fingerprint (subsystem 30), tools/ledger, tools/catalog + a Lab scene (tilted flywheel sweeping a cone) and a preset. Precession from angular momentum, cross-architecture.
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
