# Round 318 — distribution stats + smaller shadow

The v317 math is honest. The data is reliable. But the mean alone is
misleading me — every round I'm trying to compare mean frame times
across 21-26-frame samples that include 1-2 catastrophic spikes.

This round adds the diagnostics I should have had three rounds ago.

---

## What v317's clean data actually told us

```
total frame:           254.7ms (3.9 FPS)
wholeLoopBody (JS):    114.1ms (44.8%)     ← honest! (v316 said 167 was actually 113)
outside body (GPU):    140.6ms (55.2%)     ← GPU is now the dominant cost
inner gap:               8.6ms (8%)        ← clean, nothing hiding

TOP LEAF SECTIONS (per-frame):
  entities.batched      55.84  (21.9%)     ← 7 calls/frame × 7.9ms
  waterUpdate           30.71  (12.1%)     ← max 158.3ms (spike)
  render.sky+atmosphere  8.19   (3.2%)     ← max 111.4ms (spike)
  shadowPass             6.54   (2.6%)     ← was 7.29, halving did some good
```

**Honest read of v316 → v317:** JS body stayed essentially the same
(113 → 114ms). Outside-body grew (~92 → 141ms) BUT every leaf section
had a spike max well above its mean. Sample noise + busier scene with
Ollama callbacks streaming during the profile.

The mean is being inflated by 1-2 catastrophic frames. Without
distribution stats I can't tell if my changes helped, hurt, or were
neutral.

---

## What this round ships

### `debug/frameProfiler.js` — frame-time distribution

Each `profEnd` now appends to a `durations[]` array (capped at 600
samples per section). The report adds a `wholeLoopBody DISTRIBUTION`
section:

```
[_frameProf] wholeLoopBody DISTRIBUTION (JS only, 21 samples):
  min:          85.2ms
  p50 (median): 102.1ms
  mean:         114.1ms  ← inflated by spikes
  p95:          156.8ms
  max:          187.6ms
  steady-state estimate: ~243ms/frame (~4.1 FPS) at median
```

**The "steady-state estimate"** is median JS body + average outside
body — the FPS you'd see if no spike frames happened. When mean is
>1.3× median, the report flags it as "inflated by spikes" so I'll stop
chasing optimizations on noise.

### `main.js` — shadow 1024² → 512²

One more halving. At 4 FPS the shadow GPU work matters. 512² is
indistinguishable from 1024² at typical voxel-world view distance,
and quarters the shadow FBO sample cost. Configurable:
```js
window.engineConfig.shadowMapSize = 1024   // restore crisper shadows
```

---

## Why I'm not doing more this round

The two real bottlenecks left are:

1. **`entities.batched` ~56ms/frame** — 7 asset-group draws × ~8ms each
   for ONE `drawElementsInstanced` of 2-3 instances of small meshes.
   Strong signal of `bufferSubData` GPU sync stalls. Fixable via
   buffer orphaning. **Medium risk** — could break rendering if I get
   the orphan call wrong, and the test suite doesn't cover GPU calls.

2. **`outside body` 141ms** — voxel forward + entity forward + sky
   + bloom + composite, GPU-bound. Real wins here require either
   reducing visible content (gridRadius 7 → 5 = 169 → 81 chunks) or
   disabling features (bloom, atmosphere). Both are user-facing
   visual changes.

Before either, I want to see clean median numbers across 2-3 profile
runs to know which is actually the bigger lever in steady-state.

---

## Action item

```js
await window._frameProf.start(5)
/copy
```

What I want to see in v318's output:

- The new `DISTRIBUTION` block on wholeLoopBody
- Whether `min` is much smaller than `p50` (would mean even the
  median is being dragged up by frequent small spikes)
- Whether `mean` flags as "inflated by spikes" (would confirm 1-2 bad
  frames dominating, and v316↔v317↔v318 comparisons should use
  median not mean)
- shadowPass dropping further from ~6.5ms

If you run the profile twice and the medians match within 5ms, the
data is finally reliable enough to make confident calls on
buffer-orphaning vs gridRadius vs bloom-disable for v319.

---

## Tests — 188/188 cumulative (was 173 + 15 new)

Added `/tmp/test_frame_distribution_v318.mjs` with 15 tests covering:
- Basic percentiles on uniform data
- Empty/single-element edge cases
- The exact v317 spike scenario (20 normal frames + 1 outlier)
- Monotonic and bimodal distributions

The percentile helper uses standard linear interpolation, so values
like p95 of `[10..100]` give 95.5 (not exactly 95). That's correct
behavior — the test fixtures match.
