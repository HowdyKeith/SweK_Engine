---
type: claim
title: "Multi-physics modulation spine -- external fields rewrite constraint parameters before the solve (thermal first)"
description: "The reason XPBD couples cleanly to other physics is that fluid pressure, plasticity, temperature, and neural actuation all reduce to the SAME operation: before the projection loop,"
tags: [settled, "swek-engine", v2666]
timestamp: v2666
---

# Multi-physics modulation spine -- external fields rewrite constraint parameters before the solve (thermal first)

- **Status:** settled  
- **Since:** v2666

## Prediction

The reason XPBD couples cleanly to other physics is that fluid pressure, plasticity, temperature, and neural actuation all reduce to the SAME operation: before the projection loop, rewrite each constraint's rest length and compliance from an external field. Build that one modulation pass deterministically and every coupling is just a different pure field-to-parameter function. The stability trap: recompute from the last modified value and the field compounds every frame and the mesh drifts.

## Why

physics/xpbd/modulate.js. initBaseParams snapshots rest0/compliance0 once; modulateConstraints rewrites rest/compliance from that BASE via a pure map, so parameters are a function of the current field alone -- idempotent, order-free, returning exactly to base when the field is zero. thermalModulate is the first coupling: edge temperature (mean of the two node temperatures) grows rest by (1 + expansion*T) and compliance by (1 + soften*T). modulatedSubstep is the unified loop: modulate params, then run the XPBD projection.

## Measured

physics/xpbd/modulate-selfcheck.mjs, 6 checks. Uniform heat swells the mean edge length; with expansion off and only compliance raised, a heated sheet sags measurably further under gravity than a cold one (softening independent of iteration count). Modulating 100 times never compounds and a zero field restores rest and compliance to base to 1e-15. Modulation is byte-identical across 40 shuffled orders and the full step reproduces exactly; the thermal map matches rest0*(1+a*T) and compliance0*(1+s*T) to 1e-12. Folded into the fingerprint as subsystem thirteen (thermal-cloth); master ceecd539...

## Kill condition

physics/xpbd/modulate-selfcheck.mjs. SABOTAGE: recompute from the live (already-modulated) value instead of the base -- the no-compounding check fails as heat silently accumulates frame over frame. MODULATION THAT READS ITS OWN OUTPUT IS A FEEDBACK LOOP, NOT A FIELD COUPLING. The next couplings (plasticity, muscle actuation, fluid pressure) are additional maps into this same spine.

# Citations

- Code: physics/xpbd/modulate.js (initBaseParams, modulateConstraints spine, thermalModulate, modulatedSubstep) + physics/xpbd/modulate-selfcheck.mjs (6 checks, gated, sabotage-tested) + folded into tools/fingerprint (subsystem 13) and tools/ledger. The multi-physics foundation: one deterministic pass every coupling plugs into.
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
