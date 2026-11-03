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
