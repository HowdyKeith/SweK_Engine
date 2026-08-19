---
type: claim
title: A sphere is where one lump ends. The skin is where seven lumps agree.
description: "Keith: 'can we make a hologram of a blobulator?' -- and he sent Krbn's API.md, which I had been blocked on (my fetcher refuses it on PROVENANCE grounds: it will not take a URL that"
tags: [open, "swek-engine", v2606]
timestamp: v2606
---

# A sphere is where one lump ends. The skin is where seven lumps agree.

- **Status:** open  
- **Since:** v2606

## Prediction

Keith: 'can we make a hologram of a blobulator?' -- and he sent Krbn's API.md, which I had been blocked on (my fetcher refuses it on PROVENANCE grounds: it will not take a URL that did not arrive via search, EVEN THOUGH THE README I FETCHED LINKS IT DIRECTLY). OPEN until this renders in a real Krbn checkout -- I HAVE NOT RUN KRBN AND I AM NOT CLAIMING IT LOOKS GOOD.

## Why

FIRST INSTINCT, MEASURED AND KILLED: a blob IS seven spheres -- blobPhantom.js:91 pushes {x,y,z,r,a} -- and Krbn has sphere(center, radius) as an EXACT ANALYTIC PRIMITIVE. Seven calls and done. IT IS 75% WRONG.

## Measured

Ray-marched from each lump centre to the iso-0.5 crossing: lump 0 has r = 0.4615 but its skin along +x sits at 0.8075 (1.750x) and along -x at 0.2788 (0.604x). AND THE REASON IS THE WHOLE POINT OF A METABALL: THE WYVILL KERNEL a*(1-d^2/r^2)^3 HAS COMPACT SUPPORT. At lump 0's OWN radius its own field is EXACTLY 0.0000 while the total field is 1.4046 -- 2.8x the iso. At the skin (0.8075) lump 0 contributes NOTHING; it is held up ENTIRELY BY NEIGHBOURS. SO KRBN'S SPHERES WOULD BE STRICTLY INTERIOR, TOUCHING NOTHING: SEVEN EXACT DRAWINGS OF THE WRONG OBJECT. And the relationship is a THEOREM, not a threshold: a point outside every lump's r gets zero from every lump, so the sum CANNOT reach the iso -- {field >= iso} IS A STRICT SUBSET OF {inside some sphere}, ALWAYS. Counted on the emitter's lattice: 640 field cells, 1764 union cells, overlap EXACTLY 640. THE UNION IS 2.76x TOO BIG.

## Kill condition

I SHIPPED A DECORATION INTO THE GATE BUILT TO CATCH EXACTLY THIS MISTAKE. The check first read `x extent > 0.7`; I sabotaged the emitter back to my own first instinct -- a naive union of spheres -- AND THE GATE PASSED, ZERO FAILURES, because BOTH shapes reach past 0.7. A CONTROL THAT CANNOT FAIL IS DECORATION. Rebuilt on the subset theorem (640 / 1764 / 640), the same sabotage now fails 1. AND THE FIRST BUILD EMITTED AN EMPTY MESH SILENTLY: I GUESSED the quad shape as `q.corners || q.verts || q.quad` and `continue`d past every quad WITHOUT COMPLAINING -- a quad is { pos, normal, du, dv, w, h }, A CORNER PLUS TWO EDGE VECTORS. AN EMPTY MESH IS A LIE THAT PASSES QUIETLY.

# Citations

- Code: tools/krbnEmit.mjs (blobMeshInput/krbnScene/ISO) + tools/krbnEmit-selfcheck.mjs (8 checks, gated, sabotage-tested) + /mnt/user-data/outputs/blob.krbn.ts (41,956 bytes, 562 positions, 554 triangles, every index in bounds, x extent -0.571..0.800 MATCHING THE RAY-MARCHED SKIN AT 0.8075 -- NOT lump 0's r of 0.4615). THE HOLOGRAM IS KRBN'S OWN VOCABULARY, NOT MINE: API.md annotates `hidden: \"ghost\"` as \"(x-ray)\" IN THEIR OWN WORDS and setImportance(0.3, { role: \"context\" }) as \"quieter, ghosted\". So: SEVEN GHOSTED LUMPS (the bones) INSIDE THE MESHED ISO-SURFACE (the skin), orbited by film() over 48 frames. THAT IS AN X-RAY IN PENCIL -- THE SAME PICTURE THE TOMOGRAPHY STACK HAS BEEN DRAWING SINCE v2560, ARRIVING FROM THE OTHER SIDE. HONEST LIMITS, STATED NOT DISCOVERED: (1) THE SKIN IS BLOCKY -- we have no marching cubes emitting {positions, triangles} (blobulator.html uses THREE.MarchingCubes, which builds a THREE geometry), so the skin comes from OUR OWN gated mesh/greedyMesh3d.js sampling the field. IT IS A VOXEL SKIN AND IT WILL LOOK LIKE ONE; I am not calling it smooth because I would like it to be. (2) v2602 measured greedy's merge at 6.95x on SMOOTH solids vs 1.43x on noise -- A BLOB IS SMOOTH, so this is greedy's GOOD case. (3) API.md warns imported meshes are 'the young part of the engine' and to expect weldEps tinkering -- THAT WARNING IS ABOUT IMPORTED STL/OBJ SOUP; THIS MESH IS GENERATED, shared vertices by construction, no weld, no winding repair. Their easy case, not their hard one. (4) AND THE ORBIT IS EXACTLY WHY v2603 EXISTS: a camera orbit ACCUMULATES ANGLE, and naive argument reduction drifts 2.44e-12 by x = 100000 -- WHICH IS WHERE VALERIU'S '~5 numbers very slightly off' LIVES. tools/strictTrig.mjs is the fix and this scene is the case that needs it.
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
