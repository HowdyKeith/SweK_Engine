---
type: claim
title: "The limit is the interface, not the engine"
description: "v2553 built a checker that tests a physics backend BY MAKING IT DO THE JOB. It had never met real box3d -- for eleven versions it ran against six deliberate fakes and the flat fall"
tags: [settled, "swek-engine", v2564]
timestamp: v2564
---

# The limit is the interface, not the engine

- **Status:** settled  
- **Since:** v2564

## Prediction

v2553 built a checker that tests a physics backend BY MAKING IT DO THE JOB. It had never met real box3d -- for eleven versions it ran against six deliberate fakes and the flat fallback, because box3d.wasm did not exist here. v2560 built it. PREDICTION: real box3d would declare itself spatial and prove it, and the interesting question would be whether the fallback had been silently standing in.

## Why

'is everything a 2d plain for it?' had only ever been answered about the FALLBACK. box3d is a 3D engine. The obvious expectation was that pointing the checker at the real thing would show the flat world was the only flat thing.

## Measured

THREE FINDINGS, ONE IN BOX3D AND TWO IN ME. (1) REAL BOX3D FAILED CONFORMANCE ON ITS FIRST EVER RUN: missing `dimensionality`. v2557 added an 11th call to the CONTRACT and taught it to the FAKES and the FALLBACK and never to the backend that ships -- THE CONTRACT GREW AND THE REAL IMPLEMENTATION DID NOT NOTICE, because nothing could run the check. (2) THE ENGINE IS SPATIAL AND THE SHIP IS NOT: same engine, same 5 m/s push up, 1s, gravity off -- a DYNAMIC swk_body_box rises to y=4.8765; swk_body_ship stays at y=0.0000, because the C sets `motionLocks{false,TRUE,false,true,true,true}` -- Y IS LOCKED ON PURPOSE, because ENDLESS SKY SHIPS FLY IN A PLANE. (3) AND THE ONE THAT MATTERS: I WROTE dimensionality()->'spatial' IN box3dLoader, AND THE CHECKER FAILED IT. It pushed a ship up, watched it not rise, and rejected the claim. IT WAS RIGHT. THE CONTRACT'S ONLY BODY-MAKER IS addShip, so through THIS INTERFACE box3d offers two axes and no more. The honest answer is 'planar'.

## Kill condition

Give the contract an addBody that does not lock Y. Then box3d's dimensionality becomes 'spatial' IN THE SAME COMMIT and the checker pushes it up and makes it prove it. If it ever says 'spatial' while every body it can make has Y locked, this claim is being violated.

# Citations

- Code: physics/box3d/box3dConformance-selfcheck.mjs (13 checks, gated) + dimensionality() added to box3dLoader.js. THE PRINCIPLE: dimensionality() ANSWERS FOR THE CONTRACT, NOT FOR THE ENGINE'S BROCHURE. A creature handed this world gets a plane; telling it 'spatial' because some OTHER entry point can rise would be exactly the substitution v2553 exists to catch -- AN HONEST-SOUNDING CLAIM A CALLER CANNOT CASH. And the checker CANNOT DISCOVER THIS: it cannot find what the probe forbids, which is why the call is a DECLARATION and the checker's job is to catch it LYING. ALSO GUESSED TWICE (32nd, 33rd): FleshSph particles are {x,y,z,vx,vy,vz,rho,p} not {pos,vel}; and swk_body_box(type=0) is a STATIC body (`(type==2)?kinematic:(type==1)?dynamic:static`) -- my first run made a static box, saw box AND ship both at 0.0000, and was one paragraph from publishing 'box3d has no up axis'. A 3D PHYSICS ENGINE THAT CANNOT MOVE UP IS NOT A FINDING, IT IS A BROKEN TEST. RIG-ONLY: the browser loader fetches its glue over HTTP and the bridge will not boot here, so a Node adapter stands in -- check 4 compares it to the loader call by call so it cannot become a ghost.
- Page: `/backend-physics-check.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
