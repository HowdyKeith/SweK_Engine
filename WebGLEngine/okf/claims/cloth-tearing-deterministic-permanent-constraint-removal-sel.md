---
type: claim
title: "Cloth tearing -- deterministic, permanent constraint removal (self-collision run backwards)"
description: "Self-collision ADDS constraints discovered from a snapshot; tearing REMOVES constraints whose strain, measured against a snapshot, exceeds a breaking threshold. The reference doc t"
tags: [settled, "swek-engine", v2664]
timestamp: v2664
---

# Cloth tearing -- deterministic, permanent constraint removal (self-collision run backwards)

- **Status:** settled  
- **Since:** v2664

## Prediction

Self-collision ADDS constraints discovered from a snapshot; tearing REMOVES constraints whose strain, measured against a snapshot, exceeds a breaking threshold. The reference doc tore during the solve, reading positions as they were being mutated, which makes the torn set depend on solve order. Done from a frozen snapshot it is a pure function of position; done permanently, a snapped thread does not heal.

## Why

physics/xpbd/tear.js. evaluateTears measures each constraint strain against the PREDICTED positions (pre-solve, where stress is highest), each constraint reading only its own two endpoints, and returns the torn indices in ascending order -- a pure function of the snapshot, independent of scan order. applyTears sets the active flag 1 -> 0 only, never back. tearSubstep predicts, tears, solves (skipping inactive constraints), finalizes. The fixed coloring is unchanged; torn constraints are simply skipped.

## Measured

physics/xpbd/tear-selfcheck.mjs, 6 checks. The torn set is identical across 40 shuffled scan orders. Under the same hard load a strain-1.08 threshold tears constraints and lands the cloth in a measurably different shape, while a strain-100 threshold tears none -- so the removed constraints really stop acting. The active count only ever falls and no torn constraint re-activates over 50 frames. Byte-identical under 200 within-color shuffles; a constraint at strain 1.2 tears below a 1.1 bar and holds above a 1.3 bar exactly. Folded into the fingerprint as subsystem eleven (cloth-tear); master af8c0323...

## Kill condition

physics/xpbd/tear-selfcheck.mjs. SABOTAGE: remove the guard that skips torn constraints in the solve -- a torn cloth then behaves exactly like an intact one and the behavioral check fails. IF THE SOLVE STILL ENFORCES A TORN CONSTRAINT, THE TEAR IS DECORATION. The GPU port marks torn constraints in the constraint buffer and the graph-colored solver skips them (rig-only).

# Citations

- Code: physics/xpbd/tear.js (evaluateTears snapshot strain, applyTears permanent 1->0, tearSubstep) + physics/xpbd/tear-selfcheck.mjs (6 checks, gated, sabotage-tested) + folded into tools/fingerprint (subsystem 11) and tools/ledger. Dynamic constraint removal, deterministic -- the mirror of self-collision.
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
