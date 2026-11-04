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

### Built, 2026-11-03, before the registered run (nothing of the registration above is changed)

- **The step:** `rigidBody6dof.step()` takes `orientation`: "euler", the default, or "rk4", which is the new
  `stepQuatRk4()`. Anything else is refused by name. Given no option, the registration's 1,000 steps hash to its anchor
  (29216a6bf1de97d3), and so do the same steps given "euler".
- **The duel:** `duel()` takes `orientation`, `nudge` and `record`, all off unless given. Given none, the ten anchor duels
  have the registration's fingerprints.
  - `record` also keeps A's body at the end, which the registration did not list. With it, the gate holds a replay of
    the inputs to the duel's own A, to the bit.
- **The round:** `tools/roundhouse/orientationStep.mjs` (the library), `orientationStepRun.mjs` (the command) and
  `orientationStep-selfcheck.mjs` (the gate, about 1 s). The command refuses an existing results file and prints only
  where it wrote it and the step's time.
- **What the gate flies, and what it does not.** It never runs the registered round or the command. It flies:
  - C-unchanged's anchors and C-key, both fixed exactly by the registration;
  - a convergence check on a body and steps the round does not use (moments 1, 2, 3, under a torque, 6 s at 1/20 to
    1/80 s);
  - a miniature: two pilots, seeds 92001 and 92002, M1 at 1/20 to 1/80 s for 2 s, and a nudge of 1e-3 m.
- **Seen on the way, and said here:** C-key came out as its arithmetic said (Q0 0.0222 rad off, Q4 6.17e-7 rad). In the
  convergence check and the miniature, Q4's error fell as the fourth power of the step and Q0's as the first. None of
  these is a registered measurement, and the registered run has not been flown.
- **Sabotaged** with the byte-safe runner: 34 designs (G1 to G34), each red by name; the counts are in the gate's header.
  Three would have gone 0 red against the first draft, and the gate was fixed before the series:
  - a reference that was Q0's own passed C-reference, with a ratio of 0;
  - an order fitted over the first two steps could not show while the miniature's fit was its first two steps;
  - a dropped nudge could not show in a fingerprint that rounds to a millimetre.
- **The engine's own gates:** all 103 that reach the 6-DOF step, the duel, the spinning body or freeRotation were run.
  Four were red:
  - `brain/battleshipFight-selfcheck.mjs` (9 rows) and `tools/ship/battleshipPage-selfcheck.mjs` (1): red the same at the
    registration's commit, at this branch's merge-base and at main's head (v4911), and in no red register. They are not
    this round's, and they are reported.
  - `tools/ship/gateReach-selfcheck.mjs`: its recorded census says 579 gates; there are 584, three of them already at
    the merge-base. That record is re-baked at a ship.
  - `render/compassView-selfcheck.mjs`, a browser gate: red once with four gates running at a time, green alone, and
    green at the registration's commit.

### The verdict, 2026-11-04 (read from the committed file, after it was committed)

The registered run wrote `physics/mechanics/orientationStepResults.json` at d2c157ad: 136,030 bytes, sha256
2226e37ff9989ed1. It was committed unread at a40508e9, then read.

**M1, the free body:** the world-frame angular momentum's largest drift over the 30 s.

| step | Q0 | Q4 |
|---|---|---|
| 1/30 s | 1.61e-2 | 9.84e-8 |
| 1/60 s | 8.02e-3 | 6.15e-9 |
| 1/240 s | 2.00e-3 | 2.40e-11 |
| 1/960 s | 5.00e-4 | 1.03e-13 |

- Over 1/60 to 1/240 s, Q4's drift falls as the 4.00th power of the step, and Q0's as the 1.00th.
- The energy's drift and the flips are the same under both steps, at every step. The angular velocity is the same to
  the bit (C-omega): only the orientation moved.

**M2, a ship's turn:** the largest angle from the reference over each duel (174 to 397 ticks).
- In the standoffs, where the ship's spin reached at most 0.110 rad/s, Q0 was 3.59e-4 to 1.84e-3 rad off (0.02 to 0.11
  degree). Q4 was at most 2.47e-14 rad off, which is rounding.
- In the jousts, with spins of 1.58 to 2.55 rad/s, Q0 was 2.65e-2 to 4.27e-2 rad off (1.52 to 2.45 degrees). Q4 was
  4.29e-9 to 3.32e-8 rad off.
- Q4 was under a hundredth of Q0 in every duel. The largest ratio was 7.76e-7.

**M3, the fights:** each pilot as A against the PD autopilot, 40 seeds, as wins-losses-draws.

| pilot | scenario | Q0 | Q4 | better | worse | p | outcomes the nudge changed | flights the nudge moved |
|---|---|---|---|---|---|---|---|---|
| the PD autopilot | standoff | 0-0-40 | 0-0-40 | 0 | 0 | 1.00 | 0 | 0 |
| the PD autopilot | joust | 3-9-28 | 0-5-35 | 8 | 7 | 1.00 | 0 | 0 |
| the Default | standoff | 40-0-0 | 40-0-0 | 0 | 0 | 1.00 | 0 | 0 |
| the Default | joust | 0-39-1 | 0-38-2 | 1 | 0 | 1.00 | 0 | 4 |
| the League pilot | standoff | 39-0-1 | 39-0-1 | 0 | 0 | 1.00 | 0 | 0 |
| the League pilot | joust | 0-40-0 | 0-40-0 | 0 | 0 | 1.00 | 0 | 18 |
| the close-quarters pilot | standoff | 40-0-0 | 40-0-0 | 0 | 0 | 1.00 | 0 | 0 |
| the close-quarters pilot | joust | 17-8-15 | 19-12-9 | 7 | 7 | 1.00 | 0 | 15 |
| the GPU Brain's pilot | standoff | 30-0-10 | 31-0-9 | 2 | 1 | 1.00 | 0 | 0 |
| the GPU Brain's pilot | joust | 9-28-3 | 10-25-5 | 4 | 1 | 0.375 | 0 | 0 |

- In no cell does the sign test see a change. The smallest p is 0.375, in the GPU Brain's jousts (4 better, 1 worse).
- Q4 changed 38 of the 400 outcomes: 3 in the standoffs, all the GPU Brain's (2 better, 1 worse), and 35 in the jousts
  (20 better, 15 worse).
- The nudge changed no outcome. It moved 37 flights, all jousts (the Default's 4, the League pilot's 18 and the
  close-quarters pilot's 15), and none of them ended differently.

**The predictions:**
- **P1: right.** Q4's order is 4.00, and its drift at 1/30 s is 9.84e-8.
- **P2: right.** The largest ratio of Q4's angle to Q0's is 7.76e-7.
- **P3: right.** No pilot's fight changes, in either scenario.
- **P4: right.** Q4 changed 3 outcomes to the nudge's 0 in the standoffs, and 35 to 0 in the jousts.

**The controls,** all held:
- C-unchanged: the step digest 29216a6bf1de97d3 and the ten anchor fingerprints.
- C-omega: the angular velocity the same to the bit in M1 and M2, and every replay landed on the duel's own A.
- C-key: Q0 0.0222 rad off the exact turn, Q4 6.17e-7 rad.
- C-reference: all 20 duels checked, the worst ratio 1/64.0.
- C-chaos: no cell; every p is 1.
- C-determinism: 40 flights, each the same twice.

**What this says, and what it does not.**
- **It says:** Q4 removes the drift. At the ships' step it brings the orientation of a ship in a joust from up to 2.45
  degrees off to 3.3e-8 rad, for about 0.2 microseconds more a step (0.485 and 0.690 microseconds, reported outside the
  file).
- **It says:** Q4 changes individual jousts, 35 of 200, and in no cell in a direction a sign test can see.
- **It does not say** how the aircraft, the sub, the multirotor or the rotorcraft change, or the page's three-a-side
  battle, or fights with collisions on: none was flown. Nor whether a pilot trained under Q4 would fight differently.
- **It does not say** the nudge measured the fights' chaos. It changed no outcome, so it bounds nothing: a 1e-9 m
  nudge does not grow enough in these fights to change one, and Q4's change is larger than that from the first tick.

**What follows, as the registration said.** P1 and P3 hold, so the verdict recommends Q4 as the engine's default, and
the decision is Keith's. Adopting it changes every 6-DOF craft's trajectory, so every gate that flies a committed
6-DOF round again to the bit would have its record restated, with the reason. This verdict changes nothing.

**The verdict, as code:** section 6 of `tools/roundhouse/orientationStep-selfcheck.mjs` re-derives every number above
from the committed file. It re-derives each M3 cell from its 40 flights by the library's own rules, and each prediction
by its registered rule. It holds this section's text to the file's numbers, and it flies a sample of the round again
(34 flights) against the file, to the bit. Sabotaged with the byte-safe runner: 16 designs (V1 to V16), each red by
name. They edit the committed file, this note or the code, and the counts are in the gate's header. Every row of
section 6 went red under at least one.
- **Two of my own numbers were wrong in the first draft of this section, and are corrected above.** I wrote Q0's drift
  at 1/960 s as 5.01e-4; it is 5.0047e-4, which is 5.00e-4. And I wrote that the standoffs' spin "stayed under 0.11
  rad/s"; the largest was 0.1102 rad/s. Section 6's M2 row went red on the second, before anything was committed.

### Seen after the verdict (2026-11-04): what making Q4 the default would turn red

Not part of the round, and it decides nothing. It measures the cost the verdict names, for Keith's decision. With the
byte-safe runner, `rigidBody6dof.step()`'s default was set to "rk4" for one run of the 102 gates that reach the step,
the duel, the spinning body or freeRotation (this round's gate aside), then restored, sha256 identical.
- **39 gates went red, 150 rows.** One of them, `tools/ship/gateReach-selfcheck.mjs`, is red the same either way (its
  census). Two were red already and went redder: `brain/battleshipFight-selfcheck.mjs` from 9 rows to 30, and
  `tools/ship/battleshipPage-selfcheck.mjs` from 1 to 5. `render/brainPanel-selfcheck.mjs` timed out at 900 s.
- **That leaves 35 green gates that would go red.** Every one pins a 6-DOF flight or fight to a recorded number:
  - the trained pilots' committed rounds (`tools/ship/train6dofMlp*`, `train6dofPilot`, `train6dofLeague`,
    `trainFlightPilot`, `trainRotorPilot`, `trainSeatGunner`, `trainDogfightLeague`, `sixdofPageFight`);
  - the pilots' own pinned scores (`brain/pilot6dof*`, `pilotAircraft*`, `pilotDrone*`, `pilotFlight*`, `pilotJet*`,
    `pilotRotor*`, `autopilotJet`);
  - the tasks and fights (`brain/droneTask`, `rotorTask`, `flightTask`, `dogfightTask`, `jetFight`, `bomberFight`,
    `shipCollision6dof`), the craft (`physics/mechanics/flightModel6dof`, `capitalShip`), the sub's dropout
    (`render/subDropoutScene`, `tools/subDropout`), and the spinning body's own C4 (`tools/roundhouse/spinningBody`).
- So adopting Q4 is a change to every 6-DOF craft's recorded behaviour, aircraft, rotorcraft, drones and the sub among
  them. None of those was flown in this round, and some of those records belong to other work in this tree.

### Decided (2026-11-04)

Keith, after the verdict: "make the fourth-order step the default". So `rigidBody6dof.step()` now moves the
orientation by RK4 when it is given no `orientation`, and "euler" is still the first-order step, by name.
- **What changed:** every 6-DOF craft in the engine and on its pages turns by RK4: the ships, the aircraft, the sub,
  the multirotor and the rotorcraft. Flown under both steps, each family's baseline moved by 0.004% to 0.33%, and the
  same flights fell or were lost (section 7 of the round's gate).
- **What was kept:** every 6-DOF number recorded before this day was measured under the first-order step. That covers
  the trained pilots and the rounds that made them, the tasks' pinned baselines they were measured against, and the
  fights pinned hit for hit. They quote one another, so they are kept together, under the step they were measured
  with:
  - The 36 gates that hold them import `physics/mechanics/rigidBody6dofEuler.mjs` first. It sets the first-order step
    for that gate's process, its worker processes and the pages its scripts open. None of their numbers changed.
  - As the spinning body's C2 and C3 still fly the Jolt settings they were registered with, its C4 now names the
    first-order step, and so does this round's Q0.
- **How the setting travels:** `setOrientationDefault()` changes what no option means and carries it as
  SWEK_6DOF_ORIENTATION: an environment variable in node, a sessionStorage entry in a browser.
- **What it does not do:** no record was re-pinned to RK4. A gate that holds first-order numbers tests the first-order
  step, and section 7 of the round's gate holds the new default. Pins taken under RK4 would be measured afresh.
- **Two gates were left as they were:** `render/brainPanel-selfcheck.mjs`, whose time-out in the measurement above
  came from four heavy gates running at once (alone, under RK4, it passes in 41 s), and nothing else in it moved. And
  the two battleship gates, red on main, are exactly as red as on main.
- **Gated:** section 7 of `tools/roundhouse/orientationStep-selfcheck.mjs` holds the default, the setter and its carrier,
  the first-order module and who imports it, and the craft families under both steps. Sabotaged with the byte-safe
  runner: 12 designs (D1 to D10b), against that gate and the gates the default reaches, each red by name; the counts
  are in the gate's header.
