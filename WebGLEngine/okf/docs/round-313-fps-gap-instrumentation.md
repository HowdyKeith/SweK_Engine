---
type: doc
title: "Round 313 — FPS round 2: instrument the gap + console tooling"
tags: ["swek-engine", "round-doc"]
---

# Round 313 — FPS round 2: instrument the gap + console tooling

The v312 cull worked (`render.entities` 70.5 → 37.3ms, 43% of entities
culled) but the FPS got slightly **worse** (4.6 → 4.0 FPS) because the
**uninstrumented gap grew from 130ms → 203ms/frame (81% of the frame)**.
The bottleneck moved out of `render.entities` into territory the
profiler couldn't see.

This round splits the frame into many more sections so we can name
what's there. Plus a bug fix on the entityPerf counters, plus three
small wins for the in-engine debug console you asked about.

---

## v312 results — what's good, what's bad

```
                              v310     v312     change
render.entities              70.5ms   37.3ms   ✓ -47%
shadowPass                    7.7      6.3     ✓
render.sky+atmosphere         6.3      2.0     ✓
hudPanels                     n/a      0.10   (new)
renderPrep                    n/a      0.03   (new)
Measured total               2195ms    951ms   -57% (good — but...)
Uninstrumented              ~3211ms   4061ms   ↑ 27% (bad — bottleneck moved)
Frame time                    216ms    250ms   ↓ FPS 4.6 → 4.0
```

The cull + animator throttle saved 33ms inside `render.entities`. But
the total frame got longer because something OUTSIDE the instrumented
sections grew.

`entityPerf.snapshot()` from your run:
```
{ framesCounted: 328, totalEntities: 559, culledFrustum: 223,
  culledFar: 20, drewRigged: 0, ... }
```

`drewRigged: 0` was misleading — bug, see below. The 223+20=243 culls
out of 559 entities (43%) is real and matches the render.entities savings.

---

## What this round ships

### A. Wider profiler instrumentation

Five new sections wrap previously-unwatched parts of the loop:

| Section | What it wraps | Likely cost |
|---|---|---|
| `wholeLoopBody` | Entire `loop(t)` body, start → end of frame | Tells us JS-work vs browser-gap |
| `frameOpen` | `systemPerf.tick(t)` at top of frame | Small but unbounded |
| `hudUpdate` | The big `hud.update({...})` block | **Suspect #1** — calls .snapshot() on ~15 subsystems each frame |
| `postRenderTicks` | 25+ `.tick(dt)` calls after render | **Suspect #2** — kaijuStaminaHud, remotePlayers, fpsShooter, botManager, wadMap, fpsAutopilot, wadVisualPolish, torchLighter, perfDashboard, bossPhaseManager, visionModes, swimMode, spaceSuit, kaijuMode, kaijuSandbox, dayNightCycle, weather, treeSpawner×2, throwCinematic |

The critical one is `wholeLoopBody`. By measuring it, we can split the
frame into:

- **`wholeLoopBody`** = total JS time inside the rAF callback
- **`frame − wholeLoopBody`** = browser/GPU/composite time outside our control

If `wholeLoopBody` is, say, 80ms and the frame is 250ms, then 170ms is
**not JS** — it's GPU stall, vsync wait, composite, GC pauses, or
background-tab throttling. That tells us where to attack:
- If JS dominates → optimize specific subsystems
- If non-JS dominates → reduce GPU work (less shaders, fewer canvases,
  drop CSM, smaller bloom resolution, etc.)

### B. Counter bug fix

`ENTITY_PERF.stats.drewRigged` and `.drewNonRigged` increments were
missing in v312 — the stats were defined but never written to. Now
wired:
- Rigged path: increments per single-instance draw (line ~1093)
- Non-rigged path: increments by `ents.length` per batched draw (line ~1183)

Next `entityPerf.snapshot()` will show real numbers.

### C. Debug console upgrades (your `~` console)

Three small wins on `ui/debugConsole.js`:

**1. `await` works.** Was: `new Function('return (${line})')` (sync). Now:
`new AsyncFunction('return (${line})')`. So this works in the in-engine
console now:

```
> await window._frameProf.start(5)
```

Result logs after the promise resolves — including objects pretty-printed
as JSON (so `entityPerf.snapshot()` no longer logs as
`[object Object]`).

**2. Multi-line input.** Hit **Shift+Enter** in the single-line input to
swap to a textarea. Type as many lines as you need; **Enter** submits
the block, **ESC** cancels. Useful for pasted blocks like:

```js
await window._frameProf.start(5);
window.entityPerf.snapshot();
// pretty-print whichever is interesting
```

**3. `/copy` command.** Drops the console buffer to the system
clipboard (uses `navigator.clipboard.writeText`). Optional N arg for
last N lines:

```
> /copy
copied 200 line(s) to clipboard (12847 chars)

> /copy 50
copied 50 line(s) to clipboard (3210 chars)
```

If clipboard write is denied (some browsers block in non-secure
contexts), `/dump` re-logs the full buffer to itself with header lines,
which makes copy-paste from the browser DevTools console easier.

---

## Public usage

```js
// In the in-engine ~ console:
await window._frameProf.start(5)
// (or with prompt prefix)
> await window._frameProf.start(5)

// Then to get the data to me:
> /copy
// → "copied 200 line(s) to clipboard (12847 chars)"
// Paste in chat.
```

If you prefer the browser DevTools console, that's still the canonical
place — DevTools shows table output prettier.

---

## Tests — unchanged (154/154 still passing)

No new logic in the renderer's hot path; the changes are instrumentation
+ counter wires + console UI. The previous test suites cover all the
behavior that matters.

---

## What I expect from your next profile run

Pasting predictions so we can check against reality. With `wholeLoopBody`
and `postRenderTicks` now visible, my prior is:

- **`hudUpdate`** in the 20-40ms range — that block calls
  `.snapshot()` on 15+ subsystems each frame
- **`postRenderTicks`** in the 30-50ms range — 20+ small ticks compound
- **`wholeLoopBody`** in the 100-130ms range total
- **Gap (`frame − wholeLoopBody`)** in the 120-150ms range — that's
  GPU/composite/vsync, harder to attack from JS

If `hudUpdate` is the killer, the fix is throttling it to 10Hz
(humans don't read the HUD at 60Hz). One-line change.

If `postRenderTicks` is the killer, we split it further next round.

If the **gap** is the killer, we look at GPU cost — likely the CSM (3
cascades × 1024² = 12 MB depth texture per frame), the bloom + god ray
pass, or the backdrop-filter on overlays.

---

## Files changed

- `main.js` — 5 new profile sections, no behavior change
- `render/EntityMeshRenderer.js` — `drewRigged`/`drewNonRigged` counter
  increments wired
- `ui/debugConsole.js` — async eval, Shift+Enter multi-line, `/copy`,
  `/dump`, JSON pretty-print

---

## Cumulative test count

- v303 ragdoll: **21/21**
- v305 directional: **18/18**
- v306 dismember: **20/20**
- v308 civ ragdoll: **30/30**
- v309 hit reactions: **24/24**
- v310 face metrics: **22/22**
- v312 entity perf: **19/19**
- **154/154 total**
