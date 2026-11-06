# Navigation with a depth dimension: walls that must be passed beneath or over, and a vertical plan (2026-11-06; UNNUMBERED; REGISTERED BEFORE ANY CODE FOR IT IS WRITTEN AND BEFORE ANY SEED OF ITS SET IS FLOWN)

Keith, 2026-11-06: "lets complete the nav items first." The navigation items of `brain/BACKLOG_2026-11-01.md` section A: `nav-sensed-map`, `nav-reacting-traffic`, `nav-current-in-field` and `nav-margin-sweep-any` are done (the sensed series, `brain/NAV_PLUS_WIP.md`); `nav-missions-and-cost`, `nav-fleet-avoidance` and `nav-match-consumes-layer` are marked UPSTREAM there (each waits on something that is not mine: the submarine needs model, the tank scene, the space arena); `tank-nav-3d` is the tank's 3D view (`render/subAquarium3d.mjs`, a page the other chat shares). **`nav-3d-terrain` is the one that is open and buildable in my own files, and this note is that item.** It says what is built, what is read, and what the read would not say.

## 1. What exists, from the code

* The planner is a plan view (`brain/subFieldNav.mjs`, `brain/subHardNav.mjs`): a grid field with obstacles as discs. An iceberg has a KEEL: the field blocks it when `keel + VMARGIN (5 m) > minDepth`, where `minDepth` is the shallower of the start depth and the goal depth; a full-depth obstacle (an island) always blocks. The vessel flies at the WAYPOINT's depth (`hardTarget` hands the autopilot the goal's depth): there is no depth plan, and there is no seabed (the navigation model has `seabed: 1000`).
* The depth channel of the autopilot (`brain/autopilotSub.mjs`): a climb RATE is asked for, `vz = 0.2 x depth error` clamped to +-1.0 m/s, and a pitch is derived from it (+-0.3 rad): at a cruise of 2 to 3 m/s a change of 25 m takes 25 s and 60 to 75 m of track.
* `flyPlus` (`brain/subNavPlus.mjs`) flies an arm over a scenario with the any-angle plan, the margin ladder, the crab, the reacting ships; with no new option it is `flyHard`'s flight to the digit (15 pinned fingerprints).

## 2. What is built

* **Two options of `flyPlus`, both off by default (the pins still hold):** `depthOf(state, tick)` returns the depth the vessel is asked for in place of the waypoint's (NaN or absent: the waypoint's), and `groundAt(x, y, depth)` says the hull's bottom is on a seabed that rises there (the flight ends `grounded`).
* **`brain/subNav3d.mjs`: three kinds of scenario with WALLS across the whole width of the region**, each wall a depth window the vessel must be inside while it crosses the wall's x-range: a KEEL WALL (a curtain of icebergs from edge to edge, keel 34 to 52 m: no way round it, the vessel must be BELOW the keel plus VMARGIN, `depth >= keel + 5 + 0.6`), a RIDGE (the seabed rises across the region to a crest 18 to 30 m deep: the vessel must be ABOVE it, `depth <= crest - 5 - 0.6`) and BOTH (a keel wall and then a ridge, 130 m or more apart: down, then up). Islands (full depth, the existing generator's) are in every kind. The start and goal depths are 18 to 28 m: shallower than the keels, deeper than some crests.
* **Two arms, the same any-angle plan and autopilot, nothing else different.** `any` is the incumbent: the plan is told of the icebergs by the keel rule at the waypoint depth (so a keel wall BLOCKS the plan, the field has no route and the vessel flies at it), and it knows nothing of the seabed. `any+vertical` flies a DEPTH SCHEDULE: the plan is made at the depth the keel walls need (so they do not block it; the islands still do), and the depth asked for is, ahead of each wall, the depth inside that wall's window nearest the waypoint's, reached in time for the wall (the transition starts `|change| / 1.0 m/s x speed + 25 m` before the wall's first x), and the waypoint's depth again after the last wall.
* `tools/ship/subNav3dStudy.mjs` (the command: `--set dev|held77 [--seeds N] [--write]`) and one gate, `brain/subNav3d-selfcheck.mjs`, with its mutation pass logged in its header, made with the mutation harness AFTER its fix (the harness mutated a real file through a symlinked directory on 2026-11-06 -- see the status paragraph of `brain/SUB_COUNTERMEASURES_WIP.md` -- and now builds `physics` and `physics/mechanics` as real directories).

**OPTIMISTIC, said plainly:** the vessel knows where it is, the keels and the crests are known exactly (the map is exact, the seabed is exact), the walls are straight across the whole width, there is no current and no traffic in these kinds, and the vertical plan is one schedule computed once. A wall that does not span the region, a seabed seen only by a sonar, a keel seen only by one are the next items, not this one.

## 3. THE REGISTERED READ

> With an exact map of keels and seabed, does a depth schedule let the vessel cross walls that the plan-view planner cannot (a keel wall) or does not know of (a ridge), and cross both in one flight?

**Scenarios, fresh and read once:** seeds **9001 to 9040 of each of the three kinds** (120 scenarios). Nothing in the tree uses them (the navigation sets reach 6960, the harder test's HELD4 is 401-460). DEV is seeds 1 to 12 of each kind (the code, the schedule's constants and Amendment 1 if it is needed; DEV is not a result; smoke runs use seeds 1 to 4 and nothing else).

**The reading (the series' convention, `brain/NAV_PLUS_WIP.md`):** a scenario is REACHED when the vessel arrives with no collision, no grounding and no exit; the arms are compared by the paired count of scenarios one reaches and the other does not, the gain being (reached by `any+vertical` only) less (reached by `any` only), and the exact two-sided sign test on those. **Per kind, `any+vertical` HELPS iff it reaches at least 80 percent of the kind's 40 scenarios AND the gain is at least 5 AND p <= 0.10.** **THE ITEM IS SUPPORTED iff it helps in all three kinds; PARTLY SUPPORTED iff in two; else NOT SUPPORTED.** Printed and not part of the verdict: the statuses of each arm (reached, collided, grounded, left, timeout), the median path over the chord of the arrivals, the minimum clearance, the scenarios in which the incumbent's field had no route.

**Checks (a failure and the readings are NOT WEIGHED):** every scenario has its walls inside the region and at least 130 m between the keel wall and the ridge in BOTH; the keel window and the ridge window of every scenario are feasible (`keel + 5.6 <= 90` and `crest - 5.6 >= 12`); `any+vertical` with no wall in the scenario would be `any` (the schedule asks the waypoint's depth: a row of the gate on a scenario with the walls removed, the flight identical to the digit); every flight has a finite path.

**Expectations, written before any seed of the set is flown.**
* Keel wall: `any` reaches at most 5 of 40: about 85 percent (its plan has no route and it flies at the curtain); `any+vertical` reaches at least 32 of 40 (the bar): about 70; it HELPS: about 70.
* Ridge: `any` is grounded in at least 10 of 40: about 70 percent (the crests 18 to 30 m against waypoint depths of 18 to 28); `any+vertical` is grounded in none: about 80; it reaches at least 32: about 70; it HELPS: about 65.
* Both: `any+vertical` reaches at least 32 of 40: about 55 (the transitions between the walls: a 30 m dive and a 25 m climb in 130 m at 1 m/s is tight, and the wall is a depth window the vessel must be inside, not near); it HELPS: about 60.
* THE ITEM SUPPORTED: about 45 percent; PARTLY: about 30; NOT: about 25.
* In any kind, `any+vertical` collides with an island in at least one scenario: about 50 (the schedule does nothing for the horizontal plan).
* The DEV choice of the schedule's constants (below) does not move: Amendment 1 is needed: about 30.

**The schedule's constants** are the ones named above (the preview `|change| / 1.0 m/s x speed + 25 m`, the window `+- 5.6 m`) and are not searched.

**What a result would not say.** That a real vessel can plan its dive: the map and the seabed are exact. That a wall which does not span the width is crossed the same way (it would be gone round). Anything about a vessel with a current (the kinds have none). That the depth channel's 1 m/s limit is a good design: it is the autopilot's, unedited, and it is what makes the transitions tight.

## 4. Not in this round, said now

A seabed seen by sonar; a keel seen by sonar; walls that do not span the region (a vertical plan that chooses between going round and going under); the tank's 3D view of obstacles (`tank-nav-3d`, a shared page); the UPSTREAM items.
