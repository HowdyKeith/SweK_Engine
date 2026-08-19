---
type: claim
title: "Scene picker -- the compare page points at real emitted scenes: blob, splat, ragdoll"
description: "The Krbn-compare page no longer shows only the blob. A picker swaps the object between three real, deterministic scenes -- the blobulator\\'s emitted mesh, the Gaussian-splat cloud "
tags: [settled, "swek-engine", v2724]
timestamp: v2724
---

# Scene picker -- the compare page points at real emitted scenes: blob, splat, ragdoll

- **Status:** settled  
- **Since:** v2724

## Prediction

The Krbn-compare page no longer shows only the blob. A picker swaps the object between three real, deterministic scenes -- the blobulator\'s emitted mesh, the Gaussian-splat cloud (the same LCG and anisotropic ellipsoids as swek-splat.krbn.ts), and the ragdoll rig (the same joints and bones as swek-ragdoll.krbn.ts) -- and everything downstream, the shaded render, Krbn\'s flat drawing, the wipe and the OBJ export, follows whichever is chosen. The camera auto-fits each object so the tall ragdoll and the wide splat cloud frame as cleanly as the blob.

## Why

tools/krbn/sceneMeshes.js. Each scene returns a MeshInput built from small primitives (spheres, cylinders, merged with offset indices); blob comes from krbnEmit, splat and ragdoll are faithful re-creations of their .krbn.ts scenes with the same seeds. sceneMesh(name) drives the page; an unknown name falls back to the blob so the canvas is never empty. Flesh is left out until its marched swek-flesh.obj is in the tree.

## Measured

tools/krbn/sceneMeshes-selfcheck.mjs, 5 checks. Every scene meshes to hundreds or thousands of vertices with indices in bounds AND spanning the whole array; every scene is deterministic; the three are genuinely different geometry (distinct counts, the ragdoll standing off the origin); each projects and exports a valid OBJ; an unknown name falls back to the blob. On the page, auto-fit frames all three with every vertex on screen -- blob radius 1.0, splat 3.3, ragdoll 2.1.

## Kill condition

tools/krbn/sceneMeshes-selfcheck.mjs. SABOTAGE: drop the index offset when the primitives are merged, and each part references another part\'s vertices -- the indices collapse into the low range instead of spanning the array, and the valid-mesh check fails. HONEST SCOPE: splat and ragdoll re-create the .krbn.ts scene geometry (same seeds, same joints), they are not evaluated from the TypeScript; flesh is not wired yet.

# Citations

- Code: tools/krbn/sceneMeshes.js (blob + splat + ragdoll MeshInputs) + tools/krbn/sceneMeshes-selfcheck.mjs (5 checks, sabotage-tested) + the scene dropdown and camera auto-fit in krbn-compare.html. Point the compare at a real emitted scene, wipe it against Krbn, export that one to 3D.
- Page: `krbn-compare.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
