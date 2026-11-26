# A perfect tally: how much of the homing fly's shortfall is its reckoning of where home is? (registration)

**Registered 2026-11-26, before any code of this round exists.** Keith: "Let's do suggestion 5", after the compass-noise
round (`brain/FLY_HOME_COMPASS_NOISE_WIP.md`, read at 41b1ad07). That round found that **a heavily jittered compass costs
homing more than the lost course-holding accounts for** (R8 WORSE, 45 of 48), and a lightly jittered one does not (R4
CANNOT). The homing fly (`brain/rl/homingFly.mjs`) uses its compass twice: to steer, and to keep a tally of where home is
(a step along the heading it believes, each tick). **This round gives the fly a perfect tally -- its true position --
and leaves its steering on its own compass, to see how much of its homing, and of the noise's cost, the tally carries.**

**Said first: the scoping below changed what this round asks.** It was meant to ask whether the extra loss under heavy
noise is the tally's. The scoping found that **with a perfect tally these flies come home at about 0.92 with no noise
at all**, where they score about 0.56 with their own: most of the homing shortfall is the tally, not the steering. So
this round's first reading is that, and its second is the noise's cost.

## 1. What was measured before this note, and on what (scratch code; not committed)
Round 4's HOMEP draw 1 and the trainer round's BAT64 draw 1 (COURSE64's), on the noisy homing life
(`brain/rl/noisyCompassEnv.mjs`), on **the 100 scoping lives** (seeds 30000001 + 7919 k), each fly with its own tally and
with the perfect tally:
| fly | sigma 0: own / perfect | 0.4 | 0.8 |
|---|---|---|---|
| HOMEP 1 | 0.5635 / 0.9271 | 0.5493 / 0.9183 | 0.4953 / 0.8808 |
| COURSE64 1 | 0.5697 / 0.9228 | 0.5528 / 0.9164 | 0.4981 / 0.8859 |
From sigma 0 to 0.8 home fell 0.0463 and 0.0369 with the perfect tally, against 0.0682 and 0.0716 with the fly's own.

## 2. The perfect tally
**From the tick the fly turns for home, the goal it is shown is the true way home**: the bearing from its true position
to its door, where the homing fly shows it the bearing from its tally. **Everything else is the homing fly's**: the same
compass fly with its committed weights, steering on its own estimate of its heading from the ring neurons, on the noisy
homing life of the compass-noise round, its seen heading jittered as there. Course-holding uses no tally, so **each fly's
course scores are the compass-noise round's, as committed** (`brain/flyHomeCompassNoiseRound.jsonl`, sha256
89be16c3a54a14d4...), and so are its home scores with its own tally.

## 3. The flies and the levels (no training)
**The compass-noise round's 48 flies** (HOMEP, COURSE64, HOME16 and H16BYC, 12 each, its arms' committed weights), **each
flown home with the perfect tally at sigma 0, 0.4 and 0.8** on **round 4's audit** (the homing round's 200 lives).
**HOMEP draw 1 is flown a second time.**

## 4. The readings (alpha 0.01, exact sign tests over the 48 flies, two-sided, ties against the claim; the checks first)
* **T0: at sigma 0, the perfect tally against the fly's own** (its home score with the perfect tally less its committed
  home score): how much of homing the tally carries.
* **T8: at sigma 0.8, does the perfect tally fall less?** Its fall at home from sigma 0 (with the perfect tally) less its
  fall with its own tally (the compass-noise round's), against 0: **BETTER: the perfect tally falls less, so part of the
  noise's cost was the tally's.**
* **The checks include** that the compass-noise round's file and those it rests on are the ones committed and pass
  their own checks, that every fly is its arm's committed weights, and that HOMEP draw 1 is the same twice.
* Described: each arm's scores at each level, sigma 0.4, and how the perfect tally's home tracks course.

## 5. What a reading would say
* T0 BETTER: **the homing fly's shortfall is mostly its tally**: steering on its own compass, a fly that knew where it
  was would come home far better.
* T8 BETTER: **part of the noise's cost to homing is the tally's**, as the compass-noise round's R8 suggested. CANNOT:
  the noise costs the perfect-tally fly as much, and the tally is not where the extra loss went.

## 6. Expectations, written before the code
T0: **BETTER about 99**. T8: **BETTER about 85**, CANNOT 15.

## 7. What it would and would not mean
About **this fly and this tally**: a perfect tally is the fly told where it is, which no fly is. T0 BETTER says how much
the tally, as this fly keeps it, costs; it does not say how a better tally would be kept, nor anything of the animal.

## 8. The cost
48 jobs of 3 levels at home, about 1.5 minutes each, and a second HOMEP draw 1, four at a time: about 20 minutes, in the
sandbox.

## 9. The run (the gate never runs it and never gives the command the word `run`)
`node tools/ship/takeFlyHomeTrueTally.mjs run` -> `brain/flyHomeTrueTallyRound.jsonl`, committed byte for byte, whole,
before it is read; `node tools/ship/takeFlyHomeTrueTally.mjs read` prints the checks and the reading.
