---
type: claim
title: "Hologram -- the real optics: interference fringes that encode geometry, gated not fingerprinted"
description: "The physics under a hologram, which is not a picture but a recorded interference pattern. Two coherent point sources overlapping on a screen write bright and dark fringes spaced la"
tags: [settled, "swek-engine", v2720]
timestamp: v2720
---

# Hologram -- the real optics: interference fringes that encode geometry, gated not fingerprinted

- **Status:** settled  
- **Since:** v2720

## Prediction

The physics under a hologram, which is not a picture but a recorded interference pattern. Two coherent point sources overlapping on a screen write bright and dark fringes spaced lambda*D/d, and the pattern exists only because light adds as amplitude, carrying phase, not as intensity. Because the fringe spacing encodes the source geometry, the separation can be read straight back out of the pattern -- record, then reconstruct -- which is how a hologram stores a three-dimensional scene in a flat sheet.

## Why

physics/hologram.js. Intensity is the true wave superposition |sum A_i exp(i 2pi path_i / lambda)|^2; the fringe spacing lambda*D/d and the reconstruction (recovering the separation from the spacing) fall out of it. It uses sines and cosines of a phase, so it is gated but NOT in the cross-architecture fingerprint -- trig of arbitrary angles is not bit-identical across libm, the same line drawn for the white dwarf and the star catalogue.

## Measured

physics/hologram-selfcheck.mjs, 5 checks. Two coherent sources write fringes measured at 25.03 against the formula 25.00; constructive peaks reach 4 (two amplitudes squared) and dark fringes 0, while summing intensities gives a flat field with no fringes; wider sources give finer fringes and longer wavelengths wider ones; and the source separation reads back out of the pattern at 19.97 from an original 20.

## Kill condition

physics/hologram-selfcheck.mjs. SABOTAGE: discard the position-dependent phase, and the interference collapses into a flat field -- the phase is the hologram, the one thing that turns two overlapping beams into a pattern that stores geometry. HONEST SCOPE: this is the optics of interference and diffraction, not a rendered holographic display; the wavefront and phase are invisible, the fringes they write are real and computed here.

# Citations

- Code: physics/hologram.js (wave superposition + fringe spacing + reconstruction) + physics/hologram-selfcheck.mjs (5 checks, sabotage-tested) + a Physics Lab scene where a source-separation slider tightens the fringes and the separation reads back out. Real wave optics, hidden and real -- the invisible phase writing a visible, geometry-encoding pattern.
- Page: `physics-lab.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
