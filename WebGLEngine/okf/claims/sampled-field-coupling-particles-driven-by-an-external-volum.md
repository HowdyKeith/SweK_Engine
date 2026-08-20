---
type: claim
title: "Sampled-field coupling -- particles driven by an external volumetric field, trilinear and exact"
description: "Every coupling so far has been driven by a field the engine computed for itself. This one reaches outside: a regular 3D grid of vectors handed in from the world -- the shape a volu"
tags: [settled, "swek-engine", v2679]
timestamp: v2679
---

# Sampled-field coupling -- particles driven by an external volumetric field, trilinear and exact

- **Status:** settled  
- **Since:** v2679

## Prediction

Every coupling so far has been driven by a field the engine computed for itself. This one reaches outside: a regular 3D grid of vectors handed in from the world -- the shape a volumetric radar return or a Doppler-velocity volume takes -- sampled at each particle and applied as a force, so the fluid billows along a wind it did not generate. The correctness lives entirely in the sampling: it must be trilinear, because only trilinear reproduces a smooth field between grid points, and nearest-neighbour would render it as blocky steps.

## Why

physics/xpbd/sampledField.js. sampleVec reads the eight grid corners around a point and blends them by the fractional position along each axis; the result is exact on any affine field, clamps to the edge outside the grid, and uses only arithmetic and a floor -- no transcendental. sampledFieldSubstep samples the field at each particle and takes it as a force. It is the modulation spine with the field coming from outside rather than from a solver.

## Measured

physics/xpbd/sampledField-selfcheck.mjs, 6 checks. A grid built from an affine field is sampled at fractional points and returns the analytic value to machine epsilon -- the property nearest-neighbour cannot match. A uniform field carries a particle straight along it with no drift; a rotational field curves it around the centre while roughly holding its radius; a point far outside the grid clamps to the boundary and stays finite. Two runs are byte-identical. Folded into the fingerprint as subsystem twenty-five (sampled-field); master 5dd35417...

## Kill condition

physics/xpbd/sampledField-selfcheck.mjs. SABOTAGE: drop the fractional blend, collapsing trilinear to the nearest corner -- the affine-exactness check fails, because a piecewise-constant sampler cannot represent a slope. This is the OpenStorm concept made real: couple to an externally-sampled volumetric field. Vendoring OpenStorm itself is off the table (GPL, Unreal); only the sampling idea is kept.

# Citations

- Code: physics/xpbd/sampledField.js (sampleVec trilinear, buildVectorGrid, sampledFieldSubstep) + physics/xpbd/sampledField-selfcheck.mjs (6 checks, gated, sabotage-tested) + folded into tools/fingerprint (subsystem 25) and tools/ledger. The coupling that reaches outside the engine.
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
