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

## 8. The result (run 2026-11-14 in the sandbox, 14.3 minutes; `brain/voxelHomeLeanRound.jsonl` committed at 4636c841 before it was read; read once)
**The checks hold, and the start was the lean:** the untrained builder of every arm scores 0.9226, to the bit.

| arm | mean share built | sd | least | most | homes of 3,200 builds | a builder's homes of 200, mean | its best builder's |
|---|---|---|---|---|---|---|---|
| SHUF | 0.9879 | 0.0068 | 0.9647 | 0.9961 | 2,420 | 151 | 181 |
| FISH | 0.9887 | 0.0041 | 0.9758 | 0.9930 | 2,495 | 156 | 175 |
| PLAIN | 0.9892 | 0.0038 | 0.9765 | 0.9929 | 2,546 | 159 | 178 |
| FLY | 0.9894 | 0.0046 | 0.9753 | 0.9949 | 2,491 | 156 | 179 |
| MLP | 0.9924 | 0.0046 | 0.9771 | 0.9960 | 2,748 | 172 | 183 |
| the lean, no network (and every builder at iteration 0) | 0.9226 | | | | | 123 | |
| 16 random builders | 0.5722 | | | | 0 | | |

* **T3: A BUILDER STARTED AT THE LEAN BUILDS MORE THAN THE LEAN** (all 80 above it, none below, none equal; exact two-sided
  p 1.7e-24).
* **T0: A FLY-WIRED BUILDER STARTED AT THE LEAN BUILDS MORE THAN THE LEAN** (all 16 above; p 2 / 65536).
* **T1: THE FLY'S WIRING CANNOT BE TOLD APART FROM A SHUFFLE OF IT** (the ranks sum to 287, the middle 264; p 0.40). The fifth
  round to say so.
* **T2: THE FLY'S WIRING CANNOT BE TOLD APART FROM A PLAIN NET OF ITS SIZE** (275; p 0.70).

**They finish houses.** 12,700 homes in 16,000 builds, where rounds 1 to 3 finished 2 in 48,000. 78 of the 80 builders finish
more of the 200 plans than the lean's 123; the least finishes 115, the best 183 (MLP draw 2).

**The learning was quick and was still going, slowly.** The trainer's own battery, share of the plan missing, mean of an arm's
16 draws:

| arm | iteration 0 | 25 | 50 | 75 | 100 | 125 | 149 |
|---|---|---|---|---|---|---|---|
| FLY | 0.1265 | 0.0358 | 0.0240 | 0.0170 | 0.0148 | 0.0125 | 0.0103 |
| SHUF | 0.1220 | 0.0412 | 0.0267 | 0.0208 | 0.0162 | 0.0152 | 0.0140 |
| PLAIN | 0.1259 | 0.0192 | 0.0173 | 0.0144 | 0.0118 | 0.0132 | 0.0125 |
| FISH | 0.1370 | 0.0289 | 0.0215 | 0.0191 | 0.0169 | 0.0152 | 0.0139 |
| MLP | 0.1376 | 0.0198 | 0.0121 | 0.0109 | 0.0086 | 0.0087 | 0.0094 |

(Iteration 0 is after the trainer's first move, already off the lean.)

**What they learned -- LOOKED AT AFTER THE READING, NOT REGISTERED.** On the first 50 audit plans the lean spends 23.8 picks a
build asking for a block that would hang in the air; FLY draw 1 spends 5.3. Its network holds back the columns that need a
single block -- the roof over the room, which cannot go in until a wall or a roof block beside it is there (0.30 where the lean
says 1) -- and favours the columns that are part built (0.75 and 0.86 for those needing a half and three quarters) over those
needing everything (0.46). That is an order, and it is one the builder can read off what it sees. Two other builders looked at
(MLP draw 2, PLAIN draw 5) show the same shape. The price is picks at finished columns (the network lifts them from -1 toward
0): 7.5 a build for FLY draw 1 where the lean has almost none.

**The expectations against what came.** T3 MORE (40) and T0 MORE (25): both came, and I had given them less than an even
chance. T1 (80) and T2 (70) CANNOT BE TOLD APART: both came. The best arm above 0.95 (20): every arm is above 0.98. A builder
with more than 123 homes (45): 78 of 80. **My reason for doubt was wrong:** I wrote that the trainer's noise "may only learn to
be quiet"; it learned an order within 25 iterations.

**What this does and does not say** (section 5). Under this trainer a small network can add a building order to the lean, and
does so whichever of the five it is. It does NOT say a network can find the lean (rounds 2 and 3: a third of the way), so the
whole builder is still "the lean, which a person wrote, corrected". And nothing here is about the fly: its wiring is one arm of
five and cannot be told from a shuffle of itself.
