# The fly escapes, round 2: started AT the reflex, and the trainer keeps the best return (UNNUMBERED; REGISTERED 2026-11-15 BEFORE ITS CODE IS WRITTEN AND BEFORE ANY SUCH TRAINING IS RUN)

Keith, 2026-11-15, of three open items: "Let's do all 3". This is the first (backlog `fly-escapes-reflex`). Round 1
(`brain/FLY_ESCAPE_WIP.md` section 11): from a random start no arm learned to tell a strike from a pass -- all 80 trained flies
go home for everything (0.517 to 0.521 by arm; the fly written to flee from everything 0.5395, the reflex written by hand
0.6465, a fly told each mover's kind 0.8351) -- so its wiring test compared flies that did not do the task. It also found, after
the reading, that the trainer kept the iteration that LIVED most. This round changes those two things and nothing else. No code
of it exists; nothing has been trained from the reflex.

## 1. What is the same and what changes
The same as round 1: the environment (`brain/rl/escapeEnv.mjs`), the five arms and their weight counts (FLY and SHUF 824, PLAIN
826, FISH 664, MLP 513), draws s = 1 to 16, `maxSteps 160, iters 150, pop 96, sigma 0.14, lr 0.05, trainEps 8`, the 200 audit
episodes, the floors.

**Changed, two things:**
1. **The fly starts at the reflex.** Its action is `0.5 x the reflex's answer (+1 home, -1 food) + its network's output`, and the
   network's output layer starts at zero -- as the voxel home's round 4 did with the lean (`brain/rl/leanStart.mjs`). At
   iteration 0 every fly of every arm IS the reflex, exactly. The half is there so the network can overrule it: a network's
   output lies in (-1, 1), so it turns a "home" into "food" when it says less than -0.5 and a "food" into "home" above 0.5. (With
   the reflex at full weight no output could ever change the answer.)
2. **The trainer keeps the weights with the best RETURN.** The environment is given an option that reports no episode as
   "docked" or "crashed" to the trainer, so `trainDockES`'s rule for which iteration to hand back (`dockRate x 1000 - avgDist`)
   becomes `-avgDist`, and `dist` is 1 - the return. The trainer's own code is not touched; the reward it climbs is unchanged.

**Said plainly:** as in round 4 of the voxel home, this does not put the reflex INTO the network; the fly is "the reflex, which a
person wrote, corrected". What can be learned is when the reflex is wrong: it is caught by 44 of its 410 strikes and leaves its
food for 81 of 328 passes.

## 2. The four questions and the reading (each read ONCE from the committed records; alpha 0.01, two-sided, a tie counted against the claim)
* **T3, all 80 flies against the reflex** -- the exact sign test against the reflex's score on the same 200 episodes. Words:
  `A FLY STARTED AT THE REFLEX ESCAPES BETTER THAN THE REFLEX` / `... ESCAPES WORSE THAN THE REFLEX` /
  `... CANNOT BE TOLD APART FROM THE REFLEX`.
* **T0, the 16 FLY flies against the reflex** -- the same test. Words: `A FLY-WIRED FLY STARTED AT THE REFLEX ESCAPES BETTER
  THAN THE REFLEX` / `... ESCAPES WORSE THAN THE REFLEX` / `... CANNOT BE TOLD APART FROM THE REFLEX`.
* **T1, THE WIRING: FLY against SHUF** and **T2, FLY against PLAIN** -- the exact rank-sums, round 1's words.
* **Whether T1 is asked of flies that do the task, decided now:** it is if the FLY arm's mean and the SHUF arm's mean are both
  at or above the reflex's 0.6465. If either is below, T1 is reported and said to be, again, a comparison of flies that do not.
* Described, not tested: each arm's mean, lives, time fed, passes left for, strikes that catch; beside the reflex and the fly
  told the kind; the history.

## 3. Checks, made first; a failure is the first line and the reading is NOT WEIGHED
Round 1's (80 records each once, the recipe, each arm's weight count and wiring, FLY draw 1 the same twice, a history, the
registered floors); **the untrained fly of every arm scores the reflex's number, to the bit**; and the gate re-audits two records
an arm.

## 4. Expectations, written before the code
T3: BETTER about 60 percent, CANNOT about 25, WORSE about 15. T0: BETTER about 40, CANNOT about 45, WORSE about 15. T1 is asked
of flies that do the task (both means at or above the reflex): about 65 percent. **T1: CANNOT BE TOLD APART about 75 percent,
BETTER about 12, WORSE about 13.** T2: CANNOT about 70. The best arm's mean above 0.75: about 30 percent; above the fly told the
kind (0.8351): about 4. **Round 1's main guess was the most wrong of any round here (85 percent for an outcome that did not
come); these are lower for it, and the reason for hope is one case -- the voxel home's round 4.**

## 5. What a reading would and would not mean
T3 BETTER: the trainer can improve a hand-written escape rule, and T1 is then, for the first time, asked of flies doing the job
the circuit is for. T3 CANNOT or WORSE: it cannot, with this recipe; the wiring question stays unanswered here. In no case does
it say anything about the animal's circuit (`brain/FLY_ESCAPE_WIP.md` section 2: no visual inputs, no memory between ticks).

## 6. The cost
Round 1 measured 54.1 minutes beside another round's run. About the same here, beside round 7 of the voxel home. Resumable.

## 7. The run (to be written; the gate never runs it and never gives the command the word `run`)
`node tools/ship/takeFlyEscapeReflex.mjs run` -> `brain/flyEscapeReflexRound.jsonl`, committed byte for byte before it is read;
`node tools/ship/takeFlyEscapeReflex.mjs read` prints the checks and the reading.

## 8. The result (run 2026-11-15 in the sandbox, 28.6 minutes; `brain/flyEscapeReflexRound.jsonl` committed at 8193559f before it was read; read once)
**The checks hold, and the start was the reflex:** the untrained fly of every arm scores 0.6465, to the bit.

| | mean score | sd | above the reflex (of 16) | lives (of 200) | feeds | off its food for a pass | caught by a strike |
|---|---|---|---|---|---|---|---|
| FISH | 0.6583 | 0.0310 | 11 | 158.1 | 0.526 | 0.257 | 0.105 |
| PLAIN | 0.6595 | 0.0243 | 11 | 157.1 | 0.534 | 0.260 | 0.110 |
| SHUF | 0.6617 | 0.0291 | 14 | 160.1 | 0.523 | 0.260 | 0.098 |
| MLP | 0.6623 | 0.0412 | 13 | 159.9 | 0.525 | 0.277 | 0.100 |
| FLY | 0.6636 | 0.0420 | 10 | 159.9 | 0.528 | 0.257 | 0.101 |
| the reflex (and every fly at iteration 0) | 0.6465 | | | 156 | 0.513 | 0.247 | 0.107 |
| fleeAll | 0.5395 | | | 198 | 0.089 | 1.000 | 0.004 |
| told each mover's kind | 0.8351 | | | 198 | 0.680 | 0.296 | 0.004 |

* **T3: A FLY STARTED AT THE REFLEX ESCAPES BETTER THAN THE REFLEX** (59 of the 80 above it, 21 below; exact two-sided p 2.5e-5).
* **T0: A FLY-WIRED FLY STARTED AT THE REFLEX CANNOT BE TOLD APART FROM THE REFLEX** (10 above, 6 below; p 0.45).
* **T1 is asked of flies that do the task** (the FLY arm's mean 0.6636 and the SHUF arm's 0.6617 are both above the reflex's),
  for the first time: **T1: THE FLY'S WIRING CANNOT BE TOLD APART FROM A SHUFFLE OF IT** (the ranks sum to 272, the middle 264;
  p 0.78).
* **T2: THE FLY'S WIRING CANNOT BE TOLD APART FROM A PLAIN NET OF ITS SIZE** (279; p 0.59).

**The gain is real and small: a hundredth and a half.** The 80 flies average 0.6611 against the reflex's 0.6465, and what they
do is very nearly what the reflex does (they live in 157 to 160 episodes for its 156, feed 0.52 to 0.53 of the time for its
0.51, are caught by a tenth of strikes as it is). The fly told each mover's kind scores 0.835; nothing here comes near it. This
is not what the voxel home's round 4 found, where the correction to the lean was large and learned in 25 iterations.

**Most of what the trainer gained was its own 24 episodes'.** On the trainer's battery every arm starts at the reflex's 0.6991
there, and the best reading of a training averages 0.78 to 0.80: a gain of 0.08 to 0.10. On the 200 audit episodes, which the
trainer never saw, the same weights gain 0.012 to 0.017. The battery is the same 24 episodes at every iteration and the weights
handed back are the best on it -- which is what this round asked for ("keep the best return"), and on an environment this
chancy it keeps luck as readily as skill. A battery that changes, or a larger one, is the obvious next thing; not registered.

**The wiring.** This is the round the question was waiting for: flies that do the escape task, on the fly's own escape
circuit's wiring against a shuffle of it. They cannot be told apart (p 0.78), the eighth such reading and the first on the
circuit's own job. What it is a reading OF is in `brain/FLY_ESCAPE_WIP.md` section 2: 313 connections as a mask on a small rate
network with no visual inputs and no memory -- and here a network that only corrects a rule a person wrote, by a hundredth and
a half. It says nothing about the animal.

**The expectations against what came.** T3 BETTER (60): came. T0 CANNOT (45): came. T1 asked of flies that do the task (65):
it is. T1 CANNOT (75) and T2 CANNOT (70): both came. The best arm above 0.75 (30): no, 0.66.
