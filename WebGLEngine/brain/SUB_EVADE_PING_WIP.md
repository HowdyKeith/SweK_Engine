# Submarine duel: is pingEvery a piece of league7100's lead? The read with a smaller bar (REGISTRATION 14 of the evade reads; 2026-11-17; UNNUMBERED; REGISTERED BEFORE ANY CODE FOR IT IS WRITTEN AND BEFORE ANY GEOMETRY OF ITS SETS IS FLOWN)

Keith, 2026-11-17: "lets do the pingEvery read with the smaller bar". This is the candidate the backlog's E1 section left (`brain/BACKLOG_2026-11-01.md`): **pingEvery alone, grafted from league7100 onto league7001 and exploit7204, was +0.313, +0.349 (DEV) and +0.305, +0.255 (HELD) in `SUB_EVADE_MOVE_WIP.md`: four reads of the same sign, each at z of about 2 and each under the registered bar of 0.5**, so by the rules of that note pinging is not a second piece, and the sub-bar numbers were labelled post-hoc. **This note registers the bar at 0.25 before any geometry of its sets is flown and reads the piece on new geometries.**

**What this changes in shared files, said first: nothing.** New files only: this note, `tools/ship/takeEvadePing.mjs` (the command), `tools/ship/takeEvadePing-selfcheck.mjs` (its gate), `brain/subEvadePingDev.json` and `brain/subEvadePingHeld.json`. It imports, and does not edit, `tools/ship/takeEvadeTurn.mjs` (`rowOf`), `tools/ship/takeSubLeague.mjs` (`loadRuns`, `decided`, `signed`) and `brain/subTournament.mjs`.

## 1. What is known (read from the records; nothing here is flown again)

* **The numbers** (from the files): pingEvery league7100 **8.3047**, league7001 **4** and exploit7204 **4** (the lower bound; the bounds are 4 to 40); pingAfter 2 against 1 and 1; searchPing 0 against 0 and 8.28; trackSpeed **3.15** against 4.07 and 4.50. (exploit7200's pingEvery is 8.17, with a trackSpeed of 4.50.)
* **The sub-bar reads** (`SUB_EVADE_MOVE_WIP.md`, DEV 116001 and HELD 117001, 48 geometries a set): GRAFT(pingEvery) onto league7001 / exploit7204 **+0.313 (z 1.9) and +0.349 (z 2.0)** on DEV, **+0.305 (z 2.2) and +0.255 (z 2.0)** on HELD; the whole pinging set (pingAfter, pingEvery, searchPing) +0.312 and +0.216 (DEV), +0.248 and +0.446 (HELD); the ladder's pinging group (`SUB_EVADE_LADDER_WIP.md`) +0.411 and +0.479 on HELD. pingAfter alone and searchPing alone were about 0 in every read.
* **The lesion** (league7100 with the comparator's pingEvery of 4, against league7100): **-0.035 (DEV) and +0.065 (HELD)**, the same matchup against both comparators (pingEvery is 4 in both), under every bar: **giving league7100 the comparators' pingEvery costs it nothing.** The graft pays on the comparators; its removal costs league7100 nothing. **One reading of the two is that pingEvery pays on a boat with a fast tracker and not on league7100's slow one; this note has an arm for it.**
* **The scale of the noise:** the standard error of one of these arms was 0.125 to 0.171 on 48 geometries (96 duels). A bar of 0.25 at z of 2 needs a standard error under 0.125; **this note flies 96 geometries a set (192 duels a matchup), which should give about 0.09 to 0.12.**
* **Nothing is known** of a dose of pingEvery (only league7100's own 8.30 was grafted) or of pingEvery on a boat with league7100's slow tracker.

## 2. The question and the arms

**The question, three parts.** **A, the PIECE:** does league7100's pingEvery, set on league7001 and on exploit7204, pay at a bar of 0.25? **B, the DOSE:** over a grid of pingEvery values, which pay, and does the largest value cost? **C, the TRACKER:** does it pay on the same two boats with league7100's slow trackSpeed (D, 3.15) as it does with their own?

**The bases (MY CHOICE, fixed now):** four, each a boat flown unchanged as the lower side: **F:league7001** and **F:exploit7204** (the finders' final thetas of the files, the fast trackers), and **S:league7001** and **S:exploit7204** (the same with trackSpeed D, league7100's own of the files, nothing else moved: the slow trackers). **The arms:** for each base b and each value v of the grid **V = 5.0, 6.5, P, 11.0, 16.0, 25.0**, where **P is league7100's own pingEvery of the files (8.3047...)**, the base with pingEvery v and nothing else moved, flown against b. **LEAD:** league7100 against each comparator's final theta (2 matchups). **26 matchups a set (2 + 4 x 6).** No arm is identical to its base (every base's pingEvery is 4, the lowest value of the grid is 5).

## 3. The sets and the order

* **smoke**: geometries 1 to 4, never recorded, free to read.
* **DEV**: **128001 to 128096** (96 geometries), both seats; flown first, read freely, recorded once in `brain/subEvadePingDev.json`; it decides whether HELD is spent (R0).
* **HELD**: **129001 to 129096** (96 geometries), both seats; flown ONCE (`held --write`; refuses without a recorded DEV that replicates and lists no failed check, without `--write`, or if its record exists); the rules are about HELD.
* **96 geometries a set, not 48 (MY CHOICE):** the earlier rounds flew 48; this one asks for effects of 0.25 and needs the standard error under about 0.12 (section 1); 26 matchups of 192 duels is the cost.
* No file under `brain` or `tools` uses 128001 to 129096 (searched as whole numbers in the `.mjs`, `.md` and `.json` files; the hits near those numbers are millisecond timings).
* **Amendments:** as in the other notes: only dated, only before this note's HELD. **Every void-check is an identity or a file's own number, and the command's HELD gate refuses a DEV with a failed check.** **If a smoke report is read, its headline is said in Amendment A before any DEV geometry.**
* **The order of work:** this note, the command, its gate with a sabotage log, smoke, DEV; **HELD only on Keith's word.**

## 4. The rules (MY CHOICES, said; Keith may set them differently)

* **THE BAR (the point of this note):** an arm **PAYS** for its base iff its edge is **0.25 or more and its z is 2 or more**, in the arm's favour; **COSTS** iff the base beats it at the same bar (-0.25 and z of -2); else NEUTRAL. **LEAD alone is read at the standard bar of 0.5** (R0).
* **What the smaller bar costs, said before the read:** at z of 2 one arm with no effect is decided positive about 2.3% of the time (one side); 24 arms with no effect would give about one such arm in two sets. **So no single arm is the finding: RE1 needs two named arms (the fast bases at P) both to PAY, which two arms with no effect do about 0.05% of the time; the other arms are reported at the same bar and are read as counts, not as separate findings.**
* **R0 REPLICATES** iff LEAD is decided (0.5 and z of 2) for league7100 over both comparators. On DEV, if R0 fails HELD is not flown by this registration.
* **RE1 THE PIECE:** the arm at P on **F:league7001** and **F:exploit7204** PAYS: both = **BOTH**, one = **ONE**, none = **NONE**.
* **RE2 THE SIZE:** the two fast arms' edges at P, their mean, and each as a share of its comparator's LEAD edge.
* **RE3 THE DOSE:** for each fast base the values that PAY, **the common paying values** (those that pay on both), the **peak** (the value of the greatest edge; the lowest on a tie) and the values that COST.
* **RE4 THE TRACKER:** the number of the slow bases (S:league7001, S:exploit7204) on which the arm at P PAYS: 0, 1 or 2.
* **RE5 THE HEADLINE**, the first that holds: **"NO PIECE"** iff RE1 is NONE; **"ONE BASE"** iff ONE; else with BOTH: **"A PIECE, FAST TRACKERS ONLY"** iff RE4 is 0, **"A PIECE, SLOW TRACKERS TOO"** iff RE4 is 2, **"A PIECE, MIXED ON SLOW TRACKERS"** iff RE4 is 1.
* **Reported with the read, not in a rule:** each arm's edge (se, z, wins-draws-losses, seat edges, status); the arms that COST anywhere; **the forecast quantities of section 5 as yes/no**. **Any reading of why (a quieter boat, a boat that loses contact, the tracker) is post-hoc and labelled.**
* **Checks that void the read, said and not weighed. Every one is an identity or a file's own number:** every matchup flew the set's geometries (each seed twice); no non-finite score; every theta one `clampTheta` leaves unchanged; every run's generation 0 is G; **U(league7100) against a copy of itself has an edge of exactly 0**; **every lower side is the comparator's final theta of the files (F) or that with trackSpeed D and nothing else moved (S), and the leader of a LEAD is league7100's final**; **every arm is exactly its base with pingEvery set to its value of the grid and nothing else moved**; **P is league7100's pingEvery of the files, marked on exactly the arm at P of each base, and the grid is the six increasing values**; **D is league7100's trackSpeed of the files**; **the matchups are exactly the two LEADs and then the six arms of F:league7001, F:exploit7204, S:league7001, S:exploit7204, in order**; **an arm identical to its base has an edge of exactly 0**.

## 5. Forecasts, written before any geometry of any of the two sets is flown (probabilities, mine)

| forecast | probability |
|---|---|
| R0 holds on DEV | **92** |
| R0 holds on HELD | **90** |
| RE1 is BOTH (the arm at P PAYS on both fast bases) | **45** |
| RE1 is BOTH or ONE (at least one fast base) | **70** |
| the mean of the two fast arms at P is 0.25 or more | **55** |
| the arm at P PAYS on neither slow base | **70** |
| the headline is "A PIECE, FAST TRACKERS ONLY" | **28** |
| the headline is "A PIECE, SLOW TRACKERS TOO" | **8** |
| the headline is "A PIECE, MIXED ON SLOW TRACKERS" | **9** |
| the headline is "ONE BASE" | **25** |
| the headline is "NO PIECE" | **30** |
| the peak of each fast base is P or 11.0 | **35** |
| the arm at 25.0 COSTS on some fast base | **40** |
| some arm COSTS anywhere | **50** |

Why these: four reads of the same sign at 0.25 to 0.35 make a real piece of about 0.3 more likely than not, but each read was at z of about 2 and a true effect of 0.3 with a standard error of 0.1 is decided at the bar 2 times in 3 on one arm, so both fast bases being decided is about 45 (the three BOTH headlines add to it: 28 + 8 + 9), at least one about 70, and NONE 30. The lesion's null (removing pingEvery from league7100 costs nothing) is why I think the slow trackers will not show it (70), and why "FAST TRACKERS ONLY" is the likeliest BOTH-headline. I have no data on the dose; a long interval between pings is quieter and slower to find a target, so the largest value 25.0 costing on some fast base is a little under even (40), and the greatest edge at P or the next grid value is a guess (35). Costs somewhere over 24 arms at a bar of 0.25: about even (50).

## 6. What a result would not say

* **A mechanism.** A longer interval could be quieter, or find the target less often: no event is read.
* **That pingEvery is league7100's, or that it carries any share of its lead beyond the two comparators:** the arms put one number into two boats that differ from league7100 in the other eleven.
* **Anything about pingAfter or searchPing** (about 0 in every read; not flown here), **an interaction of pingEvery with a third number**, **or the effect against a boat other than its own base** (every arm is against its base, as in the move and track reads).
* **The surface between the grid's values** (six values, 5.0 to 25.0).
* **That the two comparators are independent:** league7100 is on both LEAD matchups, and both are finders of the same recipe.

## 7. Cost

26 matchups of 192 duels a set, about fifteen minutes of one core a set; the command, its gate and a sabotage pass are the work.
