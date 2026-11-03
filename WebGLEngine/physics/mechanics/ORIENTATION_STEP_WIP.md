# The engine's own orientation step -- Keith's pick, registered before any code (2026-11-03)

Keith, 2026-11-03, one of three before shipping: "Leftovers from the spinning-body work: the engine's own first-order
orientation step, and the 6-DOF ships on box3d." This note registers the first. The second is a round of its own.

The spinning body (`physics/mechanics/SPINNING_BODY_WIP.md`) found the engine's own physics right to fourth order in its
angular velocity and to first order in its orientation:
- `freeRotation.stepQuat()` moves a body's orientation by one forward step of q' = 1/2 q (x) (0, w), using the angular
  velocity at the start of the step, then renormalises. The angular velocity itself takes an RK4 step.
- `rigidBody6dof.step()` reuses it, so every 6-DOF craft in the engine turns this way: the ships (`es-box3d-6dof.html`,
  the headless duel in `brain/pilot6dofPolicy.mjs`, `brain/spaceArena.mjs`), the aircraft
  (`physics/mechanics/flightModel6dof.mjs`, `aircraftAssembly.mjs`), the sub (`subModel6dof.mjs`), and the multirotor
  and rotorcraft models (`multirotorModel6dof.mjs`, `rotorcraftModel6dof.mjs`).
- On a free spinning body, the world-frame angular momentum drifted 8.0e-3, 2.0e-3 and 5.0e-4 over 30 s at 1/60, 1/240
  and 1/960 s: first order.

> **Does an orientation step of the angular velocity's own order remove that drift, and would it change how the
> engine's ships fight?**

### The two steps

- **Q0, the engine's own now:** q(n+1) = normalise(q(n) + h k1), with k1 = 1/2 q(n) (x) (0, w(n)).
- **Q4, the candidate:** RK4 on the orientation alongside the RK4 the angular velocity already takes. Each of its four
  stages uses that stage's own angular velocity, w1 to w4 from the angular velocity's RK4:
  - k1 = 1/2 q(n) (x) w1, k2 = 1/2 (q(n) + h/2 k1) (x) w2, k3 = 1/2 (q(n) + h/2 k2) (x) w3, k4 = 1/2 (q(n) + h k3) (x) w4;
  - q(n+1) = normalise(q(n) + h/6 (k1 + 2 k2 + 2 k3 + k4)).
- The angular velocity's step is untouched. The torque is held for the tick, as now, and the angular velocity's stages
  do not depend on the orientation, so under Q4 every angular velocity is the same to the bit (C-omega).
- Q4 is an option, off unless asked: `rigidBody6dof.step()` takes `orientation` ("euler", the default, or "rk4"), and
  the duel takes it and passes it on. Given neither, both are byte for byte what they were (C-unchanged).
  `freeRotation.stepQuat()` is not touched.

### What is measured, in one registered run

- **M1, the free body:** the spinning body's fixture and spin (its C4): a box of half-extents 0.5 x 1.0 x 1.5 m,
  density 1, spun at 2 rad/s about its intermediate axis with a wobble of 1e-5 of that, for 30 s. Flown with Q0 and
  with Q4 at 1/30, 1/60, 1/240 and 1/960 s. Each flight gives the world-frame angular momentum's largest drift over
  the window (the spinning body's `invariants()`).
  - The order is the slope of log drift against log step, fitted over 1/60 to 1/240 s.
  - Primary: Q4's drift at 1/30 s, and its order.
- **M2, a ship's turn:** the duel's ship (mass 8, half-extents 1.6 x 0.7 x 0.7) driven open loop through the thrust and
  torque that ship A was given in a duel of the PD autopilot against itself, flown with Q0. Each input is held for its
  1/30 s tick, from A's own start, until the duel ended.
  - 20 duels: seeds 91001 to 91010 of each scenario, the standoff and the joust.
  - The reading: the largest angle, over the duel, between the orientation with each step at 1/30 s and a reference.
    The reference is Q4 at 1/1920 s with the same inputs (C-reference holds it to Q0's own).
- **M3, the fights:** the headless duel as it is (`brain/pilot6dofPolicy.mjs`'s `duel()`: its 1/30 s, 30 s,
  collisions off).
  - Each of the five pilots on `es-box3d-6dof.html`'s Load Pilots panel flies as A against the PD autopilot as B: the
    PD autopilot itself, the fruit fly's Default, League and close-quarters pilots, and the GPU Brain's. Each is loaded
    through the importer the page uses and held to its weights' hash (215e26d9, 32789ff9, 360580a7 and 0ffd8554).
  - 40 fresh seeds of each scenario: 91001 to 91040 (no round has flown them).
  - Each duel is flown three times: with Q0; with Q4; and with Q0', which is Q0 with A's start moved 1e-9 m in y, the
    chaos control.
  - A duel's outcome, from A's side: a win (B dead and A not), a loss (A dead and B not), or a draw (anything else).
    Better means from a loss to a draw or a win, or from a draw to a win; worse is the reverse.
  - The reading, per pilot and scenario: Q4 against Q0, seed by seed, by an exact two-sided sign test on better
    against worse, with ties (the same outcome) set aside. At p < 0.01, Q4 **changes how that pilot fights**, and the
    direction is named. Otherwise it **changes nothing a sign test can see**. There are 10 such readings.
  - Reported beside each: the duels Q4 changed at all (its flips), the duels Q0' changed (the chaos's flips), and the
    wins, losses and draws under each step.
- **Reported, testing nothing, and not in the results file:** the step's time with Q0 and with Q4.

### Controls

- **C-unchanged:** with no `orientation` given, `rigidBody6dof.step()` and the duel are byte for byte what they were.
  These anchors were taken at e20350aa, before any of this round's code:
  - Ten duels, each pilot as A against the PD autopilot as B, seed 91100 (which nothing else here flies). Standoff:
    the PD autopilot 2e273b72, the Default cb71fd3c, the League b8cf6a84, the close-quarters 1d0eaca0, the GPU Brain
    1cff9908. Joust: b8c47981, 44c37caf, de3ad715, fe052a44 and d75958a1.
  - 1,000 steps from the states below, every number of each output in full, hashed: sha256 prefix 29216a6bf1de97d3.
  - The spinning body's gate, which flies its C4 again against its committed file to the bit, stays green.
- **C-omega:** Q4 changes the orientation only. Every angular velocity, in M1 and in M2, is the same to the bit under
  Q0 and Q4.
- **C-key:** the fixture spinning steadily at 2 rad/s about its largest axis (no wobble), for 30 s at 1/30 s, where the
  exact answer is a turn of w t. Q4 lands within 1e-5 rad of it, and Q0 misses it by more than 1e-3 rad, so the
  instrument can see a step's error. (For this spin, with y = w h / 2, Q0's turn per step falls short by about
  2 y^3 / 3 and Q4's by about y^5 / 60: 0.022 rad and 6.2e-7 rad over the 900 steps.)
- **C-reference:** M2's reference agrees with Q0 at 1/1920 s to within 1/30 of Q0's own error at 1/30 s, in every duel
  where that error is above 1e-9 rad (a first-order step at a 64th of the step should be off by about a 64th). Both
  steps converge on the same answer, so the reference is not the candidate's alone.
- **C-chaos:** Q0' against Q0, by the same sign test, changes no pilot in either scenario. A 1e-9 m nudge changes
  flights but shifts nothing, so the test is not reading chaos as an effect.
- **C-determinism:** each pilot's first seed of each scenario, flown twice with each step, is the same to the bit.

The 1,000 steps of C-unchanged, exactly as they were hashed:

```js
let s = 12345; const r = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296 - 0.5; };
const out = [];
for (let k = 0; k < 1000; k++) {
    const q0 = [r(), r(), r(), r()], n = Math.hypot(...q0), I = [1 + r() + 0.5, 1 + r() + 0.5, 1 + r() + 0.5].map((x) => x * 4);
    const st = RB.createBody({ mass: 2 + r() + 0.5, I, pos: [r() * 9, r() * 9, r() * 9], vel: [r(), r(), r()], q: q0.map((c) => c / n), w: [r() * 6, r() * 6, r() * 6] });
    const acc = RB.createAccumulator(); RB.applyForceAtPoint(acc, [r() * 20, r() * 20, r() * 20], [r(), r(), r()]); acc.torque = [acc.torque[0] + r() * 9, acc.torque[1] + r() * 9, acc.torque[2] + r() * 9];
    const nx = RB.step(st, acc, [1 / 30, 1 / 60, 1 / 240][k % 3]); out.push([...nx.pos, ...nx.vel, ...nx.q, ...nx.w].map(String).join(","));
}
// sha256 of out.join("\n"), its first 16 hex digits
```

### Predictions, fixed now, deciding nothing

- **P1:** Q4's free-body drift falls as at least the third power of the step from 1/60 to 1/240 s, and at 1/30 s it is
  under 1e-4, where Q0's is 1.6e-2 (85%).
- **P2:** in M2, Q4's largest angle from the reference is under a hundredth of Q0's in every duel (75%).
- **P3:** in M3 the sign test sees no change for any pilot in either scenario (75%).
- **P4:** Q4 changes the outcome of more duels than the nudge does, in each scenario (65%).

### What was seen first

- **The spinning body's C4 table:** the drift above, at 1/60, 1/240 and 1/960 s.
- **Probes of Q0 only, before this was written.** Q4 has not been flown.
  - The free body at 1/30 s, the ships' step: a drift of 1.61e-2. The spinning body's three steps, flown again, gave
    8.02e-3, 2.00e-3 and 5.00e-4.
  - The PD autopilot chasing the PD autopilot from the duel's starts, seeds 1 to 3 of each scenario (which M2 and M3 do
    not use), with no weapons, for 30 s, then A's inputs replayed open loop. The ship's spin reached 0.02 to 0.12 rad/s
    in the standoffs and 1.3 to 2.4 rad/s in the jousts. Q0 at 1/30 s and Q0 at 1/1920 s, with the same inputs, ended
    up as much as 0.11 degree apart in the standoffs and 2.29 degrees in the jousts.
  - C-unchanged's anchors, above. Only fingerprints were printed; no outcome was read.

### What each outcome buys

- **If P1 and P3 hold,** Q4 is the better step at no cost to the fights. The verdict recommends it as the engine's
  default, and the decision is Keith's. Adopting it changes every 6-DOF craft's trajectory, so every gate that flies a
  committed 6-DOF round again to the bit would have its record restated, with the reason.
- **If a sign test sees a change,** the verdict names the pilot and the direction. Adopting Q4 would change how that
  pilot fights, and every pilot was trained on Q0. The decision is Keith's, with that cost named.
- **If P1 fails,** the candidate is wrong. Nothing is recommended, and the verdict says why.
- This note changes no default and authorises no further round.

### Cost

Minutes.

### To be built

- `physics/mechanics/rigidBody6dof.mjs`: `step()` takes `orientation` ("euler", the default, or "rk4").
- `brain/pilot6dofPolicy.mjs`: `duel()` takes `orientation`, passed on to every step; `nudge`, A's start moved that
  far in y; and `record`, which receives A's start and its thrust and torque at every tick. All three are off unless
  given.
- `tools/roundhouse/orientationStep.mjs` (the library), `orientationStepRun.mjs` (the command) and
  `orientationStep-selfcheck.mjs` (the gate).
- The results go to `physics/mechanics/orientationStepResults.json`, committed before it is read.
