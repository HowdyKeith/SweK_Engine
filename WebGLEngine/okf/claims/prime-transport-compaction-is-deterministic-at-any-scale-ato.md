---
type: claim
title: "Prime Transport compaction is deterministic at any scale, atomics and all"
description: "Prime Transport is a constrained beam-search layer for the GPU brain: prime candidates filtered by a wheel matrix against surviving tuplets, survivors seeding the next step. Its co"
tags: [settled, "swek-engine", v2652]
timestamp: v2652
---

# Prime Transport compaction is deterministic at any scale, atomics and all

- **Status:** settled  
- **Since:** v2652

## Prediction

Prime Transport is a constrained beam-search layer for the GPU brain: prime candidates filtered by a wheel matrix against surviving tuplets, survivors seeding the next step. Its compaction -- turning a sparse survival mask into a dense list -- is the natural place to reach for atomicAdd, and atomicAdd is poison for an engine whose premise is bit-identical output on every machine, because the slot a survivor lands in depends on thread scheduling.

## Why

brain/transport/. The compaction is three-pass stream compaction (flag -> exclusive scan -> scatter): every survivor lands at a slot that is a pure function of the flags, not of who ran first. brain/transport/primeTransport.js is the CPU reference twin (and the Node/WebGL2 fallback); shaders/ holds the GPU port -- the 3-pass shaders, a fused single-workgroup shader, a bit-packed wheel (1 bit/route, 96.9% smaller), and the two-level block scan (mb-scan-block, mb-scan-blocks, mb-scatter) that stays deterministic past 1024 candidates by giving each block a base from an exclusive scan over block counts, NOT an atomic claim.

## Measured

brain/transport/primeTransport-selfcheck.mjs, 9 checks, auto-discovered by the ship gate. The spine: the compacted output is BYTE-IDENTICAL under 200 permuted thread orders (warp-scheduling stand-in), while an atomicAdd version drifts under the same permutations -- so the test is not vacuous. It also proves the bit-packed wheel gives identical flags, and at 3000 candidates across 12 blocks the two-level scan equals the reference single scan byte-for-byte. A confidently-labelled 'deterministic!' per-workgroup atomicAdd was caught here: under permuted workgroup order its output moves while the per-block scan holds.

## Kill condition

brain/transport/primeTransport-selfcheck.mjs. SABOTAGE: swap the scatter to a running counter (atomic-style) -- the permutation test fails. A COMPACTION WHOSE ORDER DEPENDS ON THREAD SCHEDULING SHATTERS bit-identical reproducibility, the engine's whole premise. The GPU shaders are rig-only until Galaxina runs pipeline.js parityCheck against this twin.

# Citations

- Code: brain/transport/ (primeTransport.js twin, primeTransport-selfcheck.mjs [9 checks, gated, sabotage-tested, permutation-invariance], pipeline.js WebGPU orchestration + parity check, shaders/{filter,scan,scatter,filter-packed,fused-single-workgroup,mb-scan-block,mb-scan-blocks,mb-scatter}.wgsl). Two original bugs fixed (tuplet bounds, atomic non-determinism), two latent (output bounds, sqrt dimension), one wrong 'deterministic atomic' claim caught.
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
