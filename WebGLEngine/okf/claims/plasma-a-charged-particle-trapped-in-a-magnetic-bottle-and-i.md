---
type: claim
title: "Plasma -- a charged particle trapped in a magnetic bottle, and it is fingerprinted"
description: "A charged particle spiralling along the field lines of a magnetic bottle -- a magnetic mirror, weak in the middle and strong at both ends -- under the Lorentz force F = qv x B. A p"
tags: [settled, "swek-engine", v2714]
timestamp: v2714
---

# Plasma -- a charged particle trapped in a magnetic bottle, and it is fingerprinted

- **Status:** settled  
- **Since:** v2714

## Prediction

A charged particle spiralling along the field lines of a magnetic bottle -- a magnetic mirror, weak in the middle and strong at both ends -- under the Lorentz force F = qv x B. A particle with most of its motion perpendicular to the field mirrors and reflects, staying trapped and bouncing; a particle with most of its motion along the field sits in the loss cone and escapes out the end. A magnetic force does no work, so the speed is conserved exactly.

## Why

physics/plasma.js. A divergence-free mirror field (Bz weakest at centre, growing toward the ends; Br pinching in to keep div B = 0) and the Boris pusher -- the standard charged-particle integrator, which is add/subtract/multiply/divide and cross products only, no trig and no fractional powers. So unlike the white dwarf, this one IS folded into the cross-architecture fingerprint, as subsystem 42.

## Measured

physics/plasma-selfcheck.mjs, 5 checks. The speed is conserved to better than 1e-9 over six thousand steps (a magnetic force does no work); a high-pitch-angle particle stays bounded inside the bottle; a low-pitch-angle one reaches ten times the axis length and keeps going (the loss cone); the trapped particle reflects back and forth; deterministic. New master 72626f0a...

## Kill condition

physics/plasma-selfcheck.mjs. SABOTAGE: flatten the mirror field into a uniform one, and the trapped particle stops being trapped -- it drifts away down the axis and the confinement checks fail -- because the mirror field is the bottle, not decoration around it. The Boris pusher being pure arithmetic is exactly why the plasma can carry the bit-identity claim.

# Citations

- Code: physics/plasma.js (Lorentz force + Boris pusher + mirror field) + physics/plasma-selfcheck.mjs (5 checks, sabotage-tested) + fingerprint subsystem 42 + a Physics Lab scene and preset with a pitch slider that walks a particle from trapped to escaping. Real confinement, no light show, and cross-architecture because the maths stayed inside what IEEE pins down.
- Page: `physics-lab.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
