---
type: claim
title: "Plasticity -- yield past a strain threshold permanently rewrites rest length (tearing's twin)"
description: "The second coupling on the modulation spine, and the parameter-space mirror of tearing: tearing removed a constraint once its strain passed a threshold; plasticity permanently rewr"
tags: [settled, "swek-engine", v2667]
timestamp: v2667
---

# Plasticity -- yield past a strain threshold permanently rewrites rest length (tearing's twin)

- **Status:** settled  
- **Since:** v2667

## Prediction

The second coupling on the modulation spine, and the parameter-space mirror of tearing: tearing removed a constraint once its strain passed a threshold; plasticity permanently rewrites a constraint's rest once its elastic strain passes a yield point, so the object dents and keeps the dent instead of springing back. It rides the spine rule -- rest is reset from the base rest0 each frame -- so the permanence lives entirely in carrying rest0 forward.

## Why

physics/xpbd/plastic.js. applyPlasticity measures elastic strain against the PREDICTED positions (pre-solve, where the stress shows, same lesson as tearing), and when it exceeds yield, only the excess flows to permanent strain: rest0 *= 1 + creep*(strain - yield), capped against the original length so a dent cannot run away. plasticSubstep resets rest from rest0, runs a pre-solve plasticity pass, then the ordinary solve. Each constraint reads only its own endpoints -- a pure per-constraint function of the snapshot, order-free.

## Measured

physics/xpbd/plastic-selfcheck.mjs, 6 checks. Released from the same hard load, the plastic sheet holds a mean edge measurably larger than a plain elastic control that springs back -- it took a set. A load that never exceeds yield leaves every base rest exactly unchanged. 200 frames of overload never exceed the plastic-strain cap. The base update is identical across 40 shuffled scans; the rest update matches rest0*(1 + creep*(strain - yield)) to 1e-12. Folded into the fingerprint as subsystem fourteen (plastic-cloth); master 5fcd36d6...

## Kill condition

physics/xpbd/plastic-selfcheck.mjs. SABOTAGE: stop carrying the plastic base rest0 forward (update only the elastic rest) -- next frame's reset from base wipes the dent and the take-a-set and exact checks fail. WITHOUT PERSISTING THE BASE THERE IS NO PERMANENCE, ONLY A MOMENTARY STRETCH. The GPU port updates rest0 in the constraint buffer in a pre-solve pass (rig-only).

# Citations

- Code: physics/xpbd/plastic.js (applyPlasticity permanent rest0 rewrite past yield, plasticSubstep) + physics/xpbd/plastic-selfcheck.mjs (6 checks, gated, sabotage-tested) + folded into tools/fingerprint (subsystem 14) and tools/ledger. Elastoplasticity on the spine -- the mirror of tearing on the parameter.
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
