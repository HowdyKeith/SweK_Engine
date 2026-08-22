---
type: claim
title: The blobarium was never at zero kelvin
description: "Keith: 'what if we warmed up the blobarium past kelvin? i would think the blobulator would appreciate that?' THE ANSWER: IT WAS NEVER AT ZERO KELVIN. IT HAS BEEN RUNNING A FEVER TH"
tags: [settled, "swek-engine", v2596]
timestamp: v2596
---

# The blobarium was never at zero kelvin

- **Status:** settled  
- **Since:** v2596

## Prediction

Keith: 'what if we warmed up the blobarium past kelvin? i would think the blobulator would appreciate that?' THE ANSWER: IT WAS NEVER AT ZERO KELVIN. IT HAS BEEN RUNNING A FEVER THE WHOLE TIME, AND THE FEVER IS WHAT DISSOLVED HIM IN v2595.

## Why

I WAS ABOUT TO BUILD THIS ENTIRE ROUND ON A GUESS ABOUT KEITH'S OWN BLOB. My plan was: a Gaussian IS a heat kernel, so warming is free -- exp(-d^2/4Dt) just grows its width, the family is closed under diffusion, one number per blob and done. THE BLOB IS NOT A GAUSSIAN. blobPhantom.js:46 is `u = 1 - d2/(r*r); s += a*u*u*u` with `if (d2 >= r*r) continue` -- A WYVILL POLYNOMIAL WITH COMPACT SUPPORT, (1-d^2/r^2)^3, EXACTLY ZERO past r. Measured: at r+eps the field is EXACTLY 0, at r-eps it is positive, and at d=r/2 it is a*0.75^3 to twelve decimals. A GAUSSIAN FAMILY IS CLOSED UNDER DIFFUSION AND A WYVILL FAMILY IS NOT -- so growing r is NOT warming, IT IS JUST A BIGGER BLOB WEARING A THERMOMETER. AND v2592's blobFieldAt(0.9,0,0) = 0.0000 WAS THIS EXACT EVIDENCE, TWO ROUNDS AGO, AND I STILL NEARLY GUESSED.

## Measured

NUMERICAL DIFFUSION *IS* THE HEAT EQUATION: d(rho)/dt = D grad^2 rho. The advection scheme has an implicit D THAT NOBODY CHOSE AND NOBODY WROTE DOWN, and v2595 measured its EFFECT (50.5% of the peak gone in four seconds) WITHOUT EVER NAMING IT. Bake ONE still blob and advect it out-and-back so IT NEVER MOVES -- any spread is heat. steps 30: <r^2> 0.1324, spread 0.0342, implied D 0.01141. steps 60: 0.1666, 0.0684, D 0.01141. steps 90: 0.2008, 0.1027, D 0.01141. steps 120: 0.2350, 0.1369, D 0.01141. <r^2> GROWS DEAD LINEAR, WHICH IS THE DEFINITION OF DIFFUSION, AND D IS THE SAME AT EVERY TIMESTEP TO FIVE FIGURES. THAT IS NOT SMEARING THAT RESEMBLES HEAT. IT IS HEAT, and it is a physical constant of the scheme. HONEST: the textbook first-order-upwind estimate u*dx/2 = 0.04255 is 3.7x HIGHER than measured -- semi-Lagrangian with trilinear interpolation is GENTLER than the napkin says, and I am NOT claiming they match. THEN: CAN HE BE WARMED ON PURPOSE? Einstein 1905 -- a particle at temperature T random-walks with <x^2> = 2Dt per axis. Jitter the SEVEN CENTRES at the aquarium's OWN fever (D = 0.01141) and the two fates could not be more different. THE GRID: peak only ever falls, 75.3 -> 63.0 -> 55.8 -> 50.5%, NO FLOOR, it goes to zero. THE JITTER, NINE SEEDS: the peak WANDERS, and at least one seed ends ABOVE where it started, because the blobs sometimes drift TOGETHER and the overlap builds a TALLER peak. THAT IS WHAT A TEMPERATURE ACTUALLY LOOKS LIKE: FLUCTUATION, NOT DECAY. And not one seed of nine fell through the floor.

## Kill condition

THE FLOOR IS THE POINT: at the tallest blob's own centre u = 1, so it contributes EXACTLY its amplitude, and every other blob can only ADD. HOWEVER FAR THE CENTRES WANDER THE PEAK CANNOT FALL BELOW max(a) = 2.280. THE GRID HAS NO SUCH GUARANTEE -- DIFFUSION IS NOT OBLIGED TO LEAVE ANYTHING BEHIND. SAME D, OPPOSITE FATE, AND THE DIFFERENCE IS ENTIRELY WHETHER THE HEAT LANDS ON A GRID OR ON SEVEN NUMBERS. Keith asked whether the blobulator would appreciate being warmed: THE WARMTH HE ALREADY HAD WAS DISSOLVING HIM. THIS WARMTH SHAKES HIM AND CANNOT DISSOLVE HIM.

# Citations

- Code: physics/blobThermal.js (lcg/gaussian/jitterCentres/peakFloor/measureAquariumD) + physics/blobThermal-selfcheck.mjs (10 checks, gated, TWO sabotages, 5/5 runs no flake). NINE SEEDS, NOT ONE, because v2582: A CURVE READ OFF ONE SAMPLE IS A GUESS WITH A GRAPH. The steps are GAUSSIAN and the gate proves it (20000 samples, mean ~0, variance ~1) because A RANDOM WALK WITH UNIFORM STEPS IS NOT BROWNIAN, IT IS JUST NOISE -- and Einstein's <x^2> = 2Dt only holds for the real thing, SO A UNIFORM STEP WOULD HAVE MADE D A LIE (sabotage: uniform steps -> 1 fails). Seeded, because A TEMPERATURE YOU CANNOT REPRODUCE IS A RUMOUR (v2582 paid for that with an unseeded Math.random that passed alone and failed under ship). AND MY OWN FLOOR CHECK WAS VACUOUS: it only asserted `every peak >= floor`, so I FAKED peakFloor TO RETURN 0 AND ZERO CHECKS FAILED -- BECAUSE EVERYTHING IS >= 0. THE CHECK PASSED HARDEST EXACTLY WHEN THE THING IT TESTED WAS MOST BROKEN. A FLOOR OF ZERO IS NOT A FLOOR, IT IS A SHRUG, AND MY GATE APPLAUDED IT. It asserts the VALUE now (floor === max(a)) and faking it fails 1. measureAquariumD IS A FUNCTION, NOT A NUMBER IN A COMMENT -- anyone can run it, because A MEASUREMENT YOU HAVE TO TAKE ON FAITH IS A CLAIM, INCLUDING MINE.
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
