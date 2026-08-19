---
type: claim
title: "Vibrations -- a mass-spring chain whose normal modes are standing waves at the analytic frequency"
description: "A row of equal masses joined by equal springs with pinned ends is the simplest system with normal modes: the special motions that keep their shape. Start the chain in the shape sin"
tags: [settled, "swek-engine", v2696]
timestamp: v2696
---

# Vibrations -- a mass-spring chain whose normal modes are standing waves at the analytic frequency

- **Status:** settled  
- **Since:** v2696

## Prediction

A row of equal masses joined by equal springs with pinned ends is the simplest system with normal modes: the special motions that keep their shape. Start the chain in the shape sin(j pi n / (N+1)) and the whole chain oscillates at one frequency, omega_j = 2 sqrt(k/m) sin(j pi / 2(N+1)), every mass in step, the pattern frozen in space -- a standing wave. Any motion is a sum of these modes. The coupling loop is +,-,*,/; only the mode shape and analytic frequency take a sine, from the strict-trig core, so a mode is cross-architecture. This is the first step toward a spectral view -- the modes are what a spectrum would resolve.

## Why

physics/vibrations.js. chainStep integrates m x_n'' = k(x_{n-1} - 2 x_n + x_{n+1}) by symplectic velocity-Verlet; setMode seeds a pure mode from the strict sine; modeFreq returns the analytic eigenfrequency; modeAlignment measures how parallel the displacement stays to a mode's shape. The same integrator discipline as the orbit and the pendulum wave -- symplectic, so the modes neither pump nor decay.

## Measured

physics/vibrations-selfcheck.mjs, 5 checks. A pure mode stays aligned with its own shape to better than 0.9999 over four thousand steps (a standing wave); it rings at its analytic frequency to within a percent; the energy stays bounded to 1e-4 (symplectic); the mode frequencies climb monotonically with mode number; and it is deterministic with a pure-arithmetic loop. Folded into the fingerprint as subsystem thirty-three; a Lab scene vibrates a pinned string in a chosen mode and a preset opens it; master eeae3749...

## Kill condition

physics/vibrations-selfcheck.mjs. SABOTAGE: cut the springs between neighbours -- drop the coupling from the acceleration -- and the chain becomes a row of independent identical oscillators, every mode ringing at the same frequency; the analytic-frequency and energy checks fail. The neighbour coupling is what makes a mode a mode: without it there is no chain, only a dozen unconnected springs.

# Citations

- Code: physics/vibrations.js (makeChain, setMode, modeFreq, chainStep velocity-Verlet, energy, modeAlignment) + physics/vibrations-selfcheck.mjs (5 checks, gated, sabotage-tested) + folded into tools/fingerprint (subsystem 33), tools/ledger, tools/catalog + a Lab scene (a pinned string in a chosen normal mode) and a preset. Normal modes as standing waves, cross-architecture; the groundwork for a deterministic spectrum.
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
