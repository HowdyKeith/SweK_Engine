---
type: claim
title: "Tunnel share holds to the same proof as the tunnel email -- no more live-looking dead links"
description: "A Cloudflare quick tunnel answers bad-gateway roughly a third of the time at birth, before the edge wires it through. The engine already knew this and gated the tunnel EMAIL on a r"
tags: [settled, "swek-engine", v2707]
timestamp: v2707
---

# Tunnel share holds to the same proof as the tunnel email -- no more live-looking dead links

- **Status:** settled  
- **Since:** v2707

## Prediction

A Cloudflare quick tunnel answers bad-gateway roughly a third of the time at birth, before the edge wires it through. The engine already knew this and gated the tunnel EMAIL on a real probe -- it would not mail a link until /health answered. But the peer SHARE did not hold to that bar: the moment cloudflared printed a URL, that URL was advertised to peers, and the receiving toast announced it as live. So peers were handed born-dead links that looked verified. This closes the gap: a tunnel is advertised to peers only once it is PROVEN live, the same proof the email waits for.

## Why

ai-bridge/tunnelHealth.js gains shareableTunnelUrl(ts), which returns the URL only when the tunnel is running AND ts.verified === true (verifyUrl passed). The two points in ai-bridge/server.js that advertised the self tunnel to peers on running+url alone now route through it, so a still-verifying (verified null) or dead (verified false) tunnel is withheld until proven.

## Measured

ai-bridge/tunnel-health-selfcheck.mjs, now 16 checks. shareableTunnelUrl shares a verified-live tunnel, and withholds one that is still verifying, one that is dead, and one that is not running. The existing classifyProbe / verifyUrl / planEnsure checks (born-502 recognised, transient bad-gateway waited out, persistent bad-gateway given up on) still hold.

## Kill condition

ai-bridge/tunnel-health-selfcheck.mjs. SABOTAGE: make shareableTunnelUrl ignore ts.verified and share on running+url alone, and the withholds-still-verifying and withholds-dead checks fail -- which is exactly the bug that let a born-dead link reach peers as live.

# Citations

- Code: ai-bridge/tunnelHealth.js (shareableTunnelUrl) + the two advertise points in ai-bridge/server.js gated through it + ai-bridge/tunnel-health-selfcheck.mjs (16 checks, sabotage-tested). A node shares its tunnel to peers only once proven live; the LAN transport being flaky at birth is now handled the same way for share as for email.
- Page: `server.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
