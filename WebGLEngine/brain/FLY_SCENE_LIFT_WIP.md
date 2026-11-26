# Does training in the 26-type scene widen what that scene lifts the fly's homing by? (registration)

**Registered 2026-11-26, before any code of this round exists.** Keith, of the rounds suggested after the scene-trained
round: "Let's do all 5"; this is the first. The scene-trained round (`brain/FLY_SCENE_TRAINED_WIP.md`, read at
0c6ac730) found its two registered readings CANNOT, and **described after the reading** that the 26-type scene's lift
-- a draw's home there less its home in the plain scene -- was wider for the fly trained there (HOMET) than for the fly
trained in the plain scene (HOMEP) in 11 of 12 draws (p 0.0063), with HOMET's landmark gain p_c above HOMEP's in 9 of
12. That comparison was chosen after seeing the data. **This round asks it, registered, of 12 draws neither fly has had.**

## 1. What was measured before this note, and on what
No scratch code: **the scene-trained round's 12 draws are the scoping**, and its gate recomputes them (lift 0.0526
against 0.0410, wider in 11 of 12; p_c 2.13 against 1.77, above in 9 of 12). Each training took about 22 minutes.

## 2. The scene, the task, the flies
The 26-type scene (`brain/rl/typedSceneEnv.mjs`) and its training life (`brain/rl/typedHomeTrainEnv.mjs`), as committed
and not edited. **Two arms, each trained on draws 13 to 24** (each from its own seed and its own battery, as the
trained-to-home round's `batteryOf` gives them), HOMEP's fly and recipe:
* **HOMEP: trained in the plain scene** (the trained-to-home round's training to the bit, on these draws);
* **HOMET: trained in the 26-type scene** (the scene-trained round's training, on these draws).
Each draw of each arm is audited home **in the 26-type scene and in the plain scene over the homing round's 200 audit
lives**, and its course in the 26-type scene over the compass round's 200 (described). **HOMET draw 13's weights are
audited a second time** in a process of their own.

## 3. The readings (alpha 0.01, exact sign tests over the 12 draws, paired by draw, two-sided, ties against the claim; the checks first)
* **L: does training in the scene widen its lift?** HOMET's lift (home in the 26-type scene less home in the plain)
  less HOMEP's, draw for draw.
* **G: does it raise the landmark gain?** HOMET's p_c less HOMEP's.
* **R26 and RP again**: HOMET's home in the 26-type scene less HOMEP's there, and in the plain scene.
* **The checks include** that the scene-trained round's file and those it rests on are the ones committed and pass
  their own checks, that each arm's draw is there once with its seed, battery and recipe, that its weights give its
  scores, and that HOMET draw 13 audited twice is the same.
* Described: the means of each arm in each scene, p_a and p_b, where in training the best was kept, and all 24 draws
  of both rounds together.

## 4. What a reading would say
* L BETTER: **trained where its ring sees more, the fly leans on what it sees**: the scene-trained round's described
  lift was not chance. With G above, it does so through the landmark gain.
* L CANNOT: the 11 of 12 does not come again on fresh draws; it was chance, or too small for 12.
* R26 and RP say again what the scene-trained round's said, on other draws.

## 5. Expectations, written before the code
L: **BETTER about 55**, CANNOT 45. G: CANNOT about 60, above 40. R26: CANNOT about 60, BETTER 35, WORSE 5. RP: CANNOT
about 70, WORSE 25, BETTER 5.

## 6. What it would and would not mean
About **this fly, this trainer and a scene made for it**, as the scene-trained round's section 7. Draws 13 to 24 are
new draws of the same recipe, not a new recipe. Which landmarks each ring type sees is invented. Nothing here is of
the animal.

## 7. The cost
24 trainings of about 22 minutes and their audits, four at a time: about 2 hours 20 minutes, in the sandbox (the run
resumes if it is stopped).

## 8. The run (the gate never runs it and never gives the command the word `run`)
`node tools/ship/takeFlySceneLift.mjs run` -> `brain/flySceneLiftRound.jsonl`, committed byte for byte, whole, before it
is read; `node tools/ship/takeFlySceneLift.mjs read` prints the checks and the reading. The verdict will be section 9,
"The result".
