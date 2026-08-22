---
type: doc
title: "Round 329 — Terrain-top clamp + chunk-grid probe"
tags: ["swek-engine", "round-doc"]
---

# Round 329 — Terrain-top clamp + chunk-grid probe

Small round responding to a bug-report screenshot. Two real fixes
plus one console diagnostic plus a backlog entry. Also formal
confirmation that v320 paid off — user reports 60 FPS perfect.

---

## The bug — floating sky towers

`world/biomePainter.js` `_terrainTopAt` was scanning Y=60 downward
and treating any non-air voxel as "the top of natural terrain."
Mountain biome cells then stacked 5-20 voxels on top.

If anything was already at high Y when paint ran — kaiju in flight,
megastructure remnants, SCREEN voxels from the face wall, residual
peaks from a prior paint pass, debris from kaiju attacks — the
painter treated those as ground and built mountain peaks reaching
Y=50+. Visible result: scattered "towers" floating in the sky.

The fix is two lines of logic:

1. **Clamp scan range.** Start from Y=15 (`MAX_NATURAL_TOP`), not
   Y=60. Natural terrain caps out around Y=10 from base gen;
   single-pass mountains add up to 20 more. Y=15 is well above
   natural ground but below any sky-overlay content.

2. **Filter to natural voxel types.** Only return Y for STONE, DIRT,
   GRASS, or SAND. Skip SNOW (prior mountain caps), ASH (volcano),
   WATER/LAVA, SCREEN, MEMORY, RUBBLE. Scan continues downward
   through skipped voxels — if natural terrain exists below, we
   find it; if not, return 0 and the painter doesn't paint this
   column at all.

Result: mountains can't build on top of non-terrain content. Sky
towers don't accumulate across paint passes.

---

## The console probe — dumpChunkGrid

User reports "this side of the whole terrain block is missing"
on one specific edge of the visible world. Could be chunk-load
asymmetry, frustum overshoot, or a real world-gen cliff — needs
live diagnosis.

`world.dumpChunkGrid()` prints an ASCII map of loaded chunks
relative to a reference position:

```
[chunkGrid] ref=(0,0) chunk=(0,0) gridRadius=7 loaded=140/225 (62%)
  N
  ##############
  #..##########.
  ###############
  ##############@
  ##############
  ##############
  ...
  S
```

`@` = reference chunk (player by default), `#` = loaded, `.` =
missing. Asymmetry shows up immediately as gaps on one side.

Exposed as `window.world` and `window.dumpChunkGrid(refX?, refZ?)`
— in the console:

```js
dumpChunkGrid()                            // around the camera
dumpChunkGrid(0, 0)                        // around world origin
```

Next time the missing-side bug shows up, this will diagnose it
without guesswork.

---

## Sidebar — v320 confirmed

User reports 60 FPS perfect in the screenshot. v320's `getError`
throttle was the FPS bet — replacing per-call `gl.getError()` with
1-in-64 sampling. The hypothesis chain:

1. v318: per-entity GPU cost is the bottleneck
2. v319: buffer orphan didn't fix it → not a data-path issue
3. v320: getError throttle did fix it → sync primitives are the cost

Now confirmed in production. The lesson generalizes: any WebGL
sync primitive (`getError`, `finish`, `readPixels`,
`checkFramebufferStatus`, `fenceSync`) is a hot-path landmine.
This is added to the engine's permanent invariant list.

---

## Backlog entry — rare sky towers as a realm feature

User noted: "why would there be towers in the sky, although there
could be, rarely in this realm." Adding to deferred ideas:

> **Rare sky towers / floating spires.** As an intentional feature
> of certain biomes or realms, 1-2 architectural floating
> structures per world. Generated deliberately (not as paint
> bugs), large and distinct enough to read as "this realm has
> floating geometry" rather than "the painter is broken." Could
> tie to a hell-realm or sky-island biome theme. Implementation
> would be in `structureBuilder.js` with explicit placement and
> support beams that connect to ground (so they don't look like
> debris).

Saved for a future world-gen round.

---

## Tests — 613/613 cumulative

`test_terrain_top_v329.mjs` adds 15 tests:

- T1: natural terrain at low Y returns correct top
- T2: voxel above Y=15 ignored (the core fix — sky tower no longer
  treated as ground)
- T3: scan skips through non-natural voxels and finds natural one below
- T4: pure-air column returns 0
- T5: SCREEN-only column returns 0 (face wall doesn't get mountains)
- T6: WATER at top is skipped, terrain below returned
- T7: SAND counts as natural
- T8: SNOW peak cap skipped, STONE peak body returned (caps repaint
  height growth across passes)
- T9-T10: dumpChunkGrid reports correct loaded/missing counts and
  reference chunk positioning

T2 is the test that directly verifies the fix for the screenshot
symptom. Before v329: would have returned Y=31 → mountain at
Y=32-51. After v329: returns Y=8 → mountain at Y=9-28. No more
sky towers from this code path.

---

## What's NOT in v329 (still open)

- **The missing terrain side itself.** The fix is gated on
  diagnosing the cause. `dumpChunkGrid()` is the diagnosis tool;
  next time user sees the bug, the probe output will narrow it
  down.
- **Cleanup of existing sky towers.** v329 prevents NEW sky tower
  growth but doesn't remove the existing ones in worlds-in-progress.
  A "flatten sky" pass (one-shot deletion of all voxels above some
  Y in non-mountain biomes) could be added but probably should
  wait for user confirmation that the new clamp actually fixes
  the recurrence.

---

## Action

```js
// In existing world (after v329 deploy):
dumpChunkGrid()                            // diagnose missing terrain side

// In a fresh world or after wipe:
// Mountains should look like mountains, not sky towers.
// The MAX_NATURAL_TOP=15 cap is in biomePainter.js if it needs
// adjustment for specific biomes later.
```

Next up: v330 — bomb carrier + pickup (the CS round).
