# Submarine duel: the top of the pingEvery dose, and league7100 with a longer pingEvery (REGISTRATION 15 of the evade reads; 2026-11-17; UNNUMBERED; REGISTERED BEFORE ANY CODE FOR IT IS WRITTEN AND BEFORE ANY GEOMETRY OF ITS SETS IS FLOWN)

Keith, 2026-11-17: "lets do the dose above 25 and league7100 with a longer pingEvery". These are two of the candidates `brain/SUB_EVADE_PING_WIP.md` left (its HELD RESULT, "What this result does and does not say"): **the pingEvery dose was flown only up to 25.00 and the bound is 40; and no arm gave league7100 itself a longer interval.** **This note registers both on new geometries, with the rules, the bar and the forecasts written before any of its sets is flown.**

**What this changes in shared files, said first: nothing.** New files only: this note, `tools/ship/takeEvadeTop.mjs` (the command), `tools/ship/takeEvadeTop-selfcheck.mjs` (its gate), `brain/subEvadeTopDev.json` and `brain/subEvadeTopHeld.json`. It imports, and does not edit, `tools/ship/takeEvadeTurn.mjs` (`rowOf`), `tools/ship/takeSubLeague.mjs` (`loadRuns`, `decided`, `signed`), `tools/ship/takeEvadeAway.mjs` (`vOf`, `effectOf`) and `brain/subTournament.mjs`.

## 1. What is known (read from the records; nothing here is flown again)

* **The dose to 25.00** (`SUB_EVADE_PING_WIP.md`, DEV 128001 and HELD 129001, 96 geometries a set, the base's own pingEvery of 4 replaced by the value, against the base): F:league7001 at 16.00 **+0.632 (DEV), +0.667 (HELD)** and at 25.00 **+0.924, +0.725**; F:exploit7204 at 16.00 **+0.530, +0.367** and at 25.00 **+0.773, +0.452**; S:exploit7204 (exploit7204 with league7100's trackSpeed) at 16.00 **+0.313, +0.506** and at 25.00 **+0.462, +0.578**. **Pooled over the two sets** the step from 16.00 to 25.00 is about **+0.16 on league7001 (+0.651 to +0.814) and +0.14 on exploit7204 (+0.457 to +0.601)**, against +0.18 and +0.23 for the step from 11.00 to 16.00: a dose that rises and may be flattening, which is a reading of pooled arm edges, not of a paired step on the same geometries.
* **The bound** of pingEvery is **40** (`THETA_BOUNDS`, 4 to 40). **No value above 25.00 has been flown on any boat.**
* **The donor's own number** is pingEvery **8.30** (league7100), against 4 on the comparators; league7100 flown with the comparators' pingEvery of 4 against league7100 was **-0.035 (DEV) and +0.065 (HELD)** (`SUB_EVADE_MOVE_WIP.md`): a lower interval costs it nothing. **league7100 with a LONGER interval has never been flown.**
* **league7100 is a slow tracker** (trackSpeed 3.15 against 4.07 and 4.50). The slow-tracker variants of the comparators paid at 16.00 and 25.00 for exploit7204 (S:exploit7204) and not for league7001 (S:league7001 draws 147 to 168 of its 192 duels, so an arm has little room there).
* **The scale of the noise:** the standard error of one arm on 96 geometries was 0.087 to 0.151 on the fast bases.

## 2. The questions and the arms

**A, THE TOP:** on the two fast bases (F:league7001, F:exploit7204), does the arm keep rising above 25.00 up to the bound of 40, flatten, or fall? **B, THE DONOR:** does a longer pingEvery pay league7100 itself?

**The bases (MY CHOICE, fixed now):** four, each a boat flown unchanged as the lower side: **F:league7001** and **F:exploit7204** (the finders' final thetas of the files), **S:exploit7204** (exploit7204's final with trackSpeed D, league7100's own of the files and nothing else moved; **a read, not ruled**) and **D:league7100** (league7100's own final theta). **S:league7001 is left out** (it drew 71% to 88% of its duels in the two earlier sets and showed no arm at the bar). **The grid V = 16.0, 25.0, 30.0, 35.0, 40.0** (fixed numbers; 16.0 and 25.0 are the anchors of the earlier read, 40.0 is the bound). **The arms:** for each base b and each value v of V, the base with pingEvery v and nothing else moved, flown against b. **LEAD:** league7100's final against each comparator's final (2 matchups). **22 matchups a set (2 + 4 x 5).** No arm is identical to its base (the bases' pingEvery is 4, 4, 4 and 8.30; the grid's lowest value is 16.0).

## 3. The sets and the order

* **smoke**: geometries 1 to 4, never recorded, free to read.
* **DEV**: **130001 to 130096** (96 geometries), both seats; flown first, read freely, recorded once in `brain/subEvadeTopDev.json`; it decides whether HELD is spent (R0).
* **HELD**: **131001 to 131096** (96 geometries), both seats; flown ONCE (`held --write`; refuses without a recorded DEV that replicates and lists no failed check, without `--write`, or if its record exists); the rules are about HELD.
* **96 geometries a set (MY CHOICE, as in `SUB_EVADE_PING_WIP.md`):** the step bar of 0.25 needs a standard error under about 0.12; 22 matchups of 192 duels is the cost.
* No file under `brain` or `tools` uses 130001 to 131096 as geometries (searched as whole numbers in the `.mjs`, `.md` and `.json` files; the hits in that range are floating-point counts in sweep logs, a weight in a results file and a buffer size, 131072).
* **Amendments:** as in the other notes: only dated, only before this note's HELD. **Every void-check is an identity or a file's own number, and the command's HELD gate refuses a DEV with a failed check.** **If a smoke report is read, its headline is said in Amendment A before any DEV geometry.**
* **The order of work:** this note, the command, its gate with a sabotage log, smoke, DEV; **HELD only on Keith's word.**

## 4. The rules (MY CHOICES, said; Keith may set them differently)

* **THE BAR (as in the ping note):** an arm **PAYS** for its base iff its edge is **0.25 or more and its z is 2 or more**, in the arm's favour; **COSTS** iff the base beats it at the same bar (-0.25 and z of -2); else NEUTRAL. **LEAD alone is read at the standard bar of 0.5** (R0).
* **THE STEP (new here):** the **paired effect** of one arm over another arm of the same base on the same geometries: for each geometry the mean of the two seats' (X's score less Y's) of the higher-valued arm less that of the lower-valued arm; the mean, the standard error (the standard deviation of the 96 differences over the square root of 96) and the z of the differences (the method of `takeEvadeAway.mjs`, `effectOf`). **A STEP RISES iff its edge is 0.25 or more and its z is 2 or more, FALLS iff -0.25 and -2, else is FLAT. FLAT does not say no change: it says no change decided at this bar.**
* **What the smaller bar costs, said before the read:** at z of 2 an arm or a step with no effect is decided about 2.3% of the time in one direction. **RA1 asks two named steps (one a base) and RB1 two named arms, so a headline from chance alone is about 0.05% for "RISES TO THE BOUND", "FALLS ABOVE 25" or "DONOR PAYS"**; the other readings are counts and are read as counts.
* **R0 REPLICATES** iff LEAD is decided (0.5 and z of 2) for league7100 over both comparators. On DEV, if R0 fails HELD is not flown by this registration.
* **RA1 THE TOP:** on each fast base the STEP from the arm at 25.0 to the arm at 40.0; **r** = the number of fast bases on which it RISES, **f** = on which it FALLS. **"RISES TO THE BOUND"** iff r = 2; else **"FALLS ABOVE 25"** iff f = 2; else **"PLATEAU"** iff r = 0 and f = 0; else **"MIXED"**.
* **RA2 THE BOUND:** the number of the two fast arms at 40.0 that PAY (0, 1 or 2) and that COST.
* **RA3 THE PEAK:** on each fast base the value of the greatest arm edge among V (the lowest value on a tie) and the values that PAY; reported.
* **RB1 THE DONOR:** on D:league7100, **p** = the number of its arms at **25.0 and 40.0** that PAY, **c** = the number that COST; the first that holds: **"DONOR PAYS"** iff p = 2; **"DONOR ONE VALUE"** iff p = 1 and c = 0; **"DONOR MIXED"** iff p = 1 and c = 1; **"DONOR COSTS"** iff p = 0 and c at least 1; else **"DONOR NEUTRAL"**.
* **RT THE HEADLINE:** the two words with " / " between: RA1, then RB1 (for example "PLATEAU / DONOR NEUTRAL").
* **Reported with the read, not in a rule:** every arm's edge (se, z, wins-draws-losses, seat edges, status) on all four bases; **the five arms of S:exploit7204 and of D:league7100** as dose lines (the values that PAY and COST, the peak); **the STEPS between neighbouring values (16 to 25, 25 to 30, 30 to 35, 35 to 40) on each of the three non-donor bases and on D:league7100**; the donor's arm at 25.0 as a ratio to the mean of the two fast arms at 25.0 (a ratio of two edges of two matchups, not a recovery); the arms that COST anywhere; **the forecast quantities of section 5 as yes/no**. **Any reading of why (a quieter boat, a boat that loses contact, the tracker) is post-hoc and labelled.**
* **Checks that void the read, said and not weighed. Every one is an identity or a file's own number:** every matchup flew the set's geometries (each seed twice); no non-finite score; every theta one `clampTheta` leaves unchanged (40.0 is the bound and is left unchanged); every run's generation 0 is G; **U(league7100) against a copy of itself has an edge of exactly 0**; **every lower side is the comparator's final theta of the files (F), that with trackSpeed D (S), or league7100's own final (D), and the leader of a LEAD is league7100's final**; **every arm is exactly its base with pingEvery set to its value of the grid and nothing else moved**; **the grid is exactly 16.0, 25.0, 30.0, 35.0, 40.0 on every base**; **every row's per-geometry values are as many as the set's geometries and average to the row's edge to 1e-9** (the one tolerance: floating-point summation order); **the matchups are exactly the two LEADs and then the five arms of F:league7001, F:exploit7204, S:exploit7204, D:league7100, in order**; **an arm identical to its base has an edge of exactly 0**.

## 5. Forecasts, written before any geometry of any of the two sets is flown (probabilities, mine)

| forecast | probability |
|---|---|
| R0 holds on DEV | **96** |
| R0 holds on HELD | **95** |
| RA1 is "PLATEAU" | **52** |
| RA1 is "RISES TO THE BOUND" | **8** |
| RA1 is "FALLS ABOVE 25" | **6** |
| RA1 is "MIXED" | **34** |
| the arm at 40.0 PAYS on both fast bases | **85** |
| the arm at 40.0 COSTS on some fast base | **6** |
| the peak of each fast base is 30.0 or higher | **38** |
| the arm at 40.0 is the greatest arm on at least one fast base | **48** |
| RB1 is "DONOR PAYS" | **36** |
| RB1 is "DONOR ONE VALUE" | **14** |
| RB1 is "DONOR MIXED" | **4** |
| RB1 is "DONOR COSTS" | **10** |
| RB1 is "DONOR NEUTRAL" | **36** |
| the donor's arm at 25.0 is smaller than the mean of the two fast arms at 25.0 | **80** |
| both of S:exploit7204's arms at 25.0 and 40.0 PAY | **60** |
| some arm COSTS anywhere | **25** |

Why these: the pooled steps from 16.00 to 25.00 (+0.16, +0.14) are smaller per unit of interval than from 11.00 to 16.00, and a paired step has a standard error of about 0.1, so a true rise of 0.15 from 25 to 40 would mostly not be decided at the bar of 0.25: **"PLATEAU" is the likeliest headline even if the dose still rises a little** (52), "RISES TO THE BOUND" needs both bases decided (8), "MIXED" takes one base decided or one rising and one falling (34). The arm at 40.0 paying on both fast bases (85) follows from 25.0 paying at +0.45 to +0.92 and nothing falling by that much. A long interval is quieter and finds a target less often, so a fall at 40.0 is possible and decided is not likely (6, 6). **The donor is the open question:** league7100's own interval of 8.30 costs it nothing to lower (the lesion), the slow-tracker comparator S:exploit7204 pays at 16.00 and 25.00, and the donor is a slow tracker; but S:league7001 did not pay and league7100 against itself may draw a great deal. I put "DONOR PAYS" and "DONOR NEUTRAL" level at 36 each. I expect the donor's arm to be smaller than the fast comparators' (80), because the comparators' base is a pingEvery of 4 and the donor's is 8.30. Costs somewhere over 20 arms at a bar of 0.25: a quarter (25).

## 6. What a result would not say

* **A mechanism.** A longer interval could be quieter, or find the target less often: no event is read.
* **Anything about a boat other than the base** (every arm is against its base, as in the earlier ping, move and track reads), **an interaction of pingEvery with pingAfter or searchPing** (not flown), or **the surface between the grid's values** (five values, 16.0 to 40.0).
* **That the effect is league7100's, or that it carries any share of its lead:** the arms put one number into boats that differ from league7100 in the other eleven (the donor arms put it into league7100 itself).
* **A rise or fall that the bar did not decide:** "PLATEAU" and "FLAT" say no step was decided at 0.25, not that the dose is flat.
* **That the comparators are independent:** league7100 is on both LEAD matchups, and both comparators are finders of the same recipe.

## 7. Cost

22 matchups of 192 duels a set, about nine minutes of one core a set; the command, its gate and a sabotage pass are the work.
