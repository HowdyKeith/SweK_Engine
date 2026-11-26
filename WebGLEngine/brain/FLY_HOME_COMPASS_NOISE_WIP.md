# A noisier compass: does finding home fall only as far as holding a course does? (registration)

**Registered 2026-11-26, before any code of this round exists.** Keith: "1 first", of the rounds suggested after the
course-predicts-home round (`brain/FLY_HOME_COURSE_PREDICTS_WIP.md`, read at 05491300). That round found **the better
course-holder finds home better**, at a fixed stage of training (12 of 12 groups) and along every walk (24 of 24): over
its 144 flies, home and course lie close to one line. A correlation does not say which drives which. **This round makes
the compass worse in committed flies, trains nothing, and asks whether finding home falls only as far as that line says
the lost course-holding should take it, or further.**

**Said first: why "further" is the likelier answer, and what it would mean.** The homing fly (`brain/rl/homingFly.mjs`)
uses its compass twice: to steer, which is what the course score measures, and to keep its tally of where home is (it
adds a step along the heading it believes, every tick). A noisier compass harms both. So homing falling further than
the line would say that **homing rests on the compass beyond holding a course**, through the tally; homing falling just
as far would say the line holds under damage too, as if course-holding were what homing needs.

## 1. What was measured before this note, and on what (scratch code; not committed)
**The line**, fitted to the last round's 144 committed flies (least squares, home on course): **home = 0.2434 + 0.4696
x course**, over course scores from 0.554 to 0.671, the residuals' sd 0.0065. **Noise**, on round 4's HOMEP draw 1 and
the trainer round's BAT64 draw 1 (COURSE64's), on **the 100 scoping lives** (seeds 30000001 + 7919 k) at home and on the
course:
| fly | noise 0 | 0.1 | 0.2 | 0.4 | 0.8 |
|---|---|---|---|---|---|
| HOMEP 1, course / home | 0.6887 / 0.5635 | 0.6876 / 0.5615 | 0.6839 / 0.5603 | 0.6694 / 0.5493 | 0.6046 / 0.4953 |
| COURSE64 1, course / home | 0.7043 / 0.5697 | | | 0.6852 / 0.5528 | 0.6252 / 0.4981 |
**From noise 0 to 0.8, home fell 0.81 and 0.91 for each unit course fell, where the line's slope is 0.47.** A first
scoping script failed on COURSE64, whose weights round 4's file does not hold; they are the trainer round's.

## 2. The noise (`brain/rl/noisyCompassEnv.mjs`, new: the compass and homing lives, not edited, extended)
**The heading the ring neurons see is the true heading plus sigma x a normal draw, a new draw for every observation**,
from a stream of each life's own (its seed XOR 0x5bd1e995), so **the true heading, the gusts, the goals and the way home
are the life's as before**. At sigma 0 nothing is drawn and the life is the committed one: **every fly must give its
committed course and home scores to the bit at sigma 0**.

## 3. The flies and the levels (no training)
**48 committed flies, 12 each**: HOMEP (round 4, `brain/flyTrainedHomeRound.jsonl`, sha256 c931f32e5705cdba...),
COURSE64 (its weights the trainer round's BAT64, `brain/flyCompassTrainerRound.jsonl`, sha256 dd6b4646158c4d0e...),
HOME16 (`brain/flyHomeGradientRound.jsonl`, sha256 138ea7125387ad24...) and H16BYC
(`brain/flyHomeGradientCourseRound.jsonl`, sha256 b1a5f0d821808df3...). **Each flown at sigma 0, 0.2, 0.4 and 0.8
radians** on **round 4's audit**: the homing round's 200 lives at home, the compass round's 200 on the course. **HOMEP
draw 1 is flown a second time.**

## 4. The readings (alpha 0.01, exact sign tests over the 48 flies, two-sided, ties against the claim; the checks first)
* **C: does the noise bite?** Course at sigma 0.8 against course at sigma 0, fly for fly.
* **R8: at sigma 0.8, does home fall further than the line says?** For each fly, its fall at home less **0.4696** times
  its fall on the course (both from sigma 0); a sign test of the 48 against 0. **WORSE: home falls further than the
  lost course-holding accounts for.**
* **R4**: the same at sigma 0.4.
* **The checks include** that the five committed files are the ones committed and pass their own checks, that every fly
  is its arm's committed weights, that at sigma 0 every fly gives its committed course and home scores to the bit, and
  that HOMEP draw 1 is the same twice.
* Described: each arm's scores at each level, the falls' ratio, sigma 0.2.

## 5. What a reading would say
* R8 WORSE: **a noisier compass costs homing more than it costs course-holding by the line's measure**: homing rests on
  the compass beyond steering, which the path-integrating tally would explain.
* R8 CANNOT: home falls about as far as the line says: under damage, course-holding still accounts for homing.
* R8 BETTER: home falls less than the line says.
* C CANNOT: the noise does not bite, and R says nothing.

## 6. Expectations, written before the code
C: **WORSE about 99**. R8: **WORSE about 85**, CANNOT 15. R4: WORSE about 65, CANNOT 35.

## 7. What it would and would not mean
About **this fly, this noise and these lives**: a heading jittered at each tick, not a compass biased or slowed. The line
was fitted on undamaged flies over a narrower range of course scores than sigma 0.8 reaches, so R8 leans on it beyond
where it was measured; the fall is taken fly for fly, from its own sigma 0, which removes each fly's place on the line
but not that. Nothing here is of the animal.

## 8. The cost
48 jobs of 4 levels, about 4 minutes each, and a second HOMEP draw 1, four at a time: about 50 minutes, in the sandbox.

## 9. The run (the gate never runs it and never gives the command the word `run`)
`node tools/ship/takeFlyHomeCompassNoise.mjs run` -> `brain/flyHomeCompassNoiseRound.jsonl`, committed byte for byte,
whole, before it is read; `node tools/ship/takeFlyHomeCompassNoise.mjs read` prints the checks and the reading.
