---
type: claim
title: "Angle of repose -- pairwise Coulomb friction, an emergent pile that is chaotic yet bit-reproducible"
description: "Friction against a plane was the tangential half of a contact with a wall; this is the tangential half of a contact between two particles. Each overlapping pair is pushed apart, th"
tags: [settled, "swek-engine", v2675]
timestamp: v2675
---

# Angle of repose -- pairwise Coulomb friction, an emergent pile that is chaotic yet bit-reproducible

- **Status:** settled  
- **Since:** v2675

## Prediction

Friction against a plane was the tangential half of a contact with a wall; this is the tangential half of a contact between two particles. Each overlapping pair is pushed apart, then its tangential motion is resisted, bounded by mu times the normal correction and split between the pair by inverse mass. That one bound is enough for a heap of grains to hold a slope -- an angle of repose -- where a frictionless heap spreads into a pancake, and the steeper the friction the steeper the pile.

## Why

physics/xpbd/frictionalContact.js. solveFrictionalContacts pushes each overlapping pair apart along its normal, then applies two-way Coulomb friction to the relative tangential motion since the previous step. frictionalPileSubstep drops grains under gravity onto a frictional floor. The determinism point: a pile is chaotic -- one grain changes the whole heap -- yet fully reproducible, because the contacts are found by a sorted spatial hash and solved in a fixed graph-colored order, reading only current and previous positions.

## Measured

physics/xpbd/frictionalContact-selfcheck.mjs, 6 checks. A frictional heap settles narrower and taller than a frictionless one (mu 0.6: radius ~2 vs a frictionless pancake of radius ~17); the pile steepens monotonically as mu rises (aspect 0.00 -> 0.30 -> 0.49 across mu 0, 0.6, 1.2); a single pairwise contact moves both particles by inverse mass; and two runs from the same start land byte-identical despite the chaos. Folded into the fingerprint as subsystem twenty-one (friction-pile); master 000b85f2...

## Kill condition

physics/xpbd/frictionalContact-selfcheck.mjs. SABOTAGE: strip the mu bound so friction cancels all tangential motion regardless of mu -- now even the frictionless heap freezes into a column, and the repose and spread checks fail. WITHOUT THE BOUND EVEN ZERO FRICTION IS GLUE. Chaos is not the enemy of reproducibility; unpinned contact order is, which is why the set is sorted.

# Citations

- Code: physics/xpbd/frictionalContact.js (solveFrictionalContacts pairwise two-way Coulomb, frictionalPileSubstep, pileShape) + physics/xpbd/frictionalContact-selfcheck.mjs (6 checks, gated, sabotage-tested) + folded into tools/fingerprint (subsystem 21) and tools/ledger. The friction angle made visible by a crowd -- and reproducible to the bit.
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
