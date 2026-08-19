---
type: claim
title: The LAN and its knowledge finally have a face
description: "Every service built lately -- the OKF bundle, the brief, the services registry -- has been invisible: JSON at a URL. This gives them a face. lan.html is an LCARS console that shows"
tags: [settled, "swek-engine", v2630]
timestamp: v2630
---

# The LAN and its knowledge finally have a face

- **Status:** settled  
- **Since:** v2630

## Prediction

Every service built lately -- the OKF bundle, the brief, the services registry -- has been invisible: JSON at a URL. This gives them a face. lan.html is an LCARS console that shows what the LAN offers (each box + its services, reachable or not) and what this box knows about itself (the OKF claim ledger + the open claims to adjudicate), in the engine's own palette.

## Why

It reads the services registry at /services and the OKF brief at /okf/brief.json -- the two routes built the last few rounds -- and renders them. The signature elements do the work text cannot: a green/grey dot per box shows reachability at a glance, and a settled/open/broken segmented bar shows the ledger shape without a single number being read. Verified headless: a mock LAN of three boxes renders the Mac's Rockxy chip next to this engine's okf endpoints, the unreachable peer dimmed, the ledger bar at 63.64% settled, zero JS errors.

## Measured

It uses the established LCARS vocabulary (amber/salmon, the green accent, Antonio) so it belongs to the engine, not bolted on. Opened as a bare file with no engine, it says so and tells you how to fix it rather than sitting blank.

## Kill condition

tools/lanConsole-selfcheck.mjs -- a STATIC gate (no browser, so it cannot flake under load). It fails if the console fetches the wrong endpoints, loses its offline path, stops escaping peer text before innerHTML (a peer advertising a service named with a script tag must not run it -- A REGISTRY THAT RENDERS PEER STRINGS RAW IS AN XSS HOLE), drops the reachability dots or the ledger bar, or wanders off the engine's palette.

# Citations

- Code: lan.html + tools/lanConsole-selfcheck.mjs (5 checks, gated, static). Live render verified headless against a mock LAN. THE INVISIBLE BACKEND OF THE LAST SIX ROUNDS NOW HAS A CONSOLE.
- Page: `/lan.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
