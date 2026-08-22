---
type: claim
title: The worst format and the best answer
description: "Keith: 'mechanical easy things, like does a GIF encoder that we might need exist? If the easy answer is yes, let us do that.' THE EASY ANSWER WAS YES."
tags: [settled, "swek-engine", v2590]
timestamp: v2590
---

# The worst format and the best answer

- **Status:** settled  
- **Since:** v2590

## Prediction

Keith: 'mechanical easy things, like does a GIF encoder that we might need exist? If the easy answer is yes, let us do that.' THE EASY ANSWER WAS YES.

## Why

v2588 measured the video road honestly AND IT DEAD-ENDS: MediaRecorder's 'video/mp4' is a real MP4 container WITH VP9 INSIDE IT (avc1 absent, vp09 at byte 28) -- a file a Roku opens, fails to decode, and shows black, while isTypeSupported() said yes the whole way. H.264 needs ffmpeg on Galaxina. A GIF NEEDS NOBODY: every browser, every chat window, every phone, every TV photo viewer, no codec negotiation, no transcode. IT IS THE WORST FORMAT AND THE BEST ANSWER.

## Measured

gifenc 1.0.3, MIT, Matt DesLauriers, git://github.com/mattdesl/gifenc.git -- 12K, ZERO DEPENDENCIES, on the allowlisted npm registry. AND NOT TRUSTED BECAUSE npm SAID MIT: RUN IN THE SANDBOX BEFORE A LINE WAS WRITTEN -- 8 frames of 64x64 -> 1364 bytes, magic 'GIF89a', trailer 0x3b. A REAL GIF. Then the actual thing: THE BLOB'S X-RAY, ROTATING -- 12 frames of REAL blobRadonAt (the actual Radon transform, which v2586 proved agrees with a numerical march to 0.0000%) at 96x96 -> 11948 bytes with a shared palette, 12292 per-frame. WHAT IT COSTS, GATED SO IT CANNOT BE DROPPED: A GIF IS 256 COLOURS PER FRAME, MAXIMUM -- that is not a bug to work around, IT IS THE FORMAT. The blob's smooth gradients are the WORST case for a 256-entry palette (banding); THE X-RAY'S GREYSCALE IS THE BEST CASE, because a grey ramp fits exactly. SO THE X-RAY SELFIE IS THE ONE THING IN THIS ENGINE THAT LOSES ALMOST NOTHING AS A GIF -- a happy accident worth saying out loud rather than discovering. AND A GIF CANNOT DO 60FPS: delay is stored in HUNDREDTHS OF A SECOND, so 16ms rounds to 20ms = 50fps, and realGifFps() REPORTS THAT rather than silently giving you 50 when you asked for 60. Worse, delay <= 1 unit is FLOORED TO 10 UNITS by browsers for historical reasons -- ask for 10ms, get 100ms, A TEN-TIMES ERROR THAT NOTHING WARNS YOU ABOUT.

## Kill condition

A GIF whose first six bytes are not GIF89a/GIF87a, or whose trailer is not 0x3b -- A TRUNCATED GIF STILL STARTS WITH GIF89a, so the magic alone is not validation.

# Citations

- Code: render/gifRecorder.js + vendor/gifenc/ (with LICENSE and PROVENANCE.txt -- A VENDORED FILE WITH NO RECEIPT IS A MYSTERY IN SIX MONTHS) + render/gifRecorder-selfcheck.mjs (11 checks, gated, sabotage-tested). TWO OF MY OWN CHECKS WERE BROKEN AND BOTH ARE THE SAME DISEASE. (1) 'the frames are not all identical' STRIDED BY 97 TO SAVE TIME and reported 0 OF 96 SAMPLES DIFFERENT -- THE IMAGES DIFFER IN 894 BYTES OF 9216. The stride ALIASED AGAINST THE 192-BYTE ROW PITCH and walked a lattice that missed every changed pixel. blobRadonAt goes 1.3248 -> 1.9234 -> 1.4962 -> 0.2159 across theta: IT WAS ROTATING THE WHOLE TIME. THE CODE WAS RIGHT AND THE INSTRUMENT WAS WRONG -- exactly v2587's counting oracle and v2583's dense sampler with a hole in it. It is 9216 bytes; THE SAVING WAS IMAGINARY AND THE COST WAS A FALSE PASS. (2) 'it refuses a wrong-sized frame' was `try { ... } catch { return true }` -- I DELETED MY SIZE GUARD TO PROVE THE CHECK WORKED AND ZERO CHECKS FAILED, because GIFENC THROWS ON A MALFORMED BUFFER ALL BY ITSELF. THE CHECK WAS GRADING GIFENC'S ERROR AND CALLING IT MINE. It asserts the message now -- which can only come from my line -- and deleting the guard fails 1. A CHECK THAT PASSES WITHOUT THE CODE IT TESTS IS GRADING SOMEBODY ELSE'S WORK.
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
