---
type: claim
title: "The ground-truth scene renders to actual depth frames, and the z-buffer gives point-vs-point self-occlusion for free"
description: "The benchmark stops being a point list and becomes a video. Each frame is rendered by splatting the points into a z-buffer, so there is now an actual depth image an estimator would"
tags: [settled, "swek-engine", v2741]
timestamp: v2741
---

# The ground-truth scene renders to actual depth frames, and the z-buffer gives point-vs-point self-occlusion for free

- **Status:** settled  
- **Since:** v2741

## Prediction

The benchmark stops being a point list and becomes a video. Each frame is rendered by splatting the points into a z-buffer, so there is now an actual depth image an estimator would consume -- and because the z-buffer keeps only the nearest splat per pixel, a point that a closer one covers simply is not in the frame. That is point-vs-point self-occlusion, the way a dense surface hides what is behind it, and it falls out of the same render pass that makes the frames. Total visibility is now a solid in the way OR a nearer point over the top.

## Why

tools/groundtruth/traceField.js: renderFrames splats every solid-visible point into a depth buffer and records, per point per frame, whether its own centre survived the z-test. One pass yields both the frames and the self-occlusion mask -- no separate occlusion code, because being hidden just means a nearer splat won your pixel. The page shows the depth frame, brighter for nearer, with the covered points gone.

## Measured

traceField-selfcheck.mjs check 6: the frames render identically each run, they have content, and on a controlled ray the near point is drawn while the far one is hidden behind it. On the real scene, of 1879 points not blocked by a solid, 176 are still self-occluded by a nearer splat -- the surface hiding its own far side.

## Kill condition

traceField-selfcheck.mjs. SABOTAGE: break the z-test so a farther splat can overwrite a nearer one, and the far point on the ray is wrongly drawn -- the self-occlusion check fails. That is the proof the occlusion comes from the depth buffer and not from a guess. HONEST SCOPE: the frame is a splat raster, not a shaded photoreal render; it is the geometry an estimator tracks, not a camera image, which is the honest and sufficient input.

# Citations

- Code: tools/groundtruth/traceField.js (renderFrames + the z-buffered self-occlusion mask) and the 6th gate check, plus the rendered depth frame on the page. The benchmark is a video now, and its hardest cases -- a point vanishing behind another point -- come straight from how it is drawn.
- Page: `trace-truth.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
