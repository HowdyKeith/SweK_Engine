# The Sub Aquarium's pilot kinds: the stateful fly pilot in the tank (round 2 of the 2026-10-31 list; UNNUMBERED; this file is the design, written BEFORE the code, and then the record)

Keith, 2026-10-31: "do the stateful fly pilot in the tank next, and then flow-field waypoints, and the GPU batch-size crossover". This is the first of the three. Rounds 3 and 4 have their own notes.

## What stood in the way, found by reading the tree

`brain/SUBMARINE_WIP.md` (the TODO of 2026-10-25, item 4) said the stateful fly pilot was "blocked twice": the tank validates 963 weights and the pilot has 1,729, and there was no champion to show. The second block is gone: rung 4a stage A (`brain/flyCxStageA.jsonl`) holds a `cx` record, champion seed 31003, `qualifies: true`, with its 1,729 weights. The first is two places:
* **The wire** (`ai-bridge/subAquariumCore.js`) already knows circuits by name: `WEIGHTS = { gfc: 963 }` and `validateSub` checks a sub's weights against `WEIGHTS[circuit]`. A second circuit is one entry and a recipe.
* **The tank** (`render/subAquariumSim.mjs`) flies a sub's network only if `weights.length === PS.WEIGHT_COUNT` (963) and otherwise flies the PD autopilot, ignoring the circuit name. That is the wall.
The stateful pilot (`brain/pilotSubCircuitState.mjs`, `createStatePolicy(circuit).pilotFor(weights)`) also needs the fly's heading-loop circuit (`vendor/hemibrain/hemibrain-cx-heading-loop.json`, which the page already loads for the dropout view) and carries a state from tick to tick that it RESETS whenever the target OBJECT changes. The tank hands every pilot a fresh target object each tick while a sub is outside its steering box, and the event wrappers make a new one each tick too, so the pilot cannot be handed the tank's target as it is.

## The design

1. **The wire gets a second circuit, `flycx`** (stateful network: the fly's central-complex heading loop as a reservoir with memory, exactly 1,729 finite weights, each |w| <= 1000, the same rules as `gfc`). A sub's list label is `autopilot`, `network` (gfc) or `stateful` (flycx). The weights file is `brain/pilotSubFlyCxWip.json` (NOT named `pilotSubWeights*Wip.json`: the bridge's chips count those as pilots wired to the Giant Fiber Circuit, which this is not). It carries its provenance (source file, spec, champion seed, qualifies, the audit scores, a sha256 of the weights) and is written by a gated tool, `tools/ship/flyCxPilotFile.mjs`, from the `cx` record, never by hand. `SEED_RECIPES` gains "Fly heading-loop pilot (rung 4a)".
2. **The tank gets a registry of pilot kinds.** `tank.registerPilotKind(circuit, kind)`, `kind = { weightCount, build(weights, ctx) -> pilot(state, target, current, aux) }`, `ctx = { sub }`. A sub whose `circuit` names a registered kind and whose weights have the kind's count is flown by `kind.build`; `gfc` keeps its built-in path; anything else (no weights, a wrong count, an unregistered circuit) flies the autopilot as before. A page registers a kind after it has loaded what the kind needs (as it registers the estimators), so **registering re-seats the subs already in the tank** that were waiting for it. A kind that throws when building leaves the sub on the autopilot and says so. `setSteer` still refuses a sub that is not the 963-weight network.
3. **The kind of the stateful fly pilot** (`render/subAquariumFlyCx.mjs`, pure): `flyCxKind(circuit)` builds `createStatePolicy(circuit)` and wraps each sub's pilot so that (a) the policy is handed ONE target object per dive, rewritten each tick from the three fields the features read (depth, heading, speed) and replaced by a new object **when the sub's wandering target changes** (the tank's `sub.target` identity: a retarget, a wall turn or a respawn), which is the "new dive" that the policy resets its memory on; (b) the policy's 4th argument (`compassValid`) is passed through, so the compass events work on it as they do on the others. **Said plainly: in the tank the memory restarts at every new wandering target, as it does at the start of each of the 40 training dives; between retargets (20 to 45 s) it carries, where the training dives were 60 s.**
4. **The brain panel** gets the kind (`flycx`: "fly heading-loop circuit with memory (148 cells)", flown): its rows are the autopilot's laws that the pilot adds its residual to (the pilot IS those laws plus a readout of the circuit's 64 output cells), the note says so, and **the circuit's own activity is not drawn** (said on the panel, not left to be inferred). The policy map is the laws', labelled.
5. **The page** loads the kind once it has the circuit and registers it; "Offer my subs" then puts the stateful pilot in the tank beside the others.

## What it will and will not show (the result of rung 4a, restated so the tank is not read as a claim)

Rung 4a's RESULT (`brain/SUBMARINE_WIP.md`): the `cx` champion gains 0.143 over the plain autopilot through the compass dropout on the audit (the recipe's generic gain: every circuit gained 0.14 to 0.18), and **its heading error in the dark windows is 0.142 against the autopilot's 0.161 and the navigator's 0.047: it does not integrate**. So in the tank, a stateful sub put through the `dropout` event will lose its line like the plain autopilot, give or take; the tank shows that honestly (a measurement in the tank is recorded below). It is a pilot with a learned residual and a short memory, not a compass.

## PASS / FAIL (each a row of a gate; every new gate SABOTAGED and red by name)

1. The tool writes `brain/pilotSubFlyCxWip.json` from the `cx` record only if the record qualifies, has 1,729 finite weights, and the circuit's own count agrees; the file's sha256 matches its weights; the tool refuses a record that does not qualify, has the wrong count, a non-finite weight or a sigma outside [0, 1].
2. The wire accepts `flycx` with exactly 1,729 finite weights and refuses 963, 1,728, 1,730 and non-finite ones under that name; `gfc` still takes exactly 963; the list label is right; the seed recipe is offered when its file is present and skipped, by name, when it is not; `subId` differs between the same weights under the two circuits.
3. The tank flies a `flycx` sub with the registered kind: its commands equal `kind.build`'s pilot's on the same states; before registration it flies the autopilot and after registering it is re-seated without losing its place; a wrong count, an unregistered circuit and a throwing builder fly the autopilot; two subs with the same weights do not share a memory; a bad `registerPilotKind` call throws and changes nothing.
4. The stateful pilot's memory: it is carried between ticks on the same wandering target (the readout differs from a memoryless run), restarts exactly when the target changes (a retarget, a wall turn, a respawn) and **not** on the fresh target object the tank makes every tick outside the steering box, nor on the wrapped target of an event; it passes `compassValid` through; NO STATE (a pilot built with the memory switched off) differs from it.
5. The events work on it: `dropout` and `navigator` run on a stateful sub, `flood`/`surface`/`needs` run on it, an event ending leaves it flying; `setSteer` refuses it, naming the 963.
6. The panel: the `flycx` kind is flown and says what it shows and what it does not; the page registers the kind and a stateful sub appears and flies (a live-browser row).

## NOT in this round, said now

The fish pilot (803 weights, `brain/pilotSubFish.mjs`) is one more kind of the same shape and is not built here. The 3D view draws every sub alike. A peer needs the same page code to fly a stateful sub it is sent (the wire is data; a peer without the kind flies the autopilot, which is the existing rule). The circuit's activity is not drawn.

## BUILT (2026-10-31, same day; UNNUMBERED; what is in the tree, each piece gated and sabotaged)

* `tools/ship/flyCxPilotFile.mjs` (+ gate, 79 mutants all red) writes `brain/pilotSubFlyCxWip.json` from the `cx` record of `brain/flyCxStageA.jsonl` (champion seed 31003, 1,729 weights, memory gain checked in [0, 1], sha256 of the weights, the audit scores and a `limits` paragraph that says the gain is the recipe's generic gain and not a compass skill). `--check` goes red if the source moves and the file does not.
* `ai-bridge/subAquariumCore.js` (gate: 32 more mutants, 29 red on the first run, the rest closed or said): `WEIGHTS = { gfc: 963, flycx: 1729 }`, the list says `stateful` for a flycx sub, a seed recipe that names its circuit needs a file that declares it, `SEED_RECIPES` offers "Fly heading-loop pilot (rung 4a)". The bridge gate counts seven offered subs.
* `render/subAquariumFlyCx.mjs` (gate: 38 mutants, all red): the kind. One target object per dive; the memory restarts when `sub.target` changes (retarget, wall turn, respawn) and **not** on the fresh target objects the tank hands the pilot every tick. Said plainly in the file: in the tank the memory restarts at every new wandering target.
* `render/subAquariumSim.mjs` (gate section 12: 54 mutants, 49 red by name, 4 red by a thrown error, 1 equivalent): `registerPilotKind(circuit, kind)`, re-seating subs that were waiting, a throwing builder leaves the sub on the autopilot and says so (`kindError`), the snapshot carries `circuit`, `kind`, `kindError`.
* `render/brainPanel.mjs` (gate: 14 mutants, all red by name): the `flycx` kind is flown, shows the autopilot's laws it adds a residual to, and says on the panel that the circuit's activity is **not** drawn.
* `sub-aquarium.html` (page gate: 9 mutants, all red by name): imports the kind after the circuit loads and registers it; the list reads `stateful` only for a sub the tank really flies with the kind (a module that fails to load leaves the sub on the autopilot, the list reads `PD autopilot`, and a row of the page gate refuses the module in a real browser to prove it).
* `tools/tankFlyCxBench.mjs` (+ gate, 56 mutants, all red by name): the measurement below.

## MEASURED: what the stateful pilot does in the tank (`node tools/tankFlyCxBench.mjs --ids 24 --seconds 240`, 21 s)

Four arms in four one-sub tanks, the same 24 sub ids in every arm (so the same spawn and the same first targets), 240 s each, once with no event and once through the tank's own compass dropout (16 s dark in every 40). The number is the angle between the sub's heading and its wandering target's, in radians, mean +- sd over the 24 ids. Two readings: SETTLED (at least 12 s after the target last changed, "does it hold its line") and ALL ticks (includes the slow turn onto each new target; the vessel turns at about 0.06 rad/s at full rudder, so a half-turn takes 40 s and the target changes every 20 to 45 s).

SETTLED ticks:

| arm | no event, lit | dropout, lit | dropout, DARK | dark - autopilot (paired) | dark - lit |
|---|---|---|---|---|---|
| autopilot | 0.639 +- 0.235 | 0.691 +- 0.272 | 0.709 +- 0.274 | 0 | +0.018 +- 0.268 |
| network (gfc, 963) | 0.418 +- 0.218 | 0.410 +- 0.184 | 0.342 +- 0.153 | -0.367 +- 0.207 | -0.068 +- 0.192 |
| stateful (flycx, 1,729) | 0.558 +- 0.243 | 0.566 +- 0.242 | 0.579 +- 0.220 | -0.131 +- 0.175 | +0.012 +- 0.210 |
| stateless (same weights, memory off) | 0.611 +- 0.242 | 0.631 +- 0.267 | 0.638 +- 0.231 | -0.071 +- 0.113 | +0.007 +- 0.256 |

(ALL ticks reads the same way: dark - autopilot -0.251 network, -0.106 stateful, -0.064 stateless; nothing was lost in any run. Full tables: the command above.)

**What it says.**
* The stateful sub holds its line better than the plain autopilot in the tank (dark minus autopilot -0.131 with a spread of 0.175 over 24 ids, a standard error near 0.036), **and it does so with the compass lit too** (0.558 against 0.639 with no event at all). Its advantage in the dark (-0.131) is the same size as in the light (dropout lit 0.566 against 0.691, -0.125). The dropout adds nothing to it: its dark minus lit is +0.012, the autopilot's +0.018. **This is rung 4a's finding again, in a different place: the gain is generic and it is not a compass skill.** A pilot that integrated a heading through the dark would show a dark advantage larger than its lit one; this one does not.
* The memory is worth something in the tank but not much and not shown to be more than that: the stateless arm (same weights, memory wiped every tick) sits between the autopilot and the stateful one in every column (dark minus autopilot -0.071 against -0.131). The difference between the two arms is NOT paired-tested here (each paired sd is against the autopilot), so it is read off the table and not claimed.
* The 963-weight network (the noisy-senses champion, trained on a different task) holds its line better than either, lit and dark. That is the tank's order of pilots, not a statement about circuits: it is a different training, a different run length and a different network.
* **The dropout barely hurts a settled sub in this tank.** Dark minus lit is within 0.07 of zero for every arm (spreads 0.19 to 0.27): a sub on a settled target flies straight whether or not it can read the compass, so the settled reading cannot separate a compass skill. The tank is a poor place to test the thing the dropout was built to test (the study's 60 s dives with a current are the place); it is a fine place to see the pilots fly.

**What it does not say.** One champion (seed 31003), one hull (nominal), no current in the tank (`[0, 0, 0]`), 24 ids of 240 s, a heading-error reading that is not the study's score. It does not say the stateful pilot is better than the autopilot at anything the study scored beyond what rung 4a already said. It does not show the circuit's activity: the panel says so.

## Left for later, said

The fish pilot (803 weights) is one more kind of the same shape and is not built. A peer needs the page's registration to fly a stateful sub it is sent (the wire is data; a page without the kind flies the autopilot, the rule that already stood). The 3D view draws every sub alike. A paired test of stateful against stateless on the same ids is one more column in the bench, not run.

## FOLLOW-UP: DOES THE MEMORY MATTER? A PAIRED TEST OF STATEFUL AGAINST STATELESS (Keith, 2026-11-01; REGISTERED BEFORE THE TEST IS WRITTEN OR RUN)

**The gap.** The result above read "the stateless arm sits between the autopilot and the stateful one" off two columns, each paired against the AUTOPILOT, and said in so many words that the stateful-against-stateless difference was "not paired-tested". This tests it. The two arms fly the same 1,729 weights; the only difference is that the stateless one has its memory wiped every tick (`flyCxKind(circuit, { persist: false })`).

**The test.** NEW sub ids `pair-0` to `pair-23` (the first table used `bench-0` to `bench-23`; none of these has been flown), 240 s each, the same four-ish measures as before: the heading error to the wandering target, SETTLED ticks (at least 12 s after the target last changed). For each id and each of the two arms, once with no event and once through the tank's compass dropout. Per id the difference d = stateful minus stateless (negative = the memory helps). Three tests, each an EXACT two-sided sign-flip permutation test on the 24 differences (all 2^24 sign assignments, p = the share whose |sum| is at least the observed |sum|; no sampling), alpha 0.05:
* **P1 (lit)**: d of the settled error with NO event.
* **P2 (dark)**: d of the settled error in the DARK windows of the dropout run.
* **P3 (dark beyond lit)**: d(dark) minus d(lit, in the same dropout run): does the memory help MORE when the compass is out?
A test "holds" when its mean difference is negative AND p < 0.05. Also reported, not tested: the same differences over ALL ticks, the mean, sd and standard error of each, and the number of ids where the stateful sub was the better.
**Verdict rule.** MEMORY HELPS MORE IN THE DARK if P3 holds. MEMORY HELPS, NOT DARK-SPECIFIC if P1 and P2 hold and P3 does not. NO MEASURABLE EFFECT OF MEMORY if neither P1 nor P2 holds. MIXED otherwise (one of P1 and P2 holds, P3 does not).
**Expectation, written before the run (from the 24-id table, which is not one of these ids).** The first table had the stateful arm 0.053 below the stateless in the lit reading and 0.059 below in the dark: I expect P1 and P2 to hold (about 60% each) and P3 NOT to (about 80%), so MEMORY HELPS, NOT DARK-SPECIFIC is my modal guess at about 45%. It is a guess; the p-values decide.
**What it would not say.** One champion, one hull, no current, 24 ids of 240 s. A dark advantage that is not larger than the lit one is rung 4a's finding again (a generic gain), not a compass skill, whichever way P1 and P2 fall.

**Amendment to the paired test (made before the registered run).** A smoke run of the new command (4 ids, 100 s, to see that it prints) used the ids `pair-0` to `pair-3`, so the claim above that none of the registered ids had been flown was no longer true of them; nothing from that run is used. The test ids are renamed to `mem-0` to `mem-23`, which have not been flown at all. Nothing else is changed.

## RESULT OF THE PAIRED TEST (2026-11-01; `node tools/tankFlyCxBench.mjs --paired`, 15 s; new ids `mem-0` to `mem-23`, 240 s each, once, as registered): **MEMORY HELPS, NOT DARK-SPECIFIC**

Stateful minus stateless on the same ids, settled heading error to the wandering target in radians (negative = the memory helps); exact two-sided sign-flip permutation test over all 2^24 sign assignments:

| test | mean difference | sd | se | ids where the stateful sub was better | exact p |
|---|---|---|---|---|---|
| **P1** compass lit, no event | **-0.0553** | 0.0901 | 0.0184 | 20 of 24 | **0.0054** (holds) |
| **P2** dark windows of the dropout | **-0.1368** | 0.1509 | 0.0308 | 19 of 24 | **0.0002** (holds) |
| **P3** dark beyond lit (difference of differences) | -0.1037 | 0.2812 | 0.0574 | 16 of 24 | 0.0833 (does not hold) |
| all ticks, lit, no event (reported) | -0.0276 | 0.0962 | 0.0196 | 17 of 24 | 0.1899 |
| all ticks, DARK (reported) | -0.0769 | 0.1810 | 0.0370 | 20 of 24 | 0.0476 |

The expectation written first was P1 and P2 holding and P3 not: that is what happened (P3 by a short margin: 0.083 against 0.05).

**What it says.** Wiping the memory costs the stateful pilot real heading accuracy in this tank, and it does so with the compass lit (0.055 rad, p 0.005) and in the dark (0.137 rad, p 0.0002). The point estimate in the dark is two and a half times the lit one and P3's mean (-0.104) is not small, but its spread (sd 0.28) is, and the registered test cannot call it at 0.05: **"the memory helps more in the dark" is neither shown nor ruled out by 24 ids; "the memory helps" is shown.** A replication on fresh ids is the way to settle P3 and is not run here.

**The comparator is a HANDICAP, not a retrained control, and this matters.** The stateless arm is the trained champion's own weights with the memory wiped every tick; those weights were found with the memory in place. So the test measures what removing the memory costs THIS trained policy, which is the question asked ("does the memory matter to the pilot in the tank?"), and it does not say a pilot trained without memory would do worse than one trained with it. Rung 4a's NO STATE comparator was RETRAINED without memory and was not worse than the real wiring (`brain/RUNG_4A_CLOSEOUT.md`); the two results do not conflict. Also, as said at the top of this note, the memory restarts at every new wandering target in the tank (every 20 to 45 s).

**Still not said.** One champion, one hull, no current, 24 ids. The earlier table's "the stateless arm sits between the autopilot and the stateful one" is now a tested statement for the stateful-against-stateless half: the stateful arm is better than the stateless one, p 0.005 lit and 0.0002 dark.

## FOLLOW-UP 2: DOES THE DARK EFFECT OF THE MEMORY REPLICATE? THE PAIRED TEST ON 24 FRESH IDS, POOLED WITH THE FIRST 24 (2026-11-05; backlog `fly-pair-replication`; REGISTERED BEFORE THE COMMAND IS WRITTEN OR RUN)

**The gap.** The paired test above could not call P3 ("the memory helps MORE in the dark"): mean -0.1037 (sd 0.2812, se 0.0574), exact p 0.0833, on 24 ids. The backlog entry asks for the same registered test on fresh ids, judged on the pooled 48 under a rule written first. This is that rule.

**The test.** NEW ids `rep-0` to `rep-23` (a grep of the tree for `rep-<digit>` ids finds none flown by anything), 240 s each, the stateful and the stateless arm (the same 1,729 weights, memory wiped every tick for the second), each once with no event and once through the tank's compass dropout, exactly as the first test: `pairedBench({ prefix: "rep-" })` of `tools/tankFlyCxBench.mjs`, unchanged. Per id the differences d1 (P1, the settled lit error, no event), d2 (P2, the settled dark error of the dropout run), d3 (P3, d2 minus the same difference of the dropout run's lit error), each stateful minus stateless (negative = the memory helps).

**The pooled reading (THE REGISTERED ONE).** The first 24 (`mem-0`..`mem-23`) are flown AGAIN by the same command from the committed code (the first run is deterministic and its rows were not kept; **CHECK, run first:** the re-flown means of P1, P2 and P3 must equal the first result's printed -0.0553, -0.1368 and -0.1037 to the four places printed; if they do not, the code or the tank has changed since, the pooled reading is NOT made and the first line of the report says so). The 48 differences of each test are judged by an exact two-sided sign-flip test over all 2^48 sign assignments, done exactly by a count over the sums of the differences rounded to 1e-5 (the rounding is stated in the report; the first test's 2^24 enumeration is the same test at n 24). A test HOLDS iff its mean is negative and its p below 0.05 (the first test's rule). The verdict is the first test's `pairedVerdict` on the three pooled `holds`. Reported with it and NOT in the verdict: the same three tests on the 24 new ids alone, and on the first 24 alone.

**The bottom line on P3, generated by the rule written here.** (a) pooled P3 HOLDS -> `THE MEMORY HELPS MORE IN THE DARK (48 IDS)`. (b) pooled P3 does not hold AND its mean minus two se is above -0.1037 (the interval excludes an effect as large as the first run's estimate) -> `THE DARK EFFECT OF THE MEMORY IS SMALLER THAN THE FIRST ESTIMATE`. (c) otherwise -> `P3 IS STILL UNSETTLED`. (a) and (b) end the question for this champion, this hull and this tank; (c) says how many ids more would be needed (the report prints the ids at which a mean of -0.05 with the pooled sd would reach p 0.05, by the normal approximation, as a figure and not as a test).

**Expectations, written before any id is flown.** The first run's P1 and P2 held strongly (p 0.005 and 0.0002) and the stateful arm was the better on 20 and 19 of 24: pooled P1 holds about 90 percent, pooled P2 about 95 percent. P3's point estimate was 2.5 times the lit effect with a spread of 0.28: the true P3 is somewhere between 0 and -0.10; pooled P3 HOLDS about 45 percent, (b) about 20 percent, (c) about 35 percent. The verdict is MEMORY HELPS MORE IN THE DARK about 40 percent, MEMORY HELPS, NOT DARK-SPECIFIC about 55 percent, anything else about 5 percent.

**What it would not say.** One champion (seed 31003), one hull, no current, 240 s dives in a tank whose sub restarts the memory at every new wandering target; the stateless arm is the trained weights with the memory wiped, not a pilot retrained without memory (the rung 4a NO STATE comparator was retrained and was not worse than the real wiring). A pooled P3 that holds says the memory helps more in the dark THAN IN THE LIGHT FOR THIS POLICY, not that the fly's circuit integrates a heading: rung 4a measured that it does not (a single leaky unit does; `brain/pilotLeakyHeading.mjs`).

**What will be built (new files only; the bench is not edited):** `tools/ship/tankPairedReplicate.mjs` (the pooled exact test, the check, the report, the exit codes) and `tools/ship/tankPairedReplicate-selfcheck.mjs` with a mutation pass; then the run (about 40 s of flights), once.

**RESULT OF FOLLOW-UP 2, 2026-11-05 (`node tools/ship/tankPairedReplicate.mjs`, the registered 24 ids of 240 s, read once; gate and sabotage in `tools/ship/tankPairedReplicate-selfcheck.mjs`).** THE CHECK PASSED: the first 24 ids, re-flown from the committed code, print -0.0553, -0.1368 and -0.1037, so the pooled reading is made. Stateful minus stateless, negative = the memory helps; the exact two-sided sign-flip test over all 2^48 assignments (differences rounded to 1e-5):

| set | test | mean diff | sd | se | ids better | exact p |
|---|---|---|---|---|---|---|
| **POOLED, 48 ids (THE REGISTERED READING)** | P1 lit, no event | -0.0405 | 0.1077 | 0.0155 | 38/48 | 0.0119 HOLDS |
| | P2 dark windows | -0.1057 | 0.1675 | 0.0242 | 35/48 | 0.000073 HOLDS |
| | P3 dark beyond lit | -0.0675 | 0.2480 | 0.0358 | 29/48 | 0.0649 |
| the 24 new ids alone (`rep-`; reported) | P1 | -0.0256 | 0.1229 | 0.0251 | 18/24 | 0.3208 |
| | P2 | -0.0746 | 0.1803 | 0.0368 | 16/24 | 0.0549 |
| | P3 | -0.0314 | 0.2096 | 0.0428 | 13/24 | 0.4778 |
| the first 24 alone (`mem-`; reported, = the first result) | P1 / P2 / P3 | -0.0553 / -0.1368 / -0.1037 | 0.0901 / 0.1509 / 0.2812 | | 20, 19, 16 of 24 | 0.0054 / 0.0002 / 0.0833 |

**THE REGISTERED OUTCOME. VERDICT: MEMORY HELPS, NOT DARK-SPECIFIC. BOTTOM LINE ON P3: P3 IS STILL UNSETTLED** (rule (c)): pooled P3 does not hold (p 0.0649, 0.0149 above the line) and its mean minus two se, -0.1391, is below the first run's -0.1037, so the interval (-0.1391 to +0.0041) excludes neither zero nor an effect as large as the first estimate. The report's figure, not a test: at this pooled sd a mean of -0.05 reaches p 0.05 at about 95 ids.

**Scored against what I wrote beforehand.** Pooled P1 holds, about 90 percent: yes. Pooled P2 holds, about 95 percent: yes. Pooled P3 holds, about 45 percent: no. (b) smaller than the first estimate, about 20 percent: no. (c) unsettled, about 35 percent: yes. Verdict NOT DARK-SPECIFIC, about 55 percent: yes (MEMORY HELPS MORE IN THE DARK, about 40 percent, did not occur).

**What the numbers say, at the size they have.** (1) The direction replicates on all three tests: every mean of the new ids is negative and the stateful arm is the better on 18, 16 and 13 of the 24. (2) The size does not: the new ids' effects are 46, 55 and 30 percent of the first run's (P1, P2, P3), which is what a first estimate picked because it looked large would be expected to do on a replicate; the pooled means sit between the two sets. (3) The pooled P1 and P2 hold, but on the new ids alone neither does (P1 p 0.32; P2 p 0.0549, 0.0049 above the line), so the pooled significance leans on the first 24; a reader who wants only the unselected replicate has: the memory helps in the dark, probably, about 0.07, and has no measurable lit effect at 24 ids. (4) P3 is a difference of differences with a spread 2 to 3 times that of P1 and P2, and it is the test the replication was made for; it points the registered way (dark more than lit, -0.0675) and does not reach the line. Nothing in this run says P3 is zero; nothing says it is the first run's -0.10.

**What it does not say** (unchanged from the registration, and now with one more reason): one champion (seed 31003), one hull, no current, a tank whose sub restarts the memory at every new wandering target, a stateless arm that is the trained weights with the memory wiped. That the memory helps in the LIT windows too (P1 holds pooled) is itself a reading against a compass-specific mechanism for this policy; the dark-cost score of `tools/ship/takeTankDropout.mjs --cost` is the measurement made for that question, and it found the leaky unit and the navigator about as good as each other there and both ahead of the autopilot. Not read here: what 95 more ids would give (the figure is a normal approximation, not a plan); whether the first 24's selection (they were the first look) is the whole difference between the two sets, or whether the sets differ in anything else (the ids are seeded, the same bench; no other difference is known).
