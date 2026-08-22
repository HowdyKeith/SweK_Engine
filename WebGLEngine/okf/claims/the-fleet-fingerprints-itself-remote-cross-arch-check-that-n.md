---
type: claim
title: "The fleet fingerprints itself -- remote cross-arch check that names the diverging science"
description: "The cross-architecture fingerprint is only useful if running it on every machine is easy. Instead of hand-running it on Galaxina and the arm64 Mac and eyeballing two hashes, the pe"
tags: [open, "swek-engine", v2655]
timestamp: v2655
---

# The fleet fingerprints itself -- remote cross-arch check that names the diverging science

- **Status:** open  
- **Since:** v2655

## Prediction

The cross-architecture fingerprint is only useful if running it on every machine is easy. Instead of hand-running it on Galaxina and the arm64 Mac and eyeballing two hashes, the peer dashboard asks every peer for its fingerprint and shows who agrees -- and if they do not, WHICH science diverged on WHICH machine, because the per-subsystem hashes are compared, not just the master.

## Why

ai-bridge/fingerprintBridge.js. GET /fingerprint returns this box\'s { arch, master, subsystems }; POST /fingerprint/collect fetches every peer\'s /fingerprint and compares. The comparison is a pure function: it groups peers by master, and for each subsystem finds the majority hash and lists the peers that differ, so the output is not just agree/disagree but the exact set of (science, machine) divergences. fingerprint.html drives it from the dashboard; the route is wired beside /rig/run.

## Measured

RIG-ONLY to settle (needs real peers): the gate proves the comparison on synthetic fleets -- it agrees when all agree, and when one peer differs in exactly one subsystem it names that subsystem AND that peer and nothing else; a master-only view is shown to miss that localisation; unreachable peers are reported, not fatal; and GET /fingerprint yields a real 6-subsystem fingerprint with an arch tag. Settles when the real fleet (Galaxina x86_64 + the M-series arm64 Mac) is collected and the dashboard shows agreement.

## Kill condition

ai-bridge/fingerprintBridge-selfcheck.mjs. SABOTAGE: compare only the master hash and drop the per-subsystem view -- you learn THAT the fleet diverged but not WHICH science, and the localisation check fails. A cross-arch reproducibility tool that cannot point at the broken subsystem sends you into a blind bisect.

# Citations

- Code: ai-bridge/fingerprintBridge.js (GET /fingerprint + POST /fingerprint/collect + compareFingerprints, pure) + ai-bridge/fingerprintBridge-selfcheck.mjs (5 checks, gated, sabotage-tested) + fingerprint.html (dashboard, linked from server.html) + wired into ai-bridge/server.js. The one-command whole-engine reproducibility proof, now fleet-wide and self-localising.
- Page: `fingerprint.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
