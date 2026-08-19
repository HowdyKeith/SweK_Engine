---
type: claim
title: "Yes, there is a real-time fracture engine -- and now the 'verified' in its header is true"
description: "Keith: 'do we have a real-time fracture simulation engine.' I searched instead of guessing. YES: fx/fracture/cellFracture.js does Voronoi cell fracture -- scatter seed sites throug"
tags: [settled, "swek-engine", v2621]
timestamp: v2621
---

# Yes, there is a real-time fracture engine -- and now the 'verified' in its header is true

- **Status:** settled  
- **Since:** v2621

## Prediction

Keith: 'do we have a real-time fracture simulation engine.' I searched instead of guessing. YES: fx/fracture/cellFracture.js does Voronoi cell fracture -- scatter seed sites through a mesh's bounds, assign every triangle to its nearest site (its Voronoi cell), each non-empty cell becomes a fragment, sites BIAS toward an impact so a hit shatters finely near the point and coarsely far away, and makeDebris/stepDebris let the pieces fly outward and fall. Wired into blob-herd.html and blob-avatar.html.

## Why

MEASURED it is real-time: 0.3-3.7ms to shatter a 1152-2048 triangle mesh into up to 100 shards, against a 16.7ms frame -- a shatter is a single sub-frame event, not a hitch. And its header said 'Pure + verified' WHILE THERE WAS NO GATE. A verified with nothing checking it is a claim, not a fact, and this project does not let a claim wear the word.

## Measured

So: the gate. Four verified properties. CONSERVATION -- every triangle lands in exactly one fragment (1152 in, 1152 summed over fragments; a fracture that loses or duplicates triangles is a mesh corruptor). IMPACT BIAS -- shards measurably finer near the hit (0.88) than away, the way real things break. REAL-TIME -- worst case under one frame. DEBRIS -- 22 of 22 bodies launch outward from the impact and then fall under gravity. On the way I mis-called two signatures (fragments store .tris not .indices; makeDebris takes impact as a positional arg, not in opts) and the tests caught me before the gate did -- READ THE SHAPE, DO NOT GUESS IT.

## Kill condition

Drop one triangle in fractureMesh -> conservation fails. Disable the impact bias -> the finer-near-impact check fails. AND THE HONEST BOUNDARY IS NAMED: this is CLUSTER fracture (whole triangles to the nearest site), NOT sealed convex shards -- fragments are jagged clusters with open boundaries, no new interior faces cut along the cell planes. Right for the metaball/x-ray Avataro look, wrong for rigid convex pieces. 'VERIFIED' NOW MEANS THESE FOUR PROPERTIES AND NOT ONE INCH MORE, and the header points at the gate that says so.

# Citations

- Code: fx/fracture/cellFracture.js (header now anchored to the gate) + fx/fracture/cellFracture-selfcheck.mjs (6 checks, gated, 2 sabotages). THE ANSWER TO THE QUESTION IS YES, and the reason I can say it with confidence is that it is now the 160th thing the ship refuses to release without checking.
- Page: `/blob-avatar.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
