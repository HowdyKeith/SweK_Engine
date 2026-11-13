# Submarine duel, item 2: a charge budget for speed (2026-11-13; UNNUMBERED; REGISTERED BEFORE ANY CODE FOR IT IS WRITTEN AND BEFORE ANY GEOMETRY OF ITS SETS IS FLOWN)

Keith, 2026-11-13: "let's do 1, then 2, then 7" -- item 2 is `sub-duel-energy-cost` of `brain/BACKLOG_2026-11-01.md` section E. Item 1 is `brain/SUB_ECCM_WIP.md`.

**What this changes in shared files, said first.** `brain/subDuel.mjs` gets one more option on `duel()` (`needs`), default OFF: with none every flight in the tree is the one it was, to the fingerprint, and a gate row holds that. `physics/mechanics/subNeeds.mjs` is NOT touched: the duel uses its `stepNeeds` layer as it stands. The tactician is not touched either.

## 1. What is known

* **Speed costs nothing in the duel but noise.** The tuned doctrine is "go fast and loud and shoot first": the search-ping champion (`brain/subTacticsThetaSearchPingWip.json`, seed 5100) searches at 4.5 m/s, the top speed, and tracks at 4.43, although speed makes a boat louder (119 dB at 4.5 m/s against 112 at 2) and deafer. The tournament and the leagues never asked what that costs the boat.
* **The needs model has the cost.** `physics/mechanics/subNeeds.mjs`: electrical power = 200 W of hotel load + |thrust x forward speed| / 0.5 (so about the cube of the speed in steady flight: 2.3 kW at 2 m/s, 26 kW at 4.5 m/s); a battery hull of 3.0 MJ ("tank-scale, minutes not days"); at 0 the screw is dead (the thrust command is forced to 0; planes and ballast still act). A duel with the default tactician lasts about 66 s of 240, so at the class's own capacity a boat flown at 2 m/s uses a twentieth of it and one flown at 4.5 m/s about 60 percent: **the cost will not bind at 3.0 MJ in a short duel; it can bind in a long one.**
* **What a dead screw does here (a choice of the layer, not of this note):** the boat slows to nothing and becomes the quietest thing in the water (100 dB at 0.5 m/s or less; a torpedo seeker hears such a boat from about 66 m). Running out of charge is not obviously a loss in a duel; that is what the read asks.

## 2. What is added

`duel(side, sc, { ..., needs })`, `needs` null by default, otherwise `{ cls, energyJ }`:

* each boat gets `initialNeeds(cls)` with its energy set to `energyJ` (at most the class's capacity; both boats alike); the hull step is `stepNeeds(model, state, needs, controls, dt)` instead of `S.stepSub(...)`; the boat's needs advance every tick. Underwater a battery never refills (it refills only within 0.7 m of the surface, and the tactician's depth is held to at least 12 m).
* the observation the tactician is handed gains `self.charge` (the fraction of the start left). **The default tactician does not read it**: the doctrines of this note change only through their speed numbers. A tactician that reads its charge is item `sub-tactician-features-evade-layer`'s business.
* the result gains `charge: [A, B]` (fractions left at the end) and `deadAt: [A, B]` (the tick the screw died, or null), only when `needs` is given.

## 3. The ladder, and the rule that says where the cost binds (MY CHOICES, said)

Capacity of the start charge, joules: **rung 0: 3.0e6 (the class's own), 1: 1.5e6, 2: 0.75e6, 3: 0.4e6, 4: 0.2e6.**

**A rung BINDS iff** in the DEV duels of the tuned fast doctrine (the search-ping champion, seed 5100) against the default tactician, both seats, no kit, a boat's screw dies before the duel ends in at least **25 percent of the boat-duels** (counted over both boats, so out of twice the duels). **The task is the first (largest-capacity) rung that binds.** If none binds the read is not flown: the result is that a budget of these sizes does not bind within a duel.

## 4. The sets and the reads

* **DEV (calibration; not a result):** geometries **94001 to 94024** (`subTournament.geometries(24, 94001)`), both seats, 48 duels a rung. Smoke tests use seeds 1 to 4 only. Seeds 90001 to 90024, 92001 to 92024 and 91001 to 91024 belong to item 1 and are not used here.
* **HELD (flown ONCE for the chosen rung):** geometries **95001 to 95024**, same shape. The command refuses to fly it unless it records the result.
* **Read 1, the doctrines' ranking with and without the cost.** The round robin of `brain/subTournament.mjs` (every pair, both seats, Bradley-Terry rating, the paired edge and its standard error) among four doctrines flown with the PD autopilot: the **default** tactician; the **tuned** one (`brain/subTacticsThetaWip.json`, seed 5000); the **search-ping** champion (5100); the **league 7001 generation 3** theta (`brain/subTacticsLeagueWip.json`) -- once with no `needs`, once at the chosen rung. **Reading, fixed now:** the cost MATTERS to the ranking iff in at least one of the six pairs the sign of the edge differs between the two runs and the larger of the two |edges| is at least 0.05 (one net hit) with z at least 2 in the run where it is larger; else it does not (the order may still move inside the noise: printed). Also printed: for each doctrine the share of its boat-duels in which its screw died, and its mean charge left.
* **Read 2, the doctrine re-tuned under the cost.** The tool of `tools/tuneSubTactics.mjs` (a (1+1)-ES over the twelve numbers, 4 searches of 150 iterations, seeds 6100 to 6103, from the DEFAULT, against the four scripted drones on `TRAIN_SET`, the champion picked on `HELD_OUT_SET`) is run with `needs` at the chosen rung, so that the search sees the cost; the champion's speeds are compared with those of the no-cost champion of seed 5100. **Reading, fixed now:** the doctrine SLOWS iff the mean of the champion's `searchSpeed` and `trackSpeed` is at least **0.5 m/s** below the no-cost champion's (4.46); it is as fast iff within 0.5; faster otherwise. The searches are expensive (about 4 x 150 x 24 duels); `AUDIT_SET` is not read.
* **Checks that void a read, said and not weighed:** every arm flew the same geometries; no score is non-finite; with no `needs` the duel is byte-identical (fingerprints of 20 duels pinned before the hook); at the chosen rung the cost FIRES (a screw died in at least one duel of the calibration arm); a side against itself has an edge of exactly 0.

## 5. Forecasts, written before any geometry is flown

* The class's own capacity (rung 0) does NOT bind: **90**. Some rung binds: **80**. The first binding rung is 2 or 3: **55**.
* Read 1: the cost MATTERS to the ranking by the rule: **40** (the doctrines win in under 70 s; a cost that binds only late changes few duels). The search-ping champion stays above the default in the cost run: **75**.
* Read 2: the re-tuned doctrine SLOWS by the rule: **55**; it stays as fast: **35**.
* In the calibration arm, a boat whose screw died is sunk in more of its duels than the boat whose screw did not: **65** (it cannot run; it is quiet, which the seeker half-forgives).

## 6. What a result would not say

That a real boat's battery is 0.75 MJ or that real hotel loads are 200 W: the capacities are mine and the layer's numbers are its own, "tank-scale". That the doctrine a search finds under a cost is a good doctrine: it is the best of a 12-number family against four scripted drones. That a tactician which READ its charge would not do better (it is not asked). Anything about the countermeasures (no kit is flown here). Nothing is tuned after the HELD read.

## AMENDMENT A (2026-11-13; made after the command was written and smoke-run on geometries 1 to 4, BEFORE any DEV geometry (94001 to 94024) or HELD geometry (95001 to 95024) was flown)

**What the smoke run (geometries 1 to 4, the only geometries any code of this note has flown; a smoke run is not a result) showed that the registered reading rule would miss.** At a capacity where the cost binds (0.75 MJ) the screws of the fast doctrines die at about 30 s and every duel between them stops being decisive: the edge of the league doctrine over the others goes from about -3.2 to about -0.01 (a tie, with a tiny standard error), while the hand tactician still loses to all of them by about -2.5. **No sign flips**, so read 1's rule (a flipped sign with the larger |edge| at least 0.05 and z at least 2) would say "the cost does not matter to the ranking" about a ranking whose top three have become indistinguishable. The rule stands as registered (it was written before this and is not to be fitted to it), and **two numbers are added to what read 1 PRINTS, not to its rule**: the share of duels in which a boat is sunk, with and without the cost, and the spread of the Bradley-Terry ratings (best less worst) with and without it. The reading of read 1 will say both what the rule says and what these two numbers show. Nothing else in the note changes; the forecasts stand as written (the one on read 1, "the cost MATTERS to the ranking by the rule: 40", is scored on the rule as written).

