# The sensed map for the sub (UNNUMBERED; REGISTERED BEFORE ANY CODE FOR IT AND BEFORE ITS SET IS FLOWN)

Keith, 2026-11-01: "fix traffic and also gpu pilot swarm demo, and the sensed map for the sub". This is the third of the three. The backlog entry is `nav-sensed-map`: *every navigation result so far has an exact map and a perfect position fix; a vessel that has to FIND the obstacles: a sonar of limited range and bearing that builds the occupancy grid as it goes (the field is re-solved as cells are learned), plus a noisy position fix (a Gaussian error on the plan position, then drift). Same scenarios as `brain/subHardNav.mjs`, new registration.* The exact map is the biggest single optimism in `brain/SUB_FIELD_NAV_WIP.md` (it is the first thing every "what this would not say" list names).

## The question

The harder test (`brain/subHardNav.mjs`, HELD4) gave the vessel the whole sea before it moved: every island, iceberg and wall, each radius and keel, the vessel's own position to the centimetre. Take that away. **Can the same navigator -- the any-angle aim point over a flow field, re-planned as it learns -- still get to the waypoint when it has to find the obstacles itself with a sonar of limited range and field of view, and when it does not quite know where it is?**

## What changes and what does not

**Not changed:** the scenarios (`hardScenario(seed, kind)`), the vessel, the autopilot, the margin ladder (12, 8, 6, 3 m), the edge band, the flight length (260 s), the collision and arrival tests (judged on the TRUE position and the TRUE obstacles), the flow-field solver, the any-angle aim point.

**Kinds flown: the three static ones -- `hard-islands`, `hard-gaps`, `hard-current`.** `hard-traffic` is NOT flown: a moving ship needs its velocity estimated from successive returns (a filter), which is a different piece of work (`nav-reacting-traffic`) and would put two new things into one result. The current kind is flown as in HELD4: the plan ignores the current.

**The sonar.** A forward-looking sonar, **range 100 m, half-angle 60 degrees** (a 120 degree sector ahead of the heading), pinging once a second. Why those numbers (derived, not tuned): the vessel's turn needs a diameter of about 70 m (the turn radius is about 35 m), so the range is that plus 30 m; the half-angle is wide enough that it sees the water it is about to turn into. **Detection is perfect inside the sector** -- every map cell (5 m) whose centre is within range and bearing is ensonified, with no noise, no false returns and no occlusion (an island hides what is behind it from a real sonar and does not hide it here). A cell whose centre lies within an obstacle's radius is OCCUPIED (once occupied it stays occupied), and the sonar reports an iceberg's keel, so a cell under a keel the vessel passes beneath (keel + 5 m not exceeding the shallower of the start and waypoint depths, the rule of `planShapes`) is not marked. Everything outside the sectors so far is UNKNOWN.

**The plan under uncertainty: unknown is treated as free.** The vessel starts with an empty map (only the region's edge band, which it knows from the chart, is blocked) and the plan at t = 0 is therefore the straight run. After every ping that adds an occupied cell the field is rebuilt from the known occupied cells (each inflated by the half-hull plus the margin, the ladder as before, the vessel's own 15 m free), from the vessel's position as it BELIEVES it. This is the standard optimistic choice (a planner that treated unknown water as blocked would not leave the harbour); it means the vessel can plan a route into a dead end it has not yet seen.

**Where it thinks it is.** Two models of the position error, flown as separate arms:
* **`sensed+fix`**: an absolute fix every second (at each ping) with a Gaussian error, **sigma 3 m per axis**, held until the next fix. The map is registered where the vessel BELIEVES it is, so an obstacle seen from a mis-fixed position lands in the map mis-placed by that error and a cell once marked stays marked: the map smears by a few metres.
* **`sensed+drift`**: no fix at all; the vessel dead-reckons, and its believed position departs from the true one as a Wiener process, **sigma 0.3 m per square root of a second per axis** (about 3.4 m per axis, 4.8 m radial, after 130 s; 4.8 and 6.8 m after the full 260 s). The waypoint is a TRUE place: the vessel steers for it in its believed frame and arrives only if its true position is within the 10 m reach radius, so drift is paid for in arrivals as well as in the map.

The pilot (the PD autopilot) and the physics always see the TRUE state; only the plan, the aim point and the map see the believed one.

## Arms flown (`tools/ship/subSensedStudy.mjs`)

`straight` (no map, no field: the floor), `exact` (HELD4's `any`: the whole map and a perfect position, planned once: the ceiling), `sensed` (the sonar map, a perfect position), **`sensed+fix` (designated)**, `sensed+drift`. `straight` and `exact` are flown by `subHardNav.mjs`'s own `flyHard`; the three sensed arms by the new `flySensed` in `brain/subSensedNav.mjs`.

## The set

DEV = seeds 1 to 30 of each of the three kinds: a sanity run (does a flight end, does the map fill) and NOT a result; no parameter above is tuned on it. **HELD6 = seeds 601 to 660 of each of the three kinds -- 180 scenarios, 900 flights -- flown ONCE**, after the module, the study command and their gates are sabotaged. HELD6 shares no seed with HELD4 (401 to 460) or HELD5 (501 to 560, traffic only).

## Bar and verdict

The designated arm `sensed+fix` reaches the waypoint in at least **80% of hard-islands** (48 of 60), **60% of hard-gaps** (36 of 60) and **70% of hard-current** (42 of 60), and collides in at most 6 of the hard-islands flights. (The exact-map bars of HELD4 were 90, 80 and 80; a sensed map is asked to lose no more than 10, 20 and 10 points. The gaps are given the most room because a gap in a wall that spans the region has to be FOUND.) **SUPPORTED** if all of that holds; **PARTLY SUPPORTED** if the bar of at least two of the three kinds holds; **NOT SUPPORTED** otherwise.

## Predictions (scored held or missed, moving nothing)

* **N1** the map costs: in each kind `exact` reaches at least as many as `sensed`.
* **N2** a sensed map beats none: in each kind `sensed` reaches more than `straight`.
* **N3** the fix costs little: in each kind `sensed+fix` reaches within 5 flights (of 60) of `sensed`.
* **N4** drift costs arrivals: over the three kinds together `sensed+drift` reaches fewer than `sensed+fix`.
* **N5** the gaps are the hardest kind to sense: for `sensed` the hard-gaps rate is below both the hard-islands rate and the hard-current rate.
* **N6** few hits: `sensed+fix` collides in at most 6 of the 60 hard-islands flights (this is also a part of the bar).
* **N7** the search is paid for in path, but not much: the median path over the chord of `sensed`'s arrivals (the three kinds pooled) is at most 1.2 times `exact`'s.

## What the result would not say

A sonar with noise, false returns or occlusion; a sonar that sees to the sides or behind; a different range or field of view (not swept: the numbers were derived, and a sweep is a later round); ships (they need a velocity estimate); a map kept from one mission to the next; a position fix that is anything but Gaussian and white, or drift that is anything but a Wiener process; any hull but the one the harder test used. A bar met on this generator is a statement about this generator's islands (14 to 24 m with satellites), icebergs, one-gap walls and currents, with a perfect sonar, which is a ceiling for the real one and not an estimate of it.

## What the study command will print

The reach, collisions, exits, time-outs, the median arrival time, the median path over the chord, the median minimum clearance, the map's coverage at the end (the share of the grid ensonified at least once) and the believed-to-true offset at the end, per kind and arm; the bar and the verdict; N1 to N7 held or missed.

## WHAT THE BUILD FOUND (2026-11-01; written after `brain/subSensedNav.mjs` and its gate existed and BEFORE any scenario of DEV or HELD6 was read as a result; the registration above is unchanged)

* **The sonar's map is cells, and the plan sees runs of them.** An occupied cell is a point 2.5 m wide to the plan, and a run of occupied cells along a row is the capsule between its end centres (`mapShapes`), which keeps the plan the same `buildLadderField` the harder test used (gated and sabotaged there) and costs about 10 ms a plan instead of 60. The price is that a run can be up to half a cell (2.5 m) fatter than the cells it joins. The map under-reads a disc by up to 3.5 m at its corners (a cell counts only if its CENTRE is inside), which the 4 m half-hull and the smallest rung's 3 m margin cover.
* **The heading is the true heading.** The sonar is pointed by the vessel's real heading; only the POSITION is wrong. A compass error is a different result.
* **The sonar sees through islands.** The registration said it ("no occlusion"); this is why every number from it is a ceiling.
* **The optimistic re-plan can flip sides.** Found building the gate: with an island dead on the vessel's line, every ping that revealed more of it re-solved a field in which going left and going right cost the same, the solver broke the tie differently each time, the target heading alternated by about 1.6 rad every second, the vessel stayed on the line and sailed into the island (the exact map's `any` arm, which plans once, goes round it). The generator's islands are not dead on the line, and the gate's island is 12 m off it, so this is a hazard of exact ties and not a thing HELD6 is built to measure; but a flight of HELD6 that shows the same dither (a target heading that changes sign at successive plans) will be a flight of this, and the result says so if it does. **No hysteresis was added**: the registered navigator is the one that replans on new information with no memory of the side it chose; a side-keeping rule is a candidate for a later round, not an amendment made after seeing the problem.

### AMENDMENT 1 (2026-11-01; DEV run once after the module, the study command and their gates were sabotaged, BEFORE HELD6 was flown; DEV is not a result and nothing above was changed by it)

`node tools/ship/subSensedStudy.mjs --set dev` (seeds 1 to 30 of each kind, 450 flights): reached of 30 in hard-islands / hard-gaps / hard-current: `straight` 6 / 3 / 5; `exact` 30 / 29 / 26; `sensed` 29 / 16 / 25; **`sensed+fix` 26 / 7 / 19**; `sensed+drift` 28 / 12 / 24. Pooled: `sensed+fix` 52 of 90, `sensed+drift` 64, `sensed` 70, `exact` 85. Collisions of `sensed+fix`: 4 / 23 / 6 (and 3 exits and 2 time-outs in hard-current).

Read for what it says, not tuned on: the flights end and the map fills (about 55% of the grid ensonified); the sensed arms beat no map everywhere and cost little path (1.07 against 1.04 of the chord); **the gaps are where sensing breaks** (`sensed` 16 of 30, with 14 collisions, a median least clearance of 0.5 m) and **the noisy fix is worse than drift** (N4 the other way round, N3 missed). A guess, not checked: because an occupied cell never clears, a fix error of 3 m registers each wall disc a few metres from the last, the walls fatten, and the gap is narrower on the map than in the water. By the registered rule the designated arm will clear the island bar and probably miss the gaps and current bars, which is NOT SUPPORTED; N3 and N4 are expected to be MISSED. The registration stands as written.

## RESULT OF THE SENSED MAP (2026-11-01; `node tools/ship/subSensedStudy.mjs --set held6 --write`, HELD6 = seeds 601 to 660 of each of hard-islands, hard-gaps and hard-current, read once; every flight is in `brain/subSensedHeld6.jsonl`, 900 records): **NOT SUPPORTED** under the registered rule -- the designated arm `sensed+fix` met the bar in ONE of the three kinds (hard-current, 78% against 70%) and missed it in hard-islands (78% against 80%, with 12 collisions against the 6 allowed) and in hard-gaps (**22% against 60%**).

The module, the study command and both gates were sabotaged first (138 mutants of the module, 135 red and 3 equivalent; 93 of the study command, all red; the logs are in the gate headers), DEV was flown once as a sanity run (Amendment 1, above) and HELD6 was flown once, as registered:

| kind | straight | exact | sensed | **sensed+fix** | sensed+drift |
|---|---|---|---|---|---|
| hard-islands | 20 / 60 (33%) | 60 (100%) | 56 (93%; 3 hits, 1 time-out) | **47 (78%; 12 hits, 1 left)** | 55 (92%; 4 hits, 1 left) |
| hard-gaps | 11 (18%) | 60 (100%) | 22 (37%; 38 hits) | **13 (22%; 47 hits)** | 21 (35%; 39 hits) |
| hard-current | 22 (37%) | 52 (87%; 6 hits, 1 left, 1 time-out) | 50 (83%; 8 hits, 2 time-outs) | **47 (78%; 8 hits, 2 left, 3 time-outs)** | 50 (83%; 8 hits, 2 time-outs) |
| the three together | 53 / 180 (29%) | 172 (96%) | 128 (71%) | **107 (59%)** | 126 (70%) |

About 53% of the grid was ensonified by the end of a flight (38% in the gaps, where the flights end early); the median believed-to-true offset at the end was 3.6 m for `sensed+fix` and 3.6 m for `sensed+drift`. The path was almost the same as the exact map's (a median 1.05 of the chord against 1.03).

**Bar.** hard-islands 78% < 80% and 12 collisions > 6: MISSED. hard-gaps 22% < 60%: MISSED. hard-current 78% >= 70%: HELD. One bar of three: **NOT SUPPORTED**. (Amendment 1 expected the island bar to clear on DEV's 26 of 30; HELD6's 47 of 60 missed it.)

**Predictions scored (moving nothing).** **N1 held** (`exact` reaches at least as many as `sensed` in every kind). **N2 held** (`sensed` beats `straight` in every kind). **N3 MISSED** (`sensed+fix` is 9 flights behind `sensed` in the islands and in the gaps). **N4 MISSED** (`sensed+drift` reaches 126 against `sensed+fix`'s 107: the OPPOSITE of the prediction). **N5 held** (the gaps are the kind `sensed` reaches least often, 37%). **N6 MISSED** (12 collisions in the islands). **N7 held** (the median path over the chord is 1.03 times `exact`'s, against the 1.2 allowed).

**Post hoc, from the 900 recorded flights and three re-flights (labelled: none of it was in the registration and none of it moves the verdict).**
* **Paired against `sensed` on the same 60 seeds** (exact two-sided sign test on the flights that differ): `sensed+fix` gained 1 and lost 10 in the islands (**p 0.012**), gained 0 and lost 9 in the gaps (**p 0.004**), gained 3 and lost 6 in the current (p 0.51); `sensed+drift` against `sensed` is 2 and 3, 1 and 2, 5 and 5 (p 1.0 in all three: **drift of this size costs nothing that 60 seeds can see**); `sensed` against `exact` is 0 and 4 in the islands (p 0.125), 0 and 38 in the gaps (**p < 0.001**), 3 and 5 in the current (p 0.73). **So the sonar map costs nothing measurable in the islands and the current, and everything in the gaps; and the noisy absolute fix is what costs the islands.** A guess for the second, not tested: an occupied cell never clears, the fix error puts the same island at a slightly different place at each ping, and the union is a fatter island.
* **The gaps break on the narrow ones.** By gap width, `exact` reaches 20 of 20 at 24, 32 and 40 m; **`sensed` reaches 1 of 20 at 24 m, 2 of 20 at 32 m and 19 of 20 at 40 m**; `sensed+fix` 0, 2 and 11; `sensed+drift` 1, 1 and 19.
* **It is not the cell map.** The same cell map filled by an OMNISCIENT sonar (range 1,000 m, all round, from the first ping) reaches **60 of 60** in the gaps (20 of 20 at each width), planning from the same cells with the same ladder. The representation and the plan from it are not the problem; **what the sonar has seen when the vessel commits to a heading is.**
* **What the failed flights look like.** I re-flew the first 12 failed `sensed` flights of the gaps and stopped each at the collision: each hit a wall disc whose cells were ALL in the map by then (51 of 51 cells, 70 of 70, and so on), after 31 to 66 plans; 11 of the 12 were 21 to 29 m short of the wall's centre line (about a disc radius: they hit the wall's FACE, not the gap's flank) and one at the centre line; in 9 of the 12 the target heading was 2.3 to 2.6 rad away from straight at the moment of the hit (the vessel was turning back or sideways) and in 3 it was about straight. That fits a vessel that first sees the gap too late to turn into it: with a 100 m range the wall is seen only within a lateral window of about +-80 m at 60 m from it and +-43 m at 90 m, a gap 50 to 100 m off the vessel's line is learned at 60 m or less, and a vessel with a 35 m turn radius that has to move 100 m sideways in 60 m hits the wall. **That is a reading of positions, not a test.** The registered range of 100 m was derived from the turn diameter and not from this geometry.
* **The dead-centre dither** (the build's finding: a target heading that changes sign at successive plans) shows in 0 to 4 sign changes in the last 20 s of those flights: present, not the cause.

**What this would not say.** That a sonar cannot find a gap: the range, the cone, the one-ping-a-second rate and the no-memory re-plan were registered and not varied. That the fix is the villain in general: `sensed+fix` is a white 3 m error drawn at each ping into a map that never forgets. That 60 of 60 with an omniscient sonar is a result for the real thing.

**What it leaves open (entered in `tools/ship/nextRounds.mjs` as `nav-sensed-see-the-gap` and `nav-sensed-fix-smear`).** A vessel that approaches a wall slowly enough, or at the right angle, to see the gap before it commits (a range and cone sweep, a slower approach, an exploration rule); an occupancy that forgets a cell when later pings find it free, or a fix that is filtered before the map is registered.
