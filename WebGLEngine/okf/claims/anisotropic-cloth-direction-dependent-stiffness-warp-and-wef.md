---
type: claim
title: "Anisotropic cloth -- direction-dependent stiffness, warp and weft, from a per-edge compliance"
description: "Real fabric gives more easily along one thread direction than the other -- warp versus weft. In XPBD this needs no new machinery: a distance constraint already carries a compliance"
tags: [settled, "swek-engine", v2677]
timestamp: v2677
---

# Anisotropic cloth -- direction-dependent stiffness, warp and weft, from a per-edge compliance

- **Status:** settled  
- **Since:** v2677

## Prediction

Real fabric gives more easily along one thread direction than the other -- warp versus weft. In XPBD this needs no new machinery: a distance constraint already carries a compliance, so anisotropy is only handing the warp-direction edges one compliance and the weft-direction edges another. Under the same pull the softer direction stretches more, and the ratio of stretches follows the ratio of compliances.

## Why

physics/xpbd/anisotropy.js. buildAnisotropicCloth tags each structural edge by direction -- warp along x, weft along z -- and gives it the matching compliance; anisotropicSubstep is the ordinary XPBD distance solver, unchanged. It is the modulation spine from another angle: the field setting the compliance is not temperature or a signal but the fixed geometric direction of the edge.

## Measured

physics/xpbd/anisotropy-selfcheck.mjs, 6 checks. Pulled with the same force, a stiff-warp soft-weft sheet stretches many times further along weft than warp; swapping the two compliances swaps which direction gives; equal compliances make it isotropic, stretching the same both ways; a softer fabric stretches further, monotonically. Two runs are byte-identical and a fabric at rest holds its dimensions. Folded into the fingerprint as subsystem twenty-three (cloth-anisotropy); master bd34b9d4...

## Kill condition

physics/xpbd/anisotropy-selfcheck.mjs. SABOTAGE: hand every edge the same compliance regardless of direction -- the fabric goes isotropic and the directional and flip checks fail. ANISOTROPY IS NOTHING BUT WHICH NUMBER EACH EDGE IS GIVEN; erase the distinction and it is gone. No transcendental, so bit-identical across machines.

# Citations

- Code: physics/xpbd/anisotropy.js (buildAnisotropicCloth per-direction compliance, anisotropicSubstep ordinary distance solver, extent) + physics/xpbd/anisotropy-selfcheck.mjs (6 checks, gated, sabotage-tested) + folded into tools/fingerprint (subsystem 23) and tools/ledger. Material direction as the modulation field.
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
