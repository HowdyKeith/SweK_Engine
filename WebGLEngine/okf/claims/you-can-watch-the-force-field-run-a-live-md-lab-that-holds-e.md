---
type: claim
title: "You can watch the force field run -- a live MD lab that holds energy flat"
description: "The MD engine has been headless the whole arc, verified but unseen. This makes it visible: a page that runs the real force field on a molecule and lets you watch it move while tota"
tags: [settled, "swek-engine", v2649]
timestamp: v2649
---

# You can watch the force field run -- a live MD lab that holds energy flat

- **Status:** settled  
- **Since:** v2649

## Prediction

The MD engine has been headless the whole arc, verified but unseen. This makes it visible: a page that runs the real force field on a molecule and lets you watch it move while total energy stays flat before your eyes, with a thermostat you can switch on.

## Why

md-demo.html imports the ACTUAL md/bonds/angles/thermostat modules -- the same code the gates verify, not a toy copy -- builds a 7-atom bonded chain, and steps velocity Verlet in the render loop, drawing atoms and bonds on a canvas with a live kinetic/potential/total energy readout and a drift indicator. Heat scales velocities, Thermostat calls the real Berendsen step. It is linked from the server nav so it is reachable.

## Measured

A headless Chromium run over an http origin loaded the page with no console errors: the total energy readout was finite and stable at 30.31 with drift 0.000 across seconds of simulation, the temperature read 2.30, and the canvas drew (5486 non-blank pixels). The static gate confirms it imports the real modules, drives velocityVerlet over LJ + bonds + angles, displays energy, is linked from server.html, and that the controls call the real physics.

## Kill condition

tools/mdDemo-selfcheck.mjs. SABOTAGE-EQUIVALENT: a bug where the force function returned its result object instead of the force array made the whole sim read NaN and the canvas draw nothing -- the headless smoke caught it and I fixed it. A DEMO THAT DOES NOT IMPORT THE REAL PHYSICS IS A PAINTING OF A SIMULATION; this one imports it, so it cannot drift from the verified code.

# Citations

- Code: md-demo.html (LCARS, live velocity Verlet + canvas) + tools/mdDemo-selfcheck.mjs (5 checks, gated) + server.html nav link. The MD arc is now visible, not just verified.
- Page: `md-demo.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
