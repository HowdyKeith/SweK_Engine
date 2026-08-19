# Round 307 — Overlay translucency + backdrop-filter perf fix + dismemberment verified

Three issues addressed:

---

## 1. The "black panels" → translucent LCARS

`ui/lcars.css` had `.lcars-panel { background: #000 }` — solid opaque black.
That made STATUS, NARRATIVE, and every other LCARS-themed panel render as
black bricks blocking the voxel world behind them. Changed to:

```css
background: rgba(0, 0, 0, 0.72);
```

Now the world is visible behind every panel. Text is still readable, the
LCARS aesthetic still reads correctly, the panels just don't block sight
lines through them anymore. The user's `_uiAudit` flagged these as
`#000000` background panels — that's the fix.

---

## 2. The FPS=3 culprit → `backdrop-filter` running while hidden

`_uiAudit` identified `div.live-pipeline-hud` with these styles:

```
opacity: 0;
backdrop-filter: blur(6px);
-webkit-backdrop-filter: blur(6px);
```

**This is a well-known browser perf trap.** `opacity: 0` makes the element
visually invisible but DOES NOT disable backdrop-filter computation. On
most GPU paths (Chrome's compositor included), the blur of everything
behind the element still runs every frame even though the result is
discarded. A single full-width blur(6px) backdrop element can drop FPS
to single digits on heavy scenes.

Fix in `ui/livePipelineHUD.js`:
- Removed `backdrop-filter` from the initial inline `cssText`
- `show()` applies it
- `hide()` clears it (after the 300ms fade-out completes)

When the pipeline HUD is hidden (which is most of the time — it auto-hides
2.5s after the last running job ends), the blur isn't computed at all.
When it's visible, the blur runs only behind its small 280×33 px area.

Expected impact: substantial FPS recovery. If your run had:
```
backdropFilterElements: 1   (in _fpsProfile snapshot)
```
…that was costing tens of ms per frame.

The same trap exists in `ui/idleWorkersHUD.js` (line 41) but its panel
defaults to `display: none`, so backdrop-filter only runs when the
worker panel is explicitly expanded. Left alone.

---

## 3. Dismemberment — already shipped, now verified

This was the surprise. Going to write `simulation/RagdollDismember.js`
as a separate module, I checked the existing code first and found
**dismemberment was already fully implemented inside `Ragdoll.js`** —
a much cleaner approach than what I was about to build:

- `Ragdoll.sever(boneIdx, opts)` — marks bone as severed, BFS-discovers
  the subtree, applies separation velocity + optional tumble spin
- `Ragdoll.severRandomLimb(opts)` — picks a random non-root bone with
  ≥`minDescendants` descendants, severs it
- Distance-constraint pass skips parent→severed-bone link (line 292)
- Angle-constraint pass skips triples crossing the severance boundary
  (line 367)
- `RagdollIntegration._trySpawnRagdoll` auto-calls `severRandomLimb` on
  heavy hits when `goreEnabled && hitMag >= severDamageThreshold`
  (default threshold 0.4)

Result: single ragdoll, severed bones become "free" by dropping the
constraint to parent. They drift naturally under physics + initial
separation impulse. No second `Ragdoll` instance, no GPU pipeline
surgery, no special skinning code — the animator just renders the
severed bone at its (now widely diverged) parent-local offset, and the
skinned mesh shows the limb detached in world space.

### Tests added — 20/20 pass (`/tmp/test_dismember_v306.mjs`)
- Basic sever() detaches subtree + applies separation velocity
- Severed bone drifts past rest length (constraint correctly skipped)
- Sibling bones stay anchored (only severed link broken)
- Refuses root bone (idx 0) and out-of-range
- `severRandomLimb` varies across trials, never picks root
- Impulse magnitude scales with `separationSpeed` (24:12 ratio = 2.00)
- Multi-bone subtree includes all descendants (head + arms severed
  together when spine cut)
- Tumble spin applies opposite impulses to bones on opposite sides
  of subtree centroid

### How to test in-app
```js
window.ragdoll.setEnabled(true)
window.ragdoll.isGore()                    // should already return true
kaijuCity.start()
// then shoot a kaiju with strong enough weapon (damage ≥ 0.4) and
// watch for a limb flying off along the hit direction. Confirm via:
window.ragdoll.snapshot()
// → { spawned: N, limbsSevered: M, ... }
```

Or force-sever a specific kaiju manually:
```js
window.ragdoll.severLimb(someKaijuId, {x:1, y:0.5, z:0}, 12)
```

---

## Other things in this round

- `_uiAudit` now flags backdrop-filter elements in the snapshot — counts
  how many elements have an active blur, since it's a known perf trap
- `_fpsProfile` enriched: world snapshot at end of profile (kaiju count,
  particle count, civ count, backdrop-filter count, ragdoll stats),
  plus targeted hints when problematic values are detected
- `ragdoll.gore(true|false)` toggles auto-sever, `ragdoll.severLimb(id, dir, speed)`
  for manual triggering, `ragdoll.snapshot()` reports `limbsSevered` count

---

## Files changed
- `ui/lcars.css` — `.lcars-panel` background `#000` → `rgba(0,0,0,0.72)`
- `ui/livePipelineHUD.js` — backdrop-filter applied only on show(),
  cleared on hide() after fade-out
- `debug/uiDiagnostics.js` — snapshot extended; backdrop-filter detector
- `simulation/Ragdoll.js`, `simulation/RagdollIntegration.js` — already had
  dismemberment in place; tests added for it

## Tests across all rounds
- v303 joint angle limits: **21/21**
- v305 directional impulse: **18/18**
- v306 dismemberment: **20/20**

## Expected user-visible deltas
- LCARS panels (STATUS, NARRATIVE, etc) become semi-transparent — world
  visible through them
- FPS should recover substantially when livePipelineHUD is hidden (which
  is most of the time)
- Killing a kaiju with damage ≥ 0.4 has ~100% chance of severing a
  random limb (sever rate is hardcoded at "any heavy hit" right now —
  can be probabilistically gated in a future round if too constant)
