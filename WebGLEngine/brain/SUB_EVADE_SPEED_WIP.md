# Submarine duel: a dose of the evade SPEED (REGISTRATION 5 OF 5 of the evade reads; 2026-11-15; UNNUMBERED; REGISTERED BEFORE ANY CODE FOR IT IS WRITTEN AND BEFORE ANY GEOMETRY OF ITS SETS IS FLOWN)

Keith, 2026-11-15: "register the graduated speed follow-up". It is the first of the candidates left by `brain/BACKLOG_2026-11-01.md` section E1 ("a graduated speed, the dose's twin; the one number whose size is unread"), written after the four follow-ups of `brain/SUB_EVADE_WIP.md` were all read (`SUB_EVADE_SPLIT_WIP.md`, `SUB_EVADE_DOSE_WIP.md`, `SUB_EVADE_OPPONENT_WIP.md`, `SUB_EVADE_SEAT_WIP.md`), so it is the twin of `SUB_EVADE_DOSE_WIP.md` and is written with that note's amendments built in. A registration and nothing else: **no command, no gate and no geometry of its sets exists yet.**

**What this changes in shared files, said first: nothing.** New files only: this note, `tools/ship/takeEvadeSpeed.mjs` (the command), `tools/ship/takeEvadeSpeed-selfcheck.mjs` (its gate), `brain/subEvadeSpeedDev.json` and `brain/subEvadeSpeedHeld.json`. It imports, and does not edit, `tools/ship/takeEvadeTurn.mjs` (`graft`, `rowOf`, `seatEdge`), `tools/ship/takeEvadeDose.mjs` (`stepLabel`, the step and saturation rules), `tools/ship/takeEvadeSplit.mjs` (the cells whose thetas the identity checks compare to), `tools/ship/takeSubLeague.mjs` (`loadRuns`, `finds`, `signed`) and `brain/subTournament.mjs`. The bar and the method are those of `brain/SUB_EVADE_WIP.md`: an arm FINDS at an edge of at least 0.5 with z of at least 2 against generation 0 (G), both seats, 24 geometries.

## 1. What is known (read from the records; nothing here is flown again)

* **The speed has only been read at the finders' own values, and only as a part of the cells.** `brain/SUB_EVADE_SPLIT_WIP.md` (DEV 100001, HELD 101001): **the speed alone does nothing** (S is +0.00 to +0.01 for all five finders on both sets, a boat with the finder's speed and G's other eleven numbers is G to the second decimal), **time alone does nothing, speed with time does nothing**; with the turn on the speed adds **+1.8 to +2.1 on HELD** (the turn alone, N, is +0.69 to +0.83; speed with the turn, SN, +2.63 to +2.76 for the four strong finders; shares of the finders' own edge 1.01 to 1.12); the time added to speed and turn changes nothing (share 1.07 to 1.06). The exception is league7103, whose speed (3.55) is near G's (3.42): its SN is +1.03 against its N of +0.83.
* **The speed does not move on its own.** The finders' speeds are 4.32 (league7001), 4.50 (league7100), 3.55 (league7103), 4.42 (exploit7200), 4.35 (exploit7204); G's is 3.418. **The bound is 4.5** (`THETA_BOUNDS.evadeSpeed` is 0.5 to 4.5 m/s): league7100's value is the bound itself (4.5 exactly, read from the file) and the other three strong finders' (4.32, 4.35, 4.42) are within 0.2 of it. Whether the strong finders' speeds are where the gain stops or where the search was clamped is not read.
* **Nothing has been flown with an evade speed below G's, nor between 3.55 and 4.32 on a graft, nor with the turn at any value but G's own, 2.65 and 2.80 on the speed-carrying arms.** (`SUB_EVADE_DOSE_WIP.md`'s curves B1 and B2 put a finder's speed AND time with the dose of the turn; they are not a dose of the speed.)
* **What the speed does in the duel** (read from `brain/subTactics.mjs` and `brain/subDuel.mjs`): when a torpedo is heard the boat holds `evadeTurn` radians off its bearing for `evadeTime` seconds at `evadeSpeed`, and does not fire or ping while it does. Speed costs noise (a faster boat is louder) and nothing else in these arms (no battery: `sub-duel-energy-cost` is off). So a slower evade is quieter and a faster one louder; which of the two the seeker minds more is not known from the records.
* **The turn's curve** (`SUB_EVADE_DOSE_WIP.md`): nothing visible below about 2.1 to 2.3, onset between 2.3 and 2.65, flat from 2.65 to 2.8; with a finder's speed and time on, the onset is one grid step earlier and the top is about 1.7 higher (league7001) or 0.3 higher (league7103).

## 2. The question and the arms

**The question.** With the turn held at one value, how does the edge over G depend on the evade speed from 2.0 to the bound 4.5: does the speed ever work without the turn (the gate), where does it start to pay, is it monotone, and does it stop paying before the bound or not (is the finders' 4.3 to 4.5 a result or a clamp)?

**Three curves, each a set of arms flown against G, both seats, 24 geometries (48 duels) by `subTournament.matchup`; every side a tactician and the PD autopilot. In every arm every number is G's except the speed and the turn: the time, in particular, stays G's (36.87 s), because it was inert wherever it was read.** The speed doses (m/s), **eight: 2.0, 2.7, G's own 3.418, league7103's 3.546, 3.8, 4.1, league7001's 4.317 and the bound 4.5** (the three named values are read from the files, not typed; the five others are the registration's own numbers, chosen to be spread between G's and the bound with two below G's).

| curve | the turn (evadeTurn) in every arm of it | what it asks | arms |
|---|---|---|---|
| T0 | G's own (1.709) | the speed alone, over the whole range: the gate | 8 |
| T25 | 2.5 | the speed at the onset of the turn (`SUB_EVADE_DOSE_WIP.md`: on the edge of finding with G's speed, finding with a finder's) | 8 |
| T28 | 2.8, the ceiling | the speed with the turn at its top | 8 |

**24 arms.** The dose of G's own speed on T0 is G, with an edge of exactly 0 against itself. **The steps:** the arm of each dose against the arm of the next dose down on its curve (the higher speed as the first side): 7 a curve, 21. **The spans:** on each curve the arm of 4.5 against the arm of G's own 3.418 (SPAN-LOW) and against the arm of 4.1 (SPAN-TOP): 6 head-to-head matchups more. **27 head-to-head matchups.** Nothing is searched, tuned or re-fit; every number is a number of G, of a finder in a file, or one of the registration's five.

## 3. The sets and the order

* **smoke**: geometries 1 to 4, never recorded, free to read.
* **DEV**: **108001 to 108024**, both seats; flown first, read freely, recorded once in `brain/subEvadeSpeedDev.json`; it decides whether HELD is spent (R0).
* **HELD**: **109001 to 109024**, both seats; flown ONCE (`held --write`; refuses without a recorded DEV that replicates, without `--write`, or if its record exists); the rules are about HELD.
* No submarine file uses 108001 to 109024 as a geometry (searched as whole numbers in the `.mjs` and `.md` files under `brain` and `tools`: none; the digits appear in numeric data only). The sets 98001 to 107024 are spent.
* **Amendments:** as in the other notes: only dated, only before this note's HELD, said why; a result of the earlier notes that should change this one is an amendment dated before this note's DEV, or it is not used. (The one amendment made after any data in the earlier notes, `SUB_EVADE_SEAT_WIP.md` Amendment C, was to a check that compared a measured figure to an earlier figure with a tolerance narrower than the standard error of the comparison. **This note has no such check: every void-check below is an identity or a file's own number.**)
* **The order of work:** this note, the command, its gate with a sabotage log (never flying 108001 to 109024), smoke, DEV, then HELD if R0 holds.

## 4. The rules (MY CHOICES, said; Keith may set them differently)

* **R0 REPLICATES** iff, on the set read, the arm of T28 at league7001's speed (4.317; it is SN of league7001, `SUB_EVADE_SPLIT_WIP.md`) FINDS and the arm of T28 at G's own speed (the GN arm of `SUB_EVADE_WIP.md`) FINDS. On DEV, if R0 fails HELD is not flown by this registration. (Both found on every earlier set they were flown on: SN of league7001 +2.69 on the split's DEV and +2.63 on its HELD; GN, the arm of turn 2.8 on G, in the six reads that flew it, +0.97 and +1.36 (evade-turn DEV and HELD), +1.50 and +0.83 (split DEV and HELD, league7001's N cell), +1.50 and +0.97 (dose DEV and HELD, the ceiling arm of A). The weakest of the six is +0.83, z 2.9, so the second half of R0 is the likelier to fail.)
* **A STEP or a SPAN is UP** if the first side beats the second head-to-head at paired z of at least 2 **and an edge of at least 0.05** (the dose note's Amendment A, built in: the tournament counts a fight as won only by more than DECISIVE = 0.05); **DOWN** if z is at most -2 and the edge at most -0.05; **FLAT** otherwise. **A SPAN-LOW is UP only at an edge of at least 0.5** (z of at least 2) and DOWN only at -0.5 and z of at most -2: a bar for "the speed matters", the size of the finding bar, and otherwise FLAT.
* **R1 THRESHOLD** (per curve): the smallest speed whose arm finds against G. It is named **BELOW G** (2.0 or 2.7), **AT G** (3.418 or 3.546), **MID** (3.8 or 4.1), **HIGH** (4.317 or 4.5), or **NONE** (no arm finds).
* **R2 MONOTONE** (per curve): no step is DOWN. **REVERSAL** names the speed of the first DOWN step (counting up from 2.0).
* **R3 SATURATION** (per curve), as coded in the dose note: with the curve's speeds d0 < ... < d7 and its steps s1 ... s7 (s_j between d_(j-1) and d_j), "none" if the last step s7 is UP; otherwise d_j for the last UP step s_j; and if no step is UP the curve's lowest speed d0.
* **R4 THE TURN IS THE GATE** iff on T0 no arm finds (0 of 7 non-G arms). **LOSES** (reported, not a rule): an arm with an edge of at most -0.5 and z of at most -2.
* **R5 THE SPEED MATTERS** (per curve): SPAN-LOW is UP. **R6 THE BOUND BINDS** (per curve): SPAN-TOP is UP (the arm at 4.5 beats the arm at 4.1: a faster evade than the search could set would pay).
* **The readings** (written now): a threshold BELOW G or AT G means the speed pays from where G is; MID or HIGH that it pays only above G's; NONE that it never finds on that curve. A saturation below 4.5 means the last stretch to the bound pays nothing at the grid's resolution; "none" that the curve is still rising at the bound. R6 true on T28 reads as: the finders' speeds of 4.3 to 4.5 are at a clamp and not at an optimum (and nothing is claimed about what is above 4.5, which cannot be flown without changing `THETA_BOUNDS`, a shared file that this note does not edit). A REVERSAL is a speed that is worse than the next one down and is reported with its z.
* **Reported with the read, not in a rule:** each arm's edge, se, z, wins-draws-losses and its edge in seat A and in seat B; each step's and span's edge, se, z and label; the edge of T25 minus T0 and of T28 minus T0 at each speed; the slope of T28 between G's own speed and 4.317 (to compare with the split's +1.8 to +2.1 over a speed difference of 0.9 m/s); and **the forecast quantities of section 5 as yes/no** (so they are scored from the printed line, not recomputed).
* **Checks that void the read, said and not weighed. Every one is an identity or a file's own number:** every arm flew the same geometries (48 fights on the set's seeds, each twice); no non-finite score; every theta one `clampTheta` leaves unchanged; the dose of G's own speed on T0 has an edge of exactly 0 against G; the arm of T28 at 4.317 has the theta of SN of league7001 of `tools/ship/takeEvadeSplit.mjs`, to the number; the arm of T28 at 3.546 has the theta of SN of league7103; the arm of T28 at G's own speed has the theta of GN of `tools/ship/takeEvadeTurn.mjs`; the head-to-head of two equal thetas (the arm of T28 at 4.5 against a copy of itself) has an edge of exactly 0; the three named speeds and G's evadeTime are the files' (read, not typed).

## 5. Forecasts, written before any geometry of any of the two sets is flown (probabilities, mine)

| forecast | probability |
|---|---|
| R0 holds on DEV | **87** |
| R0 holds on HELD | **85** |
| R4: the turn is the gate (no arm of T0 finds) | **80** |
| R5 on T28: the speed matters (SPAN-LOW is UP) | **92** |
| R5 on T25: the speed matters (SPAN-LOW is UP) | **88** |
| R5 on T0 is not UP (4.5 does not beat G's speed by 0.5 on the turn-off curve) | **92** |
| T28's threshold is AT G or lower on the speed axis, i.e. no slower arm finds and G's own speed does (its threshold is exactly 3.418) | **70** |
| T25's threshold is higher than T28's | **60** |
| T28 is MONOTONE (no DOWN step) | **75** |
| T0, T25 and T28 are all MONOTONE | **55** |
| R6 on T28: the bound binds (SPAN-TOP is UP) | **40** |
| the arm of T28 at league7103's speed 3.546 is within 0.5 of the arm of T28 at G's speed (its speed adds nothing) | **85** |

Why these: the split puts the speed's part at +1.8 to +2.1 over 0.9 m/s of speed with the turn on (about 2 points an m/s), which makes the span from 3.418 to 4.5 about +2 at the ceiling turn and 92 for "matters"; the turn alone at 2.5 sits on the bar for G's speed (+0.16 on HELD, +0.56 on DEV in the dose note), and a finder's speed lifts it to +1.9 to +2.0, so 88 there and a threshold that is higher than at the ceiling turn is a likelier outcome than an equal one (60); the split's speed-alone cells were +0.00 to +0.01 at 3.55 to 4.50, so the gate holds across the range I have seen and the doses I have not seen (2.0 and 2.7, a slower and quieter evade) are why it is 80 and not 92; the arm at 2.0 or 2.7 with the full turn is unlikely to beat G's own speed (70, not more, because the quiet could pay); a head-to-head at the top has the size 0.18 m/s times about 2 an m/s, a third of a point at an se that is a few tenths, so SPAN-TOP is a coin that I lean against (40), which is the interesting number, because it is the clamp question; five steps at z of 2 each flag a false DOWN about two times in a hundred, and the three curves together seven times that, hence 75 and 55; league7103's 3.546 is 0.13 m/s above G's, which at 2 an m/s is about 0.26 and the split put its SN 0.20 above its N.

## 6. What a result would not say

* **That the speed acts through the noise it makes.** The speed costs noise in the duel; whether a faster evade does better because it opens the range, or a slower one because it is quieter, is not asked, and the events (`fire`, `hit`) are not read.
* **Anything above 4.5, or any dose of the time** (it is G's throughout; it was inert at the finders' values 27.8 to 33.7 s and nothing was read at 5 s or 40 s), **or any turn but G's own, 2.5 and 2.8** (three turns; the dose note has the curve of the turn).
* **That a speed between the ones flown behaves like its neighbours** (eight speeds, three curves).
* **That the finders' speeds are the finders' behaviour:** every arm is G with a speed and a turn, and the other ten numbers are G's.
* **That a FLAT step is no difference:** twenty-four geometries cannot see a difference smaller than about 0.5 at z of 2 on the arms the finders' edges are made of; FLAT means "not shown".
* **Anything against an opponent but G** (`SUB_EVADE_OPPONENT_WIP.md` reads the finders against three others), **or the seat** (`SUB_EVADE_SEAT_WIP.md`; the seat bias of G itself varied from +1.68 to +3.37 across sets, so no edge here is read as a seat claim).
* **That the effective number of independent arms is 24:** the arms of a curve share one set of geometries, so their edges move together with the set (the dose note found a one-step difference in every threshold between its two sets), and a threshold is read on one set.

## 7. Cost

24 arms and 27 head-to-head matchups plus the checks' two extra matchups is about 53 matchups of 48 duels a set, two to three minutes of one core; the command, its gate and a sabotage pass are the work.

## AMENDMENT A (2026-11-15; made while the command `tools/ship/takeEvadeSpeed.mjs` was written and smoke-run on geometries 1 to 4, BEFORE any DEV geometry (108001 to 108024) or HELD geometry (109001 to 109024) was flown)

Item 1 changes the HELD gate of the command, so it is first and says why; items 2 to 8 fill in what the registration left unsaid. No rule's bar, no arm, no forecast is changed.

1. **The command's HELD gate also refuses a DEV record whose `checks` is not an empty list (or that records none).** Section 4 says a failed check voids the read; the seat command's HELD gate read R0 only and printed "HELD may be flown" over a void read, which I had to retract in words (`SUB_EVADE_SEAT_WIP.md`, DEV RESULT). This command refuses instead: `held --write` after a DEV with a failed check exits 2 with "DEV has a failed check (or records none), so its read is void", and the DEV run itself prints "DEV: a check FAILED, the read is void; HELD is NOT flown by this registration" in place of the R0 line. A void DEV is then a decision for Keith (an amendment dated before HELD, as in the seat note), not something the command lets through.
2. **Names and ids.** An arm's id is CURVE@speed to two decimals (G's own 3.418 prints 3.42, league7103's 3.546 3.55, league7001's 4.317 4.32); the code compares speeds as numbers, never as the printed text. A step's id is CURVE:hi>lo, a span's CURVE:span-low or CURVE:span-top.
3. **Thresholds are read by the arm's place in the eight speeds** (0 and 1 BELOW G, 2 and 3 AT G, 4 and 5 MID, 6 and 7 HIGH), the same names as section 4's table; "T25's threshold is higher than T28's" compares places, and a curve with no finding arm counts as above every place.
4. **R4 counts the seven arms of T0 other than the one at G's own speed** (that arm is G, with an edge of exactly 0 and cannot find); it prints the count and the arms that find. LOSES is printed from every curve's arms.
5. **R3 SATURATION as coded**, the dose note's Amendment A item 2: with the curve's speeds d0 < ... < d7 and its steps s1 ... s7 (s_j between d_(j-1) and d_j), "none" if s7 is UP; otherwise d_j for the last UP step s_j; and the lowest speed d0 if no step is UP. A STEP's label is the dose command's `stepLabel` (the same function, imported).
6. **The slope of T28 is two-point, not least-squares:** the edge of T28 at league7001's speed less the edge at G's, over the difference of the two speeds (0.899 m/s on the files), because that is what the split's "+1.8 to +2.1 over 0.9 m/s" is a number of. It is printed, not a rule.
7. **The checks as coded, in this order** (every one an identity or a file's own number, as section 4 asks): every arm, step and span flew the set's geometries (each seed twice); no non-finite score; every theta one `clampTheta` leaves unchanged; every run's generation 0 is G; **the arm of T0 at G's own speed has an edge of exactly 0 against G (it is G; there is no separate identity flight)**; the arm of T28 at 4.5 against a copy of itself has an edge of exactly 0; the arms of T28 at league7001's speed, at league7103's and at G's own are SN of league7001 and SN of league7103 (`takeEvadeSplit.mjs`) and GN of league7001 (`takeEvadeTurn.mjs`), the same theta to the number; the speeds are the files' (G's, league7103's, league7001's, the bound) in the places 2, 3, 6 and 7; the speeds are strictly increasing; every number of every arm but the speed and the turn is G's, the time included. A failed check is printed, not weighed, makes the exit code 1, and the record is still written.
8. **Printed besides the rules** (for reading): each arm's edge, se, z, wins-draws-losses and per-seat edges; each step's and span's edge, se, z and label; the edge of T25 and of T28 less T0's at each speed; the slope; and the forecast quantities of section 5 as yes/no, by the names in the printed line (`the turn is the gate`, `T28 speed matters`, `T25 speed matters`, `T0 speed matters not`, `T28 threshold is G's speed`, `T25 threshold above T28's`, `T28 monotone`, `all monotone`, `T28 bound binds`, `league7103's speed within 0.5 of G's`; "R0 holds" is the DEV line and the R0 line).
9. **What smoke is and is not.** Geometries 1 to 4 are among those (1 to 8) on which every league was TRAINED, so a smoke read says nothing about the claims, and the arms' edges at 8 duels are too coarse to read. I saw the smoke report (the command ran; no check failed); the forecasts of section 5 stand as written.

## DEV RESULT (2026-11-15; `node tools/ship/takeEvadeSpeed.mjs dev --write`, geometries 108001 to 108024, exit 0; record `brain/subEvadeSpeedDev.json`: 24 arms, 21 steps, 6 spans)

DEV is free to read; HELD (109001 to 109024) is not flown by this entry. The void-checks passed (none printed; the HELD gate of Amendment A item 1 would accept this record). Forecasts are not scored on DEV except "R0 holds on DEV" (87): **TRUE**. The others stand as written for HELD.

**R0 holds.** T28 at league7001's speed (4.32): **+3.096**, z 23.3, 47-0-1, FINDS; T28 at G's own speed (the GN arm): **+1.104**, z 3.5, 32-0-16, FINDS.

**The arms** (edge against G, both seats, 24 geometries; wins-draws-losses of the 48 duels; F = finds):

| speed (m/s) | T0 (G's own turn) | T25 (turn 2.5) | T28 (turn 2.8) |
|---|---|---|---|
| 2.00 | -0.004, 24-0-24 | +0.004, 24-0-24 | +0.008, 24-0-24 |
| 2.70 | -0.003, 24-0-24 | +0.013, 24-0-24 | +0.020, 24-0-24 |
| 3.42 (G's) | 0 (G) | +0.160, z 1.2, 25-0-23 | **+1.104**, z 3.5, 32-0-16, F |
| 3.55 (league7103's) | +0.001, 24-0-24 | +0.162, z 1.2, 25-0-23 | **+1.504**, z 4.5, 35-0-13, F |
| 3.80 | +0.002, 24-0-24 | **+0.698**, z 2.6, 29-0-19, F | **+2.301**, z 7.6, 41-0-7, F |
| 4.10 | +0.003, 24-0-24 | **+1.501**, z 4.5, 35-0-13, F | **+2.832**, z 12.9, 45-0-3, F |
| 4.32 (league7001's) | +0.005, 24-0-24 | **+1.897**, z 5.8, 38-0-10, F | **+3.096**, z 23.3, 47-0-1, F |
| 4.50 (the bound) | +0.005, 24-0-24 | **+2.294**, z 7.6, 41-0-7, F | **+3.094**, z 23.3, 47-0-1, F |

**R1 THRESHOLD:** T0 NONE; T25 **MID (3.80)**; T28 **AT G (3.42)**. **R2 MONOTONE:** T0 yes, T25 yes, **T28 no (reversal at 4.50)**: the step of 4.50 over 4.32 is **-0.379**, z -2.8, DOWN. **R3 SATURATION:** T0 2.00 (no step UP), **T25 none** (the last step, 4.50 over 4.32, is UP: +0.457, z 2.1), **T28 4.10** (its last UP step is 4.10 over 3.80). **R4 THE TURN IS THE GATE: yes**, 0 of 7 non-G arms of T0 find (every T0 arm is 24-0-24, -0.004 to +0.005). **R5 THE SPEED MATTERS** (4.5 over G's speed): T0 FLAT (+0.005), **T25 UP** (+2.132, z 6.9), **T28 UP** (+1.981, z 6.1). **R6 THE BOUND BINDS** (4.5 over 4.1): T0 FLAT, **T25 UP** (+0.790, z 2.8), **T28 FLAT** (+0.195, z 0.9). LOSES: none (no arm at -0.5 and z -2). **T minus T0** at the eight speeds: T25 +0.009 +0.015 +0.160 +0.162 +0.697 +1.497 +1.893 +2.289; T28 +0.012 +0.022 +1.104 +1.504 +2.299 +2.829 +3.092 +3.089. **T28 slope between G's speed and league7001's:** **+2.22** edge points an m/s (the split's +1.8 to +2.1 over 0.9 m/s is the same measure on the finders' own sets).

Steps on T28: FLAT, UP (+1.085), FLAT (+0.399, z 1.8), UP (+0.795), UP (+0.530), FLAT (+0.262), **DOWN (-0.379)**; on T25: FLAT, FLAT, FLAT, UP (+0.536), UP (+0.801), FLAT (+0.333, z 1.4), UP (+0.457).

**The forecast quantities as printed** (scored on HELD, not here): the turn is the gate yes; T28 speed matters yes; T25 speed matters yes; T0 speed matters not yes; T28 threshold is G's speed yes; T25 threshold above T28's yes; **T28 monotone NO**; **all monotone NO**; T28 bound binds no; league7103's speed within 0.5 of G's yes (+0.40 at z 1.8: the step of 3.55 over 3.42 is FLAT, and not nothing).

**Observations (DEV, for reading, not rules):**

1. **The turn gate holds across the whole speed range, and the speed has a gate of its own.** With G's own turn no speed from 2.0 to 4.5 does anything (all 24-0-24, to the third decimal). With the turn at 2.8 a slow evade does nothing either: at 2.0 and 2.7 the arm is G (+0.008, +0.020, 24-0-24), and the edge appears between 2.7 and G's 3.42 (+1.104). Neither number does anything without the other; this grid has no speed between 2.7 and 3.42, so where the speed's own onset lies is not resolved.
2. **The turn at 2.5 is where the speed matters most:** T25 at G's own speed is +0.160 (z 1.2, not finding, as the dose note's A@2.5 on HELD) and at 4.5 it is +2.294; the speed turns a turn that does not find into one that finds by 3.80, and T25 is still rising at the bound (R3 none, R6 UP: the one place on this set where a faster evade than the search could set would pay).
3. **At the ceiling turn the curve stops at 4.32 to 4.5** (+3.096 and +3.094, both 47-0-1) and the step from 4.32 to 4.50 is **DOWN** at -0.379 (z -2.8): league7001's speed beats the bound head-to-head while the two score the same against G. **Said before it is over-read:** these arms win 47 of 48 duels against G, so the edge against G is near the ceiling of the score (seat A +3.02 here, and the seat-A edge reached +3.38 against the hand tactician in the opponent note); a saturation against G at that height is a property of the measure as much as of the speed, and the head-to-head DOWN is one step at z -2.8 among 21, on one set.
4. **The speed's size, at the ceiling turn, matches the split:** T28 at 4.32 less T28 at 3.42 is +1.99 over 0.90 m/s (+2.22 an m/s); league7103's 3.55 adds +0.40 (z 1.8) over G's speed, the split's +0.20 on HELD in the same direction and not nothing.
5. **G's seat bias on this set** (the seat edges of the flat arms, +1.40 and -1.40) is smaller than on the earlier DEV sets (+1.96) and larger than HELD's of the dose (+0.84), as the seat note found for G across sets.

**What is NOT shown:** a mechanism; any HELD read; a speed between 2.7 and 3.42, or above 4.5 (the bound; the finders' 4.3 to 4.5 cannot be shown to be a clamp or an optimum at T28 by this set, and at T25 the curve is still rising at 4.5); a time or a turn but these three. R0 held, so HELD may be flown on Keith's word: `node tools/ship/takeEvadeSpeed.mjs held --write`.

## HELD RESULT (2026-11-15; `node tools/ship/takeEvadeSpeed.mjs held --write`, geometries 109001 to 109024, flown ONCE, exit 0; record `brain/subEvadeSpeedHeld.json`: 24 arms, 21 steps, 6 spans)

Keith asked for it after the DEV read; R0 held on DEV and no check failed. The void-checks passed on HELD too (none printed). Nothing in the rules, the arms or the forecasts was changed between DEV and HELD (Amendment A is dated before DEV).

**R0 holds on HELD.** T28 at league7001's speed (4.32): **+3.027**, z 20.8, 46-1-1, FINDS; T28 at G's own speed (the GN arm): **+1.764**, z 5.3, 37-0-11, FINDS.

**The arms** (edge against G, both seats, 24 geometries; wins-draws-losses of the 48 duels; F = finds), with the DEV edge beside each:

| speed (m/s) | T0: HELD (DEV) | T25: HELD (DEV) | T28: HELD (DEV) |
|---|---|---|---|
| 2.00 | -0.005, 24-0-24 (-0.004) | +0.005, 24-0-24 (+0.004) | +0.009, 24-0-24 (+0.008) |
| 2.70 | -0.003, 24-0-24 (-0.003) | +0.014, 24-0-24 (+0.013) | +0.288, z 1.6, 26-0-22 (+0.020, 24-0-24) |
| 3.42 (G's) | 0 (G) | +0.294, z 1.6, 26-0-22 (+0.160) | **+1.764**, z 5.3, 37-0-11, F (+1.104 F) |
| 3.55 (league7103's) | +0.001 (+0.001) | +0.429, z 2.0, 27-0-21 (+0.162) | **+2.029**, z 6.3, 39-0-9, F (+1.504 F) |
| 3.80 | +0.002 (+0.002) | **+0.963**, z 3.2, 31-0-17, F (+0.698 F) | **+2.295**, z 7.6, 41-0-7, F (+2.301 F) |
| 4.10 | +0.003 (+0.003) | **+1.758**, z 5.3, 37-0-11, F (+1.501 F) | **+2.897**, z 15.2, 45-1-2, F (+2.832 F) |
| 4.32 (league7001's) | +0.005 (+0.005) | **+2.155**, z 6.9, 40-0-8, F (+1.897 F) | **+3.027**, z 20.8, 46-1-1, F (+3.096 F) |
| 4.50 (the bound) | +0.005 (+0.005) | **+2.223**, z 7.5, 40-1-7, F (+2.294 F) | **+3.025**, z 20.9, 46-1-1, F (+3.094 F) |

**R1 THRESHOLD:** T0 NONE; T25 **MID (3.80)**; T28 **AT G (3.42)** (on DEV: the same three). **R2 MONOTONE:** all three yes (on DEV T28 was not: its 4.50 over 4.32 was DOWN at -0.379; on HELD that step is **-0.065**, z -1.0, FLAT). **R3 SATURATION:** T0 2.00; T25 **4.10** (DEV: none); T28 **4.10** (DEV: 4.10). **R4 THE TURN IS THE GATE: yes**, 0 of 7 non-G arms of T0 find (all 24-0-24, -0.005 to +0.005). **R5 THE SPEED MATTERS** (4.5 over G's speed): T0 FLAT, T25 UP (+1.927, z 5.7), T28 UP (+1.193, z 3.3). **R6 THE BOUND BINDS** (4.5 over 4.1): T0 FLAT, **T25 FLAT (+0.463, z 1.8; DEV UP)**, T28 FLAT (-0.062, z -0.4; DEV +0.195). LOSES: none. **T minus T0** at the eight speeds: T25 +0.010 +0.017 +0.294 +0.428 +0.961 +1.755 +2.151 +2.218; T28 +0.014 +0.290 +1.764 +2.029 +2.293 +2.893 +3.022 +3.020. **T28 slope between G's speed and league7001's:** **+1.41** edge points an m/s (DEV +2.22; the split's +1.8 to +2.1).

Steps on T28: FLAT (+0.279, z 1.5), UP (+1.477), FLAT, FLAT, UP (+0.601), FLAT, FLAT (-0.065); on T25: FLAT, FLAT, FLAT, UP (+0.534), UP (+0.794), FLAT (+0.396, z 1.8), FLAT (+0.067).

**Forecasts, scored** (my probability; outcome on the printed quantity of HELD; "calls" is the probability I gave to what happened):

| forecast | mine | outcome | calls |
|---|---|---|---|
| R0 holds on DEV | 87 | held | 87 |
| R0 holds on HELD | 85 | held | 85 |
| R4: the turn is the gate (no arm of T0 finds) | 80 | yes | 80 |
| R5 on T28: the speed matters | 92 | yes (+1.193, z 3.3) | 92 |
| R5 on T25: the speed matters | 88 | yes (+1.927, z 5.7) | 88 |
| R5 on T0 is not UP | 92 | yes (+0.005) | 92 |
| T28's threshold is G's speed exactly (3.418) | 70 | yes | 70 |
| T25's threshold is higher than T28's | 60 | yes (3.80 against 3.42) | 60 |
| T28 is MONOTONE | 75 | yes | 75 |
| T0, T25 and T28 are all MONOTONE | 55 | yes | 55 |
| R6 on T28: the bound binds (SPAN-TOP UP) | 40 | no | 60 |
| the arm at league7103's speed 3.546 within 0.5 of the arm at G's speed (T28) | 85 | yes (+0.265) | 85 |

**All twelve went as the larger side said, and that is a thing about my priors and not a triumph:** the four near-coins (T25's threshold above T28's at 60, all-monotone at 55, the bound binding at 40, T28 monotone at 75) are the informative ones, and each fell on the side I leaned to; but two of them (T28 monotone and all-monotone) had printed NO on DEV, and the DEV DOWN step that said so (4.50 below 4.32 at z -2.8) did **not** replicate (-0.065 on HELD). A false DOWN is about 2 in 100 a step under the registered rule, so about 13 in 100 over a curve's seven steps; the DEV step was either one of those or a small real effect that HELD does not show, and HELD says FLAT.

**What the two sets say together (post hoc, labelled as such: no rule reads two sets).**

1. **The turn gate replicates exactly and the speed has a gate of its own.** With G's own turn no speed from 2.0 to 4.5 does anything on either set (all 24-0-24). With the turn at 2.8 an evade at 2.0 does nothing (+0.008, +0.009) and the edge appears between 2.7 and G's 3.42: at 2.7 it is +0.020 (DEV) and +0.288 (HELD, z 1.6, not finding), at 3.42 it is +1.104 and +1.764. **Neither number works without the other**; no speed between 2.7 and 3.42 was flown, so the onset of the speed is not located closer than that.
2. **The speed's curve at the ceiling turn rises from G's speed to about 4.1 and is flat above it.** T28's steps: 4.10 over 3.80 UP on both sets (+0.530, +0.601); 4.32 over 4.10 FLAT on both (+0.262, +0.066); 4.50 over 4.32 DOWN on DEV (-0.379) and FLAT on HELD (-0.065). The head-to-head of 4.5 over 4.1 (SPAN-TOP, not capped by the score the way an edge against G is) is +0.195 (se 0.218) and -0.062 (se 0.175): pooled about **+0.07, se about 0.14**, where the slope below 4.1 (+1.4 to +2.2 an m/s) would give +0.6 to +0.9 over those 0.4 m/s. So **the slope above 4.1 is near zero on this evidence, and it is not the arms' ceiling against G that says so** (the head-to-head is free of it). The finders' speeds of 4.3 to 4.5 (league7100's is the bound itself) therefore look like a plateau and not a clamp **at the ceiling turn**; a bound of 4.5 does not bind there on either set (R6 FLAT twice). I do not say the same for a lower turn: **T25 is the other way on the two sets** (R6 UP on DEV +0.790, FLAT on HELD +0.463; saturation none on DEV and 4.10 on HELD), and it is the curve where a faster evade than the search could set might still pay.
3. **The speed's size is set-dependent, as the turn's was.** T28 at G's speed (the GN arm) is +1.104 (DEV) and +1.764 (HELD), against +0.83 to +1.50 in the earlier sets (evade-turn, split, dose); at league7001's speed it is +3.096 and +3.027 (the split's SN: +2.69 and +2.63). So the speed adds +1.99 over 0.90 m/s on DEV and +1.26 on HELD (slopes +2.22 and +1.41), against the split's +1.8 to +2.1 on its HELD; it is the turn alone that moved most between sets, and the finders' speed lifts every set to about +3.0.
4. **league7103's speed (3.55) is worth about +0.3**: +0.399 (DEV, z 1.8) and +0.265 (HELD, z 1.4), the split's +0.20: in the same direction on all three sets, never at the bar. It is consistent with "its speed is near G's and adds little" and not with "adds nothing".
5. **No arm of the 24 on either set loses to G**; the largest negative edge on any arm is -0.005 (a slow evade with G's own turn).

**What is NOT shown:** a mechanism (a faster boat is louder; nothing was read from events); a speed between 2.7 and 3.42 (the onset of the speed) or above 4.5 (the bound); the time (G's throughout) or a turn but 1.709, 2.5 and 2.8; whether T25 (and a lower turn) stays rising at the bound (the two sets disagree); anything against an opponent but G (`SUB_EVADE_OPPONENT_WIP.md`) or the seat.
