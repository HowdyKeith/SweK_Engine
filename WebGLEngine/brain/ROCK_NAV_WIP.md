# ROCK NAV: do fighters that route through the rock field with the navigation layer do better than today's doctrine? (backlog nav-match-consumes-layer, step 2; Keith 2026-11-25: "Rock field first", then "can we do options a and b, separately?")

Two rounds, registered separately, each before its own code and before any of its seeds is flown:
* **ROUND A, the approach.** The layer steers only outside the strafe range, and the approach is scored on its own.
* **ROUND B, the layer kept on through the strafing passes.** Registered after Round A is read. Its section is appended below then; none of it is written now.

# ROUND A (REGISTERED 2026-11-25, before any code for it and before any of its seeds is flown)

## What is already known, said first
The design survey flew throwaway space seeds 9990001-9990006 (in no set) with a scratch prototype (never committed), regular gunners, 24 rocks, the four kinds:
* **Doctrine:** 31 of 192 fighters struck a rock over 24 fights. 16 of the strikes came before the fighter first reached the strafe range, and 15 after.
* **The layer at margin 8, re-aimed every 15 ticks:** 23 struck, 12 on the approach and 11 after.
* **On seeds 9990001-9990003 (12 fights), three settings were tried:**
  * margin 8, re-aimed every tick: approach 6, after 7;
  * margin 20, every 15 ticks: approach 2, after 11;
  * margin 20, every tick: approach 1, after 12.
  * The doctrine on the same fights: approach 5, after 2.
* **THE SETTINGS ARE FIXED FROM THAT SURVEY, AND IT IS SAID HERE:** margin 20 and re-aim every 15 ticks, chosen on throwaway seeds that are in no set. Nothing is tuned on DEV.
* **The survey's warning, recorded before the round:** the layer moves strikes from the approach into the strafe zone. Rocks lie 150-330 from the ship and the strafe range is 220, so the layer delivers fighters among the rocks inside 220 and then hands them back to a doctrine that does not see rocks. Round A weighs only the approach. The strikes after arrival are reported, and they are the reason for Round B.
* A defect the survey found and fixed, so it is not repeated: the prototype stored distances as 32-bit floats, and the search re-expanded cells endlessly. The library uses 64-bit.

## The layer (new module brain/spaceNav.mjs; spaceArena.mjs and battleshipFight.mjs are NOT edited)
* **The grid:** a cube of half-width 560 centred on the ship's STARTING position, cells of 16 units (70 a side).
* **Blocked cells:** a cell is blocked when its centre lies within (rock radius + FIGHTER.radius + MARGIN + 0.87 x CELL) of a rock's centre. MARGIN = 20.
* **The field:** 26-neighbour Dijkstra distances, 64-bit, toward the goal: every free cell within SA.STRAFE_RANGE of the ship's starting position. Built ONCE, at t = 0.
* **The aim:** walk the steepest descent from the fighter's cell. The aim is the farthest cell centre on that walk still in clear line of sight, sampled every half cell against the blocked grid.
  * It is null when no cell on the walk is in sight; the pilot then flies the doctrine (counted).
  * Each fighter's aim is recomputed every EVERY = 15 ticks and cached between.
* **The pilot**, `navPilot(arenaOf, field)`:
  * Beyond SA.STRAFE_RANGE of the ship's CURRENT centre, with an aim: return AP.decide(body, { pos: aim, vel: [0,0,0] }, opts).
  * Otherwise: return AP.decide(body, target, opts) exactly. This is THE HAND-BACK.
* **The ship cruises**, so the field's goal is where the ship started, not where it is. That is disclosed and not corrected in Round A; the drift is reported.

* **AMENDMENT (2026-11-25), made before any DEV or HELD seed was flown and found by the layer's own gate on a fixture:**
  * A diagonal descent step can cut the corner of a blocked zone. From directly behind a rock, the line to EVERY cell on the walk can clip that corner, so the registered aim was null, and the pilot fell back to the doctrine, which flies straight at the rock.
  * The prototype behind the survey had the same defect, so the survey's counts include it.
  * **Amended rule:** when no cell on the walk is in sight, the aim is the walk's FIRST cell (the adjacent descent cell), counted as a NEAR aim.
  * The aim is null, and the doctrine is flown, only when the fighter's cell has no lower neighbour (or is already a goal cell).
  * NEAR aims are reported with the fallbacks. Nothing else in the round changes.

## The arms
Both arms use battleshipFight.build(seed, kind, { gunners: "regular", rocks: 24 }): 8 fighters, 120 s, defaults otherwise.
* **D, the doctrine:** no pilot.
* **N, the layer:** pilot = navPilot.

## Per-fighter endpoints
A fighter ARRIVES at the first tick its centre is within SA.STRAFE_RANGE of the ship's centre while it is flying. The fight is stepped with SA.stepSpaceArena, and arrival is read after each tick.
* **approachStruck:** struck by a rock before arriving.
* **approachShot:** destroyed by any other cause before arriving.
* **arrived:** arrived alive. The time of arrival is recorded.
* **combatStruck:** struck after arriving.

## SETS (space seeds, battleshipFight.scenario's generator)
* DEV: 3101-3130 x 4 kinds (120 fights).
* HELD: 3201-3290 x 4 kinds (360 fights), flown once.
* Gate seeds: 41-50. Throwaway: 9990001-9990006, spent by the survey.
* Round B will take 3301-3330 and 3401-3490. They are reserved now, so nothing in Round A spends them.

## DEV: checks only (a failure stops the round; nothing is tuned)
1. **SAME FIELD:** both arms' arenas hold identical rocks and identical fighter starts on every DEV fight.
2. **THE LAYER STEERS:** across N's DEV fights, pilot calls beyond the strafe range that flew an aim are more than 0.
3. **THE HAND-BACK:** every N pilot call inside the strafe range returned exactly AP.decide(body, target, opts) (re-computed and compared). Mismatches: 0.
4. **THE FIELD IS SOUND:** no aim point flown lies in a blocked cell, and every rock's centre cell is blocked.
5. **EVERY FIGHT ENDS** within 120 s.

DEV's endpoint totals are reported and move nothing.

## HELD: the verdict
Pairs are (seed, kind), N against D.
* **V1, THE APPROACH:** per fight, d = D.approachStruck - N.approachStruck. Count wins (d > 0) and losses (d < 0) and take the exact two-sided sign test.
  * **LAYER BETTER:** wins > losses, p <= 0.05, and N's total approachStruck < D's.
  * **DOCTRINE BETTER:** the mirror.
  * **FLOOR:** fewer than 20 non-tied pairs.
  * Otherwise **NO DIFFERENCE SHOWN**.
* **V2, ARRIVALS** (the approach is not bought by not arriving): the same test on d = N.arrived - D.arrived. It must not be DOCTRINE BETTER.
* **BOTTOM LINE:**
  * V1 LAYER BETTER and V2 not DOCTRINE BETTER: `THE LAYER WINS THE APPROACH`.
  * V1 LAYER BETTER and V2 DOCTRINE BETTER: `THE LAYER AVOIDS ROCKS BY NOT ARRIVING`.
  * Otherwise: `THE LAYER DOES NOT WIN THE APPROACH (<V1's verdict>)`.
* **Reported, not weighed:**
  * the median time of arrival in each arm;
  * approachShot;
  * combatStruck, with its sign test;
  * the total struck;
  * R (spaceDoctrineStudy.rOf), damageOnShip and ship deaths;
  * the aim fallbacks (null aims) and the NEAR aims (see the amendment);
  * the ship's drift from its start at 120 s.

## Expectations, recorded before any code
* V1 LAYER BETTER: about 75% (the survey's counts are small).
* V2 not DOCTRINE BETTER: about 85%.
* combatStruck higher under N, beyond the sign test: about 70%.
* The total struck lower under N: about 40%.

## What will be built
* brain/spaceNav.mjs, the layer, pure, and its gate brain/spaceNav-selfcheck.mjs, with a mutation pass.
* tools/ship/rockNavStudy.mjs, holding the arms, the endpoints, the checks and the verdict; Round B will add an arm to it.
* tools/ship/rockNavStudyCmd.mjs (export-free; modes dev, dev-read, held, held-read; results in brain/rig-results/rock-nav/).
* tools/ship/rockNavStudy-selfcheck.mjs, with a mutation pass.

## ROUND A, RESULT (2026-11-25): THE LAYER WINS THE APPROACH

**DEV** (3101-3130, 120 pairs): all five checks passed.
- The layer flew an aim on 651,915 of 916,359 pilot calls.
- The hand-back was exact on all 243,169 calls inside the strafe range.
- No aim lay in a blocked cell.
- The DEV files and report were committed before any HELD seed was flown.

**HELD** (3201-3290 x 4 kinds, 360 pairs; flown once, the files committed before the read; `brain/rig-results/rock-nav/held-report.json`). SAME SCENARIOS and EVERY FIGHT ENDS passed.

| | D (doctrine) | N (the layer) |
|---|---|---|
| rock strikes before arriving | 260 | 26 |
| arrived alive in the strafe range | 2590 | 2760 |
| shot down before arriving | 30 | 87 |
| rock strikes after arriving | 238 | 211 |
| all rock strikes | 498 | 237 |
| median arrival | 14.37 s | 15.90 s |
| mean damage on the ship | 145.6 | 337.2 |
| ship destroyed | 0 | 0 |

- **V1 THE APPROACH:** LAYER BETTER. The layer was better in 173 fights, worse in 10, tied in 177; p < 0.0001.
- **V2 ARRIVALS:** LAYER BETTER (161 against 53, p < 0.0001). So it is not DOCTRINE BETTER: the approach was not bought by not arriving.
- **Reported:**
  - Rock strikes after arriving: NO DIFFERENCE SHOWN (106 against 95, p 0.48).
  - Aim fallbacks (null aims, so the doctrine was flown): 62,629 calls. NEAR aims: 152,621 calls.
  - The ship's worst drift from its start: D 189.0, N 456.1.

**Against the expectations (written first):**
- V1 LAYER BETTER, about 75: YES.
- V2 not DOCTRINE BETTER, about 85: YES, and in fact LAYER BETTER.
- Strikes after arrival higher under N, about 70: NO. The survey's warning did not hold at scale: 211 against 238, no difference shown. The survey had 12 fights.
- Total struck lower under N, about 40: YES, halved (237 against 498).

**WHAT THIS MEANS.**
- The navigation layer does what it is for. It removes 90% of the approach's rock losses and delivers more fighters, about 1.5 s later. The extra fighters, plus the losses no longer taken, more than double the damage on the ship (reported, not weighed).
- It does not cost the combat phase anything measurable. It does not help it either: about 0.6 fighters a fight are still lost to rocks while strafing. That is Round B's question.
- **Two things the round shows and does not weigh:**
  - **The goal goes stale.** The field is built once, round where the ship STARTED, and under N the ship drifts up to 456 units, because it turns to face the fighters that now reach it. A fighter already inside the old goal sphere but more than 220 from the ship has a null aim and flies the doctrine: 62,629 calls.
  - **More fighters die to the guns on the approach** (87 against 30). They spend longer in the gunners' reach.
- Neither is corrected here. A re-centred field is a candidate for a later round, not Round B, so that Round B tests one thing.

# ROUND B -- the clear lane: the layer routes each fighter to a point on the strafe sphere with a clear run at the ship (REGISTERED 2026-11-25, after Round A was read, before any code for it and before any of its seeds is flown)

## What is already known, said first: the survey, and why Round B is not what was first asked
Keith asked for the layer "also steering during the strafing passes". The design survey flew throwaway space seeds 9990007-9990012 (24 fights, in no set; scratch prototypes, never committed), Round A's layer N against variants:
* **Steering during the passes does nothing.** Inside the strafe range, three rules were tried, each with the guns held while detouring:
  * line of sight to the doctrine's target, detouring round the first rock in the way: strikes after arrival 12 against N's 11;
  * the same with the thrust allowed: 12;
  * a predictive rule (the velocity projected 2, 3 or 5 s ahead): 11-12.
  * Every variant cost damage on the ship: 7,868-9,482 against N's 10,308.
* **Why** (a diagnostic of the 11 strikes):
  * 9 are in strafe mode, 147-194 from the ship, 1-2 s after arriving, coasting at 20-28 u/s.
  * The doctrine strafes with the thrust cut (standoff 1e9), and rocks fill the band 150-220. So a fighter delivered to an arbitrary point on the strafe sphere often has a rock between it and the ship, and no time to turn its nose and thrust.
* **What works is routing the approach to a clear lane:**
  * **L1:** the field's goal is only those strafe-sphere cells with a clear line (on the blocked grid) to the ship's start. Strikes after arrival 5 against 11; damage on the ship 8,706 against 10,308; approach strikes 1 against 2.
  * **L2:** L1, plus inside the strafe range the layer keeps flying until the line to the ship's CURRENT centre is clear. Strikes 4, but damage 4,564: fighters loiter outside the lanes.
* **So Round B registers L1.** It is the layer carrying the strafe's needs into the route, not steering during the pass. L2 and the in-pass rules are not flown.

## The arms (Round A's library and pilot; one option added)
* brain/spaceNav.mjs buildField gains the option `lane` (default false, so Round A's field is unchanged to the bit). With it, a goal cell must also have a clear line from its centre to the origin, by lineClear on the blocked grid.
* **N:** Round A's arm exactly.
* **L:** the same, with the field built with lane: true.
* Both use the same rocks, fighters, gunners ("regular"), 24 rocks, margin 20 and re-aim every 15 ticks. The hand-back is unchanged: AP.decide(body, target, opts) inside the strafe range.

## Endpoints: Round A's per-fighter endpoints, unchanged

## SETS
* DEV: 3301-3330 x 4 kinds, checks only.
* HELD: 3401-3490 x 4 kinds, flown once. Both were reserved by Round A.
* Gate seeds 41-50. The survey's throwaway seeds: 9990007-9990012.

## DEV: checks only (a failure stops the round)
1. **SAME FIELD:** both arms fly identical rocks and starts.
2. **THE HAND-BACK** is exact in both arms.
3. **THE LANE IS SOUND:**
   * In L, every goal cell has a clear line to the origin.
   * In L there are goal cells at all.
   * N's field has goal cells without a clear line, so the option reaches the field.
4. **THE FIELD IS SOUND** (Round A's check 4) in both arms.
5. **EVERY FIGHT ENDS.**

## HELD: the verdict (pairs by (seed, kind), L against N; Round A's sign verdict)
* **V1, THE STRAFE:** d = N.combatStruck - L.combatStruck.
  * LANE BETTER: wins > losses, p <= 0.05, and L's total is lower.
  * N BETTER is the mirror; FLOOR is under 20 non-tied pairs; otherwise NO DIFFERENCE SHOWN.
* **V2, THE DAMAGE** (the lane is not bought with the attack): d = L.damageOnShip - N.damageOnShip. It must not be N BETTER.
* **BOTTOM LINE:**
  * V1 LANE BETTER and V2 not N BETTER: `THE LANE WINS THE STRAFE`.
  * V1 LANE BETTER and V2 N BETTER: `THE LANE SAVES FIGHTERS AND HURTS THE SHIP LESS`.
  * Otherwise: `THE LANE DOES NOT WIN THE STRAFE (<V1's verdict>)`.
* **Reported, not weighed:**
  * approach strikes, arrivals, approach shot, total struck, median arrival, R and ship deaths;
  * aim fallbacks and NEAR aims;
  * the ship's drift;
  * the sign test on approach strikes, L against N.

## Expectations, recorded before any code
* V1 LANE BETTER: about 65% (the survey's 11 against 5 is 24 fights).
* V2 not N BETTER: about 50%. The survey's damage fell 16%, and that may be real.
* Approach strikes not worse under L: about 80%.

## What will be built
* `lane` in brain/spaceNav.mjs, with gate rows and sabotages.
* Arm "L" in tools/ship/rockNavStudy.mjs, with readHeldB and devChecksB.
* The command's modes devB, devB-read, heldB and heldB-read (files devB-*, heldB-*).
* Gate rows and sabotages in rockNavStudy-selfcheck.mjs.

## ROUND B, RESULT (2026-11-25): THE LANE WINS THE STRAFE

**DEV** (3301-3330, 120 pairs): all five checks passed.
- The hand-back was exact on 494,130 calls.
- L's 1,191,645 goal cells all had a clear line. N's field had 31,673 that did not.
- DEV was committed before any HELD seed was flown.

**HELD** (3401-3490 x 4 kinds, 360 pairs; flown once, the files committed before the read; `brain/rig-results/rock-nav/heldB-report.json`). SAME SCENARIOS and EVERY FIGHT ENDS passed.

| | N (Round A's layer) | L (the clear lane) |
|---|---|---|
| rock strikes after arriving | 241 | 125 |
| mean damage on the ship | 264.8 | 246.6 |
| rock strikes before arriving | 18 | 24 |
| arrived | 2762 | 2762 |
| shot down before arriving | 95 | 86 |
| all rock strikes | 259 | 149 |
| median arrival | 15.87 s | 15.90 s |
| ship destroyed | 0 | 1 |

- **V1 THE STRAFE:** LANE BETTER. The lane was better in 128 fights, worse in 48, tied in 184; p < 0.0001.
- **V2 THE DAMAGE:** NO DIFFERENCE SHOWN (149 against 166, p 0.37). So it is not N BETTER: the lane was not bought with the attack.
- **Reported:**
  - Approach strikes: FLOOR (6 against 12 non-tied pairs).
  - Aim fallbacks: N 69,714, L 78,370. NEAR aims: N 120,537, L 121,810.
  - Worst ship drift: about 523 in both arms.

**Against the expectations (written first):**
- V1 LANE BETTER, about 65: YES.
- V2 not N BETTER, about 50: YES. The damage fell 7%, and that was not shown beyond chance.
- Approach strikes not worse, about 80: not shown worse; too few to test (FLOOR).

**WHAT THE TWO ROUNDS MEAN TOGETHER.**
- Against today's doctrine, the layer with the clear lane loses about 149 fighters to rocks where the doctrine loses about 498. That is a cross-round reading on different seeds (Round A's D 498 against Round B's L 149); no round paired them, and it is not a verdict.
- The two rounds' fix points are different:
  - Round A: route the approach round the rocks.
  - Round B: route it to a point with a clear run at the ship, because a strafing fighter cannot turn.
- Steering during the strafing pass itself, the form Round B was first asked in, was surveyed and did nothing. The reason is the doctrine's thrust cut while strafing.
- **Still open, not weighed:**
  - The field is built once round the ship's start. The ship drifts about 520 units, and 70-78 thousand pilot calls a round fall back to the doctrine because a fighter sits inside the stale goal but more than 220 from the ship.
  - A field re-centred on the ship as it moves is the next candidate round. It is not registered.

# ROUND C -- the field that follows the ship (Keith 2026-11-26: "lets do A field that follows the ship"; REGISTERED 2026-11-26, before any code for it and before any of its seeds is flown)

## What is already known, said first: the survey points AGAINST it
The design survey flew throwaway space seeds 9990013-9990018 (24 fights, in no set; a scratch prototype, never committed). L is Round B's lane field, built once. F is the same field REBUILT round the ship's current position every K ticks.

| | L | F, K=30 | F, K=60 | F, K=150 |
|---|---|---|---|---|
| rock strikes after arriving | 6 | 12 | 11 | 12 |
| rock strikes before arriving | 3 | 2 | 3 | 3 |
| damage on the ship | 5,026 | 5,168 | 5,310 | 5,284 |
| doctrine fallbacks | 7,592 | 5,411 | 4,640 | 5,360 |

* **Why the fallbacks happen** (a diagnostic on L, 9990013-9990015): 4,085 of 4,817 fallback calls are the stale goal. The fighter sits in a goal cell of the start-centred field but more than 220 from the ship's current centre. 289 are at the sphere's edge (cell rounding), and 443 are cells with no lower neighbour.
* **Following fixes part of what it targets:** fallbacks fall by about a third, not to zero, because between rebuilds the goal is stale again.
* **It costs about 0.32 s a rebuild.**
* **It did not lower the strikes:** 11-12 after arriving against L's 6, on 24 fights.
* **K = 60 (2 s) is fixed from the survey.** All three intervals looked alike, and 60 is the middle. Nothing is tuned on DEV.
* **The round is flown because Keith asked for it, and the survey is small.** My expectation leans to NO DIFFERENCE or L BETTER, and that is recorded below, before any seed.

## The arms (Round B's library; one option added)
* brain/spaceNav.mjs gains `followingField(arenaOf, rocks, { every, lane })`. It returns a function that hands back the current field, rebuilding it round the ship's CURRENT centre on the first call at or after every `every` ticks (the first build is at the first call).
* navPilot accepts a field or such a function. An aim cached under one field is not reused under another.
* **L:** Round B's arm exactly: the lane field, built once at t = 0.
* **F:** followingField with lane true and every = 60.
* Everything else is unchanged: rocks, starts, regular gunners, margin 20, re-aim 15 ticks, and the hand-back.

## Endpoints
Round A's per-fighter endpoints, plus each fight's total rock strikes (struck).

## SETS
* DEV: 3501-3530 x 4 kinds, checks only.
* HELD: 3601-3690 x 4 kinds, flown once.
* Gate seeds 41-50. The survey: 9990013-9990018.

## DEV: checks only (a failure stops the round)
1. **SAME FIELD:** identical rocks and starts.
2. **THE HAND-BACK** is exact in both arms.
3. **IT FOLLOWS:**
   * In F, every fight longer than 2 s has at least 2 builds.
   * Every build is centred on the ship's position at the tick it was built (recorded, deviation 0).
   * L has exactly 1 build per fight.
4. **THE FIELD IS SOUND:**
   * No aim flown lies in a blocked cell of the field it was drawn from.
   * Every rock centre is blocked in every build.
5. **EVERY FIGHT ENDS.**

* **AMENDMENT (2026-11-26), made before any DEV or HELD seed was flown and found while sabotaging the study gate:**
  * Check 4's "every rock centre is blocked in every build" cannot hold once the ship has drifted more than about 230 units. A rock can then lie outside a rebuilt field's cube, and the grid lookup clamps it to an edge cell that is not blocked.
  * Such a rock is not in that field at all, so the check now holds only the rocks INSIDE each build's grid. The number of rock-builds off the grid is reported.
  * The check also now requires that every build was checked: the builds checked must equal the builds made.

## HELD: the verdict (pairs by (seed, kind), F against L; the sign verdict of Rounds A and B)
* **V1, THE ROCKS:** d = L.struck - F.struck (all rock strikes, before and after arriving).
  * FOLLOW BETTER: wins > losses, p <= 0.05, and F's total is lower.
  * L BETTER is the mirror; FLOOR is under 20 non-tied pairs; otherwise NO DIFFERENCE SHOWN.
* **V2, THE DAMAGE:** d = F.damageOnShip - L.damageOnShip. It must not be L BETTER.
* **BOTTOM LINE:**
  * V1 FOLLOW BETTER and V2 not L BETTER: `THE FOLLOWING FIELD WINS`.
  * V1 FOLLOW BETTER and V2 L BETTER: `THE FOLLOWING FIELD SAVES FIGHTERS AND HURTS THE SHIP LESS`.
  * V1 L BETTER: `THE FOLLOWING FIELD LOSES MORE FIGHTERS TO THE ROCKS`.
  * Otherwise: `THE FOLLOWING FIELD DOES NOT WIN (<V1's verdict>)`.
* **Reported, not weighed:**
  * the strikes before and after arriving, each with its sign test;
  * arrivals, approach shot, median arrival, R and ship deaths;
  * fallbacks and NEAR aims;
  * builds per fight and the build time.

## Expectations, recorded before any code
* V1 FOLLOW BETTER: about 15%. V1 L BETTER: about 35%. NO DIFFERENCE SHOWN: about 50%.
* V2 not L BETTER: about 80%.
* Fallbacks lower under F: about 95%.

## What will be built
* followingField and the field-or-function form of navPilot in brain/spaceNav.mjs, with gate rows and sabotages.
* Arm "F" in tools/ship/rockNavStudy.mjs, with readHeldC and devChecksC.
* The command's modes devC, devC-read, heldC and heldC-read.
* Gate rows and sabotages in the study gate.

## ROUND C, RESULT (2026-11-26): THE FOLLOWING FIELD DOES NOT WIN (NO DIFFERENCE SHOWN)

**DEV** (3501-3530, 120 pairs): all five checks passed.
- The hand-back was exact on 515,549 calls.
- There were 4,288 builds in F, each centred exactly on the ship at its tick.
- No aim lay in a blocked cell, and every rock inside a build's grid was blocked.
- DEV was committed before any HELD seed was flown.

**HELD** (3601-3690 x 4 kinds, 360 pairs; flown once, the files committed before the read; `brain/rig-results/rock-nav/heldC-report.json`). SAME SCENARIOS and EVERY FIGHT ENDS passed.

| | L (lane, built once) | F (lane, rebuilt every 2 s) |
|---|---|---|
| all rock strikes | 147 | 141 |
| before arriving | 32 | 21 |
| after arriving | 115 | 120 |
| arrived | 2745 | 2771 |
| mean damage on the ship | 239.7 | 240.4 |
| doctrine fallbacks | 86,901 | 75,031 |
| builds a fight | 1 | 35 |

- **V1 THE ROCKS:** NO DIFFERENCE SHOWN. Following was better in 47 fights, worse in 48, tied in 265; p 1.0.
- **V2 THE DAMAGE:** NO DIFFERENCE SHOWN (167 against 151, p 0.40). So it is not L BETTER.
- **Reported:**
  - Strikes before arriving: FLOOR (13 against 3 non-tied pairs, p 0.02, under the 20-pair floor, so not a finding).
  - Strikes after arriving: no difference (40 against 49).
  - F's rebuilds cost 4,564 s of CPU across the 360 fights, about 12.7 s a fight.

**Against the expectations (written first):**
- NO DIFFERENCE SHOWN, about 50: YES.
- V2 not L BETTER, about 80: YES.
- Fallbacks lower under F, about 95: YES, but only by 14%, not the large drop the stale-goal diagnosis implied.
- The survey's direction (F worse after arriving, 11-12 against 6 on 24 fights) did not replicate. It was noise at that size.

**WHAT THIS MEANS.**
- Re-centring the field on the drifting ship changes nothing measurable in rock losses or damage, and it costs about 35 builds a fight. The stale goal was a real defect in the plan's bookkeeping. It was not a cause of losses: a fighter that falls back to the doctrine near the ship is mostly already past the rocks.
- **What remains unexplained, and is said plainly:** fallbacks fell only 14% even with a fresh field every 2 s. So most fallbacks are not the stale goal after all; the cause is unsettled. **CORRECTED 2026-11-26 by the DIAGNOSTIC below: on the static field 81% ARE the stale goal; the following field traded them for empty-goal spells.**
  - The survey's diagnostic counted 4,085 of 4,817 as stale, on three seeds and the start-centred field.
  - A likelier cause under F is the goal sphere's edge (a goal cell whose centre is inside 220 holds a fighter up to about 14 units outside it), plus the ship's motion between rebuilds.
  - This is not measured here.
- **The layer ships as Round B left it:** the lane field, built once. Nothing is replaced.

# ROUND D -- the clear lane with the doctrine's closing-speed cap (Keith 2026-11-26: "lets register 1 now"; REGISTERED 2026-11-26, before any code for it and before any of its seeds is flown)

## Why
- Round B's strikes after arriving are momentum strikes: the doctrine strafes with the thrust cut, so a fighter coasts in at 20-28 u/s with no time to turn.
- The space-doctrine round (brain/SPACE_DOCTRINE_WIP.md) found that cutting the thrust whenever the closing speed is at or above a cap (CAP_CHOSEN = 12) beats today's approach under regular and green gunners.
- A capped fighter arrives slower, so it has more time inside the rock band.

## What is already known, said first
The design survey flew throwaway space seeds 9990019-9990024 (24 fights, in no set; a scratch prototype, never committed), regular gunners, 24 rocks, the lane field:

| | L (lane) | LC, cap 9 | LC, cap 12 | LC, cap 15 |
|---|---|---|---|---|
| rock strikes after arriving | 5 | 0 | 0 | 1 |
| rock strikes before arriving | 0 | 1 | 0 | 0 |
| shot before arriving | 4 | 17 | 9 | 5 |
| damage on the ship | 5,760 | 33,308 | 27,654 | 17,234 |
| ship destroyed | 0 | 16 | 8 | 1 |

* **The cap is NOT chosen here.** It is the space-doctrine round's CAP_CHOSEN, 12, fixed at that round's DEV before this survey. The survey's other caps are shown and choose nothing.
* **Damage is no guard once ships die**, so V2 uses that round's R: the damage on the ship if it survives, else 1500 + (120 - the time it died).

## The arms (Round B's library and pilot; nothing in spaceArena.mjs or battleshipFight.mjs edited)
* **L:** Round B's arm exactly: the lane field, built once at t = 0, and the hand-back inside the strafe range.
* **LC:** the same pilot, whose output then has its thrust set to 0 whenever the closing speed to the nearest foe's centre (spaceDoctrineStudy.closingSpeed, against SA.nearestFoe) is at or above 12. This is the doctrine round's arm C rule, applied on top of the layer, in every mode.
* Same rocks, starts and regular gunners; margin 20, re-aim every 15 ticks.

## Endpoints
Round A's per-fighter endpoints, R (spaceDoctrineStudy.rOf), and the cap's own counts: the calls at or over the cap, and how many of them flew with thrust.

## SETS
* DEV: 3701-3730 x 4 kinds, checks only.
* HELD: 3801-3890 x 4 kinds, flown once.
* Gate seeds 41-50. The survey: 9990019-9990024.

## DEV: checks only (a failure stops the round)
1. **SAME FIELD:** identical rocks and starts.
2. **THE HAND-BACK** is exact in both arms. It is read on the layer's output before the cap.
3. **THE CAP IS APPLIED:**
   * In LC there are calls at or over 12, and none flew with thrust.
   * In L no call had its thrust cut by this rule.
4. **THE FIELD IS SOUND** in both arms.
5. **EVERY FIGHT ENDS.**

## HELD: the verdict (pairs by (seed, kind), LC against L; the sign verdict of Rounds A-C)
* **V1, THE STRAFE:** d = L.combatStruck - LC.combatStruck.
  * CAP BETTER: wins > losses, p <= 0.05, and LC's total is lower.
  * L BETTER is the mirror; FLOOR is under 20 non-tied pairs; otherwise NO DIFFERENCE SHOWN.
* **V2, THE ATTACK:** d = LC.R - L.R (higher R is better for the fighters). It must not be L BETTER.
* **BOTTOM LINE:**
  * V1 CAP BETTER and V2 not L BETTER: `THE CAP SAVES FIGHTERS IN THE STRAFE`.
  * V1 CAP BETTER and V2 L BETTER: `THE CAP SAVES FIGHTERS BUT HITS THE SHIP LESS`.
  * V1 L BETTER: `THE CAP LOSES MORE FIGHTERS TO THE ROCKS`.
  * Otherwise: `THE CAP DOES NOT WIN THE STRAFE (<V1's verdict>)`.
* **Reported, not weighed:**
  * V2's own verdict both ways;
  * ship deaths, damage, strikes before arriving, shot before arriving, arrivals, total struck, median arrival;
  * the cap's counts, fallbacks and NEAR aims.

## Expectations, recorded before any code
* V1 CAP BETTER: about 75%.
* V2 not L BETTER: about 95%. V2 CAP BETTER on R (reported): about 90%.
* More fighters shot before arriving under LC: about 80%. The survey's 9 against 4 is the cost of a slower approach.

## What will be built
* Arm "LC" in tools/ship/rockNavStudy.mjs, with readHeldD and devChecksD.
* The command's modes devD, devD-read, heldD and heldD-read.
* Gate rows and sabotages.
* A `fly` study entry is NOT added: HELD is a sandbox-sized run (about 15 minutes on 4 cores).

## ROUND D, RESULT (2026-11-26): THE CAP SAVES FIGHTERS IN THE STRAFE

**DEV** (3701-3730, 120 pairs): all five checks passed.
- The hand-back was exact on 490,424 calls, read before the cap.
- In LC, 340,946 calls were at or over 12; 238,534 were cut and none flew with thrust.
- L cut nothing and had 186,508 over-cap calls with thrust.
- DEV was committed before any HELD seed was flown.

**HELD** (3801-3890 x 4 kinds, 360 pairs; flown once, the files committed before the read; `brain/rig-results/rock-nav/heldD-report.json`). SAME SCENARIOS and EVERY FIGHT ENDS passed.

| | L (lane) | LC (lane + cap 12) |
|---|---|---|
| rock strikes after arriving | 112 | 59 |
| rock strikes before arriving | 21 | 17 |
| all rock strikes | 133 | 76 |
| shot before arriving | 119 | 186 |
| arrived | 2734 | 2667 |
| median arrival | 15.93 s | 21.00 s |
| mean R | 247.7 | 1062.4 |
| ships destroyed | 1 | 74 |
| doctrine fallbacks | 82,956 | 47,077 |

- **V1 THE STRAFE:** CAP BETTER. The cap was better in 63 fights, worse in 17, tied in 280; p < 0.0001.
- **V2 THE ATTACK:** not L BETTER. It is in fact CAP BETTER, in 354 fights against 5.
- **Reported:**
  - All rock strikes: CAP BETTER (67 against 17).
  - Strikes before arriving: FLOOR.
  - Shot before arriving: L BETTER (37 against 92). The slower approach costs about 0.19 fighters a fight to the guns.

**Against the expectations (written first):**
- V1 CAP BETTER, about 75: YES.
- V2 not L BETTER, about 95: YES.
- V2 CAP BETTER on R, about 90: YES.
- More shot before arriving under LC, about 80: YES (186 against 119).

**WHAT THIS MEANS.**
- The cap halves the momentum strikes the clear lane left, and with the layer it turns the attack from scratching the ship (mean R 248, 1 kill in 360) into killing it in a fifth of fights (74 of 360). That is the space-doctrine round's finding, now reproduced inside the rock field.
- The price is the one the survey showed: the slower fighters spend 5 s longer arriving and lose about 0.19 more of their number to the gunners on the way.
- **Fallbacks also fell by 43%**, which no round predicted.
  - The likeliest reading is that fewer fighters overshoot the strafe sphere outward and sit in stale goal cells.
  - That reading is unmeasured; backlog space-nav-fallback-cause holds the diagnostic.
- **The page (space-battleship.html) flies the layer without the cap**, as Round B left it.
  - A cap option on the page is a small follow-on, filed with this result.
  - The layer's own default does not change: the cap is the doctrine's choice, not the layer's.

## DIAGNOSTIC (2026-11-26): WHAT THE FALLBACKS ARE -- a correction to Round C's result, and no round flown

This is backlog space-nav-fallback-cause. It is a diagnostic, not a registered round: throwaway space seeds 9990025-9990030 (24 fights, in no set), scratch scripts never committed, regular gunners, 24 rocks.

**On the lane field as shipped (built once):**
- 4,431 fallback calls out of 182,919 pilot calls (2.4%), every one in approach mode.
- By cause:
  - 3,599 (81%) STALE GOAL: the fighter is in a goal cell inside the start-centred sphere but more than 220 from the ship's current centre.
  - 303 (7%) EDGE ROUNDING: the cell centre is inside the sphere and the fighter is just outside it.
  - 228 (5%) cells with no lower neighbour.
  - 301 (7%) cells with no reachable goal.
- 281 of the 4,431 calls were within 30 of a rock's surface.
- 2 of the 9 rock strikes came within 3 s after a fallback by the same fighter.

**On Round C's following field (every 60 ticks):**
- The stale goal is gone (76 calls). But 5,258 calls are "no reachable goal", from a defect this diagnostic found:
  - When the drifting ship's centre lies in a blocked cell (the ship near a rock), no cell has a clear line to it.
  - The LANE GOAL IS EMPTY, and every fighter outside 220 flies the doctrine until the next rebuild.
- 70 of 795 builds (9%) had no goal cell, every one with the ship's own cell blocked, in 3 of 24 fights.

**THE CORRECTION.**
- Round C's result says "most fallbacks are not the stale goal". That was an inference from the 14% drop, and it is WRONG for the static field, where 81% are the stale goal.
- The following field removed them and added the empty-goal spells in their place, which is why the total fell so little.
- Round C's null result stands as flown, but its arm F carried this defect. A re-run with the defect fixed is filed, not flown (backlog rock-nav-follow-fix). The reasons, said plainly:
  - The harm the fallbacks can do is small: at most 2 of 9 strikes, about 0.08 a fight.
  - A paired round on 360 fights would most likely end at FLOOR.
  - The shipped layer is the static field.
