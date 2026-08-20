---
type: claim
title: "The other live brain pages got the same swap-away guard, and the audit named which pages actually needed it"
description: "After brain-maze, the sibling pages that run the same loops get the same fix, and the audit is honest about scope rather than blanket-guarding a hundred pages. brain-3d -- the dire"
tags: [settled, "swek-engine", v2738]
timestamp: v2738
---

# The other live brain pages got the same swap-away guard, and the audit named which pages actually needed it

- **Status:** settled  
- **Since:** v2738

## Prediction

After brain-maze, the sibling pages that run the same loops get the same fix, and the audit is honest about scope rather than blanket-guarding a hundred pages. brain-3d -- the direct sibling, which polls the same brain endpoints and drives the same frame and interval loops off a captured canvas -- gets cv.isConnected guards so it falls silent when swapped away. brain-3d was the one page with the exact bug; brain-room turned out already safe, and the standalone game and demo pages load as top-level documents that never get swapped, so they were never at risk.

## Why

brain-3d.html: isConnected guards at the top of frame, pollField and pollHealth, matching brain-maze. brains/ai-brain.html got a defensive guard on its render function. The audit checked every page with a requestAnimationFrame loop for the vulnerable shape -- a loop doing getElementById property access that goes null when the page detaches -- and found the risk concentrated in the brain-solver pages, not the standalone demos, which are their own top document and stay connected.

## Measured

Across ~130 pages with animation loops, the ones combining brain-endpoint polling, a captured canvas, and unguarded DOM lookups in the loop were brain-maze (fixed v2737) and brain-3d (fixed here). brain-room has no such lookups. The scan ranked pages by risky-access count, but the high-count demos are top-level documents that are never swapped, so their accesses run only while live.

## Kill condition

Load brain-3d, let the brain solve, then navigate away: the console must stay clean. HONEST SCOPE: this guards the pages that are actually loaded in the engine's page-swap; a blanket guard on every animation page would be busywork, since a page that owns its whole document does not detach. If a standalone demo is ever embedded and swapped, it would need the same one-line guard.

# Citations

- Code: brain-3d.html (frame/pollField/pollHealth isConnected guards) and brains/ai-brain.html (render guard), plus the audit that scoped the fix to the pages that swap rather than every page that animates.
- Page: `brain-3d.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
