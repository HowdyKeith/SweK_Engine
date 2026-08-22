---
type: claim
title: "No browser page imports a Node builtin, so the pages actually load -- guarded so the render-QA regression cannot return"
description: "A module a browser page imports must not pull in a Node builtin -- node:url, node:fs, node:crypto -- at the top level, because the browser cannot load those and the whole page dies"
tags: [settled, "swek-engine", v2762]
timestamp: v2762
---

# No browser page imports a Node builtin, so the pages actually load -- guarded so the render-QA regression cannot return

- **Status:** settled  
- **Since:** v2762

## Prediction

A module a browser page imports must not pull in a Node builtin -- node:url, node:fs, node:crypto -- at the top level, because the browser cannot load those and the whole page dies on the builtin. The v2759 Windows-path fix broke exactly this: it added an import of node:url to fingerprint.mjs, bzfsClient.mjs and attest.mjs, which case-study, verify, bzflag and catalog all reach, and every one of those pages went black in render QA. The fix imports Node builtins lazily inside a process guard, never at module scope, and a gate walks the import graph out from every page so a top-level node import can never reach a browser again.

## Why

The CLI guards now read `if (typeof process !== undefined) { const { pathToFileURL } = await import(node:url); ... }` -- the dynamic import runs only under Node, and the browser short-circuits before it. SUBSYSTEM_SOURCES, the one thing catalog needed from the ledger, moved to a data-only module so catalog stops dragging in node:crypto and node:fs. tools/ship/browserNodeGuard-selfcheck.mjs walks every module reachable from every .html and fails on any top-level node import.

## Measured

browserNodeGuard-selfcheck.mjs walks the modules reachable from every page and passes only when none imports node:* at module scope -- and on its first run it caught attest.mjs, reached from verify.html, which the fingerprint fix alone would have left broken. Master unchanged at 347be101; the guards moved, the computation did not.

## Kill condition

tools/ship/browserNodeGuard-selfcheck.mjs. SABOTAGE: add a top-level node import back to any browser-reachable module and the graph walk finds it. HONEST SCOPE: this guards the browser-load path, not that every page then renders correctly -- render QA is the broader check. It proves the pages can load at all, which is the thing v2759 took away.

# Citations

- Code: tools/fingerprint/fingerprint.mjs + attest.mjs, bz/net/bzfsClient.mjs, tools/ledger/subsystemSources.mjs (new), and tools/ship/browserNodeGuard-selfcheck.mjs. The render QA sweep found four dead pages; the fix is guarded so the fifth never happens.
- Page: `case-study.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
