---
type: claim
title: "One click from the tank to the hologram, and to a GIF"
description: "Keith: 'Can the blobulator/blobarium 1 click I svg page hologram pencil demo, and to a .gif?'"
tags: [settled, "swek-engine", v2612]
timestamp: v2612
---

# One click from the tank to the hologram, and to a GIF

- **Status:** settled  
- **Since:** v2612

## Prediction

Keith: 'Can the blobulator/blobarium 1 click I svg page hologram pencil demo, and to a .gif?'

## Why

I DID NOT WRITE A GIF ENCODER. render/gifRecorder.js has existed since v2590 -- gated, passing, with encodeGif(frames, w, h) taking RGBA frames directly and recordGif(canvas, {onFrame}). I READ FIRST AND FOUND IT. The instinct to write one was there AND IT WAS WRONG.

## Measured

MEASURED IN A REAL BROWSER BEFORE THE BUTTON EXISTED -- 8 frames at 240x180: RENDER 4501 ms, ENCODE 66 ms, out 29,793 bytes, magic GIF89a. THE ENCODER IS FREE. KRBN IS THE COST at ~563 ms a frame. So 12 frames is ~7 s and 36 is ~20 s, AND A BUTTON THAT LOOKS FROZEN FOR TWENTY SECONDS IS A BROKEN BUTTON: it states the estimate BEFORE you press it and counts frames WHILE it works, yielding to rAF so the progress can actually paint. The mesh is built ONCE for the whole spin -- THE CAMERA ORBITS, HE DOES NOT CHANGE. DRIVEN END TO END: tank -> HOLOGRAM click -> popup carrying SEVEN LIVE LUMPS IN THE URL -> '30 deg -- well -- 562 verts, 554 tris -- 496 strokes -- 473 ms' -> GIF 199,580 bytes, ZERO page errors. VERIFIED INDEPENDENTLY OF THE CODE THAT MADE IT: GIF89a, 320x240, 8 graphic-control extensions, NETSCAPE loop block present.

## Kill condition

THE LUMPS TRAVEL, and that is the whole design: a hologram of a FRESH blob from the seed, while a WANDERED blob sits in the tank you clicked from, WOULD BE A LIE THAT LOOKS LIKE A FEATURE -- v2610 measured that wander at 3.11 units with the walls on, so after a minute they are VISIBLY DIFFERENT CREATURES. krbn.html parses the URL defensively: malformed -> fall back to the seed AND SAY SO, rather than drawing a half-eaten creature and letting you think that is what is in the tank. AND A GIF IS 256 COLOURS PER FRAME MAXIMUM -- which butchers a shaded render and is FREE for a pencil drawing on one background colour. THE X-RAY IS THE ONE THING IN THIS ENGINE THAT LOSES NOTHING TO THE FORMAT (v2590's finding), WHICH IS WHY THE HOLOGRAM IS THE THING WORTH ANIMATING.

# Citations

- Code: blobarium.html (HOLOGRAM button) + krbn.html (lumpsFromUrl, SAVE GIF, frame slider with estimate) + render/gifRecorder.js (v2590, unchanged) + render/holoGif-selfcheck.mjs. HONEST GAP: this gate GREPS THE PAGE AND EXERCISES THE ENCODER; IT DOES NOT RASTER AN SVG, because that bridge is the browser's own rasteriser and node has no DOM. The end-to-end drive proved the picture ONCE, BY HAND, AND IT IS NOT IN THE GATE -- WHICH MEANS IT IS NOT BEING RUN. render-qa is where it belongs. That is honest work, not done.
- Page: `/krbn.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
