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

## 10. The result (the whole results file committed unread at 608d47d2, then read once)
One start, 280.0 minutes, beside three other rounds on four cores; 13 records (sha256 77c2543175f9f65e...). **The checks
hold**: the scene-trained round's file as committed and passing its own checks; 12 HOMEM draws, each once, HOMEP's
recipe on its own battery; draw 1 audited the same twice.
* **M26: TRAINED IN BOTH SCENES THE FLY CANNOT BE TOLD APART IN THE 26-TYPE FROM ONE TRAINED THERE ALONE** (6 above,
  6 below, p 1.0).
* **MP: TRAINED IN BOTH SCENES THE FLY CANNOT BE TOLD APART IN THE PLAIN FROM ONE TRAINED THERE ALONE** (2 above,
  10 below, p 0.039).

| arm | home, 26-type scene | home, plain | course, 26-type scene |
|---|---|---|---|
| HOMEM | 0.5996 | 0.5483 | 0.7150 |
| HOMET | 0.6000 | 0.5474 | 0.7135 |
| HOMEP | 0.5911 | 0.5501 | 0.7130 |

**Both expectations came**: M26 CANNOT (80) and MP CANNOT (80). With the scene-trained round's readings, as section 5
put it, this trainer cannot tell the three flies apart in 12 draws by the registered readings.

**Described after the reading, not registered (the gate recomputes it from the records):** **the fly trained in both
scenes is the fly trained in the 26-type scene.** Against HOMET it is the same in the plain scene too (6 above, 6
below, p 1.0; 0.0009 on average), its lift the same (7 above, 5 below), and its weights much the same (p_a, p_b, p_c
1.018, -0.616, 2.098 against HOMET's 0.996, -0.604, 2.132 and HOMEP's 0.955, -0.760, 1.768; p_c against HOMET's 5
above, 7 below). Against HOMEP in the 26-type scene it is above in 10 of 12 (p 0.039; 0.0086 on average), as HOMET was
in the scene-trained round (10 of 12). Half its training lives in the plain scene moved it nowhere that 12 draws show:
its p_c rose with HOMET's, and MP's 2 of 12 is HOMEP's small edge in the plain (0.0018 on average), which HOMET had too
(4 of 12 there).

**What it does not mean.** Section 7 holds. Both readings are CANNOT, which says what this trainer finds in 12 draws,
not that the flies are the same. The comparison with HOMET in the plain, the weights and the lift are read after the
results, so their p are not tests this round made. Which landmarks each ring type sees is invented here. Nothing here
is of the animal.
