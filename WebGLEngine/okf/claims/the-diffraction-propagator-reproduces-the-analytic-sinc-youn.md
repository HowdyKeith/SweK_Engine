---
type: claim
title: "The diffraction propagator reproduces the analytic sinc, Young fringes, and the Rayleigh limit 1.22 lambda/D"
description: "The second simulated-instrument benchmark: far-field diffraction off apertures we define exactly, graded against the closed forms we already know. A single slit gives sinc squared,"
tags: [settled, "swek-engine", v2753]
timestamp: v2753
---

# The diffraction propagator reproduces the analytic sinc, Young fringes, and the Rayleigh limit 1.22 lambda/D

- **Status:** settled  
- **Since:** v2753

## Prediction

The second simulated-instrument benchmark: far-field diffraction off apertures we define exactly, graded against the closed forms we already know. A single slit gives sinc squared, two slits give that times cos squared, and a circular aperture puts its first dark ring at the Rayleigh limit, 1.22 lambda over D -- the resolution limit of every telescope and microscope, a number nobody feeds the propagator that falls out of the geometry the way the shedding threshold or the innermost stable orbit does. The propagator is a phasor sum over the aperture; the answer key is analytic.

## Why

physics/optics/diffraction.js: slitNumeric and doubleSlitNumeric and circularNumeric sum exp(i k x sin theta) over the aperture; slitAnalytic and doubleSlitAnalytic give the closed forms; airyFirstMinimum gives 1.22 lambda/D and firstMinimumAt reads the numeric ring off the pattern; scorePattern grades RMS after peak-normalizing. diffraction.html plots the slit and double-slit against their analytic overlays and draws the numeric first dark ring on the Airy pattern.

## Measured

diffraction-selfcheck.mjs, 3 checks: the single slit matches sinc squared to rms about 1e-6; the double slit matches the envelope-times-interference pattern to about 1e-6, with the envelope correctly pulling each intensity peak inward from the pure lambda/d interference maximum; and the circular aperture's first dark ring lands within about a quarter percent of 1.22 lambda/D.

## Kill condition

physics/optics/diffraction-selfcheck.mjs. SABOTAGE: drop the sine-of-angle from the phase, the way a propagator silently loses its angular dependence, and the slit stops matching sinc squared. HONEST SCOPE: BENCHMARK GENERATOR, not a measurement of anything real -- graded against apertures we defined. Phasors use cos and sin, so this is GATED, not fingerprinted, as trig belongs. Fraunhofer far field only; near-field Fresnel propagation is a further step, and the analytic Airy side uses only the first-minimum location so no Bessel library is needed.

# Citations

- Code: physics/optics/diffraction.js + physics/optics/diffraction-selfcheck.mjs + diffraction.html. The resolution limit of an optical system, reproduced from a phasor sum and graded against the analytic form -- envelope item two.
- Page: `diffraction.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
