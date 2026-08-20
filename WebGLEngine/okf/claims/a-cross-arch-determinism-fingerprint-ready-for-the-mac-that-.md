---
type: claim
title: "A cross-arch determinism fingerprint, ready for the Mac that is not here yet"
description: "The lockstep / co-op stack rests on two machines computing bit-identical box3d physics. That has only ever been tested x86-to-x86. THE REAL QUESTION IS x86 vs arm64 -- Galaxina vs "
tags: [open, "swek-engine", v2620]
timestamp: v2620
---

# A cross-arch determinism fingerprint, ready for the Mac that is not here yet

- **Status:** open  
- **Since:** v2620

## Prediction

The lockstep / co-op stack rests on two machines computing bit-identical box3d physics. That has only ever been tested x86-to-x86. THE REAL QUESTION IS x86 vs arm64 -- Galaxina vs the M-series Mac -- and it needs the Mac, which is not here. So I recorded what CAN be recorded now: a fixed seeded box3d scenario (8 boxes toppling onto a floor over 300 steps) and the sha256 of its entire transform stream on x86_64.

## Why

MEASURED: bit-identical across 3 separate processes on x86_64, reference 5c353d1b...940c. And box3d runs as WASM, whose floating point is STRICTLY specified -- IEEE-754, round-to-nearest, no implicit FMA -- precisely so a module gives the same bits on every CPU. The one escape hatch is NaN payloads, which WASM leaves nondeterministic; measured, this scenario has ZERO NaN or Inf across 18,900 floats, so that hole is shut. THE STRUCTURAL CASE FOR CROSS-ARCH DETERMINISM IS STRONG -- BUT STRONG IS NOT PROVEN, and only the Mac proves it. This claim stays OPEN until an arm64 machine runs it.

## Measured

The verdict is a single comparison: run physics/box3dFingerprint-selfcheck.mjs on the Mac -> MATCH means box3d is bit-identical across architectures and lockstep is cross-platform; DIVERGE means the co-op path needs a determinism shim before an arm64 peer can join. On a non-x64 machine the gate REPORTS the verdict rather than failing, because a diverge there is the finding, not a broken build.

## Kill condition

The gate also guards against SILENT physics drift on x86: change substeps 4->8 -> DIVERGE from the reference -> fail; inject a NaN -> fail. A CHANGE TO THE PHYSICS THAT DOES NOT UPDATE THE REFERENCE SILENTLY BREAKS EVERY PEER STILL RUNNING THE OLD BUILD -- the fingerprint turns that from a mystery desync into a failed gate. And the scenario must actually settle a stack (contacts, friction, toppling), because a fingerprint of bodies that never move is deterministic AND meaningless.

# Citations

- Code: physics/box3dFingerprint.js (canonical scenario, REFERENCE_X86_64, verdict) + physics/box3dFingerprint-selfcheck.mjs (4 checks, gated, 2 sabotages, 0.2s). THE INSTRUMENT IS BUILT; THE VERDICT WAITS ON THE MAC. When it is available: node physics/box3dFingerprint-selfcheck.mjs on arm64, and the one line it prints answers whether the whole co-op stack is cross-platform.
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
