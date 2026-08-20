# Round 330 — Bomb carrier + drop + pickup

The semantic fix promised in the v328 doc. The bomb is now a real
object that belongs to a specific actor. Kill the carrier, the
bomb falls. Another T entity walks over it, picks it up. CT has a
high-value target; T has a logistics layer.

This is the round where solo CT side becomes genuinely strategic
— "kill the bomb carrier first" is a real subgoal.

---

## What changed

**CSBomb gains a carrier identity.**

```js
bomb.carrierId      // "player" | botEntityId | null when dropped
bomb.dropped        // true when no carrier, sitting on the ground
bomb.dropX, dropZ   // last drop position
bomb.assignInitialCarrier(id)
bomb.drop(x, z)     // carrier died — bomb falls here
bomb.pickup(id)     // another actor picks up
bomb.isCarrier(id)  // eligibility check
```

`drop()` is valid during HELD or PLANTING — if a carrier dies
mid-plant, the partial-plant cancels and the bomb falls at their
position.

**CSRoundManager wires six new callbacks:**

```js
new CSRoundManager({
    getInitialCarrierId: () => "player" | botId,
    getCarrierPos: (carrierId) => {x, z} | null,
    getPickupCandidate: (bx, bz, radius) => actorId | null,
    onBombDropped: (pos) => { /* spawn prop */ },
    onBombPickedUp: (carrierId) => { /* despawn prop */ },
    // (plus existing getBotPlanter, getBotDefuser, etc.)
});
```

The round manager's LIVE tick now has a new `_tickCarrier()` step
that runs before plant/defuse logic:

1. Query carrier position. If alive, cache it.
2. If callback returns null, the carrier is dead — drop the bomb
   at the cached position.
3. If bomb is dropped, query for pickup candidates within 2 voxels.
   Transfer carrier on match.
4. Fire callbacks so main.js can spawn/despawn the prop entity.

**Plant eligibility is now carrier-gated.** Both the player path
and the bot path check `bomb.isCarrier(actorId)` before allowing
plant. If carrier model isn't in use (no `getCarrierPos` provided),
the check is bypassed for backward compatibility — existing tests
that don't wire carrier callbacks still work.

---

## The full strategic loop

### Solo as T

```
Round start → you (player) are the carrier
Walk to A or B → hold E → plant
[OR]
You die while carrying → bomb drops at your feet
Your T bot teammate walks over the spot → picks up
Bot walks to a plant zone → plants
[OR]
Both T entities die → bomb sits forever → T can only win
    by CT team wipe (very hard from 1v2)
```

### Solo as CT

```
Round start → one of the T bots gets the bomb
You don't know which one — observe their movement to identify
Priority target: kill that bot first
If you succeed → bomb drops; second T bot can pick it up but
    only if it walks past the drop position
If you keep killing T bots fast, bomb may never be planted →
    CT wins by either elimination or timeout
```

The "watch which bot walks toward the site" subgame is new. The
T bot carrying the bomb is the threat. The non-carrier T bot is
just a distraction (it walks to the site too but can't plant).

---

## Tests — 658/658 cumulative

`test_cs_carrier_v330.mjs` adds 45 tests:

**CSBomb carrier API (T1-T6, 19 tests):**
- T1: assignInitialCarrier sets carrierId, isCarrier works
- T2: drop sets dropped state, clears carrier, records position
- T3: drop while planting cancels plant
- T4: pickup transfers carrier, clears dropped flag
- T5: pickup fails when not dropped
- T6: reset() clears carrier state

**CSRoundManager carrier integration (T7-T15, 26 tests):**
- T7: Initial carrier = "player" when T side
- T8: Initial carrier = first T bot id when CT side
- T9: Non-carrier in plant zone is ignored
- T10: Carrier bot in plant zone can plant
- T11: Carrier death drops bomb at last known position
- T12: Pickup detects nearby T entity, transfers carrier
- T13: Player carrier death mid-plant cancels + drops
- T14: Backward compat — no-carrier-model path still works
- T15: onBombDropped + onBombPickedUp callbacks fire correctly

T13 is the key test — it verifies the full chain: player as
carrier → plant starts → player dies → plant cancels → bomb
drops → action owner clears. Five things in sequence, all
correct.

---

## What gameplay looks like now

Visible bomb states:
- **Held**: invisible (carrier mesh occludes it)
- **Dropped**: small chest prop at the drop location (`wad_prop_chest`
  scale 0.5)
- **Planted**: larger chest prop at plant location (existing v325
  behavior)

The dropped prop despawns on pickup. Both props despawn on round
end (the onRoundStart callback in main.js cleans up any leftover).

### What the player sees

Solo T, you carry the bomb. No visible bomb until you plant or die.
Plant → chest at the site. Die → chest drops where you fell. Your
T bot teammate may walk over and pick it up automatically; from
that point your dead body is irrelevant and the bot is the new
plant threat.

Solo CT, you watch T bots. The carrier (first T bot at round start)
is the active threat. Killing them drops the bomb. The second T
bot might pick it up — if so, they become the new threat. Keep
killing.

---

## Known limitations

- **Bots don't actively pursue the dropped bomb.** Their AI still
  walks to their assigned plant zone — they don't path TO the bomb.
  Pickup happens incidentally: if a bot walks past within 2 voxels,
  they grab it. If the bomb drops in a corner with no path through
  it, no one picks up.
- **No "bomb pickup priority" AI.** A bot heading to A site won't
  detour to grab a bomb dropped at B. This is fine for current
  gameplay but limits high-skill bot behavior.
- **Player can't drop the bomb voluntarily.** No keybind to drop;
  you can only lose it by dying. Adding `G` to drop is a one-line
  addition if needed.
- **No visual indicator of who has the bomb.** CSGameHUD doesn't
  show "Bomb carrier: T-BOT-7" or similar. The HUD just shows
  bomb state (held/planted) without carrier identity.

These are real follow-ups but each is small and orthogonal.

---

## Console additions

No new top-level API. The bomb state is observable via existing
introspection:

```js
cs.state().bomb       // existing — includes new carrierId, dropped fields
```

Future enhancement: surface carrier name in `cs.state()` and HUD.

---

## What's next

Eight rounds of CS now ship (v323-v330). The arc is feature-rich
enough for actual portfolio video material. Reasonable next
directions:

1. **Test what's shipped.** Three CS-major rounds (v327 respawn,
   v328 bot plant/defuse, v330 carrier) all need real-play
   validation. The carrier model is the most semantically complex
   addition — worth seeing it play out
2. **CS polish.** Bot pursues dropped bomb (~30 lines), drop key
   for player (~5 lines), HUD carrier indicator (~20 lines)
3. **Pivot.** Original docket — CPU worker pool tier 1, Trellis 2
   dinov3, OBJ preview canvas — still on the table
4. **Different fix.** v329 shipped a diagnostic for the missing-
   terrain-side issue. Next time it shows up, `dumpChunkGrid()`
   will narrow down the cause; one targeted fix round after that

The CS arc's complexity is starting to outweigh the marginal
gameplay improvement of more rounds. I'd lean toward **option 1
or 4** — banking the work, getting confirmation, then deciding
direction based on real signal rather than my predictions.

But the choice is yours.
