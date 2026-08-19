---
type: claim
title: "Multi-window layout + live math panels -- see the scene and the numbers under it at once"
description: "One main viewport is not enough to watch a system and its mathematics together. A workspace should be a primary view plus small insets -- another camera, another scene, or a behind"
tags: [settled, "swek-engine", v2702]
timestamp: v2702
---

# Multi-window layout + live math panels -- see the scene and the numbers under it at once

- **Status:** settled  
- **Since:** v2702

## Prediction

One main viewport is not enough to watch a system and its mathematics together. A workspace should be a primary view plus small insets -- another camera, another scene, or a behind-the-scenes math panel -- any of which can be promoted to primary with a click, and the whole arrangement shareable and save-able like a single scene. The panels are the point: not decoration but the real computation drawn live, so watching the inset is watching the physics.

## Why

physics/viewLayout.js and physics/livePanel.js. A layout is a primary view and ordered insets; promote swaps an inset with the primary losing nothing; encode/decode round-trips the layout to a string; validate rejects any view naming a scene or panel that does not exist. The panels: spectrumPanel samples a vibrating mass and runs the strict FFT; zetaLinePanel evaluates |zeta(1/2+it)| along the critical line. Rendering into several canvases is the rig-side piece; this is the model and the data underneath it.

## Measured

physics/viewLayout-selfcheck.mjs, 6 checks. Promote swaps inset and primary keeping all views; a layout serialises and back unchanged, params and all; validation accepts real views and rejects a missing one; the spectrum panel\'s peak lands on the chain\'s analytic mode frequency to within a bin; the zeta-line panel dips at the first three nontrivial zeros; and the operations are deterministic. A tool, not a physics subsystem, so the master is unchanged.

## Kill condition

physics/viewLayout-selfcheck.mjs. SABOTAGE: make promote drop the old primary instead of demoting it to an inset, and the swap check fails -- a promote that loses a view is not a swap. The panels reading the physics is proven by their peaks and dips landing on the known mode frequencies and zeros.

# Citations

- Code: physics/viewLayout.js (makeView, makeLayout, promote, validate, encodeLayout, decodeLayout) + physics/livePanel.js (spectrumPanel on the strict FFT, zetaLinePanel on the critical line) + physics/viewLayout-selfcheck.mjs (6 checks, gated, sabotage-tested). The multi-window model with live behind-the-scenes math; the multi-canvas render is rig-side.
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
