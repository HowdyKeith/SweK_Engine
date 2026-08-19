---
type: claim
title: "Do not claim what you cannot own -- with no peers, nothing is simulated on their behalf"
description: "Authority in a peer-to-peer game usually fails in the generous direction: a client, finding nobody else present, helpfully simulates the absent players' ships so the world looks al"
tags: [settled, "swek-engine", v2864]
timestamp: v2864
---

# Do not claim what you cannot own -- with no peers, nothing is simulated on their behalf

- **Status:** settled  
- **Since:** v2864

## Prediction

Authority in a peer-to-peer game usually fails in the generous direction: a client, finding nobody else present, helpfully simulates the absent players' ships so the world looks alive. Then two clients do it at once and both are right about a world that never existed. This port asserts the opposite default -- a peer simulates exactly what it owns and nothing else, so an empty session is visibly empty rather than convincingly wrong.

## Why

ev/esAuthority.js: ownership is derived by rendezvous hashing, and the simulate set is the owned set. Single player owns everything and ghosts nothing; with no peers there is nothing to ghost.

## Measured

ev/tools/es-authority-selfcheck.mjs, 62 checks, all passing, including both ends of the range: single player owns everything and ghosts nothing, and no peers means nothing simulated on anyone else's behalf.

## Kill condition

ev/tools/es-authority-selfcheck.mjs. Make the fallback simulate unowned ships when no owner is present and the empty-session check fails. HONEST SCOPE: this is about who may simulate, not about hiding latency -- a real session still needs interpolation, which is a different problem with different failure modes.

# Citations

- Code: ev/esAuthority.js + ev/tools/es-authority-selfcheck.mjs.
- Page: `ev.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
