---
type: claim
title: "Filtered back-projection reconstructs a known phantom from its sinogram, and the ramp filter is what makes it work"
description: "The third simulated-instrument benchmark, and it reuses the tomography theory already in the engine: a CT reconstruction. We define a phantom exactly, forward-project it into a sin"
tags: [settled, "swek-engine", v2754]
timestamp: v2754
---

# Filtered back-projection reconstructs a known phantom from its sinogram, and the ramp filter is what makes it work

- **Status:** settled  
- **Since:** v2754

## Prediction

The third simulated-instrument benchmark, and it reuses the tomography theory already in the engine: a CT reconstruction. We define a phantom exactly, forward-project it into a sinogram -- the line integrals a scanner records at every angle -- reconstruct it with filtered back-projection, and grade the reconstruction against the phantom we own. It recovers the phantom, it gets better as more projection angles are added the way real CT does, and the ramp filter is the thing that makes back-projection reconstruct rather than blur: filtered recovers the image, plain back-projection stays a smear no matter how many angles you feed it. The straight-ray model this rests on is believable only in the weak-scattering regime born.js bounds.

## Why

physics/tomography/ct.js: phantomField defines the truth, radon forward-projects, ramLakKernel and filterSino apply the ramp filter, backProject and filteredBackProjection reconstruct, scoreRecon grades by correlation and a scale-normalized RMS, and straightRayValidPhase returns the born.js validity bound sqrt(2*tol). Clean-room -- nothing from ASTRA or any tomography library. ct.html shows the phantom, the sinogram, and the reconstruction, with a ramp-filter toggle that smears the image when off and an angle control that sharpens it.

## Measured

ct-selfcheck.mjs, 3 checks: filtered back-projection correlates with the known phantom at about 0.98 over 120 angles; the correlation rises from about 0.94 at 30 angles to 0.99 at 180 while the error falls; and filtered beats plain back-projection by a wide margin while the straight-ray validity phase matches the born.js value exactly.

## Kill condition

physics/tomography/ct-selfcheck.mjs. SABOTAGE: turn the ramp filter into a no-op -- the exact difference between filtered and plain back-projection -- and the reconstruction collapses to the blur, failing the checks. HONEST SCOPE: BENCHMARK GENERATOR, graded against a phantom we defined, never a physical scan. Parallel-beam geometry, a spatial-domain Ram-Lak filter, nearest-detector back-projection -- fan-beam, an apodized filter, and interpolated back-projection are refinements. Back-projection uses cos and sin, so this is GATED, not fingerprinted.

# Citations

- Code: physics/tomography/ct.js + physics/tomography/ct-selfcheck.mjs + ct.html, tied to simulation/em/born.js for the straight-ray validity bound. The reconstruction inside a CT scanner, graded against a truth we own -- envelope item three.
- Page: `ct.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
