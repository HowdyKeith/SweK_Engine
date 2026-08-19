---
type: claim
title: Download only the newest incremental and you still get everything
description: "Keith asked the question that catches the flaw: if I release three incrementals and he downloads only the most recent, does it include the ones he skipped? It did NOT. Each package"
tags: [settled, "swek-engine", v2633]
timestamp: v2633
---

# Download only the newest incremental and you still get everything

- **Status:** settled  
- **Since:** v2633

## Prediction

Keith asked the question that catches the flaw: if I release three incrementals and he downloads only the most recent, does it include the ones he skipped? It did NOT. Each package carried only its own round's files, and the receiver checks newer, not applied-everything-between -- so applying v2632 onto v2630 would succeed with a silent hole where v2631's files should be. This makes incrementals cumulative since the last full baseline.

## Why

makeIncremental.mjs now keeps a running manifest of every path touched since the baseline (reset by a full-zip ship). Each package carries the WHOLE accumulated set at current content, with fromVersion = the baseline. So the newest package alone is sufficient for anyone at or after the baseline; a skipped intermediate leaves no hole because its files ride along in the next one.

## Measured

The gate simulates two rounds on a baseline and proves the SECOND package alone -- applied by someone who skipped the first -- lands BOTH rounds files. And it is applied through the real receiver planUpdate/applyPlan, not a mock. This v2633 package retroactively carries v2631 (makeIncremental) + v2632 (OKF components) + v2633, so anyone still on the v2630 baseline gets all three at once.

## Kill condition

tools/makeIncremental-selfcheck.mjs, 6th check: reset a baseline, accumulate round 1 (a file the user skips) then round 2, emit at round 2, and require BOTH files present in the package AND both landing when it is applied alone onto the baseline. SKIP AN INTERMEDIATE INCREMENTAL AND YOU STILL GET EVERYTHING -- if the manifest did not accumulate, round 1s file would be missing and the check fails.

# Citations

- Code: tools/makeIncremental.mjs (loadManifest/accumulate/resetBaseline/emitCumulative + cumulative CLI) + tools/makeIncremental-selfcheck.mjs (6 checks, gated, cumulativity round-trip). A full-zip ship calls --reset-baseline to start the next window.
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
