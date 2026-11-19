# Rung 4b close-out: the fish vestibular circuit gives a stateless pilot a small, consistent edge that only its tuning clears at the circuit level, and memory pays nowhere (2026-11-19; UNNUMBERED; writing only -- every number is copied from the note named beside it, and nothing was trained, scored or re-cut for this page)

Written after Addendum 17 returned (the last registered question of the rung), after the model of `brain/RUNG_4A_CLOSEOUT.md`.

## The question rung 4b asked

Does the extracted larval-zebrafish vestibular circuit (`vendor/zebrafish-vestibular/`: 84 afferents onto 47 central neurons, two feed-forward layers, Liu 2022 Source Data; `brain/FISH_VESTIBULAR_HELPER_WIP.md`) give a submarine pitch pilot something that the same machinery on shuffled wirings, permuted tuning or a plain net does not -- with a memory (the leaky trace, rung 4b as registered) or without one (NO STATE, Addenda 12 onward)? Two tasks: 4b-P (posture under a pitch disturbance) and 4b-E (an escape from a cued hazard). Four verdict cells: P/B, P/whole, E/E, E/whole.

## What every registered test returned

| test | what was compared | result | where |
|---|---|---|---|
| **Stage A** (168 circuits) | the leaky real circuit (lambda start 0.99) against 10 ER, 10 class-block, 10 degree-preserving and 4 count shuffles, per cell | **0 of 4 cells passed**: on 4b-P the leaky circuit never left the autopilot (+0.001 to +0.018, needs 0.020); on 4b-E it beat the autopilot by +1.7 to +2.2 and was ahead of the strongest shuffled family on none of the three audits (likewise on 4b-P). **The two-pathway claim does not hold** (aligned arm passes on neither task). Stage B is not owed. | `trainSubVestibularCmd report` on `brain/rig-results/fishVestibularStageA.4b-with-lambda.jsonl`; Addendum 9's preface |
| **Addenda 9 and 10** (post hoc, not judged) | lower lambda starts on 4b-P, then four replicates each | the leaky arms reach NO STATE's level from a low start (0.5) and the order is monotone in the leak: the less trace, the better | Addenda 9, 10 RESULT |
| **Addendum 11** (not judged) | the real wiring at the low start against the three shuffled families | NO STATE on the real wiring is the best circuit of the study on the whole arm (-0.360) and ties the low-start leaky pilot | Addendum 11 RESULT |
| **Addendum 12** (registered) | NO STATE, 4 real searches against 12 shuffled-wiring searches, Mann-Whitney U | **NOT SUPPORTED** (P/B p 0.1308; P/whole p 0.0516); real above shuffled by about 0.02 in 17 of 18 comparisons | Addendum 12 RESULT |
| **Addendum 13** (not judged) | 4b-E: the registered start, a lower start and NO STATE, replicated | memory does not pay on 4b-E either: the registered start is worse than NO STATE by 0.5 to 1.1, with wide spread | Addendum 13 RESULT |
| **Addendum 14** (registered) | NO STATE, 4 searches with the real afferent tuning against 12 with the tuning permuted | **SUPPORTED** in both cells (U 48 of 48, p 0.0005); the real tuning is worth 0.03 to 0.05 of a gain of about 0.19, and a scrambled tuning keeps three quarters of it | Addendum 14 RESULT |
| **Addendum 15** (registered, the circuit-level repair of 14) | the real tuning as ONE circuit (mean of 4 searches) ranked among 44 permuted circuits | **SUPPORTED** in both cells, at the edge: **2nd of 45, p 0.0444** | Addendum 15 RESULT |
| **Addendum 16** (registered replicate of 12, fresh shuffles and audits) | NO STATE, 4 real searches against 12 fresh shuffled searches, Mann-Whitney U | **SUPPORTED** in both cells (P/B U 48 of 48, p 0.0005; P/whole U 46 of 48, p 0.0022) | `brain/FISH_WIRING_FRESH_WIP.md` section 8 |
| **Addendum 17** (registered, the circuit-level repair of 12) | the real wiring as ONE circuit ranked among 44 shuffled circuits | **NOT SUPPORTED** in both cells: P/B 9th of 45 (p 0.2000), P/whole 3rd of 45 (p 0.0667, one circuit short) | `brain/FISH_WIRING_RANK_WIP.md` section 10 |
| **Plain-net control** and its **variants** (registered) | NO STATE on the real wiring against weight-matched and wider plain relu nets, then cell-matched widths and tanh | **NOT SUPPORTED, 0 of 4 cells**, and the plain nets keep 100 to 116 percent of the real wiring's gain; the reading **HOLDS** across the variants | `brain/PLAIN_NET_CONTROL_WIP.md`; `brain/PLAIN_NET_VARIANTS_WIP.md` section 9 |

## Addenda 16 and 17 do not contradict each other

They ask about the same wiring at two different units, and the second is the one that matches the claim.

* **Addendum 16 counts searches.** Its four real searches are four draws of ONE circuit, set against twelve DIFFERENT shuffled circuits. A U of 48 of 48 says every real search beat every shuffled search; it does not say the real circuit is unusual among circuits, because with 12 shuffled circuits the best a circuit-level rank could ever give is 1/13 = 0.077, which cannot meet a 0.05 line. Addendum 15 found exactly this flaw in Addendum 14 and repaired it; Addendum 17 is the same repair for the wiring.
* **Addendum 17 ranks circuits.** With 44 shuffled circuits it can reach 0.022. The real wiring came 9th and 3rd of 45. Its own note measured, before the run, how weak the test is at a gap of this size: even if the whole observed gap is real it clears the line 2 percent of the time on P/B and 12 percent on P/whole (section 7).
* **The integrator differs too, and it does not matter here.** Addendum 16's file is RK4 and 17's (appended to Addendum 12's file) is first-order; each file is consistent within itself (`brain/FISH_WIRING_RANK_WIP.md` section 9), and neither verdict mixes them.

So the honest one-line reading: **the real wiring's edge over shuffled wirings for a stateless pilot is in the same direction every time (about 0.02 on a gain of about 0.17 to 0.19) and too small for a circuit-level test of 45 to see; the real tuning's edge (0.03 to 0.05) is the one effect in the rung that clears a circuit-level line, and only just.**

## What was learned beyond the verdicts

* **Memory pays on neither task.** On 4b-P the leaky trace either sticks at the autopilot (the registered start) or, from a low start, merely reaches NO STATE; on 4b-E the registered start is worse than NO STATE. This is rung 4a's finding again: the gain the pilots show does not need the circuit's state.
* **Most of the gain is generic.** Shuffled wirings keep about 88 percent of it, a scrambled tuning three quarters, and a plain relu net 100 to 116 percent. What the extracted circuit adds, it adds at the margin.

## What stays closed, and why

* **Stage B** -- not owed: it was registered to run only if Stage A passed, and Stage A passed 0 of 4 cells.
* **The two-pathway claim** -- does not hold, by the arithmetic fixed in Addendum 7 before training.
* **A recurrent circuit** -- blocked, not refused: the article's data has no central-to-central connections, and the CATMAID server that holds them (`zf.hms.harvard.edu`) is not reachable from the sandbox (backlog `fish-vestibular-data-arrived-partial`).
* **No further shuffle, tuning or plain-net variant is planned.** Each would be a NEW registration with its own line written first, as Addenda 15 and 17 were.

## What this does NOT say

It is not a statement about the larval fish: the pilot is a submarine pitch controller with a linear readout, trained by a fixed search recipe on two synthetic tasks. It does not say the wiring makes no difference -- the direction repeats across three registered draws -- only that the difference is too small for the circuit-level test to see. And it does not reopen anything: nothing here was re-run, re-scored or re-cut.
