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

## AMENDMENT A (2026-11-15; made while the command `tools/ship/takeEvadeSpeedFine.mjs` was written and smoke-run on geometries 1 to 4, BEFORE any DEV geometry (110001 to 110048) or HELD geometry (111001 to 111048) was flown)

No rule's bar, no arm, no forecast is changed; items 1 and 2 correct what section 1 of this note says the command imports and which checks it has, the rest fill in what the registration left unsaid.

1. **What it imports.** The preamble said the command imports `spanLabel`, `loses` and the report helpers of `takeEvadeSpeed.mjs`; it imports **none of them** (a span here is labelled as a step, `stepLabel` of `takeEvadeDose.mjs`, and nothing here prints LOSES): it imports `stepLabel` (the dose command), `graft` and `rowOf` and the GN arms (`takeEvadeTurn.mjs`), the SN arms (`takeEvadeSplit.mjs`) and `loadRuns` (`takeSubLeague.mjs`).
2. **The "strictly increasing" clause of the checks is not coded as a check of its own:** the named speeds (2.7 to 3.3 and the fixed 3.8, 4.1, 4.5, G's own, league7001's) are checked place by place, in the sorted speeds of each curve, and equal speeds or a wrong order cannot pass that (the second place of a curve sorted with a repeated speed is not the named one). The check "a named speed is not the file's" is therefore also the order check.
3. **R0 and the identity.** R0 is read as coded: the arm of T28 at league7001's speed and the arm of ON at G's own speed both find. The identity flight is G with its own speed and turn against G (an edge of exactly 0), a flight of its own because no arm here is G; two equal thetas are the arm of T28 at 4.5 against a copy of itself. The cell checks are as in section 4: T28 at league7001's speed is SN of league7001, ON at G's own speed is GN of league7001.
4. **RA3 as coded.** The rise is the edge of the arm at G's own speed less the edge of the arm at 2.7 (last less first); a step's rise is an arm's edge less the edge of the arm below it, the largest taken over the seven; NO RISE is a rise below 0.5; JUMP is a largest rise of at least 0.6 of the rise; otherwise RAMP. (A rise of exactly 0.5 is not NO RISE; a largest rise of exactly 0.6 of the rise is a JUMP.)
5. **RB2 as coded:** the thresholds, as places in the four B speeds with NONE above every place, are non-increasing from T23 to T25 to T265 to T28 and the T23 threshold is above T28's (which is "one pair strictly ordered" for a non-increasing chain). **RB4:** the number of T23, T25 and T265 whose SPAN-TOP is UP, at least 2. **RB5:** T28's SPAN-TOP is not UP (FLAT or DOWN).
6. **The checks as coded, in this order** (every one an identity or a file's own number): every arm, step and span flew the set's geometries (each seed twice); no non-finite score; every theta one `clampTheta` leaves unchanged; every run's generation 0 is G; G with its own speed and turn has an edge of exactly 0 against G; two equal thetas have an edge of exactly 0; the two cell arms are the other commands'; the named speeds are the files' (and the fixed numbers' of the grid), place by place, on every curve; every arm's turn is its curve's (2.8, 2.3, 2.5, 2.65, 2.8); every number of every arm but the speed and the turn is G's, the time included. A failed check is printed, not weighed, makes the exit code 1, and the record is still written.
7. **The HELD gate** refuses a DEV record whose `checks` is not an empty list (or records none), as in the speed note's Amendment A item 1; the DEV run prints "DEV: a check FAILED, the read is void" in place of the R0 line when one failed.
8. **Printed besides the rules**, as section 4 says, and the forecast quantities of section 5 as yes/no by these names: `onset MID`, `onset LOW`, `onset HIGH`, `ON monotone`, `shape a RAMP`, `the turn sets the threshold`, `the bound binds at lower turns`, `plateau at the ceiling turn`, `T23 at the bound finds` ("R0 holds" is the DEV line and the R0 line).
9. **What smoke is and is not.** Geometries 1 to 4 are among those (1 to 8) on which every league was TRAINED, so a smoke read says nothing about the claims, and its edges at 8 duels are too coarse to read. I saw the smoke report (the command ran in 24 s; no check failed); the forecasts of section 5 stand as written. A DEV read is 48 geometries, 12 times the smoke's duels: about five minutes.

## DEV RESULT (2026-11-15; `node tools/ship/takeEvadeSpeedFine.mjs dev --write`, geometries 110001 to 110048 (96 duels an arm), exit 0; record `brain/subEvadeSpeedFineDev.json`: 24 arms, 19 steps, 4 spans)

DEV is free to read; HELD (111001 to 111048) was authorised by Keith for after this read ("fly DEV and then HELD once DEV is complete"), and the registration allows it: R0 held and no check failed (none printed; the HELD gate of Amendment A item 7 accepts this record). Forecasts are not scored on DEV except "R0 holds on DEV" (88): **TRUE**. The others stand as written for HELD.

**R0 holds.** T28 at league7001's speed (4.32): **+2.965**, z 23.0, 92-0-4, FINDS; ON at G's own speed (the GN arm): **+0.967**, z 4.6, 62-0-34, FINDS.

**Part A, the onset (turn 2.8):**

| speed (m/s) | edge against G | z | wins-draws-losses | finds |
|---|---|---|---|---|
| 2.70 | +0.017 | 15.8 | 48-0-48 | no |
| 2.80 | +0.020 | 15.4 | 48-0-48 | no |
| 2.90 | +0.090 | 1.3 | 49-0-47 | no |
| 3.00 | +0.225 | 2.0 | 51-0-45 | no |
| 3.10 | +0.228 | 2.0 | 51-0-45 | no |
| 3.20 | **+0.563** | 3.2 | 56-0-40 | **FINDS** |
| 3.30 | **+0.566** | 3.2 | 56-0-40 | **FINDS** |
| 3.42 (G's) | **+0.967** | 4.6 | 62-0-34 | **FINDS** |

**RA1 ONSET: MID (3.20).** **RA2 MONOTONE: yes** (no DOWN step). **RA3 SHAPE: RAMP:** the rise from 2.7 to G's speed is +0.950 and the largest step's rise (3.30 to 3.42) is +0.401, 0.42 of it, under the 0.6 of a JUMP. **RA4 BELOW G: yes** (the onset is under G's own speed). The slope of ON from 2.70 to G's speed is **+1.32** edge points an m/s. Steps: UP at 3.20 over 3.10 (+0.335, z 2.4) and at 3.42 over 3.30 (+0.401, z 2.6), the other five FLAT.

**What the grid shows that the label does not (read from DEV, free to read; nothing here moves a rule).** The RAMP is a **staircase**: the duels won move 48, 49, 51, 56, 62 of 96 and the arms come in pairs with the same edge (3.00 and 3.10: +0.225, +0.228; 3.20 and 3.30: +0.563, +0.566), the head-to-head of each pair being +0.003. So outcomes change at particular speeds, about 2.9, 3.0, 3.2 and between 3.3 and 3.42, a few duels each, and a grid of 0.1 m/s sees a step every second point. The rule reads it as a RAMP; it is not smooth and it is not a single jump.

**Part B, the top at lower turns:**

| turn | 3.80 | 4.10 | 4.32 (league7001's) | 4.50 | threshold | SPAN-TOP (4.5 over 4.1) |
|---|---|---|---|---|---|---|
| T23 (2.3) | +0.025 | +0.198 (z 2.0) | +0.367 | **+0.637** F | 4.50 | **UP** +0.470, z 3.0 |
| T25 (2.5) | +0.465 (z 3.0) | **+1.234** F | **+1.765** F | **+2.096** F | 4.10 | **UP** +0.859, z 4.2 |
| T265 (2.65) | **+1.834** F | **+2.432** F | **+2.960** F | **+3.024** F | 3.80 | **UP** +0.525, z 2.7 |
| T28 (2.8) | **+2.104** F | **+2.768** F | **+2.965** F | **+3.030** F | 3.80 | FLAT +0.102, z 0.7 |

**RB1 THRESHOLD:** T23 4.50, T25 4.10, T265 3.80, T28 3.80. **RB2 THE TURN SETS THE THRESHOLD: yes** (non-increasing with the turn, T23's above T28's). **RB3** the spans as in the table. **RB4 THE BOUND BINDS AT LOWER TURNS: YES (3 of 3 lower turns UP).** **RB5 THE PLATEAU AT THE CEILING TURN: yes** (T28's span is FLAT). **B minus T28** at 3.80, 4.10, 4.32, 4.50: T23 -2.078 -2.570 -2.598 -2.393; T25 -1.638 -1.534 -1.200 -0.934; T265 -0.270 -0.336 -0.005 -0.005.

**The forecast quantities as printed** (scored on HELD, not here): onset MID yes, LOW no, HIGH no; ON monotone yes; shape a RAMP yes; the turn sets the threshold yes; **the bound binds at lower turns yes**; plateau at the ceiling turn yes; T23 at the bound finds yes.

**Observations (DEV, for reading, not rules):**

1. **At lower turns the speed still pays up to the bound, and at the ceiling turn it does not.** 4.5 beats 4.1 head-to-head at turns 2.3, 2.5 and 2.65 (+0.47, +0.86, +0.53, each at z of 2.7 or more) and not at 2.8 (+0.10, z 0.7): the finders' 4.3 to 4.5 reads on this set as a clamp below the ceiling turn and a plateau at it. This is the question on which the speed note's two sets had disagreed at turn 2.5 (UP on its DEV, FLAT on its HELD); here it is UP at z 4.2 on 48 geometries. One set; HELD reads it.
2. **A lower turn moves the threshold up the speed axis by one grid place a step and the edge down:** thresholds 3.80, 3.80, 4.10, 4.50 for turns 2.8, 2.65, 2.5, 2.3; at turn 2.3 an evade at the bound is the only arm that finds (+0.637, z 3.6, 56-2-38). The two highest turns are alike against G at 4.32 and 4.50 (-0.005 apart) because both are near the ceiling of the score (92-0-4 and 93-0-3), which is why the spans, and not the edges against G, are the instrument there.
3. **The speed's own onset sits at 3.0 to 3.3 on this set** (MID), at about 0.6 of G's edge (+0.56 at 3.2 and 3.3, +0.97 at G's), and it is below G's own speed; the speed note's 2.7 is not alone in being G: **2.7 and 2.8 are both G here (48-0-48).**
4. **G's seat bias on this set** (the flat arms' seat edges, +1.41 and -1.38) is between the earlier sets' +0.84 and +1.96, as the seat note found G's bias varying across sets.

**What is NOT shown:** a mechanism; any HELD read; a speed below 2.7 or above 4.5 on ON, a turn but 2.3, 2.5, 2.65 and 2.8, or the time (G's throughout); anything against an opponent but G. R0 held and no check failed, so HELD may be flown.

## HELD RESULT (2026-11-15; `node tools/ship/takeEvadeSpeedFine.mjs held --write`, geometries 111001 to 111048 (96 duels an arm), flown ONCE, exit 0; record `brain/subEvadeSpeedFineHeld.json`: 24 arms, 19 steps, 4 spans)

Keith asked for it with the DEV flight ("fly DEV and then HELD once DEV is complete"); R0 held on DEV and no check failed. The void-checks passed on HELD too (none printed). Nothing in the rules, the arms or the forecasts was changed between DEV and HELD (Amendment A is dated before DEV).

**R0 holds on HELD.** T28 at league7001's speed (4.32): **+2.794**, z 18.0, 89-1-6, FINDS; ON at G's own speed (the GN arm): **+0.965**, z 4.6, 62-0-34, FINDS.

**Part A, the onset (turn 2.8), HELD with the DEV edge beside each:**

| speed (m/s) | HELD edge, z, w-d-l | DEV edge |
|---|---|---|
| 2.70 | +0.021 (11.8), 48-0-48 | +0.017 |
| 2.80 | +0.090 (1.3), 49-0-47 | +0.020 |
| 2.90 | +0.224 (2.0), 51-0-45 | +0.090 |
| 3.00 | +0.359 (2.5), 53-0-43 | +0.225 |
| 3.10 | **+0.626** (3.4), 57-0-39, F | +0.228 |
| 3.20 | **+0.563** (3.2), 56-0-40, F | **+0.563** F |
| 3.30 | **+0.829** (4.1), 60-0-36, F | **+0.566** F |
| 3.42 (G's) | **+0.965** (4.6), 62-0-34, F | **+0.967** F |

**RA1 ONSET: MID (3.10)** (DEV: MID, 3.20). **RA2 MONOTONE: yes** (a step of -0.063, z -1.0, at 3.20 over 3.10 is FLAT). **RA3 SHAPE: RAMP** (the rise +0.944, the largest step's rise +0.266, 0.28 of it; DEV +0.950 and 0.42). **RA4 BELOW G: yes.** **Slope of ON from 2.70 to G's speed: +1.31** edge points an m/s (DEV +1.32). Steps: UP at 3.10 over 3.00 (+0.266, z 2.1) and 3.30 over 3.20 (+0.266, z 2.1), the other five FLAT.

**Part B, the top at lower turns, HELD (DEV in brackets for the edge at the bound and the span):**

| turn | 3.80 | 4.10 | 4.32 | 4.50 | threshold | SPAN-TOP (4.5 over 4.1) |
|---|---|---|---|---|---|---|
| T23 (2.3) | +0.092 | +0.364 (z 2.7) | **+0.630** F | **+0.700** F (+0.637) | **4.32** (DEV 4.50) | **UP** +0.335, z 2.5 (DEV +0.470) |
| T25 (2.5) | **+0.663** F | **+1.068** F | **+1.797** F | **+2.193** F (+2.096) | **3.80** (DEV 4.10) | **UP** +1.122, z 5.1 (DEV +0.859) |
| T265 (2.65) | **+1.798** F | **+2.526** F | **+2.790** F | **+2.921** F (+3.024) | 3.80 (DEV 3.80) | **UP** +0.360, z 2.2 (DEV +0.525) |
| T28 (2.8) | **+2.163** F | **+2.730** F | **+2.794** F | **+2.962** F (+3.030) | 3.80 (DEV 3.80) | FLAT +0.073, z 0.5 (DEV +0.102) |

**RB1 THRESHOLD:** T23 4.32, T25 3.80, T265 3.80, T28 3.80. **RB2 THE TURN SETS THE THRESHOLD: yes.** **RB3** as in the table. **RB4 THE BOUND BINDS AT LOWER TURNS: YES (3 of 3 lower turns UP)**, as on DEV. **RB5 THE PLATEAU AT THE CEILING TURN: yes**, as on DEV. **B minus T28** at 3.80, 4.10, 4.32, 4.50: T23 -2.071 -2.366 -2.164 -2.262; T25 -1.501 -1.663 -0.998 -0.769; T265 -0.366 -0.204 -0.004 -0.041.

**Forecasts, scored** (my probability; outcome on the printed quantity of HELD; "calls" is the probability I gave to what happened):

| forecast | mine | outcome | calls |
|---|---|---|---|
| R0 holds on DEV | 88 | held | 88 |
| R0 holds on HELD | 86 | held | 86 |
| RA1: the onset is MID (3.0 to 3.2) | 50 | yes (3.10) | 50 |
| RA1: the onset is LOW (2.7 to 2.9) | 15 | no | 85 |
| RA1: the onset is HIGH (3.3 or G's) | 35 | no | 65 |
| RA2: ON is MONOTONE | 80 | yes | 80 |
| RA3: the shape is a RAMP | 65 | yes | 65 |
| RB2: the turn sets the speed threshold | 80 | yes | 80 |
| **RB4: the bound binds at lower turns** | **40** | **yes (3 of 3)** | **40** |
| RB5: the plateau at the ceiling turn | 85 | yes | 85 |
| the arm of T23 at the bound finds | 55 | yes (+0.700) | 55 |

**Ten of eleven went as the larger side said; the miss is the one I flagged as the question: RB4, the bound binding at lower turns (40), came out YES on both sets, 3 of 3 each time.** I leaned against it because the speed note's two sets had disagreed on the turn-2.5 span (UP on DEV, FLAT on HELD); with 48 geometries that span is **UP at z 4.2 and z 5.1 on the two sets** (+0.86, +1.12), so the earlier HELD FLAT (+0.463, z 1.8 on 24 geometries) was the noisy reading. MID at 50 was the most likely of three onset zones, and the near-coins (MID, RAMP at 65, T23 at the bound at 55) fell on the side I leaned to.

**What the two sets say together (post hoc, labelled as such: no rule reads two sets).**

1. **The onset of the speed is a ramp that begins near 2.7 to 2.8 and crosses the finding bar between 3.1 and 3.2.** The two sets' edges pooled are about +0.02 (2.7), +0.06 (2.8), +0.16 (2.9), +0.29 (3.0), +0.43 (3.1), +0.56 (3.2), +0.70 (3.3) and +0.97 (G's 3.42): a rise of +0.95 over 0.72 m/s, **a slope of +1.31 to +1.32 an m/s on each set**. HELD's curve sits about 0.1 m/s earlier than DEV's (the arms at 2.8, 2.9 and 3.0 on HELD have DEV's edges of the next speed up), and the staircase DEV showed (pairs of speeds with one edge) is not there on HELD; it is a feature of the set. **Neither set shows a JUMP**; the onset has no one place, and the 0.1 m/s grid cannot resolve the stair-steps (a few duels at a time, 48 to 62 of 96 on DEV).
2. **Below the ceiling turn the speed still pays up to the bound, on both sets:** 4.5 beats 4.1 head-to-head at 2.3, 2.5 and 2.65 on both (+0.47 and +0.34; +0.86 and +1.12; +0.53 and +0.36, each at z of 2.2 or more) and not at 2.8 (+0.10 and +0.07, pooled about +0.09, se about 0.11). **The finders' 4.3 to 4.5 reads as a clamp at the turns below 2.8 and a plateau at 2.8.** At turn 2.5 the gain over the last 0.4 m/s (+0.86, +1.12) is as large as the slope below it (about 2 an m/s). A reading that the bound binds there does not say how much a faster evade would pay: the arms of T265 and T28 are at the cap of the score against G (91-1-4 and 91-2-3), and only the head-to-head spans see past it.
3. **The turn sets where the speed starts to find:** thresholds 3.80, 3.80, 3.80 / 4.10, 4.50 (DEV) and 3.80, 3.80, 3.80 / 4.32 (HELD) for turns 2.8, 2.65 (2.5 on HELD) ... with 4.32 or 4.50 the first speed that finds at turn 2.3 on both sets, T25's one place earlier on HELD (3.80 against 4.10). The two sets agree to within a place on all four, which is more than the dose note's turn thresholds did (one step apart on every curve).
4. **A hypothesis this suggests and does not test:** league7100, the best finder in the mirror of `SUB_EVADE_OPPONENT_WIP.md`, has an evadeSpeed of exactly the bound (4.5) and an evadeTurn of 2.70, between T265 (where the bound binds) and T28 (where it does not); league7001 (4.32, 2.8) is the one it beat on both sets. Nothing here is a head-to-head of those two, and their other ten numbers differ; it is a reason to read G with each pair of (speed, turn) head-to-head, not a finding.
5. **Not a coincidence worth checking, but one worth saying:** G's own speed arm (ON at 3.42) has the same record on the two sets (62-0-34, +0.967 and +0.965) and the arm at 3.20 too (56-0-40, +0.563 on both): the two sets have different seat edges (+1.42 and +2.11 for the arm at 3.42) and different records at the other speeds, so they are two sets, and equal win counts at two of the eight points, at a standard error of 0.2, are chance.

**What is NOT shown:** a mechanism; whether the clamp at turns below 2.8 means a doctrine with a faster evade than 4.5 would win (nothing above 4.5 can be flown here: `THETA_BOUNDS` is a shared file this note does not edit); a speed below 2.7, the time (G's), a turn but 2.3, 2.5, 2.65 and 2.8, or anything against an opponent but G.
