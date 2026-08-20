---
type: claim
title: "Charges feel each other by the inverse-square law, deterministically"
description: "The molecule format carries a charge sign per atom, but nothing acted on it. This adds electrostatics: Coulomb's law between charged atoms, the long-range force that holds ionic st"
tags: [settled, "swek-engine", v2645]
timestamp: v2645
---

# Charges feel each other by the inverse-square law, deterministically

- **Status:** settled  
- **Since:** v2645

## Prediction

The molecule format carries a charge sign per atom, but nothing acted on it. This adds electrostatics: Coulomb's law between charged atoms, the long-range force that holds ionic structure together and shapes how polar molecules meet.

## Why

physics/md/coulomb.js. F = ke q_i q_j / r^2 along the separation, potential ke q_i q_j / r. As a vector the force is ke q_i q_j / r^3 times the separation, and r^3 = r^2 sqrt(r^2); the one sqrt is IEEE-exact so it stays deterministic. Direct O(N^2) sum with an optional cutoff -- exact for a molecule or cluster in open space; a periodic box would need Ewald later.

## Measured

Halving the distance quadruples the force -- the inverse-square law to 1e-9. Like charges repel and opposite attract. The force from several charges is exactly the sum of the individual forces, so it is linear in the sources. The pair force is equal and opposite, so total force is zero and momentum is conserved. And an orbiting plus/minus pair conserves energy over 5000 steps.

## Kill condition

physics/md/coulomb-selfcheck.mjs. SABOTAGE: make the force fall as 1/r instead of 1/r^2 -- the inverse-square ratio check fails. THE WHOLE CHARACTER OF ELECTROSTATICS IS IN THE EXPONENT; 1/r IS A DIFFERENT UNIVERSE. No transcendental, so deterministic.

# Citations

- Code: physics/md/coulomb.js (coulombForces) + physics/md/coulomb-selfcheck.mjs (6 checks, gated, sabotage-tested). MD force field now: LJ + bonds + angles + Coulomb.
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
