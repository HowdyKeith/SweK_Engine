---
type: claim
title: "Solar system -- real orbital elements, baked not fetched; Kepler's laws emerge"
description: "Real astronomical bodies in the deterministic engine, the honest way. A live NASA fetch would be non-deterministic and need the internet, both of which this engine avoids -- so the"
tags: [settled, "swek-engine", v2711]
timestamp: v2711
---

# Solar system -- real orbital elements, baked not fetched; Kepler's laws emerge

- **Status:** settled  
- **Since:** v2711

## Prediction

Real astronomical bodies in the deterministic engine, the honest way. A live NASA fetch would be non-deterministic and need the internet, both of which this engine avoids -- so the solar system is built from real, stable orbital elements (semi-major axis, eccentricity, mass), the same numbers a textbook or a JPL Horizons snapshot gives, baked as static data. Each planet starts at perihelion with its exact vis-viva speed, so the initial state is a true Keplerian orbit, and the engine carries it forward. Kepler's laws are not imposed; they emerge.

## Why

physics/solarSystem.js. Standard J2000-era elements for the Sun and eight planets; planetState places each at perihelion with speed sqrt((1+e)/(a(1-e))) (GM=1), so specific energy = -1/(2a), specific angular momentum = sqrt(a(1-e^2)), and period = 2*pi*a^1.5. Runs on the existing N-body orbit engine. Folded into the fingerprint as subsystem 40 using a trig-free colinear start (cos0/sin0 are exact) so it stays cross-arch bit-identical; a Physics Lab scene draws the planets and trails with a planet-count slider.

## Measured

physics/solarSystem-selfcheck.mjs, 5 checks. Every planet's orbital energy equals the analytic -1/(2a) and its angular momentum sqrt(a(1-e^2)); Earth, integrated for exactly its analytic period 2*pi, returns to its starting point (Kepler III); the inner system conserves energy to 1e-8; and it is deterministic. New master 352a9184...

## Kill condition

physics/solarSystem-selfcheck.mjs. SABOTAGE: give each planet a circular speed instead of its true vis-viva perihelion speed -- the kind of shortcut that looks fine on screen -- and three checks fail: the energy is no longer -1/(2a), the angular momentum is wrong, and the period closure breaks, because a circle at the perihelion distance is not the ellipse the real elements describe.

# Citations

- Code: physics/solarSystem.js (real elements, vis-viva setup, analytic checks) + physics/solarSystem-selfcheck.mjs (5 checks, sabotage-tested) + fingerprint subsystem 40 + a Physics Lab scene and preset. Real data, deterministic, no internet -- the SweK-honest realisation of loading real astro bodies.
- Page: `physics-lab.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
