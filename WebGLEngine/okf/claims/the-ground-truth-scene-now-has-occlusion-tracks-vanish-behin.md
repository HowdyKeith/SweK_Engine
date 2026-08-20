---
type: claim
title: "The ground-truth scene now has occlusion -- tracks vanish behind solids and return, and the grade knows which points were seen"
description: "The benchmark stops being unrealistically easy. Drifting solid spheres sit in the scene, and a point is only visible when nothing blocks the line from the camera to it -- so tracks"
tags: [settled, "swek-engine", v2740]
timestamp: v2740
---

# The ground-truth scene now has occlusion -- tracks vanish behind solids and return, and the grade knows which points were seen

- **Status:** settled  
- **Since:** v2740

## Prediction

The benchmark stops being unrealistically easy. Drifting solid spheres sit in the scene, and a point is only visible when nothing blocks the line from the camera to it -- so tracks disappear behind a solid and reappear, exactly the way a real camera loses and regains a point. The ground truth now carries a visibility flag per point per frame, and the grader can score the error over only the points that were actually seen and report what fraction that was.

## Why

tools/groundtruth/traceField.js: makeOccluders gives deterministic drifting spheres; visibleAt does the ray-sphere test -- a point is hidden when a sphere sits between it and the eye along the ray; groundTruth emits the visibility mask; scoreEstimate takes it and reports epeVisible and the visible fraction. The page dims the hidden points so you can watch tracks blink out behind a solid.

## Measured

The occlusion check in traceField-selfcheck.mjs: a point placed behind an occluder is hidden, one to the side is seen, and a real scene comes out partly occluded -- about 73% of 2560 observations visible, not 0 and not 100. The visibility-aware grade reports error over the seen points plus the visible fraction.

## Kill condition

traceField-selfcheck.mjs. SABOTAGE: disable the ray-sphere test so everything reports visible, and a point parked behind a solid is called seen -- the occlusion check fails. That is the proof the visibility is computed from geometry, not asserted. HONEST SCOPE: occluders are spheres and occlusion is point-vs-solid; point-vs-point self-occlusion of a dense surface is a further step.

# Citations

- Code: tools/groundtruth/traceField.js (makeOccluders + visibleAt + visibility in groundTruth + visibility-aware scoreEstimate) and the 5th gate check, plus the page dimming hidden points. The benchmark now includes the hardest ordinary thing about tracking: things go behind other things.
- Page: `trace-truth.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
