---
type: claim
title: "Baked star catalog -- real recorded qualities, fetch-once-and-bake, no live core fetch"
description: "Real stars with their recorded qualities -- right ascension, declination, distance, apparent magnitude, spectral type, temperature -- brought into the engine as a static snapshot r"
tags: [settled, "swek-engine", v2716]
timestamp: v2716
---

# Baked star catalog -- real recorded qualities, fetch-once-and-bake, no live core fetch

- **Status:** settled  
- **Since:** v2716

## Prediction

Real stars with their recorded qualities -- right ascension, declination, distance, apparent magnitude, spectral type, temperature -- brought into the engine as a static snapshot rather than a live query. The distance modulus recovers true luminosities from apparent ones, and reveals what the eye cannot: the brightest-looking star is not the most luminous. Colour follows temperature the way Wien's law says.

## Why

ev/starCatalog.js, a baked snapshot of thirteen well-known stars from Hipparcos/SIMBAD values (web-verified before baking). This is the honest way to use real sky data in a deterministic engine: fetch once and bake, so loading is deterministic and the core never touches the network. The refresh recipe (Astropy/Astroquery against SIMBAD and Gaia) lives in the notes; the engine only reads what is baked.

## Measured

ev/starCatalog-selfcheck.mjs, 6 checks. Vega loads at magnitude 0.03, 9602 K, type A0V, 25 light-years; the distance modulus gives Vega an absolute magnitude of 0.6 and the Sun 4.8 (an average star, blinding only from proximity); Sirius looks brightest but Deneb, fifteen hundred light-years off, is intrinsically the most luminous; colour tracks temperature; each star sits at its recorded distance and direction in 3D.

## Kill condition

ev/starCatalog-selfcheck.mjs. SABOTAGE: drop the distance term from the absolute magnitude, so apparent brightness stands in for luminosity, and the check that a distant supergiant outshines a near white star fails -- distance is exactly what the eye cannot correct for and the data can. HONEST SCOPE: this is a DATA layer, gated for correctness but deliberately NOT fingerprinted -- it derives positions with trigonometry and luminosities with a logarithm, neither bit-identical across architectures.

# Citations

- Code: ev/starCatalog.js (baked snapshot + position/luminosity/colour derivation) + ev/starCatalog-selfcheck.mjs (6 checks, sabotage-tested) + a Physics Lab scene with a slider from the flat celestial sphere to true 3D distances. Real recorded data, baked not fetched -- deterministic and offline in the core, with the refresh recipe kept alongside.
- Page: `physics-lab.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
