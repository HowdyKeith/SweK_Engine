# Submarine duel: do the finders' (speed, turn) pairs carry their order against each other? (REGISTRATION 7 of the evade reads; 2026-11-15; UNNUMBERED; REGISTERED BEFORE ANY CODE FOR IT IS WRITTEN AND BEFORE ANY GEOMETRY OF ITS SETS IS FLOWN)

Keith, 2026-11-15: "lets keep going and do the next suggested round". The read that `brain/SUB_EVADE_SPEEDFINE_WIP.md` (its HELD RESULT, item 4) named and did not do: **grafting each finder's (evadeSpeed, evadeTurn) pair onto G and flying the grafts against each other**, and, for the one pair that item 4 asks about (league7100 against league7001), a 2 x 2 of its two speeds and two turns. A registration and nothing else: **no command, no gate and no geometry of its sets exists yet.**

**What this changes in shared files, said first: nothing.** New files only: this note, `tools/ship/takeEvadePairs.mjs` (the command), `tools/ship/takeEvadePairs-selfcheck.mjs` (its gate), `brain/subEvadePairsDev.json` and `brain/subEvadePairsHeld.json`. It imports, and does not edit, `tools/ship/takeEvadeTurn.mjs` (`graft`, `rowOf`, `FINDERS`), `tools/ship/takeEvadeSplit.mjs` (the SN arms the identity checks compare to), `tools/ship/takeEvadeDose.mjs` (`stepLabel`), `tools/ship/takeSubLeague.mjs` (`loadRuns`, `decided`, `finds`, `signed`) and `brain/subTournament.mjs`. The bar and the method are those of `brain/SUB_EVADE_WIP.md` and `SUB_EVADE_OPPONENT_WIP.md`: an arm FINDS at an edge of 0.5 with z of 2 against generation 0 (G); a head-to-head is **decided** at an edge of 0.5 in size with z of 2 in size (`decided`); a step is UP at z of 2 and an edge of 0.05 (`stepLabel`).

## 1. What is known (read from the records; nothing here is flown again)

* **The mirror of the finders is not flat and it is not the evade numbers' order.** `SUB_EVADE_OPPONENT_WIP.md` (DEV 104001, HELD 105001): the strong four (league7001, league7100, exploit7200, exploit7204) are **not alike**: three of their six pairs are decided on each set (DEV: league7100 over league7001 by 1.07, over exploit7204 by 1.02, exploit7200 over exploit7204 by 0.65; HELD: league7100 over league7001 by 1.33, over exploit7200 by 1.11, over exploit7204 by 1.63); league7100 beats league7001 on both sets (19 of 48 duels drawn each time); league7103 is decided against by the strong four (all four on DEV, three on HELD). Yet **their edges over G differ by a few tenths** (+2.07 to +2.35 on DEV, +2.83 to +2.96 on HELD).
* **The finders' (speed, turn) pairs** (read from the files): league7001 (4.317, 2.800), league7100 (**4.500, 2.698**), league7103 (3.546, 2.800), exploit7200 (4.420, 2.800), exploit7204 (4.351, 2.651). G is (3.418, 1.709).
* **Against G the pair is nearly all of the doctrine for the strong four, and the time is inert** (`SUB_EVADE_SPLIT_WIP.md`: SN is +2.63 to +2.76 on HELD against the finder's +2.35 to +2.61 and its STN +2.64 to +2.65; league7103's SN +1.03 against its U +0.97). **Nothing has been flown with two grafts against each other.**
* **The speed note and its fine twin put the clamp below turn 2.8.** At turns 2.3, 2.5 and 2.65 a faster evade than 4.1 still pays up to the bound (4.5 over 4.1 is UP at all three on both sets of `SUB_EVADE_SPEEDFINE_WIP.md`), at 2.8 it does not; 4.5 over 4.317 at turn 2.65 is FLAT on both (+0.000, +0.098) and at 2.8 FLAT on three of four reads (-0.065, -0.030, +0.166) and DOWN once (-0.379, z -2.8, the speed note's DEV, which its HELD did not repeat). league7100's speed is exactly 4.5 and its turn 2.698.
* **The hypothesis, said as one and not as a result** (`SUB_EVADE_SPEEDFINE_WIP.md` HELD RESULT item 4): league7100 beats league7001 because its pair (4.5, 2.698) sits where the bound binds and league7001's (4.317, 2.8) where it does not. The records above say the **head-to-head of 4.5 against 4.317 at a single turn is FLAT** at both 2.65 and 2.8, so a speed step alone does not carry a one-point order; whether the two pairs (a speed and a turn together) do, or whether the order sits in the finders' other ten numbers, is what this read asks.

## 2. The question and the arms

**The question, two parts.** **Part A (PAIRS): grafted onto G, do the five finders' (speed, turn) pairs reproduce the order the finders themselves have against each other?** **Part B (the 2 x 2): for league7100 against league7001, is the order carried by the speed (4.5 against 4.317), by the turn (2.698 against 2.8), by both, or by neither?**

**Every arm is a side of G's other ten numbers and a (speed, turn) pair; every matchup is both seats on the same geometries, by `subTournament.matchup`, every side a tactician and the PD autopilot.**

| group | what it is | matchups |
|---|---|---|
| P arms | P(f) = G with finder f's evadeSpeed and evadeTurn (SN of the split note), f in league7001, league7100, league7103, exploit7200, exploit7204 | 5 against G |
| the 2 x 2 | the four pairs (4.317, 2.8) = P(league7001), (4.5, 2.8), (4.317, 2.698), (4.5, 2.698) = P(league7100); the two that are not P arms flown against G | 2 against G |
| P pairs | P(f) against P(g) for each of the ten pairs of finders (in the order of the finder list, the first side's edge) | 10 |
| U pairs | the finder f against the finder g unmodified, the same ten pairs (the mirror of the opponent note, re-flown here on the same geometries) | 10 |
| 2 x 2 steps | the speed step at each turn (4.5 over 4.317 at 2.8 and at 2.698) and the turn step at each speed (2.698 over 2.8 at 4.317 and at 4.5) | 4 |

**7 arms against G and 24 head-to-head matchups: 31.** Nothing is searched, tuned or re-fit; every number is a number of G or of a finder in a file. **48 geometries a set (96 duels a matchup), as in `SUB_EVADE_SPEEDFINE_WIP.md`: MY CHOICE, said:** the order of two sides that differ by a point or so needs the smaller standard error; Keith may set it back to 24.

## 3. The sets and the order

* **smoke**: geometries 1 to 4, never recorded, free to read.
* **DEV**: **112001 to 112048**, both seats; flown first, read freely, recorded once in `brain/subEvadePairsDev.json`; it decides whether HELD is spent (R0).
* **HELD**: **113001 to 113048**, both seats; flown ONCE (`held --write`; refuses without a recorded DEV that replicates and lists no failed check, without `--write`, or if its record exists); the rules are about HELD.
* No submarine file uses 112001 to 113048 as a geometry (searched as whole numbers in the `.mjs` and `.md` files under `brain` and `tools`: the hits are in files that are not about the submarine). The sets 98001 to 111048 are spent.
* **Amendments:** as in the other notes: only dated, only before this note's HELD, said why. **Every void-check below is an identity or a file's own number, and the command's HELD gate refuses a DEV with a failed check** (the seat and speed notes' lessons), both said now.
* **The order of work:** this note, the command, its gate with a sabotage log (never flying 112001 to 113048), smoke, DEV, then HELD if R0 holds and Keith asks.

## 4. The rules (MY CHOICES, said; Keith may set them differently)

* **R0 REPLICATES** iff, on the set read, the P arms of league7001 and league7100 both FIND against G. On DEV, if R0 fails HELD is not flown by this registration. (Both found on every earlier set: SN of league7001 +2.63 to +3.10 on four, league7100's +2.76 on the split's HELD.)
* **Part A.** For each of the ten pairs, call the finders' own edge U and the grafts' P (each the first side's edge). **A pair is CARRIED** if U is decided and P is decided in the same direction; **LOST** if U is decided and P is not; **CONTRADICTED** if both are decided and in opposite directions; **SPURIOUS** if U is not decided and P is. Let d be the number of pairs whose U is decided.
  * **RP1 THE PAIRS CARRY THE ORDER:** the label of (the number CARRIED, d) by the rule of `SUB_EVADE_WIP.md` (`labelOf`: **n/a** if d is under 3; **YES** if all but one of the d are carried (at least d - 1); **NO** if at most 1; **PARTIAL** otherwise).
  * **RP2 NO CONTRADICTION:** no pair is CONTRADICTED.
  * **RP3 THE PAIR EXPLAINS league7103'S LOSSES:** P(league7103) is decided against by the P of at least 3 of the 4 strong finders (the `M2` of the opponent note, on the grafts).
  * **RP4 THE STRONG FOUR'S GRAFTS ARE ALIKE:** no pair among P(league7001), P(league7100), P(exploit7200), P(exploit7204) is decided (the `M1` of the opponent note, on the grafts).
* **Part B.** The **speed step** is 4.5 over 4.317 at a turn; the **turn step** is 2.698 over 2.8 at a speed; each is labelled UP / DOWN / FLAT by `stepLabel`. **RB1 THE HEADLINE**, read in this order, the first that holds: **"THE SPEED"** iff the speed step at 2.698 is UP and the turn step at 4.5 is not UP; **"THE TURN"** iff the turn step at 4.5 is UP and the speed step at 2.698 is not UP; **"BOTH"** iff both are UP; **"NEITHER"** otherwise. **RB2 league7100's PAIR OVER league7001's** is the label of the P pair (league7100 over league7001) by `decided`: UP-side decided, DOWN-side decided, or undecided.
* **The readings** (written now): RP1 YES reads as: the finders' order against each other is carried by their (speed, turn) pairs, and the order of two finders can be read off two numbers; NO that it sits in the other ten numbers (search, ping, fire, aim, echo, time); PARTIAL that the pair carries some of it (for example league7103's losses) and not the rest. RB1 "THE SPEED" or "THE TURN" says which of the two numbers of league7100's pair is worth its edge over league7001's; "NEITHER" that the pair does not carry it.
* **Reported with the read, not in a rule:** each arm's edge against G (se, z, wins-draws-losses, per-seat edges); each pair's and step's edge, se, z, wins-draws-losses, label and seat edges; the ten pairs side by side (U, P, the category); the counts of CARRIED, LOST, CONTRADICTED and SPURIOUS; and **the forecast quantities of section 5 as yes/no**, so they are scored from the printed line.
* **Checks that void the read, said and not weighed. Every one is an identity or a file's own number:** every arm and matchup flew the set's geometries (each seed twice); no non-finite score; every theta one `clampTheta` leaves unchanged; every run's generation 0 is G; **G with its own speed and turn against G has an edge of exactly 0**; **two equal thetas have an edge of exactly 0**; **each P arm is the split command's SN arm of its finder** (`takeEvadeSplit.mjs`), the same theta to the number; **the 2 x 2's corner (4.317, 2.8) is P(league7001) and its corner (4.5, 2.698) is P(league7100)**; **each U side is the finder's final theta of the files**; every number of every P and 2 x 2 arm but the speed and the turn is G's; the speeds and turns of the 2 x 2 are the files' (league7001's and league7100's).

## 5. Forecasts, written before any geometry of any of the two sets is flown (probabilities, mine)

| forecast | probability |
|---|---|
| R0 holds on DEV | **90** |
| R0 holds on HELD | **88** |
| RP1: the pairs carry the order is YES | **15** |
| RP1: it is PARTIAL | **60** |
| RP1: it is NO (at most 1 pair carried) | **25** |
| RP2: no pair is CONTRADICTED | **80** |
| RP3: the pair explains league7103's losses | **85** |
| RP4: the strong four's grafts are alike (no decided pair) | **65** |
| RB2: league7100's pair over league7001's is decided | **25** |
| RB1: the headline is "NEITHER" | **50** |
| RB1: the headline is "THE SPEED" | **20** |
| RB1: the headline is "THE TURN" | **15** |

Why these: the strong four's edges against G differ by a few tenths and their pairs differ by 0.2 m/s and 0.15 rad, so I expect their grafts to be near-equal head-to-head (65) and their order, which the finders have at 1 to 1.6, to sit in the other ten numbers (RP1 YES at 15; PARTIAL at 60 because league7103's pair (3.546, 2.8) is far from the others' speed and the opponent note found it decided against by all or most of them, which a pair that low in speed should reproduce); the speed step alone was FLAT at 4.5 over 4.317 in every read at turns 2.65 and 2.8, so "THE SPEED" is 20, but 2.698 lies between the two turns that were read and the speed step there is untried; the dose note found the step from 2.65 to 2.8 FLAT on every curve, so "THE TURN" is 15 and "NEITHER" the half.

## 6. What a result would not say

* **A mechanism.** Whether a pair wins by being faster, further off the bearing, or louder is not asked, and the events are not read.
* **That the pair is the whole of a finder:** each graft is G's other ten numbers with the finder's two; a pair that is CARRIED says the two numbers carry the order against the other finders at the other ten numbers of G, not that the finder's other numbers do nothing.
* **That a LOST pair is lost to a number:** it says the two numbers do not carry the order; which of the other ten (or their interactions) does is not asked, and the time was inert against G only.
* **A speed above 4.5, any turn or speed but the files' and the 2 x 2's, or any opponent but the finders and G.**
* **The independence of the ten pairs:** they share five sides and one set of geometries; the effective number of independent finders is nearer three than five, as in the other notes (three share a turn of 2.8, four are near-copies).

## 7. Cost

31 matchups of 96 duels a set, three to four minutes of one core; the command, its gate and a sabotage pass are the work.

## AMENDMENT A (2026-11-15; made while the command `tools/ship/takeEvadePairs.mjs` was written and smoke-run on geometries 1 to 4, BEFORE any DEV geometry (112001 to 112048) or HELD geometry (113001 to 113048) was flown)

No rule's bar, no arm, no forecast is changed; item 1 corrects what section 1 of this note says the command imports, the rest fill in what the registration left unsaid.

1. **What it imports, exactly:** `graft`, `rowOf`, `labelOf` and `FINDERS` (`takeEvadeTurn.mjs`); the split command's `armsOf` (for the SN arms the checks compare to); `stepLabel` and the bars (`takeEvadeDose.mjs`); `loadRuns`, `decided`, `signed`, `FIND_EDGE` and `FIND_Z` (`takeSubLeague.mjs`). It does not import `finds` (the arms' FINDS flag comes with `rowOf`).
2. **Names and ids.** The arms are `P:finder` and the two 2 x 2 arms `F:speed/turn` to two decimals (`F:4.50/2.80`, league7100's speed with league7001's turn, and `F:4.32/2.70`, the other way); the pairs `PP:a|b` and `UU:a|b`; the steps `S@2.80` and `S@2.70` (the speed 4.5 over 4.317 at league7001's turn and at league7100's) and `N@4.32` and `N@4.50` (the turn 2.698 over 2.8 at league7001's speed and at league7100's). The code compares thetas as numbers, never the printed text.
3. **The categories as coded:** CARRIED (U decided, P decided with the same sign), CONTRADICTED (both decided, opposite signs), LOST (U decided, P not), SPURIOUS (P decided, U not), and a pair that is neither decided is BOTH UNDECIDED (not counted). d is the number of pairs whose U is decided; RP1 is `labelOf(carried, d)` with YES / NO as the labels (n/a under 3, YES at d - 1 or more, NO at 1 or fewer, PARTIAL between).
4. **RP3 as coded:** for each of the four strong finders the edge of its graft over P(league7103) (the pair's own edge, or its negative when the pair is read the other way) is at least 0.5 with z of at least 2; at least 3 of the 4. **RP4:** none of the six pairs among the four strong grafts is decided; pairs with league7103 are not looked at.
5. **RB1 as coded** reads the **second** step (the speed step at league7100's turn, `S@2.70`) and the **fourth** (the turn step at league7100's speed, `N@4.50`); the first and third are printed and not read by the headline. **RB2** is the label of the pair league7001 over league7100 (the first of the ten): `league7100 decided` (negative, decided), `league7001 decided`, or `undecided`; the forecast quantity "league7100's pair over league7001's is decided" is the first of these.
6. **The checks as coded, in this order** (every one an identity or a file's own number): every arm, pair and step flew the set's geometries (each seed twice); no non-finite score; every theta of an arm or a U side one `clampTheta` leaves unchanged; every run's generation 0 is G; G with its own speed and turn has an edge of exactly 0 against G (a flight of its own); two equal thetas (P(league7001) against a copy) have an edge of exactly 0; each P arm is the split command's SN arm of its finder; the two P arms that are 2 x 2 corners and the two F arms have the speed and the turn of the files' pairs (league7001's and league7100's); each U side is the finder's final theta of the files; every number of every arm but the speed and the turn is G's, the time included. A failed check is printed, not weighed, makes the exit code 1, and the record is still written.
7. **The HELD gate** refuses a DEV record whose `checks` is not an empty list (or records none), as in the speed note's Amendment A item 1; the DEV run prints "DEV: a check FAILED, the read is void" in place of the R0 line when one failed.
8. **Printed besides the rules**, as section 4 says, and the forecast quantities of section 5 as yes/no by these names: `RP1 YES`, `RP1 PARTIAL`, `RP1 NO`, `no contradiction`, `the pair explains league7103's losses`, `the strong grafts are alike`, `league7100's pair over league7001's is decided`, `headline NEITHER`, `headline THE SPEED`, `headline THE TURN` ("R0 holds" is the DEV line and the R0 line). The ten pairs are printed side by side (U edge, P edge, the category) as well as in their own two blocks.
9. **What smoke is and is not.** Geometries 1 to 4 are among those (1 to 8) on which every league was TRAINED, so a smoke read says nothing about the claims, and its edges at 8 duels are too coarse to read (every arm and most pairs are 8-0-0 or near it). I saw the smoke report (the command ran in 22 s; no check failed); the forecasts of section 5 stand as written. A DEV read is 48 geometries, 12 times the smoke's duels: about four minutes.

## DEV RESULT (2026-11-15; `node tools/ship/takeEvadePairs.mjs dev --write`, geometries 112001 to 112048 (96 duels a matchup), exit 0; record `brain/subEvadePairsDev.json`: 7 arms, 10 P pairs, 10 U pairs, 4 steps)

DEV is free to read; HELD (113001 to 113048) was authorised by Keith to follow this read ("the next 2 rounds": DEV, then HELD), and the registration allows it: R0 held and no check failed (none printed; the HELD gate of Amendment A item 7 accepts this record). Forecasts are not scored on DEV except "R0 holds on DEV" (90): **TRUE**. The others stand as written for HELD.

**R0 holds.** The P arms of league7001 (+2.832, z 20.5, 88-4-4) and league7100 (+2.859, z 21.1, 89-3-4) find against G. The others: league7103 +1.366 (z 6.0, 68-0-28), exploit7200 +2.862, exploit7204 +2.824; the two 2 x 2 arms +2.829 (4.5 with 2.8) and +2.794 (4.32 with 2.70).

**The ten pairs side by side** (the first finder's edge over the second; U the finders themselves, P their grafts on G; "decided" is an edge of 0.5 and a z of 2 in size):

| pair | U | P | category |
|---|---|---|---|
| league7001 / league7100 | **-1.008** (z -5.7), 8-48-40 | +0.067 (z 1.1) | LOST |
| league7001 / league7103 | **+1.295** (z 4.7) | **+1.524** (z 6.2) | CARRIED |
| league7001 / exploit7200 | +0.072 | +0.064 | both undecided |
| league7001 / exploit7204 | +0.099 | +0.007 | both undecided |
| league7100 / league7103 | **+1.442** (z 5.6) | **+1.520** (z 6.2) | CARRIED |
| league7100 / exploit7200 | **+0.669** (z 3.2) | -0.096 (z -1.8) | LOST |
| league7100 / exploit7204 | **+1.023** (z 4.9) | +0.034 (z 0.3) | LOST |
| league7103 / exploit7200 | **-1.892** (z -7.9) | **-1.553** (z -6.5) | CARRIED |
| league7103 / exploit7204 | **-1.436** (z -5.7) | **-1.454** (z -5.9) | CARRIED |
| exploit7200 / exploit7204 | +0.196 | +0.067 | both undecided |

**RP1 THE PAIRS CARRY THE ORDER: PARTIAL** (4 of the 7 decided U pairs carried). **RP2 NO CONTRADICTION: yes** (0 contradicted). **RP3 THE PAIR EXPLAINS league7103'S LOSSES: yes** (4 of 4 strong grafts decided over it). **RP4 THE STRONG FOUR'S GRAFTS ARE ALIKE: yes** (none of their six pairs is decided). Categories: 4 CARRIED, 3 LOST, 0 CONTRADICTED, 0 SPURIOUS.

**The 2 x 2** (the speed 4.5 over 4.317 at a turn, the turn 2.698 over 2.8 at a speed): S@2.80 **-0.129** (z -2.1, DOWN: 4.5 is slightly worse than 4.317 at turn 2.8, as in the speed note's DEV step of -0.379 and in no other read); S@2.70 +0.002 (FLAT); N@4.32 -0.006 (FLAT); N@4.50 -0.000 (FLAT). **RB1 THE HEADLINE: NEITHER.** **RB2 league7100's PAIR OVER league7001's: undecided** (+0.067 for league7001, z 1.1).

**The forecast quantities as printed** (scored on HELD, not here): RP1 YES no, RP1 PARTIAL yes, RP1 NO no; no contradiction yes; the pair explains league7103's losses yes; the strong grafts are alike yes; league7100's pair over league7001's is decided no; headline NEITHER yes, THE SPEED no, THE TURN no.

**Observations (DEV, for reading, not rules):**

1. **The partial is clean: the pair carries league7103's losses and nothing of league7100's wins.** All four pairs with league7103 are CARRIED, in the same direction and about the same size (U +1.30 to -1.89, P +1.52 to -1.55); all three LOST pairs are league7100 against another strong finder (over league7001 by 1.01, over exploit7200 by 0.67, over exploit7204 by 1.02 as the unmodified finder, and **+0.07, -0.10 and +0.03 as grafts**). The other three strong pairs are undecided both ways. So the ten pairs split as: league7103's speed (3.546, near G's 3.418) with a turn of 2.8 is what loses; league7100's order over the others is **not** in its speed and turn.
2. **The 2 x 2 says the same from the other side:** the speed step (4.5 over 4.317) and the turn step (2.698 over 2.8) are FLAT in three of four cells and a small DOWN in the fourth; league7100's pair is not better than league7001's by any step of its own.
3. **The mirror reproduces on this set:** league7100 over league7001 by 1.01 (8-48-40: half of the 96 duels are draws), over exploit7204 by 1.02 and over exploit7200 by 0.67; in the opponent note it was over league7001 by 1.07 and 1.33 and over exploit7204 by 1.02 and 1.63.
4. **Where the order of league7100 could sit:** in the other ten numbers (search, track, fire range, aim tolerance, ping after, echo window, blind SNR, ping every, search ping, evade time). Nothing here says which; the time was inert against G only.

**What is NOT shown:** which of the other ten numbers carry league7100's order (not asked); any HELD read; whether league7100's order holds against opponents but the other finders. R0 held and no check failed, so HELD may be flown.

## HELD RESULT (2026-11-16; `node tools/ship/takeEvadePairs.mjs held --write`, geometries 113001 to 113048 (96 duels a matchup), flown ONCE, exit 0; record `brain/subEvadePairsHeld.json`: 7 arms, 10 P pairs, 10 U pairs, 4 steps)

Keith asked for it with the DEV flight ("the next 2 rounds"); R0 held on DEV and no check failed. The void-checks passed on HELD too (none printed). Nothing in the rules, the arms or the forecasts was changed between DEV and HELD (Amendment A is dated before DEV).

**R0 holds on HELD.** The P arms of league7001 (+2.697, z 16.2, 87-2-7) and league7100 (+2.760, z 17.6, 88-2-6) find against G; league7103's +1.099 (z 5.0, 64-0-32), exploit7200's +2.763, exploit7204's +2.693; the two 2 x 2 arms +2.829 and +2.695.

**The ten pairs side by side, HELD with the DEV edge beside it** (the first finder's edge over the second; decided at 0.5 and z 2 in size):

| pair | U: HELD (DEV) | P: HELD (DEV) | category on HELD |
|---|---|---|---|
| league7001 / league7100 | **-1.048** (z -6.7), 10-43-43 (-1.008) | -0.032 (+0.067) | LOST |
| league7001 / league7103 | **+1.402** (z 4.4) (+1.295) | **+1.656** (z 7.1) (+1.524) | CARRIED |
| league7001 / exploit7200 | **-0.575** (z -3.0) (+0.072) | -0.065 (+0.064) | LOST |
| league7001 / exploit7204 | -0.005 (+0.099) | +0.033 (+0.007) | both undecided |
| league7100 / league7103 | **+1.638** (z 6.0) (+1.442) | **+1.718** (z 7.4) (+1.520) | CARRIED |
| league7100 / exploit7200 | +0.434 (z 2.0) (+0.669, decided) | -0.002 (-0.096) | both undecided |
| league7100 / exploit7204 | **+1.215** (z 5.7) (+1.023) | +0.095 (+0.034) | LOST |
| league7103 / exploit7200 | **-2.021** (z -8.5) (-1.892) | **-1.721** (z -7.4) (-1.553) | CARRIED |
| league7103 / exploit7204 | **-1.744** (z -6.9) (-1.436) | **-1.654** (z -7.1) (-1.454) | CARRIED |
| exploit7200 / exploit7204 | **+0.709** (z 3.3) (+0.196) | +0.128 (+0.067) | LOST |

**RP1 THE PAIRS CARRY THE ORDER: PARTIAL** (4 of 8 decided U pairs carried; DEV 4 of 7). **RP2 NO CONTRADICTION: yes.** **RP3 THE PAIR EXPLAINS league7103'S LOSSES: yes** (4 of 4 strong grafts decided over it). **RP4 THE STRONG FOUR'S GRAFTS ARE ALIKE: yes** (none of their six pairs is decided; the largest is +0.128). **RB1 THE HEADLINE: NEITHER** (all four 2 x 2 steps FLAT: S@2.80 +0.067, S@2.70 +0.063, N@4.32 -0.094, N@4.50 -0.036; DEV had S@2.80 DOWN at -0.129, which did not repeat). **RB2: undecided** (league7001 over league7100 by -0.032, z -0.4).

**Forecasts, scored** (my probability; outcome on the printed quantity of HELD; "calls" is the probability I gave to what happened):

| forecast | mine | outcome | calls |
|---|---|---|---|
| R0 holds on DEV | 90 | held | 90 |
| R0 holds on HELD | 88 | held | 88 |
| RP1 YES | 15 | no | 85 |
| RP1 PARTIAL | 60 | **yes** | 60 |
| RP1 NO | 25 | no | 75 |
| RP2: no contradiction | 80 | yes | 80 |
| RP3: the pair explains league7103's losses | 85 | yes (4 of 4) | 85 |
| RP4: the strong four's grafts are alike | 65 | yes | 65 |
| RB2: league7100's pair over league7001's is decided | 25 | no | 75 |
| RB1: NEITHER | 50 | yes | 50 |
| RB1: THE SPEED | 20 | no | 80 |
| RB1: THE TURN | 15 | no | 85 |

**All twelve went as the larger side said, and the one weight on a middle outcome (PARTIAL at 60, NEITHER at 50) was the right one on both sets; I take no credit for it beyond a prior that the grafts of near-copies would be near-equal.**

**What the two sets say together (post hoc, labelled as such: no rule reads two sets).**

1. **The partial replicates to the pair.** All four pairs with league7103 are CARRIED on both sets (8 of 8, the grafts' edges within 0.35 of the finders'): league7103 loses to the strong four **because of its (speed, turn)**, a speed (3.546) near G's (3.418) with a turn of 2.8. The strong four's grafts are never decided against each other on either set (12 of 12 pairs undecided, the largest |edge| 0.13): **their pairs are interchangeable.**
2. **The strong four are not interchangeable as finders, and the order is not in the pair.** league7100 beats league7001, league7200 and league7204 on both sets as the finder (league7001: -1.008 and -1.048 the other way round; exploit7200: +0.669 and +0.434; exploit7204: +1.023 and +1.215; three of three, the same sign twice); exploit7200 beats exploit7204 (+0.196 and +0.709, decided on HELD) and league7001 on HELD (+0.575, but league7001 over it by +0.072 on DEV, so not a stable sign); league7001 and exploit7204 are level (+0.099, -0.005). **So the strong four's order is: league7100 first, exploit7200 next (with a weaker claim), league7001 and exploit7204 level; and the grafted pair carries none of it** (league7100's graft over the others: +0.067 and -0.032 over league7001, -0.096 and -0.002 over exploit7200, +0.034 and +0.095 over exploit7204; 0 of 6).
3. **The order sits in the other ten numbers (search, track, fire, aim, ping after, echo window, evade time, blind SNR, ping every, search ping), and which of them is what the ladder of the next note asks.** A reading of the finders' numbers (a table, not a result) shows that **three of the ten split the strong four the way their order does**: pingEvery (league7100 8.31 and exploit7200 8.17 against league7001 4.00 and exploit7204 4.00), blindSnr (league7001 80.9 and exploit7204 77.7 against league7100 47.0 and exploit7200 51.4) and, less cleanly, searchSpeed (exploit7200 4.30, league7100 4.09, league7001 3.83, exploit7204 3.31). That is a hypothesis from a table, said as one; the ladder is by groups chosen by function before any of its results, and tests all of them, not these three.
4. **The 2 x 2 did not move:** every speed step and turn step is FLAT on HELD, and DEV's one small DOWN (4.5 under 4.317 at turn 2.8, -0.129) did not repeat: neither the speed nor the turn separates league7100's pair from league7001's, as the speed notes found at a single turn.

**What is NOT shown:** which of the ten numbers carry league7100's order (not asked here); anything against an opponent but the finders and G; a mechanism. RP1 PARTIAL is the registered pointer to a ladder over the other ten numbers, restricted to the strong four: `brain/SUB_EVADE_LADDER_WIP.md`.
