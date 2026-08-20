---
type: claim
title: "Ewald closes the force field on the Madelung constant, deterministically"
description: "Electrostatics in a periodic system cannot be summed as raw 1/r -- the sum is only conditionally convergent. Ewald splits it into a Gaussian-screened short range that converges in "
tags: [settled, "swek-engine", v2650]
timestamp: v2650
---

# Ewald closes the force field on the Madelung constant, deterministically

- **Status:** settled  
- **Since:** v2650

## Prediction

Electrostatics in a periodic system cannot be summed as raw 1/r -- the sum is only conditionally convergent. Ewald splits it into a Gaussian-screened short range that converges in real space and a complement that converges in reciprocal space, plus a self term. This is the last non-bonded term, and it is the one that forces strict-libm into play: it cannot be done without erfc, exp, sin and cos.

## Why

physics/md/ewald.js. Real space sums q_i q_j erfc(alpha r)/r over periodic images; reciprocal space sums exp(-k^2/4a^2)/k^2 times the squared structure factor over k-vectors; the self term subtracts each Gaussian's self-interaction. Every transcendental is a DETERMINISTIC one -- strictErfc and strictExp from tools/strictExpErf.mjs (new this round: Cody-Waite exp to 1 ulp, A&S erfc to 1.5e-7, both grep-clean of library calls), strictSin and strictCos from strictTrig. So the periodic electrostatics are bit-identical on every conforming machine.

## Measured

For a rock-salt lattice the energy per ion is -M/r0 with M the Madelung constant, a number known from number theory to be 1.7475645. The sum computes M = 1.747565, matching to within strictErfc's own 1.5e-7 accuracy -- the real, reciprocal and self parts are each right and correctly balanced. The result is independent of the split parameter alpha across alpha = 3,4,5/L (spread < 1e-4), the forces equal minus the numerical gradient of the energy to 1e-4, and the net force on the neutral cell is zero to machine precision.

## Kill condition

physics/md/ewald-selfcheck.mjs. SABOTAGE: flip the sign of the self-energy term -- M no longer matches 1.7475645 and the alpha-independence check fails. A WRONG PREFACTOR OR SIGN ANYWHERE IN THE THREE PARTS BREAKS THE MADELUNG NUMBER. Any library exp/sin/cos/erf would break the determinism grep.

# Citations

- Code: physics/md/ewald.js (ewald: real + reciprocal + self, energy and forces) + physics/md/ewald-selfcheck.mjs (5 checks, gated, sabotage-tested, Madelung-validated) + tools/strictExpErf.mjs (strictExp, strictErfc) + tools/strictExpErf-selfcheck.mjs. The non-bonded force field is complete: Lennard-Jones + real-space Coulomb + Ewald periodic electrostatics.
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
