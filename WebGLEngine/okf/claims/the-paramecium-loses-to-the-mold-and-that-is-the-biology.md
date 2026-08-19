---
type: claim
title: "The paramecium loses to the mold, and that is the biology"
description: "A brain has no business driving a slime mold -- Physarum is three samples and a comparison, and putting a learner on it is CPU Dijkstra vs the GPU brain again (50x slower, 40 degre"
tags: [settled, "swek-engine", v2552]
timestamp: v2552
---

# The paramecium loses to the mold, and that is the biology

- **Status:** settled  
- **Since:** v2552

## Prediction

A brain has no business driving a slime mold -- Physarum is three samples and a comparison, and putting a learner on it is CPU Dijkstra vs the GPU brain again (50x slower, 40 degrees worse, v2137-v2170). But a paramecium's avoiding reaction IS run-and-tumble, and run-and-tumble IS a bandit: each heading is an arm, the reward is whether the taste improved. That is exactly what v2547 established this brain is. PREDICTION: released into the world with the mold as a control, the bandit loses to the reflex and beats random by orders of magnitude.

## Why

The mold SENSES THE FIELD AHEAD. The bandit only ever learns whether the LAST RUN improved things. That asymmetry is REAL BIOLOGY, not a rigged test: Physarum is a huge multinucleate cell that can read a gradient across its own body; a paramecium is far too small to see ahead and must compare NOW against A MOMENT AGO. RUN-AND-TUMBLE EXISTS BECAUSE OF THAT LIMIT. The bandit is not a worse algorithm -- it is the RIGHT algorithm for a cell that cannot see.

## Measured

MEASURED, 900 steps, 8 headings, a Gaussian food peak: mold reflex food 652.9 / best taste 1.000; UCB1 335.9 / 0.990; Thompson 279.3 / 0.934; eps-greedy(0.1) 86.6 / 0.406; random 0.2 / 0.001. THE MOLD WINS BY ~2x AND WALKS STRAIGHT ONTO THE PEAK. THE BANDIT BEATS RANDOM BY ~1,700x AND STILL REACHES 0.99 OF THE PEAK -- it gropes, but it arrives. A control you can only beat by being told less is not a control, it is a lap of honour; this one is told MORE and beats everything.

## Kill condition

Give the bandit the mold's spatial sensor and race again. If it still loses, the learner is worthless at this task and the finding is about the brain rather than the biology. Also dies if the GPU brain (on the rig, where Deno runs) beats the mold WITHOUT a spatial sensor -- that would mean temporal comparison alone can match gradient sensing, which would be a real discovery.

# Citations

- Code: simulation/life/paramecium.js + paramecium-selfcheck.mjs (10 checks, gated). HONEST AND LOAD-BEARING: THIS IS NOT BOX3D. box3d.wasm is not in the tree (v2546) and the toolchain is unreachable from the sandbox (v2549: storage.googleapis.com -> 403), so this swims in planarFallbackWorld. Both worlds answer the SAME TEN CALLS (addShip/setVelocity/step/bodyCount/readTransforms/readVelocities/supportsJoints/joint*), which is exactly what makes the substitution invisible -- so swim() carries `worldName` through to the result and the gate asserts it. The GPU brain itself is NOT marked yet: brain.js is Deno-only. The policy interface is v2547's, unchanged, so it plugs in on the rig with no adapter.
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
