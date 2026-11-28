# Can the fly's tally learn from its compass's corrections? (registration)

**Registered 2026-11-28, before any code of this round exists.** Keith, of the rounds suggested after v4936: "Let's do
all the items listed, in the order you suggest"; this is "train the tally". Round E (`brain/FLY_SCENE_TALLY_WIP.md`)
found the perfect tally finding home far better than the fly's own in the 26-type scene (0.96 against 0.59), so the
gain left is in the tally. The homing-offset round (`brain/FLY_HOME_OFFSET_WIP.md`) found that an offset in the
believed heading costs finding home little and a wobble costs it much: the tally (`brain/rl/homingFly.mjs`) adds a unit
step along the believed heading each tick, and a gust the fly does not feel turns it while its belief catches up only
slowly, through the ring neurons. **This round gives the tally one thing it does not use today -- how far the compass
just corrected the belief -- and asks whether a tally that uses it finds home better.**

## 1. What was measured before this note, and on what (scratch code; not committed)
HOMEP draw 1, as committed, in the 26-type scene, on **30 scoping lives (seeds 90000001 + 7919 k)**:
| tally | home |
|---|---|
| today's (a unit step along the belief) | 0.6078 |
| corrected, g 1, every tick a correction (memory tau 10 / 30 / 100) | 0.5841 / 0.5756 / 0.6117 |
| corrected, g 1, only corrections above 0.05 rad | 0.6078 (no single tick's correction is that large) |
| corrected, g 1, tau 150 / 250 / 500 / unbounded | 0.6194 / 0.6342 / 0.6314 / 0.5207 |
| corrected, g 0.5 / 1.5, tau 250 | 0.6087 / 0.6356 |
**The corrected tally, scratch.** Besides the home vector it keeps a MEMORY of its recent steps, each tick multiplied by
exp(-1 / tau) and then the step added. Each tick the compass's correction is d = (the belief after the fly's act) less
(the belief before it) less (the fly's own turn), wrapped. The memory and the home vector are then both turned by g d:
the steps the tally took on the old belief are re-laid along the new one, the recent ones most.

## 2. The scene, the flies and the lives
The 26-type scene (`brain/rl/typedSceneEnv.mjs`) and the plain scene (`brain/rl/homeEnv.mjs`'s noisy env at sigma 0),
as committed and not edited. **The compass-noise round's 48 committed flies**, as trained; **neither the flies nor their
steering change**: only the home vector their steering is shown from HOME_AT. **DEV: 50 lives, seeds 100000001 + 7919 k.**
**HELD: 200 lives, seeds 110000001 + 7919 k.** Neither set is the scoping lives, the old audit, or the tally-share
round's fresh lives.

## 3. The choice (on DEV only; one setting for all 48 flies)
g in {0.5, 1, 1.5, 2} and tau in {100, 175, 250, 350, 500}: 20 settings, each the 48 flies' mean home on the DEV lives in
the 26-type scene; **the highest is the setting** (a tie to the lower g, then the lower tau). The choice is written
with all 20 means before HELD is flown, and HELD is flown ONCE at it.

## 4. The readings on HELD (alpha 0.01, exact two-sided sign tests over the 48 flies, ties against the claim)
* **C26: does the corrected tally find home better in the 26-type scene?** Corrected less today's, there.
* **CP: and in the plain scene, at the same setting?** Corrected less today's, in the plain scene.
* **The checks include**: the scene-tally round's file as committed and passing its own checks; every fly its arm's
  committed weights; at g 0 the corrected tally is today's to the bit (one fly, flown in the run); the chosen setting is
  the highest of the 20 DEV means as written; HOMEP draw 1 the same twice on HELD.
* Described: the perfect tally's home on HELD in the 26-type scene, and the share of the gap the correction closes
  ((corrected less today's) over (perfect less today's)), each arm's means.

## 5. What a reading would say
* C26 BETTER: **the compass's corrections carry what the tally lacks**; the next gain is a tally that keeps them.
  CANNOT: at this size the correction does not reach home. WORSE: re-laying steps costs more than it repairs.
* CP is the same question in the scene the flies were trained in.

## 6. Expectations, written before the code
C26: **BETTER about 80**, CANNOT 15, WORSE 5. CP: BETTER about 65, CANNOT 30, WORSE 5. The share of the gap closed:
about a tenth.

## 7. What it would and would not mean
About **this fly and this tally**: the correction is computed from the fly's own belief and its own turn, both things the
fly has; nothing is shown it from outside. One setting for 48 flies is a coarse fit. The scoping fly is in the 48 and its
lives are not. Nothing here is of the animal.

## 8. The cost
DEV: 20 settings x 48 flies x 50 lives, about 40 minutes; HELD: 48 flies x 5 flights (today's and the corrected in each
scene, the perfect in the 26-type) x 200 lives, about 40 minutes; four at a time, in the sandbox.

## 9. The run (the gate never runs it and never gives the command the word `run`)
`node tools/ship/takeFlyTallyCorrect.mjs dev` -> `brain/flyTallyCorrectDev.jsonl` (the 20 means and the choice),
committed; then `node tools/ship/takeFlyTallyCorrect.mjs run` -> `brain/flyTallyCorrectRound.jsonl`, committed byte for
byte, whole, before it is read; `node tools/ship/takeFlyTallyCorrect.mjs read` prints the checks and the reading. The
verdict will be section 10, "The result".

## 10. The result (the DEV file committed at 7ecd8eb0, then the whole HELD file committed unread at 3c4aab71, then read once)
DEV: one start, 48 flies at the 20 settings on the 50 DEV lives; **chosen g 2, tau 175** (mean home 0.6030; the 20 means
run from 0.5603 at g 2, tau 500 to 0.6030). HELD: one start, 38.1 minutes on four processes, 51 records (sha256
8dc77b3423b6d666...). **The checks hold**: the scene-tally round's file as committed; DEV's 48 flies once each with a home
per setting and its choice the highest of the 20; HELD's 48 flies once each at that choice, their arms' committed weights;
g 0 is today's tally to the bit in both scenes; HOMEP draw 1 the same twice.
* **C26: IN THE 26-TYPE SCENE THE CORRECTED TALLY FINDS HOME BETTER THAN TODAY'S** (47 above, 1 below, p 3.5e-13).
* **CP: IN THE PLAIN SCENE THE CORRECTED TALLY CANNOT BE TOLD APART FROM TODAY'S** (31 above, 17 below, p 0.059).

| arm | today's: 26-type | corrected: 26-type | today's: plain | corrected: plain | perfect: 26-type |
|---|---|---|---|---|---|
| HOMEP | 0.6114 | 0.6414 | 0.5878 | 0.5861 | 0.9662 |
| COURSE64 | 0.6063 | 0.6349 | 0.5809 | 0.5895 | 0.9586 |
| HOME16 | 0.6124 | 0.6429 | 0.5893 | 0.5873 | 0.9663 |
| H16BYC | 0.6106 | 0.6385 | 0.5833 | 0.5902 | 0.9632 |

**C26's expectation came** (BETTER, 80); **CP's did not** (BETTER 65, given CANNOT 30). In the 26-type scene the compass's
corrections carry something the tally lacks: re-laid by them, the tally comes home about 0.03 better on every arm. Described,
not registered: that is **0.0827 of the gap** to the perfect tally (the registration's "about a tenth"). In the plain scene,
where the flies were trained, the same setting does about nothing on average (two arms a little above, two a little below).

**What it does not mean.** Section 7 holds. **The setting is at the grid's edge** (g 2, the largest tried), so a larger g
might do better and this round does not say how much. One setting for 48 flies, chosen on the 26-type scene, is why the
plain scene is no test of the best setting there. The correction is the fly's own -- its belief and its own turn -- and
nothing is shown it from outside. Nothing here is of the animal.
