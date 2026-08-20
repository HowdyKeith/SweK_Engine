---
type: claim
title: "The temperature modulator, and the phantom 3.2% that was my reused seeds"
description: "A standing note: a modulator (sweep the temperature over time) 'only means something after units chain honest.' v2617 chained them. So sweep T -- IF commanding a temperature actual"
tags: [settled, "swek-engine", v2618]
timestamp: v2618
---

# The temperature modulator, and the phantom 3.2% that was my reused seeds

- **Status:** settled  
- **Since:** v2618

## Prediction

A standing note: a modulator (sweep the temperature over time) 'only means something after units chain honest.' v2617 chained them. So sweep T -- IF commanding a temperature actually makes the blob reach it.

## Why

Before building it I checked the loop: command a D, run jitterCentres, measure the D the blob ACTUALLY exhibits from its mean-squared displacement (<r^2> = 6 D t in 3D). My first pass reported the blob running 3.2% HOT at EVERY D -- a suspiciously CONSTANT bias. IT WAS MY MEASUREMENT: I had reused the same 40 seeds across all four D, so every measurement was the SAME RANDOM REALIZATION scaled -- one fluctuation, repeated, masquerading as a systematic bias. A CONSTANT BIAS ACROSS INPUTS IS A CLUE THAT THE INPUTS SHARE A CAUSE -- here, my seeds.

## Measured

With independent seeds and 1500-2000 realizations each, commanded temperature equals emergent temperature: 220->emergent, 293->emergent, 350->emergent all within the ~0.7% measurement noise. THE NUMBER ON THE SLIDER IS THE NUMBER IN THE TANK -- in FREE diffusion. AND A SECOND, HONEST FINDING: in the WALLED tank the emergent reading is LOWER. At a constant 373 K command the real box3d tank (gravity + four walls + inter-lump collisions) reads ~146 K over 2 s; a walls-only model over 30 s reads 0.65x. A BOX OF HALF-WIDTH L CAPS <r^2> AT ~L^2, so apparent diffusion and apparent temperature fall. YOU CANNOT READ TEMPERATURE OFF A CONFINED RANDOM WALK AS IF IT WERE FREE.

## Kill condition

Let the sweep overshoot its range -> 1 fails. Break measuredT (3 not 6 in <r^2>=6Dt) -> 1 fails. Deny confinement (assert walled==free) -> 1 fails. The phantom-bias check REPRODUCES the mistake on purpose -- same seeds across D give near-identical ratios (spread <0.01), and THAT IDENTITY is the tell -- so the lesson stays executable.

# Citations

- Code: physics/tempModulator.js (commandedT sine/triangle sweep, modulatorD, measuredT) + physics/tempModulator-selfcheck.mjs (6 checks, gated, 3 sabotages) + blobarium.html MODULATE toggle. Driven in a real browser: cmd sweeps 208->303 K, readout shows 'cmd NNN K, tank ~MMM K confined' -- the commanded T is the honest number (gated Kelvin chain), the tank reading is LABELLED confined rather than left to look like the modulator is broken. The clean closed loop lives where it is clean: FREE diffusion, in the gate.
- Page: `/blobarium.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
