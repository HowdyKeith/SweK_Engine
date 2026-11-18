# Offset against wobble: which heading error does finding home forgive? (registration)

**Registered 2026-11-18, before any code of this round exists.** Keith: "Let's do all 5". The homing round
(`brain/FLY_FINDS_HOME_WIP.md`, read at 6ac4494f) found that the real wiring's handicap at holding a course does not
carry over to finding home. Measured after that reading, not registered: the arms differ mostly in the **offset** of
their heading error (each life's mean error; 22.4 to 23.4 degrees against 19.6 to 20.9), and hardly in its **wobble**
(its spread about that mean). The explanation offered was that a fly that keeps its home vector in its own heading, and
steers home in that same frame, cancels an offset but not a wobble. **This round tests that explanation by making
each error on purpose.**

## 1. What was measured before this note, and on what (scratch code; not committed)
A fly whose believed heading is set each tick to the true heading plus an error. It is the compass round's fly with
vision off, so nothing else moves its heading. It is flown on the compass life (holding a course to the life's goals)
and on the homing life (`brain/rl/homeEnv.mjs` and `brain/rl/homingFly.mjs`, as in the homing round), on 60 scoping lives
(seeds 30000001 + 7919 k):
| error | course | home |
|---|---|---|
| none (TOLD) | 0.9064 | 0.9969 |
| an offset of 20 degrees | 0.8524 | 0.9967 |
| a wobble of 20 degrees (correlation time 50 ticks) | 0.8538 | 0.6852 |
| a wobble of 20 degrees (correlation time 200 ticks) | 0.8551 | 0.6741 |
| an offset of 40 degrees | 0.6955 | 0.9963 |
| a wobble of 40 degrees (50 ticks) | 0.7145 | 0.4841 |
**Of the same size, the two errors cost the course alike; only the wobble costs homing.**

## 2. The arms (no training; the same 200 lives each)
| arm | the believed heading each tick |
|---|---|
| TOLD | the true heading |
| **OFFSET** | the true heading **plus 20 degrees**, the sign drawn for the life (half the lives +20, half -20, at random) |
| **WOBBLE** | the true heading **plus an error that wanders**: an Ornstein-Uhlenbeck process with standard deviation **20 degrees** and correlation time **50 ticks**, started from its stationary spread |
The error streams are drawn from the life's seed plus 777, apart from the life's own randomness. Each arm flies **the
compass life** (scored as the compass round scores it) and **the homing life** (scored as the homing round does) on
**200 audit lives, seeds 60000001 + 7919 k**, none a life of any earlier round's training, audit or scoping. The fly is
the compass round's FROZEN fly with p_c 0: vision off, the start's steering. **OFFSET is flown a second time.**

## 3. The readings (alpha 0.01, exact two-sided sign tests over the 200 lives, ties against the claim; the checks first)
For each life and arm, **the course cost** is TOLD's course score less the arm's, and **the home cost** is TOLD's home
score less the arm's.
* **O: for OFFSET, the course cost against the home cost** (each life's course cost less its home cost): BETTER says the
  offset costs the course more than it costs homing.
* **W: for WOBBLE, the home cost against the course cost**: BETTER says the wobble costs homing more than the course.
* **X: OFFSET's home score against WOBBLE's**, life for life.
* **Y: OFFSET's course score against WOBBLE's**, life for life: of the same size, do they cost the course alike?

## 4. What a reading would say
* O, W and X BETTER: **finding home with a home vector kept in the fly's own heading forgives an offset and not a
  wobble**. This is the explanation the homing round offered after its reading, now tested.
* Y CANNOT: matched in size, the two errors cost holding a course alike, so the difference is in what homing forgives.
  Y BETTER or WORSE: they do not cost the course alike, and X should be read with that in mind.

## 5. Expectations, written before the code
O **BETTER about 95 percent**. W **BETTER about 95**. X **BETTER about 97**. Y CANNOT about 55, WORSE 25, BETTER 20
(scoping put them within 0.002 of each other on the mean, but 200 lives is enough to see a small steady difference).

## 6. What it would and would not mean
About **this home vector**: a perfect sum of the believed heading, followed in the same frame. Of course it forgives a
constant rotation; that follows from the arithmetic. **What the round adds is the size of the effect beside the course**.
The real wiring's extra offset in the homing round was about 3 degrees: this round does not test that a difference that
small explains that result, only that offsets are the kind of error homing forgives. An offset that changes with the
heading, like the real wiring's pull toward one heading, is neither of these errors.

## 7. The cost
3 arms x 2 lives x 200 seeds, and OFFSET again: about 5 minutes on one process.

## 8. The run (the gate never runs it and never gives the command the word `run`)
`node tools/ship/takeFlyHomeOffset.mjs run` -> `brain/flyHomeOffsetRound.jsonl`, committed byte for byte, whole, before
it is read; `node tools/ship/takeFlyHomeOffset.mjs read` prints the checks and the reading.

## 9. The result (the whole results file committed unread at 1b43f9ea, then read once)
One start, 2.6 minutes on two processes, 4 records (the three arms and OFFSET flown a second time; sha256
f2ef4ddc62469ee7...). **The checks hold.**
* **O: AN OFFSET COSTS HOLDING A COURSE MORE THAN FINDING HOME** -- on all 200 lives (p 1.2e-60).
* **W: A WOBBLE COSTS FINDING HOME MORE THAN HOLDING A COURSE** -- on 169 of 200, 31 the other way (p 3.4e-24).
* **X: WITH AN OFFSET THE FLY FINDS HOME BETTER THAN WITH A WOBBLE OF THE SAME SIZE** -- on 197 of 200 (p 1.7e-54).
* **Y: WITH AN OFFSET THE FLY CANNOT BE TOLD APART FROM ONE WITH A WOBBLE OF THE SAME SIZE AT HOLDING A COURSE** -- 82
  above, 118 below (p 0.013, the offset leaning lower).

| arm | course | home |
|---|---|---|
| TOLD | 0.9046 | 0.9958 |
| OFFSET (20 degrees) | 0.8506 | 0.9962 |
| WOBBLE (20 degrees, 50 ticks) | 0.8531 | 0.7356 |

**Every expectation came.** So, as section 4 put it, **finding home with a home vector kept in the fly's own heading
forgives an offset and not a wobble**. This is the explanation the homing round offered after its reading, now tested.
Matched in size, the two errors cost holding a course alike (Y CANNOT), so the difference is in what homing forgives.

Measured after the reading (not registered; the gate recomputes it): the offset **costs the course 0.0539 and homing
nothing**: TOLD less OFFSET at home is -0.0004, so the offset fly came home a hair better. The wobble costs the course
0.0514 and homing 0.2602.

**What it does not mean.** Section 6 holds. The home vector is a perfect sum followed in the same frame, and that it
forgives a constant rotation follows from the arithmetic; what the round adds is the size of the effect beside the
course. It does not test that the real wiring's extra 3 degrees of offset explain the homing round's result, only that
offsets are the kind of error homing forgives.
