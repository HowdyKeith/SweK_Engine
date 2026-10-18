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
champion picked on HELD_OUT_SET. Weights: `brain/pilotSubWeightsWip.json` (seed 6002; **see Round 1 below: its audits are now spent**).

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

## Round 1 verdict rule (written BEFORE the safety sets were read)

A champion QUALIFIES against the autopilot on a set if ALL of: (i) it ends no dive that the autopilot completes
(`newlyEnded` = 0); (ii) its early ends are not more than the autopilot's; (iii) its mean is better; (iv) the mean of
its worst 5% of dives is not worse than the autopilot's worst 5% (`compareRuns` in `brain/subTask.mjs`).
Read order: SAFETY_POOL_SET first (500 dives; may be looked at repeatedly), then SAFETY_AUDIT_SET (500) and AUDIT_SET (36)
ONCE each, for seed 6002 only.

## Round 1 result (seed 6002 vs the autopilot; the rule above, applied once)

| set | dives | champion | autopilot | better / worse | worst-5% mean (champ / auto) | ended early (champ / auto) |
|---|---|---|---|---|---|---|
| SAFETY_POOL_SET | 500 | -0.3711 | -0.5638 | 497 / 2 | -0.757 / -1.185 | 0 / 0 |
| SAFETY_AUDIT_SET (read once) | 500 | -0.3521 | -0.5359 | 500 / 0 | -0.696 / -1.062 | 0 / 0 |
| AUDIT_SET (read once) | 36 | -0.2946 | -0.4448 | 35 / 0 | -0.609 / -0.952 | 0 / 0 |

It **QUALIFIES on all three** (no dive ended that the autopilot completes; early ends not more; mean better; tail not worse).
`AUDIT_SET` and `SAFETY_AUDIT_SET` are now SPENT for seed 6002: any later champion needs audit sets of its own
(make `AUDIT2_SET` / `SAFETY_AUDIT2_SET` with new seeds, as `brain/flightTask.mjs` did for the GPU brain).

## Round 2 result: where the vessel model was soft

**Robustness sweep** (instant vessel, HELD_OUT + BASELINE = 48 dives, one parameter changed at a time; champion / autopilot score):
drag x0.7/x1.4, fins x0.6/x1.4, mass x0.8/x1.25, righting moment x0.4/x2.5, no Munk moment, thrust x0.7, added mass 0.1/0.6, tank range x0.5 --
the champion is 0.53..0.71 of the autopilot's error in all of them and ends no dive. **ONE EXCEPTION: a hull with 3x the Munk moment
(`munk: 3000`)**: champion -0.584 against the autopilot's -0.454 (the autopilot gets BETTER there; the network does not). The first champion
overfits to the nominal hull's instability. The actuator-retrained champion is WORSE there (-0.845, one dive ended early).

**Actuator limits** (`physics/mechanics/subActuators.mjs`: slew limits per second -- planes and rudder 1.0, screw 1.5, ballast pump 0.15):
the instant tank was being leaned on. HELD_OUT: autopilot -0.488 -> -0.506 under the limits (4% worse); the first champion -0.328 -> -0.377
(15% worse). Retraining under the limits (4 searches x 300 iterations; two from the hand weights, two from the champion): from the hand weights they reach
-0.403/-0.396 (not yet better than the old champion under the limits), from the champion -0.359/-0.356. Best: seed 7003, **-0.3561**
(`brain/pilotSubWeightsActuatorsWip.json`), 500-dive SAFETY_POOL_SET under the limits: -0.3872 against the autopilot's -0.5820, 498 better / 1 worse,
tail -0.787 against -1.222, none ended. **Its audits are not read.**

## Round 3 result: harder tasks (`brain/missionTask.mjs`)

* **terrain**: hold 10 m ABOVE a rolling seabed (35..55 m down, slope < 0.45) from a noisy altimeter (sd 0.15 m) and a forward sounder (20 m ahead, sd 0.3 m).
* **waypoint**: visit three waypoints in order (reached within 10 m / 4 m); the vessel is given a PERFECT position fix (optimistic; said in the file header).
* Both in still water and in a current (+ a weight error). The same pilot contract: guidance turns sensors into the target each tick, so the autopilot and the
  network fly them unchanged. **Obstacles are NOT modelled.**

HELD_OUT_SET (32 dives), under the actuator limits, score by kind (terrain / terrain-current / waypoint / waypoint-current):

| pilot | terrain | terrain-current | waypoint | waypoint-current |
|---|---|---|---|---|
| autopilot | -0.408 | -0.421 | -0.994 | -1.101 |
| first champion (depth-hold only) | -0.204 | -0.209 | -0.977 | -1.068 |
| actuator champion (7003) | -0.216 | -0.216 | -0.968 | -1.069 |

Nothing ended early. **The depth-hold training transfers to terrain following (about half the autopilot's error) with no training on it.** The waypoint scores
are dominated by cruise time (all three waypoints are reached by every pilot), so the pilots are close; a better waypoint score needs a faster cruise or tighter
turns, not a better depth loop. A pilot trained ON these missions has not been tried.

## Open item being worked: the Munk x3 weakness

`tools/trainSubRobust.mjs` scores each candidate on five vessels (nominal, Munk x3, no Munk, fins x0.6, righting x2.5) instead of one.
Result: see the next section if present; if not, the runs had not finished when this was written.
