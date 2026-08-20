---
type: claim
title: "The molecules the engine can draw can now move -- deterministic molecular dynamics"
description: "The engine already represents molecules -- positions in Angstroms, element ids, van der Waals radii -- but nothing made them move. This adds the physics: a Lennard-Jones pair poten"
tags: [settled, "swek-engine", v2641]
timestamp: v2641
---

# The molecules the engine can draw can now move -- deterministic molecular dynamics

- **Status:** settled  
- **Since:** v2641

## Prediction

The engine already represents molecules -- positions in Angstroms, element ids, van der Waals radii -- but nothing made them move. This adds the physics: a Lennard-Jones pair potential and a velocity-Verlet integrator, so a molecule is a system of atoms evolving under real forces. And it holds to the same determinism discipline as the rest of the engine.

## Why

physics/md/md.js. Lennard-Jones is 4e[(s/r)^12 - (s/r)^6], and the trick is that everything is a function of r^2: (s/r)^6 = (s^2/r^2)^3, so the force needs only multiply and divide -- no sqrt, no pow, no transcendental. It is IEEE-exact and bit-identical across architectures. Integration is velocity Verlet, which is symplectic and time-reversible. computeForces does all pairs with a cutoff; a neighbour grid can replace the inner loop for large N.

## Measured

Checked against physics. The force is zero at the potential minimum r0^2 = 2^(1/3) sigma^2, repulsive closer and attractive farther, with V = -eps at the well. Forces are equal and opposite so the total force is zero and momentum is conserved. Total energy stays bounded over 4000 steps -- symplectic, not the spiral forward Euler would give. And the trajectory is time-reversible: 500 steps forward, flip the velocities, 500 back, and the atoms return to their start within 1e-6.

## Kill condition

physics/md/md-selfcheck.mjs. SABOTAGE: drop the second half-kick from velocity Verlet -- energy conservation and reversibility both fail, because a NON-SYMPLECTIC INTEGRATOR LEAKS ENERGY AND FORGETS WHERE IT CAME FROM. A transcendental sneaking into the force path would break the determinism grep. Thermostats, bonded forces and Coulomb are the next layers; this is the conservative core they build on.

# Citations

- Code: physics/md/md.js (ljCoeff/ljPotential/computeForces/kinetic/velocityVerlet) + physics/md/md-selfcheck.mjs (5 checks, gated, sabotage-tested). Opens the atoms/molecules direction on top of the existing molFormat/molGenerator representation.
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
