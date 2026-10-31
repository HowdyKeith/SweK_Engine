# The plain-net control (round 1 of the 2026-10-31 list; UNNUMBERED; facts and registrations only -- nothing below has been built or run)

Keith, 2026-10-31: "let's start with round 1". This note is a new file on purpose: `brain/FISH_VESTIBULAR_HELPER_WIP.md` is being appended to by another chat, and a second writer in the same file is a merge conflict waiting for a ship. The rung 4b design it builds on is in that file (Addenda 1, 2, 5, 7, 9-13) and in `brain/pilotSubVestibular.mjs`, `tools/ship/trainSubVestibular.mjs`; nothing in those files is edited by this round.

## REGISTRATION, 2026-10-31, BEFORE ANY CODE FOR IT IS WRITTEN AND BEFORE ANY PLAIN-NET PILOT IS TRAINED OR SCORED

### 1. The question, and what a result would and would not mean

Rung 4b found, one addendum at a time, that almost nothing about the extracted zebrafish circuit is what pays. The pilot is the PD autopilot plus a residual read from the circuit's central cells; NO STATE (the trace switched off) ties the pilot with a trace (Addenda 9, 10, 13); shuffled wirings keep about 88 percent of the gain over the autopilot on 4b-P (Addendum 12: the registered test missed, p 0.1308 on B and 0.0516 on the whole arm). Addendum 12 closed with: "the pilot's trained readout, the tuning-derived inputs and the autopilot-plus-residual structure are" what produces the gain. **That sentence has never been tested against a pilot that has none of the circuit.** This round does it:

> **On the two 4b tasks, does the extracted circuit give the autopilot-plus-residual pilot anything that a plain relu net with the SAME senses, the SAME readout and the SAME number of trained weights does not?**

A result would say: SUPPORTED, the circuit's tuned afferents and sparse wiring carry something a plain net does not on these tasks; NOT SUPPORTED, a plain net of that size does as well, so what the study measured was the pilot's structure and the optimizer and not the connectome; MIXED, per cell. It would NOT say anything about the larval fish (a simulated disturbance of a simulated vessel), about memory (not asked again: Addenda 9-13 are the answer there), about wirings on other tasks, about a bigger or deeper net than the ones below, or about any optimizer but the sparse (1+1)-ES of rung 3. A NOT SUPPORTED reading is a statement about this recipe on this interface, as every rung-4 reading has been.

### 2. The pilots (to be built in `brain/pilotSubPlainNet.mjs`)

Every pilot below is the rung 4b pilot with ONE part replaced: the circuit (the tuned afferents, the 332 / 301 / 31 synapses, the central cells) is replaced by a plain feed-forward net. Everything else is the 4b pilot's, unchanged:

* **Output:** the PD autopilot's laws on the 14 features (`brain/autopilotSub.mjs`) PLUS a residual, all four clamped to [-1, 1]; the readout starts at ZERO, so every pilot STARTS AS THE AUTOPILOT exactly (the START CHECK below).
* **Senses:** the same four tilt signals as the circuit (`sense()`: nose-down pitch and right roll, each in its tonic form (attitude) and phasic form (rate)), each scaled to unit RMS over the PD autopilot flying the task's 40 training dives with the disturbance, every third tick (`scalesOf`). **The plain net receives exactly the information the circuit receives** -- the circuit's afferents see the four signals only through `sin(theta) P + cos(theta) R`, a linear mix the plain net's first layer can represent.
* **Mirrored pair:** two copies with the SAME (tied) weights; the left copy's two roll signals (rTonic, rPhasic) are sign-flipped; the residuals are summed with yaw odd (the left copy's yaw negated), pitch, thrust and ballast even -- `decode()` of the 4b pilot.
* **NO STATE:** no leak, no trace, no lambda: a pilot reads the present tick only. (The comparison is with the circuit's NO STATE pilots, the best or tied circuits of every addendum.)
* **Recipe:** rung 3's and 4b's, unchanged: 4 searches x 300 children, sigma 0.3, 1 to 4 weights a child, a prune toward the start by block halving with a budget of 60 evaluations (`search()` of `trainSubVestibular.mjs`, imported, not copied); fitness the mean dive score on the 40 training dives of the task; ELIGIBLE: ends early in no more held-out dives than the autopilot; CHAMPION: the eligible search with the best held-out mean, none and the pilot is scored as its start (the autopilot); the champion reads each fresh audit ONCE.

**Two plain-net families, and what each is for:**

| family | net | trained weights | role |
|---|---|---|---|
| **MN** (plain net, weight-matched) | 4 signals -> H relu units -> 4 outputs; weights W1 (4 x H), b1 (H), W_out (4 x H), b_out (4); H the largest with 9H + 4 not above the circuit's NO STATE count | P/B H=65 (589; the circuit has 591), P/whole H=72 (652; 655), E/E H=9 (85; 85), E/whole H=72 (652; 655) | **THE VERDICT FAMILY.** 8 pilots a cell (init draws 0-7). |
| **MG** (the GPU Brain's shape) | 4 signals -> 32 relu -> 32 relu -> 4 outputs, the output layer zero at the start; 160 + 1,056 + 132 = 1,348 weights | 1,348 in every cell | REPORTED, NOT IN THE VERDICT. The width and depth of `brain/pilotFlightMlp.mjs` (18-32-32-4, the net the GPU Brain flies the jets with) on the submarine's four signals. 4 pilots a cell (init draws 0-3). The CPU twin is used; `brain/mlp.js` and the GPU are not touched by this round. |

**Initial weights (fixed now):** first layer ~ N(0, 0.5), second layer of MG ~ N(0, 0.25), biases 0, output layer and output biases 0; the draw of pilot k of a cell is seeded `4711 + ordinal` (ordinal as in section 5); the draws are made from `mulberry` as the 4b-D variant's are.

### 3. The comparators: champions that already exist, flown again on audits none of them has seen

The 4b records keep every champion's weights (`weights`, in `brain/rig-results/`). **They are NOT retrained.** Each is rebuilt from its spec by `trainSubVestibular.mjs`'s own `policyOf` and flown once on each of this round's fresh audits (a first reading of those audits for that champion). Per cell:

| cell | file | circuits (4 each) | counted in |
|---|---|---|---|
| P/B, P/whole | `fishVestibularGen2.jsonl` | **qns** (the real wiring, NO STATE), qer, qcl, qdg (NO STATE on ER-, class-block- and degree-shuffled wiring, shuffle indices 20-23) | the verdict (qns); the decomposition (the 12 shuffled) |
| P/B, P/whole | `fishVestibularReplicates.jsonl` | rl50 (the real wiring, lambda start 0.5) | reported |
| E/E, E/whole | `fishVestibularGen3.jsonl` | **ens** (the real wiring, NO STATE), el50, el99 | the verdict (ens); reported |

The files are read as they stand; a record without weights, or a comparator whose rebuilt pilot does not reproduce its own recorded audit scores (section 6, check 3), is named and the comparison is NOT READ.

### 4. The sets (disjoint from every set read so far)

Training dives, held-out dives, eligibility: Addendum 7's, unchanged (the 40 of Addendum 2 -- 4b-P `TRAIN_SET`, 4b-E nominal seeds 1-10 x side x 2 launch times; held-out seeds 11-20). **Fresh audits, written now, read by nothing else in the tree** (a grep of the tree found no seed field and no seed-named constant in the 79xxx, 86xxx or 88xxx ranges; the other five-digit matches are millisecond timings, neuron ids and byte counts):

* 4b-P: a1 = seeds **86001-86020**, a2 = **86021-86040**, a3 = **86041-86060**, each seed in the three dive kinds (60 dives a block), the disturbance drawn from each dive's own seed at ladder rung 1.
* 4b-E: a1 = nominal seeds **88001-88016**, a2 = **88017-88032**, a3 = **88033-88048**, each seed x side (-1, +1) x two launch times drawn from the seed (64 dives a block), ladder rung 0.

The autopilot alone is read on them once, in a references record (`refs:NP` for 4b-P, `refs:NE` for 4b-E). **Search seeds:** 79000 + 10 x ordinal (ordinal in section 5); the highest used is 79473. No other study uses a seed above 78210.

### 5. The pilots trained (48; no shuffled or other controls are trained)

Cells in the order P/B, P/whole, E/E, E/whole (index c = 0..3). Per cell: MN 0-7 then MG 0-3, so the ordinal of a pilot is `12 c + k` for MN k and `12 c + 8 + k` for MG k (0..47). 48 pilots in all, each of the recipe's 4 searches: **48 pilots, 192 searches.**

### 6. Checks, run first, recorded in the results file; a failure is the first line of the report and the verdicts are then NOT READ

1. **TASK RE-CHECK** on the new references records: the disturbance costs the autopilot at least `COST_FLOOR` on the training dives; 4b-E: the best hand reflex wins back at least half, the cue detector holds (`refsRecord` of the 4b trainer, unchanged).
2. **START CHECK:** the untrained pilot of every family and arm size scores the autopilot's score on four training dives (the readout is zero).
3. **COMPARATOR REPRODUCTION:** every comparator champion, rebuilt from its record and flown on its ORIGINAL audits, reproduces its recorded audit scores to 1e-9. This catches a rebuilt pilot that is not the one that was trained.
4. **The mirror and sign tests** of the plain-net pilot are the gate's (the pilot's own self-check), not the run's.

### 7. The verdict (fixed now)

Each pilot is scored as its champion's mean dive score on each audit; a pilot with no eligible champion counts as the autopilot's score (`effectiveOf`). Per cell, with REAL the 4 NO STATE circuits of the real wiring (qns on 4b-P, ens on 4b-E) and PLAIN the 8 MN pilots:

* **VALIDITY (the control must learn):** PLAIN's mean beats the autopilot by more than 0.02 on at least 2 of 3 audits. If not, the cell reads **NOT ASSESSED: THE CONTROL DID NOT LEARN** -- a defect of the recipe on this interface, mine to repair under a new registration, and no statement about the circuit.
* **THE REGISTERED TEST (per assessed cell):** each pilot is scored as the mean of its three audit scores; the 4 REAL scores are set against the 8 PLAIN scores by the exact one-sided permutation test on Mann-Whitney U over all 495 splits (`exactRankP` of the 4b trainer; ties count one half). **SUPPORTED in a cell iff p <= 0.05** (a 0.0016 miss at Addendum 12 was NOT read as meeting the line and is not here either). The direction is fixed: REAL above PLAIN. A plain net AHEAD of REAL is read as NOT SUPPORTED and is also stated.
* **OVERALL:** SUPPORTED iff all four cells are assessed and supported; NOT SUPPORTED iff none is; MIXED otherwise, with the cells named. A cell that is NOT ASSESSED is named first and the overall line says how many cells were assessed.
* **Printed beside it, not decisive:** per audit REAL's mean against PLAIN's by the margin rule (needs the larger of 0.02 and 2 sd of PLAIN's pilots): ahead / tie / behind; the share of REAL's gain over the autopilot that PLAIN keeps ((PLAIN mean - autopilot) / (REAL mean - autopilot), printed where REAL's gain is above 0.02); the count with no eligible champion; the mean, sd and range of every family.
* **DECOMPOSITION (4b-P cells only, reported, not in the overall):** the 12 shuffled NO STATE circuits (qer, qcl, qdg) against PLAIN, the same exact test (C(20, 8) = 125,970 splits), direction shuffled-above-plain. It says whether the tuned afferents plus a RANDOM sparse wiring already beat a plain net, which separates "the front end" from "the wiring".
* **REPORTED ONLY:** MG against MN and against REAL (same printouts); rl50 (4b-P) and el50, el99 (4b-E) against PLAIN by the margin rule.

### 8. Expectations, recorded before anything is built

* Overall NOT SUPPORTED (no cell supported): **60 percent**. MIXED: 30 percent. SUPPORTED in all four: 10 percent.
* PLAIN keeps at least 90 percent of REAL's gain over the autopilot on every audit of every assessed cell: 55 percent. (The shuffled wirings kept about 88 percent on 4b-P.)
* A plain net AHEAD of REAL by the margin rule on at least 2 audits in at least one cell: 30 percent.
* The control does not learn in some cell (VALIDITY fails): 10 percent.
* MG (the bigger two-layer net, the same recipe) has a lower mean than MN in at least 3 of 4 cells: 50 percent. A guess, reported.
* The decomposition reads "shuffled front end above plain net" supported on at least one 4b-P cell: 35 percent.

### 9. Cost

Each pilot is about as expensive as a circuit of 4b (an evaluation of the 40 training dives takes 0.25 s on E/E to 0.86 s on P/whole; a pilot is about 1,450 evaluations): P cells 0.33 core-hour, E cells about 0.23, MG possibly twice that. 48 pilots: **about 14 core-hours, about 19 if MG is twice as slow, about 3.5 to 5 hours with 4 workers.** The estimate is from the 4b figures; the real one is measured by a smoke run before the run is started, and printed.

### 10. What will be built, in this order, each gated and SABOTAGED before any training (nothing existing is edited)

1. `brain/pilotSubPlainNet.mjs` and `brain/pilotSubPlainNet-selfcheck.mjs`: the plain-net pilot (the contract of `createVestibularPolicy`), both shapes; gated for: the start is the autopilot; the mirror (a right-left mirrored dive gives the mirrored controls); the weight counts of section 2; the residual reaches the controls only through the net; `mutate` and `prune` as the 4b pilot's; no state carries between dives.
2. `tools/ship/plainNetStudy.mjs` (library), `plainNetStudyCmd.mjs` (the command: `run`, `report`) and `plainNetStudy-selfcheck.mjs`: the specs and seeds of sections 4 and 5, the sets, the comparators' rebuild and re-flight, the checks of section 6, the tests of section 7, the report. Imports `search`, `evalDives`, `scalesOf`, `diveOf`, `refsRecord`, `policyOf`, `exactRankP`, `effectiveOf` from the 4b trainer; edits none of them.
3. Every mutant red BY NAME; a gate edited after its sabotage is re-run in full; the sabotage log in each gate's header.
4. A smoke run (`--smoke`) for the cost, then the full run for Keith's rig: the command and the file name are written here, in this note, when the code exists. **The run waits for Keith's go.**

### 11. NOT CHECKED, said now

Whether a net with a different activation, depth or width (beyond the two above), or a different optimizer, would change the reading; whether "equal trained-weight count" is the right match (the cell-matched sizes, 42 / 47 / 5 / 47 hidden units, are not run); whether the gain is the same for a different disturbance; anything about the left-right structure of the real fish, which the mirrored pair imposes on every pilot here; the GPU: this round uses the CPU twin of a net shaped like the GPU Brain's and measures nothing about the GPU.

## AMENDMENT 1, 2026-10-31 -- made WHILE BUILDING, before the study library exists, before any plain-net pilot is trained and before any fresh audit is flown; the sections above are kept as written and this overrides section 6, check 3, where it says so

**What I found.** Section 6 check 3 (COMPARATOR REPRODUCTION) asked for the rebuilt champions to reproduce their recorded audit scores "to 1e-9". The 4b records keep every weight rounded to six decimals (`Math.round(v * 1e6) / 1e6` in `runCircuit`), while the champion was scored with the unrounded float32 weights, so the check as I wrote it would fail for every comparator for a reason that has nothing to do with the pilot being wrong. Measured before writing this (two real Gen 2 records, P/B/qns:0 and P/whole/qer:1, each rebuilt by `trainSubVestibular.mjs`'s own `policyOf` from the record's weights and scales and flown on its own original audits): the six mean dive scores differ from the recorded ones by 5.8e-10, 2.0e-7, 1.2e-7, 1.5e-8, 8.2e-8 and 4.6e-8. The tool is deterministic; the difference is the rounding.

**What changes.** Check 3 reads: every comparator champion, rebuilt from its record and flown on its ORIGINAL audits, reproduces each recorded audit score (mean dive score) to **1e-5** (fifty times the largest difference measured, and two thousand times smaller than the smallest margin any reading uses, 0.02). A difference above 1e-5 on any audit of any comparator is named and the comparison is NOT READ. Nothing else in the registration changes. The same rounding means the comparators' scores on the NEW audits are those of the rebuilt (rounded) champions, flown once; the plain-net pilots are scored from their unrounded weights as trained, and their records keep the rounded copy as 4b's do.

## COST, MEASURED, AND THE COMMAND FOR THE RIG (2026-10-31; the box was otherwise idle; section 9's estimate was from the 4b figures and is replaced by this)

**Smoke run.** `node tools/ship/plainNetStudyCmd.mjs run --specs "P/B/mn:0,P/B/mg:0,P/whole/mn:0,E/E/mn:0,E/E/mg:0,E/whole/mn:0,cmp:P/B/qns:0,cmp:P/whole/rl50:0,cmp:E/E/ens:0,cmp:E/whole/el99:0" --out <throwaway> --smoke --runs 1 --iters 3 --prune-budget 3 --workers 4 --quiet` ran ten jobs in four child processes and wrote both references records in 9 s wall; the report read the file, passed every check it could make (the comparator reproduction says NOT CHECKED under --smoke, as it must) and marked each cell INCOMPLETE. 4b-P's task cost the autopilot 0.064 and 4b-E's 3.358 on the smoke subset (the full-size figures are 4b's own, 0.052 and 3.11, re-measured by the real run's references).

**One evaluation of the 40 training dives, per cell** (the circuit column is the 4b NO STATE pilot on the same box, for comparison; it agrees with section 9's 4b figures to within 10 percent):

| cell | circuit | MN (weight-matched) | MG (4-32-32-4) | held-out set | the three audits |
|---|---|---|---|---|---|
| P/B | 762 ms | 585 ms | 695 ms | 379 ms | 2.2 s (180 dives) |
| P/whole | 844 ms | 505 ms | 676 ms | 397 ms | 2.3 s (180 dives) |
| E/E | 294 ms | 229 ms | 405 ms | 189 ms | 0.9 s (192 dives) |
| E/whole | 448 ms | 314 ms | 387 ms | 264 ms | 1.4 s (192 dives) |

A pilot is 4 searches x (300 children + at most 60 prune evaluations + the start) = 1,444 training evaluations, 5 held-out evaluations and the champion's three audits: **at most 5.5 to 14.1 minutes for an MN pilot (E/E to P/B) and 9.3 to 16.8 for an MG pilot**. All 48 pilots: **at most 5.27 core-hours for the 32 MN pilots and 3.48 for the 16 MG pilots, 8.75 core-hours in all** (an upper bound: it assumes every search spends its whole prune budget; the registered estimate was about 14 to 19). MG is about 1.2 times the cost of MN, not twice. The 64 comparators are 6.7 to 7.8 s each at full size (the original audits and the fresh ones), about 8 core-minutes; the two references records are under a minute. **About 2.3 hours on 4 workers, about 1.2 hours on 8.**

**The command, NOT TO BE RUN YET** (the sabotage of the study's own gate found 42 holes, which are being closed and re-sabotaged; this line stands until the gate is clean and Keith says go):
`node tools/ship/plainNetStudyCmd.mjs run --specs all --out brain/plainNetStudy.jsonl --workers 8` then `node tools/ship/plainNetStudyCmd.mjs report --in brain/plainNetStudy.jsonl`. One job is one process, a stopped run resumes from the results file (finished jobs are skipped), and a file of another recipe or of a smoke run is refused. The comparators are read from `brain/rig-results/` (three files, already in the tree). Read the CHECK lines first; a failed check is the first line of the report and the verdicts are then not read.

## AMENDMENT 2, 2026-10-31 -- made AFTER THE RUN, because a registered check failed on it; before any pilot's or comparator's fresh-audit score or any cell reading was looked at (Keith chose it: "Amend to 1e-4, then read"; the recommendation was mine)

**What happened.** The run (the rig, branch commit 04df0408, 112 jobs, `brain/rig-results/plainNetStudy.jsonl`, 114 records) passed all eight task and start checks and FAILED check 3, the comparator reproduction, on ONE comparator of 64: `cmp:E/whole/el99:2` reproduces its recorded second audit as -2.389573873 against the recorded -2.389584467, a difference of 1.06e-5 against the 1e-5 that Amendment 1 registered. By section 6 and Amendment 1 a failed check means the verdicts are NOT READ.

**What I looked at to decide, and only that.** The reproduction fields of the 64 comparators (`maxDiff`, `recorded`, `refly`). On 4b-P (40 comparators): median 1.3e-7, largest 8.0e-7. On 4b-E (24): median 6.4e-7; the largest 1.06e-5, then 5.6e-6, 5.5e-6, 2.9e-6, 2.2e-6; the seven largest are all leaky pilots (el99, el50) on 4b-E; the failing difference is 4.4e-6 of the score it is a difference of. No fresh-audit score of any pilot or comparator and no cell reading had been looked at when this was written.

**Why the limit was wrong.** Amendment 1 set 1e-5 as "fifty times the largest difference measured", from two 4b-P records (largest 2e-7). The 4b-E scores are about -2.3 against about -0.5 on 4b-P, and a pilot whose trace builds towards 1 / (1 - lambda) amplifies a weight rounded to six decimals: the same rounding Amendment 1 named, at a scale I had not measured. It is a defect of my calibration, not a sign that a rebuilt pilot is not the trained one (a wrong pilot would be off by the margins below, not by 1e-5).

**What changes.** (1) The reproduction limit is **1e-4**: nine times the largest difference seen and 200 times below the smallest margin any reading uses (0.02). (2) The report judges each comparator from its stored `maxDiff` against the limit, not from the `ok` flag the record was written with (set at 1e-5 when the record was made), so the file as it stands is read under the amended rule; a record without a `maxDiff` is still a failed check. Nothing else in the registration changes.

**What this is.** A loosening of a registered check made after seeing it fail. The verdicts that follow are therefore **read under Amendment 2**, and the report of this round says so wherever it quotes them. A reader who does not accept the amendment has the registered rule's outcome: NOT READ.

## RESULT, 2026-10-31 -- READ UNDER AMENDMENT 2 (`brain/rig-results/plainNetStudy.jsonl`, 114 records, the rig, branch commit 04df0408; `node tools/ship/plainNetStudyCmd.mjs report --in brain/rig-results/plainNetStudy.jsonl`; read once)

**The checks.** The eight task and start checks pass (4b-P costs the autopilot 0.052, 4b-E 3.112 with 0.880 won back by the best hand reflex; every untrained plain-net pilot is the autopilot). The comparator reproduction FAILED at the registered 1e-5 on one comparator of 64 and passes at Amendment 2's 1e-4 (largest difference 1.06e-5); everything below is **read under Amendment 2**. No pilot ended with no eligible champion (0 of 48).

**The registered reading: OVERALL NOT SUPPORTED, 0 of 4 cells.** Means over the three fresh audits (REAL = the four NO STATE circuits of the real wiring, qns on 4b-P and ens on 4b-E; MN = the eight weight-matched plain nets; MG = the four 4-32-32-4 nets; the autopilot alone is -0.611 on 4b-P and -3.705 on 4b-E):

| cell | REAL | MN | MG | MN minus REAL | registered test (REAL above MN) | margin rule, REAL against MN, a1 / a2 / a3 | share of REAL's gain MN keeps |
|---|---|---|---|---|---|---|---|
| P/B | -0.425 | -0.401 | -0.423 | +0.024 | U 0 of 32, p 1.0000 | behind / behind / tie | 110 to 116 percent |
| P/whole | -0.425 | -0.403 | -0.418 | +0.022 | U 4 of 32, p 0.9859 | tie / behind / behind | 110 to 114 percent |
| E/E | -1.219 | -1.178 | -1.222 | +0.042 | U 13 of 32, p 0.7152 | tie / tie / tie | 100 to 103 percent |
| E/whole | -1.146 | -1.052 | -1.324 | +0.094 | U 10 of 32, p 0.8586 | tie / tie / tie | 101 to 107 percent |

The plain net passed the validity rule in every cell (it is off the autopilot by 0.18 to 0.24 on 4b-P and by 2.4 to 2.7 on 4b-E). In both 4b-P cells the margin rule reads the real wiring BEHIND the plain net on two audits, so the report raises the plain-ahead flag there.

**Scored against what I wrote down before anything ran (section 8).** NOT SUPPORTED overall, 60 percent: yes. The plain net keeps at least 90 percent of REAL's gain on every audit of every cell, 55 percent: yes (100 to 116 percent). A plain net AHEAD of REAL by the margin rule on at least two audits in at least one cell, 30 percent: yes, in both 4b-P cells. The control does not learn, 10 percent: no. MG below MN in at least three of four cells, 50 percent: yes, in all four (by 0.022, 0.015, 0.044 and 0.272). The shuffled-front-end decomposition supported on a 4b-P cell, 35 percent: no.

**What else the report shows, not decisive.** The decomposition on 4b-P: the twelve shuffled NO STATE circuits are not above the plain net either (U 0 of 96, p 1.0000, in both cells), so neither the real nor a randomly wired sparse front end beats a plain net. The other groups sit where Addenda 9 to 13 put them: rl50 and the shuffled circuits within the margin of the real wiring on 4b-P, el50 tied with the plain net on 4b-E, and el99 (the registered lambda start) behind everything on E/whole (-2.28, -2.14, -2.25 against about -1.0 to -1.2), the one place the report reads a group "ahead" of both REAL and MN, meaning ahead OF el99.

**Post hoc, labelled so, NOT registered (computed after the report was read).** The registered test asks only for REAL above PLAIN. Asked the other way, exact one-sided over the same splits: 4b-P/B U 32 of 32, p 0.0020 (every one of the four real-wiring circuits is below every one of the eight plain nets); 4b-P/whole U 28 of 32, p 0.0242; 4b-E/E p 0.3414; 4b-E/whole p 0.1838. The plain nets are also the tightest group on 4b-P (sd over circuits 0.003 and 0.008 against 0.014 and 0.016 for the real wiring). A hypothesis from data already seen, not a finding: on 4b-P a plain net is slightly BETTER than the extracted circuit, by 0.02 on a gain of 0.19.

**What it says, at the size it has.** On these two simulated tasks, with this recipe, a plain relu net that is given the four tilt signals directly, with the same autopilot-plus-residual structure, the same mirrored readout and the same number of trained weights, does as well as the extracted fish circuit (4b-E, within the margin) or slightly better (4b-P). So the circuit's tuned afferents and its sparse wiring are not what produces the gain over the autopilot. This corrects one clause of Addendum 12's summary, which I carried into this round's question: it listed "the tuning-derived inputs" among what produces the gain, and the plain net has no tuning-derived inputs. What is left is the autopilot-plus-residual structure, a trained readout, and the (1+1)-ES recipe. A bigger, deeper net (MG) does no better than the small one, and worse in every cell.

**What it does not say.** Nothing about the larval fish (these are simulated disturbances of a simulated vessel). Nothing about memory (every net here has none; Addenda 9 to 13 are the answer there). Nothing about other activations, depths, widths or optimizers than the ones here, or about the cell-matched sizes (42 / 47 / 5 / 47 hidden units), which were not run. On 4b-E the margin rule's floor is wide (0.2 to 0.9 an audit on gains of about 2.4, with four against eight circuits), so "tie" there means differences below roughly a tenth to a third of the gain are not resolved. The comparators were rebuilt from weights rounded to six decimals (Amendment 1), which is why the reproduction check exists. The reading is under Amendment 2, made after the registered check failed.

**NOT CHECKED, said plainly.** The gate of `tools/ship/plainNetStudy.mjs` was edited for Amendment 2 after its last sabotage run, and a full re-run (275 mutants) was started alongside this reading; its result is in the gate's header when it ends. Whether the same holds with a tanh net or with the leaky (memory) versions of both sides is a new registration.
