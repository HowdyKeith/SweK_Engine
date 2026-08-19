---
type: claim
title: "Warp map: the shot noise was mine, not the universe's"
description: "Clustered variance/mean should read <b>~1.2 or higher</b>, not the 1.03 the page showed."
tags: [open, "swek-engine", v2490]
timestamp: v2490
---

# Warp map: the shot noise was mine, not the universe's

- **Status:** open  
- **Since:** v2490

## Prediction

Clustered variance/mean should read <b>~1.2 or higher</b>, not the 1.03 the page showed.

## Why

v2490 shipped the page 33x sparser than the configuration verified headless -- 6,000 stars, 0.18 per cell. At that density shot noise swamps the structure. Headless at nbar 0.2 (199,627 stars) gives 1.368. The page's own readout said V/N = 165.9 and I did not read it.

## Kill condition

If it still reads ~1.0 at the corrected density, the clustering is not doing what the gate claims.

# Citations

- Code: Anywhere with WebGL2.
- Page: `/warp-map.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
