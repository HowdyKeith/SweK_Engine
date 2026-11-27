# A stronger trainer in the 26-type scene: does HOME16's recipe find there what HOMEP's could not tell apart? (registration)

**Registered 2026-11-27, before any code of this round exists.** Keith, of the rounds suggested after the scene-trained
round: "Let's do all 5"; this is the third. The scene-trained round (`brain/FLY_SCENE_TRAINED_WIP.md`, read at
0c6ac730) trained HOMEP's fly and recipe, 4 lives a tried fly, in the 26-type scene (HOMET): home there 10 of 12 above
HOMEP (p 0.039, by 0.009), not told apart at alpha 0.01. The home-gradient round (`brain/FLY_HOME_GRADIENT_WIP.md`)
found 16 lives a tried fly (HOME16) the stronger trainer in the plain scene. **This round trains with HOME16's recipe in
the 26-type scene and sets it against HOME16 trained in the plain one.**

## 1. What was measured before this note, and on what (scratch code; not committed)
HOME16's recipe trained in the 26-type scene, draw 1, on **50 scoping lives** (seeds 30000001 + 7919 k), home with the
fly's own tally:
| draw 1 | 26-type scene | plain scene |
|---|---|---|
| HOME16's recipe trained in the 26-type scene | 0.5977 | 0.5431 |
| HOME16 committed (trained in the plain scene) | 0.6076 | 0.5471 |
| HOMET committed (HOMEP's recipe in the 26-type scene) | 0.5999 | 0.5445 |
It kept the point of iteration 28. The training took 61.8 minutes. **One draw, below both: within what one training
differs from another, and not a reason to expect a sign.**

## 2. The scene and the task
The 26-type scene's training life (`brain/rl/typedHomeTrainEnv.mjs`), as committed and not edited.

## 3. The flies
**HOMET16: HOMEP's fly with HOME16's recipe (HOMEP's with 16 lives a tried fly), trained in the 26-type scene, 12 draws**
(the trained-to-home round's draws, each from its own seed and battery; the scene-trained round's training with this
recipe). Each is audited home **in the 26-type scene and in the plain scene over the homing round's 200 audit lives**,
and its course in the 26-type scene over the compass round's 200 (described). The comparisons are committed: **HOME16**,
its home in the plain scene from the home-gradient round (`brain/flyHomeGradientRound.jsonl`, sha256 138ea7125387ad24...)
and in the 26-type scene from the scene-types round (`brain/flySceneTypesRound.jsonl`, sha256 b615c753f69a9721...); and,
described, **HOMET** (`brain/flySceneTrainedRound.jsonl`, sha256 116ab243838357674...). **HOMET16 draw 1's weights are
audited a second time.**

## 4. The readings (alpha 0.01, exact sign tests over the 12 draws, paired by draw, two-sided, ties against the claim; the checks first)
* **S26: does the stronger trainer find the scene's gain?** HOMET16's home in the 26-type scene less HOME16's there.
* **SP: what does it cost in the plain scene?** HOMET16's home in the plain scene less HOME16's committed home.
* **The checks include** that the files compared against and those they rest on are the ones committed and pass their
  own checks, that every HOMET16 draw is there once with its seed, battery and recipe, that its weights give its
  scores, and that draw 1 audited twice is the same.
* Described: HOMET16 against HOMET in each scene (the recipe's worth in the 26-type scene), the 26-type scene's lift
  (its home there less in the plain) against HOME16's, p_c, the points kept, and the means.

## 5. What a reading would say
* S26 BETTER: with a trainer that can see it, training in the 26-type scene gains there; the scene-trained round's
  10 of 12 was a weak trainer's look at a real gain. S26 CANNOT: the 16-life trainer cannot tell it apart either.
* SP WORSE: the 26-type training costs the plain scene. SP CANNOT: no cost told apart.

## 6. Expectations, written before the code
S26: CANNOT about 65, BETTER 20, WORSE 15. SP: CANNOT about 70, WORSE 25, BETTER 5.

## 7. What it would and would not mean
About **this fly, this trainer and a scene made for it**, as the scene-trained round's section 7: CANNOT says what this
trainer finds in 12 draws. Which landmarks each ring type sees is invented. Nothing here is of the animal.

## 8. The cost
12 trainings of about 62 minutes and their audits, four at a time: about 3 hours 20 minutes, in the sandbox, started
detached (a background job is stopped at 2 hours).

## 9. The run (the gate never runs it and never gives the command the word `run`)
`node tools/ship/takeFlySceneStrong.mjs run` -> `brain/flySceneStrongRound.jsonl`, committed byte for byte, whole, before
it is read; `node tools/ship/takeFlySceneStrong.mjs read` prints the checks and the reading. The verdict will be section
10, "The result".

## 10. The result (the whole results file committed unread at b6c8aac8, then read once)
One start, 491.3 minutes, beside three other rounds on four cores, two trainings at a time; 13 records (sha256
2eaf6a3e33f37190...). **The checks hold**: the scene-types, home-gradient and scene-trained rounds' files as committed
and passing their own checks; 12 HOMET16 draws, each once, HOME16's recipe on its own battery; draw 1 audited the same
twice.
* **S26: WITH THE STRONGER TRAINER THE FLY TRAINED IN THE 26-TYPE SCENE CANNOT BE TOLD APART THERE** (8 above, 4 below,
  p 0.39).
* **SP: WITH THE STRONGER TRAINER THE FLY TRAINED IN THE 26-TYPE SCENE CANNOT BE TOLD APART IN THE PLAIN** (2 above,
  10 below, p 0.039).

| arm | home, 26-type scene | home, plain | course, 26-type scene |
|---|---|---|---|
| HOMET16 | 0.5993 | 0.5502 | 0.7170 |
| HOME16 | 0.5900 | 0.5517 | 0.7149 |
| HOMET | 0.6000 | 0.5474 | 0.7135 |

**Both expectations came**: S26 CANNOT (65) and SP CANNOT (70). So, as section 5 put it, the 16-life trainer cannot tell
the scene's gain apart either.

**Described after the reading, not registered (the gate recomputes it from the records):** **the stronger trainer buys
nothing in the 26-type scene that the weaker one did not.** HOMET16 against HOMET, the same scene with HOMEP's 4-life
recipe, is above in 5 of 12 there (0.0007 below on average) and in 9 of 12 in the plain (0.0029 above). Its lift over
the plain scene is wider than HOME16's in 10 of 12 (0.0491 against 0.0383; p 0.039), and its p_c higher than HOME16's
in 9 of 12 (2.030 against 1.685) but lower than HOMET's in 10 of 12 (against 2.132). Where training kept its best
ranges from iteration 4 to 56 (31.8 on average, of 60; HOMET's 32.9).

**What it does not mean.** Section 7 holds. Both readings are CANNOT: what this trainer finds in 12 draws, not that
training in the 26-type scene gains nothing there. The comparisons with HOMET, the lift and p_c are read after the
results, so their p are not tests this round made. Which landmarks each ring type sees is invented here. Nothing here
is of the animal.
