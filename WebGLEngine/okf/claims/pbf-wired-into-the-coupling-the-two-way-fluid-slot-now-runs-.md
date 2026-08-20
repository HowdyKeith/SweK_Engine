---
type: claim
title: "PBF wired into the coupling -- the two-way fluid slot now runs the real density solver, stably"
description: "The v2671 PBF solver was built standalone; this drops it into the fluid-fluid slot of the two-way coupling, so the fluid the mesh caves and holds is a real position-based fluid, no"
tags: [settled, "swek-engine", v2672]
timestamp: v2672
---

# PBF wired into the coupling -- the two-way fluid slot now runs the real density solver, stably

- **Status:** settled  
- **Since:** v2672

## Prediction

The v2671 PBF solver was built standalone; this drops it into the fluid-fluid slot of the two-way coupling, so the fluid the mesh caves and holds is a real position-based fluid, not the placeholder contact. The trap: a density projection whose corrections feed back into velocity every frame can diverge -- and it did at first, the blob exploding upward -- until the constraint-force-mixing regularisation was set high enough to tame the surface-particle multipliers.

## Why

physics/xpbd/fluid.js. fluidMeshSubstep now branches: given a rest density it runs buildNeighbors + pbfProject in the fluid-fluid slot (real pressure from density), otherwise the original particle contact. The two-way fluid-mesh contacts and the mesh cloth solve are untouched, so the existing fluid-mesh subsystem is byte-for-byte unchanged. Stability comes from the eps (CFM) term: at eps 1e-4 the coupled fluid diverged; at eps 50 with h 0.28 it settles into the caved mesh and stays bounded.

## Measured

physics/xpbd/fluid-selfcheck.mjs, now 7 checks -- the six contact-slot checks unchanged plus one for the PBF slot: with a rest density set, the coupling drives its fluid with the density solver, the mesh still caves, the fluid stays bounded, two runs are byte-identical, and it lands measurably apart from the contact slot. Folded into the fingerprint as subsystem eighteen (fluid-pbf); the original fluid-mesh hash is unchanged, confirming the contact path was not disturbed. master c0193995...

## Kill condition

physics/xpbd/fluid-selfcheck.mjs. The PBF-slot check fails if the coupled fluid diverges (unbounded centroid) or stops being deterministic. A DENSITY SOLVER WHOSE CORRECTIONS BECOME VELOCITY NEEDS ENOUGH REGULARISATION OR IT FLIES APART -- the eps term is load-bearing, not cosmetic. GPU port of the coupled loop is rig-only.

# Citations

- Code: physics/xpbd/fluid.js (fluidMeshSubstep PBF-or-contact branch in the fluid-fluid slot) + physics/xpbd/pbf.js (density solver) + physics/xpbd/fluid-selfcheck.mjs (7 checks, gated, PBF-slot added) + folded into tools/fingerprint (subsystem 18, fluid-pbf) and tools/ledger. The real fluid is in the coupling now, and stable.
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
