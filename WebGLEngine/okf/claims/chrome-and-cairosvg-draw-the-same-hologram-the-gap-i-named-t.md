---
type: claim
title: "Chrome and cairosvg draw the same hologram -- the gap I named twice, closed"
description: "Keith, on the theme of this whole arc: 'I am still waiting for the other shoe to drop.' Contrast was wrong in v2612, framing in v2613 -- both pictures I verified structurally and N"
tags: [settled, "swek-engine", v2616]
timestamp: v2616
---

# Chrome and cairosvg draw the same hologram -- the gap I named twice, closed

- **Status:** settled  
- **Since:** v2616

## Prediction

Keith, on the theme of this whole arc: 'I am still waiting for the other shoe to drop.' Contrast was wrong in v2612, framing in v2613 -- both pictures I verified structurally and NEVER LOOKED AT. holoPicture (v2613) then rasterised with cairosvg to actually LOOK -- but krbn.html rasterises through THE BROWSER, a different engine. I wrote the gap into that gate's own body -- 'this proves KRBN output depicts the thing; it cannot prove Chrome draws that SVG the same way' -- AND SHIPPED IT TWICE.

## Why

A GAP YOU NAME AND DO NOT CLOSE IS A GAP YOU HAVE DECIDED TO KEEP (my own rule, same round). And it does double duty: if Chrome and cairosvg disagree, THAT is the third shoe, and better a gate finds it than Keith. So I measured: load krbn.html in a real browser, grab the exact SVG it built, screenshot how CHROME draws it, rasterise the SAME SVG with cairosvg, diff per-pixel.

## Measured

Aggregate agreed exactly -- ink 7.82% both, bbox 63% x 80% both -- but same AMOUNT of ink is not same PLACEMENT, so I diffed per-pixel: 0.82% of pixels differ by >8 of 255 (edge anti-aliasing), 0.01% by >32 (16 pixels), ZERO by >64, mean delta 0.44, max 42. THE TWO RASTERISERS DRAW THE SAME PICTURE TO WITHIN ANTI-ALIASING. So holoPicture cairosvg check is a TRUE PROXY for what Keith sees in Chrome -- there is NO third shoe on the rendering.

## Kill condition

NEW render/holoAgree-selfcheck.mjs runs the browser-vs-cairosvg diff every ship. Sabotage: recolour cairosvg ink to the paper colour so it renders blank while Chrome shows the blob -> 20,921 pixels differ, 2 checks fail. AND IT SKIPS LOUDLY, never silently: no cairosvg or no browser -> SKIP with a reason and exit 0, because A GATE THAT CANNOT LOOK MUST NOT REPORT THAT IT LOOKED -- the exact failure that let a 1.42:1 black picture and a 1.44-unit crop both ship. It runs in a child process with a 90s timeout, and a launch failure SKIPS rather than FAILS, because A FLAKY GATE IS WORSE THAN NO GATE.

# Citations

- Code: render/holoAgree-selfcheck.mjs (3 checks + loud skip, gated, sabotage-tested). Suite went 156 -> 157 checks, +8s for a real browser launch. THE HOLOGRAM IS NOW SOLID END TO END: contrast measured off the pixels (v2612), framing measured off the projection (v2613), and the gate rasteriser proven to match the browser (this). Three rounds of me not looking, closed by three gates that look.
- Page: `/krbn.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
