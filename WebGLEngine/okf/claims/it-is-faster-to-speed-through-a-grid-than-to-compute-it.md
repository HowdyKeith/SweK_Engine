---
type: claim
title: It is faster to speed through a grid than to compute it
description: "KEITH'S THESIS, IN HIS WORDS: 'it is faster to speed through a grid of data, rather than decompress/compute that data. 2+2+2+2 = 8 rather than 2x2x2 = 8. Nature is not complicated,"
tags: [settled, "swek-engine", v2586]
timestamp: v2586
---

# It is faster to speed through a grid than to compute it

- **Status:** settled  
- **Since:** v2586

## Prediction

KEITH'S THESIS, IN HIS WORDS: 'it is faster to speed through a grid of data, rather than decompress/compute that data. 2+2+2+2 = 8 rather than 2x2x2 = 8. Nature is not complicated, it runs at full speed, frame by frame.' SAME ANSWER, DIFFERENT ROAD -- and the adding road can win.

## Why

THIS ENGINE ALREADY HAD BOTH ROADS AND HAD NEVER RACED THEM. blob-selfie.html's own slab text names the multiply road: the shadows are 'written down in closed form, one term per blob' -- simulation/tomo/blobPhantom.js:58, blobRadonAt, which LOOPS THE BLOBS. It is exact, it is elegant, AND IT RE-DERIVES THE UNIVERSE ON EVERY SINGLE RAY. And Amanatides & Woo 1987 (v2583) is the add road in its purest form: don't compute a ray-plane intersection per voxel, just tMaxX += tDeltaX and march. IT REPLACED MULTIPLICATION WITH ADDITION AND THAT IS WHY IT IS STILL THE ALGORITHM 39 YEARS LATER.

## Measured

FIRST, THEY MUST AGREE OR THE RACE IS MEANINGLESS: marching converges to the closed form exactly -- 16 steps 1.13% error, 64 steps 0.0036%, 256 steps 0.0000%. SAME ANSWER, DIFFERENT ROAD. THEN MY PREDICTION WAS WRONG, AND BEING WRONG FOUND THE POINT: I marched the ray summing blobFieldAt(), and THE CLOSED FORM WON EVERY TIME AND THE GAP WIDENED (3.4x at 7 blobs, 18.5x at 4096). Because BLOBFIELDAT ALSO LOOPS THE BLOBS -- so that 'march' was O(steps x blobs). I MARCHED A FORMULA AND CALLED IT A GRID: the worst of both roads, paying the compute AND the marching. KEITH SAID A GRID OF DATA. So: bake it ONCE, then every sample is ONE MEMORY READ. 4000 rays -- blobs / closed form / grid march / bake: 7 / 9ms / 10ms / 12ms (closed form 1.2x); 64 / 17ms / 10ms / 6ms (GRID 1.7x); 256 / 59ms / 9ms / 15ms (GRID 6.7x); 1024 / 221ms / 7ms / 67ms (GRID 33.9x); 4096 / 880ms / 6ms / 265ms (GRID 139.8x). LOOK AT THE GRID COLUMN: 10, 10, 9, 7, 6. IT DOES NOT MOVE. It does not care whether the thing that made it was 7 blobs or 4096, BECAUSE IT IS READING MEMORY, NOT SOLVING, while the closed form goes 9 -> 880 re-deriving the universe every ray. THE CROSSOVER IS AROUND 64. THAT FLAT COLUMN IS 'NATURE RUNS AT FULL SPEED, FRAME BY FRAME'.

## Kill condition

A blob count above the crossover where the closed form beats the baked grid on equal rays. AND THE HONEST OTHER HALF, GATED SO IT CANNOT BE DROPPED: THE BAKE IS NOT FREE (265ms at 4096) so the grid only wins IF YOU AMORTISE IT -- 4000 rays yes, ONE RAY NO. And THE GRID IS SAMPLED: 0.02% off the closed form at 128^2. THE CLOSED FORM IS EXACT AND THE GRID IS NOT. THAT IS THE ACTUAL BARGAIN -- 0.02% wrong for 34x -- and the speed number means nothing without it.

# Citations

- Code: simulation/tomo/gridVsClosedForm-selfcheck.mjs (8 checks, gated, 12/12 runs). AND THIS IS NOT AN ABSTRACT RESULT -- IT IS THE SHAPE OF EVERY OTHER MEASUREMENT IN THIS ENGINE, AND NOBODY HAD NAMED IT: moldReflex3 RECOMPUTES from the smell every step while UCB1 and the MLP COMPRESS experience into memory -- 312.4 vs 79.9 (v2582); the GPU brain COMPRESSED the pathfind into a field while CPU Dijkstra MARCHED it -- 50x slower and 40 degrees off; the caves cost 78% of the greedy merge (v2576) because THE NOISE REFUSED TO COMPRESS. THE GATE ALSO COST TWO ASSERTIONS AND BOTH ARE THE SAME LESSON: 'at 7 blobs the closed form wins 1.2x' was 9ms vs 10ms AND IT FLAKED ONE RUN IN NINE; then 'the grid does not care' failed TWELVE OF TWELVE because I HAD WRITTEN `big.tg < small.tc * 8`, COMPARING THE GRID'S TIME TO THE CLOSED FORM'S -- a confused assertion that happened to pass at one ray count. 3ms AGAINST 3ms ON A SHARED 1-CPU SANDBOX IS NOT A MEASUREMENT, IT IS NOISE WEARING A DECIMAL POINT. v2582 named that disease FOUR VERSIONS AGO and I walked back into it WITH A STOPWATCH INSTEAD OF A DICE ROLL. One assertion survives, with 6x of headroom; the rest is in the header as an OBSERVATION and does not pretend to be a gate. I CAN PROVE THE GRID WINS AT SCALE. I CANNOT PROVE THE CLOSED FORM WINS AT 7 BLOBS ON THIS RIG.
- Page: `/blob-selfie.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
