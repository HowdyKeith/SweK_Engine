# Submarine pilot -- work in progress (UNNUMBERED)

Left without a version on purpose: another session is shipping. Nothing here touches `main.js`, `brain/brain.js`,
`docs/CHANGELOG.md`, `knowledge-index.json` or any existing file. Eight new files, all additive.

## What exists (all gates green, all sabotaged -- logs in each gate's header)

| file | what | gate |
|---|---|---|
| `physics/mechanics/subModel6dof.mjs` | 6000 kg crewless sub in sea water: buoyancy + 3% ballast tank, righting moment, added mass, drag, stern planes + rudder, Munk moment, current, seabed/crush/broach ends. Pilot sends `{pitch, yaw, thrust, ballast}`. | `subModel6dof-selfcheck.mjs` (0.5 s) |
| `brain/subTask.mjs` | The job: hold depth/heading/speed 60 s; kinds nominal / recovery / current; TRAIN / HELD_OUT / AUDIT / BASELINE sets. | `subTask-selfcheck.mjs` (1.5 s) |
| `brain/autopilotSub.mjs` | Memoryless PD cascade (the baseline and the network's start). | `autopilotSub-selfcheck.mjs` (1.8 s) |
| `brain/pilotSubPolicy.mjs` | `createSubPolicy(topology)` -- the connectome-wired recurrent pilot, **circuit as a parameter**. Default = fly Giant Fiber Circuit (34 neurons, 313 synapses, 963 weights). | `pilotSubPolicy-selfcheck.mjs` (12 s) |

## Measured (retrained on the CURRENT autopilot)

Four (1+1)-ES searches (seeds 6000..6003, 400 iterations, sigma 0.3, from the autopilot's hand weights, TRAIN_SET),
champion picked on HELD_OUT_SET. Weights: `brain/pilotSubWeightsWip.json` (seed 6002).

| pilot | TRAIN | HELD_OUT | BASELINE |
|---|---|---|---|
| autopilot (= hand weights, float32) | -0.5741 | -0.4880 | -0.5146 |
| seed 6000 | -0.3732 | -0.3338 | -0.3667 |
| seed 6001 | -0.3704 | -0.3316 | -0.3494 |
| **seed 6002 (champion)** | **-0.3660** | **-0.3278** | **-0.3501** |
| seed 6003 | -0.3850 | -0.3465 | -0.3679 |

All four beat the autopilot on all three sets and end none of the 88 dives early. `AUDIT_SET` has NOT been read: the
next step for a verdict is one read of it for seed 6002 (and a safety-pool style sample for rare starts, which this
task does not have yet -- 30 held-out dives is a small sample for a tail).

## What this is NOT

* The fly's Giant Fiber Circuit is an escape reflex, not a depth controller. It is the stand-in network that tests the
  vessel, task and training loop. A result says the pipeline works, **not** that a fly (or fish) can pilot a submarine.
* **There is no fish circuit yet.** Google/Janelia's ZAPBench (`gs://zapbench-release`, CC-BY 4.0, reachable from the
  sandbox) is whole-brain *activity* of larval zebrafish -- no synapses. neuPrint is blocked in the sandbox
  (`PROVENANCE.md` already records that the fly circuits were fetched on the maintainer's machine). `tools/bakeConnectomeTopology.mjs`
  needs a vendored circuit JSON with `bodyId`/type/`[from,to,weight]` edges.

## To plug a fish in

1. Vendor a real zebrafish circuit under `vendor/zebrafish/` with a `PROVENANCE.md` (same shape as `vendor/male-cns/`).
2. `node tools/bakeConnectomeTopology.mjs --in ... --out brain/zebrafishTopology.mjs --circuit-name ... --write`
3. `const FISH = createSubPolicy(zebrafishTopology, "...")` -- nothing else changes (a synthetic 12-neuron ring already
   makes the identical hand-weight pilot, held by the policy gate).
   A *functional* (correlation) graph from ZAPBench would run today but must be labelled "functional connectivity, not a connectome".

## Shipping it later

* Gate count: four new `*-selfcheck.mjs` files change `enumerateGates()` by +4. Take the next free number from
  `node tools/ship/versionPreflight.mjs --next`, and mention the 4 gates in the round note's `NNNN gates` sentence.
* Not done here: knowledge-index entries, a demo page, page-index/launch-index entries, the changelog.
* Next experiments: retrain on the current autopilot, pick a champion on `HELD_OUT_SET`, read `AUDIT_SET` once.
