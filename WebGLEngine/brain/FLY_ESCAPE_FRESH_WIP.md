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
