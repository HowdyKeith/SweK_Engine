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
