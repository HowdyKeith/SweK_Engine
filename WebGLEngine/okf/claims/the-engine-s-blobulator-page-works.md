---
type: claim
title: "The engine's blobulator page works"
description: (Nobody predicted anything. Nobody looked.)
tags: [settled, "swek-engine", "assumed since v2438, settled v2505"]
timestamp: "assumed since v2438, settled v2505"
---

# The engine's blobulator page works

- **Status:** settled  
- **Since:** assumed since v2438, settled v2505

## Prediction

(Nobody predicted anything. Nobody looked.)

## Why

A dedupe added an import and left the old function behind. A duplicate declaration is a parse error, so the module never ran -- for 67 versions, because nothing had ever opened the page. pageParse.mjs now gates every inline script in every page.

## Measured

Dead for 67 versions. Fixed.

# Citations

- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
