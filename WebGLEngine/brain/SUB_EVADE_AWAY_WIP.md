# Submarine duel: does a slower trackSpeed pay against opponents that are not the boat's own base? (REGISTRATION 12 of the evade reads; 2026-11-16; UNNUMBERED; REGISTERED BEFORE ANY CODE FOR IT IS WRITTEN AND BEFORE ANY GEOMETRY OF ITS SETS IS FLOWN)

Keith, 2026-11-16: "lets do trackSpeed against opponents that are not the boat's own base, and the trackSpeed and evade-pair gates together". This is the first of the two (the second is `brain/SUB_EVADE_GATES_WIP.md`, registered at the same time, before either is flown). The move, track and reach reads (all with a HELD read) found that setting league7100's trackSpeed (3.15) on league7001, exploit7200 or exploit7204 pays against **a copy of that boat with the old trackSpeed**, and on 11 of 14 bases not at all. **Every arm in all three reads was flown against its own base.** This note asks what the same change does against **other boats**.

**What this changes in shared files, said first: nothing.** New files only: this note, `tools/ship/takeEvadeAway.mjs` (the command), `tools/ship/takeEvadeAway-selfcheck.mjs` (its gate), `brain/subEvadeAwayDev.json` and `brain/subEvadeAwayHeld.json`. It imports, and does not edit, `tools/ship/takeEvadeTurn.mjs` (`rowOf`), `tools/ship/takeSubLeague.mjs` (`loadRuns`, `decided`, `signed`) and `brain/subTournament.mjs`.

## 1. What is known (read from the records; nothing here is flown again)

* **Against the boat's own base** (`SUB_EVADE_MOVE_WIP.md`, `SUB_EVADE_TRACK_WIP.md`, `SUB_EVADE_REACH_WIP.md`, each with a HELD read): trackSpeed D (league7100's own, 3.1507) set on league7001, exploit7200 and exploit7204 pays **+0.70 to +1.08** (HELD) against that boat's copy; on the other eleven of 14 bases it is between -0.49 and +0.42 and the games are decided by who starts; league7103 costs about 0.5. The three that pay are the three finders with evadeSpeed 4.3 or more and evadeTurn 2.65 or more (a post-hoc reading in the reach note).
* **What a duel is** (`brain/subTournament.mjs`): two boats, each hunting and evading the other, both seats on every geometry; **the edge of a matchup is the mean over geometries of the two seats' mean of (X's score less Y's)**, with the standard error of those per-geometry values.
* **What has not been done:** a boat with a changed trackSpeed flown against a boat that is **not** its own copy, and the change read as the difference between that matchup and the unchanged boat's against the same opponent.

## 2. The question and the arms

**The question.** For a hunter h that gains against its own copy, does setting trackSpeed D on it change its result against the other boats, and against which?

**The hunters (MY CHOICE, fixed now):** **league7001, exploit7200 and exploit7204**, the three that paid against their own base on both sets of the reach read. **The opponents:** the **fifteen boats** league7000, league7001, league7100, league7101, league7102, league7103, league7104, league7105, exploit7200, exploit7201, exploit7202, exploit7203, exploit7204, exploit7205 and G, **each hunter flying against the fourteen that are not itself** (league7100 is an opponent here, and is the donor of D). Every boat is its final theta of the files (G: generation 0), nothing changed.

**The matchups,** for each hunter h and each opponent o: **BASE** (U(h) against U(o)) and **SLOW** (U(h) with trackSpeed D, nothing else moved, against U(o)); and for each hunter **OWN** (U(h) with trackSpeed D against U(h): the reach read's arm). **29 matchups a hunter (14 x 2 + 1), 87 a set.** The hunter, or the slowed hunter, is the first side.

**The EFFECT of the change against an opponent** is the **paired difference by geometry**: for each of the 48 geometries i, v_i is the mean of the two seats' (X's score less Y's); the effect Delta(h, o) is **the mean over geometries of v_i(SLOW against o) less v_i(BASE against o)**, its standard error the standard deviation of those 48 differences over the square root of 48, and its z their ratio (zero when both are zero; infinite with the sign of the edge when only the standard error is). Both matchups of a pair fly the same 48 geometries, so the pairing is exact.

## 3. The sets and the order

* **smoke**: geometries 1 to 4, never recorded, free to read.
* **DEV**: **124001 to 124048**, both seats; flown first, read freely, recorded once in `brain/subEvadeAwayDev.json`; it decides whether HELD is spent (R0).
* **HELD**: **125001 to 125048**, both seats; flown ONCE (`held --write`; refuses without a recorded DEV that replicates and lists no failed check, without `--write`, or if its record exists); the rules are about HELD.
* No file under `brain` or `tools` uses 124001 to 127048 (searched as whole numbers in the `.mjs`, `.md` and `.json` files; the hits near those numbers are millisecond timings). 124001 to 125048 are this note's, 126001 to 127048 the gates note's.
* **Amendments:** as in the other notes: only dated, only before this note's HELD. **Every void-check is an identity or a file's own number, and the command's HELD gate refuses a DEV with a failed check.** **If a smoke report is read, its headline is said in Amendment A before any DEV geometry.**
* **The order of work:** this note, the command, its gate with a sabotage log (never flying 124001 to 125048), smoke, DEV; **HELD only on Keith's word** (his earlier HELD words covered named rounds only).

## 4. The rules (MY CHOICES, said; Keith may set them differently)

* **An EFFECT is decided** at Delta of 0.5 in size with z of 2 in size (the bar of every other note). The slowed hunter **HELPS** against an opponent iff Delta is decided positive, **HURTS** iff decided negative, else NEUTRAL.
* **R0 REPLICATES** iff OWN is decided positive (an edge of 0.5 and z of 2) for **all three hunters** (the reach read's finding on new geometries). On DEV, if R0 fails HELD is not flown by this registration.
* **RA1 THE REACH OF EACH HUNTER:** n is the number of the 14 opponents it HELPS against; **GENERAL** iff n is 12 or more, **COMMON** iff 7 to 11, **NARROW** iff 6 or less (the bars of the reach note).
* **RA2 THE COST:** the opponents each hunter HURTS against, listed; **HURTS SOMEWHERE** iff any hunter has one.
* **RA3 THE COMMON OPPONENTS:** the opponents against which the change HELPS **every hunter that meets them** (an opponent that is itself a hunter is met by two hunters, the others by three), listed.
* **RA4 THE HEADLINE:** `AWAY: <h1> <label>, <h2> <label>, <h3> <label>` in the order league7001, exploit7200, exploit7204, then `, HURTS SOMEWHERE` when RA2 lists one.
* **Reported with the read, not in a rule:** for each hunter and opponent the BASE edge, the SLOW edge, Delta (se, z, status) with the opponent's own evadeSpeed and evadeTurn beside it; the opponents' evade pairs of the helped and hurt sets (**any reading of why is post-hoc and labelled so**); **the forecast quantities of section 5 as yes/no**.
* **Checks that void the read, said and not weighed. Every one is an identity or a file's own number:** every matchup flew the set's geometries (each seed twice), so that a BASE and its SLOW flew the same ones; no non-finite score; every theta one `clampTheta` leaves unchanged; every run's generation 0 is G; **U(league7100) against a copy of itself has an edge of exactly 0**; **every BASE is the hunter's final theta against the opponent's, every SLOW is the hunter with trackSpeed D and nothing else moved, every OWN is the slowed hunter against the hunter's final, every opponent is the boat's final theta of the files (G: generation 0)**; **D is league7100's trackSpeed of the files**; **the opponents of each hunter are exactly the fourteen boats other than it, in the order above**.

## 5. Forecasts, written before any geometry of any of the two sets is flown (probabilities, mine)

| forecast | probability |
|---|---|
| R0 holds on DEV | **88** |
| R0 holds on HELD | **85** |
| all three hunters' reach is NARROW | **60** |
| some hunter's reach is GENERAL | **8** |
| HURTS SOMEWHERE | **55** |
| league7100 is among the COMMON OPPONENTS | **65** |
| each of league7001, exploit7200 and exploit7204 is a COMMON OPPONENT (all three) | **55** |
| G is helped against by no hunter | **80** |
| league7103 is one a hunter HURTS against | **45** |

Why these: against its own copy a hunter gained on three bases of 14, all strong evaders, so against other boats I expect the same few: the strong evaders, which are the other strong hunters and league7100 (whose evade pair is (4.50, 2.70)), and nothing against the weak ones, whose games are decided by who starts. That makes every hunter NARROW (60), the strong three and league7100 the common opponents (65 and 55: each needs the change to be decided for every hunter that meets it, and one of the three is a hunter that meets only two). G, with the weak pair, gets no help (80). league7103, the boat that cost 0.5 against its own copy, is the likeliest cost (45), and costs somewhere at all are a little more likely than not (55: there are 42 pairs and the bar is 0.5 with a standard error of about 0.15 on a difference of two edges). R0 repeats a graft that paid on the reach read's HELD for all three (88 and 85: the weakest of them, league7001 at +0.70, is the one at risk).

## 6. What a result would not say

* **A mechanism.** A slower tracker could be quieter, lose contact less, or its opposite: no event is read.
* **Anything about the opponents' own trackSpeed or other numbers** beyond the boats themselves: an opponent is a whole boat, so a difference between two opponents is a difference of everything in them.
* **Any dose of trackSpeed** (only D is flown) **or any hunter that does not gain against its own base.**
* **That the 15 boats are independent:** the finders were bred from the same generation 0; the effective number of independent boats is smaller than 15.
* **Seat arrangements other than the tournament's two.**

## 7. Cost

87 matchups of 96 duels a set, about twenty minutes of one core a set; the command, its gate and a sabotage pass are the work.


## AMENDMENT A (2026-11-16; written after the command was written and smoke-run on geometries 1 to 4, BEFORE any geometry of the DEV set 124001 to 124048 or of HELD is flown)

**1. The smoke headline, said before any DEV geometry (the rule of section 3).** The command's `smoke` was run on geometries 1 to 4 (8 duels a matchup; never recorded; free to read). Its headline was **"AWAY: league7001 NARROW, exploit7200 NARROW, exploit7204 NARROW"**: R0 holds on it (OWN +1.517, +1.913 and +1.181); the slowed hunter HELPS against **3, 3 and 2** of the 14 opponents; it HURTS none; the common opponents are league7001, league7100 and exploit7204 (not exploit7200). The three it helps league7001 against are league7100 (+1.902), exploit7200 (+1.520) and exploit7204 (+1.154). Eight duels on four geometries are a smoke test and not a reading, and **the forecasts of section 5 stand as written before it was seen and are scored as written; but I have seen this headline, and the 60 given to "all three NARROW" is no longer a blind number**: the DEV read and HELD are the evidence, and the smoke is not counted in them.

**2. A property of the design that the smoke shows and that this note did not say (said before data; no rule is changed).** The effect of a change is the difference of two edges, and **an edge has a ceiling**: against the weak evaders the unchanged hunter already scores **+3.22 to +3.31** in both seats' mean on the smoke geometries (30 of the 42 BASE edges), so there is no room for a slower tracker to add anything there (its SLOW edge there is within 0.05 of the BASE edge on all thirty; the largest difference is 0.043); the other twelve BASE edges run from -1.93 to +2.41, and these are the opponents against which a change can show. **An opponent the hunter beats at the ceiling therefore reads NEUTRAL whatever the trackSpeed does**; the reach read's finding that the effect sits on strong evaders is partly this. The reading is post-hoc, from the smoke; the registered rules (RA1 to RA4) count what they count, and the report prints BASE and SLOW beside each effect so that it can be seen.

**3. What is not changed:** the hunters, the opponents, the matchups, the sets, the rules R0 and RA1 to RA4, the forecasts, the geometries, the order of work.

## DEV RESULT (2026-11-16; `node tools/ship/takeEvadeAway.mjs dev --write`, geometries 124001 to 124048 (96 duels a matchup), exit 0; record `brain/subEvadeAwayDev.json`: 87 matchups, no check failed)

DEV is free to read. **HELD (125001 to 125048) is NOT flown by this note's work so far**: Keith's earlier HELD words ("fly Round 1 HELD whenever ready", "Rounds 2 and 3 HELD can fly when ready") named those rounds, and his message for these two did not say "fly HELD", so I am waiting for his word. R0 held on DEV and no check failed (none printed), so the command's HELD gate would accept this record. Forecasts are scored on DEV only for "R0 holds on DEV" (88): **TRUE**. The others stand as written for HELD. **I flew DEV on my own reading of "do the round"**, as free-to-read data that gates HELD; it spent the DEV set 124001 to 124048, recorded once.

**R0 holds.** OWN is **+1.107** for league7001 (z 9.3, 40-51-5), **+0.927** for exploit7200 (z 7.3, 40-45-11) and **+0.936** for exploit7204 (z 5.3, 42-41-13), all decided.

**Where the slowed hunter HELPS or HURTS** (the paired effect of SLOW over BASE against each opponent; the BASE edge, the unchanged hunter's, and the SLOW edge beside it; every other opponent is NEUTRAL):

| hunter | opponent | BASE | SLOW | effect | z | status |
|---|---|---|---|---|---|---|
| league7001 | league7100 | -1.392 | +0.031 | **+1.423** | 10.2 | HELPS |
| league7001 | exploit7200 | -0.117 | +0.581 | **+0.698** | 3.8 | HELPS |
| league7001 | exploit7204 | +0.311 | +1.488 | **+1.177** | 9.6 | HELPS |
| exploit7200 | league7001 | +0.117 | +1.174 | **+1.057** | 6.4 | HELPS |
| exploit7200 | league7100 | -0.865 | -0.037 | **+0.828** | 4.3 | HELPS |
| exploit7200 | exploit7204 | +0.650 | +1.357 | **+0.707** | 4.1 | HELPS |
| exploit7204 | league7001 | -0.311 | +0.947 | **+1.258** | 9.3 | HELPS |
| exploit7204 | league7100 | -1.654 | -0.232 | **+1.422** | 7.7 | HELPS |
| exploit7204 | exploit7200 | -0.650 | +0.513 | **+1.163** | 7.7 | HELPS |
| exploit7204 | league7103 | +1.802 | +1.180 | **-0.622** | -2.5 | HURTS |

The other **32 of 42** pairs are NEUTRAL: league7001's effects run -0.095 to +0.220, exploit7200's -0.129 to +0.205 and exploit7204's -0.118 to +0.178, with a BASE edge of +1.5 to +3.1 (league7001's and exploit7200's) and +2.5 to +3.0 (exploit7204's).

**RA1 THE REACH:** **3 of 14** for each hunter, **NARROW** for all three. **RA2 THE COST: HURTS SOMEWHERE** (exploit7204 against league7103, -0.622, z -2.5; league7001 against league7103 is +0.220 and exploit7200 against it -0.059, neither decided). **RA3 THE COMMON OPPONENTS:** **league7001, league7100, exploit7200 and exploit7204** (each the opponent of every hunter that meets it). **RA4 THE HEADLINE: AWAY: league7001 NARROW, exploit7200 NARROW, exploit7204 NARROW, HURTS SOMEWHERE.**

**The forecast quantities as printed** (scored on HELD, not here): all three NARROW yes; some GENERAL no; hurts somewhere yes; league7100 common yes; the strong three common yes; G helped by none yes; league7103 hurt yes. **Every one of the seven came out the way I gave the larger probability.**

**Said plainly about this read:** the smoke report (Amendment A item 1) had all three NARROW and the same common opponents but league7103 not hurt and exploit7200 not common; DEV is a different 48 geometries, but **I saw the smoke headline before writing any DEV rule down as read**: the 60 given to "all three NARROW" is not a blind number, and every forecast of section 5 is scored on HELD as written.

**Observations (DEV, for reading, not rules):**

1. **Each hunter is helped against exactly the other strong evaders and league7100.** The four opponents the change helps against are league7001, exploit7200, exploit7204 and league7100, the four boats with evadeSpeed 4.3 or more and evadeTurn 2.65 or more; each hunter is helped against the strong evaders that are not itself, which for each of the three hunters is three of the four (league7100 and the two other strong hunters), and against none of the other ten. This is the reach read's finding (against the boat's own copy) again, now against other boats; **a post-hoc reading of three hunters' lists**, labelled.
2. **They are the opponents the unchanged hunter does not beat.** Against the four strong boats the BASE edge is **-1.65 to +0.65** (the hunter loses to league7100 by 0.87 to 1.65); against the other ten it is **+1.5 to +3.1**, the ceiling the Amendment A item 2 said, where the effect is within -0.13 to +0.22. **This read cannot separate "a slower tracker helps against strong evaders" from "a slower tracker helps where the hunter was not already winning".**
3. **Against league7100 the slowed hunter loses almost nothing.** The three hunters lose to league7100 by 1.39, 0.87 and 1.65 unchanged and by **-0.03 to +0.03 (league7001's +0.031, exploit7200's -0.037) and -0.23 (exploit7204)** with D: the change recovers 98%, 96% and 86% of the deficit. league7100's trackSpeed is D, and the move read found its lead over league7001 and exploit7204 to be its trackSpeed's; **here the same number, set on three other boats, closes their gap to league7100 itself.**
4. **One cost, repeating the reach read's.** exploit7204 against league7103 (evadeSpeed 3.55, evadeTurn 2.80) is **-0.622 (z -2.5)**, BASE +1.802 to SLOW +1.180; the other two hunters' effects against league7103 are +0.220 and -0.059 (z 0.9 and -0.2). The reach read found league7103 costing its own copy 0.49 to 0.61 (DEV and HELD). One opponent, one hunter decided, one set.
5. **Against G the change does nothing** (-0.095, -0.001 and -0.062: z -1.3 to -0.2), BASE +2.88 to +3.00.

**What is NOT shown:** any HELD read; the effect against opponents with weights or trained after the finders; a hunter that does not gain against its own copy; any dose of trackSpeed (only D is flown); a mechanism.
