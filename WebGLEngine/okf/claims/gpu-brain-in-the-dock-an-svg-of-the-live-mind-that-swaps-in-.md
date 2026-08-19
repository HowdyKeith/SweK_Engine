---
type: claim
title: "GPU Brain in the dock -- an SVG of the live mind that swaps in for the gauges"
description: "An SVG representation of the GPU Brain in action, for the docked gauge set. The brain solves a flow field -- steering enemies toward a goal and away from threat -- so the panel dra"
tags: [settled, "swek-engine", v2727]
timestamp: v2727
---

# GPU Brain in the dock -- an SVG of the live mind that swaps in for the gauges

- **Status:** settled  
- **Since:** v2727

## Prediction

An SVG representation of the GPU Brain in action, for the docked gauge set. The brain solves a flow field -- steering enemies toward a goal and away from threat -- so the panel draws exactly that: a grid of flow arrows over threat heat with the goal marked, animating while the brain is solving and dimming to a resting field when idle. In index.html it swaps in where the gauges sit when the brain goes active, and the avatar stays.

## Why

ui/brainSvg.js. flowField solves a deterministic n-by-n field whose vectors steer toward the goal and away from a drifting threat blob; makeBrainSvg renders it as an SVG string in the gauge idiom (amber/cyan/green on dark). mountBrainSvg polls /ai/brain/health, animates while active, and fires onActive on state change. ui/dockedGauges.js uses that callback to hide the gauges and show the brain when it is live -- fail-safe, so any error just leaves the gauges up.

## Measured

ui/brainSvg-selfcheck.mjs, 5 checks. The field is deterministic; its flow aligns 0.94 with the direction to the goal averaged over the grid (a solved field, not noise); threat heat is a bounded weight in (0,1]; every flow vector is a unit direction; and the SVG is well-formed for both the solving and idle states, cyan arrows and all.

## Kill condition

ui/brainSvg-selfcheck.mjs. SABOTAGE: remove the toward-goal term and the flow stops aiming at the goal -- the alignment check fails, because a field that does not steer to the goal is not a solved field. HONEST SCOPE: the SVG representation and its field are proven headless; the actual swap-in-the-dock is browser DOM wiring, rig-verify, but built fail-safe so a broken swap leaves the gauges in place rather than an empty dock.

# Citations

- Code: ui/brainSvg.js (flowField + makeBrainSvg + mountBrainSvg) + ui/brainSvg-selfcheck.mjs (5 checks, sabotage-tested) + the swap hook in ui/dockedGauges.js. The gauges are the resting state of the dock; the live mind is what it becomes when the brain wakes up.
- Page: `index.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
