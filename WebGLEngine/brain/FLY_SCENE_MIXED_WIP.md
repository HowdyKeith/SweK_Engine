# Trained in both scenes at once: does the fly keep the 26-type scene's gain without the plain scene's cost? (registration)

**Registered 2026-11-26, before any code of this round exists.** Keith, of the rounds suggested after the scene-trained
round: "Let's do all 5"; this is the fourth. The scene-trained round (`brain/FLY_SCENE_TRAINED_WIP.md`, read at
0c6ac730) trained HOMEP's fly in the 26-type scene (HOMET): home there 10 of 12 above HOMEP (p 0.039) and in the plain
scene 8 of 12 below (p 0.39), neither told apart. **This round trains the same fly on lives of both scenes, alternately,
and asks where it lands between the two.**

## 1. What was measured before this note, and on what (scratch code; not committed)
HOMEP's recipe trained on alternate lives of the two scenes, draws 1 and 2, on **50 scoping lives** (seeds 30000001 +
7919 k), home with the fly's own tally:
| draw | 26-type scene: mixed / HOMET / HOMEP | plain scene: mixed / HOMET / HOMEP |
|---|---|---|
| 1 | 0.5882 / 0.5999 / 0.5773 | 0.5377 / 0.5445 / 0.5379 |
| 2 | 0.5967 / 0.5896 / 0.6071 | 0.5430 / 0.5409 / 0.5497 |
p_c came out 2.25 and 2.02. Each training took about 20 minutes. **Within what one training differs from another.**

## 2. The scenes and the task
The plain and the 26-type scenes' training lives (`brain/rl/typedHomeTrainEnv.mjs`), as committed and not edited. **The
mixed training life is the 26-type scene's on a life whose seed is odd and the plain scene's on one whose seed is even**,
in a new file holding one of each, not editing either. The trainer's lives step by 17 from their first, so a tried fly's
4 lives are two of each, and the battery's 64 are 32 of each.

## 3. The flies
**HOMEM: HOMEP's fly and recipe, trained on the mixed life, 12 draws** (the trained-to-home round's draws, each from its
own seed and battery). Each is audited home **in the 26-type scene and in the plain scene over the homing round's 200
audit lives**, and its course in the 26-type scene over the compass round's 200 (described). The comparisons are
committed: **HOMET** (`brain/flySceneTrainedRound.jsonl`, sha256 116ab243838357674...) and **HOMEP** (its committed home
in the plain scene, the scene-types round's in the 26-type). **HOMEM draw 1's weights are audited a second time.**

## 4. The readings (alpha 0.01, exact sign tests over the 12 draws, paired by draw, two-sided, ties against the claim; the checks first)
* **M26: does it keep the 26-type scene's gain?** HOMEM's home in the 26-type scene less HOMET's there.
* **MP: does it keep the plain scene?** HOMEM's home in the plain scene less HOMEP's committed home.
* **The checks include** that the scene-trained round's file and those it rests on are the ones committed and pass
  their own checks, that every HOMEM draw is there once with its seed, battery and recipe, that its weights give its
  scores, and that draw 1 audited twice is the same.
* Described: HOMEM against HOMEP in the 26-type scene and against HOMET in the plain, the weights, and the means.

## 5. What a reading would say
* M26 CANNOT and MP CANNOT: trained on both, the fly is as good in each as the fly trained for it, as far as 12 draws
  tell; with the scene-trained round's readings both CANNOT too, this trainer cannot tell the three apart.
* M26 WORSE: the plain lives cost it the 26-type scene. MP WORSE: the 26-type lives cost it the plain.

## 6. Expectations, written before the code
M26: CANNOT about 80, WORSE 15, BETTER 5. MP: CANNOT about 80, WORSE 10, BETTER 10.

## 7. What it would and would not mean
About **this fly, this trainer and a scene made for it**, as the scene-trained round's section 7: CANNOT says what this
trainer finds in 12 draws. Which landmarks each ring type sees is invented. Nothing here is of the animal.

## 8. The cost
12 trainings of about 21 minutes and their audits, four at a time: about 75 minutes, in the sandbox.

## 9. The run (the gate never runs it and never gives the command the word `run`)
`node tools/ship/takeFlySceneMixed.mjs run` -> `brain/flySceneMixedRound.jsonl`, committed byte for byte, whole, before it
is read; `node tools/ship/takeFlySceneMixed.mjs read` prints the checks and the reading. The verdict will be section 10,
"The result".
