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
