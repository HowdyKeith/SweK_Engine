# A perfect tally in the 26-type scene: is the tally still what holds homing back? (registration)

**Registered 2026-11-26, before any code of this round exists.** Keith, of the rounds suggested after the scene-trained
round: "Let's do all 5"; this is the fifth. The perfect-tally round (`brain/FLY_HOME_TRUE_TALLY_WIP.md`) found that with
the true way home shown, the flies come home far better than with their own tally (about 0.91 against 0.55 in the plain
scene). The scene-types round (`brain/FLY_SCENE_TYPES_WIP.md`) found that in the 26-type scene the compass reads better
and the flies come home better with their own tally (by about 0.03). **This round shows the true way home in the
26-type scene and asks whether the tally's cost there is less, as much, or more.**

## 1. What was measured before this note, and on what (scratch code; not committed)
HOMEP draw 1 and COURSE64 draw 1, as committed, on **50 scoping lives** (seeds 30000001 + 7919 k), home:
| fly | own tally: plain / 26-type | perfect tally: plain / 26-type |
|---|---|---|
| HOMEP 1 | 0.5379 / 0.5773 | 0.9111 / 0.9770 |
| COURSE64 1 | 0.5500 / 0.5963 | 0.9103 / 0.9763 |
**The tally's cost grew in the 26-type scene** (0.373 to 0.400, 0.360 to 0.380): the better compass lifts the perfect
tally more than the fly's own. The perfect tally in the plain scene here was the perfect-tally round's at sigma 0 to the
bit. A fly took about 40 seconds for both scenes.

## 2. The scene and the flies (no training)
The 26-type scene (`brain/rl/typedSceneEnv.mjs`), as committed and not edited. **The compass-noise round's 48 committed
flies** (HOMEP, COURSE64, HOME16, H16BYC, 12 each, as trained), each flown home **in the 26-type scene with the true way
home shown from HOME_AT**, as the perfect-tally round shows it (the bearing from the fly's true position to its door in
place of its tally's; steering on its own compass), over **the homing round's 200 audit lives**. The other three numbers
are committed: its own-tally home in the plain scene (committed), in the 26-type scene (`brain/flySceneTypesRound.jsonl`),
and its perfect-tally home in the plain scene (`brain/flyHomeTrueTallyRound.jsonl`, sigma 0). **HOMEP draw 1 is flown a
second time.**

## 3. The readings (alpha 0.01, exact sign tests over the 48 flies, two-sided, ties against the claim; the checks first)
* **T26: does a perfect tally still help in the 26-type scene?** The perfect tally's home there less the fly's own there.
* **Q: is the tally's cost there larger?** That difference less the same difference in the plain scene.
* **The checks include** that the perfect-tally and scene-types rounds' files and those they rest on are the ones
  committed and pass their own checks, that every fly is its arm's committed weights, that the perfect tally in the
  plain scene is the perfect-tally round's at sigma 0 to the bit (on lives of the gate's), and that HOMEP draw 1 is the
  same twice.
* Described: each arm's four numbers, and the perfect tally's lift (26-type less plain) against the own tally's.

## 4. What a reading would say
* T26 BETTER: the tally still holds homing back in a scene the compass reads well.
* Q BETTER (the cost larger): **a better compass makes the tally the larger part of what is lost**; the next gain is in
  the tally. Q CANNOT: the cost is as large; WORSE: the better compass closes part of the gap.

## 5. Expectations, written before the code
T26: **BETTER about 99**. Q: **BETTER about 80**, CANNOT 15, WORSE 5.

## 6. What it would and would not mean
About **this fly and its tally**: the perfect tally is a bound, not a fly, and the scene is made for this compass, as
the scene-types round's section 7. Nothing here is of the animal.

## 7. The cost
48 flies, each about 30 seconds on 200 lives, and a second HOMEP draw 1, four at a time: about 10 minutes, in the sandbox.

## 8. The run (the gate never runs it and never gives the command the word `run`)
`node tools/ship/takeFlySceneTally.mjs run` -> `brain/flySceneTallyRound.jsonl`, committed byte for byte, whole, before it
is read; `node tools/ship/takeFlySceneTally.mjs read` prints the checks and the reading. The verdict will be section 9,
"The result".
