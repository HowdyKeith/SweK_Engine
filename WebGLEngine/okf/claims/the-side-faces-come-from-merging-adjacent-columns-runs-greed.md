---
type: claim
title: "The side faces come from merging adjacent columns' runs -- greedy vertical quads, at run cost, exact against a scan"
description: "The +-Y faces fell out of one column's run boundaries; the +-X and +-Z faces need two columns compared. But not voxel by voxel: merge the two columns' run lists like two sorted lis"
tags: [settled, "swek-engine", v2770]
timestamp: v2770
---

# The side faces come from merging adjacent columns' runs -- greedy vertical quads, at run cost, exact against a scan

- **Status:** settled  
- **Since:** v2770

## Prediction

The +-Y faces fell out of one column's run boundaries; the +-X and +-Z faces need two columns compared. But not voxel by voxel: merge the two columns' run lists like two sorted lists, and wherever one column is solid over a y-span while the other is not, that whole span is one face. An exposed cliff a hundred voxels tall becomes ONE quad, not a hundred -- greedy meshing on the vertical axis for free. The touching wall between two adjacent solids is correctly hidden.

## Why

The load-bearing line is the solid-vs-not-solid comparison in the merge. Fire it where BOTH columns are solid and the fast path emits faces inside the rock, so the expanded set no longer matches the voxel scan. columnRunLists materialises each column from the single RLE stream in one pass, splitting runs across column seams.

## Measured

rleSideFaces-selfcheck.mjs, 5 checks: the column-merge faces expand to EXACTLY the voxel-scan side faces (1334 both ways on terrain); on a 100-tall cliff, 32 greedy spans cover 3200 voxel faces (100 faces per span); found by merging 4096 runs, not scanning 262144 voxels; a lone pillar gives one full-height span on each of its four sides; the wall between two touching solids yields zero faces. SABOTAGE (emit where both solid) breaks the set equality.

## Kill condition

tools/rleSideFaces-selfcheck.mjs. HONEST SCOPE: internal faces only -- the chunk's outer walls depend on the neighbour chunk, exactly as the +-Y top/bottom edges do. With this, the full +-X/+-Y/+-Z surface comes off the runs, greedy, at run cost.

# Citations

- Code: voxel/rleSideFaces.js (columnRunLists, sideFacesFromRLE, expandSpans, sideFacesBrute) + tools/rleSideFaces-selfcheck.mjs.
- Page: `case-study.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
