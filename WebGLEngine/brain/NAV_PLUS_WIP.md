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
