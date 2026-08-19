---
type: claim
title: "The 27 open claims are not stalled -- they are a rig worklist"
description: "Twenty-seven claims sit open, and as a flat list they look stuck. They are not: each is falsifiable only on hardware the sandbox does not have -- Galaxina's GPU, the arm64 Mac, thr"
tags: [settled, "swek-engine", v2638]
timestamp: v2638
---

# The 27 open claims are not stalled -- they are a rig worklist

- **Status:** settled  
- **Since:** v2638

## Prediction

Twenty-seven claims sit open, and as a flat list they look stuck. They are not: each is falsifiable only on hardware the sandbox does not have -- Galaxina's GPU, the arm64 Mac, three machines for the math probe, or a browser. This turns them into a per-machine checklist so a batch can be knocked down in one sitting, and answers honestly what is left and where.

## Why

tools/rigWorklist.mjs reads predictions.html live, filters to open claims, and routes each into the machine that settles it by matching its kill condition: 6 on Galaxina GPU, 5 on the arm64 Mac, 1 across all three machines, 1 on box3d real WASM, 10 in a browser, 4 general rig. It NEVER marks anything settled -- only the rig does that; it just says where to point it. RIG_WORKLIST.md is the emitted checklist.

## Measured

The gate holds the worklist to the claims: every open claim appears exactly once, no settled or broken claim leaks in, every routed claim reaches a named machine with a concrete how, and the worklist open count equals the claims gate. The 10 browser-load items are the cheapest to clear -- load the page, confirm it draws and matches the gate.

## Kill condition

tools/rigWorklist-selfcheck.mjs. SABOTAGE: break the catch-all bucket so a claim matches nothing -- the unclassified check fails cleanly (the first version CRASHED instead, which the sabotage surfaced and I fixed). A DROPPED CLAIM IS A FALSIFIABLE CLAIM THAT NEVER GETS TESTED. The worklist cannot report a different open count than predictions.html.

# Citations

- Code: tools/rigWorklist.mjs (BUCKETS + buildWorklist + render) + tools/rigWorklist-selfcheck.mjs (4 checks, gated, sabotage-tested) + RIG_WORKLIST.md. Answers the standing question -- 27 open, here is exactly what to run where.
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
