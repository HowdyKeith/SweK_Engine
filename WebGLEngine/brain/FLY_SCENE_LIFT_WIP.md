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

## 9. The result (the whole results file committed unread at fc7f4a4d, then read once)
One start, 356.2 minutes, beside three other rounds on four cores; 25 records (sha256 dbe0201c892587cb...). **The
checks hold**: the scene-trained round's file as committed and passing its own checks; 12 draws of each of HOMEP and
HOMET, each once, HOMEP's recipe on its own battery; HOMET draw 13 audited the same twice.
* **L: TRAINED IN THE 26-TYPE SCENE THE FLY CANNOT BE TOLD APART IN WHAT THAT SCENE GAINS IT** (9 above, 3 below,
  p 0.15; HOMET's lift 0.0502 against HOMEP's 0.0372).
* **G: TRAINED IN THE 26-TYPE SCENE THE FLY'S LANDMARK GAIN CANNOT BE TOLD APART** (10 above, 2 below, p 0.039; p_c
  2.010 against 1.594).
* **R26: TRAINED IN THE 26-TYPE SCENE THE FLY FINDS HOME THERE BETTER** (11 above, 1 below, p 0.0063).
* **RP: TRAINED IN THE 26-TYPE SCENE THE FLY CANNOT BE TOLD APART IN THE PLAIN AT FINDING HOME** (4 above, 8 below,
  p 0.39).

| arm | home, 26-type scene | home, plain | lift | p_c | course, 26-type scene |
|---|---|---|---|---|---|
| HOMET | 0.6002 | 0.5500 | 0.0502 | 2.010 | 0.7182 |
| HOMEP | 0.5891 | 0.5519 | 0.0372 | 1.594 | 0.7190 |

**Against the expectations**: L came CANNOT (written 45, BETTER 55); G CANNOT (60); R26 BETTER (35, against CANNOT
60); RP CANNOT (70). So, as section 4 put it, the scene-trained round's 11 of 12 for the lift did not come again at
alpha 0.01 on fresh draws -- but its R26, CANNOT there at 10 of 2, came BETTER here at 11 of 1. The two rounds traded
places: what one round found only after reading, the other found registered, and the other way about.

**Described after the reading, not registered (the gate recomputes it from the records):** **the two rounds point the
same way and by about as much.** The lift is wider for HOMET by 0.0130 on average here and was by 0.0116 there; p_c
higher by 0.416 here and 0.364 there. Over all 24 draws of both rounds together the lift is wider in 20 and narrower in
4 (p 0.0015), p_c higher in 19 and lower in 5 (p 0.0066), home in the 26-type scene higher in 21 and lower in 3
(p 0.0003), and home in the plain scene higher in 8 and lower in 16 (p 0.15). Where training kept its best is much the
same in both arms (at iteration 29.6 for HOMET and 27.8 for HOMEP on average, of 60), and so is course in the 26-type scene (0.7182
against 0.7190); p_a is 1.050 against 1.077, p_b -0.775 against -0.571.

**What it does not mean.** Section 6 holds. L and G are CANNOT: this round alone does not show that training in the
26-type scene widens what it lifts, nor that it raises the landmark gain. The 24-draw counts pool a round read before
this one was registered with this one, after both were read, so their p are not tests either round made. R26 says the
fly trained in the 26-type scene homes better there than the plain-trained fly, by 0.011; it does not say why. Which
landmarks each ring type sees is invented here. Nothing here is of the animal.
