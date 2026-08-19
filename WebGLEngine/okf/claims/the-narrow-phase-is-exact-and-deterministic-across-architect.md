---
type: claim
title: "The narrow phase is exact, and deterministic across architectures without box3d"
description: "The broad-phase returns candidate pairs; this confirms them. Once a voxel body rotates its cover boxes are oriented, so the right test is OBB-vs-OBB by the separating axis theorem."
tags: [settled, "swek-engine", v2639]
timestamp: v2639
---

# The narrow phase is exact, and deterministic across architectures without box3d

- **Status:** settled  
- **Since:** v2639

## Prediction

The broad-phase returns candidate pairs; this confirms them. Once a voxel body rotates its cover boxes are oriented, so the right test is OBB-vs-OBB by the separating axis theorem. And because SAT uses only add, subtract, multiply and abs -- all IEEE-exact -- this collision test is cross-arch deterministic by construction, a pure-JS lockstep-safe path that runs where box3d.wasm cannot.

## Why

physics/obbOverlap.js implements the 15-axis SAT (3 face normals of each box plus 9 edge-edge cross products; Ericson 4.4). obbFromPosed builds an OBB from a posed cover box (voxelPose output). A faces-only variant is kept only so the gate can prove the 9 edge-edge axes are load-bearing.

## Measured

Analytic cases pin the base test (unit cubes overlap at 1.9, separate at 2.1). A 45-degree box flips overlap exactly at its projected clearance 1 + 2/sqrt2. Over 418 tilted configs the gate finds a case a faces-only test calls a collision but full SAT correctly separates -- and full-overlap always implied faces-overlap. The test is symmetric, and every OBB overlap has overlapping world AABBs, so the broad-phase never culls a real hit. A grep confirms no transcendental math: the result is bit-identical on x86_64 and arm64.

## Kill condition

physics/obbOverlap-selfcheck.mjs. SABOTAGE: skip the 9 edge-edge axes -- the differential check fails, because WITHOUT THE 9 CROSS AXES THE NARROW PHASE REPORTS PHANTOM COLLISIONS. A transcendental slipping into the file would break the determinism grep. The live box3d comparison is rig-only, but this path needs no box3d.

# Citations

- Code: physics/obbOverlap.js (obbOverlap 15-axis SAT + obbFromPosed + obbOverlapFacesOnly) + physics/obbOverlap-selfcheck.mjs (6 checks, gated, sabotage-tested). The collision pipeline is complete: broad-phase cull, narrow-phase confirm, deterministic, box3d-independent.
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
