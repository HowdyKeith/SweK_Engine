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

## 10. The result (the whole results file committed unread at 76d8bc95, then read once)
Three starts (the first two killed at the two-hour limit after 12 and 36 records, the third training the recheck and
writing the floors in 28.0 minutes; each trained only what the file lacked), 38 records (36 flies, HOMEP draw 1 trained a
second time, the floors; sha256 c931f32e5705cdba...). **The checks hold**: both committed files as committed and passing
their own checks, every fly once with the recipe and its 64 lives, every COURSE64 fly the trainer round's as committed,
HOMEP draw 1 the same twice, the floors the homing round's to the bit (vision off 0.4559, the start 0.4568, the hand rule
0.5551, told 0.9948).
* **G: THE FLY TRAINED TO FIND HOME FINDS HOME WORSE THAN THE SAME FLY TRAINED TO HOLD A COURSE** (ranks 97, p 0.0014).
* **T1: THE FLY TRAINED TO FIND HOME FINDS HOME WORSE THAN ONE ON A SHUFFLE TRAINED THE SAME WAY** (ranks 101, p 0.0036).
* **H: THE FLY TRAINED TO FIND HOME FINDS HOME WORSE THAN THE RULE SET BY HAND** (0 of 12 above 0.5551, p 0.00049).
* **V: THE FLY TRAINED TO FIND HOME FINDS HOME BETTER THAN PATH INTEGRATION ALONE** (12 of 12 above 0.4559, p 0.00049).

| arm | home: mean (least, most) | sd | its course score | rates a and c (b is 0 in every fly) |
|---|---|---|---|---|
| HOMEP | 0.5501 (0.5442, 0.5542) | 0.0039 | 0.6501 | 0.0095, 0.000018 |
| HOMES | 0.5623 (0.5348, 0.5773) | 0.0117 | 0.6882 | 0.0057, 0.000023 |
| COURSE64 | 0.5541 (0.5478, 0.5564) | 0.0024 | 0.6688 | 0.0090, 0.000012 |

**G and H did not come as given, and T1 came the less likely way given.** G came WORSE, the 5 percent left over (CANNOT
was given 55, BETTER 40); H came WORSE, the 5 percent left over (BETTER 55, CANNOT 40); T1 came WORSE, given 25 (CANNOT
60). V came (97), and HOMEP's mean of 0.5501 fell inside the 0.545 to 0.575 given (70). **Section 5 said what G CANNOT and
G BETTER would mean, and nothing for WORSE.** Said plainly, then: **trained on the homing score with this recipe, the
compass fly comes home worse than when it is trained to hold a course with the same recipe**, by 0.0041, below it on 10
of 12 draws, and below the rule set by hand on every draw. The training does climb: from the start's 0.4568 to 0.5501,
about where the homing round's course-trained PLASTIC flies came (0.5493), kept on the fixed 16 lives.

**Described after the reading, not registered (the gate recomputes it from the records):** a fly's home score follows
its course score: Spearman 0.86 over the 36 flies, and 0.87, 0.82 and 0.62 within HOMEP, HOMES and COURSE64, as the homing
round found within its arms. The flies trained for homing also hold a course worse than COURSE64 (0.6501 against 0.6688),
and they beat their COURSE64 draw at home and on the course on the same two draws, 5 and 6, and on no other. COURSE64
itself is above the hand rule on 5 of 12 draws.

**Measured after the reading, not registered, with lives flown:** on the 64 lives each training kept its point on, the
kept HOMEP fly is above its draw's COURSE64 fly on **12 of 12 draws** (by 0.0303 on average, from 0.0021 to 0.0888), and
above the hand rule on 12 of 12 (by 0.0398). On the 200 audit lives it is below both. The hand rule alone scores from
0.4734 to 0.6256 on the twelve sets of 64 lives, against 0.5551 on the audit. So **the point kept is the one its 64 lives
favoured, and the favour does not carry to fresh lives**: by this score, 64 lives cannot tell apart flies that differ, on
the audit, by under 0.01. Section 1's scoping flies were registered draws 1 and 2 (on the 100 scoping lives they give its
0.5635 and 0.5767 again). On the audit they score 0.5520 and 0.5540, against their COURSE64 draws' 0.5562 and 0.5541, so
the scoping's "small gain at most" was the same noise. The twelve sets of 64 lives were measured once, by a script that
is not in the tree. The gate flies draw 12's set again: draw 12 kept iteration 10, where the trainer's history holds a
sample, and the kept fly's score on those lives is that sample to the bit. It also flies draw 2 on the 100 scoping lives,
and re-audits HOMEP's least fly, draw 11.

Why WORSE and not just no better, the round does not test. It is consistent with the course score being the better guide
to the compass both scores ride on: a point kept by the course score holds up at home, and one kept by the homing score
does not. T1 is not what the homing round found for flies trained to hold a course (PLASTIC and PSHUF could not be told
apart at home). Trained for homing, the shuffle flies also hold a course better (0.6882 against 0.6501), kept smaller
depression rates (a 0.0057 against 0.0095), and spread three times as widely (sd 0.0117 against 0.0039). The round does
not say why.

**What it does not mean.** Section 7 holds: this is about this home vector and the compass fly's three rates. It does not
say homing cannot be trained for, nor that training on the homing score must lose. The training climbed most of the way
from the start to the course-trained flies, and a point chosen on more lives might close the gap or turn it over; the
round did not try. Nor does T1 say the real wiring homes worse than a shuffle: it says these trainings on it landed lower.
