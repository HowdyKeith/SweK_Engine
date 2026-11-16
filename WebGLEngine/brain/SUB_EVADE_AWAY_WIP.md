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
