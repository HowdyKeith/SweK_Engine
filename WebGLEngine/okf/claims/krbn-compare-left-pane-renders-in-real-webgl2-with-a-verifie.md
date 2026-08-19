---
type: claim
title: "Krbn-compare left pane renders in real WebGL2, with a verified canvas-2D fallback"
description: "The compare page's left pane draws the object in real WebGL2 -- a hardware z-buffer and per-pixel shading instead of the canvas-2D painter's-algorithm stand-in -- and its vertex sh"
tags: [settled, "swek-engine", v2726]
timestamp: v2726
---

# Krbn-compare left pane renders in real WebGL2, with a verified canvas-2D fallback

- **Status:** settled  
- **Since:** v2726

## Prediction

The compare page's left pane draws the object in real WebGL2 -- a hardware z-buffer and per-pixel shading instead of the canvas-2D painter's-algorithm stand-in -- and its vertex shader replicates the exact projection krbnCompare uses, so the WebGL left and the flat Krbn right stay aligned across the wipe. If the GPU or the shader is unavailable it falls back to the canvas-2D render, and the status line reports which is live.

## Why

krbn-compare.html. A WebGL2 context, a two-shader program whose vertex stage recomputes cx/cy/cz from the same camera basis and the same F=1/tan(scale) as the projection, smooth per-vertex normals, and a Lambert fragment shader. The 2D canvas sits on top and masks the Krbn side; the WebGL canvas shows through on the shaded side. tryInitGL and drawGL are wrapped so any failure sets gl=null and the whole page reverts to the canvas-2D path that is already proven.

## Measured

CONFIRMED ON THE RIG (v2728): the left pane renders the shaded object in WebGL2, aligned with the Krbn wireframe across the wipe, on blob, splat and ragdoll -- screenshots confirm it. The sandbox still cannot prove pixels; The sandbox has no GPU, so the shader compilation and the rendered pixels cannot be proven here. What IS verified headless: the page\'s module parses, the GLSL is structurally sound (version, balanced braces, main), and the fallback path is the unchanged canvas-2D code that shipped and rendered in v2725 (the screenshot). Framing was also tightened this round -- all four scenes stay on screen across a full orbit while filling far more of the frame.

## Kill condition

Open the page on the rig: if the left pane shows the shaded object and the status says WebGL2 active, it settles; if it is misaligned with the Krbn side, mirrored, or upside down, the shader\'s depth or y-orientation needs the flagged tweak, and the claim breaks until fixed. The fallback means a broken shader degrades to canvas-2D rather than an empty page. HONEST SCOPE: this is a real WebGL render, not a byte-for-byte copy of index.html\'s shader and lighting; matching the main view exactly is a further pass.

# Citations

- Code: krbn-compare.html (WebGL2 renderer + shader-side projection matching krbnCompare + canvas-2D fallback + camera auto-fit tightened). The one component this build cannot prove headless, filed open and honest until the rig confirms it.
- Page: `krbn-compare.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
