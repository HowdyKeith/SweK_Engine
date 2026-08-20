---
type: claim
title: "Tunnel diagnostic -- says WHY cloudflared can't attach instead of leaving you guessing"
description: "cloudflared tunnels to http://localhost:PORT. If the server is bound only to the LAN IP and not to localhost, cloudflared gets connection-refused and the public URL answers 502 for"
tags: [settled, "swek-engine", v2708]
timestamp: v2708
---

# Tunnel diagnostic -- says WHY cloudflared can't attach instead of leaving you guessing

- **Status:** settled  
- **Since:** v2708

## Prediction

cloudflared tunnels to http://localhost:PORT. If the server is bound only to the LAN IP and not to localhost, cloudflared gets connection-refused and the public URL answers 502 forever -- indistinguishable from born-bad-gateway flakiness, but it never clears. The engine now probes its own local target and says which it is.

## Why

ai-bridge/tunnelHealth.js classifyTarget maps a probe of http://127.0.0.1:PORT/health to target-reachable (cloudflared can attach; a 502 is transient) or target-unreachable (server not on localhost; the stuck-502 cause). ai-bridge/hostingBridge.js diagnoseTunnelTarget runs the probe and returns a plain-English message.

## Measured

ai-bridge/tunnel-health-selfcheck.mjs, now 19 checks. classifyTarget reads a 200 as reachable, a connection-refused as unreachable (the actionable diagnosis: bind to 0.0.0.0), and no-probe as unknown.

## Kill condition

ai-bridge/tunnel-health-selfcheck.mjs. If classifyTarget stopped distinguishing a refused connection from a reachable server, the reachable/unreachable checks fail -- and the diagnostic would be back to guessing.

# Citations

- Code: ai-bridge/tunnelHealth.js (classifyTarget) + ai-bridge/hostingBridge.js (diagnoseTunnelTarget, probes localhost) + tunnel-health-selfcheck.mjs. Ready to wire to a button on the Cloud & Hosting panel.
- Page: `server.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
