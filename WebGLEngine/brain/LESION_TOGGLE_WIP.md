# The lesion toggle (2026-11-17; UNNUMBERED; branch `ccr-ca830954-770ho4`)

Keith, 2026-11-17: "Let's do the 3 my pick items. We need to check the other chats branches in case any of these items are being worked on, some are done." The three were the aquarium's 3D-view items (`tank-nav-3d`, `survey-3d-markers`, `fly-dark-sub-3d`), `lesion-toggle` and `nav-fleet-avoidance`.

## 1. What the branch check found (every remote branch with a commit since 2026-11-05, read against `main` at `0513238a`)

| item | state on other branches | so here |
|---|---|---|
| `tank-nav-3d`, `survey-3d-markers` | BUILT on `claude/inspiring-mayer-9mdcut` (`0267907b`, 2026-11-15: islands as columns, bergs and ships with keels, goal buoys, station rings) | not done here |
| `fly-dark-sub-3d`, survey markers | BUILT on `claude/code-review-nr3a0i` (`5fd137be`, 2026-11-17: dark compass and station markers in the 3D view) | not done here. **Both branches edit `render/subAquarium3d.mjs` for the station markers**: whoever merges second resolves that file by hand |
| `lesion-toggle` | nobody (no commit, file or note on any branch names it) | **built here** (below) |
| `nav-fleet-avoidance` | nobody by name, BUT `claude/code-review-nr3a0i` is working the traffic arc right now (`nav-traffic-avoid-not-slow` FOLLOW-UP 6, `brain/subGiveWay.mjs`, committed 2026-11-16) and fleet avoidance would build on that give-way rule | **held**, so as not to fork the traffic arc under a live chat |

Also found while reading: `tools/ship/nextRounds.mjs` still lists as OPEN entries that are done. They are listed here and not edited there, because every branch edits that file (the rule in `brain/BACKLOG_2026-11-04_BRAINS.md`). At merge:
* `fish-pilot-tank-kind`, `fly-kind-peer-registration`: closed on `claude/code-review-nr3a0i` (`a14cd3e5`); `fly-dark-sub-3d` closed there too (`5fd137be`).
* `plain-net-tank-kind`, `fly-pair-replication`: DONE 2026-11-05 (`brain/BACKLOG_PICKUPS_2026-11-05.md`).
* `fly-plain-net-variants`, `fish-wiring-vs-shuffle-fresh`: RESULT sections dated 2026-11-08 in `brain/PLAIN_NET_VARIANTS_WIP.md` and `brain/FISH_WIRING_FRESH_WIP.md`.
* `sub-glb-model-swap` and its twin `submarine-glb-model-swap`: phases 1-3 built (`docs/SUB-GLB-MODEL-SWAP.md`, the picker on `sub-aquarium.html` since v4910); only a real Sketchfab file is unchecked.
* `tank-nav-3d`: built on `claude/inspiring-mayer-9mdcut`.
* NEW, to add: `lesion-toggle` (this note) as DONE IN PART; see section 5 for what is not done.

## 2. What was built (new files, plus the switchboard page, its view and the command)

* `brain/lesion.mjs`: silencing is EXACT and is a weight edit. `createSubPolicy`'s forward starts each hidden neuron at relu(input row . x + bias) and on every recurrent step adds its own previous value and its incoming edges. So zeroing a neuron's input row, its bias and every edge INTO it keeps it at 0 throughout. The lesioned pilot is an ordinary vector of the same length, and the tank flies it through the same kind with no change. Also: `classesOf` (by type or by type-and-side), `inertOf` (neurons that can never fire), `randomSets` (MATCHED by default), `lesionArms` (switchboard arms held to the intact arm), `lesionReading` (cost and rank p), `topologyOf` (gfc networks and the fish pilot).
* **The confound the design is built around:** the trainers start from `handWeights()`, which put the autopilot's four laws on neurons 0-7, and in the fly's Giant Fiber Circuit those are ALL GFC2 (GFC2 is 0-9). A random control that ignores this would make "GFC2 matters" look true. The matched control silences as many hand-channel neurons as the class does.
* `brain/lesion-selfcheck.mjs`: 8 sections, about 50 rows, under 1 s. It includes this gate's own masked forward as the definition of "silenced", 144 random cases on both circuits, and real tank flights.
* `switchboard.html` + `render/switchboardView.mjs`: on the dropout task, a Lesion box (arm, class by type or by type and side, 1-8 random sets, matched on or off, "Add lesion arms"). The lesion lines and their caveat print under the reading and go into the copied text. The zebrafish pilot (803 weights) is on the board now. `notOnBoard` was changed to match: the fish and the toggle came off the list, and "a lesion on a survey arm" went on.
* `tools/ship/takeSwitchboard.mjs dropout --lesion arm:Class[,arm:Class] [--by] [--draws] [--seed] [--unmatched]`.
* Run by hand once in headless Chromium (files served through request routing): the GFC2 lesion of the noisy network on ids 0-5, no console errors, no horizontal scroll at 390 px.

## 3. SABOTAGE LOG

45 mutants of `brain/lesion.mjs`, each run alone against the gate from a scratch copy (the gate reads `LESION_UNDER_TEST`). On the first pass 37 of 42 went red. Five stayed green, and each got a row:
* the liveness fixed point cut to one pass: the chain row now uses a chain whose second edge comes FIRST in the edge list;
* `matched` not passed through to the draws: a `matched: false` row;
* `entry()` returning the intact weights: the old row used the hand weights, where GFC1 is inert and the lesion is the identity. It now uses random weights;
* "MORE THAN EVERY" at one draw costing more: a "more than 2 of the 3" row;
* no label-length check: a row.

After that, 42 of 42. Three `topologyOf` mutants were added later, so the total is 45 of 45 red.

## 4. AN EXPLORATORY READING (NOT REGISTERED; a demonstration of the tool, not a round)

Dropout task, ids sb-0 to sb-19, 120 s, 8 matched random sets per class (seed 1). Cost = intact minus lesioned score. p = the class's rank among its random sets' costs; the smallest p 8 draws can give is 0.111.

| arm | class (neurons) | class cost | random costs (range) | rank p |
|---|---|---|---|---|
| network-noisy | GFC1 (3) | -0.0066 | -0.006 .. +0.011 | 1.000 |
| network-noisy | GFC2 (10) | +0.3311 | +0.295 .. +0.406 | 0.667 |
| network-noisy | GFC3 (13) | +0.0017 | -0.001 .. +0.162 | 0.778 |
| network-noisy | GFC4 (8) | +0.0067 | -0.002 .. +0.136 | 0.667 |
| network-plain | GFC1 (3) | -0.0001 | -0.007 .. +0.010 | 0.667 |
| network-plain | GFC2 (10) | +0.4351 | +0.373 .. +0.468 | 0.889 |
| network-plain | GFC3 (13) | +0.0363 | -0.002 .. +0.055 | 0.333 |
| network-plain | GFC4 (8) | +0.0070 | +0.005 .. +0.034 | 0.778 |
| fish-803 | DMV-input (22; 1 inert) | +0.3459 | +0.333 .. +0.356 | 0.556 |
| fish-803 | DMV (7) | +0.0019 | -0.011 .. +0.176 | 0.778 |
| fish-803 | unlabelled (3; 1 inert) | -0.0016 | -0.000 .. +0.020 | 1.000 |
| fish-803 | TEN-II (1; inert) | +0.0000 | -0.000 .. +0.019 | 0.667 |
| fish-803 | TEN-IV (1) | -0.0001 | -0.000 .. +0.019 | 0.889 |

What it says: **no class of either circuit costs more than random sets of its size that hold as many of the autopilot's neurons.** The two large costs (GFC2 in the fly networks, DMV-input in the fish) are the loss of the autopilot's channels, which those classes happen to contain. The matched random sets cost the same. The large random costs elsewhere (up to +0.18) are single trained neurons the residual came to lean on, and they are not in any one class. This is the picture-form of what rungs 4a and 4b already measured (the wiring is not what pays). It is NOT a registered test: one seed of draws, 20 ids, chosen after building. It is a reading of those seeds.

## 5. What is NOT done

* **The brain panel and the aquarium page:** the backlog wording says "shown in the brain panel and flown in the tank". Lesioned weights fly in the tank already (they are ordinary weights), but there is no toggle on `sub-aquarium.html` or in `render/brainPanel.mjs`. Both are shared files another chat edited today (`a14cd3e5`), so they wait for a merge.
* **`demo-brain-lesion` as a claim:** the reading above says there is no class effect to show. A demo would show a TIE, which the switchboard page already does.
* ~~**The stateful fly (1,729 weights)**~~: DONE 2026-11-17, section 6.
* **`nav-fleet-avoidance`:** held (section 1).
* **Gate census and version:** the new gate is in no register yet; the ship does that. Until then `tools/ship/gateReach-selfcheck.mjs` reads RED on this branch on one row: the gate population is 588 against the recorded 587, and the one added is `brain/lesion-selfcheck.mjs`. The census is re-recorded at ship time (`populationCensus.mjs`). `definitionGates-selfcheck` and `orphanScan-selfcheck` pass.

## 6. The stateful fly (2026-11-17, Keith: "Can we do the Lesions of the stateful fly?")

No other branch was working on this: the "lesion" commits on `claude/fish-vestibular-helper` are about the sub-duel pilots' numbers, not neurons.

**Why the weight edit of section 2 does not carry over.** The fly pilot (`brain/pilotSubCircuitState.mjs`, 1,729 weights) is a RESERVOIR. Its 7,080 recurrent weights are not in the weight vector: they are the circuit's signed counts scaled so that the WHOLE matrix has a largest singular value of 1. Cutting the edges into a cell would rescale every other cell's gains. Silencing is instead a **bias clamp**: the silenced cells' biases are set to -1e30. A cell's activity is relu(bias + inputs + recurrent), so it is 0 on every tick unless that sum passes 1e30. The gate measures the largest positive sum any cell reaches on a real tank flight and on random features: **4.6**.

**Built:**
* `brain/lesionFlyCx.mjs`: `reservoirTopology(circuit)` (labels, roles, the weight layout), `flyCxArms` (`flycx-stateful` and `flycx-stateless` on the switchboard, held to the autopilot), `checkFile`, `glomerulusOf`.
* `brain/lesion.mjs` branches on `KIND: "reservoir"`: the clamp, the reservoir inert rule, strata, LABELS groupings, and an arm's own `topo`.
* `switchboard.html`: the fly arms are on the board, and the grouping menu now comes from the arm's circuit. `takeSwitchboard.mjs` takes `--by side|glomerulus`.
* Gate: `brain/lesionFlyCx-selfcheck.mjs`, about 30 rows in about 1.5 s. The clamp equals this gate's own masked re-run of the circuit (silenced cells forced to 0 and fed back as 0) to 1e-9 on every cell and tick. That holds on 20 runs (memory and no state, recorded and random features, five sets including input, output and hidden cells). Also on real tank flights: silencing all 148 cells flies exactly the zero-readout pilot, and silencing none flies exactly the intact pilot.

**Groupings:**
* **type** (EPG 46, PEN_a 20, PEN_b 22, Delta7 42, PEG 18);
* **side** (type and side, e.g. PEN_b_L 11);
* **glomerulus** (the protocerebral-bridge glomerulus from the instance name, L1-L9 and R1-R9, 3 to 8 cells each, across types; the 42 Delta7 span several glomeruli and form one class).

**The confound here is ROLE, not hand channels.** The reservoir's autopilot laws sit outside the network, so it has no hand channels. Each cell does have a role: input only (42: PEN_a, PEN_b), output only (18: PEG), both (46: EPG) or neither (42: Delta7). The random control is matched on role. **In this circuit each type is exactly one role**, so a whole type has no matched random set: the only one is itself. The library refuses it as matched and says why. A type lesion is read UNMATCHED, and its cost includes losing that role (all of PEG is the readout's only output-only cells; all of Delta7 is the only inhibition). Side and glomerulus classes are matched.

**Found by the gate, and true:** with no state, silencing Delta7 changes nothing at all. Delta7 cells are hidden: no input and no readout, reached only through recurrence. With the memory wiped every tick they never fire.

**SABOTAGE LOG (the fly half):** 33 mutants of `lesion.mjs`'s reservoir branches and of `lesionFlyCx.mjs`, run against both gates. On the first pass 31 went red. The 2 greens got rows:
* "liveness runs backwards": the real circuit is strongly connected, so every cell reaches every other and direction cannot be seen. A three-cell chain a -> b -> c is used instead.
* "the input row lights the slot, not the cell": `INPUTS[5]` is 5. The row now uses input slot 30.

A third row, a chain whose second edge is listed first, catches one-pass liveness on the reservoir. The first set (section 3) was re-run against both gates after the refactor: 46 of 46 red (two `topologyOf` mutants were rewritten for its new shape, one added).

### 6a. An exploratory reading of the fly (NOT REGISTERED; a demonstration of the tool, not a round)

The stateful fly on the dropout task, ids sb-0 to sb-19, 120 s, 6 random sets per class (seed 1); the smallest rank p six draws can give is 0.143. Cost = intact minus lesioned score.

| class (cells) | control | class cost | random costs (range) | rank p |
|---|---|---|---|---|
| EPG (46) | unmatched | +0.0072 | -0.003 .. +0.011 | 0.429 |
| PEN_a (20) | unmatched | -0.0009 | -0.001 .. +0.006 | 0.857 |
| PEN_b (22) | unmatched | +0.0007 | -0.001 .. +0.006 | 0.857 |
| Delta7 (42) | unmatched | +0.0000 | -0.003 .. +0.010 | 0.714 |
| PEG (18) | unmatched | +0.0056 | -0.001 .. +0.006 | 0.286 |
| EPG_L (23) | role-matched | +0.0114 | -0.003 .. +0.009 | **0.143** |
| EPG_R (23) | role-matched | +0.0007 | (the same draws) | 0.714 |
| PEN_a_L / PEN_a_R (10) | role-matched | -0.0013 / -0.0013 | -0.002 .. +0.000 | 0.857 / 0.857 |
| PEN_b_L / PEN_b_R (11) | role-matched | -0.0007 / -0.0002 | -0.002 .. +0.001 | 0.714 / 0.714 |
| Delta7_L / Delta7_R (21) | role-matched | +0.0001 / +0.0000 | -0.000 .. +0.000 | 0.714 / 0.714 |
| PEG_L (9) | role-matched | +0.0047 | -0.001 .. +0.005 | **0.143** |
| PEG_R (9) | role-matched | +0.0004 | (the same draws) | 0.857 |

What it says: **every lesion of the fly costs about 1 percent of the score or less** (the largest is EPG_L's 0.011; the stateful pilot scores 0.784). Two of the ten side classes sit at the floor (EPG_L, PEG_L), and ten tests at a floor of 1/7 would give about 1.4 by chance. Each L/R pair shares one set of draws (same size, same role, same seed), so the two halves are not independent controls. EPG_L TIES its intact pilot on the board (-0.0114, se 0.0085); PEG_L is below it (-0.0047, se 0.0022, worse on 17 of 20). Delta7 is active (88 percent of cell-ticks on a recorded flight) but weak (at most 0.23, against 1.8-2.8 for the input types), and silencing it averages to nothing (better on 14 ids, worse on 6). This fits the rung 4a close-out: the reservoir's gain is the recipe's generic gain, not a compass the wiring holds. A left-side effect would need a registered round with fresh ids and draws before it says anything.

The glomerulus classes (L1-L9, R1-R9, role-matched) were still flying when this was written; their table goes here when read.
