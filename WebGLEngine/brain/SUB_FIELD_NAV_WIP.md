# Flow-field waypoints for the submarine (round 3 of the 2026-10-31 list; UNNUMBERED; registered BEFORE any code is written or any HELD number is read)

Keith, 2026-10-31: "do the stateful fly pilot in the tank next, and then flow-field waypoints, and the GPU batch-size crossover". Round 2 (the pilot in the tank) is closed (`brain/TANK_PILOTS_WIP.md`). This is round 3. Round 4 (GPU batch-size crossover) has its own note.

## The question

The brain's flow-field navigator (`brain/flowfieldCpu.js`, an exact multi-source Dijkstra over a cost grid, written to be a drop-in for the GPU solver `brain/flowfield.js`) turns a map and a goal into a direction at every cell. The submarine's waypoint mission (`brain/missionTask.mjs`) points the PD autopilot (`brain/autopilotSub.mjs`) straight at the active waypoint and says in its header: "Obstacles are NOT modelled". **Does feeding the autopilot the field's direction instead of the straight bearing get the vessel to a waypoint through a field of obstacles, in still water and in a current, at what cost in path length, and what does it do to the margin to the obstacles?**

This is a guidance layer. The pilot underneath is the same PD autopilot in every arm; nothing is trained.

## What is built (all new files, none of the existing gates touched)

* `brain/subFieldNav.mjs` (pure): the scenario family `navScenario(seed, kind)`, the field builder `buildField(sc)` (a 96 x 56 grid of 5 m cells over x in [-40, 440], y in [-140, 140]; a cell is BLOCKED if its centre is within a disc's radius + INFLATE of the disc's centre; free cells are height 20 (above the solver's water level of 8, so no water penalty) and blocked cells height 40, solved with `impassDh = 10` so no shortest path crosses an obstacle, exactly the maze page's use of the solver), the field's heading at a point in two readings (`cell`: the nearest cell's flow vector; `smooth`: the four surrounding cell centres' flow vectors blended bilinearly), the three guidance arms and the flight loop `fly`.
* `tools/ship/subFieldNavStudy.mjs` (+ gate): the set, the table, the verdicts of this note.
* The live Sub Aquarium tank is NOT touched (see the end).

## The scenario

A region x in [-40, 440], |y| <= 140. The vessel is the Explorer (8 m long, 0.6 m radius, 3 m/s cruise) as in the waypoint mission. It starts near x = 0..20, y in [-40, 40], heading 0 (+x), depth in [20, 30]; ONE waypoint at x in [360, 400], y in [-80, 80], depth in [15, 40]. Between them, K = 3 to 6 full-depth OBSTACLE DISCS (a rock pillar, a wreck, a net: they reach every depth; the vessel cannot pass over or under them): radius in [14, 28] m, centre x in [90, 310], |y| <= 110, at least (r + 40) m from the start and the waypoint and at least 24 m of clear water between any two discs (so a route always exists). Seeds draw all of it from `mulberry`, as the waypoint mission does.
Two kinds: `nav` (still water) and `nav-current` (the waypoint mission's current: a mean of up to 0.4 m/s on each horizontal axis with eddies of 0.05 to 0.15 m/s, and a weight error of up to 0.6%). As in the waypoint mission **the vessel knows where it is (a perfect position fix) and the obstacle map is known exactly**: both are the optimistic halves of the task, said now.
A scenario is **blocked** if the straight segment from start to waypoint passes within (r + 14) m of any disc's centre, and unblocked otherwise.

## The arms

* `straight`: the waypoint mission's guidance (`waypointTarget`): the bearing to the waypoint, the waypoint's depth, 3 m/s.
* `field-cell`: the heading of the flow vector (fx, fz) at the cell holding the vessel (fz is world y, so the heading is atan2(-fz, fx)); the waypoint's depth and 3 m/s. A zero flow (the goal cell, a blocked cell, an unreachable cell) falls back to the straight bearing.
* `field-smooth`: the same, with the flow vector blended bilinearly from the four surrounding cell centres; if the blend is empty it falls back to `field-cell`, then to the straight bearing.
The field is solved ONCE per scenario, from the waypoint's cell. It does not know the current, the vessel's turning radius (about 35 m for a quarter turn at 3 m/s, measured) or the hull.

## The flight

200 s at 30 ticks a second (`S.DT`), the Explorer on the PD autopilot, the current of the scenario, the weight error of the scenario, no slew limits (as the waypoint mission with `actuators` null). It ends: REACHED when the vessel is within 10 m on the plane and 4 m in depth of the waypoint (the waypoint mission's own rule); COLLIDED when the vessel's centre is within r + 4 m of a disc's centre (4 m is half the hull's length: the whole hull is treated as a disc of radius 4, conservative); LEFT when it is outside the region; or TIMEOUT at 200 s. Measured: reached or not, the time of arrival, the path length flown (the sum of the horizontal steps), and the MINIMUM CLEARANCE (the least distance from the vessel's centre to a disc's edge, minus 4 m, over the flight, in metres; negative means collided).

## The sets, fixed now

DEV: seeds 1 to 12 of each kind, used while building and gating; no number from them is reported as a result. HELD: seeds 101 to 160 of each kind (60 scenarios per kind, 120 in all, each flown by 3 arms = 360 flights), **read once**, by the command, after the library and its gate are done and sabotaged. Parameters (CELL 5 m, INFLATE = 10 m = 4 m half-hull + 6 m margin, heights 20 and 40, impassDh 10, SECONDS 200) are fixed here and not tuned on HELD.

## Predictions, written before the HELD set is flown

* **R1** (mechanics, expected to hold): `straight` reaches at most 25% of the BLOCKED scenarios in still water (it flies into the first disc on its line) and at least 90% of the UNBLOCKED ones.
* **R2** (THE CLAIM): at least one field arm reaches the waypoint in at least 90% of the `nav` scenarios AND at least 80% of the `nav-current` scenarios.
* **R3** (the cost): on the still-water scenarios where both `straight` and the arm reach it (the unblocked ones, in practice), the MEDIAN ratio of the arm's path length to `straight`'s is at most 1.10 for `field-smooth` and at most 1.15 for `field-cell`.
* **R4** (direction): `field-smooth`'s median minimum clearance is at least `field-cell`'s, in both kinds.
* **R5** (direction): a field arm's success is lower in current than in still water.

**VERDICT RULE.** SUPPORTED if R2 holds for some field arm AND that arm meets its R3 bound. PARTLY SUPPORTED if R2 holds for some arm and that arm misses its R3 bound (it gets there, by a longer way than it should). NOT SUPPORTED if R2 fails for both arms. R1, R4 and R5 are scored as expectations (held / missed) and do not move the verdict. Every number comes from the command; no reading is made by hand.

## What a result would not say

One hull, one autopilot, no sensors (a perfect fix and an exact map), static round obstacles, a plan-view problem (depth is held, the obstacles reach every depth), a field that does not know the current or the turning radius, a 5 m grid, 60 scenarios a kind. It would not say that the field is a good way to navigate a vessel that has to MAP the obstacles first, or that the GPU solver would do the same (it approximates the same distance field with parallel passes and is not used here).

## NOT in this round, said now

The live Sub Aquarium tank has no obstacles and no goals (its subs wander); putting discs, a goal and a field-guided sub in it needs collision and drawing code that this round does not write. The GPU solver is not run. Dynamic or moving obstacles, a turning-radius-aware planner and the current in the field are not tried.

## Amendment 1 (made BEFORE the HELD set is flown; after a first look at DEV with the registered margin)

**What was seen.** A first run of the library on the original DEV set (seeds 1 to 12 of each kind, 24 scenarios) with the registered margin of 6 m: both field arms collided in 2 or 3 of 12 scenarios of each kind, and a trace of three collisions shows why: the field turns the commanded heading by 45 degrees (cmd -0.79 rad at an actual heading of 0.0) when the vessel is already at the edge of the inflated zone, and a vessel that needs about 35 m to turn a quarter-circle at 3 m/s cannot make a 6 m margin. The registration's 6 m was a guess written before the turning radius was weighed against it; it was named in "What a result would not say" ("a field that does not know ... the turning radius"). Nothing from HELD has been read.

**What changes.** (1) The margin is swept on DEV, over MARGINS = 6, 12, 18, 24, 30, 36 m (`node tools/ship/subFieldNavStudy.mjs --sweep`), DEV widened to seeds 1 to 30 of each kind (60 scenarios) so a difference is more than one flight. **Selection rule, fixed before the sweep is run: the margin M* is the one with the highest mean success over the two field arms and the two kinds on DEV; ties go to the smaller margin.** (2) The HELD set (seeds 101 to 160, unchanged) is flown ONCE, by the command, at M* (this is the PRIMARY read, and R2 to R5 and the verdict rule apply to it unchanged) and also at the registered 6 m (a SECONDARY read, labelled "as first registered"; it can move nothing). (3) The scenario generator still guarantees a route at the registered 6 m margin; a wider margin can close a gap between discs, and the field then has NO ROUTE from the vessel's cell and the arm falls back to the straight bearing; each run records `noRoute`, and the command counts them. (4) The straight arm and the scenarios are unchanged.

**What stays.** The arms, the flight, the sets' seeds, R1 to R5 and the verdict rule are as registered. If M* is large the cost in path length (R3) is likely to rise, and that is the trade the study is for.

**The sweep's answer (from a scratch script on the DEV set; the command that reproduces it comes with the study's gate): M\* = 12 m.** DEV mean success over the two field arms and both kinds: 6 m 0.742, **12 m 0.867**, 18 m 0.808, 24 m 0.817, 30 m 0.683 (4 of 30 scenarios of each kind have no route), 36 m 0.550 (8 to 11 of 30 have none). So the primary HELD read is at 12 m and the secondary at 6 m. The remaining DEV failures at 12 m are 2 to 7 collisions in 30 for each arm and kind; nothing further is tuned.
