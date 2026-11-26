# A gain for each ring class: can the fly learn which landmarks to trust? (registration)

**Registered 2026-11-26, before any code of this round exists.** Keith, of the rounds suggested after the scene-trained
round: "Let's do all 5"; this is the second. The compass fly reads every ring neuron alike: one landmark gain, p_c, for
the whole ring. In the 26-type scene each ring type sees landmarks of its own, so some classes' cues may be worth more
than others'. The scene-trained round (`brain/FLY_SCENE_TRAINED_WIP.md`, read at 0c6ac730) trained the 3-weight fly
there (HOMET). **This round gives the fly one more weight for each of the 11 ring classes and trains it there.**

## 1. What was measured before this note, and on what (scratch code; not committed)
The new fly with all 11 gains at 1 is HOMEP's starting fly to the bit (checked on 3 lives). Trained with HOMEP's recipe in
the 26-type scene, draw 1, on **50 scoping lives** (seeds 30000001 + 7919 k): home **0.6085** in the 26-type scene and
**0.5498** in the plain one, against HOMET draw 1's 0.5999 and 0.5445. Its gains came out ER1 -0.31, ER2 1.31, ER3a 1.22, ER3d 0.77, ER3m -0.23, ER3p 1.66, ER3w 1.67, ER4d 1.96, ER4m
1.09, ER5 1.22, ER6 1.47: **two below 0 (a class switched off)**, p_c 1.81. It took 21
minutes. One draw tells nothing about the arm.

## 2. The fly (`brain/rl/classGainFly.mjs`, new: the compass fly, not edited, extended)
**The compass fly with each ring neuron's activity multiplied by its class's gain** (held at 0 and above) before the fly
reads it; the class is its type up to the first underscore (the scene-types round's 11 classes). Its weights are
[p_a, p_b, p_c, g_1 .. g_11]; the start is HOMEP's, with every g 1. The homing fly round it is the homing round's, as
HOMEP's.

## 3. The flies
**HOMEG: that fly, trained with HOMEP's recipe in the 26-type scene, 12 draws** (the trained-to-home round's draws, each
from its own seed, wiring and battery as HOMEP's). Each is audited home **in the 26-type scene and in the plain scene over
the homing round's 200 audit lives**, and its course in the 26-type scene over the compass round's 200 (described). The
comparison is **HOMET** as committed (`brain/flySceneTrainedRound.jsonl`, sha256 116ab243838357674...). **HOMEG draw
1's weights are audited a second time.**

## 4. The readings (alpha 0.01, exact sign tests over the 12 draws, paired by draw, two-sided, ties against the claim; the checks first)
* **G26: do the class gains help in the 26-type scene?** HOMEG's home there less HOMET's.
* **GP: do they cost the plain scene?** HOMEG's home in the plain scene less HOMET's there.
* **The checks include** that the scene-trained round's file and those it rests on are the ones committed and pass
  their own checks, that every HOMEG draw is there once with its seed, battery and recipe and 14 weights that are the
  ones it names, and that draw 1 audited twice is the same.
* Described: each class's gain over the 12 draws (how many draws switch it off), p_c, and the means.

## 5. What a reading would say
* G26 BETTER: **the fly learns which ring classes to trust**, and that is worth more than one gain for all.
* G26 CANNOT: 11 more weights give this trainer nothing it can tell in 12 draws (or cost it as much as they give).
* GP: what the gains learned in the 26-type scene does in the plain one, where every class sees the same landmarks.

## 6. Expectations, written before the code
G26: CANNOT about 55, BETTER 35, WORSE 10. GP: CANNOT about 75, WORSE 15, BETTER 10.

## 7. What it would and would not mean
About **this fly, this trainer and a scene made for it**: 14 weights steered by a noisy walk on 4 lives a try, so CANNOT
says what this trainer finds in 12 draws. Which landmarks each ring class sees is invented, so a class's gain says what
its invented cues were worth here, not what the animal's ring class is for. Nothing here is of the animal.

## 8. The cost
12 trainings of about 21 minutes and their audits, four at a time: about 75 minutes, in the sandbox.

## 9. The run (the gate never runs it and never gives the command the word `run`)
`node tools/ship/takeFlySceneGains.mjs run` -> `brain/flySceneGainsRound.jsonl`, committed byte for byte, whole, before it
is read; `node tools/ship/takeFlySceneGains.mjs read` prints the checks and the reading. The verdict will be section 10,
"The result".
