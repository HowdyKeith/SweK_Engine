# The collision reflex with a sidestep: scoped by hand, and not run (scoping record)

**Written 2026-11-17. No round is registered here.** Keith: "Let's do the fly-ram-sidestep." The backlog entry
(`fly-ram-sidestep`) said, before anything was measured: *scope by hand first; if no hand-timed sidestep beats the pilot
alone, there is nothing for a circuit to learn and the round is not to be run.* This note is that scoping and what it found.

## 1. What was flown
The collision round's fight (`brain/rl/ramEnv.mjs`, unchanged): the Close pilot (`brain/pilot6dofWeightsClose.json`)
against the PD autopilot, the joust start, collisions on, reward = the duel's score less 1/6 a hit point lost to a ram. A
hand-written trigger over the pilot, and a hand-written manoeuvre while it holds:
* **trigger:** the time to contact (range over closing speed) under T: 0.5, 0.75, 1, 1.5, 2 or 3 seconds;
* **hold:** only while the trigger holds, or once fired for 10, 20 or 40 ticks;
* **manoeuvre**, one of seven: **flee** (the collision round's break-away: turn away from the foe's line, thrust, hold
  fire); **flee firing** (the same, the pilot's fire kept); **swerve 3, 6, 10 or 16 m** (the pilot flies and fires as ever,
  at a target moved that far off the line, away from it: a sidestep that stays in the fight); **coast** (the pilot flies and
  fires as ever, the engine off).

168 variants on the round's 60 scoping jousts (1000001 + 37 k), then the chosen one on 200 fresh confirmation jousts
(3000001 + 41 k, k 0 to 199), which no trainer seed, battery or audit joust of the collision round meets. Scratch code (not
committed); a duel is about 18 ms.

## 2. What it found
**No sidestep beats the pilot alone.** On the scoping jousts the pilot alone scores 16.555; the best of each family:
| manoeuvre | best variant | reward | against the pilot alone | variants above it |
|---|---|---|---|---|
| flee | under 0.75 s, while it holds | 16.307 | -0.247 | 0 of 24 |
| flee firing | under 0.75 s, while it holds | 16.338 | -0.217 | 0 of 24 |
| swerve | 6 m, under 0.75 s, while it holds | 16.537 | -0.018 | 0 of 96 |
| **coast** | under 1 s, held 20 ticks | **17.391** | **+0.836** | 15 of 24 |

**Coasting does, and it is not a reflex.** The best coast, chosen on the scoping jousts before the confirmation jousts were
flown, held up there: +0.576 against the pilot alone (16.640 against 16.064), better in 122 jousts, worse in 64, same in
14; sign test p 0.0023. But the longer the trigger, the more it gains on the 200 confirmation jousts:
| coast while | reward | against the pilot alone | jousts better / worse | sign p | ram damage a joust |
|---|---|---|---|---|---|
| (the pilot alone) | 16.064 | | | | 10.15 |
| contact is under 1 s | 16.503 | +0.440 | 115 / 52 | 0.040 | 9.44 |
| under 3 s | 16.756 | +0.692 | 118 / 66 | 0.013 | 8.16 |
| under 8 s | 17.256 | +1.192 | 127 / 63 | 1.6e-4 | 7.90 |
| **the gap is closing at all** | **17.124** | **+1.060** | **129 / 62** | **5.0e-5** | **7.79** |
(On the 60 scoping jousts the same rows are +0.452, -0.503, +0.008 and +1.033: 60 jousts are noisy, and the order of the
short triggers there was not the order here.)

So the gain is not in WHEN to act on a collision: it is that **the Close pilot thrusts toward the foe when it would fight
better, and ram less, not thrusting.** A "coast while closing" reflex needs only the sign of the looming rate. Trained as a
reflex, every arm -- the real circuit, a shuffle, a free net, even cells with no connections -- could learn that one
threshold, so a round would not tell anything about the circuit. Twelve sigma-0.14 steps from the round's zero-output
start on 20 scoping jousts showed the trainer's view of it: most steps coast for the whole joust and score about 6.1 (the
engine off even while opening), the rest do nothing; one free net stepped to 18.06.

## 3. What follows
* `fly-ram-sidestep` is **not run**, as the backlog said before the scoping. The collision round's reading stands: for this
  pilot no hand-written break-away -- fleeing or swerving -- is worth timing.
* The coast finding is about the pilot, and the 6-DOF pilot files are another chat's (they are used here as they are). It
  goes to the backlog as `close-pilot-coasts`, for them: the Close pilot gains about a point of reward, and loses about a
  quarter of its ram damage, by not thrusting while the gap is closing.
* Said plainly: none of this was registered before it was measured, and the numbers in section 2 are best-of-many on the
  scoping jousts. Only the one coast candidate was chosen before the confirmation jousts; the rest of the confirmation
  table was flown after, and is description.
