---
type: claim
title: "The floor was only half the tank, and box3d never needed a browser"
description: "Keith: 'lets stabilize the tank next round.' I HAD TOLD HIM FOUR TIMES I COULD NOT MEASURE IT -- every probe timed out. Four attempts, same approach, same wall. RE-RUNNING THE SAME"
tags: [settled, "swek-engine", v2610]
timestamp: v2610
---

# The floor was only half the tank, and box3d never needed a browser

- **Status:** settled  
- **Since:** v2610

## Prediction

Keith: 'lets stabilize the tank next round.' I HAD TOLD HIM FOUR TIMES I COULD NOT MEASURE IT -- every probe timed out. Four attempts, same approach, same wall. RE-RUNNING THE SAME THING A FIFTH TIME IS THE DEFINITION OF NOT LEARNING.

## Why

THE TIMEOUTS WERE NEVER THE PHYSICS. They were 30 s of browser launch, a 970 KB wasm served through a route handler, and a per-step readback through the CDP bridge. I WAS PAYING FORTY SECONDS OF BROWSER TAX TO RUN A LOOP THAT NEVER NEEDED A BROWSER. v2597 recorded that box3dLoader does `await import(\"/vendor/box3d/box3d.js\")` -- AN ABSOLUTE PATH, filesystem root in Node -- and I wrote 'box3d needs a browser' in my head AND NEVER QUESTIONED IT AGAIN. IT WAS ONE SLASH. THE TENTH EXPIRED BLOCKER, and FOUR TIMED-OUT PROBES WERE FOUR CHANCES I HAD TO ASK WHY.

## Measured

Import the factory by file URL: works, `default` is the emscripten factory. Instantiate: FAILS -- the glue was built ENVIRONMENT=web so it fetch()es the wasm and Node's fetch cannot parse a bare path. HAND IT A FETCH THAT READS THE FILE: 40 EXPORTED _swk FUNCTIONS, BOX3D RUNNING IN NODE. Three lines of shim on the ONE web assumption in its loader. SIXTY SIMULATED SECONDS NOW COSTS 0.5 SECONDS OF WALL CLOCK instead of timing out at nine minutes. AND THEN IT ANSWERED THE QUESTION IMMEDIATELY. Sixty seconds at max warmth, real box3d, the real page's floor: sim 10 s -> lowest y -1.6799, furthest xz 1.7043. sim 30 s -> y -1.6331, xz 4.6300. sim 60 s -> y -1.6875, xz 6.3660 AND STILL CLIMBING. THE FLOOR WORKS -- y is rock solid at -1.68 for the whole minute -- AND NOTHING AT ALL HOLDS HIM IN x OR z. WARMTH IS A RANDOM WALK: <x^2> = 2Dt GROWS WITHOUT BOUND AND HAS NO RESTORING FORCE. That is not a bug in jitterCentres, IT IS WHAT BROWNIAN MOTION IS. Each lump diffuses independently until they stop overlapping and the creature stops existing. AN AQUARIUM WITH NO WALLS IS NOT AN AQUARIUM, IT IS A LAUNCH PAD. With four walls at +/-3: 1.7043 -> 2.5170 -> 3.1141, CONTAINED, and the peak RECOVERS to 3.404 having wandered 2.9 -> 2.0 -> 2.6 -> 2.3 -> 1.9 -> 3.4 -- THAT IS v2596's WANDERING PEAK, CONFIRMED OVER A MINUTE INSTEAD OF A FIVE-SECOND GLANCE. AND THE TELEPORT QUESTION ANSWERED ITSELF: setTransform CAN walk a centre into a wall, and box3d's solver EJECTS IT ON THE NEXT STEP. Not a clean reflection. IT HOLDS.

## Kill condition

TWO THINGS THIS ROUND CAUGHT IN MY OWN WORK, AND THE SECOND IS THE WORSE. (1) My gate's model clamped x and z AND FORGOT y -- with no floor and no gravity in the model, y FREE-WALKED TO 4.171 and tripped `home` in a run the real tank holds at -1.68 all minute. THE GATE MODEL WAS NOT THE TANK: A CHECK THAT TESTS A COPY IS GRADING A COPY, AND THE COPY HAS TO HAVE THE FLOOR THE REAL ONE HAS. (2) I ADDED THE WALLS TO blobarium.html, THEN TORE THEM BACK OUT TO CHECK THE GATE WOULD NOTICE -- AND IT PASSED. ALL CHECKS. The page had a floor and no walls, THE EXACT BUG I HAD JUST MEASURED AT 6.37 UNITS OF UNBOUNDED DRIFT, AND THE GATE THAT EXISTS TO WATCH THAT PAGE HAD NOTHING TO SAY. A CONTROL THAT CANNOT FAIL IS DECORATION, AND IT APPLIES TO THE GATE AS HARD AS TO THE PAGE. Now it greps the real page for the real geometry and tearing the walls out fails 1.

# Citations

- Code: blobarium.html (four walls in boot()) + physics/tankStability-selfcheck.mjs (7 checks, gated, 40 ms -- A GATE THAT TAKES A MINUTE IS A GATE SOMEBODY SWITCHES OFF) + physics/blobarium-selfcheck.mjs (now greps floor AND walls). AND ONE CORRECTION TO MY OWN MEASUREMENT, GATED SO IT CANNOT BE TIDIED AWAY: the `peak 0.044` in the no-walls run is PARTLY MY GRID LYING. peakOf samples a FIXED box over [-2,2]; once the lumps wander outside it I am measuring 'IS HE IN THE BOX', NOT 'IS HE HIMSELF'. Move the blob 9 units aside and the grid reads 0.0000 while the field AT HIS OWN CENTRE reads 3.404. v2605 BUILT A GAUGE FOR EXACTLY THAT DISTINCTION -- `home` -- AND I REMADE THE MISTAKE IT EXISTS TO CATCH, IN THE ROUND AFTER SHIPPING IT. THE WANDER IS REAL AND MEASURED BY POSITION. THE PEAK COLLAPSE WAS MY SAMPLER.
- Page: `/blobarium.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
