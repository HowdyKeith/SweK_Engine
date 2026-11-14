# The voxel home, round 4: round 2's builders started AT the lean (UNNUMBERED; REGISTERED 2026-11-14 BEFORE ITS TOOL IS WRITTEN AND BEFORE ANY SUCH TRAINING IS RUN)

Keith, 2026-11-14, of the suggested next rounds (start at the simple rule; why the plateau; the fly escapes): "Let's work through
those. Let's do 1 and 2". This is 1 (backlog `voxel-home-trainer`, `start-at-the-lean`). Rounds 2 and 3
(`brain/VOXEL_HOME_DRAWN_WIP.md` section 10, `brain/VOXEL_HOME_LONG_WIP.md` section 8): trained from a random start, the best
arm builds 0.70 of a home and stands 0.375 of the way from a random builder (0.572) to **the lean -- 1 for every column the
observation says still needs a block, -1 for the rest, the column drawn -- which needs no network and builds 0.9226 of a home,
123 homes of the 200 audit plans.** The learning levelled by about iteration 166. So the question changes: not "can training find
the lean" (a third of the way) but **"given the lean, can training make a builder that builds more than it"** -- which it can only
do by learning something of the ORDER (a block must be held up; the lean picks among the unfinished columns blindly). Nothing has
been trained from the lean; no code of this round exists; the cost below is round 2's, not a probe's.

## 1. What is the same and what changes
The same as round 2: the drawn environment, the five arms and their weight counts (FLY and SHUF 2,967, PLAIN 2,962, FISH 2,807,
MLP 1,540), draws s = 1 to 16, `iters 150, pop 24, sigma 0.14, lr 0.05, trainEps 8`, 96 steps, the 200 audit plans
`700001 + 7919 k`, the 16 random builders, the lean as a floor.

**Changed, and it is two things that make one start:**
1. **The builder's action is the lean plus its network's output**, column by column: `(need > 0 ? 1 : -1) + net`. The environment
   already holds each number to [-1, 1] before it draws, so a column that needs a block can be given anything from 0 to 1 and a
   column that needs none anything from -1 to 0: the network can prefer one unfinished column to another, and cannot make a
   finished column likelier than an unfinished one that it leaves alone.
2. **The network's output layer starts at zero** (its last weights and biases: the decoder of the circuit arms, the last layer of
   the MLP). Every other weight of a draw is round 2's for that draw. So at iteration 0 the network adds nothing and **every
   builder of every arm IS the lean, exactly.**

**Added to each record:** the trainer's own history, as in round 3.

**Said plainly:** this does not put the lean INTO the network's weights (34 hidden units cannot carry 36 columns' thresholds, and
the MLP has 16); it gives the lean to the builder and asks the network for a correction. A builder here is "the lean, corrected".

## 2. The four questions and the reading (each read ONCE from the committed records; alpha 0.01, two-sided, a tie counted against the claim)
* **T0, the fly against the lean** -- a SIGN test: of the 16 trained FLY builders, how many score strictly above the lean's audit
  score on the same 200 plans, how many strictly below; the exact two-sided binomial (n = 16, a half) on the larger count. It
  speaks at 14 or more of 16 on one side. Words: `A FLY-WIRED BUILDER STARTED AT THE LEAN BUILDS MORE THAN THE LEAN` /
  `... BUILDS LESS THAN THE LEAN` / `... CANNOT BE TOLD APART FROM THE LEAN`.
* **T1, FLY against SHUF** and **T2, FLY against PLAIN** -- the exact rank-sum, 16 against 16, round 2's words. **The wiring
  question has had the same answer four times; these are kept so the record is complete, not because a fifth asking is news.**
* **T3, all 80 builders against the lean** -- the same sign test with n = 80; the count that speaks is computed exactly by the
  tool. Words: `A BUILDER STARTED AT THE LEAN BUILDS MORE THAN THE LEAN` / `... BUILDS LESS THAN THE LEAN` /
  `... CANNOT BE TOLD APART FROM THE LEAN`. The 80 are five arms on the same 16 draws: independent trainings, not independent
  starts; said here so it is not found later.
* Described, not tested: each arm's mean, its homes of 16 x 200 and its best builder's homes beside the lean's 123; how many
  builders finish more than 123; the history (the share missing at iteration 0 and at the end).

## 3. Checks, made first; a failure is the first line and the reading is NOT WEIGHED
Round 3's (80 records, each once, this round's recipe, each arm's weight count and wiring, FLY draw 1 the same twice, the floors,
a history to iteration 149 in every record); **the untrained builder of every arm scores the lean's number, to the bit** (the
start is the lean); and the gate re-audits two records an arm.

## 4. Expectations, written before the tool
T3: MORE about 40 percent, CANNOT BE TOLD APART about 35, LESS about 25. T0: MORE about 25, CANNOT about 55, LESS about 20.
T1: CANNOT BE TOLD APART about 80. T2: CANNOT about 70. The best arm's mean above 0.95: about 20 percent. Some builder with more
than 123 homes of 200: about 45 percent. **Why so unsure:** the trainer's noise (sigma 0.14 on every weight) makes every builder
it tries a NOISY lean, and it may only learn to be quiet; and the one order that is linear in what the builder sees -- prefer the
columns that need more -- may or may not be the order that helps.

## 5. What a reading would and would not mean
MORE: under this trainer a network can add something to the lean, and what it added can be looked at (the page plays any record).
LESS: this trainer cannot hold a good start; round 5 (the trainer's settings) is then the more pointed round. CANNOT: 150
iterations of this trainer leave the lean where it was. NOT, in any case: that a network can find the lean by itself (rounds 2
and 3), nor anything about the fly -- the wiring is one arm of five on a task its circuit has no part in.

## 6. The cost
Round 2 measured 10.2 minutes for 80 trainings on four processes. A builder at the lean places more blocks an episode and ends
some episodes early (a finished house), so about the same. The run is resumable.

## 7. The run (to be written; the gate never runs it and never gives the command the word `run`)
`node tools/ship/takeVoxelHomeLean.mjs run` -> `brain/voxelHomeLeanRound.jsonl`, committed byte for byte before it is read;
`node tools/ship/takeVoxelHomeLean.mjs read` prints the checks and the reading.
