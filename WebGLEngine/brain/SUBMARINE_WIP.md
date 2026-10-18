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

## Round 2b result: multi-vessel training did NOT cleanly fix the Munk x3 weakness

`tools/trainSubRobust.mjs`: 4 searches x 200 iterations from the actuator champion, each candidate scored on five vessels (nominal, Munk x3, no Munk, fins x0.6,
righting x2.5), under the actuator limits. HELD_OUT + BASELINE (48 dives), early ends in brackets:

| pilot | nominal + limits | nominal instant | Munk x3 instant | Munk x3 + limits | Munk x5 instant |
|---|---|---|---|---|---|
| autopilot | -0.516 (0) | -0.498 (0) | -0.454 (0) | -0.462 (0) | -2.141 (0) |
| actuator champion (7003) | -0.360 (0) | -0.322 (0) | -0.845 (1) | -1.066 (1) | -2.838 (4) |
| robust 8000 (picked by robust held-out) | -0.395 (0) | -0.358 (0) | -0.611 (1) | -0.628 (0) | -2.778 (2) |
| robust 8001 | -0.404 (0) | -0.369 (0) | -0.691 (1) | -0.692 (1) | -2.848 (5) |
| robust 8002 | -0.455 (0) | -0.425 (0) | -0.473 (0) | -0.532 (0) | -2.541 (1) |
| robust 8003 | -0.495 (0) | -0.473 (0) | -0.600 (0) | -0.649 (0) | -2.688 (3) |

* It is a TRADE, not a fix. The closer a search gets to the autopilot on the Munk x3 hull (8002: -0.473 against -0.454), the more of the nominal gain it
  gives back (-0.455 against the champion's -0.360; the autopilot is -0.516). None beats the autopilot on Munk x3, and 8000, the pre-declared pick, still ends a dive there.
* A Munk x5 hull (5x the nominal) breaks every pilot including the autopilot (-2.14): that vessel is beyond the planes' authority, so this is a limit of the
  vessel, not of the pilots.
* 200 iterations is short (4-5 improvements per 4 weights moved); a longer search, a vessel-parameter feature the pilot can SEE, or a circuit with memory are the
  untried answers. `brain/pilotSubWeightsRobustWip.json` is seed 8000, kept for the record, not as a recommended pilot.
* Practical reading: **the network's gain over the autopilot depends on the hull's hydrodynamic stability being near the nominal.** For a real boat the Munk
  moment is the least certain coefficient, so identify it before trusting a trained pilot, or train with it randomised for much longer.

## Sonar, torpedoes, the duel (all UNNUMBERED; each has a gate, every gate sabotaged)

| file | what | gate |
|---|---|---|
| `physics/mechanics/subSonar.mjs` | the decibel budget SNR = SL - TL - NL + DI; passive contacts are a bearing + elevation and NO range; active echoes add a range and announce the pinger to ~10 km; going fast makes a boat louder AND its listener deafer; 60-degree baffles astern. TOY dB, not a calibrated sonar. | `subSonar-selfcheck.mjs` (23 sabotages) |
| `physics/mechanics/subTorpedo.mjs` | point body, 6.5 m/s (faster than any boat), 90 s burn, passive cone seeker (35 deg) with its own flow noise, filtered proportional navigation, armed after 40 m, proximity fuse at the closest approach. Its first smoke test found two real defects (an edge-of-shell fuse; unfiltered noisy LOS rate). | `subTorpedo-selfcheck.mjs` (35 sabotages, one equivalent mutant) |
| `brain/subTactics.mjs` | the tactician: search / track / ping / attack / evade from sonar ONLY; 11 tunable numbers (`theta`); scripted drones patrol, quiet, evader, hunter. | `subTactics-selfcheck.mjs` (30, one equivalent) |
| `brain/subDuel.mjs` | the arena: looks at 2 Hz, 4 torpedoes with a 10 s reload, damage, sinking, losses, a kill-speed bonus. Score = (dealt - taken)/100 + 0.5 kill + up to 0.5 for speed - 0.5 for losing the boat. | `subDuel-selfcheck.mjs` (35) |

### Tuning the tactician (`tools/tuneSubTactics.mjs`; theta in `brain/subTacticsThetaWip.json`)

4 searches x 150 iterations, TRAIN_SET (24 duels, all four drones); champion (seed 5000) picked on HELD_OUT_SET. Score (higher is better, max 2.0):

| | TRAIN | HELD_OUT | BASELINE | BASELINE W/L/D | fresh 160 duels (instant) | fresh 160 (actuator limits) |
|---|---|---|---|---|---|---|
| hand parameters | 0.998 | 1.307 | 0.815 | 14/4/6 | 1.221 (117W 11L 32D) | 1.199 |
| tuned, seed 5000 | 1.722 | 1.633 | 1.557 | 20/0/4 | 1.631 (141W 1L 18D) | 1.617 |

By drone on the 160 fresh duels: patrol 1.43 -> 1.86, quiet 0.96 -> 1.00, evader 1.57 -> 1.87, **hunter 0.92 -> 1.79**.
The tuned DOCTRINE, in plain words: **go fast and loud and shoot first** -- search at 4.1 m/s (hand: 2.0), track at 4.4 (hand 1.5), ping after the FIRST contact
and every 4 s (hand: second contact, every 12 s), fire from 447 m (hand 320) with a 30-degree aiming tolerance (hand 10; the torpedo seeker's cone is 35), evade for 31 s at 3.6 m/s.
It beats the default hunter because it shoots from further and aims less carefully, which the torpedo's wide cone forgives.

**What this does NOT show.** The opponents are FIXED scripts, not adapting: the hunter is the DEFAULT tactician, so "beats the hunter" means "beats that one doctrine". A tuned-vs-tuned
fight (self-play) has not been run. AUDIT_SET (32 duels) is unread. The 'quiet' drone (0.5 m/s, heard from ~94 m) is still about half draws: the tactician only pings AFTER a passive contact, and
no contact ever comes from a boat that quiet outside 94 m -- the policy space has no 'ping while searching' and a (1+1)-ES cannot invent one. The fix is a new parameter, not more search.

### The long robust-pilot training (motion layer)

Started 4 x 1500 iterations from the actuator champion; the processes died once (session resume) and were restarted from their iteration-200 checkpoints as seeds 9100..9103 (1000 iterations each).
Result: see the next section if present; otherwise they had not finished when this was written.

### Search-pinging (the 12th number) and self-play

**searchPing** (`brain/subTactics.mjs`; default 0 = the old behaviour, so every pin stands): ping every N seconds while nothing is heard. Retuned (4 x 150 iterations; `brain/subTacticsThetaSearchPingWip.json`, seed 5100):
160 fresh duels vs the drones **1.631 -> 1.772** (152 W / 0 L / 8 D); the quiet drone **1.00 -> 1.48**; BASELINE 1.557 -> 1.717. It pings blind every 7.7 s.

**Self-play** (`tools/selfPlaySubTactics.mjs`, gated by `selfPlaySubTactics-selfcheck.mjs`; league results in `brain/subTacticsLeagueWip.json`). The duel's seats are NOT symmetric (A starts with the other
boat in its forward arc), so every pairing is fought in both seats; `scoreFor(result, side)` in `brain/subDuel.mjs` scores a duel from either seat. Two leagues of 3 generations x 60 iterations each, started
from the search-ping champion ("gen0"), each generation trained against the default and the previous three; cross-play on 24 fresh geometries (X's mean over both seats):

| league 7001 (a counter-doctrine was found) | vs default | vs gen0 | vs gen1 | vs gen2 | vs gen3 |
|---|---|---|---|---|---|
| gen0 (the drone champion) | 1.24 | - | 0.16 | **-1.15** | **-1.43** |
| gen2 | 1.53 | **1.41** | 1.39 | - | -0.35 |
| gen3 | 1.56 | **1.67** | 1.58 | 0.45 | - |

* **The drone champion is EXPLOITABLE.** gen2 and gen3 of league 7001 beat it by 1.4-1.7 (it loses 1.15-1.43 to them). The counter-doctrine, from the theta: **stop pinging blind** (searchPing 7.7 -> 0.13 -> 0),
  because a ping is heard from ~10 km and tells the enemy where you are; **aim tighter** (aimTol 0.47 -> 0.33), **hold an echo longer** (echoWindow 13.7 -> 19.6), **evade harder and longer** (evadeTurn 1.7 -> 2.8 rad, nearly
  a reversal). The cost shows against the drones: gen3 scores 1.645 on the fresh 160 (quiet drone 1.06, down from 1.48) -- the trade the drones could not show: **blind pinging finds a quiet boat and gets you killed by an awake one.**
* **It is not robust**: league 7000, same recipe, found NOTHING (its generations lose to gen0 by 0.0-0.1 in cross-play, though they score 1.80 against the drones). Two leagues of 60 iterations on 8 geometries is a probe, not a
  result; a larger league, a mixed-strategy opponent pool and a significance test over seeds are needed before saying how exploitable the doctrine is.
* No rock-paper-scissors cycle was seen (league 7001 is transitive: gen3 > gen2 > gen1 ~ gen0 > default), but with 4 generations that is weak evidence either way.
