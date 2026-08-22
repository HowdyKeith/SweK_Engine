---
type: claim
title: "The SPH flesh will agree bit-for-bit across arm64 and x86_64"
description: "fleshSph-selfcheck asserts 'same ticks -> bit-identical body' and has only ever verified it ON ONE MACHINE. An arm64 Mac joins the fleet with v2545 on it; every other box is x86_64"
tags: [open, "swek-engine", v2546]
timestamp: v2546
---

# The SPH flesh will agree bit-for-bit across arm64 and x86_64

- **Status:** open  
- **Since:** v2546

## Prediction

fleshSph-selfcheck asserts 'same ticks -> bit-identical body' and has only ever verified it ON ONE MACHINE. An arm64 Mac joins the fleet with v2545 on it; every other box is x86_64. IEEE 754 pins +,-,*,/ and sqrt exactly and pins NOTHING about pow/sin/cos/cbrt -- ECMAScript calls Math.pow 'implementation-approximated'. The kernels used Math.pow(h,9) and Math.pow(h,6); they now use exact multiplication. PREDICTION: 400 ticks of the same seeded flesh on both machines now hash identically.

## Why

MEASURED ON x86_64: Math.pow(h,9) and h*h*h*h*h*h*h*h*h DISAGREE -- worst 6.09e-16, ~3 ulps, at h=0.1/0.35/0.3762/0.4739 (they agree only at 1 and 2.5, where the exponent lands on exact binary values). IF TWO SPELLINGS OF h^9 DISAGREE ON ONE MACHINE, the one that is not IEEE-pinned is the one to drop. And this is 2+2+2 vs 2x2x2: Math.pow may be MORE accurate (correctly rounded in one step, where nine multiplications round nine times) -- but it is implementation-approximated and multiplication is exact. A slightly less accurate number two machines CANNOT disagree about beats a slightly better one they might.

## Kill condition

Run the same seeded flesh 400 ticks on Stellar Atlas (Intel) and on the M-series Mac (arm64) and diff the state hash. If they differ, this dies -- and the first suspect is fleshSph's Math.cbrt, which is NOT fixed.

# Citations

- Code: RIG-ONLY, AND IT IS RUNNABLE TOMORROW -- the arm64 box exists now. HONEST GAP: fleshSph derives spacing with Math.cbrt (ONE call, at setup) and cbrt has no exact spelling. It sets h AND mass, so a 1-ulp difference there changes every number downstream. It is gated as a KNOWN exception (portableMath-selfcheck) rather than pretended away. ALSO: box3d.wasm is NOT in the tree, so the box3d cross-arch test cannot run yet -- and box3dLoader's fallback answers the same questions, so that test would silently measure the JS fallback on both machines and prove nothing.
- Page: `/flesh.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
