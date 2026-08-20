---
type: claim
title: "The improper keeps a group flat or handed -- a signed volume, sqrt-free"
description: "A proper dihedral controls rotation about a bond; an improper holds four atoms in a fixed out-of-plane arrangement, keeping an sp2 centre flat or a chiral centre from inverting. Th"
tags: [settled, "swek-engine", v2648]
timestamp: v2648
---

# The improper keeps a group flat or handed -- a signed volume, sqrt-free

- **Status:** settled  
- **Since:** v2648

## Prediction

A proper dihedral controls rotation about a bond; an improper holds four atoms in a fixed out-of-plane arrangement, keeping an sp2 centre flat or a chiral centre from inverting. This adds it in the cleanest deterministic form there is.

## Why

physics/md/improper.js uses a signed-volume restraint. The scalar triple product of three edges from atom l is six times the signed tetrahedron volume, zero exactly when the four atoms are coplanar, with its sign giving the chirality. A harmonic 1/2 k (V6 - v0)^2 pulls to a target: v0 = 0 for planarity, nonzero for a fixed handedness. The gradient of a triple product is another cross product, so the force is dot and cross only -- no sqrt, no transcendental, the most exactly deterministic term in the force field.

## Measured

The energy is zero when coplanar and positive otherwise; an atom lifted out of plane feels a force pushing it back; a nonzero target volume makes the atom on the wrong side feel a strong restoring force, so chirality is held and not just planarity. The analytic force equals minus the numerical gradient to 1e-5, and the term has no net force, no net torque, and conserves energy over 3000 steps.

## Kill condition

physics/md/improper-selfcheck.mjs. SABOTAGE: swap a cross-product argument order in the gradient -- the finite-difference check fails, because the gradient of the triple product is direction-sensitive. AN IMPROPER WITH THE WRONG GRADIENT WOULD FLATTEN WHAT SHOULD PYRAMIDALISE, OR INVERT A CHIRAL CENTRE. sqrt-free, so bit-identical everywhere.

# Citations

- Code: physics/md/improper.js (improperForces, signed volume) + physics/md/improper-selfcheck.mjs (6 checks, gated, sabotage-tested, finite-difference cross-checked). Bonded terms now complete: bonds, angles, proper dihedrals, impropers.
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
