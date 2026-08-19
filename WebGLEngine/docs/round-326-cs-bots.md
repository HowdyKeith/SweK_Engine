# Round 326 — CS bots (T attackers + CT defenders)

The final piece of the CS arc as originally scoped. Map geometry
(v323), bomb/round mechanics (v324), bomb prop + elevation (v325),
and now actual opponents that move, shoot, and die.

After this round, `cs.play()` is a complete 1v3 (or 1+1v2) match
with a 2:30 round clock, plant/defuse, scoring, and win-by-
elimination — all the core mechanics of de_.

---

## Bot composition

```
PLAYER on T side:    1 T (player) + 1 T bot vs 2 CT bots
PLAYER on CT side:   2 T bots vs 1 CT (player) + 1 CT bot
```

Player count tightens automatically — opposite team gets the full
2 bots, your own team gets 1 less to make room for you.

T bots are **attackers** — they path through the corridor graph
toward an assigned bombsite (one to A, one to B for the split push).

CT bots are **defenders** — they path to an assigned defensive
position near a site, then patrol in a small circle while watching
for movement.

Both shoot at any visible enemy (any other team) within 35 voxels
on a 0.7s cooldown with 55% hit chance and 18 damage per hit.

---

## Three new files

### `simulation/CSBot.js`

Per-bot AI. Pure state machine + helpers; no engine knowledge.

- `BOT_STATE`: MOVING, HOLDING, SHOOTING, DEAD
- `BOT_ROLE`: ATTACKER, DEFENDER
- Tunables exported: `BOT_HP_DEFAULT=100`, `BOT_MOVE_SPEED=4.5`,
  `BOT_FIRE_INTERVAL_S=0.7`, `BOT_DAMAGE_PER_HIT=18`,
  `BOT_VIEW_RANGE=35`, `BOT_HIT_CHANCE=0.55`, `BOT_TARGET_RADIUS=4`

`tick(ctx)` runs the AI:
1. Pick best visible enemy (closest in range with LOS, opposite side)
2. If found → face, shoot on cooldown
3. Else → advance toward target via room-to-room path
4. Once at target → hold or patrol

Pure helpers (exported for testing):
- `roomContaining(x, z, rooms)` — which room is a point in
- `bfsRoomPath(start, target, layout)` — BFS through corridor+stair graph
- `hasLineOfSight(ax,ay,az, bx,by,bz, world)` — voxel raymarch every
  0.5 voxels; non-zero voxel ID = blocked

### `simulation/CSBotManager.js`

Owns the bot collection. Per round:
- `spawnRound(layout, playerSide)` — creates the right bots,
  registers them with `fpsShooter.registerEnemy` (so the player
  can damage them via the existing FPS combat system)
- `tick(dt)` — builds the enemies list once, then ticks each bot
- `aliveBots(side)` / `aliveTeam(side, playerAlive)` — for round-end checks
- `despawnAll()` — cleanup on round clear

Bot movement uses simple wall-slide via `world.getVoxel` — if the
voxel at the X-step is solid, skip X this tick; same for Z. Cheap
enough at 4 bots and prevents bots wedging into walls.

Bot Y follows `world._heightAt(x, z) + 1` so bots step up onto
heaven stairs naturally without explicit stair-walking AI.

### `simulation/CSBot.js` test helpers
The three pure helpers are exported because the AI tick uses them,
and unit-testing them directly is faster than mocking the world.

---

## CSRoundManager — new win conditions

Two new config callbacks:

```js
getTAlive:  () => count,    // alive Ts (bots + player if T side)
getCTAlive: () => count,    // alive CTs (bots + player if CT side)
```

Both return integers. Round manager calls them each tick in LIVE
and BOMB_PLANTED to check team-wipe wins. If both providers are
absent (e.g. solo round without bots), the check is a no-op and
the round runs as before.

### The CS rule for team-wipe + bomb interaction

In CS, after the bomb is planted:
- **All-CT-dead** ends the round (T wins by detonation — no one
  left to defuse)
- **All-T-dead** does NOT end the round (the bomb keeps ticking;
  CTs must still defuse or eat the explosion)

This is implemented correctly. Test T13 verifies that after plant,
killing all Ts leaves the round in BOMB_PLANTED and the fuse runs
out to give T the win anyway. Test T14 verifies that killing all
CTs after plant ends the round immediately.

In LIVE (no plant), either team wipe ends the round.

---

## Tests — 543/543 cumulative

`test_cs_bots_v326.mjs` adds 45 tests:

**Pure helpers (15 tests, T1-T5):**
- T1: `roomContaining` for in/out-of-room points
- T2: `bfsRoomPath` finds paths through corridors AND stairs
  (T spawn → A heaven traverses A site as expected)
- T3: `hasLineOfSight` clear path through air
- T4: blocked by stone voxel at intermediate x
- T5: null world = optimistic true (graceful fallback)

**CSBot AI (15 tests, T6-T10):**
- T6: bot advances toward target room — bot at T spawn, target
  A site, after 5 seconds bot is significantly east of start
- T7: shoots visible enemy in range
- T8: does NOT shoot teammate (same side)
- T9: does NOT shoot enemy with no LOS (wall in the way)
- T10: takeDamage chain — 50 → still alive at 50 HP → another 60
  → dies, state = DEAD, hp clamped to 0

**Round-end team wipes (15 tests, T11-T15):**
- T11: all Ts dead in LIVE → CT wins +1, reason mentions wipe
- T12: all CTs dead in LIVE → T wins +1
- T13: **the CS rule** — after plant, all-T-dead does NOT end the
  round; bomb keeps ticking; T wins by detonation
- T14: after plant, all-CT-dead DOES end the round → T wins
- T15: without team providers, team-wipe checks are no-op (LIVE
  state preserved)

---

## Console additions

```js
cs.play()              // unchanged — paints map + FPS + auto-starts round + SPAWNS BOTS
cs.play({ side: "ct" })

// New in v326:
cs.bots()              // [{ id, side, role, x, z, hp, state, target }, ...]
                       // — useful for debugging path-stuck bots
```

`cs.clear()` despawns all bots cleanly. `cs.endRound()` doesn't
auto-respawn bots for the next round (a fresh `cs.play()` does).

---

## Action

```js
cs.play()                              // → enter as T, 1 T bot teammate + 2 CT enemies
// engage CT bots in mid or on the way to a site
// note: T bot teammate pushes a site on its own
// plant the bomb at A or B
// note: CT bots will rotate to the planted site to defuse
// kill all 2 CT bots → T wins by elimination
// OR plant + survive → T wins by detonation
// OR get killed → CT wins by elimination (player counts as T)

cs.bots()                              // see what each bot is doing
cs.play({ side: "ct" })                // play CT — defend sites against 2 T bots
cs.score()                             // running scoreline
```

### What to watch for

- **Path-following**: bots leave the spawn room within ~2 seconds,
  follow the corridor pattern toward their objective room
- **Combat**: when in line-of-sight + range, bot turns to face the
  player and fires; you should hear the muzzle puff (small yellow
  particle burst at bot position)
- **Death**: bot mesh despawns + red particle puff
- **Win by elimination**: kill all 2 CT bots → round ends with
  "all CTs eliminated"
- **Player death**: when the FPS shooter reports the player as
  dead/inactive, the player counts as eliminated for team-wipe
  checks; if you're solo on a side, that team-wipes that side
- **Heaven stair use**: bots step onto heaven stairs naturally
  because their Y follows world._heightAt; the bot for a_site
  may end up briefly on the stairs while pathing

---

## What's NOT in v326 (deferred — these are the next obvious follow-ups)

- **T bot can plant the bomb** — currently only the player can plant.
  A T attacker that reaches the site just stands in it. Adding
  "bot plants if no human T is alive" is straightforward but
  changes the rhythm of the round, so saved for tuning
- **CT bot can defuse the bomb** — same situation. CTs near the
  bomb don't defuse; they just camp. Adding `_botDefuses` requires
  modeling the 5s wind-up and CSBomb.startDefuse handoff
- **Buy menu / economy** — out of scope
- **Multiple weapons** — bots use a generic shoot mechanic; player
  uses whatever FPS shooter has
- **Voice lines** — the existing BotManager has kpop speech
  integration, my CSBotManager doesn't. Could be added if it'd
  feel right
- **Visible bomb mesh** — still using `wad_prop_chest` from v325.
  A proper bomb OBJ is small additional work
- **Round restart resets bot positions** — currently `_beginRound`
  in CSRoundManager doesn't tell the bot manager to respawn bots;
  same bots persist round-to-round. With 2-bot teams this is
  problematic because dead bots stay dead across rounds. Should
  be wired

The last item (round-restart bot respawn) is probably the most
impactful follow-up. As shipped, only the first round has a full
bot count. Subsequent rounds inherit whichever bots survived the
previous round. With CS-style win conditions including team
elimination, that means later rounds get progressively shorter
unless the player explicitly calls `cs.play()` to reset.

---

## Status — six rounds queued for testing

- v320 (getError throttle, the FPS bet)
- v321 (easing + spatial hash, visual no-op)
- v322 (marching cubes, `mc.gyroid()`)
- v323 (CS map geometry, `cs.preview()`)
- v324 (bomb + rounds, `cs.play()` has a match loop)
- v325 (bomb prop visible + heaven rooms with stairs)
- **v326 (bots — `cs.play()` has opponents that path and shoot)**

The CS arc (v323→v326) is now feature-complete for a single-round
1vN match. Multi-round bot respawn and bot-side plant/defuse are
the obvious next refinements.

`cs.play()` should now feel like "playing CS solo with three friends
who don't talk."
