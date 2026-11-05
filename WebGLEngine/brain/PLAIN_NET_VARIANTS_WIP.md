# The plain-net control across architectures: cell-matched widths and a tanh variant (backlog `fly-plain-net-variants`; UNNUMBERED; 2026-11-05; REGISTERED BEFORE ANY CODE FOR IT IS WRITTEN AND BEFORE ANY VARIANT PILOT IS TRAINED OR SCORED)

This is a new file on purpose: `brain/PLAIN_NET_CONTROL_WIP.md` is the round it extends and is not edited. Everything about the first round that is not restated here stands as written there (the pilot, the four cells, the recipe, the sets, the test).

## 1. The question, and what a result would and would not mean

The plain-net round (RESULT in `brain/PLAIN_NET_CONTROL_WIP.md`) read **NOT SUPPORTED on all four cells**: a plain relu net with the circuit's four senses, the same autopilot-plus-residual structure, the same mirrored readout and the same number of trained weights kept 100 to 116 percent of the real wiring's gain over the autopilot, and on 4b-P it was slightly ahead. Its own last paragraph names what it did not run: *"the cell-matched sizes (42 / 47 / 5 / 47 hidden units)"* and *"a tanh net"*. The backlog entry says the same in one line: *the control used one architecture and one activation; whether the reading holds across architectures is not shown.*

> **Does the plain net's reading survive (a) a different width, the one that matches the circuit's number of central CELLS and not its number of trained WEIGHTS, and (b) a tanh activation in place of relu?**

A result would say: HOLDS, the first round's reading is not an accident of one width and one activation; BREAKS for a family, the real circuit's NO STATE pilots are above that variant by the registered test in at least one cell, so the first round's NOT SUPPORTED was about its particular net. It would NOT say anything about deeper nets (the MG shape was already read: worse than MN in all four cells), about another optimizer (the (1+1)-ES of rung 3 is the recipe of every pilot here), about memory, about the larval fish, or about the 14-feature tank networks of the head-to-head round (their control is `brain/pilotSubPlain.mjs`, a different pilot on a different task).

## 2. The pilots

Each variant is the first round's MN pilot (`brain/pilotSubPlainNet.mjs`) with **one part changed**; the senses (the four tilt signals, each times its unit-RMS scale), the autopilot's laws plus a residual, the mirrored pair with tied weights, NO STATE, the readout and biases starting at ZERO so every pilot STARTS AS THE AUTOPILOT, the recipe (4 searches x 300 children, sigma 0.3, 1 to 4 weights a child, prune budget 60), the 40 training dives, the eligibility rule and the champion rule are unchanged.

| family | net | hidden units H per cell (P/B, P/whole, E/E, E/whole) | trained weights (9H + 4) | what is changed |
|---|---|---|---|---|
| **MC** (cell-matched) | 4 signals -> H relu -> 4 outputs | **42, 47, 5, 47** (the cells of the circuit's arm: B pathway 42, whole 47, E pathway 5) | 382, 427, 49, 427 | the WIDTH: H is the circuit's central-cell count, not the largest H whose weights fit its count (the first round's MN: 65, 72, 9, 72 and 589, 652, 85, 652) |
| **MT** (tanh) | 4 signals -> H **tanh** -> 4 outputs | 65, 72, 9, 72 (MN's) | 589, 652, 85, 652 (MN's) | the ACTIVATION: tanh in place of relu |

Eight pilots a cell in each family: **64 pilots**, 256 searches. **Initial weights** as the first round's: first layer ~ N(0, 0.5), biases and output layer 0; pilot k of ordinal `o` is seeded `4811 + o`. **Ordinal** `o = 16 c + 8 f + k` with cell index c = 0..3 in the order P/B, P/whole, E/E, E/whole, f = 0 for MC and 1 for MT, k = 0..7. **Search seeds** `80000 + 10 o` (the highest is 80630); the first round used 79000 to 79473 and rung 4b's addenda 77660 to 78210; the gate of the study checks that no seed here is in either set.

## 3. What they are set against: nothing is re-flown

The first round's results file `brain/rig-results/plainNetStudy.jsonl` (48 pilots, 64 comparators, the two references records) keeps, for every real-wiring NO STATE circuit (qns on 4b-P, ens on 4b-E, four a cell) and every MN pilot, the champion's scores on the first round's three audits, and the autopilot's scores on them (`refs:NP`, `refs:NE`). **The variants are flown on those SAME audits** (4b-P seeds 86001-86060 in three blocks of 20 seeds x three kinds, 4b-E nominal seeds 88001-88048 in three blocks of 16 seeds x 2 sides x 2 launch times), each champion once, so the test below is paired on identical dives and no REAL or MN circuit is flown again.

*The price, stated:* these audits are not unread. Forty-eight pilots and sixty-four comparators have been scored on them. That does not contaminate the variants: no variant is trained on them, none is chosen among by its audit score (the champion of a pilot is chosen on the HELD-OUT dives; the audits are read once for it), and the verdict rule below was written before a variant was flown. It would contaminate a result that SELECTED among variants by audit score, and none does. The alternative, fresh audits, would need the 16 real circuits and the 32 MN pilots re-flown from their kept weights (to six decimals, which the first round's Amendment 2 shows costs a reproduction tolerance of 1e-4): about 12 minutes, possible, and it would buy nothing against a selection that does not exist here.

## 4. The test, and how the result is read (written before anything runs)

**The registered test, per family and cell** (the first round's, unchanged): the 4 REAL circuits against the 8 variant pilots, each scored as the mean of its three audit scores, exact one-sided permutation test on Mann-Whitney U over all 495 splits, **the direction fixed: real above variant; SUPPORTED iff p <= 0.05.** VALIDITY first: the variant must be off the autopilot by more than 0.02 on at least two audits, else that family-cell is NOT ASSESSED (the control did not learn). **Per family overall:** NOT SUPPORTED if no assessed cell is supported; SUPPORTED if all four are; MIXED otherwise; NOT ASSESSED if no cell is assessed.

**THE REGISTERED READING OF THE QUESTION.**
* **(a) THE FIRST ROUND'S READING HOLDS ACROSS THESE VARIANTS** iff both families read NOT SUPPORTED overall AND each family keeps at least 90 percent of REAL's gain over the autopilot on at least two of the three audits in at least three of the four cells.
* **(b) IT BREAKS FOR A FAMILY** iff that family reads SUPPORTED or MIXED. (Which cells, in which direction of a margin, is printed; nothing is claimed beyond the registered direction.)
* **(c) OTHERWISE** (a family fails validity somewhere, or keeps under 90 percent where it is not supported): **NOT EXTENDED**, and the report says which cell and which clause.

**Printed, not in the verdict:** per family and cell the means, sd and range of the variant per audit, REAL against the variant and the variant against MN by the margin rule (the larger of 0.02 and 2 sd of the variant), the share of REAL's gain kept, the trained-weight count, the number of pilots with no eligible champion. The post hoc direction of the first round (variant above REAL) is **not** tested here; if it is wanted it is a separate registration.

**Checks, run first, a failure is the first line of the report and the verdicts are then NOT READ:** (1) the START CHECK, every pilot's untrained start scores the autopilot's score on four training dives (to 1e-9); (2) each cell has all 8 variant pilots of each family and the 4 REAL circuits of `plainNetStudy.jsonl`, and that file's own references records pass the first round's checks; (3) the family sizes in each record equal the registered ones (42/47/5/47 units for MC, the weight counts above).

## 5. Expectations, written before any pilot is trained

The first round's plain net was not special, so: **(a) HOLDS about 55 percent.** MC breaks (REAL above MC in a cell by the test) about 15 percent: narrower nets have fewer weights to move with the same recipe, and on 4b-E the width of 5 (49 weights) is smaller than the first round's 9 (85), where the margin rule's floor is wide. MT breaks about 20 percent: tanh saturates on the unit-RMS signals and the sparse (1+1)-ES moves four weights at a time, which could cost it either way. (c) about 25 percent. MC keeps 90 percent of REAL's gain in at least three cells about 75 percent; MT about 70 percent. MT ahead of MN by the margin rule on at least two audits in at least one 4b-P cell about 20 percent. The first round's MG family (a bigger net) was worse than MN in all four cells; the variants will not be, in the same way: neither is bigger than MN.

## 6. What will be built (new files only; nothing already gated is edited but one line of the pilot)

* `brain/pilotSubPlainNet.mjs` gains the option `activation` ("relu", the default, or "tanh") in the hidden layers; the rest of the pilot, and its gate, are as they are (the gate gets rows for the new option and the mutants of the changed lines are run).
* `tools/ship/plainNetVariants.mjs` (the library: the families, the ordinals and seeds, the jobs, one pilot's training on the first round's sets, the checks, the reading, the command), `tools/ship/plainNetVariantsCmd.mjs` (the three-line entry) and `tools/ship/plainNetVariants-selfcheck.mjs` (the gate, with its mutation pass). It imports the first round's sets, seeds and test, and does not duplicate them.
* The results file the command writes is `brain/plainNetVariants.jsonl` (one line a pilot, resumable); the command is `node tools/ship/plainNetVariantsCmd.mjs run --specs all --out brain/plainNetVariants.jsonl --workers 8` then `report --in` the same file. **Nothing is trained until it is run on the rig; this note and the build end at a smoke run for the cost and the command.**

## 7. Not checked, said now

Whether the reading would change with a net of a different depth, a different optimizer or a different loss; whether MC and MT are the right two variants (cell-matching to the circuit's cell count and tanh are the two the first round named); whether the first round's MN draws (init seeds 4711 + ordinal) share anything with these (they do not: 4811 + ordinal and a different ordinal); the larval fish.
