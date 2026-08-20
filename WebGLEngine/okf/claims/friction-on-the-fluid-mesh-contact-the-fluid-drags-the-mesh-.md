---
type: claim
title: "Friction on the fluid-mesh contact -- the fluid drags the mesh, the mesh slows the fluid"
description: "The two-way fluid-mesh coupling pushed apart along the normal but let the two slide past each other freely. Adding Coulomb friction to that contact resists the tangential slip: a f"
tags: [settled, "swek-engine", v2676]
timestamp: v2676
---

# Friction on the fluid-mesh contact -- the fluid drags the mesh, the mesh slows the fluid

- **Status:** settled  
- **Since:** v2676

## Prediction

The two-way fluid-mesh coupling pushed apart along the normal but let the two slide past each other freely. Adding Coulomb friction to that contact resists the tangential slip: a fluid moving across the mesh is slowed, the mesh is dragged the other way, both split by inverse mass and bounded by mu times the normal push. It is the same Coulomb bound as the plane and the pile, now on the coupling. It is opt-in, so with the coefficient at zero the coupling is byte-identical to before.

## Why

physics/xpbd/fluid.js. solveCrossContactsFriction does the normal push apart, then resists the relative tangential motion since the previous step, bounded by mu*depth and split by inverse mass -- two-way. fluidMeshSubstep branches on a friction coefficient: given one it runs the frictional solve, otherwise the original normal-only contact, so the fluid-mesh and fluid-pbf subsystems are unchanged.

## Measured

physics/xpbd/fluidFriction-selfcheck.mjs, 6 checks. A single contact pulls the fluid back and drags the mesh, the heavier mesh node dragged less; a small slide within the mu*depth budget is cancelled entirely (static) while a large one is resisted by exactly mu*depth (kinetic), matched to 1e-9; the normal separation survives the friction; and a fluid shoved at 1.5 keeps its speed over a frictionless mesh but is dragged well below it over a frictional one. Folded into the fingerprint as subsystem twenty-two (fluid-drag); fluid-mesh and fluid-pbf hashes unchanged. master 99360dc4...

## Kill condition

physics/xpbd/fluidFriction-selfcheck.mjs. SABOTAGE: strip the Coulomb bound so any slide is cancelled in full -- the kinetic-bound check fails. FRICTION THAT CANCELS ANY SLIDE IS GLUE. The emergent deceleration is modest and setup-sensitive because fluid-mesh contact is intermittent; the rigorous core is the per-contact static/kinetic behaviour.

# Citations

- Code: physics/xpbd/fluid.js (solveCrossContactsFriction two-way Coulomb on the cross-contacts, opt-in in fluidMeshSubstep) + physics/xpbd/fluidFriction-selfcheck.mjs (6 checks, gated, sabotage-tested) + folded into tools/fingerprint (subsystem 22) and tools/ledger. The tangential half of the two-way coupling.
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
