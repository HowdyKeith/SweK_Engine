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

## Build record (2026-11-04)

Built as listed above. D ports box3d v0.1.0's own integrator for a lone body: the stepper's calls into box3d, then four
substeps of the gyroscopic Newton step, the speed caps, the position and the first-order rotation, then finalisation.
The tree vendors box3d's headers and not its sources, so the gate tests the port against box3d's behaviour rather than
its text.

### C-model's tumble, as registered, does not hold; the rule is left as registered

Flown while building, since it is a control the registration fixes: over the 10 s tumble at (0.3, 0.2, 0.1) rad/s,
D's spin is 2.15e-4 of its size off box3d's, and its orientation 1.63e-4 rad off. Both are over the 1e-4 tolerance.
E is 1.0e-3 and 2.6e-3 off.

As far as this sandbox can show, that is not a porting error:

- **One tick at a time,** from box3d's own states along that tumble, D is box3d to 1.3e-6 of the spin and 1.8e-7 rad.
- **At high spin** (5 to 9 rad/s, with a torque and a thrust), one tick from the same state lands within about 1e-6
  of box3d's spin, which is float32's level, and within 1.3e-7 rad and 8e-9 m.
- **The key** agrees to 1.5e-8 rad. On an unregistered joust replay (seed 97001), D is 5e-7 rad from box3d where E is
  3.6e-2.
- **The gap grows faster than linearly:** 6e-8 after one tick, 2.3e-6 after 100, 2.15e-4 after 300.
- **The mechanism:** box3d's scheme does not hold the ship's angular momentum. Over the 10 s, box3d drifts it by
  2.27e-3 of itself and D by 2.43e-3, where E holds it to 1.2e-10. Each copy of the scheme drifts along its own path,
  and the differences between float32 and double grow along it.
  - Rounding D's state to float32 after each tick (D32) does not close the gap (2.11e-4). box3d's float32 is in its
    arithmetic, not only in its state.

So the registered tumble cannot tell box3d's scheme in double from box3d's scheme in float32. **The registration's rule
is not changed:** C-model, as registered, decides whether D counts as box3d's scheme, and it is expected to fail.
Beside it, the run records the tumble taken one tick at a time (`okPerTick`), testing nothing. The verdict will report
what the rule gives with C-model as registered, and, separately, what it would give with the one-tick form.

### Also built, beyond the registration

- **Gate rows that test the port,** which are not registered controls:
  - the pieces, each checked as box3d has it: the rotations, the first-order rotation update, Cramer's rule, and the
    Newton step, on the ship and on two bodies with three different moments;
  - the high-spin tick, which also shows that one substep instead of four misses by 1e-2 rad;
  - the caps: a ship set at 500 m/s and 40 rad/s comes out of one tick at 400 m/s and 23.5619 rad/s on both D and box3d.
- **Tolerances.** The high-spin row allows the spin 1e-5, float32's level over a tick's arithmetic (3.9e-7 to 1.0e-6
  was seen on two sets of states). Its orientation and position tolerances are 1e-6.

### Flown while building, none of it a registered measurement

- **The controls:**
  - C-model's key (1.5e-8 rad), its tumble as registered (failing, above), and the one-tick tumble.
  - C-unchanged: the anchors, and sixdof-box3d's 80 committed flights of the PD autopilot's joust on E and on box3d,
    all of which fly again to the bit. No variant other than E and B3 was flown on those seeds.
  - C-box3d, C-float32, C-caps, C-chaos and C-determinism.
- **The miniature:** seeds 97001 to 97006, with a 1e-3 m nudge.
  - Printed: its M1 ratios of D's angle to E's (1.37e-5 and 7.42e-5), its caps (9.3 m/s, 2.5 rad/s), and that box3d
    changed none of its two M3 outcomes.
  - No M2 outcome, tally or reading was printed.

### The gate

`tools/roundhouse/box3dPdJoust-selfcheck.mjs` has 34 rows and takes about 2 s. Its header logs 48 sabotages, each red
by name in the end.

- Reading the gate against the list before any ran found three that no row could see, and rows were written for them
  first.
- Then G3 and G26 went 0 red. Both are findings, and both rows were fixed and re-sabotaged red:
  - G3: on the ship, one component's gyroscopic term is zero, because two of its moments are equal.
  - G26: the reading string already carries p < 0.01.

## The verdict, 2026-11-04

Read from `physics/mechanics/box3dPdJoustResults.json` (82,203 bytes, sha256 30ea91fb8760a5ee), committed at 380e5731
before anyone read it. The run took 3 s.

**box3d's scheme costs the PD autopilot its jousts, and float32 costs it nothing. But the registered rule names
nothing, because C-model failed on its tumble, as the build record said before the run that it would. Read with the
one-tick form of the tumble, the rule names box3d's scheme. Which reading stands is Keith's decision.**

**M2, the fights.** The PD autopilot flies as A against itself, in the joust, over the 100 fresh seeds. Each variant
is read against E:

| A on | wins-losses-draws | better | worse | net | p | reading |
|---|---|---|---|---|---|---|
| E | 3-27-70 | | | | | |
| D | 1-67-32 | 2 | 42 | 40 | 1.13e-10 | changes it: worse for A |
| E32 | 3-27-70 | 0 | 0 | 0 | 1.00 | changes nothing a sign test can see |
| D32 | 1-67-32 | 2 | 42 | 40 | 1.13e-10 | changes it: worse for A |
| B3 | 1-67-32 | 2 | 42 | 40 | 1.13e-10 | changes it: worse for A |
| E' | 3-27-70 | 0 | 0 | 0 | 1.00 | changes nothing a sign test can see |

- **Seed by seed,** D's outcome is box3d's on all 100 seeds, and so is D32's. D32's whole duel is box3d's to the bit
  (the same fingerprint) on 68 of them.
- **E32's outcome is E's on all 100 seeds,** though float32 moved 97 of its 100 flights. The nudge moved none.
- **What changed.** E's 70 draws are all mutual kills, 249 to 443 ticks in. On box3d, 39 of them become A's losses,
  every one in the very tick it ended in on E.
  - The 42 worse: those 39, 2 wins that became losses, and 1 win that became a draw.
  - The 2 better: 1 draw that became a win, and 1 loss that became a draw.

**M1, the model, open loop.** Ten joust replays, 310 to 443 ticks each, with box3d's peak spin 1.157 to 2.407 rad/s.
Each variant is measured against box3d:

| A on | orientation off box3d's | position off box3d's | spin off box3d's, over its peak |
|---|---|---|---|
| E | 1.93e-2 to 4.01e-2 rad | 1.78e-5 to 5.49e-3 m | 1.39e-7 to 8.87e-7 |
| D | 9.71e-7 to 6.18e-6 rad | 1.78e-5 to 1.02e-4 m | 1.39e-7 to 8.87e-7 |
| E32 | 1.93e-2 to 4.01e-2 rad | 1.19e-7 to 5.58e-3 m | 1.16e-7 to 7.91e-7 |
| D32 | 7.43e-7 to 7.12e-6 rad | 1.19e-7 to 1.57e-4 m | 1.16e-7 to 7.91e-7 |

- D's orientation stays within a hundredth of E's distance from box3d in every replay. The worst ratio is 3.16e-4.
- Every variant's spin is box3d's to float32's precision. What separates them is the orientation.

**M3, the seeds of the finding, testing nothing.** box3d changed 22 outcomes at seeds 93001 to 93040. D and D32 each
change all 22 to box3d's outcome, and read there exactly as box3d did: 1 better, 21 worse, p = 1.10e-5. E32 changes
none.

**The rule:**

- B3 replicates: worse for A, p = 1.13e-10.
- D reproduces B3: worse for A at p < 0.01, with a net of 40, all of B3's. E32 does not: it changes nothing. So
  before C-model is asked, the rule names box3d's scheme.
- C-model, as registered, did not hold. Its ratio (3.16e-4) and its key (1.48e-8 rad) held; its tumble did not
  (2.15e-4 and 1.63e-4 rad, against 1e-4). **So by the rule as registered, nothing is named.**
- The build record set the one-tick tumble beside it before the run, testing nothing. That tumble holds (1.29e-6 and
  1.78e-7 rad), so with it C-model holds, and **the rule names box3d's scheme.**

**Why the two readings differ,** from the build record written before the run: the registered tumble cannot tell
box3d's scheme in double from box3d's scheme in float32. The scheme drifts the ship's angular momentum, by 2.27e-3 of
it over the 10 s on box3d, and the two precisions drift apart along it. Everything that bears on the fights says D is
box3d's scheme: M1's orientations, M2's 100 outcomes, and M3's 22.

**The predictions:**

- **P1: right.** B3 replicates on the fresh seeds.
- **P2: right.** D reproduces B3.
- **P3: right.** E32 changes nothing a sign test can see. It changes no outcome at all.
- **P4: wrong.** By the rule as registered, the verdict names nothing. With the one-tick form it would be right.
- **P5: wrong.** C-model's tumble did not hold.
- **P6: right.** D changes all 22 of B3's outcomes to B3's.

**The controls:**

- C-unchanged: sixdof-box3d's ten anchors and its step digest hold. Its 80 committed flights of the PD autopilot's
  joust, on E and on box3d, fly again to the bit.
- C-box3d held.
- C-model did not hold, as above.
- C-float32: E32's and D32's states are float32 in every replay and every flight. E's and D's are not.
- C-caps: B3's ship reached at most 11.95 m/s and 2.73 rad/s over 33,628 ticks, far under box3d's caps.
- C-chaos: E' against E has p = 1.00.
- C-determinism: 12 flights, each the same twice.

**What this buys:**

- **If the rule is read with the one-tick form,** the PD autopilot loses its jousts on box3d because of box3d's
  integration scheme. The scheme gives the tick's torque at the start of the tick and turns the ship first-order.
  Float32 has nothing to do with it.
  - A ship on box3d therefore answers its torque differently from the ship the PD autopilot was tuned on.
  - There are two ways out, each a decision of its own: tune the autopilot for box3d, or step box3d's ships as E
    steps them.
- **If the rule is read as registered,** nothing is named, and the same evidence stands as reported.
- Nothing is changed. No page flies its ships on box3d, and this note authorises no further round.

**Gated.** Section 7 of `tools/roundhouse/box3dPdJoust-selfcheck.mjs` re-derives every number above from the committed
file, holds this verdict to them, and flies a sample of the round again.

## Decided (2026-11-04)

Keith, after the verdict: "Accept one tick reading. and Step box3d's ships with the engine's own physics and use box3d
only for contacts."

- **The one-tick reading stands.** The rule is read with C-model's tumble taken one tick at a time, which the build
  record set before the run. So the verdict names **box3d's scheme** as what costs the PD autopilot its jousts.
  Float32 costs it nothing.
- **box3d's ships will be stepped with the engine's own physics, and box3d used only for contacts.** The PD autopilot
  is not retuned for box3d. Every 6-DOF number in the tree was measured on the engine's own physics, and this keeps
  them all true for ships in a box3d world. The engine's step is also the more accurate of the two.
  - Nothing flies ships on box3d yet. The stepper that does it is built as a round of its own: the backlog's
    `box3d-hybrid-ship-stepper`.
- **Gated.** Section 8 of `tools/roundhouse/box3dPdJoust-selfcheck.mjs` holds the decision: this section quotes it, and
  the rule, read from the committed file with the one-tick form, names box3d's scheme.
