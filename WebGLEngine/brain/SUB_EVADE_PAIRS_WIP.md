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
