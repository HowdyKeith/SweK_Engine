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

## FOLLOW-UP 2: SEE THE GAP, AND THE FIX SMEAR (Keith, 2026-11-01: "lets do nav-sensed-see-the-gap and nav-sensed-fix-smear"; REGISTERED BEFORE ANY CODE FOR THEM AND BEFORE THEIR SET IS FLOWN)

The result above left two things the data pointed at and did not test. **(1) The gaps:** `sensed` reached 1 and 2 of 20 gaps of 24 and 32 m (19 of 20 at 40 m) while the same cell map filled by an omniscient sonar reached 60 of 60, and the failed flights hit the face of a wall whose cells were all in the map by then. The post hoc reading is that the gap is seen too late to turn into. **(2) The fix:** `sensed+fix` (a white 3 m error at each ping into a map in which an occupied cell never clears) cost the islands 10 flights net against `sensed` (p 0.012) while a drift of 0.3 m per root second cost none. The post hoc guess is that the fix error puts the same island somewhere a little different at each ping and the sticky union is a fatter island. Both are guesses made after reading HELD6; this round tests them on a set nobody has read.

**Two studies, one set, nothing else changed.** The scenarios (`hardScenario`), the vessel, the autopilot, the margin ladder, the blocked edge, the optimistic plan with unknown water free, the re-plan after a change, the 260 s flight and the judging on the TRUE position and obstacles are as in the sensed-map registration above. **The set is HELD7 = seeds 701 to 760 of each of `hard-islands`, `hard-gaps` and `hard-current`** (180 scenarios; 20 gaps of each width), fresh (it shares no seed with DEV, HELD4, HELD5 or HELD6). Each study is a separate command with its own arms, its own bar, its own verdict and its own output file, and each is flown ONCE, after its code and gates are sabotaged; `sensed` and `exact` are flown in both (the same deterministic flights), so each study stands alone.

### Study 1: SEE THE GAP (`tools/ship/subSensedFollowStudy.mjs --study gap`)

The position is exact and the memory is sticky as before; **only the sonar changes**. Arms (the numbers are a grid chosen to bracket the cause, not tuned):
* `exact` (HELD4's `any`, the ceiling) and `sensed` (100 m, +-60 degrees, the incumbent, re-flown on fresh seeds).
* `sonar-150` (150 m, +-60), **`sonar-200` (200 m, +-60; designated)**, `sonar-wide` (100 m, +-90: the whole half-plane ahead), `sonar-200-wide` (200 m, +-90), `sonar-omni` (1,000 m, all round: the omniscient ceiling through the same cell map).

Why 200 m is the designated arm (derived, not tuned): the wall spans the whole 280 m of the region, and from 140 m away its two ends are 198 m from the vessel, so a range of 200 m is the shortest round number that shows the whole wall, and the gap in it, from 140 m out, which is far enough for a diagonal of 100 m across.

**Bar and verdict.** The designated arm reaches **at least 36 of 60 (60%) of hard-gaps** (the bar the incumbent was set in the first registration) and **loses no more than 3 flights against `sensed` in hard-islands or in hard-current** (a longer sonar must not hurt). **SUPPORTED** if both. **PARTLY SUPPORTED** if it fails either but reaches at least 10 more than `sensed` in hard-gaps. **NOT SUPPORTED** otherwise.

**Predictions (scored held or missed, moving nothing).** **D1** in hard-gaps the reach does not fall as the range grows: `sensed` <= `sonar-150` <= `sonar-200`. **D2** range is the lever and the cone is not: `sonar-wide` reaches fewer in hard-gaps than `sonar-200`. **D3** the ceiling holds on fresh seeds: `sonar-omni` reaches at least 57 of 60 in hard-gaps. **D4** `sonar-200` reaches at least 80% of what `sonar-omni` reaches in hard-gaps. **D5** the width pattern holds: for `sensed` the share of the 24 m and 32 m gaps reached (40 scenarios) is lower than the share of the 40 m gaps (20). **D6** the sonar does not cost path: the median path over the chord of `sonar-200`'s arrivals in hard-gaps is at most 1.2 times `exact`'s.

### Study 2: THE FIX SMEAR (`tools/ship/subSensedFollowStudy.mjs --study fix`)

The sonar is the incumbent's (100 m, +-60) and the fix is the white 3 m error of `sensed+fix`; **only what is done with the fix and the map changes.** Two new options of `flySensed`: **`forget`** (a cell inside the sector at a ping takes the occupancy that ping finds -- occupied or free -- instead of staying occupied for ever; cells outside the sector keep what they had; the plan is rebuilt after a ping that CHANGES the occupied set) and a **fix gain** (the believed position's error is updated as `error = (1 - K) x error + K x fix error`, K = 1 being the white fix of `sensed+fix`; the vessel is taken to know its own displacement exactly between fixes, so the error is only what the fixes put in). Arms:
* `sensed` (exact position: the target to recover), `sensed+fix` (white, sticky: the incumbent), **`fix+forget` (K = 1, forget; designated)**, `fix+filter` (K = 0.2, sticky), `fix+forget+filter` (both), and `sensed+drift` (the control: HELD6 found it indistinguishable from `sensed`).

K = 0.2 is a memory of about five pings; the error it leaves is 3 m x sqrt(0.2 / 1.8) = **1.0 m** (a third of the white one), derived, not tuned. `fix+forget` is the designated arm because it tests the guess directly (the smear is the sticky union); `fix+filter` tests the other cure (a smaller error), and the two together are reported.

**Bar and verdict.** The designated arm is **within 3 flights of `sensed` in each of the three kinds** (the fix no longer costs a measurable number of flights) **and reaches at least 5 more than `sensed+fix` over the three kinds together**. **SUPPORTED** if both. **PARTLY SUPPORTED** if it gains at least 5 over `sensed+fix` but is more than 3 behind `sensed` in some kind. **NOT SUPPORTED** otherwise.

**Predictions (scored held or missed).** **E1** forgetting helps where the fix cost most: `fix+forget` reaches more than `sensed+fix` in hard-islands. **E2** a smaller error helps there too: `fix+filter` reaches more than `sensed+fix` in hard-islands. **E3** the two together reach at least as many as either alone, over the three kinds. **E4** forgetting costs plans: the median number of plans a flight (three kinds together) of `fix+forget` is above that of `sensed+fix`. **E5** the control replicates: `sensed+drift` is within 5 flights of `sensed` in each kind. **E6** the gaps are the sonar's and not the fix's: in hard-gaps no fix arm (`sensed+fix`, `fix+forget`, `fix+filter`, `fix+forget+filter`) reaches more than 5 above `sensed`.

### What the two studies would not say

That a longer sonar is a better sonar in a sea with occlusion, noise or false returns (the sonar is perfect inside its sector, so a longer one is a longer perfect one); the cost of a longer, wider sonar (power, ping time); a behavioural approach to walls (slowing, a scan, an exploration rule: not in these arms and left to a later round); a fix that is anything but white Gaussian; forgetting with a real sonar's false returns (a perfect sonar never finds an occupied cell free by mistake, so forgetting is safe here and may not be elsewhere); and the interaction of the two (a long sonar with a noisy fix is not an arm). A result is a statement about this generator's walls and islands.

### AMENDMENT 1 TO FOLLOW-UP 2 (2026-11-01; DEV flown once for each study after the code and both gates were sabotaged, BEFORE HELD7 was flown; seeds 1 to 10 of each kind, 30 scenarios a study; DEV is not a result and nothing above was changed by it)

The flights end and the maps fill; both commands run end to end. Reached of 30 (three kinds together): gap study `exact` 29, `sensed` 25, `sonar-150` 28, **`sonar-200` 29**, `sonar-wide` 25, `sonar-200-wide` 29, `sonar-omni` 29 (the narrow gaps: `sensed` 0 and 2 of 5 at 24 and 32 m, every longer sonar 2 and 4); fix study `sensed` 25, `sensed+fix` 20, **`fix+forget` 23**, `fix+filter` 24, `fix+forget+filter` 21, `sensed+drift` 22. Ten seeds are too few to read a rate from; the registration stands as written and these numbers are not used for anything.

## RESULT OF FOLLOW-UP 2 (2026-11-01; HELD7 = seeds 701 to 760 of each of hard-islands, hard-gaps and hard-current, read once for each study; `node tools/ship/subSensedFollowStudy.mjs --study gap --set held7 --write` -> `brain/subSensedGapHeld7.jsonl` (1,260 flights) and `--study fix` -> `brain/subSensedFixHeld7.jsonl` (1,080 flights)). **SEE THE GAP: SUPPORTED. THE FIX SMEAR: PARTLY SUPPORTED.**

Both studies were sabotaged first (the module 194 mutants, 191 red and the 3 equivalents said earlier; the follow-up study command 154, all red; logs in the gate headers), DEV was flown on 10 seeds as a sanity run (Amendment 1 above) and HELD7 was flown once for each study, as registered.

### Study 1, SEE THE GAP: **SUPPORTED**

Reached of 60 (position exact, sticky memory, only the sonar changes):

| arm | hard-islands | hard-gaps | hard-current | three kinds | gaps by width (of 20): 24 m / 32 m / 40 m |
|---|---|---|---|---|---|
| exact | 60 | 56 | 56 | 172 | 16 / 20 / 20 |
| `sensed` (100 m, +-60) | 59 | **30** | 49 | 138 | 1 / 9 / 20 |
| `sonar-150` | 60 | 45 | 56 | 161 | 7 / 18 / 20 |
| **`sonar-200` (designated)** | 60 | **56** | 55 | **171** | **16 / 20 / 20** |
| `sonar-wide` (100 m, +-90) | 59 | 29 | 50 | 138 | 1 / 8 / 20 |
| `sonar-200-wide` | 59 | 56 | 54 | 169 | 16 / 20 / 20 |
| `sonar-omni` (1,000 m, all round) | 60 | 56 | 56 | 172 | 16 / 20 / 20 |

**Bar.** `sonar-200` reaches 56 of 60 (93%) of hard-gaps against the 60% asked: HELD. No harm: it reaches 60 against `sensed`'s 59 in the islands and 55 against 49 in the current (it gains; it does not lose): HELD. Gain over `sensed` in the gaps: +26 against the +10 asked: HELD. **SUPPORTED.**

**Predictions.** **D1 held** (30 <= 45 <= 56). **D2 held** (`sonar-wide` 29 against `sonar-200`'s 56: the cone is not the lever). **D3 MISSED**: `sonar-omni` reaches 56, not the 57 asked -- the floor was set from HELD6's 60 of 60, and on this set EVEN THE EXACT MAP fails four 24 m gaps (702, 711, 729, 732), so the ceiling here is 56. **D4 held** (`sonar-200` reaches all of the omniscient sonar's). **D5 held** (`sensed` reaches 10 of the 40 narrow gaps and all 20 of the 40 m ones). **D6 held** (path 1.02 of the exact map's).

**Post hoc (labelled; none of it moves the verdict).** In the gaps `sonar-200` against `sensed`: **26 flights gained, 0 lost** (exact sign test p < 0.0001); against `exact`: 1 and 1; against `sonar-omni`: 0 and 0 -- **on these 60 gaps a 200 m sonar reaches exactly what the omniscient one does**. `sonar-150` against `sensed`: 17 and 2 (p 0.0007). `sonar-wide` against `sensed`: 1 and 2 (p 1.0). The longer sonar also helped in the current (`sonar-150` 7 gained and 0 lost against `sensed`, p 0.016; `sonar-200` 7 and 1, p 0.07): **the 7 flights `sensed` lost to the exact map in the current were the range too.** Of the exact map's four failed gaps `sonar-200` fails three of the same (702, 729, 732) and one other (747).

### Study 2, THE FIX SMEAR: **PARTLY SUPPORTED**

Reached of 60 (the incumbent's sonar and white 3 m fix; only what is done with the fix and the map changes):

| arm | hard-islands | hard-gaps | hard-current | three kinds | median plans a flight |
|---|---|---|---|---|---|
| `sensed` (exact position: the target) | 59 | 30 | 49 | 138 | 50 |
| `sensed+fix` (white, sticky: the incumbent) | 55 | **9** | 43 | **107** | 54.5 |
| **`fix+forget` (designated)** | 58 | 27 | 53 | **138** | 80.5 |
| `fix+filter` (K = 0.2) | 56 | 26 | 50 | 132 | 53 |
| `fix+forget+filter` | 58 | 26 | 54 | 138 | 69 |
| `sensed+drift` (control) | 58 | 28 | 50 | 136 | 52 |

**Bar.** Gain: `fix+forget` reaches 138 against `sensed+fix`'s 107, **+31** against the +5 asked: HELD. Close to `sensed` in EACH kind (within 3 flights, either side): the islands 58 against 59 and the gaps 27 against 30 hold, but **the current is 53 against 49: four flights ABOVE `sensed`, and the registered test is two-sided**: MISSED. By the registered rule the verdict is **PARTLY SUPPORTED**. (Read one-sidedly -- "loses no more than 3 flights against `sensed`" -- it would be HELD in every kind and the verdict SUPPORTED. That is not the rule that was written, and it is said here so that nobody reads the first as a failure of the fix.)

**Predictions.** **E1 held** (58 against 55 in the islands). **E2 held** (56 against 55). **E3 held** (138, as many as `fix+forget` and more than `fix+filter`'s 132). **E4 held** (80.5 plans a flight against 54.5: forgetting costs about half as many plans again). **E5 held** (`sensed+drift` 136, within 5 of `sensed` in every kind). **E6 held** (no fix arm reaches more than 5 above `sensed` in the gaps).

**Post hoc (labelled).**
* **Paired against `sensed+fix`** (same 180 scenarios, the same fix errors): `fix+forget` gained 36 and lost 5 (**p < 0.0001**); in the islands 4 and 1 (p 0.38), in the gaps 21 and 3 (p 0.0003), in the current 11 and 1 (p 0.006). `fix+filter` gained 31 and lost 6 (p < 0.0001). Between the two cures: `fix+forget` 10 flights ahead and `fix+filter` 4 (p 0.18) -- not told apart -- and both together against forgetting alone 6 and 6.
* **Against the exact position:** `fix+forget` against `sensed` is 8 gained and 8 lost over the 180 scenarios (p 1.0): **a noisy fix with a map that forgets flies as well as a perfect fix**, as far as 60 scenarios a kind can say. `sensed+fix` against `sensed` was 0 and 21 in the gaps (p < 0.0001), 0 and 4 in the islands (p 0.125) and 3 and 9 in the current (p 0.15).
* **This replicates the cost and moves it.** HELD6 found the sticky white fix cost the ISLANDS most (10 net, p 0.012) and the gaps 9 (p 0.004); here it cost the GAPS 21 and the islands 4 (p 0.125). The sign is the same in every kind both times. The guess that an occupied cell that never clears fattens an island and narrows a gap is what a map that forgets, and nothing else, cures: **the smear is real, and the gaps feel it most because a 24 or 32 m gap closes when the walls on each side grow by a few metres.**

### What the two together say

* **The sonar's range was the cause of the HELD6 gap failure, and it is cheap to fix on this generator**: 200 m reaches what an omniscient sonar does. That is a statement about a PERFECT sonar; a real one's range is a power, a noise and a false-return question, and a longer one is a longer perfect one here.
* **The fix cost was the sticky union**, and forgetting recovers all of it on this set.
* **Not tested: the two fixes together** (a 200 m sonar with a noisy fix and forgetting), which is the vessel one would actually build. Entered as `nav-sensed-combined`.

### What this would not say

That a real sonar behaves like this: no noise, no false returns, no occlusion, a perfect heading. That forgetting is safe with false returns (a perfect sonar never finds an occupied cell free by mistake). That 56 of 60 is the rate: it is one set of 60, on which the exact map's own rate is 93%. That the gap study's SUPPORTED means the vessel is now as good as the exact map: it is as good in the gaps, within a few flights in the islands and the current, on this set.
