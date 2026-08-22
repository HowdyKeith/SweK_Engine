---
type: claim
title: "XPBD damping -- paper Equation 26, energy bled along constraints, still deterministic"
description: "The v2659 solver was elastic-only; the paper also gives a damping model (Eq 26) that bleeds energy out of motion ALONG each constraint without touching the elastic response. It add"
tags: [settled, "swek-engine", v2663]
timestamp: v2663
---

# XPBD damping -- paper Equation 26, energy bled along constraints, still deterministic

- **Status:** settled  
- **Since:** v2663

## Prediction

The v2659 solver was elastic-only; the paper also gives a damping model (Eq 26) that bleeds energy out of motion ALONG each constraint without touching the elastic response. It adds a velocity term to the multiplier update. Done naively it would read positions in a way that breaks determinism; done in its own file it leaves the verified undamped solver untouched.

## Why

physics/xpbd/xpbdDamped.js. Eq 26: d_lambda = (-C - aTilde*lambda - gamma * gradC.(x - x_prev)) / ((1+gamma)*(w1+w2) + aTilde), with aTilde = compliance/dt^2, betaTilde = dt^2*beta, gamma = aTilde*betaTilde/dt. The velocity term reads only the two endpoints displacement this substep, so the solve stays a pure per-color function -- graph-colored, order-free, bit-identical. Set beta = 0 and gamma vanishes and it reduces EXACTLY to xpbdSubstep. Kept separate so xpbd.js and the xpbd-cloth fingerprint do not move.

## Measured

physics/xpbd/xpbdDamped-selfcheck.mjs, 6 checks. beta=0 reduces to xpbdSubstep byte-for-byte. A stretched constraint released with no gravity keeps oscillating undamped but settles under damping (late |vel| sum 32 -> 0.03). One moving step matches the closed-form Eq 26 value to 1e-12 and lands measurably apart from the undamped step. Byte-identical under 200 within-color shuffles; heavy damping at a large dt stays finite. Folded into the fingerprint as subsystem ten (xpbd-damped); master 62a842a5...

## Kill condition

physics/xpbd/xpbdDamped-selfcheck.mjs. SABOTAGE: drop the gamma velocity term in the numerator -- the energy check and the exact check both fail, because DAMPING WITHOUT THE VELOCITY TERM DAMPS NOTHING. The GPU port reuses xpbd-distance.wgsl with the added term (rig-only).

# Citations

- Code: physics/xpbd/xpbdDamped.js (xpbdSubstepDamped, Eq 26) + physics/xpbd/xpbdDamped-selfcheck.mjs (6 checks, gated, sabotage-tested) + folded into tools/fingerprint (subsystem 10) and tools/ledger. The last piece of the paper, added deterministically.
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
