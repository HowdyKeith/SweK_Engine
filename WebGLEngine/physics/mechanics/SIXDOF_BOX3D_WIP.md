# The 6-DOF ships on box3d -- Keith's pick, registered before any code (2026-11-04)

Keith, 2026-11-04: "Continue 6-DOF-on-box3d work", the second leftover of the spinning-body work ("the engine's own
first-order orientation step, and the 6-DOF ships on box3d"). The spinning body (`physics/mechanics/SPINNING_BODY_WIP.md`)
found that box3d integrates a free body by Euler's equations, within 0.2% of the rate at the pages' step, and said:
"A ship flown on box3d would turn as it does in the engine's own physics. Running the 6-DOF ships on box3d is a round
of its own." That was a free, torque-free box. A ship is driven: thrust and torque every tick, from a pilot who
answers to where the ship points.

> **Flown on box3d, does a 6-DOF ship turn as it does in the engine's own physics, and does it fight the same?**

"The engine's own physics" is `rigidBody6dof.step()` as it now is: RK4 on the angular velocity and, since Keith's
decision the same day, RK4 on the orientation too (`physics/mechanics/ORIENTATION_STEP_WIP.md`).

### The ship on box3d (B3)

- A box3d body: the vendored wasm (`physics/box3d/box3dLoader.js`), adopted in node through
  `physics/backendNode.mjs`. It is a box of the hull's half-extents (1.6 x 0.7 x 0.7) and the ship's mass (8, so a
  density of 8 / 6.272).
  - It is alone in its world, because box3d's shim keeps one world at a time.
  - It has no gravity, and its damping is set to zero (the shim's default is 0.05).
  - It is stepped at the duel's 1/30 s, with box3d's own four substeps, the loader's default.
- A stepper with `rigidBody6dof.step()`'s contract: `step(state, acc, dt)` returns the next state. Each tick it:
  - sets the box3d body to `state`: position, orientation, velocity, and the angular velocity turned into the world
    frame;
  - gives it the tick's body-frame force and torque as impulses, each turned into the world frame by the orientation
    at the start of the tick and multiplied by 1/30 s;
  - steps box3d once and reads the body back, with the angular velocity turned into the body frame.
  - box3d holds its state in float32, so B3's state is float32's.
- In the duel, A only: `duel()` takes `stepA`, a stepper used for A in place of `rigidBody6dof.step()`, and B stays on
  the engine's own. It is off unless given. With collisions off, which is the duel's default, A's box3d body is alone,
  so box3d's contacts play no part.

### What is measured, in one registered run

- **M1, a ship's turn, open loop:** the inputs ship A was given in duels of the PD autopilot against itself, flown
  with the engine's own physics, through the duel's `record`. 20 duels: seeds 93001 to 93010 of each scenario, the
  standoff and the joust.
  - Each is replayed from A's start on B3, on the engine's own (E, RK4) and on the first-order step (Q0), against a
    reference: E at 1/1920 s with the same inputs.
  - The readings: the largest angle from the reference over each duel, and the largest difference in angular velocity
    from the reference, as a fraction of the ship's peak spin in that duel.
- **M2, the fights:** each of the five pilots on `es-box3d-6dof.html`'s Load Pilots panel flies as A against the PD
  autopilot as B, with B on the engine's own.
  - The pilots are the PD autopilot, the fruit fly's Default, League and close-quarters pilots, and the GPU Brain's.
    Each is held to its weights' hash: 215e26d9, 32789ff9, 360580a7, 0ffd8554.
  - 40 fresh seeds of each scenario: 93001 to 93040.
  - Each duel is flown three times: A on the engine's own (E); A on B3; and A on the engine's own with its start moved
    1e-9 m in y (E'), the chaos control.
  - A duel's outcome is read from A's side, as the orientation-step round reads it: a win, a loss or a draw.
  - The reading, per pilot and scenario: B3 against E, seed by seed, by an exact two-sided sign test on better
    against worse, with ties set aside. At p < 0.01, B3 **changes how that pilot fights**, and the direction is named.
    Otherwise it **changes nothing a sign test can see**. There are 10 readings.
  - Reported beside each: the outcomes B3 changed, the outcomes the nudge changed, and the tallies.
- **Reported, testing nothing, and not in the results file:** B3's step time.

### Controls

- **C-unchanged:** given no stepper, the duel is byte for byte what it was. These anchors were taken at 42845879,
  before any of this round's code, with nothing carrying a setting:
  - ten duels, each pilot as A against the PD autopilot, seed 93100 (which nothing else here flies). Standoff: the PD
    autopilot 4cb171ec, the Default 5419443e, the League 45b81ea9, the close-quarters fe6ba4e8, the GPU Brain ead22878.
    Joust: d52064d9, a411ddf3, 9527e83b, 126221b7 and 764e4d2c.
  - the orientation-step round's 1,000 steps (its library's `stepDigest()`) under the default: 5ba918e7cde707f7.
- **C-box3d:** it is box3d that is flown: adopted from the vendored wasm, its worlds say box3d, they read and set
  spin, and the ship's damping reads back zero.
- **C-inertia:** box3d's moments of the hull box are `boxInertia()`'s for mass 8 and those half-extents, to 1e-5
  relative.
- **C-impulse:** a B3 ship at rest, turned 90 degrees about z, given one tick of a body-frame torque, spins at
  I^-1 torque x 1/30 s in the body frame, to 1e-4 relative. Given one tick of a body-frame force along x, it moves
  along the world direction its nose points, at force x 1/30 s / 8, to 1e-4 relative.
- **C-free:** a B3 ship with no input, moving at 1 m/s and spinning at 2 rad/s about its symmetry axis (x), keeps
  that spin and that velocity to 1e-4 over 30 s.
- **C-awake:** a B3 ship coasting at 0.01 m/s, with no spin and no input, still moves at 0.01 m/s after 10 s. box3d
  does not put it to sleep.
- **C-replay:** each M1 record, replayed on the engine's own at 1/30 s, lands on the duel's own A, to the bit.
- **C-chaos:** E' against E, by the same sign test, changes no pilot in either scenario.
- **C-determinism:** each pilot's first seed of each scenario, flown twice with A on B3, is the same to the bit.

### Predictions, fixed now, deciding nothing

- **P1:** in M1, B3 is farther from the reference than E in every joust, and within a factor of 3 of Q0 in every
  joust (70%). Why: box3d gives the tick's change of spin at its start, a first-order error like Q0's, though of the
  other sign.
- **P2:** in M1, B3's angular velocity stays within 1% of the peak spin of the reference's in every duel (75%).
- **P3:** in M2 the sign test sees no change for any pilot in either scenario (70%).
- **P4:** B3 changes more outcomes than the nudge does, in each scenario (65%).

### What was seen first

- **The spinning body's C1 result**, above.
- **box3d's shim, read and not flown:** it keeps one world at a time; it takes a linear impulse at the centre, an
  angular impulse and an angular velocity, all in the world frame; `setTransform` takes x, y, z, qx, qy, qz, qw; its
  linear speed is capped at 400 m/s; its bodies' damping is 0.05 unless set; it does not configure sleep.
- **C-unchanged's anchors, above.** Only fingerprints were printed. No ship has been flown on box3d.

### What each outcome buys

- **If P3 holds,** the engine's ships could fly on box3d without changing how they fight. That is what a page would
  need in order to let its ships touch box3d's world. Nothing is changed: no page flies its ships on box3d, and this
  note authorises no such page.
- **If a sign test sees a change,** the verdict names the pilot and the direction.
- **If B3 is more than 10 degrees off the reference in a duel, or its spin more than 10% of the peak,** the stepper
  is wrong or box3d turns a driven ship another way. The verdict says which, from the controls.
- This note changes no default and authorises no further round.

### Cost

Minutes.

### To be built

- `physics/mechanics/rigidBody6dofBox3d.mjs`: the stepper.
- `brain/pilot6dofPolicy.mjs`: `duel()` takes `stepA`, off unless given.
- `tools/roundhouse/sixdofBox3d.mjs` (the library), `sixdofBox3dRun.mjs` (the command) and `sixdofBox3d-selfcheck.mjs`
  (the gate).
- The results go to `physics/mechanics/sixdofBox3dResults.json`, committed before it is read.

## Build record (2026-11-04)

Built as listed above. Three things depart from the registration's wording. Each was found while building, by the
registration's own controls, and each is held by the gate.

### Departures from the registration

- **The stepper builds the ship's world for each tick.** C-awake, flown while building, failed on the first stepper,
  which kept one world: box3d put the coasting ship to sleep and zeroed its velocity. The gate holds the finding: in a
  kept world, a ship coasting at 0.01 m/s is zeroed at 0.5 s, and one at 0.06 m/s never is. The shim has no way to
  turn sleep off.
  - Every tick sets the whole state anyway, so the stepper builds the world for the tick and destroys it after. Over
    300 ticks of a thrusting, tumbling ship, that is the same as a kept world to the bit.
  - The ship is still alone in its world, as registered. `keepWorld: true` keeps one world, sleep and all.
  - It costs time: about 22 us a tick, against 12 us for a kept world, measured while building. That is B3's step
    time, which the registration reports outside the results file; the command prints it again.
- **C-box3d reads the damping by its effect.** The shim has no damping getter. Over 1 s the ship keeps its 1 m/s and
  its 1 rad/s about its nose exactly, where a body left at the shim's default keeps 0.9512 of each.
  - The first version read the linear damping alone. The angular half was added while the sabotages were being
    written, because a box3d that kept only its angular damping would have passed it.
- **C-impulse gives one tick of torque about each body axis in turn.** The registration says "one tick of a
  body-frame torque". With the torque (0.3, -0.2, 0.5) on all three axes at once, the spin missed I^-1 torque x 1/30 s
  by 2.2e-4 relative, over the 1e-4 tolerance.
  - That miss is the gyroscopic term: inside the tick, the ship's unequal moments couple the axes. It is physics, not
    the impulse's frame or scale.
  - About one axis at a time, the worst miss is 2.7e-7. The force half is as registered: 1.6e-7.

Beyond the registration, the gate makes **each control fail on a box3d made to tell the lie it guards against**:

| Control | Fails on a box3d that... |
|---|---|
| C-box3d | keeps its linear damping; keeps its angular damping; says it is Jolt; cannot spin |
| C-free | keeps its linear damping (by its speed half); keeps its angular damping (by its spin half) |
| C-inertia | has moments 0.1% off |
| C-impulse | gives an angular impulse 1% short; gives a linear one 1% short |
| C-awake | puts a slow body to sleep at once |
| C-determinism | adds noise to each tick |

C-chaos's predicate is tested on made-up cells. None of this changes a measurement.

### Also changed

- **`brain/pilot6dofPolicy.mjs`:** `duel()` takes `stepA`, off unless given. C-unchanged holds its ten anchors and
  the digest.
  - The comment above `duel()` still called "euler" the step's default, which it stopped being at 42845879. It now
    says what the default is.
- **`tools/roundhouse/orientationStep-selfcheck.mjs`:** one row read the duel's signature from its source. It went red
  once `stepA` followed the orientation round's three options, and was restated to accept `stepA` after them.

### Flown while building, none of it on a registered seed

- **The controls**, which the registration fixes:
  - C-inertia: 2.613333, 8.133333, 8.133333.
  - C-impulse: 2.7e-7 and 1.6e-7.
  - C-free: 0 and 0.
  - C-awake: 0.0100000 m/s.
  - C-box3d: as above.
  - C-unchanged: its anchors hold.
- **The key.** From rest, a constant torque about the symmetry axis for 1 s spins the ship at alpha t, and turns it
  0.098852 rad, against the exact 0.095663.
  - The lead, 0.003189, is alpha h t / 2: the first-order lead of giving each tick's change at its start.
  - That is the mechanism P1 names. The registered M1 measures it on driven ships.
- **The spin's frame.** A ship turned 90 degrees about z and spinning about its nose lands, after one free tick,
  1.5e-6 rad from the exact turn about world y. With 1 substep instead of 4, a tumbling ship's 30 ticks end
  6.52e-4 rad away.
- **The miniature:** two pilots, seeds 94001 and 94002, a 1e-3 m nudge.
  - Its M1 angles for seed 94001 were printed. Standoff: E 4.6e-15, Q0 5.407e-4, **B3 5.407e-4**. Joust: E 2.7e-8 and
    Q0 0.041.
  - B3's joust angle was not printed. No M2 outcome or tally was printed.
- **A duel on box3d.** With box3d as A's stepper, a duel of the PD autopilot against itself (seed 94003, joust) has
  the fingerprint 96c190bd, against ac4a1c46 on the engine's own.

### The gate

`tools/roundhouse/sixdofBox3d-selfcheck.mjs` has 36 rows and takes about 2 s. The 48 sabotages logged in its header
each went red by name.

Before they ran, the gate's first version was read against the list. None of its rows could see 21 of them (G18 only
by its source row). Rows or checks were written for those 21 first.

## The verdict, 2026-11-04

Read from `physics/mechanics/sixdofBox3dResults.json` (138,145 bytes, sha256 0df4a8305ebbcf5c), committed at
5e30b3bb before anyone read it. The run took 10 s, and B3's step time was 8.13 microseconds.

**A ship flown on box3d spins as it does in the engine's own physics, and turns as the engine's old first-order step
did. Four of the five pilots fight the same. The PD autopilot fights worse in the joust.**

**M1, the turn.** Twenty open-loop replays, each against the reference, E at 1/1920 s:

| | the standoffs (10) | the jousts (10) |
|---|---|---|
| ticks | 165 to 207 | 255 to 415 |
| the reference's peak spin | 0.0176 to 0.1536 rad/s | 1.4670 to 2.7595 rad/s |
| E, the engine's own, off the reference | 1.42e-15 to 6.51e-14 rad | 3.13e-9 to 4.71e-8 rad |
| Q0, the first-order step | 2.94e-4 to 2.56e-3 rad | 2.46e-2 to 4.64e-2 rad (1.41 to 2.66 degrees) |
| B3, box3d | 2.94e-4 to 2.56e-3 rad | 2.44e-2 to 4.60e-2 rad (1.40 to 2.63 degrees) |
| B3's angle over Q0's | 1.000 in every duel | 0.991 to 0.995 |
| B3's spin off the reference, over the peak | 8.62e-8 to 1.99e-7 | 9.02e-8 to 8.62e-7 |

- B3's spin is the reference's, to float32's precision.
- B3's orientation is as far off as the first-order step's. box3d gives each tick's change of spin at its start: the
  lead the gate's key measures, alpha h t / 2.
- E's and Q0's spins are the same to the bit, at most 3.64e-14 of the peak, because Q0 changes only the orientation
  step.

**M2, the fights.** Each pilot flies as A against the PD autopilot, over 40 seeds of each scenario. Outcomes are from
A's side, as wins-losses-draws:

| A | scenario | E | B3 | better | worse | p | outcomes the nudge changed | flights the nudge moved |
|---|---|---|---|---|---|---|---|---|
| the PD autopilot | standoff | 0-0-40 | 2-3-35 | 2 | 3 | 1.00 | 0 | 0 |
| the PD autopilot | joust | 1-8-31 | 2-29-9 | 1 | 21 | 1.10e-5 | 0 | 0 |
| the Default | standoff | 40-0-0 | 40-0-0 | 0 | 0 | 1.00 | 0 | 0 |
| the Default | joust | 0-37-3 | 1-37-2 | 1 | 1 | 1.00 | 0 | 4 |
| the League pilot | standoff | 39-0-1 | 39-0-1 | 0 | 0 | 1.00 | 0 | 0 |
| the League pilot | joust | 0-40-0 | 0-40-0 | 0 | 0 | 1.00 | 0 | 20 |
| the close-quarters pilot | standoff | 39-0-1 | 39-0-1 | 0 | 0 | 1.00 | 0 | 0 |
| the close-quarters pilot | joust | 21-11-8 | 26-8-6 | 7 | 2 | 0.180 | 0 | 15 |
| the GPU Brain's pilot | standoff | 27-0-13 | 25-1-14 | 0 | 3 | 0.250 | 0 | 0 |
| the GPU Brain's pilot | joust | 3-31-6 | 3-31-6 | 0 | 0 | 1.00 | 0 | 0 |

- **One of the ten readings sees a change. B3 changes how the PD autopilot fights in the joust: worse for A,** with 1
  better and 21 worse, p = 1.10e-5. The other nine change nothing a sign test can see. The smallest p among them is
  0.180.
- **What changed.** On the engine's own, 31 of the PD autopilot's 40 mirror jousts are draws. Every one is a mutual
  kill: both ships die in the same tick, 250 to 421 ticks in.
  - On box3d, 21 of those 31 are losses for A. In 20 of them the duel ends in the very tick it ended in on E: A still
    dies in that tick, and B does not. A's killing hit has not landed.
  - One becomes a win, and 9 stay draws.
- **B3 changed 41 of the 400 outcomes:** 8 in the standoffs (2 better, 6 worse) and 33 in the jousts (9 better, 24
  worse). It moved all 400 flights. The nudge changed none, and moved 39.

**The predictions:**

- **P1: right.** In every joust, B3 is farther from the reference than E, and within a factor of 3 of Q0: 0.991 to
  0.995 of it.
- **P2: right.** B3's spin stays within 8.62e-7 of the peak in every duel.
- **P3: wrong.** The PD autopilot's joust changes.
- **P4: right.** B3 changed 8 outcomes in the standoffs to the nudge's 0, and 33 to 0 in the jousts.

**The registration's alarm did not ring.** B3 is at most 4.60e-2 rad (2.63 degrees) off the reference, under 10
degrees. Its spin is at most 8.62e-7 of the peak, under 10%. By the registration's rule the stepper is not wrong, and
box3d does not turn a driven ship another way.

**The controls all held:**

- C-unchanged: the step digest 5ba918e7cde707f7 and the ten fingerprints.
- C-box3d: the ship kept 1 m/s and 1 rad/s over 1 s; the default body kept 0.9512 of each.
- C-inertia: 1.33e-7 relative.
- C-impulse: 2.70e-7 and 1.64e-7.
- C-free: 0 and 0.
- C-awake: 2.24e-8.
- C-replay: all 20 records.
- C-chaos: every cell's p is 1.
- C-determinism: 20 flights, each the same twice.

**Why the PD autopilot loses is not measured here.** B3 differs from E in two ways a pilot could feel:

- the angular scheme: box3d turns the ship first-order, by the spin after the tick's torque, which M1 measures;
- float32 state.

*Corrected the same day.* This paragraph first listed three ways, the second "the same lead in position". There is
none. E also turns the tick's force by the start orientation, gives the whole change of velocity at once, and advances
the position by the new velocity, as the stepper has box3d do. The round that asks which of the two costs the PD
autopilot is registered as `physics/mechanics/BOX3D_PD_JOUST_WIP.md`.

For comparison, the orientation round changed both ships' step at once (Q0 to Q4, seeds 91001 to 91040). There the PD
autopilot's joust moved both ways: 8 better and 7 worse, p = 1.00. Here only A changes, and the change runs one way.
Which of the two costs A its killing hit is a round of its own.

**What this buys.** P3 did not hold, so the engine's ships cannot fly on box3d without changing how they fight: the
PD autopilot loses its mirror jousts. The four trained pilots fight the same. Nothing is changed: no page flies its
ships on box3d, and this note authorises no such page and no further round.

**Gated.** Section 6 of `tools/roundhouse/sixdofBox3d-selfcheck.mjs` re-derives every number above from the committed
file, holds this verdict to them, and flies a sample of the round again. Its 18 sabotages each went red by name. The
question the verdict leaves is in the backlog as `sixdof-box3d-pd-joust`.
