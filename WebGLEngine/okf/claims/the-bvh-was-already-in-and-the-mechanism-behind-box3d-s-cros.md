---
type: claim
title: "The BVH was already in, and the mechanism behind box3d's cross-arch determinism is now gated"
description: "Plan was to re-vendor Valeriu's new BVH Krbn for a ~2.8x hologram speedup. I MEASURED FIRST instead of copying: all 58 vendored krbn .js files are BYTE-IDENTICAL to a fresh build o"
tags: [settled, "swek-engine", v2622]
timestamp: v2622
---

# The BVH was already in, and the mechanism behind box3d's cross-arch determinism is now gated

- **Status:** settled  
- **Since:** v2622

## Prediction

Plan was to re-vendor Valeriu's new BVH Krbn for a ~2.8x hologram speedup. I MEASURED FIRST instead of copying: all 58 vendored krbn .js files are BYTE-IDENTICAL to a fresh build of his main (HEAD f650e99). The engine was ALREADY on the BVH -- a prior re-vendor brought it. The re-vendor would have been a no-op.

## Why

Confirmed the BVH is live on the render path, not just present: a mesh render through the vendored krbn drops from 181 to 7.8 microseconds PER TRIANGLE as the mesh grows 16x (352 -> 5632 tris), and total render time stays flat (~44-80ms) instead of the ~256x blow-up a quadratic would show. Sub-quadratic = BVH active. Standalone, his gallery went 63.9s -> 22.5s here (2.84x), matching his 3.5x. So the hologram already has the speedup; nothing to ship for item 1.

## Measured

So the round delivered item 2 instead: the gate behind box3d's cross-arch determinism. Valeriu showed WHY a kernel usually is NOT portable -- pure JS borrows the host libm (his Krbn: Linux 347017 vs macOS 347019 bytes). box3d escapes ONLY because it is clang-built WASM with its libm compiled in. MEASURED: box3d.wasm imports 4 functions, all WASI file stubs, ZERO math. That escape is a property of the BUILD -- a future rebuild that imports env.sin would still pass the fingerprint on x86 and break cross-platform lockstep silently.

## Kill condition

physics/wasmImports.js parses the import section; physics/box3dMathImports-selfcheck.mjs fails the instant a math function appears there. Proven both ways: a synthetic wasm importing env.sin is flagged (gate would fail); and the detector catches the sinf/powl float/long variants while NOT tripping on benign look-alikes (logic, cosine, tangent) -- a gate that cries wolf on logic gets switched off. THE FINGERPRINT SAYS BIT-IDENTICAL; THIS SAYS WHY, AND GUARDS THE WHY.

# Citations

- Code: physics/wasmImports.js (LEB128 import-section parser + math-name detector) + physics/box3dMathImports-selfcheck.mjs (4 checks, gated, synthetic-wasm sabotage). Item 1 (BVH re-vendor) was already done -- measuring saved the work. 161/161.
- Page: `/krbn.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
