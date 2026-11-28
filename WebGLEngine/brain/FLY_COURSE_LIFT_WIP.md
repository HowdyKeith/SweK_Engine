# Do the course-chosen flies gain least from the richer scene? (registration)

**Registered 2026-11-28, before any code of this round exists and before the tally-share round
(`brain/FLY_TALLY_SHARE_WIP.md`) has been run.** Keith, of the rounds suggested after v4936: "Let's do all the items
listed, in the order you suggest". Round E (`brain/FLY_SCENE_TALLY_WIP.md`, section 9) described, after its reading and
not registered, that the scene lifted the course-chosen flies' own homing least: COURSE64 by 0.022 and H16BYC by 0.025,
against HOMEP by 0.041 and HOME16 by 0.038. **This round registers that pattern and reads it on lives none of those
numbers were taken on.**

## 1. The data (no new flight)
**The tally-share round's results file** (`brain/flyTallyShareRound.jsonl`, not yet run as this is written), which
flies each of the compass-noise round's 48 committed flies on 200 FRESH lives (seeds 80000001 + 7919 k) with its own
tally in the plain scene (`ownPlain`) and in the 26-type scene (`ownType`). A fly's **lift** is ownType less ownPlain.
This round reads that file AFTER it is committed and BEFORE it is read for its own round, and adds no flight. The pair
is **by draw**: HOMEP against COURSE64 (the same recipe; home-chosen against course-chosen) and HOME16 against H16BYC
(likewise), each draw s with draw s.

## 2. The reading (alpha 0.01, exact two-sided sign test over the 24 pairs; the checks first)
* **L: is the home-chosen fly's lift larger than its course-chosen pair's?** The 24 differences (HOMEP_s lift less
  COURSE64_s lift, and HOME16_s less H16BYC_s), against 0; ties against the claim.
* **The checks**: the tally-share round's file passes that round's own checks (its file, flies, reproduction and
  second flight).
* Described: each arm's mean lift, and L for each pair of arms alone.

## 3. What a reading would say
* L ABOVE: **choosing a fly by its course costs it some of what a richer scene gives**, on fresh lives.
* L CANNOT: round E's pattern does not reproduce at this size. L BELOW: the other way.

## 4. Expectations, written before the code
L: **ABOVE about 60**, CANNOT 35, BELOW 5.

## 5. What it would and would not mean
About **these 48 flies and these two scenes**; the arms were chosen by home or by course on the plain scene, and why
that choice would carry into the richer scene is not tested here. Nothing here is of the animal.

## 6. The run
Nothing to run: `node tools/ship/takeFlyCourseLift.mjs read` reads the tally-share round's committed file. The verdict
will be section 7, "The result".

## 7. The result (read once, from the tally-share round's results file committed unread at 0bb1ccde)
**The checks hold**: the tally-share round's file passes that round's own checks.
* **L: THE HOME-CHOSEN FLIES GAIN LESS FROM THE RICHER SCENE THAN THEIR COURSE-CHOSEN PAIRS** (2 above, 22 below of
  24, p 3.6e-5). Described: each pair alone, 1 above and 11 below of 12 (p 0.0063 each).

| arm | lift (own tally, 26-type less plain, on the fresh lives) |
|---|---|
| HOMEP | 0.0174 |
| COURSE64 | 0.0253 |
| HOME16 | 0.0196 |
| H16BYC | 0.0241 |

**The expectation did not come, and the answer is the other way**: BELOW, given 5. Round E's pattern -- the course-chosen
flies lifted least, 0.022 and 0.025 against 0.041 and 0.038 -- is REVERSED on fresh lives, as strongly: here they are
lifted most. **The same 48 flies give a strong pattern one way on round E's 200 lives and the other way on these 200.**
So which arm the richer scene lifts more is a property of the set of lives, and not of how the flies were chosen; a
pattern described after one round's reading, on one set of lives, was not a property of the flies.

**What it does not mean.** It does not show the course-chosen flies gain more in general: a third set of lives could go
either way, which is the point. Round E's lifts came from two committed files flown at different times on the same old
audit lives; these from one round on fresh lives. Nothing here is of the animal.
