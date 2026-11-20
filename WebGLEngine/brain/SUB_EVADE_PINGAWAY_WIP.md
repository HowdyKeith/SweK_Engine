# Submarine duel: the comparators' longer-interval arms against the other boats (REGISTRATION 18 of the evade reads; 2026-11-17; UNNUMBERED; REGISTERED BEFORE ANY CODE FOR IT IS WRITTEN AND BEFORE ANY GEOMETRY OF ITS SETS IS FLOWN)

Keith, 2026-11-17: "lets work through all 3" (the three candidates the HELD RESULT of `brain/SUB_EVADE_ABROAD_WIP.md` left). **This is the second: do the ping-round gains of league7001 and exploit7204 survive against the other boats?** The first is `brain/SUB_EVADE_SHORT_WIP.md`, the third `brain/SUB_EVADE_TYPE_WIP.md`. **All three are registered before the code or any geometry of any of them exists.**

**What this changes in shared files, said first: nothing.** New files only: this note, `tools/ship/takeEvadePingaway.mjs` (this round's spec and forecasts; it uses the generic `tools/ship/takeEvadePingReach.mjs` of `SUB_EVADE_SHORT_WIP.md`), `tools/ship/takeEvadePingaway-selfcheck.mjs` (its gate), `brain/subEvadePingawayDev.json` and `brain/subEvadePingawayHeld.json`. It imports, and does not edit, the files the first note names.

## 1. What is known (read from the records; nothing here is flown again)

* **The arms against their own bases** (`SUB_EVADE_PING_WIP.md`, `SUB_EVADE_TOP_WIP.md`, 96 geometries a set, DEV and HELD): league7001 with pingEvery 16 and 30 against league7001: **+0.535, +0.349** (16) and **+0.712, +0.669** (30); exploit7204 with 16 and 30 against exploit7204: **+0.445, +0.363** (16) and **+0.681, +0.658** (30); **30 is the peak of both**; exploit7204 falls decided above 30 (35 and 40). The comparators' own pingEvery is 4.
* **The same kind of arm on league7100, against the other boats** (`SUB_EVADE_ABROAD_WIP.md`): league7100 with 40 does worse than league7100 against **all fourteen** other boats on both sets and with 25 against a few: **a gain against a copy of oneself was not a general gain.** **Whether the comparators' gains are copy-specific too is not flown.**
* **Nothing is known** of league7001 or exploit7204 with any pingEvery other than 4 against any boat but itself.

## 2. The question and the arms

**The question:** does league7001 with pingEvery 16.0 or 30.0 do better or worse than league7001 as it is, and exploit7204 with 16.0 or 30.0 than exploit7204 as it is, against each of the fourteen boats that are not itself?

**The hunters (MY CHOICE, fixed now):** **league7001** and **exploit7204**, each its own final theta of the files; **the opponents** of each: the fourteen of the fifteen boats that are not itself (the order of `BOATS`; each meets the other and league7100). **The values: V = 16.0 and 30.0** (fixed numbers: the lower paying value and the peak of the ping and top notes). **The matchups**, for each hunter h: **OWN(h, v)**, h with pingEvery v against h; for each opponent o: **BASE(h, o)**, h against o, and **ARM(h, v, o)**, h with pingEvery v against o, for each v: **2 + 14 x 3 = 44 a hunter, 88 matchups a set**, the arm (or the hunter) the first side. **THE EFFECT of v for h against o** is the paired difference by geometry of ARM(h, v, o) over BASE(h, o) (`vOf`, `effectOf`); **THE STEP** is the arm at 30.0 over the arm at 16.0 (reported).

## 3. The sets and the order

* **smoke**: geometries 1 to 4, never recorded, free to read. **DEV**: **136001 to 136096** (96 geometries), both seats; flown first, read freely, recorded once in `brain/subEvadePingawayDev.json`; it decides whether HELD is spent (R0). **HELD**: **137001 to 137096** (96 geometries), both seats; flown ONCE (`held --write`; refuses without a recorded DEV that replicates and lists no failed check, without `--write`, or if its record exists); the rules are about HELD.
* **96 geometries a set (MY CHOICE):** 88 matchups of 192 duels is the cost (about 35 minutes of one core a set).
* No file under `brain` or `tools` uses 134001 to 137096 as geometries (searched; see `SUB_EVADE_SHORT_WIP.md`).
* **Amendments:** as in the other notes: only dated, only before this note's HELD. **Every void-check is an identity or a file's own number, and the HELD gate refuses a DEV with a failed check.** **If a smoke report is read, its headline is said in Amendment A before any DEV geometry.**
* **The order of work:** after `SUB_EVADE_SHORT_WIP.md`'s command exists: this note's wrapper, its gate with a sabotage log, smoke, DEV; **HELD only on Keith's word.**

## 4. The rules (MY CHOICES, said; Keith may set them differently)

* **THE BAR, the labels and the cost of the smaller bar: as in `SUB_EVADE_SHORT_WIP.md`** (an OWN PAYS at 0.25 and z of 2; an EFFECT HELPS or HURTS at the same bar; GENERAL 12 or more of 14, COMMON 7 to 11, NARROW 6 or fewer; **56 effects give about 1.3 false HELPS and 1.3 false HURTS under no effect at all**).
* **R0 REPLICATES** iff **OWN(h, 30.0) PAYS for both hunters** (the premise: the arms that paid against their bases twice pay on a third set).
* **RP1 THE REACH of (h, v)**: for each hunter and each value, the number of opponents the effect HELPS: GENERAL / COMMON / NARROW, and the opponents it HURTS. **RP2 THE COST:** **"HURTS SOMEWHERE"** iff some effect HURTS. **RP3 THE COMMON OPPONENTS:** for each hunter the opponents HELPED by both values; and **across the hunters** the opponents HELPED at 30.0 by every hunter that meets them.
* **RP4 THE HEADLINE:** "PINGAWAY: league7001 16.00 <label>, 30.00 <label>; exploit7204 16.00 <label>, 30.00 <label>" and ", HURTS SOMEWHERE" iff RP2.
* **Reported:** every row; per opponent its evade numbers, the BASE edge, the effects and the step; the OWN edges; **the effects against league7100 and against the other comparator**; **every (hunter, value, opponent) effect, as the cells of `SUB_EVADE_TYPE_WIP.md` read them**; the forecast quantities as yes/no.
* **Checks, as in `SUB_EVADE_SHORT_WIP.md` with V = 16.0 and 30.0 and the two hunters** (every BASE and ARM against the opponent's final, every ARM its hunter with pingEvery set to its value, V exactly 16 and 30, the per-geometry values, the order: for each hunter in order its two OWN, then for each opponent in the order of BOATS its BASE and its two ARMs).

## 5. Forecasts, written before any geometry of any of the two sets is flown (probabilities, mine)

| forecast | probability |
|---|---|
| R0 holds on DEV | **94** |
| R0 holds on HELD | **93** |
| league7001 at 30.0 is "NARROW" | **62** |
| league7001 at 30.0 is "GENERAL" | **8** |
| exploit7204 at 30.0 is "NARROW" | **68** |
| league7001 at 16.0 is "NARROW" | **72** |
| exploit7204 at 16.0 is "NARROW" | **75** |
| RP2 is "HURTS SOMEWHERE" | **88** |
| the effect of 30.0 HELPS against league7100 for at least one hunter | **25** |
| no opponent is HELPED at 30.0 by both hunters | **55** |

Why these: **the donor's longer interval lost against every other boat; the comparators are fast trackers with an own pingEvery of 4, so their arms start from the loudest end and the first step from 4 to 16 may be a gain that carries** (the comparators gain +0.4 to +0.7 against their own copies): I keep "NARROW" as the likeliest label for each (62 to 75) and a real reach as a minority case (league7001 GENERAL 8). **"HURTS SOMEWHERE" is likely (88): 56 effects give over one by chance alone, and the donor's cost was everywhere.** Against league7100, the boat whose own pingEvery is 8.30, the arms may help (25). A shared opponent helped by both hunters at 30.0 (empty: 55) would be the first sign of a property of the opponent.

## 6. What a result would not say

* **A mechanism, a league standing, another hunter, a value other than 16.0 and 30.0, an interaction, or a reading of an opponent that did not repeat on both sets** (as in `SUB_EVADE_SHORT_WIP.md`).
* **That the comparators' gains against their own bases were wrong:** they are measured; this round asks whether they carry.

## 7. Cost

88 matchups of 192 duels a set, about thirty-five minutes of one core a set.
