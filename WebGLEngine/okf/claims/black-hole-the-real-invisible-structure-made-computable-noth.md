---
type: claim
title: "Black hole -- the real, invisible structure made computable; nothing imaginary"
description: "A black hole\\'s defining features are real and invisible: an event horizon, a photon sphere, an innermost stable circular orbit, orbits that precess, a plunge to capture once you c"
tags: [settled, "swek-engine", v2710]
timestamp: v2710
---

# Black hole -- the real, invisible structure made computable; nothing imaginary

- **Status:** settled  
- **Since:** v2710

## Prediction

A black hole\'s defining features are real and invisible: an event horizon, a photon sphere, an innermost stable circular orbit, orbits that precess, a plunge to capture once you cross the ISCO. A Paczynski-Wiita pseudo-Newtonian potential reproduces every one of them in pure arithmetic -- so the hidden structure becomes computable and therefore showable. No wormhole, no invented effect; if it is imaginary it is not here, and if it is hidden and real it is revealed.

## Why

physics/blackHole.js. Phi(r) = -GM/(r - rs) with rs = 2GM/c^2; accel is pure +,-,*,/ and sqrt. schwarzschildRadius/photonSphere/iscoRadius give 2/3/6 GM/c^2; velocity-Verlet step conserves energy and angular momentum; apoapsisAngles measures precession; a particle inside the horizon is marked captured. Folded into the fingerprint as subsystem 39; a Lab scene draws the hole, the horizon ring, the star and its precession trail, with a Start-radius slider and an outside-vs-inside-ISCO contrast.

## Measured

physics/blackHole-selfcheck.mjs, 5 checks. The three radii come out 2/3/6; a circular orbit outside the ISCO holds while one inside plunges through the horizon and is captured; a bound orbit conserves energy to 1e-7 and angular momentum to 1e-9; the orbit precesses ~1.76 rad per revolution; and it is deterministic. New master 3ca19fba...

## Kill condition

physics/blackHole-selfcheck.mjs. SABOTAGE: swap the Paczynski-Wiita potential for a plain Newtonian one, and THREE checks fall at once -- the inside-ISCO orbit no longer plunges (Newton has stable circular orbits everywhere) and the precession goes to zero (a Newtonian ellipse closes). The hidden structure is exactly what Newton cannot show.

# Citations

- Code: physics/blackHole.js (Paczynski-Wiita orbit, radii, precession, capture) + physics/blackHole-selfcheck.mjs (5 checks, sabotage-tested) + fingerprint subsystem 39 + a Physics Lab scene and an ISCO contrast. Real gravity, real relativistic structure, pure arithmetic; nothing imaginary shown.
- Page: `physics-lab.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
