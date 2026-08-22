---
type: claim
title: "Auto-extremity: raise the mountains and the world grows to fit them -- sized from the content, never clipped"
description: "The bridge from terrain to extremity bounds. fitExtremity samples the terrain surface over a footprint, finds the tallest column, and returns the world height that fits it plus hea"
tags: [settled, "swek-engine", v2767]
timestamp: v2767
---

# Auto-extremity: raise the mountains and the world grows to fit them -- sized from the content, never clipped

- **Status:** settled  
- **Since:** v2767

## Prediction

The bridge from terrain to extremity bounds. fitExtremity samples the terrain surface over a footprint, finds the tallest column, and returns the world height that fits it plus headroom -- so raising the mountain amplitude raises the fitted world height with it, and the tallest column always fits under the ceiling. The world is sized FROM the content instead of the content being cut to the world, and the peak's voxel type is reported (snow caps, water fills the lows). Height comes from domain-warped fractal noise -- domain warp displaces the sample coordinates before sampling, bending ridgelines off the grid.

## Why

The load-bearing line is worldHeight = maxHeight + 1 + headroom -- the ceiling is derived from the measured peak. Integer-hashed, trig-free noise, so it is deterministic and fingerprint-fold-ready. SweK already had domain warp in world.js and erosion.js; this is the self-contained copy that lets the fit be proven.

## Measured

autoExtremity-selfcheck.mjs, 7 checks: fbm stays in [0,1] and recomputes identically; domain warp displaces by a bounded amount (<= warpAmp) and warpAmp 0 is the identity; amplitude 4 gives a peak of 7 and amplitude 20 gives 20; the fitted world grew from 10 to 23 as the mountains rose; NOTHING is clipped for amplitude in [2..48] (peak < worldHeight every time); snow caps the peak, water the lows. SABOTAGE (worldHeight pinned to a constant) makes the tall-mountain no-clip check fail.

## Kill condition

tools/autoExtremity-selfcheck.mjs. HONEST SCOPE: this proves the FIT is correct and grows with the content -- it computes the world height, it does not itself rebuild the chunk mesh at the new size (that is the generator's step, which acts on this number).

# Citations

- Code: world/autoExtremity.js (fbm2, domainWarp2, warpedTerrainHeight, voxelTypeForHeight, fitExtremity) + tools/autoExtremity-selfcheck.mjs.
- Page: `case-study.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
