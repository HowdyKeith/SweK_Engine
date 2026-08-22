---
type: claim
title: "The host-free set now covers every function Valeriu named"
description: "v2603 gave a structural, grep-able cross-platform guarantee for sin and cos (strictTrig): computed by construction, calling no host transcendental, identical bits on every CPU. Val"
tags: [settled, "swek-engine", v2626]
timestamp: v2626
---

# The host-free set now covers every function Valeriu named

- **Status:** settled  
- **Since:** v2626

## Prediction

v2603 gave a structural, grep-able cross-platform guarantee for sin and cos (strictTrig): computed by construction, calling no host transcendental, identical bits on every CPU. Valeriu then confirmed Krbn's per-platform byte drift is exactly the host Math.sin/log2/hypot. strictTrig covered sin+cos; this completes the set with the two he named that were missing: hypot and log2.

## Why

The guarantee is STRUCTURAL, not empirical -- you grep the source and see there is no host Math.hypot or Math.log2 to drift, rather than trusting three machines to have agreed. strictHypot uses only sqrt (a correctly-rounded IEEE instruction, identical everywhere) + division in a fixed order. strictLog2 reads the IEEE-754 exponent bits (a fixed layout) and sums the atanh series for the mantissa. Nothing transcendental from the host libm.

## Measured

strictHypot matches Math.hypot to the BIT (0.00 relative error over 200k pairs) -- no accuracy traded for the guarantee. strictLog2 is within 7e-15 of Math.log2 across x in [e^-40, e^40] and exact on powers of two. In the vendored Krbn these cover hypot (38 calls) and log2 (3); with strictTrig's sin (54) and cos (52), swapping all four in makes a Krbn render byte-identical across platforms.

## Kill condition

tools/strictMath-selfcheck.mjs. THE GREP GUARANTEE: strip comments, then the code must contain NO Math.hypot/log2/log/exp/pow/sin/cos/atan -- only sqrt. SABOTAGES: smuggle a Math.hypot into strictHypot -> the grep check fails; truncate the log2 series to 3 terms -> the accuracy check fails. atan2 (7 Krbn uses) is named as the next target and deliberately NOT shipped coarse -- a coarse strict function is a guarantee that lies about its accuracy.

# Citations

- Code: tools/strictMath.mjs (strictHypot, strictLog2) + tools/strictMath-selfcheck.mjs (5 checks, gated, 2 sabotages). Completes v2603's structural guarantee across the full set Valeriu named. THE FIX FOR KRBN'S CROSS-PLATFORM DRIFT IS NOW A DROP-IN, NOT A PLEA TO THREE AGREEING MACHINES.
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
