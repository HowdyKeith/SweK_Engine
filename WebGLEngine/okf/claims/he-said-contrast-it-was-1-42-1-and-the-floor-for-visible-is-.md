---
type: claim
title: "He said contrast. It was 1.42:1, and the floor for visible is 3:1."
description: "Keith, looking at the spin GIF I had just handed him: 'I wonder if we can adjust the contrast maybe.' HE WAS BEING POLITE ABOUT A BUG."
tags: [settled, "swek-engine", v2612]
timestamp: v2612
---

# He said contrast. It was 1.42:1, and the floor for visible is 3:1.

- **Status:** settled  
- **Since:** v2612

## Prediction

Keith, looking at the spin GIF I had just handed him: 'I wonder if we can adjust the contrast maybe.' HE WAS BEING POLITE ABOUT A BUG.

## Why

MEASURED: default ink #1a1a1a on my #0b0f14 background = 1.42:1. WCAG's floor for a thing being VISIBLE AT ALL is 3:1. I SHIPPED A PICTURE AT LESS THAN HALF THE THRESHOLD OF VISIBLE, TWICE, AND CALLED IT A HOLOGRAM. The cause is in vendor/krbn/pipeline/style.js: `visible: { weight: 1.5, color: \"#1a1a1a\", opacity: 1 }`. KRBN IS A PENCIL-PLOTTER LIBRARY -- ITS DEFAULT INK IS GRAPHITE BECAUSE IT EXPECTS PAPER -- and I put it on an LCARS background and NEVER ASKED WHAT COLOUR IT DRAWS WITH. Worse: the ghosted bones are that same graphite at `opacity: 0.32`, so THE X-RAY, WHICH IS THE ENTIRE POINT OF THE PICTURE, WAS 0.45:1 AGAINST THE BACKGROUND.

## Measured

THE GIF PROVED IT INDEPENDENTLY OF ANY OPINION. Its palette came out with EIGHT entries whose luminance ran 0.0 .. 22.1 OF 255 -- NOT ONE PIXEL BRIGHTER THAN 22, ZERO ABOVE MID-GREY. I had asked encodeGif for 64 colours. THE QUANTISER WAS NOT BROKEN: IT COULD ONLY FIND EIGHT DISTINCT COLOURS BECAUSE THE PICTURE WAS BLACK. THE PALETTE WAS A SYMPTOM. After: 64 entries, luminance 30.9 .. 241.1, 37 OF 64 ABOVE MID-GREY, and the file went 59,033 -> 199,580 bytes BECAUSE THERE IS FINALLY SOMETHING IN IT TO COMPRESS. Three measured inks: graphite on paper 6.55:1 (DEFAULT -- it is what a pencil drawing IS, and Krbn's own gallery is graphite on white), light ink on dark 9.18:1, white on blueprint 4.98:1.

## Kill condition

Put the black ink back -> 2 fail. AND THE GATE CAUGHT ITS OWN AUTHOR THIRTY MINUTES AFTER HE WROTE IT: I LABELLED BLUEPRINT MODE '8.29:1' FROM NOWHERE. I NEVER MEASURED IT. THE REAL RATIO IS 4.98:1. The check recomputes every advertised ratio from the actual colours -- A LABEL THAT CLAIMS A NUMBER NOBODY CHECKS IS DECORATION -- and it failed on the very number I invented WHILE FIXING A BUG ABOUT SHIPPING A PICTURE I HAD NEVER LOOKED AT. Same disease, same round, one paragraph apart. AND ONE MORE: my first version of this gate called `sniffGif(bytes).ok` -- IT RETURNS A BOOLEAN, so `true.ok` is undefined AND THE CHECK FAILED ON A WORKING ENCODER. I GUESSED AT THE RETURN SHAPE OF A FUNCTION IN A FILE I HAD JUST READ.

# Citations

- Code: krbn.html (PAPER/INK control, ratio shown per mode) + render/holoGif-selfcheck.mjs (10 checks, gated, sabotage-tested). THE GIF PATH BUILDS ITS OWN SCENE and is gated separately: miss it and SAVE GIF QUIETLY SHIPS THE BLACK PICTURE WHILE THE PAGE SHOWS THE FIXED ONE -- two code paths, one bug, only one of them on screen.
- Page: `/krbn.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
