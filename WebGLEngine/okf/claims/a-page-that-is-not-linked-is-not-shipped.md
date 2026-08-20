---
type: claim
title: A page that is not linked is not shipped
description: "Keith: 'Do we have a Krbn link in the Arriving Pages section?' NO. I built krbn.html in v2608, gated it, rendered it in a real browser, wrote a claim about it -- AND LINKED IT FROM"
tags: [settled, "swek-engine", v2609]
timestamp: v2609
---

# A page that is not linked is not shipped

- **Status:** settled  
- **Since:** v2609

## Prediction

Keith: 'Do we have a Krbn link in the Arriving Pages section?' NO. I built krbn.html in v2608, gated it, rendered it in a real browser, wrote a claim about it -- AND LINKED IT FROM NOWHERE. It appeared in exactly ONE place in the whole tree: inside predictions.html, IN MY OWN CLAIM ABOUT ITSELF. He would have had to type the URL out of a changelog.

## Why

So I counted, and it was not one page: 239 .html in the tree root, 133 linked from server.html, 106 INVISIBLE -- FORTY-FOUR PERCENT. AND blobarium.html WAS ONE OF THEM: the page the entire aquarium arc is about, the one with the vitals, THE ONE I ASKED HIM TO OPEN IN FIVE SEPARATE ROUNDS AND DRAG THE WARMTH SLIDER ON. Never linked from anything. He would have had to type it. HIS OWN SENTENCE WAS THE BUG REPORT AND I DID NOT HEAR IT: 'inside SweK Engine Pages we have some new pages that i have not seen'. HE HAS BEEN DISCOVERING HIS OWN WORK BY ACCIDENT.

## Measured

krbn.html and blobarium.html now sit at the head of the Arriving row -- v2513 built ARRIVING PAGES as an INBOX: new work lands there, Keith reviews it, it moves to a panel. BUT THE INBOX ONLY WORKS IF ARRIVING IS AUTOMATIC, AND AN INBOX YOU HAVE TO REMEMBER TO PUT THINGS IN IS A PILE. So the link is not the fix -- THE RATCHET IS. tools/pageReach-baseline.json records the 104 pages that were ALREADY invisible today; the list MAY SHRINK AND MAY NEVER GROW. A NEW PAGE THAT NOTHING LINKS TO FAILS THE SHIP, which means THE ONLY WAY TO ADD A PAGE IS TO DECIDE WHERE IT GOES. I did NOT gate at zero: that would mean triaging 104 pages right now by guessing what Keith wants, and I WOULD GET IT WRONG. A ratchet stops the bleeding without pretending I can triage work I do not understand.

## Kill condition

Create a brand-new page nothing links to -> 2 checks fail (THE EXACT krbn.html BUG). Unlink krbn.html again -> 3 fail. The excuse list is A LINE PER PAGE WITH A REASON, NOT A WILDCARD, on purpose: if it were `*-test.html` then a page called blobarium-test.html WOULD VANISH SILENTLY, WHICH IS THE EXACT BUG THIS EXISTS FOR. NOT CLAIMING THIS PROVES THE LINK WORKS: it checks server.html MENTIONS THE FILENAME. Not that it is in the right section, not that it is uncommented, not that the href resolves. THAT IS A WEAK CHECK AND I AM SAYING SO -- but it is the check that would have caught krbn.html and blobarium.html, WHICH IS THE BUG I ACTUALLY HAVE. render-qa checks pages LOAD; this only checks they can be FOUND.

# Citations

- Code: tools/pageReach.mjs + tools/pageReach-baseline.json (104, ratchet) + tools/pageReach-selfcheck.mjs (9 checks, gated, TWO sabotages) + server.html Arriving row.
- Page: `/krbn.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
