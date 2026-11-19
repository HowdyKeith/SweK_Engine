# Choosing the homing fly's point: on 256 lives, or by its course score? (registration)

**Registered 2026-11-18, before any code of this round exists.** Keith: "Let's do 1, 3 and 4, then once completed do
item 2". The trained-to-home round (`brain/FLY_TRAINED_HOME_WIP.md`, read at 145b85f8) found that **the compass fly
trained on the homing score comes home worse than the same fly trained to hold a course** (G WORSE, by 0.0041). After
its reading, not registered, it found that on the 64 lives each training kept its point on, the kept homing fly beat its
course-trained draw on 12 of 12 draws, and lost on the audit: **the point kept was the one its 64 lives favoured**. This
round tests that explanation. It keeps the same walks and chooses their point two other ways.

**Said first: the two arms this round is weighed against were run and read**, HOMEP and COURSE64, as committed in
`brain/flyTrainedHomeRound.jsonl` (sha256 c931f32e5705cdba...), and the explanation under test was written after their
reading. This registration is written knowing their numbers and the scoping below.

## 1. What was measured before this note, and on what (scratch code; not committed)
**HOMEP's walks of draws 1 and 2 were run again**, every point recorded. The trainer hands back the point it kept, and
it is HOMEP's committed weights to the bit (iterations 41 and 21). Each point scored on 64 lives of HOMEP's battery gives
the trainer's own history to the bit at all 7 iterations it samples. Each point was then scored three ways:
- **on 256 homing lives of the draw's own** (seeds 90000000 + 10007 s + 17 k);
- **by the course score on the trainer round's BAT64 lives** (seeds 40000000 + 10007 s + 17 k), as COURSE64 was chosen;
- **on the 100 scoping lives** (seeds 30000001 + 7919 k).

| draw | HOMEP | HOME256 | HOMEBYC | the walk's best point | the walk after iteration 20, mean | COURSE64 |
|---|---|---|---|---|---|---|
| 1 | 0.5635 (it 41) | 0.5775 (it 24) | 0.5689 (it 19) | 0.5813 (it 27) | 0.5711 | 0.5697 |
| 2 | 0.5767 (it 21) | 0.5757 (it 35) | 0.5696 (it 49) | 0.5869 (it 29) | 0.5697 | 0.5689 |
These are home scores on the scoping lives; COURSE64's are its committed flies flown on them. **On these lives HOMEP and
COURSE64 come in the other order from the audit's.** Every number here lies between 0.5635 and 0.5869. The walk's best
point on these lives is 0.004 to 0.010 above every chooser's, **but it is chosen on the same lives it is scored on**, so
it is not a point any chooser could be expected to find. Scoring a walk on 256 lives took about 50 minutes, by the course
score about 17.

## 2. The walk and the choosers
**The walk** is HOMEP's: `brain/rl/homeTrainEnv.mjs`, `brain/rl/homingTrainFly.mjs` and the compass round's PLASTIC fly,
the compass round's recipe, the battery of 64 lives at 80000000 + 10007 s + 17 k, through the trainer
(`brain/rl/dockPolicy.js`), which gets **one new option, `onPoint`**: it is handed a copy of the walk's point after each
update. **Without it nothing changes.** The trainer's battery steers nothing, so these walks are HOMEP's walks.
**Every walk's kept point is checked against HOMEP's committed weights to the bit**: that is its second training.
**The choosers** (each the first best, as the trainer keeps, by the trainer's own score, dock rate x 1000 less the mean
distance less crashes x 200):
* **HOME256**: the point with the best homing score on **256 lives of the draw's own** (seeds 90000000 + 10007 s +
  17 k).
* **HOMEBYC**: the point with the best **course score on the trainer round's BAT64 lives** (seeds 40000000 + 10007 s +
  17 k), the compass fly flown on the compass life as COURSE64 was chosen: the same chooser and lives as COURSE64.
  Its walk is driven by the homing score where COURSE64's was driven by the course score.

## 3. The arms (12 draws each, **draws 1 to 12**)
| arm | the walk | the point |
|---|---|---|
| HOMEP | HOMEP's | the best on 64 homing lives (round 4's, as committed) |
| **HOME256** | HOMEP's | the best on 256 homing lives |
| **HOMEBYC** | HOMEP's | the best course score on 64 course lives |
| COURSE64 | trained on the course score | the best course score on the same 64 course lives (round 4's, as committed) |
**The audit is round 4's**: the homing round's 200 lives (seeds 50000001 + 7919 k) at home, the compass round's on the
course.

## 4. The readings (alpha 0.01, exact sign tests or rank sums, two-sided, ties against the claim; the checks first)
* **C256: HOME256 against HOMEP, draw for draw** (sign test of the differences): the same walk, a choice on four times
  the lives.
* **CBC: HOMEBYC against HOMEP, draw for draw** (sign test): the same walk, chosen by the course score.
* **G256: HOME256 against COURSE64** (rank sum), **GBC: HOMEBYC against COURSE64** (rank sum): does a better choice close
  round 4's gap?
* **The checks include** that round 4's file is the one committed and passes its own checks, that every walk's kept
  point is HOMEP's committed weights to the bit, and that every chooser's point is the first best of the scores it
  records.
* Described: each chooser's iteration kept, the course scores, the rates.

## 5. What a reading would say
* C256 or CBC BETTER: **the choice of point on 64 homing lives was costing HOMEP**, as round 4's description said.
* C256 and CBC CANNOT: a better choice does not help detectably. Round 4's shortfall is then in the walk itself, which
  the next round (16 lives for each fly tried) asks about.
* G256 or GBC CANNOT: the chosen fly cannot be told from the course-trained one. WORSE: the walk falls short even with a
  better choice.

## 6. Expectations, written before the code
C256: CANNOT about 60, BETTER 35. CBC: CANNOT about 70, BETTER 25. G256: CANNOT about 60, WORSE 30. GBC: CANNOT about 65,
WORSE 30.

## 7. What it would and would not mean
About **these walks**: the compass fly's three rates trained on the homing score with the compass round's recipe. A
chooser that does better says the choice was noisy, not that the walk was good, and the best of a walk is only known on
lives that also choose it, as section 1's best point was. This round does not look for a walk's best point.

## 8. The cost
12 walks of about half an hour, 12 choices on 256 lives of about 50 minutes and 12 by the course score of about 17,
with their audits, four at a time: about 5 hours. Every job is under an hour, and the command resumes.

## 9. The run (the gate never runs it and never gives the command the word `run`)
`node tools/ship/takeFlyHomeChooser.mjs run` -> `brain/flyHomeChooserRound.jsonl`, committed byte for byte, whole, before
it is read; `node tools/ship/takeFlyHomeChooser.mjs read` prints the checks and the reading.

## 10. The result (the whole results file committed unread at f902ad40, then read once)
Three starts (the two-hour limit and a container restart; the command goes on from what the file holds), 36 records
(sha256 8951af17ed60d6dc...). **The checks hold**: round 4's file as committed and passing its own checks; every walk's
kept point HOMEP's committed weights to the bit and the first best of the trainer's own scores; every choice the first
best of its chooser's scores.
* **C256: THE HOMING FLY CHOSEN ON 256 LIVES CANNOT BE TOLD APART FROM THE HOMING FLY CHOSEN ON ITS 64 LIVES AT FINDING
  HOME** (6 above, 6 below, p 1).
* **CBC: THE HOMING FLY CHOSEN BY ITS COURSE SCORE FINDS HOME BETTER THAN THE HOMING FLY CHOSEN ON ITS 64 LIVES** (11 of
  12 above, p 0.0063).
* **G256: THE HOMING FLY CHOSEN ON 256 LIVES CANNOT BE TOLD APART FROM THE FLY TRAINED TO HOLD A COURSE AT FINDING HOME**
  (ranks 110, the middle 150, p 0.020).
* **GBC: THE HOMING FLY CHOSEN BY ITS COURSE SCORE CANNOT BE TOLD APART FROM THE FLY TRAINED TO HOLD A COURSE AT FINDING
  HOME** (ranks 160, p 0.59).

| arm | home: mean (least, most) | course |
|---|---|---|
| HOME256 | 0.5523 (0.5488, 0.5565) | 0.6532 |
| HOMEBYC | 0.5542 (0.5481, 0.5571) | 0.6686 |
| HOMEP (round 4) | 0.5501 | 0.6501 |
| COURSE64 (round 4) | 0.5541 | 0.6688 |

**Three of the four expectations came**: C256 CANNOT (60), G256 CANNOT (60), GBC CANNOT (65). CBC came BETTER, which
was given 25. So, as section 5 put it, **the choice of point was costing HOMEP**, but not for want of lives: four times
the homing lives chose no better, and the course score, on 64 lives, chose a homing fly as good at home as the fly
trained on the course. The walk was not round 4's shortfall; the homing score as a chooser was.

**Described after the reading, not registered (the gate recomputes it from the records):** HOMEBYC is above HOMEP by
0.0041 on average, which is round 4's gap, and below it on draw 6 alone; HOME256 is above by 0.0022. Neither chooser kept
HOMEP's own point on any draw. HOMEBYC against HOME256, draw for draw, is 8 above and 4 below (not registered, p 0.39).

**What it does not mean.** Section 7 holds. It says the course score picks this fly's homing point better than the homing
score does, on these walks; it does not say why. One reading is that holding a heading is what this fly's homing rests
on, and the course score measures it with less noise; this round does not test that. The gradient round
(`brain/FLY_HOME_GRADIENT_WIP.md`), registered before this reading, keeps HOMEP's homing chooser, so it asks about the
walk with the chooser this round found wanting.
