---
type: doc
title: "Round 317 — water 2Hz, shadow halved, math made honest"
tags: ["swek-engine", "round-doc"]
---

# Round 317 — water 2Hz, shadow halved, math made honest

Three focused changes from v316's findings. v316 surfaced bugs in the
math; I'd been chasing optimization on top of misleading numbers.

---

## What v316 told us

```
total frame:           205.1ms (4.9 FPS)        ← was 4.5
wholeLoopBody (JS):    167.0ms                  ← BUG: actually 112.87
outside body (GPU):     38.1ms                  ← was 80.2 (-42, water win)
inner gap:              69.8ms                  ← positive but inflated by bug

TOP SECTIONS (per-frame view):
  wholeLoopBody (wrapper)    112.87  (55%)
  render.entities (wrapper)   54.12  (26%)      ← wrapper since v315 split
  entities.batched per-call    5.53  (2.7%)     ← MISLEADING: per-call, not per-frame
                                                  actual per-frame ~39ms (~19%)
  waterUpdate                 28.35  (13.8%)    ← was 57.5, throttle halved it
  render.sky+atmosphere       16.69   (8.1%)    ← max 84.8ms (spike)
  shadowPass                   7.29   (3.6%)
  perfStats                    2.83   (1.4%)    ← max 72.7ms (DOM-write spike)

ENTITY PERF — 557 seen, frustum-cull 151, far-cull 233,
              drew rigged 0 + batched 10
              (557 - 384 - 10 = 163 entities pass cull but never draw —
               their assetIds aren't in the 51-asset cache)
```

Three bugs the data exposed:

### Bug A: `wholeLoopBody` reported 167ms but actually 112.87ms

My v316 math summed ALL wrappers into `wholeBodyMs`:
```js
if (r.isWrapper) wholeBodyMs += r.totalMs;
```
When v315 made `render.entities` a wrapper, this started double-
counting since render.entities is nested INSIDE wholeLoopBody. The
reported `wholeLoopBody (JS): 167.0ms` was actually `wholeLoopBody +
render.entities = 112.87 + 54.12 = 166.99ms`. The inner-gap number
inherited the inflation.

**Fix:** `wholeBodyMs = wholeLoopBody.totalMs`. The leaf-sum still
excludes both wrappers (their inner sections are the leaves), but the
JS-body total is just the top-level wrapper. Inner gap is now honest.

### Bug B: `pctFrame` was per-call, not per-frame

The "2.7%" next to `entities.batched` made it look trivial. But that
was percent-of-frame per CALL, not per frame. Each call fires once
per asset group (~7/frame), so per-frame it's ~19% — a hidden top-3
section.

**Fix:** `pctFrame = (totalMs / frames) / avgFrameMs * 100`. For
sections that fire once per frame the number is unchanged; for
sections that fire many times per frame it's now correct.

The text summary also switched from "ms/call" to "ms/frame" as the
primary number; the table view shows both.

### Bug C: Water throttle worked but not enough

v316 at 4Hz (250ms): 28.35ms/frame mean. Still 14% of frame budget.
At 2Hz (500ms) the expected mean is ~14ms/frame — water surface
refresh is independent of wave animation (which lives in the shader
via `uTime`).

**Fix:** default `collectInterval` bumped 250ms → 500ms.

---

## What this round ships

### `render/WaterRenderer.js`
- `collectInterval` default 250ms → **500ms** (still overridable via
  `window.engineConfig.waterCollectIntervalMs`)
- Expected savings: ~14ms/frame

### `debug/frameProfiler.js`
- `wholeBodyMs = wholeLoopBody.totalMs` (was sum of all wrappers)
- `pctFrame` is per-frame, not per-call
- Text summary header changed from "mean ms / max ms" to
  "ms/frame · max ms · % of frame"
- Console table now shows both `ms/call` and `ms/frame` columns

### `main.js`
- `ShadowPass` resolution **2048² → 1024²**
  - Configurable via `window.engineConfig.shadowMapSize = 2048` if
    you want crisper shadow edges back
  - Halves shadow-FBO memory; reduces depth-pass GPU work + sample
    cost in voxel/entity fragment shaders
  - Visually subtle at typical view distance (sun shadows in a voxel
    world don't need 2K)
  - Expected savings: 5-15ms/frame GPU (part of outside-body 38ms)

---

## Expected impact

- waterUpdate: 28 → ~14ms (-14ms)
- outside body: 38 → ~25ms via shadow halving (-13ms)
- Frame total: ~205 → ~178ms → **FPS ~5.6**
- Math is finally honest:
  - `wholeLoopBody (JS)` reports the actual body time (~112ms, not 167)
  - `entities.batched` shows its real per-frame share (~19% not 2.7%)
  - Inner gap reflects only true uninstrumented JS (probably ~25-40ms)

---

## What's actually killing perf, in v317's honest view

The top suspects after the math cleanup, ordered by expected per-frame ms:

1. **`render.entities` setup work** — ~54ms total minus ~39ms in
   batched/rigged = ~15ms in renderer overhead. Texture binding,
   material set, multi-material handling per asset group. Probably
   benefits from caching last-frame's state to skip redundant uploads.

2. **`waterUpdate` even at 2Hz** — ~14ms expected. The right fix is
   tracking water voxels separately (set of coords, updated on block
   change) instead of scanning every voxel every collect.

3. **`render.sky+atmosphere` spikes** — 16ms mean, 84ms max. Periodic
   event (lightning emit? cloud spawn?) hitching every few seconds.

4. **`perfStats` 72ms spike** — DOM layout thrash on HUD text writes.
   Easy fix: read once, write once, cache `.textContent` to skip
   no-op updates.

5. **163 entities passing cull but never drawing** — entityPerf shows
   only 10 drew batched. Many entities have assetIds that don't match
   the 51-asset cache and silently fall through. Should pre-filter at
   dispatch level so the mesh renderer isn't doing cull work on
   garbage.

After v317 if FPS isn't yet 10+, items 1 and 5 are the next round.

---

## Tests — 173/173 (was 168/168)

- Updated T2 expectations for the wrapper-set change
- Added T6: nested-wrapper scenario specifically modeling the v316
  numbers, verifying `wholeBodyMs == wholeLoopBody.totalMs` and that
  leaf sum excludes both wrappers

---

## Action item

```js
await window._frameProf.start(5)
/copy
```

What I'm expecting from the new numbers:
- `wholeLoopBody` reports ~112ms (not 167)
- `entities.batched` per-frame % shows ~15-25% (not 2.7%)
- `waterUpdate` ~14ms (was 28)
- `outside body` ~22-28ms (was 38)
- FPS ~5.5-6.0
