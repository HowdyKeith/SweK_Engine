---
type: claim
title: "Transform feedback that holds -- GPU agent advection, order-free by double-buffering"
description: "Transform feedback is the WebGL2 way to advance thousands of agents per frame entirely on the GPU -- a vertex shader integrates each agent and writes the result straight into a buf"
tags: [settled, "swek-engine", v2660]
timestamp: v2660
---

# Transform feedback that holds -- GPU agent advection, order-free by double-buffering

- **Status:** settled  
- **Since:** v2660

## Prediction

Transform feedback is the WebGL2 way to advance thousands of agents per frame entirely on the GPU -- a vertex shader integrates each agent and writes the result straight into a buffer, no CPU readback. But the GPU runs the vertices in an undefined, parallel order, so the update must be a pure function of the PREVIOUS frame: read the source buffer, write a separate destination, swap (ping-pong). Write back into the buffer you are reading and you get an order-dependent read-after-write race.

## Why

brain/tf/tfStep.js. Each agent integrates under a swirl field plus a ring coupling to its neighbour, but every read is from the source buffer, so tfStep is a pure function of the previous frame and its result cannot depend on agent order. Semi-implicit Euler, only +,-,*,/ -- no trig -- so bit-identical across machines. brain/tf/tf-advect.vert is the transform-feedback vertex shader whose math mirrors the twin, reading the neighbour from the previous-frame position texture, never the buffer being written. This is the same lesson as XPBD graph coloring: independence is what makes a parallel GPU pass deterministic.

## Measured

brain/tf/tf-selfcheck.mjs, 6 checks. Spine: the step is BYTE-IDENTICAL under 200 shuffles of agent order, and it equals a frozen-snapshot gather -- proof every write reads only pre-step values. Contrast: the same integrator writing IN PLACE drifts under shuffling, the exact read-after-write race double-buffering removes. Exactness: one step lands at (0.995, 0.005, 0.003) matching hand arithmetic to 1e-12. 300 ping-pong frames stay finite and deterministic. Folded into the fingerprint as subsystem eight (tf-advect); master b871c5b1...

## Kill condition

brain/tf/tf-selfcheck.mjs. SABOTAGE: make the coupling read the DESTINATION buffer instead of the source -- the order-invariance and gather-equivalence checks both fail, because an agent then reads a neighbour that may or may not have been updated yet. A GPU PASS WHOSE RESULT DEPENDS ON VERTEX ORDER IS NOT REPRODUCIBLE. The GPU shader is rig-only until Galaxina runs it against the twin (f32 vs f64, so parity not bit-identity).

# Citations

- Code: brain/tf/tfStep.js (tfStep pure ping-pong step + tfStepInPlace hazard + tfRun frame loop) + brain/tf/tf-selfcheck.mjs (6 checks, gated, sabotage-tested, 200-shuffle spine, gather-equivalence) + brain/tf/tf-advect.vert (transform-feedback vertex shader, rig-only, neighbour from source texture) + folded into tools/fingerprint (subsystem 8) and tools/ledger. GPU agent positions frame-to-frame, no CPU readback, deterministic.
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
