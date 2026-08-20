---
type: claim
title: "The 4D ground-truth benchmark is folded into the cross-arch fingerprint -- it is bit-identical on every box in the fleet"
description: "The benchmark stops being merely deterministic and becomes part of the cross-architecture guarantee itself. An arithmetic-only version of the moving scene -- position a polynomial "
tags: [settled, "swek-engine", v2743]
timestamp: v2743
---

# The 4D ground-truth benchmark is folded into the cross-arch fingerprint -- it is bit-identical on every box in the fleet

- **Status:** settled  
- **Since:** v2743

## Prediction

The benchmark stops being merely deterministic and becomes part of the cross-architecture guarantee itself. An arithmetic-only version of the moving scene -- position a polynomial in time, no trig -- is projected through the pinhole camera using only add, subtract, multiply, divide and sqrt, every one correctly rounded under IEEE-754. So the emitted 3D tracks, 2D observations and depth are the same to the bit on x86, on ARM, on any box that runs the engine. The ground truth a 4D-estimation method would be graded against is now something the whole fleet agrees on exactly, not just something one machine happens to produce.

## Why

tools/groundtruth/traceField.js: makeSceneArith gives polynomial motion with no trig, and Math.hypot was replaced with an explicit sqrt everywhere it fed the truth, because hypot is not guaranteed bit-identical while a bare sqrt is. fingerprint.mjs hashes the tracks, observations and depth off that scene as the trace-truth subsystem, so it joins the same master the rest of the engine is checked by. The trig scene stays for the livelier on-screen version.

## Measured

The fold moved the master from 485fd849 to 2a1eb349 and took the fingerprint from 47 subsystems to 48. trace-truth computes the same 256-bit hash every run; the fingerprint self-check now covers it; BASELINE.md, the catalog and the ledger all carry it. A fleet fingerprint check that returns one matching master now certifies the benchmark along with everything else.

## Kill condition

tools/fingerprint/fingerprint-selfcheck.mjs and a fleet /fleet/fingerprint-check. If any box computes trace-truth differently -- a stray trig call, a hypot creeping back in -- its master diverges and the check names it. HONEST SCOPE: the fingerprinted scene is arithmetic-only; the trig display scene and the occlusion confidence are not in the hash, though the visibility test itself is sqrt-based and would be foldable too. The novel part is that a benchmark, not just a simulation, is now cross-arch certified.

# Citations

- Code: tools/groundtruth/traceField.js (makeSceneArith + the sqrt-for-hypot swap) + fingerprint.mjs (the trace-truth subsystem) + BASELINE/catalog/ledger + tools/groundtruth/to_output_pt.py (the Python bridge that turns the JSON export into a real Trace-Anything output.pt). A ground-truth benchmark that is itself part of the bit-identity proof.
- Page: `server.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
