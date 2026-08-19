---
type: claim
title: "Volume/pressure constraint -- pneumatic inflation of a closed mesh, a new constraint type"
description: "Every constraint so far has been per-edge or per-contact -- local. Pressure is different: a single global constraint over a whole closed mesh that drives its enclosed volume to a t"
tags: [settled, "swek-engine", v2673]
timestamp: v2673
---

# Volume/pressure constraint -- pneumatic inflation of a closed mesh, a new constraint type

- **Status:** settled  
- **Since:** v2673

## Prediction

Every constraint so far has been per-edge or per-contact -- local. Pressure is different: a single global constraint over a whole closed mesh that drives its enclosed volume to a target. Inflate above rest, deflate below, and at rest conserve, so squashing one side bulges another. Because it touches every vertex it cannot be graph-colored; it is solved once per iteration, all vertices moved from one multiplier.

## Why

physics/xpbd/volume.js. Enclosed volume is the divergence-theorem sum of signed tetrahedra over the triangles; the per-vertex gradient is the sum of opposite-edge cross products. solveVolume applies the single XPBD volume constraint C = V - restVol*inflation; volumeSubstep solves the shape edges (graph-colored) then the volume constraint. Two determinism guards: the closed mesh is a subdivided octahedron (integer base vertices, sqrt-normalised midpoints) so there is NO sin/cos and the initial positions are bit-identical, and the volume is a fixed-order triangle sum because floating-point addition is not associative.

## Measured

physics/xpbd/volume-selfcheck.mjs, 6 checks. At inflation 1.8 the enclosed volume reaches its target within 5 percent; at 0.5 it deflates to target. At rest inflation the volume holds within 5 percent under a squashing gravity load -- conserved while the shape gives. Two runs are byte-identical. The base octahedron encloses exactly 4/3, matched to 1e-12, so the signed-tetrahedron sum and outward winding are correct. The generator and solver contain no transcendental. Folded into the fingerprint as subsystem nineteen (volume-balloon); master 7bd02c99...

## Kill condition

physics/xpbd/volume-selfcheck.mjs. SABOTAGE: flip the sign of the position correction -- the pressure pushes the wrong way, inflation deflates, and the inflation and conservation checks fail. A UV-sphere generator would seed the initial positions with libm sin/cos and quietly break cross-machine bit-identity, which is why the mesh is a subdivided octahedron. Closed-mesh authoring in couple.html is a follow-on.

# Citations

- Code: physics/xpbd/volume.js (generateIcosphere trig-free, enclosedVolume fixed-order sum, solveVolume single global XPBD constraint, volumeSubstep) + physics/xpbd/volume-selfcheck.mjs (6 checks, gated, sabotage-tested) + folded into tools/fingerprint (subsystem 19) and tools/ledger. A new constraint type: global volume, pneumatic.
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
