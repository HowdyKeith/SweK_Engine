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
