# Round 335 — MeshPostProcessor wiring + console scripts + version + watermark

Four user-requested fixes, all small-to-medium, all orthogonal.
Bundled so each test cycle covers four things instead of one.

---

## 1. MeshPostProcessor wired into the asset loader (surgical path)

Resolved the open architectural question from v331's doc: **surgical
edits**, not a shim. The asset loader's `_loadOBJFromText` now has
an opt-in hook that runs the post-processor inline before
`_createMesh` uploads to the GPU.

### `processSync` API

`simulation/MeshPostProcessor.js` gains a synchronous variant of
`process()` that runs the weld + normals kernels on the main
thread — no worker round-trip. Why sync: the asset loader path is
synchronous, and the kernels are fast enough on typical meshes
that blocking is cheaper than the postMessage/transfer/reupload
dance.

```js
const result = meshPP.processSync({
    positions: float32Array,
    indices:   uint16Or32Array,
    epsilon:   1e-4,
    name:      "kaiju_water",   // optional, for per-mesh stats
});
// → { positions, indices, normals, originalCount, weldedCount, durationMs }
```

**Critical difference from async `process()`:** `processSync` does
NOT transfer the input buffers. Caller's positions/indices stay
valid after the call. (Necessary for the loader, which needs to
keep using the original color buffer for the remap.)

Typical cost: 1-5ms for kaiju-sized meshes (1-5k verts). Larger
meshes (50k+) get to ~50ms — for those, the async path is still
preferred.

### The hook

`gpu/gpuAssetLoader.js` `_loadOBJFromText` now checks for
`window.meshPP.enabled()` after parsing the OBJ, before mesh
creation. If enabled:

1. Call `processSync` on positions + indices
2. Rebuild the color buffer to match welded vertices (epsilon-
   quantized position lookup → original color)
3. Substitute the welded positions/indices/normals/colors
4. Set `meta.postProcessed = true` so downstream code can tell
5. Fall through to `_createMesh` with the cleaned data

If `processSync` throws (corrupted mesh, kernel bug, anything),
the hook catches and falls back to the original un-welded path —
mesh still loads, just without cleanup.

Console message on each post-process:
```
[meshPP] kaiju_water: welded 1834 → 612 (4.2ms)
```

### Opt-in

Still disabled by default. Flip on via:
```js
meshPP.setEnabled(true)
// or
enableAllFeatures()    // turns on streamer + meshPP + gridGrow at once
```

Effects after enabling: every subsequent OBJ load gets welded.
Existing loaded meshes are untouched until you re-load them.

---

## 2. Multi-line script support in debug console

The debug console (\` to toggle) now accepts a multi-line script
in a single command. Two separators:

- **Newline** (`\n`) — when you paste multi-line text
- **`;;`** (double semicolon) — when you paste a single line

Both can be mixed in the same input. Empty lines and `//` comment
lines are stripped. Each command runs sequentially with its own
result rendered, so order is preserved and you see what each one
did.

Example:
```
streamer.setEnabled(true);;meshPP.setEnabled(true);;engineStatus()
```

→ Three commands, three result lines:
```
> [script: 3 commands]
  [1/3] streamer.setEnabled(true)
> streamer.setEnabled(true)
(ok)
  [2/3] meshPP.setEnabled(true)
> meshPP.setEnabled(true)
(ok)
  [3/3] engineStatus()
> engineStatus()
{...status object...}
< script done (3 commands)
```

Multi-line paste works the same way:
```
// Enable everything
streamer.setEnabled(true)
meshPP.setEnabled(true)
engineStatus()
```

Errors in one command don't abort the script — the rest continue.
Each error gets its own `ERR:` line and the next command runs.

### Internal refactor

`_runCommand` became the entry point that detects multi-line input.
`_runOne` is the worker that handles a single command (slash-cmd
or JS). The previous `_runCommand` logic moved into `_runOne` with
minimal changes — same behavior for single commands, new path for
multi.

---

## 3. Engine version in the STATUS panel

`window.ENGINE_VERSION = "v335"` is now set early in main.js and
referenced by the STATUS panel header. What used to be the static
"H-01" label now reads "v335" (or whichever version is current).

You can also query it from the console:
```js
engineVersion()       // → "v335"
window.ENGINE_VERSION // → "v335"
engineStatus()        // includes version in the table
```

When I bump the version next round, the panel updates automatically.

---

## 4. Job-search watermark

Subtle bottom-right corner text on a 34-second fade cycle:

- Fade in: 3s (0% → 9% of cycle, opacity 0 → 0.55)
- Hold: 8s (9% → 32%, opacity 0.55)
- Fade out: 3s (32% → 41%, opacity 0.55 → 0)
- Dark: 20s (41% → 100%, opacity 0)
- Repeat

Style: 11px monospace, semi-transparent black background,
text-shadow for legibility on light terrain, `pointer-events:none`
so it never blocks UI. Max opacity 0.55 — visible but doesn't
dominate.

**Text:** "Keith needs a job — please help. howdykeith@gmail.com"

Toggle from console:
```js
jobWatermark.hide()      // hide entirely
jobWatermark.show()      // bring back
jobWatermark.destroy()   // remove from DOM
jobWatermark.setText(s)  // change the message
```

Positioned bottom-right by default. Alternatives via constructor:
"top-left", "top-right", "bottom-left". Not exposed in the
console API for v335 — would need a `setPosition` method or
recreate the instance.

---

## Bonus: `engineStatus()` and `enableAllFeatures()`

Two convenience helpers wired in main.js for the testing workflow:

```js
engineStatus()
```
Prints a console.table with current engine state:
```
┌────────────────┬──────────┐
│ (index)        │ Values   │
├────────────────┼──────────┤
│ version        │ "v335"   │
│ streamer       │ false    │
│ meshPP         │ false    │
│ gridGrow       │ false    │
│ worldChunks    │ 225      │
│ gridRadius     │ 7        │
└────────────────┴──────────┘
```

```js
enableAllFeatures()
```
Flips on `streamer`, `meshPP`, and `gridGrow` (if present). Returns
the new status. Use this when starting a fresh test session to
bring all the opt-in systems online with one call.

---

## Tests — 829/829 cumulative

`test_v335.mjs` adds 32 tests:

**processSync (T1-T3, 11 tests):**
- T1: produces same numeric output as the underlying kernel
- T2: does NOT detach caller's buffers (key contract difference vs `process()`)
- T3: returned arrays are fresh, distinct from inputs

**Multi-line script splitter (T4-T10, 14 tests):**
- T4: splits on `;;`
- T5: splits on newlines
- T6: mixed separators in one input
- T7: drops blank lines and `//` comments
- T8: single command stays single
- T9: single `;` inside a for-loop expression doesn't split it
- T10: pure-comment input collapses to zero commands

**Watermark math (T11-T12, 7 tests):**
- T11: 34s cycle phases land at expected percentages (3s fade-in
  ≈ 9%, 11s hold-end ≈ 32%, 14s fade-out-end ≈ 41%, ~20s dark)
- T12: text contains expected name and email

T9 was the test that made me think hardest. A naive split on `;`
would break for-loops. Using `;;` as the separator avoids the
problem — single `;` inside JS expressions is fine.

---

## Try it

```js
// Confirm you're on v335 — check STATUS panel header or:
engineVersion()
// → "v335"

// Bring everything online in one paste:
enableAllFeatures()
// → enables streamer + meshPP + gridGrow, prints status table

// Or the multi-line equivalent in the in-engine console (backtick):
streamer.setEnabled(true);;meshPP.setEnabled(true);;engineStatus()

// Hide the watermark for screenshots:
jobWatermark.hide()
```

---

## What's next

The original docket-pivot block (v331-v334) plus #1 from the
follow-up list (MeshPostProcessor wiring) is now done. Remaining
items I named earlier:

- **#2** OBJ floating preview canvas — pure UI, draggable, above bench
- **#3** Per-tool "→ Bench" jump buttons in pipeline section
- **#4** Boundary walls following camera (v332 known limitation)
- **#5** CS arc validation (still on you)

If real-play testing reveals that meshPP improves mesh quality
noticeably (or breaks something), that decision feeds back into
whether to make `enableAllFeatures()` default-on in a future round.

Order's up to you — I lean **#2** next (OBJ preview canvas) since
you mentioned it explicitly in earlier docket conversations and it
pairs naturally with the pipeline tools panel from v334.
