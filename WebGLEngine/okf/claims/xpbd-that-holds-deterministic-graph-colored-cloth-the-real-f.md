---
type: claim
title: "XPBD that holds -- deterministic graph-colored cloth, the real formula, no atomics"
description: "XPBD (Macklin-Muller-Chentanez 2016) is the cloth/soft-body pillar the engine lacked: position-based, unconditionally stable, compliance-parameterized so stiffness is independent o"
tags: [settled, "swek-engine", v2659]
timestamp: v2659
---

# XPBD that holds -- deterministic graph-colored cloth, the real formula, no atomics

- **Status:** settled  
- **Since:** v2659

## Prediction

XPBD (Macklin-Muller-Chentanez 2016) is the cloth/soft-body pillar the engine lacked: position-based, unconditionally stable, compliance-parameterized so stiffness is independent of iteration count. The reference doc we reviewed shipped the usual tutorial version -- atomicAdd position deltas (non-deterministic) and PBD-with-compliance mislabeled as XPBD (it drops the -aTilde*lambda term and never accumulates lambda). Both are exactly what this engine forbids.

## Why

physics/xpbd/xpbd.js. The solve is GRAPH-COLORED: constraints are partitioned into batches where no two share a particle, so within a batch updates are independent, order cannot matter, and a GPU dispatch needs no atomics. The math is the paper\'s Algorithm 1 to the letter: aTilde = compliance/dt^2, d_lambda = (-C - aTilde*lambda)/(w1+w2+aTilde) [Eq 18], dx = w*gradC*d_lambda [Eq 17], lambda accumulated per constraint (lambda_0 = 0 each substep). Only +,-,*,/ and sqrt -- no library trig -- so bit-identical across machines. physics/xpbd/xpbd-distance.wgsl is the graph-colored GPU port whose math mirrors the twin.

## Measured

physics/xpbd/xpbd-selfcheck.mjs, 6 checks. Spine: the solve is BYTE-IDENTICAL under 200 within-color shuffles (graph coloring removes order-dependence), while an un-colored single-batch Gauss-Seidel drifts under the same shuffles. Exactness: one stretched substep lands at 16/11 with lambda -1/22, matching the closed form to 1e-12. And it is REAL XPBD: accumulating lambda with the -aTilde*lambda term diverges measurably from a PBD-with-compliance reference over 30 substeps. Stiff constraints (compliance 0) at a large dt stay finite (unconditional stability). Folded into the fingerprint as subsystem seven (xpbd-cloth); master d2a05a0e...

## Kill condition

physics/xpbd/xpbd-selfcheck.mjs. SABOTAGE: drop the -aTilde*lambda term (the exact term the tutorial dropped) -- the XPBD-vs-PBD check fails, because the solver collapses back to iteration-dependent PBD. And putting all constraints in one batch (no coloring) makes the shuffle test drift -- A SOLVER WHOSE RESULT DEPENDS ON CONSTRAINT VISIT ORDER CANNOT BE BIT-IDENTICAL. The GPU shader is rig-only until Galaxina runs it per-color against the twin.

# Citations

- Code: physics/xpbd/xpbd.js (colorConstraints greedy edge coloring + xpbdSubstep with real lambda accumulation) + physics/xpbd/xpbd-selfcheck.mjs (6 checks, gated, sabotage-tested, within-color permutation spine) + physics/xpbd/xpbd-distance.wgsl (graph-colored GPU solver, rig-only, no atomics, mirrors the twin) + folded into tools/fingerprint (subsystem 7) and tools/ledger. The cloth/soft-body pillar, done the engine\'s way.
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
