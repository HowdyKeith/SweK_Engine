# Ships on the engine's own step, contacts on box3d -- registered before any code (2026-11-04)

Keith, 2026-11-04, after the PD-joust round's verdict: "Step box3d's ships with the engine's own physics and use box3d only
for contacts." It is the fourth of his five items, and the backlog entry `box3d-hybrid-ship-stepper`.

The three box3d rounds before this one measured box3d's integrator. The decision keeps the engine's integrator for the
ships and gives box3d their contacts. This round builds that stepper and tests it with collisions on, against the engine's
own contact model, `brain/shipCollision6dof.mjs`.

> **With the engine's own step flying the ships and box3d resolving their contacts, does a pilot fight as it does with
> the engine's own contact model? And what does each contact model do to the same two ships in the same contact?**

### The hybrid, H

Each tick of a duel with collisions on goes as follows.

1. Both ships are stepped by `rigidBody6dof.step()`, as the plain duel steps them.
2. The tick is a **contact tick** when the engine's own test says the stepped ships overlap. That is the same test, a hit
   with a normal from `rigidBody6dofCollision.mjs`'s `checkContact`, after which `resolveShipCollisions` acts.
3. On a contact tick the step is undone, and the tick is flown again on box3d.
   - The world is a world of its own for the tick, with gravity 0. It holds both ships as boxes of their half-extents
     [1.6, 0.7, 0.7] and mass 8.
   - Damping is 0. Restitution is 0.35 and friction 0.5, the engine's own coefficients.
   - Each ship is set to its state at the tick's start and given the tick's force and torque as impulses, as
     sixdof-box3d's stepper gives them.
   - The world is stepped once with four substeps and read back. So box3d integrates that tick and resolves its contact.
   - The world is then destroyed. Nothing carries from one contact tick to the next, so box3d's warm starting has
     nothing to start from.
4. **Ram damage** is the engine's rule applied to box3d's contact: the normal impulse summed over the pair's manifold
   points, each point once, times 0.3, at most 25. Both ships take it, as they do under the engine's rule.

Off a contact tick, H is the plain duel.

### The flights

Each of the five pilots on `es-box3d-6dof.html`'s Load Pilots panel flies as A against the PD autopilot as B, as in the
three box3d rounds, each pilot held to its weights' hash. Collisions are on, at 1/30 s. There are 100 fresh seeds,
85001 to 85100, of each of the standoff and the joust.

Each duel is flown three ways:

- **E:** the plain duel with collisions on: the engine's own step and the engine's own contact model.
- **H:** the hybrid.
- **E':** E with A's start moved 1e-9 m in y. This is the chaos control.

### The scenes: one contact, outside a duel

Four pairs of ships, each a tick from touching. No force or torque is applied, so only the contact acts. Each scene is
stepped one tick the way each model steps a contact tick:

- **E:** `rigidBody6dof.step()`, then `resolveShipCollisions`.
- **H:** the box3d tick above.

| Scene | A | B |
|---|---|---|
| S1 head-on | at x -1.65, 5 m/s along +x | at x +1.65, 5 m/s along -x |
| S2 off-centre | as S1 | as S1, 0.5 m up in y |
| S3 crossing | as S1 | at x +1.75, 5 m/s along -x, turned 30 degrees about z and 0.3 m up in y |
| S4 spinning | at x -1.65, at rest, spinning 3 rad/s about z | at x +1.65, 5 m/s along -x |

For each scene, under each model, the readings are taken after the tick:

- the pair's linear momentum;
- its angular momentum about the pair's centre of mass;
- its kinetic energy;
- the ships' relative velocity along the contact normal, against what it was before;
- the normal impulse and the ram damage.

### The readings

- In each of the 10 cells (pilot by scenario), H is read against E seed by seed. The test is the exact two-sided sign
  test on better against worse, with ties set aside, at p < 0.01. The outcome, the test and the reading are the
  orientation round's own functions.
- **The round's reading:** at p < 0.01, box3d's contacts **change how that pilot fights**, and the direction is named.
  Otherwise they **change nothing a sign test can see**.
- Reported beside each cell:
  - E's and H's rams, ram ticks and ram hit points;
  - the contact ticks H flew on box3d;
  - the flights H moves.
- For the scenes, each reading under E and under H, side by side.

### Controls

- **C-unchanged:** given no contact resolver, the duel is byte for byte what it was. The anchors are the plain duel's
  fingerprints with collisions on at seed 86005, for the ten pilot and scenario pairs, recorded before `duel()` changes.
- **C-free:** where no contact tick comes, H is E to the bit.
  - Every flight with no contact tick has E's fingerprint, under H.
  - Every flight's first contact tick is the same tick under E and H.
- **C-box3d:** a contact tick is box3d's. Its world holds both ships, with the coefficients set and the damping zero by
  its effect, and box3d reports a contact in it.
- **C-scenes:** every scene starts apart, and the engine's own test finds its ships touching after one step.
- **C-momentum:** in every scene, the pair's linear momentum after the tick is what it was before. That holds to 1e-9,
  relative, under E, and to 1e-5 under H, which holds its state in float32.
- **C-chaos:** E' against E changes nothing a sign test can see, in every cell.
- **C-determinism:** each pilot's first joust seed, flown twice with H, is the same to the bit.

### Predictions, fixed now, deciding nothing

- **P1:** in the standoff, every flight under H is E to the bit, because no contact comes there (90%).
- **P2:** no cell's reading sees a change (60%). A ram comes in 30 to 50% of jousts, and the shots decide most fights.
- **P3:** H moves at least nine in ten of the joust flights that have a contact tick (90%). box3d's contact differs from
  the engine's in its detail: soft contact, speculative contact, and restitution only above 1 m/s. So the states part at
  the first contact tick.
- **P4:** over each joust cell, H's ram hit points are under E's in at least three of the five (55%).
- **P5:** momentum holds through the contact under both models, in every scene (90%).

### What was seen first

- The three box3d rounds' results and verdicts, and Keith's decision.
- **The contacts in duels with collisions on, under E only, on seeds 1 to 40.** These seeds are not registered. Of the
  five pilots' 200 standoff duels, none touched. In the joust, 12 to 20 of each pilot's 40 duels had one ram each.
- No hybrid tick has been flown. `duel()` has no contact resolver yet.
- The seeds 85001 to 85100, and the miniature's 86001 to 86004, were checked against every seed list the 6-DOF rounds
  keep and against every 6-DOF gate's miniature seeds.

### What each outcome buys

- **If H changes nothing a sign test can see,** box3d's contacts cost a pilot nothing in these fights, and the ships can
  be stepped the way Keith decided.
- **If it changes a fight,** the verdict names the pilot and the direction, and the cell's ram readings say how.
- **Either way,** the scenes say what each model does to the same contact.
- This note changes no default and authorises no further round.

### Cost

About a minute.

### To be built

- **`brain/pilot6dofPolicy.mjs`:** `duel()` takes `contacts`, a resolver for the pair's contact tick. It is handed the
  ships after the step, their states and accumulators at the tick's start, and dt. It returns the tick's contacts, as
  `resolveShipCollisions` returns them. It is off unless given, and without it the duel is byte for byte what it was.
- **`physics/mechanics/shipContactBox3d.mjs`:** the hybrid's contact tick on box3d.
- **`tools/roundhouse/box3dHybridShips.mjs`:** the library.
- **`box3dHybridShipsRun.mjs`:** the command.
- **`box3dHybridShips-selfcheck.mjs`:** the gate.
- The results go to `physics/mechanics/box3dHybridShipsResults.json`, committed before they are read.

## Correction, committed before any code (2026-11-04)

**Step 4 of the hybrid is wrong as written, and is corrected here, before any code.** It charges ram damage on "the
normal impulse summed over the pair's manifold points". That is the impulse box3d reports per point, and it is not a
momentum budget. `physics/box3d/box3dLoader.js` says so in its v3586 note, with v3580's measurement: the reported total
was 1.742 times the momentum the contact actually changed at impact, 14 to 30 times while settling, and exactly 2 only
at rest. It sums box3d's solve and relax passes. Charging the engine's rule on it would make H's rams cost more by
bookkeeping, not by physics, and P4 and every cell's ram readings would measure that.

**So, under H, a contact tick's normal impulse is the momentum box3d's contact moved.**

- Take ship A's change of linear momentum over the tick, m (v_after - v_before), less the tick's thrust impulse.
- Take its component along box3d's contact normal, the normal of the manifold box3d reports in that tick's world. If
  box3d reports none, use the engine's own contact normal from the test that made the tick a contact tick.
- Damage is that component's size, times 0.3, at most 25, taken by both ships.

The engine's own model charges the sum of its solver's normal impulses, so the two are the same quantity: the
contact's momentum along its normal.

Nothing else in the registration changes. The correction was found while reading `readContacts()` before writing the
hybrid, after the registration's commit (ffa3623d) and before any of its code. The only things flown in between were
C-unchanged's anchors, recorded from the unchanged `duel()`, and one extra anchor (below).

**One extra anchor for C-unchanged.** None of the ten at seed 86005 rams, so none of them exercises the contact path. One
more anchor is added: the PD autopilot against itself, joust, seed 86010, which rams once over 3 ticks for 21.465 hit
points (fingerprint f314ba5f, 160 ticks). It too was recorded from the unchanged `duel()`.

## A second correction, before the gate and before the run (2026-11-04): the scenes, and C-box3d

**Found while building.** box3d begins a contact only when two bodies are within `B3_SPECULATIVE_DISTANCE` of touching
at the start of its step. That is 4 times its linear slop of 0.005 m, so 0.02 m.

Ships 0.1 m apart and closing at 10 m/s end the tick 0.23 m into each other, and box3d did not see the contact within
it. Two things showed this:
- C-box3d, which found no contact reported in the first tick of S1.
- The scenes under H, where box3d's tick moved no momentum in any of the four.

**What it means for the hybrid, which is unchanged.** The first contact tick of an episode is flown on box3d without a
contact. box3d resolves the contact at the next tick, from overlap. That is how box3d resolves a contact in a world of
its own, for two dynamic bodies at these speeds, so it is box3d's contact, which is what Keith's decision asks for.
C-free's first contact tick is still the engine's test, the same under E and H.

**What changes.**

1. **The scenes are flown for 15 ticks, not one.** Each scene is flown tick by tick, with no force or torque, for 15 ticks
   (0.5 s), under each model:
   - **E:** `rigidBody6dof.step()`, then `resolveShipCollisions`, each tick.
   - **H:** `rigidBody6dof.step()` each tick, a contact tick flown on box3d.

   The readings are taken after the 15 ticks, as registered, with four more:
   - the normal impulse and the damage summed over the 15 ticks;
   - the ticks on which the engine's test found the ships touching;
   - the deepest overlap reached, as the engine's own test measures it;
   - the tick on which the ships were first apart again.
2. **C-box3d asks for its contact report on a pair that already overlaps at the tick's start**, which is S1 one engine step
   on.

**Seen first, said plainly.** The one-tick scenes were flown while building, through `run()` on a miniature, and their
readings were printed:

| Scene | E: normal impulse | E: damage | E: relative normal speed after | E: kinetic energy | H |
|---|---|---|---|---|---|
| S1 | 56.92 | 17.08 | 4.23 m/s | 200 to 49.98 J | moved nothing |
| S2 | 53.54 | 16.06 | 3.39 m/s | 200 to 35.53 J | moved nothing |
| S3 | 53.95 | 16.19 | 3.49 m/s | 200 to 37.34 J | moved nothing |
| S4 | 26.32 | 7.89 | 1.58 m/s | 136.60 to 89.12 J | moved nothing |

E's 15-tick scenes begin with that same first tick, so their readings are partly seen. H's are not.

No duel cell's flight on the registered seeds has been flown. The miniature's seeds were 86001 to 86004.

## Build record (2026-11-04)

Built as listed above, with both corrections.

- **`brain/pilot6dofPolicy.mjs`:** `duel()` takes `contacts`.
  - C-unchanged holds: the ten anchors and the ramming one, to the bit.
  - Three gates read the duel's signature from its source: `tools/roundhouse/box3dBothShips-selfcheck.mjs`,
    `orientationStep-selfcheck.mjs` and `sixdofBox3d-selfcheck.mjs`. Each row went red once `contacts` was added (its regex
    tried on the new source). Each was restated to allow `contacts` after `stepB`, and each row's name now says so.
- **`physics/mechanics/shipContactBox3d.mjs`:** `flyPair()` (the contact tick on box3d), `contactImpulse()` (the momentum
  moved, as the first correction says) and `box3dContacts()` (the resolver).
- **`tools/roundhouse/box3dHybridShips.mjs`**, with its command and its gate.

### Added beyond the note, none of it a measurement

- **A fourth way, E~:** E through the hook, with the engine's own resolver.
  - It is flown in every cell, for C-free's first contact ticks, since the plain duel does not report the tick of its
    first contact.
  - C-free holds it to E to the bit, flight for flight.
- **`readingsOf()`** is its own function, and `cUnchanged()` takes the duel, so that the gate can show each failing (see
  the sabotages).

### Flown while building

None of this is a registered measurement, except the one-tick scenes the second correction lists as seen.

- **Duels on unregistered seeds:**
  - With no contact (the standoff at 86001, the joust at 86002), H is E to the bit.
  - At 86010, E's one ram took 3 ticks and 21.465 hit points (fingerprint f314ba5f, 160 ticks). H's took 1 tick and
    20.756 (0686c5b5, 124 ticks).
  - box3d's own report was 1.74 and 2.1 times the momentum its contact moved, on 86010 and 86001. That is the first
    correction's reason, seen again.
- **The miniature:** seeds 86001 to 86004, a 1e-3 m nudge, and the gate's own scenes M1 and M2.
  - Every control holds.
  - In M1, H's contact lasts 4 ticks and goes 0.76 m deep, against E's 2 ticks and 0.36 m.

### The gate

`tools/roundhouse/box3dHybridShips-selfcheck.mjs`: 36 rows in seven sections, about two seconds. It never flies the
registered seeds or the four registered scenes.

- **Sabotaged 31 times,** and two of those again, through the byte-safe runner. The log is in its header.
- **Two went 0 red and were gaps,** both fixed and run again red:
  - G29, the readings taken from the chaos control;
  - G33, C-unchanged's ram anchor short-circuited.
- **Four more gaps were closed before the first sabotage**, seen in the gate's first draft:
  - that the replay gives the tick's force and torque;
  - that a contact's impulse is the momentum moved;
  - that H moves joust flights in the miniature;
  - that the readings mirror the cells.

## The run and its verdict (2026-11-04)

The registered run was flown at e30f8c21. Its results, `physics/mechanics/box3dHybridShipsResults.json` (842,849 bytes,
sha256 e0f0d8e86e536512), were committed unread at 72be798d and then read. Every reading below is re-derived from the
file by the gate's section 8.

**Every control held.**

- C-unchanged held on eleven anchors.
- C-free held over 1,000 flights, 185 of them with a contact tick: the engine's own resolver through the hook is E to the
  bit, and every first contact tick is the same under E and H.
- C-box3d, C-scenes, C-momentum, C-chaos and C-determinism held.

### The round's answer

**In all ten cells, box3d's contacts change nothing a sign test can see.**

| Cell | Better for A under H | Worse | p |
|---|---|---|---|
| PD autopilot, joust | 1 | 10 | 0.0117 |
| GPU Brain, joust | 4 | 1 | 0.375 |
| close-quarters, joust | 2 | 3 | 1 |
| Default, joust | 0 | 1 | 1 |
| League, joust | 0 | 1 | 1 |
| every standoff | 0 | 0 | 1 |

The PD autopilot's joust is the nearest to the line, leaning worse for A under H, at p 0.0117 against 0.01. By the
registered line it is not a change.

Keith's decision, ships on the engine's own step with box3d for their contacts, costs no pilot anything a sign test can
see in these fights.

### The predictions

- **P1 right.** In the standoff no contact came, and all 500 flights under H are E's to the bit.
- **P2 right.** No cell's reading sees a change.
- **P3 right.** H moved every joust flight with a contact tick, 185 of 185, and none of the 315 without one.
- **P4 wrong.** H's rams cost **more** hit points than E's, in all five joust cells, by 9 to 24%. They do not cost less
  in three of them.
  - The reason is in the contact ticks. box3d meets a contact a tick late, from overlap, so its contacts last longer.
  - Of H's 490 contact ticks in the joust, box3d reported the contact on 312. The rest are first ticks it could not
    see, 0.02 m being its margin.
- **P5 right.** The pair's linear momentum held through every scene: exactly under E, and under H to float32's last
  place (1.2e-7 in S4, the only scene with momentum to keep).

### What the scenes found

| Scene | Depth under H against E | Normal impulse, H against E | Angular momentum change, E | Angular momentum change, H |
|---|---|---|---|---|
| S1 | 2.43 times | 0.986 | 0 to 0.386 | 0.004 |
| S2 | 2.43 times | 1.022 | +1.8% | -2.0% |
| S3 | 2.24 times | 1.011 | +3.1% | -1.9% |
| S4 | 2.65 times | 1.119 | -7.2% | -1.1% |

- **Deeper, about the same impulse.** box3d lets the ships go 2.2 to 2.7 times as deep into each other as the engine's
  model does, and it moves about the same momentum, within 12%.
- **Angular momentum.** box3d's contact changes the pair's angular momentum by 2% at most. The engine's own model gives
  the symmetric head-on S1 an angular momentum of 0.39 from none, and takes 7% of S4's. That is a fact about
  `resolveShipCollisions`, which solves its manifold point by point and corrects position at the deepest point, and it
  is left as it is.

### What this leaves

Nothing for this round. The backlog entry `box3d-hybrid-ship-stepper` is closed by it.

Two things are recorded beside it for Keith, not as rounds:
- box3d's rams cost 9 to 24% more hit points than the engine's, because box3d resolves from overlap.
- The engine's own contact model does not keep the pair's angular momentum.
