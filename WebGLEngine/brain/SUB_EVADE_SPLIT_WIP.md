# Submarine duel: the evade triple split into its three numbers (REGISTRATION 1 OF 4 of the evade follow-ups; 2026-11-15; UNNUMBERED; REGISTERED BEFORE ANY CODE FOR IT IS WRITTEN AND BEFORE ANY GEOMETRY OF ITS SETS IS FLOWN)

Keith, 2026-11-15: "lets register each of those in the order that you suggest". The four follow-ups are the open list at the end of the HELD result of `brain/SUB_EVADE_WIP.md`; this is the first of them, written before the result of any of the four (the others: `brain/SUB_EVADE_DOSE_WIP.md`, `brain/SUB_EVADE_OPPONENT_WIP.md`, `brain/SUB_EVADE_SEAT_WIP.md`). **Why this order:** the split has the same machinery as what is built and its answer says which numbers the seat study (4) has to mirror; the dose (2) is independent and cheap; the opponent study (3) is the largest and asks the question that decides whether the doctrine is good at all, so it goes after the two cheap ones; the seat study (4) depends on this one and is the most open-ended. This note is a registration and nothing else: **no command, no gate and no geometry of its sets exists yet.**

**What this changes in shared files, said first: nothing.** New files only: this note, `tools/ship/takeEvadeSplit.mjs` (the command), `tools/ship/takeEvadeSplit-selfcheck.mjs` (its gate) and the records `brain/subEvadeSplitDev.json` and `brain/subEvadeSplitHeld.json`. It imports, and does not edit, `tools/ship/takeEvadeTurn.mjs` (`graft`, `rowOf`, `labelOf`, `seatEdge`, `fly`'s pattern), `tools/ship/takeSubLeague.mjs` (`loadRuns`, `finds`, `median`, `signed`) and `brain/subTournament.mjs`. The definitions, the bar and the method are those of `brain/SUB_EVADE_WIP.md` (read it first): an arm FINDS at an edge of at least 0.5 with z of at least 2 against generation 0 (G), both seats, 24 geometries; "most" is at least n' - 1 of the n' finders whose unmodified arm finds, "few" is at most 1; fewer than 3 finders and the labels are n/a.

## 1. What is known (read from the notes and the records; nothing here is flown again)

* **The HELD result of `brain/SUB_EVADE_WIP.md`:** the evade TRIPLE (evadeSpeed, evadeTime, evadeTurn) put on G reproduces each finder's own edge (a share of 1.00 to 1.10 in all five), and the TURN alone carries 0.39 to 0.44 of it in four finders and 1.00 in the fifth, league7103. So about three fifths of what the four strong finders do (+3.1 against the turn's +1.1 to +1.4) sits in the speed and the time, and nothing has separated those two.
* **The numbers** (the finders' evade numbers; generation 0 is evadeSpeed 3.42, evadeTime 36.9, evadeTurn 1.71):

| finder | evadeSpeed | evadeTime | evadeTurn |
|---|---|---|---|
| league7001 | 4.32 | 33.7 | 2.80 |
| league7100 | 4.50 | 30.7 | 2.70 |
| league7103 | 3.55 | 30.1 | 2.80 |
| exploit7200 | 4.42 | 29.2 | 2.80 |
| exploit7204 | 4.35 | 27.8 | 2.65 |

* **What the two numbers do** (from `brain/subTactics.mjs`): when a torpedo is heard the boat runs for `evadeTime` seconds (restarted whenever one is heard again) at `evadeSpeed`, on a heading `evadeTurn` radians off the torpedo's bearing, and neither fires nor pings while it does. A longer evade is a longer time not shooting; a faster one is a louder boat (`brain/subDuel.mjs` makes speed cost noise; no battery is used here).
* **The candidate, and why it is only a candidate.** In the HELD result league7103 is the one finder whose evadeSpeed (3.55) is near generation 0's (3.42), and it is the one whose triple does not win from the target's seat and whose turn alone is all of its edge; its evadeTime (30.1) sits inside the other four's (27.8 to 33.7). That points at the speed. It is one finder against four, and nothing held the speed fixed. This registration is what holds it fixed.

## 2. The question and the arms

**The question.** Of the three numbers of the triple, which are NEEDED (the other two are not enough) and which DISPENSABLE (the other two carry it)? Is the speed the part the turn does not carry?

**The cells.** For each of the five named finders f (**league7001, league7100, league7103, exploit7200, exploit7204**, by their final generation's theta, not re-picked), a cell is G with some of f's three numbers. Writing S for evadeSpeed, T for evadeTime, N for evadeTurn (the turn), the seven cells are **S, T, N, ST, SN, TN, STN** (STN is the triple, GT of the other note; N is GN), and U is f unmodified. 8 arms a finder, **40 arms**, every one flown against G, both seats, 24 geometries (48 duels), by `subTournament.matchup`; every side is a tactician and the PD autopilot, as before. A cell's theta is G's with exactly the named keys copied from f; nothing is searched, tuned or re-fit. Seven cells and G make the 2 x 2 x 2 of the three numbers, and the unflown eighth cell is G, whose edge against itself is exactly 0.

## 3. The sets and the order

* **smoke**: geometries 1 to 4, never recorded, free to read (the leagues were trained on 1 to 8, so it says only that the command runs).
* **DEV**: **100001 to 100024**, both seats; flown first, read freely, recorded once in `brain/subEvadeSplitDev.json`; **it decides whether HELD is spent** (R0 below).
* **HELD**: **101001 to 101024**, both seats; flown ONCE (`held --write`; refuses without a recorded DEV that replicates, without `--write`, or if its record exists); the rules are about HELD.
* No submarine file uses 100001 to 101024 (searched: the only files with `sub` in the name that hold those digits hold the number 100000 for a range, not a seed).
* **Amendments:** a rule, a bar, a count or an arm may change after DEV only by a dated AMENDMENT written here BEFORE HELD, saying what DEV showed and why. Nothing moves after HELD; a wrong forecast is scored as wrong. **This note is written before the results of the other three; a result of theirs that changes what this should ask is an amendment dated before this note's DEV, or it is not used.**
* **The order of work:** this note, the command, its gate with a sabotage log in the header (the gate never flies 100001 to 101024), smoke, DEV, then (if R0 holds) HELD.

## 4. The rules (MY CHOICES, said; Keith may set them differently)

Let F' be the finders whose U arm finds on the set read, n' = |F'|.

* **R0 REPLICATES** iff n' is at least 4 of 5. On DEV, if R0 fails HELD is not flown by this registration. (It has held on two fresh sets, 5 of 5 each time.)
* A cell **CARRIES** for a finder iff its edge is at least **0.8** of that finder's own unmodified edge (the 0.8 is a number I chose: a cell that reproduces four fifths of the edge). A cell **FINDS** as before (0.5, z 2).
* **R1 SPEED ALONE FINDS**: the S cell finds for most of F' (YES) or few (NO), else PARTIAL. **R2 TIME ALONE FINDS**: the same for T.
* **R3 SPEED AND TURN CARRY**: the SN cell carries for most / few. **R4 TIME AND TURN CARRY**: TN. **R5 SPEED AND TIME CARRY**: ST.
* **The numbers, NEEDED or DISPENSABLE:** the **turn** is DISPENSABLE iff R5 is YES (without it the other two carry) and NEEDED iff R5 is NO; the **speed** from R4 in the same way, the **time** from R3. PARTIAL stays PARTIAL; fewer than 3 finders, n/a.
* **The headline** (when no label is PARTIAL or n/a): the numbers NEEDED, named: "THE SPEED AND THE TURN", "THE TURN ONLY" (the other two are dispensable: any pair containing it carries), "ALL THREE NUMBERS", "THE SPEED AND THE TIME", "ANY TWO OF THE THREE" (none needed), and so on; a headline is withheld when any of the three labels is PARTIAL.
* **Reported with the read, not in a rule:** every cell's edge, se, z and wins-draws-losses; each cell's share of the finder's own edge (median over F'); the cell's edge in seat A and seat B separately; the 2 x 2 x 2 table of medians; and the two finders apart (league7103's cells against the four strong ones').
* **Checks that void the read, said and not weighed:** as in `brain/SUB_EVADE_WIP.md` (same geometries every arm, no non-finite score, every theta one `clampTheta` leaves unchanged, every run's generation 0 is G, G with its own triple has an edge of exactly 0 against G, an unmodified arm equals the finder flown directly), plus: the STN cell of each finder is the GT arm of `tools/ship/takeEvadeTurn.mjs` and the N cell its GN arm (the same theta to the number).

## 5. Forecasts, written before any geometry of any of the four sets is flown (probabilities, mine)

| forecast | probability |
|---|---|
| R0 holds on DEV | **92** |
| R0 holds on HELD | **90** |
| R1: the speed alone FINDS (YES) | **45** |
| R2: the time alone FINDS (YES) | **10** |
| R3: speed and turn CARRY (YES) | **60** |
| R4: time and turn CARRY (YES) | **10** |
| R5: speed and time CARRY (YES) | **5** |
| the turn is NEEDED (R5 is NO) | **88** |
| the speed is NEEDED (R4 is NO) | **75** |
| the time is DISPENSABLE (R3 is YES) | **60** |
| the headline is "THE SPEED AND THE TURN" | **45** |
| the headline is "ALL THREE NUMBERS" | **25** |
| the median share of the SN cell is at least 0.9 | **55** |

Why these: the strong finders' evade speed is 0.9 to 1.1 m/s above G's while the time differs by 3 to 9 s the other way, so I give the speed more of the effect than the time; the turn is needed because its lesion removed the whole edge in both reads; league7103 is a reason the counts of R3 and R4 will not be unanimous (its turn alone is all of its edge, so for it TN and SN both carry), which is why R4 is not forecast lower than 10 and why R1 is below a half.

## 6. What a result would not say

* **That a cell that does not carry is useless.** A cell is G with a few numbers of f; its effect depends on the other nine, which are G's and not f's. The 2 x 2 x 2 is read at one corner (G).
* **That 0.8 is a measurement.** Shares of 0.6 to 0.8 are printed and fall on the NO side of R3 to R5; a reading of "needed" can mean "needed to reach four fifths".
* **Anything against an opponent but G** (that is registration 3), **a dose of the turn** (2), **or the seat** (4).
* **That five finders are a sample.** Three of them are near-copies (7001, 7100, 7200), and three of the five N cells are one boat (turn 2.80), so the effective number of independent finders is nearer three, as in the other note.

## 7. Cost

46 matchups of 48 duels (40 arms, one identity, five direct) is about 2,200 duels a set, a minute and a half to two minutes of one core; the command, its gate and a sabotage pass (the evade-turn gate's 217 mutants took about 10 minutes on four cores) are the work.

## AMENDMENT A (2026-11-15; made while the command `tools/ship/takeEvadeSplit.mjs` was written and smoke-run on geometries 1 to 4, BEFORE any DEV geometry (100001 to 100024) or HELD geometry (101001 to 101024) was flown)

None of this changes a rule, a bar, a count, an arm or a forecast of sections 2 to 5; it fills in what the registration left unsaid, and it is dated before any data.

1. **Fewer than 3 finders**, as in Amendment A of `brain/SUB_EVADE_WIP.md`: "most" and "few" overlap, so every label is `n/a`, the three NEEDED / DISPENSABLE words are `n/a` and there is no headline; R0 fails at n' below 4 in any case.
2. **What the command does**, as for `tools/ship/takeEvadeTurn.mjs`: `smoke` flies geometries 1 to 4 and is never recorded; `dev` flies 100001 to 100024 and prints (it may be run without `--write`); `dev --write` records `brain/subEvadeSplitDev.json` once; `held --write` is the only way to fly 101001 to 101024 and refuses without `--write`, over an existing `brain/subEvadeSplitHeld.json`, and unless the DEV record is a record of the `dev` set whose rules say R0 held. The record's `set` is the set that was flown.
3. **The bar, written as code.** A cell CARRIES iff its edge is **at least 0.8 times its finder's unmodified edge** (`edge >= 0.8 * edge of U`), so a cell at exactly four fifths carries; a cell FINDS iff its edge is at least 0.5 with z at least 2. The speed is read DISPENSABLE from R4 (time and turn carry), the time from R3 (speed and turn carry) and the turn from R5 (speed and time carry), as in section 4.
4. **The headline names the numbers NEEDED in the order speed, time, turn**: none needed, "ANY TWO OF THE THREE"; one, "THE SPEED ONLY", "THE TIME ONLY" or "THE TURN ONLY"; two, "THE SPEED AND THE TIME", "THE SPEED AND THE TURN" or "THE TIME AND THE TURN"; all three, "ALL THREE NUMBERS". It is withheld when any of the three words is PARTIAL or n/a.
5. **Printed besides the rules** (none of it a rule): every arm's edge, se, z, wins-draws-losses and per-seat edges; each cell's median share of its finder's own edge over F'; the median edge of each kind over the five finders (the 2 x 2 x 2 at G, and U); and league7103's edge in each kind beside the median of the other four's (the odd finder apart).
6. **The checks that void the read** are those of `brain/SUB_EVADE_WIP.md` (made by that command's own `checksOf`, imported) plus the registration's: the STN cell of each finder is that command's GT arm and the N cell its GN arm, the same theta to the number. One identity matchup and five direct ones are flown with the 40 arms, as there.
7. **What smoke is and is not.** Geometries 1 to 4 are among those (1 to 8) on which every league and exploiter was TRAINED, so the smoke output says the command runs and says nothing about the claim. I saw it (all 40 arms flew, the checks passed) and **the forecasts of section 5 stand as written and will be scored as written.**

## DEV RESULT (2026-11-15; `node tools/ship/takeEvadeSplit.mjs dev --write`, 125 s, geometries 100001 to 100024, both seats, 48 duels an arm, 40 arms; `brain/subEvadeSplitDev.json`; the checks passed; the gate `tools/ship/takeEvadeSplit-selfcheck.mjs` passed and its sabotage log is in its header)

The edge of each arm over generation 0 (**F** = the arm finds, edge >= 0.5 and z >= 2; each cell is G with the finder's numbers S evadeSpeed, T evadeTime, N evadeTurn):

| finder | U | S | T | N | ST | SN | TN | STN |
|---|---|---|---|---|---|---|---|---|
| league7001 | +2.63 F | +0.00 | +0.00 | +1.50 F | +0.00 | +2.69 F | +1.36 F | +2.63 F |
| league7100 | +2.41 F | +0.01 | +0.00 | +1.36 F | +0.01 | +2.96 F | +1.37 F | +2.97 F |
| league7103 | +1.08 F | +0.00 | +0.00 | +1.50 F | +0.00 | +1.50 F | +1.36 F | +1.49 F |
| exploit7200 | +2.69 F | +0.01 | +0.00 | +1.50 F | +0.01 | +2.96 F | +1.49 F | +2.83 F |
| exploit7204 | +2.70 F | +0.00 | +0.00 | +1.36 F | +0.00 | +2.69 F | +1.23 F | +2.70 F |

**R0 holds: 5 of 5 unmodified finders find on a third fresh set** (their edges are lower here, +2.4 to +2.7 for the four strong ones where they were +3.1 on 98001 to 99024; the carry bar is relative to each finder's own edge, so this does not move a rule). **By the registered rules on DEV: R1 the speed alone does not find (0 of 5, NO), R2 the time alone does not find (0 of 5, NO), R3 speed and turn CARRY (5 of 5, YES), R4 time and turn carry for 1 of 5 (NO), R5 speed and time carry for 0 of 5 (NO). So the speed is NEEDED, the time DISPENSABLE and the turn NEEDED: the headline is "THE SPEED AND THE TURN".** The median shares of the finder's own edge: S 0.00, T 0.00, N 0.56, ST 0.00, SN 1.10, TN 0.56, STN 1.05. The command's last line: HELD may be flown. DEV is a calibration and the rules are about HELD; of the forecasts of section 5 only the first (R0 holds on DEV, 92) is scored on it, and it came true. The rest stand as written.

**What the table shows that the labels do not (read from DEV, free to read; nothing here moves a rule).** (1) **The speed and the time do nothing alone or together; the turn is the gate and the speed multiplies it.** S, T and ST are +0.00 to +0.01 for all five finders (a boat that has only the speed, the time or both is G to the second decimal), the turn alone is +1.4 to +1.5, and speed with turn is +2.7 to +3.0: the speed adds +1.2 to +1.6 when the turn is on (league7103, whose speed is near G's, gains nothing) and nothing when it is off. (2) **The time is inert in everything that was flown:** adding it to the speed and turn changes the median share from 1.10 to 1.05, and adding it to the turn from 0.56 to 0.56. (3) **league7103 is the finder the candidate predicted.** Its evadeSpeed (3.55) is near G's (3.42), and for it the speed adds nothing: SN is +1.50, the same as N, and TN (+1.36) carries 1.26 of its own edge (+1.08) where for the four strong ones TN carries 0.46 to 0.57. That is why R4 reads 1 of 5 and not 0. (4) **The seat.** With the speed on, the cell wins from both seats (SN, strong finders: seat A +3.0 to +3.3, seat B +2.3 to +2.6); without it the cell wins from seat A and is only slightly ahead from seat B (N and TN: +2.0 to +2.3 and +0.5 to +0.8). The speed carries the target's seat, which is the question of registration 4.

**HELD is next and is not flown yet**: `node tools/ship/takeEvadeSplit.mjs held --write`, once, on 101001 to 101024 (the command refuses without this DEV record, which exists and replicates). No amendment is made after DEV.

