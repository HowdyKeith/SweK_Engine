---
type: claim
title: "The marching-cubes flesh is watertight, its volume converges to the analytic value, and its vertices sit on the isosurface"
description: "A smooth surface extracted from an implicit field we know exactly, graded against that field the same way the other benchmarks grade against a known truth. The extractor marches te"
tags: [settled, "swek-engine", v2757]
timestamp: v2757
---

# The marching-cubes flesh is watertight, its volume converges to the analytic value, and its vertices sit on the isosurface

- **Status:** settled  
- **Since:** v2757

## Prediction

A smooth surface extracted from an implicit field we know exactly, graded against that field the same way the other benchmarks grade against a known truth. The extractor marches tetrahedra rather than cubes, so the six-tet decomposition sharing a common diagonal makes the mesh watertight by construction -- a closed manifold, every edge shared by exactly two triangles, no holes -- for both a plain sphere and an organic metaball blob. The volume it encloses converges to the analytic 4/3 pi R^3 as the grid refines, a number nobody feeds it. Every vertex sits on the isosurface because the crossing is found by interpolating the field, not by snapping to a midpoint. And the normals come from the analytic gradient, so the flesh shades smoothly with no faceting.

## Why

physics/mesh/marchingCubes.js: wyvill is a polynomial metaball field (arithmetic, fold-ready) with wyvillGrad its exact gradient, sphereField gives an exact-volume test surface, marchingTets extracts sharing vertices by grid-edge key, meshVolume integrates by the divergence theorem, watertight counts edge sharing, maxSurfaceDeviation measures how far vertices sit off the surface. mc-flesh.html software-renders the rotating blob shaded by the gradient normals.

## Measured

marchingCubes-selfcheck.mjs, 3 checks: the sphere and a three-ball blob are both watertight with zero boundary edges; the enclosed volume error falls from about 2.6 percent at N=16 to about 0.3 percent at N=48 toward 4/3 pi R^3; and the worst vertex sits under 1e-2 off the surface at N=64, shrinking with resolution, with every normal a unit vector.

## Kill condition

physics/mesh/marchingCubes-selfcheck.mjs. SABOTAGE: snap every vertex to its edge midpoint instead of the interpolated field crossing, and the vertices leave the surface and the volume goes wrong while the topology stays intact -- showing it is the interpolation that places the surface. HONEST SCOPE: this grades against a field we defined, never a scanned object. Marching tetrahedra, so more triangles than marching cubes for the same grid; the arithmetic is fold-ready but currently gated. The volume test uses the exact-volume sphere; the metaball blob is checked for watertightness, not against a closed-form volume it does not have.

# Citations

- Code: physics/mesh/marchingCubes.js + physics/mesh/marchingCubes-selfcheck.mjs + mc-flesh.html. A mesh graded against the field it was cut from -- the ground-truth move applied to surface extraction.
- Page: `mc-flesh.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
