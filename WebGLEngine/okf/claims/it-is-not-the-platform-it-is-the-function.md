---
type: claim
title: "It is not the platform, it is the function"
description: "Valeriu Palos (vpalos/Krbn) found Krbn's byte-identical SVG is byte-identical PER PLATFORM ONLY: 'the JS VM uses the system's underlying functions for Math.sin/log2/hypot and those"
tags: [open, "swek-engine", v2599]
timestamp: v2599
---

# It is not the platform, it is the function

- **Status:** open  
- **Since:** v2599

## Prediction

Valeriu Palos (vpalos/Krbn) found Krbn's byte-identical SVG is byte-identical PER PLATFORM ONLY: 'the JS VM uses the system's underlying functions for Math.sin/log2/hypot and those implementations sometimes vary by very small amounts... you ran your code on Linux => 347017 bytes; when I ran it on Linux I got the exact same result => same SHA; when I ran your code on a MacOS I got ~5 numbers very slightly off => 347019 bytes (different SHA).' HE IS RIGHT ABOUT THE FACT. THE DIAGNOSIS IS SHARPER THAN 'PLATFORM': IT IS THE FUNCTION. OPEN until Keith runs tools/mathProbe.mjs on Galaxina (Windows), Stellar Atlas (Intel macOS) and the M-series Mac (arm64) and diffs the three.

## Why

IEEE 754 EXACTLY SPECIFIES five operations -- + - * / and sqrt (plus fma). They MUST be CORRECTLY ROUNDED: not 'accurate to 1 ulp' but CORRECTLY ROUNDED, meaning there is exactly ONE right answer and every conforming implementation must produce it. It DOES NOT SPECIFY sin, cos, tan, log, log2, exp, pow, hypot, cbrt, atan2 -- it merely RECOMMENDS them, and every libm may differ in the last ulp. SO BYTE-EXACTNESS IS CROSS-PLATFORM FOR ANY PATH TOUCHING ONLY THE SPECIFIED FIVE, AND PER-PLATFORM THE MOMENT A TRANSCENDENTAL ENTERS IT. 'Per-platform only' IS NOT A LAW TO ACCEPT -- IT IS A CONSEQUENCE OF WHICH CALLS ARE IN THE HOT PATH.

## Measured

Measured here: 0.1+0.2 = 3fd3333333333334, 1/3 = 3fd5555555555555, sqrt(2) = 3ff6a09e667f3bcd -- AND THOSE ARE NOT OBSERVATIONS ABOUT THIS BOX, THEY ARE PREDICTIONS ABOUT EVERY BOX, which is why the gate asserts them as LITERAL BIT PATTERNS. THE SHARPEST ONE: Math.pow(2,0.5) = 3ff6a09e667f3bcd, IDENTICAL BITS TO Math.sqrt(2) -- ON THIS MACHINE, BY LUCK. SAME MATHEMATICS, DIFFERENT CONTRACT: sqrt is PROMISED everywhere, pow's last ulp is THIS LIBM'S OPINION. If a hot path says pow(x,0.5), swapping it for sqrt(x) COSTS NOTHING AND BUYS A GUARANTEE. AND THE POSE QUESTION, ANSWERED BY MEASUREMENT NOT BY VIBES: Keith asked whether 'wiring live Box3D transforms into a Krbn scene would need the engine to export a pose' means KRBN must export it. NO. Krbn is a FeatureSource pipeline -- you hand it primitives with transforms and it derives strokes; IT HAS NO PHYSICS AND NOTHING TO EXPORT A POSE FROM. box3d has the pose: readTransforms stride 7 returned [0.5, 0, -0.25, 0, 0, 0, 1] and |q| = 1.000000000 -- POSITION PLUS A UNIT QUATERNION. THAT IS ALREADY A POSE. Nothing needs inventing; it needs SERIALIZING. THE EXPORT IS OURS. KRBN ONLY EVER READS.

## Kill condition

Run node tools/mathProbe.mjs on all three machines and diff. THE LINES THAT DIFFER ARE THE FUNCTIONS THAT COST THE BYTES -- no guessing which five numbers moved. AND THE SPECIFIED BLOCK IS A CONTROL: if add/sub/mul/div/sqrt/fround EVER differ between two machines, the finding is NOT 'libm varies' -- it is that something is very wrong (a JIT bug, x87 80-bit intermediates, fast-math), AND THAT IS WORTH FAR MORE THAN A DRIFTING SINE. THE FIX HAS A NAME, WHICH MEANS IT IS A SOLVED PROBLEM: Java ships TWO math libraries, Math (fast, platform libm) and StrictMath (bit-reproducible everywhere, software fdlibm). StrictMath EXISTS FOR EXACTLY THIS REASON. If a transcendental must be in a deterministic path, SHIP YOUR OWN -- a polynomial you control is reproducible BY CONSTRUCTION, because DETERMINISM IS A PROPERTY OF YOUR CODE, NOT OF THE HOST'S.

# Citations

- Code: tools/mathProbe.mjs + tools/mathProbe-selfcheck.mjs (9 checks, gated, sabotage-tested: round the hash input so it cannot see one ulp -> 1 fails). THE SENSITIVITY IS THE REQUIREMENT: nudge ONE of 50 results by a single Number.EPSILON and the hash MUST move, because Valeriu's symptom was '~5 numbers VERY SLIGHTLY off' inside a 347,017-byte file -- A HASH THAT ONLY NOTICES BIG CHANGES WOULD HAVE MISSED HIS BUG ENTIRELY. AND THE HONEST LIMIT, GATED: I CANNOT HARD-CODE THE LIBM HASHES AND SAYING SO IS THE POINT. The specified block is asserted against literal bits BECAUSE THE SPEC ENTITLES ME TO; the libm block is not and MUST NOT BE -- I have ONE platform here and hard-coding sin's hash from it would TURN THIS MACHINE'S LIBM INTO THE DEFINITION OF CORRECT. It is not. It is one opinion of several, and collecting the others is the entire point. A CHECK THAT ASSUMES ITS OWN MACHINE IS THE REFERENCE IS NOT A CHECK, IT IS A MIRROR. VERIFIED: vpalos/Krbn -- MIT, 53 stars, 1 fork, 65 commits, TypeScript 99.7%, 'A web engine for pencil-style rendering of 3D scenes to SVG'; README states the claim he is now qualifying ('the same scene always emits the same, byte-identical, diffable SVG'). The #determinism-and-where-it-stops anchor did NOT resolve to a heading in my snapshot -- that section may be newer than my fetch, AND I AM NOT PRETENDING TO HAVE READ IT. NOT BUILT THIS ROUND ON PURPOSE: the Krbn scene emitter. I have not read API.md, and inventing his scene format from the shape of a README is EXACTLY the guessing this session keeps catching me at.
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
