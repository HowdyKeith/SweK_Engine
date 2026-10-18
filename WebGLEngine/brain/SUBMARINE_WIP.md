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

## Measured so far (autopilot, then a 120-iteration (1+1)-ES from its weights, seed 7, run BEFORE the ballast-sign fix below)

The hand weights are the autopilot to float32 (max control difference 1.4e-7 over 1,500 states). The ES run was done
on the first draft of the autopilot (train -0.6148, held-out -0.5715, baseline -0.5646) and reached train -0.4686,
held-out -0.4339, baseline -0.4532, ending none of 88 dives early. **That run predates the ballast-sign fix and is not
repeated on the current autopilot** (train -0.5741, held-out -0.4880, baseline -0.5146), so treat it as "the loop works",
not as a number. `AUDIT_SET` has not been read by anything.

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
