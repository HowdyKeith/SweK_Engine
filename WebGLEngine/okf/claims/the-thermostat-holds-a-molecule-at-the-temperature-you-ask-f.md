---
type: claim
title: The thermostat holds a molecule at the temperature you ask for
description: "An MD system sits at whatever energy it started with. A thermostat holds it at a target temperature, so you can simulate a molecule at room temperature instead of an accidental one"
tags: [settled, "swek-engine", v2644]
timestamp: v2644
---

# The thermostat holds a molecule at the temperature you ask for

- **Status:** settled  
- **Since:** v2644

## Prediction

An MD system sits at whatever energy it started with. A thermostat holds it at a target temperature, so you can simulate a molecule at room temperature instead of an accidental one. This adds temperature measurement and a Berendsen velocity-rescaling thermostat.

## Why

physics/md/thermostat.js. Temperature is equipartition, T = 2 KE / (dof kB) with kB = 1. Berendsen scales the velocities each step by a sqrt factor that nudges T a fraction of the way to target over a coupling time. removeCOMMotion strips bulk drift so the thermostat governs thermal motion, not translation. The scale factor is a sqrt, so it stays deterministic.

## Measured

Temperature matches a hand-computed equipartition case exactly. An instant rescale lands on the target to 1e-9. Berendsen took a 30-atom LJ gas started hot at T=3, coupled it to 0.5, and the late-run average temperature settled near the target. COM removal zeroes total momentum, so the temperature it reports is thermal, not bulk.

## Kill condition

physics/md/thermostat-selfcheck.mjs. SABOTAGE: flip the Berendsen coupling sign -- the system runs away from the target instead of toward it and the convergence check fails. A THERMOSTAT THAT PUSHES THE WRONG WAY IS A HEATER LABELLED AS A FRIDGE. No transcendental, so deterministic.

# Citations

- Code: physics/md/thermostat.js (temperature/removeCOMMotion/rescaleToT/berendsenStep) + physics/md/thermostat-selfcheck.mjs (5 checks, gated, sabotage-tested). MD can now be run at a set temperature.
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
