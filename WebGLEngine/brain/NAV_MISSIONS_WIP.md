# Navigation missions and what a metre costs (backlog `nav-missions-and-cost`; UNNUMBERED; 2026-11-17; Keith: "Let's do all the next sandbox rounds, smallest first")

The backlog item has two halves: "One waypoint per flight, and a detour costs nothing." This note does the **second half first** (PART 1, registered below before any code and before any of its seeds is flown). PART 2, multi-waypoint missions, needs a flight loop that chains legs on one clock (the ships keep sailing between legs). It is NOT built here and is said so at the end.

## What was measured before registering (a physics constant, no seeds)

The submarine needs model (`physics/mechanics/subNeeds.mjs`) charges a hotel load of 200 W plus |thrust x forward speed| / 0.5. The explorer hull on the PD autopilot, holding a straight course at 20 m depth for 60 s after 60 s of settling:

| speed (m/s) | power (W) | energy per metre (J/m) |
|---|---|---|
| 1.0 | 490 | 490 |
| 1.5 | 1,178 | 785 |
| 2.0 | 2,518 | 1,259 |
| 2.5 | 4,728 | 1,891 |
| 3.0 (cruise) | 8,025 | 2,675 |

**At cruise a metre costs about 2.7 kJ, and a 3 MJ battery lasts about 1.1 km.** A hard-traffic leg of about 400 m uses about a third of a battery, so the 25 percent longer paths `any+predict` flew in traffic (HELD4) would be about 9 percent of a battery a leg, IF they hold on a fresh set. Slowing down is far cheaper per metre (5.5 times at 1 m/s), so an arm that yields by slowing may pay less energy for a longer path.

## PART 1: THE PRICE OF A DETOUR (REGISTERED 2026-11-17, BEFORE ANY CODE FOR IT AND BEFORE ANY OF ITS SEEDS IS FLOWN)

**The meter.** A pilot wrapper that adds the needs model's own power at every tick (the same formula and inputs `stepNeeds` uses: the commanded thrust, the forward speed through the water, the submerged fraction) over the flight. It changes nothing in the flight. Its gate must show that it equals `stepNeeds`'s energy drop on the same flight, and that the flight is unchanged by it.

**The set.** HELD80 = hard-traffic seeds 7701 to 7760, flown ONCE, spent by no navigation module. DEV (1 to 30) first, as a sanity run, not a result.

**The arms** (`brain/subHardNav.mjs` flyHard, unchanged): `any+replan`, `any+predict`, and `any+predict+edge+yield` (the traffic reference of FOLLOW-UPs 5 to 7).

**The registered reading.** On the flights BOTH `any+predict` and `any+replan` reach, the paired extra energy of `any+predict` over `any+replan`, as its MEDIAN:
* **THE DETOUR COSTS** iff the median paired extra is at least 3 percent of a battery (90 kJ, about 34 m at cruise);
* **THE DETOUR IS CHEAP** iff it is at most 1 percent (30 kJ);
* **IN BETWEEN** otherwise. A negative median (replan pays more) is CHEAP.

**Reported beside it (no verdict).** Per arm: reached, median path, median energy of a reached flight, median J per metre. The reference against `any+replan` the same way. The paired extra path in metres. The share of flights whose energy would exceed one battery.

**Checks (a failure: NOT WEIGHED).** (1) THE METER IS THE MODEL'S: on one real flight, the meter's total equals the needs model's energy drop to 1e-6 relative, and the flight under the meter is the unmetered flight (status, ticks, path). (2) SAME SCENARIOS. (3) ENOUGH PAIRS: at least 20 flights reached by both `any+predict` and `any+replan`.

**Expectations, written before any seed is flown.** E1 THE DETOUR COSTS: about 45 percent (HELD4's 25 percent was a median path ratio, and a fresh set may shrink it). E2 the reference uses less energy per reached flight than `any+predict`: about 65 percent (it slows near ships). E3 `any+replan` reaches fewer than `any+predict`: about 75 percent (HELD4). E4 at least one flight of some arm would empty a battery: about 30 percent.

**What a result would not say.** The battery class and hull are the explorer's; the current, the weight error and the depth changes are the scenario's own; there is no recharge. The verdict prices a detour. It does not say which arm a captain should choose, because arrivals matter too.

## PART 2 (NOT BUILT, said now)

Multi-waypoint missions: one clock across legs, the ships sailing on between them, energy carried from leg to leg, and a mission failing when the battery empties. The meter of PART 1 is the piece it needs. The flight loop that chains legs is not written.

### AMENDMENT 1 TO PART 1 (2026-11-17; made on DEV, BEFORE ANY HELD80 SEED IS FLOWN; DEV is not a result)

DEV (30 seeds) gave only **10 flights reached by both `any+predict` and `any+replan`**: `any+replan` reaches few in traffic. At that rate the registered 60 seeds would give about 20 pairs, exactly the ENOUGH PAIRS floor, and the reading would stand or fall on a coin. **HELD80 is widened to seeds 7701 to 7820 (120 scenarios, 360 flights).** 7761 to 7820 are spent by no navigation set either. The arms, the reading, the bars (3 and 1 percent of a battery), the checks and the floor of 20 pairs are unchanged. The DEV table was not printed (its check failed, as the rule says) and nothing else of DEV was read.

## PART 1, RESULT (2026-11-17; `node tools/ship/navEnergyStudy.mjs --set held80 --write`, HELD80 = hard-traffic seeds 7701 to 7820 after Amendment 1, flown ONCE; 360 flights in `brain/navEnergyHeld80.jsonl`): **THE DETOUR COSTS**

The meter, the study and both gates were committed and sabotaged first (64201749; 15 mutants logged, two of which first read 0 red and got rows). All three checks passed. The meter equals the needs model's energy drop to the last bit and leaves every flight unchanged.

| arm | reached | median path | median energy of a reached flight | median J/m | flights over one battery |
|---|---|---|---|---|---|
| any+replan | 65 / 120 | 399 m | 1,133 kJ (37.8%) | 2,834 | 0 |
| any+predict | **81 / 120** | 463 m | 1,340 kJ (44.7%) | 2,877 | 0 |
| any+predict+edge+yield | 79 / 120 | 432 m | 1,146 kJ (38.2%) | **2,683** | 0 |

**The registered reading.** On the 47 flights both `any+predict` and `any+replan` reach, `any+predict` pays a **median 142 kJ more, 4.7 percent of a battery**, for a median 38 m more path. The bar was 3 percent: **THE DETOUR COSTS.**

**Reported beside it.** The traffic reference (`any+predict+edge+yield`) against `any+replan` on the 44 flights both reach: a median **7 kJ less** for 26 m more path. Slowing near ships (the yield) is cheaper per metre (2,683 J/m against 2,877) and pays for its longer path.

**Against the expectations (written first).** E1 THE DETOUR COSTS, about 45: held. E2 the reference uses less energy per reached flight than `any+predict`, about 65: held (1,146 against 1,340 kJ). E3 `any+replan` reaches fewer than `any+predict`, about 75: held (65 against 81). E4 a flight empties a battery, about 30: no (none did).

**What it says.** A metre is not free: one leg through traffic takes 38 to 45 percent of a 3 MJ battery, and `any+predict`'s detour adds about 5 percent of a battery to each leg it shares with `any+replan`. It also reaches 16 more legs of 120, so the detour buys arrivals. The reference arm gets both: as many arrivals as `any+predict` (79) for replan's energy, because slowing is cheap. **On this hull, the speed a vessel goes matters more to its energy than the path it takes**: 1 m/s costs 490 J/m and cruise 2,675 J/m.

**Not checked, said plainly.** One hull (the explorer), one battery class, no recharge. The arms were not asked to save energy; none of them knows it is spending it. PART 2 (missions of several legs on one clock, which can run a battery dry) is not built.

## PART 2: THREE-LEG MISSIONS ON ONE BATTERY (Keith, 2026-11-17: "start the multi-leg missions round"; REGISTERED 2026-11-17, BEFORE ANY CODE FOR IT AND BEFORE ANY OF ITS SEEDS IS FLOWN)

**Why.** PART 1 measured one hard-traffic leg at 38 to 45 percent of a 3 MJ battery at cruise. Three legs is then about 115 to 135 percent, so **a mission at cruise should often run the battery flat**, and the energy a single leg could ignore decides a mission. At 2 m/s a metre costs 1,259 J against cruise's 2,675 (the table above).

**The mission.** The sea is a hard-traffic scenario (`brain/subHardNav.mjs` `hardScenario(seed, "hard-traffic")`): its start, obstacles, current and weight error, unchanged. Three waypoints:
* W1 is the scenario's own goal (x 360 to 400).
* W2 is drawn at x 40 to 120.
* W3 is drawn at x 280 to 400, on the side of y opposite W1's.

W2 and W3 take y in -80 to 80 and depth 15 to 40, from a generator seeded by the mission seed apart from the scenario's. Each must stand as the scenario's goal does: r + 40 m from every static obstacle and from the previous waypoint; up to 200 tries, else the mission is not built and the seed is skipped and REPORTED.

**One clock.** The ships keep sailing across legs (the scenario's constant velocities, which may carry them out of the region late in a mission: a property of the sea, said). Each leg is flown as `flyHard` flies one: the arm's plan built for the leg's waypoint at the moment the leg starts, replanned on the arm's rule. A leg ends on the arrival rule (10 m, 4 m in depth); the next starts on the next tick. Each leg is capped at 260 s, the mission at 780 s.

**One battery.** The energy meter of PART 1 runs across the whole mission from a full 3 MJ, with no recharge. **When it reaches zero the mission ends FLAT.** A collision, an exit, a leg past 260 s, or the vessel's own loss ends it as in `flyHard`.

**The arms.**
* `any+predict+edge+yield` (the reference: the traffic arm of FOLLOW-UPs 5 to 7 underneath).
* `any+predict` (reported).
* **`eco`, designated**: the reference with its commanded speed capped at ECO_SPEED = 2.0 m/s. A pilot wrapper; only the speed changes, only down.

**The set.** HELD83 = seeds 7941 to 8000 (60 missions), flown ONCE; spent by no navigation set (HELD82 ended at 7940). DEV (1 to 30) first, as the sanity run.

**The registered test.** Missions COMPLETED (all three waypoints reached), `eco` against the reference, paired by seed.
* **SUPPORTED** iff net gain >= 5 at an exact two-sided sign p <= 0.10.
* **PARTLY SUPPORTED** iff the gain is 3 or 4.
* **NOT SUPPORTED** otherwise.
* **HARMFUL** is printed beside it if the gain is -5 or worse.

**Reported beside it.** Per arm: missions completed, legs completed, missions ended flat, collided, left and timed out; the median energy of a completed mission; the median battery left at the end.

**Checks (a failure: NOT WEIGHED).** (1) ONE LEG IS flyHard: a one-waypoint mission is `flyHard`'s flight (status, ticks, path) on five DEV seeds, each arm. (2) THE METER IS PART 1's: a one-waypoint mission's energy equals `brain/navEnergy.mjs`'s `flyMetered` on the same seeds. (3) SAME SCENARIOS (and the same waypoints) for every arm. (4) ECO BITES: it changes at least one mission.

**Expectations, written before any seed is flown.** E1 the reference ends flat on at least a third of its missions: about 60 percent. E2 SUPPORTED: about 55 percent. E3 `eco` ends flat on none: about 75 percent. E4 `eco` collides with ships more often than the reference (slower in traffic): about 40 percent.

**What a result would not say.** One hull and battery class with no recharge, three legs of a fixed layout, ships that do not react. An arm that knew its battery and chose its speed would be the next question. This one fixes the speed.

### AMENDMENT 1 TO PART 2 (2026-11-17; made on DEV seeds 1 to 6 while building, BEFORE ANY HELD83 SEED IS FLOWN; DEV is not a result)

**The registered leg cap of 260 s scores speed, not energy.** It was `flyHard`'s cap for a vessel at 3 m/s. On DEV seeds 2 and 5, `eco` (2 m/s) timed out on its FIRST leg with 77 percent of its battery left: chords of 376 and 394 m, paths of about 510 m, more than 260 s at 2 m/s. With 390 s it completed all three legs on both. A cap that ends a slower arm for being slower answers a question the round did not ask.

**Amended:** each arm's leg cap is 260 s x CRUISE (3 m/s) / the arm's cruise, which is the same distance budget per leg (780 m at cruise speed). The reference and `any+predict` keep 260 s; `eco` gets 390 s. The mission cap is three legs of each arm's cap. The arms, the set, the battery, the test, the bars and the checks are unchanged. Check (1) uses 260 s, the cap of the arms it copies.

## PART 2, RESULT (2026-11-17; `node tools/ship/navMissionStudy.mjs --set held83 --write`, HELD83 = seeds 7941 to 8000, read once; 180 missions in `brain/navMissionHeld83.jsonl`): **SUPPORTED**

The module, the study and the gate were committed and sabotaged first (81896596; 16 mutants, four of which first read 0 red and got rows). DEV was the sanity run (eco 22 of 30, the reference 4; not a result). All four checks passed:
* a one-waypoint mission is `flyHard`'s flight tick for tick;
* its energy is PART 1's to the joule;
* every arm flies the same 60 missions;
* eco changes some.

All 60 seeds had a mission.

| arm | missions completed | legs reached (of 180) | flat | collided | left | median energy of a completed mission | median battery left |
|---|---|---|---|---|---|---|---|
| any+predict+edge+yield (the reference) | 5 / 60 | 98 | **41** | 12 | 2 | 2,910 kJ | 0% |
| any+predict | 0 / 60 | 92 | 46 | 9 | 5 | n/a | 0% |
| **eco** (the reference at 2 m/s) | **49 / 60** | **148** | **0** | 9 | 2 | 1,570 kJ | 48% |

**The registered test.** Eco against the reference, missions completed, paired: **44 gained, 0 lost, net 44, exact sign p < 0.0001: SUPPORTED.** `any+predict` against the reference (reported): 0 gained, 5 lost.

**Against the expectations (written first).** E1 the reference ends flat on at least a third, about 60: held (41 of 60, over two thirds). E2 SUPPORTED, about 55: held. E3 eco ends flat on none, about 75: held (0). E4 eco collides with ships more than the reference, about 40: no (9 against 12).

**What it says.** On one 3 MJ battery with no recharge:
* **A vessel at cruise cannot fly three traffic legs.** The reference spent the whole battery on 41 of 60 missions, and its 5 completions used 2.9 of the 3 MJ.
* **The same plan at 2 m/s completes four in five and comes home with half its battery.** It also hits fewer ships, not more.
* **`any+predict`, which never slows, completed none.**

PART 1 found that speed matters more to energy than path. Over a mission, it is the whole result: the battery, not the traffic, decides how many missions end. Collisions and exits end 11 of eco's 60; nothing ends any of them flat.

**Not checked, said plainly.**
* One hull, one battery class, no recharge.
* A fixed three-leg layout.
* Ships that hold course and may sail out of the region late in a long mission. Eco's missions are longer, so it may meet fewer ships late. That is not separated here.
* No arm KNEW its battery. The next question is an arm that chooses its speed from the battery left and the distance to go.
* Eco's leg cap was widened to 390 s by Amendment 1, on DEV and before HELD83, so that a slower arm is not ended for being slower.

## PART 3: AN ARM THAT CHOOSES ITS SPEED FROM THE BATTERY (Keith, 2026-11-17, naming it among "good rounds to do"; REGISTERED 2026-11-17, BEFORE ANY CODE FOR IT AND BEFORE ANY OF ITS SEEDS IS FLOWN)

**Why.** PART 2's `eco` completed 49 of 60 missions by flying everything at 2 m/s, and came home with half its battery: energy it could have spent going faster. **`budget`** spends what the battery can afford.

**Measured before registering (DEV, the sanity set; no held seed).** On the 22 DEV missions `eco` completed, the path flown over the sum of the straight lines from the start through the three waypoints is: median 1.226, 90th percentile 1.342, largest 1.399. **DETOUR = 1.35** is fixed from that.

**The arm, `budget`.** The reference (`any+predict+edge+yield`) with its commanded speed capped (only down) at a speed chosen every 3 s, as the plan is replanned. The chosen speed is the FASTEST of 3.0, 2.5, 2.0 and 1.5 m/s for which

  (energy per metre at that speed) x (the distance to go) x DETOUR <= the energy left in the battery.

* The distance to go is the straight line to the current waypoint plus the straight lines between the waypoints after it.
* The energy per metre is this note's measured table: 2,675 / 1,891 / 1,259 / 785 J/m at 3.0 / 2.5 / 2.0 / 1.5 m/s.
* When none qualifies, 1.5 m/s.
* The leg cap is Amendment 1's distance budget at the slowest speed the arm may fly: 260 x 3 / 1.5 = 520 s.

**The set.** HELD84 = seeds 8001 to 8060 (60 missions), flown ONCE, spent by no navigation set. DEV is the sanity run.

**The registered test, `budget` against `eco`, paired by seed.**
* (1) NOT WORSE AT FINISHING: completed missions, budget at least eco's minus 2.
* (2) FASTER: on the missions both complete, the median mission time at least 10 percent shorter.

**SUPPORTED** iff both. **PARTLY SUPPORTED** iff exactly one. **NOT SUPPORTED** otherwise. Reported beside it: each arm against the reference (as PART 2); missions flat; the speeds `budget` chose (the share of decisions at each).

**Checks (a failure: NOT WEIGHED).** (1) THE COPY: `eco` reproduces PART 2's stored HELD83 `eco` missions on its first five seeds (status, ticks, path). (2) THE TABLE IS THE MODEL'S: re-measured as above (60 s settled, 60 s timed at 20 m), each energy per metre within 2 percent of the table. (3) SAME SCENARIOS. (4) BUDGET BITES: it changes at least one mission.

**Expectations, written before any seed is flown.** E1 (1) holds: about 70 percent. E2 (2) holds: about 65 percent. E3 SUPPORTED: about 45 percent. E4 `budget` ends flat on at least one mission (its estimate is a straight line, not the route): about 35 percent.

**What a result would not say.** The table is still water at 20 m (the current, the depth changes and the turns are not in it), and DETOUR is one number for every sea. An arm that learned its own detour as it went is not this one.

## PART 3, RESULT (2026-11-17; `node tools/ship/navBudgetStudy.mjs --set held84 --write`, HELD84 = seeds 8001 to 8060, read once; 180 missions in `brain/navBudgetHeld84.jsonl`): **SUPPORTED**

The arm, the study and the gate were committed and sabotaged first (04643b0f; 14 mutants, two of which first read 0 red and got rows). DEV was the sanity run (SUPPORTED on 30, not a result). All four checks passed: `eco` reproduces PART 2's stored missions, the table re-measures within 2 percent (to 0.03), all 60 seeds had a mission, and `budget` changes some.

| arm | missions completed | legs | flat | collided | left | median time (completed) | median battery left |
|---|---|---|---|---|---|---|---|
| any+predict+edge+yield (the reference) | 6 / 60 | 96 | 39 | 11 | 4 | 392 s | 0% |
| eco (2 m/s) | 40 / 60 | 120 | 0 | 18 | 2 | 608 s | 49% |
| **budget** | **41 / 60** | 123 | **0** | 16 | 3 | **464 s** | 9% |

**The registered test.**
* (1) Not worse at finishing: budget 41 against eco's 40 (it needed 38). MET.
* (2) Faster: on the 32 missions both complete, a median of **460 s against 609 s, 24 percent faster** (it needed 10). MET.

**SUPPORTED.** Its decisions: 3 m/s 33 percent, 2.5 m/s 67 percent, slower never.

**Against the expectations (written first).** E1 (1) holds, about 70: held. E2 (2) holds, about 65: held. E3 SUPPORTED, about 45: held. E4 budget ends flat at least once, about 35: no. The straight-line estimate times DETOUR was enough on every mission.

**What it says.** An arm that knows its battery spends it: it finishes as many missions as the fixed-speed arm, a quarter faster, and comes home with 9 percent where `eco` comes home with half.

On this set `eco` completed 40, against PART 2's 49 on its own set. The sets differ in their seas, and on this one both slow arms lose missions to ships (18 and 16 collisions). That is the traffic problem of `brain/SUB_FIELD_NAV_WIP.md`, not the battery's. Of the 49 missions either completed, 9 only budget completed and 8 only eco. The two arms reach the same count by different flights.

**Not checked, said plainly.**
* The table is still water at 20 m. DETOUR is one number fitted on DEV's eco missions.
* There is no reserve: a sea that ran 1.4 times its straight lines would leave it short.
* The traffic arcs (FOLLOW-UPs 8 and 9: the dive and the deep transit) are not under these missions. A mission arm with both is the obvious next step.
