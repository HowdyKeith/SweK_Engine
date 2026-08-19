---
type: claim
title: "The gift is now a package Valeriu can unzip, not a claim he has to trust"
description: "The host-free set (sin, cos, hypot, log2, atan2) was complete but lived inside the engine. To be a gift to Krbn it has to be a DELIVERABLE -- a standalone drop-in he can unzip, tes"
tags: [settled, "swek-engine", v2628]
timestamp: v2628
---

# The gift is now a package Valeriu can unzip, not a claim he has to trust

- **Status:** settled  
- **Since:** v2628

## Prediction

The host-free set (sin, cos, hypot, log2, atan2) was complete but lived inside the engine. To be a gift to Krbn it has to be a DELIVERABLE -- a standalone drop-in he can unzip, test, and import without knowing anything about SweK. So this packages it: strict-libm, MIT, with an index, a README, a demo that mirrors his exact Linux-vs-macOS byte difference, and its own test.

## Why

The package is EMITTED from the engine, not hand-copied. tools/emitStrictLibm.mjs copies the live gated tools/strictTrig.mjs + tools/strictMath.mjs into the package src/, then adds the static wrapper. IF I MOVED A FILE I MOVED ITS ASSUMPTIONS: a static duplicate would ship stale math the first time a coefficient was fixed here and not there. Copy-on-emit means the deliverable carries exactly the math the engine's gate proved.

## Measured

The package: index.mjs (re-exports all five), demo.mjs (a 100k-point render fingerprint hashed with host Math vs strict -- both stable here, but the strict hash is a function of the code not the OS libm, so it holds on the next machine), test.mjs (grep guarantee + accuracy + determinism), README, LICENSE, package.json. Its own test is green: no host transcendental, every function at machine epsilon, fingerprint reproducible.

## Kill condition

tools/strictLibm-package-selfcheck.mjs emits the package and (1) checks src/ is BYTE-IDENTICAL to the engine's gated source, (2) runs the package's own node test.mjs and requires it green, (3) checks the wrapper is complete. SABOTAGE: smuggle a Math.hypot into the engine's strictMath.mjs -> the assembled package's test catches it -> this gate fails. The chain from gated source to shipped deliverable is unbroken.

# Citations

- Code: tools/emitStrictLibm.mjs + tools/strict-libm-pkg/ (static wrapper) + tools/strictLibm-package-selfcheck.mjs (3 checks, gated, 1 sabotage) + strict-libm.zip. THE STRUCTURAL GUARANTEE IS NOW SOMETHING HE CAN HOLD IN HIS HAND.
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
