---
type: claim
title: "A simulated interferometer recovers a surface we know exactly from its fringes, and grades the recovery against the truth"
description: "The first of the simulated-instrument benchmarks: phase-shifting interferometry on a metaball surface we define to the bit. The surface height is imprinted as optical phase, the fo"
tags: [settled, "swek-engine", v2752]
timestamp: v2752
---

# A simulated interferometer recovers a surface we know exactly from its fringes, and grades the recovery against the truth

- **Status:** settled  
- **Since:** v2752

## Prediction

The first of the simulated-instrument benchmarks: phase-shifting interferometry on a metaball surface we define to the bit. The surface height is imprinted as optical phase, the four-step fringe stack a real instrument would record is generated, and the height is recovered from the fringes alone -- the reconstruction never sees the true surface. It comes back to machine precision. And the phase wrapping is a real phenomenon, not decoration: a surface tall enough to wrap the phase several times is recovered correctly only when the fringes are unwrapped, and wrongly when they are not. The instrument is simulated, the optics is real, and the answer is checkable because we own the truth.

## Why

physics/optics/interferometer.js: metaballHeight defines the exact surface, phaseFromHeight imprints 4*pi*z/lambda, fourStep builds the interferograms, phaseShiftRecover inverts the stepped-reference model with atan2, unwrap2d removes the 2*pi ambiguity, and scoreRecovery grades RMS after removing the arbitrary piston. interferometer.html shows the surface, the fringes, the recovered height and the error, with an unwrap toggle that makes the wrapping banding appear and vanish.

## Measured

interferometer-selfcheck.mjs, 3 checks: the full pipeline recovers a multi-fringe surface with RMS about 1e-16; skipping unwrap leaves an error over a hundred times larger on a surface spanning several fringes, so unwrapping is load-bearing; and the four-step recovery inverts a known phase to about 1e-16 modulo 2 pi. This is the trace-truth pattern applied to optics.

## Kill condition

physics/optics/interferometer-selfcheck.mjs. SABOTAGE: swap the atan2 arguments in the four-step recovery -- the textbook way to get phase-shifting subtly wrong -- and the recovered surface stops matching, failing the checks. HONEST SCOPE: this is a metrology BENCHMARK GENERATOR, not a measurement of anything real -- we grade against a surface we defined, never a physical one. Phase-shifting uses atan2, so it is GATED, not folded into the fingerprint, as trig belongs. Unwrapping is the simple row-column kind, exact for smooth surfaces; a pathologically steep or noisy surface would need a quality-guided unwrapper.

# Citations

- Code: physics/optics/interferometer.js + physics/optics/interferometer-selfcheck.mjs + interferometer.html. SweK as the ground truth a surface-metrology algorithm is tested against -- the interferometry thread, done the honest way.
- Page: `interferometer.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
