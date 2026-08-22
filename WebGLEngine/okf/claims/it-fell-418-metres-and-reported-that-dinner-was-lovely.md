---
type: claim
title: It fell 418 metres and reported that dinner was lovely
description: "v2566 WROTE THIS KILL CONDITION AGAINST ITSELF: '-9.8 m/s^2 of gravity changes the paramecium\\'s score by exactly zero, because swim() re-asserts setVelocity every 8 ticks and over"
tags: [broken, "swek-engine", v2567]
timestamp: v2567
---

# It fell 418 metres and reported that dinner was lovely

- **Status:** broken  
- **Since:** v2567

## Prediction

v2566 WROTE THIS KILL CONDITION AGAINST ITSELF: '-9.8 m/s^2 of gravity changes the paramecium\'s score by exactly zero, because swim() re-asserts setVelocity every 8 ticks and overwrites whatever the world did. Make it apply FORCES instead -- the shim exports swk_body_impulse and NOTHING CALLS IT. IF GRAVITY STILL CHANGES NOTHING UNDER IMPULSE CONTROL, THE WORLD IS NOT REACHING THE CREATURE AT ALL.'

## Why

The premise: a score that does not respond to gravity means gravity is not arriving. Under velocity control the mechanism was obvious -- setVelocity overwrites. Impulse was supposed to be the test that separated 'the creature ignores the world' from 'the world is absent'.

## Measured

THE PREMISE WAS WRONG, AND WRONG IN THE MOST USEFUL WAY. 600 steps, mold reflex, real box3d: velocity+no-gravity 201.1 food / final y 0.00; velocity+gravity 201.1 / y -6.72; impulse+no-gravity 39.0 / y 0.00; IMPULSE+GRAVITY 39.0 FOOD / FINAL Y -417.80. THE CREATURE FELL FOUR HUNDRED AND EIGHTEEN METRES AND SCORED EXACTLY THE SAME, AND STILL REPORTED BEST TASTE 1.000. The world IS reaching it -- it fell out of the world. THE SCORE DOES NOT KNOW, BECAUSE chemoField IS `at(x, z)` AND HAS NO Y. Even the velocity-driven creature had already sunk to -6.72 and scored an identical 201.1. 'SCORE UNCHANGED' NEVER MEANT 'WORLD NOT REACHING'. IT MEANT THE SCORE COULD NOT SEE.

## Kill condition

Already dead -- v2566's reasoning is the thing that broke. The next test is a 3D chemoField and 3D headings: give the nose a y and the legs a y, and THEN gravity should cost food. If a 3D field STILL shows no gravity effect, something is wrong far beyond the control loop.

# Citations

- Code: impulse is the 13th CONTRACT call + swim(opts.drive) + parameciumDrive-selfcheck.mjs (9 checks, gated, real wasm). THE WORLD REACHES THE CREATURE; THE CREATURE'S SENSES DO NOT REACH THE WORLD. This is the same disease as every other finding this session, in its purest form: v2557's checker pushed x and z and never y; v2564's probe asked a SHIP whether the ENGINE had an up axis; v2565's up-test asserted an endpoint that assumed no gravity. HERE THE INSTRUMENT IS THE CREATURE'S OWN NOSE. A CREATURE WHOSE SENSOR HAS NO Y CANNOT BE GIVEN A Y BY ANY AMOUNT OF PHYSICS -- IT WILL FALL FOREVER AND REPORT THAT DINNER WAS LOVELY. Also: box3dLoader.js has had `impulse(idx, v)` ON LINE 46 ALL ALONG, exactly as it had addBox before v2565 asked -- THE LOADER KEEPS HAVING CAPABILITIES THE CONTRACT DOES NOT REQUEST. The default stays 'velocity': switching it would move every number v2552-v2566 measured, and this engine does not rewrite history to make a new idea look good.
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
