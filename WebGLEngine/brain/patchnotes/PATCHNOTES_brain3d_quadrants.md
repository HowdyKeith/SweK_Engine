# SweK GPU Brain — 3D mechanics view + GPU-quadrant multi-tasking (v2186)

Two features, both grounded in what the brain already does and both verified.

## 1. brain-3d.html — a 3D model of the brain's ACTUAL mechanics

The existing brain-maze.html shows the OUTPUT (arrows on a grid). brain-3d.html shows the
MECHANISM, reading the same /ai/brain/flowfield payload so it's honest — it renders what the
brain published, not a mock:
  · DISTANCE FIELD AS TERRAIN — valleys = close to a goal, ridges = far/walled. This is the
    literal cost surface navigation descends.
  · FLOW VECTORS as arrows laid on that surface — the directions kaiju actually follow.
  · GOAL WELLS (green cones) and THREAT PEAKS (red, from the published threat array).
  · THE THINK WAVEFRONT — points at cells whose distance changed most since the last field,
    i.e. the Dijkstra relaxation front: you watch the solve propagate.
Uses the engine's vendored three.module.js (offline), own orbit controls, r128 look guards.
Toggles for each layer, height gain, spin, and field source (goal/threat/player). No brain →
it says so rather than faking motion.

## 2. GPU-quadrant multi-tasking — brain/quadrants.js + brain-quadrants.html

Answer to "can the brain create multiple quadrants in GPU memory and multi-task?": YES. The
brain already runs several solvers (goal/threat/player) and the bridge already merges partial
fields from several brain PROCESSES. This adds the missing middle — packing several INDEPENDENT
nav tasks into ONE grid solved in ONE dispatch, then unpacking:
  · QuadrantScheduler tiles N tasks into an atlas grid (near-square rows×cols), each task in
    its own quadrant separated by a 1-cell IMPASSABLE gutter.
  · Correctness rests on the v2186 impassable-edge feature: with the gutter jump above impassDh,
    NO relaxation crosses a gutter, so the single shared distance field is EXACTLY N independent
    fields. Verified: packed results are BIT-IDENTICAL to solving each task alone (0.00e+0 dist
    and flow error across 6 tasks / thousands of cells).
  · One writeBuffer, one relaxation loop, one readback — amortizing the GPU's ~30ms fixed
    per-solve overhead (measured in the brain's own bench) across every packed task instead of
    paying it N times.
brain-quadrants.html demos 2/4/6/9 rooms solved in a single pass with a live "isolation: EXACT"
check against separate solves.

## Solver changes (both CPU + GPU, kept in parity)

- brain/flowfieldCpu.js & brain/flowfield.js (WGSL): _computeCost / k_cost now IGNORE impassable
  neighbours when measuring the steepest slope. An edge we will never traverse must not price the
  cell we stand on; without this, a task cell beside a gutter got a different cost than in a
  standalone solve and packing wasn't exact. This also slightly improves normal wall-hugging cost.
  Gated by impassDh; with impassDh=0 (default terrain) behaviour is unchanged.
- The impassable-edge relaxation filter (from the maze fix) is what makes gutters work.

## Verified
- Quadrant isolation: 6 heterogeneous tasks packed → 0.00e+0 error vs separate solves.
- Maze regression after the cost change: 200 rooms, 0 floor local-minima (still globally
  descendable — the earlier walker fix is intact).
- All modules pass node --check; WGSL reviewed for single declarations.

## Wiring notes
- brain-3d.html and brain-quadrants.html are standalone pages served by the same bridge; open
  them alongside brain-maze.html.
- To use quadrants inside the live brain, import QuadrantScheduler in brain.js and route several
  region snapshots through qs.solve() instead of one solver.solve(); the unpacked per-task fields
  publish through the existing flowfield payload unchanged.
