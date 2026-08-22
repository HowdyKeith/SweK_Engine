---
type: claim
title: "Neutron star -- real documented specs; a compact object with a surface, not a horizon"
description: "The canonical 1.4-solar-mass, 11-km neutron star, with the specs the literature actually gives and nothing invented. It uses the same relativistic gravity as the black hole but has"
tags: [settled, "swek-engine", v2712]
timestamp: v2712
---

# Neutron star -- real documented specs; a compact object with a surface, not a horizon

- **Status:** settled  
- **Since:** v2712

## Prediction

The canonical 1.4-solar-mass, 11-km neutron star, with the specs the literature actually gives and nothing invented. It uses the same relativistic gravity as the black hole but has a SURFACE instead of an event horizon, and where that surface sits relative to the relativistic radii is the whole story: an ISCO just outside it, a photon sphere buried inside it, and a plunging orbit that impacts the surface rather than vanishing.

## Why

physics/neutronStar.js, on one measured constant GM_sun/c^2 = 1.4766 km. schwarzschildRadiusKm/compactness/iscoKm/photonSphereKm/escapeFraction are pure arithmetic on it; the orbit reuses the black hole\'s Paczynski-Wiita step but stops at the surface radius. Folded into the fingerprint as subsystem 41; a Physics Lab scene draws the star, its surface ring, and an orbit that precesses or impacts depending on the start radius.

## Measured

physics/neutronStar-selfcheck.mjs, 5 checks against the literature. rs comes out ~4.1 km; compactness ~0.19 (0.5 at a black hole horizon, 2e-6 for the Sun); the ISCO (12.4 km) sits outside the 11 km surface while the photon sphere (6.2 km) sits inside it; escape velocity ~0.6c; and a plunging orbit impacts the surface deterministically. New master 54fac80b...

## Kill condition

physics/neutronStar-selfcheck.mjs. SABOTAGE: remove the surface so a plunging orbit keeps falling, and the impact check fails -- the surface is the one thing that distinguishes a neutron star from the black hole it would otherwise be. (Honest scope: the maximum mass, the TOV limit, is real but equation-of-state-dependent, observed near 2.2-2.3 M-sun, and is NOT claimed to be computed here.)

# Citations

- Code: physics/neutronStar.js (documented specs + surface-impact orbit) + physics/neutronStar-selfcheck.mjs (5 checks, sabotage-tested) + fingerprint subsystem 41 + a Physics Lab scene and preset. Real numbers, real relativistic structure, pure arithmetic; the surface is what makes it not a black hole.
- Page: `physics-lab.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
