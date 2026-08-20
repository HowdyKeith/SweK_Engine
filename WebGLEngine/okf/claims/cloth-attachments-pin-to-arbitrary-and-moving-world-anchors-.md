---
type: claim
title: "Cloth attachments -- pin to arbitrary and moving world anchors, deterministically"
description: "A cloth solver has to hang the cloth from something: fixed hooks, curtain rings, a moving hand. Pinning a particle dead (invMass 0) covers a static hook, but to pull a movable part"
tags: [settled, "swek-engine", v2665]
timestamp: v2665
---

# Cloth attachments -- pin to arbitrary and moving world anchors, deterministically

- **Status:** settled  
- **Since:** v2665

## Prediction

A cloth solver has to hang the cloth from something: fixed hooks, curtain rings, a moving hand. Pinning a particle dead (invMass 0) covers a static hook, but to pull a movable particle toward a world point -- especially a MOVING one -- needs a constraint. Done as an XPBD point constraint, a hard anchor should snap the particle exactly onto the target and a moving anchor should drag it along, both deterministically.

## Why

physics/xpbd/attach.js. Each attachment is an XPBD point constraint C = |x - target|: d_lambda = (-C - aTilde*lambda)/(w + aTilde), dx = w*(x-target)/|x-target|*d_lambda. With compliance 0 the correction is exactly -(x - target), so the particle lands on the anchor in one solve; with positive compliance it is a soft spring. The target may be rewritten every frame, so a moving anchor just drags the particle. Each attachment touches ONE particle, so attachments to distinct particles are independent -- order-free.

## Measured

physics/xpbd/attach-selfcheck.mjs, 6 checks. A hard attachment snaps a particle from (5,3,-2) onto (1,1,1) to 1e-12. A soft attachment pulls monotonically toward the anchor with no overshoot. A moving anchor drags its particle to the exact target position and two runs are byte-identical. Byte-identical under 200 shuffles of attachment order; one soft step matches the closed-form Eq 18 point-constraint value to 1e-12. Folded into the fingerprint as subsystem twelve (cloth-pinned, a sheet held by one fixed and one moving anchor); master 473908b1...

## Kill condition

physics/xpbd/attach-selfcheck.mjs. SABOTAGE: drop the length normalization in the point-constraint correction -- the hard pin overshoots instead of landing on the anchor, and the snap, moving-anchor, exact, and determinism checks all fail. WITHOUT THE UNIT NORMAL THE CORRECTION IS NOT A POSITION CONSTRAINT, IT IS A SCALED SHOVE. The GPU port solves attachments in a per-particle transform-feedback pass (rig-only).

# Citations

- Code: physics/xpbd/attach.js (solveAttachments XPBD point constraint, attachSubstep) + physics/xpbd/attach-selfcheck.mjs (6 checks, gated, sabotage-tested) + folded into tools/fingerprint (subsystem 12) and tools/ledger. The cloth pillar complete: stretch, shear, bend, self-collide, damp, tear, pin -- and the whole substep as a closed GPU loop.
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
