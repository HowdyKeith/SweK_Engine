---
type: claim
title: "The instrument was the limit, not the subject"
description: "v2564 recorded a kill condition against itself: 'give the contract an addBody that does not lock Y, and box3d\\'s dimensionality becomes spatial IN THE SAME COMMIT, and the checker "
tags: [settled, "swek-engine", v2565]
timestamp: v2565
---

# The instrument was the limit, not the subject

- **Status:** settled  
- **Since:** v2565

## Prediction

v2564 recorded a kill condition against itself: 'give the contract an addBody that does not lock Y, and box3d\'s dimensionality becomes spatial IN THE SAME COMMIT, and the checker pushes it up and makes it prove it.' THIS IS THAT COMMIT. PREDICTION: box3d flips to spatial with NOTHING ABOUT BOX3D CHANGING, because the planarity was never in the engine.

## Why

v2564 found real box3d had to declare itself PLANAR -- not because the engine is flat (a dynamic swk_body_box rises 4.8765 from a 5 m/s push) but because THE CONTRACT'S ONLY BODY-MAKER WAS addShip, and swk_body_ship sets motionLocks{false,TRUE,false,...} so Endless Sky ships fly in a plane. A CHECKER CANNOT FIND WHAT ITS PROBE FORBIDS.

## Measured

CONFIRMED. addBox is the 12th contract call -- AND IT IS A METHOD box3dLoader.js HAS HAD ALL ALONG (`addBox({type, pos:[x,y,z], half, density})`). THE CAPABILITY WAS NEVER MISSING; THE CONTRACT NEVER ASKED. Point the probe at a general body instead of a ship and box3d cashes 'spatial' for real. ALL THREE BACKENDS NOW CONFORM AND EACH TELLS THE TRUTH ABOUT ITSELF: planarFallbackWorld -> planar (it eats v[1] on line 12, and that limit really IS the engine), freeSpaceWorld -> spatial, REAL box3d -> spatial with joints. !! AND THE PROBE ITSELF WAS WRONG IN A WAY freeSpaceWorld HID: the up-test asserted the body ends at y~=5.0 after 1s at 5 m/s, WHICH SILENTLY ASSUMED NO GRAVITY. freeSpaceWorld has none, so it passed and hid the assumption. Real box3d pulls at -9.8, so the same push peaks near 1.27 and LANDS AT 0.037 -- and the checker called that 'did not move'. It moved five metres per second upward and came back; THE ENDPOINT SIMPLY DOES NOT KNOW. Now it tracks the PEAK, which gravity cannot erase.

## Kill condition

A world that declares 'spatial' while every body a caller can create has Y locked. The checker pushes a general body up and measures the peak, so that lie fails -- and as of this version the REVERSE lie fails too: box3d claiming 'planar' when addBox can rise is caught. AN UNDERSTATED CAPABILITY IS STILL A FALSE INTERFACE: a creature told 'planar' will never try to swim up, and the world would never contradict it.

# Citations

- Code: CONTRACT[12] in physics/backendConformance.mjs + addBox on planarFallbackWorld/freeSpaceWorld/box3dLoader + box3dConformance-selfcheck.mjs (13 checks, gated, run against the real wasm). v2564's ANSWER went stale and v2564's REASONING did not, and those are different things -- dimensionality() ANSWERS FOR THE CONTRACT, and the contract grew. THREE of this version's red checks were v2564's own assertions being superseded (CONTRACT.length===11, 'the contract's only body-maker is addShip', 'box3dLoader declares PLANAR') AND THAT IS THE GATE WORKING: a contract that grows silently is two files disagreeing, and the disagreement would look like a pass.
- Page: `/backend-physics-check.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
