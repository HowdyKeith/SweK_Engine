---
type: claim
title: mjs is a claim about the parser
description: "Keith's rig, running v2593: `bandit.mjs:208 Uncaught ReferenceError: process is not defined`. A REAL BUG, FOUND BY A REAL BROWSER, WHICH IS WHAT THE RIG IS FOR. (His other console "
tags: [settled, "swek-engine", v2594]
timestamp: v2594
---

# mjs is a claim about the parser

- **Status:** settled  
- **Since:** v2594

## Prediction

Keith's rig, running v2593: `bandit.mjs:208 Uncaught ReferenceError: process is not defined`. A REAL BUG, FOUND BY A REAL BROWSER, WHICH IS WHAT THE RIG IS FOR. (His other console line -- 'a listener indicated an asynchronous response by returning true, but the message channel closed' -- IS A CHROME EXTENSION TALKING TO ITSELF, not our code. It appears on every page he loads. NOT CHASED.)

## Why

brain/bench/bandit.mjs ended with a CLI guard: `if (process.argv[1] && process.argv[1].endsWith('bandit.mjs'))`. And paramecium.html line 99 says `import { ucb1, uniformRandom } from './brain/bench/bandit.mjs';`. `.mjs` TOLD THE BROWSER 'THIS IS AN ES MODULE' -- WHICH WAS TRUE. So it fetched it, parsed it, ran it, and hit a Node global at TOP LEVEL. THE EXTENSION IS A CLAIM ABOUT THE PARSER, NOT ABOUT THE ENVIRONMENT. THERE IS NO SUCH THING AS A BROWSER-SAFE FILE EXTENSION -- which is the honest answer to Keith's .mjs question, and the bug is the proof.

## Measured

THE AUDIT FOUND TWO MORE THAT WERE JUST WAITING. bz/net/bzfsClient.mjs:407 -- `if (import.meta.url === file://${process.argv[1]})` -- TOP LEVEL, IDENTICAL BUG, has never crashed because NOBODY HAS OPENED THE PAGE THAT IMPORTS IT YET. brain/bench.mjs:27 AND :39 -- `typeof Deno !== 'undefined' ? Deno.args : process.argv.slice(2)` -- SOMEBODY ALREADY THOUGHT ABOUT A SECOND RUNTIME AND MADE NODE THE FALLBACK. A BROWSER IS NOT NODE. Those are inside functions so they only break WHEN CALLED: A BUG THAT WAITS FOR A FUNCTION CALL IS STILL A BUG, IT IS JUST POLITER ABOUT WHEN IT TELLS YOU. All four sites guarded with `typeof process !== 'undefined' && process.versions?.node`, and A REAL CHROMIUM NOW LOADS paramecium.html WITH ZERO PAGE ERRORS -- fixed IN A BROWSER, NOT IN THEORY. The canvas reports 720x460 with a live context, which answers the first half of a RIG-ONLY QUESTION that has been on the list for versions (whether it draws the RIGHT THING still needs eyes: A CONTEXT IS NOT A PICTURE).

## Kill condition

Restore the original guard: 2 checks fail. The gate also proves it recognises the bug's exact shape on a synthetic file, and does NOT flag a correctly guarded use -- A GATE THAT CANNOT BE SATISFIED GETS SWITCHED OFF, and A GATE THAT HAS NEVER SEEN THE BUG IT CLAIMS TO CATCH IS A PROMISE, NOT A CHECK.

# Citations

- Code: brain/bench/bandit.mjs, bz/net/bzfsClient.mjs, brain/bench.mjs + NEW tools/ship/browserSafety-selfcheck.mjs (7 checks, gated, sabotage-tested). SEVENTH EXPIRED BLOCKER: 'browser-path tests are rig-only' has been true for this engine's whole life BECAUSE THE SERVER WILL NOT BOOT HERE -- but THE SERVER WAS NEVER THE REQUIREMENT, SERVING WAS. Playwright intercepts every request and hands back the file, so ES modules resolve and the page runs. THIS GATE LOADS ONE OF THIS ENGINE'S OWN PAGES IN A REAL BROWSER, WHICH HAS NEVER HAPPENED BEFORE. THREE OF MY OWN INSTRUMENTS WERE BROKEN IN ONE ROUND, ALL THE SAME DISEASE. (1) MY FIRST AUDIT COULD NOT SEE THE FILE THE RIG CRASHED ON: I grepped `from \"...\"` with DOUBLE quotes and paramecium.html uses SINGLE quotes. (2) I fixed the first two grep hits and walked past the third and fourth -- MY OWN GATE CAUGHT BOTH ON ITS FIRST RUN, WHICH IS THE ENTIRE ARGUMENT FOR WRITING THE GATE INSTEAD OF THE PATCH. (3) THE GATE FLAGGED TWO SAFE LINES INSIDE `if (IS_NODE && ...)` BECAUSE A LINE-BASED GATE CANNOT SEE A BLOCK -- and when I taught it brace depth it STILL failed, because MY COMMENT STRIPPER ATE A URL: bzfsClient.mjs:410 contains `file://`, my regex stripped from the `//` to end of line INCLUDING THE OPENING BRACE, so the tracker never saw the guard open. v2573 coined A REGEX THAT GREPS PROSE WILL FIND PROSE; THIS IS ITS SIBLING -- A REGEX THAT STRIPS COMMENTS WILL STRIP A URL. A GATE THAT CRIES WOLF GETS SWITCHED OFF, WHICH IS WORSE THAN NO GATE, because the whole point is that someone believes it at 2am.
- Page: `/paramecium.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
