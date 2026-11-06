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

## Build record (2026-11-04)

Built as listed above.

- `duel()` takes `stepB`. Given no stepper, the duel is byte for byte what it was (C-unchanged).
- Two earlier gates read the duel's signature from its source. Each went red once `stepB` was added, and each was
  restated to allow it after `stepA`:
  - `tools/roundhouse/orientationStep-selfcheck.mjs`;
  - `tools/roundhouse/sixdofBox3d-selfcheck.mjs`.

### Found while building: box3d's spin cap acts in one cell, so C-caps will fail

On the miniature's seeds (98001 to 98004, unregistered), the League pilot spins its ship to box3d's spin cap in the
joust. The cap is 0.25 pi rad a step, so 23.56 rad/s at 1/30 s. It is reached on every one of those seeds, both with
both ships on box3d and with A alone.

Every other cell's top spin stays under 10 rad/s. The highest is the close-quarters pilot's joust, at 9.43 rad/s. The
PD autopilot's highest is 2.72 rad/s.

So in that one cell, box3d's cap acts as well as its scheme. **C-caps is left as registered, and it will fail.**

Each cell now also reports, testing nothing:

- the top speed and spin of its BB and A3 flights;
- how many of those flights reached the cap, which is counted as coming within 1e-3 rad/s of it, since box3d reads
  back in float32.

The verdict will name the cells the cap touched. sixdof-box3d did not watch box3d's caps.

### Flown while building, none of it a registered measurement

- **The controls:**
  - C-unchanged.
  - C-stepB, which now takes the duel as a parameter, so it can also be shown failing on a duel that moves A with
    `stepB` and on one that ignores it.
  - C-replicates, at seed 93001.
  - C-box3d.
  - C-chaos and C-determinism, on the miniature.
- **The miniature:** three pilots, seeds 98001 to 98004, a 1e-3 m nudge.
  - Printed: its caps (11.9 m/s and 23.562 rad/s over 11,192 ticks), every cell's top spin with both ships on box3d,
    the flights each way moved, and one seed's four fingerprints.
  - No reading, tally or outcome was printed.

### The gate

`tools/roundhouse/box3dBothShips-selfcheck.mjs` has 24 rows and takes about 1.5 s. Its header logs 23 sabotages, each
red by name in the end.

- G16 had a row written for it before any sabotage ran.
- G13's first design did not parse, so the gate died before printing a row. It was redone as code that runs, and it is
  red.

## The verdict, 2026-11-04

Read from `physics/mechanics/box3dBothShipsResults.json` (388,630 bytes, sha256 f69fdef31acb8ba6), committed at 10bd34ac
before anyone read it. The run took 40 s.

**With both ships on box3d, no pilot fights differently by a sign test, in either scenario. The PD autopilot's mirror
joust stays even. With A alone on box3d, the PD autopilot loses its joust again, for the third time. So box3d's scheme
costs a pilot nothing when every ship flies it. The cost the earlier rounds found is the mismatch between a ship on
box3d and a ship on the engine's own.**

Each pilot flies as A against the PD autopilot, over 100 seeds of each scenario. Outcomes are from A's side as
wins-losses-draws, and BB and A3 are each read against E:

| A | scenario | E | BB | better | worse | p | A3 | better | worse | p |
|---|---|---|---|---|---|---|---|---|---|---|
| the PD autopilot | standoff | 0-1-99 | 0-0-100 | 1 | 0 | 1.00 | 5-15-80 | 5 | 14 | 0.0636 |
| the PD autopilot | joust | 2-25-73 | 2-22-76 | 19 | 15 | 0.608 | 1-73-26 | 0 | 48 | 7.11e-15 |
| the Default | standoff | 98-0-2 | 97-0-3 | 0 | 1 | 1.00 | 98-0-2 | 0 | 0 | 1.00 |
| the Default | joust | 0-93-7 | 0-93-7 | 3 | 3 | 1.00 | 0-94-6 | 3 | 4 | 1.00 |
| the League pilot | standoff | 97-0-3 | 97-0-3 | 0 | 0 | 1.00 | 97-0-3 | 0 | 0 | 1.00 |
| the League pilot | joust | 0-100-0 | 0-100-0 | 0 | 0 | 1.00 | 0-100-0 | 0 | 0 | 1.00 |
| the close-quarters pilot | standoff | 96-0-4 | 96-0-4 | 0 | 0 | 1.00 | 96-0-4 | 0 | 0 | 1.00 |
| the close-quarters pilot | joust | 63-19-18 | 69-18-13 | 13 | 8 | 0.383 | 67-19-14 | 13 | 10 | 0.678 |
| the GPU Brain's pilot | standoff | 73-0-27 | 73-0-27 | 2 | 2 | 1.00 | 73-0-27 | 1 | 1 | 1.00 |
| the GPU Brain's pilot | joust | 19-67-14 | 20-63-17 | 7 | 3 | 0.344 | 20-67-13 | 3 | 3 | 1.00 |

- **All ten BB readings change nothing a sign test can see.** The smallest p is 0.344.
- **The PD autopilot's joust:** BB changes 34 outcomes, 19 better and 15 worse. A3 changes 48, and every one is worse
  (p = 7.11e-15). It is A3's only reading below 0.01. The PD autopilot's standoff under A3 reads 5 better and 14 worse,
  p = 0.0636.
- **The nudge** changed no outcome in any cell. It moved 91 flights in the jousts and none in the standoffs. BB and A3
  each moved all 1,000 of their flights.
- **box3d's caps, and C-caps.** C-caps failed, as the build record said before the run that it would.
  - Every one of the League pilot's 100 BB jousts and 100 A3 jousts reached box3d's spin cap of 23.56 rad/s.
  - No other cell came near the cap. The highest top spin elsewhere is the Default's joust, at 15.57 rad/s. The top
    speed was 21.69 m/s.
  - The League pilot loses all 100 of its jousts in all four ways, so the cap changed no outcome there.

**The predictions:**

- **P1: right.** With both ships on box3d, the PD autopilot's joust changes nothing a sign test can see (p = 0.608).
- **P2: right.** No cell's BB reading sees a change.
- **P3: right.** A3 makes the PD autopilot's joust worse for A, p = 7.11e-15.
- **P4: right.** In the PD autopilot's joust, BB changes 34 outcomes against A3's 48.

**The controls:**

- C-unchanged held: the ten anchors and the step digest.
- C-stepB held: 297 calls in 297 ticks, the first handed B's start.
- C-replicates held: sixdof-box3d's seed 93001, on E and on A3.
- C-box3d held.
- C-caps did not hold, as above.
- C-chaos held: no nudge changed an outcome.
- C-determinism held: 20 flights, each the same twice.

**What this buys:**

- box3d's scheme costs a pilot nothing when every ship flies it, in all ten cells.
- Keith's decision, to step box3d's ships with the engine's own physics and use box3d only for contacts, therefore
  guards two things:
  - worlds that mix ships on box3d with ships on the engine's own, where the PD autopilot loses its jousts;
  - every number recorded on the engine's own.
- Nothing is changed, and this note authorises no further round.

**Gated.** Section 6 of `tools/roundhouse/box3dBothShips-selfcheck.mjs` re-derives every number above from the
committed file, holds this verdict to them, and flies a sample of the round again.
