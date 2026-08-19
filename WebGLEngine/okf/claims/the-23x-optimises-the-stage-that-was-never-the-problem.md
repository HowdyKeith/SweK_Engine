---
type: claim
title: The 23x optimises the stage that was never the problem
description: "I SET OUT TO CONNECT binaryFaces TO greedyMesh3d AND MEASURED MY WAY OUT OF IT. 'binaryFaces -> greedyMesh3d' had been on my ranked gap list since v2587, described identically ever"
tags: [settled, "swek-engine", v2602]
timestamp: v2602
---

# The 23x optimises the stage that was never the problem

- **Status:** settled  
- **Since:** v2602

## Prediction

I SET OUT TO CONNECT binaryFaces TO greedyMesh3d AND MEASURED MY WAY OUT OF IT. 'binaryFaces -> greedyMesh3d' had been on my ranked gap list since v2587, described identically every time: 'detection is 23x and noise-blind; THE MERGE is where caves cost 78%; they have never been in the same pipeline.' I READ THAT LINE FOR FIFTEEN VERSIONS AND NEVER ONCE ASKED WHETHER CONNECTING THEM WOULD HELP.

## Why

THEY WERE NEVER TWO HALVES OF ONE PIPELINE. binaryFaces is Y-ONLY (facesUp/facesDown/countFacesY/facesYList); greedyMesh3d walks SIX directions. AND greedyMesh3d's first parameter is NAMED `solid` BUT IS A CALLBACK -- I passed a Uint8Array and got 'solid is not a function'. THE PARAMETER NAME MISLED ME AND I WOULD HAVE SHIPPED A BENCHMARK BUILT ON THAT ASSUMPTION.

## Measured

AMDAHL, COUNTED NOT TIMED: greedyMesh3d makes 295,374 SAMPLER CALLS on a 32^3 field at fill 0.5. binaryFaces' ENTIRE Y detection is 1,024 packed columns and 2,048 ops (facesUp + facesDown, one shift+and each). RATIO 144 : 1. EVEN INFINITELY FAST, AND EVEN EXTENDED TO ALL SIX DIRECTIONS (12,288 ops), IT DELETES ABOUT 4% OF THE WORK. A 23x SPEEDUP ON 4% IS 4%. AND THE REAL FINDING, WHICH IS NOT ABOUT DETECTION AT ALL -- naive vs greedy quads on 32^3: SMOOTH TERRAIN 4,420 -> 636 = 6.95x. CAVES (noise 0.3) 42,120 -> 29,445 = 1.43x. noise 0.5: 50,818 -> 33,132 = 1.53x. noise 0.9: 22,420 -> 15,029 = 1.49x. GREEDY MESHING IS WORTH 7x ON TERRAIN AND 1.4x ON CAVES -- what it is FOR and what it is NOT for, in one line. The merge win COLLAPSES 79% from terrain to caves, WHICH IS MY OWN NOTE'S 'caves cost 78%' ARRIVING FROM THE OTHER SIDE AND CONFIRMING ITSELF. So the merge is not slow because detection is slow: THE MERGE SPENDS 295,374 SAMPLER CALLS TO SAVE 30% OF THE FACES ON EXACTLY THE GEOMETRY A VOXEL ENGINE WANTS. OPTIMISING DETECTION WOULD SPEED UP THE ONE STAGE THAT WAS NEVER THE PROBLEM.

## Kill condition

Fake naiveFaces high so caves look fine -> 1 check fails. 5/5 runs, NO CLOCK ANYWHERE IN THE FILE. AND THAT MATTERS BECAUSE I TRIED TO TIME IT FIRST: detect came back 11.09ms, 3.82ms, 23.26ms across three fills, WHICH IS NOT A TREND, IT IS JIT WARMUP ON A SHARED 1-CPU BOX. I WAS DOING THE EXACT THING v2595's SHIP GATE CAUGHT ME DOING, IN THE SAME SESSION I WROTE THE LAW DOWN. Delete the clock, count the work: A COUNT CANNOT FLAKE.

# Citations

- Code: mesh/meshChoice-selfcheck.mjs (6 checks, gated, sabotage-tested, 5/5). WHAT I AM NOT CLAIMING, GATED SO IT CANNOT BE DROPPED: I am NOT claiming naive beats greedy. Even on caves greedy still emits FEWER quads (29,445 vs 42,120); 1.43x IS STILL 1.43x AND IT MAY WELL PAY FOR ITSELF ON THE GPU EVEN WHERE IT BARELY PAYS ON THE CPU -- I HAVE NOT MEASURED THE GPU SIDE AND I AM NOT PRETENDING TO. The claim is narrower and checkable: CONNECTING binaryFaces TO greedyMesh3d CANNOT MOVE THE NUMBER THAT MATTERS. A REASON THAT EXPIRED IS A HABIT -- INCLUDING A GAP LIST'S. This item survived fifteen versions BECAUSE IT SOUNDED GOOD, and one afternoon of counting killed it.
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
