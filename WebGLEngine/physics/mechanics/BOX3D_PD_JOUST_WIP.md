# The PD autopilot's jousts on box3d: which part of box3d costs them -- registered before any code (2026-11-04)

Keith, 2026-11-04: "Let's do the sixdof-box3d-pd-joust backlog tests". That backlog entry asks which of box3d's
differences costs the PD autopilot its mirror jousts. `physics/mechanics/SIXDOF_BOX3D_WIP.md`'s verdict found that 21
of the PD autopilot's 31 mutual kills on the engine's own physics become A's losses on box3d (p = 1.10e-5).

> **Which part of box3d costs the PD autopilot its mirror jousts: box3d's integration scheme, or its float32 state?**

### Corrected first: two differences, not three

The sixdof-box3d verdict listed three ways B3 differs from E. The second, "the same lead in position", is not one.

- E's step, `rigidBody6dof.step()`, turns the tick's force by the orientation at the tick's start, gives the whole
  change of velocity at once, and advances the position by the new velocity. That is exactly what the stepper has
  box3d do.
- That note's verdict and the backlog entry are corrected with this registration.

Two differences remain:

- **The angular scheme.**
  - E: RK4 on the spin (Euler's equations, with the torque held for the tick) and RK4 on the orientation.
  - box3d, from v0.1.0's `src/solver.c`, read for this registration: the tick's torque comes as an angular impulse at
    the tick's start. Then, in each of four substeps, two things happen.
    - An implicit gyroscopic step: one Newton iteration on I (w2 - w1) + h w2 x I w2 = 0, in body coordinates.
    - The orientation moves by q2 = normalize(q1 + 0.5 (h w) q1), which is first order.
- **float32.** box3d keeps its state in float32, and does its arithmetic in float32.

### The variants

Each variant is flown as ship A. Ship B stays on the engine's own physics, as in sixdof-box3d.

- **E:** `rigidBody6dof.step()` with its default, RK4.
- **D: box3d's scheme in double precision.** A port, as JavaScript numbers, of the parts of box3d v0.1.0 that move a
  lone body:
  - the shim's impulses, at the tick's start;
  - `b3IntegrateVelocitiesTask`'s gyroscopic Newton step;
  - `b3IntegratePositionsTask`, with its speed caps;
  - `b3IntegrateRotation`;
  - `b3FinalizeBodiesTask`'s normalisation.

  It runs four substeps, with no gravity and no damping.
- **E32:** E, with its state rounded to float32 after every tick.
- **D32:** D, with its state rounded to float32 after every tick.
- **B3:** box3d itself, through sixdof-box3d's stepper.

E, D, E32 and D32 are the two-by-two of scheme and precision. B3 is box3d's scheme in float32 arithmetic throughout.
D32 comes near B3 but does not copy it.

### What is measured, in one registered run

- **M1, the model, open loop.** A's inputs are taken from the PD autopilot's mirror jousts on E, at seeds 95001 to
  95010. Each record is replayed from A's start on E, D, E32, D32 and B3.
  - The readings, over each duel: the largest angle from B3's orientation, the largest distance from B3's position,
    and the largest difference from B3's spin, as a fraction of B3's peak spin.
- **M2, the fights.** The PD autopilot flies as A against the PD autopilot as B, in the joust, over 100 fresh seeds:
  95001 to 95100. Each duel is flown six ways:
  - A on E, D, E32, D32 and B3;
  - A on E with its start moved 1e-9 m in y (E', the chaos control).

  How M2 is read:
  - A duel's outcome is read from A's side as a win, a loss or a draw, as both earlier rounds read it.
  - Each of D, E32, D32, B3 and E' is read against E, seed by seed. The test is the exact two-sided sign test on
    better against worse, with ties set aside, at p < 0.01, as sixdof-box3d read it.
  - Reported beside each: its tallies and its net, which is worse minus better.
- **M3, the seeds of the finding, reported and testing nothing.** Seeds 93001 to 93040, flown with A on D, E32 and
  D32. B3 changed 22 outcomes there; the reading is how many of those each variant changes to B3's outcome.

### The rule, fixed now

- **B3 must replicate.** B3 against E on the fresh seeds must read "worse for A" at p < 0.01. If it does not, the
  finding did not replicate, and no part is named.
- **A variant reproduces B3** when two things hold: it reads "worse for A" against E at p < 0.01, and its net is at
  least half of B3's net.
- **The verdict names:**
  - box3d's scheme, if D reproduces B3 and E32 does not;
  - float32, if E32 reproduces B3 and D does not;
  - either alone, if both do;
  - the two together, if neither does alone but D32 does;
  - something else in box3d, if not even D32 does.
- **D counts as box3d's scheme only if C-model holds.** If C-model fails, nothing is named for the scheme.

### Controls

- **C-unchanged:**
  - Given no stepper, the duel is byte for byte what it was: sixdof-box3d's ten anchor fingerprints at seed 93100,
    and the step digest 5ba918e7cde707f7.
  - sixdof-box3d's committed flights of the PD autopilot's joust fly again to the bit: all 40 seeds (93001 to 93040),
    on E and on B3.
- **C-box3d:** box3d is what is flown. Its worlds say box3d, and the ship's damping is zero by its effect, as in
  sixdof-box3d's C-box3d.
- **C-model: D is box3d's scheme.**
  - In every M1 replay, D's largest angle from B3 is at most a hundredth of E's.
  - A constant torque about the symmetry axis, for 1 s from rest, turns D and B3 the same to 1e-5 rad.
  - A free ship tumbling at (0.3, 0.2, 0.1) rad/s for 10 s tests the gyroscopic step: D's spin follows B3's to 1e-4
    of its size, and D's orientation follows B3's to 1e-4 rad.
- **C-float32:** every state E32 and D32 return has its position, velocity, orientation and spin in float32, to the
  last component. E's and D's states do not.
- **C-caps:** in no registered duel does B3's ship reach box3d's caps: 400 m/s, or 0.25 pi rad a step (23.6 rad/s at
  1/30 s). So the caps D copies never act.
- **C-chaos:** E' against E changes nothing a sign test can see.
- **C-determinism:** each variant's first fresh seed, flown twice, is the same to the bit.

### Predictions, fixed now, deciding nothing

- **P1:** B3 replicates on the fresh seeds (90%).
- **P2:** D reproduces B3 (75%). Why: D turns the ship first-order, the turn sixdof-box3d's M1 measured, so the ship
  answers its torque differently, and the PD autopilot's gains were set on E.
- **P3:** E32 changes nothing a sign test can see (80%). Why: rounding perturbs both ways, like the nudge, which
  changed nothing.
- **P4:** the verdict names box3d's scheme (70%).
- **P5:** C-model holds (85%).
- **P6:** in M3, D changes at least 15 of B3's 22 outcomes to B3's (60%).

### What was seen first

- sixdof-box3d's results, its verdict, and its committed flights at seeds 93001 to 93040.
- box3d v0.1.0's `src/solver.c`, `src/math_internal.h` and `include/box3d/constants.h`. They were read in the clone
  that the spinning-body rebuild left in this sandbox, at commit 8441b4a0, the tag `vendor/box3d/PROVENANCE.md` pins.
- No variant has been flown. No round has flown seeds 95001 to 95100; that was checked against every seed list the
  6-DOF rounds keep.

### What each outcome buys

- **If box3d's scheme is named,** a ship on box3d answers its torque differently from the ship the PD autopilot was
  tuned on. There are two ways out, each a decision of its own: tune the autopilot for box3d, or step box3d's ships
  as E steps them.
- **If float32 is named,** the loss is numerical. A page flying its ships on box3d would see it whatever the scheme.
- **If neither is named,** something else in box3d does it, and only a round of its own can name it.
- This note changes no default and authorises no further round.

### Cost

Seconds.

### To be built

- `physics/mechanics/rigidBody6dofBox3dScheme.mjs`: D, box3d's scheme in double precision, with `step()`'s contract.
- `tools/roundhouse/box3dPdJoust.mjs` (the library), `box3dPdJoustRun.mjs` (the command) and
  `box3dPdJoust-selfcheck.mjs` (the gate).
- The results go to `physics/mechanics/box3dPdJoustResults.json`, committed before it is read.
