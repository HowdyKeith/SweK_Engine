---
type: claim
title: "Render cluster -- a coordinator that distributes, verifies, and survives a faulty peer"
description: "The distributed-render harness wired to a coordinator that does not trust its peers. It plans a band for each peer covering every row exactly once, collects the returned bands, ver"
tags: [settled, "swek-engine", v2718]
timestamp: v2718
---

# Render cluster -- a coordinator that distributes, verifies, and survives a faulty peer

- **Status:** settled  
- **Since:** v2718

## Prediction

The distributed-render harness wired to a coordinator that does not trust its peers. It plans a band for each peer covering every row exactly once, collects the returned bands, verifies each by recomputing it locally and comparing -- never trusting a peer\'s self-reported checksum -- assembles the verified bands, and recovers any band that fails verification or never arrives. With honest peers the frame equals a solo render; with a peer returning garbage, or a peer offline, the frame STILL equals a solo render.

## Why

tools/render/renderCluster.js. The transport is an interface -- a mock local transport is exercised by the gate, and the real LAN peer RPC plugs into the same seam rig-side, so the coordinator does not know whether a band came from across the room or across the process. Recompute-and-compare is the defence: a peer that lies about its pixels can also report a matching checksum, so only independent recomputation catches it.

## Measured

tools/render/renderCluster-selfcheck.mjs, 6 checks. The work plan tiles all sixty rows once; honest peers assemble bit-identical to solo (eight verified, none recovered); a peer returning corrupted pixels is caught and its bands rebuilt, frame still identical to solo; an offline peer is recovered the same way; the recompute check passes an honest band and fails a corrupted one; deterministic.

## Kill condition

tools/render/renderCluster-selfcheck.mjs. SABOTAGE: make the coordinator trust each peer\'s self-reported checksum instead of recomputing the truth, and the faulty peer\'s garbage sails through into the assembled frame -- because a dishonest peer reports a checksum that matches its own lie. Independent recomputation is the only thing that catches it. HONEST SCOPE: the physical multi-machine networking is rig-side; what is proven headlessly is the coordination and verification -- distribute, catch a fault, recover -- which is the hard part of wiring a render to untrusted peers.

# Citations

- Code: tools/render/renderCluster.js (plan + distribute + verify-by-recompute + recover) + tools/render/renderCluster-selfcheck.mjs (6 checks, sabotage-tested) + a Physics Lab scene where a slider marks a faulty peer\'s bands amber while the image stays pixel-identical. The coordinator is the wiring; the LAN transport is the one rig-side seam it plugs into.
- Page: `physics-lab.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
