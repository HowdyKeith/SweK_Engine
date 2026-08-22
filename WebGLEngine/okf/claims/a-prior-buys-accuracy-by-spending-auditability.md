---
type: claim
title: A prior buys accuracy by spending auditability
description: "2+2+2=8 is wrong by 33%; 2x2x2=9 is wrong by 12.5% AND WORSE, because the first is auditable and the second smears its error through a compounding method. The tomographic version: "
tags: [open, "swek-engine", v2544]
timestamp: v2544
---

# A prior buys accuracy by spending auditability

- **Status:** open  
- **Since:** v2544

## Prediction

2+2+2=8 is wrong by 33%; 2x2x2=9 is wrong by 12.5% AND WORSE, because the first is auditable and the second smears its error through a compounding method. The tomographic version: a regularised reconstruction should show a LOWER RMS while its error casts a LARGER SHADOW -- i.e. it distorts data it was handed, in exchange for a prettier picture, and RMS cannot tell you which half of the error was avoidable.

## Why

v2543 gives the instrument: residualOf() asks whether an image casts a shadow at the measured angles. Ask it of the ERROR. An error that casts NO shadow means the method got everything the data actually said and is wrong only where nothing could have told it -- that error is the wedge, not a failure. An error that CASTS a shadow means the method was told and did not listen.

## Measured

NOT DEMONSTRATED, and the honest reason: in my setup the prior never earned its keep, so it never got to sell auditability for accuracy. 32x32, 45-degree wedge, 90 SIRT iterations. Clean data: no-prior RMS 0.1088 / shadow 2.45e-3; TV firm RMS 0.2265 / shadow 7.92e-3 -- WORSE ON BOTH. With 16% noise (the regime a prior exists for): no-prior RMS 0.1245 / shadow 3.69e-3; TV gentle RMS +7% / shadow +52%; TV firm RMS +37% / shadow +68%. TV NEVER LOWERED RMS HERE. What IS shown: THE METRIC DISCRIMINATES -- the prior raises the error's shadow by 68%, so it measurably distorts data it was handed. What is NOT shown: the TRADE. A demonstration needs a setup where TV actually wins on RMS -- bigger grid, more iterations, a phantom TV suits.

## Kill condition

Find any setup where a prior lowers RMS while ALSO lowering the error's shadow. That would be a prior buying accuracy for free, and this claim dies.

# Citations

- Code: simulation/tomo/honest-error.mjs. RIG-ONLY for the demonstration: this sandbox is one CPU, and 32x32 with 90 iterations may simply be too small for TV to help at all. The first metric I wrote was WRONG -- correlating |error| against the uncertainty map, which compares two different objects that share a shape; all three methods correlated ~0.01, which cannot be true if it measured what I claimed.
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
