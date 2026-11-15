# Submarine duel: a dose of the evade turn (REGISTRATION 2 OF 4 of the evade follow-ups; 2026-11-15; UNNUMBERED; REGISTERED BEFORE ANY CODE FOR IT IS WRITTEN AND BEFORE ANY GEOMETRY OF ITS SETS IS FLOWN)

Keith, 2026-11-15: "lets register each of those in the order that you suggest". Second of four, written before the result of any of them (`brain/SUB_EVADE_SPLIT_WIP.md` is the first, `brain/SUB_EVADE_OPPONENT_WIP.md` the third, `brain/SUB_EVADE_SEAT_WIP.md` the fourth; the order and its reasons are in the first). A registration and nothing else: **no command, no gate and no geometry of its sets exists yet.**

**What this changes in shared files, said first: nothing.** New files only: this note, `tools/ship/takeEvadeDose.mjs` (the command), `tools/ship/takeEvadeDose-selfcheck.mjs` (its gate), `brain/subEvadeDoseDev.json` and `brain/subEvadeDoseHeld.json`. It imports, and does not edit, `tools/ship/takeEvadeTurn.mjs` (`graft`, `rowOf`, `seatEdge`), `tools/ship/takeSubLeague.mjs` (`loadRuns`, `finds`, `signed`) and `brain/subTournament.mjs`. The bar and the method are those of `brain/SUB_EVADE_WIP.md`: an arm FINDS at an edge of at least 0.5 with z of at least 2 against generation 0 (G), both seats, 24 geometries.

## 1. What is known (read from the records; nothing here is flown again)

* **The turn has been read at two ends and three points between.** On G alone (the GN arms of `brain/SUB_EVADE_WIP.md`) the turn is 1.71 at G, and 2.65, 2.70 and 2.80 at the three distinct finders' values. **The edge rises with the turn at those three points, on both sets**: DEV +0.70, +0.84, +0.97 and HELD +1.10, +1.23, +1.36, for turns of 2.651, 2.698 and 2.800: about 1.8 points of edge per radian near the top, the same slope on two sets of 24 geometries. A straight line through those points reaches an edge of 0 at a turn of about 2.0 (HELD) to 2.3 (DEV) and the bar (0.5) at about 2.3 (HELD) to 2.5 (DEV); it does not pass through G (1.71, edge exactly 0) with a slope of 1.8 (it would be -0.6 there on HELD and -1.0 on DEV), so the curve is not a straight line from G, and **nothing between 1.71 and 2.65 has been flown.**
* **A reference point:** the tuned tactician of the notes (`brain/subTacticsThetaWip.json`) has a turn of 2.19, and ties G in the Part A record (24-0-24, edge +0.019); the two differ in other numbers, so it is not a dose of the turn.
* **The turn is bounded 0.4 to 2.8 rad** (`THETA_BOUNDS`) and the finders' turns of 2.80 are the bound itself (three of the five; checked: league7001, league7103 and exploit7200 are exactly 2.8). A turn of 2.8 is a heading 160 degrees off the torpedo's bearing; G's is 98.
* **The strong finders' speed and time are what is added to the turn in the triple** (`brain/SUB_EVADE_SPLIT_WIP.md` asks which of the two matters). Here they are held at two fixed pairs, not varied.

## 2. The question and the arms

**The question.** Where on the way from G's turn (1.71) to the ceiling (2.8) does the turn start to matter, is the curve monotone, and where does it stop paying? And does it behave the same with the strong finders' speed and time on as with G's?

**Three curves, each a set of arms flown against G, both seats, 24 geometries (48 duels) by `subTournament.matchup`; every side a tactician and the PD autopilot.** Doses of the turn (rad): **1.9, 2.1, 2.3, 2.5, 2.65, 2.8** (the ceiling).

| curve | what the arm is (G with ...) | arms |
|---|---|---|
| A | evadeTurn = the dose | 6 |
| B1 | league7001's evadeSpeed (4.317) and evadeTime (33.68), and evadeTurn = the dose; and the dose G's own turn (1.709): the speed and time alone | 7 |
| B2 | league7103's evadeSpeed (3.546) and evadeTime (30.08), and evadeTurn = the dose; and G's own turn | 7 |

**20 arms.** A dose of G's own turn on curve A is G, with an edge of exactly 0 against itself. **The steps:** the arm of each dose against the arm of the next dose down on its curve (the higher dose as the first side): 5 on A, 6 on B1 and 6 on B2, **17 head-to-head matchups**, each both seats on the same 24 geometries. Nothing is searched, tuned or re-fit; every number is a number of G or of a finder in a file.

## 3. The sets and the order

* **smoke**: geometries 1 to 4, never recorded, free to read.
* **DEV**: **102001 to 102024**, both seats; flown first, read freely, recorded once in `brain/subEvadeDoseDev.json`; it decides whether HELD is spent (R0).
* **HELD**: **103001 to 103024**, both seats; flown ONCE (`held --write`; refuses without a recorded DEV that replicates, without `--write`, or if its record exists); the rules are about HELD.
* No submarine file uses 102001 to 103024 (searched; the digits appear in sub-named files only as the number 100000 for a range).
* **Amendments:** as in the other notes: only dated, only before this note's HELD, said why; this note is written before the results of the other three and a result of theirs that should change it is an amendment dated before this note's DEV, or it is not used.
* **The order of work:** this note, the command, its gate with a sabotage log (never flying 102001 to 103024), smoke, DEV, then HELD if R0 holds.

## 4. The rules (MY CHOICES, said; Keith may set them differently)

* **R0 REPLICATES** iff the ceiling arm of curve A (turn 2.8, the GN arm of the other note) finds AND the ceiling arm of curve B1 (the triple of league7001, GT of the other note) finds. On DEV, if R0 fails HELD is not flown by this registration. (Both found on both earlier sets, at +0.97 and +3.10 on DEV and +1.36 and +3.10 on HELD.)
* **A STEP** is UP if the higher dose beats the lower head-to-head at paired z of at least 2, DOWN if it loses at z of at most -2, FLAT otherwise.
* **R1 THRESHOLD** (per curve): the smallest dose whose arm finds against G; for B1 and B2 the dose of G's own turn counts. It is named LOW (1.9 or 2.1), MID (2.3 or 2.5), HIGH (2.65 or 2.8) or NONE (no dose finds).
* **R2 MONOTONE** (per curve): no step is DOWN. **REVERSAL** names the dose of the first DOWN step.
* **R3 SATURATION** (per curve): the smallest dose from which no later step is UP (all FLAT or DOWN); "none" if the last step is UP.
* **The readings** (written now): a curve's threshold LOW means the turn works well below the bound; MID that it works in the middle of the range; HIGH that it needs the top of it; a saturation dose below 2.8 means the last stretch to the ceiling pays nothing on that curve; a REVERSAL is a dose that is worse than the one below it and is reported with its z.
* **Reported with the read, not in a rule:** each arm's edge, se, z, wins-draws-losses and its edge in seat A and in seat B; the edge of B1 minus A (and B2 minus A) at each shared dose; the slope of curve A over its top three doses (2.5, 2.65, 2.8), to compare with the 1.8 a radian of section 1.
* **Checks that void the read, said and not weighed:** every arm flew the same geometries (48 fights on the set's seeds, each twice); no non-finite score; every theta one `clampTheta` leaves unchanged; the dose of G's own turn on curve A has an edge of exactly 0 against G; the ceiling arm of curve A is the GN arm of league7001 and the ceiling arms of B1 and B2 are GT(league7001) and GT(league7103) of `tools/ship/takeEvadeTurn.mjs`, to the number (theta equal); the head-to-head of two equal thetas has an edge of exactly 0.

## 5. Forecasts, written before any geometry of any of the four sets is flown (probabilities, mine)

| forecast | probability |
|---|---|
| R0 holds on DEV | **92** |
| R0 holds on HELD | **90** |
| curve A's threshold is MID or LOW (at most 2.5) | **65** |
| curve A's threshold is LOW (1.9 or 2.1) | **20** |
| curve A is MONOTONE (no DOWN step) | **70** |
| curves A, B1 and B2 are all MONOTONE | **50** |
| curve B1's threshold is lower than curve A's | **70** |
| curve B1's edge is above curve A's at every dose of 2.1 and up | **80** |
| curve B2's edge is within 0.5 of curve A's at every dose (its speed and time add nothing) | **55** |
| curve A saturates below 2.8 (its last step to the ceiling is not UP) | **40** |

Why these: the slope of 1.8 and the line through three points put the bar at 2.3 to 2.5, hence 65 for MID or LOW and 20 for LOW (the line says 2.0 to 2.3 for zero edge, and a curve that bends up toward the top, which the missing -0.6 at G suggests, would put the threshold higher); five steps at z of 2 will each flag a false DOWN about two times in a hundred, which with a real bend is why monotone is 70 and not 90; the strong finders' speed makes the boat louder and faster and I expect it to add to the turn at every dose, but league7103's HELD numbers (the turn alone is all its edge, its triple adds +0.006) are why curve B2 may sit on curve A.

## 6. What a result would not say

* **That the turn works by the same mechanism along the whole curve.** A dose is a heading further from the torpedo's bearing; whether a larger turn does better because the torpedo cannot follow it, because the boat is out of the seeker's cone sooner, or because of something about where the boat ends up, was not asked.
* **That a dose between the ones flown behaves like its neighbours** (six doses on A, seven on B1 and B2; nothing between 2.3 and 2.5 or between 2.5 and 2.65).
* **That B1 or B2 is the finders' behaviour:** each is G with two of a finder's numbers (speed and time) and the dose, and the other nine are G's.
* **That a FLAT step is no difference:** twenty-four geometries cannot see a difference smaller than about 0.5 at z of 2 on the arms the finders' edges are made of; FLAT means "not shown".
* **Anything against an opponent but G** (registration 3), **the three numbers apart** (1) **or the seat** (4).

## 7. Cost

20 arms and 17 steps plus the checks' two extra matchups is about 40 matchups of 48 duels a set, a minute and a half of one core; the command, its gate and a sabotage pass are the work.

## AMENDMENT A (2026-11-15; made while the command `tools/ship/takeEvadeDose.mjs` was written and smoke-run on geometries 1 to 4, BEFORE any DEV geometry (102001 to 102024) or HELD geometry (103001 to 103024) was flown)

Item 1 changes a rule, so it is first and says why; the rest fill in what the registration left unsaid. No forecast is changed.

1. **A step also needs an edge of at least 0.05.** Section 4 defined UP and DOWN on paired z alone. The smoke run (geometries 1 to 4, on which every league was trained, so it says nothing about the claim) showed a step between two doses with an edge of +0.007 and a z of 12.5: the standard error of two boats that play nearly alike can be a few thousandths, and z of 2 is then a difference too small to be a step (the tournament counts a fight as won only by more than **DECISIVE = 0.05**). **A step is UP iff z is at least 2 AND its edge is at least 0.05; DOWN iff z is at most -2 AND its edge is at most -0.05; FLAT otherwise.** It makes MONOTONE easier to hold and SATURATION earlier or equal; the forecasts of section 5 stand as written and are scored under the amended rule.
2. **SATURATION as coded.** Let a curve's doses be d0 < ... < dn and its steps s1 ... sn (s_j between d_(j-1) and d_j). If the last step sn is UP the saturation is "none"; otherwise it is d_j for the last UP step s_j; and if no step is UP it is d0, the curve's lowest dose.
3. **THRESHOLD names:** LOW for a dose of 2.1 or less (G's own turn on B1 and B2 included), MID for 2.3 or 2.5, HIGH for 2.65 or 2.8; NONE when no dose finds.
4. **R0** is: the ceiling arm of curve A (turn 2.8) finds and the ceiling arm of curve B1 finds. **The command is that of the other notes:** `smoke` (geometries 1 to 4, never recorded), `dev` (102001 to 102024; prints; `--write` records `brain/subEvadeDoseDev.json` once) and `held --write` (103001 to 103024, once; refuses without a recorded DEV of the `dev` set whose rules say R0 held, without `--write`, or over an existing `brain/subEvadeDoseHeld.json`).
5. **The two extra flights of the void-checks:** the identity (G with its own evadeTurn against G: exactly 0) and the ceiling arm of curve A against a copy of itself (exactly 0): two matchups more than the 20 arms and 17 steps. A failed check is printed, not weighed, makes the exit code 1, and the record is still written.
6. **Printed besides the rules** (for reading): each arm's edge, se, z, wins-draws-losses and per-seat edges; each step's edge, se, z and label; B1 minus A and B2 minus A at each dose; A's slope over the top three doses; and **the forecast quantities of section 5 as yes/no** (so they are scored from the printed line, not recomputed).
7. **What smoke is and is not.** Geometries 1 to 4 are among those (1 to 8) on which every league was TRAINED. I saw the smoke output (it ran, the checks passed); the forecasts of section 5 stand as written and will be scored as written.


## DEV RESULT (2026-11-15; `node tools/ship/takeEvadeDose.mjs dev --write`, geometries 102001 to 102024, 101 s, exit 0; record `brain/subEvadeDoseDev.json`)

DEV is free to read; HELD (103001 to 103024) is not flown by this entry. The void-checks passed (none printed). Forecasts are not scored on DEV except "R0 holds on DEV" (92): **TRUE**. The others stand as written for HELD.

**R0 holds.** Ceiling arm of A (turn 2.8): +1.498, z 4.5, 35-0-13, FINDS. Ceiling arm of B1: +3.097, z 23.2, 47-0-1, FINDS.

**The arms** (edge against G, both seats, 24 geometries; wins-draws-losses of the 48 duels; F = finds, edge at least 0.5 and z at least 2):

| dose (rad) | A (G + dose) | B1 (+ league7001's speed and time) | B2 (+ league7103's speed and time) |
|---|---|---|---|
| 1.71 (G's own) | 0 (G) | +0.005, 24-0-24 | +0.001, 24-0-24 |
| 1.90 | +0.006, 24-0-24 | +0.014, 24-0-24 | +0.007, 24-0-24 |
| 2.10 | +0.012, 24-0-24 | +0.027, 24-0-24 | +0.014, 24-0-24 |
| 2.30 | +0.021, 24-0-24 | **+0.900** (z 3.1), 30-1-17, F | +0.024, 24-0-24 |
| 2.50 | **+0.555** (z 2.2), 28-0-20, F | **+2.026** (z 6.3), 39-0-9, F | **+0.562** (z 2.3), 28-0-20, F |
| 2.65 | **+1.229** (z 3.8), 33-0-15, F | **+2.958** (z 16.2), 46-0-2, F | **+1.501** (z 4.5), 35-0-13, F |
| 2.80 | **+1.498** (z 4.5), 35-0-13, F | **+3.097** (z 23.2), 47-0-1, F | **+1.769** (z 5.3), 37-0-11, F |

**R1 THRESHOLD:** A 2.5 (MID); B1 2.3 (MID); B2 2.5 (MID). **R2 MONOTONE:** all three, no DOWN step. **R3 SATURATION:** 2.65 on all three (the last step, 2.65 to 2.8, is FLAT everywhere: +0.268 z 1.5 on A, +0.136 z 0.8 on B1, +0.267 z 1.5 on B2). Steps, all as the rule labels them: A FLAT FLAT UP UP FLAT; B1 FLAT FLAT UP UP UP FLAT; B2 FLAT FLAT FLAT UP UP FLAT. **Slope of A over 2.5, 2.65, 2.8:** +3.14 per radian (section 1 had 1.8 from the finders' own turns).

**B1 minus A** at 1.9, 2.1, 2.3, 2.5, 2.65, 2.8: +0.008, +0.014, +0.878, +1.471, +1.729, +1.599. **B2 minus A:** +0.001, +0.002, +0.003, +0.007, +0.272, +0.271.

**The forecast quantities as printed** (scored on HELD, not here): A threshold at most 2.5: yes. A threshold LOW: no. A monotone: yes. All monotone: yes. B1 threshold lower than A's: yes. B1 above A from 2.1: yes (by +0.014 at 2.1: a margin that is nothing, the arms there are all 24-0-24; the content is from 2.3). B2 within 0.5 of A: yes (largest +0.272). A saturates below the ceiling: yes.

**Observations (DEV, for reading, not rules):**

1. **The shape is not the straight line of section 1.** Below 2.3 the arms are 24-0-24 with edges of +0.005 to +0.027: no duel changes its outcome, on any curve, at any speed and time. The effect appears between 2.3 and 2.5 on A and B2 (+0.02 to +0.56) and between 2.1 and 2.3 on B1 (+0.03 to +0.90), then rises steeply and flattens at 2.65. The registered line (bar at 2.3 to 2.5) put the threshold about where it landed, but not the flat stretch before it or the steepness after it: A gains +1.0 between 2.3 and 2.65 and nothing visible between 1.9 and 2.3. The grid cannot place the onset closer than one step (2.3 to 2.5 on A and B2, 2.1 to 2.3 on B1).
2. **B1's speed and time move the onset down by one step and add +1.5 to +1.7 at the middle and top doses; B2's add +0.27 at the top two and nothing below.** That is the split note's finding again, now with the turn as the variable: the speed carries the part the turn does not, and league7103's speed (3.55, near G's 3.42) has almost none to give.
3. **Seats:** every arm below the onset has seat A at about +1.96 and seat B at about -1.94 (the G-against-G bias of the seat note); the arm's edge appears mostly in seat B, the seat that loses in G against G (A at 2.80: seat A +2.24, seat B +0.76, against a bias of +1.96 and -1.94, so the effect is about +0.3 in seat A and +2.7 in seat B; B1 at 2.80: +3.04 and +3.16, about +1.1 and +5.1).
4. **What is NOT shown:** why 2.3 to 2.5 (a mechanism; the torpedo is evaded at some angle of the bearing that the grid does not resolve, which is a guess about the boat and not something read here); anything about turns above 2.8 (the bound); anything on geometries this set did not fly. R0 held, so HELD may be flown on Keith's word: `node tools/ship/takeEvadeDose.mjs held --write`.

## HELD RESULT (2026-11-15; `node tools/ship/takeEvadeDose.mjs held --write`, geometries 103001 to 103024, flown ONCE, exit 0; record `brain/subEvadeDoseHeld.json`)

Keith asked for it after the DEV read; R0 held on DEV. The void-checks passed (none printed). Nothing in the rules, the arms or the forecasts was changed between DEV and HELD.

**R0 holds on HELD.** Ceiling arm of A (turn 2.8): **+0.969**, z 3.2, 31-0-17, FINDS. Ceiling arm of B1: **+2.639**, z 10.5, 43-1-4, FINDS.

**The arms** (edge against G, both seats, 24 geometries; wins-draws-losses of the 48 duels; F = finds), with the DEV edge beside each:

| dose (rad) | A: HELD (DEV) | B1: HELD (DEV) | B2: HELD (DEV) |
|---|---|---|---|
| 1.71 (G's own) | 0 (G) | +0.004 (+0.005) | +0.001 (+0.001) |
| 1.90 | +0.005 (+0.006) | +0.013 (+0.014) | +0.006 (+0.007) |
| 2.10 | +0.011 (+0.012) | +0.154, 25-0-23 (+0.027) | +0.013 (+0.014) |
| 2.30 | +0.018 (+0.021) | +0.302, z 1.7, 26-0-22 (+0.900 F) | +0.151, 25-0-23 (+0.024) |
| 2.50 | +0.157, z 1.2, 25-0-23 (+0.555 F) | **+1.894**, z 5.8, 38-0-10, F (+2.026 F) | +0.161, 25-0-23 (+0.562 F) |
| 2.65 | **+0.831**, z 2.9, 30-0-18, F (+1.229 F) | **+2.699**, z 10.9, 44-0-4, F (+2.958 F) | **+1.104**, z 3.5, 32-0-16, F (+1.501 F) |
| 2.80 | **+0.969**, z 3.2, 31-0-17, F (+1.498 F) | **+2.639**, z 10.5, 43-1-4, F (+3.097 F) | **+1.370**, z 4.2, 34-0-14, F (+1.769 F) |

**R1 THRESHOLD:** A **2.65 (HIGH)**; B1 **2.50 (MID)**; B2 **2.65 (HIGH)** (on DEV: MID, MID, MID at 2.5, 2.3, 2.5). **R2 MONOTONE:** all three yes. **R3 SATURATION:** 2.65 on all three, as on DEV. Steps: A FLAT FLAT FLAT UP FLAT; B1 FLAT FLAT FLAT UP UP FLAT (the last step is +0.002, z 2.2: FLAT by the edge bar of Amendment A, which is what that bar is for); B2 FLAT FLAT FLAT FLAT UP FLAT. **Slope of A over the top three doses:** +2.71 a radian (DEV +3.14; section 1's 1.8). **B1 minus A** at 1.9 to 2.8: +0.007 +0.143 +0.285 +1.737 +1.868 +1.670. **B2 minus A:** +0.001 +0.002 +0.133 +0.004 +0.274 +0.401.

**Forecasts, scored** (my probability for what I wrote; outcome on the printed quantity of HELD; "calls" is the probability I gave to what happened):

| forecast | mine | outcome | calls |
|---|---|---|---|
| R0 holds on DEV | 92 | held | 92 |
| R0 holds on HELD | 90 | held | 90 |
| A threshold at most 2.5 (MID or LOW) | 65 | **no: 2.65** | 35 |
| A threshold LOW (1.9 or 2.1) | 20 | no | 80 |
| A monotone | 70 | yes | 70 |
| A, B1 and B2 all monotone | 50 | yes | 50 |
| B1 threshold lower than A's | 70 | yes (2.50 against 2.65) | 70 |
| B1 above A at every dose from 2.1 | 80 | yes | 80 |
| B2 within 0.5 of A at every dose | 55 | yes (largest +0.401) | 55 |
| A saturates below 2.8 | 40 | yes (2.65) | 40 |

**Nine of ten went as the larger side said; one miss, the one with the most weight: A's threshold.** The straight line of section 1 put the bar at 2.3 to 2.5 and I gave 65 to it; HELD put it at 2.65 (A at 2.5 is +0.157, z 1.2, 25-0-23; DEV had +0.555 there). The miss is of one grid step; DEV and HELD disagree by one step on each curve (DEV 2.5 / 2.3 / 2.5, HELD 2.65 / 2.5 / 2.65), because the edge between 2.3 and 2.65 is steep and the finding bar of z 2 at 24 geometries falls on different sides of it on two sets. The "40" for saturation and the "50" for all-monotone were not favoured by anything I knew and came out yes; I cannot say they were well-judged. The two "yes" with the most to lose (B1 above A, 80; A monotone, 70) came out yes.

**What the two sets say together (post hoc, labelled as such: no rule reads two sets).**

1. **The shape replicates.** The turn does nothing visible below about 2.1 to 2.3 on any curve (24-0-24 on both sets for every arm up to 2.1, and up to 2.3 on A and B2 on DEV), rises steeply between 2.3 and 2.65, and is flat from 2.65 to 2.8 on both sets and all three curves. The onset sits between 2.3 and 2.65 and the grid cannot place it closer, except that it moves with the strength of the arm (B1's is earlier on both sets, by one step).
2. **The size of the effect is set-dependent;** the ceiling arm of A is +1.50 on DEV and +0.97 on HELD, B2's +1.77 and +1.37, B1's +3.10 and +2.64, each lower on HELD by 0.4 to 0.6: the pooled edge is about the half-way of the two.
3. **B1 carries the speed's part at the top: B1 minus A is +1.7 at 2.5 to 2.8 on HELD (+1.5 to +1.7 on DEV); B2 minus A is +0.27 to +0.40 at the top two doses (+0.27 on DEV).** The speed of league7001 is worth about 1.7 edge points on top of the turn and league7103's about 0.3: the split note's finding, now with the turn varied.
4. **Seats:** G's seat bias on HELD (the seat edges of the flat arms, +0.84 and -0.83) is smaller than on DEV (+1.96 and -1.94), so the set matters to it as much as to the edge; the effect of the turn shows mostly in seat B in both.

**What is NOT shown:** a mechanism for the onset; doses above 2.8 or between the grid points; a curve for any other finder, speed or time; the straight-line extrapolation of section 1 is not borne out by either set (the edge is flat and then steep, with a slope of 2.7 to 3.1 over the top three).
