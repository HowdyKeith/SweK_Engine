# Does the fish wiring matter without memory? A replicate on fresh shuffles and fresh audits (backlog `fish-wiring-vs-shuffle-fresh`; UNNUMBERED; 2026-11-05; REGISTERED BEFORE ANY CODE FOR IT IS WRITTEN AND BEFORE ANY CIRCUIT OF IT IS TRAINED OR SCORED)

This is a new file on purpose: `brain/FISH_VESTIBULAR_HELPER_WIP.md` holds Addenda 1 to 15 and is not edited by this round. The design below is Addendum 12's, stated again so that this note stands alone, with every set that Addendum 12 read replaced by one nothing has read.

## 1. The gap

Addendum 12 asked whether the extracted wiring matters for a pilot WITHOUT memory (NO STATE) on 4b-P, and registered a test: the four real-wiring searches against the twelve shuffled-wiring ones, exact one-sided permutation on Mann-Whitney U, supported iff p <= 0.05 in a cell. It was NOT MET in either cell (P/B p 0.1308; P/whole p 0.0516, 0.0016 above the line). What it showed besides, stated there at its own size: the real wiring's mean was above the shuffled family's on every audit but one in all six family-by-cell comparisons, by about 0.02 on a gain over the autopilot of about 0.17 to 0.19; the shuffled wirings kept about 88 percent of the gain; the ranges overlapped. The backlog entry asks for the replicate that note calls for: *the same question on shuffles drawn after the first result was read.* This is that replicate.

> **On 4b-P, is a NO STATE pilot on the extracted wiring above NO STATE pilots on shuffled wirings of the same sizes, on circuits and audits that Addendum 12 never read?**

SUPPORTED would say the wiring carries something a degree-matched or class-matched random wiring does not, for a pilot with no trace, at the size of about 0.02; NOT SUPPORTED, that Addendum 12's direction does not clear the line on a second draw. It does NOT say anything about memory (Addenda 9-11), the escape task (Addendum 13), the tuning-derived inputs (Addenda 14-15), another task, the plain-net reading (`brain/PLAIN_NET_CONTROL_WIP.md`), or the larval fish.

## 2. What is run: 32 circuits, nothing already read

Generation 6 of `tools/ship/trainSubVestibular.mjs` (this round is **Addendum 16 of rung 4b**, kept in its own note, as the report labels it), two cells (P/B and P/whole) and the same pilot, recipe (4 x 300, sigma 0.3, maxK 4, prune budget 60), training dives, held-out dives and eligibility as Addendum 7 and 12:

| family | the circuit | what it is |
|---|---|---|
| **fns** | the real extracted wiring, NO STATE (the trace switched off) | four NEW searches (indices 0-3 of the new family; Addendum 12's qns are not reused) |
| **fer, fcl, fdg** | NO STATE on an Erdos-Renyi, a class-block and a degree-preserving SHUFFLED wiring | four each; **the shuffles are indices 40-43 of each builder** (control seeds 1000 / 2000 / 3000 + 40 + k): Stage A used 0-3, Addenda 10-11 the same, Addendum 12 used 20-23; 40-43 are used by nothing |

* **Search seeds:** ordinals 1100 to 1131, seed bases `71000 + 10 x ordinal` = 82000 to 82310. Nothing else in the tree uses a seed above 81000 (the plain-net variants stop at 80633).
* **Fresh audits, written now:** a1 = seeds **87001-87020**, a2 = **87021-87040**, a3 = **87041-87060**, each seed in the three dive kinds (60 dives a block). A grep of the tree finds no seed field or seed-named constant in the 87xxx range (the other matches are timings and data values). The autopilot is read on them once in a references record `refs:PF`.
* Spec keyword `wiringShuffledFresh`; specs `P/B/fns:0-3`, `P/B/fer:0-3`, `P/B/fcl:0-3`, `P/B/fdg:0-3` and the same on P/whole.

## 3. THE REGISTERED TEST (Addendum 12's, per cell)

Each search is scored as the mean of its three audit scores. The four fns scores are set against the twelve pooled fer, fcl and fdg scores by the exact one-sided permutation test on Mann-Whitney U (all 1,820 splits; the smallest possible p is 1/1820). **The hypothesis "the real wiring matters without memory" is SUPPORTED in a cell iff p <= 0.05.** Overall: SUPPORTED in both cells, MIXED in one, NOT SUPPORTED in neither. The direction is fixed in advance (real above shuffled); a shuffled-wiring advantage reads NOT SUPPORTED and nothing is claimed in that direction.

**A second registered reading, the direction.** The first draw's finding was a direction (real above shuffled, 5 of 6 comparisons, about 0.02) that missed the line. A cell **REPLICATES THE DIRECTION** iff the fns mean is above the pooled shuffled mean on all three audits. This is reported beside the test, not instead of it: a direction without p <= 0.05 is stated as that.

**Printed, not decisive:** per family the mean, sd and range per audit, the difference from the autopilot, the share of the real wiring's gain that the pooled shuffles keep, and the real wiring against each shuffled family by the margin rule (the larger of 0.02 and 2 sd of that family) as ahead / tie / behind; the number of searches with no eligible champion.

**Post hoc, labelled so when it is printed (not registered):** the real wiring's eight searches (Addendum 12's qns and this round's fns) against the twenty-four shuffled ones, each as its gain over ITS OWN audits' autopilot, since the two rounds' audits differ. Its p is a hypothesis-generating figure, not a verdict, and the note says so beside it.

## 4. Expectations, written before any circuit is trained

Addendum 12's effect (+0.02) on a between-circuit sd of about 0.014 to 0.016 gives a rank test of four against twelve a power of roughly one half at the line if the effect is real and as large; it is probably a little smaller (the first draw is the one that looked interesting). **P/whole supported about 30 percent, P/B supported about 20 percent; both about 8 percent; neither about 60 percent. The direction replicated in a cell (all three audits) about 80 percent; in both cells about 65 percent. The shuffles keep at least 85 percent of the real wiring's gain in each cell about 75 percent.** An outcome where the real wiring is BELOW the shuffled families in a cell on all three audits is about 5 percent per cell.

## 5. Cost, and what will be built

32 circuits at about 0.33 core-hour each: about 10 core-hours, about 2.7 hours on 4 workers. **Nothing is trained until it is run on the rig.** What is built: generation 6 in `tools/ship/trainSubVestibular.mjs` (a table entry and the places that list the generations, each with gate rows and a mutation pass), the fresh-shuffle indices in the circuit builder's use, and a smoke run for the cost and the command. The command, written when the code exists: `node tools/ship/trainSubVestibularCmd.mjs run --specs wiringShuffledFresh --out brain/fishVestibularGen6.jsonl --workers 4`, then `report --in` the same file.

## 6. Not checked, said now

Whether four searches a circuit per family is enough to resolve an effect of 0.02 (it is the same N as Addendum 12 and the power above says about half); whether any other task or any other recipe would show a larger wiring effect; whether the shuffles of indices 40-43 differ from 20-23 in anything but the draw (they should not: they are draws from the same builders).

## 7. BUILT 2026-11-05 (the registration above is unchanged): generation 6, the smoke run, the rig command. NOTHING IS TRAINED.

**What was built.** `tools/ship/trainSubVestibular.mjs` gained generation 6 as data and in the six places that list the generations: the table entry (families fns / fer / fcl / fdg, shuffle offset 40, audits 87001-87060, `refs:PF`, first ordinal 1100, keyword `wiringShuffledFresh`), `GEN_ADD` 16, `GEN_REAL` fns, `GEN_POOL` fer / fcl / fdg, `GEN_COMPARE`, the family names in the spec parser, the references loop, the verdict and the report. Two additions to the reading, both registered above: every rank-test cell now carries `above`, the number of audits on which the real wiring's mean is above the pooled shuffled mean, and generation 6's report prints, per cell, the WIRING WITHOUT MEMORY line **marked as the REGISTERED TEST** (generations 2 to 4 still say REPORTED, NOT JUDGED), a DIRECTION line (`REPLICATES THE DIRECTION` iff `above` is 3 of 3), and an `ADDENDUM 16 OVERALL (registered)` line: SUPPORTED if both cells are at p <= 0.05, MIXED if one, NOT SUPPORTED if none, NOT ASSESSED while a cell is incomplete. The gate (`tools/ship/trainSubVestibular-selfcheck.mjs`, 16 s) has rows for the constants, the ordinals and seeds (1100-1131, 82000-82310, none shared with any earlier study), the shuffles (control seeds 1040-1043, 2040-2043, 3040-3043, none equal to Stage A's or Addendum 12's), NO STATE, the audits, the readings, the report and the keyword; its mutation pass is logged in its header.

**The smoke run** (six circuits across both cells, one search of three iterations on every eighth dive, four real worker processes, 8 s): `node tools/ship/trainSubVestibularCmd.mjs run --specs "P/B/fns:0,P/B/fer:0,P/B/fcl:0,P/whole/fdg:0,P/whole/fns:0,P/whole/fer:1" --out <throwaway> --smoke --runs 1 --iters 3 --prune-budget 3 --workers 4 --quiet`. It wrote the generation's references (`refs:PF`) and the six records and printed the generation 6 blocks, the registered-test lines with "(NOT all searches are in)", the DIRECTION lines and `ADDENDUM 16 OVERALL (registered): NOT ASSESSED (0 of 2 cells complete)`, as it must with six circuits of 32.

**The cost.** 32 circuits at about 0.33 core-hours each (Addendum 12's 24 took about 8): **about 10.6 core-hours, about 2.7 hours on 4 workers.** From the earlier addendum's timing, not a new measurement.

**The command for the rig (not run).** A stopped run resumes from the file; one circuit is one process.

```
node tools/ship/trainSubVestibularCmd.mjs run --specs wiringShuffledFresh --out brain/fishVestibularGen6.jsonl --workers 4
node tools/ship/trainSubVestibularCmd.mjs report --in brain/fishVestibularGen6.jsonl
```

Read the checks of the report first (the references record, the task re-check, the runner and sign self-tests, the start check); then the GEN 6 blocks, the WIRING WITHOUT MEMORY lines marked REGISTERED TEST, the DIRECTION lines and the OVERALL line. The post hoc pooled view of section 3 (Addendum 12's four real searches and this round's, against all twenty-four shuffles, as gains over each round's own autopilot) is **not printed by the command**; it needs the two files and is a separate, labelled computation if wanted.
