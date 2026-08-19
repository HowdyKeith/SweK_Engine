---
type: claim
title: "We were serving OKF and reading none of it -- now the engine reads its own"
description: "Keith asked the sharp question: now that we serve OKF, are we USING it? Honest answer: no. v2623 emitted it, v2624 served it, and nothing read it back -- a knowledge base that is w"
tags: [settled, "swek-engine", v2625]
timestamp: v2625
---

# We were serving OKF and reading none of it -- now the engine reads its own

- **Status:** settled  
- **Since:** v2625

## Prediction

Keith asked the sharp question: now that we serve OKF, are we USING it? Honest answer: no. v2623 emitted it, v2624 served it, and nothing read it back -- a knowledge base that is written and served but never consumed is write-only, decoration with an HTTP route. So this round reads it.

## Why

tools/okf/okfConsume.mjs reads the OKF SURFACE -- it parses each concept's frontmatter tags and the '## Kill condition' section of its markdown body -- exactly what a stranger's agent would do with a bundle it mounted, knowing nothing about how we produced it. THE ONE DISCIPLINE THAT MAKES THIS REAL: it does NOT reach back into predictions.html. Reading the source would be using our data, not the format.

## Measured

It produces a session brief: what the engine is (from the type:system concept), the claim tally by state (from tags), and every OPEN claim with the kill condition that would settle it (from the body) -- the 28 claims still to adjudicate, each now actionable. The engine serves this consumed view at /okf/brief.json and /okf/brief.md, so the produce -> serve -> consume loop is closed IN the engine.

## Kill condition

tools/okf/okfConsume-selfcheck.mjs builds a SYNTHETIC bundle whose claims (SYNTHETIC-ONLY) exist nowhere in predictions.html. THE DECISIVE CHECK: those claims appear in the brief AND are absent from the source -- if the consumer were secretly re-reading the source, claims that live only in the bundle could not appear. SABOTAGES: ignore the frontmatter tags -> 3 checks fail; disable the body section parser -> the kill-condition check fails.

# Citations

- Code: tools/okf/okfConsume.mjs (parseConcept + consumeBundle + briefMarkdown) + tools/okf/okfConsume-selfcheck.mjs (5 checks, gated, 2 sabotages) + /okf/brief.{json,md} in okfBridge.js. A WRITE-ONLY KNOWLEDGE BASE LEARNED TO READ ITSELF.
- Page: `/okf/brief.md`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
