---
type: claim
title: The noise wrecks the compression and is free to the march
description: "Keith: 'is perlin noise just visual?' -- asked alongside TanTanDev/binary_greedy_mesher_demo (VERIFIED: Rust, 322 stars, 38 forks, dual MIT/Apache-2.0, Bevy, core in src/greedy_mes"
tags: [settled, "swek-engine", v2587]
timestamp: v2587
---

# The noise wrecks the compression and is free to the march

- **Status:** settled  
- **Since:** v2587

## Prediction

Keith: 'is perlin noise just visual?' -- asked alongside TanTanDev/binary_greedy_mesher_demo (VERIFIED: Rust, 322 stars, 38 forks, dual MIT/Apache-2.0, Bevy, core in src/greedy_mesher_optimized.rs). The Rust does not port. THE TRICK DOES: pack a column of voxels into the bits of an integer, then `up = col & ~(col >>> 1)` finds EVERY upward face in the column IN ONE INSTRUCTION. mesh/greedyMesh3d.js's naiveFaces asks solid(x,y,z) once per voxel per direction; this asks nothing.

## Why

NO -- PERLIN NOISE IS NOT JUST VISUAL, AND THIS ENGINE CAN PUT A PRICE TAG ON IT. It is a FUNCTION, not a picture; Ken Perlin built it for TRON and won an Academy Award for it, so it WAS born visual. But in this engine it decides whether the world compresses at all.

## Measured

400 passes over a 32^3 terrain chunk (simplex surface + 3D caves -- world/terrainGenerator.js's own shape), turning the cave noise up. world / faces / naive / binary / speedup: solid-no-caves / 2048 / 48ms / 5ms / 8.8x; few caves / 2440 / 41ms / 2ms / 22.8x; many caves / 2606 / 43ms / 2ms / 23.7x; shredded / 2740 / 41ms / 2ms / 23.0x. THE NOISE ADDS 34% MORE FACES (2048 -> 2740) -- REAL GEOMETRY, REAL MEMORY, REAL DRAW COST -- and v2576 measured the other half of the bill: THE CAVES COST 78% OF THE GREEDY MERGE, because noise destroys the coplanarity merging depends on. AND WHAT DOES IT COST THE DETECTION? NOTHING. The binary column does not move -- 5, 2, 2, 2ms -- because THE BIT OP PROCESSES 32 VOXELS PER INSTRUCTION WHETHER THAT COLUMN IS A CLEAN SLAB OR SHREDDED BY CAVES. IT CANNOT TELL THE DIFFERENCE AND DOES NOT SLOW DOWN TO FIND OUT. THE NOISE WRECKS THE COMPRESSION AND IS COMPLETELY FREE TO THE MARCH -- Keith's thesis in its purest form, and the same shape as v2586's baked grid (10, 10, 9, 7, 6ms across 7 -> 4096 blobs) and v2582's reflex (312.4 vs 79.9).

## Kill condition

Any chunk where binary and naive disagree ON POSITIONS. And the ceiling is stated rather than discovered: JS bitwise ops are 32-BIT, so a column is at most 32 voxels tall -- packColumns(N=64) THROWS instead of silently dropping bit 32 and up, because A FLAG THAT LIES IS WORSE THAN NO FLAG. TanTan's Rust uses u64 and gets 64.

# Citations

- Code: mesh/binaryFaces.js + mesh/binaryFaces-selfcheck.mjs (14 checks, gated, 12/12 runs, sabotage-tested). TWO LESSONS, AND BOTH ARE ABOUT THE CHECK RATHER THAN THE CODE. (1) A COUNTING ORACLE GRADES A NUMBER, NOT A MESH. The first oracle counted faces. I sabotaged facesUp -- flipped `>>> 1` to `<< 1`, making it a DUPLICATE of facesDown -- AND THE COUNT DID NOT MOVE: a terrain column has exactly one up-face and one down-face, so 2 x down == up + down. EVERY FACE IN THE CHUNK WAS IN THE WRONG PLACE AND THE TOTAL WAS PERFECT. Only the hand-check -- the one that looked at WHERE -- caught it. The oracle compares POSITIONS now: the same sabotage fails 5 checks instead of 1. (2) I FLAKED AGAIN, ONE VERSION AFTER LEARNING IT. I wrote `Math.max(tb, tbClean) < Math.min(tb, tbClean) * 3 + 3` -- COMPARING 2ms AGAINST 2ms -- and it failed 1 run in 8. v2586 cost TWO assertions to this exact disease and NAMED it: NOISE WEARING A DECIMAL POINT. The finding is real (5, 2, 2, 2ms while the face count rises 34%) but it lives in the header as an OBSERVATION, and the gate asserts the same thing WITHOUT A CLOCK: the face COUNT rises 34% and the positions still match exactly. A MEASUREMENT WHOSE ERROR BAR EXCEEDS ITS EFFECT IS NOT A MEASUREMENT -- it is a coin flip that outputs milliseconds.
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
