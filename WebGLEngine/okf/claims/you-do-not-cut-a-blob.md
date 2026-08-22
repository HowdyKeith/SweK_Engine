---
type: claim
title: You do not cut a blob
description: "Keith: 'I do not want a pretty simulator that can draw a French guillotine and make a noise. But if we wanted to freeze a slice and cut that slice, we do not need to see a cutting "
tags: [settled, "swek-engine", v2592]
timestamp: v2592
---

# You do not cut a blob

- **Status:** settled  
- **Since:** v2592

## Prediction

Keith: 'I do not want a pretty simulator that can draw a French guillotine and make a noise. But if we wanted to freeze a slice and cut that slice, we do not need to see a cutting animation, WE NEED A FORMULA TO DROP THROUGH, ALL POINTS AT ONCE. How do we cut a blob? It is not a liquid. But we do want to see what we can see.'

## Why

THE QUESTION CONTAINED ITS OWN ANSWER. A cut is a plane: side(p) = n.p - d, and THE SIGN IS THE ANSWER. Every point evaluates independently -- no sweep, no order, no neighbours, no state. A GUILLOTINE COMING DOWN IS A STORY ABOUT A CUT; THE SIGN OF A DOT PRODUCT *IS* THE CUT.

## Measured

YOU DO NOT CUT A BLOB. THE BLOB DOES NOT CHANGE -- YOU STOP ASKING ABOUT HALF OF IT. Measured: every sampled point on the kept side is BYTE-IDENTICAL to the uncut field, and the far side simply returns 0 while the real field still holds its density. NOTHING IS DESTROYED; THE QUESTION CHANGES. That is why it is free and why you can cut it a thousand ways at once WITHOUT A SINGLE COPY -- a second cut costs a second dot product, not a second blob. AND IT IS ALL POINTS AT ONCE: 200,000 cut tests in 5.2ms = 38.6M points/ms. THERE IS NOTHING TO ANIMATE BECAUSE A CUT HAS NO ORDER. AND WHAT WE CAME TO SEE -- THE FACE: the field evaluated ON the plane, 96x96 in 13ms, max density 3.543. The x-ray (blobRadonAt) integrates *THROUGH* and gives you SHADOWS; blobSinogram RECONSTRUCTS a guess at the inside. THE FACE IS THE INSIDE, AT THAT PLANE, EXACTLY -- not a shadow of it, not a reconstruction of it. NOBODY HAD EVER LOOKED AT IT.

## Kill condition

A point on the kept side whose cut value differs from the uncut field. Sabotage-tested: flip the kept side and 2 checks fail. ALSO GATED: plane() NORMALISES (an unnormalised plane gives the RIGHT SIGN and a MEANINGLESS DISTANCE -- the kind of half-right that survives every test you would think to write, because everyone tests the sign) and REFUSES a zero normal (which would give NaN normals, making every side() test silently false -- A CUT THAT KEEPS EVERYTHING, WHICH LOOKS EXACTLY LIKE NO CUT AT ALL).

# Citations

- Code: simulation/tomo/blobCut.js + simulation/tomo/blobCut-selfcheck.mjs (13 checks, gated, sabotage-tested). WHAT WAS ALREADY HERE, SIXTH TIME LOOKING FIRST CHANGED THE JOB: render/clipPlane.js -- 'v1 PORTAL CLIP PLANE SYSTEM', 35 lines, holds a normal and a d and has toVec4() for a shader uniform. IT HOLDS A PLANE AND CANNOT EVALUATE ONE, AND IT HAS ZERO IMPORTERS: A CUTTER THAT HAS NEVER CUT, waiting on a shader nobody wrote. AND blobRadonAt(s, theta, z) AND blobSinogram({z}) HAVE ALWAYS TAKEN A z -- THE AXIS-ALIGNED SLICE WAS FREE SINCE THE PHANTOM WAS WRITTEN and nobody ever passed anything but 0. Only the TILTED plane needed a basis. MY OWN TESTS FAILED TWICE, THE SAME WAY BOTH TIMES -- I ASSERTED GEOMETRY INSTEAD OF MEASURING IT. (1) I printed 'cut by the plane: 2.010358 <- LESS' NEXT TO A NUMBER IDENTICAL TO THE UNCUT ONE: the beam direction is (-sin, cos, 0) = (-0.644, 0.765, 0) and my plane normal was (0.6, 0.5, 0.62), whose dot is -0.386 + 0.383 = -0.003 -- I HAD PICKED A RAY ALMOST EXACTLY PARALLEL TO THE CUT PLANE, so it never crossed, the cut correctly removed nothing, AND I HAD WRITTEN THE CONCLUSION INTO THE LABEL BEFORE READING THE MEASUREMENT. A RAY PARALLEL TO THE PLANE IS ENTIRELY KEPT OR ENTIRELY GONE and it is gated now, because it is the case that makes a working cut look broken. (2) I asserted blobFieldAt(0.9,0,0) > 0; IT IS 0.0000 -- the field runs 2.3268 at x=0.3, 0.1631 at x=0.7, NOTHING by x=0.9. THE BLOB WAS NOT THERE. The check now SEARCHES for real density beyond the plane instead of guessing where my own blob is. ON THE POOL OF X-RAYS: an x-ray is not a medium, IT IS A MEASUREMENT -- you cannot swim in a measurement, and a pool of them is a scanner with the blob inside it, WHICH IS EXACTLY WHAT A CT MACHINE IS. So the honest pool is box3d moving the blob while the beam asks its question every frame. NO AQUARIUM, NO FIELD GENERATED FOR ITS CONVENIENCE: Keith said he would hate to need either and he does not -- v2589's blobSpace already lets the blob BE the space, and box3d already integrates.
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
