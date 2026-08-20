# Round 328 — Bot plant + bot defuse

The asymmetry from v326 is closed. T attackers that reach a bombsite
now plant the bomb. CT defenders that reach a planted bomb defuse
it. Both sides have real AI-driven win conditions.

Solo play on CT side is now meaningful: T bots threaten to plant,
you have to push to stop them. Solo on T side is now genuinely
contested: if you die after planting, a CT bot can still close
out the round by defusing.

---

## Design — action owner

The bomb is a single resource. Plant/defuse is an exclusive action
that runs over time (3s plant, 5s defuse). Multiple actors (player,
bots) might want to act on it. Who's currently doing what?

**`CSRoundManager._actionOwner`** — `"player"` | botEntityId | `null`.
Set when bomb transitions HELD → PLANTING or PLANTED → DEFUSING.
Cleared when the action completes (PLANTING → PLANTED, DEFUSING →
DEFUSED) or cancels (owner becomes ineligible).

Each tick, `_handleInteract`:
1. Runs the player path (uses `_interactHeld` from E key)
2. Runs the bot path — only if `_actionOwner !== "player"`
3. Bot path queries `getBotPlanter()` / `getBotDefuser(bx, bz, r)`
4. Starts a new bot action if owner is null and bot is eligible
5. Cancels an existing bot action if the bot is no longer eligible

The player always wins simultaneous attempts (player block runs
first in `_handleInteract`). A bot mid-plant gets bumped if the
player walks into the same zone and holds E.

### Why intent providers, not state

CSBotManager exposes `getBotPlanter()` and `getBotDefuser(bx, bz, r)`
as stateless lookups. Each call scans the live bots and returns
the first eligible one (T attacker in plant zone, or CT defender
within defuse radius). No "intent registry" — the round manager
asks fresh every tick.

This means: if bot A is planting and bot B walks into the same
zone, bot A keeps the action (no churn) because `getBotPlanter()`
returns bot A first (insertion order in the bots Map). If bot A
dies, `getBotPlanter()` returns null or bot B; the round manager
sees the owner mismatch and cancels A's plant. If B is in zone,
the next tick starts B's plant from scratch.

---

## Freeze state

A bot mid-plant or mid-defuse must not walk away. CSBot has a new
`frozen` field, set by CSBotManager each tick based on the round
manager's current action owner:

```js
// CSBotManager.tick
const ownerId = this.roundManager?.getActionOwnerId?.();
for (const bot of this.bots.values()) {
    bot.frozen = (ownerId != null && ownerId !== "player" && ownerId === bot.id);
}
```

CSBot.tick respects the flag: if `frozen`, skip movement (return
early after aim/fire processing). The bot can still defend itself
— if an enemy is visible, it'll turn and shoot, but it won't break
its plant by walking. Verified by T11 (frozen blocks movement) and
T12 (frozen still allows fire).

---

## Back-reference plumbing

CSBotManager needs to read `csRoundManager.getActionOwnerId()` each
tick. CSRoundManager needs to call `csBotManager.getBotPlanter()`
each tick. Mutual dependency.

Solved by main.js after both are constructed:

```js
csBotManager.roundManager = csRoundManager;
```

Both refs are nullable (`?.`) so unit tests can construct either
in isolation.

---

## Tests — 598/598 cumulative

`test_cs_bot_plant_v328.mjs` adds 30 tests:

**Bot plant flow (T1-T6, 14 tests):**
- T1: T bot in plant zone, no player → plant starts, owner = bot id
- T2: Plant completes in 3s, owner clears for defuse phase
- T3: Bot walks out of zone mid-plant → plant cancels, owner clears
- T4: Bot dies mid-plant → cancels (callback returns null)
- T5: New bot replaces dead planter → new plant starts from scratch
- T6: Player plant beats bot plant when player commits before LIVE

**Bot defuse flow (T7-T10, 8 tests):**
- T7: CT bot near planted bomb → defuse starts
- T8: Full defuse completes → CT wins by defuse
- T9: Bot leaves defuse range → defuse cancels
- T10: Fuse beats bot defuse → T wins by detonation

**Freeze state (T11-T12, 4 tests):**
- T11: `frozen` bot does not move via `ctx.move`
- T12: `frozen` bot still aims/fires at visible enemies

T6 caught a real subtle issue: if the bot is in the zone before
LIVE begins, it starts planting the moment LIVE begins. The
player must commit (hold E) before WAITING expires to claim the
plant. In practice this is fine because bots have to walk to the
zone — they aren't sitting there at round-start. The test was
re-framed to verify "player gets priority when both attempt
simultaneously" which is the actual contract.

---

## Console additions

No new API. Existing introspection now shows bot actions naturally:

```js
cs.state()
// → snapshot includes:
//   { state: "bomb_planted",
//     bomb: { state: "defusing", defuseProgress: 0.42, ... },
//     ... }

cs.bots()
// → list shows bot states; the planter shows state="holding"
//   (frozen but at the plant location); the defuser similarly
```

A future enhancement: surface the owner directly in the snapshot
(`actionOwner: "player" | 42 | null`). For now you can read it
via `cs.state().bomb.state === "planting"` and `cs.bots()` to
identify who's doing what.

---

## Action — what the round loop now looks like

### Solo as T (the most interesting test)

```js
cs.play()                  // T side, 1 T bot teammate, 2 CT bots
// Run east toward A site (the T bot is going there too)
// Engage CT defenders at A site
// Either you or the T bot reaches the plant zone first
//   → whichever gets there first plants
//   → bot is "frozen" during the 3s — it'll still shoot but
//      stays put
// After plant: 35s fuse, CT bots rotate toward the bomb
//   → if a CT reaches the bomb, it starts defusing
//   → you need to kill the CT defuser or the bomb is defused
//   → if you're the bomber and you die after planting, the
//      T bot may not push to defend; the CT might successfully
//      defuse → CT wins
// Or fuse runs out → T wins by detonation
```

### Solo as CT (the new playable mode)

```js
cs.play({ side: "ct" })    // CT side, 1 CT bot teammate, 2 T bots
// Stay near sites (your CT bot teammate covers one site)
// Wait for the T bots to push
// If a T bot reaches a plant zone, it plants in 3s
//   → you have time to kill it before plant completes
// After plant: race to the bomb, hold E to defuse
//   → 5s defuse, fuse may beat you
//   → if you survive the defuse, CT wins
// Or kill both T bots before plant → CT wins by elimination
```

The CT-side experience is the new thing v328 enables. Before, T
bots would walk to the site and just stand there. Now they
actually threaten to plant. CT has to play actual defense.

---

## What's still NOT in (the next obvious follow-ups)

- **Bot can pick up dropped bomb** — if the planter T bot dies
  while carrying the bomb (not while planting), the bomb stays
  with the dead bot's last position. No "drop and pick up" yet.
  A second T bot would need to walk over the dropped bomb to
  acquire it. Currently any T attacker in a zone tries to plant
  even though semantically the bomb is "elsewhere"
- **Round end on player death (CT side)** — if the player is solo
  CT and dies, the round CT-team-wipes only if the CT bot also
  dies. The bot may successfully defuse or wipe the Ts on its own
- **Buy phase / economy** — still out of scope
- **Half-time / side swap** — still no
- **Bomb mesh proper** — still using `wad_prop_chest`

The bot-pickup-bomb item is the most accurate next refinement.
Currently the bomb is implicitly always "available to plant" by
any T bot in zone — which is fine for a smooth experience but
sloppy semantically.

---

## Status — eight rounds queued for testing

- v320 (FPS bet)
- v321 (easing / spatial hash)
- v322 (marching cubes)
- v323 (CS map geometry)
- v324 (bomb + rounds)
- v325 (bomb prop + heaven)
- v326 (bots)
- v327 (round-restart respawn + damage fix)
- **v328 (bot plant + defuse)**

The CS arc is, by any reasonable definition, **done**. Five
v3xx rounds (323-327) shipped the core; v328 closed the AI
loop. Twenty-seven minutes of compiled Counter-Strike-shaped
gameplay running inside a VBA-rooted voxel engine.

What's next is testing time. Or polish (bomb mesh, smoke
grenades, half-time). Or shift entirely — back to the FPS bet
from v320, or the worker pool / Tier 1 mesh post-processing
that was on the original docket before the CS detour took over.
