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

## RESULT (2026-10-31; `node tools/ship/subFieldNavStudy.mjs --set held --write`, the HELD set read once; every flight is in `brain/subFieldNavHeld.jsonl`, 720 records): **NOT SUPPORTED** under the registered verdict rule and Amendment 1 -- field-smooth got there in 92% of still-water scenarios and in 78% of current ones (R2 asked for 90% and 80%: it missed the second by ONE scenario of 60, 47 against 48), and both field arms flew a median path 14% longer than the straight line where R3 asked for 10% (smooth) or 15% (cell)

PRIMARY read, margin 12 m (the margin the DEV sweep chose; 60 scenarios of each kind; the pilot is the PD autopilot in every arm):

| kind | arm | reached | collided | left | timed out | median path vs straight (pairs) | median least clearance |
|---|---|---|---|---|---|---|---|
| nav (still) | straight | 16/60 (27%) | 44 | 0 | 0 | - | -0.02 m |
| nav | field-cell | 43/60 (72%) | 2 | 0 | 15 | 1.14 (9) | 5.71 m |
| nav | **field-smooth** | **55/60 (92%)** | 1 | 0 | 4 | 1.14 (13) | 6.62 m |
| nav-current | straight | 11/60 (18%) | 49 | 0 | 0 | - | -0.03 m |
| nav-current | field-cell | 42/60 (70%) | 4 | 1 | 13 | 1.14 (7) | 7.70 m |
| nav-current | **field-smooth** | **47/60 (78%)** | 4 | 1 | 8 | 1.14 (9) | 7.78 m |

Straight in still water: 2 of 46 blocked scenarios, 14 of 14 unblocked. No route was missing at 12 m in any scenario.

Predictions scored: **R1 held** (blocked 2/46, unblocked 14/14). **R2 MISSED for both arms**: field-smooth 92% / 78%, field-cell 72% / 70%. **R3 missed for field-smooth** (1.14 against 1.10) **and held for field-cell** (1.14 against 1.15), which does not matter because field-cell missed R2. **R4 held** (smooth's median clearance is at least cell's in both kinds: 6.62 against 5.71 and 7.78 against 7.70, the second by a hair). **R5 held** (both arms do worse in current: cell 72 to 70, smooth 92 to 78). The verdict rule says NOT SUPPORTED because R2 failed for both; the near miss is said here and not hidden in a rounding.

SECONDARY read, the registered margin of 6 m (nothing in the verdict): field-cell 35% / 53% and field-smooth 62% / 60% reached, with 18 to 30 collisions in 60 for each arm: the guess of 6 m was wrong in the way the DEV trace showed (the field turns the heading by 45 degrees at the edge of the inflated zone and a vessel that needs about 35 m for a quarter turn cannot follow it). R5 missed there (the cell arm did better in current, 35% to 53%): the secondary read is noisier than the primary.

**What it says.**
* The brain's flow field, handed to the PD autopilot as a heading, does what the straight line cannot: it takes the vessel round the obstacles. Straight reaches the waypoint in 2 of the 46 blocked still-water scenarios; field-smooth at 12 m in 92% of all of them, with a median least clearance of 6.6 m (positive: it does not touch). It collides in 1 flight of 60 in still water and 4 of 60 in current.
* The margin matters more than the grid: 6 m collides in a third to half of the flights, 12 m in under 7%. The field does not know the turning radius; the margin is what pays for it.
* **POST HOC, not registered, not a test (the HELD set has been read and cannot confirm anything), from a throwaway script:** every one of the 40 timed-out field flights at 12 m (15 + 4 + 13 + 8) came within 25 m of the waypoint on the plane, with a median closest approach of 11 to 12 m against the 10 m capture circle -- and none was off in depth. They are near misses of the arrival rule, then circles the vessel cannot close. Counted as "reached or came within 25 m" field-smooth is 59/60 (98%) in still water and 55/60 (92%) in current, field-cell 58/60 and 55/60. Read as a hypothesis: the failures that cost the registered bar are the ARRIVAL (a heading quantised to 45 degrees weaves around the line, and a vessel with a 35 m turning radius that misses a 10 m circle by a metre cannot turn back), not the routing.
* The path is 14% longer than the straight line on the scenarios both reach (a median over 7 to 13 pairs a cell): part of that is the detour round the obstacles the straight line did not take, part is the weave of the 8-direction field. This study does not separate them.
* A saddle-point failure of the bilinear blend is pinned by the gate (a vessel dead on the line through a disc's centre: the two cells that straddle the line flow to opposite sides and their blend points at the disc); the HELD set does not say how often it bites.

**What it does not say.** The registration's list stands: a perfect fix and an exact map, static round obstacles, plan view with depth held, one hull and autopilot, a field that does not know the current. In addition: the margin was chosen on DEV and the secondary read shows the registered one failing, so the 92% is a tuned figure with one tuned parameter (a 60-scenario DEV set, six margins); 60 scenarios a kind is a 5-point step per scenario in the rates; and the post hoc paragraph is a hypothesis about arrival, nothing more.

**Correction to Amendment 1, item 3.** It said the scenario generator "still guarantees a route at the registered 6 m margin". The generator enforces no such thing: a reject-and-redraw guard that was written first never fired in 3,000 seeds and was removed as dead code. That a route exists at 6 m for every DEV and HELD seed is MEASURED, by a row of the library's gate.

**Not built, and what would be next (neither is registered).** An arrival rule (steer on the straight bearing, or on a lookahead point along the field's path, inside a radius of the waypoint, or a capture circle the vessel can hold); a smoother heading (a lookahead point on the path, or a low-pass on the commanded heading) to cut the weave; a margin that scales with the turning radius; the current in the field; the live Sub Aquarium tank (no obstacles or goals in it); the GPU solver (the CPU Dijkstra was the field here and was fast: 720 flights, the field builds included, in 11 s).

## FOLLOW-UP: THE ARRIVAL RULE (Keith, 2026-11-01: "build the arrival rule for the sub and test it"; REGISTERED BEFORE ANY CODE FOR IT AND BEFORE ITS SET IS FLOWN)

**Why.** The round's post hoc paragraph (from a throwaway script, on the HELD set already read) says all 40 timed-out field flights came within 25 m of the waypoint with a median closest approach of 11 to 12 m against the 10 m capture circle, and none was off in depth: the field heading is quantised to 45 degrees, the vessel weaves about the line and, with a turning radius near 35 m, cannot come back for a circle it missed by a metre. That was a hypothesis about the HELD data and could confirm nothing. This follow-up tests it on scenarios nobody has looked at.

**The rule.** Inside ARRIVAL_RADIUS = 30 m of the waypoint (on the plane) a field arm stops taking the field's heading and steers on the STRAIGHT BEARING to the waypoint, the waypoint mission's own guidance. The radius is derived, not tuned: the scenario generator keeps every disc's centre at least r + 40 m from the waypoint, so every disc's edge is at least 40 m from it, and the straight segment from any point within 30 m of the waypoint to the waypoint lies inside the 30 m circle and cannot cross a disc (a 4 m half-hull and a 6 m margin fit in the remaining 10 m). The rule is stateless (a function of the vessel's position), so it cannot chatter on a latch. Two variants: `+approach` (the heading only) and `+approach+slow` (the heading, and the speed target drops from the 3 m/s cruise to ARRIVAL_SLOW = 1.5 m/s inside the radius, so the turning circle shrinks; the autopilot's planes still have authority above its 0.8 m/s floor). The straight arm is unchanged (it never leaves the straight bearing). Arms of the follow-up: straight, and field-cell and field-smooth each plain, `+approach` and `+approach+slow` (7 arms). Both values (30 m, 1.5 m/s) are fixed here and are not tuned on any set.

**The sets.** DEV (seeds 1 to 30, already used) is flown once with the rule as a sanity check of the code, not as a result. The test set is NEW: **HELD2, seeds 201 to 260 of each kind (60 scenarios a kind, 120 in all), flown ONCE** at the primary margin of 12 m, after the library, the command and their gates are sabotaged. The plain arms are flown on HELD2 too, so every comparison is paired on the same scenarios. The rule's effect is read on HELD2 and never on the first HELD set.

**Predictions, written before HELD2 is flown.**
* **A1** (the hypothesis): each `+approach` variant reaches at least as many scenarios as its plain arm, in both kinds, for both field arms.
* **A2** (the size): field-smooth+approach times out in at most 2 of 60 scenarios in each kind (the plain arm timed out in 4 and 8 on HELD).
* **A3** (it only acts near the waypoint): collisions with the rule are no more than the plain arm's plus one, in each kind, for each field arm (inside 30 m there is nothing to hit).
* **A4** (direction): `+approach+slow` reaches at least as many as `+approach`, in both kinds, for both field arms.
* **A5** (the claim, the first registration's R2 and R3 unchanged): SOME field arm with SOME rule reaches at least 90% in still water and at least 80% in current, and its median path ratio against straight (on the still-water scenarios both reach) is at most 1.10 for a smooth arm and 1.15 for a cell arm.
**Verdict rule.** SUPPORTED if A5 holds. PARTLY SUPPORTED if some field arm with some rule meets the success bars and no such arm meets its path bound. NOT SUPPORTED if no field arm with a rule meets the success bars. A1 to A4 are scored held or missed and move nothing. If the rule helps but the weave keeps the path ratio above 1.10, the verdict says PARTLY and the number says by how much.

**What a result would not say.** The scenarios, the optimism (a perfect fix and an exact map) and the single hull and autopilot are the first registration's. A rule that works here is a rule for this capture circle (10 m) and this turning radius; it says nothing about a vessel that must also map the obstacles or find the waypoint.

## RESULT OF THE ARRIVAL RULE (2026-11-01; `node tools/ship/subFieldNavStudy.mjs --set held2 --write`, HELD2 = seeds 201 to 260 of each kind, read once; every flight is in `brain/subFieldNavHeld2.jsonl`, 840 records): **PARTLY SUPPORTED** under the registered rule -- the success bars hold for three of the four arrival arms and the path bound is missed by all four

Margin 12 m, the PD autopilot in every arm, 60 scenarios of each kind:

| kind | arm | reached | collided | left | timed out | median path vs straight (pairs) |
|---|---|---|---|---|---|---|
| nav (still) | straight | 15/60 (25%) | 45 | 0 | 0 | - |
| nav | field-cell | 52/60 (87%) | 0 | 0 | 8 | 1.149 (15) |
| nav | field-cell +approach | 59/60 (98%) | 0 | 0 | 1 | 1.152 (15) |
| nav | field-cell +approach+slow | 50/60 (83%) | 0 | 0 | 10 | 1.15 (13) |
| nav | field-smooth | 57/60 (95%) | 0 | 0 | 3 | 1.135 (13) |
| nav | **field-smooth +approach** | **60/60 (100%)** | 0 | 0 | 0 | 1.132 (15) |
| nav | field-smooth +approach+slow | 57/60 (95%) | 0 | 0 | 3 | 1.13 (15) |
| nav-current | straight | 15/60 (25%) | 45 | 0 | 0 | - |
| nav-current | field-cell | 46/60 (77%) | 4 | 1 | 9 | 1.15 (12) |
| nav-current | field-cell +approach | 49/60 (82%) | 4 | 1 | 6 | 1.15 (12) |
| nav-current | field-cell +approach+slow | 48/60 (80%) | 4 | 1 | 7 | 1.15 (13) |
| nav-current | field-smooth | 52/60 (87%) | 5 | 1 | 2 | 1.12 (14) |
| nav-current | **field-smooth +approach** | **53/60 (88%)** | 5 | 1 | 1 | 1.12 (14) |
| nav-current | field-smooth +approach+slow | 50/60 (83%) | 5 | 1 | 4 | 1.12 (14) |

Predictions scored: **A1 held** (+approach reaches at least as many as its plain arm, both field arms, both kinds). **A2 held** (field-smooth+approach times out in 0 and 1 of 60). **A3 held** (collisions do not rise: they are 0 / 0 in still water and 4 / 5 in current for the plain and the +approach arms alike). **A4 MISSED**: `+approach+slow` is WORSE than `+approach`, in both families and both kinds. **A5, the claim: PARTLY SUPPORTED** -- the success bars (90% still, 80% current) hold for field-cell+approach (98% / 82%), field-smooth+approach (100% / 88%) and field-smooth+approach+slow (95% / 83%), and fail for field-cell+approach+slow (83% / 80%); the path bound (median ratio at most 1.10 for smooth, 1.15 for cell) is missed by all four: smooth at 1.13, and cell+approach at 1.1515 -- over its bound by 0.0015, the table's "1.15" is that rounded.

**The effect of the rule, paired on the same scenarios (computed from the flight file after the verdict, not registered):** `+approach` turned 7 scenarios the plain field-cell missed into arrivals in still water (0 lost) and 3 the plain field-smooth missed (0 lost); in current 4 and 1 gained, 1 lost (field-cell, a timeout). So in still water it removed all but one of the near-miss timeouts (field-cell 8 to 1, field-smooth 3 to 0). In current it removed few: field-cell 9 timeouts to 6, field-smooth 2 to 1, and **the collisions (4 to 5 of 60) are exactly the plain arms'**, because the rule acts in the last 30 m and those collisions happen on the way, in a current the field does not know about.

**What it says.**
* The hypothesis holds in still water: the plain arms' failures were arrivals, and a straight final approach inside 30 m takes field-smooth from 95% to 100% and field-cell from 87% to 98% on scenarios nobody had read, with nothing lost and nothing hit.
* **Do not read the bars alone**: on HELD2 plain field-smooth already clears the registered bars (95% / 87%, against 92% / 78% on HELD), so these 60 seeds are easier for the plain arm than the first 60 were. The paired counts above are what the rule did.
* In a current the rule helps a little and the field arms' remaining failures are collisions and a few timeouts, which are not arrival failures. That points at the field not knowing the water's set (a crab angle, a margin that grows with the current, or the current in the cost) and not at the last 30 m.
* **Slowing the approach does not help and often hurts** (A4): slowing lost 14 flights the plain arm reached (9 in still water, 6 of them field-cell and 3 field-smooth; 5 in current), all of them timeouts, and the timeout is not the 200 s limit (the plain arm reached those scenarios at 133 to 167 s, the slow arm adds a median of 4 s). Why is not diagnosed here: a vessel at 1.5 m/s has less rudder authority (the autopilot's plane gains are scheduled on V squared), which would not make its circle smaller; this is a guess, not a finding.
* The path is as long as before (median 1.13 to 1.15 of the straight line on the scenarios both reach): the rule does not touch the weave en route or the detour round the obstacles, and a smoother heading would be the next thing to try if the path matters.

**What it does not say.** That the 30 m radius is right anywhere the waypoint is not 40 m clear of every obstacle (it is derived from this generator's clearance). That the rule helps a vessel without a perfect position fix. The first registration's list (a perfect fix and an exact map, static round obstacles, one hull) stands.

**Not built, said:** a smoother heading or lookahead point to cut the weave; a margin or crab angle that knows the current; the tank.

## FOLLOW-UP 2: THE SMOOTHER HEADING (Keith, 2026-11-01: "try the smoother heading to cut the path length"; REGISTERED BEFORE ANY CODE FOR IT AND BEFORE ITS SET IS FLOWN)

**Where the extra path comes from (POST HOC, from the HELD2 flights already read, nothing registered on it).** On the 9 still-water scenarios where the straight line was clear AND straight arrived, field-smooth+approach flew a median 1.127 of the straight line and field-cell+approach 1.152; on the 6 where the line was within the blocked test and straight still arrived, 1.145 and 1.154. So most of the excess is not the detour round the obstacles; it is the field itself. The solver expands 4 neighbours, so its distance is a Manhattan one and its 8-direction flow goes diagonal-then-straight (an L), not along the straight line, and the vessel weaves about that. That is what a smoother heading should remove.

**The smoother heading (`field-any`).** An ANY-ANGLE AIM POINT from the field, in the manner of Theta*: for every reached cell the field already knows the next cell on its shortest grid path. Process the cells in increasing distance from the waypoint; the waypoint's own cell aims at the waypoint; any other cell c with next cell n aims at n's aim point if the straight segment from c's centre to that point crosses no BLOCKED cell (sampled every 2 m, finer than the 5 m cell), and at n's centre otherwise. The result is, per cell, the farthest point along the grid path that is visible in a straight line through free (inflated) water, so in an open sea every cell aims straight at the waypoint, and round an obstacle the aim point is the corner of the inflated zone. The vessel steers on the bearing to the aim point of the cell it is in. Stateless (a function of position, built once per scenario, like the field), no tuning parameter. A cell without an aim point falls back to the field-cell heading, then to the straight bearing. `field-any+approach` adds the arrival rule of the first follow-up (the straight bearing inside 30 m).

**The arms and the sets.** Straight; field-smooth+approach (the incumbent: the best plain-field arm of follow-up 1); field-any; field-any+approach. The test set is NEW: **HELD3, seeds 301 to 360 of each kind (60 a kind, 120 in all), flown ONCE**, after the library, the command and their gates are sabotaged. Two margins are fixed here, not tuned: 12 m (PRIMARY, the amended margin of the first study) and 18 m (SECONDARY, labelled: an any-angle path hugs the inflated corners and may need more room; it moves nothing in the verdict). DEV (seeds 1 to 30) is flown once for a sanity check of the code and is not a result.

**What is measured, beyond the old summary.** The median path ratio against straight on the still-water scenarios both reach, now split into the scenarios whose straight line is CLEAR (`blocked` false) and those where it is not; and the per-scenario ratio of an any-angle arm's path to the incumbent's on the scenarios both reach.

**Predictions, written before HELD3 is flown.**
* **B1** (the claim): some any-angle arm reaches at least 90% in still water and at least 80% in current (the success bars of the first registration) AND its median path ratio against straight on the still-water scenarios both reach is at most 1.10 (the bound that field-smooth missed at 1.13).
* **B2** (it should fly the line when the line is clear): field-any's median ratio on the still-water scenarios with a CLEAR straight line is at most 1.02.
* **B3** (it is shorter than the incumbent): the median per-scenario ratio of each any-angle arm's path to field-smooth+approach's, on the still-water scenarios both reach, is below 1.
* **B4** (what it risks): each any-angle arm has no more than 2 more collisions than the incumbent in each kind.
* **B5** (direction): each any-angle arm's median least clearance is below the incumbent's in each kind (it hugs the corners).
* **B6**: field-any+approach reaches at least as many as field-any, in each kind.
**Verdict rule.** SUPPORTED if B1 holds for some any-angle arm. PARTLY SUPPORTED if some any-angle arm meets the success bars and none meets the path bound (it is shorter, the number says by how much, but not as short as asked). NOT SUPPORTED if no any-angle arm meets the success bars (shorter paths bought with a worse arrival rate are not a pass). B2 to B6 are scored held or missed and move nothing.

**What a result would not say.** The first registration's list stands (a perfect fix and an exact map, static round obstacles, one hull). The any-angle aim point is built from an exact map of the obstacles; a vessel that has to find them is another problem. A shorter path in this tank is not shown to be a faster or a safer one.

## RESULT OF THE SMOOTHER HEADING (2026-11-01; `node tools/ship/subFieldNavStudy.mjs --set held3 --write`, HELD3 = seeds 301 to 360 of each kind, read once; every flight is in `brain/subFieldNavHeld3.jsonl`, 960 records): **SUPPORTED** -- the any-angle aim point reached the waypoint in 60 of 60 scenarios in still water AND in 60 of 60 in current, with no collision, on a path 10% shorter than the incumbent's

Margin 12 m (PRIMARY), the PD autopilot in every arm, 60 scenarios of each kind:

| kind | arm | reached | collided | left | timed out | median path vs straight (pairs) | median least clearance |
|---|---|---|---|---|---|---|---|
| nav (still) | straight | 12/60 (20%) | 48 | 0 | 0 | - | -0.02 m |
| nav | field-smooth +approach (the incumbent) | 59/60 (98%) | 1 | 0 | 0 | 1.14 (12) | 7.45 m |
| nav | **field-any** | **60/60 (100%)** | 0 | 0 | 0 | 1.00 (12) | 13.94 m |
| nav | field-any +approach | 60/60 (100%) | 0 | 0 | 0 | 1.00 (12) | 13.94 m |
| nav-current | straight | 17/60 (28%) | 43 | 0 | 0 | - | -0.02 m |
| nav-current | field-smooth +approach | 54/60 (90%) | 2 | 0 | 4 | 1.13 (16) | 8.53 m |
| nav-current | **field-any** | **60/60 (100%)** | 0 | 0 | 0 | 1.00 (17) | 14.30 m |
| nav-current | field-any +approach | 60/60 (100%) | 0 | 0 | 0 | 1.00 (17) | 14.30 m |

Predictions scored: **B1 held** for both any-angle arms (100% / 100%, median path ratio 1.00 against the bound 1.10; the verdict names both). **B2 held** (on the scenarios with a clear straight line field-any's ratio is 1.00, bound 1.02; the incumbent's is 1.14 in still water and 1.11 in current). **B3 held** (against the incumbent's, the per-scenario median is 0.90 in both kinds: ten percent shorter). **B4 held** (0 collisions against the incumbent's 1 and 2). **B5 MISSED, and the other way round**: I predicted the any-angle path would hug the corners and come closer; its median least clearance is 13.9 m and 14.3 m against the incumbent's 7.5 m and 8.5 m, and the smallest clearance in ANY any-angle flight is 3.5 m (the incumbent's touched). Why is not diagnosed; a guess is that the cell-by-cell arm cuts the diagonal across the inflated zone's staircase and weaves into it, where the aim point is the zone's corner point itself, approached in a straight line. **B6 held** (field-any+approach reaches as many as field-any), **by identity: all 120 pairs of flights are identical to the digit** -- inside 30 m of the waypoint an any-angle cell already aims at the waypoint, so the arrival rule of follow-up 1 is subsumed and does nothing here.

SECONDARY read, margin 18 m (reads nothing into the verdict): field-any 58/60 and 58/60, the incumbent 57/60 and 56/60; the verdict block says SUPPORTED too. The misses are all `left` (the vessel left the region): scenarios 301, 330, 338 (still) and 313, 318 (current), the SAME scenarios for every arm that was flown, so the cause is the wider margin's field and not an arm: the region's edge is not an obstacle in the field, and at 18 m the cheapest route in those five scenarios runs out over it. The field should block the edge before a margin above 12 m is trusted.

**POST HOC, not registered, computed from the flight file after the verdict (a throwaway script):** the path ratio against STRAIGHT can only be read where straight arrived, which is where the line is nearly clear (12 and 17 scenarios here), so the table's 1.00 says "no excess where nothing is in the way". A fairer yardstick is the path over the START-TO-WAYPOINT CHORD for every flight that arrived, split by whether straight actually collided (a real obstruction): field-any 1.011 (still, 48 obstructed scenarios) and 1.037 (current, 43), against the incumbent's 1.130 and 1.141; where straight got through, 0.979 and 0.986 against 1.106 and 1.102 (below 1 because the flight ends inside the 10 m capture circle). So the detour round these obstacles is a few percent of the chord and nearly all of the old arms' 13 to 15% was the field's own staircase and weave, as the HELD2 split suggested.

**What it says.** A smoother heading does what was asked and more: the any-angle aim point, built from the field the brain already solves, takes the path from 13 to 15% over the straight line to about 1% over it where it is clear and a few percent where it is not, and it also reaches the waypoint every time on 120 scenarios nobody had read, in a current, with more room to the obstacles.

**What it does not say, and where it is soft.** (1) **A ceiling.** 100% twice, and 30 of 30 on DEV: this set cannot tell how much margin the arm has left; the next test is a harder one (denser obstacles, narrower gaps, a stronger or unmodelled current), registered before it is flown. (2) The map is exact, the position is a perfect fix and the obstacles are static discs; the aim point trusts all three. A current stronger than the 0.57 m/s of this family may push a vessel that is flying a straight chord at an inflated corner with less room than the staircase gave it. (3) The margin of 12 m was chosen on DEV for the cell arms and was not swept for this one; 18 m was no better here, for the reason above. (4) The result is for this vessel and this autopilot: the aim point asks for sharper heading changes at corners than the cell field did, and a vessel that turns slower than the Explorer might not make them. (5) The path ratio against straight reads only the easy scenarios; the chord split above is post hoc.

**Not built, said:** blocking the region's edge in the field; a harder scenario family; the current in the field; the tank.

## FOLLOW-UP 3: THE HARDER NAVIGATION TEST (Keith, 2026-11-01: "start with the harder navigation test ... navigation would include icebergs, islands, other ships"; REGISTERED BEFORE ANY CODE FOR IT AND BEFORE ITS SET IS FLOWN)

**Why.** Follow-up 2 ended on a ceiling (any-angle guidance 60 of 60 twice, 30 of 30 on DEV): that set cannot tell how much margin the arm has left. This round builds scenarios on which it can fail, and says in advance where I expect it to.

**Is the ship-vs-ship match navigation?** Not in itself: `brain/spaceArena.mjs` scores combat (hits, ram damage), and a pilot there can win without reaching any place. It contains navigation, and other vessels as moving obstacles belong to it; they are in this test as TRAFFIC. The match could later consume the layer built here (backlog).

**What is new (all in a new module `brain/subHardNav.mjs`; `brain/subFieldNav.mjs` is not edited).**
* **Islands**: full-depth blobs of two or three overlapping discs (an irregular outline). **Icebergs**: a disc with a KEEL (depth of its lowest point, 6 to 36 m). The vessel collides only if the horizontal gap is negative AND its top (depth minus its 0.6 m radius) is above the keel; below the keel it passes. The planner blocks an iceberg iff keel + 5 m (VMARGIN) exceeds the shallower of the start depth and the waypoint depth; the `any-blind` arm ignores keels and blocks every iceberg.
* **Narrow gaps**: a wall of overlapping discs (radius 20 to 26 m) across the whole region with ONE gap whose edge-to-edge width on the line of centres is exactly 42, 56 or 70 m (seed mod 3: 20 seeds each of a 60 set). At the 12 m margin the planner's free corridor is gap minus 32 m: 10, 24, 38 m.
* **Traffic**: 2 to 4 other vessels, discs of radius 8 to 14 m with a keel of 18 to 60 m, moving at constant velocity 0.8 to 3.0 m/s on a course that CROSSES the vessel's nominal track at a time 20 to 110 s after the start, offset from it by up to 30 m (so most are real encounters). Rejected: a start within r + 50 m of the vessel's start, a track within r + 40 m of the waypoint at any time up to 290 s, a track within r_ship + r_obstacle + 6 m of a static obstacle. They do not react to the vessel (no right-of-way rules). Plus 2 to 3 static icebergs.
* **Strong, unmodelled current**: the islands layout with a mean of up to 0.8 m/s on each horizontal axis (kinds in follow-ups 1 and 2: 0.4), an unsteady part of 0.15 to 0.4 m/s, a weight error up to 0.6%; the field does not know it. The time limit is 260 s here (200 before), because a head current of 0.8 m/s costs a quarter of the speed.
* **The region edge is blocked in the field** (cells within half-hull + margin of the boundary), the fix follow-up 2 left open.
* **Kinds**: `hard-islands` (2 to 4 islands + 2 to 4 icebergs, still water), `hard-gaps`, `hard-traffic`, `hard-current` (the islands layout, drawn from its own stream, in the strong current). Start, waypoint, region, vessel, autopilot and hull: as before.

**Arms** (every field arm is built from the same hard field; margin 12 m, fixed, NOT swept; the arrival rule is left out because an any-angle cell already aims at the waypoint inside 30 m, the identity follow-up 2 measured):
* `straight`; `smooth+approach` (the incumbent: bilinear field heading + the 30 m straight approach) ; `any` (the any-angle aim point, a plan built ONCE at t = 0, ships frozen at their t = 0 positions); `any-blind` (as `any`, every iceberg blocks); `any+replan` (the plan rebuilt every 3 s (REPLAN_S) with each ship at its CURRENT position); `any+predict` (rebuilt every 3 s with each ship as the capsule it will sweep in the next 30 s (HORIZON_S) at its current velocity). In the two replanning arms the cells within 15 m of the vessel are never blocked (OWN_CLEAR), so a ship's zone cannot take away the vessel's own way out. Where there are no ships `any+replan` and `any+predict` are the same flights as `any` and are not flown (the gate shows the identity). A rebuild costs about 14 ms measured on this box (field 5 ms, aim points 9 ms).
* Flown: hard-islands and hard-current: straight, smooth+approach, any, any-blind. hard-gaps: straight, smooth+approach, any (no icebergs, so no blind arm). hard-traffic: straight, smooth+approach, any, any+replan, any+predict.

**The set.** NEW: **HELD4, seeds 401 to 460 of each kind (240 scenarios), flown ONCE**, after the module, the command and their gates are sabotaged. DEV (seeds 1 to 30) is flown once as a sanity run of the code and is not a result. If DEV shows a GENERATOR to be degenerate (a kind in which nothing or everything gets through for a reason that is the generator's), I amend the generator BEFORE HELD4 is read and write the amendment here; nothing is changed after.

**Designated arms and bars (fixed here, so that no arm is picked after the fact).** hard-islands: `any`, reaches at least 90% (54 of 60) with at most 3 collisions. hard-gaps: `any`, at least 80% (48). hard-traffic: `any+predict`, at least 80%. hard-current: `any`, at least 80%.

**Predictions, written before HELD4 is flown.**
* **H1**: `straight` reaches at most 30% in every kind.
* **H2**: `any` reaches at least as many as `smooth+approach` in every kind.
* **H3** (keels are worth using): in hard-islands `any`'s median path is at most `any-blind`'s on the scenarios both reach (ratio at most 1.00) AND `any` has at most 2 more collisions than `any-blind`.
* **H4** (gaps): `any`'s reach rate does not fall as the gap widens (42 m <= 56 m <= 70 m) and is at least 90% at 70 m.
* **H5** (traffic): reached(`any+replan`) exceeds reached(`any`) by at least 5 scenarios; reached(`any+predict`) is at least reached(`any+replan`); collisions(`any+predict`) are at most collisions(`any+replan`).
* **H6**: `any` reaches strictly fewer in hard-current than in hard-islands.
* **H7**: no field arm has more than 3 `noRoute` scenarios (the plan says there is no way) in any kind.
* **H8**: no field arm ever `left` the region, in any kind.

**Verdict rule.** SUPPORTED if all four designated arms meet their bars. PARTLY SUPPORTED if hard-islands meets its bar and at least one other kind does. NOT SUPPORTED otherwise (hard-islands failing, or no other kind passing). H1 to H8 are scored held or missed and move nothing. The tables also carry, per kind, the reached/collided/left/timed out/noRoute counts, the median least clearance and the median path over the start-to-waypoint chord for flights that arrived; per gap width the reach rate; the hard-traffic collisions by ship speed (below and above 2 m/s) and hard-current by the size of the mean current (below and above 0.6 m/s), labelled as read from the file and not registered as predictions.

**What a result would not say.** The first registration's list stands: a perfect position fix, an exact map, one hull, one autopilot. The ships' velocities are known to the planner exactly and constant; real traffic turns, hides and answers. The current is not in the field. The margin was not swept for this family. The ships do not take the vessel's presence into account, so a collision count is not a statement about right-of-way. Nothing here is about the ship-vs-ship match. A family built by me with these parameters is not the sea.

### AMENDMENT 1 TO FOLLOW-UP 3 (2026-11-01; made on DEV after the module's first run, BEFORE HELD4 was read or any gate for the module existed; DEV is not a result)

The DEV sanity run (30 seeds of each kind, the parameters registered above) put `any` at 29 of 30 in hard-islands, **30 of 30 in hard-gaps (and the incumbent too: the narrowest corridor, 10 m at the 12 m margin, was wide enough for every layout)** and 28 of 30 in hard-current: the ceiling follow-up 2 ended on, for a reason that is the generator's. Three changes, each made ONCE and not tuned further:
1. **Gap widths 24, 32 and 40 m** (seed mod 3; the free corridor at the 12 m margin is then negative, negative and 8 m).
2. **The margin ladder**: every field arm builds its plan at the first margin of **12, 8, 6, 3 m** that leaves a route from the vessel's own cell (the replanning arms repeat this at every rebuild, from where the vessel is), so a wide margin cannot close a gap the vessel could pass. The margin is therefore "12 m unless that closes the way", not "fixed at 12". The record of a flight carries the margin its first plan was built at.
3. **The current**: a mean of up to 1.2 m/s on each horizontal axis (was 0.8) and an unsteady part of 0.2 to 0.5 m/s (was 0.15 to 0.4). The split in the tables is now at a mean of 1.0 m/s, not 0.6.

DEV after the amendment (30 seeds a kind; read for sanity, not tuned on, not a result): hard-islands `any` 30, incumbent 28; hard-gaps `any` 29, incumbent 22; hard-traffic straight 2, incumbent 12, `any` 7, `any+replan` 16, `any+predict` 19 (1 of those left the region); hard-current `any` 26 (3 collisions, 1 timeout), incumbent 23. **I expect hard-traffic to MISS its 80% bar** (DEV: 19 of 30), and hard-islands to be at or near its ceiling. The bars, the designated arms, H1 to H3 and H5 to H8 and the verdict rule stand as registered; H4 now reads: `any`'s reach rate does not fall as the gap widens (24 m <= 32 m <= 40 m) and is at least 90% at 40 m.

## RESULT OF THE HARDER NAVIGATION TEST (2026-11-01; `node tools/ship/subHardNavStudy.mjs --set held4 --write`, HELD4 = seeds 401 to 460 of each of the four kinds, read once; every flight is in `brain/subHardNavHeld4.jsonl`, 960 records): **PARTLY SUPPORTED** -- the designated arm met its bar in hard-islands (97%, 2 collisions), hard-gaps (98%) and hard-current (93%), and MISSED it in hard-traffic (`any+predict` 72% against 80%)

The module's gate has 176 mutants (172 red by name) and the study's has 88 (87 red by name); the amended parameters of Amendment 1 (gaps 24/32/40 m, the margin ladder 12/8/6/3 m, the current to 1.2 m/s) were flown as amended. 60 scenarios of each kind, the PD autopilot in every arm, 260 s a flight:

| kind | arm | reached | collided | left | timed out | median path / chord | median least clearance |
|---|---|---|---|---|---|---|---|
| hard-islands | straight | 20/60 (33%) | 40 | 0 | 0 | 0.97 | -0.02 m |
| | smooth+approach | 56/60 (93%) | 4 | 0 | 0 | 1.12 | 7.76 m |
| | **any** (designated) | **58/60 (97%)** | 2 | 0 | 0 | 1.02 | 14.26 m |
| | any-blind | 58/60 (97%) | 2 | 0 | 0 | 1.04 | 13.10 m |
| hard-gaps | straight | 18/60 (30%) | 42 | 0 | 0 | 0.97 | -0.02 m |
| | smooth+approach | 46/60 (77%) | 14 | 0 | 0 | 1.13 | 3.61 m |
| | **any** (designated) | **59/60 (98%)** | 1 | 0 | 0 | 1.00 | 9.37 m |
| hard-traffic | straight | 10/60 (17%) | 50 | 0 | 0 | 0.97 | -0.04 m |
| | smooth+approach | 18/60 (30%) | 42 | 0 | 0 | 1.11 | -0.03 m |
| | any (frozen plan) | 12/60 (20%) | 48 | 0 | 0 | 0.99 | -0.03 m |
| | any+replan | 33/60 (55%) | 26 | 1 | 0 | 1.08 | 1.09 m |
| | **any+predict** (designated) | **43/60 (72%)** | 9 | **8** | 0 | 1.34 | 17.52 m |
| hard-current | straight | 19/60 (32%) | 41 | 0 | 0 | 1.03 | -0.02 m |
| | smooth+approach | 48/60 (80%) | 9 | 0 | 3 | 1.17 | 8.63 m |
| | **any** (designated) | **56/60 (93%)** | 4 | 0 | 0 | 1.09 | 10.46 m |
| | any-blind | 54/60 (90%) | 5 | 0 | 1 | 1.11 | 10.11 m |

No scenario had `noRoute` for any field arm: the ladder found a way from the start's cell every time (the plan was at 12 m in all 60 hard-islands scenarios; in hard-gaps at 12 m for the 40 m gaps, 8 m for the 32 m ones and 6 m (17) or 3 m (3) for the 24 m ones). By gap width (reached of 20): 24 m: straight 6, smooth+approach 6 (14 hit), **any 19** (1 hit); 32 m: 5, 20, 20; 40 m: 7, 20, 20. By the fastest ship in hard-traffic (above 2 m/s = fast, 48 scenarios; slow, 12): `any+predict` 35/48 (8 hit) fast and 8/12 (1 hit) slow; `any+replan` 23/48 (24 hit) and 10/12 (2 hit); the frozen plan 9/48 (39 hit) and 3/12. By the mean current in hard-current (above 1 m/s = strong, 26 scenarios; weak, 34): `any` 25/26 (1 hit) and 31/34 (3 hit); the incumbent 20/26 and 28/34.

**Predictions scored.** **H1 MISSED**: straight reaches 33% in hard-islands and 32% in hard-current, over the 30% bound (30% in hard-gaps, exactly at it; 17% in hard-traffic): a straight line misses a layout of 4 to 8 obstacles about a third of the time. **H2 MISSED, in hard-traffic only**: `any` with a plan frozen at t = 0 reaches 12 and the incumbent 18 (it holds in the other three kinds: 58 against 56, 59 against 46, 56 against 48). **H3 HELD, at its bound by identity**: any's path over any-blind's is 1.00 and any has no more collisions (2 and 2); the median is 1.00 because 26 of the 57 paired flights are the same flight to the digit (see the post hoc line below). **H4 HELD**: 95% / 100% / 100% for 24 / 32 / 40 m. **H5 HELD**: replan beats the frozen plan by 21 scenarios (33 against 12), predict reaches more than replan (43 against 33) and hits fewer (9 against 26). **H6 HELD, narrowly**: `any` reaches 56 in a strong unmodelled current against 58 in still water. **H7 HELD**: no scenario had `noRoute`, for any field arm. **H8 MISSED**: 8 flights LEFT the region, all of them `any+predict` in hard-traffic.

**What the verdict says and does not say.** The three bars that held are held with room (97%, 98%, 93%) and two of the three kinds are close to their ceiling again; the kind that discriminates is hard-traffic, where the frozen plan reaches 20%, a plan rebuilt every 3 s with the ships where they are 55%, and one built with each ship's next 30 s 72%, still short of the registered 80%.

**POST HOC, not registered, computed from the flight file after the verdict (throwaway scripts):**
* **The 8 flights that left the region** (`any+predict`, seeds 406, 410, 413, 421, 425, 437, 442, 455) all left through the NORTH or SOUTH edge (y = +/-140, at x between 96 and 360) although the edge is blocked in every field: the capsule of a ship pushed the plan into the 16 m band beside the edge and the vessel's turn radius carried it over. That is the cost of a plan that is cautious about ships: a path 25% longer than replan's on the 23 scenarios both reached (median ratio 1.137; median 172 s against 137 s for the arrivals) and 8 exits. The plan has no cost for the edge, only a wall.
* **Predict against replan on the same 60 scenarios**: both reached 23, predict only 20, replan only 10, neither 7 (exact two-sided sign test on the 30 discordant: p 0.099). **Frozen `any` against the incumbent**: both 6, any only 6, the incumbent only 12 (p 0.24): the frozen any-angle plan being behind the incumbent in traffic is not distinguishable from a coin.
* **Where `any+predict` fails**: 13 of its 17 failures had a ship faster than 2 m/s and 12 had the straight line blocked by a static obstacle as well (less room to dodge). By number of ships: 2 ships, predict 16 of 19 (replan 11, frozen 6); 3 ships, 8 of 15 (9, 3); 4 ships, 19 of 26 (13, 3).
* **What the keel did (H3's 1.00)**: 47 of the 60 hard-islands scenarios had at least one iceberg the vessel can pass under; in 31 of the 57 pairs both arms reached, any-blind flew a different path, and in those 31 `any`'s path is a median 0.951 of any-blind's (0.803 at the shortest; 2 of the 31 above 1). Blind and aware both reach 58.
* **The current**: hard-current's 4 collisions of `any` were at means of 0.70, 1.28, 0.87 and 0.88 m/s; the incumbent timed out in 3 (its median arrival is 167 s against `any`'s 145 s).
* **The narrowest gap**: at 24 m the incumbent reaches 6 of 20 and `any` 19 of 20 (the plan at the ladder's 6 m in 17 and at 3 m in 3 of them); the aim point is what threads a gap the cell-by-cell heading cannot.

**What it says.**
* The field plus an any-angle aim point is a navigator for static obstacles of this family: islands, icebergs (with a keel used for shorter paths when it matters), a gap of 24 m, a strong unmodelled current -- 93 to 98% with 1 to 4 collisions in 60, on scenarios nobody had read, with the margin ladder doing the work a fixed 12 m could not at the narrow gap (the incumbent without the ladder's rungs is not tested here; with it, it still loses 14 of 20 at 24 m).
* TRAFFIC is where it breaks, and the order of the arms is the finding: freezing the ships (20%) is no better than a plan made by the old arm, knowing where they are now helps a lot (55%), knowing where they will be helps more (72%) and costs a longer path and, here, 8 exits through the edge. Even the best arm misses the bar by 8 points.
* The ceiling the last follow-up ended on is gone for traffic and still there for the other three kinds at these parameters: a harder static family (a denser sea, a gap of 16 m with a stronger current) is open, not needed to say what this one says.

**What it does not say, and where it is soft.** (1) The first registration's list stands: perfect position fix, exact map, one hull, one autopilot, and for traffic known and CONSTANT ship velocities that do not react to the vessel; real traffic turns and answers. (2) The vessel flies a constant 3 m/s target: it never slows, stops or reverses to let a ship pass, which is the obvious thing a real sub would do and the reason a 3 m/s ship is a geometry problem. (3) Amendment 1 was made after seeing DEV (gaps, the ladder, the current): the family was made harder because the first draft was at a ceiling, once, and not tuned afterwards; the bars are the registered ones. (4) The margin ladder is the planner's addition; without it the 24 m gaps would be `noRoute` at 12 m. (5) The edge of the region is a wall, not a cost, which is what the exits show. (6) 60 scenarios per kind: a bar at 80% is 48; 43 is 5 short and the paired tests above say how little separates the arms in traffic (p 0.099 predict against replan). (7) The 8 exits are a failure of this plan, not of the idea of prediction: the paired counts are the same either way.

**Not built, said:** slowing or stopping for a ship; an edge cost in the field; a plan that knows the current; a sensed map; ships that react; right-of-way; the tank (the next item of this round).

## FOLLOW-UP 4: THE NAVIGATION SCENE IN THE SUB AQUARIUM'S TANK (Keith, 2026-11-01: "lets do item 2 also" -- obstacles, goals and a field-guided sub in the tank; REGISTERED BEFORE ANY CODE FOR IT)

**What it is.** A tank option: `tank.setScene(seed)` puts a seeded sea of obstacles in the standard 500 x 300 m tank (two islands of two or three overlapping discs, three icebergs with a keel of 15 to 35 m, two ships that patrol a straight lane at 1.0 to 2.5 m/s and turn round at its ends -- a ship in a closed tank cannot leave it), and `tank.setNav(id, arm)` makes ONE sub a courier: it is given a goal (a point and a depth in the tank), steers on the plan of `brain/subHardNav.mjs` (the code HELD4 was flown on, now with a `grid` and an obstacle-position option), and when it arrives it is given another. **The sub's own pilot still flies it** (the PD autopilot, the network or the stateful fly pilot): navigation replaces only the WANDERING TARGET, so the guidance layer and the pilots stay separate, as they are in the studies. Contact with an obstacle is COUNTED, not punished (an aquarium: nothing fights, and the sub is not put back): `hits` counts contacts (a new one only after a second clear of every obstacle), `arrivals` counts goals reached. The page draws the sea in the top and depth views and says so in each sub's line.

**The arms offered:** `straight`, `any` (the plan made when the goal is drawn, ships frozen where they were then), `any+replan`, `any+predict` (the default: the best of HELD4's traffic kind, 72% there) -- the four names the study used, one code path. Replan every 3 s, horizon 30 s, the margin ladder 12/8/6/3 m, the vessel's own 15 m kept free: as HELD4. The scene is for the STANDARD tank only (a 100 x 60 cell grid; the larger tanks would make a rebuild cost 4 to 36 times more and are refused with a message).

**What is checked, and what is NOT a result.** The gates check the code (the scene's generator and its clearances, the lane motion, the goal draw, the navigator's bookkeeping, the tank's API and what a snapshot carries, the page's controls and drawing). They do not measure anything about navigation. ONE DESCRIPTIVE RUN is registered here so that the tank is not only gated but looked at, and it is labelled DESCRIPTIVE, not a test of the study: **for each of 12 scene seeds (1 to 12), one autopilot sub per arm placed at the same start flies 600 tank-seconds; I report arrivals and hits per sub and per arm.** Predictions, scored held or missed and moving nothing: **T1** every arm arrives at least once in 10 of the 12 scenes (the navigator works at all); **T2** the total hits are ordered `straight` >= `any` >= `any+replan` >= `any+predict` (the order of the collisions in HELD4's traffic kind); **T3** `any+predict` has the most arrivals of the three field arms or ties. What it would not say: anything the study did not (a run to a fixed time of one sub per arm is not a paired scenario set; a hit here is a contact, not the end of a flight; the ships here patrol lanes, not the study's crossing courses).

## RESULT OF THE TANK'S DESCRIPTIVE RUN (2026-11-01; `node tools/ship/tankNavRun.mjs --write`, 12 seas x 4 arms x 600 tank-seconds, one PD-autopilot sub per arm from (100, 150) at 25 m; the 48 subs are in `brain/tankNavRun.jsonl`): DESCRIPTIVE, NOT A TEST OF THE STUDY; T1 held, T2 held, T3 MISSED

The code is gated and sabotaged (the sea and navigator 112 mutants, all red; the tank's section 13 32 mutants, 31 red and 1 equivalent; the page 30; the run 55, all red) and was run once, after that, as registered above:

| arm | subs | arrivals | contacts | seas with an arrival | plans | sailed (km) | lost |
|---|---|---|---|---|---|---|---|
| straight | 12 | 74 | 47 | 12 | 0 | 21.0 | 0 |
| any | 12 | 71 | 18 | 12 | 83 | 20.9 | 0 |
| any+replan | 12 | 69 | 14 | 12 | 2,424 | 20.9 | 0 |
| any+predict | 12 | 66 | 11 | 12 | 2,424 | 20.9 | 0 |

**Predictions scored.** **T1 held** (every arm arrives in all 12 seas). **T2 held** (contacts 47 >= 18 >= 14 >= 11, the order of HELD4's collisions in the traffic kind). **T3 MISSED**: `any+predict` has the FEWEST arrivals of the three field arms (66 against 71 for `any` and 69 for `any+replan`); the more cautious the plan, the longer the way to each goal, and all four arms sailed the same 21 km.

**POST HOC, not registered, from the file:** per 100 arrivals the contacts are 64, 25, 20 and 17, per kilometre sailed 2.23, 0.86, 0.67 and 0.53; against `straight` in the same sea every field arm had fewer contacts in 9 to 11 of the 12 seas and more in none (any 10, replan 9, predict 11); `any+predict` against `any+replan` had fewer contacts in 4 seas, as many in 7 and more in 1. Seas in which the sub touched nothing in 600 s: 0 (straight), 3 (any), 3 (replan), 4 (predict). No sub ended with `noRoute` and none was lost.

**What it says.** The tank's navigation scene works end to end (a courier is sent to a goal, steers on the plan, arrives, is given another, and its contacts are counted), and the order of the arms in the tank is the order they had in the study: knowing where the ships are and will be buys fewer contacts at the price of arrivals (-11% from `straight` to `any+predict` for -77% in contacts). **What it does not say.** It is a total over 12 seas with one sub per arm, not a paired scenario set with a verdict rule; a contact here is an episode of touching, not the end of a flight (the sub carries on through the obstacle); the ships patrol lanes and do not cross the sub's track on purpose, as the study's did; the tank always keeps the vessel's own 15 m free in every plan (the study did so only in re-plans); and the tank's 3D view does not draw the sea (backlog `tank-nav-3d`).
