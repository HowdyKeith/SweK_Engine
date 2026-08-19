---
type: claim
title: "Riemann zeta -- the pi-zeta bridge computed to the bit, Basel and beyond"
description: "The Riemann zeta function is the sum of one over n-to-the-s over all whole numbers, and its most famous fact is Euler\\'s: zeta(2), the sum of one over the squares, is exactly pi-sq"
tags: [settled, "swek-engine", v2699]
timestamp: v2699
---

# Riemann zeta -- the pi-zeta bridge computed to the bit, Basel and beyond

- **Status:** settled  
- **Since:** v2699

## Prediction

The Riemann zeta function is the sum of one over n-to-the-s over all whole numbers, and its most famous fact is Euler\'s: zeta(2), the sum of one over the squares, is exactly pi-squared over six -- pi produced by a sum with no circle in it. Computing that to machine precision the naive way would take forever, but Euler-Maclaurin summation reaches full precision from a few dozen terms plus a Bernoulli tail, in +,-,*,/ alone, so pi comes back bit-identical on every machine. (This is the real-argument bridge; the nontrivial zeros on the critical line need zeta at complex s and a strict logarithm, which is the next module.)

## Why

physics/zeta.js. zeta(s) for integer s by Euler-Maclaurin: direct terms to M-1, an endpoint, the integral tail, and five Bernoulli corrections, all as integer powers by repeated multiplication -- no Math.pow, no logs. piFromZeta returns sqrt(6 zeta(2)). The even closed forms zeta(2n) = c*pi^(2n) are carried as their rational coefficients.

## Measured

physics/zeta-selfcheck.mjs, 5 checks. zeta(2) matches pi^2/6 to 2e-15; pi = sqrt(6 zeta(2)) to 2e-15; zeta(4), zeta(6), zeta(8) match their pi^(2n) closed forms to 1e-12; and zeta(3) lands on Apery\'s constant 1.2020569... to twelve digits -- which matters because zeta(3) has NO closed form, so hitting it proves the routine genuinely sums the series rather than reciting pi identities. Deterministic, no transcendental. Folded into the fingerprint as subsystem thirty-five; master 205435ca...

## Kill condition

physics/zeta-selfcheck.mjs. SABOTAGE: drop the Euler-Maclaurin integral term that stands in for the infinite tail, and every value falls short of its target -- a few dozen terms without the tail is not the zeta function. The tail is not a refinement; it is most of the answer.

# Citations

- Code: physics/zeta.js (zeta by Euler-Maclaurin, piFromZeta, evenZetaCoefficient) + physics/zeta-selfcheck.mjs (5 checks, gated, sabotage-tested) + folded into tools/fingerprint (subsystem 35), tools/ledger, tools/catalog. The pi-zeta bridge, bit-identical; the critical-line zeros are next, on a strict logarithm.
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
