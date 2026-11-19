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
