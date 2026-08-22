# Round 324 — CS bomb plant/defuse + round system

Phase A.2 of the CS arc. With the geometry from v323 in place, this
round adds the gameplay loop: plant the bomb (T), defuse it (CT),
score the round, repeat. Three new files, three modified files,
84 new tests.

After this round, `cs.play()` is recognizable as Counter-Strike,
not just "walk around an interesting-shaped map."

---

## State machine

```
   startMatch()
        │
        ▼
   WAITING (3s grace)
        │
        ▼
   LIVE (1:55 round timer)
   ├─ E held in plant zone (T side) → bomb PLANTING (3s)
   │     ├─ player leaves zone or releases E → cancel, back to HELD
   │     └─ 3s complete → BOMB_PLANTED
   ├─ time runs out, no plant → CT wins → ROUND_OVER
   │
   ▼
   BOMB_PLANTED (35s fuse)
   ├─ E held within 2.5m of bomb → bomb DEFUSING (5s)
   │     ├─ player leaves range or releases E → cancel
   │     ├─ fuse reaches 0 mid-defuse → bomb EXPLODES → T wins
   │     └─ 5s complete → bomb DEFUSED → CT wins
   └─ fuse reaches 0 → bomb EXPLODES → T wins
        │
        ▼
   ROUND_OVER (5s pause; score updated, banner shown)
        │
        ▼
   auto-restart → WAITING (next round)
```

Five round-end paths, all tested explicitly:
- T wins by detonation (T11 by manual, T12 full plant→explode)
- CT wins by defuse (T15)
- CT wins by timeout, no plant (T11)
- Fuse races defuse and wins (T6 — bomb explodes during defuse)
- Force-end via `endRound()` (T17)

---

## Single-player simplification

With no bots yet (round 326), the player can plant as T then run
back and defuse their own bomb. The round manager allows this in
"speedrun mode" — useful for solo-testing the full loop. When bots
arrive, the side restriction tightens automatically (only the CT
team can defuse).

This isn't a hack; it's a deliberate testability decision called
out in code comments.

---

## New files

### `simulation/CSBomb.js`
The bomb state machine. Pure logic, no DOM or WebGL. States:
- `HELD` → `PLANTING` → `PLANTED` → `DEFUSING` → `DEFUSED`/`EXPLODED`

Plant: 3s. Defuse: 5s. Fuse: 35s. Defuse radius: 2.5m. All
constants are exports so balance changes are one-line.

`tick(dt)` returns a transition label (`"planted"`, `"exploded"`,
`"defused"`) when the state changes, or `null`. The round manager
listens for these labels to drive its own transitions.

### `simulation/CSRoundManager.js`
The round state machine. Owns one bomb instance, the scores, and
the current round number. Wires player-position queries through
a callback (so the test can mock player position without a camera).

Key responsibilities:
- Driving the WAITING/LIVE/BOMB_PLANTED/ROUND_OVER transitions
- Validating plant location (must be in zone)
- Validating defuse position (must be within radius)
- Cancelling plant/defuse on key release or zone exit
- Carrying dt across state transitions so tests with large ticks work

### `ui/CSGameHUD.js`
DOM overlay HUD. Pure CSS positioned div with text. Updated each
frame from `csRoundManager.snapshot()`. Shows:
- Round timer (top center; red <30s)
- Score "T 0 - 0 CT" + round number (top left)
- Playing-as side indicator (top right)
- "BOMB PLANTED" banner with fuse countdown
- Plant/defuse progress bar
- Round-over banner with winner + reason
- Contextual hint ("[E] hold to plant", "[E] hold to defuse")

No WebGL touched. Doesn't fight with existing engine HUD panels.

---

## Modified files

### `simulation/CSMapGenerator.js`
- `csMeta.plantZones` added to layout: A site (51..65, 54..66) and
  B site (-25..-11, 54..66) — central 60% of each bombsite room
- `paint()` and `play()` accept a `roundManager` and `hud` in
  the constructor; `play()` auto-starts a match unless `noRound:true`
- `clear()` hides HUD and resets round manager state

### `main.js`
Four hooks:
1. Import `CSRoundManager` and `CSGameHUD`
2. Instantiate both, wire to CSMapGenerator's constructor
3. Route `KeyE` keydown to `roundManager.setInteractHeld(true)`
   when round is active (falls through to civ-ally otherwise)
4. Route `KeyE` keyup to `setInteractHeld(false)`
5. Tick the round manager + update HUD inside the main loop (no-op
   when state is `idle`)

The bomb-explode callback emits 30 fire particles at the bomb site.

---

## Console API additions

```js
cs.play()              // unchanged — paint map + FPS + auto-start round
cs.play({ side: "ct" })

// New in v324:
cs.state()             // snapshot: state, scores, bomb info, timers
cs.score()             // { t, ct, round }
cs.startRound()        // (re)start match from round 1
cs.endRound("t")       // force-end with given winner (mostly debug)
cs.hud.show()
cs.hud.hide()
```

---

## Tests — 464/464 cumulative

`test_cs_round_v324.mjs` adds 84 tests:

**CSBomb (39 tests, T1-T8):**
- T1: initial state (5)
- T2: full plant flow with mid-tick checks (7)
- T3: plant cancel (4)
- T4: plant → tick → explode (4)
- T5: plant → defuse complete (5)
- T6: defuse-race: fuse beats defuse mid-defuse (3) — critical edge
- T7: defuse cancel (4)
- T8: pointInZone helper (6)

**CSRoundManager (40 tests, T9-T19):**
- T9: startMatch state (4)
- T10: WAITING → LIVE auto-transition (3)
- T11: time expiry → CT wins (4)
- T12: plant in A zone → explode → T wins (7) — the core T-win path
- T13: plant outside zone is ignored (2)
- T14: walk out of zone cancels plant (2)
- T15: single-player defuse loop (5)
- T16: score persists, auto-restart (5) — caught the dt-carry bug
- T17: endRound force-end (2)
- T18: snapshot shape (7)
- T19: CT side cannot plant (1)

**Helpers (3 tests, T20):**
- T20: distSqXZ correctness

T16 caught a real bug: tick was not carrying dt across state
transitions. Fixed by adding overshoot calculation in WAITING and
falling through to the LIVE handler with remaining dt. Runtime
dt is capped at 0.1s so this never bites at 60Hz, but the state
machine is correct now regardless.

---

## What to try

```js
cs.play()                              // paint map, drop in as T, round starts
// walk to A site (east, x ~ 58)
// hold E inside the plant zone → 3s plant
// after planted: stay near bomb, keep holding E → 5s defuse, CT wins
// OR: run away, watch the 35s fuse, bomb explodes → T wins

cs.score()                             // { t: 1, ct: 0, round: 1 } after T win
cs.state()                             // full snapshot if you want to debug
cs.endRound("ct")                      // force the round to end as CT win

cs.play({ side: "ct" })                // play as CT — won't be able to plant
```

The HUD should appear at the top of the screen showing round timer,
scores, and the player-side indicator. The plant/defuse progress
bar appears at the bottom center while you're holding E.

Things to look for:
- **Plant zone check**: standing OUTSIDE the central A or B zone,
  holding E should do nothing. Walk into the center, the hint
  appears, plant begins
- **Cancel on movement**: start a plant, walk out of the zone
  mid-progress → should cancel cleanly
- **Cancel on release**: release E mid-plant → cancel
- **35s fuse visible**: after plant, top-center timer shows
  `35.0` ticking down by 0.1
- **Fuse beats defuse**: plant, wait until ~3s on fuse, hold E to
  defuse — should explode mid-defuse (fuse runs out first)
- **Score persists**: end multiple rounds, scores accumulate

---

## What WON'T work yet (saved for the next round)

- **Bots / opponents**: nothing to shoot at. Round-over only via
  bomb mechanics or timeout
- **Player health interaction**: dying doesn't end the round (no
  health threshold check)
- **Buy menu**: no economy, weapons are whatever the FPS shooter
  defaults give you
- **Visual bomb prop**: bomb is invisible when planted (only HUD shows
  it). Adding a glowing prop at the plant location is a 1-hour
  follow-up — could fold into round 325

---

## Status — five rounds queued for testing

- **v320** — getError throttle (FPS bet)
- **v321** — easing + spatial hash (no-op visual)
- **v322** — marching cubes (`mc.gyroid()`)
- **v323** — CS map geometry (`cs.preview()`, `cs.play()`)
- **v324** — bomb/round mechanics (this round; `cs.play()` triggers a
  full match loop)

The CS rounds (v323 + v324) compose: v324 builds on v323's spawn
rooms and plant zone metadata, but doesn't require v323 to be
"tested first" — they ship together as a single gameplay
experience.

Next planned: round 325 = visual bomb prop + elevation (heaven
spots) for sites. Then round 326 = bots.
