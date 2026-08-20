---
type: claim
title: "A white square with a grid -- because I verified everything except the picture"
description: "Keith: 'The first svg looked like a dark amoeba, the gif you sent me looks like a white square with a grid.'"
tags: [settled, "swek-engine", v2613]
timestamp: v2613
---

# A white square with a grid -- because I verified everything except the picture

- **Status:** settled  
- **Since:** v2613

## Prediction

Keith: 'The first svg looked like a dark amoeba, the gif you sent me looks like a white square with a grid.'

## Why

HE WAS RIGHT AND I HAD NEVER LOOKED AT IT. Krbn's own types say `scale: number  /** world units per pixel (ortho) **/` and camera.js says `const inv = 1 / cam.scale; // pixels per world unit`. I READ NEITHER. I saw the SVG using 0.009 at 640x480, halved the viewport for the GIF, AND HALVED THE SCALE TOO -- assuming proportional. 640 x 0.009 = 5.76 units of frame; 320 x 0.0045 = 1.44 UNITS OF FRAME FOR A CREATURE 1.845 UNITS ACROSS, a number I had MEASURED MYSELF one round earlier. The frame showed the INSIDE of the blob, WHICH IS CROSS-HATCH. FEWER PIXELS FOR THE SAME WORLD MEANS MORE UNITS PER PIXEL: I HALVED IT WHEN I SHOULD HAVE DOUBLED IT.

## Measured

The fix is v2611's sentence applied to the camera: THE BLOB TELLS YOU ITS OWN FRAMING. Measured worst-case over a full 360 orbit (what fits at 0 degrees must fit at 45): horizontal 2.064, vertical 2.170 units. NOT the 3D diagonal (3.230): I tried that first and HE FILLED ONLY 42%, because the camera sees a 2D PROJECTION and the diagonal is the worst case of a box he never presents. AND THEN I DID THE THING I SHOULD HAVE DONE TWO ROUNDS AGO: installed cairosvg, RASTERISED THE PICTURE, AND LOOKED AT IT. Counted off the pixels: 15.29% ink, bbox 63% wide x 80% tall, darkest ink 30.0 vs paper 241.1 = 5-point contrast. Regenerated the GIF through the fixed cameras and INSPECTED ALL 8 FRAMES: ~10% ink each, 48-63% wide, ZERO clipped, ZERO empty, ZERO solid. A blob spinning, not a grid.

## Kill condition

NEW render/holoPicture-selfcheck.mjs RASTERISES THE SCENE AND COUNTS PIXELS -- the check whose absence Keith paid for. THERE IS INK (a blank page passes every structural check ever written); IT IS NOT A GRID; HE IS NOT CLIPPED; HE FILLS THE FRAME; CONTRAST MEASURED OFF THE LANDED PIXELS not the declared colours. Sabotage with Keith's EXACT bug (scale 0.0045): the ink bbox comes back x 0..319, y 0..239 -- TOUCHING EVERY BORDER -- and the CLIP check catches it. HONEST: the coverage check did NOT catch it (28.64% passed my 35% guess); THE BORDER CHECK DID, and I am not taking credit for a catch it did not make. Black-on-dark sabotage -> 2 fail. Magic-number-back in krbn.html -> 1 fail. AND THE HONEST GAP NAMED, NOT SHIPPED-PAST THIS TIME: cairosvg is NOT Chrome; this proves KRBN'S OUTPUT DEPICTS THE THING, not that the browser draws that SVG identically. Last round I wrote 'it does not raster an SVG... honest work, not done' AND SHIPPED ANYWAY. A GAP YOU NAME AND DO NOT CLOSE IS A GAP YOU HAVE DECIDED TO KEEP.

# Citations

- Code: krbn.html (both cameras compute scale from the lumps -- NO MAGIC NUMBER LEFT IN THE CODE) + render/holoPicture-selfcheck.mjs (6 checks + skip-if-no-rasteriser that does NOT pass silently) + render/holoGif-selfcheck.mjs (framing checks added). KEITH WAS MY RENDERER FOR TWO ROUNDS. That is the whole reason holoPicture exists.
- Page: `/krbn.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
