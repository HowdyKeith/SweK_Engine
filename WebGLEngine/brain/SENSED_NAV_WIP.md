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
