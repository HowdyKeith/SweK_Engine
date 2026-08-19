# Round 325 — bomb prop visual + elevation (heaven spots)

Two visual upgrades to the CS round:

1. **The planted bomb is now a thing you can see.** When the round
   transitions to `BOMB_PLANTED`, a chest-prop entity spawns at the
   exact plant location. Particle pulses emit from the location with
   accelerating cadence as the fuse counts down — the same "tick…
   tick… tick-tick-tick" feel as CS, just visual.

2. **Heaven rooms.** Each bombsite gets an elevated loft (`a_heaven`,
   `b_heaven`) at y+4 with stair connections from the site below.
   Single cover crate on each for sniper positions.

Pure additions to v324 — no behavior change to the round/bomb
state machine, just new visuals + new geometry.

---

## Bomb prop lifecycle

The CSRoundManager now has three new callbacks alongside `onBombExplode`:

```
onBombPlanted(loc)   — fires once on LIVE → BOMB_PLANTED
onBombRemoved()      — fires once on ROUND_OVER (only if planted)
onBombPulse(loc, urgency) — fires ~3-9 times/sec while planted
```

main.js wires them:
- `onBombPlanted` spawns a `wad_prop_chest` entity at the plant
  location (scaled 0.6) via `router.exec({ type: "entity:spawnMesh" })`.
  Tracks the entity id in a closure.
- `onBombRemoved` despawns that entity. Fires on explode, defuse,
  AND timeout (but the timeout case is a no-op since the bomb was
  never planted).
- `onBombPulse` emits 4-12 red/orange particles in a small disc
  around the bomb. Count, size, and color intensity scale with
  `urgency` (0 at plant, 1 at imminent boom).

Pulse cadence: 0.7s interval at urgency=0 → 0.12s at urgency=1.
That's ~6× acceleration over the 35-second fuse, matching CS's
audio tick acceleration in feel.

### Bug fix folded in

v324 had a dead `onBombExplode` callback using `particles.emit(...)`
(non-existent method) with `life` and `color` (non-existent fields).
The try-catch made it silently no-op. v325 fixes it to use the
correct API: `particles.spawn({ x, y, z, vx, vy, vz, ttl, size,
r, g, b, a, gravity })`. The explosion is now visible — 50 fire
particles in a 4m disc, gravity-affected so they arc up and fall.

---

## Heaven rooms

Schema additions to the layout JSON:

```js
{ id: "a_heaven", x: 50, z: 44, w: 12, d: 8, h: 5, y: 4,
  floor: "stone", wall: "stone", ceiling: null },
{ id: "b_heaven", x: -26, z: 44, w: 12, d: 8, h: 5, y: 4,
  ... },
```

And:

```js
stairs: [
    { from: "a_site", to: "a_heaven", width: 3 },
    { from: "b_site", to: "b_heaven", width: 3 },
],
```

The OllamaLevelGenerator's `_carveStairs` method (round 222) does
the actual stair painting — stepped ramps between two rooms at
different y. No new painting code needed; just the schema entries.

`OllamaLevelGenerator.applyLayout` was missing `stairs` in its
normalize pass — fixed in this round (was a v323 oversight).

### Heaven cover blocks

`_paintCoverBlocks` previously assumed all cover blocks land at
ground floor (`baseY + dy`). With heaven rooms at `y: 4`, that
would put cover blocks ~4 voxels BELOW the heaven floor, embedded
in the wall. Fixed: cover painter now uses `baseY + room.y + dy`
so cover lands on whichever floor the room actually sits on.

Verified by test T11: heaven cover voxels land at y=10-11 (with
default baseY=5, heaven floor=9, cover stack=10-11).

---

## Tests — 498/498 cumulative

`test_cs_heaven_v325.mjs` adds 34 tests:

- T1 (5): heaven rooms exist with correct y offset
- T2 (3): `csMeta.heavenRooms` lists them
- T3 (8): stairs[] connects sites to heaven, references valid rooms
- T4 (3): full graph connectivity (BFS through corridors + stairs)
  reaches all 7 rooms
- T5 (4): `onBombPlanted` fires once on plant transition with
  correct location
- T6 (1): `onBombRemoved` fires on bomb explode
- T7 (1): `onBombRemoved` fires on bomb defuse
- T8 (1): `onBombRemoved` does NOT fire when round times out
  with no plant (planted callback never fired, so removed shouldn't)
- T9 (2): pulse callback fires periodically while planted
- T10 (1): pulse cadence accelerates with fuse urgency — late
  pulses outnumber early pulses
- T11 (3): heaven cover blocks land at correct elevated Y

v323's existing tests T2 and T5 also updated to reflect 7-room
layout (was 5; heaven rooms are valid additions).

---

## Action

```js
cs.play()                  // drops into the new 7-room layout
// walk to A or B site, plant the bomb
// note the visible bomb prop appears at your feet
// red particles pulse, accelerating as fuse runs out
// look around for the stairs leading to a_heaven or b_heaven
// after explode/defuse, the prop despawns cleanly
```

What to watch for:
- **Stairs visible**: from inside A site, you should see a ramp
  leading up to a smaller upper room
- **Heaven cover**: a stone block on the heaven floor (sniper spot)
- **Bomb prop visible after plant**: a chest-shaped object on the
  ground at your plant location (until v326 ships a proper bomb
  mesh)
- **Pulses brighter near zero**: at fuse ~5s, the particle puff
  is denser and more intense than at fuse ~30s
- **Explosion is visible** now (v324's was silently broken)

---

## What's next: round 326 — bots

Now starting. Plan:
- `simulation/CSBot.js` — per-bot state (side, position, target, HP, navigation)
- `simulation/CSBotManager.js` — spawn, tick, win-condition tracking
- Bot AI: BFS pathfinding through the corridor+stairs graph
  to objectives. T bots rush to plant, CT bots hold sites.
- Combat: line-of-sight raycast against voxels; shoot when target
  visible and in range
- New win conditions: all-T-dead → CT, all-CT-dead → T (unless
  bomb planted, which keeps the round alive)
