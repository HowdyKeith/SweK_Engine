# Round 321 — easing.js + SpatialHash.js

Two utility extractions, picked from another AI chat about fluid sim.
Most of that chat was unusable (empty function bodies, undelivered
marching cubes tables, WebGPU code despite explicit "no WebGPU"),
but two pieces had real engineering value. This round ships them.

---

## simulation/easing.js

Centralizes the standard easing curves that were inlined across
4 files. The math in every refactored site is byte-identical to
the inline version — verified by `test_easing_spatial_v321.mjs`
T3 which evaluates each `easeOutCubic(t) === (1 - Math.pow(1 - t, 3))`
at multiple t values.

### Exports
- `linear, easeInQuad, easeOutQuad, easeInOutQuad`
- `easeInCubic, easeOutCubic, easeInOutCubic`
- `easeOutExpo, easeOutBack`
- `EASING` — name→function map for config-driven lookup

### Refactored sites
- `world/birthSpawner.js` — was 3 inlined named functions
  (easeOutCubic, easeInCubic, easeOutBack); now imports
- `world/treeSpawner.js` line 245 — `1 - Math.pow(1 - u, 2)` →
  `easeOutQuad(u)`
- `simulation/EjectSequence.js` line 130 — `1 - Math.pow(1 - f, 3)`
  → `easeOutCubic(f)` (comment confirmed the intent)
- `simulation/OgreScenario.js` lines 6416, 7415, 7525 — same
  pattern, mixed cubic and quad

### What's NOT included
The framerate-independent smoothing pattern in `camera.js` and
`OgreScenario.js` line 7807-7808:
```js
const easeIn = Math.min(1, (idleSec - IDLE_THRESHOLD) / 1.5);
const k = 1 - Math.exp(-dt * 1.2 * easeIn);
this.camera.position.x += (tx - this.camera.position.x) * k;
```
This is a smoothing filter (timestep-correct exponential approach),
not a parametric tween over t∈[0,1]. Different math, different
purpose. Stays inline. The new module's docstring explicitly
distinguishes these two patterns.

---

## simulation/SpatialHash.js

A broad-phase spatial hash for "find nearby" queries on 3D points.
Cubic cell bucketing, hash key = floored cell coordinate triple.

### API
```js
const sh = new SpatialHash(cellSize = 4.0);
sh.insert(item, x, y, z);          // single insert
sh.rebuildFrom(items);             // bulk rebuild from {x,y,z} array
const candidates = sh.getNearby(x, y, z, radius);   // broad phase
sh.forEachWithin(x, y, z, radius, (item, d²) => {}); // narrow phase
sh.clear();
sh.stats(); // { items, cells, avgPerCell, maxPerCell, cellSize }
```

### Design choices

**String-key hashing.** `${cx},${cy},${cz}` is allocation-heavy
but readable. Faster alternatives (Cantor pairing, bit-packed
Int32) give ~2× insert throughput but cost simplicity. Not worth
it at game scale (~few thousand items per frame). Documented in
the source.

**Broad phase vs narrow phase.** `getNearby()` returns all items
in cells overlapping a sphere — corner items may be outside the
actual radius. `forEachWithin()` includes a distance squared
check. Both are useful; the broad version is faster when callers
do their own distance work.

**No automatic deduplication.** If a caller inserts the same item
twice, it appears twice in `getNearby` results. Caller's
responsibility.

**Stored by reference.** Items are opaque payloads — strings, ids,
objects, anything. Lets callers read back full state without
keeping a parallel array.

### Not included

No support for moving items in place. The pattern is: `clear()` at
start of frame, insert everything, run queries before next clear.
Per-frame rebuild is O(n) and fast enough for the entity counts in
this engine (~500 visible entities at peak).

### Where this might wire in

Not wired anywhere yet — pure infrastructure. Plausible callers:
- **Entity-vs-entity proximity** in CivManager (find nearby kaiju)
- **Projectile broad-phase** in OgreScenario's missile/laser arcs
- **AI "what's near me"** queries that currently scan all entities

If the user wants me to wire one of those up, ask.

---

## Tests — 259/259 cumulative

`test_easing_spatial_v321.mjs` adds 63 tests across 11 groups:

**Easing (5 groups, 32 tests):**
- T1 all curves anchor at (0,0) and (1,1) — 16 anchor checks
- T2 known midpoints from canonical Penner — 7 tests
- T3 refactored sites preserve byte-identical output — 11 tests at
  multiple t values
- T4 easeOutBack actually overshoots — 3 tests
- T5 EASING map lookup — 4 tests

**SpatialHash (6 groups, 31 tests):**
- T6 basic insert + getNearby
- T7 rebuildFrom preserves item references
- T8 forEachWithin distance-filters correctly
- T9 stats reasonable across 100 items in 30m cube
- T10 clear resets all state
- T11 negative coordinates work

---

## What I'd flag from that chat as "ask more if interested"

The user said: "If there is something the other mentioned in passing
that I would be wise to ask more about, I would."

Two items had real engineering substance behind the bad code:

1. **Transform Feedback for GPU particles.** The other AI's
   implementation was sketchy (CPU spawn with `console.log` in one
   place) but the underlying technique is real and well-defined in
   WebGL2. It lets you drive 100k+ particles entirely on the GPU
   with zero CPU-side per-frame work. If you ever want massive
   particle counts (huge explosions, dust storms, swarms), this is
   the standard approach. Your existing ParticleSystem likely caps
   much lower. Worth asking about if/when you hit a particle
   bottleneck.

2. **Marching Cubes.** The other AI promised the 256-entry tables
   five times and never delivered them, which made the code
   unusable — but the technique itself is real and the actual MC
   tables are public and well-known (Bourke's reference is the
   canonical source). MC turns voxel data into smooth triangle
   surfaces. Useful for: smooth terrain transitions, fluid surface
   reconstruction, isosurface visualization. Maybe interesting if
   you ever want a "smooth voxel" rendering mode as a visual
   contrast to the current cubic style.

Both real, both substantial enough to be a whole round on their
own. Neither urgent. Mentioned once; no follow-up unless asked.

---

## Action item

Test v321 — visually verify that the refactored sites still
animate correctly. Specifically:
- Birth scale-up: `kaiju.spawn(0, 0)` (birthSpawner uses easeOutCubic)
- Tree growth: trees should still grow with the same curve
- Eject sequence: trigger eject during FPS, camera rise should
  match prior feel
- OGRE entry: `ogre.start()`, the OGRE scale-up should look
  identical

If anything looks subtly off, the easing math drift is the suspect
(though T3 verifies it shouldn't be). Same suite passes byte-equal
on all common t values.

Otherwise, ready for the next priority — v320 FPS verification
when you get to it.
