# Does holding a course predict finding home? (registration)

**Registered 2026-11-26, before any code of this round exists.** Keith: "1 first", of the rounds suggested after the
gradient-and-course round (`brain/FLY_HOME_GRADIENT_COURSE_WIP.md`, read at ba08a98a). Four homing rounds have pointed
one way: **the compass fly that holds a course comes home well, and no homing-trained fly gets past the course-trained
one.** The chooser round found the course score a better chooser of a homing point than the homing score itself; the
last round found that chosen so, the homing fly holds a course and comes home exactly as the course-trained fly does.
**This round asks the plain question: across flies this round has never flown home, does the better course-holder find
home better, and does it with the stage of training held fixed?**

**Said first: the scoping below is on flies already read**, every kept fly of the four homing rounds, and its numbers
are known to this registration. The flies the readings weigh are new to the audit but for a few, said in section 2.

## 1. What was measured before this note, and on what (scratch code; not committed)
The 84 committed homing-round flies (HOMEP, HOMES, COURSE64, HOME256, HOMEBYC, HOME16 and H16BYC, 12 each), their
course and home scores on the audit as committed: **Spearman 0.83 over all 84, and from 0.57 to 0.87 within each arm**
(12 flies of one kind, at the point their chooser kept). A point flown on both audits took about a minute.

## 2. The flies (no training; every point of every walk is committed)
**The points at iterations 0, 10, 20, 30, 40 and 59 of the 24 committed walks**: the chooser round's 12 HOMEP walks
(`brain/flyHomeChooserRound.jsonl`, sha256 8951af17ed60d6dc..., 4 lives a fly tried) and the gradient round's 12 HOME16
walks (`brain/flyHomeGradientRound.jsonl`, sha256 138ea7125387ad24..., 16 lives). **144 flies**, each the compass fly with
that point's three rates, flown on **round 4's audit**: the homing round's 200 lives at home, the compass round's 200 on
the course. A few of these points are ones some committed arm kept and audited (the gate counts them); the rest have
never been flown on the audit. **The HOMEP walk of draw 1 is flown a second time.**

## 3. The readings (alpha 0.01, exact sign tests, two-sided, ties against the claim; the checks first)
* **S: with the stage held fixed.** For each of the 12 groups (a walk set at one iteration), the Spearman correlation of
  course and home over its 12 draws; **a sign test of the 12 against 0**.
* **W: along a walk.** For each of the 24 walks, the Spearman correlation of course and home over its 6 points; **a sign
  test of the 24 against 0**.
* A correlation that cannot be computed (a group with tied scores) counts as not above 0.
* **The checks include** that both committed files are the ones committed and pass their own checks, that every fly is
  its walk's point at its iteration, and that the HOMEP walk of draw 1 is the same twice.
* Described: the correlation over all 144, each group's, and how home and course move along the walks.

## 4. What a reading would say
* S BETTER: **among flies at the same stage of training, the better course-holder finds home better**: the link is not
  only that both rise as training goes on.
* S CANNOT: at a fixed stage, course-holding does not detectably predict homing.
* W BETTER: along a walk, home and course rise and fall together. W CANNOT: along a walk they do not detectably move
  together. WORSE in either: the better course-holder homes worse.

## 5. Expectations, written before the code
S: **BETTER about 85**, CANNOT 15. W: BETTER about 60, CANNOT 40.

## 6. What it would and would not mean
About **this fly, these walks and these lives**. S BETTER says course-holding predicts homing in this fly; it does not
say holding a course causes homing (that is the compass-noise round's question), nor anything of the animal.

## 7. The cost
24 jobs of 6 points each, about 6 minutes a job, and a second HOMEP walk of draw 1, four at a time: about 40 minutes, in
the sandbox.

## 8. The run (the gate never runs it and never gives the command the word `run`)
`node tools/ship/takeFlyHomeCoursePredicts.mjs run` -> `brain/flyHomeCoursePredictsRound.jsonl`, committed byte for byte,
whole, before it is read; `node tools/ship/takeFlyHomeCoursePredicts.mjs read` prints the checks and the reading.

## 9. The result (the whole results file committed unread at 05491300, then read once)
One start, 42.3 minutes on four processes, 25 records (sha256 99f2f6cfd0531989...). **The checks hold**: both committed
files as committed and passing their own checks; 24 walks each once, every fly its point; the HOMEP walk of draw 1 the
same twice.
* **S: AT A FIXED STAGE OF TRAINING, THE BETTER COURSE-HOLDER FINDS HOME BETTER** (12 of 12 groups above 0, p 0.00049;
  the groups' correlations from 0.66 to 0.99).
* **W: ALONG A WALK, FINDING HOME AND HOLDING A COURSE RISE AND FALL TOGETHER** (24 of 24 walks above 0, p 1.2e-7; from
  0.14, HOME16's draw 2, to 1.00).
* Over all 144 flies the correlation is 0.87.

**Every expectation came**: S BETTER (85), W BETTER (60). So, as section 4 put it, **among flies at the same stage of
training, the better course-holder finds home better: the link is not only that both rise as training goes on**. That is
the pattern the four homing rounds kept meeting: a point chosen for holding a course comes home well, and none comes home
better than the course-holder.

**Described after the reading, not registered (the gate recomputes it from the records):** the homing walks wander in
holding a course, and home follows. HOMEP's walks hold a course best at iteration 20 on average (0.6641) and worse by
iteration 30 (0.6258), and their home score falls with it (0.5541 to 0.5448). HOME16's walks home best on average at
iteration 40 (0.5535), which is also where they hold a course best (0.6597).

**What it does not mean.** Section 6 holds. A correlation, however tight, says the two go together in this fly; it does
not say holding a course is what makes it home. That is what the compass-noise round, if run, would ask, by making the
compass worse and seeing whether home and course fall together.
