# Three open navigation items, registered together BEFORE ANY CODE FOR THEM IS WRITTEN AND BEFORE ANY SEED OF THEIR SETS IS FLOWN (2026-11-06; UNNUMBERED)

Keith, 2026-11-06: "start on the three nav items". They are `nav-margin-sweep-any`, `nav-current-in-field` and `nav-reacting-traffic` of `brain/BACKLOG_2026-11-01.md` section A. All three are module-only: a NEW module `brain/subNavPlus.mjs` (scenarios of the new kinds, the extended flight), a NEW study command `tools/ship/subNavPlusStudy.mjs`, and a gate for each. `brain/subHardNav.mjs`, `brain/subFieldNav.mjs` and every shared file are NOT edited; the extended flight must reproduce `subHardNav.flyHard` bit for bit when no new option is on (a gate row holds that).

Everything of the series stands unless a line below says otherwise: the PD autopilot (`brain/autopilotSub.mjs`), the Explorer hull, 260 s a flight, a perfect position fix, an exact static map, the region and the field of `brain/subFieldNav.mjs`, the any-angle aim point, the margin ladder 12 / 8 / 6 / 3 m, the vertical margin 5 m, the edge band, the registered statistical conventions (paired counts, exact two-sided sign test on the discordant pairs, a verdict rule fixed here). **DEV = seeds 1 to 30** of each kind: flown once as a sanity run and for the one choice each item names; not a result. If DEV shows a generator to be degenerate (nothing or everything gets through for a reason that is the generator's), I amend ONCE, here, before the HELD set is read. **Fresh sets, never used by anything: HELD70 = seeds 7001 to 7060 (item 1), HELD71 = 7101 to 7160 (item 2), HELD72 = 7201 to 7260 (item 3).** Each is flown ONCE, after the code, the command and their gates are sabotaged.

## ITEM 1. nav-margin-sweep-any: was 12 m the right top rung?

**The caveat being closed.** Both write-ups of the any-angle arm say its margin was never swept: 12 m was chosen on DEV for the cell-by-cell arms, and the harder test added a ladder (12, 8, 6, 3 m) and a vertical margin of 5 m without testing either.

> Does any other top rung of the margin ladder, or any other vertical margin, reach more scenarios than the incumbent on scenarios nobody has read?

**Variants (seven; the incumbent is `m12`).** `m12`: ladder [12, 8, 6, 3], vertical margin 5 m. `m16`: [16, 12, 8, 6, 3]. `m10`: [10, 8, 6, 3]. `m8`: [8, 6, 3]. `m6`: [6, 3]. `v0`: `m12` with a vertical margin of 0 m. `v10`: `m12` with a vertical margin of 10 m. (A vertical margin of V blocks an iceberg when its keel + V exceeds the shallower of the start depth and the waypoint depth.)

**Arms and kinds.** `hard-islands`, `hard-gaps` and `hard-current`: the arm `any` of HELD4. `hard-traffic`: the arm `any+predict+edge+yield` of HELD5 (the designated fix). The same variant is applied to every kind.

**The DEV choice, fixed here.** Every variant is flown on DEV (30 seeds of the four kinds, 120 scenarios). **CHOSEN = the variant with the most DEV scenarios reached in total; ties go to the incumbent, then to the variant whose top rung is nearest 12 m, then to the lower vertical margin.** Written into the study before HELD70 is read.

**HELD70, flown once.** 60 seeds of each of the four kinds (240 scenarios), all seven variants (1,680 flights).

**Verdict (fixed here).** Let gain = (scenarios CHOSEN reached) - (scenarios the incumbent reached) over HELD70's 240, and p = the exact two-sided sign test on the discordant scenarios. **A DIFFERENT MARGIN HELPS** iff CHOSEN is not the incumbent, gain is at least 5 AND p <= 0.10. **THE INCUMBENT MARGIN STANDS** otherwise (which includes CHOSEN being the incumbent). If CHOSEN is at least 5 BELOW the incumbent on HELD70, the line also says so (**THE DEV CHOICE WAS HARMFUL**). Per kind and per variant the reached / collided / left / timed-out counts, and the median path over the chord of the arrivals, are printed; the best variant on HELD70 is named **POST HOC and moves nothing**.

**Predictions (scored held or missed; they move nothing).** M1: the DEV choice is the incumbent: about 45 percent. M2: the verdict is THE INCUMBENT MARGIN STANDS: about 85 percent. M3: `m16` reaches no more than `m12` on `hard-gaps` on HELD70 (a wider top rung closes more gaps and the ladder falls back): about 75 percent. M4: `m6` has more collisions than `m12` on `hard-islands`: about 70 percent. M5: `v0` has at least one more collision than `v10` on `hard-islands`: about 60 percent. M6: every variant reaches at least 90 percent on the three static kinds taken together: about 55 percent (HELD4 had the incumbent at 93 to 98).

**What a result would not say.** That the margin does not matter in a sea denser or narrower than this family, or with a worse position fix (the sensed-nav series found the margin did matter there; this round is the exact-fix, exact-map sea). The variants change the top rung and the vertical margin only; the lower rungs, the edge band and the replan period are as they were. Seven variants on one DEV set of 120 is a coarse sweep. Three kinds are near a ceiling (93 to 98 percent in HELD4), so a null result is the expected one and says the ceiling, not the margin, is what the family measures.

## ITEM 2. nav-current-in-field: a field that knows the current

**What is open.** The field does not know the current. HELD4's strong-current kind was flown on a plan that ignores it, and the four collisions of `any` there were at means of 0.70 to 1.28 m/s. The backlog names four things to try: a crab angle in the aim point, the current in the cost (a cell's cost growing against the set), a margin that grows with the current, and the turn radius (about 35 m) in the margin.

> Does a vessel that estimates the current it is in, and crabs into it and widens its margin by it, reach more scenarios than one that does not, in a current the field was not told about?

**What the vessel knows, said plainly.** It has a perfect water-speed log (its velocity through the water) and a perfect ground-speed log (its velocity over the ground); the horizontal difference is the water's velocity where it is. The estimate is an exponential average of that difference with **tau = 15 s**, starting at zero. It is the same optimism as the perfect position fix, and it includes the unsteady part of the current in what is averaged. The mean current of a scenario is never given to a non-oracle arm.

**Two things that are NOT tried, said before.** (1) The current in the COST: the solver's cost is a function of height steps and the any-angle aim point reads blocked cells, not costs (the same reason `+edge` was a wall and not a ramp in follow-up 5); a cost against the set cannot reach the aim point without a new solver. (2) The turn radius in the margin as a function of the corner angle: it needs the corner angle of the path, which the aim point does not expose. Both stay open.

**Kinds.** `hard-current` (HELD4's: the islands layout, a mean to 1.2 m/s on each horizontal axis, an unsteady 0.2 to 0.5, a weight error) and **`hard-current-gap`** (NEW: the wall with one gap of `hard-gaps`, widths 24, 32, 40 m by seed mod 3, in the current and the weight error of `hard-current` for the same seed). 60 + 60 scenarios on HELD71.

**Arms (four; the margin and the replan period of HELD4 unless stated).**
* `any` (the incumbent: a plan built once at t = 0, no knowledge of the current).
* `any+crab`: the same plan; each tick the heading the autopilot is asked for is the aim point's bearing b plus asin(c_n / V) clamped to [-1, 1], where c_n is the component of the estimated current across that bearing (positive to the left of the track) and V is the through-water speed, so that the water velocity plus the current points along the bearing. The lead is dropped (the bearing is used as it is) while the estimate is zero.
* `any+crab+margin` (**designated**): `any+crab`, with the plan rebuilt every REPLAN_S = 3 s and the TOP rung of the ladder raised to **12 + K x |c|** m, K = **12 s** (the vessel's 35 m turn radius over its 3 m/s cruise is 11.7 s: the lateral drift in one turn, per m/s of current; derived, not tuned), the lower rungs unchanged. The replan keeps the vessel's own cells free as the replanning arms always did.
* `any+crab-mean` (an upper bound, not designated): `any+crab` with the scenario's TRUE MEAN current from t = 0, no estimate.

**DEV use.** Sanity only, plus one check: the estimator's error. No parameter is chosen on DEV; tau = 15 s and K = 12 s are fixed here.

**Verdict (fixed here).** Pool the 120 scenarios. gain = (designated reached) - (`any` reached); p = the exact two-sided sign test on the discordant scenarios. **SUPPORTED** iff gain is at least 5 AND p <= 0.10 AND the designated arm has no more collisions than `any`. **PARTLY SUPPORTED** iff gain is at least 3 but the other two conditions do not both hold. **NOT SUPPORTED** otherwise; a gain of -5 or worse is also named **HARMFUL**.

**Predictions (they move nothing).** C1: `any+crab` alone does not beat `any` by 5: about 70 percent. C2: `any+crab-mean` reaches at least as many as `any+crab`: about 60 percent (the estimate lags the mean and carries the unsteady part). C3: `any` reaches fewer on `hard-current-gap` than on `hard-current`: about 90 percent. C4: the designated arm's median path over the chord (arrivals) is at least `any`'s: about 70 percent (a wider margin detours). C5: the estimate is within 0.25 m/s of the true mean at t = 60 s on at least 75 percent of the scenarios: about 65 percent. C6: SUPPORTED: about 25 percent; PARTLY SUPPORTED about 20 percent.

**What a result would not say.** Anything about a current that varies in space (this one is uniform in the region and varies only in time), a current that is not measurable, or a vessel with another hull or autopilot; nothing about the current in the cost or the corner-angle margin; nothing about the sensed map (the map is exact). `hard-current-gap` is a family I made with these parameters; the gap and the current are drawn independently.


### AMENDMENT 1 TO ITEM 2 (2026-11-06; made on DEV, BEFORE HELD71 was read or flown and before any gate for the code existed; DEV is not a result)

DEV (30 seeds a kind, the parameters registered above) put the incumbent `any` at **26 of 30 in hard-current and 28 of 30 in hard-current-gap**, and the other three arms at 28 and 29: the ceiling the harder test ended on again, with room for at most four or five flights in 60. The verdict asks for a gain of at least 5 with p <= 0.10, which on 60 + 60 scenarios needs about six scenarios won against one lost, more than the room there is. **One change, made once: HELD71 is seeds 7101 to 7200 (100 of each kind, 200 scenarios) instead of 7101 to 7160.** (7201 to 7260 stay HELD72's; no seed is shared.) The verdict rule, its thresholds (gain at least 5, p <= 0.10, no more collisions), the arms, tau = 15 s, K = 12 s and the predictions are unchanged, and the generator is NOT made harder: 4 and 2 failures in 30 are not a degenerate generator, and I will not tune a family until an arm wins. **I expect the pooled gain to be small (DEV: +3 of 60 for the designated arm, p 0.375) and the round to read NOT SUPPORTED or PARTLY SUPPORTED**; C3 and C4 each missed on DEV (the gap kind did not cost `any` more than hard-current did, and the designated arm's path was not longer), which changes none of the stated probabilities by more than a few points.

## ITEM 3. nav-reacting-traffic: ships that answer, and a velocity that has to be estimated

**What is open.** HELD4 and HELD5's ships hold course and speed, do not see the vessel, and have a velocity the plan knows exactly. `any+predict` is only as good as its prediction, and the prediction is perfect there. Follow-up 5 ended at 40 of 60 (67 percent) with 14 of 20 failures collisions with ships.

> When the ships answer the vessel (turn away, stop) and the plan has to estimate their velocity from where it sees them, does an estimated-velocity plan keep the reach of the assumed-velocity one?

**The reaction rule of a ship (`hard-reactive`: the scenario of `hard-traffic` for the same seed, its ships given a behaviour by seed).** One third each, by a stream drawn from the seed: `holds` (HELD4's ship), `turns`, `stops`. Every tick a `turns` or `stops` ship asks whether, with the vessel holding its present velocity and itself holding its present velocity, the two come within r + half-hull + **SHIP_CLEAR = 30 m** at any second of the next **30 s**, and whether the vessel is within **SENSE = 150 m**. If both: a `turns` ship rotates its velocity at **0.15 rad/s** toward the side that gives the larger closest approach, up to **60 degrees** from its original course; a `stops` ship decelerates at **0.5 m/s^2** toward zero. When the conflict has been absent for **10 s** a `turns` ship rotates back at 0.15 rad/s and a `stops` ship accelerates back at 0.5 m/s^2 to its original velocity. A ship never reacts to a static obstacle (they were generated clear of its track and the turn may take it through one: ignored, said). The ships are simulated tick by tick with the vessel; a ship's position is no longer a function of time alone.

**The velocity filter.** The plan sees each ship's POSITION exactly every tick (the perfect fix of the series, now for others) and no velocity. Its velocity estimate is an exponential average of the per-tick difference of position with **tau = 6 s**, started at the first tick's difference. The prediction capsule of `predict` is the ship's current position to its position 30 s ahead at the estimated velocity.

**Arms (five, all on `hard-reactive`, plus one reference on `hard-traffic`).**
* `any+replan` (ships where they are, no prediction), `any+predict` (HELD4's: each ship at its ORIGINAL velocity, constant: "assumed", correct for `holds` ships and stale after a reaction), `any+predict+edge+yield` (HELD5's designated fix, assumed velocities), `any+predict-est` (the capsule at the ESTIMATED velocity), and **`any+predict-est+edge+yield` (designated)**. `edge` and `yield` are HELD5's (a 20 m wider edge band; slow to 2.0 m/s while a conflict is predicted), the yield test run on the same ship model the arm plans with.
* Reference: `any+predict+edge+yield` flown on `hard-traffic` (non-reactive) for the same 60 seeds, so that the effect of the reaction on the assumed-velocity arm is a paired count.

**DEV use.** Sanity, and one count: how many ships of DEV react at all (the generator is degenerate if almost none do, and I amend once before HELD72).

**Verdict (fixed here).** Over HELD72's 60 `hard-reactive` scenarios: gain = (designated reached) - (`any+predict+edge+yield` reached); p = the exact two-sided sign test on the discordant scenarios. **SUPPORTED** iff gain is at least 5 AND p <= 0.10 AND the designated arm leaves the region in no flight. **PARTLY SUPPORTED** iff gain is at least 3 and the other two do not both hold. **NOT SUPPORTED** otherwise; a gain of -5 or worse is also named **HARMFUL**.

**Predictions (they move nothing).** R1: the reaction changes the assumed-velocity arm's reach by at least 5 scenarios on the same 60 seeds, either way: about 55 percent. R2: the reaction RAISES that arm's reach (ships that turn away help a vessel that cannot out-turn them): about 50 percent. R3: the designated arm reaches at least as many as `any+replan`: about 70 percent. R4: SUPPORTED: about 15 percent; NOT SUPPORTED about 55 percent. R5: a `stops` ship is hit by the designated arm less often than a `holds` ship, per ship: about 60 percent. R6: no flight of the designated arm times out: about 85 percent.

**What a result would not say.** That ships behave like this: the rule is mine, simple and the same for every ship, with no right-of-way convention beyond "turn to the side that clears" and no ship that tries to ram. The velocity filter sees exact positions. Collisions with static obstacles after a ship's turn are not counted against the ship. The static sea is HELD5's (two or three icebergs, no islands).

## What is built, and how it will be gated

`brain/subNavPlus.mjs`: the `hard-current-gap` and `hard-reactive` scenarios; the current estimator; the crab heading; the ships' reaction and velocity filter; `flyPlus`, the extended flight (a gate row holds that with every new option off it returns `flyHard`'s result to the digit); the arms and variants of the three items. `tools/ship/subNavPlusStudy.mjs`: `--study margin | current | reactive`, `--set dev | held70 | held71 | held72`, `--write`; the DEV choice rule of item 1, the verdicts, the predictions. A gate for each file, with a mutation pass (mechanical on the code lines, plus hand-written mutants of each rule and constant above), logged in its header. Then DEV for each item, any amendment written here, and each HELD set flown once.

## Not in this round, said now

The sensed map (the series' own, finished); the current in the cost; the corner-angle margin; a 3-D seabed (`nav-3d-terrain`); fleets (`nav-fleet-avoidance`); the ship-vs-ship match (`nav-match-consumes-layer`); the tank's 3D view (`tank-nav-3d`); missions with energy (`nav-missions-and-cost`). The last four are upstream or in shared files.

# RESULTS (2026-11-06; each HELD set flown ONCE, after the module, the command and both gates were sabotaged and committed; every flight is in `brain/subNavPlus<Study>Held7x.jsonl`)

`node tools/ship/subNavPlusStudy.mjs --study margin --set held70 --write` (1,680 flights), `--study current --set held71 --write` (800), `--study reactive --set held72 --write` (360). The numbers below are the command's own output; the "post hoc" lines are computed from the flight files afterwards, with throwaway scripts, and move nothing.

## ITEM 1, RESULT: **THE INCUMBENT MARGIN STANDS** (the margin sweep found nothing the sea can tell apart)

DEV choice (the registered rule, 120 DEV scenarios): **m8** (110 reached against the incumbent's 105). On HELD70's 240 scenarios m8 reached 221 and the incumbent 215: 11 scenarios only m8, 5 only m12, both 210, neither 14; **gain 6, sign-test p 0.2101**. The verdict needed a gain of 5 AND p <= 0.10: the gain is there and the p is not.

| variant | reached of 240 | collided | left | timed out |
|---|---|---|---|---|
| m12 (incumbent) | 215 (90%) | 19 | 5 | 1 |
| m16 | 220 (92%) | 16 | 2 | 2 |
| m10 | 215 (90%) | 20 | 4 | 1 |
| **m8** (the DEV choice) | **221 (92%)** | 15 | 3 | 1 |
| m6 | 214 (89%) | 23 | 2 | 1 |
| v0 | 215 (90%) | 19 | 5 | 1 |
| v10 | 214 (89%) | 20 | 5 | 1 |

By kind (reached of 60, m12 / m8): hard-islands 59 / 59, **hard-gaps 60 / 60 (every one of the seven variants reached 60 of 60 on the gaps)**, hard-current 54 / 56, hard-traffic 42 / 46. **Predictions:** M1 (the DEV choice is the incumbent) MISSED; M2 (the verdict is the incumbent's) HELD; M3 HELD; M4 HELD; M5 HELD; M6 HELD.

**Post hoc (not registered, from the file):** against m12, m16 gained 5 (10 only m16, 5 only m12; p 0.30), m10 0 (7 and 7), m6 -1 (11 and 12), v0 0 (3 and 3), v10 -1 (2 and 3). m8's gain is in hard-traffic (7 scenarios won, 3 lost) and hard-current (3 and 1); hard-islands is 1 and 1 and hard-gaps 0 and 0.

**What it says.** No margin variant is distinguishable from the incumbent on 240 fresh scenarios, and the sweep covers a top rung of 6 to 16 m and a vertical margin of 0 to 10 m. Two of the four kinds are at their ceiling (islands 58-59 of 60, gaps 60 of 60 for ALL seven variants), so the sweep could only ever have moved hard-current and hard-traffic, and there the differences are a handful of scenarios inside the noise of 60. The caveat both write-ups carried -- "the margin was never swept" -- is closed in the direction of "it does not matter here"; it is NOT closed for a denser or narrower sea or a worse position fix, which this round did not test.

## ITEM 2, RESULT: **PARTLY SUPPORTED** under the registered rule -- the designated arm gained 7 (p 0.14) -- AND THE ARM THAT WON IS NOT THE ONE REGISTERED

200 scenarios (100 hard-current, 100 hard-current-gap). Designated `any+crab+margin` against `any`, paired: **12 only the designated arm, 5 only `any`, both 183; gain 7, sign-test p 0.1435**: the gain bar (5) is met, the p bar (0.10) is not, and the designated arm has fewer collisions (3 against 9), so by the registered rule PARTLY SUPPORTED.

| kind | arm | reached | collided | left | timed out | median path / chord |
|---|---|---|---|---|---|---|
| hard-current | any | 93/100 | 5 | 2 | 0 | 1.09 |
| | any+crab | **100/100** | 0 | 0 | 0 | 1.03 |
| | any+crab+margin (designated) | 97/100 | 1 | 0 | 2 | 1.06 |
| | any+crab-mean | **100/100** | 0 | 0 | 0 | 1.03 |
| hard-current-gap | any | 95/100 | 4 | 0 | 1 | 1.05 |
| | any+crab | 98/100 | 2 | 0 | 0 | 1.01 |
| | any+crab+margin (designated) | 98/100 | 2 | 0 | 0 | 1.00 |
| | any+crab-mean | 98/100 | 2 | 0 | 0 | 1.00 |

**Predictions:** C1 (crab alone does not beat `any` by 5) MISSED -- it gained 10; C2 (the mean-told arm reaches at least as many as the estimating one) HELD; C3 (`any` reaches fewer on the gap kind) MISSED (95 on the gap kind, 93 on hard-current); C4 (the designated arm's path is at least `any`'s) MISSED; C5 (the estimate within 0.25 m/s of the mean at 60 s on 75 percent) HELD at 100 percent; C6 SUPPORTED MISSED, PARTLY HELD.

**Post hoc, labelled (from the file; not registered; moves nothing):**
* **The crab alone is the finding.** `any+crab` against `any`: 12 only the crab, 2 only `any`, **gain 10, p 0.0129** (7 and 0 on hard-current, 5 and 2 on the gap kind); it has no collision on hard-current. It is the second arm of four, so this p is one of three post hoc looks and is not corrected for that, and it is NOT the registered comparison: **it wants its own fresh set before it is called a result.**
* **The growing margin cost the designated arm.** Against the crab alone it lost 3 scenarios and won none (p 0.25): both lost flights are TIMEOUTS on hard-current at mean currents of about 1.5 m/s, where the top rung grows to 28-31 m and the detour takes more than 260 s. K = 12 s was derived and fixed in advance, as registered; it was not tuned, and the result says it is too much at the top end of this current family.
* **The estimate is as good as knowing the mean.** `any+crab` and `any+crab-mean` both reach 198 of 200; the estimate's error at 60 s has a median of 0.082 m/s and a maximum of 0.187 m/s. (The estimator reads the perfect logs, so this says the smoothing costs nothing, not that a real log would.)
* `any` failed 12 of 200: 9 collisions, 2 exits through the edge, 1 timeout.

**What it says.** A vessel that is told, by its own logs, what current it is in and points its nose into it makes good a straighter track (path 1.03 of the chord against 1.09, and 7 more arrivals on hard-current) -- that is the post hoc result, and it is large relative to the noise. The registered idea of widening the margin by the current did not add to it and cost two timeouts. The current-in-the-COST and the corner-angle margin were not tried (said in the registration).

## ITEM 3, RESULT: **SUPPORTED** -- the estimated-velocity arm reached 54 of 60 against the assumed-velocity arm's 47, with no flight leaving the region

60 `hard-reactive` scenarios (183 ships: 58 that hold, 54 that turn away, 71 that stop). Designated `any+predict-est+edge+yield` against `any+predict+edge+yield` (HELD5's fix arm with the ships' original velocities), paired: **8 only the designated arm, 1 only the assumed-velocity arm, both 46, neither 5; gain 7, sign-test p 0.0391; no exit.** The rule (gain 5, p <= 0.10, no exit) is met.

| arm | reached | collided | left | timed out | median path / chord |
|---|---|---|---|---|---|
| hard-reactive any+replan | 41/60 (68%) | 17 | 0 | 2 | 1.03 |
| hard-reactive any+predict (assumed velocity) | 44/60 (73%) | 4 | 12 | 0 | 1.32 |
| hard-reactive any+predict+edge+yield (assumed; the reference) | 47/60 (78%) | 9 | 4 | 0 | 1.20 |
| hard-reactive any+predict-est (estimated velocity) | 40/60 (67%) | 7 | 13 | 0 | 1.13 |
| **hard-reactive any+predict-est+edge+yield (designated)** | **54/60 (90%)** | 6 | 0 | 0 | 1.09 |
| hard-traffic any+predict+edge+yield (the same seeds, ships that hold) | 38/60 (63%) | 20 | 1 | 1 | 1.14 |

**Predictions:** R1 (the reaction changes the assumed-velocity arm's reach by at least 5) HELD (47 against 38); R2 (it RAISES it) HELD; R3 (the designated arm reaches at least as many as `any+replan`) HELD; R4 SUPPORTED HELD (and NOT SUPPORTED missed); R5 (a `stops` ship is hit less per ship than a `holds` ship) HELD (2 hits in 71 stops ships, 0 in 54 turning ships, 4 in 58 holding ships); R6 (no timeout) HELD.

**Post hoc, labelled:**
* **The estimated model alone does not win.** Without the edge band and the yield rule, the estimated-velocity arm (`any+predict-est`, 40 of 60) is BELOW the assumed one (`any+predict`, 44 of 60), and 13 of its 20 failures are exits through the edge. The win is the estimated model WITH the edge and yield: against `any+predict-est` the same arm gained 17 and lost 3 (p 0.0026). What the filter buys is visible only in combination.
* **Ships that answer help the vessel.** The assumed-velocity fix arm reached 47 on `hard-reactive` and 38 on `hard-traffic` (the same seeds, ships that hold): paired by seed 13 gained and 4 lost (p 0.049). Collisions with ships that hold, per ship, are about 7 percent; with ships that stop 3 percent; with ships that turn none.
* The designated arm is also faster: median arrival 151.6 s against 174.9 s.
* The designated arm against `any+replan`: 16 only the designated arm, 3 only `any+replan` (p 0.0044).

**What it says.** On ships that turn away from or stop for the vessel, a plan that estimates each ship's velocity from where it sees it, widened at the edge and slowed at a predicted conflict, reached 90 percent of fresh scenarios with no exit; the same plan on the velocities the ships started with reached 78. **What it does not say:** the rule that makes the ships answer is mine and simple (one rule, no right of way, no ship that tries to ram), the filter sees exact positions, collisions with a static obstacle after a ship's turn are ignored, and the comparison that the registration made is between the two edge-and-yield arms; the estimate by itself is not shown to help.

## Not checked, said plainly

The margin sweep covers one sea family at an exact fix; the crab result is post hoc and unreplicated; K was not swept; the current is uniform in space; the reactive ships' rule was not varied (the turn rate, the sense range, the clearance); the three HELD sets are 240, 200 and 60 scenarios. The gates for the module and the command are sabotaged and logged in their headers (three passes each; the survivors left are argued equivalent there).

# ITEM 2 REPLICATE: THE CRAB ALONE, ON A FRESH SET (backlog nav-current-in-field; Keith 2026-11-17, "Let's do all the next sandbox rounds, smallest first"; REGISTERED 2026-11-17, BEFORE ANY CODE FOR IT AND BEFORE ANY OF ITS SEEDS IS FLOWN)

**Why.** Item 2's strongest reading was post hoc: `any+crab` against `any`, gain 10, p 0.0129. It was the second arm of four, and the note said "it wants its own fresh set before it is called a result". This is that set. Nothing in the arms changes: `any` and `any+crab` are flown exactly as item 2 flew them (`brain/subNavPlus.mjs` PLUS_ARMS, tau 15 s, the estimate from the vessel's own logs, no margin growth).

**The set.** HELD73 = seeds 7301 to 7400 of each of `hard-current` and `hard-current-gap`: 200 scenarios, 400 flights, flown ONCE. These seeds are spent by no navigation module (checked against every `range(...)` in brain/sub*Nav*.mjs, subGiveWay, subSensedNav, subNav3d and subTankNav). DEV (seeds 1 to 30) is flown first as a sanity run and is not a result.

**The registered test.** `any+crab` against `any`, paired by scenario, both kinds pooled. Gain = (only the crab reached) - (only `any` reached); p = the exact two-sided sign test on the discordant pairs.
* **SUPPORTED** iff gain >= 5, p <= 0.05 AND the crab has no more collisions than `any`. The p bar is 0.05, not item 2's 0.10, because this confirms a finding that was chosen after looking.
* **PARTLY SUPPORTED** iff gain >= 3 and not SUPPORTED.
* **NOT SUPPORTED** otherwise. **HARMFUL** is printed beside the verdict if gain <= -5.

**Checks (a failure: NOT WEIGHED).** (1) SAME SCENARIOS: both arms fly the same 200 scenarios in the same order. (2) THE ARMS ARE ITEM 2'S: on item 2's first five HELD71 seeds of each kind, both arms reproduce the flights stored in `brain/subNavPlusCurrentHeld71.jsonl` (status, ticks and path). (3) THE CRAB BITES: the two arms differ on at least one flight.

**Expectations, written before any seed is flown.**
* E1 the verdict is SUPPORTED: about 60 percent. Item 2's gain of 10 in 200 shrinks toward the registered arm's 7 on a fresh draw, and 5 at p 0.05 needs roughly 9 to 1 among the discordant pairs, or 12 to 3.
* E2 the crab reaches at least 97 of 100 on hard-current: about 75 percent (item 2: 100).
* E3 the crab's median path / chord is below `any`'s on hard-current: about 85 percent (1.03 against 1.09).
* E4 the gain is larger on hard-current than on the gap kind: about 70 percent (7 against 3 in item 2).

**What a result would not say.** The logs the estimate reads are perfect (no sensor noise), the current is steady per scenario, and the vessel is the PD autopilot's. SUPPORTED says that pointing into a known current helps this planner reach goals in these two kinds, nothing about a real current meter.

## ITEM 2 REPLICATE, RESULT (2026-11-17; `node tools/ship/subNavPlusStudy.mjs --study crab --set held73 --write`, HELD73 = seeds 7301 to 7400 of both kinds, flown ONCE; 400 flights in `brain/subNavPlusCrabHeld73.jsonl`): **SUPPORTED**

The study, its checks and its gates were committed and sabotaged first (9ed89170; 14 mutants logged in `tools/ship/subNavPlusStudy-selfcheck.mjs`). DEV was flown once as the sanity run (PARTLY SUPPORTED on 60 scenarios, not a result). All three checks passed: both arms reproduce item 2's stored HELD71 flights tick for tick, so these are the same arms.

| kind | arm | reached | collided | left | timed out | median path / chord |
|---|---|---|---|---|---|---|
| hard-current | any | 95/100 | 4 | 1 | 0 | 1.087 |
| | any+crab | 96/100 | 3 | 1 | 0 | 1.035 |
| hard-current-gap | any | 90/100 | 9 | 0 | 1 | 1.069 |
| | any+crab | **98/100** | 2 | 0 | 0 | 1.015 |

`any+crab` against `any`, pooled and paired: **12 only the crab, 3 only `any`, both 182, neither 3; gain 9, exact sign p 0.0352; collisions 5 against 13.** Every bar is met (gain >= 5, p <= 0.05, no more collisions), so the verdict is **SUPPORTED**.

**Against the expectations (written first).** E1 SUPPORTED, about 60: held. E2 the crab reaches at least 97 on hard-current, about 75: MISSED (96; one exit and three collisions). E3 a shorter path on hard-current, about 85: held (1.035 against 1.087). E4 the gain larger on hard-current than on the gap kind, about 70: MISSED, and by a lot. The gain is 1 on hard-current (3 to 2) and 8 on the gap kind (9 to 1). Item 2 had it the other way round: 7 to 0 on hard-current, 5 to 2 on the gap kind.

**What it says.** Pointing the nose into a current the vessel estimates from its own logs helps this planner reach its goals on a fresh set of both current kinds, mostly by not colliding (5 against 13). The track is straighter on both kinds (path / chord 1.035 and 1.015 against 1.087 and 1.069). Two draws of 200 now agree on the pooled gain (10, then 9). They disagree on WHICH kind it comes from, so the per-kind split should not be read as a property of the kinds.

**Not checked, said plainly.** The estimate reads perfect logs. The current is uniform in space and steady per scenario. The vessel is the PD autopilot's. The crab is not yet an option of the tank's couriers or of `subHardNav`'s default arms. Making it the default is a separate decision, not taken here.

# ITEM 2, PART 2: THE CURRENT IN THE COST -- A DIRECTIONAL ROUTE SOLVER (backlog nav-current-in-field; Keith 2026-11-18, "do the directional route solver round next"; REGISTERED 2026-11-18, BEFORE ANY CODE FOR IT AND BEFORE ANY OF ITS SEEDS IS FLOWN)

**What is open.** The plan does not know the current: brain/flowfieldCpu.js (the shared solver, a drop-in for the GPU Brain fleet's FlowFieldSolver) costs entering a cell the same from every side. This round builds a SEPARATE directional solver; the shared one is NOT edited.

**WHY THE FIRST DRAFT WAS DROPPED, said before anything was built.** The first draft flew the directional solver in the hard-current kinds' UNIFORM current. A review of the draft (three independent lenses, each finding checked by a skeptic; nothing flown on any held seed) showed it tests close to nothing, and I accept the argument: in a uniform current c at water speed V the time to cross a vector v is [-(c.v) + sqrt((c.v)^2 + (V^2 - |c|^2)|v|^2)] / (V^2 - |c|^2). The first term sums to the same value along every route between two points, so what a uniform current does to ROUTE CHOICE is only the second term, an elliptic stretch of V / sqrt(V^2 - |c|^2) along its axis (1.04 at 0.8 m/s, 1.09 at 1.2), the same for +c and -c. On a 4-neighbour grid a route monotone in x is ranked exactly as in still water. The reviewers measured it on DEV (seeds 1 to 30, the mean current, field only): the start cell's aim point was the same in 60 of 60 fields, and no aim point at all moved on any of the 30 hard-current-gap fields. The draft also had a solver that would not terminate (a float64 test against float32 distances re-expands cells without end once costs are not whole numbers) and checks that could not see a reversed sign. Both are fixed below. **A directional cost matters where the current VARIES IN SPACE.** That is what this round tests.

## PART A: THE UNIFORM CURRENT, RECORDED (no flight)

On DEV seeds 1 to 30 of hard-current and hard-current-gap (60 fields, spent as DEV by item 2), build the t = 0 plan (the ladder) with the shared solver and with the directional solver in the scenario's mean current. BITE = the share of the 60 whose start-cell aim heading differs by more than 5 degrees. **Bar: 15 percent.** Below it the uniform-current route arm is NOT FLOWN, and the "current in the cost" residue of nav-current-in-field closes as nothing to gain in a uniform current, by the stretch argument and by this measurement. **SAID PLAINLY: this is a record, not a test.** The reviewers already measured the equivalent figure on these fields before this registration (0 of 60).

## PART B: A STREAM THE PLAN KNOWS

**The kind (NEW: `hard-stream`).** For seed s: the start, the waypoint, the islands and icebergs and the weight error of `hard-current` for s; its uniform current is DROPPED. In its place, a steady STREAM drawn from a stream of its own (mulberry(s x 7919 + 90001)), in this order:
* direction theta ~ U(0, 2 pi);
* a point on its centre line P = (U(120, 280), U(-60, 60));
* half-width w ~ U(25, 45) m;
* peak speed S ~ U(1.2, 2.2) m/s.

The current at (x, y) is S cos^2(pi d / (2w)) (cos theta, sin theta) for |d| < w, where d is the signed distance from the centre line, and 0 outside. It is horizontal, uniform in depth and constant in time. The vessel cruises at 3 m/s, so against the core of a 2.2 m/s stream it makes 0.8 m/s good.

**What the vessel knows, said plainly.** The route arm's plan KNOWS THE STREAM'S MAP (an atlas), as every arm knows the static map exactly. Both arms crab on the vessel's OWN estimate from its logs (item 2's: tau 15 s), which lags as it crosses the stream.

**The solver (NEW: brain/flowfieldDirectional.mjs).**
* **Graph.** The nav grid. A backward multi-source exact Dijkstra from the waypoint's cell over the 4 neighbours. An edge between two cells is passable iff both are free or both are blocked (the nav field's two heights and impassDh).
* **Direction, fixed here.** When neighbour v is relaxed from the settled cell u, the vessel travels v -> u. The step is d = unit(u - v) in world (x, y), with gx along +x and gy along +y. The current is the one at the midpoint of the two cell centres.
* **Cost.** c_par = c.d; c_perp = |c - c_par d|. The step is impassable if c_perp >= V, or if g = c_par + sqrt(V^2 - c_perp^2) <= 0.05 m/s. Otherwise cost = round(cell x V / g x 1024) / 1024, in still-water metres. The costs are whole multiples of 1/1024, so tied routes stay exactly tied. With c = 0 every step costs exactly `cell`.
* **Relax.** dist is float32, and the relax compares in float32: nd = fround(d + cost); if nd < dist[v], store it and push nd. A cell is expanded once (a settled flag).
* **Flow.** The shared solver's rule (the 8-neighbour of lowest dist).
* **V** = N.CRUISE (3 m/s).
* **WITH c = 0 EVERYWHERE THE FIELD IS THE SHARED SOLVER'S BIT FOR BIT** (dist, fx, fz); the gate holds that on every DEV field. The gate also holds known answers on an empty grid: k cells up-current of the goal cost k x 5 x 3 / (3 + |c|), k cells down-current k x 5 x 3 / (3 - |c|), across the current k x 5 x 3 / sqrt(9 - |c|^2), each to the 1/1024 quantum. It bounds the pops by the cell count, and a sabotage that flips d must go red.

**The aim points of the route arm (NEW, in brain/subNavRoute.mjs).** buildAim's rule, with one more condition for taking the next cell's aim point. The straight segment from the cell's centre to that point must be clear (as before), AND its TIME must be no more than the plan's time from the cell to that point plus one cell (5 still-water metres). The segment's time is sampled every AIM_STEP at the current there, and is infinite if any sample is impassable. Otherwise the aim is the next cell's centre, as buildAim does. With c = 0 a straight segment is never longer than the staircase plus the waypoint's offset in its cell, so the aim points are buildAim's bit for bit (the gate holds that).

**Not edited:** brain/flowfieldCpu.js and brain/subHardNav.mjs. brain/subNavPlus.mjs gains options that are all off by default:
* `currentAt(x, y, t)`: the current the vessel feels, at its position;
* `planField`: the builder of the t = 0 plan;
* `aim`: the aim-point rule.

With them off, every flight is the flight it was (its gate's rows, and check 3 below).

**The arms (two; both build the plan ONCE at t = 0 with the margin ladder, and fly the crab on the estimate):**
* `any+crab` (the REFERENCE): the shared solver and buildAim, the plan blind to the stream.
* `any+crab+route` (**DESIGNATED**): the directional solver in the stream's map, and the time-aware aim points.

They differ ONLY in the plan.

**The set.** HELD86 = seeds 9301 to 9500 of `hard-stream`: 200 scenarios, 400 flights, flown ONCE. No navigation set names these seeds (9310 and 9400 appear in the tree only as sub-pilot training seeds, a different generator). DEV = seeds 1 to 30 of `hard-stream`, the sanity run and check 4. Nothing is chosen on DEV.

**The registered readings (paired by scenario).**
* **R1, TIME.** Over the scenarios both arms reach, r = t(route) / t(reference). **FASTER** iff the median r is at most 0.95 AND the exact two-sided sign test on r < 1 against r > 1 gives p <= 0.05. Ties, |r - 1| < 1e-9, are dropped.
* **R2, REACH.** gain = (only the route reached) - (only the reference reached); p is the exact two-sided sign test on the discordant scenarios.
* **THE VERDICT.**
  * **SUPPORTED** iff FASTER AND gain >= 0 AND the route has no more collisions than the reference.
  * **PARTLY SUPPORTED** iff not SUPPORTED and one of these holds:
    * FASTER (but a safety condition failed);
    * the median r is at most 0.98 with sign p <= 0.05;
    * gain >= 5 with p <= 0.10.
  * **NOT SUPPORTED** otherwise.
  * **HARMFUL** is printed beside the verdict iff gain <= -5.
* **Reported, moving nothing.** The status counts of each arm; median times; median path / chord; the share of scenarios whose start aim heading differs by more than 5 degrees; and the readings split by whether the stream lies along the track (|cos(theta - track bearing)| >= 0.7) or across it.

**Checks (a failure: NOT WEIGHED).**
1. **SAME SCENARIOS.** Both arms fly the same 200 scenarios in the same order.
2. **STILL WATER IS THE SHARED PLAN.** On DEV seeds 1 to 3 with the stream's speed set to 0, the two arms fly the same flight to the digit.
3. **THE OLD FLIGHTS STAND.** With the new options off, `any+crab` reproduces the flights stored in brain/subNavPlusCrabHeld73.jsonl on HELD73's first five seeds of each kind (status, ticks, path).
4. **THE ROUTE BITES (go or no-go, on DEV, BEFORE HELD86 is flown).** At least 15 percent of the 30 DEV scenarios have t = 0 start-cell aim headings differing by more than 5 degrees between the two plans. If not, HELD86 is NOT flown, and the round reads NOT FLOWN: THE STREAM DOES NOT MOVE THE PLAN.

**Expectations, written before any code or seed.**
* G1: check 4's bar is met, about 80 percent.
* G2: PART A's bar is met, about 3 percent (see the record above).
* G3: SUPPORTED about 40 percent; PARTLY about 25.
* G4: the median r is at most 0.95, about 50 percent.
* G5: the reach gain is at least 0, about 70 percent. An adverse stream along the track may run the reference out of time (260 s).
* G6: the route has no more collisions, about 55 percent. A route that rides a stream past islands, with a crab that lags, could hit more.
* G7: the reference times out at least 5 times on HELD86, about 45 percent.
* G8: the time gain is larger on along-track streams than on across-track ones, about 80 percent.

**What a result would not say.** Anything about a stream the vessel must sense rather than read from a map; a stream that varies in time or with depth; a vessel at another speed (V is the cruise); or the shared solver and the GPU fleet's (not edited). Nothing about the corner-angle margin (still open). `hard-stream` is a family I made with these parameters, and the stream is drawn independently of the islands.

### AMENDMENT 1 TO ITEM 2 PART 2 (2026-11-18; made AFTER the code was committed (01330867) and reviewed, BEFORE any DEV or HELD86 flight of hard-stream)

**What happened, said first.** Before flying anything registered, I had the code reviewed against this registration by three independent lenses, each finding checked by a skeptic. The reviewers were told not to touch DEV or HELD86. **They flew hard-stream seeds 501 to 700, which are in no set, with both arms, and so the following is now KNOWN to me before any registered flight:**
* the start-heading bite there was 24 of 200 (12 percent; in 30-seed windows 2, 5, 3, 8, 1 and 5), so a 30-seed DEV lands on either side of check 4's 15 percent bar about as often as not;
* of 194 scenarios both arms reached, 144 were EXACT TIES (the stream never touches the path either arm flies), and 50 differed;
* with the ties kept in R1's median, the median ratio is 1 (R1 not FASTER); with them dropped, about 0.973 (it would read PARTLY SUPPORTED).

Nothing below is chosen to change what that predicts.

**The tie reading is CONFIRMED AS CODED, not changed.** The registration's sentence "Ties, |r - 1| < 1e-9, are dropped" did not say whether it covers the median as well as the sign test. The code committed before any flight drops ties from the SIGN TEST only and keeps them in the MEDIAN, and its gate pinned that ("dropped from the sign test but stay in the median"), before anyone had flown a hard-stream seed. That is the usual sign-test convention, and the reading fixed before the data. Changing it now would flip the surrogate's reading to the better one, so it stays as it was. The report prints the counts, so a reader can see both.

**Procedural fixes (none touches an arm, a bar or a verdict rule):**
1. Checks 2 and 3 do not read the HELD86 flights, so they now run FIRST; a failure flies nothing and prints NOT WEIGHED. Before this, a failed check would have spent the held set on a read that could not be weighed.
2. HELD86 is refused without --write, and refused if its file already exists (flown ONCE).
3. The registered "reported" items are now printed for the flown set: its own start-heading share (field only), and the along/across split with its R1 and R2 numbers and collisions. Before this, only DEV's share and two medians were printed.
4. HARMFUL is printed beside the verdict.
5. Check 1 also requires the exact HELD86 seed list and kind.
6. PART A refuses flags it ignored.
7. Each written flight carries its stream and the along flag.
8. The gates: the still-water identity now covers every DEV field (120); the route gate no longer builds a DEV scenario (seed 7 became 507).

**Said plainly, not changed:** check 4 measures only the t = 0 start-cell heading, so a stream met later on the route (seeds 532 and 540 of the surrogate gained 7 and 10 percent with 0 degrees at the start) does not count toward it. PART A uses the route arm's time-aware aim points on the directional field. The lowest-dist flow is not the time-optimal successor under a directional cost, a limitation of the registered solver that a later round could fix with a successor rule that is the shared flow at c = 0.

**What I now expect (the registered expectations stand; this is added, and moves nothing).** Check 4 is about a coin flip. If HELD86 is flown, NOT SUPPORTED is the likely verdict under the reading as coded, because most scenarios tie.

## ITEM 2 PART 2, RESULT (2026-11-18; PART A: `node tools/ship/subNavRouteStudy.mjs --part a`; PART B: `--set dev`, then `--set held86 --write`, HELD86 = seeds 9301 to 9500 of hard-stream, flown ONCE; 400 flights in brain/subNavRouteHeld86.jsonl): **PART A: THE UNIFORM CURRENT DOES NOT MOVE THE PLAN. PART B: NOT SUPPORTED.**

**PART A (a record).** 0 of 60 DEV fields of hard-current and hard-current-gap, each planned in its mean current, have start headings more than 5 degrees apart. The uniform-current route arm is NOT FLOWN. Together with the stretch argument above, this closes the "current in the cost" residue of nav-current-in-field for a UNIFORM current: there is nothing for the cost to change.

**PART B.** On DEV, check 4 moved 7 of 30 (23.3 percent, bar 15), so HELD86 was flown. DEV itself read NOT SUPPORTED and is not a result. All four checks passed on HELD86: the same 200 scenarios; still water is the shared plan to the digit; the old HELD73 flights stand; the route bites.

| arm | reached | collided | timeout | median t (s) | median path / chord |
|---|---|---|---|---|---|
| any+crab (reference) | 195/200 | 3 | 2 | 135.3 | 1.043 |
| any+crab+route (designated) | 196/200 | 4 | 0 | 135.3 | 1.048 |

* **R1 TIME** (194 both reached): faster on 32, slower on 18, exact sign p 0.0649; median ratio 1.0000. **Not FASTER.**
* **R2 REACH**: 2 only the route (seeds 9419 and 9494, where the reference ran out of time), 1 only the reference (9473, where the route collided); gain 1, p 1.0; collisions 4 against 3.
* **Reported:**
  * Stream along the track: 97 both reached, faster 27 and slower 11 (p 0.0139), median 1.0000; collisions 2 against 1.
  * Stream across it: faster 5 and slower 7 (p 0.77); collisions 2 against 2.
  * 27 of the 200 HELD86 scenarios (13.5 percent) have start headings more than 5 degrees apart.
* **VERDICT: NOT SUPPORTED.** Not HARMFUL.

**Post hoc, read once from the file, moving nothing.**
* 144 of the 194 are exact ties: the stream never touches the path either arm flies.
* Over the 50 that differ, the median ratio is 0.9905. **So the tie reading Amendment 1 kept does not decide this round:** with ties dropped from the median too, 0.9905 is above the partial bar of 0.98, and the verdict is NOT SUPPORTED either way. The surrogate seeds 501 to 700 had suggested about 0.973 there, which would have read PARTLY; the held set did not repeat that.
* The time change summed over all 194 is -354.5 s, -1.8 s a scenario.
* The best ratios are 0.738, 0.741, 0.785, 0.801 and 0.824, four of the five with the stream along the track. The worst are 1.046 to 1.110.

**Against the expectations (written first).**
* G1, check 4's bar met (about 80): HELD.
* G2, PART A's bar met (about 3): not met, as expected.
* G3, SUPPORTED (about 40) or PARTLY (about 25): MISSED.
* G4, median at most 0.95 (about 50): MISSED.
* G5, reach gain at least 0 (about 70): HELD (gain 1).
* G6, no more collisions (about 55): MISSED (4 against 3).
* G7, the reference times out at least 5 times (about 45): MISSED (2).
* G8, the time gain larger along the track than across (about 80): HELD on the counts (27 to 11 against 5 to 7), not on the medians (1.0000 each).

**What it says.** A plan that knows the stream's map and costs its steps in time helps where the stream lies along the track and on the way. There it is faster on 27 scenarios against 11, by up to a quarter, and it rescued the two scenarios the reference ran out of time on. But in this family the stream touches the path in only about a quarter of scenarios, so most flights are identical and the registered median cannot move. It did not make the vessel safer (one more collision). **The directional solver works and is gated** (bit for bit the shared field in still water, the closed-form answers in a current, terminating). What it buys in this family is too rare to clear the bar.

**Not checked, said plainly.**
* The vessel reads the stream from a perfect map. The stream is steady and uniform in depth. The vessel is the PD autopilot's at the cruise speed.
* The lowest-dist flow is not the time-optimal successor under a directional cost (Amendment 1).
* A family where the stream crosses the track more often, or a verdict on the scenarios the stream touches, would be a new registration, not a re-reading of this one.
