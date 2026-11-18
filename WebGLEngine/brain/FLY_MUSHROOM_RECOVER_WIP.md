# The mushroom body recovers: does a fly that can undo its lessons do better when the meanings swap? (registration)

**Registered 2026-11-18, before any code of this round exists.** Keith: "Let's do all 5". The mushroom body round
(`brain/FLY_MUSHROOM_BODY_WIP.md`, read at 5f64c614) found that a fly whose dopamine teachers are the real ones learns
within its life. **When the meanings swap half way (REV), its flies averaged only 0.25**, where ONE, with the
meanings fixed, gave 0.78. Its rule can only weaken connections. To undo a lesson it must weaken the opposite
connections as well, and that leaves the odour that was punished weak on both sides. The compass fly had a recovery
rate, every connection drawn back toward its synapse count, and the trainer drove it to 0 there in all 72 plastic flies
of three rounds (the compass, balanced and trainer rounds). **This round gives the mushroom fly the same recovery rate and asks whether REV uses it.**

**Said first: the arm this round is weighed against was run and read.** PLASTIC is the mushroom round's, its records
used as committed (`brain/flyMushroomRound.jsonl`, sha256 b4d8db8d81395987...).

## 1. What was measured before this note, and on what (scratch code; not committed)
**The hand rule with a recovery rate** (200 scoping lives, seeds 3000001 + 7919 k):
| recovery b | 0 | 0.01 | 0.02 | 0.05 | 0.1 | 0.2 |
|---|---|---|---|---|---|---|
| ONE | 0.8730 | 0.8687 | 0.8523 | 0.8077 | 0.7523 | 0.6760 |
| REV | 0.2153 | 0.2377 | 0.2483 | 0.3723 | 0.4623 | 0.5100 |
**Recovery pays when lessons must be undone and costs when they must be kept.**

**Short trainings** (the recipe below; draws 1 to 3; the same scoping lives):
| task, draw | score | with b at 0 | a | b |
|---|---|---|---|---|
| REV 1 | 0.2263 | 0.2263 | 1.016 | 0 |
| REV 2 | 0.3843 | 0.1813 | 1.161 | 0.0764 |
| REV 3 | 0.3627 | 0.2210 | 1.121 | 0.0645 |
| ONE 1 | 0.6090 | 0.6090 | 0.881 | 0 |
| ONE 2 | 0.7553 | 0.7553 | 1.269 | 0 |
| ONE 3 | 0.7303 | 0.7303 | 1.017 | 0 |
Two of three REV flies found a recovery rate and leaned on it; every ONE fly drove it to 0.

## 2. The fly (`brain/rl/mushroomRecoverFly.mjs`, new: `brain/rl/mushroomFly.mjs`'s fly, not edited, with one more weight)
After each trial's decision, **every Kenyon-cell-to-output connection is drawn back toward its synapse count: w <- w + b
(w0 - w)**, with **b = 0.05 max(0, p_b)**. Its weights are **[v_1..v_91, bias, p_a, p_b]**, and **the start is the
mushroom fly's with p_b 0** (no recovery). Nothing else changes.

## 3. The arms (12 draws each, **draws 1 to 12**, on each task)
| arm | the fly | trainings |
|---|---|---|
| PLASTIC | the mushroom round's (no recovery) | as committed |
| **RECOV** | the same fly with a recovery rate it may learn | new |
**The recipe, the tasks, the teachers (the real ones) and the audit are the mushroom round's.** The walk is not
PLASTIC's: the extra weight changes every step's noise, so the arms are compared as groups, not draw for draw.
**RECOV draw 1 of REV is trained a second time.**

## 4. The readings (alpha 0.01, exact rank sums or sign tests, two-sided, ties against the claim; on each task; the checks first)
* **R: RECOV against PLASTIC** (rank sum).
* **H: RECOV against the hand rule** (the mushroom round's committed 0.8943 on ONE and 0.2220 on REV; sign test).
* **Counted: USES** in RECOV (the score less the score with p_b at 0, the rest kept, above 0.01), and **how many RECOV
  flies end with b at 0**.
* **The checks include** that the mushroom round's file is the committed one and passes its own checks, and that the
  start and the hand rule equal the mushroom round's to the bit.
* Described: the rates a and b, and the hand rule with a recovery of 0.1 on each task.

## 5. What a reading would say
* REV R BETTER with USES: **a fly that can undo its lessons does better when the meanings swap, and leans on it**.
  The 72 plastic compass flies drove recovery to 0 because their task never asked them to undo anything.
* ONE with b at 0 in most flies: the same trainer, given the same choice, refuses recovery when lessons must be kept.

## 6. Expectations, written before the code
REV: R **BETTER about 70 percent**, CANNOT 30; H BETTER about 75; USES at least 6 of 12, about 60. ONE: R CANNOT about 60,
WORSE 30; H WORSE about 90; b at 0 in at least 10 of 12, about 75.

## 7. What it would and would not mean
About **this rule**: a recovery that draws every connection back equally, every trial, whether taught or not. The animal
has other ways to undo a lesson: potentiation by dopamine without Kenyon-cell activity, and extinction learning in other
compartments. A recovery that helps here says that undoing pays in this task, not how the fly does it. The walk is the
mushroom round's 60 iterations; the mushroom trainer round asks separately whether longer walks find more.

## 8. The cost
24 trainings of about 0.3 minutes each, with their audits: about 10 minutes on one process.

## 9. The run (the gate never runs it and never gives the command the word `run`)
`node tools/ship/takeFlyMushroomRecover.mjs run` -> `brain/flyMushroomRecoverRound.jsonl`, committed byte for byte, whole,
before it is read; `node tools/ship/takeFlyMushroomRecover.mjs read` prints the checks and the reading.

## 10. The result (the whole results file committed unread at 67354bc3, then read once)
One start, 4.9 minutes on two processes, 26 records (24 draws, REV's draw 1 trained a second time, the floors; sha256
f49dca61697f1407...). **The checks hold.** The hand rule with a recovery of 0.1 scores 0.7627 on ONE and 0.5000 on REV.
* **REV R: THE FLY THAT CAN RECOVER DOES BETTER THAN THE MUSHROOM ROUND'S FLY** (ranks 205, p 0.00086).
* **REV H: THE FLY THAT CAN RECOVER DOES BETTER THAN THE RULE SET BY HAND** (11 of 12 above 0.2220, p 0.0063).
* **ONE R: THE FLY THAT CAN RECOVER CANNOT BE TOLD APART FROM THE MUSHROOM ROUND'S FLY** (ranks 143, p 0.71).
* **ONE H: THE FLY THAT CAN RECOVER DOES WORSE THAN THE RULE SET BY HAND** (0 of 12 above 0.8943).

| task | RECOV: mean (least, most) | with b at 0 | USES | b at 0 | PLASTIC |
|---|---|---|---|---|---|
| REV | 0.3785 (0.2053, 0.4777) | 0.2282 | 10 of 12 | 2 of 12 | 0.2524 |
| ONE | 0.7692 (0.6603, 0.8370) | 0.7692 | 0 of 12 | 12 of 12 | 0.7757 |

**Every expectation came.** So, as section 5 put it, **a fly that can undo its lessons does better when the meanings
swap, and leans on it**: ten of the twelve REV flies lose 0.14 to 0.24 with their recovery set to 0, and the arm falls
to the mushroom round's level. And the same trainer, given the same choice on ONE, drove recovery to 0 in every fly.
The plastic compass flies drove it to 0 for the same reason: their tasks never asked them to undo a lesson.
Described, not registered: REV's recovery rates ran 0.062 to 0.108 where not 0, and the flies with more of it scored
higher (Spearman 0.59).

Measured after the reading (not registered; the gate recomputes it): **the hand rule with a recovery of 0.1 scores
0.5000 on REV, above every trained fly** (the most 0.4777). The trainer found recovery, but not as much of it, nor the
readout to go with it. The mushroom trainer round found the same walk length too short on ONE.

**What it does not mean.** Section 7 holds. The recovery here draws every connection back equally, every trial, whether
taught or not. That undoing pays in this task says nothing about how the animal undoes a lesson (dopamine without
Kenyon-cell activity, or extinction in other compartments): a result says what this fly needs, not how the fly does it.
