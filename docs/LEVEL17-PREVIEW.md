# Level 17 -- a preview, written before Level 16 starts

Written at v4301 (Level 15 shipped). A preview is a claim about what the rung two above this one
would hold, so that Level 16 is built knowing what has to sit on top of it. Nothing here is built;
every item names what it would measure, what its twin would be, and what it needs from below.

## Where the ladder stands

- Levels 11-13 (v4299): the GPU decides what to draw (compute cull, LOD, indirect draws), what is
  hidden (Hi-Z, two-phase), and what a person can use (picking, quality tiers, the orrery on the
  device path). The economy moves in.
- Level 14 (v4300): the economy closes its loops (treasuries, recipes, upkeep, bankruptcy, a ledger
  that balances in tons and credits); 300 haulers fly on the GPU in the Endless Sky universe; the
  terrain gets light; the rig gets a question it can answer.
- Level 15 (v4301): fleets in their own architectures. Nine races, each a re-skinner the tree already
  had; the user's own EV ship or radar plane as the raised hull; the pick picture carries the race.
- Level 16 (v4314, built after this preview was written): other people, other minds, a universe that persists. Two browsers
  on one universe over the lockstep layer; the brain as a trader scored against the greedy haulers;
  seed + tick + intervention log so a reload returns to the same place; new commits as production.
  Level 16 must also absorb "time is git time" (bodies arrive on the day they were vendored, markets
  open then, routes recomputed as the universe grows), because a saved universe is a replay from a
  point and there is nothing to replay until history is a thing the sim can play.

## Level 17: the races ACT, you fly among them, and the numbers come off the rig

### 1. Races that behave, not only look

Level 15 gave every owner a race and every race an architecture. Level 17 gives each race an
ECONOMY OF ITS OWN: a race that hoards a good, one that only carries docs, one that undercuts
every market it lands at, one that raids -- the EV combat sim the game already runs as the twin
for what "raid" costs. The fleet id that already rides in every record is the switch; nothing new
travels to the GPU.

- Measure: the ledger with each race switched off, one at a time, against all nine on. A race
  whose absence changes nothing in a hundred days is a costume, and the gate says so by name.
- Twin: the CPU economy, which is already generic (makeEconomy over any world). Behaviour is a
  policy per race in JavaScript; the GPU never learns it.
- Needs from 16: the intervention log, so a race's policy change is an intervention that replays.

### 2. A heading in the record

The named remainder of Level 15: every fleet shader spins its hull by the golden angle times the
id, a stand-in. Level 17 widens the input record from four floats to eight -- centre, radius, a
heading (yaw about the plane's normal, plus pitch for the GPU haul's climb), and one race-specific
parameter -- and retires the spin. The haul pass writes the heading from the flight's own
direction, so a ship faces where it is going; the orrery's traders face their next market.

- Measure: for every drawn ship, the vertex stage's forward vector against the flight's direction,
  read back through a probe pipeline; and the pick picture unchanged (identity does not move).
- Twin: the CPU haul (flightElements) computes the same heading from the same eight floats.
- Cost: every consumer of RECORD_FLOATS. The universe's 6,211 bodies double their record bytes; the
  cull reads eight floats where it read four. The gate keeps the four-float form working (a body
  with no heading is a body with heading zero) so nothing that shipped at Level 11 changes.

### 3. You, in your own ship, in the git universe

The user's hull already flies as the Wedge race. Level 17 puts the PERSON in it: the EV controls
the game already has (thrust, turn, land, trade) drive one record the sim does not own, the
economy sells to and buys from that ship at the same prices it gives the haulers, and landing on
a market opens its trade screen. Picking already names everything under the pointer; this is the
pointer becoming a cockpit.

- Measure: a scripted flight (thrust N ticks, turn, land at market M, buy G, fly to M2, sell)
  changes the ledger by exactly the trade's value and the upkeep flown, and the ledger still
  closes.
- Twin: the EV flight model, which is already gated (physics/ev); the GPU only draws the ship.
- Needs from 16: persistence, or the person's cargo is gone on reload -- which is a screensaver.

### 4. Landing on a planet: the terrain meets the orrery

The one item from the original Level 15 sketch with no dependency on the economy, still unbuilt.
Past a zoom threshold a body becomes a heightfield of its own file tree (render/gpuTerrain.mjs
already draws lit, skirted, pickable chunks from a heightfield), with the same LOD ladder and the
same pick pipeline, so pointing at a ridge names the file. Two consumers become one scene.

- Measure: the pick at a ridge returns the file whose bytes made the ridge; the chunk seams stay
  closed across the zoom (the Level 13 seam test, replayed at every zoom step).
- Twin: heightAt on the CPU, as today.

### 5. Looks that need a mask: the identity picture as a strength field

Level 15 drew every race in its own fragment shader. Post effects (badTv, crt, the SwiftUI ports
still to convert) cannot be done per race in a fragment stage; they need the identity picture as
a MASK. Level 17 renders to texture on both backends (the device gains a texture usable as a
render attachment), reads the pick picture as a strength field (render/strengthField.mjs already
takes a texture), and confines a post look to one race: the hologram flickers, the ink race gets
paper grain, the ASCII race gets a scanline that is not painted on the hull.

- Measure: pixels outside the race's mask are unchanged by the pass, to the byte; inside, the
  effect's own gate (badTvWgsl) holds.
- Twin: the CPU field sampler already in strengthField-selfcheck.

### 6. The rig answers, and speed becomes a number

Every level since 11 has closed with "SPEED, until the rig answers." Level 17 makes the rig's
answer a gate: gpu-rig-check.html grows a timing table (frame time per scene per route, GPU-driven
against the CPU twin, at the universe's 6,211 bodies and at ten times that), the rig writes it to
tools/ship/rig-timing.json, and the sandbox gate reads that file and refuses a claim about speed
that the rig has not signed. Until the file exists the gate says RIG-PENDING, as today.

- Measure: a table, not an adjective. The first honest number is the one this tree has never had.

## What Level 17 does NOT need

- The brain as a trader (Level 16) -- a race policy is a fixed policy; learning is 16's question.
- Two browsers (Level 16) -- one person in one ship is one browser.
- Any new shader language work -- every look is already in both languages.

## The dependency line

16's persistence and history replay come first, because 17's races-that-act and the person's own
cargo are interventions on a universe, and an intervention that cannot be replayed is a bug report
nobody can reproduce. Items 2, 4 and 6 depend on nothing in 16 and could be pulled forward if 16
stalls; item 5 depends only on the device gaining a render-attachment texture.

## What a person would notice

Ships that face where they are going. A race that empties a market and another that refills it.
Their own ship, with their own hull, landing at a repository and buying its binaries. A ridge
that has a file name. And a number for how fast any of it is.
