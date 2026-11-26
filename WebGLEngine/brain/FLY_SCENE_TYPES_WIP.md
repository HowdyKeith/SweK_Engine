# A scene each ring type sees for itself: does the compass read it better, and the fly come home better? (registration)

**Registered 2026-11-26, before any code of this round exists.** Keith: "Let's do a richer scene, or ring tuning taken
from the real connectome rather than drawn", and then, of the ways scoping left open, "Landmarks seen by ring types". The
compass-error round (`brain/FLY_COMPASS_ERROR_WIP.md`, read at 38fe3522) found **what limits the compass, and so the
homing fly's tally, is its reading of the scene**: two landmarks a life, summed by every ring neuron. **This round gives
each class of ring neuron its own two landmarks, so a richer scene brings the compass more cues, and asks whether the
committed flies, untrained for it, read it better and come home better.**

**Said first: two things scoping found before this registration.** *Ring tuning cannot be taken from the connectome*: in
the vendored ring-to-compass connections (`brain/compassRingTopology.mjs`) a ring neuron's synapses lean toward no
direction of the compass ring -- less than chance does (resultant length median 0.075, against 0.173 for the same
synapses on compass neurons drawn at random), as an all-to-all, learned mapping would. And *more landmarks for every ring
neuron only blur the scene*: with their total strength held, 4 landmarks did as 2 and 8 or 16 did worse in the wind.
This registration knows both, and the scoping in section 1.

## 1. What was measured before this note, and on what (scratch code; not committed)
Round 4's HOMEP draw 1 and the trainer round's BAT64 draw 1 (COURSE64's), as trained, on **50 scoping lives** (seeds
30000001 + 7919 k), error sds circular in radians, home with the fly's own tally:
| fly, scene | error in the calm / wind | course | home |
|---|---|---|---|
| HOMEP 1, one set of 2 for all | 0.324 / 0.709 | 0.6882 | 0.5379 |
| HOMEP 1, a set for each of 11 classes | 0.298 / 0.593 | 0.7407 | 0.5741 |
| HOMEP 1, a set for each of 26 types | 0.291 / 0.571 | 0.7496 | 0.5773 |
| COURSE64 1, one set for all | 0.270 / 0.691 | 0.7067 | 0.5500 |
| COURSE64 1, 11 classes | 0.247 / 0.585 | 0.7549 | 0.5876 |
| COURSE64 1, 26 types | 0.238 / 0.567 | 0.7626 | 0.5963 |
**Home rose by about 0.04 in both flies**, where the homing rounds' changes moved it by about 0.004.

## 2. The scene (`brain/rl/typedSceneEnv.mjs`, new: the compass and homing lives, not edited, extended)
**Each ring neuron's class** is its type (`RING_TYPES`) up to the first underscore (ER3d_b is ER3d): **11 classes**
(ER1, ER2, ER3a, ER3d, ER3m, ER3p, ER3w, ER4d, ER4m, ER5, ER6). **Each class sees two landmarks of its own**, each at
an azimuth drawn uniform with a strength from 0.5 to 1.5, as the plain life draws its two: the first class in that
order sees the life's own two, the others theirs from **a stream of the life's own (its seed XOR 0x165667b1)**, so **the
gusts, goals and true heading are the life's as before**. A ring neuron's activity is the plain life's formula over its
class's two landmarks. **The finer scene gives each of the 26 types its own two the same way.**

## 3. The flies (no training)
**The compass-noise round's 48 committed flies** (HOMEP, COURSE64, HOME16, H16BYC, 12 each, as trained), each flown in
**the 11-class scene and the 26-type scene**: on the compass life over **the compass round's 200 audit lives** (the
compass-error round's measures: the error in the calm and the wind, and the course score), and home with its own tally
over **the homing round's 200 audit lives**. In the plain scene, each fly's course and home scores are its committed
ones and its errors the compass-error round's (`brain/flyCompassErrorRound.jsonl`, sha256 b8c649c2d5946ece...).
**HOMEP draw 1 is flown a second time.**

## 4. The readings (alpha 0.01, exact sign tests over the 48 flies, two-sided, ties against the claim; the checks first)
* **H11: does the fly come home better in the 11-class scene?** Its home score there less its committed one.
* **C11: does it hold a course better there?** Its course score there less its committed one.
* **W11: does its compass err less in the wind there?** Its wind error there less the compass-error round's.
* **H26: is the finer scene better still?** Its home score in the 26-type scene less in the 11-class scene.
* **The checks include** that the compass-error round's file and those it rests on are the ones committed and pass
  their own checks, that every fly is its arm's committed weights, that the scene's measures in the plain scene (one
  class for all) are the compass-error round's to the bit, and that HOMEP draw 1 is the same twice.
* Described: each arm's numbers in each scene, the calm error, and whether the arms' order changes.

## 5. What a reading would say
* H11 BETTER with C11 BETTER and W11 below: **a scene whose cues the ring classes see apart is read better, by flies
  never trained on it, and they come home better**: the compass's reading of the scene was the limit, and more cues lift
  it.
* H11 CANNOT: more cues the compass reads better do not reach home detectably.
* H26 BETTER: finer still is better still. CANNOT: the 11 classes already give what more sets can.

## 6. Expectations, written before the code
H11: **BETTER about 90**. C11: **BETTER about 95**. W11: **below about 95**. H26: CANNOT about 60, BETTER 35, WORSE 5.

## 7. What it would and would not mean
About **this fly and a scene made for it**: the classes are the connectome's types, but which landmarks each sees is
invented here (real ring types answer to different visual features; which ones is not in this data). It says a compass
built on this ring can use cues its classes see apart; not that the animal's ring types see the world this way.

## 8. The cost
48 jobs, each two scenes of the compass life and home on 200 lives, about 2 minutes, and a second HOMEP draw 1, four
at a time: about 25 minutes, in the sandbox.

## 9. The run (the gate never runs it and never gives the command the word `run`)
`node tools/ship/takeFlySceneTypes.mjs run` -> `brain/flySceneTypesRound.jsonl`, committed byte for byte, whole, before it
is read; `node tools/ship/takeFlySceneTypes.mjs read` prints the checks and the reading.

## 10. The result (the whole results file committed unread at 1ff16e90, then read once)
One start, 30.4 minutes on four processes, 49 records (sha256 b615c753f69a9721...). **The checks hold**: the
compass-error round's file as committed and passing its own checks; 48 flies each once, its arm's committed weights, in
each scene; HOMEP draw 1 the same twice.
* **H11: IN THE 11-CLASS SCENE THE FLY FINDS HOME BETTER** (48 of 48, by 0.024 on average).
* **C11: IN THE 11-CLASS SCENE THE FLY HOLDS A COURSE BETTER** (48 of 48, by 0.053).
* **W11: IN THE 11-CLASS SCENE THE COMPASS ERRS LESS IN THE WIND** (48 of 48, by 0.115 radians).
* **H26: THE 26-TYPE SCENE FINDS HOME BETTER THAN THE 11-CLASS** (46 of 48, by 0.008; COURSE64's draw 7 and H16BYC's
  draw 8 the other way).

| arm | home: plain (committed) / 11 classes / 26 types | course: plain / 26 types |
|---|---|---|
| HOMEP | 0.5501 / 0.5798 / 0.5911 | 0.6501 / 0.7130 |
| COURSE64 | 0.5541 / 0.5717 / 0.5761 | 0.6688 / 0.7124 |
| HOME16 | 0.5517 / 0.5799 / 0.5900 | 0.6555 / 0.7149 |
| H16BYC | 0.5548 / 0.5750 / 0.5797 | 0.6687 / 0.7151 |

**Three of the four expectations came**: H11 BETTER (90), C11 BETTER (95), W11 below (95). H26 came BETTER, which was
given 35. So, as section 5 put it, **a scene whose cues the ring classes see apart is read better, by flies never trained
on it, and they come home better: the compass's reading of the scene was the limit, and more cues lift it** -- and finer
still is better still.

**Described after the reading, not registered (the gate recomputes it from the records):** **the choosers' order at home
turns over.** In the plain scene the flies whose point the homing score chose (HOMEP and HOME16) come home worse than
those the course score chose (COURSE64 and H16BYC): ranks 411 of a middle 588, p 0.00016. In the 26-type scene they come
home better: ranks 784, p 0.00002. The perfect-tally round found the homing-chosen flies steer home better and their
tally hid it; with a scene their compass can read, it shows.

**What it does not mean.** Section 7 holds. Which landmarks each ring class sees is invented here; real ring types answer
to different visual features, and which is not in this data. The flies were trained in the plain scene, so this is what
they do, untrained, in a richer one; a fly trained in it may do otherwise. Nothing here is of the animal.
