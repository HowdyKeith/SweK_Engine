---
type: claim
title: The buffer you never upload
description: "Port Vercidium's Free Friday Part 2 (vercidium-patreon/glvertexid -- VERIFIED: MIT, C#, Silk.NET, ~100 stars, 'a standalone renderer that uses gl_VertexID to render a heightmap wit"
tags: [open, "swek-engine", v2584]
timestamp: v2584
---

# The buffer you never upload

- **Status:** open  
- **Since:** v2584

## Prediction

Port Vercidium's Free Friday Part 2 (vercidium-patreon/glvertexid -- VERIFIED: MIT, C#, Silk.NET, ~100 stars, 'a standalone renderer that uses gl_VertexID to render a heightmap with minimal data', Windows-tested only). The C# does not port. THE ARITHMETIC DOES, and gl_VertexID exists in GLSL ES 3.00, so WebGL2 can do this today. OPEN until it runs on Galaxina.

## Why

A heightmap is the surface world/terrainGenerator.js already produces, and it is the exact case the trick is for: the x/z come from the vertex ID, the height from a texelFetch, and NOTHING IS UPLOADED.

## Measured

FIRST -- THE TRICK WAS ALREADY IN THIS ENGINE, FOUR TIMES, AND CHECKING FOUND IT: engine/OvmRenderer.js:103 uses `int corner_idx = gl_VertexID & 7` for CUBE CORNERS; fx/nebula/nebulaShaders.js:38 and sinogram-gpu.html:50 both do the FULLSCREEN-TRIANGLE trick; demos/ovm/ovmDemo.js. CHECKING BEFORE BUILDING HAS CHANGED THE JOB FIVE ROUNDS RUNNING (v2572 two greedy meshers, v2573 three, v2576 the terrain generator, v2583 the raycast that already existed, now this). WHAT WAS MISSING IS THE ONE THE REPO IS ACTUALLY ABOUT: A HEIGHTMAP. THEN THE MEASUREMENT: the mapping REPRODUCES THE VERTEX BUFFER EXACTLY -- 0 wrong out of 96, 1536, 24576, 98304 and a non-square 17x5 -- so the shader draws the same mesh with no buffer at all. A 1024x1024 chunk is 6.3M VERTICES ADDRESSED BY ZERO BYTES OF VERTEX DATA where the interleaved xyz buffer alone would be 72 MB. Gated: every cell covered EXACTLY ONCE (twice is z-fighting, zero times is A HOLE IN THE GROUND) and every triangle winding the same way (mixed winding means half the terrain vanishes under backface culling -- v2578 paid for that lesson at 48 quads of 58).

## Kill condition

Galaxina: it compiles and draws terrain, or it does not. THE GLSL IS A STRING AND A STRING IS NOT A SHADER -- the arithmetic is proven, the shader is prose, exactly as v2571's paniniGLSL is and is still waiting for the same screenshot. It declares #version 300 es, so on a WebGL1 context IT FAILS TO COMPILE rather than degrading, which is the honest outcome.

# Citations

- Code: render/heightmapVertexId.js + render/heightmapVertexId-selfcheck.mjs (11 checks, gated, sabotage-tested: transposing cx/cz fails 4 -- which is why the gate tests a NON-SQUARE 17x5 grid, since EVERY SQUARE TEST IN THE WORLD PASSES WITH cx AND cz TRANSPOSED). AND THE HEADLINE THIS COST: the first run said 94 OF 96 VERTICES WRONG, AND THE MAPPING WAS FINE. The oracle stores Float32Array; vertexAt returns float64; I WAS COMPARING A TRUNCATION AGAINST ITS OWN ORIGINAL. x and z are integers and survived, y is a float and did not. The fix is NOT a tolerance -- it is Math.fround, because THE GPU STORES FLOAT32 SO THE COMPARISON MUST BE FLOAT32. A tolerance would have hidden a real error later; fround IS the arithmetic the hardware does.
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
