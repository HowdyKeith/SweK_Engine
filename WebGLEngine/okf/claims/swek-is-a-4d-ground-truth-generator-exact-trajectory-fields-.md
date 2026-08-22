---
type: claim
title: "SweK is a 4D ground-truth generator -- exact trajectory fields to grade estimators like Trace Anything against"
description: "The inversion of a method like Trace Anything. That model is handed a video and must estimate where every point went in 3D, because it has no ground truth. SweK is a simulation -- "
tags: [settled, "swek-engine", v2739]
timestamp: v2739
---

# SweK is a 4D ground-truth generator -- exact trajectory fields to grade estimators like Trace Anything against

- **Status:** settled  
- **Since:** v2739

## Prediction

The inversion of a method like Trace Anything. That model is handed a video and must estimate where every point went in 3D, because it has no ground truth. SweK is a simulation -- it knows the truth exactly -- so it emits the benchmark instead of estimating it. It builds a deterministic moving scene whose every 3D track is exact, projects those tracks to the 2D observations an estimator would see, keeps the hidden depth, and grades a recovery against its own answer. The observation is a ray -- depth is genuinely lost -- so recovering 3D is a real inference, and SweK is the thing that supplies the truth to score it against.

## Why

tools/groundtruth/traceField.js. makeScene gives each point a known orbit-plus-drift track; a pinhole camera projects to (u,v) and unprojects exactly given depth; groundTruth emits the 3D tracks, the 2D observations and the hidden depth; scoreEstimate is the 3D end-point error. It reuses the same project-and-recover idea the Krbn work proved -- here the camera is exactly invertible given depth, which is what makes the emitted truth exact rather than an approximation of itself. Trig and sqrt in the orbits and the camera basis, so it is gated, not fingerprinted.

## Measured

tools/groundtruth/traceField-selfcheck.mjs, 4 checks. The scene replays bit-for-bit (80 points x 32 frames = 2560 known positions). Projecting every known point and unprojecting it recovers it with a worst error near 1e-15. A point twice as far on the same ray lands on the same pixel, so depth is genuinely lost. And the grader scores a perfect recovery at exactly 0 and a recovery shifted 0.3 everywhere at 0.3. On the page: a cheat estimator handed the true depth scores ~1e-15; honest depth guesses pay 0.9 to 3.0.

## Kill condition

tools/groundtruth/traceField-selfcheck.mjs. SABOTAGE: blind the grader so it ignores the estimate, and a wrong recovery scores zero -- which would pass any estimator, so the gate refuses it. HONEST SCOPE (updated v2740): occlusion is now in -- drifting solids hide the points behind them; the remaining edge is that the scene is a moving point cloud, not yet a rendered video. The scene is a moving point cloud, not yet a rendered video, but the observations are the exact input an estimator consumes.

# Citations

- Code: tools/groundtruth/traceField.js (makeScene + camera + groundTruth + scoreEstimate) + tools/groundtruth/traceField-selfcheck.mjs (4 checks, sabotage-tested) + trace-truth.html (the observations, the exact tracks, a naive estimator graded live). The verification spine reaching into a domain that normally has no ground truth.
- Page: `trace-truth.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
