---
type: doc
title: "Round 312 — FPS round 1: entity perf"
tags: ["swek-engine", "round-doc"]
---

# Round 312 — FPS round 1: entity perf

Two interventions in the renderer's hottest path. Both gated by a
console-tunable config so we can A/B in-app.

---

## Diagnosis (recap from v310 profile)

```
render.entities       70.5ms / 32.6% of frame   ← measured hotspot
shadowPass             7.7ms /  3.6%
render.sky+atmosphere  6.3ms /  2.9%
(everything else)     <1ms each
uninstrumented gap     ~130ms / 59%               ← bigger problem
```

Average frame: 216 ms → **4.6 FPS**.

Dug into the renderer's per-entity rigged path
(`render/EntityMeshRenderer.js:984-1048`) and found two problems
compounding each other:

### Problem 1 — `getVisibleEntities()` does no culling

`bridge/ecs_render_bridge.js` returns **every** ECS entity with a
Position component. Entities behind the camera, off-screen, or 200m
away all flow into the renderer.

### Problem 2 — Per-entity loop runs full skeletal pipeline

For each rigged entity the renderer does:
1. `bufferSubData` (13 floats per entity, separate upload)
2. `animator.update(dt)` — clip eval + hierarchy walk + skin matrices
   for 55 joints (RobotExpressive) or whatever the rig holds
3. `uniformMatrix4fv(jointMatrices)` — 3.5 KB upload
4. `drawElementsInstanced(..., 1)` — single-instance draw

With 50 entities and ~1.4ms each, that's exactly the 70ms we measured.
Including entities the player **can't even see**.

---

## What this round ships

### `render/entityPerf.js` (new)

A configurable decision module read by the renderer each frame. Two
pure functions plus a config object exposed at `window.entityPerf`.

**Function 1: `shouldCullEntity(entity, camera, camFwd)`**

Returns `"far"` | `"frustum"` | `null`.

- **Far cull:** Euclidean distSq compared to `farCullDistance²` (default
  150m). Skipped entirely. A rigged kaiju at 150m is a few pixels — not
  worth animating + drawing.
- **Frustum cull:** dot product against camera forward catches entities
  behind. Perpendicular-component test catches entities off to the
  sides (with a `frustumMargin = 1.3` multiplier to be generous for
  wide kaiju / tall buildings).

**Function 2: `decideAnimatorUpdate(animator, distSq, frameDt)`**

Returns the dt to feed `animator.update()`, or `null` to skip this frame.

Distance tiers (configurable):
| Distance (m) | Update rate | When |
|---|---|---|
| ≤ 25  | 60 Hz | Close kaiju — every frame |
| ≤ 50  | 30 Hz | Medium — every other frame |
| ≤ 100 | 15 Hz | Far — every fourth frame |
| > 100 | 7 Hz  | Very far — once every ~8 frames |

The animator's `jointMatrices` persist across skipped frames, so the
previous pose stays correct. Skipped dt accumulates on the animator
(`_throttleAccDt`), so when the next update fires it gets the full
elapsed time — no animation slowdown, just less frequent sampling.

**Safety: Ragdolls always update every frame.** `animatorNeedsEveryFrame`
checks for `animator.onPose` (which is set by Ragdoll for physics
integration). Hit reactions use `_poseConstraints` instead and ARE
eligible for throttling — they're a no-op when `reactionT === 0`
anyway.

### `EntityMeshRenderer.render()` — wired up

- Pre-computes camera forward once at top
- Resets `ENTITY_PERF.stats` per frame
- Cull check happens BEFORE the `groups.set()` — culled entities don't
  even enter the per-asset loop
- Rigged inner loop calls `decideAnimatorUpdate` to choose dt or skip

### `main.js` — instrumentation for next round

Added two new profile sections to cover the previously-uninstrumented
gap between `audio` and `shadowPass`:

- `hudPanels` — `cameraPanel.update`, `civilizationPanel.update`,
  `kaijuPanel.update`. Each panel claims to be throttled internally;
  trust but verify.
- `renderPrep` — `world.getVisibleChunks()`, projectile/missile/OGRE
  dynamic-light collection, `sunFlare.update()`, sun-screenspace math.

After running v312 in-engine, run `_frameProf.start(5)` again and
these will be visible in the breakdown. Expect `renderPrep` to be
where most of the previously-uninstrumented 130ms lives.

---

## Public API

```js
// Inspect live stats (per-frame counters)
window.entityPerf.snapshot()
// → { totalEntities, culledFrustum, culledFar, drewRigged, drewNonRigged,
//     animatorUpdates, animatorSkips, framesCounted, enabled, ... }

// Toggle off for A/B comparison
window.entityPerf.setEnabled(false)
// → renderer reverts to v311 behavior; useful to confirm the win is real

// Tune thresholds
window.entityPerf.farCullDistance = 100   // tighter cull
window.entityPerf.frustumMargin = 1.5     // looser frustum
window.entityPerf.tiers[2].intervalSec = 1/30   // far tier → 30Hz
```

---

## Tests — 19/19 pass (`/tmp/test_entity_perf_v312.mjs`)

Pure-function tests for the decision logic (no GL needed):

- Entity in front rendered; entity behind frustum-culled
- 200m entity far-culled; far cull wins over frustum
- 5m side offset at 20m forward stays in; 30m side gets culled
- `enabled = false` → no culling (clean A/B path)
- Close entity (distSq=0) → update every frame
- Far entity (80²) → 1 update per 4 frames at 60Hz
- Ragdoll-driving animator forced every-frame
- Disabled → animator throttle returns full dt
- Skipped-frame dt accumulates correctly (4×dt = ~66.7ms after 3 skips)
- Stats counters reset on `_resetFrameStats()`

## Cumulative test count

- v303 joint angle limits: **21/21**
- v305 directional impulse: **18/18**
- v306 dismemberment: **20/20**
- v308 civilian ragdolls: **30/30**
- v309 hit reactions: **24/24**
- v310 mediapipe face metrics: **22/22**
- v312 entity perf: **19/19**
- **154/154 total**

---

## Files changed

- `render/entityPerf.js` — new, ~165 lines
- `render/EntityMeshRenderer.js` — import + per-frame cull + throttle wire-in
- `main.js` — two new profile sections (`hudPanels`, `renderPrep`)

---

## Expected impact

If 50% of entities are off-screen/behind/far, **`render.entities` should drop
from ~70ms to ~35ms** just from culling. Plus, of the entities that DO
render, far ones now update animators at 15-30Hz instead of 60Hz,
saving another ~30-50% of the remaining cost.

Realistic guess: **`render.entities` 70ms → 15-25ms.** That alone takes
frame time from 216ms to ~165ms, lifting FPS from 4.6 → ~6.

The bigger win likely comes from the new `renderPrep` instrumentation
revealing what's in the 130ms gap. That's round 313's target.

---

## How to test

1. Reload after unzip
2. Run `_frameProf.start(5)` (same scene as last time so the comparison
   is apples-to-apples)
3. **Paste the new table** — should see `render.entities` drop substantially
4. Also note `hudPanels` and `renderPrep` (previously hidden in the gap)
5. `window.entityPerf.snapshot()` to confirm culls fired:
   ```
   { totalEntities: 80, culledFrustum: 30, culledFar: 10,
     animatorUpdates: 120, animatorSkips: 80, ... }
   ```
   (Means: 40 entities visible. Of those, 120 animator updates and 80
   skips over the sample window — confirming throttling works.)
6. For A/B comparison: `entityPerf.setEnabled(false)`, run profile
   again, see the regression
