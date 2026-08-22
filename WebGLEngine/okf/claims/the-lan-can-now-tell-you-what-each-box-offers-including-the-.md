---
type: claim
title: "The LAN can now tell you what each box offers -- including the Mac"
description: "Keith's Mac-services thread: run something on the Mac (Rockxy), and have the LAN KNOW it is there and how to reach it. The engine already advertises proxyable CAPABILITIES (/sync/c"
tags: [settled, "swek-engine", v2629]
timestamp: v2629
---

# The LAN can now tell you what each box offers -- including the Mac

- **Status:** settled  
- **Since:** v2629

## Prediction

Keith's Mac-services thread: run something on the Mac (Rockxy), and have the LAN KNOW it is there and how to reach it. The engine already advertises proxyable CAPABILITIES (/sync/caps: I can do text2voxel FOR you), but a service is different -- an endpoint a box EXPOSES that others reach directly. The OKF bundle is one; a Mac's Rockxy is another. This builds the registry for them.

## Why

ai-bridge/servicesBridge.js owns /services. /services/self is what THIS box exposes (built-in okf endpoints + a services.local.json a box declares + live proxy-caps). /services is the union across the LAN: self plus every reachable peer's /services/self, each tagged with the peer and whether it answered. The bridge holds NO peer machinery of its own -- the real peer list, fetch, caps, and id are injected by the server, so the same bridge runs against mocks in the gate.

## Measured

A Mac declares {name:rockxy, url:...} in services.local.json and it surfaces under its peer in /services, reachable, with its url -- the LAN now knows the Mac runs Rockxy and how to reach it. Same owns/handle shape as every other bridge; no new peer machinery invented, it reuses _chatPeers + _peerJSON.

## Kill condition

ai-bridge/services-selfcheck.mjs drives the bridge with a mock LAN of two peers. CHECKS: /services/self lists okf + live caps (text2voxel on, ha off); the Mac's rockxy surfaces reachable with its url; an unreachable peer marks reachable:false WITHOUT sinking the registry; count = self + reachable peers. SABOTAGE: remove the per-peer catch -> a dead peer's throw escapes and crashes the aggregate (only 2 of 5 checks survive). A REGISTRY ONE DEAD PEER CAN TAKE DOWN IS NOT A REGISTRY.

# Citations

- Code: ai-bridge/servicesBridge.js (owns/handle, self manifest, injected peer discovery) wired into server.js after okfBridge + ai-bridge/services-selfcheck.mjs (5 checks, gated, 1 sabotage). Live-socket path verified structurally, not over a running socket. THE MAC-SERVICES THREAD, WORKING.
- Page: `/services`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
