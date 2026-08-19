---
type: claim
title: "Krbn is flat by choice, not by nature -- its drawing lifts back to 3D given the geometry"
description: "The bridge for an our-obj-vs-Krbn comparison, and the answer to whether Krbn's output can come back into a 3D view. Krbn renders a 3D scene to a flat SVG through a perspective came"
tags: [settled, "swek-engine", v2721]
timestamp: v2721
---

# Krbn is flat by choice, not by nature -- its drawing lifts back to 3D given the geometry

- **Status:** settled  
- **Since:** v2721

## Prediction

The bridge for an our-obj-vs-Krbn comparison, and the answer to whether Krbn's output can come back into a 3D view. Krbn renders a 3D scene to a flat SVG through a perspective camera -- flat by design, because it draws pictures. From that drawing alone the depth is gone: two points on a ray collapse to one. But the flattening destroys only the picture, not the scene: with the camera and the geometry, a flat point back-projects onto the mesh and the exact 3D point returns. The flatness is reversible; the depth just has to come from the geometry, which already lives upstream in the shared mesh.

## Why

tools/krbn/krbnCompare.js. A deterministic shared mesh (Krbn's own MeshInput type, positions and triangles), the perspective projection Krbn uses to flatten it, and a back-projection that ray-casts a flat point onto the mesh. No TypeScript-to-3D function is needed to recover 3D from Krbn -- the 3D was never lost on the input side, and even the flat strokes lift back onto the surface they were drawn from. The external TS 3D libraries surveyed (Open3d, galacean, and the rest) are not needed: the geometry is already shared on both sides.

## Measured

tools/krbn/krbnCompare-selfcheck.mjs, 5 checks. The shared mesh is bit-identical on both sides (so the A/B compares one object); the camera flattens the mesh to 2D; two points at different depths on a ray land on the same 2D point (a bare drawing cannot be un-flattened); but a known surface point flattens and back-projects to itself with error under 1e-6 (the drawing lifts back to 3D given the mesh); deterministic.

## Kill condition

tools/krbn/krbnCompare-selfcheck.mjs. SABOTAGE: break the inverse projection so the recovery ray points the wrong way, and the back-projection stops landing on the original 3D point -- proving the lift is real geometry, not coincidence. HONEST SCOPE: this is the projection maths and the recovery, gated headless; the actual side-by-side wipe of our shaded 3D against Krbn's SVG is the rig-side render. Gated, not fingerprinted -- the camera uses trig.

# Citations

- Code: tools/krbn/krbnCompare.js (shared mesh + perspective projection + back-projection) + tools/krbn/krbnCompare-selfcheck.mjs (5 checks, sabotage-tested). The answer, as code: Krbn is flat because it chose to draw, but the scene it drew from is 3D and shared, so our obj and Krbn are the same object two ways -- and the drawing itself lifts back to 3D whenever the geometry is on hand.
- Page: `physics-lab.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
