---
type: claim
title: "Real multi-peer render -- the coordinator wired to the SweK mesh over an actual RPC"
description: "The distributed-render coordinator wired to the real fleet. A peer serves POST /render/band -- it renders the requested slice and returns the pixels and a checksum -- and the coord"
tags: [settled, "swek-engine", v2719]
timestamp: v2719
---

# Real multi-peer render -- the coordinator wired to the SweK mesh over an actual RPC

- **Status:** settled  
- **Since:** v2719

## Prediction

The distributed-render coordinator wired to the real fleet. A peer serves POST /render/band -- it renders the requested slice and returns the pixels and a checksum -- and the coordinator reaches peers at their real tailnet addresses through the same peer-JSON call the engine already uses for gossip, verifies each returned band by recomputing it, and recovers from any peer that times out, goes offline, or returns corrupted pixels over the wire. The assembled frame is identical to a solo render.

## Why

tools/render/renderRPC.js (server-side handleRenderBand + the lossless JSON wire format + a networkTransport wrapping the peer-JSON call) and an async coordinator, renderClusterAsync, in tools/render/renderCluster.js. The route and its AUTH_PUBLIC entry are wired into ai-bridge/server.js the same way /box3d/artifact hands a build to mesh peers -- a new POST path that cannot affect existing routes.

## Measured

tools/render/renderRPC-selfcheck.mjs, 6 checks with a mock peer-JSON call standing in for the wire. The handler round-trips a band bit-for-bit; four mock peers assemble a frame identical to solo over the RPC; a peer that times out is recovered; a peer that corrupts its band in transit is caught by recomputation; a malformed request is rejected at the handler. The server.js route is syntax-checked; live multi-machine verification is the one rig-side step.

## Kill condition

tools/render/renderRPC-selfcheck.mjs. SABOTAGE: make the handler serialise the pixels with reduced precision -- a lossy wire -- and the round-trip stops being bit-exact, which would make every returned band fail verification and waste every peer\'s work. The wire must be lossless for the checksum verification to mean anything. HONEST SCOPE: the physical networking across machines is proven only on the rig; what is gated here is the protocol, the fault recovery, and the server route\'s shape.

# Citations

- Code: tools/render/renderRPC.js (handler + wire + network transport) + renderClusterAsync + tools/render/renderRPC-selfcheck.mjs (6 checks, sabotage-tested) + the POST /render/band route and AUTH_PUBLIC entry in ai-bridge/server.js. The coordinator, the protocol and the fault tolerance are done and gated; pointing it at live peers is the rig-side finish.
- Page: `physics-lab.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
