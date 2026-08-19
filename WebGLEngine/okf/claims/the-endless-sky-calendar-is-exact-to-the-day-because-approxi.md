---
type: claim
title: "The Endless Sky calendar is exact to the day, because approximately right is a save file that disagrees with itself"
description: "A port that gets dates ALMOST right is worse than one that has none, because Endless Sky stores condition values its own writers computed with Date DaysSinceEpoch and then compares"
tags: [settled, "swek-engine", v2864]
timestamp: v2864
---

# The Endless Sky calendar is exact to the day, because approximately right is a save file that disagrees with itself

- **Status:** settled  
- **Since:** v2864

## Prediction

A port that gets dates ALMOST right is worse than one that has none, because Endless Sky stores condition values its own writers computed with Date DaysSinceEpoch and then compares them as plain numbers. An off-by-one does not look like a date bug when it surfaces -- it looks like a mission that will not offer, or one that offers a year early, in content nobody suspects. So the calendar must agree with the original to the day, including the leap rule, and not merely to the month.

## Why

ev/esDate.js implements the calendar directly rather than delegating to JavaScript Date, whose month indexing and local-time drift are exactly the sort of thing that produces an off-by-one nobody notices until a save file is a year out.

## Measured

ev/tools/es-date-selfcheck.mjs, 29 checks, all passing. The spine: stepping 365 single days lands on exactly the same value as one 365-day jump, so the increment and the arithmetic agree with each other rather than merely each looking plausible. Leap years are checked at real boundaries, including that 3013 is NOT one.

## Kill condition

ev/tools/es-date-selfcheck.mjs. Any single-day step that disagrees with the equivalent jump kills it, and so does any leap-year boundary the century rule gets wrong. HONEST SCOPE: this proves OUR calendar is self-consistent and follows the stated rule. It does not diff against a running copy of Endless Sky -- that is a rig job with the real binary.

# Citations

- Code: ev/esDate.js + ev/tools/es-date-selfcheck.mjs.
- Page: `ev.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
