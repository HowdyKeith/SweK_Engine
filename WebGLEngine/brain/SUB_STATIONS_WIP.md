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
