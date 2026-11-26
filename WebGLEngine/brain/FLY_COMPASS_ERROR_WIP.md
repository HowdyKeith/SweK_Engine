# What limits the compass? The gusts it cannot feel, against a scene it cannot trust (registration)

**Registered 2026-11-26, before any code of this round exists.** Keith chose "Ask what limits the compass" after the
perfect-tally round (`brain/FLY_HOME_TRUE_TALLY_WIP.md`, read at cd3036c6) found **the homing fly's shortfall is mostly
its tally**, and a scoping of a fly with a second compass for its tally showed that two compasses reading the same ring
neurons make almost the same errors (their gap wanders 0.02 to 0.06 radians in a life, while each is off the true heading
by about 0.55): **no second compass on that ring gives a truer tally**. This round asks what the compass's error is made
of, and whether the fly could lean harder on the scene to correct it.

**Said first: the scoping below was looked at before this registration**, and its numbers are known to it.

## 1. What was measured before this note, and on what (scratch code; not committed)
On the compass life, **the 100 scoping lives** (seeds 30000001 + 7919 k), the error is the fly's believed heading less
the true one, each tick; error sds are circular, in radians:
| fly | error in the calm / in the wind | share of a gust left 39 ticks on | home (own tally) |
|---|---|---|---|
| HOMEP 1, as trained | 0.300 / 0.701 | 0.81 | 0.5635 |
| HOMEP 1, landmark gain x4 | 0.954 / 1.145 | 0.48 | 0.3430 |
| HOMEP 1, x16 | 2.267 / 2.290 | 0.24 | 0.2013 |
| COURSE64 1, as trained | 0.248 / 0.691 | 0.84 | 0.5697 |
| COURSE64 1, x4 | 0.777 / 0.954 | 0.50 | 0.4032 |
HOMEP 2 and COURSE64 2 as trained: 0.281 / 0.681 and 0.259 / 0.688, a gust's share left 0.82 and 0.84. **The trained
flies leave most of each gust uncorrected, and a fly leaning harder on the scene corrects gusts faster but is worse
even in the calm, and homes worse.**

## 2. The measures (`brain/rl/compassEnv.mjs` and the compass fly, not edited)
* **The error** at tick t: the fly's heading as it believes it (`phi`, after its act) less the true heading (after the
  step), wrapped. **The calm** is ticks before CALM (500), when no gust blows; **the wind** the rest.
* **A gust** is a tick at which the true heading moved by other than the fly's own turn, by 0.05 radians or more, with
  39 ticks after it in the life (the least gap to the next). **Its share left** is the error's change from the tick
  before it to 39 ticks after it, over the error's change at it; **a fly's share left is the median over its gusts**.
* **The landmark gain** is the compass fly's c (its third weight, `p_c`): **x4 is that weight times 4**, the others as
  trained.

## 3. The flies (no training)
**The compass-noise round's 48 committed flies** (HOMEP, COURSE64, HOME16, H16BYC, 12 each), each flown on **the
compass round's 200 audit lives** as trained and at **x4**, measuring the error, and **home with its own tally at x4 on
the homing round's 200 audit lives** (as trained, the committed home score). **HOMEP draw 1 is flown a second time.**

## 4. The readings (alpha 0.01, exact sign tests over the 48 flies, two-sided, ties against the claim; the checks first)
* **W: the wind against the calm**: each fly's error sd in the wind less in the calm, against 0.
* **L: how much of a gust stays**: each fly's share left less one half, against 0. **Above: most of a gust stays
  uncorrected.**
* **K1: does leaning on the scene catch gusts?** Each fly's share left at x4 less as trained, against 0.
* **K2: does it cost the calm?** Each fly's error sd in the calm at x4 less as trained, against 0.
* **K3: does it cost homing?** Each fly's home score at x4 less its committed one, against 0.
* **The checks include** that the compass-noise round's file and those it rests on are the ones committed and pass
  their own checks, that every fly is its arm's committed weights, that as trained every fly's course score on the
  audit is its committed one to the bit, and that HOMEP draw 1 is the same twice.
* Described: each arm's numbers, the course scores at x4, and how a fly's share left and calm error go with its home.

## 5. What a reading would say
* W above and L above: **the compass errs mostly by the gusts it cannot feel, and keeps most of each one**.
* K1 below with K2 above and K3 below: **the fly could catch the gusts by leaning on the scene, and does not, because the
  scene as its compass reads it is not trustworthy enough**: what limits the compass, and so the tally, is the reading
  of the scene, not the strength of its use.
* K3 above: a fly that leaned harder on the scene would come home better, and training left it on the table.

## 6. Expectations, written before the code
W: **above about 99**. L: **above about 95**. K1: **below about 95**. K2: **above about 95**. K3: **below about 95**.

## 7. What it would and would not mean
About **this fly, this ring and this scene**: two landmarks a life, ring neurons whose preferred directions are drawn,
not read from the animal (`brain/rl/compassEnv.mjs`'s modelling choice). A scene this compass cannot trust says nothing of
how well the animal's compass reads its own; it says where this model's homing is limited.

## 8. The cost
48 jobs, each two flights of the compass life and one home on 200 lives, about 1.5 minutes, and a second HOMEP draw 1,
four at a time: about 20 minutes, in the sandbox.

## 9. The run (the gate never runs it and never gives the command the word `run`)
`node tools/ship/takeFlyCompassError.mjs run` -> `brain/flyCompassErrorRound.jsonl`, committed byte for byte, whole,
before it is read; `node tools/ship/takeFlyCompassError.mjs read` prints the checks and the reading.
