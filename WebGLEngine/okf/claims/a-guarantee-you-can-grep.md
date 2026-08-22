---
type: claim
title: A guarantee you can grep
description: "Keith: 'Would any of our code assist Krbn?' HONEST ANSWER: most of it, no -- the tomography, the blob field, box3d are different problems. TWO things, and one is real. v2599's math"
tags: [settled, "swek-engine", v2603]
timestamp: v2603
---

# A guarantee you can grep

- **Status:** settled  
- **Since:** v2603

## Prediction

Keith: 'Would any of our code assist Krbn?' HONEST ANSWER: most of it, no -- the tomography, the blob field, box3d are different problems. TWO things, and one is real. v2599's mathProbe is already his, BUT IT ONLY NAMES THE PROBLEM. THIS IS THE FIX. OPEN until Valeriu tries it, or tells us his hot path never touches trig.

## Why

Valeriu Palos found Krbn's byte-identical SVG is byte-identical PER PLATFORM ONLY. v2599 sharpened the diagnosis -- IT IS NOT THE PLATFORM, IT IS THE FUNCTION: IEEE 754 specifies + - * / sqrt fma as CORRECTLY ROUNDED and merely RECOMMENDS sin/cos/log/exp/pow/hypot. The fix has a name: Java ships TWO math libraries, Math (platform libm) and StrictMath (bit-reproducible, software fdlibm). StrictMath EXISTS FOR EXACTLY THIS REASON. NOBODY SHIPS A SMALL JS ONE. So: tools/strictTrig.mjs.

## Measured

THE GUARANTEE IS STRUCTURAL, NOT EMPIRICAL, AND THAT DISTINCTION IS THE WHOLE POINT. An empirical guarantee ('it matched on my three machines') is A CLAIM ABOUT THE MACHINES YOU HAD. A structural one is A CLAIM ABOUT THE SPEC: a function built only from correctly-rounded operations IS IDENTICAL ON EVERY CONFORMING MACHINE BY CONSTRUCTION -- NOT BECAUSE IT WAS TESTED, BUT BECAUSE THERE IS NOTHING IN IT THAT IS ALLOWED TO DISAGREE. So the check that matters is not the accuracy one, IT IS THE GREP: the gate strips comments and searches the source for Math.sin/cos/tan/exp/log/pow/hypot/cbrt/atan and FAILS IF IT FINDS ANY. ACCURACY, MEASURED: worst |strictSin - Math.sin| on [0, pi/4] over 4001 samples = 1.110e-16 = 0.50 ULP -- AND libm ITSELF IS ONLY GUARANTEED TO ~1 ULP, SO THE DISAGREEMENT IS AS MUCH libm'S AS MINE. I AM NOT CLAIMING TO BE MORE CORRECT THAN THE PLATFORM; I AM CLAIMING TO BE THE SAME EVERYWHERE, WHICH IS A DIFFERENT PROPERTY AND THE ONE KRBN NEEDS. Across all four quadrants, both functions: 1e-15. And sin^2+cos^2 = 1 to under 1e-15 -- AN INTERNAL CHECK THAT ASKS libm NOTHING, because if I only ever compared against Math.sin I WOULD BE USING THE THING I AM REPLACING AS MY DEFINITION OF CORRECT. ARGUMENT REDUCTION IS WHERE IT DIES: naive single-constant vs Cody-Waite differ by 1.11e-16 at x=3.9, 3.92e-15 at 100.5, 7.99e-14 at 1000.25, AND 2.44e-12 AT 100000.125. THE GAP IS THE DRIFT AND IT GROWS WITH x. KRBN IS A RENDERER: IT ORBITS A CAMERA, AND ORBITS ACCUMULATE ANGLE -- EXACTLY WHERE TWO libms PART COMPANY AND EXACTLY WHERE '~5 NUMBERS VERY SLIGHTLY OFF' LIVES. ADJUDICATED v2626: Valeriu (Krbn maintainer) later CONFIRMED the per-platform drift is exactly the host Math.sin/log2/hypot, and v2626 completed the host-free set (strictHypot exact, strictLog2 < 1e-15) -- so the structural guarantee now covers every function he named. The prediction that our code assists Krbn is confirmed and concrete.

## Kill condition

Smuggle ONE Math.sin into the implementation -> 2 checks fail. Drop the Cody-Waite tail -> 2 fail. Let it guess past its verified range -> 1 fails. AND THE HONEST LIMIT, STATED NOT DISCOVERED: Cody-Waite with two constants degrades beyond |x| ~ 2^20. Full correctness needs PAYNE-HANEK, WHICH THIS DOES NOT IMPLEMENT. strictSin THROWS out there rather than returning a number it cannot stand behind -- A FUNCTION THAT GUESSES QUIETLY IS WORSE THAN ONE THAT REFUSES LOUDLY, and a bit-exact answer that is bit-exactly WRONG is the worst artifact this file could ship.

# Citations

- Code: tools/strictTrig.mjs (strictSin/strictCos/STRICT_TRIG_MAX) + tools/strictTrig-selfcheck.mjs (9 checks, gated, THREE sabotages). The grep STRIPS COMMENTS FIRST because this file's own prose discusses Math.sin at length -- v2594: A REGEX THAT GREPS PROSE WILL FIND PROSE, and stripping is not a workaround, IT IS THE DIFFERENCE BETWEEN GRADING THE CODE AND GRADING THE ESSAY. AND THE HONEST HISTORY, GATED SO IT CANNOT BE TIDIED AWAY: MY FIRST ATTEMPT WAS 91 ULP AND I CALLED IT 'MINIMAX' IN MY OWN COMMENT. The coefficients were 1/6, 1/120, 1/5040 -- THOSE ARE 1/3!, 1/5!, 1/7!. IT WAS TAYLOR. I NAMED IT SOMETHING IT WAS NOT, IN A COMMENT I HAD WRITTEN THIRTY SECONDS EARLIER. The polynomial was not wrong, IT WAS SHORT: Taylor's remainder at pi/4 for degree 13 is x^15/15! = 2.9e-14 and I measured 2.0e-14 -- THE MEASUREMENT AGREED WITH THE THEORY I HAD NOT BOTHERED TO CHECK. Two more terms put it at 6.5e-17. A REAL minimax (Remez) would reach this with FEWER terms; I DID NOT DO THAT AND I AM NOT CLAIMING I DID.
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
