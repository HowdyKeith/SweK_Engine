---
type: claim
title: "The same property, two opposite verdicts, decided by the shape of the world"
description: "Keith asked whether teaching robots a world model could teach our 'thoughtless models', the way the paramecium is being taught the 3D world inside box3d. WE HAD ALREADY RUN THAT EX"
tags: [settled, "swek-engine", v2583]
timestamp: v2583
---

# The same property, two opposite verdicts, decided by the shape of the world

- **Status:** settled  
- **Since:** v2583

## Prediction

Keith asked whether teaching robots a world model could teach our 'thoughtless models', the way the paramecium is being taught the 3D world inside box3d. WE HAD ALREADY RUN THAT EXPERIMENT AND NEITHER OF US NOTICED: moldReflex3 IS A WORLD MODEL -- A HAND-WRITTEN ONE. It encodes exactly one fact, 'smell goes up toward food', and v2582 measured it beating a learner that trained 200 episodes, 312.4 to 79.9. PREDICTION: that verdict is only true IN AN ARENA A REFLEX CAN SOLVE, so the honest test is to FIND THE ARENA WHERE THE HAND-WRITTEN MODEL BREAKS.

## Why

One Gaussian peak is a world you can hand-write. A greedy reflex walks uphill, and UPHILL IS A LOCAL FACT -- so a small decoy peak (0.45) near the start with the real one (1.0) far away should trap it. The decoy world wears chemoField's exact interface (at, at3, peak, sigma) so swim() cannot tell the difference.

## Measured

IT TRAPS, AND THE SHAPE OF THE RESULT IS BETTER THAN A WIN FOR EITHER SIDE. Median best taste over 5 seeds -- 0.450 means stuck on the decoy, 1.000 means found the real food: moldReflex3 0.450, ON EVERY SEED, ZERO VARIANCE, ending at [3.0,1.5,3.2] which is on top of the decoy at [3,1,3]. Contextual MLP untrained 0.136 (0.065 .. 0.238). Contextual MLP after 50 episodes 0.283, SPREAD 0.048 .. 0.639. NEITHER FOUND THE REAL FOOD, AND THE LEARNER'S MEDIAN IS WORSE THAN THE REFLEX'S. BUT ITS BEST SEED REACHED 0.639 -- ABOVE THE DECOY -- SO AT LEAST ONE LEARNER CLIMBED OFF A TRAP THE HAND-WRITTEN MODEL CANNOT LEAVE. THE REFLEX'S DETERMINISM, WHICH WON THE SINGLE-PEAK WORLD (312.4 EVERY TIME), IS EXACTLY WHAT DOOMS IT HERE: IT CANNOT GET LUCKY. THE SAME PROPERTY, TWO OPPOSITE VERDICTS, DECIDED ENTIRELY BY THE SHAPE OF THE WORLD.

## Kill condition

A decoy configuration where moldReflex3 reaches the real peak, or a learner that beats 0.450 on the median rather than on one lucky seed. Both are one run of decoyWorld-selfcheck.mjs. The gate is SEEDED -- v2582's lesson, learned the hard way: this measures a learner that IS a lottery, and a gate that lets the lottery into the verdict teaches you to re-run until green.

# Citations

- Code: simulation/life/decoyWorld-selfcheck.mjs (6 checks, gated). !! AND THE SHARPER FINDING IS IN THE METRIC: THE REFLEX SCORES 307.1 FOOD IN THE DECOY WORLD, against 312.4 in the single-peak world -- A 2% DIFFERENCE. BY FOOD IT LOOKS LIKE IT WON. It is parked on a decoy it will never leave. THE FOOD METRIC CANNOT DISTINGUISH 'FOUND THE FOOD' FROM 'FOUND A FOOD AND STOPPED LOOKING'. Only `best` knows -- and `best` is not the obvious thing to report. A VERSION OF THIS TEST THAT REPORTED FOOD, WHICH IS THE OBVIOUS THING, WOULD HAVE CONCLUDED THE REFLEX SOLVED THE DECOY WORLD TOO. THE ANSWER TO KEITH'S QUESTION, HONESTLY: TEACHING DID NOT BEAT TELLING. TELLING HAS A CEILING THAT IS EXACTLY THE DECOY, ON EVERY SEED, FOREVER. TEACHING BOUGHT VARIANCE, NOT SKILL. AND ONLY THE LEARNER HAS ANY PATH TO THE REAL FOOD AT ALL -- WHICH IS THE ENTIRE CASE FOR A LEARNED WORLD MODEL, STATED HONESTLY: NOT THAT IT IS BETTER, BUT THAT IT IS NOT DETERMINISTICALLY STUCK. Fifty episodes is nowhere near enough to cash that in.
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
