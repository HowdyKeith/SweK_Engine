---
type: doc
title: "Round 315 — FPS round 4: surgical splits"
tags: ["swek-engine", "round-doc"]
---

# Round 315 — FPS round 4: surgical splits

The v314 profiler math is clean. The data is trustworthy. Now we
split the two top costs to know exactly what to attack.

---

## v314 results — what the clean data said

```
total frame:           203.8ms (4.9 FPS) ← was 250ms in v313
wholeLoopBody (JS):    140.4ms
outside body (GPU):     63.4ms (31% of frame)
inner gap (unnamed):     0.4ms (0%)         ← math fixed, nothing hiding

TOP SECTIONS:
  render.entities    75.96ms  (37% of frame)
  water+particles    50.42ms  (25% of frame)  ← newly visible
  shadowPass          7.12ms
  hudUpdate           0.53ms                  ← was suspected 20-40ms
  postRenderTicks     1.09ms                  ← 20+ ticks correctly cheap
```

**Wins from v314:**
- hudUpdate throttle: ~30ms/frame saved (now invisible at 0.53ms)
- FPS 4.0 → 4.9
- All time is now accounted for (0.4ms inner gap)

**Open question — render.entities is back at 76ms.** It was 37ms in
v312 with the same cull code. Either:
- The scene has more visible rigged entities in this run (kaiju
  spawning + projectile combat active during sampling), or
- A regression in v313/v314

Without auto-snapshot data we couldn't tell. This round fixes that.

---

## What this round ships

### A. Split `water+particles` into 3 sections

```js
// Was: single 50.42ms section
// Now: three sections
profStart("waterUpdate");    waterRenderer.update(...);   profEnd();
profStart("waterRender");    waterRenderer.render(...);   profEnd();
profStart("particlesRender"); particles.render(...);      profEnd();
```

Next profile will tell us which of the three is the killer:
- `waterUpdate` is CPU wave-sim work
- `waterRender` is GPU (mesh + SSR + reflection sampling)
- `particlesRender` is per-particle GPU + CPU integration

Different fixes for each.

### B. Split `render.entities` into rigged vs batched

Inside `EntityMeshRenderer.render()`:

```js
if (isRigged) {
    profStart("entities.rigged");
    // per-entity loop: 1 draw call per rigged entity, full skinning
    profEnd("entities.rigged");
} else {
    profStart("entities.batched");
    // batched path: 1 draw call per asset group, N instances each
    profEnd("entities.batched");
}
```

If `entities.rigged` is the killer → the per-instance skinning loop
needs more aggressive throttling, OR we need LOD swaps to non-rigged at
distance.

If `entities.batched` is the killer → too many draw calls (one per
asset group), or too many entities per group. Solution is reducing the
group count (merge similar assets) or batching across groups.

### C. Auto-print `entityPerf` snapshot in profile report

The frame profiler now automatically includes the entityPerf stats at
the end of the report:

```
[_frameProf] ENTITY PERF — 559 avg/frame seen,
  frustum-cull 223, far-cull 20,
  drew rigged 12 + batched 304 |
  anim updates 5 / skips 7
  (thresh far=100m, frust=on)
```

No need to manually run `window.entityPerf.snapshot()` — it's logged
on every profile. Tells us per frame:
- How many entities the renderer SAW
- How many got culled (and which kind)
- How many drew via each path
- Whether the animator throttle is firing

### D. Tighter `entityPerf` defaults

Based on v312/v314 data showing 43% cull ratio with the previous
settings, this round bumps them up:

| Setting | v312 | v315 |
|---|---|---|
| `farCullDistance` | 150m | **100m** |
| `frustumMargin` | 1.3 | **1.15** |

At 100m a rigged entity is 4-8 pixels tall. Tighter frustum reduces
edge-of-screen draws. Both can be tuned back from the console if
anything pops out:

```js
window.entityPerf.farCullDistance = 150     // restore
window.entityPerf.frustumMargin = 1.3
```

Expected effect: 5-15% more entities culled, proportional drop in
`render.entities`.

---

## Expected impact

This round is mostly diagnostic — instrumentation + tighter defaults.
The cull tightening should shave 5-10ms off render.entities. The big
moves come next round when we know which of the new sub-sections is
the real cost.

---

## Tests — unchanged (168/168 still passing)

No new logic in the hot path; the changes are instrumentation +
configuration values. The v312 entity-perf tests still pass because
they set their own thresholds explicitly.

---

## Files changed

- `main.js` — split `water+particles` into 3 sections
- `render/EntityMeshRenderer.js` — split rigged/batched into 2 sections, profStart/End imports
- `render/entityPerf.js` — tighter defaults (100m / 1.15 margin)
- `debug/frameProfiler.js` — auto-print entityPerf snapshot in report

---

## Action item

Same drill, just one run:
```js
await window._frameProf.start(5)
/copy
```

What I'll be looking for in the new output:

1. **Which of `waterUpdate` / `waterRender` / `particlesRender` is the
   biggest** — different fixes for each:
   - waterUpdate big → throttle the wave sim to 30Hz
   - waterRender big → disable SSR, drop water resolution
   - particlesRender big → cap particle count, frustum-cull particles

2. **Which of `entities.rigged` / `entities.batched` is the biggest**
   — different fixes:
   - rigged big → distance LOD swap to non-rigged
   - batched big → merge asset groups to reduce draw call count

3. **The entityPerf snapshot line** — tells us whether the tighter
   defaults landed and how many entities are actually drawing now.

Round 316 attacks whichever wins. After FPS hits livable (>15), face
wiring resumes.
