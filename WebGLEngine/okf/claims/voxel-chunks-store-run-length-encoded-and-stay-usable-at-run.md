---
type: claim
title: "Voxel chunks store run-length-encoded and stay usable at runtime -- lossless, O(log n) queryable, tens of times smaller"
description: "A 32 x 256 x 32 chunk is 262,144 voxels -- 256 KB flat. Encoded as (type, count) runs in column-major, Y-fastest order, the tall columns collapse to a handful of runs each. The rou"
tags: [settled, "swek-engine", v2768]
timestamp: v2768
---

# Voxel chunks store run-length-encoded and stay usable at runtime -- lossless, O(log n) queryable, tens of times smaller

- **Status:** settled  
- **Since:** v2768

## Prediction

A 32 x 256 x 32 chunk is 262,144 voxels -- 256 KB flat. Encoded as (type, count) runs in column-major, Y-fastest order, the tall columns collapse to a handful of runs each. The round-trip is lossless, a point query returns the exact flat voxel without decoding (a prefix index makes it O(log runs)), and terrain-shaped data compresses by more than ten times. Incompressible noise is honestly a loss, not a hidden blow-up -- so the rule is RLE for the many quiet streamed chunks, flat for the one being carved.

## Why

The load-bearing line is the run count in decodeRLE (out.fill(t, i, i+c)). A codec that miscounts a run is a world that changes underfoot, so the sabotage is an off-by-one count and the lossless check catches it.

## Measured

voxelRLE-selfcheck.mjs, 6 checks: dimensions 32x256x32 = 262144; decode(encode(terrain)) is bit-for-bit the original (4096 runs reconstruct all 262144 voxels); lossless on random data too; 4000 random point queries match the flat array on BOTH the walk and the O(log runs) index; terrain compresses 12.8x (262144 bytes -> 20480, 64 voxels/run); random noise is honestly 0.27x (1.33 voxels/run) -- a loss, stated plainly. SABOTAGE (count off by one) breaks losslessness.

## Kill condition

tools/voxelRLE-selfcheck.mjs. HONEST SCOPE: this proves the codec and the point query. It does not implement in-place RLE editing (run split/merge) -- the intended pattern is decode-to-flat for the actively edited chunk, which is O(1) writes, and re-encode on eviction.

# Citations

- Code: voxel/voxelRLE.js (encodeRLE, decodeRLE, getRLE, buildIndex, getRLEIndexed, runStats) + tools/voxelRLE-selfcheck.mjs.
- Page: `case-study.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
