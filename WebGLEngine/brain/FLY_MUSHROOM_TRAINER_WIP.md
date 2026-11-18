# The mushroom trainer: is the shortfall below the hand rule the trainer's choice of point, or its walk? (registration)

**Registered 2026-11-18, before any code of this round exists.** Keith: "Let's do all 5". The mushroom body round
(`brain/FLY_MUSHROOM_BODY_WIP.md`, read at 5f64c614) found every PLASTIC fly **below the rule set by hand** on the
plain task (ONE: 0.7757 against 0.8943; H WORSE, 0 of 12 above). The trainer round (`brain/FLY_COMPASS_TRAINER_WIP.md`,
read at bc153e21) found the compass fly's shortfall to be the trainer's choice of point: the walk reached the hand
rule's level, and keeping the best on 64 lives of the draw's own landed there. **This round asks which it is for the
mushroom fly**: the choice of point, or the walk.

**Said first: the arm this round is weighed against was run and read.** KEEP16 is the mushroom round's PLASTIC, its
records used as committed (`brain/flyMushroomRound.jsonl`, sha256 b4d8db8d81395987...). This registration is written
knowing its numbers and the scoping below.

## 1. What was measured before this note, and on what (scratch code; not committed)
**Three mushroom trainings replayed** (PLASTIC draws 1 to 3 on each task), with the trainer's arithmetic copied into
scratch code. Each replay reproduced its committed weights exactly. Every point of each walk was scored on 200 scoping
lives (seeds 3000001 + 7919 k; the hand rule scores 0.873 on ONE and 0.215 on REV there):
| task, draw | the point kept on the fixed 16 | the best on 64 lives (seeds 70000000 + 10007 s + 17 k) | the walk's best point anywhere |
|---|---|---|---|
| ONE 1 | 0.775 | 0.791 | 0.812 (iteration 59) |
| ONE 2 | 0.795 | 0.794 | 0.799 (iteration 58) |
| ONE 3 | 0.658 | 0.626 | 0.690 (iteration 32) |
| REV 1 | 0.217 | 0.225 | 0.245 |
| REV 2 | 0.257 | 0.237 | 0.280 |
| REV 3 | 0.218 | 0.239 | 0.239 |
**On ONE no point of any walk reaches the hand rule**, and a better choice of point does not help (+0.016, -0.001,
-0.033). The walks were still climbing at iteration 60.

**The same walks, longer** (240 iterations, the rest of the recipe unchanged, the best on the fixed 16 kept; the first 60
iterations are the committed walk):
| task | draw 1 | draw 2 | draw 3 |
|---|---|---|---|
| ONE, 240 iterations | 0.885 | 0.875 | 0.770 |
| ONE, 240, the last point | 0.834 | 0.880 | 0.800 |
| REV, 240 iterations | 0.245 | 0.314 | 0.296 |
**The longer walk gains 0.08 to 0.11 on ONE** and reaches the hand rule on two draws of three. A training of 240
iterations takes about 0.7 minutes.

## 2. The arms (12 draws each, **draws 1 to 12**, on each task: the mushroom round's PLASTIC fly, task, recipe, seed and audit)
| arm | the trainer | trainings |
|---|---|---|
| KEEP16 | 60 iterations, the best on the fixed 16 (the mushroom round's) | the mushroom round's PLASTIC, as committed |
| **LONG** | **240 iterations**, the best on the fixed 16 | new |
| **BAT64** | 60 iterations, **the best on 64 lives of the draw's own** (seeds 70000000 + 10007 s + 17 k) | new |
LONG differs from KEEP16 only in the walk's length, and its first 60 iterations are KEEP16's walk. BAT64 differs only in
the point kept. **LONG draw 1 of ONE is trained a second time.**

## 3. The readings (alpha 0.01, exact two-sided sign tests, ties against the claim; on each task; the checks first, and a failed check means nothing is weighed)
* **G: LONG against KEEP16**, draw for draw: does the longer walk pay?
* **K: BAT64 against KEEP16**, draw for draw: does the choice of point pay?
* **HG: LONG against the hand rule** (the mushroom round's committed 0.8943 on ONE and 0.2220 on REV), 12 flies.
* **HK: BAT64 against the hand rule.**
* **The checks include** that the mushroom round's file is the committed one and passes its own checks, that the start
  and the hand rule equal the mushroom round's to the bit, and that each LONG record's history at iteration 0 is its
  draw's committed record's (the walks start the same).
* Described: the rates, each arm's history, the iteration BAT64 keeps.

## 4. What a reading would say
* G BETTER and K CANNOT on ONE: **the mushroom fly's shortfall was its walk's length, not the choice of point** -- the
  other way round from the compass fly. Two trainings of the same trainer can fall short for different reasons.
* HG CANNOT on ONE: given the walk, the trainer finds what the hand rule gives.

## 5. Expectations, written before the code
ONE: G **BETTER about 85 percent**; K **CANNOT about 75**; HG CANNOT about 55, WORSE 30, BETTER 15; HK **WORSE about 85**.
REV: G BETTER about 70, CANNOT 30; K CANNOT about 70; HG **BETTER about 75**; HK CANNOT about 50, BETTER 45. LONG's mean on
ONE between 0.80 and 0.88, about 60.

## 6. What it would and would not mean
About **this trainer on this fly**: natural ES, 16 flies a step, 93 weights, 91 of them a readout that starts at 0. A
walk that needs 240 iterations here and levels in 5 on the compass says how hard each fly's weights are to find, not
which fly is better. A longer walk is not a better rule: if LONG reaches the hand rule, the trainer found what the known
valence pairing gives.

## 7. The cost
24 LONG trainings of about 0.7 minutes and 24 BAT64 trainings of about 0.3, with their audits: about 30 minutes on one
process, under 10 at four.

## 8. The run (the gate never runs it and never gives the command the word `run`)
`node tools/ship/takeFlyMushroomTrainer.mjs run` -> `brain/flyMushroomTrainerRound.jsonl`, committed byte for byte,
whole, before it is read; `node tools/ship/takeFlyMushroomTrainer.mjs read` prints the checks and the reading.
