---
type: claim
title: "The occlusion confidence is folded into the fingerprint too -- what the camera could see is now bit-identical across the fleet"
description: "Not just the exact 3D tracks and their 2D projections, but the visibility itself -- which points a solid or a nearer point hid, frame by frame -- is now part of the cross-architect"
tags: [settled, "swek-engine", v2744]
timestamp: v2744
---

# The occlusion confidence is folded into the fingerprint too -- what the camera could see is now bit-identical across the fleet

- **Status:** settled  
- **Since:** v2744

## Prediction

Not just the exact 3D tracks and their 2D projections, but the visibility itself -- which points a solid or a nearer point hid, frame by frame -- is now part of the cross-architecture hash. So the entire emitted benchmark, truth and observation and the confidence an estimator is scored against, is the same to the bit on every box. Occlusion could have been the soft spot, since it comes from a ray-sphere test and a z-buffer, but both are built from sqrt and integer comparisons, all correctly rounded, so they fold cleanly.

## Why

fingerprint.mjs: fpTraceTruth now also hashes the per-point-per-frame visibility from renderFrames off the arithmetic scene with its drifting occluders. The ray-sphere intersection uses an explicit sqrt, the pixel binning uses round-to-nearest, and the z-buffer is integer comparison -- none of it trig or hypot, so the visibility mask is identical everywhere.

## Measured

The trace-truth subsystem hash changed as the confidence joined it, moving the master from 2a1eb349 to 8459d62b at the same 48 subsystems. It still computes identically each run, the self-check covers it, and BASELINE, catalog and ledger carry the new value.

## Kill condition

tools/fingerprint/fingerprint-selfcheck.mjs and a fleet check. If a box computes visibility differently -- a hypot slipping into the ray test, a rounding difference in the binning -- its trace-truth hash and its master diverge and the check names it. HONEST SCOPE: the fingerprinted occluders and scene are the arithmetic ones; the trig display scene stays off the hash, as it should, since trig is the thing that is not cross-arch.

# Citations

- Code: fingerprint.mjs fpTraceTruth (now hashing renderFrames visibility) + the regenerated baseline. The whole benchmark -- tracks, observations, depth, and now what was visible -- is one number the fleet agrees on.
- Page: `server.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
