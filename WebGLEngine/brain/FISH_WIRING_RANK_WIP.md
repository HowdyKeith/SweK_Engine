# Addendum 12 redone the way Addendum 15 was: the real wiring ranked among 44 shuffled circuits (backlog; UNNUMBERED; 2026-11-06; REGISTERED BEFORE ANY CODE FOR IT IS WRITTEN AND BEFORE ANY CIRCUIT OF IT IS TRAINED OR SCORED)

A new file on purpose (`brain/FISH_VESTIBULAR_HELPER_WIP.md` holds Addenda 1 to 15; `brain/FISH_WIRING_FRESH_WIP.md` holds Addendum 16). This is **Addendum 17 of rung 4b**.

## 1. The gap, in Addendum 15's own words

Addendum 15 found that Addendum 14's registered test counted four searches of ONE circuit (the real tuning) as four draws against twelve DIFFERENT circuits (twelve permutations, one search each), so its p of 0.0005 was not the chance that the real tuning ranks first if tuning made no difference; that chance, at the circuit level, was 1/13. It added 32 permuted circuits per cell and ranked the real circuit among 44: **2nd of 45 in both cells, p = 0.0444**. It ended: *"It does not repair Addendum 12's unit (its wiring shuffles were the same four-searches-of-one-circuit shape); the same circuit-level test could be done there with more shuffled wirings and is not registered here."* This is that test.

Addendum 12 (NO STATE on the real wiring against NO STATE on shuffled wirings, 4b-P) read NOT SUPPORTED: P/B U 34 of 48, p 0.1308; P/whole U 38 of 48, p 0.0516. Its four real searches (`qns`) were set against twelve shuffled circuits (`qer`, `qcl`, `qdg`, four each, shuffle indices 20-23, one search per shuffle index and builder). The real wiring's mean was above the shuffled family's in 17 of 18 comparisons by about 0.02. The question is whether that direction clears the line at the unit that is actually one draw: a circuit.

> **On 4b-P, ranked as circuits among 44 shuffled wirings, does the real extracted wiring (NO STATE) sit in the top two of 45?**

SUPPORTED would say the extracted wiring carries something a degree-matched, class-matched or random wiring of the same size does not, for a pilot with no trace, at the level the unit of comparison is one circuit; NOT SUPPORTED, that the 0.02 of Addendum 12 does not clear the line. It does NOT say anything about memory (Addenda 9-11), the tuning (14-15), the escape task (13), another task, the plain-net reading, or the larval fish. The fresh-shuffle replicate of Addendum 16 (new searches, new audits) is a different test with a different unit and stands as registered.

## 2. What is run

Generation 7 of `tools/ship/trainSubVestibular.mjs`: eight more families of NO STATE circuits on shuffled wirings, four searches each, on the same two cells (P/B, P/whole) and the same pilot, recipe (4 x 300, sigma 0.3, maxK 4, prune budget 60), training and held-out dives and eligibility (Addendum 7):

| families | shuffled wiring | control seeds (CONTROL_BASE + 20 + shift + k, k 0-3) |
|---|---|---|
| `wer1`, `wer2`, `wer3` | Erdos-Renyi | shifts 4, 8, 12 (indices 1024-1035) |
| `wcl1`, `wcl2`, `wcl3` | class-block | shifts 4, 8, 12 (2024-2035) |
| `wdg1`, `wdg2` | degree-preserving | shifts 4, 8 (3024-3031) |

That is 32 circuits per cell, 64 in all. **Added to Addendum 12's twelve (`qer`, `qcl`, `qdg`, shift 0), each cell has 44 shuffled circuits: 16 ER, 16 class-block, 12 degree-preserving.** Indices 1020-1023 were Addendum 12's; Addendum 16 uses the 40s; Stage A and Addenda 10-11 used 0-3: none of the draws here has been used by anything. The real wiring's circuits are Addendum 12's four `qns` searches (not run again). **The audits are Addendum 12's (84001-84060) and its references record `refs:PQ`**: the new circuits have never been scored on them, and the real circuits' scores on them are already in the file (read once, not tuned against). Ordinals 1200-1263 (`firstOrdinal` 1200; search seeds 83000 to 83630), none shared with any other circuit. Spec keyword `wiringPermutations`; it is meant to be run into Addendum 12's own file, `brain/rig-results/fishVestibularGen2.jsonl`, which it resumes.

## 3. THE REGISTERED TEST (per cell), at the unit of a circuit

The real wiring is one circuit; its score is the mean of its four searches' scores, each search's score the mean of its three audits. Each shuffled circuit's score is its one search's mean of three audits. **p = (1 + the number of shuffled circuits whose score is at or above the real circuit's) / (1 + the number of shuffled circuits)**, the exact one-sided rank of the real circuit among all of them (Addendum 15's, line for line). With 44 shuffled circuits the smallest p is 1/45 = 0.022. **"The real wiring matters without memory" is SUPPORTED in a cell iff p <= 0.05, i.e. at most 1 of the 44 shuffled circuits is at or above the real one (p 2/45 = 0.0444; 2 of them give 3/45 = 0.0667, which misses).** Both cells = SUPPORTED, one = MIXED, neither = NOT SUPPORTED; a shuffled advantage is NOT SUPPORTED and nothing in that direction is claimed. If not all 44 are in a cell, the cell says so and the p is printed with the number actually in. Printed, not decisive: per cell the shuffled circuits' mean, sd, min and max, and where the real score falls among them.

**A property of this test, said before it is run.** The real score is a MEAN of four searches and each shuffled score is a single search. A mean of four varies about half as much as a single, so if the wiring made no difference the real circuit would sit near the middle of the 45, not uniformly: the test is CONSERVATIVE under the null (a p of 0.05 is hard to reach by luck), and so a miss is weak evidence of no effect. Addendum 15's test had the same property. It is registered as it is so that the two are comparable; the alternative, scoring each real search singly against the 44, is a different test and is not registered here.

## 4. Expectations, written before any circuit is trained

From Addendum 12's own table (real over the pooled shuffled means, over the three audits: P/B -0.432 against -0.452, P/whole -0.418 against -0.440, a gain of about 0.02 each, with a single-circuit sd of about 0.015), the real mean should sit about 1.3 to 1.5 single-circuit sd above the shuffled mean, i.e. around the 90th to 93rd percentile of 45: rank 3 to 5 and p about 0.07 to 0.11. A first draw that looked interesting regresses; the real effect is probably a little smaller than it looked. **P/B supported about 15 percent, P/whole supported about 20 percent; both about 6 percent; neither about 70 percent.** Real wiring at rank 1 to 5 of 45 in a cell about 55 percent; at rank 23 or worse (the middle or below) about 10 percent.

## 5. Cost, and what will be built

64 circuits at about 0.33 core-hour each: **about 21 core-hours, about 5.3 hours on 4 workers** (Addendum 15's figure for the same size). Nothing is trained until it is run on the rig. What is built: generation 7 in `tools/ship/trainSubVestibular.mjs` (a table entry, the spec parser, the references loop, the keyword), `wiringRank` beside `circuitRank` (one generic ranking function the two share), the verdict field and the report lines marked as the registered test, with gate rows and a mutation pass; a smoke run; the command in this note when it exists.

## 6. Not checked, said now

Whether the shuffles of ER, class-block and degree-preserving wirings in unequal numbers (16, 16, 12) matter (they are each other's neighbours in score at Addendum 12's size, but the registration pools them); whether four searches of the real wiring are enough for its mean to be steady (Addendum 12's four span a wide range on P/B); the fresh-shuffle replicate of Addendum 16, which this does not replace.

## 7. CORRECTION OF MY FORECAST (section 4), written 2026-11-06 BEFORE ANY CIRCUIT OF THIS ADDENDUM IS TRAINED. The test, the line and the verdict rule above are unchanged.

Section 4 forecast the real wiring at about 1.3 to 1.5 single-circuit sd above the shuffled mean, "with a single-circuit sd of about 0.015". Addendum 12's own file does not show that sd. Read with `report --in brain/rig-results/fishVestibularGen2.jsonl` (the 12 shuffled circuits it already holds, which are part of this pool): **P/B shuffled mean -0.452, sd 0.033, range -0.521 to -0.415; P/whole mean -0.440, sd 0.020, range -0.472 to -0.418**, against the real wiring's -0.432 and -0.418. So the real gap of about 0.02 is **0.6 sd on P/B and 1.1 sd on P/whole**, not 1.3 to 1.5, and the real score is a mean of four searches (noise about half a single circuit's sd), not a point. The first number in section 4 that came out of the file was a gap; the sd was my unchecked guess, and it was wrong by a factor of two.

A simulation of the registered test (44 circuits drawn at those sds, the real score the mean of four draws at the same sd, 40 000 to 200 000 trials; the code is a dozen lines and not committed) gives, per cell, the chance that p <= 0.05 for a true gap of 0, half and all of the observed one:

| cell | true gap 0 | half the observed gap | the observed gap | median rank of 45 at those gaps |
|---|---|---|---|---|
| P/B (sd 0.033, gap 0.020) | 0.1 percent | 0.6 percent | 2.4 percent | 23 / 18 / 13 |
| P/whole (sd 0.020, gap 0.022) | 0.1 percent | 1.9 percent | 12.3 percent | 23 / 14 / 7 |

At a true gap of zero the test passes 0.1 percent of the time, not 5: it is the conservative-under-the-null property of section 3, measured. **It is also a weak test of a gap this size: even if the whole observed gap is real it clears the line 2 percent of the time on P/B and 12 percent on P/whole.** A NOT SUPPORTED therefore says little, and the note should be read that way when it comes back.

**Forecast, replacing section 4's** (my weights on the true gap, 40 percent none, 30 half, 30 all of the observed one, stated as a guess): P/B supported about 1 percent, P/whole about 4 percent, both about 0.1 percent, **neither about 95 percent**. Real wiring at rank 1 to 5 of 45: P/B about 5 percent, P/whole about 15 percent; at rank 23 or worse: P/B about 34 percent, P/whole about 26 percent.

The report already prints this addendum's lines on Addendum 12's file alone: **P/B ranks 5 of 13 (p 0.3846 over the 12 shuffled circuits in), P/whole 1 of 13 (p 0.0769)**, each marked "NOT all 4 + 44 circuits are in". That is the incomplete cell, not the test, and nothing is read from it.

## 8. BUILT 2026-11-06 (sections 1 to 7 are unchanged): generation 7, the smoke run, the rig command. NOTHING IS TRAINED.

**What was built.** `tools/ship/trainSubVestibular.mjs` gained generation 7: the table entry (families wer1-3, wcl1-3, wdg1-2 at shifts 4 / 8 / 12 and 4 / 8 on shuffle offset 20, NO STATE, audits 84001-84060, `refs:PQ`, `refsGen` 2, first ordinal 1200, keyword `wiringPermutations`), `GEN_ADD` 17, the family names in the spec parser, the references loop, and the report. `circuitRank` (Addendum 15) and the new `wiringRank` share one function, `rankCircuits(cellsRecs, refs, cells, realFamily, poolFamilies)`, so the two ranks are the same arithmetic: p = (1 + the pool circuits at or above the real score) / (1 + the pool size), `rank` = 1 + that count. The pool is `WIRING_FAMILIES`: Addendum 12's qer / qcl / qdg and these eight, 11 families, 44 circuits a cell (16 ER, 16 class-block, 12 degree-preserving); the real circuit is Addendum 12's `qns`, four searches, scored as their mean. The report prints, per cell, the **WIRING AT THE CIRCUIT LEVEL** line marked as the REGISTERED TEST (the real score, the shuffled circuits' mean, sd and range, how many are at or above, its rank of 45, the exact p, "NOT all 4 + 44 circuits are in; p is over the N in" while incomplete, the 0.05 line MET or not) and `ADDENDUM 17 OVERALL (registered)` (SUPPORTED / MIXED / NOT SUPPORTED, NOT ASSESSED while a cell is incomplete). Generation 7's circuits print no block of their own. The gate (`tools/ship/trainSubVestibular-selfcheck.mjs`) has rows for the constants, the ordinals and seeds (1200-1263, 83000-83630, none shared), the shuffles (control seeds 1024-1035, 2024-2035, 3024-3031, all 44 of a cell distinct and distinct from Stage A's and generation 6's), NO STATE and the audits, the rank (rank 1, a tie, the two-at-or-above case that misses at 3/45, the mean of four, the pool exactly the 44), the incomplete cells, the report and the overall, and the keyword run into a file with and without Addendum 12's references. Its mutation pass is logged in its header.

**The smoke run** (six circuits across both cells, one search of three iterations on every eighth dive, four real worker processes, 10 s): `node tools/ship/trainSubVestibularCmd.mjs run --specs "P/B/wer1:0,P/B/wcl3:0,P/B/wdg2:3,P/whole/wer3:1,P/whole/wdg1:0,P/whole/wcl2:2" --out <throwaway> --smoke --runs 1 --iters 3 --prune-budget 3 --workers 4 --quiet`. It ran, and with Addendum 12's file in front of it the report printed both WIRING AT THE CIRCUIT LEVEL lines over 15 shuffled circuits and `ADDENDUM 17 OVERALL (registered): NOT ASSESSED (0 of 2 cells complete)`, as it must.

**The cost.** 64 circuits at about 0.33 core-hours each: **about 21 core-hours, about 5.3 hours on 4 workers.** From the earlier addendum's timing, not a new measurement.

**The command for the rig (not run).** It is meant to be run into Addendum 12's own file, which holds `refs:PQ` and the four `qns` searches, so the references are not computed again and the real circuit's scores are the ones already there. A stopped run resumes from the file; one circuit is one process.

```
node tools/ship/trainSubVestibularCmd.mjs run --specs wiringPermutations --out brain/rig-results/fishVestibularGen2.jsonl --workers 4
node tools/ship/trainSubVestibularCmd.mjs report --in brain/rig-results/fishVestibularGen2.jsonl
```

Run on a copy if the file is to stay as it was: the run appends to it.
