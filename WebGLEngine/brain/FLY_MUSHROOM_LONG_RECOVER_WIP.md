# The recovering fly trained four times longer: does it reach the hand rule when the meanings swap? (registration)

**Registered 2026-11-18, before any code of this round exists.** Keith: "Let's do 1, 3 and 4, then once completed do
item 2". The recovery round (`brain/FLY_MUSHROOM_RECOVER_WIP.md`, read at fc2b8f0e) gave the mushroom fly a rate at
which it undoes its lessons, and on REV, where the meanings swap half way, its flies did better than the mushroom
round's and leaned on it. But **the hand rule with a recovery of 0.1 scored 0.5000 on REV, above every trained fly**
(the most 0.4777). The mushroom trainer round (`brain/FLY_MUSHROOM_TRAINER_WIP.md`, read at 82718128) found that the
mushroom fly's shortfall was its walk's length. **This round trains the recovering fly four times longer and asks
whether it reaches the hand rule.**

**Said first: the three things this round is weighed against were run and read.** RECOV is the recovery round's
(`brain/flyMushroomRecoverRound.jsonl`, sha256 f49dca61697f1407...), LONG the mushroom trainer round's
(`brain/flyMushroomTrainerRound.jsonl`, sha256 b463b5117a486cfc...), and the hand rules are the recovery round's
committed floors. This registration is written knowing their numbers and the scoping below.

## 1. What was measured before this note, and on what (scratch code; not committed)
The recovering fly trained 240 iterations (draws 1 to 3; the recipe below), on the mushroom rounds' 200 scoping lives
(seeds 3000001 + 7919 k), beside the recovery round's 60-iteration trainings of the same draws on the same lives
(its section 1):
| task, draw | 240 iterations | with b at 0 | b | 60 iterations |
|---|---|---|---|---|
| REV 1 | 0.2800 | 0.2800 | 0 | 0.2263 |
| REV 2 | 0.4437 | 0.2717 | 0.144 | 0.3843 |
| REV 3 | 0.4760 | 0.2880 | 0.195 | 0.3627 |
| ONE 1 | 0.8503 | 0.8503 | 0 | 0.6090 |
| ONE 2 | 0.7310 | 0.7310 | 0 | 0.7553 |
| ONE 3 | 0.8570 | 0.8570 | 0 | 0.7303 |
On these lives the hand rule with a recovery of 0.1 scores 0.4623 on REV (0.5100 with 0.2), and the hand rule 0.8730 on
ONE. **The longer walks did better on 5 of 6, and two of the three REV flies found more recovery than any 60-iteration
fly**; REV draw 1 never found any.

## 2. The fly and the walk
**The fly** is the recovery round's (`brain/rl/mushroomRecoverFly.mjs`, not edited) on the real teachers. **The walk**
is the recovery round's recipe with **240 iterations** (the mushroom trainer round's LONG): 16 flies tried, sigma 0.14,
lr 0.05, 4 fresh lives each, the best kept on the fixed 16. The trainer draws the same noise and the same lives for an
iteration whatever the walk's length, so **its first 60 iterations are RECOV's walk**, and the point kept is RECOV's
unless a later one does better on the 16.

## 3. The arms (12 draws each, **draws 1 to 12**, on each task)
| arm | the fly | how |
|---|---|---|
| **RLONG** | the recovering fly | 240 iterations, new |
| RECOV | the recovering fly | 60 iterations, the recovery round's as committed |
| LONG | the mushroom fly (no recovery) | 240 iterations, the mushroom trainer round's as committed |
**The tasks, teachers and audit are the mushroom round's** (200 lives, seeds 9000001 + 7919 k). **RLONG draw 1 of REV
is trained a second time.**

## 4. The readings (alpha 0.01, exact sign tests or rank sums, two-sided, ties against the claim; on each task; the checks first)
* **G: RLONG against RECOV, draw for draw** (sign test): the same walk, four times as long.
* **L: RLONG against LONG** (rank sum): as long a walk, with recovery or without. The flies differ by a weight, so the
  walks differ, and the arms are compared as groups.
* **H: RLONG against the hand rule the earlier rounds committed for the task** (sign test): on REV the recovery
  round's hand rule with a recovery of 0.1 (0.5000), on ONE the mushroom round's hand rule (0.8943). **Said plainly:
  0.1 is not the best recovery for the hand rule on REV** (0.2 scored higher on the scoping lives); it is the one
  committed.
* **Counted: USES** (the score less the score with p_b at 0, above 0.01) and **how many flies end with b at 0**.
* **The checks include** that both committed files are the ones committed and pass their own checks, that every RLONG
  walk starts as its draw's RECOV walk, and that the floors equal the recovery round's to the bit.
* Described: the rates, and the iteration kept.

## 5. What a reading would say
* REV H CANNOT or BETTER: **with a long enough walk the trainer finds the recovery the hand rule has**; the recovery
  round's shortfall was the walk's length, as the mushroom fly's was.
* REV H WORSE: a longer walk is not enough; the trainer still does not find what the hand rule has.
* REV G CANNOT with L BETTER: recovery is what helps, not the walk's length.

## 6. Expectations, written before the code
REV: G **BETTER about 55**, CANNOT 45. L **BETTER about 75**, CANNOT 25. H CANNOT about 55, WORSE 40, BETTER 5. USES at
least 8 of 12, about 65. ONE: G **BETTER about 75**, CANNOT 25. L **CANNOT about 80**. H **WORSE about 80**, CANNOT 20.
b at 0 in at least 10 of 12, about 85.

## 7. What it would and would not mean
Section 7 of the recovery round holds: this recovery draws every connection back equally, every trial. A walk that
finds it says what this trainer can find with more iterations, not how the animal undoes a lesson. 240 is the mushroom
trainer round's length, and nothing says it is enough.

## 8. The cost
24 trainings of about one minute each, with their audits: about 15 minutes on two processes.

## 9. The run (the gate never runs it and never gives the command the word `run`)
`node tools/ship/takeFlyMushroomLongRecover.mjs run` -> `brain/flyMushroomLongRecoverRound.jsonl`, committed byte for
byte, whole, before it is read; `node tools/ship/takeFlyMushroomLongRecover.mjs read` prints the checks and the reading.
