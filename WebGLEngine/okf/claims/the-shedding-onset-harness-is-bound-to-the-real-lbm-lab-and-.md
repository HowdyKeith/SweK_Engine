---
type: claim
title: "The shedding-onset harness is bound to the real LBM lab and refuses to crystallize on a transient"
description: "The automated-experimentalist harness stops being a skeleton and drives the real simulation. It answers one physical question -- at what Reynolds number does a confined cylinder fi"
tags: [settled, "swek-engine", v2749]
timestamp: v2749
---

# The shedding-onset harness is bound to the real LBM lab and refuses to crystallize on a transient

- **Status:** settled  
- **Since:** v2749

## Prediction

The automated-experimentalist harness stops being a skeleton and drives the real simulation. It answers one physical question -- at what Reynolds number does a confined cylinder first shed vortices -- by bisecting a body force and reading the MEASURED Reynolds number from the field, never a nominal one. The verdict that matters is a guarantee: a decaying transient, a wobble that is dying out, must be reported as not shedding, or the loop crystallizes on a Reynolds number where nothing is happening. And it refuses the lattice-Mach ceiling rather than reporting compressibility error as physics.

## Why

tools/roundhouse/shedOnset.mjs, with its five engine-touching seams bound to simulation/lbm/lbm2d.js: the body force is an array, the velocities are read from the lattice by index, mass comes from the module. runOnce splits the sample window and calls a limit cycle only if the second-half amplitude holds against the first; autoBracket scans the force upward and declines if the flow crosses the Mach guard before it sheds. A run-onset.mjs driver wires it for the rig, where the full step budget is affordable.

## Measured

shedOnset-selfcheck.mjs, 3 checks: a real LBM run measures a finite Reynolds number from the field with negligible mass drift; a mock lattice emitting a sustained oscillation reads as shedding while a decaying one does not; and a flow past the Mach ceiling is refused with a Mach reason, not measured. On the rig at full budget the confined geometry did not shed by Re about 58 -- the channel confinement raising onset above the textbook unconfined Re about 47, a measured result that overrules the prior.

## Kill condition

tools/roundhouse/shedOnset-selfcheck.mjs. SABOTAGE: drop the sustained-amplitude test, and a decaying transient is miscalled as onset -- the anti-false-positive check fails. That is the exact wrong answer the harness exists to refuse. HONEST SCOPE: the full bracket-and-bisection is a minutes-scale rig job (each measurement is a real steady-state run), so the gate proves the binding and the detection on a mock rather than running the whole sweep; the sweep itself runs on the machine.

# Citations

- Code: tools/roundhouse/shedOnset.mjs (bound to lbm2d.js) + tools/roundhouse/run-onset.mjs + tools/roundhouse/shedOnset-selfcheck.mjs. An experiment the sim adjudicates, with the evaluator wired to a measured observable instead of an opinion.
- Page: `physics-lab.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
