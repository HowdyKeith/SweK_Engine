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
