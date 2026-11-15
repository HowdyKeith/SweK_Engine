# Submarine duel: the onset of the evade speed, and the top of the speed range at lower turns (REGISTRATION 6 of the evade reads; 2026-11-15; UNNUMBERED; REGISTERED BEFORE ANY CODE FOR IT IS WRITTEN AND BEFORE ANY GEOMETRY OF ITS SETS IS FLOWN)

Keith, 2026-11-15: "lets do a speed between 2.7 and 3.42, and a lower turn than 2.8 at the top of the speed range." The two things `brain/SUB_EVADE_SPEED_WIP.md` left open (its HELD RESULT, "What is NOT shown", and `brain/BACKLOG_2026-11-01.md` section E1), written after that note's HELD was read and with its amendments built in. A registration and nothing else: **no command, no gate and no geometry of its sets exists yet.**

**What this changes in shared files, said first: nothing.** New files only: this note, `tools/ship/takeEvadeSpeedFine.mjs` (the command), `tools/ship/takeEvadeSpeedFine-selfcheck.mjs` (its gate), `brain/subEvadeSpeedFineDev.json` and `brain/subEvadeSpeedFineHeld.json`. It imports, and does not edit, `tools/ship/takeEvadeSpeed.mjs` (`spanLabel`, `loses`, the report helpers), `tools/ship/takeEvadeDose.mjs` (`stepLabel`), `tools/ship/takeEvadeSplit.mjs` and `tools/ship/takeEvadeTurn.mjs` (the cells the identity checks compare to), `tools/ship/takeSubLeague.mjs` (`loadRuns`, `finds`, `signed`) and `brain/subTournament.mjs`. The bar and the method are those of `brain/SUB_EVADE_WIP.md`: an arm FINDS at an edge of at least 0.5 with z of at least 2 against generation 0 (G), both seats; a step is UP at z of 2 and an edge of 0.05 (the dose note's Amendment A, built in).

## 1. What is known (read from the records; nothing here is flown again)

* **The speed's onset lies between 2.7 and G's own 3.418, and nothing was flown in that gap.** At the ceiling turn (2.8) the arm at 2.0 is G on both sets (+0.008, +0.009, 24-0-24); at 2.7 it is **+0.020** (DEV, 24-0-24) and **+0.288** (HELD, z 1.6, 26-0-22, not finding); at G's 3.418 it is **+1.104** (DEV) and **+1.764** (HELD), finding. The rise from 2.7 to 3.418 is +1.08 and +1.48, over 0.72 m/s, a slope of about 1.5 to 2.1 an m/s: as steep as the 2.2 and 1.4 of the speeds above G's, so the onset may be a ramp that starts near 2.7 or a jump somewhere inside the gap, and the grid cannot say which (`SUB_EVADE_SPEED_WIP.md`, both RESULTs).
* **At the top of the speed range the curve at the ceiling turn is flat and at a lower turn the two sets disagree.** At turn 2.8: 4.10 over 3.80 is UP on both sets (+0.530, +0.601), 4.32 over 4.10 FLAT on both (+0.262, +0.066), 4.50 over 4.32 DOWN on DEV (-0.379, z -2.8) and FLAT on HELD (-0.065); SPAN-TOP (4.5 over 4.1) is +0.195 (se 0.218) and -0.062 (se 0.175). At turn 2.5: 4.10 over 3.80 UP on both (+0.801, +0.794), 4.32 over 4.10 FLAT on both (+0.333, +0.396), 4.50 over 4.32 UP on DEV (+0.457, z 2.1) and FLAT on HELD (+0.067), SPAN-TOP **UP on DEV (+0.790, z 2.8) and FLAT on HELD (+0.463, z 1.8)**. The edge at turn 2.5 and 4.5 is +2.294 (DEV) and +2.223 (HELD).
* **Turns below 2.5 at a high speed have been read only with a finder's time and one speed** (`SUB_EVADE_DOSE_WIP.md`'s B1: league7001's speed 4.317 and time 33.68, G's other ten numbers): the edge at turns 2.1, 2.3, 2.5, 2.65, 2.8 is +0.03, +0.90, +2.03, +2.96, +3.10 (DEV) and +0.154, +0.302, +1.894, +2.699, +2.639 (HELD). The time was inert in every read of it (`SUB_EVADE_SPLIT_WIP.md`), so these are the turn's curve at 4.317; **no turn below 2.8 has been read at 4.5 or at 4.1 together with 4.317, and no head-to-head of two speeds has been read at 2.3 or 2.65.**
* **The bound is 4.5** (`THETA_BOUNDS.evadeSpeed` 0.5 to 4.5) and the strong finders' speeds are 4.32, 4.50, 4.42, 4.35 (league7103's 3.55): whether the top of the range is a plateau or a clamp depends, on these records, on the turn.
* **The spans that matter are head-to-head** and are not capped by the score the way an edge against G is: the arms at the ceiling turn and 4.1 to 4.5 win 45 to 47 of 48 duels against G, near the cap.

## 2. The question and the arms

**The question, two parts.** **Part A (the ONSET): at the ceiling turn, where between 2.7 and G's 3.418 does the speed start to pay, and is the start a JUMP or a RAMP?** **Part B (the TOP): at turns below the ceiling (2.3, 2.5, 2.65) does a faster evade than 4.1 still pay up to the bound 4.5, and does the turn set the speed at which a boat starts to find?**

**Every arm is flown against G, both seats, by `subTournament.matchup`; every side a tactician and the PD autopilot; every number is G's except the speed and the turn (the time stays G's).**

| part | curve | the turn | the speeds (m/s) | arms |
|---|---|---|---|---|
| A | ON | 2.8 | 2.7, 2.8, 2.9, 3.0, 3.1, 3.2, 3.3, G's own 3.418 | 8 |
| B | T23 | 2.3 | 3.8, 4.1, league7001's 4.317, the bound 4.5 | 4 |
| B | T25 | 2.5 | the same four | 4 |
| B | T265 | 2.65 | the same four | 4 |
| B | T28 | 2.8 | the same four | 4 |

**24 arms.** G's own speed and league7001's are read from the files, not typed; 2.7 and G's 3.418 on ON, and 3.8, 4.1, 4.317 and 4.5 on T28, are the speed note's arms flown again on the new geometries (replication points); the others are new. **The steps:** the arm of each speed against the arm of the next speed down on its curve (the higher speed first): 7 on ON, 3 on each of T23, T25, T265 and T28: **19**. **The spans:** on each of the four B curves the arm of 4.5 against the arm of 4.1 (SPAN-TOP): **4**. **23 head-to-head matchups.** Nothing is searched, tuned or re-fit; every number is a number of G, of a finder in a file, or one of the registration's own grid.

**The sets are 48 geometries a set (96 duels an arm), not 24: MY CHOICE, said.** The comparisons that matter are small ones (a step or a span of +0.3 to +0.8 with a standard error of 0.2 to 0.3 on 24 geometries, where the last two reads disagreed on exactly such a step); 48 geometries cut the standard error by about 0.7 and the rules keep their bars (the finding bar is an edge of 0.5 at z of 2, the step bar z of 2 and an edge of 0.05). Keith may set it back to 24.

## 3. The sets and the order

* **smoke**: geometries 1 to 4, never recorded, free to read.
* **DEV**: **110001 to 110048**, both seats; flown first, read freely, recorded once in `brain/subEvadeSpeedFineDev.json`; it decides whether HELD is spent (R0).
* **HELD**: **111001 to 111048**, both seats; flown ONCE (`held --write`; refuses without a recorded DEV that replicates and lists no failed check, without `--write`, or if its record exists); the rules are about HELD.
* No submarine file uses 110001 to 111048 as a geometry (searched as whole numbers in the `.mjs` and `.md` files under `brain` and `tools`: the only hits are bit patterns of readings in `brain/subSensedDetect-selfcheck.mjs`). The sets 98001 to 109024 are spent.
* **Amendments:** as in the other notes: only dated, only before this note's HELD, said why. **Every void-check below is an identity or a file's own number** (the seat note's lesson), and the command's HELD gate refuses a DEV with a failed check (the speed note's Amendment A item 1), both said now and not as amendments.
* **The order of work:** this note, the command, its gate with a sabotage log (never flying 110001 to 111048), smoke, DEV, then HELD if R0 holds and Keith asks.

## 4. The rules (MY CHOICES, said; Keith may set them differently)

* **R0 REPLICATES** iff, on the set read, the arm of T28 at league7001's speed (4.317; SN of league7001) FINDS and the arm of ON at G's own speed (the GN arm) FINDS. On DEV, if R0 fails HELD is not flown by this registration. (Both found on every earlier set: SN +2.6 to +3.1 on four, GN +0.83 to +1.76 on eight.)
* **Labels.** An arm FINDS (edge 0.5, z 2); a STEP is UP / DOWN / FLAT as in the speed note (`stepLabel`, z 2 and an edge of 0.05 either way); **SPAN-TOP** is labelled as a step.
* **Part A.**
  * **RA1 ONSET:** the smallest speed on ON whose arm finds. It is named **LOW** (2.7 to 2.9), **MID** (3.0 to 3.2), **HIGH** (3.3 or G's own 3.418); R0 requires G's own arm to find, so it is never NONE on a read that counts.
  * **RA2 MONOTONE:** no step on ON is DOWN; **REVERSAL** names the speed of the first DOWN step.
  * **RA3 SHAPE.** Let the rise be the edge of the arm at G's own speed less the edge of the arm at 2.7, and a step's rise the edge of an arm less the edge of the arm below it. **NO RISE** if the rise is under 0.5; otherwise **JUMP** if the largest step's rise is at least 0.6 of the rise, **RAMP** if not. (A JUMP says the onset is one place on the grid; a RAMP that it is spread.)
  * **RA4 BELOW G:** the onset is below G's own speed (RA1 names LOW or MID, or HIGH at 3.3).
* **Part B.**
  * **RB1 THRESHOLD (per B curve):** the smallest speed of the four whose arm finds (NONE if none; 3.8, 4.1, 4.317 or 4.5).
  * **RB2 THE TURN SETS THE THRESHOLD:** the thresholds are non-increasing as the turn rises (T23's at least T25's at least T265's at least T28's, with NONE above every speed) **and** at least one pair is strictly ordered.
  * **RB3 THE BOUND BINDS (per B curve):** SPAN-TOP is UP. **RB4 THE BOUND BINDS AT LOWER TURNS** iff it is UP on at least 2 of T23, T25 and T265 (YES at 2 or 3, NO at 0 or 1).
  * **RB5 THE PLATEAU AT THE CEILING TURN** iff SPAN-TOP on T28 is not UP.
* **The readings** (written now): RB4 YES reads as: at turns below the ceiling the finders' 4.3 to 4.5 is where the search was clamped, a faster evade than the search could set would pay (nothing above 4.5 can be flown here: `THETA_BOUNDS` is a shared file this note does not edit); RB4 NO that the top of the range is a plateau at every turn read. RB5 is the speed note's finding at the ceiling turn read again.
* **Reported with the read, not in a rule:** each arm's edge, se, z, wins-draws-losses and its edge in seat A and in seat B; each step's and span's edge, se, z and label; the edge of each B curve less T28's at each speed; the slope of ON between 2.7 and G's own speed; and **the forecast quantities of section 5 as yes/no**, so they are scored from the printed line.
* **Checks that void the read, said and not weighed. Every one is an identity or a file's own number:** every arm, step and span flew the set's geometries (each seed twice); no non-finite score; every theta one `clampTheta` leaves unchanged; every run's generation 0 is G; **G with its own speed and turn against G has an edge of exactly 0 (a flight of its own: no arm here is G)**; the arm of T28 at 4.5 against a copy of itself has an edge of exactly 0; **the arm of T28 at league7001's speed is SN of league7001** (`takeEvadeSplit.mjs`) **and the arm of ON at G's own speed is GN of league7001** (`takeEvadeTurn.mjs`), the same theta to the number; the speeds of each curve are strictly increasing and the named ones (G's own, league7001's, the bound) are the files'; **every number of every arm but the speed and the turn is G's**, the time included; the turns of the curves are 2.8, 2.3, 2.5, 2.65 as registered.

## 5. Forecasts, written before any geometry of any of the two sets is flown (probabilities, mine)

| forecast | probability |
|---|---|
| R0 holds on DEV | **88** |
| R0 holds on HELD | **86** |
| RA1: the onset is MID (3.0 to 3.2) | **50** |
| RA1: the onset is LOW (2.7 to 2.9) | **15** |
| RA1: the onset is HIGH (3.3 or G's 3.418) | **35** |
| RA2: ON is MONOTONE (no DOWN step) | **80** |
| RA3: the shape is a RAMP (not a JUMP, and a rise of at least 0.5) | **65** |
| RB2: the turn sets the speed threshold (non-increasing in the turn, one strict pair) | **80** |
| RB4: the bound binds at lower turns (SPAN-TOP UP on at least 2 of 3) | **40** |
| RB5: SPAN-TOP on T28 is not UP (the plateau at the ceiling turn) | **85** |
| the arm of T23 at the bound 4.5 finds | **55** |

Why these: the edge at the ceiling turn is flat to 2.7 and +1.1 to +1.8 at G's own speed, steep between, so a straight line from about +0.1 at 2.7 to +1.1 or +1.8 at 3.418 crosses the finding bar of 0.5 somewhere between about 3.0 and 3.2, and I give that middle the half; a jump inside the gap is a possibility the data cannot rule out, which is why the shape is a 65 and the HIGH onset a third; the monotone is 80 because the steps are small and a false DOWN is about 2 in 100 a step under the rule, 13 in 100 over seven; the turn lowering the threshold follows from every earlier read in which a stronger arm found one step earlier, so 80; the plateau at the ceiling turn has two sets behind it (85); the bound binding at lower turns is the question the sets disagreed on, and I lean against (40), because 48 geometries should settle a +0.4 to +0.8 span one way or the other and the HELD value of the turn-2.5 span is the smaller; the turn of 2.3 with the bound is a coin because the B1 curve at 4.317 was +0.90 on DEV and +0.30 on HELD there.

## 6. What a result would not say

* **A mechanism.** The speed costs noise in the duel; whether a slower evade nulls the turn, or a faster one opens the range, is not asked, and the events (`fire`, `hit`) are not read.
* **Anything above 4.5 or below 2.7 on ON,** any dose of the time (G's throughout), any turn but 2.3, 2.5, 2.65 and 2.8, or the speeds of Part B other than 3.8, 4.1, 4.317 and 4.5.
* **That a speed between the ones flown behaves like its neighbours** (the ON grid steps by 0.1 m/s, a step that may be too small for the rule to see: FLAT means "not shown"; the onset is read from where the ARM finds, not from a step).
* **That an arm that wins 45 to 47 of 48 against G has a speed that stops paying:** the edge against G is near the score's cap there; the spans are the instrument for the plateau and they are head-to-head.
* **Anything against an opponent but G** (`SUB_EVADE_OPPONENT_WIP.md`), **the seat** (`SUB_EVADE_SEAT_WIP.md`) **or a set of 24 geometries** (these are 48).
* **That the arms of one curve are independent:** they share a set of geometries, so their edges move with it (every threshold in the dose note moved one step between its sets); a threshold is read on one set.

## 7. Cost

24 arms and 23 head-to-head matchups, plus the checks' two extra matchups, is about 49 matchups of 96 duels a set, four to five minutes of one core; the command, its gate and a sabotage pass are the work.
