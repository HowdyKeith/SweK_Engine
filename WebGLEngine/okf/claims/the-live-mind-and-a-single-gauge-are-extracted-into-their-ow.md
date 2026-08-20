---
type: claim
title: "The live-mind and a single gauge are extracted into their own mini-panels, so the dashboard can tile just the part you want"
description: "The dashboard stops being only whole pages in frames. Two extracted mini-panels arrive: the GPU brain live-mind on its own, and a single metric gauge, each a small self-contained p"
tags: [settled, "swek-engine", v2747]
timestamp: v2747
---

# The live-mind and a single gauge are extracted into their own mini-panels, so the dashboard can tile just the part you want

- **Status:** settled  
- **Since:** v2747

## Prediction

The dashboard stops being only whole pages in frames. Two extracted mini-panels arrive: the GPU brain live-mind on its own, and a single metric gauge, each a small self-contained page that renders just that one live component and nothing else. They sit in a panels group at the top of the index and tile compact, so a dashboard can be built from just the live-minds and gauges you care about rather than a wall of full scenes.

## Why

panel-brain.html mounts the brain live-mind through the same mountBrainSvg that drives it in the dock, polling the brain and animating while it solves. panel-gauge.html renders one gauge through mountSvgGaugeSet, choosing the metric from a query parameter. Both reuse the real components rather than reimplementing them, so they show exactly what the full pages show, just alone; the index tiles them at panel size.

## Measured

Both panels parse and reuse the existing modules; the index re-scanned to 256 pages with the two panels tagged and grouped first, tiling at the smaller panel height. Each is its own document, so it stays isolated in a dashboard tile and cannot be caught by the swap-away detach.

## Kill condition

Open page-index.html, check the two panels, and show the dashboard: the brain panel must animate while the brain solves and the gauge panel must read its metric, each in a compact tile. HONEST SCOPE: two panels exist so far, brain and gauge; extracting more -- a peer list, the fleet map, a single chat -- is the same pattern repeated. The panels are separate small pages, not slices carved live out of the big pages, which keeps them simple and isolated.

# Citations

- Code: panel-brain.html (mountBrainSvg live-mind) + panel-gauge.html (mountSvgGaugeSet single metric) + the panels group and compact tiles in page-index.html. The dashboard can now be assembled from parts, not just whole pages.
- Page: `page-index.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
