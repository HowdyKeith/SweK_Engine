# Does the fly's own tally keep a fixed share of the perfect tally's home? (registration)

**Registered 2026-11-28, before any code of this round exists.** Keith, of the rounds suggested after v4936: "Let's do
all the items listed, in the order you suggest"; this is the first fly round of them. Round E
(`brain/FLY_SCENE_TALLY_WIP.md`, section 9) found the tally costing more home in the 26-type scene than in the plain
one (Q: 40 above, 8 below), and then, **described after the reading and not registered**, that the cost grew in
proportion: as a share of the perfect tally's home, the fly's own tally kept about the same in both scenes (0.6048
plain, 0.6066 26-type over the arms' means; the per-fly difference above 0 for 23 flies and below for 25, p 0.89).
**This round registers that observation and tests it on lives none of those numbers were taken on.**

## 1. What was measured before this note, and on what (round E's committed records only; no new flight)
The per-fly difference d = (own 26-type / perfect 26-type) - (own plain / perfect plain), over round E's 48 flies on
the homing round's 200 audit lives: min -0.0179, tenth -0.0162, median -0.0001, ninetieth +0.0259, max +0.0330;
8 flies outside +-0.02, 3 outside +-0.03, none outside +-0.04. **None of this is a test**: it is the round that
suggested the claim, read to set the margin below.

## 2. The scene, the flies and the lives (no training)
The plain scene (`brain/rl/homeEnv.mjs`'s noisy env at sigma 0, as the compass-noise round flies it) and the 26-type
scene (`brain/rl/typedSceneEnv.mjs`), both as committed and not edited. **The compass-noise round's 48 committed flies**
(HOMEP, COURSE64, HOME16, H16BYC, 12 each, as trained). **Fresh lives: 200 of them, seeds 80000001 + 7919 k**, which
no round has flown. Each fly is flown FOUR ways on every one of them, by the functions the earlier rounds flew:
own tally plain (`flyHomeCompassNoise.homeScore`, sigma 0), own tally 26-type (`flySceneTypes.homeIn`, "type"),
perfect tally plain (`flyHomeTrueTally.trueHome`, sigma 0), perfect tally 26-type (`flySceneTally.trueIn`, "type").
None of the four numbers is taken from a committed file: all four are flown here, on the fresh lives.

## 3. The readings (alpha 0.01, exact sign tests over the 48 flies; the checks first)
Each fly's share in a scene is its own-tally home there over its perfect-tally home there; d is the 26-type share
less the plain share.
* **EQ: is the share the same in both scenes, to within 0.02?** Two one-sided exact sign tests (the equivalence form):
  d below +0.02 against above it, and d above -0.02 against below it, each at alpha 0.01; ties against the claim.
  **EQUIVALENT** only when both reject; otherwise **NOT SHOWN EQUIVALENT**, and which side failed is named.
* **D: does the share differ at all?** d against 0, exact two-sided sign test, ties against the claim.
* **The checks include**: the compass-noise round's file as committed and passing its own checks; every fly its arm's
  committed weights; the four scorers reproduce round E's and its sources' committed numbers for HOMEP draw 1 on the
  OLD audit lives to the bit (so the functions are the ones those rounds flew); no fresh life is an old audit life;
  and HOMEP draw 1 flown a second time on the fresh lives gives the same four numbers.
* Described: each arm's four means and two shares, and the T26 and Q differences of round E on these lives.

## 4. What a reading would say
* EQ EQUIVALENT: **the tally's loss is a fixed fraction of what the perfect tally reaches**, scene for scene; round E's
  larger Q is that fraction of a larger home, as its section 9 read it. NOT SHOWN EQUIVALENT on the upper side: the own
  tally keeps MORE of the richer scene's home than of the plain one's; on the lower side, less.
* D is reported either way; with EQ EQUIVALENT a D of CANNOT is the expected pair.

## 5. Expectations, written before the code
EQ: **EQUIVALENT about 85**, NOT SHOWN (upper side) 12, (lower side) 3. D: **CANNOT about 75**, ABOVE 20, BELOW 5.

## 6. What it would and would not mean
About **this fly, its tally and these two scenes**: the perfect tally is the scene's true way home handed to the fly,
a bound and not a fly. A fixed share in two scenes is not a law over scenes. The margin 0.02 is about 3% of the share
and was set from round E's spread, which is why section 1 says it is not a test. Nothing here is of the animal.

## 7. The cost
48 flies, four ways each on 200 lives, and a second HOMEP draw 1, four at a time: about 30 minutes, in the sandbox.

## 8. The run (the gate never runs it and never gives the command the word `run`)
`node tools/ship/takeFlyTallyShare.mjs run` -> `brain/flyTallyShareRound.jsonl`, committed byte for byte, whole, before
it is read; `node tools/ship/takeFlyTallyShare.mjs read` prints the checks and the reading. The verdict will be section 9,
"The result".

## 9. The result (the whole results file committed unread at 0bb1ccde, then read once)
One start, 47.7 minutes on four processes, 50 records (sha256 f910b138060cae35...). **The checks hold**: the scene-tally
round's file as committed and passing its own checks; 48 flies, each once, its arm's committed weights; the four scorers
reproduce the committed rounds' numbers for HOMEP draw 1 on the old audit lives to the bit; HOMEP draw 1 the same twice on
the fresh lives.
* **EQ: THE FLY'S OWN TALLY KEEPS THE SAME SHARE OF THE PERFECT TALLY'S HOME IN BOTH SCENES, TO WITHIN 0.02** (d below
  +0.02 for 48 of 48, one-sided p 3.6e-15; above -0.02 for 43 of 48, one-sided p 6.8e-9).
* **D: THE SHARE CANNOT BE TOLD APART BETWEEN THE SCENES** (17 above, 31 below, p 0.059).

| arm | own: plain | own: 26-type | perfect: plain | perfect: 26-type | share: plain | share: 26-type |
|---|---|---|---|---|---|---|
| HOMEP | 0.6051 | 0.6225 | 0.9181 | 0.9662 | 0.6591 | 0.6443 |
| COURSE64 | 0.5942 | 0.6194 | 0.9170 | 0.9527 | 0.6479 | 0.6502 |
| HOME16 | 0.6051 | 0.6247 | 0.9187 | 0.9656 | 0.6586 | 0.6470 |
| H16BYC | 0.5969 | 0.6211 | 0.9182 | 0.9571 | 0.6501 | 0.6489 |

**Both expectations came**: EQ EQUIVALENT (85) and D CANNOT (75). So round E's after-the-reading observation holds on
lives none of its numbers were taken on: the tally's loss is the same fraction of what a perfect tally reaches, in the
plain scene and in the 26-type one, and round E's larger Q is that fraction of a larger home. Described, not
registered: round E's T26 and Q come again on these lives (48 of 48, p 7.1e-15; 44 of 48, p 1.5e-9).

**What it does not mean.** Section 6 holds. **The share itself moved with the lives**: about 0.65 here against round
E's 0.60, every arm higher, so the share is a property of the fly AND the lives it is flown on, and only its sameness
across the two scenes is tested here. The margin was set from round E's spread. Nothing here is of the animal.
