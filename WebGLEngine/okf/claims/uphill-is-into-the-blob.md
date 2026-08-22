---
type: claim
title: Uphill is into the blob
description: "Keith: 'can blobulator be physics.js for the SweK simulator choice? blob would be the space, and the universe in the simulator.' ANSWERED OFF THE REAL CONTRACT, NOT OFF AN OPINION."
tags: [settled, "swek-engine", v2589]
timestamp: v2589
---

# Uphill is into the blob

- **Status:** settled  
- **Since:** v2589

## Prediction

Keith: 'can blobulator be physics.js for the SweK simulator choice? blob would be the space, and the universe in the simulator.' ANSWERED OFF THE REAL CONTRACT, NOT OFF AN OPINION.

## Why

physics/backendConformance.mjs already defines what a backend IS, so the question has a precise answer sitting in the tree: either the field satisfies the contract or it does not.

## Measured

NO -- AND THE REASON IS THE FINDING. The CONTRACT IS THIRTEEN CALLS: addShip, setVelocity, step, bodyCount, readTransforms, readVelocities, supportsJoints, jointSpherical, jointRevolute, jointWeld, impulse, addBox, dimensionality. EVERY ONE IS ABOUT A BODY. NOT ONE ASKS WHAT SHAPE THE UNIVERSE IS. So the blobulator cannot be a backend NOT BECAUSE IT IS TOO WEAK BUT BECAUSE IT IS A DIFFERENT CATEGORY: box3d and Jolt answer 'how do bodies move'; the blob answers 'where is there anything'. THE INTERFACE HAS A SLOT FOR THE SOLVER AND NO SLOT FOR THE SPACE. KEITH DID NOT ASK A PHYSICS QUESTION; HE FOUND A MISSING ABSTRACTION. (Also: the check guarding those thirteen is named 'answers all ten calls'. A NAME IS A CLAIM, and it has been wrong since the eleventh was added.) AND A FIELD *CAN* BE A SPACE: a ray in from x=3 crosses the surface at x=0.530 and the gradient there is a unit vector TO SIX DECIMALS -- usable as a collision normal with no normalisation pass. BUT THE RAW GRADIENT POINTS THE WRONG WAY: measured, stepping along +grad from the surface leaves you STILL INSIDE and -grad puts you OUTSIDE. A DENSITY FIELD'S GRADIENT POINTS UPHILL, AND UPHILL IS INTO THE BLOB -- it is the direction of MORE STUFF, and 'out' is the direction of LESS.

## Kill condition

Any point where outwardNormal steps INTO the solid. Sabotage-tested: un-negate the gradient and 2 checks fail. AND THE GATE ASSERTS THE DIRECTION, NOT THE LENGTH, because |n| IS 1.0 EVEN WHEN THE SIGN IS WRONG -- the inverted normal is EXACTLY as unit-length as the correct one, SO A GATE THAT CHECKED THE MAGNITUDE WOULD HAVE PASSED THE BUG. Same species as v2578's winding bug: GEOMETRICALLY PERFECT, SIGN INVERTED, and it would have read as 'the physics is just weird' for a week.

# Citations

- Code: physics/blobSpace.js + physics/blobSpace-selfcheck.mjs (12 checks, gated, sabotage-tested). WHAT IT IS FOR: a solver still moves the bodies; this tells it WHERE THE WORLD IS. Pair it with box3d and the blob becomes terrain -- box3d integrates, blobSpace answers 'did that step end inside the universe, and which way do I push back'. That is what 'blob as the space' means AND IT NEEDS NO CHANGES TO THE THIRTEEN CALLS. THE HONEST LIMIT, GATED SO IT CANNOT BE DROPPED: blobFieldAt returns a DENSITY, NOT A SIGNED DISTANCE. depth() tells you THAT you are inside and roughly how deep IN FIELD UNITS -- IT DOES NOT TELL YOU HOW MANY METRES TO MOVE. So pushOut WALKS OUT along the normal rather than solving for the surface: correct, but not free. A TRUE SDF WOULD GIVE THE DISTANCE DIRECTLY; A METABALL FIELD WILL NOT, AND PRETENDING OTHERWISE IS HOW TUNNELLING HAPPENS.
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
