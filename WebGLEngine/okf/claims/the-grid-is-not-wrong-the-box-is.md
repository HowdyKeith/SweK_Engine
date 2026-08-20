---
type: claim
title: The grid is not wrong. The box is.
description: "Keith brought back a Gemini exchange, and THIS TIME IT CONCEDED AND THEN CONVERGED. Having been shown that semi-Lagrangian advection dissolves the blob -- mass 100.0% at every step"
tags: [settled, "swek-engine", v2611]
timestamp: v2611
---

# The grid is not wrong. The box is.

- **Status:** settled  
- **Since:** v2611

## Prediction

Keith brought back a Gemini exchange, and THIS TIME IT CONCEDED AND THEN CONVERGED. Having been shown that semi-Lagrangian advection dissolves the blob -- mass 100.0% at every step while the peak falls, because MASS CONSERVATION IS EXACTLY THE PROPERTY THAT CANNOT SEE SMEARING -- it proposed regenerating the field from the seven lumps instead, and labelled its own pipeline '(Zero Diffusion, 100% Peak Kept)'. THAT IS v2595's FINDING ARRIVING FROM THE OTHER SIDE, UNPROMPTED.

## Why

ITS SHADER IS OUR FORMULA, EXACTLY: `if (r2 < R2) { let x = 1.0 - (r2/R2); totalField += lump.amplitude * (x*x*x); }`. That is blobPhantom.js:46 to the last bracket, AND ITS `if (r2 < R2)` IS THE COMPACT SUPPORT v2596 MEASURED. Checked, not assumed: both give 0.371358618 at d = 0.3. IT GOT THERE ON ITS OWN, AND SAYING SO IS NOT POLITENESS -- IT IS THE RESULT. But its closing question -- 'Do You Even Need the Grid Anymore?' -- hides a cost in the word 'regenerating'.

## Measured

COUNTED, NOT TIMED (v2595/v2602: A COUNT CANNOT FLAKE). Its own shader, its own worldPos mapping to [-10, 10]: 32^3 -> 229,376 dot+compare, 26 inside a lump = 0.0113%. 64^3 -> 1,835,008 tests, 179 inside = 0.0098%. 128^3 -> 14,680,064 tests, 1,433 inside = 0.0098%. NINETY-NINE POINT NINE NINE PERCENT OF THE WORK TESTS VOXELS NOWHERE NEAR THE BLOB. AND IT IS NOT THE SHADER'S FAULT -- THE SHADER IS CORRECT. ITS OWN worldPos MAPS THE GRID TO TWENTY UNITS FOR A CREATURE ONE UNIT ACROSS. The blob occupies (1/20)^3 = 0.0125% of that box and the measurement says 0.0098%. THE NUMBER IS THE GEOMETRY: there is no cleverness to add and nothing to profile. And it does not improve with resolution BECAUSE IT CANNOT -- the wasted fraction is a RATIO OF VOLUMES, identical at 32^3 and 128^3; going to 128^3 buys 8x the work and THE SAME 0.0098%. THE FIX IS NOT A BETTER SHADER: THE BLOB TELLS YOU ITS OWN BOX. Wyvill is EXACTLY ZERO past r, so the field lives in the union of the lumps' bounds AND NOWHERE ELSE -- checked at the corners: exactly 0, not small, ZERO. Tight span 1.845 vs its 20.000 = a volume ratio of 1104x. AT ITS OWN VOXEL SIZE (0.3125 units) the tight box needs 7^3 = 2,401 tests against its 1,835,008. SAME RESOLUTION. 764.3x LESS WORK. AND THE SHADER DOES NOT CHANGE -- ONLY worldPos DOES. Gemini already used compact support for its INNER-LOOP EARLY-OUT AND NEVER APPLIED IT TO THE DOMAIN.

## Kill condition

Inflate the tight box -> 1 fails. REMOVE COMPACT SUPPORT from blobPhantom (the field leaks past r) -> 1 fails, because the whole claim dies the moment the kernel stops being exactly zero out there. AND A SABOTAGE THAT DID NOT LAND IS NOT EVIDENCE: my first attempt at that second one THREW ValueError ('substring not found'), blobPhantom was NEVER MODIFIED, and the '0 failing' it printed was meaningless. I re-ran it with an assert that the edit landed on disk. THE GATE ONLY COUNTS IF THE SABOTAGE REALLY HAPPENED.

# Citations

- Code: physics/regenCost-selfcheck.mjs (8 checks, gated, TWO sabotages). NOT CLAIMING THE GPU IS THE WRONG PLACE: 1,835,008 wasted tests ON A GPU MAY STILL BE FREE -- 64^3 workgroups of trivial ALU with an early-out is exactly what that hardware eats, AND I HAVE NOT MEASURED A GPU. v2137 measured the GPU brain 50x SLOWER than CPU Dijkstra on small grids and I am not pretending that settles this one. THE CLAIM IS NARROW AND COUNTED: ITS BOX IS 1104x BIGGER THAN ITS CREATURE, AND SHRINKING IT COSTS NOTHING AND CHANGES NO MATHS. WHETHER THE WASTE MATTERS IS A MEASUREMENT NEITHER OF US HAS TAKEN. AND THE TIGHT BOX HAS TO FOLLOW HIM -- v2610 measured the blob wandering 6.37 units in sixty seconds with no walls, 3.11 with them, SO A BOX COMPUTED ONCE AT BOOT IS A BOX HE LEAVES. Recomputing it is seven min/max operations against 1.8 million dot products. AND THAT IS THE SAME BUG THE OTHER HALF OF THIS EXCHANGE HIT: 'the box was not following him' -- 240 frames x 0.02 = 4.8 units of drift out of a static sampler, which is EXACTLY the mistake v2610 caught me making with peakOf.
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
