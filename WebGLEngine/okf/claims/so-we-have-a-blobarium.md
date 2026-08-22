---
type: claim
title: "So we have a blobarium?"
description: "Keith: 'So we have a blobarium?' THE HONEST ANSWER WHEN HE ASKED WAS NO. OPEN until he opens /blobarium.html on Galaxina and presses run."
tags: [open, "swek-engine", v2597]
timestamp: v2597
---

# So we have a blobarium?

- **Status:** open  
- **Since:** v2597

## Prediction

Keith: 'So we have a blobarium?' THE HONEST ANSWER WHEN HE ASKED WAS NO. OPEN until he opens /blobarium.html on Galaxina and presses run.

## Why

There was no blobarium.html. blobBodies: ZERO importers. blobThermal: ZERO importers. blobSpace's ONE importer turned out to be MY OWN COMMENT in blobCut.js -- v2573's law (A REGEX THAT GREPS PROSE WILL FIND PROSE) catching me in a grep I wrote to check my own work. And the one file mentioning both box3d and blob was ui/canvasRecorder.js doing `new Blob()` -- THE BROWSER'S BLOB API, A WORD COLLISION exactly like 'xray' on GitHub. THREE ORPHAN MODULES AND A WORD I HAD BEEN USING FOR THREE ROUNDS AS THOUGH IT NAMED SOMETHING. He was right to ask.

## Measured

EIGHTH EXPIRED BLOCKER: box3dLoader does `await import(\"/vendor/box3d/box3d.js\")` -- AN ABSOLUTE PATH. In a browser served from root it resolves; in bare Node it means the FILESYSTEM ROOT, so the import throws and the catch reports 'Box3D WASM not built yet' -- WHILE A 970,694-BYTE box3d.wasm SAT ON DISK THE WHOLE TIME. THE LOADER WAS NOT LYING; IT WAS ANSWERING A QUESTION NOBODY HAD ASKED PROPERLY. v2594 proved Playwright can serve the tree, so REAL box3d.wasm now loads and steps IN THIS SANDBOX, FOR THE FIRST TIME IN THIS ENGINE'S LIFE. 'box3d is rig-only' was true BECAUSE NOBODY SERVED THE TREE. AND THE FIRST THING REAL PHYSICS DID WAS TAKE THE BLOB APART: v2595's blobsToBodies passed `half: b.r` -- THE FIELD RADIUS AS THE COLLISION RADIUS. Measured, closest pair after one second: b.r*1.00 -> 0.2103 becomes 1.1255 (BLOWN APART, 5.4x). b.r*0.50 -> 0.6176. b.r*0.25 -> 0.3356. b.r*0.10 -> 0.2025 (STAYS A BLOB). THE FIELD RADIUS IS WHERE INFLUENCE ENDS; THE COLLISION RADIUS IS WHERE SOLIDITY BEGINS. These seven sit 0.21 apart with r ~ 0.5: DEEP INTERPENETRATION BY DESIGN. AND IT IS NOT A BUG IN BOX3D -- A RIGID SOLVER'S ENTIRE JOB IS TO REMOVE INTERPENETRATION, AND A METABALL'S PEAK *IS* INTERPENETRATION. box3d did its job perfectly and took the blob to pieces. TWO CORRECT THINGS WANTING OPPOSITE OUTCOMES, and the only place to resolve it is the number you hand across. THEN THE PAGE, OPENED IN A REAL BROWSER: zero page errors, 'box3d ready -- seven centres are bodies', and after pressing run: STEP 152, PEAK 3.832, FLOOR 2.280, ABOVE, CLOSEST PAIR 0.203 (started at 0.2103 -- HE STAYED WHOLE), and 1517 lit pixels of 16384 on the x-ray. HE IS IN THERE.

## Kill condition

Galaxina: open /blobarium.html and press run. Either seven lumps fall as a blob or they fly apart. THE PAGE HAS NO FALLBACK ON PURPOSE: if box3d is missing it says so IN RED and DISABLES RUN, because A BLOBARIUM WITH FAKE PHYSICS IS A SCREENSAVER. The warmth slider is Einstein 1905 on the SEVEN CENTRES, not on a grid -- watch the peak WANDER (sometimes ABOVE where it started, because lumps drift together and overlap builds a taller peak) and watch it NEVER fall below the floor.

# Citations

- Code: blobarium.html + physics/blobarium-selfcheck.mjs (9 checks, gated, TWO sabotages: restore the v2595 radius bug -> 2 fail; black out the x-ray -> 1 fails) + the coreScale fix in physics/blobBodies.js. AND v2595's OWN GATE COULD NEVER HAVE CAUGHT THE RADIUS BUG: blobBodies-selfcheck STILL PASSES with it, because it uses a STAND-IN WORLD WITH NO COLLISION -- I wrote a world that answers the calls and enforces nothing, then proved my code correct against it. A STAND-IN WITH NO COLLISION CANNOT DISAGREE WITH YOU ABOUT COLLISION. ONLY REAL box3d COULD FIND THIS AND REAL box3d HAD NEVER BEEN ASKED. AND MY FIRST BLOBARIUM GATE DID NOT GUARD THE FIX EITHER: the 'solves the blob apart' check calls w.addShip DIRECTLY with its own scale and NEVER TOUCHES blobsToBodies, so putting the bug back failed NOTHING -- it DEMONSTRATED the phenomenon and GUARDED nothing, which is v2591's gate-runs-its-own-copy one more time. It goes through the real function with its real default now. The x-ray check counts LIT PIXELS, not contexts, because v2594 established A CONTEXT IS NOT A PICTURE and a black canvas would pass every other check in the file.
- Page: `/blobarium.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
