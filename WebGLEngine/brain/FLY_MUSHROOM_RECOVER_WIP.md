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
