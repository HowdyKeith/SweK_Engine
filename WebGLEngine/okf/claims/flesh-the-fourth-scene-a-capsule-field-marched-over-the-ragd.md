---
type: claim
title: "Flesh -- the fourth scene, a capsule field marched over the ragdoll bones"
description: "The scene picker's missing member, wired the honest way. Flesh has no mesh file in the tree, so rather than fake one it is GROWN: the eleven ragdoll bones become capsules, their si"
tags: [settled, "swek-engine", v2725]
timestamp: v2725
---

# Flesh -- the fourth scene, a capsule field marched over the ragdoll bones

- **Status:** settled  
- **Since:** v2725

## Prediction

The scene picker's missing member, wired the honest way. Flesh has no mesh file in the tree, so rather than fake one it is GROWN: the eleven ragdoll bones become capsules, their signed-distance fields are joined with a smooth-min blend, and the result is marched into a skin that wraps the skeleton. Pick flesh and it renders, wipes against Krbn and exports to OBJ like the other three.

## Why

tools/krbn/sceneMeshes.js, fleshMesh. Each bone is a capsule (segment plus radius); a smooth union with blend 0.16 merges them into one surface, the same recipe swek-flesh.krbn.ts describes. The field is sampled on a grid and meshed with greedyMesh3d -- the exact mesher the blobulator uses -- so flesh is voxel-marched like the blob, honest and blocky rather than the smooth marching cubes the .krbn scene uses.

## Measured

tools/krbn/sceneMeshes-selfcheck.mjs, now 6 checks. Flesh meshes to hundreds of vertices with indices in bounds and spanning the array, is deterministic, is distinct from the other three, and projects and exports a valid OBJ. The added check proves it is skin over the skeleton: the flesh bounding volume encloses the ragdoll rig on every axis, so the field wrapped the bones rather than floating beside them. It stands as a figure taller than it is deep, arms out.

## Kill condition

tools/krbn/sceneMeshes-selfcheck.mjs. The enclosure check fails if the field stops wrapping the bones; and the field itself has a real edge -- a smooth-min seeded from infinity returns NaN and meshes to nothing, which is exactly the empty mesh caught during the build before it could ship. HONEST SCOPE: flesh is voxel-marched (blocky) not smooth marching cubes; it re-creates the capsule recipe of swek-flesh.krbn.ts rather than loading its absent .obj.

# Citations

- Code: tools/krbn/sceneMeshes.js (fleshMesh: capsule SDF + smooth union + greedy march) + the enclosure check in tools/krbn/sceneMeshes-selfcheck.mjs + the flesh option in the picker. The picker is now complete: blob, splat, ragdoll, flesh -- four real emitted scenes to compare against Krbn and lift to 3D.
- Page: `krbn-compare.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
