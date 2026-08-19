---
type: claim
title: "A bond makes a molecule -- and it vibrates at the frequency theory predicts"
description: "The Lennard-Jones core is a gas: atoms attract and repel but nothing holds them in a shape. This adds the layer that makes a molecule a molecule -- a harmonic bond, a spring betwee"
tags: [settled, "swek-engine", v2642]
timestamp: v2642
---

# A bond makes a molecule -- and it vibrates at the frequency theory predicts

- **Status:** settled  
- **Since:** v2642

## Prediction

The Lennard-Jones core is a gas: atoms attract and repel but nothing holds them in a shape. This adds the layer that makes a molecule a molecule -- a harmonic bond, a spring between two atoms with a rest length. With bonds a diatomic stays a diatomic and a chain stays a chain, and the classic test is that the bond vibrates at exactly the analytic frequency.

## Why

physics/md/bonds.js. A harmonic bond is V = 1/2 k (r - r0)^2, force -k(r-r0) along the bond. It needs the actual distance, so there is a sqrt -- but sqrt is IEEE correctly rounded, deterministic across architectures, so the bonded force is still bit-identical everywhere; only the transcendentals break that, and there are none. combine() sums LJ and bond force terms into one function for the integrator; reducedMass gives the effective vibrating mass.

## Measured

The centrepiece is the frequency. A diatomic with k=200 and reduced mass 2/3 should vibrate with period 2*pi/sqrt(k/mu); the simulation measured 0.36267 against the analytic 0.36276, within a fraction of a percent. The force is zero at the rest length and restoring on both sides. LJ and bonds together conserve energy and momentum over 5000 steps. And a bonded pair kicked apart stays near its rest length where bare LJ would let it fly off without bound.

## Kill condition

physics/md/bonds-selfcheck.mjs. SABOTAGE: multiply the bond coefficient by r instead of dividing -- the measured frequency no longer matches theory. IF THE FORCE LAW OR THE MASS COUPLING WERE WRONG, THE MOLECULE WOULD SING THE WRONG NOTE. A transcendental in the force path would break the determinism grep (sqrt is allowed, it is exact).

# Citations

- Code: physics/md/bonds.js (bondForces/combine/reducedMass) + physics/md/bonds-selfcheck.mjs (5 checks, gated, sabotage-tested). MD now has non-bonded (LJ) and bonded (harmonic) terms -- the two halves of a real force field. Angles, thermostat and Coulomb are the next layers.
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
