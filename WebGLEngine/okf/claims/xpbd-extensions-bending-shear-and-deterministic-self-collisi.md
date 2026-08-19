---
type: claim
title: "XPBD extensions -- bending, shear, and deterministic self-collision, all graph-colored"
description: "The cloth pillar needs more than stretch resistance: shear (so a square does not collapse to a diamond), bending (so it resists folding), and self-collision (so it does not pass th"
tags: [settled, "swek-engine", v2661]
timestamp: v2661
---

# XPBD extensions -- bending, shear, and deterministic self-collision, all graph-colored

- **Status:** settled  
- **Since:** v2661

## Prediction

The cloth pillar needs more than stretch resistance: shear (so a square does not collapse to a diamond), bending (so it resists folding), and self-collision (so it does not pass through itself). The reference doc did bending as a dihedral angle with acos -- transcendental, so libm differences would break bit-identity -- and found collision pairs with an atomic linked list whose traversal order, and therefore whose result, depends on GPU scheduling. Both are avoided here.

## Why

physics/xpbd/clothMesh.js builds shear (quad diagonals) and bending (skip-one neighbours) as ordinary DISTANCE constraints -- only sqrt, no acos -- so they ride the v2659 solver unchanged and stay deterministic. physics/xpbd/selfCollide.js discovers contact pairs with a spatial hash and then SORTS them before anything downstream sees them, so the pair set is a pure function of positions regardless of bucket-walk order; the pairs are graph-colored fresh each frame and resolved as UNILATERAL distance constraints (push apart only when penetrating). physics/xpbd/clothStep.js orchestrates predict, fixed solve, collision solve, finalize. physics/xpbd/cloth-collision.wgsl is the graph-colored GPU contact solver, no atomics.

## Measured

physics/xpbd/cloth-selfcheck.mjs, 6 checks. Fidelity: with collisions off, clothSubstep reproduces xpbdSubstep byte-for-byte, so the shared math has not drifted. Spine: byte-identical under 200 shuffles of BOTH the within-color order and the order the collision pass walks the particles. Collision determinism: the sorted pair set is identical across 40 scrambled walk orders. Unilateral: overlapping particles are pushed apart while a distant pair is left at its exact distance (no phantom pull). 100 substeps of a folded cloth stay finite and deterministic. Folded into the fingerprint as subsystem nine (cloth-collision); master d3d1d477...

## Kill condition

physics/xpbd/cloth-selfcheck.mjs. SABOTAGE: remove the sort in selfCollide.js -- the collision pair set becomes bucket-walk-order-dependent and the determinism check fails. AN UNSORTED PAIR SET FEEDS A NONDETERMINISTIC COLORING, AND THE SAME CLOTH IN THE SAME POSE WOULD SOLVE DIFFERENTLY DEPENDING ON THREAD SCHEDULING. Bending via acos would fail bit-identity across architectures; that is why it is a distance constraint. The GPU contact shader is rig-only until Galaxina runs it against the twin.

# Citations

- Code: physics/xpbd/clothMesh.js (structural/shear/bending distance constraints + bonded-pair set) + physics/xpbd/selfCollide.js (sorted deterministic contact discovery) + physics/xpbd/clothStep.js (predict/fixed/collision/finalize, unilateral contact) + physics/xpbd/cloth-selfcheck.mjs (6 checks, gated, sabotage-tested) + physics/xpbd/cloth-collision.wgsl (rig-only) + folded into tools/fingerprint (subsystem 9) and tools/ledger. The cloth pillar, complete and deterministic.
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
