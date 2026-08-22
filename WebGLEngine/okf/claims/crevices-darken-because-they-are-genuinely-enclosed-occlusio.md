---
type: claim
title: "Crevices darken because they are genuinely enclosed -- occlusion measured from the field, not painted"
description: "For a metaball surface the occlusion signal is already owned: a vertex in a crevice is one where the field is high from more than one source at once. ambientOcclusion samples a hem"
tags: [settled, "swek-engine", v2764]
timestamp: v2764
---

# Crevices darken because they are genuinely enclosed -- occlusion measured from the field, not painted

- **Status:** settled  
- **Since:** v2764

## Prediction

For a metaball surface the occlusion signal is already owned: a vertex in a crevice is one where the field is high from more than one source at once. ambientOcclusion samples a hemisphere of directions around each vertex's outward normal; a sample landing inside the surface is a blocked direction, and AO is the blocked fraction -- 0 for an exposed spike, up to 1 for an enclosed pocket. The colour ramp then darkens the enclosed and brightens the exposed, so the shading is a measurement, not a decoration.

## Why

An isolated convex sphere occludes nothing (AO ~ 0 everywhere). Two balls blended into a peanut have a concave neck that the neighbouring bulge genuinely blocks. The load-bearing line is the field > iso inside/outside test; flip it and the occlusion sign inverts. Deterministic: fixed sample directions, only + - * / sqrt, so it can be fingerprint-folded later.

## Measured

ambientOcclusion-selfcheck.mjs: isolated sphere mean AO 0.000; the peanut neck reads AO 0.202 while the tips stay fully exposed at 0.000; the ramp gives the exposed vertex 2.35 luma vs the enclosed 0.17; recomputes bit-identical. SABOTAGE (field > iso -> field < iso) inverts it -- the neck reads 0.798 and the crevice-darker check fails.

## Kill condition

physics/mesh/ambientOcclusion-selfcheck.mjs. HONEST SCOPE: this proves the occlusion QUANTITY is real and correctly signed on the CPU mesh; wiring the ramp into the live blob/flesh pages is the rendering step, checked by render QA.

# Citations

- Code: physics/mesh/marchingCubes.js (ambientOcclusion + occlusionRamp) + ambientOcclusion-selfcheck.mjs.
- Page: `case-study.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
