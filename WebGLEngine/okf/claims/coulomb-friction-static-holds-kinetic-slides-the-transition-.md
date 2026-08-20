---
type: claim
title: "Coulomb friction -- static holds, kinetic slides, the transition exactly at the friction ratio"
description: "The contacts so far only pushed apart along the normal; nothing resisted sliding along the surface. Coulomb friction adds that, with one bound: after a normal correction of some de"
tags: [settled, "swek-engine", v2674]
timestamp: v2674
---

# Coulomb friction -- static holds, kinetic slides, the transition exactly at the friction ratio

- **Status:** settled  
- **Since:** v2674

## Prediction

The contacts so far only pushed apart along the normal; nothing resisted sliding along the surface. Coulomb friction adds that, with one bound: after a normal correction of some depth, the tangential motion is resisted by at most mu times that depth. Below the bound the tangential motion is cancelled entirely (stick, static friction); above it, only reduced (slide, kinetic). That single limit is the whole of Coulomb friction and it puts the stick-slide boundary exactly where the slope's tangent passes mu.

## Why

physics/xpbd/friction.js. solvePlaneFriction resolves penetration along the normal, measures the tangential displacement since the previous step, and scales the friction correction by min(1, mu*depth/tangentialLength) -- static when the bound is not binding, kinetic when it is. Trig-free: a slope is given as a surface NORMAL (slopeNormal builds it from a tangent ratio with a square root), never an angle, so no sin/cos ever runs and the initial setup is bit-identical.

## Measured

physics/xpbd/friction-selfcheck.mjs, 6 checks. With mu 0.5 a particle does not move at all on slopes of 0.3 and 0.45, and slides on 0.55 and 0.9 -- the transition sits at mu. A slider with friction travels measurably less than a frictionless one; mu 0 recovers free sliding. The normal correction places a penetrating particle on the surface to 1e-12. Two runs are byte-identical with no transcendental. Folded into the fingerprint as subsystem twenty (friction-slope); master 3058e7ab...

## Kill condition

physics/xpbd/friction-selfcheck.mjs. SABOTAGE: remove the Coulomb bound so the tangential motion is always cancelled in full -- every slope then sticks, and the sliding and transition checks fail. FRICTION WITHOUT A LIMIT IS GLUE, NOT FRICTION. A slope specified by angle would seed the setup with libm sin/cos and break cross-machine bit-identity, which is why slopes are normals.

# Citations

- Code: physics/xpbd/friction.js (solvePlaneFriction Coulomb static/kinetic, planeFrictionSubstep, slopeNormal trig-free) + physics/xpbd/friction-selfcheck.mjs (6 checks, gated, sabotage-tested) + folded into tools/fingerprint (subsystem 20) and tools/ledger. Contact mechanics: the tangential half of a contact.
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
