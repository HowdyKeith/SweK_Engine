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
* **The stateful fly (1,729 weights):** its circuit (`render/subAquariumFlyCx.mjs`) is not a `createSubPolicy` pilot and has no classes in `TOPOLOGIES`. A lesion of it needs its own silencing rule.
* **`nav-fleet-avoidance`:** held (section 1).
* **Gate census and version:** the new gate is in no register yet; the ship does that.
