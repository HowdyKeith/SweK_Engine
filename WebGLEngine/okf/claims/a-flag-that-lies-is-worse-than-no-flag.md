---
type: claim
title: A flag that lies is worse than no flag
description: "Wire ?mesher=greedy into voxel-viewer.html so BOTH meshers are reachable and Keith can flip between them. OPEN until he loads the page twice -- once with the flag, once without -- "
tags: [open, "swek-engine", v2579]
timestamp: v2579
---

# A flag that lies is worse than no flag

- **Status:** open  
- **Since:** v2579

## Prediction

Wire ?mesher=greedy into voxel-viewer.html so BOTH meshers are reachable and Keith can flip between them. OPEN until he loads the page twice -- once with the flag, once without -- and looks. THE GEOMETRY IS PROVEN (v2578: winding by cross product, drop-in buffer contract, colour seams, palette index 0). WHETHER IT LOOKS RIGHT IS NOT A CLAIM I CAN MAKE.

## Why

v2578 built a drop-in that had never been dropped in. The way to stop waiting on a screenshot is not to wait harder -- IT IS TO MAKE THE SCREENSHOT POSSIBLE.

## Measured

READING THE PAGE SAVED IT TWICE. (1) voxel-viewer.html is a PLAIN <script>, NOT type='module', and has NO imports at all -- so `import { buildVoxelMeshGreedy }` cannot go in it. AND 'just make it type=module' WOULD BREAK THE PAGE: module scripts are DEFERRED AND MODULE-SCOPED, so every onclick in the markup would stop finding its callback -- IT WOULD BREAK IN A WAY THAT LOOKS LIKE NOTHING HAPPENING. The fix is a SEPARATE module tag that hangs the builder on window, read AT CALL TIME by a picker -- which works because :449 is inside a fetch .then(), long after defer resolves, AND THAT ORDERING WAS CHECKED RATHER THAN HOPED. (2) The call sites are indented 4 spaces and 8, and my first patch assumed 6 and 8 AND FAILED ON ITS OWN ASSERTION -- the same transcription-instead-of-reading that cost 48 of 58 quads one version ago, caught this time by an assert instead of a gate. WIRED: 2 call sites via pickMesher(), default UNCHANGED, 354 inline scripts parse, 0 syntax failures. SABOTAGE-TESTED: silently making greedy the default fails 2 checks.

## Kill condition

Keith loads ?mesher=greedy and the model renders wrong, or renders identically to the default (which would mean the flag never took effect). Both are visible in one screenshot each, and the flag WARNS ON THE CONSOLE rather than falling back silently -- because a silent fallback would render the OLD mesh while the URL said NEW, and two screenshots of the same mesher look identical FOR THE WRONG REASON.

# Citations

- Code: voxel-viewer.html (pickMesher + a separate module tag) + mesh/mesherFlag-selfcheck.mjs (11 checks, gated). A FLAG IS A PROMISE ABOUT WHICH CODE RAN, and all three ways it breaks are silent: THE DEFAULT MOVES (every old link and screenshot now means something else); THE FLAG LIES (renders old, reports new); THE PAGE BREAKS ON LOAD. The gate proves the wiring has the shape that makes those impossible -- BY READING THE PAGE'S TEXT, WHICH IS GRADING PROSE, and the check says so in its own message. THE REAL PROOF IS TWO SCREENSHOTS. This round exists to make them possible, NOT to replace them.
- Page: `/voxel-viewer.html?mesher=greedy`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
