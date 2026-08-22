---
type: claim
title: Thread count does not change the physics
description: "Replaying a recording at <b>1, 2, 4 and 8 workers</b> gives identical hashes -- or says INCONCLUSIVE if the WASM build is single-threaded."
tags: [open, "swek-engine", v2508]
timestamp: v2508
---

# Thread count does not change the physics

- **Status:** open  
- **Since:** v2508

## Prediction

Replaying a recording at <b>1, 2, 4 and 8 workers</b> gives identical hashes -- or says INCONCLUSIVE if the WASM build is single-threaded.

## Why

Replaying at a different count re-partitions the constraint graph, so the same arithmetic happens in a different ORDER. a+b+c is not (a+c)+b in floats. An engine that survives this was built to.

## Kill condition

Any divergence, and Box3D's determinism is thread-count-dependent. INCONCLUSIVE is not a pass -- if every count clamps to 1, nothing was re-partitioned and the test could not have failed.

# Citations

- Code: Either box, once the WASM is rebuilt.
- Page: `/box3d-replay.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
