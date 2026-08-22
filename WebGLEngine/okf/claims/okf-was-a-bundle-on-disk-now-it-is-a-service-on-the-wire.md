---
type: claim
title: OKF was a bundle on disk; now it is a service on the wire
description: "Keith asked: is OKF built to run as a service yet? Honest answer going in: NO -- v2623 was an emitter that writes files + a zip. A bundle on disk is not a service; another agent or"
tags: [settled, "swek-engine", v2624]
timestamp: v2624
---

# OKF was a bundle on disk; now it is a service on the wire

- **Status:** settled  
- **Since:** v2624

## Prediction

Keith asked: is OKF built to run as a service yet? Honest answer going in: NO -- v2623 was an emitter that writes files + a zip. A bundle on disk is not a service; another agent or a LAN peer cannot READ it without a filesystem path. So this round makes it serve: GET http://<engine>/okf/ walks the live bundle by following markdown links, exactly as the format intends.

## Why

The engine's server is a chain of bridges (owns(url) + handle(req,res)); OKF is now one of them. ai-bridge/okfBridge.js lazily emits the bundle once per engine VERSION into a cache dir and serves from there, so a version bump regenerates it and it can never serve a stale claim set. Read-only and public -- the bundle is the engine's own published self-knowledge, so nothing to trust-gate -- but path traversal is refused: a request path is resolved and MUST stay inside the bundle dir.

## Measured

GET /okf/ -> the root index with okf_version 0.1 (text/markdown). /okf/claims/index.md -> the listing, which links to concept files that arrive carrying type: claim. /okf/manifest.json -> a JSON enumeration (149 files, root /index.md) so a machine can fetch one route then pull exactly the concepts it wants. This is also the first concrete PEER-SERVICE pattern: a machine advertises an HTTP service the LAN reaches -- a Mac running Rockxy would expose itself the same way.

## Kill condition

ai-bridge/okfService-selfcheck.mjs drives the bridge with mock req/res. SABOTAGES caught: disable the traversal guard -> a ../ payload leaks main.js/etc-passwd -> fail; turn a missing-file 404 into a 200 -> fail. Plus: owns() matches /okf but not /okra or /ok; a served claim still declares type: claim; a missing concept is a tolerated 404 (OKF consumers MUST tolerate broken links), never a 500 or a hang.

# Citations

- Code: ai-bridge/okfBridge.js (owns/handle, version-keyed cache, traversal guard, manifest) wired into ai-bridge/server.js after jellyfinBridge + ai-bridge/okfService-selfcheck.mjs (6 checks, gated, 2 sabotages). A FORMAT ON DISK BECAME A FORMAT ON THE WIRE.
- Page: `/okf/`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
