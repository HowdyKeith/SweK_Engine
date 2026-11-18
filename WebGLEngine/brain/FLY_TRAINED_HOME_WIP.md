# Trained to find home: does a compass fly trained for homing do better than one trained to hold a course? (registration)

**Registered 2026-11-18, before any code of this round exists.** Keith: "Let's do all 5". The homing round
(`brain/FLY_FINDS_HOME_WIP.md`, read at 6ac4494f) flew flies **trained to hold a course** home, and they scored about
0.55 where a fly told its true heading scores 0.995. The offset round (`brain/FLY_HOME_OFFSET_WIP.md`, read at 1b43f9ea)
showed that homing forgives an offset and not a wobble. **This round trains the compass fly on the homing score itself**
and asks whether that helps, and whether the real wiring then differs from a shuffle.

**Said first: two of the flies this round audits were run and read.** COURSE64 is the trainer round's BAT64 arm, used
as committed (`brain/flyCompassTrainerRound.jsonl`, sha256 dd6b4646158c4d0e...). This registration is written knowing the
homing round's numbers and the scoping below.

## 1. What was measured before this note, and on what (scratch code; not committed)
Two trainings of the compass round's PLASTIC fly on the homing score (draws 1 and 2; the recipe below), scored on 100
scoping lives (seeds 30000001 + 7919 k), beside the homing round's scoping of the course-trained flies on the same lives:
| draw | trained for homing: home | its course score | course-trained (the compass round's): home |
|---|---|---|---|
| 1 | 0.5635 | 0.6887 | 0.5644 |
| 2 | 0.5767 | 0.7070 | 0.5649 |
The homing-trained flies kept smaller depression rates (a 0.0051 and 0.0086) than the course-trained ones (about 0.016).
**A small gain at most**, and these flies also kept their point on 64 lives, which the trainer round found to matter on
the compass task: hence an arm that separates the two.

## 2. The task and the fly
**The task** (`brain/rl/homeTrainEnv.mjs`, new) is `brain/rl/homeEnv.mjs`'s homing life, not edited, with **its return the
life's homing score** (paid at the life's end; info.dist is 1 less it), so the trainer keeps the best by it. **The fly**
(`brain/rl/homingTrainFly.mjs`, new) is `brain/rl/homingFly.mjs`'s wrapper, not edited, handing the trainer the compass
fly's weights.

## 3. The arms (12 flies each, **draws 1 to 12**)
| arm | the fly | how |
|---|---|---|
| **HOMEP** | the compass round's PLASTIC fly (the real wiring) | trained on the homing score |
| **HOMES** | the compass round's PSHUF fly (a shuffle) | trained on the homing score |
| COURSE64 | the trainer round's BAT64 flies (the real wiring, trained to hold a course) | as committed; audited here |
**The recipe**: the compass round's (60 iterations, 16 flies tried, sigma 0.14, lr 0.05, 4 fresh lives each), with the
best kept **on 64 lives of the draw's own (seeds 80000000 + 10007 s + 17 k)**, as the trainer round's BAT64. **The audit**:
the homing round's 200 lives (seeds 50000001 + 7919 k). **HOMEP draw 1 is trained a second time.**

## 4. The readings (alpha 0.01, exact rank sums or sign tests, two-sided, ties against the claim; the checks first)
* **G: HOMEP against COURSE64** (rank sum): the same fly, the same trainer, trained for homing or for a course.
* **T1: HOMEP against HOMES** (rank sum): trained for homing, does the real wiring differ from a shuffle?
* **H: HOMEP against the hand rule** (the homing round's committed 0.5551; sign test).
* **V: HOMEP against vision off** (the homing round's committed 0.4559; sign test).
* **The checks include** that both committed files are the ones committed and pass their own checks, that the floors
  equal the homing round's to the bit, and that each COURSE64 fly's weights are its committed record's.
* Described: each arm's course score, and the rates.

## 5. What a reading would say
* G CANNOT: training for homing does not beat training to hold a course and flying home; the shortfall from the told
  ceiling is the compass's wobble, which neither training removes.
* G BETTER: some of the compass's use for homing has to be trained for.

## 6. Expectations, written before the code
G: CANNOT about 55, BETTER 40. T1: CANNOT about 60, WORSE 25, BETTER 15. H: BETTER about 55, CANNOT 40. V: **BETTER
about 97 percent**. HOMEP's mean between 0.545 and 0.575, about 70.

## 7. What it would and would not mean
About **this home vector**: a perfect sum, followed in the fly's own frame, kept outside the fly's circuit. Training can
only change the compass fly's three rates, not how the home vector is kept. A result says what these rates can buy for
homing, not what an animal that learns to home does.

## 8. The cost
24 trainings of about 25 minutes four at a time (60 iterations of 64 training lives and 64 battery lives of 1,500 ticks),
and 12 audits of COURSE64: about 2 hours 40. Resumable.

## 9. The run (the gate never runs it and never gives the command the word `run`)
`node tools/ship/takeFlyTrainedHome.mjs run` -> `brain/flyTrainedHomeRound.jsonl`, committed byte for byte, whole, before
it is read; `node tools/ship/takeFlyTrainedHome.mjs read` prints the checks and the reading.
