---
type: doc
title: "Round 316 — FPS round 5: water throttle + math fixes"
tags: ["swek-engine", "round-doc"]
---

# Round 316 — FPS round 5: water throttle + math fixes

The v315 splits paid off. Three findings, three fixes.

---

## What v315 told us

```
total frame:           224.5ms (4.5 FPS)
wholeLoopBody (JS):    144.3ms (64%)
outside body (GPU):     80.2ms (36%)
inner gap (unnamed):   -74.7ms (-52%)    ← negative again, bug

LEAF SECTIONS:
  render.entities      75.83ms (33.8%)
  entities.batched     10.71ms × 175 calls (= ~75ms/frame total)
  waterUpdate          57.56ms (25.6%)   ← actual water killer
  waterRender           0.04ms             ← GPU water is fine
  particlesRender       0.00ms             ← particles are fine

ENTITY PERF — 2 avg/frame seen   ← misleading number
```

Three distinct issues exposed, fixed this round:

### 1. `waterUpdate` is the actual killer, not the GPU pass

Split confirmed: `waterUpdate` (CPU wave-source collect) is 57.56ms.
`waterRender` (GPU draw) is 0.04ms. The expensive part is on the CPU,
not the GPU.

Tracing into `WaterRenderer.collect()`: with 169 chunks × 16×16×64
voxels each, it does ~2.7 million voxel reads per call to find water
surface tiles. The previous default `collectInterval=100ms` meant it
ran in essentially every frame at low FPS.

**Fix:** raise default to **250ms (4 Hz)**. The wave animation itself
is GPU-side via the `uTime` shader uniform, so visual smoothness is
unchanged — only the surface-list refresh rate slows.

Override from console: `window.engineConfig.waterCollectIntervalMs = 500`

Expected impact: 57ms → ~14ms (1 collect per 4 frames at 5 FPS).
**~43ms/frame saved.**

### 2. Profile math went negative again

`inner gap = -74.7ms (-52%)`. Same bug as v313: when v315 split
`render.entities` into `entities.rigged` + `entities.batched`,
`render.entities` became a *wrapper* (containing other sections), and
my leaf-sum still treated it as a leaf — so I double-counted its
inner sections.

**Fix:** added `"render.entities"` to `WRAPPER_NAMES` in
`frameProfiler.js`. The leaf-sum now correctly excludes both
`wholeLoopBody` and `render.entities`.

### 3. ENTITY PERF "2 avg/frame seen" was misleading

The stats object resets per-frame in `_resetFrameStats()`, but
`framesCounted` is cumulative. The auto-print divided
`totalEntities / framesCounted`, giving a meaningless ratio that
trended to 0 over time.

**Fix:** added a separate `cumulative` bucket on `entityPerf` that
accumulates across frames. The frame profiler resets it at the start
of each sample window via `entityPerf.resetCumulative()`, then reads
the accumulated totals at the end. Per-frame averages are now
window-constrained and accurate:

```
[_frameProf] ENTITY PERF — 320 avg/frame seen,
  frustum-cull 180, far-cull 25,
  drew rigged 5 + batched 110 |
  anim updates 70 / skips 45
  (thresh far=100m, frust=on)
```

(Real numbers vary by scene, but the math is now sound.)

The per-frame `stats` bucket still resets per-frame for legacy
callers like the HUD readout.

---

## What this round ships

### `render/WaterRenderer.js`

`collectInterval` default 100ms → **250ms**, configurable via
`window.engineConfig.waterCollectIntervalMs`.

### `debug/frameProfiler.js`

- `WRAPPER_NAMES` includes `"render.entities"`
- `_start()` calls `entityPerf.resetCumulative()`
- `_report()` reads `entityPerf.cumulative` instead of `entityPerf.stats`

### `render/entityPerf.js`

- New `cumulative` bucket alongside `stats`
- `_resetFrameStats()` rolls per-frame stats into `cumulative` before zeroing
- `resetCumulative()` zeros just the cumulative bucket (called by profiler)
- `snapshot()` returns both `stats` (current frame) and `cumulative` (window-total)

---

## Expected impact

- **`waterUpdate` 57ms → ~14ms** → saves ~43ms/frame
- Frame time **225ms → ~182ms** → **FPS 4.5 → ~5.5**
- Profile math returns positive inner-gap numbers
- ENTITY PERF shows real averages

The waterUpdate throttle is a high-confidence win. The math fixes are
diagnostic but essential for guiding the next round.

---

## Tests — 168/168 still passing

The entity_perf tests use `_resetFrameStats()` directly to set up
fixtures — they still work because the new code keeps the same
per-frame semantics, just adds the cumulative bucket alongside.

---

## What's still on the list

After this round shows the new numbers, two clear targets remain:

1. **`entities.batched` per-call cost** — 10.71ms per asset-group
   draw (max 139.5ms!) is monstrous for one `drawElementsInstanced`.
   Probably a `bufferSubData` GPU sync stall. Next round adds
   instrumentation inside the batched path (LOD select / buffer pack /
   draw call) to confirm, then attacks with buffer orphaning if it's
   the stall.

2. **Outside-body 80ms (GPU)** — biggest remaining piece. Shadow pass
   2048² depth + sky/atmosphere shaders + bloom god rays. Could drop
   shadow resolution or simplify shader if needed.

After FPS crosses 15, **face wiring resumes** — HeartbeatAvatar
mirror first, then kaiju expression channel.

---

## Action item

Same profile, fresh run. The new ENTITY PERF line will tell us how
many entities are actually being drawn after the tighter v315 cull,
and the cleaned-up math will make the next decisions clear.

```js
await window._frameProf.start(5)
/copy
```
