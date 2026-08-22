---
type: claim
title: The turn is the keepsake
description: "v2590 shipped render/gifRecorder.js AND NOTHING IMPORTED IT. A MEASUREMENT WITH NO FRONT DOOR IS INVISIBLE (v2580's law) -- an encoder nobody can press is a library, not a keepsake"
tags: [open, "swek-engine", v2591]
timestamp: v2591
---

# The turn is the keepsake

- **Status:** open  
- **Since:** v2591

## Prediction

v2590 shipped render/gifRecorder.js AND NOTHING IMPORTED IT. A MEASUREMENT WITH NO FRONT DOOR IS INVISIBLE (v2580's law) -- an encoder nobody can press is a library, not a keepsake. This is the door: a button on blob-selfie.html that records the blob's x-ray TURNING. OPEN until Keith presses it on Galaxina and a GIF lands.

## Why

v2585's shutter takes a PNG, and A PNG OF AN X-RAY IS ONE ANGLE. THE WHOLE POINT OF A TOMOGRAPH IS THAT IT LOOKS AT YOU FROM EVERY ANGLE, so the turn is the one keepsake this page owed. AND NOT THE SINOGRAM: drawSino() already draws that, and it is THE DATA -- every angle at once, theta down the y-axis. This is THE MOVIE: one projection per frame, theta swept. SAME TRANSFORM, DIFFERENT QUESTION.

## Measured

THE PAGE'S EXACT EXPRESSION, RUN -- not a paraphrase (v2581's lesson: a page's own line is the only thing worth testing). 24 frames at 128x128: x-ray 88ms, encode 91ms, 40.3 KB, magic GIF89a, trailer 0x3b, 12.5fps. AND IT TURNS: 6476 of 65536 bytes differ between theta=0 and theta=pi/2, CHECKED BYTE BY BYTE, NOT SAMPLED -- v2590's version of that check STRIDED BY 97 AND FOUND 0 OF 96 WHILE 894 BYTES DIFFERED, because the stride aliased against the 192-byte row pitch. Under 200ms total, so the button will not feel broken and will not get pressed twice. WHY A GIF, MEASURED NOT PREFERRED: v2588 proved MediaRecorder's 'video/mp4' is a real MP4 container WITH VP9 INSIDE (avc1 absent, vp09 at byte 28) -- a TV opens it, cannot decode it, shows black, and isTypeSupported() said yes the whole way. A GIF NEEDS NOBODY. And v2590's happy accident: a GIF is 256 colours per frame, BRUTAL for the blob's smooth gradients and FREE for a greyscale x-ray, because a grey ramp fits a palette exactly. THE X-RAY IS THE ONE THING ON THIS PAGE THAT LOSES ALMOST NOTHING AS A GIF.

## Kill condition

Galaxina: press it and either a GIF lands and turns, or it does not. THE PER-FRAME NORMALISE IS THE ONE TO WATCH: the projection through a blob is THICKER at some angles than others, so a shared scale makes the whole image PULSE -- which reads as 'the encoder is broken' AND IS ACTUALLY PHYSICS. All 24 frames peak at 255 because each normalises to its own max.

# Citations

- Code: blob-selfie.html + simulation/tomo/blobXrayGif-selfcheck.mjs (14 checks, gated, TWO sabotages). AND THE SECOND SABOTAGE CAUGHT ME AGAIN: I killed the per-frame normalise IN THE PAGE and ZERO CHECKS FAILED, because the check was running MY COPY of the frame function -- I read the CONSTANTS off the page (so changing the page changes the test) AND THEN HELD MY OWN MATH ANYWAY. A CHECK THAT TESTS A COPY IS GRADING A COPY, which is v2583's gate re-implementing the DDA, one more time. It now needs BOTH HALVES: the SOURCE must contain the expression (a grep -- or the page is not doing it) AND the expression must be RIGHT (arithmetic -- or the page is doing something broken). Neither is sufficient, and both are necessary BECAUSE THE PAGE'S JS CANNOT RUN HERE: there is no server. Unwire the button -> 1 fails. Kill the page's normalise -> 1 fails. Also: the filename carries the SEED (v2585 -- THE SEED IS THE FRIEND, and a photograph you cannot get back to is a picture of a stranger), the note reports 12.5fps rather than the 60 nobody can have, and the object URL is revoked because a 40 KB blob per press never freed is a leak nobody notices until the tab is a gigabyte.
- Page: `/blob-selfie.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
