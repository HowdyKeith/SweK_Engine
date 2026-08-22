---
type: claim
title: "brain-maze's render and poll loops go quiet when the page is swapped away, instead of throwing every frame"
description: "The Brain Maze page stops spraying the console with null errors. It grabs the canvas once at load and drives three loops off it -- a requestAnimationFrame draw, a 4Hz field poll, a"
tags: [settled, "swek-engine", v2737]
timestamp: v2737
---

# brain-maze's render and poll loops go quiet when the page is swapped away, instead of throwing every frame

- **Status:** settled  
- **Since:** v2737

## Prediction

The Brain Maze page stops spraying the console with null errors. It grabs the canvas once at load and drives three loops off it -- a requestAnimationFrame draw, a 4Hz field poll, a 3s health poll. When the engine swaps the page's DOM out from under it, that canvas detaches, every getElementById returns null, and the loops throw on .checked, .className and .textContent on every tick. Now each loop checks whether its canvas is still in the document and bails cleanly if not, so a swapped-away page goes idle in silence.

## Why

brain-maze.html. frame, draw, pollField and pollHealth each return early when the captured canvas is no longer cv.isConnected -- the rAF loop stops rescheduling and the intervals become no-ops. setStatus also guards its status element. The page works exactly as before while it is live; it just stops throwing once it is gone.

## Measured

The module parses. The guards are in all four loops plus setStatus; while the canvas is connected they pass through to the normal path, so live behaviour is unchanged, and once it detaches the loops return before touching any null element.

## Kill condition

brain-maze.html. Load it, let the brain solve, then navigate away or let the engine swap the page: the console must stay clean -- no 'Cannot read properties of null' from draw, setStatus or pollHealth. HONEST SCOPE: this fixes the crash-on-detach; the underlying page still runs its intervals until navigation actually unloads it, but they are harmless no-ops now.

# Citations

- Code: brain-maze.html: cv.isConnected guards at the top of frame, draw, pollField and pollHealth, and a null guard in setStatus. A page that has been swapped away should fall silent, not throw sixty times a second.
- Page: `brain-maze.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
