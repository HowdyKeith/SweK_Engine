# SweK Engine — brain-maze walker fix (v2186, over EngineProject_v2185)

## The report: "in the brain maze obstacle room, the walker gets to a wall and just gives up"

Root cause (found by tracing the actual distance field, not guessing): the GPU Brain's
flow-field solver gives walls a FINITE cost (cost = 1 + slopeK·dh/cell), not true
impassability. On the maze's baffles, a detour around a wall could cost MORE than the
finite price of cutting straight through it — so Dijkstra's genuine shortest path to some
floor cells ran THROUGH a wall. The distance field was mathematically correct (verified
bit-exact against a reference Dijkstra), but its gradient at those cells pointed INTO a
wall the walker (correctly) refuses to enter. Those cells are floor "local minima" — a
gradient follower reaching one has no downhill passable neighbour and stalls. ~9 such
cells per random room, so the walker almost always hit one and froze at a wall.

Two earlier "obvious" fixes were tried and measured INSUFFICIENT (documented so they're not
re-attempted): (a) lifting floors above the solver's water penalty helped the cost ratio but
left minima; (b) raising WALL_H to 4000 and hardening the walker's fallback (4-connected
descent, basin-escape with visited-memory) still stalled — because the minima are inherent
to finite wall cost, not a walker bug. A local steering method cannot escape a field whose
gradient legitimately points into a wall.

## The fix (root cause, at the solver — every consumer benefits)

Added an optional HARD impassability threshold to the flow-field solver: an edge whose
per-cell height jump exceeds `impassDh` cannot propagate distance at all. With walls
impassable, no shortest path ever crosses one, so the field has ZERO floor local minima and
is globally descendable.

- **brain/flowfieldCpu.js** — new `opts.impassDh` (default 0 = off). Applied as an edge
  filter in `_relax` (retains `_heights`); legacy behaviour byte-identical when 0 (regression-
  checked).
- **brain/flowfield.js** (GPU) — same gate in the `k_relax` WGSL shader, `impassDh` packed
  into a former pad slot of the Params uniform (struct size unchanged); 0 disables it.
- **brain/brain.js** — reads `snap.impassDh` into the solver cfg and keeps it in sync per
  solve (the solver is cached per grid size but impassDh can change per snapshot). Also now
  solves the goal field with `wantDist:true` and PUBLISHES `dist` in the /ai/brain/flowfield
  payload (1-decimal; unreachable pinned to 1e8) so field consumers can descend distance when
  the local flow vector is blocked. dist was computed before but never sent.
- **brain-maze.html** — sends `impassDh: WALL_H*0.5` in the snapshot; keeps FLOOR_LIFT (floors
  above the water-penalty level) and WALL_H=4000; generator now guarantees a connected route
  (BFS + corridor carve — ~1/80 random rooms previously sealed the goal off); walker hardened
  regardless (axis-slide that can't no-op, in-wall escape, corner-cut-safe diagonal steps) and
  its fallback simplified to a plain distance descent now that the field is clean.

## Verified

- 2000 random mazes, real CPU solver + the page's exact walker: **2000/2000 reached the goal,
  0 frames spent inside walls, 0 floor local-minima in the field.**
- Reference-Dijkstra cross-check: solver dist matches exactly (0 cells disagree >2%).
- Regression: `impassDh=0` solve on open terrain is unchanged (goal dist 0, stable checksum).
- All five touched files pass node --check / WGSL structure review.

## Note on scope

The GPU shader reads `impassDh` at buffer-build time (per grid), matching how slopeK/waterK
already work; the CPU path (which fields default to, and which the maze uses) syncs it per
solve. If you later drive the maze through the GPU field solver (BRAIN_FIELD_SOLVER=gpu),
confirm impassDh reaches the params buffer on a grid rebuild — the plumbing is in place.
