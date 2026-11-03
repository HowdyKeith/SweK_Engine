# The spinning body: do box3d and Jolt rotate a free body by Euler's equations? -- registered before any code (WIP note, UNNUMBERED)

Keith chose it on 2026-11-03 ("Do the box3d/Jolt angular velocity and also the spinning body"). This note belongs to
the chat that wrote it.

> **A free rigid body with three different moments, spun about its middle axis, is unstable: a small wobble grows
> as exp(sigma t), with sigma fixed by the moments and the spin. Do the engine's two physics backends, box3d and
> Jolt, grow it at that rate -- the way the engine's own 6-DOF physics does -- or not at all?**

## What is already known, and what is not

- **`physics/mechanics/freeRotation.mjs` (v3562) is the answer key.** It holds Euler's equations, and it found that
  the sharp key is the growth RATE about the intermediate axis. A solver that drops the gyroscopic term keeps the
  angular velocity constant, so it conserves energy and angular momentum perfectly and never flips. Only the rate
  tells it apart.
- **`physics/mechanics/rigidBody6dof.mjs`, the ships' own physics,** is that answer key's RK4 with torque added.
- **`tools/roundhouse/backendRotation.mjs` (v3564) asked box3d, through orientation alone.** At a spin of 2 rad/s the
  spin axis of a 1 x 2 x 3 block reversed, so the term is present in some form.
- **v3564 could not ask about the rate,** for two reasons:
  - The shim gives every box an angular damping of 0.05/s, and no export can set it to zero. Damped rotation is not
    torque-free.
  - Neither backend reports angular velocity: `readVelocities()` is linear only.
- **Jolt has never been asked.** Its gyroscopic force is an opt-in (`mApplyGyroscopicForce`), off by default, and
  the engine's wrapper never sets it.
- **Read in box3d v0.1.0's source:** `solver.c` always applies the gyroscopic torque, implicitly (backward Euler in
  body coordinates, one Newton step a substep). There is no flag.

## To be built first: angular velocity, for both backends

- **box3d:** four shim exports, then a rebuild of `vendor/box3d/box3d.wasm` with
  `physics/box3d/build-box3d-wasm-clang.sh`:
  - the angular velocity of every body;
  - setting a body's angular velocity;
  - setting a body's linear and angular damping;
  - a body's moments of inertia, as box3d computed them (C-inertia reads them).
  The rebuild also brings in the four collision-filter functions `box3dNode.mjs` lists as pending.
- **Jolt:** the wrapper only, through calls its binding already has:
  - the angular velocity of every body;
  - setting a body's angular velocity;
  - the gyroscopic opt-in, as an option on `addBox`. It stays off by default, so no caller's behaviour changes.
- **Both loaders answer `supportsAngular()`,** and the conformance checker exercises the angular calls on a backend
  that says yes.
- **Angular velocity is read in the world frame,** as both engines report it, and turned into the body frame by the
  body's own quaternion.

## The body, the spin and the window

- **The body is v3564's:** half-extents 0.5 x 1.0 x 1.5, density 1, mass 6, moments 6.5 / 5 / 2.5. The
  intermediate axis is y. Zero gravity, zero linear and angular damping, starting at the origin with no rotation.
- **The spin:** angular velocity (0, 2, 2e-5) rad/s, set directly. That is 2 rad/s about y with a wobble of 1e-5 of
  it about z.
- **The prediction, from the linearisation and never fitted:** sigma = 0.960769/s. freeRotation's own key, at
  dt = 1e-3, measures 0.960757.
- **The window is 30 s** at the step each engine's pages use: 1/60 s, which box3d splits into 4 substeps and Jolt
  takes in one.
- **The wobble is the body-frame angular velocity off the middle axis,** the length of its x and z parts, read after
  every step.

## The four configurations, and the reading of each

- **C1:** box3d, undamped.
- **C2:** Jolt as the engine's wrapper makes a body, undamped: the gyroscopic force off, Jolt's own default.
- **C3:** Jolt with the gyroscopic opt-in on, undamped.
- **C4:** the engine's own physics, `rigidBody6dof.step()`, with zero torque at the same 1/60 s.

**Each configuration reads one of three ways, by these rules:**
- **"Euler's equations":** all of these hold:
  - the wobble passes 5% of the spin inside the window;
  - a straight line fitted to its logarithm has r^2 of at least 0.999 over at least 20 points. The fit runs from ten
    times its starting size to 5% of the spin: a decade of transient is skipped, as freeRotation's fit does;
  - the fitted rate is within 10% of 0.960769/s.
- **"No gyroscopic term":** the wobble never grows past ten times its starting size in the 30 s.
- **"Something else":** neither of the above.

## Controls

- **C-key:** freeRotation's own fit at dt = 1e-3 measures the predicted rate to 1e-4. The instrument can see the
  effect: v3564's lesson, a null from an instrument nobody showed could see is worth nothing.
- **C-inertia:** each engine's body has the registered moments, as the engine itself reports them, to 1e-3.
  Otherwise that engine's reading is not made.
- **C-undamped:** a body spun exactly about its largest axis keeps its rate to 1e-4 over the 30 s, in each of C1 to
  C3. The shim's 0.05/s damping would lose 78% of it.
- **C-determinism:** each configuration run twice gives the same numbers to the bit.
- **C-rebuild:** the rebuilt box3d.wasm flies a fixed battery of scenes (falling, stacked and jointed bodies) to the
  same state hashes as the artifact it replaces. If it does not, that is reported in full before anything else.

## Reported, testing nothing

- The fitted rate, r^2 and point count of each configuration, and its time to reach 5%.
- Flips: the sign changes of the body-frame spin about y in the 30 s.
- The drift of rotational energy and of the angular momentum's length in the body frame, and of the angular
  momentum vector in the world frame.
- The same four configurations at a step of 1/240 s, to show whether each rate moves toward the prediction as the
  step shrinks.
- Spins about the largest and the smallest axes, with the same wobble: their largest growth over the window.

## Predictions, fixed now, deciding nothing

- **P1: C1 (box3d) reads "Euler's equations"** (85%). Its solver carries the term, and v3564 saw it flip.
- **P2: C2 (Jolt as wrapped) reads "No gyroscopic term"** (90%). The opt-in is off.
- **P3: C3 (Jolt with the opt-in) reads "Euler's equations"** (70%).
- **P4: C4 (the engine's own physics) reads "Euler's equations"** (97%).
- **P5: box3d's rotational energy falls by more than 1% over the 30 s** (50%). Backward Euler on the gyroscopic term
  dissipates.

## What was seen first

The rate above, from freeRotation alone. No backend has been asked anything about this body's rotation since v3564.
The toolchain for the rebuild (wasi-libc, clang's wasm32 builtins, binaryen) was installed in this container from
the Ubuntu archive, and box3d v0.1.0 (commit 8441b4a) was cloned and its source read.

## Cost

Seconds. 1,800 steps of one body, in four configurations at two steps, and the controls.

## What each outcome buys

Nothing is changed by the reading: no page, no default, no ship.
- **box3d reads "Euler's equations":** a ship flown on box3d would rotate as it does in the engine's own physics. The
  6-DOF ships could run on box3d without changing how they turn; doing that is a round of its own.
- **Jolt as wrapped reads "No gyroscopic term":** a ship on Jolt would need the opt-in. Whether the wrapper's default
  changes is asked separately, since it changes every Jolt body in the engine.
- This note authorises no further round.

## To be built

- `tools/roundhouse/spinningBody.mjs` (the library), `tools/roundhouse/spinningBodyRun.mjs` (the command) and
  `tools/roundhouse/spinningBody-selfcheck.mjs` (the gate).
- The results go to `physics/mechanics/spinningBodyResults.json`, committed before it is read.

## Built, 2026-11-03, before the registered run (nothing of the registration above is changed)

**Angular velocity, for both backends.**
- **box3d:** four shim exports (`swk_ang_velocities`, `swk_body_set_ang_velocity`, `swk_body_set_damping`,
  `swk_body_inertia`), and `vendor/box3d/box3d.wasm` rebuilt by `build-box3d-wasm-clang.sh` from v0.1.0 in this
  container.
  - The new artifact is 830,021 bytes with 81 `swk_*` exports, against the old one's 829,117 and 77. The four new
    names are the only difference in the export surface.
  - **C-rebuild holds:** a battery of five scenes flies to the same state hashes on both artifacts.
  - The emcc script's hand-kept export list gained the four names (`box3dFilter-selfcheck` went red naming them), and
    `vendor/box3d/PROVENANCE.md` records the rebuild.
- **box3d's loader:** `supportsAngular()`, `readAngularVelocities()`, `setAngularVelocity()`, `setDamping()` and
  `inertia()`. Each answers honestly on an artifact that predates it.
- **Jolt's wrapper:** the same five, through calls its binding already had, and `gyroscopic` on `addBox`. It is off
  by default, so every existing caller's body is created exactly as before.
- **The conformance contract's fourteenth call, `supportsAngular()`.** The two stand-ins answer false. A world that
  answers true must report the angular velocity it was given and turn the body about it. Two new lying worlds show the
  checker catching both, and real box3d conforms on all 18 checks.
- **Both engines report angular velocity in the world frame,** told apart in the gate by how the orientation turns.

**Rows that recorded the gap, updated in the same commit.** Each went red when the gap closed, which is what it was
for; each now says so in a dated note.
- `freeRotation-selfcheck` (2): the contract has no angular call; neither backend reports w.
- `backendRotation-selfcheck`: no export can turn box3d's damping off.
- `rigidCouple-selfcheck`: box3d exports no inertia. It now does, and the row became a direct cross-check: the
  solid-box formula's moments are box3d's own, to 1e-7.
- `blobSpace-selfcheck` and `backendConformance-selfcheck`: the contract is fourteen calls, not thirteen.
- `box3dConformance-selfcheck`: its adapter mirrors the loader's new calls.
- `orrery-fleet.json` was re-baked: three of box3d's and Jolt's importers grew.

**The round:** `tools/roundhouse/spinningBody.mjs` (the library), `tools/roundhouse/spinningBodyRun.mjs` (the
command) and `tools/roundhouse/spinningBody-selfcheck.mjs` (the gate: 31 rows, under a second).
- Each engine is reached through its own loader, never `selectBackend()`'s silent fallback, and its `backendId()` is
  checked.
- The gate never spins a backend about the intermediate axis. Its miniature of the whole round spins about the stable
  largest axis.
- **Disclosed:** while building the miniature, its 2-second stable spins showed the wobble about the smallest axis
  oscillating in C1, C3 and C4 and staying constant in C2. That is gyroscopic coupling present or absent, which the
  registration already expected from the source. Nothing of the rate was seen.

**Found while building, before the sabotages:**
- **A detached view.** In box3d a first `readTransforms()` mallocs its buffer, and a malloc that grows the memory
  detaches every heap view taken before it. The angular velocity is copied out first.
- **The first frame test broke the gate's own rule.** It turned the body so world x lay along its intermediate axis.
  It now lies along the smallest.
- **Rows that could not have gone red,** found while designing the sabotages and fixed before them:
  - the opt-in dropped on C3's body: the results now carry the flag Jolt reports;
  - the body-frame turning skipped: held against the engine's raw reading after a turn where the two frames differ;
  - C-key's tolerance: the control is now handed a mismatched prediction;
  - C-determinism: the comparison is `sameTrace()`, held directly;
  - the results file's format: it checks the arrays sit on one line;
  - the real loaders' `supportsAngular()`: now asked.
- **Two made-up edges sat exactly on the boundary.** A fit of 1.1 times the prediction is 0.10000000000000009 off, and
  float32's 0.4 is 0.40000000596.

**Sabotaged with the byte-safe runner: 34 designs, each red by name** (the counts are in the gate's header). Three went
0 red on the first run, and each was fixed and run again:
- **G25, the command accepting any option.** The row looked for an exit within 200 characters of the option check, and
  the refusal's own exit two lines down stood in for the deleted one. It now demands each exit directly after its refusal.
- **G32, the checker's angular readback blinded.** Both lying worlds were planar, so the turning check caught them
  anyway. `box3dConformance-selfcheck` now hands the checker real box3d turning a body while it reports zeros.
- **G34, the planar stand-in claiming angular velocity.** The checker crashed on a world claiming the calls without
  having them, and a crash prints no FAIL line, so nothing was counted. It now reports the missing calls as a failed
  check and survives a throw.

**The registered run:** `node tools/roundhouse/spinningBodyRun.mjs`.

## The verdict, 2026-11-03 (read from the committed file, after it was committed)

The registered run wrote `physics/mechanics/spinningBodyResults.json` at head 5fed473f in about a second. It was
committed byte for byte at a1f0c4b5 before anyone read it (5,868 bytes, sha256 d0a873a8). It flew the registered spin
and says so (`registered: true`). Every number below is re-derived from that file in section 6 of
`tools/roundhouse/spinningBody-selfcheck.mjs`, and the whole round is flown again there and held against the file.

**The controls held.**
- **C-key:** freeRotation's own fit measured 0.960757/s against the predicted 0.960769 (-1.2e-5, inside 1e-4), with
  r^2 0.9999999994 over 719 points.
- **C-rebuild:** the battery's 5 scenes flew to the old artifact's state hashes.
- **C-inertia:** box3d reported the moments 6.5 / 5 / 2.5 exactly, and Jolt the same to 1e-7, with nothing off the
  diagonal.
- **C-undamped:** a spin exactly about the largest axis kept its rate exactly over the 30 s, in C1 to C3.
- **C-determinism:** each configuration flew twice to the bit, 1,800 steps.

**The reading: box3d, Jolt with the opt-in and the engine's own physics grow the wobble at Euler's rate. Jolt, as the
engine's wrapper makes a body, does not grow it at all.**

| configuration | the engine's gyroscopic flag | rate at 1/60 s | off the prediction | r^2 | points | 5% reached | largest growth | rate at 1/240 s | reading |
|---|---|---|---|---|---|---|---|---|---|
| C1 box3d | no flag | 0.962626 | +0.193% | 0.999999995 | 387 | 9.32 s | 110,723 | 0.961280 (+0.053%) | Euler's equations |
| C2 Jolt as wrapped | off | -- | -- | -- | 0 | never | 1.0000093 | -- (largest 1.0000297) | No gyroscopic term |
| C3 Jolt with the opt-in | on | 0.953074 | -0.801% | 0.999999996 | 392 | 9.42 s | 110,937 | 0.958769 (-0.208%) | Euler's equations |
| C4 the engine's own | no flag | 0.960681 | -0.009% | 0.999999995 | 388 | 9.33 s | 110,937 | 0.960681 (-0.009%) | Euler's equations |

- **Every reading is the same at 1/240 s.** There box3d's rate and Jolt's with the opt-in move toward the
  prediction, and the engine's own stays where it was, to 1e-7.
- **C2 is the dropped term, exactly as freeRotation described it.** Its wobble never grew: the largest was 1.0000093
  of its start. Its spin never flipped, and its energy and body-frame angular momentum held to 1e-14. The three that
  read Euler's equations flipped 2, 1 and 1 times.

**Reported, testing nothing** (drifts are the largest relative change over the 30 s; the stable spins give the
largest growth of the same wobble about the other two axes):

| configuration | flips | energy change | energy drift | body-frame momentum drift | world-frame momentum drift | stable spin, largest axis | stable spin, smallest axis |
|---|---|---|---|---|---|---|---|
| C1 box3d | 2 | -1.3e-2 | 1.3e-2 | 6.5e-3 | 6.9e-3 | 1.0000 | 1.4370 |
| C2 Jolt as wrapped | 0 | -7.1e-16 | 1.2e-15 | 8.9e-16 | 1.0e-5 | 1.0000 | 1.0000 |
| C3 Jolt with the opt-in | 1 | 3.5e-4 | 3.5e-4 | 1.8e-4 | 8.0e-3 | 1.6032 | 1.9566 |
| C4 the engine's own | 1 | -3.5e-11 | 3.8e-10 | 1.9e-10 | 8.0e-3 | 1.0000 | 1.4422 |

- **The world-frame momentum cannot show whether the term is there, at this wobble.** Dropping the term moves it by
  1.0e-5, the size of the wobble itself. The three that keep the term move it by 6.9e-3 to 8.0e-3.
- **The stable spins.** In Euler's equations this wobble never grows past its start about the largest axis, and
  reaches at most 1.4422 of it about the smallest. Box3d and the engine's own physics stay inside both. Jolt with the
  opt-in goes past them, to 1.6032 and 1.9566. Jolt as wrapped holds both at 1.0000.

**The predictions:**
- **P1: right.** C1 (box3d) reads Euler's equations; I gave it 85%.
- **P2: right.** C2 (Jolt as wrapped) reads No gyroscopic term; 90%.
- **P3: right.** C3 (Jolt with the opt-in) reads Euler's equations; 70%.
- **P4: right.** C4 (the engine's own physics) reads Euler's equations; 97%.
- **P5: right.** Box3d's rotational energy fell 1.30% over the 30 s, more than the 1% I gave even odds.

**After the read: what the step does.** This is not registered and tests nothing; section 6 holds it. The three
configurations that keep the term were flown again at 1/240 s, for their invariants, and at 1/960 s:

| configuration | rate off the prediction at 1/60, 1/240 and 1/960 s | energy change | energy drift | world-frame momentum drift |
|---|---|---|---|---|
| C1 box3d | +0.193%, +0.053%, +0.057% | -1.3e-2, 8.2e-3, 5.6e-2 | 1.3e-2, 9.2e-3, 5.6e-2 | 6.9e-3, 4.6e-3, 2.8e-2 |
| C3 Jolt with the opt-in | -0.801%, -0.208%, -0.054% | 3.5e-4, 1.3e-3, 4.3e-3 | 3.5e-4, 1.3e-3, 4.3e-3 | 8.0e-3, 3.0e-3, 2.3e-3 |
| C4 the engine's own | -0.009%, -0.009%, -0.009% | -3.5e-11, -3.9e-14, 2.8e-15 | 3.8e-10, 1.4e-12, 1.5e-14 | 8.0e-3, 2.0e-3, 5.0e-4 |

- **The engine's own physics: its spin is right to fourth order, its orientation to first.**
  - Its rate is the same at every step, so the -0.009% left over is the fit's, not the step's.
  - Its energy error falls as the fourth power of the step until rounding stops it. It is RK4 on the angular
    velocity.
  - Its world-frame momentum's drift falls only as the first power. `freeRotation.stepQuat()`, which
    `rigidBody6dof.step()` reuses, moves the orientation by one forward step.
- **Jolt's opt-in behaves as an explicit step.**
  - Against the engine's own physics at the same step, which takes the fit's share off, its rate is off by -0.792%,
    -0.199% and -0.045%. An explicit step's ln(1 + sigma h)/(sigma h) - 1 is -0.792%, -0.200% and -0.050%.
  - On the stable axes, an explicit step grows the wobble by (1 + (Omega h)^2)^(N/2). Over the 1,800 steps that gives
    1.62 and 1.96, against the 1.60 and 1.96 measured.
- **Box3d matches backward Euler only at the pages' step.**
  - Against the engine's own physics, its rate is off by +0.203% at 1/60 s. Backward Euler on its 1/240 s substep
    gives +0.201%.
  - Then it stops shrinking: +0.062% at 1/240 s and +0.066% at 1/960 s, where that term gives +0.050% and +0.013%.
  - Its energy, which fell at the pages' step, rises at the finer ones: +0.825% at 1/240 s and +5.602% at 1/960 s.
    P5 held at the pages' step and not below it. The cause is not measured.
- **Jolt's energy change grows as the step shrinks:** 3.5e-4, 1.3e-3 and 4.3e-3, roughly in proportion to the
  number of steps. The cause is not measured.

**What this says, and what it does not.**
- **It says:** box3d integrates a free body by Euler's equations, within 0.2% of the rate at the pages' step. A ship
  flown on box3d would turn as it does in the engine's own physics. Running the 6-DOF ships on box3d is a round of
  its own.
- **It says:** Jolt, as the engine's wrapper makes a body, has no gyroscopic term. A free body there keeps the
  angular velocity it was given: it never precesses or flips. With the opt-in, Jolt follows Euler's equations to
  within 0.8% of the rate.
- **It does not say** anything about contact, joints, damping or applied torque: the body was free, undamped and
  torque-free. Nor does it cover other shapes, spins or wobbles, or how any page's bodies move: none was flown.

**What follows.**
- Nothing is changed: no page, no default.
- **Asked separately, as the registration said:** whether Jolt's wrapper should turn the opt-in on by default. That
  changes every Jolt body in the engine, and the opt-in's explicit step grows a stable spin's wobble.
- The engine's own orientation step is first order. That is a candidate for a round of its own; this note authorises
  none.

**The verdict, as code:** section 6 of `tools/roundhouse/spinningBody-selfcheck.mjs` re-derives every number above
from the committed file. It flies the whole round again and holds it against the file, and it holds the study made
after the read. Sabotaged with the byte-safe runner: 22 designs, each red by name. They edit the committed file,
this note or the code, and the counts are in the gate's header. Every row of section 6 went red under at least one.
One design missed its target and was replaced:
- **V21** edited freeRotation's RK4, meaning to break the engine's own spin. But `rigidBody6dof.step()` carries its own
  RK4, so V21 broke C-key's answer key instead, and C-key went red, rightly.
- **V22** edits the engine's own, and the study's fourth-order row goes red by name.
