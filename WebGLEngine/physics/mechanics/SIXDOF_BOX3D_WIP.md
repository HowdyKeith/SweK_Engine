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
