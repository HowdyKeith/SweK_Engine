# Trained in the scene each ring type sees for itself: does the fly come home better than untrained there? (registration)

**Registered 2026-11-26, before any code of this round exists.** Keith: "Let's do the retraining in the typed scene".
The scene-types round (`brain/FLY_SCENE_TYPES_WIP.md`, read at 1ff16e90) found that **in a scene where each ring type
sees two landmarks of its own, the committed flies, never trained for it, come home better** (by about 0.04 in the
26-type scene). **This round trains the homing fly in that scene and asks whether training there adds to what the scene
gives untrained.**

## 1. What was measured before this note, and on what (scratch code; not committed)
HOMEP's recipe (the trained-to-home round's: 60 iterations, 16 tried, 4 lives each, the best kept on 64 battery lives
of the draw's own), **trained in the 26-type scene** for draws 1 and 2, on **50 scoping lives** (seeds 30000001 +
7919 k), home with the fly's own tally:
| draw | home in the 26-type scene: retrained / committed (trained in the plain scene) | home in the plain scene: retrained / committed |
|---|---|---|
| 1 | 0.5999 / 0.5773 | 0.5445 / 0.5379 |
| 2 | 0.5896 / 0.6071 | 0.5409 / 0.5497 |
**One up by 0.023, one down by 0.017**: within what one training differs from another. Each training took 21 minutes.
The landmark gain p_c came out 1.99 and 2.04, against the committed 1.92 and 1.60.

## 2. The scene and the task
The 26-type scene of `brain/rl/typedSceneEnv.mjs`, as committed and not edited. **The training life is that scene's
homing life scored for a trainer** as `brain/rl/homeTrainEnv.mjs` scores the plain one (every tick pays 0 but the last,
which pays the homing score), in a new file extending it, not editing either.

## 3. The flies
**HOMET: HOMEP's fly and recipe, trained in the 26-type scene, 12 draws** (the trained-to-home round's draws, each
from its own seed and battery as HOMEP's was). Each is audited home **in the 26-type scene over the homing round's 200
audit lives**, home **in the plain scene** over the same lives, and its course in the 26-type scene over the compass
round's 200 audit lives (described). **HOMEP**, as committed, is the comparison: its home in the 26-type scene is the
scene-types round's (`brain/flySceneTypesRound.jsonl`, sha256 b615c753f69a9721...), its home in the plain scene its
committed one. **HOMET draw 1's weights are audited a second time** in a process of their own.

## 4. The readings (alpha 0.01, exact sign tests over the 12 draws, paired by draw, two-sided, ties against the claim; the checks first)
* **R26: does training in the scene add to it?** HOMET's home in the 26-type scene less HOMEP's there.
* **RP: does it cost the plain scene?** HOMET's home in the plain scene less HOMEP's committed home.
* **The checks include** that the scene-types round's file and those it rests on are the ones committed and pass their
  own checks, that every HOMET draw is there once with its seed, battery and recipe, that its weights give its scores,
  and that draw 1 audited twice is the same.
* Described: the weights (p_a, p_b, p_c) against HOMEP's, the course, and where in training the best was kept.

## 5. What a reading would say
* R26 BETTER: **the fly trained in a scene its compass can read learns to use it**, beyond what the scene gives a fly
  trained elsewhere.
* R26 CANNOT: **the scene's gain is the scene's**: training there adds nothing this trainer can find in 12 draws.
* RP WORSE: what it learns there costs it in the plain scene. CANNOT: no cost that can be told.

## 6. Expectations, written before the code
R26: CANNOT about 60, BETTER 30, WORSE 10. RP: CANNOT about 70, WORSE 20, BETTER 10.

## 7. What it would and would not mean
About **this fly, this trainer and a scene made for it**: the trainer steers three weights by a noisy walk on 4 lives
a try, so CANNOT says what this trainer finds in 12 draws, not that no fly could do better. Which landmarks each ring
type sees is invented here, as in the scene-types round. Nothing here is of the animal.

## 8. The cost
12 trainings of about 21 minutes and their audits, four at a time: about 75 minutes, in the sandbox.

## 9. The run (the gate never runs it and never gives the command the word `run`)
`node tools/ship/takeFlySceneTrained.mjs run` -> `brain/flySceneTrainedRound.jsonl`, committed byte for byte, whole,
before it is read; `node tools/ship/takeFlySceneTrained.mjs read` prints the checks and the reading.

## 10. The result (the whole results file committed unread at 0c6ac730, then read once)
One start, 72.8 minutes on four processes, 13 records (sha256 116ab243838357674...). **The checks hold**: the
scene-types round's file as committed and passing its own checks; 12 HOMET draws, each once, HOMEP's recipe on its own
battery; draw 1 audited the same twice.
* **R26: TRAINED IN THE 26-TYPE SCENE THE FLY CANNOT BE TOLD APART THERE AT FINDING HOME** (10 above, 2 below, p 0.039;
  by 0.0089 on average).
* **RP: TRAINED IN THE 26-TYPE SCENE THE FLY CANNOT BE TOLD APART IN THE PLAIN AT FINDING HOME** (4 above, 8 below,
  p 0.39; by -0.0027 on average).

| arm | home: 26-type scene / plain scene | course: 26-type scene |
|---|---|---|
| HOMET (trained in the 26-type scene) | 0.6000 / 0.5474 | 0.7135 |
| HOMEP (trained in the plain scene) | 0.5911 / 0.5501 | 0.7130 |

**Both expectations came**: R26 CANNOT (60) and RP CANNOT (70). So, as section 5 put it, **the scene's gain is the
scene's**: training there adds nothing this trainer can tell in 12 draws at alpha 0.01, and it costs nothing that can
be told in the plain scene.

**Described after the reading, not registered (the gate recomputes it from the records):** **the scene's lift widens.**
Each draw's home in the 26-type scene less its home in the plain one is larger for HOMET than for HOMEP in 11 of 12
draws (p 0.0063, by 0.0116 on average: 0.0526 against 0.0410). HOMET's landmark gain p_c is above HOMEP's in 9 of 12
(p 0.15; mean 2.13 against 1.77). Trained where its ring sees more, the fly leans a little more on what it sees: a
little better there and a little worse in the plain scene, each too small to tell alone.

**What it does not mean.** Section 7 holds. The lift is a difference of the two registered readings, chosen after
seeing them, so its p is not a test this round made; a round registered to ask it would have to ask it again. CANNOT is
what this trainer finds in 12 draws: three weights steered by a noisy walk on 4 lives a try. Which landmarks each ring
type sees is invented here. Nothing here is of the animal.
