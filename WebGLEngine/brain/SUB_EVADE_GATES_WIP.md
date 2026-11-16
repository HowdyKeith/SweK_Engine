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
