---
type: claim
title: "Transform feedback + XPBD in one loop -- the whole cloth substep on the GPU, no CPU readback"
description: "The two rounds joined: a cloth substep run as a chain of GPU buffer passes -- a predict transform-feedback pass, a solve pass per color per iteration, a self-collision pass, a fina"
tags: [settled, "swek-engine", v2662]
timestamp: v2662
---

# Transform feedback + XPBD in one loop -- the whole cloth substep on the GPU, no CPU readback

- **Status:** settled  
- **Since:** v2662

## Prediction

The two rounds joined: a cloth substep run as a chain of GPU buffer passes -- a predict transform-feedback pass, a solve pass per color per iteration, a self-collision pass, a finalize transform-feedback pass -- ping-ponged frame to frame with the data never leaving the device. Determinism comes from both rounds at once: predict and finalize are per-vertex (double-buffer, order-free), the solve is per-color (graph coloring, order-free). The decomposition must change no physics.

## Why

physics/xpbd/clothLoop.js. predictPass integrates gravity into a prediction buffer, solveColorPass relaxes one color in place on it, finalizePass writes the new positions and velocities; the position buffer finalize writes is exactly the buffer predict reads next frame. clothFrame is byte-for-byte the v2661 clothSubstep -- same operations, named as passes. No buffer contents are read to steer control flow, so nothing is read back to the CPU. physics/xpbd/cloth-predict.vert and cloth-finalize.vert are the transform-feedback shaders; the solve reuses xpbd-distance.wgsl and cloth-collision.wgsl.

## Measured

physics/xpbd/clothLoop-selfcheck.mjs, 6 checks. Spine: the decomposed loop reproduces clothSubstep byte-for-byte over 40 frames -- the GPU decomposition changes no physics. Order-free: byte-identical under 200 shuffles of vertex order, within-color order, and collision-walk order together. Handoff: 40 frames straight equals 18 then 22 continued from the same buffers, so all state lives in the buffers (the ping-pong property). No readback: the frame equals a fixed, hand-spelled predict/solve/finalize pass sequence, its schedule set by structure not by inspecting positions. One free-fall frame matches the closed form to 1e-12; 120 frames stay finite and deterministic.

## Kill condition

physics/xpbd/clothLoop-selfcheck.mjs. SABOTAGE: make finalize write the prev buffer instead of the position buffer the next predict reads -- the frame handoff breaks, and both the equivalence and the split-frame checks fail. IF FINALIZE DOES NOT WRITE THE BUFFER PREDICT READS NEXT FRAME, THE PING-PONG STALLS AND THE LOOP IS NOT A LOOP. No new fingerprint subsystem: the loop equals cloth-collision by the equivalence check, so it is already covered. The GPU shaders are rig-only until Galaxina runs the full loop against the twin.

# Citations

- Code: physics/xpbd/clothLoop.js (predictPass/solveColorPass/finalizePass buffer passes + clothFrame + clothLoop ping-pong) + physics/xpbd/clothLoop-selfcheck.mjs (6 checks, gated, sabotage-tested, equivalence spine) + physics/xpbd/cloth-predict.vert + cloth-finalize.vert (transform-feedback shaders, rig-only). The whole cloth simulation as a closed GPU loop, both rounds fused.
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
