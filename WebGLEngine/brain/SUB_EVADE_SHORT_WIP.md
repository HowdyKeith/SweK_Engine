# Submarine duel: league7100 with a shorter pingEvery against the other boats (REGISTRATION 17 of the evade reads; 2026-11-17; UNNUMBERED; REGISTERED BEFORE ANY CODE FOR IT IS WRITTEN AND BEFORE ANY GEOMETRY OF ITS SETS IS FLOWN)

Keith, 2026-11-17: "lets work through all 3" (the three candidates the HELD RESULT of `brain/SUB_EVADE_ABROAD_WIP.md` left). **This is the first: league7100 with a SHORTER pingEvery against the other boats.** The second is `brain/SUB_EVADE_PINGAWAY_WIP.md` (the comparators' longer-interval arms against the other boats), the third `brain/SUB_EVADE_TYPE_WIP.md` (a read of the records of the three: does the effect follow the opponent?). **All three are registered before the code or any geometry of any of them exists.**

**What this changes in shared files, said first: nothing.** New files only: this note, `tools/ship/takeEvadePingReach.mjs` (a generic command that this round and the next both use: a spec of hunters, values and sets), `tools/ship/takeEvadeShort.mjs` (this round's spec and forecasts), `tools/ship/takeEvadePingReach-selfcheck.mjs` and `tools/ship/takeEvadeShort-selfcheck.mjs` (their gates), `brain/subEvadeShortDev.json` and `brain/subEvadeShortHeld.json`. It imports, and does not edit, `tools/ship/takeEvadeTurn.mjs` (`rowOf`), `tools/ship/takeSubLeague.mjs` (`loadRuns`, `decided`, `signed`), `tools/ship/takeEvadeAway.mjs` (`vOf`, `effectOf`, `boatTheta`, `opponentsOf`) and `brain/subTournament.mjs`.

## 1. What is known (read from the records; nothing here is flown again)

* **league7100 with a LONGER pingEvery against the other boats** (`SUB_EVADE_ABROAD_WIP.md`, DEV 132001 and HELD 133001, 96 geometries a set): with 40 it does worse than league7100 as it is against **all fourteen other boats on both sets** (median effect -1.13 and -1.10; against its own copy it gains +0.54 and +0.77); with 25 it hurts against four and three (league7104 and exploit7205 on both) and helps against none. **The effect at 25 follows the base edge: +0.04 to +0.26 against the four hardest boats (league7001, league7103, exploit7200, exploit7204), -0.07 to -0.40 against the ten others.**
* **league7100 with the comparators' pingEvery of 4 against league7100 itself** (`SUB_EVADE_MOVE_WIP.md`): **-0.035 (DEV) and +0.065 (HELD)**, about 0; league7100's own pingEvery is **8.30** (the bound is 4 to 40, `THETA_BOUNDS`); the comparators' is 4.
* **league7100's edge against the other fourteen boats** (the BASE rows of the abroad records): +2.4 to +2.9 against ten of them and +0.7 to +1.7 against league7001, league7103, exploit7200 and exploit7204 (on 96 geometries).
* **Nothing is known** of league7100 with any pingEvery below its own 8.30 against any boat but itself, or of a value between 8.30 and 25 against the other boats.

## 2. The question and the arms

**The question:** does league7100 with a pingEvery SHORTER than its own (4.0, the lower bound and the comparators' own; 6.0), or slightly longer (12.0, a control just above its own 8.30), do better or worse than league7100 as it is, against each of the fourteen boats that are not league7100?

**The hunter (MY CHOICE, fixed now):** league7100's own final theta of the files, **alone**. **The opponents:** the fourteen of the fifteen boats that are not league7100 (the order of `BOATS` of `takeEvadeAway.mjs`). **The values: V = 4.0, 6.0 and 12.0** (fixed numbers).

**The matchups:** **OWN(v)**, for each v of V: league7100 with pingEvery v against league7100; for each opponent o: **BASE(o)**, league7100 against o, and **ARM(v, o)**, league7100 with pingEvery v against o, for each v: **3 + 14 x 4 = 59 matchups a set**, the arm (or the hunter) the first side. **THE EFFECT of v against o** is the **paired** difference by geometry of ARM(v, o) over BASE(o) (`vOf`, `effectOf`); **THE STEP** from one value to the next higher is the paired difference of the arm at the higher value over the arm at the lower (4.0 to 6.0, 6.0 to 12.0), reported.

## 3. The sets and the order

* **smoke**: geometries 1 to 4, never recorded, free to read. **DEV**: **134001 to 134096** (96 geometries), both seats; flown first, read freely, recorded once in `brain/subEvadeShortDev.json`; it decides whether HELD is spent (R0). **HELD**: **135001 to 135096** (96 geometries), both seats; flown ONCE (`held --write`; refuses without a recorded DEV that replicates and lists no failed check, without `--write`, or if its record exists); the rules are about HELD.
* **96 geometries a set (MY CHOICE, as in the last notes):** the bar of 0.25 needs a standard error under about 0.12; 59 matchups of 192 duels is the cost (about 23 minutes of one core a set).
* No file under `brain` or `tools` uses 134001 to 137096 as geometries (searched as whole numbers in the `.mjs`, `.md` and `.json` files; the hits in that range are floating-point numbers, a byte count and a timing).
* **Amendments:** as in the other notes: only dated, only before this note's HELD. **Every void-check is an identity or a file's own number, and the command's HELD gate refuses a DEV with a failed check.** **If a smoke report is read, its headline is said in Amendment A before any DEV geometry.**
* **The order of work:** this note, the command, its gate with a sabotage log, smoke, DEV; **HELD only on Keith's word.**

## 4. The rules (MY CHOICES, said; Keith may set them differently)

* **THE BAR (as in the ABROAD note):** an OWN **PAYS** iff its edge is **0.25 or more and its z is 2 or more**, **COSTS** at -0.25 and -2, else NEUTRAL; an **EFFECT HELPS** iff its edge is 0.25 or more and its z is 2 or more, **HURTS** at -0.25 and -2, else is NEUTRAL; a **STEP RISES, FALLS or is FLAT** at the same bar. **NEUTRAL and FLAT do not say no change: they say none decided at this bar.** **What the smaller bar costs:** at z of 2 an effect with no change is decided in one direction about 2.3% of the time; **42 effects (14 opponents, three values) give about 1 false HELPS and 1 false HURTS under no effect at all**, so **"HURTS SOMEWHERE" alone is weak evidence of a cost; a named opponent that repeats on DEV and HELD is the thing to read.**
* **R0 REPLICATES** iff league7100 beats league7001 and exploit7204 decided at the standard bar (the BASE rows against both: an edge of 0.5 or more and a z of 2 or more). On DEV, if R0 fails HELD is not flown by this registration. (A data-quality gate, as the LEAD rows of the ping and top notes; the arms need no premise.)
* **RS1 THE REACH of v** (each v of V): the number n of the fourteen opponents against which the effect of v HELPS: **"GENERAL"** iff n is 12 or more, **"COMMON"** iff 7 to 11, **"NARROW"** iff 6 or fewer, and the opponents it HURTS.
* **RS2 THE COST:** **"HURTS SOMEWHERE"** iff the effect of some v HURTS against some opponent.
* **RS3 THE COMMON OPPONENTS:** the opponents against which both 4.0 and 6.0 HELP, in the order of `BOATS`.
* **RS4 THE HEADLINE:** "SHORT: 4.00 <label>, 6.00 <label>, 12.00 <label>" and ", HURTS SOMEWHERE" iff RS2.
* **Reported with the read, not in a rule:** every row (edge, se, z, wins-draws-losses, seat edges); for each opponent its evadeSpeed and evadeTurn, the BASE edge and the three effects and the two steps; **the OWN edges** (OWN(4.0) against its lesion of about 0); the opponents against which each step RISES or FALLS; **the forecast quantities of section 5 as yes/no**; **every (value, opponent) effect, as the cells of `SUB_EVADE_TYPE_WIP.md` read them**. **Any reading of why is post-hoc and labelled.**
* **Checks that void the read, said and not weighed. Every one is an identity or a file's own number:** every matchup flew the set's geometries and every row has one value a geometry; no non-finite score; every theta one `clampTheta` leaves unchanged; every run's generation 0 is G; **U(league7100) against a copy of itself has an edge of exactly 0**; **every BASE is league7100's final against the opponent's final of the files (G for G), every ARM is league7100's final with pingEvery set to its value of V and nothing else moved against the same opponent, every OWN is that arm against league7100's final**; **V is exactly 4.0, 6.0 and 12.0**; **every row's per-geometry values average to the row's edge to 1e-9** (the one tolerance); **the matchups are exactly the three OWN, then for each opponent in the order of BOATS its BASE and its ARMs at 4.0, 6.0 and 12.0**; **an arm identical to its opponent's side has an edge of exactly 0** (none is).

## 5. Forecasts, written before any geometry of any of the two sets is flown (probabilities, mine)

| forecast | probability |
|---|---|
| R0 holds on DEV | **96** |
| R0 holds on HELD | **95** |
| RS1 at 4.0 is "NARROW" | **82** |
| RS1 at 6.0 is "NARROW" | **88** |
| RS1 at 12.0 is "NARROW" | **90** |
| RS2 is "HURTS SOMEWHERE" | **55** |
| the effect of 4.0 HELPS against some opponent | **40** |
| the effect of 4.0 HURTS against some opponent | **40** |
| RS3 is empty (no opponent HELPED by both 4.0 and 6.0) | **85** |
| OWN(4.0) is NEUTRAL | **80** |

Why these: **the effect against the other boats moves with the value the way the abroad note found for longer intervals** (about 0 at 8.30 by construction, -0.2 at 25, -1.2 at 40 against the weaker boats), so **a value just below 8.30 should give an effect near 0, not decided at the bar of 0.25: "NARROW" is the likeliest label at every value (82, 88, 90)**; the arms at 4.0 and 6.0 may help a little against the hardest boats (the abroad effect at 25 was positive there) and cost a little against the weak ones, but 42 effects at a bar of 0.25 give about one decided effect of each sign by chance, so "HURTS SOMEWHERE" is a little over even (55) and each of "HELPS against some" and "HURTS against some" a little under (40). The lesion (-0.035 and +0.065) is why OWN(4.0) is likely NEUTRAL (80).

## 6. What a result would not say

* **A mechanism.** A shorter interval is louder and finds a target sooner: no event is read.
* **That a shorter interval is better in a league** (every effect is a difference of edges against one boat at a time), **anything about another hunter** (the comparators are `SUB_EVADE_PINGAWAY_WIP.md`), **a value between 12 and 25, an interaction with trackSpeed, pingAfter or searchPing**, or **the surface between the values** (three).
* **A reading of an opponent that did not repeat on both sets:** the bar is the smaller one (section 4).

## 7. Cost

59 matchups of 192 duels a set, about twenty-three minutes of one core a set; the generic command, its gate and a sabotage pass are the work (the next round reuses them).

## AMENDMENT A (2026-11-17; written after the generic command, the spec and the gates were written and the spec's `smoke` was run on geometries 1 to 4, BEFORE any geometry of the DEV set 134001 to 134096 or of HELD is flown)

**1. The smoke headline, said before any DEV geometry (the rule of section 3).** The spec's `smoke` was run on geometries 1 to 4 (8 duels a matchup; never recorded; free to read). **R0 holds on it** (league7100 over league7001 +1.902, z 5.1; over exploit7204 +1.548, z 192.1). **The headline was "SHORT: 4.00 NARROW, 6.00 NARROW, 12.00 NARROW":** the effect of no value HELPS or HURTS against any of the fourteen opponents (RS2: none; RS3: none). Eight duels on four geometries have a standard error of 0.4 to 1.1 on an effect where the duels differ at all: **the smoke is a test that the command runs and not a read.**

**2. Things the smoke shows that this note did not say (said before data; no rule is changed).** (a) **On the four smoke geometries the arms at 4.0 and 6.0 play the same duels as league7100 against most opponents**: the effect of 4.0 is within 0.002 of zero against thirteen of the fourteen opponents (exploit7204: -0.378, z -1.0) and that of 6.0 against all fourteen (an edge of the order of 1e-3 or less with a standard error of the same size, so a z that means nothing), while the arm at 12.0 moves a few duels (league7101 -0.868, exploit7203 -0.865, exploit7200 -0.376, league7103 +0.388, exploit7204 +0.388); OWN(4.0) and OWN(6.0) are 0-8-0 (all eight duels drawn, edge exactly 0) and OWN(12.0) +0.411 (z 1.0). **A pingEvery that changes no ping within a duel gives the same duel**; the DEV effect of a shorter interval may be a handful of moved duels among many identical ones, with the standard error to match. **No bar for identical duels is set and none is added.** (b) The arms' ids carry the hunter and two decimals (`ARM:league7100@4.00>league7000`); the checks use the numbers.

**3. A change to the command's checks (said before data).** As in the ABROAD note, the checks list the two identities **"every lower side is the boat's final ... and a BASE's first side is the hunter's final"** and **"every OWN and ARM is the hunter's final with pingEvery set to its value"** as two checks with two names, the values check and the matchup-order check as two checks, and **the per-geometry-values check as one check with one tolerance (1e-9)**. **The command is the generic `takeEvadePingReach.mjs` of this note and of `SUB_EVADE_PINGAWAY_WIP.md`, handed this round's spec in `takeEvadeShort.mjs`; its gate tests the generic code through two made-up specs, and this spec's gate the spec.**

**4. What is not changed:** the hunter, the opponents, the values, the matchups, the sets, the bars of 0.25 and 0.5, the labels, the rules R0 and RS1 to RS4, the forecasts, the geometries, the order of work.

## DEV RESULT (2026-11-17; `node tools/ship/takeEvadeShort.mjs dev --write`, geometries 134001 to 134096 (192 duels a matchup), exit 0; record `brain/subEvadeShortDev.json`: 59 matchups, no check failed)

DEV is free to read. **HELD (135001 to 135096) is NOT flown by this note's work so far**: Keith's message for this work ("lets work through all 3") did not say "fly HELD", and he asked to pause after this round, so I am waiting for his word. R0 held on DEV and no check failed, so the command's HELD gate would accept this record. **I flew DEV on my own reading of "work through" the round**, as free-to-read data that gates HELD; it spent the DEV set 134001 to 134096, recorded once. Forecasts are scored on DEV only for "R0 holds on DEV" (96): **TRUE**. The others stand as written for HELD.

**R0 holds.** league7100 over league7001 **+1.249** (z 11.3) and over exploit7204 **+1.501** (z 10.4), the BASE rows, both decided at the standard bar.

**The registered readings on DEV (read, not scored):**
* **RS1 THE REACH: HELPS against 0 of 14 opponents at 4.0, at 6.0 and at 12.0: "NARROW" three times; the effect HURTS against none.** The largest effects are small: at 4.0 **-0.155 (league7001, z -2.5) to +0.147 (exploit7202, z 2.2)**, at 6.0 **-0.159 (exploit7204, z -2.2) to +0.156 (exploit7201, z 2.3)**, at 12.0 -0.064 to +0.076 (largest |z| 1.6): **no edge is within 0.09 of the bar of 0.25.**
* **RS2 THE COST: none. RS3 THE COMMON OPPONENTS: none. RS4 THE HEADLINE: "SHORT: 4.00 NARROW, 6.00 NARROW, 12.00 NARROW".**
* **The OWN edges** (a value against league7100 itself): **4.0 -0.047 (z -1.8, 17-155-20), 6.0 -0.002 (z 0.0), 12.0 +0.012 (z 0.2): all NEUTRAL** (the lesion of the move note was -0.035 and +0.065 for the value 4); league7100 against itself draws 151 to 156 of 192 duels.
* **The steps** (4.0 to 6.0, 6.0 to 12.0) RISE and FALL against none.
* **The forecast quantities on DEV:** NARROW at 4.0 yes, at 6.0 yes, at 12.0 yes; hurts somewhere no; the effect of 4.0 HELPS against some opponent no; HURTS against some no; no common opponent yes; OWN(4.0) NEUTRAL yes.

**What the DEV rows show beyond the registered reading (POST-HOC, labelled, not a rule of this note):**
* **The sign of the effect follows the base edge, the other way round from the ABROAD note.** At 4.0 the effect is **positive against ten of the fourteen** (mean **+0.097** against the ten weaker boats, whose base edges are +2.54 to +2.76) and **negative against the four hardest** (league7001, league7103, exploit7200, exploit7204: mean **-0.104**; base edges +1.25, +1.66, +0.80 and +1.50); **at 6.0 +0.097 and -0.082**; **the correlation of the effect with the base edge over the fourteen is +0.88 at 4.0, +0.72 at 6.0 and +0.01 at 12.0.** For the longer values of `SUB_EVADE_ABROAD_WIP.md` the correlation was **-0.92 (DEV) and -0.83 (HELD) at 25.0**: **a value below league7100's own 8.30 helps a little against the weak boats and costs a little against the hardest; a value above helps a little against the hardest and costs against the weak.** The sizes here are an order smaller than the abroad effects (-1.1 at 40.0). **`SUB_EVADE_TYPE_WIP.md` reads this across cells; this DEV is one of its registered cells and is not counted from here.**
* **league7100's own pingEvery of 8.30 is within 0.16 of every value below it against every boat** (and within 0.08 of 12.0): **the shorter side of its dose is flat at the bar of 0.25, and the longer side (ABROAD) is a decided loss at 25.0 to 40.0.**
* **No mechanism is read** (a shorter interval could be louder against some boats and find a target sooner against others: no event is read).

**What this does to HELD: nothing is changed.** HELD scores the registered rules. **On DEV one of my forecasts other than the two on R0 would have been wrong as the larger side** ("HURTS SOMEWHERE" at 55: none); they are scored on HELD only.
