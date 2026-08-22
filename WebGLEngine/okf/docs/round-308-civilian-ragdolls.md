---
type: doc
title: Round 308 — Civilian ragdolls
tags: ["swek-engine", "round-doc"]
---

# Round 308 — Civilian ragdolls

Civilians had no rig — they're tiny static cubes (`wad_pickup_health` placeholder
at 0.5 scale). The kaiju ragdoll system needs a `SkeletalAnimator` with bones,
so I built a **procedural 6-bone humanoid** that gets constructed at death time,
fed to the existing `Ragdoll` PBD class, and rendered as instanced cubes through
the existing `DebrisRenderer`.

## Shape

```
    [head/spine]   ← bone 1
     /   |   \
[arm.L] [arm.R]    ← bones 2, 3
        |
    [pelvis]       ← bone 0 (root)
     /   \
[leg.L] [leg.R]    ← bones 4, 5
```

Six bones, parent indices `[-1, 0, 1, 1, 0, 0]`. Each bone renders as a
small colored cube via the existing `DebrisRenderer` instanced-cube path
— so adding civilian ragdolls cost **zero new shader code**, just feeding
a second instance batch through the same pipeline.

## What you get

- On every `_eatCivilian` event (kaiju steps on civilian), a 6-bone
  ragdoll spawns at the civilian's position
- Direction = kaiju → civilian (so the body flings AWAY from the kaiju)
  with a 55%-strength upward bias (a stomping kaiju reads as "vertical
  splatter + scatter" rather than purely horizontal punt)
- Per-bone color jitter so consecutive deaths look distinct (not 30
  identical doll-clones)
- Auto-despawn at 3 sec (LIFETIME_SEC), hard-capped at 6 sec, with
  active-extension if the body's still moving — same v303 logic
- Pool capped at 32 simultaneous active ragdolls (192 bones max); oldest
  evicted when pool full
- Bone scales fade down toward end of life so they shrink-disappear
  rather than pop out

## All existing ragdoll machinery is reused for free

Because civilian ragdolls use the same `Ragdoll` class:

- **Joint angle limits (v303)**: bones can't fold unrealistically
- **Voxel terrain query (v303)**: bones drape over actual terrain, not
  just a flat ground plane
- **Active-extension lifetime (v303)**: moving ragdolls don't despawn
  mid-tumble
- **Directional impulse from killing blow (v305)**: hit direction
  drives initial velocity
- **Dismemberment (v306)**: even civilians can have a head pop off if
  you wire `severRandomLimb()` — currently NOT auto-fired for civilians
  (would be visually overload at the small scale), but easy to add later

## Files changed

- `simulation/CivilianRagdollSystem.js` — **new** (172 lines). Pool +
  procedural animator builder + per-tick step + `getInstanceData()` for
  the renderer
- `main.js` — instantiate + tick + render. Also exposes
  `window.civilianRagdolls.test()` to spawn one in front of camera
- `simulation/KaijuSandbox.js` — `_eatCivilian` now spawns a ragdoll
  before the existing particle burst

## How to test

```js
// In-app, kaiju mode:
kaijuCity.start()
// walk over civilians, watch bodies fling

// Or force-spawn:
window.civilianRagdolls.test()
// → spawns a ragdoll 5m in front of camera with downward+upward impulse

// Stats:
window.civilianRagdolls.snapshot()
// → { active, spawned, despawned, evicted }
```

## Tests — 30/30 pass (`/tmp/test_civilian_ragdoll_v308.mjs`)

- spawn() creates active ragdoll, counters increment
- getInstanceData packs 6 instances per ragdoll
- multiple ragdolls coexist (3 ragdolls → 18 instances)
- pool eviction at MAX_ACTIVE=32 (5 evicted past 32)
- hitDir flings body in expected direction
- lifetime expiration removes ragdolls past hard cap
- skeletal hierarchy: spine above pelvis, arms above pelvis, legs below
- scale parameter affects bone offsets proportionally
- clear() disposes all
- per-civilian color jitter produces distinct tints

## Cumulative test count

- v303 joint angle limits: **21/21**
- v305 directional impulse: **18/18**
- v306 dismemberment: **20/20**
- v308 civilian ragdolls: **30/30**
- **89/89 total**

## Performance

At full saturation (32 active civilian ragdolls × 6 bones = 192 bones)
the PBD per-tick cost is negligible — far smaller than one kaiju rig's
55-joint solve. DebrisRenderer's per-frame cost scales with total
instance count; civilians add up to 192 instances on top of voxel debris
(typically 0-400 instances). Combined draw call count is still 2× same
shader, same VAO, different instance buffer.
