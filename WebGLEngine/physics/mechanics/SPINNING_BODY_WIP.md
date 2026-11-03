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
