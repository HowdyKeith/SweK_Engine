---
type: claim
title: The box3d shim compiles
description: "(Assumed, never checked. Three versions shipped on it.)"
tags: [broken, "swek-engine", "assumed v2508, settled v2512"]
timestamp: "assumed v2508, settled v2512"
---

# The box3d shim compiles

- **Status:** broken  
- **Since:** assumed v2508, settled v2512

## Prediction

(Assumed, never checked. Three versions shipped on it.)

## Why

Fifteen redefinition errors. A string-indexed port took the recording block AND the whole rest of the file behind it, defining fourteen functions twice. Keith's emcc found it in 45 seconds. gcc was in /usr/bin here the whole time and I had never tried it.

## Measured

15 errors. Now gated by shimCompiles.mjs.

# Citations

- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
