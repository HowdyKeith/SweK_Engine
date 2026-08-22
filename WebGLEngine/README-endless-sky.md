# Endless Sky in SweK / Stellar Atlas  (v2186)

## Smuggling: illegal, stealth, apparent payment (v2211)

158 uses across the base game, and the runner read none of them — so a mission that was meant to be
*dangerous to carry* was carried for free.

- **`illegal <fine> [message]`** — a scan of your hold costs you that many credits, and the authorities say
  the message if there is one.
- **`stealth`** — being scanned at all **fails** the mission. Not a fine: a failure.
- **`apparent payment <n>`** — what the mission *says* it pays. The real payment is on `on complete`, so a
  mission can look like it pays 5,000 and pay 50, or the reverse. Both happen.

### The asymmetry, and its reason

`CargoHold::IllegalCargoFine` fines two kinds of contraband by two opposite rules, on adjacent lines:

    outfits        totalFine = max(totalFine, fine / 2)    -- halved, and a maximum
    mission cargo  totalFine += fine                       -- summed

ES's own comment: mission fines are *"added together to avoid the player being able to stack multiple illegal
jobs at once and avoid the bulk of the penalties."* **Anybody implementing this from the field name would
take the maximum of everything, and be wrong on every player who ever carried two contraband jobs.**

And **a negative fine is not a large fine — it is an atrocity.** The count stops wherever one is found. A
government can `ignore universal atrocities` or `ignore universal illegals` and pay nothing. A *failed*
mission's cargo is fined by nobody. And exactly one mission in the base game declares `illegal 0` — marked
illegal, costing nothing, not even counted as illegal tonnage, because ES only tallies it `if(Fine())`.

The counts match the coverage instrument: **48 illegal, 42 with a message, 42 stealth, 54 apparent payment, 5
atrocities.** `es-missions-selfcheck` 74 → 106.



Loads Endless Sky (GPLv3) through the existing clean-room EV engine in `WebGLEngine/ev/`. The adapter
parses ES text data and emits the SAME `uni` graph `evData.js buildUniverse()` produces, so
`galaxyMap.js`, `systemView.js`, `flightView.js`, and `combat.js` fly it. Endless Sky data and art are
freely redistributable; these modules ship no content, they transform files fetched from the ES repo.


## Which mission gets offered (v2205)

The runner had no answer. `available()` handed back whatever order the map happened to hold, capped at an arbitrary
twenty — so **a priority mission sitting at index 21 was silently never offered.**

ES's rule (`PlayerInfo.cpp`, `StepMissions`) is four flags and a stable sort:

| | |
|---|---|
| `priority` | if **any** available mission has it, only priority and non-blocking may offer |
| `non-blocking` | exempt from both rules: neither blocks minors nor is blocked by priority |
| `minor` | offered only if nothing else is competing — *"to avoid having two or three missions pop up as soon as you enter the spaceport"* |
| `"offer precedence"` | a **stable** sort, descending. Ties keep alphabetical order, because the `Set` they come from is alphabetical |

### The line that looks like a bug and is not

Excess minors are erased from the **front** of a list sorted by **descending** precedence. So — in ES's own words —
*"the minor mission with the lowest precedence is the one that will be offered."* A reasonable person implementing
this from the field name would keep the highest, and be wrong on 302 missions.

### And a "fix" that fixed a non-bug

`"offer precedence"` is a **quoted two-word key**: ES takes `Token(0)` as the key, so the two words must be one
token. My hand-typed fixture wrote it unquoted, the reader dutifully failed to find it, and I "fixed" the reader to
match **invalid ES**. All 32 in the base game are quoted. The fixture was wrong, not the code.

The counts now match the coverage instrument exactly — **priority 47, minor 302, non-blocking 186, offer precedence
32, blocked 186** — and all five have left the ignored list. The coverage drift guard fired when they did, which is
the guard working: *a key must not leave the ignored list until something actually reads it.*

`blocked` is the message shown when a mission would offer but there is no room for it. The runner hands it to the
caller, which is the only thing that knows the size of the hold.

`es-missions-selfcheck` 59 → 74.

## What's here
- `ev/esParse.js` — ES DataFile reader (indent tree; bare / `"quoted"` / `` `back-quoted` `` tokens; `#` comments).
- `ev/esData.js` — `buildUniverseFromES(root)` → `uni` (systems, spobs, ships, weapons, govts, outfits, counts).
- `ev/esSprites.js` — PNG art path (NEW in v2138): resolves ES sprite paths to images, bakes each ship
  into a rotation sheet `flightView.setSprite` already draws, and loads landscapes for the landing screen.
- `es-build.mjs` + `es-universe.json` — Node baker and a prebuilt 694-system galaxy for one-drop loading.
- `ev.html` — patched: `loadFiles()` detects ES data (raw `.txt` drop or `es-universe.json`) and routes
  through the adapter; the EV resource-fork path is untouched.

## Run it
1. Open `ev.html` (Stellar Atlas).
2. Drop `es-universe.json` on the window — instant galaxy. (Or drop the ES `data/` `.txt` files; or
   `node es-build.mjs path/to/endless-sky/data ./es-universe.json` to bake your own.)
3. Ship and planet art loads from the ES repo's raw images by default (CORS-enabled). To run fully
   offline, set `window.ES_IMAGES_BASE = "/your/local/images/"` before loading, pointing at an ES
   `images/` folder you serve locally.

## Sprites (v2141)
ES ships are single top-down PNGs; EV ships are rotation sheets. `esSprites.js` bakes each PNG into a
32-frame rotation sheet shaped exactly like `decodeRLED`'s output, so the existing flightView atlas
renders ES ships with no changes to flightView. Loading is async: a ship shows the vector triangle for
a beat, then upgrades to its sprite. Frame candidates tried per sprite: `name.png`, `name=0.png`,
`name-0.png`, `+0`, `~0`, then `.jpg` (landscapes). System-map planets stay vector discs (no art needed);
planet art shows on the landing screen from each planet's `landscape`.

## Flight tuning (v2141)
Ship motion is derived from installed engine outfits (`thrust`, `turn`, `drag`) over hull+outfit mass,
then scaled into EV's flightModel ranges and clamped: `speed 40..900`, `accel 2..60`, `maneuver 3..60`
(`maneuver*3 = deg/s`). Base/variant inheritance was added, which fixed ~variant ships that previously
read 0 shield/0 armor. The scale constants in `esData.js` pass 1b are the dials to tweak on the rig.

## Verified (current ES master)
694 systems, 4,989 stellar objects, 910 ships (0 with empty stats; 42 of them are persons' ships), 352 weapons,
126 governments, 878 outfits, 16 persons, 18 wormholes, 222 fleets, 641 phrases, 218 news items.
Adapter coverage 93.4% of root nodes. Every system positioned; 0 dangling / 0 one-way links; 612 landable worlds. Sol → Republic,
links Alpha Centauri/Altair/Caph/Denebola/Sirius/Vega, Earth landable with landscape `land/city20`.

## Still open
- Comms portraits reuse nothing yet for ES (cosmetic; ES has no PICT portraits — could use ship thumbnails).
 Missions, events, economy, and NPC combat objectives are mapped (see the sections below).
- Ignored root types, by whether you would notice: `minable` (34) and `hazard` (30) — asteroid mining and system hazards; `star` (87) — every system gets a generic star; `effect` (308), `galaxy`, `color`, `formation` — cosmetic.
- Mission keys still dropped: `blocked` (186), `clearance` (151), `illegal` (48), `priority` / `offer precedence` (79), `stealth` / `infiltrating` (98), `apparent payment` (54). `clearance`, `illegal` and `priority` change what the board offers and what happens when you land; the rest (`minor`, `color`, `autosave`, `non-blocking`, `mark`, `transition`) are UI.

## The clock (v2174)
`ev/esDate.js` is Endless Sky's calendar, to the day: `Date::DaysSinceEpoch` reproduced exactly (proleptic Gregorian,
counted from 1 Jan of year 1), cross-checked against the Gregorian calendar on 1,772 dates from year 1 to 3100, with
`fromEpochDay` round-tripping all 73,048 days of the ES era. Every ES start begins on 16 Nov 3013.

**One day passes per system entry** — ES's own rule and its only clock (`Engine::EnterSystem` → `PlayerInfo::AdvanceDate`).
On that day, in ES's order: the date advances, the scheduled events whose day has come fire, then any mission whose
deadline is now strictly in the past fails. The day *of* the deadline is still yours.

Until v2174 there was no clock at all. `advanceDate()` was called by nothing. `eventQueue` was declared, drained, and
never filled. `dispatch()` fired `event "war begins" 30 60` immediately, discarding the delay — 228 places in the base
game. 400 missions carried a `deadline` that could never expire. `player.date` was a shape nobody constructed, so every
`days since start` condition read zero. And the six root events carrying an absolute date — including **war begins**,
4 Jul 3014 — were never scheduled, so the Free Worlds war never started.

Faithful: `deadline <d> <m> <y>` (absolute), `deadline <base> [<mult>]` and bare `deadline` (multiplier 2), resolved at
accept as `today + base + mult × jumps`; `event <name> [min=1] [max=min]` with the delay drawn uniformly from the range
(the default really is one day, not zero); dated root events scheduled at new game.
Not faithful: ES counts a deadline's jumps through the mission's waypoints and stopovers (`Mission::CalculateJumps`);
we count the direct source → destination distance, so a courier run with a detour gets slightly less time from us.

## Clicking "Fly" now flies (v2186)

`ev.html` had **never loaded `es-universe.json` by itself.** The engine has shipped a baked galaxy since v2162 and
`endless-sky.html` has a button that says *"Fly it in Stellar Atlas"*, and that button opened an empty page: you had
to know to drag the file onto it. Every check in the ES suite passed, because every check hands the universe to the
code directly. **Nothing tested the click.**

Boot order is now: the IndexedDB cache first (it may be a plugin, or a different game), then the galaxy the engine
ships with, then the drop UI. A 404 is not an error — it means somebody deleted the file, and the drop UI is exactly
the right answer. The counts line says which one you got.

`ev/tools/es-page-selfcheck.mjs` is the contract: the file exists, it is an Endless Sky universe with systems and
ships and starts and conversations and its own coverage report; the page reaches for it, in the right order, and falls
back rather than throwing; every button points at a page that is in the tree; every module either page imports is in
the tree. It is a *contract* check and not a boot — `ev.html` has canvases and workers a stub cannot honestly fake,
and pretending otherwise would be worse than admitting it. `bz/tools/bz-page-selfcheck.mjs` really does boot its page
and press W.

## One LocationFilter (v2179)
There were three of these in the adapter, each a different subset, and the mission one was the worst: it **silently ignored
773 filter keys** across the base game, of which **567 were `not` blocks**. Ignoring a `not` does not narrow a filter, it
inverts it. A mission whose source is "any Republic world, *not* Earth" was being offered on Earth. It also read
`distance 3` as min = max = 3 rather than "within three jumps".

Measured against the old matcher on 43,056 (mission, planet) pairs: it said yes **5,884** times where the real filter says
**2,282**. It was over-offering by 2.6×.

The person and news filters had the opposite failing: they honestly *dropped* anything they could not evaluate. That was
the right instinct at the wrong price — it threw away content. `ev/esLocation.js` is now the only one, and nothing is
dropped and nothing is guessed.

Three rules from `source/LocationFilter.cpp` that were wrong somewhere:
- `attributes` is a **list of sets**. Names within a set OR; the sets AND. `attributes a b` means "a or b". The person and
  news filters required *all* of them — backwards.
- `not` and `neighbor` come in two shapes: a bare line introducing a nested block, or an inline prefix
  (`not attributes "human"`). A `not` fails the match if it *matches*; a `neighbor` must match a system linked to the one
  under test.
- Matching a planet checks attributes against the planet's own; matching a *system* checks them against the system's
  attributes **or any of its planets'**. A too-far or unreachable system fails at any minimum, because ES's `Distance()`
  returns −1 and then −1 < min.

## The conversation decides (v2178)
**1,220 of the base game's 2,270 missions gate acceptance on an `on offer` conversation.** Until now the board button
called `offer()` and `accept()` back to back, so every one of those stories had exactly one ending: yes. v2177 built the
engine; this round connects it to the decision it exists to make.

`offer(m)` no longer takes the mission. It runs `on offer` and hands back whatever that block wants the player to answer:
a conversation (1,220), a yes/no `dialog` (32), or nothing at all — a job you take straight off the board (1,018). The host
plays it and calls `resolveOffer(m, outcome)` with ES's own word. `accept`/`launch` take the mission; `decline`/`flee`
refuse it for good; `defer`/`depart` clear the `offered` mark so it comes back on the board, because deferring is not
declining; `die`/`explode` settle nothing.

A conversation's `action` block is not just condition assignments — 93 write to the pilot's log, 106 install an outfit,
79 pay you, 20 schedule an event, 11 fail a mission. They now run through the **same** `dispatch` a mission's `on` block
uses, rather than a second one that would drift.

Proof, from the real galaxy: every mission with an offer conversation is offered, played to an ending with random answers,
and settled. 1,220 conversations, zero throws, every ending one of ES's eight words — **725 accepted, 425 declined,
57 deferred, 5 died, 8 refused by a `to accept` gate**, and 265 pilot-log entries written along the way.

## Conversations (v2177)
The last big honest stub in the mission runner. A `conversation` used to be dropped on the floor and acceptance assumed,
so every branching story in the game had exactly one branch. There are 46 root conversations and **1,623 written inline**
inside missions and starts, so `ev/esConversation.js` takes a node, not a name.

The model is `source/Conversation.cpp`'s: a flat list of nodes, each element carrying the index of the node to visit next
or a negative endpoint sentinel. Text lines merge into one node unless a label, choice, branch, action, scene, `goto`, or
`to display` breaks the run. A branch's two targets default to "the next node". `to display` hides a line or a choice
without changing where the story goes; `to activate` shows a choice and refuses to let you pick it.

The distinction that decides where every story ends: an **endpoint is a bare keyword** (`accept`, `decline`, `defer`,
`launch`, `flee`, `depart`, `die`, `explode`) written under a text line or a choice — while `goto accept` looks for a
**label** named `accept` and nothing else, because `Conversation::Goto` never consults the endpoint table. The base game
does both, side by side, in `data/human/deep missions.txt:436`. This file had it backwards until the selfcheck said so.

`ev/esSubs.js` fills the holes the text is written with: the conditional `substitutions` blocks (3 root, 66 mission-local,
layered over the global ones), and the hard-coded keys only the caller can supply — `<first>`, `<payment>`, `<planet>`.
One left-to-right pass, so a replacement is never rescanned and two entries cannot loop. Reserved keys cannot be shadowed
by data. An unknown token is left exactly as written; it is somebody's bug, not ours to silently delete.

**And the prose was being cut in half.** `serializeNode` truncated every token longer than 200 characters, to bound the
size of `es-universe.json`. It was cutting mission descriptions, every `dialog`, and all 1,623 inline conversations
mid-sentence. The banker's paragraph in the default intro is 706 characters, so nobody ever heard him say what the
mortgage would cost. The whole of the game's text costs about 1.5 MB. That is what a story weighs.

Now the intro plays: the bank lobby, the banker reading out **2,503 credits a day and 433,567 in interest** — the same two
numbers `ev/esAccount.js` computes from the start block, arrived at from the opposite direction — the name entry field,
and the walk to the shipyard. Adapter coverage 92.8% → **93.4%**.

## A real new game (v2176)
`start` blocks are data, not a constant we chose. All five load: where the pilot wakes up, when, how rich, and how deep in
debt. Everything ES's loader does not recognise falls through to a condition assignment (`StartConditions::Load` really
does end in `conditions.Add(child)`), so `set "license: Pilot's"` runs through the same `applyActions` a mission's
`on offer` uses rather than a second, subtly different applier. A start pointing at a system or planet that does not exist
is dropped — there is nowhere to put the player and guessing would be worse. `to unlock` marks a start locked (Hai
Origins) rather than hiding it. The engine takes the first unlocked start, preferring `default`.

`ev/esAccount.js` is the accounting, once per day, hung off the clock. Crew salaries first, then maintenance — both can
be paid in part and the remainder carried — then each mortgage, all or nothing. A missed payment is not deferred: the
principal grows by a day's interest and the term does not move, so miss enough and you owe more than you borrowed on a
schedule that has expired. Credit score moves ±1/−5 a day, clamped to 200–800.

The pleasing part is that the game checks this for us. In the intro conversation the loan broker reads the answer aloud:
*"You are borrowing 480,000 credits… your daily payments are 2,503 credits, and by the end of the year you will have
paid… 433,567 credits in interest."* Both numbers are asserted against the start block the game ships, and both come out
exact — as does clearing the debt on day 365.

Salaries and maintenance are passed as zero: the flight layer models neither a crew nor ship upkeep. The plumbing carries
them so it will not need rewriting when it does.

## Phrases, hails, and news (v2175)
`phrase` was the single largest thing the adapter ignored: 867 nodes, 641 names, and three systems built on it that were
all dead. `ev/esPhrase.js` is the grammar, exactly as `source/Phrase.cpp` loads it — parts concatenate in order; a `word`
part picks one weighted choice; a `phrase` part expands another by name; `replace` rewrites only what was built *before*
it; `${name}` interpolates inline; repeating a name appends a sentence rather than replacing one; and a recursive
reference yields `""` rather than a throw or an infinite string. The registry is plain data, so it bakes straight into
`es-universe.json`, and the rng is injected, so a co-op room seeded from `(room, system)` hears the same pirate say the
same thing on every screen.

`ev/esVoice.js` is what the grammar is for:
- **Hails.** 261 hail phrase names across 126 governments — friendly, hostile, and a separate pair for a disabled ship.
  A unique captain's own `phrase` outranks her government's, because being Marauding Max is the whole point of being
  Marauding Max. Bound to `C` in flight.
- **News.** 218 spaceport stories, each filtered to the planet you landed on (`planet` / `system` / `government` /
  `attributes`, and `not`, which nests), 62 of them gated on a `to show` condition evaluated by the same store the
  missions gate on. One item (`neighbor`) uses a filter we cannot honestly evaluate, so it is dropped and counted.

Adapter coverage 79.1% → **92.7%** of root nodes (92.8% after v2176).
Not modelled: `friendly disabled hail` / `hostile disabled hail` load and resolve, but nothing in the flight layer
disables a ship yet, so they never fire. `substitutions` (3 root, 66 in missions) is still ignored.

## Coverage is measured, and the measurement is checked (v2173)
`ev/esCoverage.js` declares what the adapter consumes; `ev/tools/es-coverage.mjs --selfcheck` now checks that
declaration against the adapter source **in both directions**, because it had drifted both ways at once:
- **under-claimed**: only `to offer` was listed, so `to accept` (102), `to complete` (100) and `to fail` (174) were
  reported as ignored across the base game. All three are gated by `esMissions.js`. 376 phantom gaps.
- **over-claimed**: `deadline` (400) and `invisible` (351) were listed as consumed and were read by nothing.

A coverage report that is wrong in our favour is worse than no coverage report. The guard now fails if a declared key
is not quoted in the adapter source, and fails if a key reported as ignored *is*. A `to <block>` also names itself now,
so four distinct condition gates can no longer hide inside one row called `to`. Fixing the table immediately exposed a
real bug: `invisible` (351 missions) was read by nothing, so accepted missions ES hides were showing in the player's
list. `esMissions.active()` now honours it, matching `Mission::IsVisible`.

## Persons + wormholes (v2172)
Two content types the adapter used to ignore. Both were verified against `endless-sky` master source, not guessed.

**Persons** — the 16 unique captains who hunt you across the galaxy. `esData.js` parses `person "Name" { government / frequency / system <filter> / ship <Model> [<Given>] { overrides } }`; the first ship is the flagship and takes the person's name, the rest keep their given names, and every one inherits from the root ship the way a variant does (Zahniser's 40,000-shield Kestrel and his two `Finch (MZ)` escorts all come out right). `esFleets.js` `pickPerson` / `spawnPersons` use ES's own numbers: the weighted table, `frequency` default 100, and the `noPersonSpawnWeight` of 1000 that usually means "nobody today". ES rolls the *attempt* once per 36,000 frames; we have no per-frame spawn tick, so the attempt is converted to a per-system-entry probability for an assumed one minute of flight (`dwellFrames`, the only dial we invented). Measured against the real galaxy: a captain turns up on about 7% of entries into Sol. A destroyed person never returns — that is per-player state, so it lives in the condition store under `swek: person destroyed: <name>`.
Not modelled: `personality` traits (they fly under their government's stance, like every other ship) and `phrase` (the hail has nowhere to appear yet). Zitchas brings 38 ships in ES; we cap a person's wing at 12.

**Wormholes** — `wormhole "Name" { mappable / link <from> <to> }`, claimed by a planet with `wormhole "Name"`. Links are **directed**, keyed by origin system, so the two-way ones in the base game simply declare both directions and we never infer a return trip. Flying up to a wormhole planet and pressing `L` puts you in the far system instead of on a landing screen. `mappable` wormholes are drawn on the galaxy map in their own colour; the rest are meant to be found.

Verified against current ES master: 16 persons (0 dropped), 18 wormholes, 15 of them claimed by a planet.

## Co-op ownership (v2172)
Three kinds of ship now spawn per system, owned three different ways, because they are known to different people:
- **Ambient traffic** is deterministic from `(room, system)` — the seeded RNG reaches `esFleets.spawnAmbient`, so every pilot in a room meets the identical mix. Bare ids, distributed across peers by rendezvous hashing: exactly one client simulates each ship.
- **Mission NPCs** and **persons** depend on state only one client has (which mission is accepted, which captain this player has already killed). They get a private wing id `"<peerId>:m<n>"` / `"<peerId>:p<n>"` and are replicated to the other pilots as ghosts.
Before v2172 the seed never reached the spawn hook, so ES ambient rolled `Math.random` per client and handed out ids `1..n`: two pilots spawned different ships under identical ids, and the ring split them apart.

## Conditions engine (v2141)
`ev/esConditions.js` implements the ES condition system that missions, events, and conversations gate on.
- `createConditionStore(player, uni)` — a string→int store. Reserved keys are computed live: `credits`,
  `net worth`, `reputation: <govt>`, `random`, date keys, `ships:`/`outfit:`/`flagship:` lookups,
  cargo/passengers, `license:`, `visited planet/system:`, current `planet:`/`system:`.
- `evaluateTest(node, store)` — evaluates a `to offer` / `to complete` / event `conditions` block:
  `has`/`not`/`never` + comparisons, grouped by `and {}` / `or {}`; expressions do `+ - * / %` with parens.
- `applyActions(node, store)` — runs an `on offer` / `on complete` block: `set`/`clear`, `= += -= *= /= %=`,
  `++`/`--`, `<?=`/`>?=`; it returns non-condition verbs (payment, event, log, dialog, conversation) as
  `skipped` so the future mission runner can handle them.
- Self-check: `node ev/tools/es-conditions-selfcheck.mjs path/to/endless-sky/data`.

This is the substrate for the next pieces: a mission/event runner, then economy and shipyard/outfitter.

## Mission + event runner (v2141)
`ev/esMissions.js` drives ES missions and events on top of the conditions store.
- `createEsMissionRunner(uni, store, hooks)` → `available()`, `offer/accept/decline/abort`, `onArrive(planetId, systemId)`, `applyEvent(name)`, `advanceDate()`, `active()`, plus `render`/`renderBar` that fill the existing mission board.
- Lifecycle keys `"<name>: offered/active/done/failed/declined/aborted"` are maintained so missions can gate on each other (that's how ES chains its campaign).
- Source/destination accept a bare planet name or a filter block (government + attributes + jump `distance`). `on complete` payment/fine move credits; `event` applies world changes (system links, governments); `fail` chains failures. Cargo/passengers are added on accept and cleared on complete/fail.
- Wired into `ev.html`: on ES data the spaceport bar, landing board, and arrival all route through the runner; the EV path is unchanged.
- Self-check: `node ev/tools/es-missions-selfcheck.mjs path/to/endless-sky/data`.

Honest stubs (recorded, not yet simulated): conversation branch outcomes, full LocationFilter (`near`/`not`/nested), real-time deadlines. NPC combat objectives are now live — see below.

## NPC fleets + combat objectives (v2142)
`ev/esFleets.js` spawns Endless Sky fleets, and `ev/esCombat.js` tracks mission NPC combat objectives.
- `esFleets.js` reads ES `fleet "Name" { government … variant [<w>] { "Ship" [n] … } }` definitions (kept by `esData.js` as `uni.esFleets`) and each system's `fleet "Name" <period>` references (`system.fleets`). `spawnFleet(spec, uni, around)` picks one weighted variant and expands its ship list into the SAME entities `combat.js`/`flightView.js` already fly, tagged with government + player-stance team + a team hint. `spawnAmbient(system, uni, around)` weights a system's fleets by `1/period` and drops a live traffic mix — the ES analogue of `combat.js` `spawnFromDudes`.
- `esCombat.js` `createNpcTracker(uni, store, hooks)` parses a mission's `npc` blocks into combat goals. Objective flags on the `npc` line: `kill`, `board`, `assist`, `disable`, `capture`, `provoke` add a succeed event that must happen to every ship; `save` fails the mission if any ship dies; `evade` needs the ships to leave; `accompany` needs them to survive and arrive with you; `scan cargo`/`scan outfits` need a scan. `armMission` runs on accept; `onSystemEnter(sysId, around)` spawns the mission's ships when the player reaches the matching system (honoring `system` filter + `to spawn`); `recordEvent(entity, type)` resolves objectives from combat and fires the NPC's `on kill`/`on board`/… action block; `onPlayerJump` resolves `evade` and lets abandoned targets re-encounter on return.
- Wired into `ev.html`: `flightView.enter` gained an engine-agnostic `spawn` hook; on ES data it drops ambient fleets + the current system's mission NPCs, routes ship kills to `esRun.recordEvent(ship, "destroy")`, and gates mission completion on `missionReady` (a `save`/`accompany` loss fails the mission on the spot). The EV path is unchanged.
- Verified against current ES master: 222 fleets all resolve to ships (0 empty); 587 missions with NPCs (1186 `npc` blocks) arm without error; objective tally kill 156 / save 250 / accompany 177 / evade 109 / disable 25 / board 12 / scan-outfits 15 / scan-cargo 5 / assist 14 / provoke 2.
- Self-check: `node ev/tools/es-combat-selfcheck.mjs path/to/endless-sky/data`.

Honest approximations (the sim doesn't fully model these yet): `accompany` is satisfied if the ships weren't destroyed by arrival (no cross-system escort flight); `scan`/`capture`/`assist`/`provoke` resolve only when the flight layer reports the event.

## Economy (v2141)
`ev/esEconomy.js` adds trading and ship/outfit commerce on real ES data.
- `createEconomy(uni, store, player)` shares the mission runner's store, so credits and cargo are one source of truth.
- Commodities use real per-system prices (`system … trade <good> <price>`), with commodities.txt low/high as the fallback mid. `buy`/`sell` clamp to cargo space and credits — buy low in one system, sell high in another.
- Shipyard/outfitter lists come from the planet's real sale groups. `buyOutfit`/`sellOutfit` check outfit space and recompute the flagship's speed/turn; `buyShip` swaps the flagship and installs its default loadout.
- Wired into the dock: Commodity Exchange, Outfitter, and Shipyard buttons use the economy on ES data; the EV path is unchanged.
- Self-check: `node ev/tools/es-economy-selfcheck.mjs path/to/endless-sky/data`.
