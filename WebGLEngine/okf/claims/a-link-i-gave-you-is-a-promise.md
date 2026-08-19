---
type: claim
title: A link I gave you is a promise
description: "Keith: 'i got 2599, but you were working on 2600.' HE CAUGHT A REAL SHIP-RITUAL BUG BY NOTICING THE VERSION MOVED UNDER HIM."
tags: [settled, "swek-engine", v2601]
timestamp: v2601
---

# A link I gave you is a promise

- **Status:** settled  
- **Since:** v2601

## Prediction

Keith: 'i got 2599, but you were working on 2600.' HE CAUGHT A REAL SHIP-RITUAL BUG BY NOTICING THE VERSION MOVED UNDER HIM.

## Why

v2599 was presented to him WITH A LINK. A later v2600 ship ran, and step [10] said 'published, removed 1 older zip(s)' -- THAT WAS v2599, DELETED WHILE ITS LINK WAS STILL THE ONE ON HIS SCREEN. He got the file in time; THE LINK DID NOT SURVIVE THE NEXT TURN. And the old rule's reasoning was GOOD, which is why it lasted: ONE ZIP PER TURN, because 'an outputs folder with three versions in it is three chances to hand him the wrong one'. IT OPTIMISED FOR NO-AMBIGUITY AND PAID FOR IT WITH A DEAD LINK, AND ONLY ONE OF THOSE TWO COSTS IS VISIBLE FROM INSIDE THE SANDBOX. A LINK I GAVE YOU IS A PROMISE, AND THE TRIM WAS BREAKING IT ON MY BEHALF, SILENTLY, ONE TURN LATER.

## Measured

Checked rather than explained: outputs held ONLY SweK_Engine_v2600.zip (18,194,923 bytes); v2599 was gone; /tmp/ship2600.log timestamped 22:13 against ship2599.log at 21:48, with step [6] 'SweK_Engine_v2599 -> SweK_Engine_v2600' and step [10] 'removed 1 older zip(s)'. I CANNOT ACCOUNT FOR WHO ISSUED THAT v2600 RUN -- IT IS NOT IN THE CONVERSATION, AND I AM NOT INVENTING AN EXPLANATION FOR IT. What IS checkable: the v2600 tree is a STRICT SUPERSET of v2599 -- mathProbe.mjs, pageFingerprint.mjs, blobarium.html, blobThermal.js, blobBodies.js all present, ENGINE_VERSION and BRAIN_BUILD both v2600. NOTHING KEITH HAS IS STALE OR MISSING. THE FIX: keep CURRENT + PREVIOUS (KEEP = 2). A LINK I GAVE YOU SURVIVES AT LEAST UNTIL I GIVE YOU THE NEXT ONE -- a rule I can actually keep -- while still refusing to let a third stale version pile up.

## Kill condition

Restore KEEP = 1 and the promise check fails. AND THE ONE THAT WOULD HAVE DETONATED AT v3000: the comparator sorts NUMERICALLY, because AS STRINGS \"v2999\" > \"v3001\" -- a text sort would keep v2999 AND DELETE THE ZIP IT JUST PUBLISHED. That bug would have worked perfectly for four hundred versions and then gone off, WHICH IS ROUGHLY FOUR HUNDRED SHIPS FROM TODAY. Sabotage it to .sort().reverse() and the gate fails.

# Citations

- Code: tools/ship/ship.mjs (trim rewritten) + tools/ship/trim-selfcheck.mjs (6 checks, gated, TWO sabotages). The last check GREPS THE REAL ship.mjs for `const KEEP = 2` AND for the numeric comparator, because v2591 taught that A GATE HOLDING ITS OWN COPY OF THE LOGIC WILL PASS FOREVER WHILE THE REAL FILE ROTS -- THE RULE IT TESTS HAS TO BE THE RULE THAT SHIPS.
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
