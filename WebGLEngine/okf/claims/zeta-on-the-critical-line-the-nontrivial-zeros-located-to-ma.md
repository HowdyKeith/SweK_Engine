---
type: claim
title: "Zeta on the critical line -- the nontrivial zeros located to machine zero, bit-identical"
description: "On the critical line s = 1/2 + i t lives the famous unsolved question: are all the nontrivial zeros of zeta here, where the real part is one-half? This does not answer that and can"
tags: [settled, "swek-engine", v2700]
timestamp: v2700
---

# Zeta on the critical line -- the nontrivial zeros located to machine zero, bit-identical

- **Status:** settled  
- **Since:** v2700

## Prediction

On the critical line s = 1/2 + i t lives the famous unsolved question: are all the nontrivial zeros of zeta here, where the real part is one-half? This does not answer that and cannot -- but it builds the instrument to walk up the line and watch the zeros arrive, exactly and the same on every machine. The plain zeta sum diverges here, so it goes through the Dirichlet eta function, eta(s) = (1 - 2^(1-s)) zeta(s), whose alternating series converges and, accelerated, pins the zeros to machine precision. Every ingredient -- n^(i t) from a strict log, the trig from the strict core, the acceleration weights as integer powers -- is +,-,*,/, so the zeros come out bit-identical.

## Why

physics/zetaCritical.js and tools/strictLog.mjs. First a strict natural logarithm: split x = m 2^e from the IEEE bits, then ln(m) for m in [1,2) via the atanh series, in +,-,*,/ -- the piece the strict core lacked. Then eta(1/2+it) by Cohen-Villegas-Zagier acceleration of the alternating series (weights (3+sqrt8)^n by repeated multiplication), each term n^(-1/2)(cos(t ln n) - i sin(t ln n)) from strictLog and strictCos/strictSin; zeta = eta/(1 - 2^(1-s)) by complex division. refineZero minimises |zeta| by golden section.

## Measured

physics/zetaCritical-selfcheck.mjs, 5 checks. The first three nontrivial zeros are located at t = 14.134725, 21.022040, 25.010858 (matching the known values to 1e-4), each driving |zeta| to machine zero (1e-15); between zeros, at t = 17 and 18, |zeta| is order two, so the dips are specific; the strict log matches the true log to 1e-12; and it is deterministic and strict. Folded into the fingerprint as subsystem thirty-six; master e8e2b2b9...

## Kill condition

physics/zetaCritical-selfcheck.mjs. SABOTAGE: drop the exponent split in the strict log -- its range reduction -- and the logs go wrong for every n above two, the phases n^(i t) scatter, and the zeros dissolve: |zeta| at the first zero is no longer near zero. NOT a proof of the Riemann Hypothesis: this locates zeros and computes the function; it does not and cannot show all zeros lie on the line. That remains open.

# Citations

- Code: tools/strictLog.mjs (strict natural log: IEEE exponent split + atanh series) + physics/zetaCritical.js (etaCritical by CVZ acceleration, zetaCritical, zetaMag, refineZero) + physics/zetaCritical-selfcheck.mjs (5 checks, gated, sabotage-tested) + folded into tools/fingerprint (subsystem 36), tools/ledger, tools/catalog. An instrument for the critical line -- honest about what it does (locate) and does not (prove).
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
