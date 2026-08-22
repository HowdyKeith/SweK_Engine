---
type: claim
title: "Krbn Compare -- the viewer and stroke-lift wired into the engine as a page on the real geometry"
description: "The our-obj-vs-Krbn comparison as a proper fleet page, running on the REAL emitted geometry rather than a demo blob: the blobulator's mesh (Krbn's own MeshInput type) drawn two way"
tags: [settled, "swek-engine", v2723]
timestamp: v2723
---

# Krbn Compare -- the viewer and stroke-lift wired into the engine as a page on the real geometry

- **Status:** settled  
- **Since:** v2723

## Prediction

The our-obj-vs-Krbn comparison as a proper fleet page, running on the REAL emitted geometry rather than a demo blob: the blobulator's mesh (Krbn's own MeshInput type) drawn two ways -- our shaded 3D and Krbn's flat line drawing -- with a wipe slider anywhere, an orbit, a lift-to-3D toggle, and an Export OBJ button that writes Krbn's drawing out as importable 3D polylines draped on the surface.

## Why

krbn-compare.html, reachable from server.html (Arriving Pages). It imports the real gated modules -- tools/krbn/krbnCompare.js (projection + back-projection) and tools/krbn/strokeLift.js (lift + OBJ) -- and pulls its geometry from tools/krbnEmit.mjs (blobMeshInput on makeBlobs), so the object on screen and the object exported are the engine's real emitted mesh, 424 vertices and 400 triangles.

## Measured

The maths is the gated code, proven by tools/krbn/krbnCompare-selfcheck.mjs and tools/krbn/strokeLift-selfcheck.mjs. The page and its export path are exercised headless with the real geometry and the orbiting camera: 400 wire strokes lift to 400 polylines and 1600 vertices, depth draped from 5.7 to 7.6 across the real blob, a 54 KB OBJ. The module and server.html are syntax-checked; the live render and the browser download are the rig-side step.

## Kill condition

tools/krbn/krbnCompare-selfcheck.mjs and tools/krbn/strokeLift-selfcheck.mjs -- if the projection or the lift breaks, the page is drawing and exporting wrong, and those gates fail first. HONEST SCOPE: the left pane is a canvas-2D shaded render of the real geometry, not the engine\'s full WebGL pipeline -- pixel-parity with the main view is a further wire. The lift needs the mesh as a scaffold; it does not reconstruct 3D from a bare drawing.

# Citations

- Code: krbn-compare.html (engine page: real geometry + A/B wipe + orbit + lift + Export OBJ) + the Arriving Pages link in server.html. The viewer and stroke-lift, off the outputs folder and into the fleet, pointed at the real object.
- Page: `krbn-compare.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
