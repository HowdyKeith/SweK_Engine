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
