# The fights with both ships on box3d -- registered before any code (2026-11-04)

Keith, 2026-11-04, the first of five items after the PD-joust round's verdict: "Both ships on box3d".

Two earlier rounds flew only ship A on box3d, against ship B on the engine's own physics:

- `physics/mechanics/SIXDOF_BOX3D_WIP.md` found the PD autopilot losing its mirror jousts.
- `physics/mechanics/BOX3D_PD_JOUST_WIP.md` named box3d's scheme as the cause, by Keith's reading of its rule.

That setup is one-sided. Ship A's first-order turn costs it mutual kills against a ship that does not turn that way.
In a page where every ship flies box3d, both ships would turn that way.

> **When both ships fly box3d, does a pilot fight as it does when both fly the engine's own physics?**

Keith has already decided that box3d's ships are to be stepped by the engine's own physics, with box3d used only for
contacts. This round does not reopen that decision. It measures what the decision guards against in a world where
every ship is on box3d.

### The flights

Each pilot flies as A against the PD autopilot as B. The duel is as in sixdof-box3d: 1/30 s, collisions off. Each duel
is flown four ways:

- **E:** both ships on `rigidBody6dof.step()`, the plain duel.
- **BB:** both ships on box3d. A and B each get their own instance of sixdof-box3d's stepper
  (`physics/mechanics/rigidBody6dofBox3d.mjs`), through the duel's `stepA` and a new `stepB`.
- **A3:** A on box3d and B on the engine's own, as sixdof-box3d flew it. This is the one-sided contrast, on the same
  seeds.
- **E':** both on the engine's own, with A's start moved 1e-9 m in y. This is the chaos control.

The pilots are the five on `es-box3d-6dof.html`'s Load Pilots panel, as in sixdof-box3d: the PD autopilot, and the
fruit fly's Default, League and close-quarters pilots, and the GPU Brain's. Each is held to its weights' hash (215e26d9,
32789ff9, 360580a7, 0ffd8554).

The scenarios are the standoff and the joust. There are 100 fresh seeds of each: 96001 to 96100.

### The readings

- A duel's outcome is read from A's side as a win, a loss or a draw, as all three earlier rounds read it.
- In each of the 10 cells (pilot by scenario), BB, A3 and E' are each read against E, seed by seed. The test is the
  exact two-sided sign test on better against worse, with ties set aside, at p < 0.01. The test, the outcome and the
  reading are the orientation round's own functions.
- **The round's reading is BB against E.** At p < 0.01, both ships on box3d **change how that pilot fights**, and the
  direction is named. Otherwise they **change nothing a sign test can see**.
- Reported beside each cell: the tallies, the outcomes BB and A3 change, and the flights each moves.

### Controls

- **C-unchanged:** given no stepper, the duel is byte for byte what it was: sixdof-box3d's ten anchor fingerprints at
  seed 93100, and the step digest 5ba918e7cde707f7.
- **C-stepB:** `stepB` moves B and only B.
  - Given `stepB` as `rigidBody6dof.step()` itself, the duel is the plain duel to the bit, and `stepB` is called once
    a tick.
  - The first body `stepB` is handed is B's start, not A's.
- **C-replicates:** sixdof-box3d's committed flights of the PD autopilot's joust at seed 93001 fly again to the bit, on
  E and on A3.
- **C-box3d:** box3d is what is flown. Its worlds say box3d, and the ship's damping is zero by its effect, as in
  sixdof-box3d's C-box3d.
- **C-caps:** neither ship reaches box3d's caps in any BB flight: 400 m/s, or 0.25 pi rad a step (23.6 rad/s).
- **C-chaos:** E' against E changes nothing a sign test can see, in every cell.
- **C-determinism:** each pilot's first seed of each scenario, flown twice with BB, is the same to the bit.

### Predictions, fixed now, deciding nothing

- **P1:** with both ships on box3d, the PD autopilot's joust changes nothing a sign test can see (65%). Why: the change
  is the same for both ships. When the orientation round changed both ships' step at once, the PD autopilot's joust
  moved both ways (8 better, 7 worse).
- **P2:** no cell's BB reading sees a change (55%).
- **P3:** A3 makes the PD autopilot's joust worse for A, at p < 0.01, for the third time (90%).
- **P4:** in the PD autopilot's joust, BB changes fewer outcomes than A3 does (75%).

### What was seen first

- The two earlier rounds' results and verdicts, and Keith's decision.
- No duel has been flown with both ships on box3d, and `stepB` does not exist yet.
- No round has flown seeds 96001 to 96100; that was checked against every seed list the 6-DOF rounds keep.

### What each outcome buys

- **If BB changes nothing,** box3d's scheme costs a pilot nothing when every ship flies it. Keith's decision then
  guards two things: worlds that mix ships on box3d with ships on the engine's own, and every number recorded on the
  engine's own.
- **If BB changes a fight,** the verdict names the pilot and the direction. Keith's decision is then needed for
  box3d's pages, not only a safeguard.
- This note changes no default and authorises no further round.

### Cost

About a minute.

### To be built

- `brain/pilot6dofPolicy.mjs`: `duel()` takes `stepB`, off unless given, used for B as `stepA` is for A.
- `tools/roundhouse/box3dBothShips.mjs` (the library), `box3dBothShipsRun.mjs` (the command) and
  `box3dBothShips-selfcheck.mjs` (the gate).
- The results go to `physics/mechanics/box3dBothShipsResults.json`, committed before it is read.
