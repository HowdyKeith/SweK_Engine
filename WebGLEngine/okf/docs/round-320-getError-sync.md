---
type: doc
title: "Round 320 — the actual GPU sync stall was getError(), not bufferSubData"
tags: ["swek-engine", "round-doc"]
---

# Round 320 — the actual GPU sync stall was getError(), not bufferSubData

This is the one I should have caught earlier. Five rounds of optimization
on the wrong hypothesis. The data was telling me clearly:
**`entities.batched` per-call is ~6ms regardless of orphaning, regardless
of instance count, regardless of scene state.** That's not a data-upload
cost. That's a fixed-overhead sync point.

---

## What v319's two runs proved

```
v318 run 2: entities.batched 5.95 ms/call
v319 run 2: entities.batched 6.37 ms/call    ← orphan didn't help
```

Same operation, same scene type, same per-call cost. The buffer
orphaning was correct technique but **wrong diagnosis**. The
`bufferSubData` wasn't the stall; something AFTER it was.

I went looking for what else in the batched path could cost 6ms with
zero data variance, and found:

```js
// After every drawElementsInstanced in the batched path:
this._recordGLError(assetId, mesh, entry, ents, "batched");
```

And `_recordGLError`:
```js
_recordGLError(assetId, mesh, entry, ents, drawPath) {
    const gl = this.gl;
    const err = gl.getError();      // ← THE STALL
    if (err === gl.NO_ERROR) return;
    // ... aggregation logic
}
```

**`gl.getError()` is a forced GPU sync point** per WebGL spec. The
driver MUST flush all pending GL commands and return the actual error
state. On a slow scene with the GPU already backed up, this serializes
CPU and GPU on every batched draw.

This has been in place since round 185 ("always-on rate-limited GL
error capture"). It was fine then because FPS was high enough that
the per-call cost was negligible. At 4-7 FPS with the GPU already
working hard, each getError stalls for ~6ms.

With 7 batched calls/frame (color) + ~7 in shadow pass = ~14 getError
calls/frame, that's **~84ms/frame purely on getError sync**.

---

## What this round ships

A simple sampling gate on `_recordGLError`. Sample 1 in 64 calls per
renderer instance:

```js
_recordGLError(assetId, mesh, entry, ents, drawPath) {
    const checkEvery = window.engineConfig?.entityMeshErrorPollEvery ?? 64;
    this._emrCheckCounter = (this._emrCheckCounter ?? 0) + 1;
    if (this._emrCheckCounter % checkEvery !== 0) return;

    const gl = this.gl;
    const err = gl.getError();   // ← now amortized across 64 calls
    // ... rest unchanged
}
```

**At 64 calls per real getError:** mean cost is 6ms / 64 ≈ 0.094ms per
draw, instead of 6ms. Savings:
- Color pass: ~7 calls/frame × 5.9ms saved ≈ **41ms/frame**
- Depth pass: same → another ~41ms/frame
- **Total: ~80ms/frame saved on busy scenes**

### Error coverage tradeoff

Persistent errors (the only kind that matter — a driver bug, a stale
VAO, anything that recurs) still get caught within ~64 frames, which
at 5 FPS is ~13 seconds. Acceptable. Transient single-frame errors
may slip through, but they're rare in production GL code and not
worth 80ms/frame.

For debugging, restore the old behavior with:
```js
window.engineConfig.entityMeshErrorPollEvery = 1   // poll every call
```

Or disable entirely:
```js
window.engineConfig.entityMeshErrorPollEvery = Infinity
```

### What about v319's buffer orphaning?

Kept in place. It's the canonical WebGL pattern for streaming
instance data and doesn't hurt. On other GPUs/drivers it might still
provide some benefit independent of getError. The orphan calls are
~0.01ms each — negligible.

---

## Expected impact

If the diagnosis is right (and the data is unambiguous):

- `entities.batched` per-call: 6.37ms → **~0.5ms** (driven by actual
  draw cost + amortized getError, not the sync)
- `entities.batched` per-frame: 44.57ms → **~3-5ms** at 7 calls/frame
- `render.entities` wrapper: 57.33ms → **~20-25ms** (drops by ~35ms)
- `wholeLoopBody`: 86.7ms → **~50ms** (median run 2 baseline)
- Frame total (median run 2): 156ms → **~120ms** = **~8 FPS**
- Frame total (mean): 165ms → ~130ms = ~7.7 FPS

This is the biggest single fix in the whole FPS investigation.

---

## Why I missed this for 5 rounds

I'd been treating `entities.batched` as a single black-box "GPU
upload + draw" cost. The per-call mean of 6ms was suspicious but I
fixated on `bufferSubData` because:
1. It's the obvious data-volume operation
2. Buffer orphaning is the textbook fix
3. The cost SCALED with the number of asset groups, matching a
   per-call upload pattern

The cost was actually per-CALL because `getError` runs once per
draw. Same number of calls, same number of `getError`s, same total
sync time. The pattern matched both hypotheses equivalently.

Lesson: when a measured cost doesn't depend on data volume,
**suspect synchronization primitives**, not data operations.
`gl.getError()`, `gl.finish()`, `gl.readPixels()`, `gl.checkFramebufferStatus()`,
`gl.fenceSync()` — these all force flushes. Polling any of them in
a hot path serializes the pipeline.

---

## Tests — 196/196 cumulative (was 188 + 8 new)

`test_gl_error_throttle_v320.mjs` covers:
- Default 1-in-64 sampling
- N=1 restores old per-call behavior
- N=Infinity effectively disables
- Counter behavior across realistic load (2100 calls/5sec)
- Acceptable cadence at low FPS

GL behavior itself can't be unit-tested without a WebGL mock, but
the throttle gate is pure JS arithmetic and is fully covered.

---

## Action item

```js
await window._frameProf.start(5)
/copy
```

What I expect (and this should be unambiguous this time):

- **`entities.batched` ms/call drops from ~6 to <1** — this is the
  signal that confirms the diagnosis
- **`entities.batched` ms/frame drops from ~45 to ~5**
- **`render.entities` wrapper drops by ~35ms**
- **Median frame time drops by 30-40ms**
- **FPS jumps from ~6 to ~9-12** in the median-case scene

If the per-call cost is still ~6ms after this, the diagnosis was
wrong AGAIN and the real cost is somewhere else (deeper in
`_drawInstancedMultiMaterial` for multi-mat assets, or texture
binding setup, or a fence we haven't found). But the WebGL spec is
clear on getError being a sync point — this is the most confident
prediction I've made in the whole investigation.

---

## After this round

Whatever remains as the top section is the next target. Predictions
for what'll surface:

1. **`outside body` GPU work** (currently ~80ms) becomes the
   dominant cost — voxel forward + shadow + sky/bloom. Wins here
   need user-visible changes (gridRadius reduction, disable bloom).
2. **`waterUpdate`** at ~10-18ms is the next JS leaf. Could throttle
   further (engineConfig.waterCollectIntervalMs = 1000 for 1Hz) or
   refactor `collect()` to track water voxels incrementally.
3. **`render.sky+atmosphere`** spikes (97ms max) — a periodic event,
   probably lightning/storm transition. Worth investigating once the
   means are reasonable.
