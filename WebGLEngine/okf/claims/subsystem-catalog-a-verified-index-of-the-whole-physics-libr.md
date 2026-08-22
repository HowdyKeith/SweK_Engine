---
type: claim
title: "Subsystem catalog -- a verified index of the whole physics library that cannot drift"
description: "Twenty-seven deterministic subsystems is a large enough library that it needs a table of contents -- but a hand-written index rots: modules move, gates are renamed, hashes go stale"
tags: [settled, "swek-engine", v2684]
timestamp: v2684
---

# Subsystem catalog -- a verified index of the whole physics library that cannot drift

- **Status:** settled  
- **Since:** v2684

## Prediction

Twenty-seven deterministic subsystems is a large enough library that it needs a table of contents -- but a hand-written index rots: modules move, gates are renamed, hashes go stale, and the index quietly lies. The catalog should instead hold only the human part (a one-line blurb, the falsifying gate) and merge everything else from the sources of truth that already exist, then be checked against reality every ship so it cannot drift.

## Why

tools/catalog/catalog.mjs. buildCatalog merges each subsystem's live hash from computeFingerprint with its module list from the ledger SUBSYSTEM_SOURCES and the catalog blurb, one row per subsystem in fingerprint order. The hashes are the fingerprint\'s own and the modules the ledger\'s, so nothing is duplicated to drift. catalog.html renders it (rig-only) and CATALOG.md is the generated Markdown.

## Measured

tools/catalog/catalog-selfcheck.mjs, 5 checks. Completeness runs both ways -- every fingerprint subsystem is catalogued and every catalog entry is a real subsystem; every module file the catalog lists is on disk; every gate it names exists; every hash equals the live fingerprint\'s; and the generated Markdown lists all 27 and the master. Wired into server.html.

## Kill condition

tools/catalog/catalog-selfcheck.mjs. SABOTAGE: drop a subsystem from the catalog and the both-ways completeness check fails at once, naming the gap. A CATALOG THAT IS NOT CHECKED AGAINST REALITY IS JUST A CLAIM; this one is checked against the fingerprint and the filesystem on every ship, so it is always exactly the library. No new computation -- master unchanged at 1613829e.

# Citations

- Code: tools/catalog/catalog.mjs (buildCatalog merges fingerprint hash + ledger modules + blurbs; catalogMarkdown) + tools/catalog/catalog-selfcheck.mjs (5 checks, gated, sabotage-tested) + tools/catalog/CATALOG.md (generated) + catalog.html (rig-only render) + link in server.html. The table of contents, checked against the book.
- Page: `catalog.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
