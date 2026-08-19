---
type: doc
title: Round 319 — buffer orphaning for entities.batched
tags: ["swek-engine", "round-doc"]
---

# Round 319 — buffer orphaning for entities.batched

The v318 data finally had the diagnostic clarity to see the problem.
Now we attack it.

---

## What v318's two runs told us

### Run 1 (5340ms, 27 frames — heavy combat scene)
```
total frame:           197.8ms (5.1 FPS)
wholeLoopBody (JS):    118.5ms
outside body (GPU):     79.3ms (40%)
DISTRIBUTION min=87.9  median=112.7  mean=118.5  p95=163.6  max=172.8

entities.batched       75.69ms/frame  (38.3% of frame)   ← #1 leaf
  per-call mean:        ~8ms                              ← THE SMOKING GUN
waterUpdate            14.16ms                            ← was 30.71 in v317
shadowPass              7.69ms                            ← was 6.54 in v317
render.sky+atmosphere   5.68ms

ENTITY PERF — 617 seen, frust-cull 271, far-cull 116, drew batched 30
```

### Run 2 (5114ms, 34 frames — camera shifted, less drawing)
```
total frame:           150.4ms (6.6 FPS)
wholeLoopBody (JS):     58.2ms
outside body (GPU):     92.2ms (61%)
DISTRIBUTION min=35.0  median=51.1  mean=58.2  p95=89.8  max=98.6

entities.batched       26.62ms/frame (152 calls / 34 frames = 4.5/frame)
  per-call mean:        5.95ms                            ← STILL 5.95ms for ONE draw
waterUpdate             9.50ms
shadowPass              8.36ms

ENTITY PERF — 650 seen, frust-cull 298, far-cull 264, drew batched 5
```

### Key findings

1. **Run-to-run variance is huge.** Median JS body went 112ms → 51ms
   in ten seconds. Same engine, same scene; the camera and active
   kaiju shifted. JS body scales nearly linearly with entities drawn.

2. **Per-call cost of `entities.batched` is ~6ms regardless of scene
   load.** Run 1: ~8ms/call (busy). Run 2: 5.95ms/call (idle). A
   single `drawElementsInstanced` of 1-2 instances of a small mesh
   (50 verts) should be microseconds. **6ms is sync wait.**

3. **The `bufferSubData` to `entry.instanceBuf` is almost certainly
   blocked on the GPU still using that buffer for the previous
   frame's draw.** Classic WebGL hazard with reused-per-frame instance
   buffers.

4. **The non-batched wins landed:**
   - waterUpdate: 30.71 → 14.16 → 9.50ms (water throttle to 500ms ✓)
   - outside body: 141 → 79-92ms (shadow halving + water savings ✓)
   - FPS: 3.9 → 5.1 → 6.6 (modest but real)

---

## What this round ships — buffer orphaning

Standard WebGL pattern for per-frame instance buffers. Before each
`bufferSubData` call on `entry.instanceBuf`, insert a `bufferData`
with size only:

```js
gl.bindBuffer(gl.ARRAY_BUFFER, entry.instanceBuf);
gl.bufferData(gl.ARRAY_BUFFER, entry.capacity * INSTANCE_BYTES, gl.STREAM_DRAW);
gl.bufferSubData(gl.ARRAY_BUFFER, 0, buf.subarray(0, ents.length * INSTANCE_FLOATS));
```

**What happens at the driver level:**
- The `bufferData` call tells the driver "I don't need the old
  contents". The driver detaches the old GPU memory (still in use by
  the previous frame's draw) and allocates fresh storage.
- The `bufferSubData` writes into the fresh storage.
- The new `drawElementsInstanced` reads from the fresh storage.
- The old storage is freed when the GPU is done with it (parallel,
  no CPU wait).

**Without orphaning,** `bufferSubData` would have to wait for the GPU
to finish using the buffer before overwriting it. That serializes
CPU and GPU, and on a low-FPS scene where the GPU is already behind,
the wait IS the per-call cost.

**The capacity invariant is preserved.** `_ensureInstanceCapacity`
sets `entry.capacity * INSTANCE_BYTES` as the buffer size; our orphan
re-allocates at the same size. No interference with growth logic.

### Sites patched

Four sites in `render/EntityMeshRenderer.js`:

1. **Batched color render path** (the v318 hot path, ~7 calls/frame,
   ~6ms each = 40ms/frame potential savings)
2. **Batched depth/shadow pass** (same buffer, same hazard, also
   per-frame)
3. **Rigged color path** (one call per rigged entity per frame —
   currently 0 in user's scene but kicks in when kaiju are visible)
4. **Rigged depth path** (same)

All use the same orphan-then-subdata pattern.

---

## Expected impact

If the orphan converts the 5.95ms sync wait to <1ms per call:

- v318 run 1: 30 entities × ~7 calls × 5ms saved = ~35ms/frame
- v318 run 2:  5 entities × ~4.5 calls × 5ms saved = ~22ms/frame

**Best case:** Run 1 frame median drops 112 → 77ms = 8 FPS (was 5.2).
Run 2 median drops 51 → 29ms = 8 FPS (was 7.0).

**Worst case (orphan doesn't help on user's GPU/driver):** No change.
The orphan call itself is cheap, ~0.01ms. No regression.

---

## Risk

Low. Buffer orphaning is the canonical WebGL pattern, documented in
WebGL Fundamentals and Khronos best practices. The only failure mode
would be:

- Hitting a driver bug where the orphan doesn't actually orphan —
  but that just means no perf improvement, no broken rendering.
- Capacity mismatch with `_ensureInstanceCapacity` — but we preserve
  the exact same size, so this invariant holds.

The test suite doesn't cover GPU calls, so a render bug would only
appear at runtime. The change is a 1-line insert (well, 2-line with
the orphan call) before each `bufferSubData` site — minimally invasive.

---

## Tests — 188/188 unchanged

No new test logic; this is a GL-call-level optimization. Existing
tests verify the data structures and call patterns aren't disturbed,
which they aren't — the orphan happens before the same subData with
the same arguments.

---

## Action item

```js
await window._frameProf.start(5)
/copy
```

What I expect to see:

1. **`entities.batched` per-call drops from ~6ms to ~0.5-1ms** if the
   orphan landed (the sync wait was the bulk of the cost).
2. **`entities.batched` per-frame** drops proportionally — likely
   20-40ms/frame depending on scene load.
3. **`render.entities` wrapper** drops by similar amount.
4. **Frame median** improves by 20-40ms. FPS estimate from median
   goes from ~7 to ~9-11.

If the per-call cost is unchanged at ~6ms after this fix:
- The sync stall hypothesis was wrong
- Real cost is elsewhere (texture binding? uniform upload? shader
  switch?)
- Next round would add finer instrumentation INSIDE the batched call

If per-call drops dramatically:
- Hypothesis confirmed, FPS jumps
- Round 320 attacks `outside body` GPU work directly (gridRadius
  reduction or bloom disable)
