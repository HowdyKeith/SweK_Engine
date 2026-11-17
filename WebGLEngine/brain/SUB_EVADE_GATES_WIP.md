# Submarine duel: the trackSpeed gate and the evade-pair gates together (REGISTRATION 13 of the evade reads; 2026-11-16; UNNUMBERED; REGISTERED BEFORE ANY CODE FOR IT IS WRITTEN AND BEFORE ANY GEOMETRY OF ITS SETS IS FLOWN)

Keith, 2026-11-16: "lets do trackSpeed against opponents that are not the boat's own base, and the trackSpeed and evade-pair gates together". This is the second of the two (the first is `brain/SUB_EVADE_AWAY_WIP.md`, registered at the same time, before either is flown). The reach read (HELD, `SUB_EVADE_REACH_WIP.md`) found that a slower trackSpeed pays against a copy of the boat on only the three finders with a fast evade (evadeSpeed 4.3 or more) **and** a hard turn (evadeTurn 2.65 or more), and not on boats with a weak turn or a slower speed. **That is a reading from 14 whole boats that differ in everything.** This note varies **the opponent's evade pair alone**, on a grid, with the rest of the boat fixed, and asks whether the two gates act as one condition (both needed) or as two.

**What this changes in shared files, said first: nothing.** New files only: this note, `tools/ship/takeEvadeGates.mjs` (the command), `tools/ship/takeEvadeGates-selfcheck.mjs` (its gate), `brain/subEvadeGatesDev.json` and `brain/subEvadeGatesHeld.json`. It imports, and does not edit, `tools/ship/takeEvadeTurn.mjs` (`rowOf`), `tools/ship/takeSubLeague.mjs` (`loadRuns`, `decided`, `signed`), `tools/ship/takeEvadeAway.mjs` (its paired difference, `effectOf`, which the first note registers and gates) and `brain/subTournament.mjs`.

## 1. What is known (read from the records; nothing here is flown again)

* **Against the boat's own copy** (reach, HELD): the three boats that pay have pairs (4.32, 2.80), (4.42, 2.80) and (4.35, 2.65); league7103 (3.55, 2.80) costs about 0.5; the others, with turns of 0.40 to 2.58 or speeds of 1.66 to 4.15 (only one of them, exploit7202, has a turn of 2.5 or more: (2.18, 2.58)), are within -0.49 to +0.42.
* **The evade gates against G** (`SUB_EVADE_TURN_WIP.md`, `_DOSE_`, `_SPEED_`, `_SPEEDFINE_`, `_PAIRS_`): the turn is a gate (nothing below about 2.1 to 2.3, steep to 2.65, flat to 2.8) and the speed multiplies it (a gate of its own, a ramp across 2.7 to 3.2, a plateau above about 4.1). **That was the evader's own gain against G, not the hunter's gain against the evader.**
* **What a duel is, and the paired difference:** as in the first note (`SUB_EVADE_AWAY_WIP.md` section 2): the effect of the slower trackSpeed against an opponent is the paired difference by geometry of two matchups on the same geometries.

## 2. The question and the arms

**The question.** Against an opponent whose evadeSpeed and evadeTurn are varied on a grid, with everything else of it fixed, where does a slower trackSpeed on the hunter pay: at the strong corner only, on the strong turn alone, on the strong speed alone, or on either?

**The hunters (MY CHOICE, fixed now):** **league7001 and exploit7204**, two of the three that pay against their own copy, with D (league7100's own trackSpeed of the files, 3.1507) as the slower trackSpeed. **The opponents:** for each hunter h, **sixteen opponents O(h; s, u)**: **h's own theta with its evadeSpeed set to s and its evadeTurn to u**, nothing else moved, for **s in 2.0, 3.0, 4.0, 4.5** and **u in 0.8, 1.8, 2.4, 2.8** (so an opponent has the hunter's own search, tracking, weapon and ping numbers, and only the evade pair of the grid; 4.5 and 2.8 are the bounds of the two numbers).

**The matchups,** for each hunter h and each cell (s, u): **BASE** (U(h) against O(h; s, u)) and **SLOW** (U(h) with trackSpeed D, nothing else moved, against O(h; s, u)); and for each hunter **OWN** (U(h) with trackSpeed D against U(h)). **33 matchups a hunter (16 x 2 + 1), 66 a set.** The hunter, or the slowed hunter, is the first side. The **EFFECT** Delta(h; s, u) is the paired difference by geometry of SLOW over BASE, with its standard error and z, exactly as defined in section 2 of the first note.

**The corners:** the **strong corner** is (4.5, 2.8); **A**, the weak speed with the strong turn, is (2.0, 2.8); **B**, the strong speed with the weak turn, is (4.5, 0.8); **W**, weak on both, is (2.0, 0.8).

## 3. The sets and the order

* **smoke**: geometries 1 to 4, never recorded, free to read.
* **DEV**: **126001 to 126048**, both seats; flown first, read freely, recorded once in `brain/subEvadeGatesDev.json`; it decides whether HELD is spent (R0).
* **HELD**: **127001 to 127048**, both seats; flown ONCE (`held --write`; refuses without a recorded DEV that replicates and lists no failed check, without `--write`, or if its record exists); the rules are about HELD.
* No file under `brain` or `tools` uses 124001 to 127048 (searched as whole numbers; the hits near those numbers are millisecond timings).
* **Amendments:** as in the other notes: only dated, only before this note's HELD. **Every void-check is an identity or a file's own number, and the command's HELD gate refuses a DEV with a failed check.** **If a smoke report is read, its headline is said in Amendment A before any DEV geometry.**
* **The order of work:** this note, the command, its gate with a sabotage log (never flying 126001 to 127048), smoke, DEV; **HELD only on Keith's word.**

## 4. The rules (MY CHOICES, said; Keith may set them differently)

* **An EFFECT is decided** at Delta of 0.5 in size with z of 2 in size. A **cell HELPS** iff Delta is decided positive for **both** hunters; a cell **HURTS** a hunter iff Delta is decided negative for that hunter.
* **R0 REPLICATES** iff OWN is decided positive (an edge of 0.5 and z of 2) for **both** hunters. On DEV, if R0 fails HELD is not flown by this registration.
* **RG1 THE STRONG CORNER HELPS:** the cell (4.5, 2.8) HELPS.
* **RG2 THE HEADLINE**, the first that holds: **"NOT REPLICATED"** iff RG1 fails; else **"EITHER"** iff both A and B HELP, **"TURN ALONE"** iff A HELPS and B does not, **"SPEED ALONE"** iff B HELPS and A does not, **"AND"** iff neither does.
* **RG3 THE GATES:** the **speed gate** is the lowest of 2.0, 3.0, 4.0, 4.5 at which the cell (s, 2.8) HELPS; the **turn gate** is the lowest of 0.8, 1.8, 2.4, 2.8 at which the cell (4.5, u) HELPS; each is "none" when no cell does.
* **RG4 THE COUNT:** the number of the 16 cells that HELP, and the cells.
* **RG5 THE COSTS:** the cells that HURT a hunter, listed by hunter; **HURTS SOMEWHERE** iff there is one.
* **Reported with the read, not in a rule:** for each hunter a table of the 16 cells (BASE edge, SLOW edge, Delta with se and z); OWN; **the forecast quantities of section 5 as yes/no**. **Any reading of the surface beyond the corners and the two gates is post-hoc and labelled.**
* **Checks that void the read, said and not weighed. Every one is an identity or a file's own number:** every matchup flew the set's geometries (each seed twice), so that a BASE and its SLOW flew the same ones; no non-finite score; every theta one `clampTheta` leaves unchanged; every run's generation 0 is G; **U(league7100) against a copy of itself has an edge of exactly 0**; **every BASE is the hunter's final theta against its opponent, every SLOW is the hunter with trackSpeed D and nothing else moved, every OWN is the slowed hunter against the hunter's final**; **every opponent is the hunter's final theta with its evadeSpeed and evadeTurn set to the cell's values and nothing else moved**; **D is league7100's trackSpeed of the files**; **the cells are exactly the 16 of the grid, in order, for each hunter**.

## 5. Forecasts, written before any geometry of any of the two sets is flown (probabilities, mine)

| forecast | probability |
|---|---|
| R0 holds on DEV | **90** |
| R0 holds on HELD | **88** |
| RG1: the strong corner HELPS | **85** |
| the headline is "AND" | **62** |
| the headline is "TURN ALONE" | **8** |
| the headline is "SPEED ALONE" | **5** |
| the headline is "EITHER" | **10** |
| the headline is "NOT REPLICATED" | **15** |
| the turn gate is 2.4 or higher, or none | **70** |
| the speed gate is 4.0 or higher, or none | **60** |
| four or more of the 16 cells HELP | **45** |
| HURTS SOMEWHERE | **35** |

Why these: against the boats' own copies the gain sat at the top corner of the pair (the three that pay all have the fast speed **and** the hard turn; exploit7203 (4.15, 1.11) and exploit7205 (4.50, 0.82) have the speed without the turn, exploit7202 (2.18, 2.58) the turn nearly without the speed, and none gained), so "AND" is the likeliest (62); the earlier evade reads put the turn gate high (nothing below about 2.1 to 2.3, steep to 2.65) and the speed's ramp across 2.7 to 3.2 with a plateau above 4.1, which is why I put the turn gate at 2.4 or higher at 70 and the speed gate at 4.0 or higher at 60 (the speed has more room to act below 4.0 than the turn has below 2.4). The strong corner is nearly league7001's and exploit7204's own pair, so it should help as the reach read did (85). Four or more cells helping needs a block larger than the corner (45). A cost, as league7103's, is possible where the opponent turns hard but is slower (35).

## 6. What a result would not say

* **A mechanism.** A slower tracker could be quieter, lose contact less, or its opposite: no event is read.
* **Anything about a boat whose other numbers differ from league7001's or exploit7204's:** the opponents here are those two boats with a changed evade pair, and the gates are those of that body.
* **The gates of the evader's own gain against G** (the earlier reads), **any dose of trackSpeed** (only D is flown), **or the surface between the grid's values** (four values of each number: a gate is placed to within a grid step).
* **That the two hunters are independent:** both are finders of the same recipe.
* **Seat arrangements other than the tournament's two.**

## 7. Cost

66 matchups of 96 duels a set, about fifteen minutes of one core a set; the command, its gate and a sabotage pass are the work.

## AMENDMENT A (2026-11-16; written after the command was written and smoke-run on geometries 1 to 4, BEFORE any geometry of the DEV set 126001 to 126048 or of HELD is flown)

**1. The smoke headline, said before any DEV geometry (the rule of section 3).** The command's `smoke` was run on geometries 1 to 4 (8 duels a matchup; never recorded; free to read). Its headline was **"AND"**: R0 holds on it (OWN +1.517 for league7001 and +1.181 for exploit7204); **the strong corner (4.5, 2.8) HELPS** for both hunters (league7001 +1.888, exploit7204 +1.525); **(4.0, 2.8) HELPS as well** (+1.518 and +1.165), so the speed gate is 4.0 and the turn gate 2.8 and **2 of the 16 cells HELP**; neither A (2.0, 2.8) nor B (4.5, 0.8) does; no cell HURTS a hunter decided (league7001 at (4.0, 2.4) is -1.573 with z -1.7, not decided). Eight duels on four geometries are a smoke test and not a reading, and **the forecasts of section 5 stand as written before it was seen and are scored as written; but I have seen this headline, and the 62 given to "AND" and the 70 and 60 given to the gates are no longer blind numbers**: the DEV read and HELD are the evidence, and the smoke is not counted in them.

**2. A property of the design that the smoke shows and that this note did not say (said before data; no rule is changed), the same as the first note's Amendment A item 2.** The effect is a difference of two edges and **an edge has a ceiling**: at 25 of the 32 cells' BASE matchups on the smoke geometries (16 cells of each of two hunters) the unchanged hunter already scores **+3.18 to +3.28** against the changed opponent, so a slower tracker has no room to add anything there. **A cell can therefore HELP only where the hunter is not already at the ceiling, which is where the opponent evades well enough to survive it**, and the "gates" this note reads are in part the places where the opponent is strong enough for there to be anything to gain. The registered rules count what they count (a gate is where the effect is decided); the report prints BASE and SLOW beside each effect so that the ceiling can be seen, and **any reading of the surface beyond the corners and the two gates stays post-hoc and labelled**.

**3. What is not changed:** the hunters, the grid, the corners, the matchups, the sets, the rules R0 and RG1 to RG5, the forecasts, the geometries, the order of work.

## DEV RESULT (2026-11-16; `node tools/ship/takeEvadeGates.mjs dev --write`, geometries 126001 to 126048 (96 duels a matchup), exit 0; record `brain/subEvadeGatesDev.json`: 66 matchups, no check failed)

DEV is free to read. **HELD (127001 to 127048) is NOT flown by this note's work so far**: Keith's earlier HELD words ("fly Round 1 HELD whenever ready", "Rounds 2 and 3 HELD can fly when ready") named those rounds, and his message for these two did not say "fly HELD", so I am waiting for his word. R0 held on DEV and no check failed (none printed), so the command's HELD gate would accept this record. Forecasts are scored on DEV only for "R0 holds on DEV" (90): **TRUE**. The others stand as written for HELD. **I flew DEV on my own reading of "do the round"**, as free-to-read data that gates HELD; it spent the DEV set 126001 to 126048, recorded once.

**R0 holds.** OWN (U(h) with trackSpeed D against U(h)) is **+0.889** for league7001 (z 7.5, 35-54-7) and **+0.974** for exploit7204 (z 6.8, 45-36-15), both decided.

**The effect Delta(h; s, u) of the slower trackSpeed against the opponent with evadeSpeed s and evadeTurn u** (the paired difference by geometry of SLOW over BASE; HELPS in bold):

| league7001 | turn 0.8 | turn 1.8 | turn 2.4 | turn 2.8 |
|---|---|---|---|---|
| speed 2.0 | -0.002 | -0.002 | -0.002 | -0.034 |
| speed 3.0 | -0.003 | -0.033 | -0.003 | +0.185 (z 1.7) |
| speed 4.0 | -0.003 | -0.002 | +0.185 (z 1.6) | **+0.696** (z 4.4) |
| speed 4.5 | -0.034 | -0.001 | -0.045 | **+0.763** (z 6.0) |

| exploit7204 | turn 0.8 | turn 1.8 | turn 2.4 | turn 2.8 |
|---|---|---|---|---|
| speed 2.0 | -0.072 | -0.072 | -0.071 | -0.072 |
| speed 3.0 | -0.073 | -0.071 | -0.136 | -0.466 (z -2.7) |
| speed 4.0 | -0.073 | -0.071 | -0.134 | **+0.697** (z 3.6) |
| speed 4.5 | -0.073 | -0.071 | -0.206 | **+1.083** (z 8.9) |

**RG1 THE STRONG CORNER (4.5, 2.8) HELPS: yes** (+0.763 and +1.083). **RG2 THE HEADLINE: AND** (neither A (2.0, 2.8) nor B (4.5, 0.8) helps: -0.034 and -0.072; -0.034 and -0.073). **RG3 THE GATES:** the speed gate (at turn 2.8) is **4.0**, the turn gate (at speed 4.5) is **2.8**. **RG4 THE COUNT: 2 of the 16 cells HELP: (4.0, 2.8) and (4.5, 2.8).** **RG5 THE COSTS:** none decided (exploit7204 at (3.0, 2.8) is -0.466, z -2.7, 0.034 under the bar).

**The forecast quantities as printed** (scored on HELD, not here): strong corner helps yes; AND yes; TURN ALONE, SPEED ALONE, EITHER and NOT REPLICATED no; turn gate 2.4 or higher or none yes; speed gate 4.0 or higher or none yes; four or more cells no; hurts somewhere no.

**Said plainly about this read:** the smoke report (Amendment A item 1) had the same headline, AND, with the same two cells helping, on four geometries at 8 duels a matchup. That is not independent evidence and DEV is a different 48, but **I saw the smoke headline before writing any DEV rule down as read**: the 62 given to AND and the 70 and 60 given to the gates are not blind numbers, and every forecast of section 5 is scored on HELD as written.

**Observations (DEV, for reading, not rules):**

1. **The effect is decided at the two top cells of the turn-2.8 column and nowhere else.** At turn 2.8 it climbs with the opponent's speed (league7001: -0.034, +0.185, +0.696, +0.763; exploit7204: -0.072, -0.466, +0.697, +1.083); at turn 2.4 and below it is within -0.21 to +0.19 at every speed. By the registered rule that is AND: the strong speed alone (B) and the strong turn alone (A) do nothing.
2. **It sits where the unchanged hunter is near parity.** At the two helped cells the BASE edge is +0.43 and +0.02 (league7001) and +0.51 and +0.05 (exploit7204); at the cells that do nothing it is +1.4 to +2.8, the hunter already well ahead, as the ceiling remark of Amendment A item 2 said. **Post-hoc:** the "gate" this read finds is in part the place where the opponent evades well enough that there is anything left to gain; this read cannot separate the two.
3. **A possible cost where the opponent turns hard and is slower, under the bar.** exploit7204 against the (3.0, 2.8) opponent is **-0.466 (z -2.7)**, and the speed-3.0 cell of league7001 is +0.185: the same sign flip along speed at turn 2.8 that the reach read found as league7103's cost (-0.5; evadeSpeed 3.55, evadeTurn 2.80). Not decided here (0.034 under the bar), one base, one set; **HELD's RG5 will say.**
4. **A small constant cost at the ceiling for exploit7204:** -0.071 to -0.073 in ten cells (z -1.0 to -1.1 each: the whole speed-2.0 row and the turn-0.8 and turn-1.8 cells of the other three speeds), against -0.002 to -0.034 for league7001: the slower hunter loses a little more than 0.07 in the same way whatever the opponent's pair, when it is already far ahead. Under every bar; not a rule.
5. **The count is two, so "four or more" (45) did not come true, and the gates sit at the top of both grids** (the speed gate at 4.0, the turn gate at 2.8): 2.4 is not enough at speed 4.5 (-0.045 and -0.206).

**What is NOT shown:** any HELD read; the surface between the grid's values (the turn gate is placed to within 0.4, the speed gate to within 0.5 or 1.0); a hunter with another body; any dose of trackSpeed; a mechanism.

## HELD RESULT (2026-11-17; `node tools/ship/takeEvadeGates.mjs held --write`, geometries 127001 to 127048 (96 duels a matchup), flown ONCE, exit 0; record `brain/subEvadeGatesHeld.json`: 66 matchups, no check failed)

Flown on Keith's word ("Rounds 4 and 5 HELD can fly when ready"), after the DEV read above; the registration and the command's HELD gate allowed it (R0 held on DEV and no check failed). **The rules are about this set.**

**R0 holds.** OWN is **+1.074** for league7001 (z 7.3, 42-46-8) and **+0.823** for exploit7204 (z 7.4, 45-31-20), both decided.

**The effect Delta(h; s, u) of the slower trackSpeed** (HELD; DEV in the last column; HELPS in bold). The two cells that HELP, and the cells nearest the bar:

| cell (speed, turn) | league7001 | exploit7204 | DEV: league7001, exploit7204 |
|---|---|---|---|
| (4.5, 2.8) the strong corner | **+1.040** (z 6.7) | **+1.188** (z 11.4) | +0.763, +1.083 |
| (4.0, 2.8) | **+0.632** (z 4.3) | **+0.675** (z 3.9) | +0.696, +0.697 |
| (3.0, 2.8) | -0.329 (z -1.7) | -0.091 | +0.185, -0.466 |
| (4.5, 2.4) | -0.178 | -0.356 | -0.045, -0.206 |
| (4.0, 2.4) | -0.038 | -0.094 | +0.185, -0.134 |
| A (2.0, 2.8) | -0.034 | +0.170 (z 1.7) | -0.034, -0.072 |
| B (4.5, 0.8) | -0.004 | +0.171 (z 1.7) | -0.034, -0.073 |

The other nine cells of each hunter are within -0.035 to +0.171.

**RG1 THE STRONG CORNER (4.5, 2.8) HELPS: yes.** **RG2 THE HEADLINE: AND** (A and B do not help). **RG3 THE GATES:** the speed gate is **4.0**, the turn gate **2.8**. **RG4 THE COUNT: 2 of the 16 cells HELP: (4.0, 2.8) and (4.5, 2.8).** **RG5 THE COSTS: none** (no cell is decided negative for either hunter).

**The forecasts, scored** (as the larger side of each probability):

| forecast | probability | outcome |
|---|---|---|
| R0 holds on DEV | 90 | **true** |
| R0 holds on HELD | 88 | **true** |
| RG1: the strong corner HELPS | 85 | **true** |
| the headline is AND | 62 | **true** |
| the headline is TURN ALONE | 8 | false (right) |
| the headline is SPEED ALONE | 5 | false (right) |
| the headline is EITHER | 10 | false (right) |
| the headline is NOT REPLICATED | 15 | false (right) |
| the turn gate is 2.4 or higher, or none | 70 | **true** |
| the speed gate is 4.0 or higher, or none | 60 | **true** |
| four or more of the 16 cells HELP | 45 | false (right) |
| HURTS SOMEWHERE | 35 | false (right) |

**12 of 12 as the larger side.** **Said plainly:** AND, the gates' placement and the count of two were the smoke report's and the DEV read's, which I had seen before HELD (Amendment A item 1 and the DEV note); the registered forecasts are scored as written, and this tally is therefore not a measure of foresight.

**Observations (HELD, for reading, not rules; the DEV read's observations stand unless said):**

1. **HELD replicates DEV in every rule and in the cells.** The same two cells help, at +0.63 to +1.19 (DEV +0.70 to +1.08), and every other cell of both hunters is within -0.36 to +0.17. The registered rules say AND: neither the fast speed with a weak turn nor the hard turn with a weak speed.
2. **The near-miss cost does not repeat.** exploit7204 at (3.0, 2.8) was -0.466 (z -2.7) on DEV and is **-0.091** on HELD; league7001 there was +0.185 on DEV and is **-0.329 (z -1.7)**. The sign along speed at turn 2.8 is not the same on the two sets for either hunter, so I read **no cost**, as RG5 does, and not the DEV's -0.466.
3. **The ceiling reading repeats.** At the two helped cells the unchanged hunter is near parity (BASE +0.794 and -0.033 for league7001, +0.640 and -0.123 for exploit7204; on DEV +0.43, +0.02, +0.51, +0.05); at every cell that does nothing it is +1.6 to +2.7. **Post-hoc, as before: this read cannot separate "the gate" from "where the hunter is not already winning".**
4. **The small constant at the ceiling did not repeat.** exploit7204's -0.071 to -0.073 in ten cells on DEV is **+0.170 to +0.171 (z 1.7)** in the same ten cells on HELD, league7001's -0.034 to -0.004: a constant per hunter and set, of either sign. **Not a rule and not an effect**; the DEV note's observation 4 should be read as noise.
5. **2.4 is not enough at speed 4.5 on a second set** (-0.178 and -0.356, after -0.045 and -0.206).

**What is NOT shown:** the surface between the grid's values (the turn gate is placed to within 0.4, the speed gate to within 0.5); a hunter with another body; any dose of trackSpeed; a mechanism.
