---
type: claim
title: "The engine could already swallow an incremental -- now I can hand it one"
description: "Keith moved us to a workflow of incremental patches during a topic and a full zip only at the end or on request. The engine's RECEIVING side was already built (ai-bridge/incrementa"
tags: [settled, "swek-engine", v2631]
timestamp: v2631
---

# The engine could already swallow an incremental -- now I can hand it one

- **Status:** settled  
- **Since:** v2631

## Prediction

Keith moved us to a workflow of incremental patches during a topic and a full zip only at the end or on request. The engine's RECEIVING side was already built (ai-bridge/incrementalUpdate.js + server.js _applyIncremental: parse, plan, back up, apply, VALIDATE the patched module graph via tools/check.mjs, roll back if broken, stamp version, restart). What was missing was the PRODUCING side -- I had no way to emit a package it would ingest. This adds it.

## Why

tools/makeIncremental.mjs reads the round's changed files from the tree, base64-encodes each, and emits one { type: swek-incremental, toVersion, files:[{path, action, content}] } JSON -- the exact schema the receiver parses. It reuses the RECEIVER's own safeRelPath and compareVersions, so producer and consumer share one definition of a legal path and a newer version; they cannot disagree.

## Measured

The gate is a round-trip through the receiver, not a check against my own idea of the format: a produced package is fed through the receiver's parseManifest -> planUpdate -> applyPlan into a throwaway install root, and lan.html lands byte-identical to the source while a delete is honoured. A stale package (v2000 onto v2500) is refused by the receiver; ../../etc/passwd and /etc/hosts throw at PRODUCE time; every write carries base64 that decodes byte-for-byte to the tree file.

## Kill condition

tools/makeIncremental-selfcheck.mjs. SABOTAGE surface: if the producer emitted the wrong schema, parseManifest would reject it; if base64 were mis-encoded, the round-trip bytes would not match; if it skipped safeRelPath, the traversal test would not throw. A CONTROL THAT CANNOT FAIL IS DECORATION -- so the update that goes backwards is stopped by the receiver, proven here.

# Citations

- Code: tools/makeIncremental.mjs + tools/makeIncremental-selfcheck.mjs (5 checks, gated, round-trips through the real receiver). THIS ROUND SHIPPED AS ITS OWN swek-incremental PACKAGE -- the producer produced its own delivery.
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
