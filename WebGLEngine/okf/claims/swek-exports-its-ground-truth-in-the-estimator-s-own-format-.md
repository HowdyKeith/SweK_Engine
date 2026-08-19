---
type: claim
title: "SweK exports its ground truth in the estimator's own format, so a method like Trace Anything can be scored against it"
description: "The last rung: hand the truth to the estimator's world. SweK exports its scene as a trajectory field of 3D control points over time, with a per-point-per-frame confidence -- the ex"
tags: [settled, "swek-engine", v2742]
timestamp: v2742
---

# SweK exports its ground truth in the estimator's own format, so a method like Trace Anything can be scored against it

- **Status:** settled  
- **Since:** v2742

## Prediction

The last rung: hand the truth to the estimator's world. SweK exports its scene as a trajectory field of 3D control points over time, with a per-point-per-frame confidence -- the exact shape a method like Trace Anything outputs -- except the control points are exact and the confidence is the TRUE visibility, 1 where the camera really saw the point and 0 where a solid or a nearer point hid it. The camera intrinsics and extrinsics go along so their viewer can place it. Their model runs on SweK's video, emits its own control points, and gets laid against this and graded -- their estimate, SweK's truth.

## Why

tools/groundtruth/traceField.js: exportTraceAnything assembles control_points, the true-visibility confidence, the 2D observations the estimator consumes, and the camera, in a documented trace-anything-compatible schema; scoreTraceAnythingOutput lays an estimate against it over the seen points. The page has a button that downloads the export as JSON for a real scene.

## Measured

traceField-selfcheck.mjs check 7: the export carries the schema, survives a JSON round-trip with the control points intact, its confidence matches the rendered visibility exactly, and it scores a perfect estimate at 0 and a 0.5 shift at 0.5. A real export is about 253 KB for 80 points over 32 frames, 66% of observations marked seen.

## Kill condition

traceField-selfcheck.mjs. SABOTAGE: fill the export confidence with all-ones instead of the true visibility, and it no longer matches what the camera saw -- the check fails. That is the proof the confidence is the real answer, not a constant. HONEST SCOPE: the export is JSON in their representation, not a pickled output.pt; the note documents the mapping, and a few lines of Python turn it into their file. Point correspondence is one-to-one here because SweK owns both sides.

# Citations

- Code: tools/groundtruth/traceField.js (exportTraceAnything + scoreTraceAnythingOutput) + the 7th gate check + the download button on the page. The inversion closes the loop: SweK is the ground truth an estimation method gets measured against, in the estimation method's own language.
- Page: `trace-truth.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
