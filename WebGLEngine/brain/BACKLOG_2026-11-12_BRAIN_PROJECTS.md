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
(Keith: "Let's do voxel home"): V1 is DONE (`brain/rl/buildEnv.mjs`, gate `tools/ship/buildEnv-selfcheck.mjs`) and **V2 is DONE**
(`brain/VOXEL_HOME_WIP.md` section 10, gate `tools/ship/voxelHome-selfcheck.mjs`): A FLY-WIRED BUILDER BUILDS LESS OF A HOME THAN A
RANDOM ONE (0.43 of a home against 0.57; p 3e-9), its wiring CANNOT BE TOLD APART FROM A SHUFFLE OF IT and BUILDS WORSE THAN A PLAIN
NET OF ITS SIZE; no arm's mean reaches a random builder's and nobody built a home, where a three-line rule builds every one.
**ROUND 2 IS DONE** (2026-11-14: the choice DRAWN from 36 numbers; `brain/VOXEL_HOME_DRAWN_WIP.md` section 10, gate
`tools/ship/voxelHomeDrawn-selfcheck.mjs`): A FLY-WIRED BUILDER BUILDS MORE OF A HOME THAN A RANDOM ONE (0.67 against 0.57; all 80
trained builders beat every random one), its wiring still CANNOT BE TOLD APART FROM A SHUFFLE and BUILDS WORSE THAN A PLAIN NET
(0.69); nobody built a home, and a lean that needs no network builds 0.92 and 123 homes of 200. **Round 3, the longer training, is DONE** (`brain/VOXEL_HOME_LONG_WIP.md` section 8,
`tools/ship/voxelHomeLong-selfcheck.mjs` section 5): round 2's builders trained 1,000 iterations for 150 build more (FLY 0.687
for 0.666, p 0.0085) but only by 0.01 to 0.02 of a home; the trainer's history shows the learning levelled by about iteration 166;
two homes in 16,000 builds (one FLY, one FISH), the first any trained builder finished; the fly's wiring still cannot be told from
a shuffle (p 0.78) and is no longer told apart from a plain net (p 0.10). More iterations of this trainer are not the way to a
home: what is left to try is the item `voxel-home-trainer` below. **V3, the page, is DONE** (2026-11-14): `voxel-home.html`,
filed in the Fruit Fly Brain drawer and linked from `server.html`, plays one build a block at a time -- the rule, the lean, a
random builder, or any of the three rounds' 240 trained builders read from the rounds' own results -- with the builder's view
beside it; `brain/voxelHomeShow.mjs`, gate `tools/ship/voxelHomeShow-selfcheck.mjs` (a build here, over the 200 audit plans, is
the record's score and homes to the bit). It opens on the one house the fly-wired builder finished. **Said plainly: the picture
is a 2D drawing of the build's blocks, not the engine's voxel mesh -- step 3 of the plan below said `editVoxel`, which needs a
WebGPU device, and the page is to open anywhere.** Nothing of `voxel-home` is left open but `voxel-home-trainer`. `peer-jobs` is OPEN. Under `peer-jobs` the tree's own list (`tools/ship/todo.mjs`) has two open items no chat has touched:
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

**`fly-escapes-home`: the environment and ONE ROUND are DONE, and the round did not answer its question (2026-11-14).**
`brain/rl/escapeEnv.mjs` (gate `tools/ship/escapeEnv-selfcheck.mjs`): a fly feeds in the yard of its voxel house; strikes fly at
it and passes fly by; one number chooses home or food. Floors written by hand: hide 0.50, flee from everything 0.54, a
looming-on-a-steady-bearing reflex 0.65; a fly told each mover's kind 0.84. The round (`brain/FLY_ESCAPE_WIP.md` section 11,
`tools/ship/flyEscape-selfcheck.mjs` section 5): **from a random start no arm learned to tell a strike from a pass** -- all 80
trained flies go home for everything (0.517 to 0.521 by arm; 79 of 80 below fleeing from everything; p 1.3e-22). The fly's
wiring cannot be told from a shuffle (p 0.47), the sixth time, but among flies that did not learn the task. **Found after the
reading, mine:** `trainDockES` keeps the iteration that LIVED most (the environment reports `docked` as lived), a thumb on the
scale toward hiding. **OPEN, the round that would answer it (`fly-escapes-reflex`, not registered):** start each fly at the
reflex and train a correction (as voxel-home round 4 did with the lean), have the trainer keep the best return, then ask the
wiring question of flies that do the task. **The page is DONE (2026-11-15):** `fly-escape.html` (Fruit Fly Brain drawer; `brain/flyEscapeShow.mjs`, gate
`tools/ship/flyEscapeShow-selfcheck.mjs`) plays an episode in 3D -- the real voxel house, the fly, the mover, a camera that
turns on a drag -- and THROUGH THE FLY'S EYE, all the way round, where the mover is a disc that looms; both pictures are
ray-cast in JavaScript from the episode's voxels (no GPU). **`fly-escapes-reflex` is DONE as round 2** (`brain/FLY_ESCAPE_REFLEX_WIP.md`
section 8, `tools/ship/flyEscapeReflex-selfcheck.mjs` section 6; `brain/rl/reflexStart.mjs`): started at the reflex, with the
trainer keeping the best return, **59 of the 80 flies escape better than the reflex (p 2.5e-5), by a hundredth and a half**
(0.661 for 0.6465; the fly told the kind 0.835). **T1 was, for the first time, asked of flies that do the task: the fly's wiring
cannot be told from a shuffle of it (p 0.78).** Most of the trainer's gain was its own 24 battery episodes' (0.08 to 0.10 there,
0.012 to 0.017 on the audit). **All three of that round's open items are now rounds (2026-11-16):**
* **Round 3, a trainer whose episodes change and whose battery is 200: DONE** (`brain/FLY_ESCAPE_FRESH_WIP.md` section 9,
  `tools/ship/flyEscapeFresh-selfcheck.mjs` section 6). **All 80 flies beat their round 2 selves and all 80 beat the reflex;
  the mean is 0.741** (round 2: 0.661; the reflex 0.6465; told the kind 0.835). The battery's gain is now the audit's gain
  (0.08 to 0.10 both). They learned not to be caught (a strike catches 1.5 to 2 percent, the reflex 10.7). **The fly's wiring
  cannot be told from a shuffle (p 0.99) or a plain net (p 0.67).**
* **Round 4, memory between ticks: DONE** (`brain/FLY_ESCAPE_MEMORY_WIP.md` section 8, `tools/ship/flyEscapeMemory-selfcheck.mjs`
  section 6; `brain/rl/carryCircuit.mjs`). **Memory cannot be told apart from none and leans worse** (22 of 64 above their
  round 3 selves, 42 below; p 0.017 against the registered 0.01); the plain net is lower in all 16 draws. **The wiring: cannot
  be told from a shuffle (p 0.64).** Seen after the reading and not registered: the fish's circuit is the one arm not lower
  with memory and ranks above the others -- a thing to ask of a round, not a finding.
* **Round 5, the real visual inputs: DONE, AND IT IS THE FIRST ROUND IN WHICH A REAL WIRING IS TOLD FROM ITS SHUFFLE**
  (`brain/FLY_ESCAPE_VISION_WIP.md` section 10, amended in 3b before any training; `tools/ship/flyEscapeVision-selfcheck.mjs`
  section 7; `brain/rl/maskedCircuitPolicy.mjs`, `brain/gfVisualTopology.mjs` baked from another chat's
  `vendor/male-cns/giant-fiber-visual-circuit.json`). The two Giant Fibers and each one's 10 strongest LC4 and LPLC2 cells,
  the looming rate into LC4 and the size into LPLC2, the answer read from the Giant Fibers alone. **T1: the real circuit's
  wiring escapes better than a shuffle of it (p 0.0085 against 0.01).** Said with it: not a better fly but a surer training --
  all 16 real-wired flies end at 0.741 to 0.757, 12 of 16 shuffles end in the same place and 4 fail (0.66 to 0.71). The real
  wiring brings all 40 visual cells onto the two cells read; a shuffle brings 13 to 20. A free net on the same two numbers
  cannot be told from the real circuit (0.757 against 0.750). With no connections nothing was learned (16 of 16 unmoved).
* **The page plays all five rounds (2026-11-16):** `fly-escape.html` offers rounds 3 and 4's flies and round 5's four (the real
  Giant Fiber circuit, its shuffle, the free net, the cells with no connections), each from its round's committed file, in 3D
  and through the fly's eye; choosing a round 5 fly moves the page to round 5.
* **DONE (`fly-escapes-degree-shuffle`, escape round 6, 2026-11-16; `brain/FLY_ESCAPE_DEGREE_WIP.md` section 9):** round 5's
  result came again and it was the convergence. On 32 new draws an arm: the real circuit beats a free shuffle (D2, ranks
  1247.5 of a middle 1040, p 0.0050); it cannot be told from a shuffle that keeps every cell's counts in and out (D1, p 0.98;
  means 0.7494 and 0.7496); and that count-keeping shuffle beats the free one too (D3, p 0.0046). The difference is small: a
  thousandth of the score at the median, and 2 failed trainings of 32 free shuffles (expected 4 to 12; that guess missed).
  Nothing finer than each cell's counts was shown to matter. Not yet on the page.
**OPEN, not registered:** the fish's circuit with memory, asked properly; real left and right eyes and receptive fields (that
chat's `brain/FLY_RETINOTOPY_RF_WIP.md`); the published Giant Fiber model as a hand-written fly beside the reflex.

Keith, 2026-11-16, after round 5: "Do we need to integrate more fly cells? ... What else could the fly do? 2 flies? We can check
6dof for any gaps or new possible modes. Can we surgically merge 2 Flys and use that to pilot or walk on all fours? Can our fly
see and paint that? Is our fly looking for other flies to mate with?" **None of these is registered; each is said with what is
real in it and what would be invented.** (Round 6, `brain/FLY_ESCAPE_DEGREE_WIP.md`, was asked for in the same message and is
its own entry above.)

| name | what | what is real | what is invented or missing | needs more cells? |
|---|---|---|---|---|
| `more-escape-cells` | The rest of the Giant Fiber's visual input: the tree holds 40 of the 311 LC4 and LPLC2 cells that reach the fibres (a fifth of that input) | all of it is in the connectome | nothing, but **more cells do not sharpen rounds 5 and 6's question**; they matter once each cell looks at its own patch of the eye | yes, from the other chat: its `giant-fiber-visual-retinotopy.json` is not on this branch |
| `fly-eyes-left-right` | Each visual cell given what ITS patch of the eye sees (the page's eye picture is already 180 x 45 lenses), so a mover on the left drives the left cells and the fly can turn away from it | retinotopy; left and right fibres | the fly here chooses home or food, not a direction: the task needs a second action | the retinotopy file |
| `two-flies-one-yard` | A second fly in the yard. It also looms when it comes near, and it is not a strike: the fly must tell a fly from a predator, and the two compete for one food tile | flies do share food and do startle each other | the second fly's behaviour is a rule or another trained fly | no |
| `fly-courts-fly` | **The honest answer to "is our fly looking for a mate": no. Nothing in the tree does courtship.** The round: a small thing that moves across the eye is to be FOLLOWED, a thing that looms is to be FLED -- one eye, two circuits pulling opposite ways | in a male fly LC10a visual cells and P1 cells drive the chase of a female, and the connectome this tree uses is a male's | the other fly, and everything after the chase | yes: LC10a and P1 and their path to steering, from the other chat |
| `fly-pilots-6dof` | The Giant Fiber visual circuit as a 6-DOF craft's collision reflex: an incoming craft or shot has an angular size and a looming rate, which are exactly the circuit's two inputs; the output is "break away now" on top of the pilot | the circuit's job is this job | a craft is not a fly; the pilot under it is the tree's MLP. **Corrected 2026-11-16: the gap I named is the capital ship's helm (`brain/helmPolicy.mjs`, another chat's area); the 6-DOF duel already has three trained fly pilots. What is missing there is "nothing learned to ram less".** REGISTERED as `brain/FLY_RAM_REFLEX_WIP.md` | no **DONE 2026-11-16 (`brain/FLY_RAM_REFLEX_WIP.md` section 10): the craft cannot be told from its pilot alone -- all 12 real-wired craft are the pilot to the bit, because none ever breaks; 28 of the 36 craft never break, six of the eight that do are worse, and no craft rams less and flies no worse. The real wiring cannot be told from a shuffle or a free net. The careful profile's bar is still unmet.** |
| `two-flies-merged` | "Surgically merge two flies": one network of two copies of a circuit with connections across. **Said plainly: the real circuit is already two halves, left and right, joined by exactly two connections between the Giant Fibers**; a merge of two whole flies has no anatomy to follow, so every joining connection would be invented | each half's wiring | the joins; and a body: four legs is not a fly's six, and the tree holds no leg circuit at all | for walking: the leg circuits of the nerve cord, which the male connectome has and the tree does not |
| `fly-paints-what-it-sees` | The fly-wired painter (`painting-fly`, done: its wiring could not be told from a shuffle) given the picture from the fly's own eye on the escape page as the thing to paint | the eye picture is the escape task's own | the painter is handed the picture as numbers; nothing is seen through visual cells. A picture of a looming disc is a simple target, so it would mostly test the painter | no |

**Added 2026-11-16, after the collision reflex round** (Keith: "Let's add the rest to backlog if not there already. And commit
so another chat could pick up a item."). None is registered unless it says so.

| name | what | what it stands on | what is open | who has it |
|---|---|---|---|---|
| `fly-escapes-convergence-split` | Escape round 7: round 6 said the real wiring's edge over a free shuffle is the counts each cell has, not which cell connects to which. Split the counts: a shuffle that keeps only each cell's INCOMING counts, one that keeps only its OUTGOING counts, one that keeps only the drive onto the two Giant Fibers | round 6's code and records (`tools/ship/flyEscapeDegree.mjs`, `brain/FLY_ESCAPE_DEGREE_WIP.md`); no new data | the effect to split is a thousandth at the median, so "cannot tell" is likely | **DONE 2026-11-16 (`brain/FLY_ESCAPE_SPLIT_WIP.md` section 10): round 6's difference came again (GDEG better than a free shuffle, p 0.0057), and no one part could be told from a free shuffle -- the registered sentence is "the difference needs both counts together". Said with it: the arm that keeps only the fibres' inputs missed the line by little (p 0.013) and looks like GDEG, so the round cannot tell that sentence from "it is the fibres' inputs, on too few draws".** |
| `fly-ram-sidestep` | The collision reflex again with another manoeuvre: a short sidestep that returns to the fight, and/or the circuit choosing the break's direction as well as its moment | `brain/rl/ramEnv.mjs`, `tools/ship/flyRam.mjs`, `brain/FLY_RAM_REFLEX_WIP.md` section 10: with the flee written by hand, the best reflex found stays shut, and two thirds of the rams begin under two seconds from contact | **SCOPE BY HAND FIRST (minutes): if no hand-timed sidestep beats the pilot alone's 16.5092 on the scoping seeds, there is nothing for a circuit to learn and the round is not to be run.** The ceiling is low | **SCOPED 2026-11-17, NOT RUN (`brain/FLY_RAM_SIDESTEP_WIP.md`): no sidestep beats the pilot alone (flee, flee firing, swerve 3 to 16 m: 0 of 144 variants). Coasting does, and best when it coasts whenever the gap is closing (+1.06 on 200 fresh jousts, p 5e-5) -- a fault of the pilot's throttle, not a collision reflex; it needs only the sign of the looming rate, so a round would not test the circuit.** |
| `close-pilot-coasts` | **For the chat that owns the 6-DOF pilots.** The Close pilot (`brain/pilot6dofWeightsClose.json`) in the joust with collisions on fights better and rams less with its engine off whenever the gap is closing: reward 17.124 against 16.064 on 200 jousts (3000001 + 41 k), better in 129, worse in 62; ram damage 7.79 against 10.15 hit points a joust | `brain/FLY_RAM_SIDESTEP_WIP.md` section 2 | whether retraining the pilot finds it, and whether it holds in the standoff start; the pilot files are not this chat's to edit | free |
| `fly-watch-rounds-6-and-ram` | Page work, not a round: round 6's flies and the collision round's craft on a watch page (`fly-escape.html` plays rounds 1 to 5) | the records hold every fly's weights (`brain/flyEscapeDegreeRound.jsonl`, `brain/flyRamRound.jsonl`) | the collision craft need a 6-DOF view, and 28 of the 36 look exactly like the pilot | **DONE 2026-11-16: `fly-escape.html` plays rounds 6 and 7's flies on their own draws; `fly-ram.html` (new; `brain/flyRamShow.mjs`, gate `tools/ship/flyRamShow-selfcheck.mjs`) plays the collision round's craft, from outside and from the craft's nose** |

**To pick one up:** write its registration note and commit it before any code; mark the row TAKEN with the branch; follow the
method in `brain/FLY_ESCAPE_DEGREE_WIP.md` (register, code, gate, sabotage, run, commit the results unread, read once). The
fly vision data belongs to the chat on `claude/inspiring-mayer-9mdcut` and is used unmodified.

| `fly-escapes-fibres-alone` | The round that would settle round 7's K3: GGF (only the 42 real connections onto the two Giant Fibers kept) against GSHUF alone, on many more draws (round 7 had 32 and p 0.013) | `tools/ship/flyEscapeSplit.mjs`, `brain/rl/splitShuffle.mjs`, the note's section 10 | the effect is a thousandth and a half at the median; say before the run how many draws and why | **DONE 2026-11-17 (`brain/FLY_ESCAPE_FIBRES_WIP.md` section 10): BETTER, p 2.2e-10 on 128 draws an arm -- a fly whose Giant Fibers keep their 42 real inputs beats a free shuffle in 72.5 of 100 pairs; small (a thousandth and a third at the median) and sure (0 failed trainings against 5). Round 7's near miss was too few draws. GGF was not set against GDEG.** |

**If asked for an order:** `fly-escapes-convergence-split` (done); `fly-escapes-fibres-alone` if the question is worth an hour or two; `close-pilot-coasts` (for the 6-DOF pilots' chat); then
`fly-eyes-left-right` and `fly-courts-fly`, which both wait on cells from the other chat; `two-flies-merged` last, because
every joining connection would be invented. (Round 6 and `fly-pilots-6dof`, first in the earlier order, are done.)

**Added 2026-11-17: a fly brain that learns while it lives.** Keith asked "What would it take for the fly brain to
dynamically learn?" and then: "Add as backlog entries. Let's pull in The mushroom body, and do the habitation round and if
that shows anything, then lets also do the compass circuit." **Said first: today no fly in this tree learns during its life.**
Every fly's weights are found offline by the trainer and then frozen; nothing changes a connection while a fly flies, and
round 4 found that memory between ticks did not help, because every episode comes from one unchanging world. A fly that
learns during its life can only beat a frozen one in a world that changes from one life to the next.

| name | what | what it stands on | what is open | who has it |
|---|---|---|---|---|
| `fly-mushroom-body-data` | The mushroom body (Kenyon cells, its output neurons, the dopamine neurons that teach it, APL and DPM) from the male-cns connectome, into `vendor/male-cns/` as a circuit file | the public FlyEM release tables (`gs://flyem-male-cns/v1.0/connectome-data/flat-connectome/`): no token, the same dataset version as the files already here | the circuit is thousands of cells (about 2,000 Kenyon cells a side), so what is kept and how is said in its provenance; topology only unless skeletons are asked for | **DONE 2026-11-17: `vendor/male-cns/mushroom-body-circuit.json` (4,505 cells; 101,392 connections of at least 5 synapses, with every group pair's totals at all weights), baked by `tools/maleCnsMushroomBody.py` from the public release tables; provenance in `vendor/male-cns/PROVENANCE.md`; gate `tools/ship/maleCnsMushroomBody-selfcheck.mjs`** |
| `fly-escape-habituates` | Escape round 9: the connections onto the two Giant Fibers weaken with repeated harmless looming and recover with time (habituation, which the real escape pathway does), in a world where how many harmless fly-bys come differs from life to life | rounds 5 to 8's task, cells and trainer; a fly's score is over a whole life of several episodes | the task must make learning during a life pay, or plastic and frozen will tie as memory did; costlier than an escape round, since a training scores whole lives | **DONE 2026-11-17 as escape round 9 (`brain/FLY_ESCAPE_HABITUATE_WIP.md` section 10): P CANNOT BE TOLD APART (p 1.0). Every frozen fly and 9 of 12 habituating flies became the fly that never flees; the other 3 lean on the plasticity (rates set to 0, they fall to 0.63 or 0.50), and the best (0.82) beats the hand rule. The registered learn count does not measure learning (the reflex passes it)** |
| `fly-compass-learns` | The compass circuit learns: in the real fly the ring neurons' connections onto the compass (E-PG) neurons are plastic, which is how heading is tied to the visual scene. A plastic ring-to-compass map in a world whose landmarks change between lives | `vendor/male-cns/epg-compass-circuit.json` holds the compass neurons only; **the ring neurons and their connections onto the compass neurons would have to be pulled in** (the same public tables) | to be done only if `fly-escape-habituates` shows plasticity paying (Keith's condition); a heading task does not exist in the tree yet | **DONE 2026-11-17 (`brain/FLY_COMPASS_LEARNS_WIP.md`; the ring neurons vendored in `vendor/male-cns/ring-compass-circuit.json`): P BETTER -- 12 of 12 plastic flies hold their course in the wind better than path integration alone (p 0.00049); P2 BETTER than flies trained without the plasticity (every one above every one); every plastic fly leans on its map (USES 12 of 12, 24 of 24 with the shuffle); the real wiring WORSE than a shuffle (T1, every one below every one); below the rule set by hand (H), the trainer going past it on both rates** |
| `fly-escape-habituates-start` | Round 9 again with the trainer started where never fleeing is not the nearest hill: the habituating fly started from the hand habituating reflex's behaviour, or the never-flee basin penalised in training only | round 9's task, arms and code; `brain/rl/lifeEnv.mjs` and `brain/rl/habituatingCircuit.mjs` | round 9 found 9 of 12 habituating flies stop at never fleeing; the 3 that did not used the plasticity. A learn measure that the plain reflex cannot pass must be registered first | **DONE 2026-11-17 as escape round 10 (`brain/FLY_ESCAPE_COACT_WIP.md`): P CANNOT BE TOLD APART (p 0.039, leaning toward COACT); 9 of 12 COACT flies learn within a life and use the plasticity, 3 shut the escape off through the output layer; every shuffled fly learns (unregistered: all 12 above every frozen fly)** |
| `fly-escape-through-fibres` | Round 10 again with the output layer unable to veto the fibres (no output layer, or one that cannot push the action below the reflex's), so the only way to stop fleeing is the plastic connections | round 10's fly, task, arms and code | round 10: 3 of 12 COACT flies never flee because the network's output sits under -0.5 on every tick; the shuffle's network never moved | **DONE 2026-11-17 as escape round 11 (`brain/FLY_ESCAPE_FIBRE_ONLY_WIP.md`): P BETTER -- 12 of 12 above never fleeing (p 0.00049); all 24 flies of both arms learn within a life; real wiring = shuffle (T1, p 0.63); below the hand rule (H)** |
| `fly-compass-input-balanced` | The compass round again with a fourth arm: a shuffle that keeps each compass neuron's summed ring input (and each ring neuron's), so the real wiring's fixed pull on the heading is kept and only who-connects-to-whom is drawn | the compass round's fly, task, arms and code | the compass round: the real wiring WORSE than a shuffle (T1). Measured after the reading, not registered: the real wiring's compass neurons get uneven summed input (cv 0.153, the shuffles' 0.061), which pulls the believed heading toward 65 degrees at 536, the shuffles 21 to 127; the untrained real-wiring fly 0.4430 against the shuffle's 0.5029. If the balanced shuffle is as bad as the real wiring, the pull was the difference | **REGISTERED 2026-11-18 (`brain/FLY_COMPASS_BALANCED_WIP.md`): a shuffle by swaps kept 0.93 of the real weights and was dropped; two arms instead -- PSUM (random partners, the real sums) and PEVEN (the real partners, even sums), weighed against the compass round's committed PLASTIC and PSHUF. DONE 2026-11-18 (section 9; the results committed unread at e8245294): A WORSE -- random partners given the real sums do worse than a plain shuffle (every one below every one); B BETTER -- the real partners with even sums do better than the real wiring (every one above every one); C and D CANNOT -- with the pull matched the real partners are told neither better nor worse than random ones. The pull is all of T1, as far as 12 draws can tell; every expectation came. Described after the reading: the trained rates follow the sums, not the partners, and evening the sums closes 85 percent of the compass round's gap** |
| `fly-compass-trainer` | The compass round's PLASTIC fly trained again, the walk unchanged, keeping a different point: the best on 64 lives of the draw's own (BAT64) and the walk's last point (LAST), against the trainer as it is (KEEP16, the best on the fixed 16) | the compass round's fly, task, recipe and audit; two options of `trainDockES` that change nothing without them | the compass round: every plastic fly below the rule set by hand (H), the trainer past it on both rates. Scoping: the 16-life battery prefers higher rates than fresh lives do, the walk levels within 5 iterations and then wanders, and the battery's best is its luckiest wander; on 400 scoping lives the best on 64 lives lands at the hand rule in 3 of 3 draws | **REGISTERED 2026-11-18 (`brain/FLY_COMPASS_TRAINER_WIP.md`): K BAT64 against KEEP16 and L LAST against KEEP16, draw for draw; H64 and HL against the hand rule. DONE 2026-11-18 (section 9; the results committed unread at bc153e21): K BETTER -- the best on 64 lives of the draw's own beats the best on the fixed 16 on every draw; H64 CANNOT -- it lands at the hand rule (rates a 0.0090, c 1.18e-5 against the hand's 0.01 and 1e-5); L CANNOT; HL WORSE. The compass round's shortfall below the hand rule was the trainer's choice of point, not its walk. Every expectation came. `trainDockES` now has `batteryBase` and `keep: "last"`, off unless asked for** |
| `fly-mushroom-trainer` | The mushroom round's PLASTIC fly trained again: a walk four times longer (LONG, 240 iterations) and the best on 64 lives of the draw's own (BAT64), against the mushroom round's flies (KEEP16) | the mushroom round's fly, task, recipe and audit; `trainDockES`'s options | the mushroom round: every PLASTIC fly below the hand rule on ONE (0.7757 against 0.8943). Scoping: on ONE no point of the 60-iteration walk reaches the hand rule and a better choice of point does not help; 240 iterations gain 0.08 to 0.11 | **REGISTERED 2026-11-18 (`brain/FLY_MUSHROOM_TRAINER_WIP.md`): G (LONG against KEEP16), K (BAT64 against KEEP16), HG and HK against the hand rule, on ONE and REV. DONE 2026-11-18 (section 9; the results committed unread at ae156348): ONE -- G BETTER (the longer walk, 11 of 12), K CANNOT, HG WORSE (still below the hand rule, 1 of 12 above), HK WORSE; REV -- G CANNOT, K CANNOT, HG BETTER (12 of 12 above the hand rule), HK CANNOT. The mushroom fly's shortfall was its walk's length (70 percent of the gap closed), not the choice of point -- the other way round from the compass fly** |
| `fly-home-offset` | A fly told its heading with a fixed 20-degree offset, and with a wandering error of the same size, on the compass life and the homing life | the homing round's task and wrapper; the compass round's fly with vision off | the homing round, measured after its reading: the arms differ in their heading error's offset, not its wobble; scoping: of the same size, both cost the course alike and only the wobble costs homing | **REGISTERED 2026-11-18 (`brain/FLY_HOME_OFFSET_WIP.md`): O (offset: course cost against home cost), W (wobble: home cost against course cost), X and Y (offset against wobble at home and on the course), sign tests over 200 lives. DONE 2026-11-18 (section 9; the results committed unread at 1b43f9ea): O, W and X BETTER, Y CANNOT -- every expectation came. Finding home with a home vector kept in the fly's own heading forgives an offset (it costs the course 0.054 and homing nothing) and not a wobble of the same size (course 0.051, homing 0.260)** |
| `fly-mushroom-recover` | The mushroom fly with a recovery rate it may learn (every connection drawn back toward its synapse count each trial) | the mushroom round's fly, task, recipe and audit; `brain/rl/mushroomFly.mjs` not edited | the mushroom round: REV flies averaged 0.25; scoping: the hand rule with recovery 0.1 scores 0.46 on REV and 0.75 on ONE; two of three short REV trainings found b of about 0.07, every ONE training drove it to 0 | **REGISTERED 2026-11-18 (`brain/FLY_MUSHROOM_RECOVER_WIP.md`): R (RECOV against PLASTIC) and H on each task; USES and b at 0 counted. DONE 2026-11-18 (section 10; the results committed unread at 67354bc3): REV -- R BETTER (0.3785 against 0.2524), H BETTER, USES 10 of 12; ONE -- R CANNOT, H WORSE, b at 0 in all 12. A fly that can undo its lessons does better when the meanings swap, and the same trainer refuses recovery when lessons must be kept. Every expectation came. After the reading: the hand rule with recovery 0.1 scores 0.5000 on REV, above every trained fly** |
| `fly-trained-home` | The compass fly trained on the homing score itself (HOMEP real wiring, HOMES a shuffle), against the trainer round's course-trained BAT64 flies (COURSE64) flown home | the homing round's task and wrapper (not edited); the trainer's 64-life choice | the homing round: course-trained flies home at about 0.55, the told ceiling 0.995; scoping: two homing-trained flies 0.564 and 0.577 against 0.564 and 0.565 | **REGISTERED 2026-11-18 (`brain/FLY_TRAINED_HOME_WIP.md`): G (HOMEP against COURSE64), T1 (HOMEP against HOMES), H and V. DONE 2026-11-18 (section 10; the results committed unread at 76d8bc95): G WORSE (ranks 97, p 0.0014), T1 WORSE (101, p 0.0036), H WORSE (0 of 12 above the hand rule's 0.5551), V BETTER (12 of 12 above 0.4559). Trained on the homing score, the compass fly comes home worse than when trained to hold a course, by 0.0041, though the training climbs from the start's 0.4568 to 0.5501. G and H came the 5 percent left over. After the reading: home follows course (Spearman 0.86 over the 36 flies); on the 64 lives each point was kept on, the kept homing fly beats its course-trained draw on 12 of 12 draws and loses on the audit, so the point kept is the one its 64 lives favoured** |
| `fly-mushroom-odours` | Odours made through the vendored projection neurons (72 glomeruli; the 5 percent of Kenyon cells with the most input fire): the real wiring, a degree-keeping shuffle of it, and the real wiring with the teachers permuted | `vendor/male-cns/pn-kc-circuit.json` (vendored 9a4adaec); the mushroom round's fly | the mushroom round: with random odours the teachers' pairing did not matter; scoping: PLASTIC 0.79 to 0.81, SHUFPN 0.76 to 0.79, PFAM 0.68 to 0.80, the hand rule 0.53 | **REGISTERED 2026-11-18 (`brain/FLY_MUSHROOM_ODOURS_WIP.md`): T1 (PLASTIC against SHUFPN), T2 (PLASTIC against PFAM), H; USES counted. DONE 2026-11-18 (section 10; the results committed unread at 62dd5be5): T1 CANNOT (ranks 144, p 0.76), T2 CANNOT (146, p 0.84), H BETTER (11 of 12 above the hand rule's 0.5003), USES 12 of 12 in every arm. With odours made through the real projection neurons, the real wiring codes them no better than a degree-keeping shuffle, and the teachers' pairing still does not matter. Every expectation came. After the reading: one PLASTIC training never took off (0.1093); the medians are 0.8095, 0.8118, 0.8132; the scoping's 3 of 3 for the real wiring was the luck of draws 1 to 3** |
| `fly-home-chooser` | HOMEP's walks (the compass fly trained on the homing score) run again with every point recorded, the point chosen on 256 homing lives (HOME256) or by the course score on COURSE64's lives (HOMEBYC) | round 4's task, fly and recipe; the trainer's new `onPoint` observer (nothing changes without it) | round 4: G WORSE by 0.0041, and after the reading the kept homing fly beat its course-trained draw on its own 64 lives on 12 of 12 draws and lost on the audit; scoping: the walks reproduce HOMEP to the bit, the choosers within 0.02 of each other on the scoping lives | **REGISTERED 2026-11-18 (`brain/FLY_HOME_CHOOSER_WIP.md`): C256 and CBC (against HOMEP, draw for draw), G256 and GBC (against COURSE64). DONE 2026-11-19 (section 10; the results committed unread at f902ad40): C256 CANNOT (6 and 6), CBC BETTER (11 of 12), G256 CANNOT (p 0.020), GBC CANNOT (HOMEBYC 0.5542, COURSE64 0.5541). The choice was costing HOMEP, but not for want of lives: the course score chose better, closing round 4's gap (0.0041 on average). Three of four expectations came; CBC BETTER was given 25** |
| `fly-home-gradient` | HOMEP's walk with each fly tried scored on 16 homing lives instead of 4 (HOME16), its point kept as HOMEP's on its draw's 64 lives | round 4's task, fly, recipe and battery (none edited); the chooser round's walk | round 4: G WORSE by 0.0041; scoping on 2 draws: HOME16 ahead of HOMEP and COURSE64 on both on the scoping lives, both walks keeping a point from their first five iterations | **REGISTERED 2026-11-18 (`brain/FLY_HOME_GRADIENT_WIP.md`), before the chooser round is read, to run on Keith's machine: W (HOME16 against HOMEP, draw for draw), G16 (against COURSE64); the machine checked to the bit on round 4's HOMEP draw 1 and the homing round's floors before any training. DONE 2026-11-19 (section 10; run on Keith's machine, committed unread there at 1ac6ffcf; the machine passed both checks to the bit): W BETTER (11 of 12, by 0.0016 on average), G16 CANNOT (HOME16 0.5517, COURSE64 0.5541). HOMEP's walk was costing it, as the chooser round found its choice was; one of two expectations came (W BETTER was given 30). After the reading: against the chooser round's HOMEBYC, 3 above and 9 below** |
| `fly-home-gradient-course` | The gradient round's HOME16 walks, their point chosen by the course score on BAT64 lives (H16BYC), as the chooser round's HOMEBYC was | the gradient round's committed walks and the chooser round's chooser (neither edited); no walk run again | chooser round: CBC BETTER; gradient round: W BETTER; scoping on 2 draws: on the scoping lives the course chooser below HOME16's own point on both | **REGISTERED 2026-11-25 (`brain/FLY_HOME_GRADIENT_COURSE_WIP.md`): Q (against HOME16), K (against HOMEBYC), both draw for draw; G (against COURSE64). DONE 2026-11-25 (section 9; the results committed unread at ba08a98a): Q CANNOT (9 and 3), K CANNOT (5 and 7), G CANNOT (H16BYC 0.5548, COURSE64 0.5541). With the course chooser the walk's lives do not show, and the homing fly reaches the course-trained one and no further; every expectation came** |
| `fly-home-course-predicts` | Points at iterations 0, 10, 20, 30, 40 and 59 of the 24 committed homing walks (HOMEP's and HOME16's), 144 flies, flown home and on the course | the committed walks (none run again) | four homing rounds: no homing fly past the course-trained one; scoping on the 84 kept flies: Spearman 0.83, and 0.57 to 0.87 within each arm | **REGISTERED 2026-11-26 (`brain/FLY_HOME_COURSE_PREDICTS_WIP.md`): S (12 groups at a fixed stage), W (24 walks), sign tests of the Spearman correlations against 0. DONE 2026-11-26 (section 9; the results committed unread at 05491300): S BETTER (12 of 12 groups, 0.66 to 0.99), W BETTER (24 of 24 walks), 0.87 over all 144 flies. At a fixed stage the better course-holder finds home better; every expectation came. After the reading: the homing walks wander in holding a course and home follows** |
| `fly-home-compass-noise` | 48 committed flies (HOMEP, COURSE64, HOME16, H16BYC) flown with the heading their compass sees jittered (sigma 0, 0.2, 0.4, 0.8) | the compass and homing lives, extended, not edited; no training | the course-predicts round: home = 0.2434 + 0.4696 x course over its 144 flies; scoping on 2 flies: home fell 0.81 and 0.91 a unit of course | **REGISTERED 2026-11-26 (`brain/FLY_HOME_COMPASS_NOISE_WIP.md`): C (does the noise bite), R8 and R4 (does home fall further than 0.4696 x the course fall). DONE 2026-11-26 (section 10; the results committed unread at 41b1ad07): C WORSE (48 of 48), R8 WORSE (45 of 48, 0.0121 further on average), R4 CANNOT (27 and 21). A little noise costs homing what the lost course-holding accounts for; a lot costs it more. Two of three expectations came (R4 WORSE was given 65). After the reading: home's fall a unit of course grows with the noise (0.15 to 0.65), and R8 holds within the line's range (36 of 36)** |
| `fly-home-true-tally` | The compass-noise round's 48 flies flown home with a perfect tally (the true way home shown from HOME_AT), steering on their own compass, at sigma 0, 0.4, 0.8 | the noisy homing life and the committed flies (none edited); no training | compass-noise round: R8 WORSE, R4 CANNOT; scoping on 2 flies: a perfect tally homes at about 0.92 against 0.56, and falls 0.046 and 0.037 at sigma 0.8 against 0.068 and 0.072 | **REGISTERED 2026-11-26 (`brain/FLY_HOME_TRUE_TALLY_WIP.md`): T0 (the perfect tally against the fly's own at sigma 0), T8 (its fall at sigma 0.8 against the own tally's). DONE 2026-11-26 (section 10; the results committed unread at cd3036c6): T0 BETTER (48 of 48, about 0.91 against 0.55), T8 BETTER (46 of 48). The homing fly's shortfall is mostly its tally, and part of the noise's cost is the tally's; every expectation came. After the reading: with the perfect tally, course and home go together at -0.36 (0.80 with the fly's own), and the homing-chosen flies steer home better than the course-chosen (p 0.0001, not registered)** |
| `fly-compass-error` | The compass-noise round's 48 flies on the compass life, their heading error in the calm and the wind and the share of each gust left 39 ticks on, as trained and with the landmark gain x4 (and home at x4) | the compass life and fly (not edited); no training | perfect-tally round: the shortfall is the tally; scoping: two compasses on the ring err alike (gap 0.02 to 0.06, error 0.55); x4 catches gusts faster but errs more in the calm and homes worse | **REGISTERED 2026-11-26 (`brain/FLY_COMPASS_ERROR_WIP.md`): W (wind against calm), L (share of a gust left against one half), K1 to K3 (x4 against as trained: share left, calm error, home). DONE 2026-11-26 (section 10; the results committed unread at 38fe3522): W, L, K1, K2 all 48 of 48, K3 47 of 48, each as expected. The compass keeps most of each gust it cannot feel; leaning on the scene catches gusts but errs more in the calm and homes worse: what limits it is the reading of the scene. After the reading: p_c sets the trade (0.97), and the homing-chosen flies lean harder on the scene than the course-chosen** |
| `fly-scene-types` | The 48 committed flies, as trained, in a scene where each ring-neuron class (11) or type (26) sees its own two landmarks: compass error, course and home | the compass and homing lives, extended, not edited; the connectome's ring types; no training | compass-error round: the reading of the scene limits the compass; scoping: ring tuning is not in the connectome (resultant 0.075 against 0.173 by chance); more landmarks for all blur; a set per class lifted home by about 0.04 on 2 flies | **REGISTERED 2026-11-26 (`brain/FLY_SCENE_TYPES_WIP.md`): H11, C11, W11 (the 11-class scene against the plain), H26 (26 types against 11 classes). DONE 2026-11-26 (section 10; the results committed unread at 1ff16e90): H11, C11, W11 all 48 of 48 (home up 0.024, course 0.053, wind error down 0.115), H26 BETTER (46 of 48). The reading of the scene was the limit, and more cues lift it; three of four expectations came (H26 BETTER was given 35). After the reading: in the 26-type scene the homing-chosen flies come home better than the course-chosen, the plain scene's order turned over** |
| `fly-scene-trained` | HOMEP's fly and recipe trained in the 26-type scene (HOMET, 12 draws): home there against the committed HOMEP's, and in the plain scene | the typed scene, as committed; the homing life scored for a trainer, extended, not edited | scene-types round: the committed flies come home better in the 26-type scene untrained | **DONE 2026-11-26 (`brain/FLY_SCENE_TRAINED_WIP.md`): R26 CANNOT -- 10 of 12 above HOMEP in the 26-type scene (p 0.039, by 0.009); RP CANNOT (8 of 12 below in the plain, p 0.39); described: the scene's lift wider in 11 of 12 (p 0.0063)** |
| `fly-scene-lift` | HOMEP's fly and recipe trained in the plain and the 26-type scene on draws 13 to 24: is the 26-type scene's lift wider for the fly trained there? | the typed scene and its training life, as committed | scene-trained round: the lift wider in 11 of 12 (described, p 0.0063) | **REGISTERED 2026-11-26 (brain/FLY_SCENE_LIFT_WIP.md): L (the lift, HOMET against HOMEP), G (p_c), R26, RP. DONE 2026-11-27 (section 9; the results committed unread at fc7f4a4d): L CANNOT (9 of 12, p 0.15), G CANNOT (10 of 12, p 0.039), R26 BETTER (11 of 12, p 0.0063), RP CANNOT (4 of 12). After the reading: both rounds point the same way -- over all 24 draws the lift wider in 20 (p 0.0015), p_c higher in 19** |
| `fly-scene-tally` | The 48 committed flies flown home in the 26-type scene with the true way home shown: is the tally's cost there larger than in the plain scene? | the typed scene, as committed; the perfect-tally round's way home | perfect-tally round: 0.91 against 0.55 in the plain scene | **REGISTERED 2026-11-26 (brain/FLY_SCENE_TALLY_WIP.md): T26 (the perfect tally in the 26-type scene), Q (the tally's cost there less in the plain). DONE 2026-11-27 (section 9; the results committed unread at 09062f15): T26 BETTER (48 of 48, p 7.1e-15), Q BETTER (40 of 48, p 3.3e-6); both expectations came. After the reading: the cost grows in proportion -- the own tally keeps the same share of the perfect tally's home in both scenes (23 above, 25 below, p 0.89), and Q is the course-chosen flies' (12 of 12 each)** |
| `fly-tally-share` | The 48 committed flies flown four ways on 200 fresh lives: does the own tally keep the same share of the perfect tally's home in both scenes? | the plain and 26-type scenes, as committed; four committed scorers | scene-tally round, after its reading: 0.6048 plain, 0.6066 26-type | **REGISTERED 2026-11-28 (brain/FLY_TALLY_SHARE_WIP.md): EQ (two one-sided sign tests at 0.02), D. DONE 2026-11-28 (section 9; the results committed unread at 0bb1ccde): EQ EQUIVALENT (48 of 48 and 43 of 48 inside), D CANNOT (17 above, 31 below, p 0.059); both expectations came. The share itself is about 0.65 on these lives, not 0.60** |
| `fly-course-lift` | Do the course-chosen flies gain least from the richer scene? Read on the tally-share round's fresh lives, by draw | the tally-share round's results file; no flight | scene-tally round, after its reading: COURSE64 0.022 and H16BYC 0.025 against 0.041 and 0.038 | **REGISTERED 2026-11-28 (brain/FLY_COURSE_LIFT_WIP.md), before the tally-share round ran: L. DONE 2026-11-28 (section 7): L BELOW (2 above, 22 below of 24, p 3.6e-5), given 5 -- the pattern REVERSES on fresh lives, so it belonged to the lives, not to how the flies were chosen** |
| `fly-tally-correct` | A tally that re-lays its recent steps by the compass's correction (g, tau), one setting chosen on DEV: does it find home better? | brain/rl/correctingTally.mjs; DEV 50 and HELD 200 fresh lives | scoping: HOMEP draw 1 0.6078 -> 0.6342 at g 1, tau 250 on 30 lives | **REGISTERED 2026-11-28 (brain/FLY_TALLY_CORRECT_WIP.md): C26, CP** |
| `fly-scene-strong` | HOME16's recipe (16 lives a tried fly) trained in the 26-type scene (HOMET16, 12 draws): home there and in the plain scene against HOME16 | the typed scene and its training life, as committed | scene-trained round: HOMET 10 of 12 above HOMEP in the 26-type scene (p 0.039); home-gradient round: HOME16 the stronger trainer | **REGISTERED 2026-11-27 (brain/FLY_SCENE_STRONG_WIP.md): S26 (HOMET16 against HOME16 in the 26-type scene), SP (in the plain). DONE 2026-11-27 (section 10; the results committed unread at b6c8aac8): S26 CANNOT (8 of 12, p 0.39), SP CANNOT (2 of 12, p 0.039); both expectations came. After the reading: the stronger trainer buys nothing in the 26-type scene the weaker did not -- against HOMET 5 of 12 there** |
| `fly-scene-gains` | The compass fly with a gain for each of the 11 ring classes, trained with HOMEP's recipe in the 26-type scene (HOMEG, 12 draws): home there and in the plain scene against HOMET | the typed scene, as committed; the compass fly, extended, not edited | scene-trained round: one gain for all, HOMET | **REGISTERED 2026-11-26 (brain/FLY_SCENE_GAINS_WIP.md): G26 (home in the 26-type scene, HOMEG against HOMET), GP (in the plain scene). DONE 2026-11-27 (section 10; the results committed unread at 69e4f26a): G26 CANNOT (5 of 12, p 0.77), GP CANNOT (6 of 12, p 1.0); both expectations came. After the reading: the gains move but not together -- six draws switch a class off; ER4d's gain above 1 in 11 of 12 (one of eleven classes looked at)** |
| `fly-scene-mixed` | HOMEP's fly and recipe trained on alternate lives of the plain and 26-type scenes (HOMEM, 12 draws): home in the 26-type scene against HOMET, in the plain against HOMEP | the two scenes' training lives, as committed | scene-trained round: HOMET against HOMEP, neither told apart | **REGISTERED 2026-11-26 (brain/FLY_SCENE_MIXED_WIP.md): M26 (HOMEM against HOMET in the 26-type scene), MP (against HOMEP in the plain). DONE 2026-11-27 (section 10; the results committed unread at 608d47d2): M26 CANNOT (6 of 12, p 1.0), MP CANNOT (2 of 12, p 0.039); both expectations came. After the reading: the fly trained in both scenes is the fly trained in the 26-type -- against HOMET the same in the plain too (6 of 12), its weights much the same** |
| `fly-mushroom-long-recover` | The recovery round's fly (it may learn to undo its lessons) trained four times longer (RLONG, 240 iterations), against the recovery round's RECOV and the mushroom trainer round's LONG as committed | the recovery round's fly and the trainer round's walk length (neither edited) | the recovery round: the hand rule with a recovery of 0.1 scored 0.5000 on REV, above every trained fly (0.4777 the most); scoping: 240 iterations better on 5 of 6, two REV flies found more recovery | **REGISTERED 2026-11-18 (`brain/FLY_MUSHROOM_LONG_RECOVER_WIP.md`): G (RLONG against RECOV, draw for draw), L (RLONG against LONG), H (against the hand rule committed for each task); USES and b at 0 counted. DONE 2026-11-18 (section 10; the results committed unread at 32c77504): REV G BETTER (12 of 12), L BETTER (ranks 209), H CANNOT (5 above 0.5000, 7 below), USES 10 of 12; ONE G BETTER, L CANNOT (153), H WORSE (1 of 12 above 0.8943), b at 0 in all 12. With a long enough walk the trainer finds about the recovery the hand rule has; every expectation came. After the reading: the hand rule with a recovery of 0.2 scores 0.5307 on REV, above every trained fly (0.5297 the most), and 8 of 12 REV walks kept a point at iteration 200 or later** |
| `fly-mushroom-many` | Eight odours a life through the real projection neurons, half bad, 120 trials: the real dopamine teachers (PLASTIC) against the mushroom round's permuted ones (PFAM) | the odour round's odours and wiring and the mushroom round's fly (none edited) | twice the pairing did not matter (random odours, and two odours through the projection neurons); a free readout can relearn any permutation, so what is left to matter is which Kenyon-cell inputs each teacher's neurons sample; scoping at 8 odours: PFAM ahead on 3 of 3 | **REGISTERED 2026-11-18 (`brain/FLY_MUSHROOM_MANY_WIP.md`): T2 (PLASTIC against PFAM), H; USES counted. DONE 2026-11-18 (section 10; the results committed unread at b5aaccb2): T2 CANNOT (ranks 135, p 0.41), H BETTER (12 of 12 above 0.6566), USES 12 of 12 in each arm; PLASTIC 0.8908, PFAM 0.8923. With eight meanings the real pairing still does no better than a permuted one; every expectation came. After the reading: the hand rule written for the real teachers scores 0.1090 on the permuted flies, and written for each permutation's own teachers 0.6474, with 8 of 12 permutations above the real pairing; the trained flies do not follow it (Spearman -0.03)** |
| `fly-mushroom-body-learns` | The fly's associative learning: a cue (a looming pattern, a colour of mover) paired with being caught or fed, learned through the dopamine neurons onto the Kenyon-cell-to-output connections, in a world where which cue means danger changes between lives | `fly-mushroom-body-data` | everything after the data: the task, how the cells are fed, the plasticity rule; the biggest of these | free, after the data **REGISTERED 2026-11-18 (`brain/FLY_MUSHROOM_BODY_WIP.md`): two odours a life, one bad, on a task whose meanings are fixed for the life (ONE) and one whose meanings swap half way (REV); FROZEN, PLASTIC (the real teachers), PFAM (pure teachers given to other neurons) and PSHUF (mixed teachers); P, T1 (purity), T2 (pairing) and H (the hand rule) on each task. DONE 2026-11-18 (section 11; the results committed unread at 5f64c614): P BETTER on both tasks; T1 BETTER on both -- the real teachers beat mixed ones (on REV every fly above every one); T2 CANNOT on both -- which neuron gets which pure teacher is not shown to matter; H WORSE on ONE, CANNOT on REV. The purity pays, most when what was learned must be undone. Every expectation came but REV's H** |
| `fly-live-training-page` | Page work, not a round: the trainer runs live in a worker on a page and the watcher sees a fly get better over minutes | the escape page and `brain/rl/dockPolicy.js` | it is the trainer learning, not the fly; say so on the page | free |

Keith, 2026-11-13: "How else could the fly brain live in voxel world? Could it play minecraft or create something to attract a
different fly brain?" and, of the five answers: "Yes, add those to the backlog". Each builds on `voxel-home` (`brain/rl/buildEnv.mjs`:
the site, the plan, `homeCheck`). **Said first: the real Minecraft is not reachable from here and is not to be rebuilt; "play
Minecraft" below means a survival loop in the tree's own voxel world.**

| id | the idea | what is real in it | what it needs | parallel? |
|---|---|---|---|---|
| `fly-escapes-home` | A fly body in the voxel world sees something loom (a falling block, a predator) and dodges, or dives through its door | **The Giant Fiber Circuit is the fly's escape circuit: in a real fly it fires on a looming object and triggers take-off. This is the one use where the circuit would do its own job.** | a looming feature (the angular size of the nearest approaching thing and its rate), a small body in the voxel world (`render/voxelBodies.mjs`), a threat generator; a round against the matched plain net | yes |
| `fly-finds-home` | The fly wanders off to forage and steers back to its door by its heading | the heading circuit (`brain/pilotSubCircuitState.mjs`: 148 cells, 7,080 synapses) is what a real fly keeps a compass bearing with. **The measured answer on it so far is mostly negative (rung 4a): expect a modest result.** | a 2-D or 3-D walk with the heading as the only sense of direction, a home position; the stateless and plain-net controls the earlier rounds used | yes; best with `fly-escapes-home` as "the fly lives in its home" **REGISTERED 2026-11-18 (`brain/FLY_FINDS_HOME_WIP.md`) on the compass round's fly, not `brain/pilotSub*`: the compass and balanced rounds' committed flies (nothing trained) keep a home vector in their own heading and steer home from tick 1,000; V (against vision off), P2, T1, A (PSUM), B (PEVEN), H. DONE 2026-11-18 (section 11; the results committed unread at 6ac4494f): V BETTER -- the compass the fly learned carries it home better than path integration alone (12 of 12); P2 BETTER; T1, A and B CANNOT -- the real wiring's handicap at holding a course does not carry over to finding home (course differences of 0.03, home under 0.005); H WORSE. After the reading, not registered: the arms differ in their heading error's offset, which a home vector kept in the fly's own frame mostly cancels** |
| `fly-survives` | A survival loop: hunger, night, weather; dig to gather blocks, build shelter before dark, eat | little: the rules would carry most of it, the brain a small part. `brain/NEEDS_AND_LIMITS.md`'s needs planner is the layer above a flying pilot | the largest build of the five: an inventory, digging (`render/voxelDeviceEdit.mjs` `digAt`), a day, needs | yes |
| `fly-attracts-fly` | A signalling game: one fly-wired builder makes a structure, a second fly-wired agent, trained separately, chooses which structure to approach; trained together | the wiring of both. **An invented behaviour on real wiring: real flies attract by song and scent, not architecture, and the tree holds neither circuit. The page must say so.** | a chooser environment (two sites, one the builder's, one a random pile of the same block count), co-training; the test: does the visitor pick the builder's over the pile, and does a shuffled wiring do as well | yes; **the visitor could be another peer's brain (`swek-brain-v1`), which would give `peer-jobs` a first real use** |
| `two-flies-one-site` | Two builders on one site: together, or competing for the same blocks | the wiring | `BuildEnv` with two builders taking turns; cheap once `voxel-home` is done | yes |

## Added 2026-11-14: `voxel-home-trainer` -- another training round that changes the trainer, not its length (`start-at-the-lean` DONE; `smaller-steps` and `more-samples` DONE as round 5)

**Round 4, `start-at-the-lean`, is DONE** (`brain/VOXEL_HOME_LEAN_WIP.md` section 8, `tools/ship/voxelHomeLean-selfcheck.mjs`
section 6; `brain/rl/leanStart.mjs`): the builder is the lean plus its network, the network's output layer started at zero. **All
80 builders beat the lean** (0.988 to 0.992 of a home by arm against 0.9226; p 1.7e-24) **and they finish houses: 12,700 homes in
16,000 builds**, 151 to 172 of 200 a builder by arm against the lean's 123. Looked at after: the network learned not to ask for a
roof block that would hang (23.8 such picks a build for the lean, 5.3 for FLY draw 1). The fly's wiring cannot be told from a
shuffle (p 0.40), the fifth time. The page (`voxel-home.html`) plays round 4's and round 6's builders too (`brain/voxelHomeShow.mjs`
knows rounds 1 to 4 and 6; round 5's records are of another shape). **Round 5 is DONE** (`brain/VOXEL_HOME_STEPS_WIP.md` section 9, `tools/ship/voxelHomeSteps-selfcheck.mjs` section 5), from a
random start on FLY and PLAIN: **four times the builders tried an iteration builds more** (FLY 0.714 for 0.666, PLAIN 0.745 for
0.690; all 16 above all 16, twice) and more than round 3's 1,000 iterations did at 0.6 of its cost; **a quarter of the step
cannot be told apart from round 2's** at 150 iterations. Neither had levelled. It is still half way to the lean, and one home.
The trainer's step is `lr / (sigma x sqrt(pop))` a weight whatever the signal, so the backlog's "smaller sigma" below was the
wrong knob (a smaller sigma is a LARGER step). **Round 6, the two together, is DONE** (`brain/VOXEL_HOME_BOTH_WIP.md` section 8,
`tools/ship/voxelHomeBoth-selfcheck.mjs` section 5): a start at the lean with 96 builders tried builds 0.997 of a home in every
arm (round 4: 0.988 to 0.992) and finishes **15,023 homes in 16,000 builds, 188 of 200 a builder** (round 4: 159; the lean 123;
the best 192, none all 200); 79 of 80 builders above their round 4 selves (p 1.3e-22); the five arms within two ten-thousandths;
the wiring not told from a shuffle (p 0.42), the seventh time. **Round 7 is DONE** (`brain/VOXEL_HOME_MORE_WIP.md` section 8,
`tools/ship/voxelHomeMore-selfcheck.mjs` section 5), from a random start on FLY and PLAIN: **384 builders tried builds more than
96** (0.733 and 0.761 for 0.714 and 0.745; p 0.0022, 0.0034) but by a third of what 24 to 96 gave; **the quarter step for 600
iterations builds more than round 2** (0.714 and 0.745; all 16 above all 16) and lands where 96 builders for 150 did, to four
places, at the same cost. Still half way to the lean; 17 homes in 12,800 builds. **Open, not registered: `another-trainer`**
(it was not in round 7: the tree's other trainers under `brain/rl/` have to be read and one chosen).

Keith, 2026-11-14, of the three choices after round 3: "Do item 1. Backlog item 2 another training." Round 3
(`brain/VOXEL_HOME_LONG_WIP.md` section 8) measured that 6.7 times the iterations of the same trainer bought 0.01 to 0.02 of a
home and that the learning had levelled by about iteration 166; the best arm stands 0.375 of the way from a random builder (0.572)
to the lean that needs no network (0.923, 123 homes of 200). So the next round keeps the environment, the arms, the draws and the
audit, and changes ONE thing about the trainer. The candidates, none tried, none registered:

| id | the one change | why it might matter | what it would and would not show |
|---|---|---|---|
| `start-at-the-lean` | Each builder starts with its decoder set so that it already leans to the unfinished columns, then trains | the lean is a linear function of the observation, and every arm can express it; training from it asks whether the trainer can IMPROVE on the lean (learn the order: walls before lintel, roof inward) rather than find it | whether these networks can beat 0.92; NOT whether they can find the lean themselves, which rounds 2 and 3 say they do only a third of the way |
| `smaller-steps` | sigma 0.14 -> a smaller one (and the learning rate with it), or a sigma that falls over the run | with 2,967 weights and 24 samples an iteration, a large sigma may be why the history levels at 0.25 missing | whether the plateau is the step size |
| `more-samples` | pop 24 -> larger, or more training plans an iteration (trainEps 8 -> more) | the reward is noisy (a column is DRAWN), so the gradient estimate may be mostly noise | whether the plateau is noise |
| `another-trainer` | a different optimiser on the same reward (the tree has others under `brain/rl/`: read before choosing) | natural ES with rank shaping is one choice of many | whether the finding is the trainer's |

**Recommended: `start-at-the-lean` first** -- it is the one whose answer is new either way (above the lean: the networks learned
the building order; at it or below: this trainer cannot even hold what it is given), it reuses `makeRound()` with one more cfg key,
and it costs a round 2 (about 10 minutes at 150 iterations). `smaller-steps` and `more-samples` are one cfg key each as well and
could be one round of three trainer settings on FLY and PLAIN alone if the wiring question is set aside. **The wiring question
(T1) has now been asked four times with the same answer; a fifth round should not be sold as asking it again.** Registered first,
as every round: a note before code, the results committed before they are read.

**Recommended order, if asked:** `voxel-home-trainer` (`start-at-the-lean`), then `fly-escapes-home` with `fly-finds-home`
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
