---
type: claim
title: "SweK's routes are exposed as ChatGPT App widgets, so a fleet can be checked and driven from a chat"
description: "SweK reaches ChatGPT. Two widgets, built on FastApps over the OpenAI Apps SDK and FastMCP, wrap SweK server routes: one asks a box to run the fleet fingerprint check and shows whic"
tags: [settled, "swek-engine", v2748]
timestamp: v2748
---

# SweK's routes are exposed as ChatGPT App widgets, so a fleet can be checked and driven from a chat

- **Status:** settled  
- **Since:** v2748

## Prediction

SweK reaches ChatGPT. Two widgets, built on FastApps over the OpenAI Apps SDK and FastMCP, wrap SweK server routes: one asks a box to run the fleet fingerprint check and shows which peers agree on the master and which diverge; the other generates the exact 4D ground truth and shows a cheat estimator scoring near zero against honest guesses that must pay for depth. Each widget is a Python tool that calls a route and a React component that renders the result, so a SweK fleet can be inspected and driven from a chat window.

## Why

integrations/fastapps: fingerprint_check.py + FingerprintCheck.jsx call POST /fleet/fingerprint-check; ground_truth.py + GroundTruth.jsx call GET /groundtruth/summary, a route added for this that computes the benchmark stats and naive estimator scores. Both point at a SweK server by base_url. A README covers install, the dev server, and connecting the /mcp endpoint to ChatGPT.

## Measured

The Python tools compile; the ground-truth route resolves and returns the scene size, visible fraction, and the cheat, mid-depth and near-plane end-point errors (about 1e-15, 0.9, 3.0 for a sample seed); the fingerprint route already existed. The widgets read exactly the fields those routes return.

## Kill condition

Run the FastApps dev server, connect its /mcp URL to ChatGPT, and ask it to check the SweK fleet fingerprint: the widget must show the peers and the master. HONEST SCOPE: this is a distribution surface, not an engine change -- the determinism and the fingerprint live in SweK, and these widgets only call its routes and render what comes back. The live ChatGPT connection is run on the machine; the tools and the route are what is verified here.

# Citations

- Code: integrations/fastapps/ (two Python tools, two React components, a README) + the new /groundtruth/summary route in ai-bridge/server.js. SweK, callable from a chat.
- Page: `server.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
