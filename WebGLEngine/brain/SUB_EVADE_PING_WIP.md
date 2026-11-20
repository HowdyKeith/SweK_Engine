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

## AMENDMENT A (2026-11-17; written after the command and its gate were written and the command's `smoke` was run on geometries 1 to 4, BEFORE any geometry of the DEV set 128001 to 128096 or of HELD is flown)

**1. The smoke headline, said before any DEV geometry (the rule of section 3).** The command's `smoke` was run on geometries 1 to 4 (8 duels a matchup; never recorded; free to read). **R0 holds on it** (league7100 over league7001 +1.902, z 5.1; over exploit7204 +1.548, z 192.1: the second standard error is 0.008 because league7100 wins one seat all four times and draws the other). **The headline was "NO PIECE":** the arm at P is +0.381 on F:league7001 (z 1.0) and +0.007 on F:exploit7204 (z 0.7), neither at the bar; **no arm of any base is decided at the bar** (the largest |z| of the 24 arms is 1.7, so none is near it) and no arm COSTS. Eight duels on four geometries have a standard error of 0.4 to 0.8, several times the 0.09 to 0.12 this note's sets are meant to have, and **the smoke is a test that the command runs and not a read**; DEV is flown on its own geometries and decides nothing here.

**2. Things the smoke shows that this note did not say (said before data; no rule is changed).** (a) On the smoke geometries **the slow league7001 base draws a great deal**: its arms at 5.0, 6.5 and 11.0 are 0-8-0 (every duel drawn, edge exactly 0, standard error 0) and at 16.0 and 8.3 1-7-0. A base that draws most duels makes an arm's edge small and its standard error small too, so the bar of 0.25 at a z of 2 can be met by very few decided duels; **I did not set a bar for draws and none is added**. (b) On F:exploit7204 the arms at P (8.30) and at 11.0 are +0.007 and +0.007 while the others are +0.78 to +0.80: **eight duels (four geometries, both seats), and I do not read it**; DEV will show whether the dose has any shape. (c) **The grid's third value is printed `8.30` (two decimals) in the arm ids**: P is 8.30466 in the files and the label is only a label; `isP` and the checks use the number.

**3. A change to the command's checks (said before data).** The command's checks list the two identities **"every lower side is the comparator's final theta of the files (F) or that with trackSpeed D (S), and the leader of a LEAD is league7100's final"** and **"every arm is exactly its base with pingEvery set to its value and nothing else moved"** as **two checks with two names** (section 4 lists them as two identities in one sentence). Nothing in what they test differs from section 4. The grid check and the matchup-order check are likewise two checks.

**4. What is not changed:** the bases, the grid, the arms, the LEAD matchups, the sets, the bar of 0.25 and the bar of 0.5 for R0, the rules R0 and RE1 to RE5, the forecasts, the geometries, the order of work.

## DEV RESULT (2026-11-17; `node tools/ship/takeEvadePing.mjs dev --write`, geometries 128001 to 128096 (192 duels a matchup), exit 0; record `brain/subEvadePingDev.json`: 26 matchups, no check failed)

DEV is free to read. **HELD (129001 to 129096) is NOT flown by this note's work so far**: Keith's earlier HELD words named specific rounds, and his message for this round ("lets do the pingEvery read with the smaller bar") did not say "fly HELD", so I am waiting for his word. R0 held on DEV and no check failed, so the command's HELD gate would accept this record. **I flew DEV on my own reading of "do the pingEvery read"**, as free-to-read data that gates HELD; it spent the DEV set 128001 to 128096, recorded once. Forecasts are scored on DEV only for "R0 holds on DEV" (92): **TRUE**. The others stand as written for HELD.

**R0 holds.** league7100 over league7001 **+1.316** (z 13.4, 97-81-14) and over exploit7204 **+1.121** (z 7.5, 94-74-24), both decided.

**The registered readings on DEV (read, not scored):**
* **RE1 THE PIECE: ONE.** The arm at P (8.30) on F:league7001 is **+0.264 +- 0.108 (z 2.5, 90-29-73): PAYS, over the bar of 0.25 by 0.014**; on F:exploit7204 it is **+0.061 +- 0.098 (z 0.6, 92-12-88): NEUTRAL.**
* **RE2 THE SIZE:** +0.264 and +0.061, the mean **+0.163**, the shares of the lead +0.201 and +0.054.
* **RE3 THE DOSE:** F:league7001 PAYS at 8.30, 11.00, 16.00 and 25.00 (peak 25.00, +0.924); F:exploit7204 PAYS at 16.00 and 25.00 (peak 25.00, +0.773); **the common paying values are 16.00 and 25.00**; nothing COSTS on any base.
* **RE4 THE TRACKER:** the arm at P PAYS on **0 of 2** slow bases (S:league7001 -0.017, z -1.0; S:exploit7204 +0.076, z 1.2).
* **RE5 THE HEADLINE: "ONE BASE".**
* **The forecast quantities on DEV:** both fast bases no; at least one yes; the mean at P 0.25 or more no; no slow base yes; FAST TRACKERS ONLY no; SLOW TRACKERS TOO no; MIXED no; ONE BASE yes; NO PIECE no; each peak at P or 11.00 no (both at 25.00); the arm at 25.00 COSTS on a fast base no; some arm COSTS no.

**What the DEV rows show beyond the registered reading (POST-HOC, labelled, not a rule of this note):**
* **The dose rises with the interval and does not peak inside the grid.** The mean of the two fast arms by value: 5.00 +0.195, 6.50 +0.185, **8.30 +0.163**, 11.00 +0.282, 16.00 +0.581, **25.00 +0.849**. On each fast base the arm at 25.00 is the largest (+0.924, +0.773) and the arm at 16.00 the next (+0.632, +0.530); **both pay at the bar on both fast bases**. **league7100's own value (8.30) is among the three smallest effects on the grid.** The grid stops at 25.00 and the bound of pingEvery is 40; no value above 25.00 was flown.
* **The slow bases:** S:exploit7204 PAYS at 16.00 (+0.313, z 3.7) and 25.00 (+0.462, z 4.3); **S:league7001 has no arm at the bar** (its largest is 25.00 at +0.211, z 2.6, under the edge bar of 0.25). **S:league7001 is a base that draws: 165 of the 192 duels are drawn at 5.00, 6.50 and 8.30, 161 at 11.00, 157 at 16.00 and 136 at 25.00** (the smoke showed the same, Amendment A item 2a), so an arm has little room to win there; S:exploit7204 draws 128 to 102 of 192, F:league7001 29 to 38, F:exploit7204 12 to 17.
* **The ratio of the arm's edge to the LEAD edge** (the registered share, read here at every value, an arm against its base over league7100 against the comparator: two edges of two different matchups, not a recovery): at 25.00 **+0.70 and +0.69**, at 16.00 +0.48 and +0.47, at 11.00 +0.31 and +0.14, at 8.30 +0.20 and +0.05.
* **The count:** 8 of the 24 arms PAY (4 on F:league7001, 2 on F:exploit7204, 2 on S:exploit7204, 0 on S:league7001). At about 2.3% an arm with no effect that would be about 0.6 arms of 24, **but the arms of a base are flown against the same base on the same geometries and are not independent, and the four bases are four boats of two recipes: the shape across the values is the finding to read, not the count.**
* **The earlier reads of the arm at P:** GRAFT(pingEvery) on exploit7204 was +0.349 (DEV 116001, z 2.0) and +0.255 (HELD 117001, z 2.0); this DEV reads **+0.061** (z 0.6): the differences are about 1.4 and 1.2 combined standard errors, not a contradiction; on league7001 the two earlier reads are +0.313 (DEV 116001) and +0.305 (HELD 117001) and this one is **+0.264** (+0.219 and +0.226 at the two values below P).
* **No mechanism is read** (a longer interval could be quieter, or give the target less to track: no event of any duel is looked at).

**What this does to HELD: nothing is changed.** HELD scores the registered rules at P and the dose (RE3) as registered. **If HELD reads the arm at P at the bar on neither base or on one, the registered answer is "NO PIECE" or "ONE BASE" whatever the dose does at 16.00 and 25.00;** a note that asks whether the effect is a dose above P (a grid above 25.00, up to the bound of 40, and a boat other than the base) is a new registration, not an amendment of this one.

## HELD RESULT (2026-11-17; `node tools/ship/takeEvadePing.mjs held --write` flown ONCE on Keith's word "fly HELD now", geometries 129001 to 129096 (192 duels a matchup), exit 0; record `brain/subEvadePingHeld.json`: 26 matchups, no check failed)

**The rules are about HELD.** **R0 holds:** league7100 over league7001 **+1.288** (z 12.5, 93-87-12) and over exploit7204 **+1.327** (z 9.5, 100-74-18), both decided.

* **RE1 THE PIECE: ONE.** The arm at P (8.30) on F:league7001 is **+0.266 +- 0.096 (z 2.8, 88-33-71): PAYS**, over the bar of 0.25 by 0.016; on F:exploit7204 it is **+0.055 +- 0.087 (z 0.6, 93-10-89): NEUTRAL.**
* **RE2 THE SIZE:** +0.266 and +0.055, the mean **+0.161**, the shares of the lead +0.207 and +0.042.
* **RE3 THE DOSE:** F:league7001 PAYS at 6.50, 8.30, 11.00, 16.00 and 25.00 (not at 5.00, +0.016), peak **25.00 (+0.725)**; F:exploit7204 PAYS at 11.00 (+0.320), 16.00 (+0.367) and 25.00 (+0.452) (6.50 is +0.229, z 2.0, under the edge bar), peak **25.00 (+0.452)**; **the common paying values are 11.00, 16.00 and 25.00**; **nothing COSTS on any base** (the lowest arm is 5.00 on F:exploit7204 at -0.081, z -0.7).
* **RE4 THE TRACKER:** the arm at P PAYS on **0 of 2** slow bases (S:league7001 +0.014, z 0.5; S:exploit7204 -0.066, z -1.0).
* **RE5 THE HEADLINE: "ONE BASE".** **By the rules of this note pingEvery at league7100's own value is NOT a piece of its lead: the arm pays on league7001 and not on exploit7204, on DEV and on HELD alike** (DEV +0.264 and +0.061; HELD +0.266 and +0.055).
* **The forecast quantities on HELD:** both fast bases no; at least one yes; the mean at P 0.25 or more no; no slow base yes; FAST TRACKERS ONLY no; SLOW TRACKERS TOO no; MIXED no; ONE BASE yes; NO PIECE no; each peak at P or 11.00 no (both at 25.00); the arm at 25.00 COSTS on a fast base no; some arm COSTS no.
* **11 of the 24 arms PAY** (5 on F:league7001, 3 on F:exploit7204, 0 on S:league7001, 3 on S:exploit7204).

### The forecasts, scored (section 5, as the larger side; a forecast at exactly 50 has no larger side and is not counted)

| forecast | p | HELD | as the larger side |
|---|---|---|---|
| R0 holds on DEV | 92 | true | right |
| R0 holds on HELD | 90 | true | right |
| RE1 is BOTH | 45 | false (ONE) | right (the larger side is false) |
| RE1 is BOTH or ONE | 70 | true | right |
| the mean of the two fast arms at P is 0.25 or more | 55 | **false (+0.161)** | **wrong** |
| the arm at P PAYS on neither slow base | 70 | true | right |
| "A PIECE, FAST TRACKERS ONLY" | 28 | false | right |
| "A PIECE, SLOW TRACKERS TOO" | 8 | false | right |
| "A PIECE, MIXED ON SLOW TRACKERS" | 9 | false | right |
| "ONE BASE" | 25 | **true** | **wrong** |
| "NO PIECE" | 30 | false | right |
| the peak of each fast base is P or 11.0 | 35 | false (both 25.00) | right |
| the arm at 25.0 COSTS on some fast base | 40 | false | right |
| some arm COSTS anywhere | 50 | false | not counted |

**11 of the 13 counted forecasts are right as the larger side; the two misses are the mean at P (55; +0.161, because exploit7204's arm is +0.055) and ONE BASE (25), which is what happened.** I had put the three BOTH headlines together at 45 and ONE and NONE at 25 and 30, and the arm on exploit7204 sat at +0.06 on two sets: the earlier graft reads of that arm (+0.349 and +0.255 on 48 geometries) had been the reason for the round and were the larger numbers.

### What the two sets show together (POST-HOC, labelled; not a rule of this note)

* **The dose replicates.** The mean of the two fast arms by value on HELD: 5.00 -0.032, 6.50 +0.257, 8.30 +0.161, 11.00 +0.428, 16.00 +0.517, 25.00 +0.588 (DEV: +0.195, +0.185, +0.163, +0.282, +0.581, +0.849). **On both sets, on both fast bases, 25.00 is the largest arm and 16.00 pays at the bar**; on both sets the third paying base is S:exploit7204 at 16.00 and 25.00 (HELD also at 11.00: +0.285). **The statuses of the 24 arms are the same on DEV and HELD in 21; the three that differ (F:league7001 at 6.50, F:exploit7204 at 11.00, S:exploit7204 at 11.00) are NEUTRAL on DEV (+0.219, +0.155, +0.217) and PAY on HELD (+0.285, +0.320, +0.285), each within 0.1 of the bar.** The 24 arm edges of the two sets correlate at **0.85**.
* **Pooled over the two sets of this round** (inverse-variance, each arm's own standard error): the arm at P is **+0.265 (se 0.072) on league7001 and +0.058 (se 0.065) on exploit7204**; at 11.00 +0.471 and +0.225; at 16.00 +0.651 and +0.457; at 25.00 **+0.814 and +0.601**.
* **The earlier graft reads of exploit7204 (+0.349, +0.255; pooled +0.288, se 0.103) against this round's +0.058 (se 0.065) differ by 0.23, about 1.9 combined standard errors; on league7001 the earlier +0.313 and +0.305 and this round's +0.264 and +0.266 agree.** The earlier reads were the ones that made this the candidate (four reads of one sign at z of about 2), a selection that favours large numbers; I do not read it as more than that.
* **league7100's own number is not special on this grid:** its value (8.30) is among the smallest effects on each fast base and a longer interval pays more on three of the four bases (S:league7001 draws 147 to 168 of 192 duels, its largest arm is +0.199 at 25.00, z 3.2, under the edge bar). **The lesion (league7100 with the comparators' pingEvery of 4, against league7100) was -0.035 and +0.065 (`SUB_EVADE_MOVE_WIP.md`)**: a lower interval costs league7100 nothing, and a higher one is what pays the comparators. **No arm in this note gives league7100 a longer interval, so nothing here says whether it would pay league7100 itself.**
* **No mechanism is read** (a longer interval could be quieter, or give the target less to track: no event of any duel is looked at).

### What this result does and does not say

* **It says, by this note's rules:** pingEvery at league7100's own value is not a second piece of its lead on the two comparators (ONE BASE on DEV and HELD, the same base and the same size both times). **It does not say** that pingEvery does nothing: the registered dose read finds a longer interval paying on three of four bases up to the top of the grid on both sets.
* **Not flown, so not said:** any value above 25.00 (the bound is 40); a longer interval on league7100 itself; the effect against a boat other than its own base; an interaction with pingAfter or searchPing; the surface between the grid's values.
* **The candidates this leaves, each its own registration and none decided:** a dose above 25.00 up to 40 and league7100's own theta with a longer pingEvery against league7100 (does the dose pay the donor as well as its comparators?); the effect of a long interval against boats that are not its base.
