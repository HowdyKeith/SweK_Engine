# Submarine duel: league7100 with a longer pingEvery against the other boats (REGISTRATION 16 of the evade reads; 2026-11-17; UNNUMBERED; REGISTERED BEFORE ANY CODE FOR IT IS WRITTEN AND BEFORE ANY GEOMETRY OF ITS SETS IS FLOWN)

Keith, 2026-11-17: "lets do league7100 with the longer pingEvery against the other boats". This is the first candidate `brain/SUB_EVADE_TOP_WIP.md` left (its HELD RESULT, "What this result does and does not say"): **league7100 with pingEvery 40, the bound, gains against league7100 itself (+0.485 on DEV, +0.620 on HELD) and with 25 does not (+0.040, +0.133); every arm of that note was flown against its own base.** **This note asks whether the gain survives against the boats that are not its base, in the shape of `brain/SUB_EVADE_AWAY_WIP.md`, with the rules, the bar and the forecasts written before any of its sets is flown.**

**What this changes in shared files, said first: nothing.** New files only: this note, `tools/ship/takeEvadeAbroad.mjs` (the command), `tools/ship/takeEvadeAbroad-selfcheck.mjs` (its gate), `brain/subEvadeAbroadDev.json` and `brain/subEvadeAbroadHeld.json`. It imports, and does not edit, `tools/ship/takeEvadeTurn.mjs` (`rowOf`), `tools/ship/takeSubLeague.mjs` (`loadRuns`, `decided`, `signed`), `tools/ship/takeEvadeAway.mjs` (`vOf`, `effectOf`, `boatTheta`, `opponentsOf`) and `brain/subTournament.mjs`.

## 1. What is known (read from the records; nothing here is flown again)

* **league7100 against itself** (`SUB_EVADE_TOP_WIP.md`, DEV 130001 and HELD 131001, 96 geometries a set, league7100's pingEvery of 8.30 replaced by the value, against league7100): at 25 **+0.040 (z 0.4) and +0.133 (z 1.7)**, at 40 **+0.485 (z 3.9) and +0.620 (z 5.9)**; pooled over the two sets **+0.095 (se 0.059) at 25 and +0.564 (se 0.080) at 40**. The donor's dose was still rising at the bound (pingEvery 4 to 40, `THETA_BOUNDS`). league7100 draws most of its duels against itself (114 to 159 of 192).
* **The same arm on the comparators' side** (`SUB_EVADE_PING_WIP.md`, `SUB_EVADE_TOP_WIP.md`): pingEvery 40 on a fast tracker is flat (league7001) or a decided fall (exploit7204, -0.41 and -0.35); on boats with league7100's slow trackSpeed (3.15) it keeps rising to 40 (S:exploit7204 +0.96 and +1.08). league7100's trackSpeed is 3.15.
* **The ceiling of an edge** (`SUB_EVADE_AWAY_WIP.md`, `SUB_EVADE_GATES_WIP.md`): against weak evaders a hunter already scores about **+2.6 to +3.3**, so a difference of edges cannot show there; **an effect can show only against boats that evade well enough to survive the unchanged hunter.** league7100 beat league7001 and exploit7204 by +1.3 to +1.5 on the sets of the last two notes (`LEAD`).
* **Nothing is known** of league7100 with any pingEvery other than its own 8.30 against any boat but itself.

## 2. The question and the arms

**The question:** does league7100 with pingEvery **40.0** (the bound, the value that pays against its own copy) and with **25.0** (the value that does not) do better or worse than league7100 as it is, against each of the fourteen boats that are not league7100?

**The hunter (MY CHOICE, fixed now):** league7100's own final theta of the files, **alone** (the other recipes, the comparators and the slow-tracker variants are not hunters here). **The opponents:** the fourteen of the fifteen boats that are not league7100, in the order of `BOATS` of `takeEvadeAway.mjs`: league7000, league7001, league7101, league7102, league7103, league7104, league7105, exploit7200, exploit7201, exploit7202, exploit7203, exploit7204, exploit7205 and G (the generation-0 search-ping champion). **The values: V = 25.0 and 40.0** (fixed numbers; 40.0 is the bound; 25.0 the value that pays the comparators and not the donor).

**The matchups:** **OWN(v)**, for each v of V: league7100 with pingEvery v against league7100 (the top note's arm, flown again on new geometries); and for each opponent o: **BASE(o)**, league7100 against o, and **ARM(v, o)**, league7100 with pingEvery v against o, for each v: **2 + 14 x 3 = 44 matchups a set**, the hunter (or the arm) the first side. **THE EFFECT of v against an opponent o** is the **paired** difference by geometry of ARM(v, o) over BASE(o): per geometry the mean of the two seats' (X's score less Y's) (`vOf`), the difference of the two, its mean, standard error and z (`effectOf`). **THE STEP against o** is the paired difference of ARM(40, o) over ARM(25, o) in the same way (reported).

## 3. The sets and the order

* **smoke**: geometries 1 to 4, never recorded, free to read.
* **DEV**: **132001 to 132096** (96 geometries), both seats; flown first, read freely, recorded once in `brain/subEvadeAbroadDev.json`; it decides whether HELD is spent (R0).
* **HELD**: **133001 to 133096** (96 geometries), both seats; flown ONCE (`held --write`; refuses without a recorded DEV that replicates and lists no failed check, without `--write`, or if its record exists); the rules are about HELD.
* **96 geometries a set (MY CHOICE, as in the last two notes):** the bar of 0.25 needs a standard error under about 0.12; 44 matchups of 192 duels is the cost (about 17 minutes of one core a set).
* No file under `brain` or `tools` uses 132001 to 133096 as geometries (searched as whole numbers in the `.mjs`, `.md` and `.json` files; the two hits in that range are a millisecond prediction in a sweep log and a floating-point number in a results file).
* **Amendments:** as in the other notes: only dated, only before this note's HELD. **Every void-check is an identity or a file's own number, and the command's HELD gate refuses a DEV with a failed check.** **If a smoke report is read, its headline is said in Amendment A before any DEV geometry.**
* **The order of work:** this note, the command, its gate with a sabotage log, smoke, DEV; **HELD only on Keith's word.**

## 4. The rules (MY CHOICES, said; Keith may set them differently)

* **THE BAR (as in the last two notes, not the standard 0.5 of `SUB_EVADE_AWAY_WIP.md`):** an arm (OWN) **PAYS** iff its edge is **0.25 or more and its z is 2 or more**, **COSTS** at -0.25 and -2, else NEUTRAL. **An EFFECT HELPS** iff its edge is 0.25 or more and its z is 2 or more, **HURTS** iff -0.25 and z of -2 or less, else is NEUTRAL; **a STEP RISES, FALLS or is FLAT** at the same bar. **FLAT and NEUTRAL do not say no change: they say none decided at this bar.**
* **What the smaller bar costs, said before the read:** at z of 2 an effect with no change is decided in one direction about 2.3% of the time; **28 effects (14 opponents, two values) give about 0.6 false HELPS and 0.6 false HURTS among them under no effect at all.** So **"HURTS SOMEWHERE" alone is weak evidence of a cost, and a reach label of NARROW needs no effect to appear; a named opponent that HURTS on both DEV and HELD is the thing to read.**
* **R0 REPLICATES** iff OWN(40.0) PAYS (edge 0.25 or more and z of 2 or more). On DEV, if R0 fails HELD is not flown by this registration. (The premise of the question: the arm that paid against its own copy twice pays on a third set. It does not need to pay at 25.0.)
* **RA1 THE REACH of v** (v = 40.0 and v = 25.0): the number n of the fourteen opponents against which the effect of v HELPS: **"GENERAL"** iff n is 12 or more, **"COMMON"** iff 7 to 11, **"NARROW"** iff 6 or fewer (the labels of `takeEvadeAway.mjs`), and the opponents it HURTS.
* **RA2 THE COST:** **"HURTS SOMEWHERE"** iff the effect of either value HURTS against some opponent.
* **RA3 THE COMMON OPPONENTS:** the opponents against which both values HELP, in the order of `BOATS`.
* **RA4 THE HEADLINE:** "ABROAD: 40 <label>, 25 <label>" and ", HURTS SOMEWHERE" iff RA2.
* **Reported with the read, not in a rule:** every row (edge, se, z, wins-draws-losses, seat edges); for each opponent its evadeSpeed and evadeTurn and the BASE edge (the ceiling: how much room league7100 has), the two effects and the step; the opponents against which the step RISES or FALLS; **the OWN effects at both values**; the median of the 14 effects at 40.0; **the effect against league7001 and exploit7204 (the comparators of the last two notes) and against G**; **the forecast quantities of section 5 as yes/no**. **Any reading of why (a ceiling, the opponent's tracker, a quieter boat) is post-hoc and labelled.**
* **Checks that void the read, said and not weighed. Every one is an identity or a file's own number:** every matchup flew the set's geometries (each seed twice) and every row has one value a geometry; no non-finite score; every theta one `clampTheta` leaves unchanged (40.0 is the bound); every run's generation 0 is G; **U(league7100) against a copy of itself has an edge of exactly 0**; **every BASE is league7100's final against the opponent's final of the files (G for G), every ARM is league7100's final with pingEvery set to its value of V and nothing else moved against the same opponent, every OWN is that arm against league7100's final**; **V is exactly 25.0 and 40.0**; **every row's per-geometry values average to the row's edge to 1e-9** (the one tolerance: floating-point summation order); **the matchups are exactly the two OWN, then for each opponent in the order of BOATS its BASE, its ARM at 25.0 and its ARM at 40.0**; **an arm identical to its opponent's side has an edge of exactly 0** (none is).

## 5. Forecasts, written before any geometry of any of the two sets is flown (probabilities, mine)

| forecast | probability |
|---|---|
| R0 holds on DEV | **95** |
| R0 holds on HELD | **94** |
| RA1 at 40.0 is "GENERAL" | **8** |
| RA1 at 40.0 is "COMMON" | **30** |
| RA1 at 40.0 is "NARROW" | **62** |
| RA1 at 25.0 is "NARROW" | **80** |
| RA2 is "HURTS SOMEWHERE" | **55** |
| the effect of 40.0 HELPS against both league7001 and exploit7204 | **40** |
| the effect of 40.0 HELPS against G | **12** |
| the effect of 40.0 HELPS against at least 3 of the 14 | **80** |
| the OWN effect at 40.0 is larger than the median of the 14 effects at 40.0 | **70** |
| the step from 25.0 to 40.0 RISES against some opponent | **55** |
| RA3 is empty (no opponent is HELPED by both values) | **60** |

Why these: **the ceiling.** Against the weak evaders league7100 already scores +2.6 to +3.3 and a difference of edges cannot show there, so the reach of any arm of league7100 will be counted among the boats that survive it, which in the last rounds were the strong four and one or two others: **"NARROW" is the likeliest label at 40.0 (62), "COMMON" is the case that the effect is large enough to show against some weaker boats too (30), "GENERAL" needs 12 of 14 including the weakest (8).** The arm at 25.0 did not pay against its own copy (+0.095 pooled), so I expect it to help few opponents (80 NARROW). **The effect against its own copy was +0.56, and the copy is the opponent with the most room: I expect the OWN effect to be among the larger ones (70), and the effect against G, the weakest, not to show (12).** The comparators are the next-hardest opponents the donor has met: both HELPING is a little under even (40), at least 3 of 14 is likely given 14 chances at +0.3 or more (80). **HURTS SOMEWHERE is about even (55) because the false HURTS rate alone is about 0.6 in 28 effects, plus a real cost against boats that evade by a method a long interval fails against** (exploit7204's own fall at 40 is the example, and exploit7204 is among the opponents). The step rising against some opponent (55) and an empty common list (60) follow from 25.0 not paying its own copy.

## 6. What a result would not say

* **A mechanism.** A longer interval could be quieter, or find the target less often: no event is read.
* **That the arm is better than league7100's own theta in a league:** every effect is a difference of edges of league7100 against one boat at a time, and **a ceiling hides the effect against the weaker boats**; a result of "NARROW" is not "does nothing against the weak boats", it is no change that could be seen there.
* **Anything about another hunter, a pingEvery other than 25.0 and 40.0** (35.0 paid on HELD against its own copy and is not flown here), **a value above the bound, an interaction with trackSpeed, pingAfter or searchPing**, **or the surface between the two values.**
* **That the opponents are independent:** the fourteen are the finders of two recipes and G; league7100 is on every matchup.
* **A reading of an opponent that did not repeat on both sets:** the bar is the smaller one (section 4).

## 7. Cost

44 matchups of 192 duels a set, about seventeen minutes of one core a set; the command, its gate and a sabotage pass are the work.

## AMENDMENT A (2026-11-17; written after the command and its gate were written and the command's `smoke` was run on geometries 1 to 4, BEFORE any geometry of the DEV set 132001 to 132096 or of HELD is flown)

**1. The smoke headline, said before any DEV geometry (the rule of section 3).** The command's `smoke` was run on geometries 1 to 4 (8 duels a matchup; never recorded; free to read). **The headline was "ABROAD: 40.00 NARROW, 25.00 NARROW, HURTS SOMEWHERE":** the effect of 40.0 HELPS against 0 of the 14 opponents and **HURTS against 6** (league7103, league7104, league7105, exploit7200, exploit7202 and G, z of about -3 to -48 on four geometries); the effect of 25.0 HELPS and HURTS against none. **R0 does NOT hold on it:** OWN(40.0) is +0.718 (z 0.9) on the four smoke geometries (the top note's arm paid at +0.485 and +0.620 on 96). Eight duels on four geometries have a standard error of 0.4 to 1.1 on an effect: **the smoke is a test that the command runs and not a read**, and R0 gates only the DEV record, which is flown on its own geometries.

**2. Things the smoke shows that this note did not say (said before data; no rule is changed).** (a) **The ceiling works one way.** The BASE edges are **+3.23 to +3.29 against ten of the fourteen opponents** (league7000, league7101, league7102, league7104, league7105, exploit7201, exploit7202, exploit7203, exploit7205, G) and +1.55 to +2.38 against league7001, league7103, exploit7200 and exploit7204; **against a boat that league7100 already beats by +3.3 an arm can lose a good deal and cannot gain, so the counts of HELPS and of HURTS are not symmetric reads**: a long interval that costs the hunter some of its wins against the weak boats shows as HURTS, and a gain there could not show at all. (b) **The effect at 40.0 on the smoke geometries is negative against all fourteen opponents, -0.05 to -2.03, median -1.18**; the effect of 25.0 is -0.03 to -0.04 against eight of the ten near-ceiling boats (the arm at 25.0 plays nearly the same duels as the BASE on those geometries) and -0.87 against league7101 and exploit7203. **I did not forecast a cost of this size; if DEV shows it, the question of the note is answered the other way round from the top note's arm against its own copy, and HURTS SOMEWHERE (55) was the forecast that allowed for it.** (c) The arms' ids carry two decimals (`ARM:40.00>league7001`); the checks use the numbers.

**3. A change to the command's checks (said before data).** As in the ping and top notes, the checks list the two identities **"every lower side is the boat's final ... and a BASE's first side is league7100's final"** and **"every OWN and ARM is league7100's final with pingEvery set to its value"** as two checks with two names, the values check and the matchup-order check as two checks, and **the per-geometry-values check as one check with one tolerance (1e-9)**.

**4. What is not changed:** the hunter, the opponents, the values, the matchups, the sets, the bars of 0.25 (effects, steps, OWN) and the labels, the rules R0 and RA1 to RA4, the forecasts, the geometries, the order of work.

## DEV RESULT (2026-11-17; `node tools/ship/takeEvadeAbroad.mjs dev --write`, geometries 132001 to 132096 (192 duels a matchup), exit 0; record `brain/subEvadeAbroadDev.json`: 44 matchups, no check failed)

DEV is free to read. **HELD (133001 to 133096) is NOT flown by this note's work so far**: Keith's message for this round ("lets do league7100 with the longer pingEvery against the other boats") did not say "fly HELD", so I am waiting for his word. R0 held on DEV and no check failed, so the command's HELD gate would accept this record. **I flew DEV on my own reading of "do the round"**, as free-to-read data that gates HELD; it spent the DEV set 132001 to 132096, recorded once. Forecasts are scored on DEV only for "R0 holds on DEV" (95): **TRUE**. The others stand as written for HELD.

**R0 holds.** OWN(40.0), league7100 with pingEvery 40 against league7100: **+0.541 +- 0.111 (z 4.9, 59-109-24): PAYS** (the top note's arm, +0.485 and +0.620 on its two sets). OWN(25.0) is **+0.315 (z 3.7): PAYS this time** (+0.040 and +0.133 on the top note's two sets).

**The registered readings on DEV (read, not scored):**
* **RA1 THE REACH of 40.0: HELPS against 0 of 14 opponents, "NARROW"; the effect HURTS against ALL FOURTEEN** (league7000 -1.369, league7001 -0.279, league7101 -1.013, league7102 -0.578, league7103 -0.966, league7104 -1.393, league7105 -1.435, exploit7200 -0.845, exploit7201 -1.280, exploit7202 -1.240, exploit7203 -1.332, exploit7204 -0.881, exploit7205 -1.259, G -0.905; z of -2.7 to -9.8; **the median -1.126**).
* **RA1 THE REACH of 25.0: HELPS against 0 of 14, "NARROW"; HURTS against 4** (league7104 -0.284, exploit7202 -0.285, exploit7203 -0.257, exploit7205 -0.399; z of -2.7 to -3.6); the other ten are NEUTRAL (-0.074 to +0.233).
* **RA2 THE COST: "HURTS SOMEWHERE". RA3 THE COMMON OPPONENTS: none. RA4 THE HEADLINE: "ABROAD: 40.00 NARROW, 25.00 NARROW, HURTS SOMEWHERE".**
* **The step from 25.0 to 40.0 FALLS against all fourteen** (-0.42 to -1.22, z of -4.5 to -11.3) and RISES against none.
* **The forecast quantities on DEV:** GENERAL at 40.0 no; COMMON no; NARROW yes; NARROW at 25.0 yes; hurts somewhere yes; league7001 and exploit7204 both helped at 40.0 no; G helped no; at least 3 helped no; the OWN effect above the median yes; the step rises against some opponent no; no common opponent yes.

**What the DEV rows show beyond the registered reading (POST-HOC, labelled, not a rule of this note):**
* **The gain against its own copy is a loss against every other boat.** The arm at 40.0 scores less than league7100 does against all fourteen: league7100's own edge against the ten weaker boats is +2.42 to +2.57 (the smoke's +3.2 to +3.3 was four geometries) and **with pingEvery 40 it is +0.61 to +1.97**; against the four hardest (league7001, league7103, exploit7200, exploit7204) the base edges are +1.05, +1.58, +0.69 and +1.14 and the arm's are +0.77, +0.61, **-0.15** and +0.26 (the arm at 40.0 **loses** to exploit7200 where league7100 wins by +0.69).
* **The cost is larger against the weaker boats**: the mean effect at 40.0 is **-1.18 against the ten with a base edge of 2.4 or more and -0.74 against the four with a base edge under 1.7**; the effect at 40.0 and the base edge correlate at **-0.60** over the fourteen. **The effect at 25.0 changes sign with the same ordering**: **+0.06 to +0.23 (mean +0.13, NEUTRAL, under the bar) against the four hardest and -0.07 to -0.40 (mean -0.23) against the other ten; the correlation with the base edge is -0.92.** I read no cause for the ordering.
* **The three sets of the arm against its own copy** (the top note's DEV and HELD and this DEV; each arm's own standard error): pooled **+0.556 (se 0.065) at 40.0 and +0.167 (se 0.049) at 25.0.**
* **Ceiling:** none of the base edges is at the ceiling of 3.3 on these geometries, so the "ceiling works one way" of Amendment A item 2a does not describe what DEV shows: the hunter has room to gain against the weaker boats (+0.7 to +0.9) and the arm does not use it.
* **No mechanism is read** (a longer interval could be quieter against its own copy and find a target less often against the others: no event is read).

**What this does to HELD: nothing is changed.** HELD scores the registered rules. **On DEV two of my 12 forecasts other than the two on R0 would have been wrong as the larger side** (at least 3 of the 14 helped at 40.0, 80; the step rising against some opponent, 55); they are scored on HELD only. **The forecast "HURTS SOMEWHERE" (55) was right and said nothing of 14 of 14; I did not forecast that.**
