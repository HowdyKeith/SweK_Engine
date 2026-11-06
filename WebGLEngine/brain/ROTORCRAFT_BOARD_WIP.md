# The helicopter and quadrotor brains on a board of their own: arms, controls and one registered read (2026-11-06; UNNUMBERED; REGISTERED BEFORE ANY CODE FOR IT IS WRITTEN AND BEFORE ANY SEED OF ITS SET IS FLOWN)

Keith, 2026-11-06: "lets queue up and proceed to do all those items" -- the first of them: the helicopter and quadrotor pilots (the hand autopilots, the fruit-fly network pilots of 1,167 weights, the quadrotor's MLP of 1,860) are on no page and in no tournament (`brain/capabilityMap.mjs`: the row `sky-rotor`, its quadrotor MLP cell "exists, unread"). This is item R1: put them on the switchboard's pattern -- the same seeds, every brain side by side, a paired reading against each brain's control -- and read them once.

## 1. What is built, and where

* **A board of their own, not the standard board.** `brain/switchboard.mjs` (the other chat's) is NOT edited, and the rotorcraft arms are not added to `standardBoard`: the board lists every arm of a task's LAYER by default, and a rotorcraft arm on the tank's `dropout` task would throw (it has no `entry()`), which would break `tools/ship/takeSwitchboard.mjs`'s default run. `brain/rotorcraftBoard.mjs` builds its own board with `createBoard()` and registers two flying-layer tasks, `rotor` and `drone`, and their arms through `addTask` / `addArm` -- the extension path the switchboard states. Putting these tasks on `switchboard.html` is a later edit to that page (shared) and is NOT done here.
* **The tasks.** `rotor` is `brain/rotorTask.mjs`'s job (the helicopter held at a point, a height and a heading for 30 s; four kinds: `hover` in a wind with gusts, `recovery` from a large upset, `engine` out from 45-160 m, `terrain` over a noise ground); `drone` is `brain/droneTask.mjs`'s (the quadrotor, 20 s; `hover`, `recovery`, `motor` out, `goto`). A scenario is a function of its seed and kind; the SAME seeds are flown by every arm. The score is the task's own (minus the mean tracking error; an engine or motor flight is the landing's cost, or a crash's). A run is BAD when the task calls the flight not standing (an early end; an engine flight that did not end standing).
* **The arms.** For the helicopter: `hand` (`brain/autopilotRotor.mjs`), `hand-net` (the hand pilot written as the 1,167-weight network, `pilotRotorPolicy.handWeights()`: the same laws, so it must TIE `hand`), `fly` (the fruit-fly network pilot, `brain/pilotRotorWeightsDefault.json`), `zero` (the same network with every weight zero: a pilot that does nothing, the floor). There are no committed weights for a helicopter MLP, so there is no helicopter MLP arm (said). For the quadrotor: `hand`, `hand-net`, `fly` (`brain/pilotDroneWeightsV2.json`), `mlp` (`brain/pilotDroneMlpWeightsDefault.json`), `mlp-v2` (`brain/pilotDroneMlpWeightsV2.json`) and `zero`. The controls: `fly`, `mlp` and `mlp-v2` must BEAT `hand` and `zero`; `hand-net` is read against `hand` and is expected to TIE it; `zero` has none.

## 2. THE REGISTERED READ

> On fresh scenarios of each task, does each trained rotorcraft brain fly better than the hand autopilot it was trained from, and does the network form of the hand pilot fly exactly as the hand pilot does?

**Scenarios, fresh and read once:** seeds **8001 to 8012 of each of the four kinds** (48 scenarios a task). Nothing has used these seeds: the training, held-out, audit, baseline and safety sets of both tasks are seeds up to 5030. The command is flown once on a few DEV seeds (1 to 3, which are TRAIN seeds: a sanity run of the code only, not a result), then once on 8001-8012 per task.

**The reading (the series' convention):** pooled paired difference a - b of the per-scenario scores over the 48, **BETTER iff the mean is above 2 standard errors and positive, WORSE iff below -2 se and negative, else TIES**; the lines are the board's (`X BEATS its control Y`, `X TIES its control Y`, `X IS BELOW its control Y`). Printed with them and NOT part of any verdict: the reading per kind (each kind's 12), the numbers of scenarios better / worse / the same, the lost (BAD) runs per arm, and each arm's mean score.

**Checks (a failure and the readings are NOT WEIGHED):** every arm flew all 48 scenarios, in the same order; no score is non-finite; `hand-net` and `hand` differ by less than 1e-3 on every scenario (it IS the hand pilot, written as a network; see Amendment 1) -- if not, the network form is not the hand pilot and the line says so first; `zero` is below `hand` on at least 40 of the 48 (the floor is a floor).

**Expectations, written before any seed is flown.**
* helicopter `fly` BEATS `hand`: about 85 percent (the v4877 audit read -1.2188 against -2.0770 on other seeds, 24 scenarios better and 10 worse); it BEATS `hand` on `engine` alone: about 80 (the entry's engine-out landings); it is WORSE than `hand` on at least one kind: about 25 (trained on 34 scenarios, graded on kinds it saw few of).
* helicopter `hand-net` TIES `hand`: about 90 percent; `zero` IS BELOW `hand`: 99.
* quadrotor `fly` (V2) BEATS `hand`: about 75; `mlp` BEATS `hand`: about 65; `mlp-v2` BEATS `hand`: about 65; at least one of the three is WORSE than `hand`: about 15; the three trained brains TIE each other pairwise (not registered as a reading, printed): about 60.
* A lost (BAD) run for any trained brain: at least one in its 48: about 35 percent.

**What a result would not say.** That a brain is better than a hand pilot in general: one model of each machine, 48 scenarios of a family I did not make but did not choose either, the hand pilot's gains derived from the airframe. That the wiring pays: the fruit-fly network and the MLP are different sizes and trainings (the series' finding, again and again, is that structure is not what pays), so BEATS against `hand` is a statement about the trained weights, not the connectome. Nothing about a real helicopter or quadrotor. The board is a reading of THESE 48 seeds, not a ranking.

## 3. What will be built, and gated

`brain/rotorcraftBoard.mjs` (the two tasks, the arms from weights handed in, the checks, the per-kind lines, the board), `tools/ship/takeRotorcraftBoard.mjs` (the command: reads the weight files, `--task rotor|drone|both`, `--set dev|held73`, `--write`), and `brain/rotorcraftBoard-selfcheck.mjs` with a mutation pass logged in its header. Then DEV, the read once, the RESULT here, and the capability map's `sky-rotor` cells brought up to what was read.

## 4. Not in this round, said now

The page (`switchboard.html` and a page of their own are later items, R2 and R3); a helicopter MLP (no weights); the wind, the terrain and the failure kinds one at a time as arms' controls; a lesion toggle on the network's recurrent core; any training.

### AMENDMENT 1 (2026-11-06; made on DEV, BEFORE HELD73 was flown and before any code existed; DEV is not a result)

A sanity run of every arm on seeds 1 and 2 of each kind (the code of the existing modules only; 28 flights a task) showed the network form of the hand pilot agreeing with the hand pilot to the printed digit on every helicopter flight and every quadrotor flight but one: quadrotor `recovery` seed 1 reads -0.4428 for `hand` and -0.4429 for `hand-net` (a difference of about 1e-4, the 32-bit weights). **The check's tolerance is 1e-3, not 1e-6, and the expectation reads TIES, not "exactly".** Nothing else is changed: the arms, the seeds, the reading, the other checks and the other expectations stand. (The same run showed `zero` far below `hand` everywhere, and that on quadrotor `motor` seed 1 every arm, the hand pilot included, scores -7: a loss the task charges the worst for.)

### AMENDMENT 2 (2026-11-06; made on DEV seeds 1 to 6 of each kind, BEFORE HELD73 was flown; DEV is not a result)

Running the written board on DEV (the code of `brain/rotorcraftBoard.mjs`, no weights changed) showed that two things in section 2 were wrong, and both are mine.

1. **The floor check as registered would have failed on a correct board.** "`zero` is below `hand` on at least 40 of the 48" assumed `hand` flies every scenario. It does not: on the failure kinds (helicopter `engine`, quadrotor `motor`) the hand pilot loses most flights, and a pilot that does nothing ties it or is above it. Quadrotor `motor` seeds 1, 2, 3 and 6 are -7.000 for both; seed 4 is -7.000 for `hand` and -6.617 for `zero`. Helicopter `engine` seeds 4 and 5 are -4.237 and -3.890 for `hand` and -3.000 for `zero`. With the 12 motor scenarios mostly tied the registered threshold would fail on HELD73 and the readings would be NOT WEIGHED because the floor check was badly made, not because anything was wrong. **The check is now: over the scenarios of the three kinds that are not the failure kind (36 of the 48), `zero` is below `hand` on at least 30 (5/6, rounded up).** The failure kind's comparison of `zero` with `hand` is PRINTED (how many below, tied, above) and is not a check; that doing nothing ties or beats the hand pilot on an engine-out or motor-out is a finding about the hand pilot, said when read, and moves no verdict.
2. **`hand-net` against `hand` by the board's reading rule is a bad equivalence test.** The two differ by about 1e-5 with a consistent sign on some kinds, so a per-kind line can read `BETTER (+0.0000, se 0.0000)`. That line is not a statement that the network form is better. **The expectation "`hand-net` TIES `hand`" is scored by the check (every scenario within 1e-3), and the per-kind lines for `hand-net` read TIES when the mean difference is below 1e-3 in size.** The board's own pooled line is still printed, unchanged. The reading rule for every other arm is the board's, with no tolerance.

Also said now, before the read: the forecast "a lost (BAD) run for any trained brain in its 48: about 35 percent" was made before DEV had shown that the quadrotor's trained brains lose the motor-out flights the hand pilot loses (DEV: 3 of 12 lost for `hand`, `fly` and `mlp` alike). It will be scored as registered, and it will very probably be wrong. Nothing else is changed: the arms, the seeds, the reading, the other checks and the other expectations stand.

## 5. RESULT (2026-11-06; seeds 8001 to 8012 of each of the four kinds, flown ONCE by `node tools/ship/takeRotorcraftBoard.mjs --set held73 --write`; the 480 flights are in `brain/rotorcraftBoardHeld73.jsonl`; the code at the commit before this section, gated 80 rows and sabotaged: 102 + 70 mechanical and 26 hand-written mutants)

**THE HELICOPTER'S CHECKS PASSED AND ITS READINGS ARE WEIGHED. THE QUADROTOR'S CHECK FAILED AND ITS READINGS ARE NOT WEIGHED**, as section 2 says a failed check must be. The quadrotor's lines are printed below because the command prints them; nothing in this note scores them.

### 5.1 The helicopter (task `rotor`, 48 scenarios)

| arm | mean score | lost (BAD) | against its control (pooled paired difference, se) | reading |
|---|---|---|---|---|
| hand | -1.8177 | 9 (all engine) | | |
| hand-net | -1.8177 | 9 | hand: -0.0000 (0.0000); 20 better, 11 worse, 17 the same | TIES (the check: no scenario differs by 1e-4) |
| fly | -1.6382 | 6 (all engine) | hand: +0.1795 (0.0983), 35 better, 13 worse; zero: +5.7635 (0.3756) | **TIES hand** (the bar is 2 se = 0.1966); BEATS zero |
| zero | -7.4016 | 48 | | |

The reading per kind (12 scenarios each; printed, not a verdict): `fly` against `hand` is hover +0.0260 (se 0.0130; 10 better, 2 worse) TIES, recovery -0.0045 (0.0175; 5 better, 7 worse) TIES, **engine +0.6576 (0.3697; 9 better, 3 worse) TIES** (the bar is 0.7394), **terrain +0.0390 (0.0088; 11 better, 1 worse) BETTER**. The engine kind carries 0.164 of the pooled 0.1795. In the failure kind `zero` is below `hand` on 8 scenarios and above it on 4 (not checked: a pilot that does nothing beats the hand pilot's engine-out on a third of these seeds).

**Expectations, scored against section 2:**
* helicopter `fly` BEATS `hand` (about 85 percent): **NO**, TIES, by 0.017 of score (+0.1795 against a bar of +0.1966); the v4877 audit's 24 better and 10 worse became 35 better and 13 worse here, the same ratio and a smaller gain.
* `fly` BEATS `hand` on `engine` alone (about 80): **NO**, TIES (+0.6576 against +0.7394); it lost 6 of the 12 engine flights against the hand pilot's 9.
* `fly` WORSE than `hand` on at least one kind (about 25): **NO**; no kind reads WORSE (recovery is the nearest, -0.0045).
* `hand-net` TIES `hand` (about 90): **YES**, by the check: the largest difference over the 48 flights is below 1e-4.
* `zero` IS BELOW `hand` (99): **YES**, WORSE by -5.5839 (se 0.4085), 44 of 48 scenarios worse, 4 better.
* a lost (BAD) run for a trained brain in its 48 (about 35 percent): **it happened** for `fly` (6 lost). The forecast was low, as section 2's Amendment 2 said it probably was.

### 5.2 The quadrotor (task `drone`, 48 scenarios): CHECK FAILED, NOT WEIGHED

The command's first line is `CHECK FAILED -- the readings below are NOT WEIGHED: hand-net is not the hand pilot: the largest difference is 2.52e-1 (the limit is 0.001)`. The cause, found by looking after the fact (post hoc, labelled, and it moves nothing): **two flights, both quadrotor `motor` and both lost by the hand pilot and by its network form alike**: seed 8008 (hand -5.9259, hand-net -5.6744, a difference of 0.252) and seed 8005 (-6.4237 and -6.2868, 0.137). The other 46 flights agree to better than 1e-4. A crash's cost depends on when and how hard the machine hits, and the two forms of the same law differ by the rounding of the network form's 32-bit weights (about 1e-4 on a standing flight, DEV); a fall magnifies that to as much as a quarter of a point. **The registered check ("every scenario within 1e-3") assumed a smooth score; it does not hold on a crash, and it was my check.** (DEV had shown the 1e-4 difference on one standing flight, which is how Amendment 1 got its tolerance; DEV seeds 1 to 3 of `motor` all sat on the -7.000 floor, where two forms cannot differ, so no DEV seed had a lost flight that fell differently.)

What the command printed, for the record and NOT weighed: `fly` against `hand` +0.3250 (se 0.1195; 20 better, 24 worse), `mlp` +0.2977 (0.0969; 27 better, 17 worse), `mlp-v2` +0.2217 (0.1148; 17 better, 23 worse); each against `zero` by about +5.9. The trained brains against each other: fly-mlp +0.0273 (0.0396), fly-mlp-v2 +0.1033 (0.1205), mlp-mlp-v2 +0.0760 (0.0964). Scores per kind against `hand`: **motor** fly +1.3019, mlp +1.1644, mlp-v2 +0.9359 (all three printed BETTER); **the other three kinds**, hover: -0.0068, +0.0049, -0.0003 (TIES); recovery: -0.0165, **-0.0382 (mlp, WORSE)**, -0.0078; goto: +0.0215, **+0.0597 (mlp, BETTER)**, **-0.0408 (mlp-v2, WORSE)**.

**Post hoc, labelled, moves nothing:** (a) *the hand pilot and every network that flies the quadrotor LOSE ALL TWELVE of the motor-out flights* (none of the 60 flights of the five pilots stands; the helicopter's engine-out is survivable, 6 and 9 of 12 are lost, and the quadrotor's motor-out is not, here, under any pilot in the tree). The motor kind's score is therefore how softly each pilot crashes, and it is the whole of the pooled difference: the three standing kinds together read from -0.0068 to +0.0597, within a few hundredths of the hand pilot, in both directions. (b) The 46 flights that agree prove the network form IS the hand pilot wherever the score is smooth, which is what the check was for. (c) A fair reading of the quadrotor wants the check changed to exempt lost flights and fresh seeds, and that is a new registration (section 6), not an edit of this one.

### 5.3 What this does and does not say

HELD73 reads, for the helicopter: the trained fruit-fly pilot TIES the hand autopilot on 48 fresh scenarios, narrowly (+0.18 of a score with a bar at +0.20), better on terrain, and its gain is in the engine-out landings (9 of 12 better, 3 worse, 6 lost against 9). v4877's audit read -1.2188 against -2.0770 on other seeds, a larger gap, and HELD73 is the first reading on seeds nothing had touched; the audit's gap was the larger, and the sensible reading is that the helicopter brain is somewhat better than the hand pilot at the engine-out and not different elsewhere. For the quadrotor, nothing is weighed.

Not said: that any of these brains is better than a hand pilot in general; that the wiring pays (the quadrotor MLP is another structure and its printed numbers are the same size); anything about a real helicopter or quadrotor. The capability map's `sky-rotor` cells are brought up to this section's helicopter reading and say the quadrotor's is not weighed.

## 6. SECOND REGISTRATION: THE QUADROTOR ON FRESH SEEDS, WITH THE CHECK MENDED (2026-11-06; made AFTER section 5 was read, BEFORE any seed of its set is flown; UNNUMBERED)

**Why.** Section 5.2: the registered quadrotor read ended NOT WEIGHED because my check (every scenario within 1e-3) failed on two crashed flights, and everything else about it was clean. Half of this note's question, for the machine with the larger network zoo (a fruit-fly pilot and two MLPs), is therefore unanswered. This section asks it again on seeds nobody has flown, with the check changed for the reason section 5.2 gives, and it is a new registration: HELD73's quadrotor stays NOT WEIGHED whatever this one reads.

**Set.** Seeds **8101 to 8124 of each of the four kinds** (96 scenarios; 24 of each kind; the helicopter is not flown again). The tree has no set above 5030 other than HELD73's 8001-8012 and the nav series' sets to 6960 (other tasks).

**What is changed from section 2 (only these):**
1. **The hand-net check:** `hand-net` and `hand` differ by less than 1e-3 on every scenario whose `hand` flight STANDS (is not BAD). On a lost flight the largest difference is PRINTED and is not checked (a crash's cost is chaotic; section 5.2). If a flight that stands differs by 1e-3 or more, the check fails and nothing is weighed, as before.
2. **The floor check** is Amendment 2's, on 72 scenarios (hover, recovery, goto): `zero` below `hand` on at least 60 (5/6). The motor kind is printed.
3. **Two readings, both registered, the same rule (pooled paired difference a - b, BETTER iff above 2 se and positive, WORSE iff below -2 se and negative, else TIES).** READING A: the series' convention, pooled over all 96. READING B: pooled over the 72 scenarios of hover, recovery and goto, the kinds a quadrotor can be flown standing in (HELD73: none of 60 motor flights stood for any of the five pilots). Both are printed for each of `fly`, `mlp`, `mlp-v2` against `hand` (and against `zero`). **B is the reading of how well a brain flies; A includes how softly it crashes. The headline of this round is B, and A is read next to it, not instead of it.**
Nothing else changes: the arms, the controls, the reading rule, the printed per-kind lines and trained-brain pairs, the lost-run counts.

**Post hoc material that informed these forecasts (HELD73, quadrotor, NOT weighed there, labelled):** on its 36 standing scenarios `fly` TIES `hand` (-0.0006, se 0.0132), `mlp` TIES (+0.0088, 0.0103), `mlp-v2` reads WORSE (-0.0163, se 0.0053, 13 better and 23 worse); on all 48 the printed lines were +0.3250, +0.2977 and +0.2217 (1.9 to 3.1 se), all from the motor kind (+1.30, +1.16, +0.94). The helicopter's standing kinds read `fly` BETTER (+0.0202, se 0.0082). Forecasts written after seeing that are not independent of it, and a forecast that a pattern repeats is a forecast.

**Expectations, written before any seed of this set is flown.**
* READING A: `fly` BEATS `hand`: about 65 percent; `mlp` BEATS `hand`: about 65; `mlp-v2` BEATS `hand`: about 45.
* READING B: `fly` TIES `hand`: about 60; `mlp` TIES `hand`: about 55 (BEATS about 30); `mlp-v2` IS BELOW `hand`: about 45; at least one of the three reads WORSE than `hand` on B: about 60; at least one reads BETTER on B: about 35.
* Every pilot loses every one of the 24 motor flights: about 85 percent.
* The hand-net check passes (the 46 flights that stood or fell the same way in HELD73 agreed to 1e-4): about 92. The floor check passes: about 97.
* The trained brains TIE each other pairwise on B (printed, not a verdict): about 55 percent of the three pairs.

**What a result would not say.** As section 2: nothing about a real quadrotor; one model of it; hand gains derived from the airframe; 96 scenarios of a family I did not make. A B-reading of TIES says the brain flies this machine as the hand pilot does, to a few hundredths of a score, not that the two are the same pilot. A BEATS on A with a TIES on B says the brain crashes softer, and a motor-out that is lost every time is still lost.

**Built and gated:** `checksOf` takes the hand-net rule as an option and `RC_SETS` gains `held74` (seeds 8101-8124, the quadrotor only, the mended check); `standingPooled` is the new pooled-over-standing-kinds reading, printed on every board for each arm that has a control; the command writes `brain/rotorcraftBoardHeld74.jsonl` for `--set held74 --write`; the gate gains rows and the changed lines are sabotaged again before the set is flown.

### AMENDMENT A to section 6 (2026-11-06; made BEFORE the set was flown; a mistake of mine, said plainly)

**The set is seeds 8201 to 8224 of each kind, not 8101 to 8124.** After writing section 6 and the code for it I smoke-ran the command on `--set held74 --seeds 1`, which flew seed 8101 of the set and printed its four scenarios and the board's lines for them. I meant to run DEV. A set that has had even one seed read is not fresh, however little I used it, so the registered set moves to 8201-8224 (nothing has used them; the command's `RC_SETS.held74` says so) and seed 8101 is not read again. Everything else in section 6 stands: the arms, the mended check, readings A and B, the forecasts except the one below.

**What that peek showed, and the one forecast it changes.** On 8101 the hand pilot, `fly` and `mlp` lost the motor flight and **`mlp-v2` did not** (its lost-run count for the seed was 0). Section 6 forecast "every pilot loses every one of the 24 motor flights: about 85 percent". I now know that is false for the first seed I looked at, so it is withdrawn and replaced, with the replacement written knowing that one flight and no others: *at least one of the five pilots stands at least one of the 24 motor flights of 8201-8224*: about 85 percent; *`mlp-v2` loses fewer of the 24 than `hand`*: about 60 percent; *`fly` and `mlp` each lose at least 20 of the 24*: about 60. On 8101 the standing-kinds lines (three scenarios) read `fly` WORSE than `hand` by 0.0087, `mlp` and `mlp-v2` TIES; three scenarios are no evidence and no forecast of reading B was changed.
