---
type: doc
title: Round 309 — Frame profiler + hit reactions
tags: ["swek-engine", "round-doc"]
---

# Round 309 — Frame profiler + hit reactions

Two things in this round, both surgical:

---

## 1. Frame profiler — finds the actual FPS culprit

The previous `_fpsProfile` (round 306) measured frame INTERVALS via
`requestAnimationFrame`. That told you "FPS is slow" but not why. This
round adds `window._frameProf` which measures *what's happening inside
each frame* — section-level breakdown of the main loop.

### Usage

```js
await window._frameProf.start(5)   // sample for 5 sec
// (returns automatically, prints report)

window._frameProf.report()         // re-print last report
window._frameProf.reset()          // clear data
```

### Sections instrumented

The main loop is wrapped with `profStart` / `profEnd` calls at these
points (no-op when profiler off, two property reads each — production
cost negligible):

- `camera+editor` — camera + editor updates
- `weapons+missiles` — weapon/missile system ticks
- `weather+atmosphere` — weather + sky + atmosphere
- `aiManager` — AI brain tick
- `civLoop` — civilization simulation
- `kaijuManager` — kaiju spawn/AI tick
- `kaijuIK` — IK constraint maintenance
- `hitReactions` — round 309 (this round)
- `ragdoll` — ragdoll integration
- `projectiles` — projectile manager
- `ogre` — OGRE scenario + HUD + buy/launcher panels
- `demo` — active demo + centipede manager
- `particles` — lava embers, memory shimmer, particle integration
- `worldSim` — 10Hz world sim (erosion, water, lava)
- `debris+civRagdoll` — voxel debris + civilian ragdolls
- `audio` — audio update
- `shadowPass` — shadow + CSM depth passes (if enabled)
- `render.voxels` — main voxel scene render
- `render.sky+atmosphere` — sky + atmosphere render
- `render.debris+markers` — debris cubes + civ markers + kaiju markers
- `render.entities` — entity mesh + entity cube renderers
- `postProcess.bloom` — bloom + SSAO + god rays

### Output

`console.table` showing per-section calls / mean ms / max ms / total ms /
% of frame budget, sorted by total time descending. Plus:

- **Top suspect** flagged if any section >30% of frame budget
- **Spike sections** flagged if any section had a frame >50ms
- **Uninstrumented gap** — total - measured = browser composite + GC +
  idle + untracked. If this is large, the bottleneck is outside JS
  (likely GPU compositing, e.g. backdrop-filter regression)

### How to use this to find the FPS bug

1. Open browser, reproduce the slow scene (kaiju city running, etc.)
2. Run `await window._frameProf.start(5)`
3. Wait 5 sec, the report prints
4. Paste the table back — I'll target the top section

Common signatures:

- **`render.voxels` dominant** (>40%) → chunk count too high, or shader
  branch cost (e.g. CSM enabled when it shouldn't be)
- **`kaijuManager` dominant** → too many kaiju, or quadratic AI loop
- **`particles` dominant** → particle overflow, no pool cap working
- **`ogre` dominant when OGRE inactive** → leak in scenario logic
- **High uninstrumented gap** → GPU compositing/blur/backdrop-filter
- **Everything small but FPS still bad** → external (chrome compositor,
  Ollama main-thread blocking, third-party extension)

---

## 2. Hit reactions — additive wobble on damaged kaiju

When a kaiju gets damaged but doesn't die, a brief directional wobble
is layered on top of the clip animation. The kaiju keeps walking,
attacking, idling — but a hit visibly "shakes" their body for ~0.35
seconds. Reads as "took the hit but kept fighting".

### Implementation

`simulation/HitReactionSystem.js` (~150 lines). For each living kaiju:

1. On first sight, attach a pose constraint to its `SkeletalAnimator`
   via `_poseConstraints` (the same hook used by look-at IK and FABRIK
   in round 292/293).
2. The constraint's `apply(animator)` callback runs every frame, AFTER
   clip evaluation but BEFORE world-matrix composition.
3. When a new damage event hits the kaiju (detected via the v305
   `_lastHitAge` tag changing), the system stores hit direction +
   selects a target bone (preferring head/spine/chest/torso/neck/
   shoulder by name), and sets `reactionT = 1.0`.
4. The constraint computes:
   ```
   wobble = sin(phase) × WOBBLE_PEAK_AMP × reactionT
   ```
   where `phase = (1 - reactionT) × 2π × 4` (4 sin cycles over duration)
   and applies an additive offset to the bone's `localT` along the
   hit direction (vertical component dampened to 0.4× lateral).
5. `reactionT` decays linearly over `REACTION_DURATION_SEC = 0.35`.
6. Cleanup: when a kaiju enters `dying` state, the constraint is
   detached. Ragdoll's `onPose` (which runs AFTER constraints) then
   takes over with no special-case gating needed.

### Why this is cheap

- The constraint is a no-op when `reactionT === 0` (most frames for
  most kaiju). One conditional check, immediate return.
- Stacking is automatic: a second hit during a fading reaction
  refreshes `reactionT` to 1.0 and picks a new bone. No queue, no
  state machine.
- Detection costs O(N) per tick where N = active kaiju count. With ≤20
  kaiju the per-frame cost is negligible.

### Tuning

In `HitReactionSystem.js`:
- `REACTION_DURATION_SEC = 0.35` — total wobble length
- `WOBBLE_OSCILLATIONS = 4` — sin cycles over duration
- `WOBBLE_PEAK_AMP = 0.18` — max localT offset (world units)
- `VERT_AMP_SCALE = 0.4` — vertical wobble dampening
- `PREFERRED_BONE_PATTERNS = ["head", "chest", "spine", ...]` — name
  patterns for bone selection

### Public API

```js
window.hitReactions.setEnabled(true|false)
window.hitReactions.isEnabled()
window.hitReactions.snapshot()    // { wired, reactionsTriggered, active, ... }
window.hitReactions.clear()       // detach all constraints
```

### How to test in-app

```js
kaijuCity.start()
// Shoot a kaiju without killing it (use a weaker weapon, or aim for
// non-vital areas). The kaiju should briefly shake along the hit
// direction while continuing to walk/attack.
window.hitReactions.snapshot()
// → { wired: 5, reactionsTriggered: 12, active: 5, ... }
```

---

## Tests — 24/24 pass (`/tmp/test_hit_reactions_v309.mjs`)

- System attaches pose constraint on first tick
- New `hitAge` triggers fresh reaction; same `hitAge` doesn't double-fire
- Constraint applies wobble offset to bone's `localT`
- `reactionT` decays to 0 over duration
- Bone selection prefers head/spine/chest patterns
- Bone selection falls back to bone 1 when rig is unnamed
- Dying kaiju → constraint detached
- Despawned kaiju → entry removed
- `setEnabled(false)` skips tick entirely
- Constraint is no-op when `reactionT === 0`

## Cumulative test count
- v303 joint angle limits: **21/21**
- v305 directional impulse: **18/18**
- v306 dismemberment: **20/20**
- v308 civilian ragdolls: **30/30**
- v309 hit reactions: **24/24**
- **113/113 total**

## Files changed
- `debug/frameProfiler.js` — new (140 lines), profStart/profEnd helpers
  + console-side API + report formatting
- `main.js` — imports profiler; wraps ~20 sections with profStart/End;
  wires `HitReactionSystem` + `window.hitReactions`
- `simulation/HitReactionSystem.js` — new (150 lines)

## Expected impact
- **FPS investigation unblocked.** Run `_frameProf.start(5)`, paste the
  table, we surgically attack the top section in v310.
- **Hit reactions visible.** Shooting kaiju with non-lethal damage now
  produces a brief wobble at the hit point. The kaiju keeps moving;
  the body just shudders briefly.
