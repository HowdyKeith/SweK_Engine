---
type: claim
title: "Physics Lab -- the Blobarium skin, self-describing scenes, and scenes you can save as a link"
description: "Three things the Lab was missing. The Blobarium\\'s blobby skin -- the isosurface where the blob field crosses a threshold -- so the aquarium looks like an aquarium and not a scatte"
tags: [settled, "swek-engine", v2688]
timestamp: v2688
---

# Physics Lab -- the Blobarium skin, self-describing scenes, and scenes you can save as a link

- **Status:** settled  
- **Since:** v2688

## Prediction

Three things the Lab was missing. The Blobarium\'s blobby skin -- the isosurface where the blob field crosses a threshold -- so the aquarium looks like an aquarium and not a scatter of dots. A way to see the physics each scene runs, the governing formula and the coupling chain, rather than trusting the label. And a way to save a scene -- a temperature, a camera angle -- and come back to it or hand it to someone else.

## Why

physics/metaball2d.js gives the isosurface its field: the same finite-support cubic kernel the phantom uses, evaluated in screen space over the projected centres and thresholded at ISO -- a screen-space approximation (true 3D marching cubes is the faithful upgrade), toggled by a Skin button and drawn as a merged blobby surface. Each scene now carries its governing formula and its field-to-result coupling chain, shown as text and a diagram of pills and arrows. And the scene state -- which scene, every slider, the camera, the skin toggle -- serialises into the URL hash, so Copy scene link is save and opening the link is load.

## Measured

physics/metaball2d-selfcheck.mjs, 5 checks. A blob centre is inside the skin and a point past its support is outside; two blobs close together merge into one connected skin while two far apart stay separate -- the metaball signature; the field falls smoothly with distance; and it is deterministic, arithmetic-only. The formula and coupling-chain panels and the URL save/load are rig-only UI over that gated field.

## Kill condition

physics/metaball2d-selfcheck.mjs. SABOTAGE: shrink the kernel support to nothing and the close pair stops merging -- the surface becomes disconnected circles, not a skin, and the merge and falloff checks fail. The skin is a real thresholded field, not sprites: MERGING IS THE PROPERTY THAT MAKES IT A SURFACE. No new computation folded into the fingerprint; master unchanged at f8708b8e.

# Citations

- Code: physics/metaball2d.js (screen-space cubic-kernel field + insideSkin + merged) + physics/metaball2d-selfcheck.mjs (5 checks, gated, sabotage-tested) + physics-lab.html (Skin toggle isosurface render, per-scene formula + coupling-diagram panel, URL-hash save/load via Copy scene link). The Lab made to show and to share what it runs.
- Page: `physics-lab.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
