---
type: claim
title: "One peer can master-check the whole fleet, and a divergent box is caught by name"
description: "The cross-architecture check stops being a manual chore. One peer asks the whole fleet at once: it fans out to every peer for its master hash, computed live so it proves current bi"
tags: [settled, "swek-engine", v2735]
timestamp: v2735
---

# One peer can master-check the whole fleet, and a divergent box is caught by name

- **Status:** settled  
- **Since:** v2735

## Prediction

The cross-architecture check stops being a manual chore. One peer asks the whole fleet at once: it fans out to every peer for its master hash, computed live so it proves current bit-identity, compares each to its own, and returns a report -- who matched, who diverged, who was unreachable. A single box whose master differs is named, not silently trusted, because a divergent hash is the one thing this check exists to surface.

## Why

brain/agent/fleetFingerprint.js (collectFleetMasters + summarizeFleetCheck) with the peer fan-out injectable, so the logic is gated in-process against simulated peers -- including a deliberately divergent one and an unreachable one -- and wired on the server to the real peer RPC. Server routes: GET /fingerprint/master computes this box\'s master live; POST /fleet/fingerprint-check runs the fan-out and returns the report.

## Measured

brain/agent/fleetFingerprint-selfcheck.mjs, 4 checks. It classifies four peers as match, divergent, or unreachable; it catches the divergent peer by name and reports allMatch false; a clean fleet reports all-match; and an all-unreachable fleet is NOT reported as agreement -- silence is not a match. The server routes parse and the dynamic imports resolve.

## Kill condition

brain/agent/fleetFingerprint-selfcheck.mjs. SABOTAGE: make the comparison always report a match, and the divergent peer slips through -- allMatch goes true when it must be false. That is the exact failure a fingerprint check exists to prevent, so the gate refuses it. HONEST SCOPE: the fan-out logic is proven in-process; the live cross-LAN collection is rig-side, where each box exposes GET /fingerprint/master.

# Citations

- Code: brain/agent/fleetFingerprint.js + brain/agent/fleetFingerprint-selfcheck.mjs + the /fingerprint/master and /fleet/fingerprint-check server routes. The master check you used to run by hand on each box, now one request from one peer.
- Page: `server.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
