---
type: claim
title: Sound is vibration because the blob does not push back
description: "Two questions, opposite answers. SOUND at a blob IS essentially vibration -- because the blob does not appreciably change the sound field. The only non-trivial part is that a STAND"
tags: [settled, "swek-engine", v2554]
timestamp: v2554
---

# Sound is vibration because the blob does not push back

- **Status:** settled  
- **Since:** v2554

## Prediction

Two questions, opposite answers. SOUND at a blob IS essentially vibration -- because the blob does not appreciably change the sound field. The only non-trivial part is that a STANDING wave has NODES THAT DO NOT MOVE, so material migrates there and takes the shape of the PATTERN, not the wave (acoustic levitation, Chladni figures). Still one-way: the sand does not change the plate. MAGNETISM is a different category, because a ferrofluid MAGNETISES, WHICH CHANGES THE FIELD, WHICH CHANGES THE FORCE ON IT.

## Why

Rosensweig's linear stability analysis (Cowley & Rosensweig 1967; arXiv:1101.3742), web-verified: 'Although the applied magnetic field is HOMOGENEOUS and therefore NO NET-FORCE is acting on the medium, FLUCTUATIONS OF THE SURFACE LEAD TO FOCUSING EFFECTS rendering the local field at the surface inhomogeneous.' A flat ferrofluid in a uniform field feels NOTHING. A bump focuses the field, pulls harder, grows. Gravity and surface tension resist. Above M_c the bump wins: hexagonal spikes. THAT FEEDBACK IS THE WHOLE DIFFERENCE BETWEEN VIBRATION AND AN INSTABILITY.

## Measured

Web-verified formulas, implemented and checked against each other: M_c^2 = (2/mu0)(1 + 1/r_c)sqrt(g*rho*sigma), k_c = sqrt(rho*g/sigma). For APG 512a-ish (rho 1236, sigma 0.025, r_c 1.6): M_c = 6.71 kA/m, B_c = 8.43 mT (a fridge magnet is ~5 mT), spike spacing 9.02 mm. THE PAYOFF: the growth rate crosses zero at EXACTLY 1.0 M_c (rate -7.6e-4, vs +2.5e+3 at 1.05 M_c), AND THE FIRST MODE TO GO UNSTABLE IS k=696 WHEN THE FORMULA INDEPENDENTLY SAYS k_c=696 -- THE CAPILLARY WAVELENGTH, PREDICTED BY THE DYNAMICS RATHER THAN ASSUMED. And at k=0 the magnetic term vanishes exactly (-rho*g and nothing else), which is the theory's own claim that a uniform field cannot push flat fluid.

## Kill condition

Show a growth rate that crosses zero somewhere other than M_c, or a first-unstable mode that is not k_c, and the model is wrong rather than the fluid surprising. The FIRST DRAFT FAILED BOTH -- see `where`.

# Citations

- Code: simulation/ferro.js + ferro-selfcheck.mjs (13 checks, gated). !! THE FIRST DRAFT DROPPED THE PERMEABILITY FACTOR FROM THE DYNAMICS WHILE KEEPING IT IN THE THRESHOLD, so the two halves described DIFFERENT FLUIDS and the surface was reported FLAT at 1.0 M_c and even at 1.1 M_c -- 50% past its own critical field. Caught because M_c is DEFINED as the crossing, so a crossing anywhere else is a contradiction, not a surprise. HONEST LIMIT: this computes the THRESHOLD and the WAVELENGTH and demonstrates the FEEDBACK on a 1D surface. IT IS NOT A FERROHYDRODYNAMICS SOLVER, and the hexagons are a 2D pattern-SELECTION result -- nothing here selects hexagons, and claiming otherwise would be the interesting part done by assertion. NOT WIRED TO blobulator.html yet.
- Page: `/blobulator.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
