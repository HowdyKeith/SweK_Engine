---
type: claim
title: "The 50-page move was a stale list, and the directory was already categorised"
description: "Keith listed ~50 pages to 'move to Arriving from SweK Engine Pages (Chrome-friendliest)', plus 'The Fabric and Showcase are already buttons on front, so we can DELETE the links.'"
tags: [settled, "swek-engine", v2614]
timestamp: v2614
---

# The 50-page move was a stale list, and the directory was already categorised

- **Status:** settled  
- **Since:** v2614

## Prediction

Keith listed ~50 pages to 'move to Arriving from SweK Engine Pages (Chrome-friendliest)', plus 'The Fabric and Showcase are already buttons on front, so we can DELETE the links.'

## Why

I READ FIRST, AND THE LIST DID NOT MATCH THE FILE. 'SweK Engine Pages' is no longer a flat strip -- it is a CATEGORISED DIRECTORY generated from a GROUPS array (v1561): Control & status, Smart home, Tools, Light demos, 96 pages after the deletion. Keith's 60 named pages ALL live in it, split 14 / 46 across two categories. THEY WERE NEVER SCATTERED OR INVISIBLE -- THEY WERE FILED. My early link-greps kept disagreeing with each other because the pages are DATA ENTRIES in the array, not <a href> links in the source, so `grep href` missed them. THE REAL TOOL (pageReach) settled it: of the 60, ZERO are in the 104-page invisible baseline. The pages Keith 'has not seen' are among the 104, NOT among his named 60.

## Measured

So the big move is NOT the mechanical shuffle it reads as: moving 60 of 96 pages out of a categorised directory into Arriving would make Arriving an 82-item strip -- THE EXACT second directory v2513's own comment forbids -- and gut the organisation Keith already has. I DID NOT DO THAT off a stale snapshot. I DID the one unambiguous, safe part: deleted the two GROUPS entries Keith confirmed are front buttons. Front door re-rendered in a real browser: 96 grid links (was 98), ZERO page errors, Arriving intact, fabric/showcase gone from the grid AND still on their buttons.

## Kill condition

NEW tools/frontDoor-selfcheck.mjs: the GROUPS array must still PARSE AS JSON (a stray comma from deleting two middle entries breaks the whole front door -- sabotage with a dangling comma -> 2 fail), fabric/showcase must be OUT of the directory, AND their front buttons must STILL EXIST -- because IF I MOVED A FILE, I MOVED ITS ASSUMPTIONS AND IT DOESN'T KNOW: deleting the directory link ASSUMED the button exists, so this checks it. Strand the showcase button -> 1 fail. THE DELETE WAS ONLY SAFE BECAUSE THE BUTTON IS REAL, AND NOW THAT IS GATED INSTEAD OF TRUSTED.

# Citations

- Code: server.html (fabric/showcase removed from GROUPS) + tools/frontDoor-selfcheck.mjs (4 checks, gated, 2 sabotages). THE AMBIGUOUS 60-PAGE MOVE IS KEITH'S CALL WITH AN ACCURATE MAP IN HAND: 14 in Control & status, 46 in Tools, none invisible. My honest read: DON'T FLATTEN A WORKING CATEGORISED DIRECTORY INTO AN 82-ITEM STRIP. If specific pages want promoting to Arriving for imminent review, a handful named beats sixty moved.
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
