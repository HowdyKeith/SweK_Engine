---
type: claim
title: "Stroke-lift -- Krbn's flat drawing exported as an importable 3D object"
description: "The persisted end result of the flat-to-3D recovery: Krbn's 2D strokes back-projected point by point onto the surface and written to disk as OBJ polylines. Not a live view -- a fil"
tags: [settled, "swek-engine", v2722]
timestamp: v2722
---

# Stroke-lift -- Krbn's flat drawing exported as an importable 3D object

- **Status:** settled  
- **Since:** v2722

## Prediction

The persisted end result of the flat-to-3D recovery: Krbn's 2D strokes back-projected point by point onto the surface and written to disk as OBJ polylines. Not a live view -- a file you can import and orbit. Arbitrary marks, not just mesh edges, lift correctly: the strokes drape over the curved surface with their depth varying across the drawing, and any stroke whose ray leaves the mesh is dropped so nothing floats.

## Why

tools/krbn/strokeLift.js. liftStrokes runs krbnCompare\'s back-projection over every point of every stroke, splitting a stroke into several 3D polylines where its ray misses; toOBJ writes v vertices and l line elements that import into Blender, MeshLab or three.js. Fed synthetic hatching (diagonal marks along no mesh edge) it still lands on the surface, proving it lifts the drawing rather than echoing the wireframe.

## Measured

tools/krbn/strokeLift-selfcheck.mjs, 6 checks. Hatching strokes lift to 3D polylines all on the surface; each lifted point re-projects back into the drawing (on its ray); the depth varies over the curved surface rather than sitting on a plane; rays that miss produce no geometry; the OBJ is well-formed with indices in bounds; deterministic to the byte. A sample export, krbn-drawing-3d.obj, carries 29 polylines and 151 vertices draped across the shape.

## Kill condition

tools/krbn/strokeLift-selfcheck.mjs. SABOTAGE: place each point at a fixed depth along its ray instead of ray-casting onto the mesh, and the drape check fails -- the strokes flatten onto a plane, because a fixed depth is not a surface. HONEST SCOPE: this lifts strokes onto geometry we already hold; the strokes come from Krbn\'s SVG (or synthetic marks here), and it needs the mesh as a scaffold -- it does not reconstruct 3D from a bare drawing, which is impossible and was never the claim.

# Citations

- Code: tools/krbn/strokeLift.js (liftStrokes + toOBJ + hatch demo) + tools/krbn/strokeLift-selfcheck.mjs (6 checks, sabotage-tested). The answer to the earlier live-view-vs-import question, finished: import as a 3D object, exported to OBJ, Krbn\'s line-work now a real asset lying on the surface it was drawn from.
- Page: `physics-lab.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
