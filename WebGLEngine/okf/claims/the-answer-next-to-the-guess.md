---
type: claim
title: The answer next to the guess
description: "v2592 built cutFace() AND NOTHING DREW IT -- exactly the bill v2591 paid for the GIF encoder ONE VERSION EARLIER. A MEASUREMENT WITH NO FRONT DOOR IS INVISIBLE. blob-selfie.html no"
tags: [settled, "swek-engine", v2593]
timestamp: v2593
---

# The answer next to the guess

- **Status:** settled  
- **Since:** v2593

## Prediction

v2592 built cutFace() AND NOTHING DREW IT -- exactly the bill v2591 paid for the GIF encoder ONE VERSION EARLIER. A MEASUREMENT WITH NO FRONT DOOR IS INVISIBLE. blob-selfie.html now draws the face beside the sinogram, with a depth slider and a tilt slider. OPEN until Keith drags it on Galaxina.

## Why

They are the two different things you can know about an inside, and the page now shows both. THE SINOGRAM: the beam integrates THROUGH the blob -- that is a SHADOW. THE REBUILD: filtered back-projection -- that is a GUESS at the inside, assembled from shadows. THE FACE: blobFieldAt evaluated ON the plane -- THAT IS THE INSIDE, EXACTLY. No integral, no guess. A REAL CT MACHINE CAN ONLY EVER HAVE THE FIRST TWO: it must INFER the inside because it cannot ask. We can ask, because we have the formula. THE FACE IS THE ONE IMAGE ON THIS PAGE THAT A HOSPITAL CANNOT TAKE -- and it sits beside the rebuild, so you are looking at THE ANSWER NEXT TO THE GUESS.

## Measured

SANDBOX-CONFIRMED v2651: driving the depth slider headless reproduces the predicted inside EXACTLY -- d=-0.2 -> 4.5% solid peak 3.19, d=0 -> 4.6% peak 3.82, d=+0.2 -> 4.0% peak 4.25 -- the deterministic CPU phantom gives the same bytes headless as on Galaxina. SLIDING THE PLANE THROUGH: d=-1.2 -> 0.0% solid, peak 0.00. d=-0.2 -> 4.5%, peak 3.19. d=0 -> 4.6%, peak 3.82. d=+0.2 -> 4.0%, PEAK 4.25. d=+1.2 -> 0.0%. THE BLOB HAS AN INSIDE AND IT CHANGES. AND THE FINDING I DID NOT PREDICT: THE WIDEST SLICE AND THE DENSEST SLICE ARE DIFFERENT PLANES. The fattest cross-section is at d=0 (4.6% solid, peak 3.82); the HARDEST CORE is at d=+0.2 (4.0% solid, peak 4.25). The blob is LUMPY -- seven Gaussians have no obligation to pile up where they are widest. A SHADOW CANNOT SHOW YOU THAT AND A RECONSTRUCTION WOULD ONLY GUESS AT IT. NOBODY HAD EVER LOOKED. 160x160 renders fast enough to drag, because every pixel is one blobFieldAt and they are all independent -- v2592 measured 38.6M cut tests/ms. THE SLIDER DOES NOT SWEEP A KNIFE THROUGH ANYTHING; IT CHANGES d IN n.p - d AND WE ASK AGAIN.

## Kill condition

Galaxina: drag the depth slider. Either the inside rises and falls, or it does not. THE TILT AT 0deg IS THE z-SLICE THE PHANTOM HAS SUPPORTED SINCE IT WAS WRITTEN AND NOBODY EVER USED -- 1250 of 9216 pixels differ between 0deg and 45deg, EVERY BYTE COMPARED, NOT SAMPLED.

# Citations

- Code: blob-selfie.html + simulation/tomo/blobFace-selfcheck.mjs (12 checks, gated, TWO sabotages: unwire the depth slider -> 1 fails; normalise the face -> 1 fails). OPPOSITE RULES ON ONE PAGE, AND THE REASON IS PHYSICS BOTH TIMES: v2591's GIF NORMALISES PER FRAME AND MUST, because the projection through a blob is thicker at some angles and a shared scale makes the turn PULSE. THE FACE IS THE OPPOSITE -- it is a MEASUREMENT, and the whole point is watching the density RISE AND FALL as you slide through, so A PER-FRAME NORMALISE HERE WOULD MAKE EVERY SLICE LOOK EQUALLY SOLID AND HIDE THE EXACT THING WE CAME TO SEE. THE NORMALISE IS NOT A STYLE CHOICE, IT IS A LIE ABOUT THE DENSITY -- so the gate GREPS THE PAGE for the fixed SCALE rather than holding its own copy (v2591: A CHECK THAT TESTS A COPY IS GRADING A COPY). AND MY OWN THRESHOLD WAS A GUESS AGAIN: I asserted the tilt must move >20% of pixels and IT FAILED AT 13.6%. The tilt was working perfectly; MY ASSERTION WAS A GUESS WEARING A SPEC'S CLOTHES -- same disease as v2592's 'LESS' label and v2586's big.tg < small.tc*8. It is 5% now: well clear of the zero a dead slider gives, well under the 13.6% measured, WITH REAL HEADROOM RATHER THAN A NUMBER THAT SOUNDS STRICT.
- Page: `/blob-selfie.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
