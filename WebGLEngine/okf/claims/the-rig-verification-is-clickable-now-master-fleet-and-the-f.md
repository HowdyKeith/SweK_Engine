---
type: claim
title: "The rig verification is clickable now -- master, fleet, and the full gate suite run from a button in server.html"
description: "The verification spine stops being command-line only. A Rig Verify panel in the console runs three checks on the box you are sitting at: a master check that computes this machine's"
tags: [settled, "swek-engine", v2751]
timestamp: v2751
---

# The rig verification is clickable now -- master, fleet, and the full gate suite run from a button in server.html

- **Status:** settled  
- **Since:** v2751

## Prediction

The verification spine stops being command-line only. A Rig Verify panel in the console runs three checks on the box you are sitting at: a master check that computes this machine's fingerprint and compares it to the baseline, a fleet check that asks every peer for its master and flags divergence, and a run-gates button that runs the whole self-check suite and reports pass or fail. The master check reads the expected value from BASELINE.md rather than a hardcoded hash, so it stays correct across master moves instead of going stale.

## Why

server.html gains a verify tab and panel with three buttons; ai-bridge/server.js gains a /verify/gates route that spawns the gate suite and returns the tail plus a fail count, and its /fingerprint/master route now also reads BASELINE.md and returns the baseline and a match flag. The panel colors its tab check or cross by the result.

## Measured

The master route computes fc1a4056 and reads the same value from the baseline, so the match flag is true and the button shows PASS on a good box; the gate route runs check.mjs and returns its exit code and a fail count; the panel wiring parses and mounts through the same generic tab toggle as every other panel.

## Kill condition

Open server.html, open Rig Verify, and click Master check -- a box on the baseline shows PASS, a diverged box shows the mismatch and both hashes. Run gates should return pass or a fail count in ten to thirty seconds. HONEST SCOPE: the buttons drive real routes on a running server, so they are exercised live on the rig, not in the headless gate; the onset sweep stays command-line because it is minutes-scale. The master check is only as honest as BASELINE.md, which the ship ritual regenerates every master move.

# Citations

- Code: server.html Rig Verify panel + ai-bridge/server.js /verify/gates and the baseline-aware /fingerprint/master. The verification spine, one click away instead of a terminal.
- Page: `server.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
