---
type: claim
title: "PBF polish -- artificial pressure that stops clumping and XSPH viscosity that makes the flow coherent"
description: "The bare density solver has two well-known failings. In stretched regions a few particles have low density, so the density constraint pulls them together and they clump into cluste"
tags: [settled, "swek-engine", v2678]
timestamp: v2678
---

# PBF polish -- artificial pressure that stops clumping and XSPH viscosity that makes the flow coherent

- **Status:** settled  
- **Since:** v2678

## Prediction

The bare density solver has two well-known failings. In stretched regions a few particles have low density, so the density constraint pulls them together and they clump into clusters and voids -- the tensile instability. And the velocity field stays noisy, particles jittering past their neighbours. Position-based fluids fixes both with two small terms: an artificial pressure (s_corr) that adds a gentle repulsion, and XSPH, a viscosity that blends each velocity toward its neighbours.

## Why

physics/xpbd/pbf.js. In the position correction s_corr adds -k*(W(r)/W(dq))^4 to the multiplier -- a repulsion that grows as particles crowd; the exponent is an integer power built by multiplication, not Math.pow. applyXSPH nudges each velocity toward the poly6-weighted average of its neighbours, normalised by the total weight so it is a bounded average rather than an unnormalised sum that could blow up. Both are opt-in and reuse the same canonical sorted neighbours, so with them off the existing PBF subsystems are byte-identical.

## Measured

physics/xpbd/pbfPolish-selfcheck.mjs, 6 checks. With the density constraint made neutral so s_corr is the only force, a cohering pair moves apart under repulsive s_corr, holds still with none, and collapses under a wrong-signed one. XSPH drops neighbour velocity variance to under a third; forty strong passes on large velocities stay bounded. Both reproduce byte-for-byte; s_corr off is byte-identical to the plain solver. Folded into the fingerprint as subsystem twenty-four (pbf-polish); pbf-fluid and fluid-pbf hashes unchanged. master 1619cb41...

## Kill condition

physics/xpbd/pbfPolish-selfcheck.mjs. SABOTAGE: flip the sign of s_corr -- the artificial pressure becomes an attraction and the repulsion check fails, because a pressure that pulls particles together makes the clumping worse, not better. Getting the s_corr test right meant isolating it at neutral density; in a bare unbounded projection loop it -- and the density solve itself -- simply explode, which is a property of undamped projection, not of the term.

# Citations

- Code: physics/xpbd/pbf.js (s_corr artificial pressure in pbfProject, applyXSPH weight-normalised viscosity) + physics/xpbd/pbfPolish-selfcheck.mjs (6 checks, gated, sabotage-tested) + folded into tools/fingerprint (subsystem 24) and tools/ledger. The fluid finished: no clumps, coherent flow.
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
