---
type: claim
title: "Physics Lab workbench -- save your own scenes to a shelf, on one gated encoding"
description: "Curated presets hand a user a foundation; a workbench lets them keep their own. Someone who dials in a scene they like -- a particular temperature, a camera angle, the skin on -- s"
tags: [settled, "swek-engine", v2691]
timestamp: v2691
---

# Physics Lab workbench -- save your own scenes to a shelf, on one gated encoding

- **Status:** settled  
- **Since:** v2691

## Prediction

Curated presets hand a user a foundation; a workbench lets them keep their own. Someone who dials in a scene they like -- a particular temperature, a camera angle, the skin on -- should be able to name it and pin it to a shelf that survives the next visit, and it should restore through the same path as everything else rather than a parallel one that can drift.

## Why

physics/presetCodec.js is one encoding for all three uses -- the URL link, the built-in presets, and the user shelf: a scene state goes to and from a compact string, so a shared link and a pinned preset are the same kind of thing. The Lab saves named presets to the browser and lists them under Your presets beside the starters; save, delete, and select all run the codec and the one applyPreset path. Storage failures degrade to a session-only shelf rather than an error.

## Measured

physics/presetCodec-selfcheck.mjs, 4 checks. Every scene state round-trips through the encoding unchanged -- scene, slider values, camera, skin; slider values decode as numbers, not strings; a string that names no scene is rejected as null rather than half-applied; and the encoding is deterministic. The shelf UI and its localStorage are rig-only glue over that gated codec.

## Kill condition

physics/presetCodec-selfcheck.mjs. SABOTAGE: drop the scene from the encoding and the round-trip fails, because a preset that names no scene is not a preset. The encoding is proven lossless every ship, so a scene a user pins comes back exactly, and the same string is a link, a starter, and a saved preset all at once.

# Citations

- Code: physics/presetCodec.js (encodeScene / decodeScene) + physics/presetCodec-selfcheck.mjs (4 checks, sabotage-tested) + physics-lab.html (Your presets shelf: name, save, delete, backed by localStorage; URL save/load refactored onto the same codec). The Lab became a workbench.
- Page: `physics-lab.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
