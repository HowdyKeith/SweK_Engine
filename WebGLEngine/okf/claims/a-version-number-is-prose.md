---
type: claim
title: A version number is prose
description: "Reviewing Vercidium's repos, the obvious question was whether to port vercidium-patreon/meshing (MIT, C#, greedy meshing for voxel models, Part 1 of his Free Friday series). BEFORE"
tags: [settled, "swek-engine", v2572]
timestamp: v2572
---

# A version number is prose

- **Status:** settled  
- **Since:** v2572

## Prediction

Reviewing Vercidium's repos, the obvious question was whether to port vercidium-patreon/meshing (MIT, C#, greedy meshing for voxel models, Part 1 of his Free Friday series). BEFORE PORTING ANYONE ELSE'S, CHECK WHAT IS HERE. This engine has TWO greedy meshers: mesh/greedyMesher.js ('v1 - BASIC 2.5D GREEDY VOXEL MESHER') and voxel/greedyMesh.js ('v2 - SAFE BOUNDS + DEBUG HARDENING'). The version numbers say v2 supersedes v1.

## Why

A file called greedyMesh.js labelled v2, with 'SAFE BOUNDS' in its header, in a tree that also contains a v1 labelled 'BASIC' -- every signal says the newer one is the good one and the old one is legacy.

## Measured

THE MEASUREMENTS SAY THE OPPOSITE, AND v2 HAS NEVER RUN. (1) v1 IS A REAL GREEDY MESHER: hand it a flat 16x16 slab -- the easiest case the algorithm has -- and it returns ONE quad, {x:0,y:0,z:0,w:16,h:16,normal:{0,1,0}}. It merged 256 voxel faces into one. Its limit is in its own comment ('top-face simplification' -- 2.5D, top faces only) AND IT SAYS SO. (2) v2 THROWS on that same slab: 'chunk.getIndex is not a function'. IT CALLS A METHOD THAT DOES NOT EXIST -- the ONLY getIndex() in this entire tree is THREE.js's BufferGeometry.getIndex(), in vendor/. NO CHUNK ANYWHERE DEFINES IT. (3) v2 DOES NOT MERGE: v1 emits {x,y,z,w,h,normal}; v2 emits `quads.push([x, y, z])` -- NO w, NO h, NO normal. One entry per visible voxel IS NAIVE MESHING. Its own comment admits it: 'very simplified face emission (debug-safe)'. IT IS A NAIVE MESHER WEARING A GREEDY NAME. (4) ITS CALLER HANDS IT THE WRONG OBJECT: world/VoxelWorld.js:18 calls greedyMesh({ blocks }), and v2 reads chunk.size, chunk.height AND chunk.getIndex -- `{ blocks }` HAS NONE OF THE THREE.

## Kill condition

!! v2573 CORRECTED THIS ENTRY AFTER KEITH ASKED THREE WORDS: 'Our tree calls it?' HE WAS RIGHT TO ASK. v2572 wrote 'half the tree calls something that cannot run'. THE TRUE COUNT IS ZERO. world/VoxelWorld.js and voxel/VoxelMesh.js do call the broken v2 -- AND NOTHING IMPORTS EITHER OF THEM (0 importers each, verified). They are ORPHANS calling an orphan. The live voxel page, voxel-viewer.html, defines its OWN buildVoxelMesh INLINE at line 208 and imports neither. SECOND TIME THIS SESSION I FOUND A REAL BUG AND OVERSTATED ITS REACH (v2568 libelled v2556 the same way). A REAL FINDING DOES NOT LICENSE A GUESS ABOUT WHAT ELSE IT BROKE -- and I wrote that law myself in v2569, four versions ago, and then did it again. WHAT SURVIVES: v2 still cannot run, v1 still merges correctly. WHAT CHANGES: it is dead code, not a live wound. !! v2575 FIXED IT. voxel/greedyMesh.js is now v3: a DELEGATE to mesh/greedyMesh3d.js -- same export, same path, BOTH CALLERS UNTOUCHED. world/VoxelWorld.js line 18's exact call, greedyMesh({ blocks }), WHICH HAS THROWN SINCE THE DAY IT WAS WRITTEN, now returns 6 quads from 286 naive faces, offset [-5,0,-5]. NOT DELETED -- REWRITTEN: two modules import that path, and DELETING A FILE TWO MODULES IMPORT TO TIDY A BROKEN THING IS HOW YOU BREAK A WORKING THING. MAKING THE BROKEN THING CORRECT IS STRICTLY SAFER THAN REMOVING IT. And the root cause was deeper than getIndex: THIS TREE SPEAKS THREE CHUNK LANGUAGES and nobody wrote that down -- dense {voxels,size,height} (v1), sparse [[x,y,z]] (VoxelWorld, voxel-viewer.html:208), and v2's {size,height,getIndex} WHICH NOTHING EVER PRODUCED. V2 DID NOT MERELY THROW -- IT SPOKE A LANGUAGE NOTHING SPEAKS. v3 accepts both real languages and THROWS NAMING THE KEYS IT RECEIVED on a third, because AN EMPTY MESH IS INDISTINGUISHABLE FROM AN EMPTY WORLD, and that is a bug that looks like content.

# Citations

- Code: mesh/greedyMesh-selfcheck.mjs (8 checks, gated) -- it RUNS both meshers rather than reading their headers. THE ONLY EVIDENCE v2 IS NEWER IS THE STRING 'v2' IN A COMMENT, AND A VERSION NUMBER IS PROSE. A COMMENT IS A CLAIM AND A GATE THAT READS COMMENTS GRADES THE PROSE. Someone wrote a debug-hardening pass, KEPT THE NAME, and the tree grew two code paths that disagree about which mesher this engine has: mesh/chunkMeshBuilder.js imports v1 (works), world/VoxelWorld.js and voxel/VoxelMesh.js import v2 (throws). IF I MOVED A FILE, I MOVED ITS ASSUMPTIONS AND IT DOESN'T KNOW. And the answer to the original question: DO NOT PORT VERCIDIUM'S MESHER YET -- v1 already merges correctly, and the real bug is that half the tree calls something that cannot run.
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
