# The better walk with the better chooser: HOME16's walks, their point chosen by the course score (registration)

**Registered 2026-11-25, before any code of this round exists.** Keith: "Let's do the next test as you described", the
test being the gradient round's walk with the chooser round's chooser. The chooser round (`brain/FLY_HOME_CHOOSER_WIP.md`,
read at f902ad40) found that **HOMEP's point chosen by its course score finds home better than the point its 64 homing
lives chose** (CBC BETTER, 11 of 12, closing round 4's gap). The gradient round (`brain/FLY_HOME_GRADIENT_WIP.md`, run on
Keith's machine, read at 1ac6ffcf) found that **the walk with each fly tried scored on 16 lives finds home better than
HOMEP's** (W BETTER, 11 of 12), while keeping HOMEP's homing chooser. **This round puts the two together**: the gradient
round's walks, their point chosen as the chooser round's HOMEBYC was.

**Said first: every arm this round is weighed against was run and read.** HOME16 (`brain/flyHomeGradientRound.jsonl`,
sha256 138ea7125387ad24...), HOMEBYC (`brain/flyHomeChooserRound.jsonl`, sha256 8951af17ed60d6dc...) and COURSE64
(`brain/flyTrainedHomeRound.jsonl`, sha256 c931f32e5705cdba...), as committed. **No walk is run again**: the gradient
round recorded every point of every HOME16 walk, and this round chooses among them. This registration is written knowing
those three rounds' numbers and the scoping below.

## 1. What was measured before this note, and on what (scratch code; not committed)
HOME16's committed walks of **draws 1 and 2**, each point scored by the course score on the trainer round's BAT64 lives
(the HOMEBYC chooser), the first best kept, and that point flown home on **the 100 scoping lives** (seeds 30000001 +
7919 k):
| draw | H16BYC (this round's point) | HOME16 (its own point) | HOMEBYC | COURSE64 |
|---|---|---|---|---|
| 1 | 0.5686 (iteration 6) | 0.5762 (iteration 4) | 0.5689 | 0.5697 |
| 2 | 0.5676 (iteration 25) | 0.5774 (iteration 3) | 0.5696 | 0.5689 |
HOMEBYC's and COURSE64's are from the chooser round's scoping. **On these lives the course chooser did worse than HOME16's
own point on both draws**, but these lives have put arms in the other order from the audit before (the chooser round's
section 1: HOMEP and COURSE64), so this registration leans on them little. A choice took about 9.5 minutes, two at a time.

## 2. The arm (12 draws, **draws 1 to 12**)
| arm | the walk | the point |
|---|---|---|
| **H16BYC** | HOME16's, as committed (16 lives a fly tried) | **the best course score on the trainer round's BAT64 lives** (seeds 40000000 + 10007 s + 17 k) |
| HOME16 | the same walk | the best homing score on its draw's 64 homing lives (the gradient round's, as committed) |
| HOMEBYC | HOMEP's walk (4 lives a fly tried) | the best course score on the same BAT64 lives (the chooser round's, as committed) |
| COURSE64 | trained on the course score | the best course score on the same BAT64 lives (round 4's, as committed) |
The chooser is the chooser round's own (`tools/ship/flyHomeChooser.mjs`, HOMEBYC): each of the walk's 60 points flown on
the compass life over the 64 lives, by the trainer's own score, the first best kept. **The audit is round 4's**: the
homing round's 200 lives (seeds 50000001 + 7919 k) at home, the compass round's on the course. **H16BYC draw 1 is chosen
a second time.**

## 3. The readings (alpha 0.01, exact sign tests or rank sums, two-sided, ties against the claim; the checks first)
* **Q: H16BYC against HOME16, draw for draw** (sign test of the differences): on the 16-life walks, does the course
  chooser help, as it helped HOMEP's?
* **K: H16BYC against HOMEBYC, draw for draw** (sign test): with the course chooser, does the 16-life walk add anything?
* **G: H16BYC against COURSE64** (rank sum): does the two together overtake the fly trained to hold a course?
* **The checks include** that the three committed files are the ones committed and pass their own checks; that every
  choice is of its draw's HOME16 walk as committed, on HOMEBYC's lives, its point the first best of the 60 scores it
  records; and that H16BYC draw 1 is the same twice.
* Described: the iteration chosen, the course scores, the rates.

## 4. What a reading would say
* Q BETTER: the course score chooses the homing point better on these walks too. CANNOT: on walks scored on more lives,
  the homing chooser does as well. WORSE: it does better.
* K BETTER: **the better walk and the better chooser add up**. CANNOT: with the course chooser, the walk's lives do not
  show.
* G BETTER: the homing fly overtakes the course-trained one. CANNOT: it reaches it and no further. WORSE: it falls short.

## 5. Expectations, written before the code
Q: CANNOT about 55, BETTER 35, WORSE 10. K: CANNOT about 80, BETTER 10, WORSE 10. G: CANNOT about 75, BETTER 15,
WORSE 10.

## 6. What it would and would not mean
About **these walks and this chooser**: the compass fly's three rates, the compass round's recipe with 16 lives a fly
tried, and a point chosen by holding a course. G BETTER would say this trainer can make a homing fly better than a
course-trained one by these two changes, not that the animal homes this way.

## 7. The cost
13 choices of about 17 minutes each (60 points on 64 course lives), with their audits, four at a time: about an hour, in
the sandbox. No walk is run.

## 8. The run (the gate never runs it and never gives the command the word `run`)
`node tools/ship/takeFlyHomeGradientCourse.mjs run` -> `brain/flyHomeGradientCourseRound.jsonl`, committed byte for
byte, whole, before it is read; `node tools/ship/takeFlyHomeGradientCourse.mjs read` prints the checks and the reading.

## 9. The result (the whole results file committed unread at ba08a98a, then read once)
One start, 38.6 minutes on four processes, 13 records (sha256 b1a5f0d821808df3...). **The checks hold**: the three
committed files as committed and passing their own checks; 12 choices of HOME16's walks on HOMEBYC's lives, each the first
best of its 60 scores; draw 1 the same twice.
* **Q: THE 16-LIFE WALK CHOSEN BY ITS COURSE SCORE CANNOT BE TOLD APART FROM THE 16-LIFE WALK CHOSEN ON ITS 64 HOMING
  LIVES AT FINDING HOME** (9 above, 3 below, p 0.15).
* **K: THE 16-LIFE WALK CHOSEN BY ITS COURSE SCORE CANNOT BE TOLD APART FROM THE 4-LIFE WALK CHOSEN BY ITS COURSE SCORE AT
  FINDING HOME** (5 above, 7 below, p 0.77).
* **G: THE 16-LIFE WALK CHOSEN BY ITS COURSE SCORE CANNOT BE TOLD APART FROM THE FLY TRAINED TO HOLD A COURSE AT FINDING
  HOME** (ranks 169, the middle 150, p 0.29).

| arm | home: mean (least, most) | course |
|---|---|---|
| H16BYC | 0.5548 (0.5470, 0.5578) | 0.6687 |
| HOME16 (the gradient round) | 0.5517 | 0.6555 |
| HOMEBYC (the chooser round) | 0.5542 | 0.6686 |
| COURSE64 (round 4) | 0.5541 | 0.6688 |

**Every expectation came**: Q CANNOT (55), K CANNOT (80), G CANNOT (75). So, as section 4 put it, **with the course
chooser, the walk's lives do not show**, and **the homing fly reaches the course-trained one and no further**. The two
changes that each helped HOMEP do not add up detectably: once the point is chosen by the course score, a walk scored on
16 lives chooses a fly no better at home than one scored on 4, and both come home as the fly trained on the course does.

**Described after the reading, not registered (the gate recomputes it from the records):** H16BYC is above HOME16 by
0.0031 on average (below on draws 5, 6 and 7), above HOMEBYC by 0.0006 and above COURSE64 by 0.0006. Its course score is
COURSE64's to within 0.0002: chosen by holding a course, the homing walks give a fly that holds a course as the
course-trained one does, and comes home as well, no better.

**What it does not mean.** Section 6 holds. CANNOT is not equal; 12 draws a side would miss a difference of 0.0006. It
says that for this fly and trainer the homing score, as trained and chosen here, leads to the course-trained fly's
homing and not past it; it does not say no other trainer or score could, nor how an animal learns to home.
