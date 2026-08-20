---
type: claim
title: "The engine already was a knowledge base -- now it emits itself as one"
description: "Item 3: emit the engine's self-knowledge as a Google OKF (Open Knowledge Format v0.1) bundle -- a directory of markdown any agent can read and any git repo can host. The claim: the"
tags: [settled, "swek-engine", v2623]
timestamp: v2623
---

# The engine already was a knowledge base -- now it emits itself as one

- **Status:** settled  
- **Since:** v2623

## Prediction

Item 3: emit the engine's self-knowledge as a Google OKF (Open Knowledge Format v0.1) bundle -- a directory of markdown any agent can read and any git repo can host. The claim: the engine ALREADY holds this knowledge (92 falsifiable claims, 52 round docs, a version log); OKF needs the right envelope, not new content.

## Why

I verified the OKF spec against Google's SPEC.md, not my memory: every CONCEPT frontmatter MUST carry a non-empty type (the only required field); index.md and log.md are reserved and never concepts; frontmatter on an index is permitted ONLY on the root, carrying okf_version 0.1; concepts cross-link with bundle-relative markdown links. emitOKF.mjs reuses the SAME extractClaims the ship gate uses -- one source of truth -- so the page and the bundle cannot drift.

## Measured

Emitted 92 claim concepts (prediction + measurement + kill condition as body, code + page as Citations), 52 doc concepts, an engine.md system concept, per-directory index listings, a version log, and a root index declaring okf_version 0.1 -- 149 files, 243 internal links, all bundle-relative, all resolving.

## Kill condition

okf-selfcheck.mjs emits the bundle FRESH and checks conformance. SABOTAGES caught: a concept with no type -> fail; frontmatter on a non-root index -> fail; a link to a missing file -> fail. Plus completeness: 92 claims in must be 92 concepts out, because A DROPPED CLAIM IS A SILENTLY SHRUNK KNOWLEDGE BASE that still looks complete.

# Citations

- Code: tools/okf/emitOKF.mjs + tools/okf/okf-selfcheck.mjs (5 checks, gated, 3 sabotages) + swek-okf.zip. Generated, not committed -- the gate regenerates and re-checks every ship, so it cannot go stale.
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
