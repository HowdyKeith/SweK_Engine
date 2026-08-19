# Round 306 — Worker HUD minimize + diagnostic tools + render hardening

Small round focused on giving you tools to identify the black panels +
FPS=10 culprit, plus a small UX fix to the WORKERS HUD.

---

## 1. WorkerEcgHud minimize button

Added a `−` / `+` toggle in the WORKERS panel header. When minimized:
- The canvas is hidden (`display:none`)
- The render loop early-returns past the canvas draw (no wasted CPU)
- The title bar + button stay visible so you can restore
- State persisted to `localStorage` so your preference survives reload

Also hardened the canvas with **inline `style.width` and `style.height`** so
that if any future stylesheet re-introduces a global `canvas { width:
100vw }` rule, this widget won't get stretched again. Belt-and-braces.

---

## 2. `window._uiAudit()` — black panel detector

Console diagnostic. Walks every DOM element, identifies all
fixed/absolute positioned overlays with area > 5000 px², reports:

- Selector (tag + id + class)
- Position + size
- z-index
- Background color
- For canvases: attribute width/height vs inline style width/height
- Marks dark-backgrounded ones with ■

Usage:
```js
await window._uiAudit()
```

Output is a `console.table` plus a warning list of dark overlays. Tell
me what shows up and I'll fix the offenders by name in v307.

The reason a tool is needed instead of guessing: with the previous
`canvas { width:100vw; height:100vh }` rule, multiple canvases were
being stretched off-screen — invisibly stacked behind `#glCanvas`. Now
that the rule is scoped, those canvases render at their *natural*
attribute dimensions (300×150 default if no `canvas.width = N` was set,
or N×M if it was), which is why "new" black panels appeared.

Identifying them by name lets us either:
- Pin explicit `style.display = "none"` if they should be hidden
- Pin explicit `style.width/height` if they should be tiny
- Remove the canvas creation entirely if it's vestigial

---

## 3. `window._fpsProfile(seconds)` — frame timing report

Console diagnostic. Samples frame intervals via `requestAnimationFrame`
for N seconds, then reports:

- Avg FPS over the window
- Frame interval p50 / p95 / p99 / max
- Count of slow frames (>33ms = under 30 FPS)
- Count of very slow frames (>100ms)
- Worst 5 frame intervals with timestamps
- Heuristic hints based on the patterns observed

Usage:
```js
await window._fpsProfile(5)
```

Expected interpretation:
- **p50 > 30ms** → sustained heavy work in the render loop. Look at:
  CSM cascade depth passes (if `csm._renderOn` is true),
  entity-count quadratic iteration, particle overflow.
- **p95 ≫ p50 × 3** → tail latency, suggesting periodic bursts:
  GC pauses (large per-frame allocations), worker message handling
  storms, AI ticks landing on the main thread.
- **>100ms frames** → likely synchronous network/disk: Ollama streaming
  on main thread, ComfyUI bridge waits, or chunk meshing without
  workers.

Tell me the output and I'll target the actual hot spot in v307 instead
of speculating.

---

## 4. Notes on the upcoming feature requests

- **Counter-Strike map import**: confirmed scope. Path 1 (BSP-as-prop)
  is ~1 round of work; ships as a console command + a `cs.import(url)`
  helper that voxelizes brush geometry into an OBJ-equivalent mesh and
  loads it as a static asset. Skipping CS:GO/CS2 Source BSP for now.
- **Limb dismemberment**: confirmed scope. Builds directly on
  v303 (angle limits), v304 (applyImpulse + RagdollManager.kick), and
  v305 (hit direction). New file `simulation/RagdollDismember.js` that
  detaches bone subtrees on accumulated hit damage to specific bones.
  Each dismembered limb spawns its own mini-Ragdoll with the v305 hit
  vector as its initial velocity. Bone-name heuristics determine which
  bones are severable (`arm.L`, `leg.R`, `hand.R`, `head`) vs which are
  spine-critical (`pelvis`, `spine`).

I'll pitch a specific round order after you've tested v306 — depends on
whether `_uiAudit` and `_fpsProfile` reveal a blocking issue first.

---

## Files changed
- `ui/WorkerEcgHud.js` — inline canvas dimensions, plus sync style height
  with attribute height when rows change
- `debug/uiDiagnostics.js` — new: `_uiAudit()` + `_fpsProfile()`
- `main.js` — dynamic import of diagnostics module

Tests: 21/21 (v303) + 18/18 (v305) still pass.
