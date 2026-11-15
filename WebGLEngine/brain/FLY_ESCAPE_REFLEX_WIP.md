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
