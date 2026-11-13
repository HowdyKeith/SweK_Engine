# Three brain projects for another chat to pick up: ship against ship, the painting fly, the voxel home (2026-11-12; UNNUMBERED; writing only)

Keith, 2026-11-12, asked: "Could the fruit fly brain express itself by painting? We have ai painting code. Could it build a home in a
vowel [voxel] world? How much fly brain is active currently in 6dof? Can we have space battleship vs space battleship, with gpu/fish fly
brain controlled? Would the other swek peers be called on?" Then, on the answers: "All of what you describe are the todo list plan. Can
you write those up as the current backlog. Another chat will pick a topic from those 3. And will pick 1 after that is going."

This is a markdown file for the reason `brain/BACKLOG_2026-11-04_BRAINS.md` gives: `tools/ship/nextRounds.mjs` is edited by every
branch, and an edit there conflicts. **Writing only: every fact below was read from the code at main 68cf8d9 (v4913), except where it says
otherwise. No engine code was run for this note, and nothing below has been registered.** A chat that picks a topic registers its own round before any code, by the
house's method.

## The backlog ("parallel" = another chat can take it without touching a file the other topics touch)

**State, 2026-11-13:** `ship-vs-ship-brains` is TAKEN by another chat (branch `claude/epic-cori-2hm1my`, not on main yet: the duel
`brain/battleshipDuel.mjs`, `space-duel.html`, a trained helm, the fish's gun seat, and `brain/peerFleet.mjs`, which takes in a
folder of peers' brain files and sets them to a fleet action -- with no network in it, by its own header). `painting-fly` is
STARTED in this chat (Keith: "Start with the painting fly"): **P1 and P2 are DONE** -- the painter `brain/rl/paintCircuitPolicy.mjs`,
the trainer's policy factory, and round 1 (`brain/PAINTING_FLY_WIP.md` section 10, gate `tools/ship/paintingFly-selfcheck.mjs`):
THE FLY'S WIRING CANNOT BE TOLD APART FROM A SHUFFLE OF IT (p 0.56) and PAINTS WORSE THAN A PLAIN NET OF ITS SIZE (p 0.0014, about
3 percent), every painter within 11 percent of a random one. **P3, the self-portrait, is DONE** (2026-11-13): `fly-portrait.html`, `brain/flyPortrait.mjs`, gate
`tools/ship/flyPortrait-selfcheck.mjs` -- one duel's record of the 34 neurons (27 fire in the league pilot's close-quarters duel
of seed 1), one line a neuron, time outward, activity as the width of a wave, the brush the cell type's. The mapping differs from
this note's sketch (direction, length and colour): it is the one the page prints. Nothing of `painting-fly` is left open. `voxel-home` is STARTED in this chat
(Keith: "Let's do voxel home"): V1 is DONE (`brain/rl/buildEnv.mjs`, gate `tools/ship/buildEnv-selfcheck.mjs`) and V2 is registered
(`brain/VOXEL_HOME_WIP.md`). `peer-jobs` is OPEN. Under `peer-jobs` the tree's own list (`tools/ship/todo.mjs`) has two open items no chat has touched:
`peer-fly-brain-badge` (small) and `peer-brains-in-roster` (medium).

| id | the question | its first stage | parallel? |
|---|---|---|---|
| `ship-vs-ship-brains` | Space battleship against space battleship, each ship's helm and gun seats run by a brain: the fly's Giant Fiber Circuit, the GPU Brain's MLP, the zebrafish core | an opposing second ship in `brain/battleshipFight.mjs`, gated | yes |
| `painting-fly` | The fly-wired network as the policy of the GPU Brain's painting environment; and, separately, a picture of the fly network's own activity | a fly-wired painter policy (a new file) on `brain/rl/paintEnv.js`, trained by the existing trainer | yes |
| `voxel-home` | A home built block by block in the voxel world, by a brain, to a plan from the building grammar | a headless build environment (a new file) on `render/voxelDevice.mjs` `miniWorld()` | yes |
| `peer-jobs` (shared) | SweK peers called on: training episodes and tournament fights for any of the three, routed to peers | new job kinds in `brain/fleetRouting.mjs` | **no: one chat does it once**; the topics run without it |

The three topics share no file. Keith's plan is one pick, then a second once the first is going; nothing here blocks that.
**Recommended order, if asked:** `ship-vs-ship-brains` first (the smallest gap: the arena is already team-generic and the brains,
seats and a seat trainer exist), then `painting-fly` (its environment and trainer exist), then `voxel-home` (a new environment).

## The brains that can be wired in (and how much fly brain is in 6-DOF today)

| brain | where | size | flies today |
|---|---|---|---|
| the fly's Giant Fiber Circuit (GFC1-GFC4, the escape-reflex circuit) | `brain/gfcTopology.mjs`, baked from Janelia FlyEM's male-CNS connectome (`male-cns:v1.0`, `vendor/male-cns/PROVENANCE.md`) | 34 neurons, 313 synapses; each hidden unit is a real neuron by its Neuprint bodyId | the 6-DOF fighters' trained pilots (`brain/pilot6dofPolicy.mjs`, 12 features -> 34 -> 5, 930 weights; the `-d18` weights), the battleship's helm (`brain/helmPolicy.mjs`, 930; untrained) and gun seats (`brain/seatGunnerPolicy.mjs`, 860), the drone (`brain/pilotDronePolicy.mjs`, 20 -> 34 -> 4, 1,167), and the race car's turret gunner (`brain/gunnerPolicy.mjs`, 11 -> 34 -> 5, 896) |
| the fly's heading circuit (central complex) | `brain/pilotSubCircuitState.mjs`, seated by `render/subAquariumFlyCx.mjs` | 148 cells, 7,080 synapses, run as a reservoir with a memory: the recurrent weights are FIXED and training moves only the input and readout weights (1,729 weights) | a 6-DOF sub in the Sub Aquarium (`flycx`), as a correction on the sub's autopilot |
| the zebrafish core (Fish1 TEN analysis set) | `brain/zebrafishTopology.mjs`, baked from `vendor/zebrafish/fish1-ten-core.json` | 34 neurons, 153 synapses; mostly inputs to the dorsal motor nucleus of the vagus -- in the file's own words NOT a circuit anybody has shown steers a body | the sub only (`brain/pilotSubFish.mjs`, 14 -> 34 -> 4, 803 weights) |
| the GPU Brain's MLPs (no wiring) | `brain/mlp.js` BatchedMLP; `brain/pilot6dofMlp.mjs` (12 -> 32 -> 32 -> 5, 1,637 weights); `brain/seatGunnerMlp.mjs` (12 -> 32 -> 32 -> 3, 1,571 weights) | plain layers | the 6-DOF duel's GPU pilot, and seats batched on the GPU by `brain/seatGunnerGpu.mjs` `gpuBatcher(device)` |
| the plain-net controls | `brain/pilotSubPlain.mjs` (14 -> 50 -> 4, 954 weights; the method in `brain/PLAIN_NET_CONTROL_WIP.md`) | weight count matched to a circuit's, no wiring | the house's control for "does the wiring matter" |

**Said plainly:** the fly's brain alone has about 140,000 neurons (the published whole-brain count; the tree does not hold it), so the
34 GFC neurons are about 0.02% of it, and the 148-cell heading circuit about 0.1%. What is real is the WIRING (which neuron connects to which, so which recurrent weights may exist). The synapse
strengths are trained, not measured, and the neurons are tanh rate units, not spiking models. The measured answer on both brains so far is
mostly negative (`brain/BACKLOG_2026-11-04_BRAINS.md`, first section): a round that wants to say the wiring matters needs the matched
plain-net control, and a shuffled wiring where it can have one.

## `ship-vs-ship-brains` -- space battleship against space battleship, brain-controlled

**What exists:**
- **The arena is team-generic** (`brain/spaceArena.mjs`). A craft carries a `team`; rounds are tested per team against the other
  teams' craft only; a capital ship's behaviour `face` turns it toward the nearest enemy at the hull's limit, and `station` holds a
  slot on a `leader`. Options, all off by default: `shipCollisions` (the hull boxes; restitution 0.35, friction 0.5; ram damage 0.3
  times the impulse, capped at 25, taken by both ships), `friendlyFire`, `wrecks`, impacts that spin, and `crew` (a bridge crew worth
  200 hit points; a ship whose bridge crew is dead has no helm). A **helm pilot** (`helmPilot`: (rule, ctx) -> { torque, thrust })
  replaces the rule's output each tick. Seat networks run in a **two-phase tick** so the GPU Brain can batch them
  (`stepSpaceArenaAsync(arena, forwardBatch)`). The fight is over when fewer than two teams have a craft flying, or at the time limit,
  so two ships on two teams and no fighters is already a fight the arena can end.
- **The fight** (`brain/battleshipFight.mjs`): `scenario(seed, kind, { fighters, ships = 1, escorts })`, `build(seed, kind, opts)`
  (gunners, pilot, seconds, behaviour, cruise, friendlyFire, the `helm` option `{ module, weights }`), `fight(seed, kind, opts)` ->
  `tally(arena)`. **`ships: 2` puts the second ship on team 1, the same side as the first: a formation against fighters, not an
  opponent.** No scenario sets ship against ship.
- **The ship** (`physics/mechanics/capitalShip.mjs`): 48 units long, 4,400 kg, thirteen gun seats, hit spheres naming parts
  (turrets, engine pods), the bridge, and the wave-motion cannon (an invented weapon, named so: a 12 s charge, then one hit-scan
  beam along the bow, 900 units long, 400 damage to everything it reaches). Against another ship the cannon is likely to decide the
  fight, so a ship-against-ship tally should count it apart from the guns.
- **The helm brain** (`brain/helmPolicy.mjs`: `helmFor(w)`, `helmFactory`, `WEIGHT_COUNT` 930): the GFC network as a correction on
  the rule; its hand weights are zero, and a helm with them flies the rule to the bit. `build()`'s `helm: { module, weights }` takes
  any module with `helmFactory` and `WEIGHT_COUNT`. **No helm was trained** (the fight's own header says so).
- **The seat brains:** `brain/seatGunnerPolicy.mjs` (the GFC network, 860 weights; its hand weights are the hand gunner exactly) and
  `brain/seatGunnerMlp.mjs`, both TRAINED against fighters by `tools/ship/trainSeatGunner.mjs` (a sparse-mutation (1+1)-ES judged
  by `battleshipFight.fight()`): `brain/seatGunnerWeightsDefault.json` (score 0.78) and `brain/seatGunnerMlpWeightsDefault.json`
  (0.872), both `swek-brain-v1` files of 2026-10-17. `build()`'s `network` and `seatNetworks` options put them in the seats; on a
  GPUDevice `brain/seatGunnerGpu.mjs` runs them batched.
- **The page** (`space-battleship.html`): one battleship, thirteen seats, against the 6-DOF fighters, flown by the `-d18` pilots
  (`brain/pilot6dofWeights{Default,League,Close}-d18.json`; why they are frozen: the `battleship-pilots-d18` entry of
  `tools/ship/nextRounds.mjs`).

**What is missing:** an opposing ship (a scenario and its tally); the page's view of two ships; a helm and seats wired by a circuit
other than the fly's (the helm and seat libraries have the GFC hard-wired; the sub's `createSubPolicy(topo)` already takes any circuit,
which is the pattern); trained ship-against-ship brains.

**The plan, each stage landable alone:**
1. **S1, engineering:** an opposing second ship -- a `battleshipFight` option that puts it on team 2 (fighters 0 by default for a
   pure duel), and a tally for ship against ship (hits each way, parts lost, cannon hits, rams, time to kill). Gate rows: the two
   ships fight each other and only each other; a seed fixes the fight to the bit; the end is one ship destroyed or the time limit.
2. **S2, engineering:** `space-battleship.html` shows ship against ship (a query option), a window per ship's helm and seats.
3. **S3, engineering:** a helm library (a new file) that takes a topology `{ NEURON_ORDER, EDGES }`, so one module wires the GFC, the
   Fish1 core or no wiring (the plain-net control at a matched weight count); at zero output each is the rule, as `helmPolicy` is.
   It exports `helmFactory` and `WEIGHT_COUNT`, so `build()`'s `helm` option takes it with no change to the fight. Seats: the GFC
   seat or the MLP seat on the GPU. **Import `brain/zebrafishTopology.mjs` directly; `brain/pilotSub*` belongs to another chat.**
4. **S4, training:** helms (and seats if wanted) for ship against ship, by ES as `tools/ship/trainSeatGunner.mjs` trains seats: a
   candidate commands one ship against a fixed opponent (the rule ship) on training seeds; the champion is picked on held-out seeds.
5. **S5, the round (register before any code):** a round robin on fresh seeds -- fly ship, fish ship, plain-net ship, rule ship --
   paired by seed, read by the house's exact two-sided sign test at p < 0.01; controls at least a rule-against-rule mirror (even by
   construction) and the matched plain net (the wiring question).
6. **S6, optional:** `peer-jobs`, so training and the round robin can go to peers, and peer against peer (each peer trains its own
   ship brain and sends it as a `swek-brain-v1` file).

**Said plainly:** the helm and the seats were made against fighters; nothing yet says a fly-wired helm commands a capital ship better
than its rule. A fly-against-fish result says which trained weights won on these seeds; that the wiring did it needs the plain-net
control.

## `painting-fly` -- the fruit fly brain and the painting code

**What exists:**
- **The GPU Brain paints** (`brain/rl/paintEnv.js`, class `PaintEnv`): each step places one rotated rectangle; the policy chooses
  where and what shape (`ACT_DIM` 5: x, y, width, height, angle), never the colour, which `fx/primitiveFit.mjs` solves exactly (the
  least-squares colour over the covered pixels). The observation is a 4 x 4 grid of where the canvas is still wrong plus 4 more
  numbers: **`OBS_DIM` is 20 in the code (the file's header says 17; read the code)**. `maxSteps` 20 by default; `makeTarget(w, h,
  seed)` makes target pictures. The trainer is `brain/rl/dockPolicy.js` `trainDockES` (the same drop-in interface as the rocket,
  dock and drive environments). **Corrected 2026-11-13: the trainer takes any ENVIRONMENT but builds its own policy, the plain
  `FlightPolicy` MLP; it has no way to be handed another network.** The floor to beat is `fx/primitiveFit.mjs`'s own random search: about 90 shapes tried to place one,
  where the policy tries exactly one.
- **The pages and brushes:** `primitive-paint.html` (any image approximated one coloured shape at a time), `proc-brush.html` (brushes --
  sketchy, fur, shaded, ribbon -- `fx/procBrush.mjs`, `ui/procBrushCanvas.js`), and the paint modules in `fx/` (`paintFields`,
  `paintGenerators`, `paintTargets`, `paintTransforms`, `polyBrush`).
- **A brain's activity, readable:** `render/brainPanel.mjs` `activations(policy, w, x, outputNames)` and `render/carViews.mjs`
  `activationsOf(policy, w, x)` give a policy's hidden activity for an input.

**What is missing:** a fly-wired painter policy; any measure of it against the MLP painter and the hill climber; a way to paint
from activity rather than toward a target.

**The plan:**
1. **P1, engineering:** a fly-wired painter (a new file): `OBS_DIM` 20 -> the GFC's 34 neurons (one weight per real synapse, three
   weight-tied recurrent steps, the house's masked-recurrent form) -> 5 shape actions: 680 + 34 + 313 + 170 + 5 = 1,202 weights.
   Gate rows: the shapes, the weight count, determinism, and `trainDockES` drives it through an optional policy factory (new, and
   without it the trainer's answer is what it was, to the bit).
2. **P2, training:** the fly painter and the existing MLP painter on the same targets and seeds, and a plain net at 1,202 weights as
   the control; the hill climber as the floor, per shape evaluation.
3. **P3, the self-portrait (no training):** record the 34 GFC neurons while a ship flies a fight (`brain/battleshipFight.mjs` or the
   6-DOF duel), and paint that record with the procedural brushes, one brush per neuron (direction, length and colour from its
   activity). Gate: the picture is a pure function of the record (a hash), and the mapping is stated where the picture is shown.
4. **P4, a round if a claim is to be made:** registered first, as for every round.

**Said plainly:** `PaintEnv` rewards matching a target picture, so a policy trained on it copies, it does not express anything. The
self-portrait (P3) is a picture of what 34 real neurons' wiring did in a fight, mapped by a rule someone chose -- an honest picture,
not the fly's intent. "Expresses itself" is not a quantity any of this measures, and the page should say so.

## `voxel-home` -- a home built in the voxel world

**What exists:**
- **One block at a time** (`render/voxelDeviceEdit.mjs`): `editState(world, opts)`, then `editVoxel(state, x, y, z, id)` changes
  one voxel and re-meshes only the touched chunk and its neighbours within one voxel; it refuses outside the world's height, and a
  change to the id already there. `buildAt(state, hit, id)` puts a block on the face a ray hit and `digAt(state, hit)` clears one;
  `sandbox-gpu.html` already edits its world with them. `world/world.js` `VoxelWorld` holds the voxels (`setVoxel`, `voxelAt`); block
  id 0 is air (`world/chunk-selfcheck.mjs`: AIR 0, STONE 1, WATER 10).
- **A small world for headless work:** `render/voxelDevice.mjs` `miniWorld({ chunkSize = 16, chunkHeight = 64 })`, as
  `tools/ship/voxelBodies-selfcheck.mjs` uses it.
- **A home's plan:** `world/buildingGrammar.mjs` `buildingGrammar(seed, overrides)` -> one placement per cell (`{ cell, role, floor,
  side, facing, variant, blank, accessory, stairs }`, ROLES corner, wall, interior, roofCap) and a hash of the list; drawn by
  `building-lab.html`. **The plan as voxels already exists:** `world/buildingFacade.mjs` (`facadeVoxels(rect, grammar)`,
  `stampFacade(world, rect, flags, seed)`) puts the grammar on a CityGen building -- a cell one voxel wide, a floor three voxels tall,
  glass windows (id 5) and a two-voxel door opening (air) on the stairs column's first floor. **Said plainly: CityGen's building is a
  SOLID column and its interior cells stay solid**, so the stamped building has a door and windows and no room inside. A home with a
  room inside needs a hollow plan, which nothing in the tree makes today.
- **The sandbox:** `sandbox-gpu.html` -- the main sandbox's `VoxelWorld` terrain with CityGen's facade buildings, on the device.
- **Bodies on voxels:** `render/voxelBodies.mjs` `createBodyWorld` (box3d bodies resting on the voxel world), if a test wants things
  to fall onto or into the home.

**What is missing:** a building environment; a builder policy; a measure of a home.

**The plan:**
1. **V1, engineering:** a headless build environment (a new file) with `PaintEnv`'s drop-in interface (`obsDim`, `actDim`,
   `maxSteps`, `reset`, `step`) so `trainDockES` drives it: `reset(seed)` picks a site in a `miniWorld` and a plan -- the grammar's
   placements made voxels, by `facadeVoxels` over a column hollowed by the new file (a room inside, a roof, the door); the
   observation is a coarse grid of what is still missing around the site (the analogue of the residual grid); the action is where the
   next block goes, and the block type comes from the plan (the analogue of the solved colour). The reward is the plan matched
   (intersection over union), or a home's function -- enclosed, roofed, with a door -- measured on the voxels.
2. **V2, training:** the fly-wired builder (the same masked-recurrent form as P1), the MLP and the matched plain net, on the same
   plans and seeds.
3. **V3, engineering:** watch it build -- a page (or `sandbox-gpu.html`) placing one block a tick through `editVoxel`.
4. **V4, a round if a claim is to be made:** registered first.

**Said plainly:** the GFC is an escape circuit; it has no building behaviour, and what any of these builds is what its trained weights
learned, to a plan the grammar wrote.

## `peer-jobs` (shared) -- calling on the other SweK peers

**What exists:**
- **Fleet routing** (`brain/fleetRouting.mjs`, v4584): a request `{ kind, scene, policy, ticks: [from, to) }` is routed by
  `brain/agent/fleet.js`'s learned scheduler over the fleet registry in `ai-bridge/gpuBrainBridge.js` (`{ id, gpu, role, kinds,
  solveMsEwma, posts, schedOptIn }`), so the fast peer takes more of the work and a peer that handles no such kind is routed around;
  each routing is an attributed row. Its KINDS are `train`, `race`, `field` and `policy`; **two jobs are cut into requests today:
  the trainer's episodes (one per candidate per seed) and the race's lockstep ticks.** Said plainly in the file: the requests are
  RUN by this box standing in for every named peer (`ranOn` says so on every result); "a peer that could run a box3d episode on
  request is the rig's to build".
- **A job queue** (`tools/roundhouse/jobQueue.mjs`, v2961): the hub knows who is out there, results come home through submit and the
  outbox, and a peer can run any of 24 devices across 91 modes. **Its rule: a job names work from a fixed catalog and never carries
  code**, and its config values are primitives ("an object is where a payload hides"). So a fight, a paint episode or a build
  episode becomes a device and mode in the peer's own registry, which reaches the peer in a release, and a trained brain does not
  travel inside a job: it would go as a `swek-brain-v1` file through `brain/peerBrain.mjs`, or by a name the peer can look up.
- **Brains between peers** (`brain/peerBrain.mjs`): `swek-brain-v1`, a portable weights file, so one peer's trained brain can be raced
  against another's.

**What is missing:** a job kind for each topic's work (a fight; a paint or build episode), each a device and mode in the peers'
catalog, and its result path home; a peer that actually runs a routed request (the rig's to build, as `fleetRouting` says); a check
that a job gives the same answer on any peer (each is a seeded pure function, so a hash per job can say so, as the race's per-range
fingerprint -- the fold of the world's state hash -- does).

**Said plainly:** no peer is called on today for any of the three; battles, painting and building run on one machine, and the seat
networks run on its own GPU. One chat should add the kinds once; two chats editing `brain/fleetRouting.mjs` at once would conflict.

## Added 2026-11-13: how else the fly brain could live in the voxel world (all OPEN; ideas, nothing registered, no code read for them beyond what this note already cites)

Keith, 2026-11-13: "How else could the fly brain live in voxel world? Could it play minecraft or create something to attract a
different fly brain?" and, of the five answers: "Yes, add those to the backlog". Each builds on `voxel-home` (`brain/rl/buildEnv.mjs`:
the site, the plan, `homeCheck`). **Said first: the real Minecraft is not reachable from here and is not to be rebuilt; "play
Minecraft" below means a survival loop in the tree's own voxel world.**

| id | the idea | what is real in it | what it needs | parallel? |
|---|---|---|---|---|
| `fly-escapes-home` | A fly body in the voxel world sees something loom (a falling block, a predator) and dodges, or dives through its door | **The Giant Fiber Circuit is the fly's escape circuit: in a real fly it fires on a looming object and triggers take-off. This is the one use where the circuit would do its own job.** | a looming feature (the angular size of the nearest approaching thing and its rate), a small body in the voxel world (`render/voxelBodies.mjs`), a threat generator; a round against the matched plain net | yes |
| `fly-finds-home` | The fly wanders off to forage and steers back to its door by its heading | the heading circuit (`brain/pilotSubCircuitState.mjs`: 148 cells, 7,080 synapses) is what a real fly keeps a compass bearing with. **The measured answer on it so far is mostly negative (rung 4a): expect a modest result.** | a 2-D or 3-D walk with the heading as the only sense of direction, a home position; the stateless and plain-net controls the earlier rounds used | yes; best with `fly-escapes-home` as "the fly lives in its home" |
| `fly-survives` | A survival loop: hunger, night, weather; dig to gather blocks, build shelter before dark, eat | little: the rules would carry most of it, the brain a small part. `brain/NEEDS_AND_LIMITS.md`'s needs planner is the layer above a flying pilot | the largest build of the five: an inventory, digging (`render/voxelDeviceEdit.mjs` `digAt`), a day, needs | yes |
| `fly-attracts-fly` | A signalling game: one fly-wired builder makes a structure, a second fly-wired agent, trained separately, chooses which structure to approach; trained together | the wiring of both. **An invented behaviour on real wiring: real flies attract by song and scent, not architecture, and the tree holds neither circuit. The page must say so.** | a chooser environment (two sites, one the builder's, one a random pile of the same block count), co-training; the test: does the visitor pick the builder's over the pile, and does a shuffled wiring do as well | yes; **the visitor could be another peer's brain (`swek-brain-v1`), which would give `peer-jobs` a first real use** |
| `two-flies-one-site` | Two builders on one site: together, or competing for the same blocks | the wiring | `BuildEnv` with two builders taking turns; cheap once `voxel-home` is done | yes |

**Recommended order, if asked:** finish `voxel-home` (the result, then the page), then `fly-escapes-home` with `fly-finds-home`
(each circuit used for what it is for), then `fly-attracts-fly` as the bridge to peers.

## Notes for the chat that picks

- **The method:** a research round is registered (its note committed) before any code, built and sabotaged, run, its results
  committed unread, then read, with the verdict as gate rows; an engineering stage gets gate rows that show the old state, sabotages
  that each go red by name, and a run of every gate the change reaches.
- **Files that belong to another chat** (read them, do not edit them, as of this session's instructions): `brain/SUBMARINE_WIP.md`,
  `brain/DOGFIGHT_LEAGUE_WIP.md`, `brain/pilotSub*`, `tools/fish*`, `tools/ship/trainSub*`, `tools/ship/gateSweep.mjs`,
  `tools/ship/assertionShape.mjs`.
- **6-DOF steps:** RK4 is `rigidBody6dof`'s default orientation step; a gate that holds first-order numbers imports
  `physics/mechanics/rigidBody6dofEuler.mjs` first (`tools/roundhouse/orientationStep-selfcheck.mjs` section 7 holds the list). New
  work flies the default.
- **box3d spin:** the facade caps an angular impulse and a set spin at 15 pi rad/s, as Jolt does
  (`physics/box3d/box3dLoader.js`, SPIN CAP). The arena's ships fly `physics/mechanics/rigidBody6dof.mjs`, not box3d; the voxel
  world's bodies (`render/voxelBodies.mjs`) do run on box3d, so the cap is theirs.
