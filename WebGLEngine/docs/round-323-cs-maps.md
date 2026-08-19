# Round 323 — Counter-Strike-style map generator

Phase A of the "CS maps" arc. Generates a competitive bombsite
layout (5 rooms, 8 corridors) using the existing voxel/WAD
infrastructure, plus CS-specific cover blocks placed by direct
voxel writes. Wires into FPS mode so the player can spawn as
either side and explore the geometry.

Phase B (parsing actual `.bsp` files from Valve releases) remains
a future round.

---

## The layout

```
                  ┌────────┐
                  │CT SPAWN│    (z: 84-100, north)
                  └───┬────┘
   ┌────┐             │              ┌────┐
   │  B │   (B-mid)   │   (A-mid)    │ A  │
   │SITE│ ←────────  ┌┴────┐  ─────→ │SITE│   (z: 50-70)
   │24×20│           │ MID  │        │24×20│
   └─┬──┘            │20×16 │        └─┬──┘
     │               └──┬───┘          │
     │ (T-B            │ (T-mid)       │ (T-A
     │  tunnel)        │                │  long)
     │              ┌──┴────┐          │
     └──────────────┤T SPAWN├──────────┘
                    │20×16  │              (z: 0-16, south)
                    └───────┘
```

Five rooms:
- `t_spawn` (south) — Terrorist team start
- `ct_spawn` (north) — Counter-Terrorist team start
- `mid` — central hub, sightline-heavy
- `a_site` (east) — A bombsite
- `b_site` (west) — B bombsite

Eight corridors:
- T spine: `t_spawn ↔ mid ↔ ct_spawn` (width 4 — the main thoroughfare)
- Mid-to-site: `mid ↔ a_site`, `mid ↔ b_site` (width 3)
- T-side wraps: `t_spawn ↔ a_site` ("A long"), `t_spawn ↔ b_site` ("B tunnel")
- CT-side rotations: `ct_spawn ↔ a_site`, `ct_spawn ↔ b_site`

This gives the CS gameplay shape — three approaches to each site,
which corridor you take determines which corner the opponent
peeks from.

---

## What's painted

### Rooms and corridors
Delegated to `OllamaLevelGenerator.applyLayout()`, the public
wrapper added this round. Same JSON schema Ollama produces, so
the entire painting pipeline (floors, walls, ceilings, corridor
L-carving, prop spawning) is reused.

The only OllamaLevelGenerator change is the new public method:
```js
async applyLayout(layout, opts = {}) {
    // Validates, fills defaults, clears previous, paints, sets _lastLevel
}
```
which wraps the previously-private `_applyLayout` and handles
the ceremony of `clear()` + setting `_lastLevel` (so FPSShooter's
`_pickSpawn(roomId)` can resolve spawn rooms by id).

### Cover blocks (CS-specific)
Direct voxel writes done by `_paintCoverBlocks` in CSMapGenerator.
Each room gets 2-4 stone cubes (2×2×2 each, chest-high) placed at
sightline-breaking positions. A deterministic seed selects the
exact positions:

```
t_spawn  → 2 blocks
ct_spawn → 2 blocks
mid      → 4 blocks (sightline-heavy)
a_site   → 3 blocks
b_site   → 3 blocks
```

Cover positions are jittered by a Mulberry32 PRNG seeded from
the layout's `seed` field. Same seed → same positions across
runs (verified by T7).

### Visual markers
- Bombsite plant spots: `altar` prop at the center of each site
- Spawn markers: `torch` at the center of each team spawn

These come from the existing prop system. Bomb plant semantics
(carry, plant timer, defuse) are deferred to the next round.

---

## Console API

```js
cs.preview()                       // paint map, move camera overhead
cs.play({ side: "t" })             // paint + enter FPS as T
cs.play({ side: "ct" })            // paint + enter FPS as CT
cs.regenerate({ seed: 42 })        // re-paint with new seed
cs.clear()                         // wipe (cover + rooms)
cs.layout()                        // return the JSON layout
cs.build({ seed, name })           // build layout, don't paint
```

`cs.play({ side })` calls `fps.start({ spawnAtRoom: "t_spawn" })`
(or `ct_spawn`), which lands the camera at the center of that
room. FPS HUD/keys/aim all behave the same way as in WAD levels.

---

## Tests — 380/380 cumulative

`test_cs_map_v323.mjs` adds 71 tests:

- T1 (8) — `buildLayout()` produces correct schema fields
- T2 (6) — all 5 expected rooms present with correct ids
- T3 (15) — every room has valid positive geometry
- T4 (25) — every corridor references real rooms; widths in [2,4]
- T5 (4) — **graph connectivity**: BFS from `t_spawn` reaches all 5 rooms via corridors
- T6 (2) — bombsite plant markers are spatially inside their respective rooms
- T7 (2) — cover-block placement is deterministic per seed; different seeds differ
- T8 (3) — `paint()` writes cover voxels (≥30 for visual effect)
- T9 (3) — `clear()` removes exactly the voxels paint added
- T10 (1) — seeds 1/2/3 all produce cover (counts may vary due to overlap)
- T11 (1) — `buildLayout` is pure (deterministic)
- T12 (1) — `opts.name` override works

The structural tests (T5 graph connectivity, T6 markers-inside-rooms,
T7 determinism) are the ones that would catch a real bug in a
refactor.

---

## Action items

```js
cs.preview()       // see the map from above
cs.play()          // drop in as T, walk around
cs.play({ side: "ct" })
cs.regenerate({ seed: 99 })   // try a different cover layout
cs.clear()
```

Things to look for visually:
- **Five rooms in roughly the right shape**. T south, CT north,
  A east, B west, mid between T and CT.
- **Walking from T spawn**: should be able to head north into mid,
  or NE wrapping to A site, or NW wrapping to B site
- **Cover blocks**: 2-block tall stone cubes inside each room.
  Should be possible to crouch behind / peek around
- **Plant markers**: `altar` prop at the center of A and B sites,
  `torch` props at each spawn center

What WILL NOT be there in v1 (saved for follow-ups):
- Bomb plant/defuse logic
- Team bots (CT or T AI)
- Weapon spawns / pickups specific to CS
- Elevation: heaven spots, ramps, vertical play
- Multiple map variants beyond the seed jitter

---

## Phase B preview (BSP loader, future)

If round 323 lands cleanly, the path to loading real Valve maps:

1. **Format**: GoldSrc BSP v30 (CS 1.6) is the cleanest entry —
   Source BSP v20+ adds lighting/displacements and is much
   harder. Half-Life and CS 1.6 are the same format.
2. **Parsing**: BSP is a brush tree (CSG) with planes,
   textures (via WAD), and entities (string keyvalues).
   The brush-to-voxel translation is the interesting part:
   for each integer voxel, classify against all brush planes
   to decide solid/empty. Volume rasterization.
3. **Scope**: ~1000 lines parser, ~500 voxelizer, ~200
   entity translator (info_player_start → spawn, etc).
   Probably 3-5 rounds: lump reader → brush tree → voxelize
   → entity bind → texture mapping.
4. **Portfolio framing**: "I parsed Valve's 1998 binary
   format and reproduced de_dust2 in a JavaScript voxel
   engine" — that's a strong portfolio line if executed.

Not starting now. The procedural generator is the right
foundation: it proves the FPS/spawn/cover pipeline works,
so when the BSP loader arrives it just feeds the same data
structure.

---

## Status

- **v320** (getError throttle) — awaiting test
- **v321** (easing + spatial hash) — awaiting visual sanity
- **v322** (marching cubes) — awaiting `mc.gyroid()`
- **v323** (this round) — awaiting `cs.play()`

Four rounds queued for testing. v320 has the most
informational value (the FPS data); v322 (`mc.gyroid()`)
and v323 (`cs.play()`) have the most visual payoff.
