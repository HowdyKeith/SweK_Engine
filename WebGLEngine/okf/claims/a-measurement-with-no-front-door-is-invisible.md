---
type: claim
title: A measurement with no front door is invisible
description: "The paramecium has produced real, gated results since v2552 and has had NOWHERE TO LOOK AT THEM. 'A measurement that does not reach the codebase is a rumour' (v2569) has an obvious"
tags: [settled, "swek-engine", v2580]
timestamp: v2580
---

# A measurement with no front door is invisible

- **Status:** settled  
- **Since:** v2580

## Prediction

The paramecium has produced real, gated results since v2552 and has had NOWHERE TO LOOK AT THEM. 'A measurement that does not reach the codebase is a rumour' (v2569) has an obvious cousin: A MEASUREMENT WITH NO FRONT DOOR IS INVISIBLE. The numbers lived in a selfcheck's stdout, which is a place nobody visits on purpose. OPEN until Keith loads it and the canvas actually draws.

## Why

The easy version of this page is a demo that reproduces the SHAPE of the finding with its own tidy loop. THAT KIND OF DEMO CAN KEEP SHOWING THE MOLD WINNING LONG AFTER THE MOLD STOPS WINNING -- which is exactly how v2568 happened: SIXTEEN VERSIONS OF A COMPASS that every check passed, because every check asserted THE ORDERING, and a compass satisfies the ordering.

## Measured

SANDBOX-CONFIRMED v2651: parameciumPage-selfcheck (12 checks) passes AND the page renders headless (Chromium, 331k canvas pixels, zero console errors) importing the same paramecium.js/bandit.mjs/freeSpaceWorld.js the gate runs, linked from server.html -- canvas draws and numbers are the gate's, on a deterministic CPU page where headless equals Galaxina. paramecium.html IMPORTS AND RUNS simulation/life/paramecium.js, brain/bench/bandit.mjs and physics/freeSpaceWorld.js -- THE SAME MODULES THE GATE RUNS. It calls swim() rather than reimplementing the walk. Not a recording, not a reimplementation, not a video. GATED HEADLESSLY: the page's own logic reproduces v2569's result exactly -- mold 312.4 food, final y 5.65 with the peak at y=5, IT CLIMBED; UCB1 0.9; random 0.0. AND A REAL FINDING FELL OUT: freeSpaceWorld HAS NO GRAVITY OF ITS OWN, so the page adds it as a per-step velocity change rather than pretending the world has a field it does not -- AND THAT APPROXIMATION LANDS WITHIN 1% OF THE REAL BOX3D SOLVER (page 279.6 vs real wasm 282.8). It could have been silently wrong. It is not.

## Kill condition

Keith loads it and the canvas does not draw, or the numbers differ from the gate's. The page also states its own limit where a visitor reads it -- 'One peak, one start, one gravity' -- and links this page, because A DEMO THAT CANNOT BE WRONG IS AN ADVERT.

# Citations

- Code: paramecium.html + simulation/life/parameciumPage-selfcheck.mjs (12 checks, gated) + linked from server.html beside blobulator, BECAUSE A PAGE WITH NO LINK FROM THE FRONT DOOR IS A PAGE NOBODY OPENS. The page draws HEIGHT AS DOT SIZE on a top view, deliberately: A PARAMECIUM THAT CLIMBED TO THE PEAK AND ONE THAT FELL OUT OF THE WORLD LOOK IDENTICAL FROM DIRECTLY ABOVE -- v2567's creature FELL 418 METRES AND REPORTED THAT DINNER WAS LOVELY, and a top-view-only page would have drawn that as a success. NOTE: slime-mold.html already exists and is a DIFFERENT THING -- the classic Physarum agent-and-trail sim. THIS ENGINE HAS A SLIME-MOLD PAGE AND A MOLD-REFLEX POLICY AND THEY ARE NOT THE SAME MOLD.
- Page: `/paramecium.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
