---
type: claim
title: A page hash is a lie
description: "Keith, TWO asks in one message. (1) 'we could update the Render QA so it separates the Non working on the result report tab, and then another tab with the successful 0 error ones, "
tags: [open, "swek-engine", v2598]
timestamp: v2598
---

# A page hash is a lie

- **Status:** open  
- **Since:** v2598

## Prediction

Keith, TWO asks in one message. (1) 'we could update the Render QA so it separates the Non working on the result report tab, and then another tab with the successful 0 error ones, so i could just copy the result report back to you.' (2) 'if we ran the test already, and it is still the same version of page, then we wouldnt have to re run the test, only do the ones that have never run / or are new.' OPEN until he runs render QA on Galaxina and pastes the copyable report back.

## Why

AND HE SAVED ME A WASTED ROUND: I was about to load all 239 pages in the sandbox to find what his rig found. HE HAD ALREADY RUN RENDER QA ON ALL OF THEM AND REVIEWED IT. My headless shell probably cannot even give a real WebGL2 context -- HIS DATA IS BETTER THAN MY DATA WOULD HAVE BEEN. The bottleneck was never the running; IT WAS THAT THE REPORT WAS NOT COPYABLE.

## Measured

THE TABS: the old report was ONE FLAT WALL of cards, PASS and FAIL interleaved, 239 of them, each with a screenshot. To send me the failures he would have had to HAND-PICK THEM OUT OF THE NOISE, and A REPORT YOU HAVE TO HAND-EDIT BEFORE SENDING IS A REPORT THAT DOES NOT GET SENT. Now: failures first (that tab opens), clean ones behind a second tab, and a COPYABLE REPORT tab emitting PLAIN TEXT with ONLY the diagnostic fields -- the page, the FAILED checks, and the CONSOLE ERRORS. Not the passing checks, not the screenshots, not the stats of pages that are fine. The console errors are the whole point: `bandit.mjs:208 Uncaught ReferenceError: process is not defined` came out of exactly that field and was a REAL BUG IN THREE FILES (v2594). Also written to failures.txt, BECAUSE A CLIPBOARD IS NOT A PAPER TRAIL. And the copy button uses execCommand FIRST: it is deprecated AND it is the one that works without a secure context -- THE RIG SERVES PLAIN HTTP ON THE LAN, WHERE navigator.clipboard IS UNDEFINED. THE CACHE, AND THE TRAP INSIDE KEITH'S IDEA: A PAGE HASH IS A LIE. Measured before writing a line -- blob-selfie.html hash BEFORE touching blobPhantom.js: 429782100090. AFTER: 429782100090. IDENTICAL. THE PAGE HASH DOES NOT SEE ITS OWN DEPENDENCIES. AND THAT IS EXACTLY THE BUG HIS RIG FOUND: paramecium.html NEVER CHANGED -- bandit.mjs was what broke it. NAIVE PAGE-HASH CACHING WOULD HAVE SKIPPED paramecium.html FOREVER AND NEVER FOUND IT. THE CACHE WOULD HAVE BEEN FASTEST AT EXACTLY THE MOMENT IT WAS MOST WRONG. So the key is the TRANSITIVE IMPORT CLOSURE: blob-selfie.html 8 files, blobarium.html 6 (blobPhantom, blobBodies, blobThermal, blobCut, box3dLoader), paramecium.html 4 -- AND ITS CLOSURE CONTAINS bandit.mjs, WHICH IS THE ENTIRE POINT. Driven for real: run 1 cold ran 3 skipped 0; run 2 unchanged ran 0 SKIPPED 3 (THAT IS THE FOURTEEN MINUTES -- 239 pages at ~3.5s of settle each); run 3 touch physics/blobThermal.js -> ran 1, skipped 2, AND THE ONE THAT RE-RAN WAS blobarium.html, THE ONLY PAGE WHOSE CLOSURE CONTAINS IT.

## Kill condition

Galaxina: run render QA twice. The second should skip everything unchanged and take seconds. Touch one module and only its dependents should re-run. --all forces everything, BECAUSE A CACHE THAT CANNOT BE OVERRIDDEN IS A BUG THAT CANNOT BE FIXED. AN UNCHANGED *FAILING* PAGE STILL RE-RUNS: (1) you fix things and want to watch them go green, and (2) A FAILURE IS A CLAIM ABOUT THE WORLD, NOT ABOUT THE FILE -- it may have failed because of the browser, the driver, a port, or the weather, AND SKIPPING IT WOULD FREEZE A VERDICT THAT WAS NEVER ABOUT THE BYTES. A CORRUPT OR MISSING CACHE MEANS RUN EVERYTHING, NEVER SKIP EVERYTHING: A CACHE THAT FAILS TOWARDS SKIPPING IS A CACHE THAT HIDES BUGS, SILENTLY AND FAST, which is the worst combination available.

# Citations

- Code: tools/render-qa/render-qa.mjs (report rewritten + skip wired) + tools/render-qa/pageFingerprint.mjs + tools/render-qa/pageFingerprint-selfcheck.mjs (14 checks, gated, THREE sabotages: hash the page only -> 1 fails; skip failing pages too -> 1 fails; corrupt cache means skip -> 2 fail). WHAT THE CLOSURE STILL CANNOT SEE, SAID PLAINLY RATHER THAN DISCOVERED: it covers STATIC IMPORTS ONLY. NOT a page that fetches JSON at runtime, NOT a shader pulled by a name built at runtime, NOT an <img> or a .wasm, NOT a change in the BROWSER, NOT a change in the GPU DRIVER. THOSE ARE REAL AND THIS DOES NOT CATCH THEM -- which is why --all exists and why the fingerprint is ADVISORY, NOT AUTHORITATIVE. AND THE ONE THAT SHOULD EMBARRASS ME: my Python anchor failed to match `for (const pg of pages) { qaIndex++; }` because I had copied the indentation OUT OF MY OWN TERMINAL, where a `sed 's/^/  /'` display filter had added two spaces to every line. I HAVE SPENT THIS ENTIRE SESSION CATCHING MYSELF GUESSING AT CODE INSTEAD OF READING IT, AND THIS TIME I GUESSED AT MY OWN PRETTY-PRINTER.
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
