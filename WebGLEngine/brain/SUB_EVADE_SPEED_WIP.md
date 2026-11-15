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
