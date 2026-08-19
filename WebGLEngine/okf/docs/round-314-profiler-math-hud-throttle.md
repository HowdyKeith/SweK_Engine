---
type: doc
title: "Round 314 — FPS round 3: profiler math fix + hudUpdate throttle"
tags: ["swek-engine", "round-doc"]
---

# Round 314 — FPS round 3: profiler math fix + hudUpdate throttle

Three things this round, all small but corrective.

---

## Findings from v313 profile

```
[21:48:35] await window._frameProf.start(5)
[21:48:41] Window: 5139ms, 12 frames, avg 428.3ms/frame (2.3 FPS)
[21:48:41] Measured: 6022ms · uninstrumented: -883ms (-17%)
[21:48:41] ⚠ Top section "wholeLoopBody" using 64% of frame budget
```

Three issues exposed:

### Issue 1 — Profiler math was broken

The "Measured / uninstrumented" line went **negative**. The reason:
`wholeLoopBody` wraps everything else, so when I summed all sections
including the wrapper, I double-counted everything inside it once. The
"Measured" number was inflated, the "uninstrumented" went negative.

### Issue 2 — Key data lost from /copy

The `console.table` rich output doesn't survive in the in-engine
console buffer the way plain `console.log` lines do. So when you hit
`/copy` later, the table data was gone — only the summary lines were
captured. We only had `wholeLoopBody = 64% of frame` to work with.

### Issue 3 — Strong signal: JS dominates

Despite the broken math, the one number we DID have was actionable.
`wholeLoopBody = 64% of frame = ~274ms of 428ms`. That means **JS work
inside the loop body is dominant** — only ~154ms is outside (GPU stall,
composite, vsync). The fix needs to be JS-side, not GPU-side.

---

## What this round ships

### A. Profiler math fix (`debug/frameProfiler.js`)

Sections are now categorized as **wrapper** (contains other sections)
or **leaf** (atomic). Currently `wholeLoopBody` is the only wrapper.

The report now computes two cleanly-separated gaps:

```
total frame:           250.0ms (4.0 FPS)
wholeLoopBody (JS):    180.0ms                ← inside the rAF callback
outside body (GPU…):    70.0ms (28% of frame) ← composite, vsync, GC
leaf sections sum:     150.0ms                ← what we explicitly measured
inner gap (unnamed):    30.0ms (17% of body)  ← JS inside body, unmeasured
```

If **outside body** is large → GPU/composite. Reduce shadow res, drop
bloom, fewer overlay canvases.

If **inner gap** is large → JS we haven't named. Add more `profStart`/
`profEnd` to narrow it down.

If both are small but the frame is still slow → look at the top
non-wrapper section in the table.

### B. Plain-text summary in console buffer

After `console.table`, the report now also emits a `console.log`
text-summary line with the top 12 sections formatted as fixed-width
columns:

```
[_frameProf] TEXT SUMMARY (mean ms / max ms / % of frame):
  wholeLoopBody (wrapper)        180.00   220.0   72.0%
  hudUpdate                       25.00    45.0   10.0%
  postRenderTicks                 18.00    32.0    7.2%
  render.entities                 15.00    28.0    6.0%
  ...
```

This survives in `this.lines` so `/copy` always gets the data.

### C. `hudUpdate` throttle (10Hz default)

The HUD's `update({...})` block calls `.snapshot()` on 15+ subsystems
each frame to populate a giant fields object. At 60Hz that's
4-30ms/frame of pure JS busywork — for a HUD a human reads at most
~10Hz.

Throttled via `engineConfig.hudHz` (default 10). One-line change in
`main.js`:

```js
if (t - _lastHudT >= 1000 / engineConfig.hudHz) {
    _lastHudT = t;
    hud.update({...});
}
```

Tune from the console:
```js
window.engineConfig.hudHz = 5    // even less HUD work
window.engineConfig.hudHz = 60   // restore original behavior
```

### D. Three new profile sections

Filling more of the previously-unnamed gap:

- **`perfStats`** — the small `{ ps.fps = ..., ps.frameMs = ... }` block
  plus the throttled `gfx-fps` DOM writes
- **`water+particles`** — `waterRenderer.update + render + particles.render`
  (the visible-but-unwrapped block between `render.entities` and
  `postProcess.bloom`)

---

## Expected impact

If v313 had `hudUpdate` at, say, 20ms/frame at 60Hz, the 10Hz throttle
takes it to ~3ms/frame average. That's a 17ms/frame win → frame time
~250ms → ~233ms → 4.0 FPS → ~4.3 FPS. Not huge in absolute terms
because the overall is so JS-bound, but the math is correct now.

Bigger picture: with proper math, your next profile will tell us
exactly where to attack:

- If `wholeLoopBody/frame > 60%` → JS-bound, look at top non-wrapper
  section
- If `outsideBody/frame > 40%` → GPU-bound, look at shadow/bloom/CSM
- If `innerGap/frame > 30%` → instrumentation hole, add more sections

---

## Tests — 14/14 (`/tmp/test_profiler_math_v314.mjs`)

Pure-function tests for the wrapper-vs-leaf math:

- Healthy 60 FPS case: outside body small, inner gap small
- JS-bound case: wholeLoopBody dominates frame, inner gap reveals hole
- GPU-bound case: small body, large outside-body gap
- Empty profile doesn't NaN
- Wrapper detection is exact-match (no name-prefix fooling)

## Cumulative tests

- v303 ragdoll: **21/21**
- v305 directional: **18/18**
- v306 dismember: **20/20**
- v308 civ ragdoll: **30/30**
- v309 hit reactions: **24/24**
- v310 face metrics: **22/22**
- v312 entity perf: **19/19**
- v314 profiler math: **14/14**
- **168/168 total**

---

## Files changed

- `debug/frameProfiler.js` — wrapper-vs-leaf math + text summary
- `main.js` — hudUpdate throttle, `perfStats` + `water+particles` sections

---

## Action item

Same profile, fresh run:

```js
await window._frameProf.start(5)
/copy
```

The `/copy` will now capture both the table (if shown soon enough) AND
the text-summary block. Whichever is bigger after the throttle — the
inner gap or a specific leaf — that's the next round's target.

If the inner gap is small now (everything in the body is measured), we
attack the top non-wrapper section. If it's still large, I'll wrap
more.

After FPS is livable (>15), face wiring resumes — HeartbeatAvatar mirror
then kaiju expression channel (two rounds).
