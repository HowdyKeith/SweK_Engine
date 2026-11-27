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

## 9. The result (the whole results file committed unread at 09062f15, then read once)
One start, 14.9 minutes on four processes, 49 records (sha256 95ee36184538cbd6...). **The checks hold**: the
scene-types and perfect-tally rounds' files as committed and passing their own checks; 48 flies, each once, its arm's
committed weights; HOMEP draw 1 flown the same twice.
* **T26: IN THE 26-TYPE SCENE A PERFECT TALLY FINDS HOME BETTER THAN THE FLY'S OWN** (48 above, none below,
  p 7.1e-15; by 0.3789 on average).
* **Q: IN THE 26-TYPE SCENE THE TALLY COSTS HOMING MORE THAN IN THE PLAIN** (40 above, 8 below, p 3.3e-6; by 0.0177 on
  average).

| arm | own tally: plain | own tally: 26-type | perfect tally: plain | perfect tally: 26-type |
|---|---|---|---|---|
| HOMEP | 0.5501 | 0.5911 | 0.9164 | 0.9630 |
| COURSE64 | 0.5541 | 0.5761 | 0.9099 | 0.9630 |
| HOME16 | 0.5517 | 0.5900 | 0.9169 | 0.9623 |
| H16BYC | 0.5548 | 0.5797 | 0.9123 | 0.9641 |

**Both expectations came**: T26 BETTER (99) and Q BETTER (80). So, as section 5 put it, the richer scene lifts a fly
with a perfect tally further than it lifts the fly with its own: in the 26-type scene the tally stands between the fly
and more home than it did in the plain one.

**Described after the reading, not registered (the gate recomputes it from the records):** **the cost grows in
proportion.** As a share of the perfect tally's home, the fly's own tally keeps the same in both scenes: the share in
the 26-type scene less the share in the plain one is above 0 for 23 flies and below for 25 (p 0.89), and over the
arms' means it is 0.6048 plain and 0.6066 26-type. The scene lifts the perfect-tally home by about 0.049 and the own
tally keeps three fifths of it, as it keeps three fifths of the plain home. And Q is carried by the course-chosen flies:
COURSE64 and H16BYC 12 of 12 each (the scene lifted their own homing least, by 0.022 and 0.025), HOMEP and HOME16 8 of
12 each (lifted by 0.041 and 0.038); with a perfect tally all four come home within 0.002 of each other in the 26-type
scene.

**What it does not mean.** Section 7 holds. Q is a difference in home scores, and with the share kept the same, a
larger difference is what a fixed fractional loss gives on a larger home; this round does not show the tally doing
worse in the richer scene, only that what it loses is lost from more. The share and the arms are read after the
results, so their p are not tests this round made. The perfect tally is the scene's true way home handed to the fly,
not a tally any fly could keep. Which landmarks each ring type sees is invented here. Nothing here is of the animal.
