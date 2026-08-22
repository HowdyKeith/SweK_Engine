---
type: claim
title: "The selfchecks and the server survive Windows path semantics -- guarded so the rig-test bugs cannot come back"
description: A fleet fingerprint pass on Windows surfaced a cluster of failures that had nothing to do with the physics and everything to do with two path idioms that read fine on Linux and bre
tags: [settled, "swek-engine", v2759]
timestamp: v2759
---

# The selfchecks and the server survive Windows path semantics -- guarded so the rig-test bugs cannot come back

- **Status:** settled  
- **Since:** v2759

## Prediction

A fleet fingerprint pass on Windows surfaced a cluster of failures that had nothing to do with the physics and everything to do with two path idioms that read fine on Linux and break silently on Windows. new URL(import.meta.url).pathname yields a leading-slash path that path.join turns into C:\\C:\\... -- eight bz selfchecks could not find their own map. And import.meta.url === file-slash-slash process.argv[1] never matches on Windows, so a command's main-module block never runs -- blobTrainer --save silently did nothing, and node fingerprint.mjs would not even print the MASTER line. Both are fixed everywhere, with fileURLToPath and pathToFileURL, and a gate greps the tree so neither can return.

## Why

fileURLToPath replaces new URL(...).pathname in the eight bz tools plus okfConsume, pageReach, and rocketsimBackend; pathToFileURL(process.argv[1]).href replaces the fragile main-module guard in twelve files including fingerprint.mjs and ledger.mjs. The server guards its ws require like it already guards mdns, with a null-object wss so every broadcast site stays safe and a fresh machine boots degraded instead of crashing on boot. ev-selfcheck skips cleanly with no data file instead of erroring; fingerprintBridge checks the real subsystem count instead of a stale 6; launcherExit verifies structure honestly instead of a platform-inverted always-fail.

## Measured

tools/ship/winPathGuard-selfcheck.mjs greps every mjs and js file and passes only when the tree is free of both idioms -- it is, so every straggler was caught, not just the ones the rig happened to hit. blob-policy went from 3 of 7 to 7 of 7 once --save actually ran; the fingerprint MASTER is unchanged at 347be101, proving the guard fix touched the CLI wrapper and never the computation.

## Kill condition

tools/ship/winPathGuard-selfcheck.mjs. SABOTAGE: reintroduce either idiom in any file and the grep finds it and the gate fails. HONEST SCOPE: this is a source-level guard against two specific patterns -- it does not prove the launcher runs (cmd.exe is not here) or that a fresh Windows machine boots (that is the freshMachine gate on the rig). It proves the idioms are gone, which is what let the rig test fail in the first place. The Windows behavior itself is confirmed on Keith's boxes, not in this sandbox.

# Citations

- Code: the eight bz/tools selfchecks, tools/fingerprint/fingerprint.mjs, tools/ledger/ledger.mjs, brain/blobTrainer.mjs, ai-bridge/server.js, and tools/ship/winPathGuard-selfcheck.mjs. The rig test did its job -- it caught what the Linux sandbox never could -- and the fix is guarded so the next rig test starts clean.
- Page: `server.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
