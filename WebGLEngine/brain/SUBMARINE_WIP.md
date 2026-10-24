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
* **(Written before the Fish1 section at the end of this file: a real zebrafish circuit IS vendored now, and what it is and is not is said there. The paragraph below is what was true then.)** There was no fish circuit. Google/Janelia's ZAPBench (`gs://zapbench-release`, CC-BY 4.0, reachable from the
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

## The Sub Aquarium (UNNUMBERED; peers can send subs, and server.html shows fish/fly brain availability)

* **What it is:** `sub-aquarium.html` -- a tank (`render/subAquariumSim.mjs`) in which every sub swims flown by its OWN pilot (the PD autopilot, or the 963-weight connectome-wired network). Subs are numbers, never code.
* **Server:** `ai-bridge/subAquariumBridge.js` (+ `subAquariumCore.js`, pure) owns `/subaquarium/*` and `/ai/fishbrain/health`, `/ai/flybrain/health`. Arrive/send/seed/remove are TRUSTED-only (host, session or LAN); `from` is stamped from the connection, never the body; 64 KB, 30/min per address; the box can only send its OWN subs, and only to a LAN/mesh/loopback/.local peer, no redirects.
* **server.html:** a FLY BRAIN and a FISH BRAIN chip sit beside the GPU BRAIN chip (polled with `swekTick`), and every online peer row has a **Sub** button: it lists this box's local subs, then POSTs `{peer, id}` to `/subaquarium/send`; the peer's own trust rules decide admission. The fly chip did NOT exist before this -- only the GPU chip did -- so both were added.
* **Honest status:** the fish chip reads **stand-in** (amber) because no fish circuit is vendored (ZAPBench is activity, not wiring); it goes `live` only when `vendor/zebrafish/*.json` exists AND a pilot is wired to it. The fly chip reads live (circuit + trained flight weights present).
* **Gates:** `subAquariumCore-selfcheck`, `subAquariumBridge-selfcheck` (real loopback HTTP), `render/subAquariumSim-selfcheck`, `tools/ship/subAquariumPage-selfcheck` (headless Chromium, hostile name), `tools/ship/subAquariumServerHtml-selfcheck` (runs the chip and send code in node:vm; 21 sabotages, S11 and S21 equivalent mutants). `bridgeCensus` and `pageSections` pass; `sub-aquarium.html` is filed in UNPLACED (the drawer is Keith's call).

## Robust pilot, trained much longer (seeds 9200-9203, 600 iterations each; UNNUMBERED)

Five vessels (nominal, Munk x3, Munk 0, fins x0.6, righting x2.5), actuator limits on, mean score per set (higher is better; 0 is perfect):

| pilot | HELD_OUT mean | HELD_OUT Munk x3 | BASELINE mean | BASELINE Munk x3 |
|---|---|---|---|---|
| PD autopilot | -0.570 | -0.481 | -0.582 | -0.432 |
| actuator champion | -0.553 | -1.159 | -0.515 | -0.911 |
| robust (8000s, 200 it) | -0.491 | -0.692 | -0.459 | -0.521 |
| **long 9201 (saved)** | **-0.424** | -0.515 | **-0.415** | -0.411 |
| long 9200 | -0.424 | -0.495 | -0.423 | -0.375 |

All four long runs beat the autopilot on the mean over the five vessels; none loses a vessel by much, and the Munk x3 gap closes (BASELINE: -0.41 vs the autopilot's -0.43; HELD_OUT: -0.52 vs -0.48, still slightly behind). Gains from the longer run are modest (-0.49 -> -0.42): the search had flattened (robust-train moved ~0.002 in the last 100 iterations). On Munk x3 HELD_OUT the autopilot (-0.481) is still marginally the best. Saved: `brain/pilotSubWeightsRobustLongWip.json` (seed 9201). SAFETY pool/audit and AUDIT were NOT read.

### Safety pool and audit for the long champion (seed 9201), `tools/auditSubChampion.mjs`

The seed-6002 audit sets are spent, so the audit used two NEW seed ranges (SAFETY_AUDIT2: 500 dives, seeds 3000-3099 / 3000-3299 / 3000-3099; AUDIT2: 36 dives, seeds 3500-3511 per kind). **They are now SPENT for 9201: read once, do not re-run after tuning.** Actuator limits on, champion vs PD autopilot:

| set | hull | champion / autopilot | better / worse | ended that the autopilot completed | early ends | worst-5% |
|---|---|---|---|---|---|---|
| SAFETY_POOL (500) | nominal | -0.413 / -0.582 | 492 / 2 | 0 | 0 / 0 | -0.84 / -1.22 |
| SAFETY_POOL (500) | Munk x3 | -0.560 / -0.535 | 345 / 128 | 1 | 1 / 0 | -1.88 / -1.38 |
| SAFETY_AUDIT2 (500) | nominal | -0.395 / -0.565 | 496 / 1 | 0 | 0 / 0 | -0.79 / -1.23 |
| SAFETY_AUDIT2 (500) | Munk x3 | -0.571 / -0.528 | 306 / 165 | 1 | 1 / 1 | -1.96 / -1.43 |
| AUDIT2 (36) | nominal | -0.355 / -0.482 | 35 / 0 | 0 | 0 / 0 | -0.87 / -1.13 |
| AUDIT2 (36) | Munk x3 | -0.421 / -0.411 | 21 / 12 | 0 | 0 / 0 | -1.01 / -0.95 |

Verdict: on the nominal hull the champion QUALIFIES (never ends a dive the autopilot completes, better on 99%). On the Munk x3 hull it does NOT: slightly worse on the mean (-0.57 vs -0.53), its worst 5% is clearly worse (-1.96 vs -1.43), and it ends one dive the autopilot completes (the pool and the audit both). The long training narrowed the Munk x3 gap (the actuator champion was -0.91 to -1.16 there) but did not remove it. Claim to keep: "robust across five hulls on average, qualifies on the nominal hull, still a tail risk on a 3x-Munk hull".

## Tail-trained robust pilot (UNNUMBERED; `tools/trainSubTail.mjs`, `brain/pilotSubWeightsRobustTailWip.json`)

The long champion (9201) lost the Munk x3 tail. `mine` flew it on 500 never-used dives (seeds 4000-4299 etc.) on the Munk x3 hull and kept the 60 worst against the autopilot (47 of them recovery dives; champion -1.61 vs autopilot -0.72 there, 3 ended). `train` = the five-hull objective + tailWeight x the mean on those 60. Four runs, 400 iterations each (they died at 100 and were resumed from checkpoint for 300 more): weight 1.0 (9300, 9301), weight 0.5 (9302, 9303).

| pilot | HELD_OUT 5-hull mean | HELD_OUT Munk x3 | tail60 mean / worst-5% / ended | FRESH300 Munk x3 mean / worst-5% / ended (autopilot -0.529 / -1.351 / 0) |
|---|---|---|---|---|
| long 9201 | -0.424 | -0.515 | -1.614 / -6.16 / 3 | -0.556 / -1.87 / 1 |
| tail 9300 (saved) | -0.438 | -0.435 | -0.652 / -1.33 / 0 | -0.492 / -1.37 / 0 |
| tail 9301 | -0.440 | -0.444 | -0.763 / -3.18 / 1 | -0.499 / -1.57 / 1 |
| tail 9302 | -0.433 | -0.462 | -0.635 / -1.27 / 0 | -0.508 / -1.78 / 0 |
| tail 9303 | -0.449 | -0.410 | -0.637 / -1.38 / 0 | -0.481 / -1.75 / 0 |

9300 is the one pick: only it matches the autopilot's tail on the fresh sample (-1.37 vs -1.35) with nothing ended. Costs: the 5-hull mean gives up 0.014 (-0.424 -> -0.438), nominal gets slightly worse (-0.366 -> -0.398), Munk 0 -0.484 -> -0.531. SAFETY_POOL (looked at, not trained on): nominal -0.453 vs -0.582 (463/23, 0 newly ended), Munk x3 -0.498 vs -0.535 (355/100, 0 newly ended, worst-5% -1.42 vs -1.38). AUDIT sets NOT read for this champion (the 3000/3500 ranges are spent for 9201 and informed this training; a new range is needed).

### Audit of the tail-trained pilot (seed 9310) on a fresh range (`--base 6000`; SPENT for this champion, read once)

`tools/auditSubChampion.mjs` now takes `--base N` (safety audit N..; audit N+500..); base 3000 is spent for 9201 and reproduces the earlier table exactly. Actuator limits on, champion vs PD autopilot:

| set | hull | champion / autopilot | better / worse | newly ended | early ends | worst-5% |
|---|---|---|---|---|---|---|
| SAFETY_AUDIT (500) | nominal | -0.435 / -0.562 | 455 / 21 | 0 | 0 / 0 | -0.87 / -1.22 |
| AUDIT (36) | nominal | -0.439 / -0.564 | 31 / 4 | 0 | 0 / 0 | -0.86 / -1.21 |
| SAFETY_AUDIT (500) | Munk x3 | -0.477 / -0.521 | 365 / 90 | **1** | 2 / 1 | -1.59 / -1.51 |
| AUDIT (36) | Munk x3 | -0.488 / -0.513 | 24 / 8 | 0 | 0 / 0 | -1.30 / -1.13 |

Verdict: nominal QUALIFIES. Munk x3 does NOT meet the strict bar (no dive ended that the autopilot completes): it is better on the mean (-0.477 vs -0.521) and the tail gap shrank from -1.96 vs -1.43 (9201) to -1.59 vs -1.51, but one dive in 500 is still ended. The tail training moved the failure from "worse by 0.5 in the tail" to "worse by 0.08, one dive in 500"; it did not eliminate it.

## Second tail round (UNNUMBERED; `brain/pilotSubWeightsRobustTail2Wip.json`, seed 9400)

The tail champion 9310 still lost one safety-audit dive in 500 on Munk x3. `mine --base 8000` flew it on 500 new Munk x3 dives (seeds 8000-8299 etc.; none ended, champion -0.464 vs autopilot -0.513) and kept the 60 worst. Four runs of 300 iterations from 9310 on the union of both tail sets (120 dives): weight 1.0 (9400, 9401), 2.0 (9402, 9403). Evaluated on the HELD_OUT five hulls, the 120 trained-on tail dives, and a FRESH 300 Munk x3 dives (seeds 9000+; used for picking, so a selection set, not an audit):

| pilot | 5-hull mean | tail120 mean / worst-5% | fresh300 mean / worst-5% / ended (autopilot -0.535 / -1.295 / 0) |
|---|---|---|---|
| long 9201 | -0.424 | -1.122 / -4.54 | -0.565 / -1.73 / 1 |
| tail 9310 | -0.438 | -0.664 / -1.50 | -0.496 / -1.31 / 0 |
| **t2 9400 (saved)** | -0.457 | -0.512 / -1.24 | -0.427 / -1.02 / 0 |
| t2 9401 | -0.440 | -0.567 / -1.20 | -0.459 / -1.22 / 0 |
| t2 9402 (weight 2) | -0.427 | -0.592 / -1.30 | -0.485 / -1.34 / 0 |
| t2 9403 (weight 2) | -0.458 | -0.554 / -1.05 | -0.462 / -1.20 / 0 |

9400 has the best Munk x3 numbers (fresh worst-5% -1.02 against the autopilot's -1.30) and pays for it elsewhere: the five-hull mean gives up 0.019 against 9310 and 0.033 against 9201, nominal -0.439 (9310: -0.398, 9201: -0.366), Munk 0 -0.580. If the nominal hull matters more than the 3x hull, 9402 (mean -0.427) is the other pick but its fresh tail only just ties the autopilot. SAFETY_POOL for 9400 (read, not trained on): nominal -0.493 vs -0.582 (376/76, 0 newly ended), Munk x3 -0.423 vs -0.535 (459/26, 0 newly ended, worst-5% -1.15 vs -1.38). Audit NOT read; use `--base 7000`.

### Audit of the second tail pilot (seed 9400) on a fresh range (`--base 7000`; SPENT for this champion, read once)

Actuator limits on, champion vs PD autopilot:

| set | hull | champion / autopilot | better / worse | newly ended | early ends | worst-5% |
|---|---|---|---|---|---|---|
| SAFETY_AUDIT (500) | nominal | -0.489 / -0.575 | 389 / 71 | 0 | 0 / 0 | -0.94 / -1.17 |
| AUDIT (36) | nominal | -0.441 / -0.511 | 25 / 7 | 0 | 0 / 0 | -0.90 / -1.17 |
| SAFETY_AUDIT (500) | Munk x3 | -0.418 / -0.524 | 459 / 25 | 0 | 0 / 0 | -1.11 / -1.29 |
| AUDIT (36) | Munk x3 | -0.388 / -0.480 | 32 / 3 | 0 | 0 / 0 | -1.11 / -1.35 |

Verdict: QUALIFIES on BOTH hulls. No dive ended that the autopilot completes, no early ends, better mean and a better worst-5% tail on nominal and on Munk x3. The Munk x3 weakness of the long champion is closed on this audit. Caveats: the nominal-hull margin is smaller than for earlier champions (better on 389/500 against 496/500 for 9201; the price of the tail training), the other three hulls (Munk 0, fins x0.6, righting x2.5) were not part of this audit (their held-out means: -0.580 / -0.445 / -0.441, still better than the autopilot's -0.684 / -0.539 / -0.641), and the sim is the same EXPLORER model the pilot was trained in, so this is robustness to hull variants, not a sim-to-real result.

### The tail pilot is an aquarium seed

`ai-bridge/subAquariumCore.js` SEED_RECIPES gains **"Explorer tail pilot"** (weights `brain/pilotSubWeightsRobustTail2Wip.json`, seed 9400 -- the one audited on both hulls; theta `subTacticsThetaSearchPingWip.json`). "Offer my subs" now offers FIVE (PD autopilot + four trained pilots); the gates that pinned four were updated to five (core, bridge, page), and a new core row pins that the tail sub is built bit for bit from the Tail2 file and not from the long one (A33, A34 red). The FISH BRAIN chip's pilot count is the number of `brain/pilotSubWeights*Wip.json` files (6 today).

## Audit of the tail pilot on the other three hulls (seed 9400; base 10000, SPENT for 9400 on these hulls)

`tools/subHulls.mjs` names the hulls; `tools/auditSubChampion.mjs --hulls munk0,fins06,righting25 --base 10000`. Actuator limits, champion / PD autopilot:

| hull | SAFETY_AUDIT (500) | better / worse | newly ended | worst-5% | AUDIT (36) | worst-5% |
|---|---|---|---|---|---|---|
| Munk 0 | -0.644 / -0.776 | 393 / 88 | 0 | -1.24 / -1.73 | -0.617 / -0.681 | -1.32 / -1.35 |
| fins x0.6 | -0.499 / -0.610 | 420 / 43 | 0 | -1.00 / -1.36 | -0.468 / -0.523 | -0.99 / -1.09 |
| righting x2.5 | -0.486 / -0.693 | 437 / 45 | 0 | -0.97 / -1.65 | -0.468 / -0.574 | -1.01 / -1.14 |

QUALIFIES on all three (no early ends, none newly ended, better mean and better tail). With the earlier audit that is all five training hulls.

## Hulls the pilot was never trained on (SAFETY_POOL, 500 dives, actuator limits; champion / autopilot)

| hull | mean | better-worse | newly ended | early ends (c/a) | worst-5% |
|---|---|---|---|---|---|
| light (0.7x mass) | -0.452 / -0.522 | 358-90 | 0 | 0/0 | -0.89 / -1.15 |
| heavy (1.4x mass) | -0.544 / -0.657 | 382-78 | 0 | 0/0 | -1.06 / -1.35 |
| draggy | -0.502 / -0.708 | 499-0 | 0 | 0/0 | -0.97 / -1.34 |
| tiny fins (0.4x) | -0.521 / -0.677 | 472-15 | 0 | 0/0 | -1.07 / -1.46 |
| weak righting (0.4x) | -0.500 / -0.562 | 340-105 | 0 | 0/0 | -1.00 / -1.17 |
| Munk x5 | -2.663 / -2.764 | 272-218 | **14** | 20/16 | -5.35 / -5.73 |
| awkward (heavy + small fins + weak righting + Munk x2.5) | -2.508 / -2.392 | 182-314 | **26** | 35/13 | -5.96 / -5.26 |

The pilot transfers to five unseen hulls without training. It fails on the two extreme ones, where the PD autopilot fails too (16 and 13 early ends of 500): those are the hulls to train on (`tools/trainSubWide.mjs`: the objective over all twelve hulls, the two hard hulls optionally weighted, the Munk x3 tail kept as a term).

## Duels flown by the tail pilot (the tuned tactician 5100, actuator limits, 40 fresh duels: seeds 3001-3010 x 4 drones)

| motion pilot of side A | score | patrol | quiet | evader | hunter | W / L / D |
|---|---|---|---|---|---|---|
| PD autopilot | 1.651 | 1.894 | 1.298 | 1.882 | 1.529 | 36 / 1 / 3 |
| **tail pilot (9400)** | **1.733** | 1.889 | **1.634** | 1.882 | 1.526 | 38 / 1 / 1 |
| long (9201) | 1.604 | 1.890 | 1.116 | 1.882 | 1.529 | 35 / 1 / 4 |

Same tactician, same drones; the difference is the hull handling. The gain is almost all against the quiet drone (1.30 -> 1.63): a quiet target is found by getting the geometry right at low speed, which the PD autopilot does worst. Not a statistically powered result (40 duels, 10 per drone); the AUDIT_SET of the duel was NOT read.

## Stale gates the numbered ship has to deal with (all from NEW FILES; none from a regression)

| gate | what it says | the fix |
|---|---|---|
| `instruments` | knowledge index stale by the new files | `node tools/ship/buildKnowledgeIndex.mjs` |
| `launchIndex` | 571 shipped vs 572 computed (derived at ship time) | regenerate at ship |
| `runtimeGap` | the census no longer matches the file count (4748 -> 4784) | re-derive the census (the module that records it names the command) |
| `physicsReach` | 11 graded physics modules have no door (limit 7): `subModel6dof`, `subActuators`, `subSonar`, `subTorpedo` and their neighbours | give them a door (an instruments row or a page link) or move the baseline ON PURPOSE; the aquarium page already imports `subModel6dof` |
| `orphanScan` | `brain/missionTask.mjs` (and `tools/trainSubWide.mjs` until it is mentioned) unreachable | wire missionTask into a page or register it in DIRECTORY_LOADED with a reason; these tools are run by hand: `tools/trainSubRobust.mjs`, `trainSubTail.mjs`, `trainSubWide.mjs`, `auditSubChampion.mjs`, `subHulls.mjs` |
| `bridgeCensus`, `pageSections` | pass now; `sub-aquarium.html` sits in UNPLACED until a drawer is chosen | Keith's call |

## Wide round (UNNUMBERED; `tools/trainSubWide.mjs`, `brain/pilotSubWeightsRobustWideWip.json`, seed 9501)

Four runs of 300 iterations from the tail pilot (9400), objective = mean over TWELVE hulls (`tools/subHulls.mjs`: the five trained + seven unseen) on 20 TRAIN dives each + the Munk x3 tail term; seeds 9500/9501 weight the two hard hulls (Munk x5, awkward) 1x, 9502/9503 3x. Twelve-hull HELD_OUT mean (60 dives per hull): autopilot -0.856, tail 9400 -0.833, wide 9500 -0.823, **9501 -0.751**, 9502 -0.820, 9503 -0.820; all four match the tail pilot on the ten ordinary hulls and only 9501 moved the two hard ones (HELD_OUT Munk x5 -2.31 vs -2.68, awkward -2.17 vs -2.80). On the 500-dive SAFETY_POOL the hard-hull gain shrinks: Munk x5 -2.46 (autopilot -2.76) still ends 16 dives the autopilot completes (9400: 14), awkward -2.25 (-2.39) ends 24 (9400: 26). The 60-dive HELD_OUT overstated it.

Audit on a fresh range, base 12000 (500 + 36 dives per hull, SPENT for this file), all twelve hulls, champion vs PD autopilot:

| hull | SAFETY_AUDIT mean | better / worse | newly ended | early (c/a) | worst-5% | AUDIT (36) mean, newly |
|---|---|---|---|---|---|---|
| nominal | -0.460 / -0.560 | 424 / 45 | 0 | 0/0 | -0.90 / -1.15 | -0.497 / -0.604, 0 |
| Munk x3 | -0.418 / -0.521 | 448 / 40 | 0 | 0/1 | -1.26 / -1.40 | -0.471 / -0.571, 0 (tail -1.81 / -1.53) |
| Munk 0 | -0.620 / -0.763 | 436 / 48 | 0 | 0/0 | -1.21 / -1.54 | -0.658 / -0.814, 0 |
| fins x0.6 | -0.477 / -0.593 | 458 / 31 | 0 | 0/0 | -0.98 / -1.23 | -0.519 / -0.638, 0 |
| righting x2.5 | -0.468 / -0.672 | 464 / 25 | 0 | 0/0 | -0.92 / -1.50 | -0.505 / -0.704, 0 |
| light | -0.425 / -0.500 | 413 / 45 | 0 | 0/0 | -0.85 / -1.05 | -0.462 / -0.547, 0 |
| heavy | -0.506 / -0.637 | 440 / 43 | 0 | 0/0 | -0.97 / -1.28 | -0.541 / -0.673, 0 |
| draggy | -0.471 / -0.683 | 499 / 1 | 0 | 0/0 | -0.92 / -1.27 | -0.502 / -0.716, 0 |
| tiny fins | -0.499 / -0.647 | 475 / 16 | 0 | 0/0 | -1.04 / -1.34 | -0.548 / -0.691, 0 |
| weak righting | -0.467 / -0.540 | 407 / 57 | 0 | 0/0 | -0.92 / -1.10 | -0.512 / -0.587, 0 |
| **Munk x5** | -2.439 / -2.704 | 305 / 184 | **14** | 20/17 | -5.46 / -5.41 | -2.253 / -2.762, 1 |
| **awkward** | -2.212 / -2.350 | 256 / 227 | **25** | 31/17 | -5.41 / -5.31 | -1.937 / -2.264, 1 |

Verdict: QUALIFIES on ten of the twelve hulls (including all five audited ones, and five never trained on). It does NOT qualify on the two extreme hulls: better mean there, but 14 and 25 dives in 500 ended that the autopilot completes, and the tail is no better. The wide training did not fix them; those hulls are probably at or past what the slew-limited actuators can control (the autopilot itself ends 17 dives on each), so the useful next step there is a different kind of change (an actuator or vessel limit, or an explicit "unrecoverable hull" fallback), not more search. Versus the tail pilot 9400 on the ordinary hulls the wide pilot is about the same (no measured gain), so its value is the modest improvement on the extreme hulls.

## Flying on imperfect senses (UNNUMBERED; `tools/subDisturb.mjs`, `tools/auditSubDisturbed.mjs`)

Until now every pilot was handed the exact state instantly and flew in gentle water. `subDisturb` takes those three kindnesses away, around any pilot: gaussian SENSOR noise on depth, attitude, velocity and body rates; a CONTROL DELAY; stronger GUSTS (a current added to scenarios that have none, scaled by the level). Levels: 0 clean | 1 good INS, short link (noise x1, 0.1 s, gust x1) | 2 rough (x3, 0.2 s, gust x2) | 3 bad day (x5, 0.3 s, gust x3). The PD autopilot is disturbed the same way (same noise seeds, same delay, same gusts), so each cell compares like with like. The gate holds the module (22 sabotages, all red).

SAFETY_POOL (500 dives, actuator limits; champion / autopilot; newly ended = dives the champion ended that the autopilot completed):

| hull | pilot | level 0 | level 1 | level 2 | level 3 (newly ended) |
|---|---|---|---|---|---|
| nominal | long 9201 | -0.412 / -0.582 | -0.429 / -0.595 | -0.475 / -0.624 | -0.536 / -0.661 (0) |
| nominal | tail 9400 | -0.492 / -0.582 | -0.510 / -0.595 | -0.562 / -0.624 | -0.630 / -0.661 (0) |
| nominal | wide 9501 | -0.482 / -0.582 | -0.501 / -0.595 | -0.554 / -0.624 | -0.623 / -0.661 (0) |
| Munk x3 | long 9201 | -0.560 / -0.535 | -0.670 / -0.567 | -0.931 / -0.659 | **-1.223 / -0.832 (4)** |
| Munk x3 | tail 9400 | -0.423 / -0.535 | -0.455 / -0.567 | -0.555 / -0.659 | -0.760 / -0.832 (4) |
| Munk x3 | wide 9501 | -0.441 / -0.535 | -0.485 / -0.567 | -0.597 / -0.659 | -0.837 / -0.832 (5) |

Fresh audit, base 14000 (500 + 36 dives; SPENT for the tail pilot), tail pilot 9400, disturbed autopilot as the reference:

| hull | set | level 0 | level 1 | level 2 | level 3 | newly ended (L0/L1/L2/L3) |
|---|---|---|---|---|---|---|
| nominal | SAFETY_AUDIT | -0.475 / -0.573 | -0.492 / -0.588 | -0.545 / -0.617 | -0.615 / -0.653 | 0/0/0/0 |
| nominal | AUDIT | -0.480 / -0.566 | -0.496 / -0.576 | -0.547 / -0.596 | -0.617 / -0.625 | 0/0/0/0 |
| Munk x3 | SAFETY_AUDIT | -0.420 / -0.525 | -0.449 / -0.561 | -0.558 / -0.660 | -0.764 / -0.822 | 0/0/**1**/**3** |
| Munk x3 | AUDIT | -0.394 / -0.495 | -0.407 / -0.514 | -0.475 / -0.589 | -0.607 / -0.703 | 0/0/0/0 |

What it says. (1) The learned pilots keep their lead over the PD autopilot on the nominal hull at every level, but the lead shrinks with the noise: at the bad-day level the tail pilot is better on 276 of 460 safety-audit dives (the margin is nearly gone: -0.615 vs -0.653) and ends none the autopilot completes. (2) On the unstable Munk x3 hull the robustness ORDER is tail > wide > long: the long champion degrades much faster than the autopilot (-1.22 vs -0.83 at level 3, 4 newly ended) and the tail training bought a real margin; the wide pilot is no better than the autopilot at level 3. (3) The tail pilot holds the strict bar (no dive ended that the autopilot completes) through level 1 on both hulls; at level 2 it ends ONE Munk x3 safety-audit dive in 500, at level 3 three, so "robust to rough senses" is true for the mean and the ordinary hulls, not for the strict safety count on the 3x-Munk hull in a bad day. (4) The pilots were never trained with this noise: training on the disturbed levels is the obvious next step, and the delay (0.3 s on a hull that needs fast fin corrections) is the likely cause of the Munk x3 losses.

## Trained on noisy senses (UNNUMBERED -> v4875; `tools/trainSubWide.mjs --levels`, `brain/pilotSubWeightsRobustNoisyWip.json`, seed 9602)

`trainSubWide` now averages its objective over the disturbance levels of `tools/subDisturb.mjs` (`--levels`, `--hulls`, `--tailLevel`; with no flags it is the wide round's objective bit for bit: -1.3674 at the start from the tail pilot). Four runs of 300 iterations from the tail pilot (9400) on the five training hulls with the Munk x3 tail term flown at level 2: seeds 9600/9601 over levels 0, 2, 3; seeds 9602/9603 over 2, 3 only. HELD_OUT (60 dives per cell), mean over five hulls x four levels: autopilot -0.630, tail pilot -0.540, 9600 -0.528, 9601 -0.537, **9602 -0.516**, 9603 -0.529; no run ended a dive the autopilot completes. 9602 was picked: clean flight did not get worse (nominal -0.44, Munk x3 -0.39, the tail pilot's numbers) and the worst case moved most (Munk x3 at the bad-day level -0.59 against the tail pilot's -0.75 and the autopilot's -0.85).

SAFETY_POOL (500 dives, champion / autopilot disturbed the same way; dives it ended that the autopilot completes in brackets for levels 0 to 3): nominal -0.503 / -0.582, -0.515 / -0.595, -0.553 / -0.624, -0.612 / -0.661 (0, 0, 0, 0). Munk x3 -0.433 / -0.535, -0.452 / -0.567, -0.516 / -0.659, **-0.625 / -0.832** (0, 0, 0, 0): the tail pilot had ended 4 at the bad-day level there.

Fresh audit, base 16000 (500 + 36 dives per hull per level; SPENT for this pilot), all five training hulls, four levels, 40 cells: **no dive ended that the autopilot completes in any cell**, and the mean and the worst-5% beat the disturbed autopilot's in every cell. Selected rows (SAFETY_AUDIT, level 0 / level 3, champion vs autopilot): nominal -0.491 / -0.568 and -0.606 / -0.646 (better on 354 / 279 of 464); Munk x3 -0.431 / -0.528 and -0.598 / -0.800 (446 and 453 of 468 / 491); Munk 0 -0.632 / -0.762 and -0.783 / -0.826; fins x0.6 -0.504 / -0.602 and -0.620 / -0.693; righting x2.5 -0.507 / -0.684 and -0.613 / -0.774. Worst-5% on Munk x3 at the bad-day level: -1.63 against the autopilot's -2.09 (the tail pilot's was -2.37 at the same level on a different range).

Verdict: QUALIFIES at every disturbance level on all five training hulls, which closes the bad-day Munk x3 failure the tail pilot had. Caveats, said plainly: (1) on the nominal hull the lead shrinks with the noise (at the bad-day level it is better on 279 of 463 safety-audit dives, -0.606 vs -0.646: close to a tie, not a win); (2) the noise is white gaussian on depth, attitude, velocity and rates, a fixed delay and stronger sinusoidal currents -- real sensors have bias, drift, dropouts and correlated noise, none of which is modelled; (3) the two extreme hulls (Munk x5, awkward) were not part of this round and are still failures; (4) it is not added to the aquarium seeds.

### The noisy-senses pilot is an aquarium seed

`ai-bridge/subAquariumCore.js` SEED_RECIPES gains **"Explorer noisy-senses pilot"** (weights `brain/pilotSubWeightsRobustNoisyWip.json`, seed 9602; theta `subTacticsThetaSearchPingWip.json`). "Offer my subs" now offers SIX (the PD autopilot and five trained pilots); the core, bridge, tank and page gates that pinned five were moved to six, and a new core row pins the new sub to the Noisy weights file, not the tail pilot's (A38 and A39 red). The wide pilot (seed 9501) is still not a seed.

## A real zebrafish circuit (UNNUMBERED; `tools/fishCircuit.mjs`, `vendor/zebrafish/`, `brain/pilotSubFish.mjs`, `tools/ship/trainPilotSub.mjs`, `brain/pilotSubWeightsFishWip.json`)

* **Where it comes from, and no token.** The Fish1 larval-zebrafish EM connectome (Petkova, Januszewski et al., 2025) keeps its synapse tables behind a CAVE server that needs a token. The paper's own analysis packages sit in an open bucket (`gs://fish1-release/paper_data`), and `TEN_analysis.zip` (3,487,626 bytes, sha256 in `vendor/zebrafish/PROVENANCE.md`) holds a synapse table of the 1,105 neurons the paper analysed. `tools/fishCircuit.mjs` turns it into a directed graph and takes the densest core by one rule with one knob (peel the least-connected neuron until 34 remain): `vendor/zebrafish/fish1-ten-core.json`, 34 neurons, 153 edges, 308 synapses. The data policy is open access with a request to cite the paper and states no licence text, and the file claims none.
* **What it is NOT.** The densest core of this package is mostly inputs to the dorsal motor nucleus of the vagus (22 DMV inputs, 7 DMV, 2 TEN, 3 unlabelled): real wiring, and not a circuit anyone has shown steers a body. **The Mauthner escape circuit, the fish's analogue of the giant fiber, is in the CAVE tables and is not in it.**
* **The control.** `brain/pilotSubFish.mjs` also makes a RANDOM circuit of the same size (34 neurons, 153 edges, seed 4242): the question the fly's result could not answer is whether anything a real wiring does here differs from what any sparse core of that size does. One draw, so a difference from it would be a hint and not a measurement.
* **Result (same recipe, same FRESH audits, seeds 7000.., read once per circuit; `node tools/ship/trainPilotSub.mjs --circuit fish|control|fly --workers 4`).** The autopilot scores -0.4956 on the 36 audit dives, -0.5564 on the 500 safety-audit dives, -0.5146 on the reserve. The fish: -0.3236 / -0.3523 / -0.3426. The random control: -0.3191 / -0.3501 / -0.3282. The fruit fly: -0.3090 / -0.3340 / -0.3147. All three qualify (better on every audit dive, no dive ended early). **The real fish wiring does no better than a random circuit of its size, and the gaps are inside the spread between the four searches of one circuit.** With the recurrent block of each champion set to zero (held-out dives), the fish keeps 0.102 of its 0.174 gain, the control 0.158 of 0.191, the fly 0.168 of 0.201: most of the gain is in the input and output layers every circuit has, and the fish champion leans on its recurrence the most and ends no better.
* **The file.** `brain/pilotSubWeightsFishWip.json` (803 weights, marked `circuit: "fish"`) turns the aquarium's fish chip to live; the chip's detail and `sub-aquarium.html` say the tank still flies the fly-wired subs (the page validates only 963-weight bodies). The gates: `tools/fishCircuit-selfcheck.mjs`, `brain/pilotSubFish-selfcheck.mjs`, `tools/ship/trainSubPilot-selfcheck.mjs`, each sabotaged (logs in their headers).
* **Next:** the Mauthner circuit (a CAVE export run on Keith's machine with his token, the CSVs uploaded: the token never leaves him), twenty random controls and not one, and a task where memory matters. The register item is `fish-circuit-next` in `tools/ship/todo.mjs`.

## The first CAVE `discover` (2026-10-23; `tools/fishCaveExport.py discover`, run on Keith's machine, the folder uploaded; UNNUMBERED)

What came back, in facts only (no rows, no ids, nothing from the folder is committed: the data terms of the account say nothing is posted publicly until they are read):

* The script works end to end against the real server. Three datastacks answer: `h01_c3_flat` (the human H01 piece), `fish1_test` (it ERRORS: `zero-size array to reduction operation maximum`, which is `most_recent_version()` on a stack with no materialization at all, so an empty test stack and not a fault of ours) and **`fish1_full`** (materialization version 737, segmentation `fish1_v250915`, viewer https://ngl.brain-wire.org/).
* `fish1_full` has nine tables: `somas` (187,052 rows; `cell_type` is only `exc`, `inh` or `na`, the CLEM labels), `somas_distance_to_landmark` (a float in `tag`, 5 to 25 in the sample rows, so a distance to something near, not to one cell), `synapses_axde` (29,474,316 axon-to-dendrite synapses; THE synapse table of the stack), `synapses_axax` (9,539,284), the three reference tables of `synapses_axde` (`..._label`: tag 1 inhibitory, 2 excitatory; `..._pre_synapse_id`, `..._post_synapse_id`), `synapses_axon_to_dendrite_size` (bounding boxes) and `relaxin_177172_output_080426` (60 cells).
* **NO TABLE NAMES THE MAUTHNER CELLS.** The default `export` search (a regexp over the cell-type tables' text columns) would find nothing. The way in is `export --datastack fish1_full --root-ids <the two ids>`, which needs the ids from somewhere else: the viewer (the Mauthner cells are the pair of giant hindbrain neurons, one each side of the midline; click the cell body and the segment id is the long number that starts 864691), or the paper's supplement. A root id copied from the live viewer can be newer than version 737; the script then says "the cells have no synapses at version 737 ... try --version" and the fix is an earlier `--version` or the id the cell had at 737.
* A trap for any later coordinate work: `somas` and `somas_distance_to_landmark` are in voxels of 8 x 8 x 30 nm, `synapses_axde` and its references in voxels of 16 x 16 x 30 nm, the viewer is 16 x 16 x 30. A soma position and a synapse position are not in the same unit.
* Not checked: whether the Mauthner cells are proofread in version 737 (the stack names no proofreading table), and the landmark `somas_distance_to_landmark` measures.

## The first `export` with two root ids, and version 2 of the script (2026-10-23; UNNUMBERED)

Two root ids came from an AI chat (not from the data, the paper or the viewer) and were run through `export --root-ids` on Keith's machine, first with version 1 and then with version 2 of `tools/fishCaveExport.py`. Facts only, no ids and no rows committed:

* **Neither id is evidence of a Mauthner cell, and one is not a cell.** Id A has a soma row (`somas`, cell_type `na`, at 606 x 307 x 200 micrometres), 455 synapses IN from 326 partners, none out, and its synapses sit in a box of 33 x 80 x 58 micrometres around the soma: an ordinary-looking receiving neuron. Id B has NO soma row and two synapses out, to one partner, inside 0.5 x 0.1 x 0.15 micrometres: an axon fragment. An id list from a language model cannot be a lookup of a database that changes with proofreading; treat any id that did not come from a table, the paper or the viewer as unchecked.
* **The units line up.** Id A's soma (8 x 8 x 30 nm voxels) and the centre of its synapses (16 x 16 x 30 nm voxels) are 5 micrometres apart in micrometres, which is what the table descriptions said the two resolutions were.
* **The star.** The 40 strongest partners all send to id A and none sends to another partner: the hops-2 circuit is a fan of 40 inputs into one cell, with no loop. A recurrent network for the fish pilot needs a deeper reach (the inputs of the inputs), which `export` does not do yet.
* **What version 2 does that version 1 did not** (gate section 10; 37 mutants, every one red by name): labels for the given cells by a filtered query of each label table (somas answers; `somas_distance_to_landmark` answers HTTP 500 to a filter on pt_root_id and is recorded as skipped), a `cells_summary.json` (counts, partners, the box of the synapses in micrometres, every label row, a flag for a cell with no synapse), a size column that is zero in every row left blank with a warning.
* **Still needed:** the real ids. Routes: the people who gave Keith the account (the stack has no table that names them), the paper's supplement, or a finder that ranks the large neurons of the hindbrain by dendritic size on Keith's machine (not built; it would give candidates to check in the viewer and not an answer).

## The big-neuron finder, the full pass, and the first export of the top four cells (2026-10-24; facts only -- no root ids, no rows, per the data terms)

* The `giants` pass read all 29,474,316 rows of the synapse table (materialization version 737, 100%, resumed by itself after the server dropped a connection at page 25 of 59) and ranked the 179,930 cells that have a soma by synapses received:
  112,156 receive at least one; the median receives 34; 137 receive over 1,000, 24 over 2,000, 4 over 3,000. The top two receive 5,831 and 4,001, then 3,322, 3,097, 2,952: a smooth fall, no gap.
* The top 60 form ONE population: 31 opposite-side pairs agree within 6 um front-back and 6 um top-bottom; the pairs imply a midline near y = 262.4 um (the median of the somas gave 259.2). So "the two biggest cells make a tight mirror pair" is true and is not special.
* The exact `export` of the top two and of ranks 3 and 8 (ranks by the pass):
  - the exact synapse counts differ from the pass's by +14, +162, -45 and +28 (the exact query is the one to trust; the cause of the difference is NOT known -- the same pass read twice gave the same file, so it is not paging noise between runs);
  - **ranks 1 and 2 are mirror images in how their inputs sit**: the input synapses' centroid is +1.8 / +4.3 um front-back, +8.8 / +10.1 um lateral (away from the midline) and +15.5 / +11.1 um in z from the soma; 90% of the inputs lie within 58 / 54 um of the soma; and 100% of the presynaptic ends of rank 1's inputs lie on rank 1's own side of the midline and 100% of rank 2's on rank 2's side (no input crosses the midline at all). Ranks 3 and 8 are not like them (centroids +20.8 / +8.3 um front-back, 37% / 23% of inputs beyond 60 um of the soma; 85% / 95% of the inputs from their own side);
  - the outputs are sparse: 32 and 41 output synapses for ranks 1 and 2 (rank 1's all on its own side within 51 um of the soma; 39% of rank 2's across the midline, reaching 276 um), none for rank 3, and 281 on 175 targets for rank 8 (52% across the midline, reaching 386 um) -- the axons are attached to different degrees, so output geometry cannot be compared;
  - the inputs are many and weak: 2,042 and 1,677 distinct presynaptic partners for ranks 1 and 2, the strongest partner sending 52 synapses; 104 partners synapse onto both. The 40 strongest partners have a soma in only 11 cases (one inhibitory, ten unlabelled).
* WHAT THIS DOES NOT SHOW: that any of these cells is a Mauthner cell. The tables carry no cell-type labels beyond excitatory/inhibitory/na, the size column is zero in every row, and the one table that might carry a landmark (`somas_distance_to_landmark`) answers a query on root id with a server error. The decision is the viewer's (a very large soma, a lateral and a ventral dendrite, a thick axon crossing the midline and running toward the tail); the viewer positions of the top cells are in the `giants_top.csv` on Keith's machine.

### The identification Keith brought back (2026-10-24; facts only; the text was relayed, the viewer was not looked at by this chat)
* The text relayed says the top two are the left and right Mauthner cells (hindbrain rhombomere 4, a lateral and a ventral dendrite) and that ranks 3 and 8 are "either spiral fiber interneurons or PHP inhibitory interneurons" directly interacting with them. The first part is hedged by nothing and fits the data below; the second is hedged by its own "either ... or" and does NOT fit the table.
* What the export says about it, for the record (version 737, the cells' complete synapse lists, 354 output and 15,847 input rows):
  - ranks 1 and 2 are a mirror pair in the same sense as before: somas 562.7 and 563.7 um front-back, 157.7 and 159.3 um top-bottom, +45.4 and -36.5 um either side of the soma-median midline (259.2 um), with the largest input counts of any cell with a soma. That is what a Mauthner pair would look like; it is also what the next 29 mirror pairs look like. The tables still carry no label that settles it.
  - **no synapse exists between any two of the four cells** (no rank 3 or 8 onto rank 1 or 2, none the other way, none between ranks 1 and 2). A spiral fiber cell or a PHP cell would be expected to send output synapses onto a Mauthner cell's axon hillock; rank 3 has NO output synapses in the table at all, and rank 8's 281 outputs go to 175 targets, none of them a Mauthner candidate. NOT excluded: that the axon hillock region is poorly segmented or detected in this version (the detections are automatic and the size column is empty).
  - the presynaptic partners shared: 104 of 3,615 between ranks 1 and 2; 0 between ranks 3 and either of them (rank 3 and rank 1: 0; rank 3 and rank 2: 0), 9 and 1 for rank 8; 60 between ranks 3 and 8.
  - ranks 3 and 8 are themselves a near-mirror pair (504.4 and 512.0 um front-back, 201.4 and 190.3 um top-bottom, -34.9 and +41.3 um from the midline), 50 to 60 um in front of ranks 1 and 2.
* So for the fish brain: ranks 1 and 2 are taken as the Mauthner candidates and are labelled CANDIDATES (not confirmed by morphology here) wherever they are used; ranks 3 and 8 are NOT labelled spiral fiber or PHP anywhere until a viewer reading of their axons shows them reaching the Mauthner axon hillock (the check: do they put synapses onto it). Open: the output side of the Mauthner circuit (the axon leaves the imaged region for the spinal cord, so the circuit this volume can give a pilot is the INPUT side).

## The input side of the Mauthner candidates (2026-10-24; facts only -- no root ids, no rows; from the first export of ranks 1 and 2, 10,008 input synapses; throwaway scripts, NOT gated: unchecked until a gated tool reproduces them)
Keith's word: start with the partners, not the axon; the identification is probably accurate enough to build on; whether this brain can swim is not decided and is to be tried until it is ruled out or becomes the rule.
* **The inputs of both candidates fall into the same three groups** (k-means on the postsynaptic position relative to the soma: front-back, lateral = away from the midline, z; micrometres):
  - a **perisomatic cloud**: 55% (rank 1) and 60% (rank 2) of the input synapses, centred within about 8 um of the soma;
  - a **lateral arm**: 31% and 34%, centred +37 to +39 um lateral and 6 um in z, narrow front-to-back (sd 2.4 to 2.8 um), out to 60 um;
  - a **long arm in z**: 14% and 7%, centred +61 to +70 um in z, narrow laterally, out to 89 um (rank 2 has a stray tail of 272 synapses out to 280 um from the soma; the cluster for rank 1 is 934 at k=3).
  Two arms and a cell body that receives most of its synapses is the shape of the textbook cell (a lateral dendrite and a ventral dendrite): which direction in z is ventral is NOT known from these files (the axes' orientation is not stated), so "the z arm is the ventral dendrite" is a reading and not a measurement.
* **Partners are channels**: 96% (rank 1) and 98% (rank 2) of the presynaptic partners put all their synapses into ONE of the three groups. By dominant group, partners number 1,161 perisomatic, 463 lateral, 418 z-arm for rank 1 and 1,018 / 490 / 169 for rank 2. Strong partners (10 or more synapses): 39 perisomatic, 37 lateral, 4 z-arm for rank 1; 20, 20 and 1 for rank 2. Synapses per partner: 2.7 / 3.7 / 1.9 (rank 1), 2.4 / 2.8 / 1.6 (rank 2).
* **The 104 partners that synapse onto BOTH candidates** (out of 3,615 distinct): 90 are perisomatic on both, 6 lateral on both, 1 z-arm on both, 7 differ. So the partners shared by the two cells are a perisomatic population; the lateral and z arms are mostly each cell's own. Whether the shared ones are inhibitory is in the synapse label table (below) and is NOT checked.
* The strongest inhibitory-labelled partner of rank 1 (52 synapses) puts 43 of them on the perisomatic group and 9 on the lateral arm.
* **A table the exports never read: `synapses_axde_label`** (29,474,316 rows, a tag per synapse: 1 inhibitory, 2 excitatory; it carries the synapse's own columns, including both root ids) and `synapses_axon_to_dendrite_size` (bounding boxes per synapse). The synapse table's `size` column is empty in every row, `ctr_pt_position` too. So the connectome's weights so far have been synapse COUNTS, unsigned; signs and bounding-box sizes exist on the server for every one of the cells' synapses and have not been fetched. The next export fetches them.

### The fish ladder (decided in writing 2026-10-24, BEFORE the signed data is in; Keith: "exhaust both our abilities", rule it out or make it the rule)
What the existing fish result was, so the ladder starts from the truth: the pilot used the TEN-core's wiring only as a MASK (which recurrent weights may exist, all zero at the start; the sensor and readout layers are dense and trained), and the real wiring did no better than a random mask of the same size. Signs and counts were never used. The Mauthner input side is not a recurrent core either (it is a fan of partners onto two cells; the only loops are through the few partner-to-partner edges), so "the same recipe with a new mask" would repeat that test and say little.
* **Rung 0 -- the data.** `tools/fishCaveExport.py export ... --signs --boxes` (v5; gated, 50 mutants): the signed, box-sized input side of the two candidates and their 400 strongest input partners, with the edges among them. The script counts its own joins; the first real run says whether the label and size tables behave as the table descriptions say.
* **Rung 1 -- facts, no pilot.** The sign of each arm's inputs (lateral arm, z arm, perisomatic) and of the 104 partners shared by both cells; the strength of the partner-to-partner edges. Pass/fail is not defined: this is reading.
* **Rung 2 -- the reflex, no training.** The two cells as threshold units with the signed counts as FIXED weights, partners driven from outside: driving only the lateral-arm partners of one side must fire that side's cell and not the other (true by the wiring's construction, so it checks the build, not the biology); driving the shared perisomatic partners must lower the opposite cell's drive if they are inhibitory (a prediction the data can break). Pre-registered: if the perisomatic shared partners are NOT mostly inhibitory, the 'mutual inhibition' reading of them is dropped.
* **Rung 3 -- the dive task, the same recipe, the same fresh audits.** The fish input-side circuit against TWENTY random circuits of its size (not one), and against two shuffles of itself (the signs shuffled across edges; the counts shuffled across edges), so that "the wiring" and "the numbers on the wiring" are separate questions. Verdict rule written now: the fish counts as better only if it beats the control distribution on all three audits by more than the spread between the searches of one circuit (the spread seen before: about 0.01 to 0.02). Said now, so it can be held against the result: the expectation is that it will NOT, since the dive task is not an escape task.
* **Rung 4 -- a task where the reflex is the right answer.** A looming hazard from one side (a drifting obstacle, collision as the loss; no weapons, no guidance), the fish circuit as the fast reflex layer under the depth/heading pilot, the control being the same layer with random or shuffled wiring. Not built; the task and its pass/fail go in this note before anything is run on it.
* **Stop rules.** RULED OUT = rungs 3 and 4 both fail against the controls as written here. THE RULE = they pass. Anything in between is reported as in between and the next rung is named. Not claimed at any rung: that a fish brain can swim (a swimming central pattern generator lives in the spinal cord, which this volume does not hold) -- the claim under test is only whether this wiring pilots a submarine better than other wiring does.
* **The data terms.** The tools run on Keith's machine and on exports Keith uploads. A circuit made from the CAVE tables carries root ids and is derived data: it is NOT committed to the repository until Keith has read the terms attached to the account (the notes carry facts and counts only).

### The input-side numbers again, from a GATED tool (tools/fishInputSide.mjs; 2026-10-24) -- they SUPERSEDE the throwaway numbers two sections up, and ONE OF THEM WAS WRONG
* **A correction first.** The throwaway analysis called the long z arm of the second candidate "7%, with a stray tail of 272 synapses out to 280 um". It was two things in one cluster: **255 synapses (6%)** of a compact z arm (centred 73 um in z, sd 2.5 / 5.4 / 5.8) and **17 synapses from 15 partners at 250 to 280 um** from the soma, where every other input synapse of both cells lies within 89 um. The tool leaves anything beyond 100 um out of the fit and calls it `far` (a k-means asked for three clusters had spent one of them on the 17, so the z arm of that cell came out as 17 synapses 256 um away); the 17 are the first thing to look at in the viewer (a piece of another cell merged into this one would put its synapses there). NOT checked: what they are.
* Input synapses by group, candidate 1 / candidate 2: perisomatic 3,117 (53%) / 2,494 (60%); lateral arm 1,794 (31%) / 1,397 (34%), centred +36.5 / +38.7 um lateral; z arm 934 (16%) / 255 (6%), centred +61 / +73 um in z; far 0 / 17. Partners 2,042 / 1,677, by commonest group perisomatic 1,138 / 1,029, lateral 458 / 479, z arm 446 / 154 (and 15 far for candidate 2); strong partners (10 or more synapses) 38 / 37 / 5 and 20 / 20 / 1; **1,959 of 2,042 (96%) and 1,641 of 1,677 (98%) partners keep all their synapses to one group**.
* Shared by the two candidates: 104 partners, 95 in the same group on both (88 perisomatic on both, 6 lateral on both, 1 z arm on both); 7 are z arm on one and perisomatic on the other, one each way perisomatic / lateral. (The throwaway run said 97 and 90.) Signs: not in this export; `export --signs` carries them and the tool reads `synapse_signs.csv` when it is there.
* The tool prints counts only, no root id (the data terms): `node tools/fishInputSide.mjs --dir <an export folder>`. Gate: planted clouds with hand-worked counts, 43 rows, 61 mutants all red by name (logs in its header).

### A second export of the same four cells, at materialization version 738 (uploaded 2026-10-24; facts only)
* The manifest says version 738 (timestamp 2026-10-24 08:10), tool version 5, the four root ids of the first export, 40 partners, `signs` false and `boxes` false: the OLD command was run, not the v5 one, so the folder has no `synapse_signs.csv`, no `synapse_boxes.csv` and no `extras`. The `--signs` / `--boxes` lookups have therefore NOT been run against the real server yet; what they do on it is still unknown.
* **It replicates the first export exactly across the two versions**: 15,847 input and 354 output synapse rows, 40 partners, 41 edges, 15 label rows, the same file sizes to the byte (the cells summary differs by the version fields); `tools/fishInputSide.mjs` on it gives the same numbers to the last digit as on the version-737 folder (the three input groups of both candidates, 96 and 98 percent of partners in one group, the 104 shared partners, the 17 far synapses). So proofreading between the two versions did not move these cells' synapses.
* Root ids are stable between 737 and 738 for these cells (the circuit's 44 neurons are the same list). Version 737 may no longer be available on the server; the default (the newest) is what ran.

## The first signed export (2026-10-24; `fishCaveExport.py export --signs --boxes`, version 5 of the script, materialization 738, the two candidates and their 400 strongest partners; facts only -- no root ids, no rows)
**Rung 0 of the ladder is done and the script's two new lookups were run against the real server for the first time.**
* **The label table works exactly as its description said.** `synapses_axde_label` filtered on `target_id` with a flat dictionary, 2,000 ids to a request (six requests), returned a tag for **every one of the 10,691 synapses asked about** (10,008 inputs of the two candidates and the 683 more among the circuit): 8,505 excitatory (tag 2), 2,186 inhibitory (tag 1), no other tag. The label row's own `id` and `target_id` are the synapse's id. So the flat filter on a reference table's own column is accepted (the earlier 500 was a filter on a column of the REFERENCED table), and the join is exact. The tags are one per SYNAPSE, not one per neuron.
* **The size table answered and its `id` is not the synapse's id** (the script's own join count said 0 of 6,977 and warned, as built to). It is joined by the pairing the table descriptions name: `tag` is the presynaptic synapse id and `tag2` the postsynaptic, and the synapse's `id` is **their Cantor pair computed in wrapping signed 64-bit arithmetic** ((a+b)(a+b+1) wrapped to int64, floor-halved, plus b, wrapped again): **6,596 of the 6,977 boxes match an exported synapse** (the plain big-integer pairing, wrapped afterwards, matches only 2,440; the swapped order 0). The boxes cover only 6,596 of the 10,691 synapses (62 percent): the table's `pt_root_id` and `pt2_root_id` are the segments under the box's two CORNERS, so a query by cell finds the boxes whose corner lies in the cell, not every box of its synapses (353 of the 6,977 have a corner on no segment at all). Full coverage would need the presynaptic synapse id of each synapse (the reference table `synapses_axde_pre_synapse_id`) and a query of the size table by `tag`. NOT done: the script does not yet use the pairing, and box volumes are not in `edges.csv`.
* **The tags, checked against the other labels in the stack.** The seven partners that have a CLEM soma label of excitatory (6) or inhibitory (1): the six excitatory ones have 11 percent inhibitory tags overall and none has a majority of them; the inhibitory one (52 synapses on candidate 1, 43 of them perisomatic) has 67 percent. So the two independent labels agree in all seven cases (a small number). 82 more partners have the label `na`, 977 synapses, 12 percent inhibitory tags, 2 with a majority.
* **But a partner's synapses do NOT agree in sign the way one neuron's would.** Partners with two or more synapses on a cell whose synapses all carry one tag: 64 percent (candidate 1, 684 of 1,071) and 70 percent (candidate 2, 595 of 846), against 45 and 58 percent expected if every tag were an independent coin with that cell's inhibitory share; of the strong partners (ten or more synapses) only 15 of 80 and 13 of 41 are pure. The inhibitory-tag share of the 148 strong partners falls in fifths 0-20 / 20-40 / 40-60 / 60-80 / 80-100 percent as 90 / 38 / 14 / 5 / 1. Read: the tag is a per-synapse classifier output with a floor of roughly 10 to 15 percent of wrong-way tags on a clearly excitatory partner, and the sign of a PARTNER has to be taken as the majority (weighted by how lopsided it is), not read off any one synapse. NOT checked: the classifier's accuracy (the paper's supplement is the place).
* **Signs by input group** (synapses, excitatory / inhibitory; candidate 1 | candidate 2): perisomatic 2,617 / 500 (16 percent inhibitory) | 2,169 / 325 (13); lateral arm 1,232 / 562 (31) | 1,144 / 253 (18); z arm 703 / 231 (25) | 209 / 46 (18); the 17 far synapses of candidate 2: 6 / 11 (65 percent inhibitory). Over all inputs: 22 percent (candidate 1: 1,293 of 5,845) and 15 percent (candidate 2: 635 of 4,163) inhibitory. The mirror pair is NOT a mirror in this: candidate 1's lateral arm is nearly twice as inhibitory as candidate 2's. Whether that is the cells or the classifier is not known.
* **A prediction the data broke (rung 2 of the ladder, written before the signs were in).** The ladder said: if the 104 partners shared by the two candidates, which sit on the perisomatic group of both, are NOT mostly inhibitory, the 'mutual inhibition' reading of them is dropped. Signs of the shared partners on the two cells: excitatory on both 89, excitatory on one and inhibitory on the other 8 (4 each way), the rest tied. **They are overwhelmingly excitatory on both cells. The mutual-inhibition reading is dropped.** What they ARE is not known: a population that excites both candidates near the soma.
* The first run also showed a bug in MY tool, not in the data: `tools/fishInputSide.mjs` read the ids of `mauthner_candidates.json` with JSON.parse, which rounds the 18-digit numbers the export writes (864691128610327387 came back as ...400), and died with 'no soma row'. The gate's fixture wrote the ids as strings, so it had passed. Fixed: the ids are read as text, the fixture writes them as the export does, and a candidates file with no ids is refused by name.

## The hindbrain integrator's circuit (2026-10-24; `tools/fishHmi.mjs`, `vendor/zebrafish/fish1-hmi-spn.json`; OPEN data, so it IS committed; gated, 131 + 51 mutants)
**What it is.** The Fish1 release's second open analysis package, `HMI_analysis.zip`, holds a spreadsheet of 999 hand-traced cells (class, transmitter, network level, and the synapses a person marked on each cell's inputs and outputs). HMI is the paper's case study of a hindbrain *integrator* with recurrent excitation and contralateral inhibition; its outputs are spinal projection neurons (SPNs) for turning and for forward swimming. `tools/fishHmi.mjs` reads the xlsx with nothing but `zlib` and cuts the circuit by one rule: the SPNs, the transmitter-labelled cells that have an identified synapse onto them (layer 1), and the labelled cells that have one onto those (layer 2). Sign from the transmitter (VGluT2 +1, Gad1B -1), weight = the number of traced synapses, sides from the soma position against the midline.
* **The numbers** (depth 2): 999 cells, 3,013 traced synapses, **1,755 to an identified cell and 1,254 to one nobody identified**, 4 malformed, 1,401 distinct pairs. The circuit: **99 neurons** (50 SPNs, layer 1: 18, layer 2: 31), **148 edges** (127 excitatory, 21 inhibitory), **189 synapses**; 23 pairs (28 synapses) onto those neurons from a cell with no transmitter label are left out and counted. Classes: I 28, L-2 14, F 5, SPN turning 15 + forward 13 + proximal 22 (the package's own figure leaves the proximal ones out; they are kept here and labelled), 2 unclassified. SPN groups: 31 turning, 19 forward.
* **Sides.** 75 neurons left, 12 right, 12 unknown. **46 of the 50 SPNs are on the left of the midline** (27 turning, 19 forward; 1 turning on the right, 3 unknown). The analysed circuit is a one-sided readout, so a left/right *difference* of SPN activity is not an available yaw signal and the pilot below uses a dense learned readout from the SPNs instead. The contralateral part is in layer 2 (11 left, 11 right, 9 unknown).
* **What it is not.** A person's partial tracing (1,254 of 3,013 marks end on an unidentified cell), tuple counts and not synapse sizes, one rule and one knob. It is not a circuit anyone has shown steers a body.
* The first real file showed nothing the gate missed beyond what the sabotage found earlier (the CRC check and the reader's row regex were exercised on it: same 999 rows, same 3,013 tuples before and after).

### Rung 3, rewritten for this circuit, and registered BEFORE any pilot is trained on it (2026-10-24)
The old rung 3 was written for the Mauthner input side. That side is not a recurrent core, and the HMI circuit is open data (the Mauthner-derived ones are not committable until Keith has read the account's terms), so rung 3 is run on the HMI circuit and the Mauthner side keeps rungs 1, 2 and 4. What the earlier fish result taught: the pilot used the TEN wiring only as a mask on a hidden layer that the sensors reach densely and the controls read densely, and *most of the gain was in those dense layers every circuit has*. So this test makes the wiring the only way through.
* **The pilot** (`brain/pilotSubCircuit.mjs`, to be built and gated): output = the PD autopilot's laws (exactly, in float64) + a residual from the circuit. Sensors: the 14 features reach ONLY the 31 layer-2 cells (dense, trainable), every cell has a bias (start 0.1); three recurrent steps along the 148 edges with the identity carry the other pilots use; each edge's weight is its source cell's sign times a trained magnitude (Dale's law; magnitudes start at 0.3 x count / mean count); the 4 controls read ONLY the 50 SPNs (dense, trainable, starting at ZERO) plus 4 biases. 14 x 31 + 99 + 148 + 4 x 50 + 4 = **885 weights**. It starts as the autopilot, exactly, and the same recipe as every earlier pilot searches from there (4 runs x 400 iterations of the sparse (1+1)-ES, sigma 0.3, 1-4 weights a child, pruned toward the start; eligibility on the 500-dive pool; champion = best held-out among the eligible).
* **Fresh audits.** `auditSets(20000)` (base 8000 is not clean -- the tail round mined Munk x3 dives there -- so the next unused hundred-thousand is taken: nothing in the tree has touched 20000..; the seeds 7000.. are spent on the last round's fly, fish and control). Each circuit's champion reads them once; nothing is chosen between circuits on them. A circuit with no eligible champion is scored as the autopilot (it found nothing).
* **The fish** is the HMI circuit. **The controls** (FIVE families), all with the same neurons, the SAME 31 input cells and 50 output cells, the same input-weight start (one fixed seed), the same number of edges carrying the same counts: **ER** (edges redrawn uniformly: a signed source, any target, no self-loop, no repeat; the edge sign is its source cell's), **LAYER** (every edge keeps its source layer and target layer and gets random endpoints inside them, so the layering that makes the closure reach the SPNs is kept), **DEGREE** (pairs of edges swap their targets, 20 attempts an edge: every cell keeps its in- and out-degree, every edge its source, sign and count), **SIGN** (the signs of the signed cells permuted among them; wiring and counts as they are), **COUNT** (the counts permuted across the edges). **REVISED BEFORE THE FIRST TRAINING RUN (same day): DEGREE was added, and the reach is a covariate, after `reachOf` was run on the real circuit and on one draw of each control (no pilot had been trained).** The input cells reach 43 of the 50 SPNs through 699 (input, output) pairs in the three steps; the ER controls reach 164-218 pairs, LAYER 280-341, DEGREE 256-389, and SIGN and COUNT 699 (they do not touch the wiring). So the controls reach far less than the real wiring, and a fish that beats them might only be beating a worse-connected pilot. The report therefore prints every circuit's reach, and the rank correlation between reach and score across the ER, LAYER and DEGREE controls: if the controls' scores rise with reach, a pass is reported as confounded by reach, whatever the margin.
* **Staged.** Stage A: the fish, 10 ER, 10 LAYER, 10 DEGREE, 4 SIGN, 4 COUNT (39 circuits x 4 searches). Stage B (only if stage A reads as a pass): 10 more of ER, LAYER and DEGREE (the twenty the ladder named). Seeds are fixed in `tools/ship/trainSubCircuits.mjs` (the K-th control of a family is the same circuit however it is asked for; the searches of the 101 possible circuits never share a seed).
* **The verdict rule, fixed now.** For each of the three audits (the 36-dive audit, the 500-dive safety audit, the reserve) the fish's champion score F, a family's scores C (mean m, sample standard deviation s): the fish BEATS the family on that audit iff F - m > max(0.02, 2 s). **Rung 3 passes** iff the fish beats the ER, the LAYER and the DEGREE family on all three audits. **Rung 3 fails** (the HMI wiring is ruled out *at this rung*, as a pilot of this kind) iff, against the family with the highest mean on that audit, the fish does not win on at least two of the three. A family needs three finished controls to be assessed. Anything else is reported as in between and the next step is named. SIGN and COUNT are reported against the same rule and answer a different question (do the signs / do the numbers on the wiring matter?); they do not enter the verdict. The code is `tools/ship/trainSubCircuits.mjs` (`node tools/ship/trainSubCircuitFamily.mjs run --specs ...`), gated.
* **The expectation, recorded so it can be held against the result: it fails.** The dive task is a PD-regulated depth/heading/speed hold and the earlier fish result was a tie with a random mask; a stateless circuit has nowhere to be an *integrator*. Said before the run, not after it.
* **A probe, said before the run so it is not a surprise afterwards:** to time the search and to see whether this pilot learns at all, ONE search of the fish was run for 120 children on the training dives only (seed 21000, the real run's first search; no audit was read): training score -0.5741 (the autopilot) to -0.5628, 29 improvements and 33 neutral moves, 78 s. The pilot learns, slowly: its gain through a 400-child search will be a fraction of the dense pilots' (the fish with a dense hidden layer reached -0.32 on the audit against the autopilot's -0.50). If every circuit gains about the same small amount, the verdict will say so, and that is a statement about this recipe on this interface as much as about the wiring.
* **Not claimed at this rung:** that a fish brain can swim, that a hindbrain integrator can pilot a submarine, anything about the 1,254 untraced contacts.

### Rung 4, rewritten (registered now, built later)
The integrator's job is to carry activity across time; the pilot above cannot (its recurrence is inside one control tick). Rung 4 is the same family of controls on **the noisy-senses dives** (`tools/subDisturb.mjs`, levels 2 and 3) with a STATEFUL variant of the pilot (persistent activity: each cell keeps a leaky copy of its last activity across ticks, reset at the start of every dive). Its audits, its verdict rule and the stateful policy's gate are written into this note before it is built. The Mauthner escape task (a looming hazard, collision as the loss; no weapons, no guidance) remains the reflex rung for that circuit.
