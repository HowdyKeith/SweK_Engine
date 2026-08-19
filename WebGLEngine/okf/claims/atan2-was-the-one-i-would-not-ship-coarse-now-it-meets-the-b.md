---
type: claim
title: "atan2 was the one I would not ship coarse -- now it meets the bar"
description: "v2626 completed the host-free set for sin, cos, hypot, and log2, and named atan2 as the one function left out ON PURPOSE: a quick low-degree atan lands near 1e-4, and a coarse stri"
tags: [settled, "swek-engine", v2627]
timestamp: v2627
---

# atan2 was the one I would not ship coarse -- now it meets the bar

- **Status:** settled  
- **Since:** v2627

## Prediction

v2626 completed the host-free set for sin, cos, hypot, and log2, and named atan2 as the one function left out ON PURPOSE: a quick low-degree atan lands near 1e-4, and a coarse strict function is a guarantee that lies about its accuracy. This round does atan2 properly, so the structural cross-platform guarantee now covers EVERY transcendental the vendored Krbn calls (atan2: 7 uses).

## Why

The accuracy comes from argument reduction, not a longer polynomial. Fold |t|>1 through atan(t) = pi/2 - atan(1/t); then for t in [0,1] subtract the nearest atan(k/8) via atan(t) = atan(k/8) + atan(u), u = (t - k/8)/(1 + t*k/8), so |u| <= 1/16 and a 7-term odd series is exact to under 1e-16. The atan(k/8) values are COMPILE-TIME LITERALS derived offline -- the runtime calls no host atan, so the grep guarantee holds unchanged.

## Measured

strictAtan matches Math.atan to 2.2e-16 across the full input range; strictAtan2 matches Math.atan2 to 4.4e-16 with correct quadrant signs, over 200k random (y,x). No accuracy traded for the guarantee -- same machine-epsilon bar as strictHypot and strictLog2.

## Kill condition

tools/strictMath-selfcheck.mjs. SABOTAGES: drop the atan(k/8) offset from the reduction -> the atan2 accuracy check fails; smuggle a Math.atan into strictAtan -> the grep guarantee (no host transcendental after stripping comments) fails. The grep still allows only sqrt.

# Citations

- Code: tools/strictMath.mjs (strictAtan, strictAtan2 + ATAN8 literals) + tools/strictMath-selfcheck.mjs (6 checks, gated, sabotages for hypot/log2/atan2). THE HOST-FREE SET IS NOW COMPLETE: sin, cos, hypot, log2, atan2 -- every transcendental Krbn drifts on, all grep-able. Nothing left to leave for later.
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
