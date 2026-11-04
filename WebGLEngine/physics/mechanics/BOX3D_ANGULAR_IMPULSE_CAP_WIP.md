# Who spins a body past Jolt's cap on box3d -- a census, registered before any code (2026-11-04)

Keith, 2026-11-04, the third of five items after the PD-joust round's verdict: the backlog entry
`box3d-angular-impulse-cap`.

The physics facade's two backends disagree on `angularImpulse()`:

- **Jolt:** `AddAngularImpulse` clamps the resulting spin at its default max angular velocity, 15 pi rad/s
  (47.1239), at the impulse.
- **box3d:** `ApplyAngularImpulse` does not clamp. A spin past its cap is brought down only inside its next step, at
  0.25 pi rad a step: 15 pi at 1/60 s, 7.5 pi at 1/30 s.

`blob-pages-box3d` measured the gap: a lone sliver read 47.1239 rad/s at once on Jolt and 75,500 on box3d. The
blob pages lost 12 of 1,410 fragments through the floor or over the rim. `fx/fracture/debrisPhysics.js` now caps its
own debris at the throw. Nothing else does.

> **Which of the facade's other callers, run on box3d, give a body a spin past 15 pi rad/s at the impulse?**

### The call sites

Each site is a call of `angularImpulse()` in the tree, found by `git grep` at this note's commit, with gates and the
vendored code left out:

| Site | Where it is flown |
|---|---|
| `world/buildingTopple.mjs:305` | its gates |
| `physics/raceCar.mjs:243` | its gates |
| `physics/kaijuBox3d.js:84` (`throwObject`) | its gates |
| `physics/esHullCombat.js:92` | its gates |
| `physics/backendDivergence.mjs:24` | its gates |
| `physics/fluidBox3d.js:62` | its gates |
| `render/slugShatter.mjs:103` | its gates |
| `physics/jolt/joltRagdoll.js:73` (`fling`) | its gates |
| `physics/mechanics/rigidBody6dofBox3d.mjs:59` | its gates |
| `fx/fracture/debrisPhysics.js:52` | its gates (already capped at the throw) |
| `ragdoll.html:283` | the page |
| `flesh.html:305` | the page |
| `box3d-replay.html:162` | the page |
| `box3d-vs-jolt.html:49` | the page |

- **Pass-throughs, not sites.** Three functions hand a call on to box3d unchanged, and a call through one of them
  belongs to whoever called it:
  - the facade itself, `physics/box3d/box3dLoader.js:51`;
  - the raw world in `render/slugTicker.mjs:101`, which calls box3d's export without the loader;
  - `physics/kaijuBox3d.js:76`, the kaiju's `angularImpulse(rec, v)`.
- **Not box3d.** Three pages give `angularImpulse()` to a JavaScript stand-in of their own and never reach box3d:
  `box3d-demo.html:45`, `es-hull-combat.html:44` and `fluid-box3d.html:49`.
- **Calls made by gates themselves** are tests, not the tree's callers. They are recorded and decide nothing.
- **A site the hook finds outside the table,** in a file that is not a gate, is reported as found and counts like any
  other.

### The measurement

A hook wraps box3d's own export, `_swk_body_ang_impulse`, on every box3d instance a process makes:

- **In node,** a loader hook stands in for `vendor/box3d/box3d.js`. Every route to box3d goes through that file:
  `box3dNode.mjs`, the facade, and the modules that make their own instance.
- **In a page,** the same wrapper is served in place of `/vendor/box3d/box3d.js`.

After each call the hook reads the body's spin back from box3d (world frame, rad/s). It records the site: the first
frame of the call's stack outside the hook and the three pass-throughs.

**A call is past the cap when the spin it leaves exceeds 15 pi x 1.001 rad/s.** That is `debrisPhysics.js`'s
`MAX_SPIN` times its `SPIN_SLACK`, so a spin Jolt itself would leave in float32 is never counted.

### The corpus

- **N, the gates:** every gate that reaches the file of a module site through the import graph
  (`tools/ship/affected.mjs`'s `buildGraph`) at the census's commit, this round's own gate left out. At this note's
  commit that is 163 gates.
  - Each is run once under the hook, two at a time, with an 1,800 s limit. They run in a scratch worktree of the
    commit, so the files gates rewrite as they run never reach this tree.
  - Each gate's child processes are hooked through `NODE_OPTIONS`.
  - Only calls on box3d are seen. A gate that flies Jolt alone records nothing.
  - A gate's verdict is not read: a red gate's calls count as any other's.
- **P, the pages:** each of the four page sites is opened in the pre-installed Chromium, served from the worktree,
  with box3d under the hook. Its own trigger is pressed as a person would press it:
  - `ragdoll.html` and `flesh.html`: Drop, then Shove about two seconds later, then five seconds more;
  - `box3d-replay.html`: Record a scenario here;
  - `box3d-vs-jolt.html`: nothing to press. Its scene is built on load, and it is watched for five seconds.
- **Not driven, said plainly:** pages that reach a module site only through that module (the blob pages, the kaiju
  and race pages). A gate that drives one of them in a browser is likewise not seen. Each module site is measured as
  its gates fly it, and those gates stand for the pages.

### The readings

For each site:

- the calls seen;
- the largest spin a call left;
- the number of calls past the cap;
- the gate or page where the largest was seen.

The census reads which sites are past the cap.

### The decision rule, fixed now

**The cap goes in if any site other than `debrisPhysics.js:52` has a call past the cap.** It is built after the
verdict as an engineering fix:

- `box3dLoader.js`'s `angularImpulse()` caps the spin it leaves at 15 pi, its axis kept, as Jolt does.
- So does any pass-through that skips the loader, if a site past the cap goes through it.
- Every gate the census names for a site past the cap is run before and after the fix. Those whose box3d records
  move are restated with the reason.

**Otherwise the entry closes with no change.** The disagreement then stays where only the debris met it, and the
debris is capped already.

### Controls

- **C-transparent:** the hook changes nothing. A box3d scene with angular impulses gives the same state hash at every
  step, hooked and unhooked, in two processes. The scene is `backendDivergence.mjs`'s, 14 boxes for 120 steps.
- **C-reads:** the hook reads what is there.
  - A lone light box given a known impulse reads I^-1 J, from the inertia box3d reports for it, to float32.
  - `debrisPhysics.js` flown on box3d with its cap off reads past the cap, as the blob pages found.
- **C-jolt:** the claim the census rests on. The same lone box on Jolt reads 15 pi right after the same impulse.
- **C-site:** a call made from a known line is put to that file and line. A call made through each pass-through is
  put to its caller, not to the pass-through.
- **C-reach:** every module site is reached by N at least once, and every page site by P. A site that is not reached
  is named with the reason, and the census says nothing about it.
- **C-complete:** every gate in N and every page in P is listed with how it ended. A gate that timed out or crashed is
  named, and the calls it made are kept.
- The controls' own calls are kept apart from the corpus's readings.

### Predictions, fixed now, deciding nothing

- **P1:** `ragdoll.html:283` and `flesh.html:305` are past the cap (90%).
  - Both pages' shove gives body 1 the impulse [0, 0, 3].
  - Body 1 is the pelvis, since body 0 is the ground, and the pelvis is a box of 0.1088 kg.
  - A lone box of its size reads 531.62 rad/s right after that impulse.
- **P2:** `debrisPhysics.js:52` is past the cap, its readings taken before its own cap acts (99%).
- **P3:** `joltRagdoll.js:73` is past the cap, if any gate flies `fling` on box3d (60%). Its parts weigh 0.01 to
  0.06 kg.
- **P4:** no other module site is past the cap (65%).
  - By arithmetic, `backendDivergence.mjs:24` leaves at most 15.6 rad/s on its unit boxes.
  - `rigidBody6dofBox3d.mjs:59` turns ships, whose spins stay under 10 rad/s outside the League pilot's joust.
- **P5:** `box3d-replay.html:162` is under the cap (95%). By arithmetic it leaves at most 3.2 rad/s.
- **P6:** `box3d-vs-jolt.html:49` is not reached, because that page never starts box3d (90%; see below). Were it
  reached, its unit boxes would be left at 9.0 rad/s at most.
- **P7:** the cap goes in (90%). This follows from P1.

### What was seen first

- `blob-pages-box3d`'s measurement, and the arithmetic above.
- One lone box of the pelvis's size on box3d, given the pages' impulse, measured while writing this note: 531.62
  rad/s at once, and an inertia about z of 0.005643. It was not the page, and it is not a census reading.
- A first try at the node half of the hook, in the scratchpad, on that same box, to see that a loader hook can stand
  in for `box3d.js`. It put the call to the scratch script's line and read 531.62. No site has been run under it.
- **Seen on the way, and left as they are.** The census measures the pages as they are.
  - `ragdoll.html` and `flesh.html` say their shove is on the chest and the left lower arm, as `angularImpulse(1, ...)`
    and `impulse(4, ...)`. Body 0 is the ground, so 1 is the pelvis and 4 the left upper arm. Correcting the indices
    would change both pages' shove, so it is left for Keith.
  - `box3d-vs-jolt.html` calls `createWorld()` without first calling the loader's `init()`. The loader throws "call
    init() first", the page catches it, and it then says box3d's WASM is not built, though it is. That was read from
    the page's source, not run. It is the reason for P6, and it is left for Keith.

### What each outcome buys

- **If a site is past the cap,** box3d and Jolt give that caller different bodies from the same call, and the cap
  makes them agree at the impulse. Its cost is a spin read in every box3d `angularImpulse()`: one read of the
  world's spins, as `debrisPhysics.js`'s cap reads them.
- **If none is,** the facade's disagreement is real but nothing in the tree but the debris meets it.
- Apart from the cap its decision rule names, this note changes no default and authorises no further round.

### Cost

Two hours or so for N, two at a time, and a few minutes for P.

### To be built

- `tools/roundhouse/angularImpulseHook.mjs`: the hook, both for node's loader and for a page.
- `tools/roundhouse/angularImpulseCensus.mjs`: the library. It holds the sites, the corpus, the controls and the
  readings.
- `angularImpulseCensusRun.mjs`: the command.
- `angularImpulseCensus-selfcheck.mjs`: the gate.
- The results go to `physics/mechanics/box3dAngularImpulseCapResults.json`, committed before they are read.

## Build record (2026-11-04)

Built as listed above, plus one file the list did not name: `tools/roundhouse/angularImpulseWatch.mjs`. It is the part
of the hook that node and a page share, and a page imports it as it is.

### A correction to the note: N is 156 gates, not 163

The note's rule is every gate that reaches the file of a module site. At this commit that is 156 gates.

The 163 the note gives also counted `render/slugTicker.mjs`, which is a pass-through, not a site's file. Seven gates
reach it and no site's file: `kenneyKit`, `raceTrack`, `slugNapalm`, `slugTicker`, `voxelBodies`, `voxelDamage` and
`voxelSave`. A call through the ticker's raw world belongs to whoever made it, and the only such site, `slugShatter.mjs`,
is reached by gates of its own.

**The census follows the rule.**

### How the parts were built

- **The hook in node** is a loader hook registered from `angularImpulseHook.mjs` when `SWK_ANG_CENSUS_DIR` is set.
  - It wraps every box3d instance a process makes.
  - Each process, and each worker thread, writes its own tally. It writes once at start, every two seconds while it
    runs, and when it exits, so a run killed at its limit keeps what it saw.
  - A run that ends leaving a child of its own running has its whole process group stopped. Its output pipes then
    close at once, instead of the census waiting out the 1,800 s limit.
- **The pages** are served from the tree by the census's own server. The stand-in is served for
  `/vendor/box3d/box3d.js`, and the real file for `?census-real`.
  - On `box3d-replay.html` the run waits, up to 60 s, for the page's own "recorded" mark after pressing Record. That is
    how it knows the recording ran.
  - A page is given 10 s to start box3d. One that does not is still run through its steps, and is recorded as not having
    started box3d.
- **The routes** are a request handler, `treeHandler()`. The gate asks it directly, without a socket, so the gate fetches
  nothing itself, and `tools/ship/gateAxioms-selfcheck.mjs`'s count of gates that call `fetch` is unchanged.
- **The table's check** compares the number of calls in each file, not their lines. An edit that only moves a line
  leaves it green, and a new call anywhere turns it red.

### Flown while building, none of it a census reading

- **The controls:**
  - **C-transparent:** 120 steps, the same state hash and harness hash at every step, with the hooked run seeing its 14
    calls.
  - **C-reads:**
    - The lone box read 112.494489 rad/s, against 112.494489 for |I^-1 J|, a relative difference of 1e-9.
    - Blob-avatar's debris at seed 1, flown with its cap off: 16 fragments, the largest at 215.96 rad/s, one of them past
      the cap.
  - **C-jolt:** 47.12389 rad/s.
  - **C-site:** all three routes put to the probe's own lines.
- **The page machinery** ran on pages of the gate's own, served beside the tree. None of the four registered pages was
  opened.
- **`run()` itself** ran on a miniature: two scratch scripts and a page of the gate's own.

### The gate

`tools/roundhouse/angularImpulseCensus-selfcheck.mjs`, 50 rows in ten sections. It never runs the census.

- **Sabotaged:** 57 times through the byte-safe runner. Every one went red by name and none went 0 red. The log is in
  the gate's header.
  - The first 52 are G1-G56; four numbers were dropped before the run.
  - Five more came after the server's routes moved into a handler the gate asks directly: G29', G30', G57, G58 and
    G57'.
  - G57 was a finding. The row for a page that never starts box3d passed with its page not served at all, because a
    404 page never starts box3d either. That row now waits for the page's own word that the loader refused it.
- **Three gaps closed before any sabotage:** in the gate's first draft, nothing held the run to stopping a gate's leftover
  child, nothing measured that the corpus runs two at a time, and nothing flew `run()` itself. A row was added for each.

### To run it

From a scratch worktree of the commit that carries this record, with the tree's `ai-bridge/node_modules` linked in:

    node tools/roundhouse/angularImpulseCensusRun.mjs

The results file is then copied into this tree byte for byte, and committed before it is read.

## The run and its verdict (2026-11-04)

**The run.**

- It was flown from a scratch worktree of e1a56d0d, with its 156 gates under the hook two at a time, and then the four
  pages in Chromium. It took 35.3 minutes.
- Its results, `physics/mechanics/box3dAngularImpulseCapResults.json` (196,524 bytes, sha256 12d58bbb4f2d3807), were
  copied into this tree byte for byte, committed unread at 5a14976d, and then read.
- Every reading below is re-derived from the 160 runs' own tallies by the gate's section 11.
- A first start of the same run was killed at gate 133 of 156 by a restart of the session's machine. It had written
  nothing and none of it was read. The run was started again from the beginning, at the same commit.

### The decision rule, applied: the cap goes in

Two sites besides the debris have a call past 15 pi x 1.001 rad/s: `ragdoll.html:283` and `flesh.html:305`. Each is
the page's shove, one call each, on the pelvis.

| Site | Calls | Largest spin, rad/s | Past the cap |
|---|---|---|---|
| ragdoll.html:283 | 1 | 538.52 | 1 |
| flesh.html:305 | 1 | 531.73 | 1 |
| fx/fracture/debrisPhysics.js:52 | 4,942 | 2,574,172 | 217 |
| physics/mechanics/rigidBody6dofBox3d.mjs:59 | 79,399 | 40.00 | 0 |
| world/buildingTopple.mjs:305 | 21 | 36.00 | 0 |
| physics/raceCar.mjs:243 | 1,739,627 | 19.04 | 0 |
| render/slugShatter.mjs:103 | 36 | 3.57 | 0 |
| box3d-replay.html:162 | 10 | 3.23 | 0 |
| six more | 0 | not reached | |

### The predictions

- **P1 right.** Both pages are past the cap, at 538.52 and 531.73 rad/s, near the lone box's 531.62.
- **P2 right.** The debris is past it, with its readings taken before its own cap acts: 217 of 4,942 calls, the largest
  2,574,172 rad/s, which is blob-pages-box3d's own number.
- **P3 not tested.** No gate flies `joltRagdoll.js`'s fling on box3d, and that was the prediction's own condition. Its
  gates fly Jolt.
- **P4 right, for the module sites that were reached, and only those.** None of the four reached is past the cap. Five
  were not reached.
- **P5 right.** `box3d-replay.html` stays under the cap, at 3.23 rad/s at most, as its arithmetic says.
- **P6 right.** `box3d-vs-jolt.html` was not reached. The page ran its five seconds and never started box3d.
- **P7 right.** The cap goes in.

### The controls

- C-transparent, C-reads, C-jolt, C-site and C-complete held. No gate of the 156 timed out or was stopped, and every
  page completed its steps.
- **C-reach failed,** as it is meant to when a site goes unreached. It names six sites, and the census says nothing
  about them. Each one's reason was read from its gates:
  - `physics/kaijuBox3d.js:84`, `physics/esHullCombat.js:92` and `physics/fluidBox3d.js:62`: their gates fly a mock
    world.
  - `physics/backendDivergence.mjs:24` and `physics/jolt/joltRagdoll.js:73`: their gates fly Jolt.
  - `box3d-vs-jolt.html:49`: the page never starts box3d.

### Found outside the table, said plainly

The hook found two calls the table did not list: `tools/roundhouse/spinningBody.mjs`, lines 209 and 212, at 2.00 and
4.16 rad/s, under the cap. They call box3d's raw export, `_swk_body_ang_impulse`. The table was a grep for the facade's
`angularImpulse()`, so a call spelled the other way was missed.

A grep for the raw export finds two more files whose calls no gate of the corpus made, so they were not measured:
`physics/mechanics/rigidKeys.mjs` and `tools/roundhouse/backendRotation.mjs`. Every raw call skips the facade, so the
cap will not reach any of them.

**Since the census,** one more facade call has been made: the hybrid round's contact tick,
`physics/mechanics/shipContactBox3d.mjs` (e30f8c21). It gives a ship the tick's torque as an impulse, as
`rigidBody6dofBox3d.mjs:59` does, which reached 40 rad/s at most here. It goes through the facade, so the cap will reach
it.

### What the decision builds next

This is an engineering fix, as the decision rule says. `box3dLoader.js`'s `angularImpulse()` caps the spin it leaves at
15 pi, its axis kept, as Jolt does.

- No pass-through needs the cap. No site past it goes through the slug ticker's raw world.
- The pages' sites are reached by no gate. But the cap acts on every box3d caller above 15 pi, so the gates that read
  box3d spins above it are run before and after the fix, and restated with the reason where they move.

## The cap, built (2026-11-04)

This is the decision rule's fix, as registered. `physics/box3d/box3dLoader.js`'s angularImpulse now leaves no spin above
15 pi, with the body's axis kept. It is an engineering fix: built, gated, sabotaged and run over the gates that reach it.

### What it does

- After box3d's own impulse, it reads the body's spin. If the spin stands above 15 pi x 1.001, it scales it to 15 pi along
  the same axis.
  - That is `debrisPhysics.js`'s own expression, so the debris flies byte for byte as it did.
  - A spin at or under the slack is left bit for bit.
- The cap is on the spin the call leaves, as Jolt's is. A body already spinning past it is brought to it by any impulse.
- box3d's raw export is left alone, so the callers that skip the facade skip the cap: the slug ticker's raw world,
  `spinningBody.mjs`, `rigidKeys.mjs` and `backendRotation.mjs`. None of them was past the cap where the census could see.
- It reads the spin through `_swk_ang_velocities`, the shim's only reader of it, which writes every body's. That is one call
  per impulse, and its cost grows with the world's bodies.
- Its buffer is the module's own, made once at the module's first world and sized for the shim's 4,096 bodies.
  - So angularImpulse never allocates, and a view a caller holds across it stays attached.
  - `physics/fluidBox3d.js` holds one across its loop.
- An artifact without the spin exports gets the impulse and no cap, as before.
- The raw call stays on line 51, where the census's site control and the hook's pass-through expect it.

### Before and after

Sixteen gates that spin a box3d body, or read what the facade does, were run before the fix and after it.

- **Fourteen came out identical,** line for line, details included.
- **Two moved, both as the census said they would,** and were restated with the reason.
  - **The debris gate.** Its section 5 reproduced the old facade by flying the facade with the module's cap off. The
    facade now caps, so the old facade is flown on box3d's raw export instead. Every flight is pinned to the bytes this gate's
    own run gave before the fix:

    | Flights | Bytes | What they show |
    |---|---|---|
    | box3d's own impulse, no cap | `c0603c4edc712ec1` | the facade as it was: 2,574,172 rad/s, 249.4 m/s, 12 of 1,410 lost |
    | the module's cap on box3d's own impulse | `cc43625e2ae639be` | 61 of 1,410 capped, none lost |
    | the facade's cap alone | `cc43625e2ae639be` | the same flights |
    | both caps, as the pages are now | `cc43625e2ae639be` | the same flights; the module's cap finds nothing left |
    | section 6, box3d at 1/30 s | `76e802054ae62d0c` | as before |

  - **The census gate's C-reads control.** It compared the hook's reading with the facade's read-back, and the read-back is
    now capped. It reads box3d's own impulse through the raw export, with the facade's call flown beside it. The hook reads
    box3d's own spin at both, because the cap acts after the call the hook wraps.
- **Section 11's raw-export grep** now leaves out the census's own files, as section 2's grep does. It counts their two calls
  beside it, both inside C-reads.

### The wide run

After the fix, 289 gates were run two at a time: the census's corpus, every gate that imports the loader, and every gate whose
text names box3d. Thirteen were red, and the cap reddened none of them:

- **Eight were red in the census run, before the cap,** and none of them loads box3d at all (no instance, no call):
  `pilotFlightTrain`, `subDropoutView`, `dogfightPage`, `tournamentDogfightShipped`, `trainDogfightPilotShipped`,
  `trainDronePilot`, `trainFlightPilotGpu` and `trainSubPilot`.
- **Two are the ship-time records:**
  - `gateReach`'s population, 588 gates against its recorded 579;
  - `orreryFleet`'s commit belt. box3d moved at 5fed473f, the spinning body's wasm rebuild, and the belt still reads v4905's.
- **One stands the same at the commit before the cap:** `runtimeGap`'s tree census, 5,180 files recorded against 5,237.
- **Two were this session's own, from earlier commits,** and were fixed here. Each fix was sabotaged red, W1 to W4:
  - `wasmDoors`: the hybrid gate (e30f8c21) and the census gate (e1a56d0d) reach box3d's wasm and ended with
    `process.exit()`. Their verdicts now travel by `process.exitCode`, and both still end by themselves.
  - `wasmSupport`: the census's library and gate name `box3d.wasm` in code. The count is restated 128 to 130, naming them.

### Gated

In `tools/roundhouse/angularImpulseCensus-selfcheck.mjs`, section 12, nine rows:

- the old bug reproduced on box3d's own export (112.49 and 531.62 rad/s);
- the facade leaving 15 pi about the same axis;
- only a spin past the slack touched;
- the cap on the spin the call leaves;
- Jolt's spin vector, to float32;
- no allocation in 1,000 calls;
- the constants;
- an old artifact left uncapped;
- every site the census saw past the cap reached through the facade.

### Sabotaged

- **K1-K15** break the cap, **C1, C2, C3' and G1** break C-reads and the raw-export grep's restatement, **D1-D5** break the
  debris gate's restated rows, and **F1'-F14'** are the debris gate's own earlier series run again over its restated section 5.
  Every one went red by name, and every file was restored byte-identical. Each gate's header logs its own.
- **A finding on the way.** C3 dropped C-reads' library check of the facade's box and went 0 red. The facade still capped,
  and the gate's own row repeats the check, so nothing could fail. A sabotage that removes a check while what it checks still
  holds cannot go red. C3' breaks what the check guards instead, by flying the facade's box on box3d's own export, and it goes red.

### Seen on the way

Jolt's setAngularVelocity clamps at 15 pi too, and box3d's facade's does not: a body set to 30 pi reads 15 pi on Jolt and
30 pi on box3d. The registration covers the impulse only, so this is left as it is and named here.
