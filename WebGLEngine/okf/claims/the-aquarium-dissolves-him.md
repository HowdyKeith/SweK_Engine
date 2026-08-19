---
type: claim
title: The aquarium dissolves him
description: "Keith brought back another assistant's full plan for 'blobulator as the universe physics': bake the density into a WebGPU 3D texture, solve Navier-Stokes on it (semi-Lagrangian adv"
tags: [settled, "swek-engine", v2595]
timestamp: v2595
---

# The aquarium dissolves him

- **Status:** settled  
- **Since:** v2595

## Prediction

Keith brought back another assistant's full plan for 'blobulator as the universe physics': bake the density into a WebGPU 3D texture, solve Navier-Stokes on it (semi-Lagrangian advection, Jacobi pressure projection, boundary bounce), marching-cubes it out, bridge to Jolt via the density gradient. THE SHAPE OF THAT PLAN IS CORRECT -- it is the standard Stam-1999 stable-fluids pipeline and it works. IT EVEN GOT THE SIGN RIGHT (`-normalize(gradient)`), which is the exact thing v2589 measured and negated because A DENSITY FIELD'S GRADIENT POINTS UPHILL AND UPHILL IS INTO THE BLOB. NOBODY IN THAT CONVERSATION MEASURED WHAT IT COSTS.

## Why

Keith: 'I would hate to think we would need to create an aquarium in the simulator that could allow the blobulator to breathe easier.' So: what does the aquarium cost?

## Measured

BAKE blobFieldAt into 64^3 (peak 4.260, mass 6379) and advect it RIGHT 30 STEPS THEN LEFT 30 STEPS -- IT ENDS EXACTLY WHERE IT STARTED, so every bit of loss is PURE NUMERICS, not motion. Round trips: 1 -> peak 3.208 (75.3% kept). 2 -> 2.682 (63.0%). 3 -> 2.376 (55.8%). 4 -> 2.153 (50.5%). THE BLOB LOSES HALF ITS PEAK IN FOUR SECONDS OF STANDING STILL. AND THE MASS COLUMN: 6379 -> 6364. IT IS CONSERVED. THE BLOB DOES NOT EVAPORATE -- IT DISSOLVES: it smears flatter and wider WHILE THE BOOKS STAY BALANCED, which is exactly why a mass-conservation check would have PASSED this and told you nothing. That is semi-Lagrangian advection's famous flaw (NUMERICAL DIFFUSION), it is the PRICE OF the unconditional stability that makes the method worth using, and THE PLAN NEVER MENTIONS IT. THE AQUARIUM DISSOLVES HIM IN FOUR SECONDS. THEN THE MOVE NOBODY IN THAT DOCUMENT CONSIDERED: blobPhantom.js:91 says a blob IS `{ x, y, z, r, a }` -- A POSITION, A RADIUS, AN AMPLITUDE. SEVEN OF THEM. THE BLOBS WERE ALWAYS THE BODIES. v2589 asked 'CAN THE BLOB BE THE SPACE?' and the answer was no -- the CONTRACT is 13 calls and every one is about a body. THAT WAS THE WRONG QUESTION. The right one is 'CAN THE BLOBS BE THE BODIES?' AND THEY ALREADY ARE: box3d moves seven centres, blobFieldAt re-evaluates, AND THE FORMULA TRAVELS WITH THEM. Same out-and-back trip: 100.0% of the peak kept, four trips out of four, max drift 1.2e-8. THE GRID LOST HALF ITS PEAK; SEVEN NUMBERS LOST NOTHING. Cost: 7 bodies against 262,144 voxels.

## Kill condition

Hide the loss in advectionLoss and 1 check fails. AND THE HONEST LIMIT, GATED SO IT CANNOT BE QUIETLY DROPPED: THIS DOES NOT MAKE THE BLOB A FLUID. Move the centres and the blob is a SOFT RIGID ARRANGEMENT OF LUMPS that merge and part -- IT DOES NOT SLOSH, it does not conserve momentum through the field, IT WILL NEVER SPLASH. IF YOU WANT A FLUID YOU WANT THE AQUARIUM AND YOU WANT TO PAY THE DIFFUSION: the plan Keith was given is the RIGHT plan for a fluid and the WRONG plan for this blob. Keith said 'it is not a liquid'. THIS IS THE READING THAT TAKES HIM AT HIS WORD, AND IT IS A CHOICE, NOT A FREE LUNCH.

# Citations

- Code: physics/blobBodies.js (blobsToBodies/bodiesToBlobs/advectionLoss) + physics/blobBodies-selfcheck.mjs (8 checks, gated, sabotage-tested). advectionLoss IS A FUNCTION, NOT A CLAIM IN A COMMENT -- anyone can run it and get their own number, because A MEASUREMENT YOU HAVE TO TAKE ON FAITH IS A CLAIM, INCLUDING MINE. AND MY OWN THRESHOLD WAS A GUESS AGAIN: I asserted the drift must be < 1e-12 and IT IS 1.2e-8. THAT IS NOT ERROR -- IT IS FLOAT32. readTransforms returns a Float32Array (the CONTRACT says so and v2589's conformance suite pins the 7-float stride), so the centres round-trip through SEVEN DECIMAL DIGITS. v2584 TAUGHT ME EXACTLY THIS ELEVEN VERSIONS AGO, when the heightmap gate called 94 of 96 vertices wrong for comparing a float32 buffer against float64 maths and the fix was Math.fround. I MADE THE SAME MISTAKE AGAIN AND MY OWN GATE CAUGHT IT AGAIN. The honest claim is not 'exact' but EXACT TO THE PRECISION OF THE INTERFACE IT TRAVELLED THROUGH -- a different and better sentence, and 1.2e-8 against 50% is still the whole argument. VERIFIED: isaac-mason/js-physics-benchmarks (MIT, 12 stars, 25 commits, JS+WASM physics benchmarks measuring bundle size and runtime; Isaac Mason is ALSO the react-three-rapier author Keith asked about two rounds ago -- SAME PERSON). His live page at isaac-mason.github.io is NOT REACHABLE FROM THIS SANDBOX (x-deny-reason: host_not_allowed), so KEITH'S REPORT THAT IT ONLY GOT HIM TO THE REPO IS THE DATA POINT: the README does advertise the Pages site and the repo has a .github/workflows directory, so THE DEPLOY IS THE SUSPECT -- NOT GUESSING FURTHER.
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
