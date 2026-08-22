---
type: claim
title: "Strict-libm Gaussian -- a cross-architecture normal that lets the thermal coupling join the fingerprint"
description: "The blob thermal coupling needed a Gaussian kick, and the textbook Box-Muller draws it as sqrt(-2 ln u)*cos(2 pi v) -- but ln and cos come from the platform math library, the trans"
tags: [settled, "swek-engine", v2686]
timestamp: v2686
---

# Strict-libm Gaussian -- a cross-architecture normal that lets the thermal coupling join the fingerprint

- **Status:** settled  
- **Since:** v2686

## Prediction

The blob thermal coupling needed a Gaussian kick, and the textbook Box-Muller draws it as sqrt(-2 ln u)*cos(2 pi v) -- but ln and cos come from the platform math library, the transcendentals that disagree between machines, which is exactly why the diffusion scene was single-machine only. A Gaussian built instead on the engine\'s proven strict transcendental core would be bit-identical everywhere, and the whole thermal coupling could become a fingerprint subsystem.

## Why

physics/strictGaussian.js. A normal sample is z = sqrt(2)*erfinv(2u-1), the inverse of the normal CDF; erfinv is found by damped Newton on strictErf, whose derivative (2/sqrt(pi))*strictExp(-t^2) is also strict. Only +,-,*,/,sqrt and the strict-libm core -- no ln, no cos. strictJitterCentres draws the Brownian step from it. Accuracy is bounded by strictErf\'s own, which is ample; the point is that every operation is strict, so every machine draws the same numbers.

## Measured

physics/strictGaussian-selfcheck.mjs, 6 checks. Over 200k draws it is a standard normal (mean ~0, variance ~1); its empirical CDF matches 0.5(1+erf(z/sqrt2)) computed from the strict erf to within 0.01; erfinv inverts erf to 2e-9; the source touches no libm transcendental; the strict thermal coupling still tracks (a warmer setpoint reads back hotter) and now reproduces byte-for-byte; and it is seed-deterministic. Folded into the fingerprint as subsystem twenty-eight (thermal-diffusion); the diffusion scene in the Lab now uses it; master f8708b8e...

## Kill condition

physics/strictGaussian-selfcheck.mjs. SABOTAGE: skip the Newton refinement and return the raw seed -- the distribution stops matching the normal CDF and the inversion fails, because a first guess at erfinv is not erfinv. THE STRICT CORE BUILT ROUNDS AGO IS EXACTLY WHAT MAKES A NEW COUPLING CROSS-ARCHITECTURE; the thermal coupling is no longer single-machine.

# Citations

- Code: physics/strictGaussian.js (erfinvStrict Newton-on-strictErf, strictGaussian probit sample, strictJitterCentres) + physics/strictGaussian-selfcheck.mjs (6 checks, gated, sabotage-tested) + folded into tools/fingerprint (subsystem 28, thermal-diffusion), tools/ledger, tools/catalog + the Lab diffusion scene switched onto it. The Blobarium thermal coupling made cross-architecture.
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
