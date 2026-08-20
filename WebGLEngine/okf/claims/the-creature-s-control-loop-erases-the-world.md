---
type: claim
title: "The creature's control loop erases the world"
description: "THE PARAMECIUM IN REAL BOX3D -- the point of v2552, fourteen versions ago, unreachable until v2560 built the wasm. PREDICTION: v2552 claimed the contract's calls existed so a physi"
tags: [settled, "swek-engine", v2566]
timestamp: v2566
---

# The creature's control loop erases the world

- **Status:** settled  
- **Since:** v2566

## Prediction

THE PARAMECIUM IN REAL BOX3D -- the point of v2552, fourteen versions ago, unreachable until v2560 built the wasm. PREDICTION: v2552 claimed the contract's calls existed so a physics backend could be swapped WITHOUT THE CREATURE NOTICING, and proved it against a fallback BUILT TO AGREE. Against a backend that was NOT built to agree, something should differ.

## Why

A fallback written to satisfy a contract will satisfy it. The only honest test of substitutability is a backend nobody wrote for the test.

## Measured

FIRST: IT WAS A SHIP. swim() called world.addShip() for fourteen versions -- harmless in the flat fallback, where everything is planar anyway, and A REAL BUG in box3d, where swk_body_ship sets motionLocks{false,TRUE,false,...} because Endless Sky ships fly in a plane. THE PARAMECIUM WOULD HAVE BEEN FLAT IN A 3D ENGINE AND THE ENGINE WOULD NOT HAVE BEEN AT FAULT. It asked for a ship. v2565 added addBox to the contract so a caller COULD ask for something else, AND NOTHING ASKED UNTIL NOW -- a capability nobody requests is indistinguishable from one that does not exist. THEN THE RESULT, WHICH IS BORING AND IS THE POINT: mold 200.4 in the fallback, 201.1 in real box3d; UCB1 75.4 vs 74.5; both find the peak at 1.000; UCB1 STILL LOSES TO THE MOLD IN THE REAL ENGINE (74.5 vs 201.1), so v2552's finding survives contact with real physics and THE BANDIT'S HANDICAP WAS NEVER THE WORLD. AND THE FINDING: -9.8 m/s^2 OF GRAVITY CHANGED THE SCORE BY ZERO -- 201.1 both ways, not 'a little'. swim() RE-ASSERTS ITS VELOCITY EVERY 8 TICKS, so gravity gets eight ticks to pull and setVelocity overwrites the result.

## Kill condition

Make the paramecium apply FORCES instead of velocities -- the shim exports swk_body_impulse and NOTHING CALLS IT. If gravity still changes nothing under impulse control, the world is not reaching the creature at all and something is wrong beyond the control loop. A gated control check proves the gravity IS live: an unattended body drops from y=10 to y=5.16 in one second, so the parameter works and the creature is simply overwriting it.

# Citations

- Code: simulation/life/paramecium.js (asks a spatial world for addBox, a planar one for addShip) + parameciumBox3d-selfcheck.mjs (9 checks, gated, run against the real wasm). THE LESSON: A BODY THAT SETS ITS VELOCITY DOES NOT HAVE PHYSICS DONE TO IT -- IT HAS PHYSICS DONE TO IT EIGHT TICKS AT A TIME. If the paramecium is ever meant to FEEL the world -- to sink, to be pushed -- it must apply forces. RIG-ONLY: the browser loader fetches its glue over HTTP and the bridge will not boot here, so a Node adapter mirrors box3dLoader.js call for call.
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
