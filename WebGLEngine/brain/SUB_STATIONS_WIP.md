# The stations of a submarine, and a captain between them (2026-11-19; UNNUMBERED; round 1 of `ai-managed-sub-stations`)

Keith's idea (the backlog entry): "the engine's AI managing ALL the stations of a submarine -- helm and planes, ballast and trim, navigation, the sensors, and the energy and hull -- each by a brain, instead of one pilot flying the whole boat." Keith, 2026-11-19: "And the next ai-managed-sub-stations round." The entry waited on the needs task, because "the stations only conflict when the boat has needs". That task exists (`brain/needsTask.mjs`, rounds 3 to 40 of `brain/NEEDS_AND_LIMITS.md`), so this round starts it.

## 1. What a station is

The entry's own sketch, made concrete in `brain/subStations.mjs`:

* **A station** is a function from what that station can sense to what it commands. It sees only what it is handed: the energy station gets the needs readings and nothing of the mission; damage control gets the state and the target the helm flew.
* **Two kinds.** A TARGET station may claim the target the helm will fly (a depth, a heading, a speed, the surface). A COMMAND station may override the helm's commands after the helm has spoken.
* **The helm** is the boat's pilot behind the surfacing wrapper, so a claim of the surface is flown.
* **Aux** (the flood pump and the repair) is asked for by any station; the captain gives the largest asked.
* **The captain** decides between the claims and keeps a log of who had the con each tick and why.

## 2. What already exists, as stations

Every piece below was written as a WRAPPER around a pilot, for a boat with one problem. The table says what each is as a station.

| station | the brain that exists | kind | in `subStations.mjs` now |
|---|---|---|---|
| helm and planes | `brain/autopilotSub.mjs` (PD); the fly, fish and plain-net pilots | the helm | `helmOf(pilot)` |
| ballast and trim | the autopilot's ballast law; `brain/surfacePilot.mjs` (come up and stay up) | part of the helm | inside `helmOf` |
| damage control | `brain/emergencyPilot.mjs` (blow, then the drop weight) | command | `damageStation()` |
| energy and hull | `brain/needsAdvisor.mjs` (the Round 4 rule); `brain/needsPilot.mjs` (the fixed refill trip); `brain/surveySeat.mjs` (the survey planner) | target | `energyStation({ read })` (the advisor's rule) |
| navigation | `tools/subNavigator.mjs` (dead reckoning); `brain/fieldNavigate.mjs` and the tank's navigator (`brain/SUB_FIELD_NAV_WIP.md`) | target | `targetStation(name, fn)`, generic; no navigator is wired yet |
| sensors and weapons | `physics/mechanics/subSonar.mjs`; the duel's evade doctrine and torpedoes (`brain/subDuel.mjs`, the `SUB_EVADE_*` notes) | target and command | not yet |

**What the tank does today: one event at a time.** `render/subAquariumSim.mjs` says so in its header: the needs event "does not mix with the flood events or the compass ones". So no two of these brains have ever run on one boat, and nothing has ever had to decide between them.

## 3. Round 1: the framework, and the first captain (BUILT)

`brain/subStations.mjs`, gated by `brain/subStations-selfcheck.mjs` (26 mutants, every one red by name; the log is in its header).

* **THE FIXED-PRIORITY CAPTAIN** is what the tank's nested wrappers already do, written down: the highest-priority target claim wins (damage 90, energy 50, navigation 10, the mission 0; a tie goes to the earlier station), the helm flies it, then the command stations override in order.
* **ONE STATION SPEAKING IS ITS WRAPPER, BIT FOR BIT.** The gate flies each beside the captain in the same loop and compares every command of every tick. The energy station alone is `needsAdvisor.wrap` over 150 s, on a dive where it sends the boat up. Damage control alone is `emergencyPilot.wrap` over 120 s, on a dive where it blows and drops the weight.
* **One refactor** made that possible without a copy: `needsAdvisor.mjs` now exports `surfaceTarget`, which its own wrapper and the energy station both call. Its two gates are green.

## 4. The first finding: stations written for one problem fight when there are two

One boat, four crews, 400 s: 25 m down, 28% charge, and a leak of 6% of its weight from 5 s. This is the case the tank cannot fly. The numbers are from the gate's section 4, which pins them.

| crew | outcome |
|---|---|
| no station (the plain helm) | crushed at 92 s (58.9 m) |
| **energy alone** | **crushed at 58 s: sooner than with no station** |
| damage control alone | holds near 25 to 35 m, drops the weight, spends the charge at depth; crushed at 341 s |
| **both, under the fixed captain** | the only crew not crushed in 400 s: blows, drops the weight, climbs to 7.9 m. **Then the battery is flat** (0.000) and it sinks again: 19.1 m at 400 s |

Why, read from the ticks:
* **Energy alone is worse than nothing.** The surfacing wrapper rations the air bottle on the way up (it will not blow the tank while it rises: `brain/surfacePilot.mjs`, written for a sound boat with a finite bottle). The leak needed that air. The plain helm's ballast law at least blows as the boat sinks.
* **Damage control spends the charge.** Its rescue is full thrust with the planes nose-up. On a 28% battery that is the last of the charge, spent holding depth rather than reaching the surface where the battery refills.
* **The fixed captain only stacks them.** With both, the energy station has the con and damage control overrides the helm for 40 to 90 s at full thrust. The boat gets lighter (the weight goes) but arrives near the surface with nothing left.

**This is the conflict the backlog entry predicted.** Every station is right about its own problem and none of them knows the others' costs. The finding is about the stations as written, under a fixed captain, on one dive. It is pinned in the gate; it is not a measured rate over many dives.

## 5. Round 2, proposed (NOT registered, NOT built; Keith's call)

**The question:** on boats with two problems at once, does a captain that knows the stations' costs keep more boats than the fixed captain?

* **The task:** the needs vessel with a leak, from a scenario generator like `brain/floodTask.mjs` crossed with the needs task's charges: depth, charge and leak drawn per seed. It is scored like the needs task: survival first, then reaching the surface, then the hull.
* **The captains**, each registered before anything is flown:
  * FIXED, the one built here.
  * TRIAGE: a hand-written rule that lets damage control blow and drop the weight but caps its thrust by the charge left, and lets the energy station's surface claim switch off the surfacing wrapper's bottle rationing while there is a leak.
  * A learned captain, only if TRIAGE leaves a gap worth learning.
* **The controls:** each station alone, and none.
* **A fresh seed range, and the verdict rule written first**, as every round in this tree is.

What round 2 would not answer: navigation and sensors as stations. They would come after a captain has been shown to matter on the simplest conflict.

## 6. What this round did NOT do

* **It does not change the tank.** The Sub Aquarium still runs one event at a time. Putting the captain in the tank (and a "watch" line showing who has the con) is a page round, after round 2 says which captain to put there.
* **No navigator or sonar station is wired.** `targetStation` is the shape a navigator would take, and it is gated, but no navigation brain is behind it yet.
* **No claim that the fixed captain is good.** Section 4 shows it is not, on the one dive measured.

## 7. ROUND 2, REGISTRATION A (2026-11-19, written and committed before any code for it and before any dive of its sets is flown)

Keith, 2026-11-19: "Let's do the a captain that knows each station's costs, for example capping the rescue's thrust by the charge left, against the fixed captain on many seeds."

**THE QUESTION.** On boats with two problems at once (a leak, and a battery low enough to need the surface), does a captain that knows what each station's action COSTS keep more boats alive than the fixed-priority captain of round 1?

**THE TASK (`brain/stationsTask.mjs`, to be built).** The needs-task vessel (`brain/needsTask.mjs` model), a battery hull with a 60 m crush depth, 600 s, `physics/mechanics/subNeeds.mjs` stepNeeds with the leak as its extra weight. Per seed, drawn from a seeded generator:
* the start and mission depth uniform in 15 to 40 m; the heading uniform; the speed 2 m/s;
* the charge uniform in 0.15 to 0.45 of capacity;
* a leak of 3 to 8 percent of the weight, starting at a time uniform in 5 to 60 s and building over 5 s, for the rest of the dive (a breach: nothing mends it).

**THE OUTCOME.** A dive SURVIVES iff the boat is not crushed (nor otherwise lost) in 600 s. Reported beside it, not in the verdict: whether the boat reached the surface band (shallower than 3 m) at any time, the time of a crush, the charge at the end, and whether the weight was dropped.

**THE CREWS.** All have the same helm (the PD autopilot behind the surfacing wrapper, `helmOf`).
* NONE: the helm alone.
* ENERGY: the energy station alone.
* DAMAGE: damage control alone.
* FIXED: both, under round 1's fixed-priority captain.
* TRIAGE: both, under a captain that knows the stations' costs (below).

**TRIAGE, AS FAR AS IT IS FIXED NOW.** A captain over the SAME two stations. What it may change is limited to the CAPTAIN's choices about the stations' actions, each with a stated cost:
* (T1) it caps damage control's rescue thrust by the charge left (thrust spends charge, which the boat needs to reach the surface);
* (T2) it may drop the weight earlier when the charge is low (the drop weight costs no charge, but it is one-way);
* (T3) it may let the energy station's surface claim be flown WITHOUT the surfacing wrapper's bottle rationing while the boat is sinking past its target (the bottle is spent to stop a sinking, not saved for the surface).

Its constants (the thrust cap's curve, the charge under which the weight goes early, and the sink rate that lifts the rationing) are chosen on DEV only, from at most 12 variants, each flown once on all 48 DEV seeds. **TRIAGE is then frozen in REGISTRATION B, written and committed before any HELD seed is flown.** Any of T1 to T3 that does not help on DEV may be left out, and B says which.

**THE SETS.** DEV: seeds 160001 to 160048. HELD: seeds 161001 to 161096. No file in the tree uses a seed from 160000 to 161999 for the submarine task (grep, 2026-11-19: the only matches are timings and a ray count). If DEV shows NONE and FIXED both surviving at least 95 percent, or both at most 5 percent, of DEV, the ranges above are amended on DEV and the amendment written into B before HELD.

**THE VERDICT (HELD, flown once).**
* **TRIAGE BEATS FIXED** iff TRIAGE survives more HELD dives than FIXED, AND the exact one-sided sign test on the discordant pairs (the dives where exactly one of the two survives) gives p at most 0.05.
* **FIXED BEATS TRIAGE** by the same rule the other way.
* **Otherwise: NO DIFFERENCE SHOWN**, with the counts.
* Reported: the survival count of every crew, the discordant pairs, reaching the surface, and the charge at the end among dives both survive. Also whether round 1's single-dive finding (energy alone crushed sooner than none) holds as a rate: ENERGY's survival against NONE's, by the same sign test, reported and not in the verdict.

**EXPECTATION, recorded now.** TRIAGE BEATS FIXED about 55 percent; NO DIFFERENCE about 40 percent (FIXED may already survive most dives, the charge mattering only for reaching the surface); FIXED BEATS TRIAGE about 5 percent.

## 8. ROUND 2, REGISTRATION B (2026-11-19, written and committed after DEV and before any HELD seed is flown)

**The ranges stand.** On DEV, NONE survives 0 of 48 and FIXED 34 of 48, so the amendment clause of registration A is not triggered. The other references on DEV: ENERGY 0, DAMAGE 16.

**AN AMENDMENT, DISCLOSED: a fourth knob, T4, was added after reading the DEV failures.** Registration A limited TRIAGE to T1 to T3. On DEV, all 14 boats FIXED loses have a leak of 6.2 to 8.0 percent of the weight, more than the 6 percent drop weight. Every one ran its battery flat below the surface (13 of 14 never reached it). Most began with too much charge for the energy station to claim the surface (its threshold is 30 percent at depth), so damage control held the mission depth at full thrust until the charge was nearly gone. **T4: once damage control has acted, the boat is BREACHED for the rest of the dive, and the captain claims the surface itself while it still has charge.** This is a captain's choice about a cost, the charge that holding depth against an unending leak spends, so it is in the spirit of A, but A did not name it. The verdict rule, the sets and the outcome are unchanged, and no HELD seed has been flown.

**THE 12 DEV VARIANTS (the most A allowed), each flown once on the 48 DEV seeds:**

| # | knobs | survived (of 48) | survivors' mean charge at 600 s |
|---|---|---|---|
| 1 | all off (must be FIXED) | 34 | 0.448 |
| 2 | T1: thrust <= frac / 0.3, floor 0.2 | 35 | 0.399 |
| 3 | T1: thrust <= frac / 0.5, floor 0 | 35 | 0.382 |
| 4 | T2: drop under 30% charge | 36 | 0.332 |
| 5 | T2: drop under 20% | 35 | 0.371 |
| 6 | T3: no rationing when sinking faster than 0.1 m/s | 34 | 0.454 |
| 7 | T4 | 34 | 0.755 |
| 8 | T4 + T2 (30%) | 38 | 0.921 |
| 9 | T4 + T1 (#2) | 35 | 0.817 |
| 10 | T4 + T2 (30%) + T1 (#2) | 38 | 0.921 |
| **11** | **T4 + T2 at any charge** | **38** | **0.967** |
| 12 | T4 + T2 at any charge + T3 (0.1) | 37 | 0.890 |

**TRIAGE IS FROZEN AS #11** (`brain/stationsTask.mjs` FROZEN_TRIAGE). A set no rule between ties, so it was chosen by survival, then the charge at the end, then the fewer knobs. Once breached, it drops the weight at once and goes up while there is charge. **T1 (the thrust cap Keith named) and T3 are LEFT OUT:** on DEV the thrust cap kept one boat more alone and none more with T4. The thrust stays FIXED's full rescue thrust.

**What DEV says and does not.** 38 against 34 on DEV is the set TRIAGE was chosen on, so it is optimistic by construction. Only HELD answers the question. The 10 DEV boats TRIAGE still loses were not studied further.

**Gates, before HELD:** `brain/stationsTask-selfcheck.mjs` (the task, the verdict, the TRIAGE knobs, the crews; 24 mutants, 21 red and 3 equivalent, logged) and `brain/subStations-selfcheck.mjs` (round 1's, still green with TRIAGE added). Neither flies a HELD seed.

**THE RUN:** every crew on the 96 HELD seeds, once, with `brain/stationsTask.mjs` (a short script writes one line a dive to `brain/stationsHeld.jsonl`). The file is committed unread, then read once with the registered verdict.

## 9. ROUND 2 RESULT (2026-11-19; `brain/stationsHeld.jsonl`, 480 dives, committed unread at `9c94f3301`, then read ONCE)

**VERDICT (registered): TRIAGE BEATS FIXED.** TRIAGE survives 75 of the 96 HELD dives and FIXED 62. Of the 17 dives where exactly one survives, 15 are TRIAGE's and 2 are FIXED's: exact one-sided sign test p = 0.0012, under the registered 0.05.

| crew | survived (of 96) | reached the surface | dropped the weight | mean time of a crush |
|---|---|---|---|---|
| NONE | 0 | 0 | 0 | 156 s |
| ENERGY | 0 | 2 | 0 | 110 s |
| DAMAGE | 28 | 52 | 96 | 384 s |
| FIXED | 62 | 64 | 96 | 319 s |
| **TRIAGE** | **75** | **76** | 96 | 392 s |

**Reported, not in the verdict.**
* **Where both survive (60 dives), TRIAGE ends the dive charged and on the surface: mean charge 0.988, all 60 within 3 m.** FIXED ends at 0.477, with 3 of 60 on the surface. FIXED goes back down to its mission depth once the energy station is satisfied, with the leak still on. TRIAGE's breach latch keeps the boat up.
* **Round 1's single-dive finding holds as a rate.** Energy alone is crushed sooner than no station in 83 of the 96 dives where both are crushed, and later in 8 (sign test p = 4e-17). Neither crew survives any dive. A station written for a sound boat makes a breached one worse.
* **What TRIAGE still loses.** Its 21 losses all have a leak of 6.5 to 8.0 percent of the weight, against the 6 percent drop weight; no survivor has a leak above 7.0 percent. Past the weight's size the boat has only its thrust and its bottle, and the bottle is spent before the surface. That is the next limit, and it is the hull's, not the captain's.
* **Against the expectation in section 7.** TRIAGE BEATS FIXED was put at about 55 percent; it happened.

**What the result says, and does not.**
* **A captain that knows what the stations' actions cost keeps more boats than one that only ranks them.** Every boat it saves over FIXED is saved by the same two moves: drop the weight at once instead of after the blow, and go up while there is charge. Both are free or cheap at the moment and expensive later.
* **The thrust cap, the move Keith named, did not help.** On DEV it kept one boat more alone and none more beside T4, so it was left out; HELD did not test it. Full rescue thrust is not where the charge goes wrong. Holding depth for minutes before anyone decides to go up is.
* **T4 was added after reading the DEV failures (section 8)** and so was tuned on DEV. The HELD result is its first test on dives it was not chosen on, and it holds there.
* This is one task (a leak and a low battery), one vessel and a hand-written captain. It is not a claim about other pairs of problems, nor that a learned captain would do better or worse.

**Status: round 2 CLOSED as registered.** Next, in the order the note proposed: TRIAGE into the Sub Aquarium (the tank runs one event at a time, so a flood and a battery need cannot meet there yet), then navigation and sonar as stations.

## 10. TRIAGE IN THE SUB AQUARIUM (2026-11-19; BUILT)

Keith, 2026-11-19: "putting TRIAGE into the Sub Aquarium (where a flood and a battery problem can't happen together yet)".

**What the tank can now do.** A sub with battery needs can be BREACHED and given a CAPTAIN. Both live on the needs event, so a hull breach and a battery need are on one boat at once.
* `tank.breach(id, leak = 0.07)`: a leak of `leak` of the weight (above 0, at most 0.2), built over 5 s from now, that never mends (`brain/stationsTask.mjs`'s leak). The default is past the 6 % drop weight. Starting or ending an event mends it.
* `tank.setCaptain(id, "fixed" | "triage" | null)`: round 1's FIXED captain, or TRIAGE as frozen in registration B, over the sub's own pilot. A captain replaces the refill trip and the advisor (the advisor and a captain do not share a boat). It works the pump and the repair itself. Its damage control rescues on the tank's room (blow at 2 m past the target, drop at 4: the flood event's RESCUE), not the open sea's 5 and 10.
* The snapshot's `needs` carries `leak` (now) and `captain` ({ kind, con, reason, overrides, watch }).

**The page.** Beside the advisor box: a captain menu (off, fixed, triage) and a breach button (7 %), both enabled only on a sub with needs. The list line says who has the con, in words ("CAPTAIN triage: breach (going up while there is charge)"), "damage control acting" while it overrides, and "BREACHED (leak 7.0%)". Checked in headless Chromium: no page error, and the line reads as above on a breached TRIAGE boat.

**In the tank, one starting state, breached at 7 %** (pinned in the gate, section 4): no captain loses the boat in 25 s; FIXED keeps it 300 s near its depth (31.7 to 29.3 m); TRIAGE keeps it 300 s and climbs (31.7 to 16.0 m) with the con as "breach". One boat, one state, not a rate: the rate is section 9's.

**Gate:** `render/subAquariumCaptain-selfcheck.mjs` (27 mutants, every one red; the log is in its header). The aquarium's other gates (`subAquariumSim`, `subAquariumEvents`, `subAquariumPage`, `advisorTrace`) are green with it.

## 11. NAVIGATION AND SONAR AS STATIONS (2026-11-19; BUILT)

Keith, 2026-11-19: "then navigation and sonar as stations".

**NAVIGATION** (`navigationStation(nav, { clock, dt, fleet, avoidFleet })`). The Sub Aquarium's navigator (`brain/subTankNav.mjs`: a goal through islands, icebergs and ships) is a target station at the navigation priority (10). It is asked every tick whoever has the con, so its counters and plan follow the boat's real position.
* **Alone it IS the tank's courier, bit for bit:** every command of 240 s identical, with the same counters (3 arrivals, 0 hits).
* **Under a higher claim held for a whole minute** it is still stepped every tick, and its travel follows the boat.

**SONAR AND WEAPONS** (`sonarStation()`, `duelSide({ tactics, helm, more })`). The duel's tactician (`brain/subDuel.mjs`: at each look it is handed the passive contacts, its echoes and the pings it heard; it fires, pings and picks a target) is the sonar station's brain. The duel keeps the look and acts on fire and ping. The station holds the target the duel hands the helm and claims it at the sonar priority (30: above navigation, below energy and damage control). `duelSide` puts a captain behind it with any other stations.
* **Alone it IS the duel's side, bit for bit:** three whole training duels are identical record for record (the fingerprint, every event).
* **The gate found a bug before any mutant ran.** The sonar station handed out the target it holds rather than a copy. It is a copy now.

**THE FIRST SONAR CONFLICT** (the duel's 24 TRAINING duels; its audit set is marked unread). One side at 12 % of its battery. The energy station reads the charge the duel hands the tactician at each look. This is pinned in the gate, not a rate.

| crew | won / lost / drawn | mean score | ran flat |
|---|---|---|---|
| sonar alone | 15 / 2 / 7 | 0.999 | 11 of 24 |
| sonar + energy, fixed ranking | 7 / 0 / 17 | 0.544 | 0 |

* **The fixed ranking puts energy above sonar, so a low boat breaks off the fight to go up for charge.** It loses no more duels (0 against 2), but it wins 8 fewer and scores 0.45 less a duel.
* **A correction to what I first said:** I told Keith a 4-minute duel "never empties even a 12% battery". It does: 11 of 24 boats ran flat. Running flat cost them nothing the duel counts; breaking off cost wins.
* **The same lesson as round 2, between other stations:** a captain that only ranks the stations pays for an action without asking what it costs. When the cost of the energy claim (the fight) is larger than the cost it prevents (running flat in a fight that ends in 4 minutes), the ranking is wrong. In section 4 it was the other way round, and the ranking was too slow to act.

**Gate:** `brain/subStationsNavSonar-selfcheck.mjs` (14 mutants, every one red; the log is in its header). Round 1's, round 2's and the aquarium captain's gates are green beside it.

**NEXT (proposed, NOT registered): round 3, a captain that weighs sonar against energy.** In the duel with needs: does a captain that lets the energy claim through only when the charge will not last the fight (a CHARGE-AT-RISK rule: the charge left against the draw at the current speed for the time left) keep the wins of sonar alone without being run flat? Registered first, with fresh duel seeds; the duel's own sets are used by other rounds. Then navigation against energy in the aquarium (a courier with a battery: does it reach more goals with a captain that times its charging between legs?).

## 12. ROUND 3, REGISTRATION (2026-11-19, written and committed before any code for it and before any duel of its sets is flown)

Keith, 2026-11-19: "round 3, a captain that lets the energy claim override sonar only when the charge won't last the fight, tested on fresh duel seeds."

**THE QUESTION.** In a duel on a low battery, does a captain that lets the energy station's surface claim outrank sonar ONLY when the charge will not last the fight keep sonar's fight, and beat the fixed ranking?

**THE TASK (`brain/duelStationsTask.mjs`, to be built).** `brain/subDuel.mjs`'s duel, unchanged: 240 s, side A against the scripted drone of the scenario's kind, both boats on battery needs (the duel's `needs` option). Side A's tactician is `subTactics.makeTactician(THETA_DEFAULT)` behind `subStations.duelSide`, with the helm `helmOf(autopilot)`. Per duel, the battery is a fraction of capacity drawn from the seed, uniform in 0.05 to 0.30 (the same for both boats). The energy station reads the charge the duel hands the tactician at each look (`obs.self.charge`, a fraction of the start, times the start).

**THE CREWS.**
* SONAR: the sonar station alone (round 1's duel side).
* FIXED: sonar and the energy station under the fixed ranking (energy 50 outranks sonar 30).
* RISK: sonar and the energy station, with energy's surface claim passed through ONLY WHEN THE CHARGE IS AT RISK. Its pump and repair asks always pass.

**RISK, FIXED NOW (no tuning on any set).** At each tick the captain knows the fight's length (240 s: an assumption, said plainly; a real boat would not), the time t of the last look, the charge c then (a fraction of capacity) and the start c0. The rate is r = (c0 - c) / t. **The charge is AT RISK iff t is at least 10 s and c - r x (240 - t) is under 0.02**: at the rate spent so far, the battery would be flat before the fight ends. Before 10 s nothing is at risk (the rate is not known). The energy station must ALSO claim (its own rule: under its threshold at the depth) for the surface to be flown.

**THE SETS.** DEV: seeds 171001 to 171006, crossed with the four drone kinds (24 duels), to check that the task is not degenerate. If SONAR and FIXED score the same on every DEV duel (the energy station never claims), the battery range is amended on DEV and the amendment written before HELD; nothing about RISK changes. HELD: seeds 173001 to 173024 x 4 kinds (96 duels). No file in the tree uses a duel seed from 171000 to 173999 (grep, 2026-11-19).

**THE VERDICT (HELD, flown once).** The score is the duel's own score for side A.
* **(V1) RISK BEATS FIXED** iff RISK's mean score is above FIXED's AND the exact one-sided sign test over the duels where the two scores differ gives p at most 0.05. FIXED BEATS RISK by the same rule the other way. Otherwise NO DIFFERENCE SHOWN.
* **(V2) RISK KEEPS SONAR'S FIGHT** iff RISK's mean score is at least SONAR's less 0.05.
* **THE BOTTOM LINE.** V1 RISK BEATS FIXED and V2 kept: "a captain that weighs the charge against the fight keeps the fight and beats the ranking". V1 without V2: "better than the ranking, still short of sonar alone". V2 without V1: "no worse than sonar alone, and not shown better than the ranking". Neither: reported as it is.
* **Reported, not in the verdict:** won / lost / drawn for each crew; the duels in which side A ran flat; the ticks the energy station held the con; and whether RISK runs flat in fewer duels than SONAR.

**EXPECTATION, recorded now.** Round 1's measurement (24 training duels at 12 %: running flat cost nothing the score counts) says the energy claim rarely pays inside one fight. So: V2 kept about 80 percent; V1 RISK BEATS FIXED about 70 percent. RISK will run flat in about as many duels as SONAR. It lets the claim through only when the boat would go flat before the end, and going up mid-fight then costs it the fight, which the score counts.

**BUILT AND GATED BEFORE HELD (2026-11-19).** `brain/duelStationsTask.mjs`, `subStations.gatedStation`, and the gate `brain/duelStationsTask-selfcheck.mjs` (21 mutants, every one red; the log is in its header). **DEV (24 duels) is not degenerate**, so the battery range stands: SONAR and FIXED differ on every DEV duel. **Nothing was tuned on DEV;** RISK is as registered. For the record, the DEV numbers, seen before HELD: SONAR mean 1.409 (W/L/D 20/2/2, 5 ran flat); FIXED 0.864 (11/0/13, 0 flat); RISK 1.519 (20/0/4, 0 flat). The run: every crew on the 96 HELD duels once, one line a duel to `brain/duelStationsHeld.jsonl`, committed unread, then read once.

## 13. ROUND 3 RESULT (2026-11-19; `brain/duelStationsHeld.jsonl`, 288 duels, committed unread at `d14bbf970`, then read ONCE)

**BOTTOM LINE (registered): a captain that weighs the charge against the fight keeps the fight and beats the ranking.**
* **V1: RISK BEATS FIXED.** RISK scores higher in 54 of the 96 HELD duels and lower in 11 (sign test p = 3e-8). Mean 1.098 against 0.566.
* **V2: RISK KEEPS SONAR'S FIGHT.** Mean 1.098 against SONAR's 1.069, above the line (SONAR less 0.05).

| crew | mean score | won / lost / drawn | ran flat | duels in which energy had the con |
|---|---|---|---|---|
| SONAR | 1.069 | 65 / 10 / 21 | 21 | 0 |
| FIXED | 0.566 | 31 / 1 / 64 | 0 | 96 |
| **RISK** | **1.098** | 62 / **5** / 29 | **4** | 46 |

**Reported, not in the verdict.**
* **RISK runs flat in far fewer duels than SONAR:** 4 against 21. Every duel in which RISK ran flat SONAR did too, and SONAR alone ran flat in 17 more (sign test p < 1e-4). It also loses half as many duels (5 against 10). SONAR wins 3 more (65 against 62).
* **Duel by duel, RISK and SONAR are the same in 71 of 96.** RISK is lower in 18 and higher in 7: not shown better or worse (p 0.99 for "higher"). The means differ by 0.03.
* **By drone kind (mean score, SONAR / FIXED / RISK):** patrol 1.47 / 1.10 / 1.40; quiet 1.06 / 0.06 / 0.97; evader 1.31 / 0.86 / 1.31; **hunter 0.44 / 0.25 / 0.72**. Against the hunter, the drone that comes after the boat, keeping the charge to go up only when the fight would outlast it is worth the most.
* **FIXED gave energy the con in all 96 duels** and drew 64 of them: the boat went up and the fight timed out.
* **Against the expectation in section 12.** V1 (put at about 70 percent) and V2 (about 80 percent) both happened. **I was wrong about running flat:** I wrote that RISK would run flat in about as many duels as SONAR. It ran flat in a fifth as many.

**What it says, and does not.**
* **The cost-aware rule beats the rank again, on a different pair of stations.** In round 2 the ranking acted too late (damage control holding depth while the battery died); here it acts too early (energy breaking off a fight the battery would have lasted). In both, the better captain asks what an action costs before letting it outrank another.
* **RISK knows the fight's length (240 s)**, which a real boat would not; section 12 said so before the run. A captain that has to guess it is the next honest version, if this line goes further.
* One duel model, one tactician, one drone per kind, a battery of 5 to 30 percent.

## 14. ROUND 4, REGISTRATION (2026-11-19, written and committed before any code for it and before any run of its sets)

Keith, 2026-11-19: "a navigating courier with a battery, to see whether timing its charging between legs reaches more goals."

**THE QUESTION.** A courier in the Sub Aquarium's sea (islands, icebergs, ships) carries a battery that only the surface refills. Does a captain that charges BETWEEN LEGS, at a goal and only when the next leg needs it, reach more goals than one that goes up wherever the energy rule says?

**THE TASK (`brain/courierTask.mjs`, to be built).**
* The sea is `brain/subTankNav.mjs` tankScene(seed), and the navigator createNavigator(scene, { arm: "any+predict", seed }). The boat starts at (20, 150) at 20 m and 2 m/s.
* The vessel is the needs-task's (`brain/needsTask.mjs` model): a battery hull, a 60 m crush depth, `subNeeds.stepNeeds`. The run lasts 1,200 s, and the battery starts at a fraction of capacity drawn from the seed, U(0.15, 0.45).
* **The navigator supplies the MISSION every tick** (it is stepped every tick whoever has the con, so its goals and counters follow the boat). The crews' stations claim against that mission, under `subStations.captain` with the helm `helmOf(autopilot)`.
* One fact, measured before this registration on scene 5 (not in either set): over 300 s a full-battery courier travelled 868 m, reached 2 goals and used 0.84 of its battery, about 0.001 of capacity per metre. A battery lasts about 6 minutes of travel, and a full charge takes about 7.

**THE CREWS.**
* NAV: no station; the navigator alone. It runs flat and stops.
* FIXED: the energy station (round 1's), by rank. It goes up wherever its rule says (under 30 % of charge at depth) and charges until the rule lets go (about 57 % near the surface).
* LEGS: a captain that times the charging, with constants FIXED NOW (none tuned on any set):
  * **AT EACH ARRIVAL** (and at the start), it estimates the next leg's need. That is the charge spent per metre travelled so far (0.001 before 50 m of travel) x the straight distance to the new goal x 1.5, plus 0.05. **If the charge is under that need, it CHARGES THERE:** it claims the surface (the energy station's surfaceTarget) until the charge reaches the need plus 0.2, capped at 0.95. Otherwise it goes on.
  * **MID-LEG** it claims the surface only in an EMERGENCY, a charge under 0.10. It then charges as above, to 0.10 plus the leg's need plus 0.2 (capped at 0.95).
  * The pump and repair asks of the energy station pass as in FIXED.

**THE OUTCOME.** The goals reached (the navigator's arrivals) in 1,200 s. Reported beside it: whether the boat was lost (crushed or grounded), the seconds it spent with an empty battery, the hits, and the time spent charging.

**THE SETS.** DEV: seeds 175001 to 175024, to check that the task is not degenerate. If NAV, FIXED and LEGS reach the same number of goals on 20 or more of the 24, the duration or the battery range is amended on DEV and the amendment written before HELD; LEGS's constants do not change. HELD: seeds 177001 to 177096. No file in the tree uses a seed from 175000 to 177999 for the submarine or tank tasks (grep, 2026-11-19: the only matches are unrelated ids).

**THE VERDICT (HELD, flown once).**
* **LEGS BEATS FIXED** iff LEGS's mean goals are above FIXED's AND the exact one-sided sign test over the runs where their goal counts differ gives p at most 0.05. FIXED BEATS LEGS by the same rule the other way. Otherwise NO DIFFERENCE SHOWN.
* Reported, not in the verdict: each crew's mean goals and goal counts; both against NAV; boats lost; empty-battery seconds; charging time; hits.

**EXPECTATION, recorded now.** LEGS BEATS FIXED about 50 percent; NO DIFFERENCE about 40 percent (both charge about as often; where they charge may not matter much when a goal is about 150 s apart and a charge takes minutes); FIXED BEATS LEGS about 10 percent (LEGS's estimate of a leg is a straight line; the navigator's route around an island is longer, and LEGS may set out short).

**BUILT AND GATED BEFORE HELD (2026-11-19).** `brain/courierTask.mjs` and its gate `brain/courierTask-selfcheck.mjs` (23 mutants, every one red; the log is in its header). **DEV (24 runs) is not degenerate:** the three crews never tie on all 24. **Nothing was tuned on DEV.** For the record, the DEV numbers, seen before HELD: NAV 0.88 goals (15 boats lost: a flat courier cannot hold its depth); FIXED 3.63 goals (0 lost, 18 s empty, 643 s charging); LEGS 3.67 goals (1 lost, 163 s empty, 588 s charging). LEGS's empty seconds are the risk section 14 named: its leg estimate is a straight line, and the route around an island is longer. The run: every crew on the 96 HELD seeds once, in four processes, one line a run to `brain/courierHeld.<part>.jsonl`, committed unread, then read once.

## 15. ROUND 4 RESULT (2026-11-19; `brain/courierHeld.{0,1,2,3}.jsonl`, 288 runs, committed unread at `b62ed9456`, then read ONCE)

**VERDICT (registered): LEGS BEATS FIXED.** LEGS reaches 3.69 goals a run against FIXED's 3.36. It reaches more on 45 of the 96 HELD runs and fewer on 22 (sign test p = 0.0034).

| crew | mean goals | goals (runs) | boats lost | runs with an empty battery | mean empty s | mean charging s | hits |
|---|---|---|---|---|---|---|---|
| NAV | 0.93 | 0: 21, 1: 61, 2: 14 | **69** | 96 | 656 | 1 | 53 |
| FIXED | 3.36 | 2: 5, 3: 57, 4: 28, 5: 6 | 0 | 43 | 14 | 643 | 207 |
| **LEGS** | **3.69** | 0: 1, 1: 1, 2: 11, 3: 29, 4: 30, **5: 20, 6: 4** | 0 | 65 | 161 | 588 | 167 |

**Reported, not in the verdict.**
* **LEGS has the wider spread.** It reaches 5 or 6 goals in 24 runs against FIXED's 6, but only 0 to 2 in 13 against FIXED's 5. **In 21 of the 22 runs where LEGS reaches fewer, its battery ran empty.** That is the risk section 14 named: LEGS plans a leg as a straight line, and the route around an island is longer, so it sets out short and stalls. No LEGS boat was lost.
* **LEGS charges less and hits less:** 588 s charging against 643, and 167 hits against 207. Its charging stops are at goals, in open water. FIXED goes up wherever the rule fires, sometimes among obstacles.
* **NAV, which never charges, loses 69 of 96 boats:** a flat courier cannot hold its depth.
* **Against the expectation in section 14:** LEGS BEATS FIXED was put at about 50 percent. It happened. "FIXED BEATS LEGS" was put at 10 percent, for the straight-line risk. That risk is real (the 22 runs), but it does not outweigh the gain.

**What it says, and does not.**
* **Charging between legs, when the next leg needs it, reaches more goals than charging wherever the rule fires.** That is the fourth pair of stations on which a captain that asks what an action costs (here, where and when a charging stop costs least) beats the fixed ranking.
* **The obvious next step is named by the losses:** LEGS's leg estimate should be the navigator's planned route, not the straight line. That is a new registration, not a change to this one.
* One sea generator, one navigator arm, one vessel, a battery of 15 to 45 percent, 20 minutes.

**Status: rounds 3 and 4 CLOSED as registered.**

## 16. ROUND 5, REGISTRATION (2026-11-19, written and committed before any code for it beyond one read-only method, and before any run of its sets)

Keith, 2026-11-19: "Let's do both proposed rounds" (LEGS with the navigator's planned route; RISK without the fight's length).

**THE QUESTION.** Round 4's LEGS lost goals in 22 runs, 21 of them with an empty battery, because it estimated a leg as a straight line. Does LEGS with the navigator's PLANNED ROUTE as the leg's length reach more goals than LEGS?

**WHAT WAS ADDED AND MEASURED FIRST, said plainly.**
* `subTankNav.createNavigator` gained one READ-ONLY method, `routeLength(x, y)`: the planned field's distance from that cell to the goal, or null. It changes nothing the navigator does. Its gates and the aquarium's are green with it.
* To learn the units, it was read beside the straight line at each new goal on scenes 5, 9 and 13 (neither in round 4's sets nor in this round's). It is in metres, 1.15 to 1.7 times the straight line (420 against 282, 220 against 152, 405 against 285 ...).

**THE TASK.** Round 4's, unchanged (`brain/courierTask.mjs`): the sea, the navigator, the vessel, the 1,200 s, the start, and the battery U(0.15, 0.45) per seed.

**THE CREWS.** FIXED and LEGS as in round 4. **ROUTE: LEGS with one change.** The leg's distance is `routeLength` at the boat's position at the decision (straight line where it is null: no plan yet, or no route). Every constant of LEGS stands as registered in section 14.

**THE SETS.** DEV: seeds 181001 to 181024, only to check that ROUTE and LEGS differ on at least 4 of them; if not, the battery range is amended on DEV, and nothing of ROUTE. HELD: seeds 183001 to 183096. No file in the tree uses a seed from 181000 to 183999 (grep, 2026-11-19).

**THE VERDICT (HELD, flown once).** **ROUTE BEATS LEGS** iff ROUTE's mean goals are above LEGS's AND the exact one-sided sign test over the runs where their goal counts differ gives p at most 0.05. LEGS BEATS ROUTE by the same rule the other way. Otherwise NO DIFFERENCE SHOWN. Reported: both against FIXED, by the same test; the runs with an empty battery; the empty seconds; the charging seconds; the boats lost.

**EXPECTATION, recorded now.** ROUTE BEATS LEGS about 45 percent; NO DIFFERENCE about 45 percent. The route is longer, so ROUTE charges more often and for longer, which costs time, and the gain is only in the runs where LEGS set out short. LEGS BEATS ROUTE about 10 percent.

## 17. ROUND 6, REGISTRATION (2026-11-19, written and committed before any code for it and before any duel of its sets is flown)

**THE QUESTION.** Round 3's RISK was told the fight lasts 240 s, which a real boat would not know. Does a captain that does NOT know the fight's length, and asks only whether the charge will last a fixed look-ahead, still beat the fixed ranking and keep sonar's fight?

**THE TASK.** Round 3's, unchanged (`brain/duelStationsTask.mjs`): the duel, the tactician, the drones, and the battery U(0.05, 0.30) per seed.

**THE CREWS.** SONAR, FIXED and RISK as in round 3, plus **BLIND: RISK's rule with the fight's time left replaced by a fixed look-ahead of 60 s.** At risk iff t is at least 10 s and c - r x 60 is under 0.02, with r = (c0 - c) / t as before. It is the same rule with nothing about the fight in it. 60 s is about the time a boat at depth needs to reach the surface and start charging; it is fixed now, not tuned.

**THE SETS.** DEV: seeds 185001 to 185006 x the four kinds (24), only to check that BLIND and FIXED differ on at least 4; if not, the battery range is amended on DEV, and nothing of BLIND. HELD: seeds 187001 to 187024 x the four kinds (96). No file in the tree uses a seed from 185000 to 187999 (grep, 2026-11-19).

**THE VERDICT (HELD, flown once), round 3's rules with BLIND in RISK's place.**
* **(V1) BLIND BEATS FIXED** by the sign test on the duels where their scores differ (p at most 0.05).
* **(V2) BLIND KEEPS SONAR'S FIGHT** iff its mean score is at least SONAR's less 0.05.
* **The bottom line** is round 3's sentences with BLIND for RISK.
* **Reported:** BLIND against RISK by the same sign test (what knowing the fight's length was worth); won, lost and drawn; ran flat; the ticks energy had the con.

**EXPECTATION, recorded now.** A 60 s look-ahead fires LATER than "the rest of the fight" early in a duel (240 - t is larger than 60), and the same near the end. So BLIND lets the energy claim through less often than RISK and runs flat more, close to SONAR. V2 kept about 85 percent; V1 BLIND BEATS FIXED about 75 percent; BLIND against RISK no difference shown about 60 percent.

**ROUNDS 5 AND 6, BUILT AND GATED BEFORE HELD (2026-11-19).**
* ROUTE is one option of the legs station (`route: true`, using `routeLength` where there is a plan). BLIND is RISK's rule with the fight's end at the last look plus 60 s.
* Both are gated in the round 3 and 4 gates (11 more mutants, every one red; the logs are in their headers).
* **DEV is not degenerate in either.** Round 5: ROUTE and LEGS differ on 12 of 24 DEV runs; mean goals LEGS 4.00, ROUTE 3.92; runs with an empty battery LEGS 13, ROUTE 5. Round 6: BLIND and FIXED differ on 14 of 24 DEV duels; mean score FIXED 0.550, BLIND 0.933; BLIND ran flat in 2.
* **Nothing was tuned.** HELD: round 5 flies FIXED, LEGS and ROUTE on the 96 seeds (`brain/routeHeld.<part>.jsonl`, four processes); round 6 flies SONAR, FIXED, RISK and BLIND on the 96 duels (`brain/blindHeld.jsonl`). Each is committed unread, then read once.

## 18. ROUND 6 RESULT (2026-11-19; `brain/blindHeld.jsonl`, 384 duels, committed unread at `b92c59fe7`, then read ONCE)

**BOTTOM LINE (registered, BLIND in RISK's place): a captain that weighs the charge against the fight keeps the fight and beats the ranking, WITHOUT KNOWING HOW LONG THE FIGHT IS.**
* **V1: BLIND BEATS FIXED.** Higher in 54 of the 96 HELD duels, lower in 14 (sign test p = 6e-7).
* **V2: BLIND KEEPS SONAR'S FIGHT.** Mean 1.383 against SONAR's 1.418, inside the 0.05 line.

| crew | mean score | won / lost / drawn | ran flat | duels in which energy had the con |
|---|---|---|---|---|
| SONAR | 1.418 | 75 / 1 / 20 | 15 | 0 |
| FIXED | 0.828 | 43 / 1 / 52 | 0 | 96 |
| RISK (knows 240 s) | 1.395 | 73 / 0 / 23 | 0 | 27 |
| **BLIND (60 s look-ahead)** | **1.383** | 73 / 1 / 22 | **1** | 23 |

**Reported, not in the verdict.**
* **Knowing the fight's length was worth almost nothing:** BLIND and RISK score the same in 85 of 96 duels. BLIND is higher in 7 and lower in 4: no difference shown (p 0.27 one way, 0.89 the other).
* **Round 3 replicates on these fresh duels:** RISK BEATS FIXED and KEEPS SONAR'S FIGHT again.
* **Against the expectation in section 17.** V1 (put at about 75 percent), V2 (about 85) and "BLIND against RISK, no difference" (about 60) all happened. **I was wrong about running flat:** I wrote that BLIND would run flat more, close to SONAR. It ran flat once, against SONAR's 15. A 60 s look-ahead fires late early in a fight, but early enough: the battery that would go flat within a minute is the one that matters.

**What it says.** The charge-at-risk rule does not need the fight's length, which a real boat would not know. A fixed one-minute look-ahead does as well. Round 3's caveat is answered.

## 19. ROUND 5 RESULT (2026-11-19; `brain/routeHeld.{0,1,2,3}.jsonl`, 288 runs, committed unread at `2cdfb9491`, then read ONCE)

**VERDICT (registered): ROUTE BEATS LEGS.** ROUTE reaches 4.02 goals a run against LEGS's 3.66. It reaches more on 38 of the 96 HELD runs and fewer on 18 (sign test p = 0.005).

| crew | mean goals | goals (runs) | runs with an empty battery | mean empty s | mean charging s | hits | lost |
|---|---|---|---|---|---|---|---|
| FIXED | 3.22 | 2: 7, 3: 64, 4: 22, 5: 3 | 43 | 12 | 643 | 180 | 0 |
| LEGS | 3.66 | 1: 3, 2: 12, 3: 26, 4: 31, 5: 22, 6: 2 | 66 | 163 | 589 | 162 | 0 |
| **ROUTE** | **4.02** | 1: 1, 2: 9, 3: 10, **4: 47, 5: 25, 6: 4** | **32** | **60** | 665 | 152 | 0 |

**Reported, not in the verdict.**
* **The straight-line failure is mostly fixed:** ROUTE runs empty in 32 runs against LEGS's 66, for 60 s on average against 163. It charges a little longer (665 s against 589), as the route is longer than the line. That time is repaid.
* **Both against FIXED:** ROUTE BEATS FIXED, 63 runs more and 11 fewer (p = 3e-10). LEGS BEATS FIXED again, 51 to 21 (p = 3e-4): **round 4 replicates on these fresh seeds.**
* ROUTE also hits the least (152 against 162 and 180).
* **Against the expectation in section 16:** ROUTE BEATS LEGS was put at about 45 percent; it happened. I thought the longer charging might eat the gain. It ate a small part of it.

**What it says.** A courier that times its charging by the leg it is about to fly, measured as the route it will fly, reaches the most goals of any crew. The fix was the one the round-4 losses named.

**Status: rounds 5 and 6 CLOSED as registered.** Across six rounds and four pairs of stations (damage and energy, sonar and energy, navigation and energy, twice each for the last two), every captain that weighs what an action costs has beaten the fixed ranking on HELD. The two refinements the losses named (the route, no fight clock) held up on fresh seeds.

## 20. ROUND 7, REGISTRATION (2026-11-20, written and committed before any code for it and before any run of its sets)

Keith, 2026-11-20: "Let's do all 4 items on 'Next rounds on the stations line:' items, in the order you suggest." The first: one captain over all stations, on combined emergencies.

**THE QUESTION.** Each cost-aware rule beat the fixed ranking on its own pair of stations. On a boat with three of its problems at once, do the winners still win when put together, or do they interfere? The boat is a courier with a battery that is breached mid-run: navigation, energy and damage control.

**THE TASK (`brain/breachCourierTask.mjs`, to be built).** Round 4's courier, unchanged: the sea, the navigator (which supplies the mission every tick), the vessel, the start, the battery U(0.15, 0.45) and 1,200 s. **Plus a breach drawn from the seed:** a leak of U(0.03, 0.08) of the weight, starting at U(60, 600) s, built over 5 s, never mended (round 2's leak). Damage control rescues at the open sea's depths (5 m and 10 m past the target, `emergencyPilot` defaults), as in round 2.

**THE CREWS** (the navigator's mission; the helm `helmOf(autopilot)`).
* FIXED: the energy and damage stations by rank.
* ROUTE+DC: round 5's ROUTE (the legs station with the planned route; the energy station gated shut), plus the damage station.
* TRIAGE: round 2's frozen TRIAGE captain (`FROZEN_TRIAGE`: once breached, drop the weight at once and go up while there is charge).
* **COMBINED: the naive union.** The TRIAGE captain with ROUTE's legs station added and its energy station gated shut, as in ROUTE. The legs station decides charging until the breach. After it, TRIAGE's latch claims the surface for the rest of the run. Nothing is tuned and nothing is added; this is the two winners put on one boat as they were written.
* **NOT TESTED, said now:** BLIND (sonar against energy). The duel has no leak model, so sonar does not meet damage control anywhere in this tree.

**THE OUTCOMES.** SURVIVED (not lost in 1,200 s) and GOALS (the navigator's arrivals). Reported beside them: the time of a loss, the empty-battery seconds, the time on the surface after the breach, and the weight dropped.

**THE SETS.** DEV: seeds 189001 to 189024, only to check that the four crews differ. If COMBINED and FIXED are the same on more than 20 of 24 in both outcomes, the leak range is amended on DEV before HELD; nothing of a crew changes. HELD: seeds 191001 to 191096. No file in the tree uses a seed from 189000 to 191999 (grep, 2026-11-20).

**THE VERDICT (HELD, flown once).** The tests are exact one-sided sign tests over the runs where the two differ, at p at most 0.05.
* **(V1) Against the ranking:** COMBINED BEATS FIXED ON SURVIVAL, and separately ON GOALS, each by the test.
* **(V2) THE QUESTION:** **COMBINED COMBINES** iff it is not shown worse than TRIAGE on SURVIVAL AND not shown worse than ROUTE+DC on GOALS. Otherwise **COMBINED INTERFERES**, naming which parent's gain it loses.
* Reported: every crew on both outcomes, and each pair by the same test.

**EXPECTATION, recorded now.** TRIAGE's latch keeps a breached courier on the surface for the rest of the run, so it delivers nothing after the breach. So: COMBINED INTERFERES ON GOALS about 65 percent; COMBINES about 30 percent (if the breach comes late, or the boat that stays deep is lost anyway). COMBINED beats FIXED on survival about 70 percent, and on goals about 40 percent.

**BUILT AND GATED BEFORE HELD (2026-11-20).**
* `brain/breachCourierTask.mjs`, and `triageCaptain`'s two options (`more`, `energyAllow`; inert at their defaults, compared over a whole breached dive). The gate `brain/breachCourierTask-selfcheck.mjs` (16 mutants, every one red; the log is in its header).
* **DEV (24) is not degenerate:** COMBINED and FIXED match on both outcomes in only 9. **Nothing was tuned.**
* For the record, the DEV numbers seen before HELD (survived of 24, mean goals): FIXED 16, 1.83; ROUTE+DC 10, 2.21; TRIAGE 18, 1.13; COMBINED 19, 1.42.
* The run: the four crews on the 96 HELD seeds once, in four processes, to `brain/breachCourierHeld.<part>.jsonl`, committed unread, then read once.

## 21. ROUND 8, REGISTRATION (2026-11-20, written and committed before any code for it and before any of its seeds is flown)

The second of the four: **a learned captain against the hand rules.**

**THE QUESTION.** On round 2's task (a breached boat with a low battery), does a captain whose choices are LEARNED keep more boats than TRIAGE, the hand-written rule that beat the ranking (75 of 96)?

**THE TASK.** Round 2's, unchanged (`brain/stationsTask.mjs` scenario and flight: 15 to 40 m, battery 0.15 to 0.45, a leak of 3 to 8 % from 5 to 60 s, 600 s; the outcome is SURVIVED).

**THE LEARNED CAPTAIN (`brain/learnedCaptain.mjs`, to be built).** The same helm and the same damage station as every crew. It makes TRIAGE's two choices itself, from what a captain can sense:
* **The features**, all read by the captain at each tick: the charge (fraction); depth / 60; the vertical speed; (depth - mission depth) / 10; BREACHED (1 once damage control has acted, as TRIAGE's latch); the air left / its capacity; the weight already dropped (0 or 1); and a constant 1.
* **The choices**, each a logistic unit over the eight features (16 weights in all):
  * SURFACE: when it fires, the captain claims `surfaceTarget(mission)` at the energy priority.
  * DROP: when it fires and the weight is still aboard, the commands carry release = 1.
* **Training, fixed now:** a seeded (mu, lambda) evolution strategy. Mu 4, lambda 12, sigma 0.5 halving every 10 generations, 40 generations, the start all zeros (neither choice ever fires). The fitness is the number of TRAIN dives survived plus 0.001 x the seconds lived (a tie-breaker), on 32 TRAIN seeds. The 4 parents of the last generation are flown on the 24 SELECTION seeds, and the best by the same fitness is FROZEN, written to a JSON file and committed before any HELD seed is flown.

**THE SETS.** TRAIN: seeds 193001 to 193032. SELECTION: 193501 to 193524. HELD: 195001 to 195096. No file in the tree uses a seed from 193000 to 195999 (grep, 2026-11-20).

**THE VERDICT (HELD, flown once):** LEARNED BEATS TRIAGE iff LEARNED survives more HELD dives and the exact one-sided sign test on the discordant dives gives p at most 0.05. TRIAGE BEATS LEARNED by the same rule. Otherwise NO DIFFERENCE SHOWN. Reported: FIXED on the same dives (and LEARNED against it), and what the learned weights do (when each choice fires).

**EXPECTATION, recorded now.** TRIAGE's two moves are simple thresholds that a logistic unit can represent: drop at once when breached, and go up when breached. So NO DIFFERENCE about 55 percent; LEARNED BEATS TRIAGE about 20 percent (it can learn to drop BEFORE damage control acts, from the sink rate); TRIAGE BEATS LEARNED about 25 percent (32 training dives may not find the latch).

## 22. ROUND 7 RESULT (2026-11-20; `brain/breachCourierHeld.{0,1,2,3}.jsonl`, 384 runs, committed unread at `d5bc9448b`, then read ONCE)

**VERDICT (registered):**
* **(V1)** COMBINED BEATS FIXED ON SURVIVAL: 34 runs to 9 (p = 9e-5). **FIXED BEATS COMBINED ON GOALS:** 47 runs to 11 (p = 1e-6).
* **(V2) COMBINED INTERFERES: it loses ROUTE's goals.** COMBINED has fewer goals than ROUTE+DC on 60 runs and more on 8 (p = 3e-11). It does not lose TRIAGE's survival. **It BEATS it:** 13 runs to 4 (p = 0.025).

| crew | survived (of 96) | mean goals | goals of the survivors | seconds on the surface after the breach | empty-battery seconds |
|---|---|---|---|---|---|
| FIXED | 49 | 1.57 | 1.96 | 273 | 129 |
| ROUTE+DC | 48 | **1.90** | 2.50 | 253 | 120 |
| TRIAGE | 65 | 0.84 | 0.74 | 517 | 49 |
| **COMBINED** | **74** | 0.91 | 0.88 | 569 | 33 |

**What it says.**
* **The two winners do not add up: they trade.** TRIAGE's latch was written for a boat whose job is to stay alive. On a courier it does exactly that: once breached, the boat goes up and stays up for the rest of the run, and delivers nothing more (569 s on the surface after the breach on average, against ROUTE+DC's 253). So COMBINED keeps the most boats and loses ROUTE's deliveries.
* **On survival, the union is better than either parent** (74 against TRIAGE's 65 and ROUTE+DC's 48). Before the breach, the legs station keeps the battery up (33 empty seconds against TRIAGE's 49), so the boat meets the breach with charge.
* **ROUTE+DC is the best courier but saves no more boats than the ranking** (48 against FIXED's 49; ROUTE beats FIXED on goals again, 33 to 19, p = 0.035).
* **Against the expectation in section 20:** "COMBINED INTERFERES ON GOALS" was put at about 65 percent; it happened. I did not expect COMBINED to beat TRIAGE on survival.
* **What a real combined captain needs, named by the losses:** TRIAGE's latch has to know whether the boat CAN go on. A leak under the drop weight, once the weight is gone, is a boat that can still deliver; a leak over it is not. That is a new rule (a conditional latch), and so a new registration, not a change to this round.
* **NOT TESTED, as section 20 said:** sonar's rule. The duel has no leak.

**Status: round 7 CLOSED as registered.**

## 23. THE ROUTE CAPTAIN IN THE SUB AQUARIUM (2026-11-20; BUILT)

The third of the four.
* `tank.setCaptain(id, "route")` puts round 5's ROUTE captain on a courier with needs: the legs station over the sub's own navigator, with the planned route; the energy station's own claim shut, its pump and repair asks kept; damage control on the tank's room.
* **The navigator is read through a proxy**, so a new sea (startNav replaces it) is followed, and an ended courier reads as no goal (the captain then charges only in an emergency).
* **A sub that is not a courier is refused**, by name. The page says what to do instead ("start a sea and pick a courier arm first").
* The captain menu has "route (courier)". The list line names the legs station's con ("legs (charging for the next leg)").
* **In the tank, scene 7:** a courier on a full battery flies its legs, and from about 230 s the legs station takes the con when a leg needs more than is left; the boat is not lost. That is pinned in the gate; it is one run, not a rate.
* **Said plainly, from round 7:** the route captain does not read a hull breach. On a breached courier the TRIAGE captain keeps more boats and delivers less, and the union of the two interferes.
* Gate: `render/subAquariumCaptain-selfcheck.mjs` section 4b (8 more mutants, every one red). Checked in headless Chromium: the refusal message, no page error.

## 24. ROUND 9, REGISTRATION (2026-11-20, written and committed before any code for it and before any of its seeds is flown)

The fourth of the four: **TRIAGE's remaining losses.**

**A CORRECTION FIRST.** Section 9 said of TRIAGE's 21 losses: "Past the weight's size the boat has only its thrust and its bottle, and the bottle is spent before the surface." **That was a guess, written as a finding, and it is wrong.** A trace of TRIAGE's first DEV loss (round 2's DEV seed 160001: a 7.3 % leak, 36 % charge, crushed at 495 s; DEV, so no test seed is spent) shows:
* the weight dropped at about 45 s;
* the boat then climbing at **0.05 m/s**, from 32 m;
* the battery running down under the climb's thrust (0.36 to 0.02 by 370 s);
* and **the air bottle at 5.53 of 6 the whole time, unused.** The surfacing wrapper's rationing (`brain/surfacePilot.mjs`: no blowing while the boat rises) holds the ballast at 0. The stored air that could blow the main tank, at no cost in charge, is never spent.

All ten of TRIAGE's DEV losses have a leak of 7.0 to 8.0 %, past the 6 % weight.

**THE QUESTION.** Does TRIAGE with one more rule, blowing the main tank with stored air while a breached boat climbs too slowly, keep more boats?

**THE RULE (BLOW), FIXED NOW.** Once BREACHED (damage control has acted) and the weight is gone, while the boat is deeper than 3 m and climbs slower than 0.2 m/s, the commands carry ballast = -1. That blows the main tank with stored air, overriding the surfacing wrapper's rationing. Nothing else of TRIAGE changes. The constants (0.2 m/s, 3 m) are set by reasoning, not tuned: 0.2 m/s brings a boat up from 40 m in about 200 s, and 3 m is the surface band.

**THE TASK.** Round 2's (`brain/stationsTask.mjs`), unchanged.

**THE SETS.** DEV: seeds 196001 to 196024, only to check that BLOW and TRIAGE differ on at least 3 of them; if not, the round says so and stops. HELD: seeds 197001 to 197096. No file in the tree uses a seed from 196000 to 197999 (grep, 2026-11-20).

**THE VERDICT (HELD, flown once).** BLOW BEATS TRIAGE iff BLOW survives more HELD dives and the exact one-sided sign test on the discordant dives gives p at most 0.05. TRIAGE BEATS BLOW by the same rule. Otherwise NO DIFFERENCE SHOWN. Reported: the leak of each loss, the air left at the end, and FIXED on the same dives.

**EXPECTATION, recorded now.** If the trace is typical, most of TRIAGE's losses are this one: BLOW BEATS TRIAGE about 75 percent. NO DIFFERENCE about 20 percent (the main tank's 3 % may not be enough with an 8 % leak once the weight's 6 % is gone, or the bottle may empty on the way). TRIAGE BEATS BLOW about 5 percent.

## 25. ROUND 9: STOPPED AT DEV, AS REGISTERED (2026-11-20)

**The registered check failed, and the round stops there.** On round 9's 24 DEV dives TRIAGE keeps all 24 and BLOW keeps 23: they differ on 1, under the 3 section 24 required. **HELD is not flown.** The 96 HELD seeds stay unread for a later registration.

**What DEV showed, recorded because it was seen** (DEV only, not a result):
* **This DEV draw has almost no hard cases:** TRIAGE loses none of the 24.
* **The one dive where the crews differ is one BLOW LOSES:** seed 196001, a 6.7 % leak at 17 m with 23 % charge. BLOW blew for about 300 s and the boat was crushed at 477 s, where TRIAGE kept it.
* **On round 2's ten DEV losses** (leaks of 7.0 to 8.0 %, all lost by TRIAGE), **BLOW saves 6.** The stored air does reach the hard cases, as the trace suggested.

**So the rule helps where TRIAGE fails, and can hurt where TRIAGE succeeds.** Blowing the tank on a boat that would have made it anyway can cost it. A fair test needs the hard cases in numbers, and a rule that leaves the easy cases alone. Both are a new registration:
* a task drawn to leaks over the drop weight (6 to 8 %);
* and BLOW gated on what the boat could not do without it, such as climbing too slowly to reach the surface before the charge runs out, rather than on a fixed 0.2 m/s.

**Built and kept, off by default:** the BLOW knob of `triageCaptain` (`blowClimb`, `blowAbove`; `TRIAGE_OFF` and `FROZEN_TRIAGE` have it off), `stationsTask`'s BLOW_KNOBS, the BLOW crew and round 9's sets. Gated in `brain/stationsTask-selfcheck.mjs` section 6 (6 mutants, 5 red, 1 equivalent; logged).

## 26. ROUND 8 RESULT (2026-11-20; `brain/learnedCaptain.json` frozen at `89bcbb758` before HELD; `brain/learnedCaptainHeld.jsonl`, 288 dives, committed unread at `902e07bd2`, then read ONCE)

**VERDICT (registered): LEARNED BEATS TRIAGE.** LEARNED survives 88 of the 96 HELD dives against TRIAGE's 75. Of the 19 dives where exactly one survives, 16 are LEARNED's and 3 TRIAGE's (sign test p = 0.002). Against FIXED: 88 against 59 (31 to 2, p = 7e-8).

**AND WHAT IT LEARNED IS NOT A BETTER CAPTAIN: IT LEARNED THE TASK'S HOLE.** Read from the weights, then checked by flying the first 12 HELD dives again (the same dives, re-read; no new seed):
* **It drops the weight at 0.0 s in every dive and claims the surface within 0 to 11 s.** That is before any leak (the leaks start at 10 to 56 s in those 12).
* **The DROP unit fires on the start state itself.** Its constant (0.44) plus the air term (0.38) outweighs the depth term at mission depth. All 96 dives dropped the weight.
* **The SURFACE unit fires once the boat is near its mission depth with a modest charge.** Its largest terms are against charge (-3.56), depth (-3.78) and being below the mission (-2.81): it goes up early, from shallow, while the battery still has something.
* **Why that wins here.** In round 2's task every dive is breached within its first minute, the drop weight costs nothing, and the score counts only survival. So the best policy is to abandon the mission at once and go up light, before the trouble comes. TRIAGE flies its mission until damage control says otherwise. Against a task that scores staying alive and nothing else, giving up the job is the winning move. A learner found it in 40 generations; a hand-written rule would not, because its author knows what the boat is for.

**What it says.**
* **The verdict stands as registered.** LEARNED keeps more boats on this task.
* **But the task cannot tell a good captain from one that abandons the mission,** and that is the finding. It is the first round of the nine in which the learner and the hand rule answered different questions.
* **Against the expectation in section 21:** LEARNED BEATS TRIAGE was put at about 20 percent ("it can learn to drop BEFORE damage control acts, from the sink rate"). It happened, for a different reason: it drops before anything at all.
* **What a fair test needs, named by the result:** a task that scores the mission too (time held at the mission depth, or a courier's goals, as in rounds 4 to 7), and dives that are not all breached (so going up early has a price). Rounds 4 to 7's courier already scores the mission; a learned captain there is the natural next registration. This one is not changed after the fact.

**Status: round 8 CLOSED as registered, with the meaning above.**

## 27. ROUNDS 10 TO 12, REGISTRATIONS (2026-11-20, written and committed before any code for them and before any of their seeds is flown)

Keith, 2026-11-20: "Let's do Proposed next items." The three proposals named by rounds 7, 8 and 9.

### ROUND 10: THE CONDITIONAL BREACH LATCH

**THE QUESTION.** Round 7's COMBINED kept the most boats (74) but lost ROUTE's deliveries, because TRIAGE's latch keeps a breached courier on the surface for the rest of the run. Does a latch that fires only when the boat CANNOT go on keep COMBINED's survival and win back the deliveries?

**THE RULE (COND), FIXED NOW.** COMBINED (round 7: TRIAGE with ROUTE's legs station and its energy claim shut), with the latch made conditional:
* at the first breach (damage control acts), drop the weight at once, as TRIAGE does;
* **latch the surface claim only if damage control acts AGAIN after the weight is gone.** A boat still sinking past its target without its weight has a leak bigger than the weight, and cannot go on. Otherwise the mission (the legs station) flies.
* Nothing else changes.

**THE TASK.** Round 7's breached courier (`brain/breachCourierTask.mjs`), unchanged.

**THE SETS.** DEV: 198001 to 198024, only to check that COND and COMBINED differ on at least 4 (in either outcome). HELD: 199001 to 199096.

**THE VERDICT (HELD, once; exact one-sided sign tests at p at most 0.05).**
* **COND BEATS COMBINED** iff COND has more goals than COMBINED by the test AND is not shown worse on survival.
* Reported: COND against ROUTE+DC on goals and against TRIAGE on survival (whether it keeps both parents' gains, round 7's question), and every crew on both outcomes.

**EXPECTATION.** The leaks run 3 to 8 % against a 6 % weight, so about 60 % of breached boats can go on. COND BEATS COMBINED about 65 percent. COND loses survival against COMBINED about 25 percent (a boat that can just hold depth, and is lost to a second, later sinking).

### ROUND 11: A LEARNED CAPTAIN ON THE BREACHED COURIER

**THE QUESTION.** Round 8's learner beat TRIAGE by abandoning the mission at once, because round 2's task scores only survival. On a task that scores the mission (round 7's breached courier: deliveries and survival), does a learned captain beat the hand rules?

**THE LEARNED CAPTAIN (`brain/learnedCourier.mjs`, to be built).**
* **The crew:** the helm, the damage station, and two logistic units over TEN features: the charge; depth / 60; the vertical speed; (depth - mission depth) / 10; breached; the air left / its capacity; the weight dropped; the next leg's need by its planned route less the charge (round 5's legNeed); a goal reached in the last 5 s (0 or 1); and a constant. That is 20 weights.
* **The units:** SURFACE claims the surface at the energy priority; DROP releases the weight while it is aboard.
* **Training, fixed now:** a seeded (mu, lambda) ES with mu 4, lambda 8, sigma 0.5 halving every 7 generations, 20 generations, from zeros, seed 9009, on 16 TRAIN seeds. The FITNESS is goals + 2 x survived + 0.001 x the seconds lived. The best of the last 4 parents on 16 SELECTION seeds is frozen, written to `brain/learnedCourier.json` and committed before HELD.
* The budget is smaller than round 8's because a courier run costs about 2.5 s; said so.

**THE SETS.** TRAIN: 201001 to 201016. SELECTION: 201501 to 201516. HELD: 205001 to 205096. (202000 to 202999 is in use elsewhere in the tree; 201000 to 201999 and 205000 to 205999 are not, by grep, 2026-11-20.)

**THE VERDICT (HELD, once).** LEARNED against COND, on goals and on survival, each by the exact one-sided sign test (p at most 0.05): LEARNED BEATS COND ON GOALS, COND BEATS LEARNED ON GOALS, or NO DIFFERENCE SHOWN; the same for survival. Reported: against COMBINED and ROUTE+DC, and what the units do (when each fires).

**EXPECTATION.** The budget is small, and the hand rules encode a planned route the learner sees only through one feature. NO DIFFERENCE on goals about 40 percent; COND BEATS LEARNED on goals about 45 percent; LEARNED BEATS COND on goals about 15 percent. Dropping the weight early now costs deliveries (a goal needs the boat within a depth band, and a boat without its weight struggles to hold depth), so I do not expect round 8's trick.

### ROUND 12: BLOW ON THE HARD CASES, GATED BY NEED

**THE QUESTION.** Round 9 stopped at DEV: its draw had almost no hard cases, and the fixed 0.2 m/s gate cost one boat TRIAGE kept. On boats whose leak is bigger than the weight, does blowing the main tank with stored air, ONLY when the climb will not reach the surface before the charge runs out, keep more boats than TRIAGE?

**THE TASK.** Round 2's (`brain/stationsTask.mjs`), with ONE range changed, said plainly: **the leak is U(0.06, 0.08)**, over the 6 % weight. Everything else is as round 2.

**THE RULE (NEED), FIXED NOW.** TRIAGE plus blowing (ballast = -1), when all of these hold:
* the boat is BREACHED, the weight is gone, and it is deeper than 3 m;
* AND, at the charge spent per second over the last 10 s, the battery would be empty before a boat at the current climb reaches 3 m: the time to empty (charge / spend rate) is less than (depth - 3) / climb, with a climb of 0 or less counting as never arriving.

**THE SETS.** DEV: 203001 to 203024, only to check that NEED and TRIAGE differ on at least 3. If not, the round says so and stops, as round 9 did. HELD: 204001 to 204096.

**THE VERDICT (HELD, once).** NEED BEATS TRIAGE iff NEED survives more and the exact one-sided sign test on the discordant dives gives p at most 0.05. TRIAGE BEATS NEED by the same rule. Otherwise NO DIFFERENCE SHOWN. Reported: round 9's fixed BLOW (0.2 m/s) on the same dives, and FIXED.

**EXPECTATION.** On round 2's DEV losses the fixed BLOW saved 6 of 10, and the need gate should leave the easy boats alone. NEED BEATS TRIAGE about 70 percent; NO DIFFERENCE about 25 percent.

**No file in the tree uses a seed from 198000 to 199999, 201000 to 201999, 203000 to 205999** (grep, 2026-11-20).

**ROUND 10, BUILT AND GATED BEFORE HELD (2026-11-20).**
* COND is `triageCaptain`'s `latchOnSecond`. "Damage control acts again" is implemented as **damage control's own trouble test** (`emergencyPilot.stage`: 5 m past the target flown and still sinking) firing in a NEW episode after the weight is gone. Damage control itself is silent once the weight is gone (its stage reads "gone"), so it can never act again as written; the test is the same test.
* **A DISCLOSURE: the first build was wrong, and DEV caught it.** It counted the SAME sinking: right after the drop the boat is still sinking from the first breach, so the test fired again within a tick and COND latched as early as COMBINED. DEV read COND identical to COMBINED on all 24. The fix makes AGAIN mean a new episode (the test must first clear, then fire), which is what section 27 says; nothing of the design changed.
* After the fix, DEV: COND and COMBINED differ on 22 of 24; survived 22 and 22, mean goals 2.67 against 0.92. **Nothing was tuned.**
* Gated in `brain/breachCourierTask-selfcheck.mjs` section 7 (9 mutants, every one red; logged).
* HELD: COND, COMBINED, ROUTE+DC and TRIAGE on 199001 to 199096, to `brain/condHeld.<part>.jsonl`, committed unread, then read once.

## 28. ROUND 12: STOPPED AT DEV, AS REGISTERED (2026-11-20)

**The registered check failed:** on round 12's 24 DEV dives (leaks of 6 to 8 %) NEED and TRIAGE differ on 2, under the 3 required. **HELD is not flown;** 204001 to 204096 stay unread.

**What DEV showed, recorded because it was seen** (DEV only, not a result):
* **On leaks over the weight both crews lose most boats:** TRIAGE keeps 7 of 24, NEED 9.
* **Both dives where they differ are NEED's** (203010 and 203012: TRIAGE crushed at 349 s and 525 s, NEED kept both). **Unlike round 9's fixed gate, the need gate cost no boat TRIAGE kept.** But it saved too few to clear the bar on 24 dives.

**What it suggests, for a later registration, not a result:**
* On these leaks the main tank's 3 % is not enough to matter often. A boat whose leak is 2 % over its weight, with the tank blown, has 1 % to spare at best, and less as the bottle empties.
* The limit is the hull's (its ballast range and its drop weight), as section 9 said before it guessed wrongly about the bottle.
* A test of NEED that could reach the bar needs more dives (the bar is a count, and 2 of 24 differ). Or a vessel with a larger main ballast (`ballastRange` 0.25, the "real boat" spec `surfacePilot.mjs` names).

**Built and kept, off by default:** `triageCaptain`'s `blowNeed` and `needWindowS`; `stationsTask`'s `scenario(seed, ranges)` (the other draws of a seed do not move; gated), HARD_LEAK, NEED_KNOBS, the NEED crew and round 12's sets. Gated in `brain/stationsTask-selfcheck.mjs` section 7 (8 mutants, every one red; logged).

## 29. ROUND 10 RESULT (2026-11-20; `brain/condHeld.{0,1}.jsonl`, 384 runs, committed unread at `a44de8bc0`, then read ONCE)

**VERDICT (registered): COND BEATS COMBINED.** COND has more goals than COMBINED on 75 of the 96 HELD runs and fewer on 1 (p = 1e-21). It is not shown worse on survival: 76 against 80; COMBINED keeps 5 boats COND loses and COND 1 that COMBINED loses (p = 0.11, over the line).

| crew | survived (of 96) | mean goals | seconds on the surface after the breach |
|---|---|---|---|
| ROUTE+DC | 51 | 1.75 | 263 |
| TRIAGE | 68 | 0.89 | 562 |
| COMBINED (round 7's union) | **80** | 0.84 | 625 |
| **COND** | 76 | **2.42** | 444 |

**Reported:**
* **COND keeps both parents' gains, round 7's question.** It beats ROUTE+DC on goals (43 runs to 10, p = 3e-6) and TRIAGE on survival (13 to 5, p = 0.048). Round 7's union interfered; with the latch made conditional, the union COMBINES.
* **It is the best courier of every crew flown so far on a breached run** (2.42 goals, against ROUTE+DC's 1.75), while keeping 76 of 96 boats against ROUTE+DC's 51.
* **The price is small and on record:** 4 boats fewer than COMBINED. Those are, plausibly, boats that could just hold depth and were caught by a later second sinking, the risk section 27 put at about 25 percent. It is not shown to be a loss at the registered line.
* **Against the expectation in section 27:** COND BEATS COMBINED was put at about 65 percent; it happened.

**What it says.** Rounds 7 and 10 together: two good rules put on one boat interfere when one of them assumes it is alone (TRIAGE's latch assumed a breached boat has no job left). Asking that rule one more question (CAN the boat go on?) made the union better than either part on its own measure. This is the captain the stations work set out to find, for these three stations.

**Status: round 10 CLOSED as registered.**

## 30. ROUND 11 RESULT (2026-11-20; `brain/learnedCourier.json` frozen at `76e80c269` before HELD; `brain/learnedCourierHeld.{0,1,2,3}.jsonl`, 384 runs, committed unread at `507fcb1b3`, then read ONCE)

**VERDICT (registered), split as section 27 allowed:**
* **COND BEATS LEARNED ON GOALS:** 85 runs to 0 (p = 3e-26).
* **LEARNED BEATS COND ON SURVIVAL:** 15 runs to 0 (p = 3e-5).

| crew | survived (of 96) | mean goals | seconds on the surface after the breach |
|---|---|---|---|
| ROUTE+DC | 61 | 1.83 | 328 |
| COMBINED | 80 | 0.95 | 606 |
| **COND** | 76 | **2.28** | 437 |
| **LEARNED** | **91** | 0.46 | 664 |

**What it learned** (from the weights; training fitness 58.20, selection 55.06):
* **The SURFACE unit's constant is +1.64,** with positive terms for being breached (+1.25), a goal just reached (+1.22) and the next leg costing more than the charge (+1.11). Its largest negative term is a sinking boat (-2.63 on the vertical speed: a boat going down does not claim the surface, and damage control has it).
* **The DROP unit fires on being breached** (+3.25) and on the weight being gone (+2.68, which then does nothing). It does not drop at the start, unlike round 8's learner.
* **It surfaces at most opportunities** and spends 664 s of the run on the surface after the breach. It delivers 0.46 goals a run (against COND's 2.28) and keeps 91 boats, more than any crew flown.

**What it says.**
* **The learner chose the trade its fitness priced:** a boat kept counts 2 goals, so staying up most of the time, and losing about 1.8 goals a run against COND, buys about 15 boats in 96. Unlike round 8 it is not exploiting a hole: it delivers, and its drop waits for the breach. But its answer is set by a number written into the registration (the 2). A different price on a boat would draw a different captain.
* **Neither dominates.** COND is the far better courier and keeps 76 boats. LEARNED is the safest crew and delivers little. Which is "better" is a question about the mission's values, not about the captains.
* **Against the expectation in section 27:** "COND BEATS LEARNED on goals" was put at about 45 percent; it happened. I did not expect the learner to win survival outright.
* **One more learning round would need the price set first,** from what the boat is for (for example, a lost boat costs the goals it would have delivered for the rest of the run), and registered before training.

**Status: round 11 CLOSED as registered.**
