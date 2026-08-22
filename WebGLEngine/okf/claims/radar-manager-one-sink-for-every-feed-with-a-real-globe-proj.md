---
type: claim
title: "Radar manager -- one sink for every feed, with a real globe projection and a self-healing dock"
description: "The STATUS scope, the weather/aircraft layer, and the in-world trackers each kept their own blips and each tried to draw; nothing owned the layout. Now one manager does: every sour"
tags: [settled, "swek-engine", v2708]
timestamp: v2708
---

# Radar manager -- one sink for every feed, with a real globe projection and a self-healing dock

- **Status:** settled  
- **Since:** v2708

## Prediction

The STATUS scope, the weather/aircraft layer, and the in-world trackers each kept their own blips and each tried to draw; nothing owned the layout. Now one manager does: every source registers once and submits typed blips (a world position, a type, a preferred view), and the manager projects each through flat or globe and hands the renderer one deduplicated draw list. Globe is a real orthographic-azimuthal projection -- things near you sit centre, the horizon compresses to the rim, and anything on the far face of the sphere falls off the back instead of showing through.

## Why

ui/radarProjection.js (projectFlat + projectGlobe, pure) and ui/radarManager.js (register/submit/frame, dedupe by id, drop back-hemisphere blips). window.radarManager is exposed for the STATUS scope to adopt. Separately, the disappears-after-load dock bug is fixed in ui/peerRadar.js: a re-assert re-appends the radar if a STATUS rebuild orphans it.

## Measured

ui/radar-selfcheck.mjs, 5 checks. Flat puts origin at centre and far at the rim with the right angle; globe centres the viewer, puts the horizon on the rim, and marks the far hemisphere not-visible; the manager holds many sources and dedupes a shared blip; it drops past-the-horizon blips from the frame; and it is deterministic. Master unchanged -- this is UI, not a fingerprint subsystem.

## Kill condition

ui/radar-selfcheck.mjs. SABOTAGE: make the globe projection report everything visible, and the far-side and drop-past-horizon checks fail -- a globe you can see through the back of is a flat disc lying about its shape.

# Citations

- Code: ui/radarProjection.js + ui/radarManager.js (single sink, flat/globe, deduped draw list) + ui/radar-selfcheck.mjs (5 checks, sabotage-tested) + a self-healing dock in ui/peerRadar.js. The globe math is proven; adopting the manager in the live STATUS render is the rig-side finish.
- Page: `index.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
