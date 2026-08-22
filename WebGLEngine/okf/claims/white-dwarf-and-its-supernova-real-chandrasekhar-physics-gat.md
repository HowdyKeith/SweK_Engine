---
type: claim
title: "White dwarf and its supernova -- real Chandrasekhar physics, gated but honestly NOT fingerprinted"
description: "A white dwarf held up by electron degeneracy pressure, with the two documented facts that pressure produces: a mass-radius relation that runs BACKWARDS (a heavier white dwarf is sm"
tags: [settled, "swek-engine", v2713]
timestamp: v2713
---

# White dwarf and its supernova -- real Chandrasekhar physics, gated but honestly NOT fingerprinted

- **Status:** settled  
- **Since:** v2713

## Prediction

A white dwarf held up by electron degeneracy pressure, with the two documented facts that pressure produces: a mass-radius relation that runs BACKWARDS (a heavier white dwarf is smaller, R ~ M^-1/3) and a hard maximum mass, the Chandrasekhar limit near 1.44 solar masses, past which the star collapses. A Type Ia supernova is exactly that threshold being crossed -- the real trigger, computed, not a fireball painted on.

## Why

physics/whiteDwarf.js. chandrasekharMass = 5.826/mu_e^2; radiusSolar uses the degenerate mass-radius relation with the relativistic correction sqrt(1-(M/M_Ch)^4/3) that drives the radius to zero at the limit; accreteToLimit walks a sub-limit dwarf up to detonation. A Physics Lab scene lets you drag the mass and watch the star shrink, then collapse and eject at the Chandrasekhar limit.

## Measured

physics/whiteDwarf-selfcheck.mjs, 6 checks against the literature. Chandrasekhar mass ~1.46 solar masses; radii 8724 km at 0.6 and 5548 km at 1.0 (heavier is smaller); the radius collapses toward zero at the limit and returns no real value beyond it; an accreting 1.2-solar-mass dwarf shrinks 3967 km to 167 km and detonates crossing the limit.

## Kill condition

physics/whiteDwarf-selfcheck.mjs. SABOTAGE: drop the relativistic correction that drives the radius to zero -- the exact term that creates the Chandrasekhar limit -- and the collapse check fails, because without it there is no maximum mass and no supernova. HONEST SCOPE: this subsystem is GATED but deliberately NOT in the cross-arch fingerprint -- its fractional powers (M^-1/3) are not IEEE-guaranteed bit-identical across architectures the way sqrt is, so folding it into the bit-identity set would be a false claim. The gate proves the physics on this machine; the fingerprint stays at 41 subsystems.

# Citations

- Code: physics/whiteDwarf.js (Chandrasekhar limit + mass-radius + accretion-to-detonation) + physics/whiteDwarf-selfcheck.mjs (6 checks, sabotage-tested) + a Physics Lab scene and preset. Real numbers, real collapse threshold, no staged detonation -- and an honest line drawn around what is and is not cross-architecture.
- Page: `physics-lab.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
