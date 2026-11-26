# SPACE APPROACH DOCTRINE: does a fighter that caps its closing speed beat today's full-throttle approach? (backlog space-approach-doctrine; Keith 2026-11-19, "1, with 3 alongside as a small side task. Take 2 also."; REGISTERED 2026-11-19 BEFORE ANY CODE FOR IT AND BEFORE ANY OF ITS REGISTERED SEEDS IS FLOWN)

**What is already known, said first.** This round confirms a lead and splits it by gunner. It is not an open question under the weak presets.
* brain/SPACE_ITEMS_2026-11-18.md opened the lead from prototypes on space seeds 1601-1800 (never committed): the capped approach won 46 of 48.
* The design survey for this note flew throwaway space seeds 9990001-9990005 (in no set):
  * Under the regular and green presets, today's doctrine never killed the ship. Capped at 15 or 8, the ship died in 22-38 s in every regular and green fight flown.
  * Damage per fighter-strafe-second was about 4 under the doctrine and 32-44 capped (about 9x).
  * Under perfect and ace, the ship won every fight in both arms, and the damage was 0 in 15 of 16.
  * Peak closing speed: 31.5 under the doctrine; 15.5-16.0 under cap 15; 9.4-10.2 under cap 8.
* **So CAP BETTER under regular and green is expected (E1, E2 below).** The round earns its keep through the per-preset split (is it the doctrine, or the gunners?) and the mechanism readings.

**The question.** Today's fighters fly the PD autopilot (brain/autopilot6dof.mjs AP.decide) with the hand doctrine in brain/spaceArena.mjs fighterAim:
* APPROACH: full thrust at a point 60 units to one side of the ship.
* STRAFE: inside 220 units and closing, nose on the lead point with the thrust cut.

There is no braking anywhere, so a fighter arrives at about 31 u/s and passes through the gunners' envelope in about a second. **Does a fighter that holds its closing speed under a cap do more to the capital ship, under each gunner preset?**

## THE ARMS (nothing in spaceArena.mjs or battleshipFight.mjs is edited)

Both arms use brain/battleshipFight.mjs build(seed, kind, {gunners, pilot}), with:
* 8 fighters, the ship's default behaviour (face the nearest foe, cruise at 0.3 thrust);
* 120 s;
* no other options.

**D, today's doctrine:** build(seed, kind, {gunners}) with no pilot, so every fighter flies AP.decide.

**C, capped:** the same build, with `pilot` = a wrapper around AP.decide. With `arena` bound after build, at every call:
1. d = AP.decide(body, target, opts);
2. c = the craft whose body is `body` (arena.crafts.find(x => x.body === body)); spaceArena calls the pilot with c.body before it replaces the bodies;
3. foe = SA.nearestFoe(arena, c), the same call the arena makes;
4. closing = -dot(foe.pos - body.pos, foe.vel - body.vel) / |foe.pos - body.pos|, the closing speed to the foe's CENTRE, in every mode;
5. return {...d, thrust: 0} when closing >= CAP; otherwise d.

Torque and firing are untouched. CAP comes from DEV (below).

## GUNNER CONDITIONS (named now)
* **Verdict-bearing:** perfect, ace, regular, green, exactly as battleshipFight.mjs GUNNERS.
* **Reported, moving nothing:** green sight plus the shipped MLP seat network (brain/seatGunnerMlpWeightsDefault.json, as `network`). It was trained at 40 s against today's doctrine (tools/ship/trainSeatGunner.mjs).

## SETS (space seeds: inputs to battleshipFight.scenario's own generator, Mulberry32 of seed*7+3)
* **DEV = space seeds 1901-1930 x the four kinds (bow, beam, stern, swarm) = 120 scenarios.** Fresh, never prototyped.
* **HELD89 = space seeds 2401-2460 x the four kinds = 240 scenarios a condition, FLOWN ONCE.** The results file is written the moment it exists, and the tool refuses a second flight.
* Already spent and NOT reused:
  * space seeds 1-40 (gates);
  * 1, 2, 11, 12 and 21-23 (gunner training);
  * 1601-1800 (prototypes);
  * 9990001-9990005 (this note's smoke).
* The numbers 1901-1930 and 2401-2460 appear as seeds of other generators (gaugeClip dives, the sensed-nav sets). Those are different scenario families and do not clash, as brain/NAV_PLUS_WIP.md said of HELD87.

## DEV FIXES THE CAP, AND NOTHING ELSE
* Grid: CAP in {6, 9, 12, 15, 20, 25} u/s.
* Fly D and every cap on DEV under the four verdict-bearing presets.
* **CAP = the grid value with the highest mean R over all 4 x 120 DEV scenarios. Ties go to the LARGER cap** (closer to today's doctrine).
* CAP is written into this note and committed before any HELD89 seed is flown. DEV gives no verdict.

## ENDPOINTS, per scenario and arm
* **PRIMARY, R:**
  * R = damageOnShip if the ship survives (tally's damage, capped at 1,500);
  * R = 1500 + (120 - tKill) if the ship is destroyed, with tKill = the tally's t.
  * Higher is better for the fighters. It orders time-to-kill and damage in one score with no ceiling. It is ordinal and used only by the sign test.
* Reported, moving nothing:
  * **DPSS**, damage per fighter-strafe-second. Strafe seconds = ticks with a live fighter whose c.last.mode is "strafe", divided by 30. Paired medians, over the scenarios with strafe seconds > 0 in both arms.
  * **Fighter losses** (killed + rammed), with the gained and lost counts and a sign test. This is the cost side; it is confounded by fight length, because a fight that ends when the ship dies leaves fighters alive.
  * Ship win, loss and draw counts.
  * The ship's damage per round fired (hitsDealt / seatRounds). **CORRECTED 2026-11-19, BEFORE DEV (a procedural fix, which the registration allows only before DEV):** this line first read "the gunners' hit rate (hitsDealt / 18 / seatRounds)". hitsDealt counts DAMAGE, and the ship's rounds deal 60 (main), 10 (point defence) or 400 (wave); 18 is the FIGHTER gun's damage. The ratio is reported as damage per round, which moves nothing.
  * Strafe passes, fighter-seconds alive, and the peak closing speed.

## THE TEST
* The tree's paired exact two-sided sign test (tools/ship/subGiveWayStudy.mjs signTest), paired by (seed, kind) within a preset.
* A pair is a TIE iff |R_C - R_D| < 1e-9. Ties are dropped from the sign test, counted and printed, and kept in the median of R_C - R_D.

## THE VERDICT, per verdict-bearing preset
* **FLOOR, NOT WEIGHED** iff fewer than 20 of the 240 pairs are discordant.
* else **CAP BETTER** iff C wins more pairs than it loses, the sign p <= 0.05, and the median of R_C - R_D > 0;
* else **DOCTRINE BETTER** iff the mirror image holds;
* else **NO DIFFERENCE SHOWN**.

**A CONSEQUENCE OF THE RULE, STATED 2026-11-19 BEFORE DEV (not a change).** Ties stay in the median, so CAP BETTER needs the median of R_C - R_D over ALL 240 pairs above 0, i.e. more than half of all pairs in C's favour, not just most of the discordant ones. A preset with, say, 30 wins, 5 losses and 205 ties clears the sign test (p about 2e-5) and still reads NO DIFFERENCE SHOWN. The gate drives exactly that case. This matters under perfect and ace, where most pairs are expected to tie at 0 damage.

## OVERALL
* **SUPPORTED** iff CAP BETTER under BOTH regular (the default) and green (the sight the networks were trained for), and DOCTRINE BETTER under none.
* **PARTLY SUPPORTED** iff CAP BETTER under at least one preset and DOCTRINE BETTER under none.
* **NOT SUPPORTED** otherwise.
* **HARMFUL** is printed beside the verdict iff DOCTRINE BETTER under any preset.

The per-preset table answers "doctrine or gunners". A cap effect only under the weak presets, with a floor under perfect and ace, says the fast-fighter gunners are what matter.

## CHECKS (a failure means NOT WEIGHED; checks 1-4 and 6 run on DEV before HELD89)
1. **IDENTITY:** with CAP = Infinity, arm C's tally equals arm D's to the bit on DEV seeds 1901-1903, all kinds, all presets.
2. **SAME FOE:** on DEV, at every wrapper call, the wrapper's foe is the arena's nearest foe for that craft, and it is never null while the ship flies.
3. **THE CAP HOLDS:** on DEV at the chosen CAP, the peak closing speed to the ship's centre stays <= CAP + 2 in every C fight, while the doctrine's peak exceeds CAP + 5.
4. **THE OLD FIGHTS STAND:** the battleshipFight, spaceArena and battleshipPage gates pass unchanged.
5. **SAME SCENARIOS:** HELD89 holds exactly seeds 2401-2460 x 4 kinds, in both arms, under every preset.
6. **EVERY FIGHT ENDS** by 120 s.

**CLOSED AFTER DEV:** no amendment may then change the arms, the cap definition, the sets, R, the tie rule, the bars or the verdict rule. Procedural fixes are allowed only before DEV is flown.

## EXPECTATIONS (written before DEV)
* E1: regular CAP BETTER, about 95%.
* E2: green CAP BETTER, about 95%.
* E3: perfect FLOOR (not weighed), about 70%; otherwise NO DIFFERENCE SHOWN.
* E4: ace FLOOR or NO DIFFERENCE SHOWN, about 70%; CAP BETTER about 25%.
* E5: DOCTRINE BETTER under any preset, about 5%.
* E6: SUPPORTED, about 85%.
* E7: the chosen CAP is 9-15, about 70%.
* E8: green + MLP behaves like green (C kills the ship in at least 80% of its scenarios), about 85%.
* E9: arm C loses fewer fighters under regular and green, about 80%.

## WHAT A RESULT WOULD NOT SAY
* Nothing about the learned 6DOF pilots, escorts, or two ships.
* Nothing about the trained gunners as a verdict-bearing condition, or whether they would do better retrained against slow fighters.
* Nothing about which cap is best beyond the DEV grid.
* The presets are hand rules "chosen, not measured" (battleshipFight.mjs), so nothing about real gunners.

**Cost:** about 50 CPU minutes (DEV 3,360 fights, HELD89 1,920 plus 480 network fights). It parallelises by preset.

## DEV RESULT (2026-11-19, read once: `spaceDoctrineStudyCmd.mjs dev-read`; brain/rig-results/space-doctrine/dev-*.json and dev-report.json)

**CHECK 3 FAILED, SO THE ROUND IS NOT WEIGHED. HELD89 IS NOT FLOWN and stays unspent.**

* **CAP = 12**, by the registered rule (the highest mean R over 4 x 120 DEV scenarios). Mean R by cap: 6: 788.8; 9: 794.9; **12: 797.3**; 15: 791.4; 20: 563.0; 25: 196.3. Arm D: 92.0. E7 (a cap in 9-15) held.
* Check 1 IDENTITY: PASS (48 tallies, cap Infinity equal to no pilot to the bit).
* Check 2 SAME FOE: PASS (2,880 probed fights, 16,441,189 decisions, no mismatch, no null foe).
* **Check 3 THE CAP HOLDS: FAIL.** The capped peak closing speed was 14.05 against the bar CAP + 2 = 14 (one fight of 480: regular, space seed 1930, bow). The doctrine's peak was 33.43 (> 17, the other half, held).
* Check 6 EVERY FIGHT ENDS: PASS (3,360 fights).

**Why the bar failed: the premise behind it was wrong.** The survey said the smoke overshoot was at most 1.0 at caps 8 and 15. DEV measured the worst overshoot (peak minus CAP) per cap, with the number of fights over +2 out of 480:

| cap | worst overshoot | 95th percentile | fights over +2 |
|---|---|---|---|
| 6 | 3.98 | 3.29 | 226 |
| 9 | 3.02 | 2.40 | 100 |
| 12 | 2.05 | 1.77 | 1 |
| 15 | 1.64 | 1.31 | 0 |
| 20 | 0.77 | 0.65 | 0 |
| 25 | 0.30 | 0.23 | 0 |

The cap is a thrust CUT. A fighter swinging past the ship turns lateral speed into closing speed with the thrust already off, so the lower the cap, the larger the overshoot. The +2 bar came from too few smoke fights.

**What is NOT done, by the registration's own rule:**
* The bar is not widened (it is closed after DEV).
* The chosen cap is not swapped for 15, which would have passed.
* No verdict is drawn from DEV's means, which favour the capped arm by about 700 R at every cap from 6 to 15. DEV gives no verdict.

The lead stands where brain/SPACE_ITEMS_2026-11-18.md left it, now with a measured overshoot table. **A second registration is Keith's call.** It would need a cap check defined on what the wrapper controls: the thrust is zero at every decision where closing >= CAP, which holds by construction and can be counted exactly. HELD89 (space seeds 2401-2460) stays unspent for it.

## HELD89 RESULT
(not yet flown)

# ROUND 2: THE SAME QUESTION, WITH A CAP CHECK ON WHAT THE PILOT CONTROLS (Keith 2026-11-20, "1, with 3 alongside as a small side task, then 2"; REGISTERED 2026-11-20 BEFORE ANY CODE FOR IT AND BEFORE ANY OF ITS SEEDS IS FLOWN)

**Why a second round, said first.** Round 1 was NOT WEIGHED on one check: the capped peak closing speed reached 14.05 against a bar of CAP + 2 = 14 (one fight of 480). That bar measured the ARENA's speed, which the pilot does not control: the cap is a thrust CUT, so a fighter swinging past the ship turns lateral speed into closing speed with the thrust already off. Round 1's own rule forbade widening the bar, so this round replaces it with a check on what the pilot DOES control, and asks the question again on the unspent held set.

**What is already known, before this registration** (Round 1, read once, above):
- DEV (1901-1930) chose CAP 12 by its registered rule, before any check was read.
- Its means favour the capped arm by about 700 R at every cap from 6 to 15.
- The overshoot table: worst 2.05 at cap 12, 3.98 at cap 6.
- **So CAP BETTER under regular and green is again expected.** The round earns its keep through the per-preset split and a check that can be held exactly.

## WHAT CHANGES, AND ONLY THIS
1. **CAP = 12, TAKEN FROM ROUND 1's DEV.** It is not re-chosen. The choice was the registered rule's, made on DEV's means. The failed check was a bar on the arena, not on the choice.
2. **CHECK 3 IS REPLACED: THE CAP IS APPLIED.**
   - In every arm-C fight on DEV2, at every decision of a flying fighter whose closing speed to its nearest foe at the START of the tick is >= CAP, the thrust the ARENA RECORDED for that decision (c.last.thrust) is exactly 0.
   - It is counted from the arena's own record, outside the pilot wrapper. Pass iff such decisions exist (the cap is reached at all) and none of them carries thrust.
   - Its bite half is Round 1's, kept: the doctrine's peak closing speed on DEV2 exceeds CAP + 5 (the cap binds).
   - The overshoot (peak minus CAP) is REPORTED (worst and 95th percentile) and moves nothing.
3. **A NEW DEV FOR THE CHECKS ONLY: DEV2 = space seeds 2101-2130 x the four kinds = 120 scenarios**, fresh: no space file and no commit names them. Arm D and arm C at CAP 12 are flown under the four verdict-bearing presets. Checks 1 (identity, on 2101-2103), 2 (same foe), 3 (the cap is applied) and 6 (every fight ends) run on DEV2. **Nothing is chosen on DEV2 and it gives no verdict.**

## WHAT DOES NOT CHANGE (Round 1's text above holds, word for word)
- The arms and the wrapper (cappedPilot: thrust 0 when closing >= CAP, torque and firing untouched).
- **HELD89 = space seeds 2401-2460 x 4 kinds, flown ONCE**, unspent by Round 1.
- The presets, verdict-bearing and reported (green + MLP).
- R, the tie rule, the sign test, FLOOR under 20 discordant pairs, the median kept with ties (so CAP BETTER needs more than half of ALL pairs).
- The per-preset verdict, SUPPORTED / PARTLY / NOT SUPPORTED, and HARMFUL.
- Checks 4 (the old fights stand) and 5 (same scenarios).
- The reported readings, including the ship's damage per round.
- **CLOSED AFTER DEV2**, as Round 1 was after DEV.

## ORDER
1. DEV2 is flown and read once.
2. If any of checks 1, 2, 3 or 6 fails, the round is NOT WEIGHED and HELD89 stays unflown.
3. If all pass, CAP_CHOSEN = 12 is committed in tools/ship/spaceDoctrineStudy.mjs, with the DEV2 result in this note, BEFORE any HELD89 seed. Then HELD89 is flown once and read once.

## EXPECTATIONS (written before DEV2)
- Checks 1, 2, 3 and 6 all pass: about 90%. Check 3 holds by construction; the risk is the measurement, not the pilot.
- Round 1's bar would have failed again on DEV2 (worst overshoot at cap 12 above 2): about 35%.
- E1 regular CAP BETTER: about 95%.
- E2 green CAP BETTER: about 95%.
- E3 perfect FLOOR: about 70%.
- E4 ace FLOOR or NO DIFFERENCE SHOWN: about 70%.
- E5 DOCTRINE BETTER under any preset: about 5%.
- E6 SUPPORTED: about 85%.
- E8 green + MLP: C kills the ship in at least 80% of scenarios, about 85%.
- E9 arm C loses fewer fighters under regular and green: about 80%.

**Cost:** DEV2 is 120 x 4 x 2 = 960 fights, about 8 CPU minutes. HELD89 is 1,920 fights plus 480 network fights, about 25 CPU minutes.

## ROUND 2, DEV2 RESULT (2026-11-20, read once: `spaceDoctrineStudyCmd.mjs dev2-read`; brain/rig-results/space-doctrine/dev2-*.json and dev2-report.json)

**ALL FOUR CHECKS PASS. CAP_CHOSEN = 12 is committed with this result, before any HELD89 seed.**

* Check 1 IDENTITY: PASS. 48 tallies at cap Infinity equal no pilot, to the bit.
* Check 2 SAME FOE: PASS. 480 probed fights, 2,199,352 decisions, no mismatch.
* **Check 3 THE CAP IS APPLIED: PASS.** 1,414,431 decisions at or over 12, and the arena recorded thrust at none of them. The doctrine's peak was 33.52 (> 17).
* Check 6 EVERY FIGHT ENDS: PASS (960 fights).
* Reported, moving nothing: overshoot worst 2.03, 95th percentile 1.73. **3 of 480 fights were over +2, so Round 1's bar would have failed again** (expected about 35%). Mean R: D 90.4, C 796.9 (DEV gives no verdict).

## ROUND 2, HELD89 RESULT (2026-11-20, read once: `spaceDoctrineStudyCmd.mjs held-read`; the five result files committed UNREAD first; brain/rig-results/space-doctrine/held-report.json)

**OVERALL: SUPPORTED.** CAP BETTER under regular and under green, and DOCTRINE BETTER under none. Checks 5 (same scenarios) and 6 (every fight ends) pass.

| preset | verdict | C wins / loses / ties | median R_C - R_D | ship destroyed C / D | fighters lost C / D | DPSS median C / D |
|---|---|---|---|---|---|---|
| perfect | FLOOR | 1 / 9 / 230 | 0.0 | 0 / 0 | 1920 / 1920 | 0.00 / 0.00 (over 6) |
| ace | NO DIFFERENCE SHOWN | 7 / 35 / 198 (p < 0.0001) | 0.0 | 0 / 0 | 1920 / 1920 | 0.00 / 0.00 (over 51) |
| regular | **CAP BETTER** | 240 / 0 / 0 | +1466.6 | 233 / 0 | 723 / 1920 | 39.11 / 2.73 |
| green | **CAP BETTER** | 240 / 0 / 0 | +1434.1 | 240 / 0 | 120 / 744 | 38.93 / 2.23 |
| green + MLP (reported) | CAP BETTER | | | C kills the ship in 100% | | |

Peak closing: C 13.5-14.1 against D 33.5-33.6.

**WHAT THE TABLE SAYS THAT THE VERDICT LINE DOES NOT, SAID PLAINLY.**
* Under ace, the discordant pairs lean the OTHER way: the doctrine wins 35 of 42, with a sign p below 0.0001. By the registered rule this is NO DIFFERENCE SHOWN, because ties stay in the median and 198 of 240 pairs tie at 0. That is the consequence stated before DEV, and here it hides a consistent direction.
* Under perfect the 10 discordant pairs lean the same way (9 to 1), below the floor.
* So against strong gunners neither approach reaches the ship in almost every fight. In the few where one does damage, it is more often the doctrine. A slower fighter sits longer inside a good gunner's envelope.
* This is NOT a verdict. It is filed as its own question in the backlog (space-cap-strong-gunners).

**Against the expectations (written before DEV2):**
* E1 regular CAP BETTER: held. E2 green CAP BETTER: held.
* E3 perfect FLOOR: held.
* E4 ace FLOOR or NO DIFFERENCE SHOWN: held, by the rule's letter; the direction is the doctrine's.
* E5 DOCTRINE BETTER under any preset: did not happen.
* E6 SUPPORTED: held.
* E8 green + MLP: held, 100%.
* E9 fewer fighters lost under regular and green: held (C fewer in 233 and 227 pairs).
* All checks pass: held. Round 1's bar failing again on DEV2: happened (3 of 480).

**WHAT THIS DOES NOT SAY:**
* Nothing about learned 6DOF pilots, escorts or two ships.
* Nothing about which cap is best beyond Round 1's grid.
* Nothing about real gunners: the presets are hand rules.
* Nothing about whether the shipped seat networks would do better retrained against slow fighters. They were trained against the doctrine, and C kills the ship in every scenario with them.

# ROUND 3: DOES A CAPPED FIGHTER LOSE TO STRONG GUNNERS, AND IS THERE A CAP THAT DOES NOT? (backlog space-cap-strong-gunners; Keith 2026-11-26, "lets do the next suggested round"; REGISTERED 2026-11-26, before any code for it and before any of its seeds is flown)

## Why
- Round 2's table showed a direction its verdict line hid. Against ace, where either approach reached the ship, the doctrine won 35 of 42 discordant pairs; against perfect, 9 of 10.
- R tied at 0 in most fights, and the rule read both presets as no verdict.
- This round asks the question under ace and perfect only, with an endpoint that does not tie at 0, and a cap grid that includes higher caps.

## What is already known, said first
The design survey flew throwaway space seeds 9990037-9990048 (48 fights a preset, in no set; a scratch script, never committed) through spaceDoctrineStudy.flyOne:
* **Every fighter dies in every arm** under both presets (losses 8 of 8 everywhere). Losses cannot be the endpoint, and the ship was never destroyed.
* **R ties between the doctrine and a cap in 30-46 of 48 fights.** Strafe-seconds (fighter-seconds in strafe mode: the time the fighters spend on their passes at the ship) tied in 0-20 of 48.

| preset | arm | fights with R > 0 | mean R | mean strafe-seconds |
|---|---|---|---|---|
| ace | doctrine | 9 | 9.0 | 6.0 |
| ace | cap 12 | 1 | 2.6 | 0.5 |
| ace | cap 20 | 18 | 35.3 | 4.5 |
| ace | cap 30 | 10 | 12.4 | 6.0 |
| perfect | doctrine | 4 | 2.6 | 2.6 |
| perfect | cap 12 | 0 | 0.0 | 0.0 |
| perfect | cap 20 | 5 | 6.4 | 1.3 |
| perfect | cap 30 | 5 | 4.1 | 2.6 |

* **Cap 12** (Round 2's CAP_CHOSEN) is slower, so its fighters die before they ever strafe.
* **Cap 30** is near the doctrine, whose peak closing speed is about 31.
* **Cap 20 under ace** did the most damage, with fewer strafe-seconds than the doctrine. So strafe-seconds and damage need not agree, and the round weighs both.

## The arms
spaceDoctrineStudy.flyOne exactly, with nothing edited: arm D (no pilot) and arm C (cappedPilot at a cap).

## The grid, DEV and the choice
* **Grid:** 12, 16, 20, 25, 30.
* **DEV:** space seeds 4301-4330 x 4 kinds x {ace, perfect}. Every arm is flown.
* **CAP_STRONG** is the grid cap with the highest mean R, pooled over both presets. Ties go to the larger cap.
* R is chosen on, not strafe-seconds, because R is what the fighters are for. DEV's strafe-seconds are reported.
* **DEV checks** (a failure stops the round): Round 2's SAME FOE, THE CAP IS APPLIED (at CAP_STRONG) and EVERY FIGHT ENDS.

## HELD: the verdict
HELD is space seeds 4401-4460 x 4 kinds x {ace, perfect}, flown once with arms D, C at CAP_STRONG, and C at 12 (reported). Pairs are (seed, kind), within a preset. The sign test is Round 1's: FLOOR_MIN 20 non-tied pairs, alpha 0.05.
* **V1, per preset, R:** d = R_C - R_D (C at CAP_STRONG).
  * CAP BETTER: wins > losses, p <= 0.05, and the median difference over the non-tied pairs > 0.
  * DOCTRINE BETTER is the mirror; FLOOR is under 20 non-tied pairs; otherwise NO DIFFERENCE SHOWN.
* **V2, per preset, strafe-seconds:** the same test on d = strafeS_C - strafeS_D, reported as the mechanism.
* **BOTTOM LINE:**
  * V1 CAP BETTER under both presets: `CAP <CAP_STRONG> BEATS THE DOCTRINE AGAINST STRONG GUNNERS`.
  * V1 DOCTRINE BETTER under either: `THE DOCTRINE BEATS CAP <CAP_STRONG> AGAINST STRONG GUNNERS (<preset(s)>)`.
  * Otherwise: `NO CAP SHOWN BETTER OR WORSE THAN THE DOCTRINE AGAINST STRONG GUNNERS (<per-preset verdicts>)`.
* **THE FIRST QUESTION, REPORTED:** cap 12 against the doctrine, per preset, by the same R test and the strafe-seconds test.
  * Answer YES (a capped fighter at 12 loses to strong gunners) if the doctrine is better on R under either preset, or the cap-12 fighters strafe less (DOCTRINE BETTER on strafe-seconds) under both.
* **Reported, not weighed:** mean R, damage, strafe-seconds, passes, time to the fight's end and peak closing, per arm and preset.

## Expectations, recorded before any code
* CAP_STRONG is 20 or 25: about 70%.
* The bottom line is CAP BEATS THE DOCTRINE: about 25%. DOCTRINE BEATS: about 15%. NO CAP SHOWN: about 60% (R ties a lot even at 240 pairs a preset, so FLOOR under perfect is likely).
* The first question answers YES: about 85% (cap 12 fighters strafe far less).

## What will be built
* tools/ship/strongGunnersStudy.mjs (the choice, the checks and the verdict, on spaceDoctrineStudy's flyOne).
* tools/ship/strongGunnersStudyCmd.mjs (export-free; modes dev, dev-read, held, held-read; results in brain/rig-results/strong-gunners/).
* tools/ship/strongGunnersStudy-selfcheck.mjs, with a mutation pass.

## ROUND 3, RESULT (2026-11-26): CAP 20 BEATS THE DOCTRINE AGAINST STRONG GUNNERS -- AND A FIGHTER CAPPED AT 12 LOSES TO THEM

**DEV** (4301-4330 x 4 kinds x ace and perfect, every grid cap; read once; `brain/rig-results/strong-gunners/dev-report.json`).

| | doctrine | cap 12 | cap 16 | cap 20 | cap 25 | cap 30 |
|---|---|---|---|---|---|---|
| mean R | 4.35 | 1.80 | 11.03 | 17.93 | 10.35 | 5.25 |
| mean strafe-seconds | -- | 0.20 | 1.21 | 2.41 | 3.49 | 3.88 |

- **CAP_STRONG = 20.** It was committed with the report before any HELD seed was flown.
- Checks passed: SAME FOE on 732,155 decisions; THE CAP IS APPLIED (187,201 decisions at or over 20, none with thrust; the doctrine's peak 33.4 > 25); EVERY FIGHT ENDS (1,440 fights).

**HELD** (4401-4460 x 4 kinds x ace and perfect; the doctrine, cap 20 and cap 12; flown once, the files committed before the read; `brain/rig-results/strong-gunners/held-report.json`). SAME SCENARIOS and EVERY FIGHT ENDS passed.

| preset | arm | mean R | fights with R > 0 | strafe-seconds | passes | peak closing |
|---|---|---|---|---|---|---|
| ace | doctrine | 8.70 | 37 | 6.01 | 3.73 | 33.5 |
| ace | cap 20 | 36.15 | 80 | 4.15 | 2.83 | 20.8 |
| ace | cap 12 | 5.92 | 11 | 0.55 | 0.49 | 13.7 |
| perfect | doctrine | 1.57 | 11 | 2.59 | 2.15 | 33.4 |
| perfect | cap 20 | 5.78 | 21 | 1.22 | 1.18 | 20.7 |
| perfect | cap 12 | 0.30 | 1 | 0.02 | 0.03 | 13.5 |

- **V1, R:**
  - ace CAP BETTER: the cap was better in 73 fights, worse in 12, tied in 155; p < 0.0001; median +54.
  - perfect CAP BETTER: 20 against 6; p 0.0094; median +18.
- **V2, strafe-seconds:** DOCTRINE BETTER under both: ace 23 against 215, perfect 11 against 191. Cap 20's fighters spend LESS time on their passes and do MORE damage. A slower pass is a better-aimed one.
- **BOTTOM LINE: CAP 20 BEATS THE DOCTRINE AGAINST STRONG GUNNERS.**
- **THE FIRST QUESTION: YES, A CAPPED FIGHTER AT 12 LOSES TO STRONG GUNNERS.**
  - On R: ace DOCTRINE BETTER (10 against 32, p 0.0009); perfect FLOOR (1 against 10).
  - On strafe-seconds: DOCTRINE BETTER under both (0 against 240; 0 against 201). At 12 the fighters die before they reach the ship.

**Against the expectations (written first):**
- CAP_STRONG 20 or 25, about 70: YES (20).
- CAP BEATS THE DOCTRINE, about 25: YES. NO CAP SHOWN was my about-60% call, and perfect cleared its floor (26 non-tied pairs).
- The first question YES, about 85: YES.

**WHAT THIS MEANS -- NO ONE CAP IS BEST.**
- Rounds 1-2 chose 12 against the whole preset mix, and it wins against regular and green by killing the ship. Round 1's DEV means put cap 12 near R 1,590 there, against about 1,100 for cap 20.
- Against ace and perfect, 12 is the worst approach on the grid and 20 the best.
- **The right approach speed rises with the gunners' skill.** Too slow, and the fighters die on the way in; too fast, and the passes are wasted.
- Rock nav Round D and the page's cap box use 12. That is right for the regular gunners they fly against, and it would be wrong against strong ones.
- A cap that adapts to what the fighters meet, for example one raised after the first losses, is the open question. It is filed as backlog space-cap-adaptive.
