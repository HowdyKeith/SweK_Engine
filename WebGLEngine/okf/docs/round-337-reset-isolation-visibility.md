---
type: doc
title: Round 337 — Reset that actually nukes everything · Demo isolation · Background sleep
tags: ["swek-engine", "round-doc"]
---

# Round 337 — Reset that actually nukes everything · Demo isolation · Background sleep

Three shipping items. The biggest is the reset fix.

---

## 1. Why "Reset World" wasn't resetting

Found the culprit. The engine loads a static file called `scene.json` on
every page boot. It ships 7 entities — a player and 6 enemies/props —
all positioned between y=25 and y=30, well above natural terrain (which
caps at ~y=10). Those entities have render components, so they appear
as floating geometry in the sky.

`scene.json` is on disk, not in localStorage. Reset clears localStorage,
the page reloads, and the same 7 sky entities re-populate from disk.
That's the "sky stuff from a while ago" that wouldn't go away. v333's
reset improvements cleared the gate flags so painters re-run, but
scene.json was outside that whole system.

### The fix — three layers

**ECSWorld.clearAll()** — new method on the ECS that wipes every entity,
every component store, the spatial grid, and the event queue in one call.
Systems registration is preserved (PhysicsSystem etc. stay alive).

```js
const r = ecsWorld.clearAll();
// → { cleared: 7 }
```

**`world:reset` now also:**
- calls `ecsWorld.clearAll()` (clears in-memory entities)
- sets `voxelengine.skipSceneOnce = "1"` (one-shot scene.json block)
- the flag is consumed on the next page boot, so subsequent boots
  re-load scene.json normally

**`world:hardReset` now also:**
- calls `ecsWorld.clearAll()`
- sets `voxelengine.disableScene = "1"` (permanent block)
- scene.json stays blocked until `window.enableSceneJson()` is called

### Boot-time check

In `main.js`, right before `sceneLoader.loadFromUrl("./scene.json")`,
two new flags are consulted:

```js
const _shouldSkipSceneJSON = (() => {
    if (localStorage.getItem("voxelengine.disableScene") === "1") return true;
    if (localStorage.getItem("voxelengine.skipSceneOnce") === "1") {
        localStorage.removeItem("voxelengine.skipSceneOnce");  // consume
        return true;
    }
    return false;
})();

if (!_shouldSkipSceneJSON) {
    sceneLoader.loadFromUrl("./scene.json").catch(...);
}
```

Console for manual control:
```js
disableSceneJson()   // permanently disable + log
enableSceneJson()    // re-enable + log
```

### What this means for the user

- Click Reset → reload → scene.json skipped this boot → the 7 sky
  entities don't load. On the **next** boot they come back unless
  reset was clicked again.
- Use Hard Reset → reload → scene.json permanently blocked. Stays
  blocked across all future boots until you call `enableSceneJson()`.
- Use `disableSceneJson()` once to set the permanent flag yourself —
  scene.json never bothers you again.

---

## 2. Demo isolation — most demos now run with a quiet world

Each demo in `DEMO_MODES` can declare an isolation profile:

```js
{
    id: "boids",
    label: "BOIDS — FLOCKING",
    // no isolation field = defaults to "quiet"
    start() { ... },
}

{
    id: "kaiju",
    isolation: "active",   // kaiju IS the background activity
    ...
}
```

**Three profiles:**
- **active** — everything runs normally. Kaiju AI ticks, civ sim ticks,
  auto-spawns fire. Used by demos that need a live world.
- **quiet** (default) — pauses kaiju AI updates, civ sim updates, kaiju
  spawn checks. Voxel rendering, input, and core systems stay alive.
  Used by most demos so the background world doesn't ping while you
  test something.
- **exclusive** — quiet, *and also* disables mesh PP, chunk streamer,
  and worker-pool jobs so benchmarks see clean CPU.

**Who declared what:**
- `kaiju`, `ogre`, `voice_lab` → `"active"` (live world is part of the demo)
- everything else → `"quiet"` by default (boids, life, lander, cruise,
  asteroids, missile_command, lorenz, centipede, rigtest, robot, fps)

The global flag is read by the main loop's tick calls. When isolation
is "quiet", `aiManager.update()`, `civLoop.update()`, and
`kaijuManager.tick()` are skipped per frame. When you switch back to a
demo with isolation:"active", they resume seamlessly.

Console: `window.getDemoIsolation()` returns the current profile.

---

## 3. WebGL background sleep — drop to 1fps when tab is hidden

New `engine/VisibilityManager.js`. Wired via the Page Visibility API
(`document.visibilitychange`). Three behaviors:

- **Tab visible / window foreground:** full 60fps as before
- **Tab hidden / window minimized / different desktop:** drops to 1fps.
  GPU goes idle. Battery stops draining. Audio keeps playing (won't
  cut in-progress speech).
- **Tab re-focused:** immediately resumes 60fps on the very next frame

The render loop checks `visibility.shouldSkipFrame()` early — when
hidden, returns true for ~59 of every 60 calls and lets through one.
At foregroundFps=60 and backgroundFps=1 that's 1 render per second.

```js
window.visibility.stats()
// {
//   state: "visible",
//   attached: true,
//   backgroundFps: 1,
//   muteAudioWhenHidden: false,
//   listeners: 0
// }

window.visibility.setBackgroundFps(6)        // 6fps in bg instead of 1
window.visibility.setMuteAudioWhenHidden(true)  // also auto-mute (off by default)
```

Why audio mute is off by default: cutting in-progress speech mid-word
when the user tabs to check something is jarring. They can opt in if
they want full silence.

---

## 4. Version bump → v337

`window.ENGINE_VERSION = "v337"`. STATUS panel header reflects it.

---

## Tests — 928/928 cumulative

`test_v337.mjs` adds 51 tests:

**ECSWorld.clearAll (T1-T3, 14 tests):** clears all stores, preserves
systems, safe on empty world.

**Skip-scene flag logic (T4-T6, 9 tests):** one-shot consumed on read,
permanent persists across boots, perm wins over once (doesn't consume
the one-shot).

**Demo isolation (T7-T8, 12 tests):** profile resolution, default-to-quiet
when no field, gate guards return correct booleans for each profile.

**VisibilityManager (T9-T15, 16 tests):** initial state, attach lifecycle,
foreground never skips, hidden skips ~59/60 at 1fps, adjustable
background fps, frame counter reset on transition, listeners fire on
real transitions only.

---

## Try it

After updating to v337:

```js
// 1. See where you are
inspectStorage()
// Look for: skipSceneOnce, disableScene (probably absent on first run)

// 2. Reset cleans the sky stuff this time
resetWorld()
// Page reloads. scene.json skipped this boot.

// 3. Want sky stuff gone forever?
hardResetWorld()
// Or just: disableSceneJson(); location.reload();

// 4. Confirm the demo background went quiet
//    Switch from kaiju to e.g. boids — getDemoIsolation()
//    should return "quiet" and you should NOT see new kaiju spawning.
getDemoIsolation()

// 5. Tab away from the browser, check task manager.
//    The python process or browser tab should be barely using GPU.
//    Tab back — full fps restored immediately.
visibility.stats()
```

---

## What's next

You said part 2 of the install steps was coming — when it lands, that's
**v338 = install panel.** With both parts of the install history I can
map every tool to an auto-detect path + install command and build the
"verify / install / set path" UI in the AI panel.

After v338, the previously-queued items in order:
- v339: robot face-lock + body dimensions sizing in LISTENER panel
- v340: Ollama panel — rocking/walking/sprinting tiers, EKG removed
- v341: voice translation (Chrome lang + LibreTranslate hybrid)
- v342: Snake (centipede extension)
- v343: Tron
- OBJ preview canvas slots in wherever
