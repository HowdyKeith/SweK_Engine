# The fly escapes, round 3: the trainer trains on new episodes every iteration and judges on 200 it keeps aside (UNNUMBERED; REGISTERED 2026-11-15 BEFORE ITS CODE IS WRITTEN AND BEFORE ANY SUCH TRAINING IS RUN)

Keith, 2026-11-15, of the open Escape items (a trainer test set that changes or is larger; memory between ticks; the visual
inputs the real circuit has): "Let's do Escape". This is the first. Round 2 (`brain/FLY_ESCAPE_REFLEX_WIP.md` section 8): started
at the reflex, 59 of 80 flies beat it, by a hundredth and a half; **the trainer gained 0.08 to 0.10 on its own battery and 0.012
to 0.017 on the 200 audit episodes.** No code of this round exists; nothing has been trained this way.

## 1. What the trainer does today, read from its source before this note (`brain/rl/dockPolicy.js`)
Two things, and the second I had not said before:
1. It hands back the weights that scored best on a battery of **24 fixed episodes** (seeds `5000 + 17 k`), the same 24 at every
   iteration.
2. **Every fly it tries, at every iteration, is flown on the same 8 episodes** -- the first `trainEps` of that same battery. All
   150 iterations x 96 flies climb the return of 8 episodes. (The voxel home's rounds were trained the same way, on 8 plans.)
So a training here fits 8 episodes and is then chosen by 24 that include them.

## 2. What is the same and what changes
Round 2's, to the number: the environment, the reflex start, the report "return", the five arms and their weight counts, draws
s = 1 to 16, `maxSteps 160, iters 150, pop 96, sigma 0.14, lr 0.05, trainEps 8`, the 200 audit episodes, the floors.

**Changed, two options given to the trainer (both off unless asked for, so every earlier round's training is unchanged):**
1. **Fresh training episodes:** at iteration `it` the flies tried are flown on 8 episodes of that iteration's own (seeds
   `5000 + 17 k + 104729 (it + 1)`), the same 8 for all 96 flies of the iteration, so they are compared fairly, and different
   from every other iteration's and from the battery's.
2. **A battery of 200:** the weights handed back are the best on 200 fixed episodes (seeds `5000 + 17 k`, k < 200), none of
   which is trained on. They are NOT the audit's 200 (`900001 + 7919 k`), which stay unseen.

## 3. The questions and the reading (each read ONCE from the committed records; alpha 0.01, two-sided, a tie counted against the claim)
* **P3, every fly against its round 2 self** (the same arm, the same draw) -- the exact sign test over the 80 pairs. Words:
  `FRESH EPISODES AND A LARGER BATTERY ESCAPE BETTER THAN ROUND 2'S TRAINER` / `... ESCAPE WORSE THAN ROUND 2'S TRAINER` /
  `... CANNOT BE TOLD APART FROM ROUND 2'S TRAINER`.
* **T3 (all 80 against the reflex), T0 (FLY against the reflex), T1 (FLY against SHUF), T2 (FLY against PLAIN)** and whether T1
  is asked of flies that do the task -- round 2's, with round 2's words.
* Described, not tested: each arm's mean beside round 2's; the gain on the trainer's battery beside the gain on the audit (the
  gap this round is for); lives, time fed, passes left for, strikes that catch.

## 4. Checks, made first; a failure is the first line and the reading is NOT WEIGHED
Round 2's (80 records each once, this round's recipe, weight counts and wiring, FLY draw 1 the same twice, a history, the
registered floors, the untrained fly of every arm the reflex to the bit); round 2's file holds its 80 draws; and the gate
re-audits two records an arm.

## 5. Expectations, written before the code
P3: BETTER about 55 percent, CANNOT about 35, WORSE about 10. T3: BETTER about 80. The 80 flies' mean above 0.68 (round 2:
0.661; the reflex 0.6465): about 40 percent; above 0.72: about 10. **The gap closes -- the gain on the battery is within twice
the gain on the audit, for every arm: about 60 percent.** T1: CANNOT BE TOLD APART about 78 percent. T2: CANNOT about 72.

## 6. What a reading would and would not mean
Whether round 2's small gain was the trainer's doing (8 episodes, a battery that includes them) or is what there is to gain
over the reflex with these 13 numbers and no memory. NOT anything about the fly's circuit.

## 7. The cost
Round 2 measured 28.6 minutes alone. A battery of 200 adds 176 episodes to an iteration's 792: about a quarter more. Resumable.

## 8. The run (to be written; the gate never runs it and never gives the command the word `run`)
`node tools/ship/takeFlyEscapeFresh.mjs run` -> `brain/flyEscapeFreshRound.jsonl`, committed byte for byte before it is read;
`node tools/ship/takeFlyEscapeFresh.mjs read` prints the checks and the reading.

## 9. The result (run 2026-11-16 in the sandbox, 51.1 minutes beside round 4's run; `brain/flyEscapeFreshRound.jsonl` committed at 13b8fe4b before it was read; read once)
**The checks hold, and the start was the reflex:** the untrained fly of every arm scores 0.6465, to the bit.

| | mean score | sd | round 2's mean | lives (of 200) | feeds | off its food for a pass | caught by a strike |
|---|---|---|---|---|---|---|---|
| MLP | 0.7366 | 0.0122 | 0.6623 | 191.1 | 0.518 | 0.291 | 0.020 |
| SHUF | 0.7392 | 0.0134 | 0.6617 | 192.8 | 0.515 | 0.298 | 0.016 |
| FISH | 0.7410 | 0.0123 | 0.6583 | 192.0 | 0.522 | 0.296 | 0.018 |
| FLY | 0.7432 | 0.0113 | 0.6636 | 193.4 | 0.520 | 0.299 | 0.015 |
| PLAIN | 0.7444 | 0.0121 | 0.6595 | 192.6 | 0.526 | 0.307 | 0.017 |
| the reflex (and every fly at iteration 0) | 0.6465 | | | 156 | 0.513 | 0.247 | 0.107 |
| told each mover's kind | 0.8351 | | | 198 | 0.680 | 0.296 | 0.004 |

* **P3: FRESH EPISODES AND A LARGER BATTERY ESCAPE BETTER THAN ROUND 2'S TRAINER** (all 80 flies above their round 2 selves;
  exact two-sided p 1.7e-24; the least gain of a pair 0.009, the most 0.193).
* **T3: A FLY STARTED AT THE REFLEX ESCAPES BETTER THAN THE REFLEX** (80 of 80; round 2: 59).
* **T0: A FLY-WIRED FLY STARTED AT THE REFLEX ESCAPES BETTER THAN THE REFLEX** (16 of 16; p 3.1e-5).
* T1 is asked of flies that do the task. **T1: THE FLY'S WIRING CANNOT BE TOLD APART FROM A SHUFFLE OF IT** (ranks 265, the
  middle 264; p 0.99).
* **T2: THE FLY'S WIRING CANNOT BE TOLD APART FROM A PLAIN NET OF ITS SIZE** (252; p 0.67).

**What it says.** Round 2's small gain was the trainer's doing, not the task's. The gain a training saw on its battery was the
same in both rounds (0.08 to 0.10); in round 2 the audit saw 0.012 to 0.017 of it and here it sees 0.090 to 0.098 -- all of it.
The 80 flies average 0.741, about half the way from the reflex to a fly told each mover's kind, and what they learned is not to
be caught: a strike catches 1.5 to 2 percent of the time against the reflex's 10.7, while they feed as much as the reflex does.
The five arms are within eight thousandths of each other and the fly's wiring sits in the middle of its shuffles.

**Expectations against what came.** Every word I gave the most weight came. The size did not: I gave the mean above 0.72 one
chance in ten, and it is 0.741.

