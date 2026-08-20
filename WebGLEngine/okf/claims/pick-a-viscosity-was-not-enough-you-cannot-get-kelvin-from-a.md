---
type: claim
title: "Pick a viscosity was not enough -- you cannot get Kelvin from a diffusion coefficient"
description: "A standing plan for the warmth slider: it drives D (v2596 measured D=0.01141); Stokes-Einstein is D = kT/(6 pi eta r); we have r, we lack the viscosity eta, so PICK ONE and Kelvin "
tags: [settled, "swek-engine", v2617]
timestamp: v2617
---

# Pick a viscosity was not enough -- you cannot get Kelvin from a diffusion coefficient

- **Status:** settled  
- **Since:** v2617

## Prediction

A standing plan for the warmth slider: it drives D (v2596 measured D=0.01141); Stokes-Einstein is D = kT/(6 pi eta r); we have r, we lack the viscosity eta, so PICK ONE and Kelvin becomes real.

## Why

THAT PLAN WAS INCOMPLETE, AND THE INCOMPLETENESS IS THE POINT. D is in SIM units [sim-length^2/sim-time]. To use SI Stokes-Einstein I must convert D_SI = D_sim L^2/tau and r_SI = r_sim L, so T = 6 pi eta r_sim D_sim L^3/(tau k). T DEPENDS ON L^3/tau: picking eta leaves the LENGTH and TIME scales free. Measured: same eta, same r, same D=0.01141, and a 10x slower clock is 10x cooler while a 2x bigger particle is 8x hotter. PICKING A VISCOSITY IS NOT ENOUGH -- it would have shipped a Kelvin reading that was really L and tau in disguise.

## Measured

The obvious identification -- 10 um cell, real-time clock -- puts the whole slider (D=0..0.02) at 0..1.1e5 K with ROOM TEMPERATURE AT 0.27% OF TRAVEL. Under that reading the aquarium runs tens of thousands of kelvin hot: STYLISED WARMTH, not physical temperature, and a slider reading 60,000 K would be a lie dressed as a measurement. THE PHYSICAL CALIBRATION: rescale one knob. A ~1.5 um particle (small bacterium) in water with a real-time clock gives D=0 -> 0 K, D=0.01141 -> 213 K (a cold day), room temp 293K at 79% of travel, D=0.02 -> 373.15 K (boiling). THAT is a real Kelvin slider -- real BECAUSE THE SCENARIO IS STATED, not because a viscosity was guessed. L calibrated exactly (3.010628e-6 m per sim unit) against the real water viscosity 1.0016e-3 so the slider max is boiling to the decimal.

## Kill condition

Drop the 6pi from the inverse -> 4 fail (D->T and T->D stop inverting). Make the physical scenario secretly use the 10 um cell L -> 2 fail (it reads hot). Every SCENARIO ships a plain-English `models` sentence AND its L, tau, eta: A KELVIN READING WITHOUT ITS SCENARIO IS A NUMBER PRETENDING TO BE A MEASUREMENT. The blobarium readout puts the scenario in the tooltip so the number never travels naked.

# Citations

- Code: physics/blobKelvin.js (Stokes-Einstein both directions, stated SCENARIOS) + physics/blobKelvin-selfcheck.mjs (7 checks, gated, 2 sabotages) + blobarium.html Kelvin readout (0 K at rest, 373 K at max, scenario in the tooltip -- driven in a real browser, zero errors). AND A CORRECTION TO THE PRIOR PLAN: it was not that we 'lacked eta' -- it is that a diffusion coefficient cannot become a temperature without committing to BOTH a length scale and a time scale, and naming them.
- Page: `/blobarium.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
