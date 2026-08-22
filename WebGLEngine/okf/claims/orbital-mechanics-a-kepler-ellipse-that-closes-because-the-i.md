---
type: claim
title: "Orbital mechanics -- a Kepler ellipse that closes, because the integrator is symplectic"
description: "Newton gives each body an acceleration toward every other of -G m r over the cube of the distance, and the naive integrator -- forward Euler -- quietly adds energy every step, so a"
tags: [settled, "swek-engine", v2695]
timestamp: v2695
---

# Orbital mechanics -- a Kepler ellipse that closes, because the integrator is symplectic

- **Status:** settled  
- **Since:** v2695

## Prediction

Newton gives each body an acceleration toward every other of -G m r over the cube of the distance, and the naive integrator -- forward Euler -- quietly adds energy every step, so a planet on a circle spirals outward and the ellipse is a lie. A symplectic integrator, velocity-Verlet, keeps the energy bounded forever, so the orbit closes and Kepler holds over many periods. The force is +,-,*,/ and one sqrt, no transcendental, so an orbit is bit-identical across machines.

## Why

physics/orbit.js. N bodies with pairwise gravity; each step is velocity-Verlet -- drift on the positions with the old acceleration, recompute, kick the velocities with the average of old and new. totalEnergy, angularMomentum, and separation read the conserved quantities and the ellipse. keplerPair sets up a two-body system at periapsis for a chosen semi-major axis and eccentricity, barycentre at rest. The same lesson as the pendulum wave: for a system that must return, the integrator is not a detail.

## Measured

physics/orbit-selfcheck.mjs, 5 checks. Over eight orbits the ellipse closes -- periapsis and apoapsis hold at a(1-e) and a(1+e) instead of spiralling; the energy stays bounded to 1e-4 of itself (the symplectic mark); the angular momentum is conserved to 1e-14 (Kepler\'s equal-areas law); two orbits of different size give T^2/a^3 equal to within two percent (Kepler\'s third law, 4pi^2/mu); and it is deterministic, arithmetic-and-sqrt only. Folded into the fingerprint as subsystem thirty-two; a Lab scene traces the ellipse and a preset opens it; master 8ee063cb...

## Kill condition

physics/orbit-selfcheck.mjs. SABOTAGE: replace the velocity-Verlet step with forward Euler and the energy runs away -- the bounded-energy and closed-ellipse checks fail as the orbit spirals open within a few laps. The integrator that looks fine for a single frame is a lie over an orbit; symplectic is the difference between an ellipse and a spiral.

# Citations

- Code: physics/orbit.js (makeSystem, orbitStep velocity-Verlet, totalEnergy, angularMomentum, separation, keplerPair) + physics/orbit-selfcheck.mjs (5 checks, gated, sabotage-tested) + folded into tools/fingerprint (subsystem 32), tools/ledger, tools/catalog + a Lab scene (two bodies, a trailed ellipse, eccentricity adjustable) and a preset. Newtonian gravity that closes, cross-architecture.
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
