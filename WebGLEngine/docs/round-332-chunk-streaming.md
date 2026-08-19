# Round 332 — Camera-following chunk streaming + ruinPlacer fix

Two fixes responding to live testing observations:

1. **`world/ChunkStreamer.js`** — new file. Camera-following chunk
   load/unload that fills in the "missing terrain wall" you saw
   when you flew to chunk (-11, +6). Opt-in via console.

2. **`world/ruinPlacer.js` `_terrainTopAt`** — copies the v329
   pattern. Ruins were stamping on top of floating high voxels
   (other entities, mountain caps, kaiju), creating the dark
   ring/disc structures you saw in the sky.

---

## Why the terrain wall was missing

Confirmed via `dumpChunkGrid()`:

```
[chunkGrid] ref=(-175,97) chunk=(-11,6) gridRadius=7 loaded=36/225 (16%)
  ...........####
  ...........####    ← chunks only in the upper-right (NE)
  .......?...####
  ...............    ← everything south of you: nothing
  ...............
```

`world.js` was loading chunks in a fixed 15×15 grid around **world
origin (0,0)**, never moving. The for-loop in `growGrid` uses
`cx = -target..target` with no camera offset. You flew to chunk
(-11, +6) — outside the loaded grid on the SW diagonal. The 36
chunks you saw were the slice of the world-origin grid that
happened to fall within your view radius.

The "missing wall" was the **literal edge of the loaded world,
viewed from outside.**

---

## ChunkStreamer design

```js
new ChunkStreamer({
    world, camera,
    frameChunkBudget: 2,    // max chunks generated per tick
    unloadMargin: 3,        // hysteresis: keep chunks within gridRadius+3
    unloadEnabled: false,   // off by default — world grows but doesn't shrink
});
```

Per tick:
1. Compute camera's current chunk
2. If it's a NEW chunk (different from last tick), rebuild the load
   queue with all missing chunks within `gridRadius`, sorted by
   distance² (closest first — visible filling radiates outward)
3. Process up to `frameChunkBudget` chunks from the queue
4. Optionally unload chunks beyond `gridRadius + unloadMargin`

Cheap when disabled — single early return.

### Opt-in by default

By default the streamer is OFF and the existing origin-anchored
behavior stays intact. Flip it on from the console:

```js
streamer.setEnabled(true)
```

Why opt-in:
- Some systems assume origin-centered chunks (boundary walls in
  `world.js` are stamped at the gridRadius perimeter — those need
  re-stamping if the grid shifts, which I haven't wired)
- Saves the risk of changing default behavior between rounds the
  user is mid-testing on
- You can flip it on for exploration, off for stable demo recording

When you flip it on at chunk (-11, +6), the closest 225 chunks
will queue up — load at 2/frame = ~2 seconds to fill. The visible
fill marches outward from your position.

### Frame budget

Default 2 chunks/frame. Each `generateChunk` averages a few
milliseconds (varies by biome complexity), so 2/frame keeps the
hot path well under 16ms. Tunable:

```js
streamer.setBudget(5)    // faster fill, more frame-time
streamer.setBudget(1)    // slower fill, smoothest frames
```

### Unloading

Off by default. Without unload, the world grows monotonically as
you explore — memory will rise over a long session. Enable when
needed:

```js
streamer.setUnloadEnabled(true)
streamer.setUnloadMargin(5)   // hysteresis distance (chunks)
```

Unload distance = `gridRadius + unloadMargin`. So with defaults
(gridRadius=7, margin=3), chunks within 10 stay, anything beyond
gets evicted. The 3-chunk gap between load-radius (7) and unload-
radius (10) is the **hysteresis band** — prevents thrashing when
the camera oscillates near a boundary.

---

## ruinPlacer fix

`world/ruinPlacer.js` had the same broken `_terrainTopAt` as the
biomePainter in v329:

```js
// Before:
for (let y = 60; y >= 0; y--) { ... return y; }   // scan from sky
```

If anything was at high Y when ruins were placed — a kaiju in
flight, leftover mountain stones from a prior paint, a megastructure,
even another ruin from a previous pass — the placer treated that
as ground and stamped a new ruin on top.

Fix is identical to v329:
- Scan starts at Y=15 (MAX_NATURAL_TOP)
- Only accept STONE/DIRT/GRASS/SAND as ground
- Skip SNOW (mountain caps), ASH, WATER, LAVA, SCREEN, MEMORY, RUBBLE
- Return 0 if no natural ground in scan range → caller skips that
  column entirely

The "dark ring/disc" structures you saw floating in image 1 should
stop happening on fresh worlds.

---

## Tests — 729/729 cumulative

`test_chunk_streamer_v332.mjs` adds 28 tests:

**ChunkStreamer (T1-T11, 26 tests):**
- T1: disabled = no-op
- T2: enable triggers full fill on first tick
- T3: frame budget caps per-tick loads (3 → 3, then 3, then completes)
- T4: closest-first sort — (0,0) loads before far corners
- T5: skips already-loaded chunks (pre-seed 2, generates 23 not 25)
- T6: chunk-change triggers re-enqueue (move east → 6 new chunks)
- T7: mid-chunk motion does NOT re-enqueue (no churn)
- T8: unload removes far chunks when camera moves
- T9: hysteresis — chunk at dist=3 stays when unloadMargin=3
- T10: stats reflect activity
- T11: re-enable triggers fresh fill (was disabled, chunk removed,
  re-enabled → reloads)

**ruinPlacer (T12, 2 tests):**
- Verifies the v329-pattern logic on a synthetic world (natural
  GRASS at Y=8 + floating SNOW at Y=30 → returns 8 correctly;
  no-natural-ground world → returns 0)

The ruinPlacer test reproduces the function logic inline (since
importing `ruinPlacer.js` pulls in many engine deps). Same
pattern as v329's test.

---

## Try it

```js
// 1. Diagnose your current state
dumpChunkGrid()
// → see how many chunks load around you

// 2. Flip on streaming
streamer.setEnabled(true)
streamer.stats()
// → { enabled: true, queueLength: 189, chunkChanges: 1, loads: 0, ... }

// 3. Wait a few seconds — chunks fill in at 2/frame
//    Watch the terrain heal around you
dumpChunkGrid()
// → loaded count climbs as chunks come in

// 4. Re-check after the queue drains
streamer.stats()
// → loads: 189, queueLength: 0

// 5. If memory matters in a long session, enable eviction
streamer.setUnloadEnabled(true)

// 6. Bump generation rate if you want faster fills
streamer.setBudget(5)
```

For the ruin bug: just regenerate the world (or new sessions will
have no floating ruins). Existing floating ruins are still there
from prior gen — they'll stay until you clear them or the world
re-seeds.

---

## What's NOT in v332

- **Boundary walls don't move with the camera.** `world.js` paints
  stone walls at the gridRadius perimeter — those are still
  centered on origin. When streaming is enabled, you'll see the
  original walls floating in the world (inside the streamed area).
  They erode away naturally over time per the hydraulic erosion
  system, but explicit re-stamping at the camera-anchored perimeter
  would be the proper fix. Saved for v333+.
- **`growGrid` still origin-anchored.** Combining `growGrid` with
  streaming gives a streamed world with an origin-pinned "official"
  size. The two systems coexist but don't talk.
- **No mesh QC or post-process integration.** v331's worker pool
  isn't auto-applied to streamed chunks. Separate concern.
- **No grid-edge teardown for the existing world.** If you've been
  playing with the existing fixed grid and now flip streaming on,
  you'll see the world expand naturally as you move. The old
  origin-centered "core" stays loaded forever unless you turn on
  unloading.

---

## Status

Three rounds since the docket pivot:
- v331 — worker pool tier 1
- **v332 — chunk streaming + ruinPlacer**
- v333 — AI tools panel (pending)

The streaming fix is the biggest exploration-feel improvement
since the FPS bet. Flying away from origin no longer hits the
void — terrain follows.

If real-play confirms the streaming feels right, the boundary
walls can be re-pinned in a follow-up, and `streamer.setEnabled`
can become default-on.
