---
type: doc
title: "Round 327 — Round-restart respawn + v326 damage-scale fix"
tags: ["swek-engine", "round-doc"]
---

# Round 327 — Round-restart respawn + v326 damage-scale fix

The round loop now actually loops. Plus, a real bug from v326 that
would have made bot vs. player combat unplayable.

---

## What was broken

**Round 2 had no opponents.** v326 spawned bots once in `cs.play()`
and never again. After the first round ended (especially via team
wipe), subsequent rounds inherited zero opponents — instant CT loss
in round 2 since "all CTs eliminated" was permanently true.

**Bots instakilled the player.** v326 passed `BOT_DAMAGE_PER_HIT = 18`
to `fpsShooter.takeDamage()`. Bot HP is on a 0-100 scale (matching
my `BOT_HP_DEFAULT = 100`), but the engine's player health is 0-1
normalized. 18 damage on a 1.0-max scale means the player drops
to `max(0, 1 - 18) = 0` on the first hit. One shot, dead, every
round. Round flow broken.

Both shipped silently in v326 because:
- The bot-respawn bug only manifests in round 2+ and would only
  matter once the user played more than one round
- The instakill bug doesn't break tests (I didn't have a
  player-takes-damage test in v326)

---

## The fix — `onRoundStart` callback

CSRoundManager now exposes:

```js
onRoundStart: (roundNumber) => { ... }
```

Fired in `_beginRound()`, which runs on:
- Round 1 (from `startMatch`)
- Round 2+ (from the ROUND_OVER → WAITING auto-transition)

NOT fired on intermediate state transitions (WAITING → LIVE,
LIVE → BOMB_PLANTED, etc.). Verified by test T4.

main.js wires the callback to:
1. Respawn all bots via `csBotManager.spawnRound(layout, side)`
2. Reset player health to 1.0
3. Reset ammo to 30
4. Clear reloading + fire-cooldown
5. Clear `_diedAt` so the death message can fire again next round
6. Teleport player back to spawn room (T → t_spawn, CT → ct_spawn)

The reset directly manipulates `fpsShooter` fields rather than
calling `fpsShooter.start()`. Reasoning: `start()` tears down +
rebuilds the HUD, re-binds event listeners, restarts stamina —
it's the heavy "enter FPS mode" path. We just want "you're alive,
back to spawn, full ammo" once per round. The direct manipulation
is 8 lines and avoids the teardown cycle.

### Side effect — cleaner round 1 path

`CSMapGenerator.play()` used to call `botManager.spawnRound()`
explicitly after `roundManager.startMatch()`. That call is removed
in v327 — round 1's bots now spawn via the same `onRoundStart`
path as rounds 2+. Less code, single code path, no race on
"who spawns the bots first."

---

## Damage-scale fix

In `CSBotManager._botFires`:

```js
// v327 — engine player health is 0..1 normalized,
// but bot damage is on a 0..100 scale (matches bot HP).
// Normalize: 18 bot-damage = 0.18 player-damage.
if (target.id === -1) {
    const dmg01 = BOT_DAMAGE_PER_HIT / BOT_HP_DEFAULT;
    this.fpsShooter.takeDamage(dmg01, ...);
}
```

Bot-vs-bot damage stays on the 0-100 scale (CSBot.takeDamage
internally is on that scale). The normalization happens only at
the bot→player boundary, which is the right place — the two
HP systems are fundamentally different and need to be bridged
exactly once, where they meet.

Verified by tests T7-T9:
- T7: one bot hit reduces player health from 1.0 to 0.82 (= 1.0 - 0.18)
- T8: 6 sequential hits drain the player to 0 (matches CS feel)
- T9: bot-vs-bot still takes 6 hits to kill (100 / 18 = 5.5 → 6)

The "6 hits to kill" symmetry between player-side and bot-side
damage is a nice property — same time-to-kill in both directions
regardless of HP scale.

---

## Tests — 568/568 cumulative

`test_cs_respawn_v327.mjs` adds 25 tests:

**onRoundStart callback (16 tests, T1-T6):**
- T1: fires on round 1 from startMatch, roundNumber=1
- T2: fires again on round 2 after auto-restart
- T3: 5 sequential rounds → 5 callbacks with numbers [1,2,3,4,5]
- T4: does NOT fire on WAITING→LIVE, LIVE→BOMB_PLANTED, or
  BOMB_PLANTED→ROUND_OVER. Fires again on ROUND_OVER→WAITING
  for the next round
- T5: throwing handler doesn't stall the round
- T6: no handler = graceful no-op

**v326 damage-scale fix (9 tests, T7-T9):**
- T7: bot fires at player → 0.18 damage applied (normalized correctly)
- T8: 6 sequential bot hits drain player from 1.0 → 0
- T9: bot-vs-bot still uses 100-HP scale, target dies in 6 hits

The Math.random stub in T7-T9 forces hit rolls to succeed so the
test doesn't depend on RNG luck.

---

## Round-cycle now works

```js
cs.play()                                  // round 1 begins, bots spawned
// fight, plant, defuse, die, whatever
// round ends (any path)
// 5-second ROUND_OVER pause
// round 2 begins automatically:
//   • bots respawn (full 4)
//   • player teleports back to spawn
//   • player HP back to 1.0
//   • player ammo back to 30
// round 2 plays out
// round 3, 4, 5, ... ad infinitum
```

No max-rounds cap yet. CS proper has 30 rounds (15 each half).
You can stop with `cs.clear()` whenever.

---

## What to try

A round that exercises the new respawn path:

```js
cs.play()
// kill both CT bots quickly (push A site)
// T wins by elimination, ROUND_OVER pops up
// wait 5 seconds
// → round 2 begins automatically:
//   "[cs] round 2 — player + bots respawned"
//   you're back at T spawn, full HP
//   2 CT bots are at CT spawn again
//   round 2 plays normally
cs.score()  // { t: 1, ct: 0, round: 2 }
```

The other direction — let yourself die to test player respawn:

```js
cs.play()
// run into a CT bot, take 6 hits, die
// CT wins by team wipe (you were solo T after some bot teammates died)
// → round 2 begins:
//   you respawn at T spawn with full HP
//   ready to play again
```

The "you respawn at T spawn with full HP" wasn't true before v327.

---

## What's still NOT in (saved for later rounds)

- **Bot plant/defuse** — T attackers reaching the site still don't
  plant; CT defenders near the bomb don't defuse. Adds depth but
  changes the rhythm
- **Buy phase / economy** — out of scope
- **Half-time side swap** (round 16) — would need round number tracking
  and side toggle
- **Proper bomb mesh** — still `wad_prop_chest`
- **Bot voice lines** — CS bots are silent; the existing BotManager
  has kpop speech integration my CSBotManager doesn't use
- **Smoke / flash grenades** — no utility throwables yet
- **Visible bot weapons** — bots fire from their position, no
  weapon mesh on the bot

The most natural next round, if you want it, would be **bot
plant/defuse** — would make solo CT-side play meaningfully
different (right now CT has no real objective threat because T
bots only walk to the site, they don't plant).

---

## Status — seven rounds queued for testing

- v320 (FPS bet)
- v321 (easing / spatial hash, no-op visual)
- v322 (marching cubes)
- v323 (CS map geometry)
- v324 (bomb + rounds)
- v325 (bomb prop + heaven rooms)
- v326 (bots)
- **v327 (round-restart respawn + damage-scale fix)**

The CS arc is genuinely playable now. Plant or fight, die or
survive, round 2 actually arrives with full opposition. Solo CS
in Excel's voxel engine — that's the milestone.
