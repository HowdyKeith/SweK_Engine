# The homing fly's walk: does it do better when each fly tried is scored on 16 lives instead of 4? (registration)

**Registered 2026-11-18, before any code of this round exists.** Keith: "Let's do 1, 3 and 4, then once completed do
item 2", and then, while round 1 ran: "Build round 2 now so I can run it on my rig. I will wait for round 1 to finish
and you give me the go ahead." The trained-to-home round (`brain/FLY_TRAINED_HOME_WIP.md`, read at 145b85f8) found that
**the compass fly trained on the homing score comes home worse than the same fly trained to hold a course** (G WORSE,
0.5501 against 0.5541). The chooser round (`brain/FLY_HOME_CHOOSER_WIP.md`) asks whether the point kept from HOMEP's
walks was the cost. **This round asks whether the walk itself was**: the same training with each fly tried scored on
16 homing lives instead of 4.

**Said first: this registration is written before the chooser round is read**, while its run is going, because Keith
asked for the round to be ready for his machine. Its expectations know nothing of that round's result. The two arms
it is weighed against, HOMEP and COURSE64, were run and read, as committed in `brain/flyTrainedHomeRound.jsonl`
(sha256 c931f32e5705cdba...).

## 1. What was measured before this note, and on what (scratch code; not committed)
**Draws 1 and 2 were walked with 16 lives a fly**, otherwise as HOMEP, and the kept point was flown home on **the 100
scoping lives** (seeds 30000001 + 7919 k), as the chooser round's scoping was:
| draw | HOME16 | HOMEP | COURSE64 |
|---|---|---|---|
| 1 | 0.5762 (iteration 4) | 0.5635 (iteration 41) | 0.5697 |
| 2 | 0.5774 (iteration 3) | 0.5767 (iteration 21) | 0.5689 |
HOME16 is ahead of both on both draws, by 0.0007 to 0.0127. **Both walks kept a point from their first five
iterations**, where HOMEP's 12 kept theirs at iterations 10 to 53. A walk took about an hour in the sandbox, two at a
time beside other work. Two checks of the machine were timed as well: round 4's HOMEP draw 1, its committed weights
flown home again on the audit, gives its committed score to the bit (40 seconds), and the homing round's floors flown
again give its committed floors to the bit (96 seconds).

## 2. The walk
**HOMEP's walk with one change.** The task (`brain/rl/homeTrainEnv.mjs`), the fly (`brain/rl/homingTrainFly.mjs` round
the compass round's PLASTIC fly), the compass round's recipe (60 iterations, 16 flies tried, sigma 0.14, lr 0.05, fresh
lives each iteration) and the battery of **64 lives at 80000000 + 10007 s + 17 k** are HOMEP's. **Each fly tried is
scored on 16 lives instead of 4** (the trainer's `trainEps`): an iteration's lives are seeds 5000 + 104729 (it + 1) +
17 k for k from 0 to 15, of which the first 4 are HOMEP's. The trainer draws its noise the same way whatever the number
of lives, so **each draw's walk tries the same directions as HOMEP's**, and differs in how each is scored. The point
kept is the first best on the battery, by the trainer's own score, as HOMEP's was. Every walk records its 60 points and
the trainer's score of each (the chooser round's walk, through `tools/ship/flyHomeChooser.mjs`, with this recipe); no
reading uses the points.

## 3. The arm (12 draws, **draws 1 to 12**)
| arm | the walk | the point |
|---|---|---|
| **HOME16** | HOMEP's, **16 lives a fly tried** | the best on its draw's 64 homing lives |
| HOMEP | 4 lives a fly tried (round 4's, as committed) | the best on the same 64 lives |
| COURSE64 | trained on the course score (round 4's, as committed) | the best course score on 64 course lives |
**The audit is round 4's**: the homing round's 200 lives (seeds 50000001 + 7919 k) at home, the compass round's on the
course. **HOME16 draw 1 is trained a second time.**

## 4. The readings (alpha 0.01, exact sign tests or rank sums, two-sided, ties against the claim; the checks first)
* **W: HOME16 against HOMEP, draw for draw** (sign test of the differences): the same walk's directions, each fly
  tried scored on four times the lives.
* **G16: HOME16 against COURSE64** (rank sum): does a walk scored on more lives close round 4's gap?
* **The checks include** that round 4's file is the one committed and passes its own checks; **that the machine that
  ran the round flies round 4's HOMEP draw 1 home to its committed score to the bit, and the homing round's floors to
  its committed floors to the bit** (the command makes both checks before any training, and stops if either fails);
  that every walk is HOMEP's recipe but for the lives, on its draw's battery, with 60 points and a trainer's score for
  each, its kept point the first best of those scores; and that HOME16 draw 1 is the same twice.
* Described: the iteration kept, the course scores, the rates.

## 5. What a reading would say
* W BETTER: **HOMEP's walk was costing it**: scored on 4 lives, the trainer stepped the wrong way often enough to
  matter.
* W CANNOT: scoring each fly on more lives does not help detectably. WORSE: it costs.
* G16 CANNOT: the homing fly walked on 16 lives cannot be told from the course-trained one. WORSE: it still falls
  short. BETTER: it overtakes it.

## 6. Expectations, written before the code
W: CANNOT about 65, BETTER 30, WORSE 5. G16: CANNOT about 55, WORSE 25, BETTER 20.

## 7. What it would and would not mean
About **this trainer and this fly**: three rates trained by antithetic evolution strategies with the compass round's
recipe. W BETTER would say the walk's noise was costing HOMEP, not that more lives always help, nor that the animal
learns this way. Two scoping walks kept their point early, so the battery's choice may matter as much here as in round
1; this round does not ask.

## 8. The cost, and the machine
12 trainings and a second one of draw 1, each about an hour in the sandbox, with their audits, and the two checks
(about 2.5 minutes). **It is run on Keith's machine, not in the sandbox**, as many at a time as it has cores to spare:
on 13 or more, about the length of one training. The results file is committed byte for byte from that machine, whole,
before it is read, and read here.

## 9. The run (the gate never runs it and never gives the command the word `run`)
`node tools/ship/takeFlyHomeGradient.mjs run --jobs N` -> `brain/flyHomeGradientRound.jsonl`, committed byte for byte,
whole, before it is read; `node tools/ship/takeFlyHomeGradient.mjs read` prints the checks and the reading.

## 10. The result (run on Keith's machine, the whole results file committed unread there at 1ac6ffcf, then read once here)
15 records (sha256 138ea7125387ad24...). **The checks hold**: round 4's file as committed and passing its own checks;
**Keith's machine flew round 4's HOMEP draw 1 home and the homing round's floors to the committed numbers to the bit**,
before any training; 12 draws with 16 lives a fly tried, each kept point the first best of the trainer's own scores;
HOME16 draw 1 the same twice.
* **W: THE HOMING FLY WALKED ON 16 LIVES A FLY FINDS HOME BETTER THAN THE HOMING FLY WALKED ON 4** (11 of 12 above,
  p 0.0063).
* **G16: THE HOMING FLY WALKED ON 16 LIVES A FLY CANNOT BE TOLD APART FROM THE FLY TRAINED TO HOLD A COURSE AT FINDING
  HOME** (ranks 126, the middle 150, p 0.18).

| arm | home: mean (least, most) | course |
|---|---|---|
| HOME16 | 0.5517 (0.5358, 0.5559) | 0.6555 |
| HOMEP (round 4) | 0.5501 | 0.6501 |
| COURSE64 (round 4) | 0.5541 | 0.6688 |

**One of the two expectations came**: G16 CANNOT (55). W came BETTER, which was given 30. So, as section 5 put it,
**HOMEP's walk was costing it**: scored on 4 lives, the trainer stepped the wrong way often enough to matter. The
chooser round, read after this registration, found the same of the choice of point; both cost HOMEP.

**Described after the reading, not registered (the gate recomputes it from the records):** HOME16 is above HOMEP by
0.0016 on average, and below it on draw 12 alone, which is the arm's least (0.5358; without it the mean is 0.5531). 5 of
the 12 walks kept a point from their first ten iterations, as both scoping walks did, where none of HOMEP's did. Against
the chooser round's HOMEBYC (HOMEP's walk, chosen by the course score: 0.5542), draw for draw, HOME16 is above on 3 and
below on 9 (not registered, p 0.15): a better walk with the homing chooser did less, on these draws, than the old walk
with the course chooser.

**What it does not mean.** Section 7 holds. The gain is small (0.0016) and rests on 11 of 12 draws going one way, not on
its size. The walks keep HOMEP's homing chooser, which the chooser round found wanting, so this round does not say what a
16-life walk does with the course chooser. And it says what this trainer finds, not how an animal learns to home.
