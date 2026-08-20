---
type: claim
title: "The torsion completes the force field, and cos(n phi) stays deterministic by Chebyshev"
description: "Bonds fix distances and angles fix bends; the dihedral fixes the twist about a bond, the 4-body term that gives a chain its preferred conformations. It is the last covalent term, a"
tags: [settled, "swek-engine", v2647]
timestamp: v2647
---

# The torsion completes the force field, and cos(n phi) stays deterministic by Chebyshev

- **Status:** settled  
- **Since:** v2647

## Prediction

Bonds fix distances and angles fix bends; the dihedral fixes the twist about a bond, the 4-body term that gives a chain its preferred conformations. It is the last covalent term, and the classic proper-torsion form V = k(1 + cos(n phi)) has a cos(n phi) that looks like it must break the engine determinism -- but it does not have to.

## Why

physics/md/dihedrals.js. cos(n phi) = T_n(cos phi) and sin(n phi) = sin(phi) U_{n-1}(cos phi) are Chebyshev polynomials, computed from cos phi and sin phi by a multiply-only recurrence; cos phi and sin phi come from dot and cross products of the bond vectors. So the whole torsion is arithmetic plus sqrt -- no acos, no atan2, no library cos -- and stays bit-identical across architectures. The four atom forces use the Blondel-Karplus decomposition, which sums to zero by construction.

## Measured

The spine is a finite-difference check: the analytic 4-body force equals minus the numerical gradient of the potential to 1e-9, across multiplicities 1, 2, 3 and five geometries. That check earned its keep -- it caught a vector-convention sign bug and I fixed it against the numbers. The Chebyshev cos(n phi) matches the true cosine to 1e-9 for n up to 4, the force has no net force and no net torque, and energy stays bounded as the torsion twists.

## Kill condition

physics/md/dihedrals-selfcheck.mjs. SABOTAGE: flip the sign of dV/dphi -- the finite-difference check fails, because the force no longer differentiates the potential. A TORSION FORCE OFF BY A SIGN WINDS THE MOLECULE UP INSTEAD OF RELAXING IT. Any library trig would break the determinism grep.

# Citations

- Code: physics/md/dihedrals.js (dihedralForces + Chebyshev chebCosSin) + physics/md/dihedrals-selfcheck.mjs (5 checks, gated, sabotage-tested, finite-difference cross-checked). The covalent force field is complete: bonds + angles + dihedrals, plus non-bonded LJ + Coulomb.
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
