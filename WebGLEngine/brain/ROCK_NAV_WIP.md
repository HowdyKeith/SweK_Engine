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
