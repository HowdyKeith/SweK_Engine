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

## Jolt's gyroscopic force on by default -- Keith's decision, registered before any code (2026-11-03)

Keith, 2026-11-03: "Let's have gyro opt in on by default." The verdict above asked it separately. This is the answer,
and the round that makes the change.

> **Every Jolt body the engine makes gets Jolt's gyroscopic force unless its caller says otherwise. What changes, and
> what does it cost?**

### The change

- **`physics/jolt/joltLoader.js`'s `addBox()` defaults `gyroscopic` to true.** It is the wrapper's only way to make a
  body, and nothing else in the engine makes a Jolt body, so every dynamic Jolt body gets Jolt's
  `mApplyGyroscopicForce`. A caller that passes `gyroscopic: false` still gets it off. Static bodies never have it.
- **`addShip()` passes nothing, so ships get it too.** A ship is a cube, whose three moments are equal, so the term is
  exactly zero for it. The flag can only add Jolt's single-precision round trip.
- **The spinning body's library keeps C2 as it was registered,** with the flag passed false, so its committed results
  and its section 6 still describe what they measured. The comments that call the force "an opt-in, and it stays one"
  are rewritten.

### What is measured, in one registered run

Everything on Jolt is reached through its own loader, at the pages' 1/60 s with one substep unless stated, with zero
damping and zero gravity.

- **M1, the default body.** The fixture (1 x 2 x 3, moments 6.5 / 5 / 2.5) made with no flag:
  - the flag Jolt reports;
  - the spinning body's spin on it (2 rad/s about the intermediate axis, wobble 1e-5, 30 s), read by the spinning
    body's rule;
  - its trace against C3's, the same spin with the flag passed true.
- **M2, the ship.** A cube made by `addShip()` (half-size 0.5, density 1), spun at 2 rad/s about the axis (1, 2, 3)
  for 30 s. Also the same cube made by `addBox()` with the flag passed false. For each, the largest relative change of
  its angular velocity; and the largest difference between the two traces' angular velocities.
- **M3, the cost: stable spins at higher rates.** The fixture spun about its largest and its smallest axes at 2, 5, 10
  and 20 rad/s, with the spinning body's wobble (1e-5 of the spin, on the next axis), for 30 s:
  - on Jolt with the force on (the new default), at one substep;
  - on the engine's own physics, as the reference;
  - reported, testing nothing: Jolt with the force on at 4 substeps, and Jolt with it off.
  - Each spin gives its wobble's largest growth and the time the wobble first passed 10% of the spin.
  - **The reading of each spin:**
    - "lost" if the wobble passes 10% of the spin inside the 30 s;
    - otherwise "kept" if its largest growth is at most twice Euler's bound for this wobble (its start about the
      largest axis, 1.4422 of it about the smallest);
    - otherwise "drifting".
- **M4, the rest of the engine.** Not part of the run. The 73 gates that reach Jolt are run again after the change.
  Every row that goes red is named in the build record, and is either restated with a dated note (it recorded the old
  default) or fixed.

### Controls

- **C-flag:** before any spin, a body made with no flag reports the force on, one passed false off, one passed true
  on, and a static body off. Otherwise nothing is read.
- **C-key:** the engine's own physics at 2 rad/s holds the stable wobbles at Euler's bounds, as the spinning body
  measured: 1 about the largest axis and 1.4422 about the smallest, each to 1e-3.
- **C-undamped and C-inertia,** as in the spinning body.
- **C-determinism:** every spin flown twice, to the bit.

### Predictions, fixed now, deciding nothing

They come from the explicit step's growth the spinning body measured, sqrt(1 + (Omega h)^2) a step, where Omega is the
wobble's own frequency and grows with the spin.

- **P1:** M1's default body reads Euler's equations, and its trace is C3's to the bit (97%).
- **P2:** M2's cube with the force on keeps its angular velocity to 1e-5 over the 30 s (75%); with it off, exactly
  (95%).
- **P3:** about the largest axis, Jolt with the force on keeps the spin at 2 rad/s, lets it drift at 5, and loses it
  at 10 (near 23 s) and at 20 (near 6 s) (70%).
- **P4:** about the smallest axis, it keeps the spin at 2 rad/s, lets it drift at 5 and at 10, and loses it at 20
  (near 9 s) (55%). The 10 rad/s call is the fragile one: the model puts the wobble at 3% of the spin, against the
  10% line.
- **P5:** the engine's own physics keeps every spin (95%).
- **P6:** in M4, the only rows that go red are rows that state the old default and the derived records that hold the
  wrapper's size (70%).

### What was seen first

- **The spinning body's results:** Jolt with the force on at 2 rad/s grew the stable wobbles to 1.6032 and 1.9566.
  The explicit step's growth gives 1.62 and 1.96, and the predictions above extrapolate it. Nothing has been flown at
  any other rate.
- **The baseline:** the 73 gates that reach Jolt, run at 75002a98 before any code. 68 were green.
  - Four were red on records the spinning body's build had left stale: orrerySeed, orreryView, orreryFleet and
    wasmSupport.
  - One, recordDrift, was red on records only a ship refreshes.
  - d4551eb9 fixed all but two: orreryFleet's commit belt for box3d and recordDrift. Both wait for the ship, because
    their records are named for its version.

### What each outcome buys

- Nothing in it decides the default: it is on, by Keith's decision.
- If P3 or P4 holds, a fast stable spin on Jolt drifts or is lost within the 30 s at the pages' step. The verdict says
  so. Whether to take more substeps (a quarter of the step shrinks (Omega h)^2 sixteen times) or to keep the default
  as it is goes back to Keith.
- This note authorises no further round.

### Cost

Seconds.

### To be built

- The default and its comments, in `joltLoader.js`; the rows that state the old default, restated with dated notes.
- `tools/roundhouse/joltGyroDefault.mjs` (the library), `tools/roundhouse/joltGyroDefaultRun.mjs` (the command) and
  `tools/roundhouse/joltGyroDefault-selfcheck.mjs` (the gate).
- The results go to `physics/mechanics/joltGyroDefaultResults.json`, committed before it is read.

### Built, 2026-11-03, before the registered run (nothing of the registration above is changed)

- **The default:** `addBox()`'s `gyroscopic` now defaults to true, and its comment says so and why. `addShip()`
  passes nothing, so a ship takes it. A static body never does.
- **Restated, not widened:**
  - The spinning body's row that asserted "off by default" now asserts on, with a dated note.
  - Its configuration row's text and its closing line follow.
  - C2 still passes the flag false, as registered, and a dated note on its configurations says so.
- **The round:** `tools/roundhouse/joltGyroDefault.mjs` (the library), `joltGyroDefaultRun.mjs` (the command) and
  `joltGyroDefault-selfcheck.mjs` (the gate: 28 rows, under a second).
  - Jolt is reached through its own loader.
  - The default is measured by passing no key at all. A spy in the gate shows the spinner handing `addBox()` no
    `gyroscopic` for the default, and the flag itself otherwise.
  - The gate never flies a registered spin. Its miniature spins at 1 rad/s for a tenth of a second, with M1 about a
    stable axis.
- **M4, the 73 gates that reach Jolt, run again after the change:** 72 of 74 green, counting the new gate.
  - No physics gate moved: the ragdolls, the structures, the vehicle, the arena, the conformance checker, the blobs
    and the spinning body all held.
  - recordDrift is red on the same ship-time records as in the baseline.
  - orreryFleet is red twice:
    - on the baseline's commit belt;
    - on `orrery-fleet.json`'s size for `joltLoader.js` (13,363 bytes to 13,555), which is re-baked here.
  - **P6 cannot be read cleanly from M4.** A search for the old default found the spinning body's row and restated it
    before M4 ran, so M4 could not watch that row go red. G31 puts the old row back, and it goes red by name.
- **Found while designing the sabotages, before them:** three rows that could not have gone red.
  - M3's twin was compared, but never shown to be a second spin. A source check now holds it.
  - M1's comparison with C3 was asked only to be a boolean. On the miniature's stable spin it is now asserted true:
    the default and the flag passed true make one body.
  - M2's two measures were asked only to be numbers. They are now exported and held on made-up traces, so the gate
    reads none of M2's real numbers.

**Sabotaged with the byte-safe runner: 31 designs, each red by name** (the counts are in the gate's header).
One went 0 red on the first run, and one kind of red hid the rows after it. Each was fixed, and the whole series was
run again:
- **G20, C-key flown for 2 s instead of the window.** About the smallest axis the wobble reaches its bound a
  quarter-turn in (1.42 s), so any window past that reads the same bound. C-key now counts its steps and fails short
  of 1,800.
- **G28 and G29, a round the sabotage stopped.** Section 4 threw at its second row, because a stopped round has no
  measurements, and the rows after it never ran. The rows now read through defaults, so each one fails by name.

**The registered run:** `node tools/roundhouse/joltGyroDefaultRun.mjs`.

### The verdict, 2026-11-03 (read from the committed file, after it was committed)

The registered run wrote `physics/mechanics/joltGyroDefaultResults.json` at head fc183172 in about two seconds. It was
committed byte for byte at e661c0b7 before anyone read it (7,943 bytes, sha256 eec1d252). It flew the registered spins
and says so (`registered: true`). Every number below is re-derived from that file in section 6 of
`tools/roundhouse/joltGyroDefault-selfcheck.mjs`, and the whole round is flown again there and held against the file.

**The controls held.**
- **C-flag:** a body made with no flag has the force, false turns it off, true on, and a static body never has it.
- **C-key:** the engine's own physics at 2 rad/s held the wobbles at 1.0000 and 1.4422 of their start, Euler's
  bounds, over all 1,800 steps.
- **C-inertia and C-undamped,** on all three Jolt configurations: the moments to 1e-7, and a spin exactly about the
  largest axis kept exactly.
- **C-determinism:** all 32 spins flew twice to the bit.

**M1, the default body: Euler's equations.** The fixture made with no flag has the force on. Spun about its middle
axis, its wobble grew at 0.953074/s (-0.801%), so it reads "Euler's equations" by the spinning body's rule. It flew
C3's trace to the bit, and its fit is the spinning body's committed C3 fit, number for number.

**M2, the ship: nothing physical, only rounding.** The cube from `addShip()` has the force on and three equal moments.
- With the force on, its angular velocity moved by 2.6e-5 of its spin over the 30 s, about 1.5e-8 a step: Jolt's
  single-precision round trip.
- With the force passed off, it did not move at all.

**M3, the cost: Jolt's step loses fast stable spins.** Each cell is the wobble's largest growth over its start and the
reading, or when the wobble passed 10% of the spin. J is Jolt with the new default at one substep; J4 and J0 are
reported, at four substeps and with the force off.

| spin | J, largest axis | J, smallest axis | own physics, largest | own physics, smallest | J4, largest | J4, smallest | J0, largest | J0, smallest |
|---|---|---|---|---|---|---|---|---|
| 2 rad/s | 1.6032, kept | 1.9566, kept | 1.0000, kept | 1.4422, kept | 1.1257, kept | 1.5566, kept | 1.0000, kept | 1.0000, kept |
| 5 rad/s | 19.9437, drifting | 9.8188, drifting | 1.0000, kept | 1.4422, kept | 2.1149, drifting | 2.3308, kept | 1.0000, kept | 1.0000, kept |
| 10 rad/s | lost at 23.22 s | 2,919, drifting | 1.0000, kept | 1.4422, kept | 19.9492, drifting | 9.6974, drifting | 1.0000, kept | 1.0000, kept |
| 20 rad/s | lost at 5.95 s | lost at 8.97 s | 1.0000, kept | 1.4419, kept | lost at 23.13 s | 3,045, drifting | 1.0000, kept | 1.0000, kept |

- **At the pages' step, Jolt with the force on:**
  - keeps a spin of 2 rad/s and lets one of 5 rad/s drift;
  - loses a spin of 10 rad/s about the largest axis after 23.22 s;
  - loses a spin of 20 rad/s after 5.95 s about the largest axis and 8.97 s about the smallest.
  Euler's equations keep all of them, and so does the engine's own physics.
- **The explicit step's growth predicted every reading.** Its three loss times were 23.18, 5.91 and 8.77 s, against
  the 23.22, 5.95 and 8.97 s measured. Where nothing was lost, its growth is within 5% of the measured.
- **Four substeps move the cost up by a factor of two in spin.** At 10 rad/s the spin drifts instead of being lost, and
  at 20 rad/s about the largest axis it is lost at 23.13 s, as one substep loses 10 rad/s.
- **With the force off nothing grows** (1.0000 everywhere). That is the spinning body's C2: no gyroscopic term at all.

**The predictions:**
- **P1: right.** The default body reads Euler's equations, with C3's trace to the bit; I gave it 97%.
- **P2: half wrong.** With the force on, the cube's angular velocity moved by 2.6e-5 of its spin, not within the 1e-5
  I gave 75%. With it off it did not move, which I gave 95%.
- **P3: right.** About the largest axis the spin was kept at 2 rad/s, drifted at 5, and was lost at 10 (23.22 s) and
  at 20 (5.95 s); 70%.
- **P4: right.** About the smallest axis it was kept at 2, drifted at 5 and at 10, and was lost at 20 (8.97 s); 55%.
  At 10 rad/s the wobble reached 2,919 of its start, 2.9% of the spin, under the 10% line.
- **P5: right.** The engine's own physics kept every spin; 95%.
- **P6: right, read from the build record, not from this file.** In M4 the only row the change turned red was the
  record that holds the wrapper's size. The row that stated the old default had been restated before M4 ran; G31 shows
  it would have gone red. 70%.

**What this says, and what it does not.**
- **It says:** with the default on, a free body on Jolt turns by Euler's equations, within 0.8% of the rate at the
  pages' step. Ships, which are cubes, are unchanged except for a rounding drift.
- **It says:** the default has a cost, and the cost grows fast with the spin. At the pages' 1/60 s, a body spun about
  a stable axis at 10 rad/s or more starts to tumble within the half-minute. From a wobble of 1e-5 of the spin, a
  20 rad/s spin tumbles within 6 to 9 s. Without the default it would never have tumbled, but it would never have
  wobbled or precessed either.
- **It does not say:**
  - how soon a larger wobble tumbles. The explicit step's growth says sooner, but that is not measured.
  - anything about contact, joints or damping. The wrapper's default angular damping (0.05/s) slows a spin and so the
    growth, and that is not measured either.
  - what four substeps cost in time.

**What follows.**
- The default stays on, by Keith's decision.
- **Back to Keith, as the registration said:** take more substeps (four move the cost from about 10 rad/s to about 20),
  or keep the default as it is.
- **Not registered, and a round of its own if wanted:** Jolt's flag off and an implicit gyroscopic step in the wrapper,
  the kind box3d's solver takes. At 2 rad/s that kept both of box3d's stable wobbles inside Euler's bounds (1.0000 and
  1.4370); at higher rates it is not measured.

**The verdict, as code:** section 6 of `tools/roundhouse/joltGyroDefault-selfcheck.mjs` re-derives every number above
from the committed file. It flies the whole round again and holds it against the file, and it holds the explicit step's
growth against every Jolt reading. Sabotaged with the byte-safe runner: 20 designs, each red by name, and every row of
section 6 went red under at least one. They edit the committed file, this note or the code, and the counts are in the
gate's header.

## The implicit gyroscopic step in Jolt's wrapper -- Keith's pick, registered before any code (2026-11-03)

Keith, 2026-11-03: "Do the implicit gyroscopic step in the wrapper." The second round's verdict offered it: Jolt's flag
off, and the wrapper takes the gyroscopic step itself, implicitly, the way box3d's solver does.

> **With the wrapper's own implicit step in place of Jolt's explicit one, does a free Jolt body still follow Euler's
> equations, and do fast stable spins stay stable? What does it cost instead?**

### The change

- **The step is box3d's.** `b3IntegrateVelocitiesTask` in box3d v0.1.0's `solver.c` solves
  I (w2 - w1) + h w2 x (I w2) = 0 in body coordinates, by one Newton step from w1, with the Jacobian
  J = I + h (skew(w) I - skew(I w)). It does this once a substep, after damping, and does not renormalise. A new
  module, `physics/mechanics/implicitGyro.mjs`, does the same in double precision.
- **The wrapper takes it before every `step()`.** For each awake dynamic body that has the step:
  - it reads the body's angular velocity and orientation;
  - it takes the step over the whole `dt`;
  - it writes the result back, and then Jolt steps.
  At the pages' one substep that is box3d's step exactly. At more substeps it is still taken once, over the whole
  step, and Jolt's own substepping is left as it is.
- **The default becomes the implicit step.** `addBox()`'s `gyroscopic` takes three values:
  - `"implicit"` is the new default. Jolt's own flag is off, and the wrapper takes the step.
  - `true` (or `"jolt"`) is Jolt's own explicit force, as before. Every caller that passed `true` keeps exactly what
    it had.
  - `false` means neither.
- **A body whose three moments are equal is skipped.** Its gyroscopic torque is exactly zero, so a ship (a cube) is
  left untouched: not even the rounding the second round measured.
- **`addShip()` passes a `gyroscopic` setting through when it is given one**, and otherwise takes the default.
- **A world reports each body's setting** as `gyroscopicOf(i)`: `"implicit"`, `"jolt"` or false.
- **The two earlier rounds keep what they measured.**
  - The spinning body's C3 passes `true`, which is still Jolt's own force.
  - The second round's library relied on the loader's default in three places: its "default" body, its ship and
    C-flag. It now passes the default as it was registered (`true`), with a dated note, so its committed results fly
    again unchanged.

### What is measured, in one registered run

Everything is at the pages' 1/60 s, at one substep unless stated, with zero damping and zero gravity. Jolt and box3d
are each reached through their own loader.

- **M1, the default body, about the intermediate axis.** The spinning body's spin (2 rad/s, wobble 1e-5, 30 s) on the
  fixture made with no flag:
  - its reading by the spinning body's rule, and its rate;
  - the change of its rotational energy and of its angular momentum's length over the 30 s;
  - its flips.
- **M2, the ship.** The second round's cube from `addShip()`, spun at 2 rad/s about (1, 2, 3) for 30 s with the
  default, against the same cube with the force passed off. The largest change of its angular velocity, and whether
  the two traces are one.
- **M3, the stable spins.** The fixture about its largest and smallest axes at 2, 5, 10 and 20 rad/s, with the
  wobble of 1e-5 of the spin, for 30 s. Each spin gives its largest growth, the time it first passed 10% of the spin,
  and its size at the end of the window over its start. The reading is the second round's rule. The configurations:
  - JI: Jolt with the new default, the wrapper's implicit step;
  - JE: Jolt's own explicit force (`true`), the second round's J;
  - OWN: the engine's own physics;
  - reported, testing nothing: B3, box3d's own implicit step at its four substeps; and J0, Jolt with neither.
- **M4, the rest of the engine.** Not part of the run. The 73 gates that reach Jolt are run after the change and
  BEFORE any row is restated, so every row the change turns red is seen red. They are named in the build record, and
  each is then restated with a dated note (it recorded the old default) or fixed.
- **Reported, testing nothing, and not in the results file** (a time does not repeat from one machine to the next): the
  wrapper's step time for 200 awake bodies with the implicit step and with neither.

### Controls

- **C-flag:** a body made with no flag reports "implicit" with Jolt's own flag off; `true` reports "jolt" with Jolt's
  flag on; `false` reports neither; a static body neither. Otherwise nothing is read.
- **C-box3d:** one box3d substep (h = 1/240) from a wobbling spin, against the new module's step from the same angular
  velocity. They agree to 1e-6, single precision, so the step is box3d's.
- **C-repeat:** JE's sixteen spins are the second round's committed J, number for number. The instrument has not moved.
- **C-key, C-inertia, C-undamped and C-determinism,** as in the second round.

### Predictions, fixed now, deciding nothing

Backward Euler on a step h shrinks an oscillating wobble by 1 / sqrt(1 + (Omega h)^2) a step, and runs an unstable
one at sigma (1 + sigma h / 2).

- **P1:** M1 reads "Euler's equations", its rate +0.80% off the prediction (backward Euler's +0.807% at h = 1/60, less
  the fit's 0.009%), to within 0.05 of a point (80%).
- **P2:** JI keeps every stable spin, at every rate, about both axes (90%).
- **P3:** JI shrinks the stable wobbles. At 5 rad/s and above, each ends the window below half its start (75%).
- **P4:** M1's tumble on JI loses between 1% and 10% of its rotational energy over the 30 s (60%).
- **P5:** the ship's trace with the default is its trace with the force off, to the bit (95%).
- **P6:** box3d (reported) keeps every stable spin too (85%).
- **P7:** in M4, the only rows that go red are those that read the loader's default or rely on a body made with no
  flag (the spinning body's default row, and the second round's rows that read the default), plus the record that
  holds the loader's size. No physics gate goes red (60%).

### What was seen first

- **The second round's results:**
  - Jolt's explicit step loses fast stable spins.
  - The engine's own physics, RK4, keeps every one.
  - Box3d's implicit step kept both stable wobbles inside Euler's bounds at 2 rad/s, at its four substeps (the
    spinning body: 1.0000 and 1.4370). That is the only rate box3d has been flown at.
- **The step itself:** box3d's code was read (above). Nothing of the new step has been run.

### What each outcome buys

- If P2 holds, the default is the implicit step:
  - a fast stable spin on Jolt stays stable;
  - its wobble shrinks where real physics keeps it, which is the step's price;
  - the intermediate-axis tumble still runs at Euler's rate to within about 1%.
- If P2 fails, the verdict says how, and whether the default stays goes back to Keith.
- This note authorises no further round.

### Cost

Seconds.

### To be built

- `physics/mechanics/implicitGyro.mjs` (the step).
- The loader's step, its default and `gyroscopicOf()`.
- The second round's library passing its registered default explicitly.
- The rows that state the old default, restated with dated notes after M4 has seen them red.
- `tools/roundhouse/joltGyroImplicit.mjs` (the library), `tools/roundhouse/joltGyroImplicitRun.mjs` (the command) and
  `tools/roundhouse/joltGyroImplicit-selfcheck.mjs` (the gate).
- The results go to `physics/mechanics/joltGyroImplicitResults.json`, committed before it is read.

### Built, 2026-11-03, before the registered run (nothing of the registration above is changed)

- **The step:** `physics/mechanics/implicitGyro.mjs` is box3d's step, term for term, in double precision.
  - Its Jacobian is I + h (skew(w) I - skew(I w)) to the last digit, against plain products in the gate.
  - On made-up cases, one step divides a stable wobble's invariant by exactly 1 + (Omega h)^2, which is backward
    Euler's; an explicit step multiplies it by the same. One step runs the unstable wobble at 1 / (1 - sigma h).
  - **C-box3d, held in the gate:** one box3d substep from (1, 2, 3) rad/s lands on the module's step to 3.1e-8. An
    explicit step is 3.2e-5 away.
- **The loader:**
  - `addBox()`'s default is "implicit", and `true` is still Jolt's own force.
  - The step is taken before Jolt's, once a step, through each body's own orientation. On a body turned
    0.5 rad about (1, 1, 1) it lands on the module's step to 3.3e-8.
  - An equal-moment body is skipped, and flies bit for bit as one with neither.
  - `gyroscopicOf()` reports each body's setting, and `addShip()` passes a setting through.
- **M4, run after the change and before any row was restated:** the 73 gates that reach Jolt, and the second
  round's. 70 of 74 were green, and no physics gate moved. The reds:
  - the second round's gate, 9 rows: every one reads the loader's default or a body made with no flag, and one is its
    fly-again row;
  - the spinning body's default row;
  - orreryFleet, on the loader's size (13,555 bytes to 16,080) and on the baseline's commit belt;
  - recordDrift, on the ship-time records, as before.
  That is P7's list. P7 is read here, in the build record.
- **Restated, with dated notes:**
  - The second round's library passes its registered default (`true`) in the three places it leaned on the
    loader's, and its committed results fly again unchanged (worst 0).
  - That gate's rows that read the default now read what the library passes.
  - One more row there went red only after the library changed: the C-flag can-fail fixture. It took the force off
    only bodies made with no flag, and the library no longer makes any. It now takes the force off every body.
  - The spinning body's default row holds the new default.
  - `orrery-fleet.json` was re-baked for the loader's size.
  - After them, the 74 and the new gate ran again: 73 of 75 green. The only reds are recordDrift and the commit belt,
    both the ship's.
- **The round:** `tools/roundhouse/joltGyroImplicit.mjs` (the library), `joltGyroImplicitRun.mjs` (the command) and
  `joltGyroImplicit-selfcheck.mjs` (the gate: 34 rows, under a second).
  - The gate never flies a registered spin. Its miniature spins at 1 rad/s for a tenth of a second, with M1 about a
    stable axis.
  - **Disclosed:** its plumbing row flies a ship with the default for 600 steps (10 s) of a tilted spin and finds it
    bit for bit the ship with neither. That is P5's question over a third of the window, answered by construction:
    the skip.
- **Found while designing the sabotages, before them:** five rows that could not have gone red.
  - Every check started from the identity orientation, where a step that ignored the body's orientation, or read its
    quaternion in the wrong order, would pass. Two rows now turn the body: a quarter-turn about y in the module, and
    0.5 rad about (1, 1, 1) on real Jolt (G12 below says why that one changed).
  - The new spinner's body-frame reading was not held.
  - M1's and M3's twins were never shown to be second spins.
  - The end-over-start measure was not held on made-up traces.

**Sabotaged with the byte-safe runner: 31 designs, each red by name** (the counts are in the gate's header).
None went 0 red, but one went red elsewhere than on the row written for it:
- **G12, the wrapper reading its quaternion in the wrong order.** The source row and C-undamped in the miniature caught
  it, not the wrapper row meant to. That row turned its body a quarter-turn about y. Read in the wrong order, that
  turn is the right one composed with a half-turn about the body's z, which is a symmetry of the box, so the step came
  out the same. The row now turns the body 0.5 rad about (1, 1, 1), which no symmetry of the box undoes, and it goes red
  for G12 and G4. The whole series was run again after the change.

**The registered run:** `node tools/roundhouse/joltGyroImplicitRun.mjs`.

### The verdict, 2026-11-03 (read from the committed file, after it was committed)

The registered run wrote `physics/mechanics/joltGyroImplicitResults.json` at head 2195d855 in about a second and a
half. It was committed byte for byte at 6f2063d3 before anyone read it (10,900 bytes, sha256 1b3aea52). It flew the
registered spins and says so (`registered: true`). Every number below that comes from that file is re-derived from it
in section 6 of `tools/roundhouse/joltGyroImplicit-selfcheck.mjs`, and the whole round is flown again there and held
against the file. The step times are not in the file, as the registration said, and nothing holds them.

**The controls held.**
- **C-flag:** a body made with no flag has the setting "implicit" with Jolt's own flag off. `true` gives "jolt" with
  the flag on, `false` gives neither, and a static body has neither.
- **C-box3d:** one box3d substep from (1, 2, 3) rad/s landed on the module's step to 3.1e-8 of the spin; an explicit
  step is 3.2e-5 away.
  The step is box3d's.
- **C-key:** the engine's own physics at 2 rad/s held the wobbles at 1.0000 and 1.4422 of their start, Euler's bounds,
  over all 1,800 steps.
- **C-inertia and C-undamped,** on all three Jolt configurations: the moments to 1e-7, and a spin exactly about the
  largest axis kept exactly.
- **C-repeat:** JE's eight spins are the second round's committed J, number for number. The instrument has not moved.
- **C-determinism:** all 40 spins flew twice to the bit, and so did M1.

**M1, the default body: Euler's equations, as far off on the other side.** The fixture made with no flag has the
implicit step. Spun about its middle axis, its wobble grew at 0.968456/s (+0.800%), so it reads "Euler's equations" by
the spinning body's rule. Jolt's own force read 0.953074/s (-0.801%) in the second round: the explicit step is as slow
as
the implicit one is fast. The step costs energy:
- over the 30 s its rotational energy ended 5.72% below its start, and its angular momentum's length strayed by at most
  2.90%;
- box3d, which takes the same step at each of its four substeps, ended 1.30% below and strayed by at most 0.65% in the
  spinning body's run;
- the tumble flipped twice, as box3d's did.

**M2, the ship: untouched.** The cube from `addShip()` has the setting "implicit", but its three moments are equal, so
the step skips it. Over the 30 s its angular velocity did not move at all, and its trace is the trace with the force
passed off, to the bit. In the second round, Jolt's own force moved it by 2.6e-5 of its spin, from rounding.

**M3: every stable spin kept.** Each cell is the wobble's largest growth over its start and the reading, or when the
wobble passed 10% of the spin. JI is Jolt with the new default, and JE is Jolt's own force, the second round's J. B3
(box3d at its four substeps) and J0 (Jolt with neither) are reported.

| | 2 rad/s | 5 rad/s | 10 rad/s | 20 rad/s |
|---|---|---|---|---|
| JI, largest axis | 1.0000, kept | 1.0000, kept | 1.0000, kept | 1.0000, kept |
| JI, smallest axis | 1.4215, kept | 1.3915, kept | 1.3441, kept | 1.2569, kept |
| JE, largest axis | 1.6032, kept | 19.9437, drifting | lost at 23.22 s | lost at 5.95 s |
| JE, smallest axis | 1.9566, kept | 9.8188, drifting | 2,919, drifting | lost at 8.97 s |
| own physics, largest axis | 1.0000, kept | 1.0000, kept | 1.0000, kept | 1.0000, kept |
| own physics, smallest axis | 1.4422, kept | 1.4422, kept | 1.4422, kept | 1.4419, kept |
| B3, largest axis | 1.0000, kept | 1.0000, kept | 1.0000, kept | 1.0000, kept |
| B3, smallest axis | 1.4370, kept | 1.4292, kept | 1.4163, kept | 1.3907, kept |
| J0, largest axis | 1.0000, kept | 1.0000, kept | 1.0000, kept | 1.0000, kept |
| J0, smallest axis | 1.0000, kept | 1.0000, kept | 1.0000, kept | 1.0000, kept |

- **Jolt with the implicit step keeps every stable spin, at every rate and about both axes.** So do box3d and the
  engine's own physics. Jolt's own force loses three of them, exactly as in the second round.
- **About the smallest axis, its largest growth falls as the spin rises:** from 1.4215 at 2 rad/s to 1.2569 at 20,
  always under Euler's 1.4422.
  The wobble shrinks before it reaches its first peak.

**And the stable wobble dies away.** Real physics keeps a stable wobble's size; the step shrinks it. Each cell is the
wobble at the end of the 30 s over its start.

| | 2 rad/s | 5 rad/s | 10 rad/s | 20 rad/s |
|---|---|---|---|---|
| JI, largest axis | 0.5843 | 0.0499 | 6.2e-6 | 7.0e-7 |
| JI, smallest axis | 1.0373 | 0.2106 | 5.4e-4 | 1.8e-6 |
| own physics, largest axis | 0.9430 | 0.9923 | 0.9707 | 0.9064 |
| own physics, smallest axis | 1.4102 | 1.4414 | 1.0048 | 1.0189 |
| B3, largest axis | 0.8369 | 0.4694 | 0.0487 | 6.1e-6 |
| B3, smallest axis | 1.3057 | 0.8910 | 0.1474 | 5.1e-4 |

- **The engine's own physics ends every spin inside the wobble's own swing:** between 0.866 and 1 of its start about the
  largest axis, and between 1 and 1.4422 about the smallest.
  The size is kept, and only the phase moves.
- **Backward Euler's shrinkage predicted the ends of JI and box3d, except at 20 rad/s on Jolt.** The step divides the
  wobble's size by sqrt(1 + (Omega h)^2) a step. Over the window, and times the wobble's own swing, that holds every
  end of JI's at 2, 5 and 10 rad/s, and all eight of box3d's.
- **At 20 rad/s on Jolt the wobble stopped short of that.** It ended at 7.0e-7 and 1.8e-6 of its start (1.4e-10 and
  3.6e-10 rad/s), where backward Euler gives 4.9e-21 and 7.3e-14.
  What holds it there is not measured. My guess is the single precision Jolt keeps a body in.
- **On Jolt the step damps about four times as fast as on box3d.** It is taken once a 1/60 s step, where box3d takes
  it at each of four substeps of 1/240 s. At 5 rad/s about the largest axis the wobble ended at 0.0499 of its start on
  Jolt, and at 0.4694 on box3d.

**The step's time (reported, testing nothing, and not in the results file).** For 200 awake boxes of the fixture that
touch nothing, the wrapper's step took 322 microseconds with the implicit step and 146 with neither.
- Those are medians of seven runs of 600 steps for each setting, alternating, in this sandbox, on the built code. The
  boxes sat 6 m apart, spun at about (0.3, 2, 0.2) rad/s, with zero gravity and damping and 60 steps to warm up.
- That is about 0.9 microseconds a body a step: 2.2 times the step, for bodies that touch nothing, and about 1% of a
  60 Hz frame for 200 bodies.

**The predictions:**
- **P1: right.** M1 reads Euler's equations at +0.800%, within 0.05 of a point of the +0.80% I gave 80%.
- **P2: right.** JI kept every stable spin, at every rate, about both axes; 90%.
- **P3: right.** At 5 rad/s and above, every JI wobble ended below half its start. The largest end was 0.2106, at 5
  rad/s about the smallest axis; 75%.
- **P4: right.** M1's rotational energy ended 5.72% below its start, between the 1% and 10% I gave 60%.
- **P5: right.** The ship's trace with the default is its trace with the force off, to the bit; 95%.
- **P6: right.** box3d kept every stable spin too; 85%.
- **P7: right, read from the build record, not from this file.** In M4 the rows the change turned red were those that
  read the loader's default or a body made with no flag, and the record of the loader's size. No physics gate moved.
  60%.

**What this says, and what it does not.**
- **It says:** with the implicit step as the default, a free body on Jolt still turns by Euler's equations, within 0.8%
  of the rate at the pages' step. A fast stable spin stays stable at every rate measured, up to 20 rad/s, at one
  substep. Ships are untouched.
- **It says:** the price is damping, and it grows with the spin. A stable wobble that real physics keeps dies away: at
  10 rad/s, in 30 s, to 6.2e-6 of its start about the largest axis and 5.4e-4 about the smallest. A tumbling body loses
  rotational energy, 5.72% in 30 s at 2 rad/s.
- **It says:** the step costs time, about 0.9 microseconds a body a step in this sandbox.
- **It does not say:**
  - what holds the wobble near 1e-10 rad/s at 20 rad/s;
  - how fast a larger wobble dies, or what that does to a body meant to wobble;
  - anything about contact, joints or damping. The wrapper's default angular damping (0.05/s) comes on top of the
    step's own;
  - what the step does at more substeps, where it is still taken once a step;
  - what it costs in a scene whose bodies touch, or against Jolt's own force.

**What follows.**
- P2 held, so the default stays the implicit step, as the registration said.
- Both of the second round's questions for Keith are answered. Question 2, Jolt's flag off and an implicit step in the
  wrapper, is this round. Question 1, more substeps, was about the explicit force's cost, and one substep now keeps
  every stable spin measured.
- This note authorises no further round.

**The verdict, as code:** section 6 of `tools/roundhouse/joltGyroImplicit-selfcheck.mjs` re-derives every number above
from the committed file, except the step times. It flies the whole round again and holds it against the file, and it
holds backward Euler's shrinkage against every end of JI's and box3d's. Sabotaged with the byte-safe runner: 22
designs, each red by name, and every row of section 6 went red under at least one. They edit the committed file, this
note or the code, and the counts are in the gate's header.

## The new default in the engine's own Jolt scenes -- Keith's pick, registered before any code (2026-11-03)

Keith, 2026-11-03: "Yes, register the scenes round", a round to run before shipping. The published engine runs main,
whose Jolt wrapper has no gyroscopic term at all. Shipping this branch therefore moves its Jolt bodies straight to the
implicit step, and the third round's verdict names contact and joints as unmeasured.

> **In the engine's own Jolt scenes, does the new default change anything that a sign test over 40 seeds can see,
> against `false`, which is what ships today?**

### The scenes

Most Jolt content makes cubes (ships, arena blocks, voxels), and the step skips those. The race pages and the physics
lab run on box3d. A search of every `addBox()` caller found two shipped scenes whose dynamic Jolt bodies have unequal
moments:
- **The arena's crew** (`jolt-arena.html`): three ragdolls of seven boxes each on ball joints
  (`physics/jolt/joltRagdoll.js`), beside the page's 7 x 6 wall of cubes on breakable joints
  (`physics/jolt/joltStructures.js`), on its ground strip, stepped at 1/60 s with two substeps.
- **The blobs' debris** (`blob-avatar.html` and `blob-herd.html`, which prefer Jolt): the blob's mesh shattered into
  Voronoi fragments (`fx/fracture/cellFracture.js`), each a box of its own bounds, thrown from the impact with a tumble
  (`fx/fracture/debrisPhysics.js`). No gate runs this path on Jolt.

Each scene is flown headless, with the page's own modules and numbers (C-page holds them):
- **A1, the crew added:** the page's three ragdolls at x = 3.5, 4.9 and 6.3 and y = 1.6, scale 0.85, each moved by
  the seed by up to 0.2 m in x and raised by up to 0.4 m. They drop onto the ground strip beside the wall, for 10 s,
  with the wall's `update()` every step.
- **A2, the crew flung:** from A1's end, each ragdoll flung as the page flings it (`fling(dir * 30, 7, 0, 5)`, toward
  the wall), for 20 s.
- **D1, the avatar shattered** (`blob-avatar.html`): the avatar's rest pose (`makeAvatar()` at time 0), marched as the
  page marches it (38 cells across, from -3.35 to 3.35, at 1.0). Its 16 sites are biased 0.6 toward the page's impact
  (1.2, 0.6, 0), and it is thrown with force 2.6 onto the page's ground (y = -1.6, extent 9), for 15 s.
- **D2, the herd shattered** (`blob-herd.html`): the avatar and a five-member herd (`makeHerd()` with the page's
  settings, its layout from a fixed seed), marched as that page marches it (32 cells, from -4.4 to 4.4). Its 22 sites
  are biased 0.5 toward (0, 0.4, 0), and it is thrown with force 3.0 onto its ground (y = -2.2, extent 12), for 15 s.
- The debris pages step at their frame time, capped at 1/30 s, with one substep; here they step at 1/60 s. The seed
  sets the fracture sites and the tumble, and the meshes are the same for every seed.

### What is measured, in one registered run

Every scene is flown on 40 seeds (1 to 40), each three times:
- **D**, the new default (no `gyroscopic` key);
- **F**, `false` on every body: what ships today;
- **F'**, `false` with a nudge of 1e-5 m: A1's first ragdoll moved by that in x, or the debris thrown from an impact
  moved by that in x (the fracture itself unchanged). F' is the chaos control, below.

"Asleep" is Jolt's own `IsActive()` false. A scene's **rest time** is the time from which every one of its ragdoll
parts or fragments stays asleep to the end of its window; it is none if they are not all asleep at the end, and none
counts as later than any time. Per flight:
- **A1:** the rest time (primary); the parts' mean height at the end; the largest distance between jointed parts'
  centres over the window, the ragdoll gate's cohesion (under 2 is "the joints hold").
- **A2:** the wall's broken joints at the end (primary); the largest cohesion over the window (primary); the parts
  that left the arena (below y = -5 at the end); the peak linear and angular speeds of any part.
- **D1 and D2:** the rest time (primary); the spread (primary), which is the fragments' RMS horizontal distance from
  their centroid at the end; their mean height at the end; the fragments that left (more than 1 m below the ground at
  the end); the peak speed.

**The reading:** for each statistic, D against F seed by seed, by an exact two-sided sign test with ties set aside. At
p < 0.01 the default **changes it**, and the direction is named; otherwise it **changes nothing a sign test can see**.
There are six primary statistics; the rest are reported, testing nothing. A sign test can find a systematic shift. It
cannot prove there is none, and the medians of D and F are reported beside it.

**Reported, testing nothing, and not in the results file:** the wrapper's step time in each scene with D and with F.

### Controls

- **C-page:** the scenes' numbers are the pages' own, read from their source: positions, scale, fling, step and
  substeps, wall, sites, bias, impact, force and ground.
- **C-setting:** with D, every ragdoll part and every fragment has the setting "implicit" and an inertia for the step;
  the wall's cubes have the setting but no inertia, so they are skipped; the ground has none. With F and F', no body
  has a setting. It reports how many bodies take the step in each scene.
- **C-chaos:** F' against F, by the same sign test, changes no primary statistic. A nudge changes the flights but
  shifts nothing, so the test is not seeing chaos as an effect. It also reports how many seeds the nudge changed at all.
- **C-determinism:** seed 1 of every scene, flown twice with each setting, is the same to the bit.

### Predictions, fixed now, deciding nothing

- **P1:** in A1 the default does not change the rest time, and every A1 flight comes to rest within its 10 s under
  both settings (85%).
- **P2:** in D1 and D2 the default changes neither the rest time nor the spread, and every flight comes to rest within
  its 15 s under both settings (80%).
- **P3:** the joints hold in every A1 and A2 flight with the default (90%).
- **P4:** in A2 the default changes neither the wall's broken joints nor the largest cohesion (70%).
- **P5:** in A1, D1 and D2, with the default, nothing leaves and no number is non-finite (95%).
- **P6:** with the default, the median rest time in A1, D1 and D2 is within 10% of its median with `false` (60%).

### What was seen first

- **The third round's results:** the step keeps stable spins, damps the wobble, and costs about 0.9 microseconds a
  body a step.
- **One probe, with `false` only (what ships today), before this was written.** It flew two seeds of each scene to see
  whether they come to rest at all. The new default was not flown.
  - The crew added came to rest in 5.83 and 4.70 s.
  - The crew flung left the 1 m-deep ground strip at up to 478 m/s and fell without end. They broke 31 and 45 of the
    wall's 71 joints, and the cohesion stayed at 0.45.
  - The avatar broke into 16 fragments and the herd into 19 and 22, every one with unequal moments. They came to rest
    within 3.43 to 4.73 s, on the ground.
  - That is why A2 is read by the wall and the joints, not by a rest time.

### What each outcome buys

- If P1 to P5 hold, the default ships as it is: in the scenes it reaches, a sign test over 40 seeds sees no change.
- If a primary statistic moves, the verdict says which and by how much, and the default to ship goes back to Keith:
  the implicit step, or `false` until the scene is understood.
- This note authorises no further round.

### Cost

Minutes.

### To be built

- `tools/roundhouse/joltScenes.mjs` (the library: the four scenes, the statistics, the sign test and the controls),
  `tools/roundhouse/joltScenesRun.mjs` (the command) and `tools/roundhouse/joltScenes-selfcheck.mjs` (the gate).
- The results go to `physics/mechanics/joltScenesResults.json`, committed before it is read.
