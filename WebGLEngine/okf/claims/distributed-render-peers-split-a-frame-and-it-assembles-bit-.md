---
type: claim
title: "Distributed render -- peers split a frame, and it assembles bit-identical to a solo render"
description: "The lockstep story cashing out as distributed rendering. A deterministic frame split into horizontal bands and handed to that many peers, each rendering its band independently, sta"
tags: [settled, "swek-engine", v2717]
timestamp: v2717
---

# Distributed render -- peers split a frame, and it assembles bit-identical to a solo render

- **Status:** settled  
- **Since:** v2717

## Prediction

The lockstep story cashing out as distributed rendering. A deterministic frame split into horizontal bands and handed to that many peers, each rendering its band independently, stacks back into an image bit-for-bit identical to what a single machine would render alone -- for any number of slices, with no boundary data exchanged between peers. Determinism does the stitching; any peer can re-render another peer\'s slice and verify it, so a corrupted slice is caught rather than trusted.

## Why

tools/render/render.js. A small raytracer (a few spheres, Lambert shading) written in add/subtract/multiply/divide and square root only -- no trig, no fractional powers -- so the framebuffer is cross-architecture bit-identical, which is exactly what makes an x86 peer\'s band fit flush against an ARM peer\'s band. Fingerprinted as subsystem 44.

## Measured

tools/render/render-selfcheck.mjs, 6 checks. Rendering an 80x60 frame in 1, 2, 3, 7 or 13 slices and stacking the bands gives a checksum identical to the solo render every time; the same band rendered by two peers is bit-identical (verify-by-recompute); a single corrupted pixel changes the frame checksum (a bad slice is caught); the image is a genuine shaded scene, not a blank buffer. New master a9809815...

## Kill condition

tools/render/render-selfcheck.mjs. SABOTAGE: shade each slice in its own local coordinates instead of the frame\'s global ones -- the classic distributed-render bug -- and the assembled image stops matching the solo one, because every band is now drawing the top of the scene onto itself. That is the failure determinism-plus-verify exists to catch. HONEST SCOPE: the pixels-to-screen rasterisation is rig-side; what is proven here is that the split-and-assemble is exact and verifiable, which is the hard part of distributing a render.

# Citations

- Code: tools/render/render.js (deterministic raytracer + slice/assemble/verify harness) + tools/render/render-selfcheck.mjs (6 checks, sabotage-tested) + fingerprint subsystem 44 + a Physics Lab scene where a peer-count slider moves the seams while the picture stays pixel-identical. Split the work across machines, verify by recompute, get the same frame -- determinism turned into distributed capability.
- Page: `physics-lab.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
