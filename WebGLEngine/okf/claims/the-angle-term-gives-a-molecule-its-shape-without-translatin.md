---
type: claim
title: "The angle term gives a molecule its shape, without translating or spinning it"
description: "Bonds fix distances; an angle term fixes the bend between three atoms, which is what makes water bent at 104.5 degrees rather than a straight line. This adds a 3-body angle force t"
tags: [settled, "swek-engine", v2643]
timestamp: v2643
---

# The angle term gives a molecule its shape, without translating or spinning it

- **Status:** settled  
- **Since:** v2643

## Prediction

Bonds fix distances; an angle term fixes the bend between three atoms, which is what makes water bent at 104.5 degrees rather than a straight line. This adds a 3-body angle force that pushes the angle back to its preferred value.

## Why

physics/md/angles.js uses the cosine-harmonic form V = 1/2 k (cos t - cos t0)^2 -- NOT the textbook harmonic in t, because that needs acos, a transcendental that would break cross-arch determinism. Cosine-harmonic is built from dot products and magnitudes: arithmetic and sqrt only. The minimum is still at t0.

## Measured

The force is zero at the preferred angle. It has NO net force and NO net torque -- an internal term can bend the molecule but must not make it drift or spin, and both fall out to ~1e-9. The analytic force matches a central-difference of the potential to 1e-5, proving it is minus the gradient it reports. Energy stays bounded as the angle oscillates for 4000 steps.

## Kill condition

physics/md/angles-selfcheck.mjs. SABOTAGE: scale the gradient by 1.5 -- the finite-difference and energy checks both fail, because the force no longer differentiates the potential. AN ANGLE FORCE THAT DID NOT SUM TO ZERO WOULD MAKE A MOLECULE FLY OR SPIN ON ITS OWN. No acos, so it stays deterministic.

# Citations

- Code: physics/md/angles.js (angleForces, cosine-harmonic) + physics/md/angles-selfcheck.mjs (5 checks, gated, sabotage-tested, finite-difference cross-checked). MD force field now: LJ + bonds + angles.
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
