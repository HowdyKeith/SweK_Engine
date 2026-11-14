# The voxel home, round 2: the same builders with a DRAWN choice (UNNUMBERED; REGISTERED 2026-11-14 BEFORE ITS TOOL IS WRITTEN AND BEFORE ANY SUCH BUILDER IS TRAINED)

Keith, 2026-11-14, offered the follow-up or the page after round 1: "Run the follow-up round first". Round 1
(`brain/VOXEL_HOME_WIP.md` section 10) found every trained arm's mean below a random builder's and no home built, and named the
likeliest cause: a network that NAMES one column for one observation can vary only through two noise inputs, and a random builder
is all variation. This round changes that one thing. No builder with a drawn choice has been trained: one timing probe ran 3
iterations on draw 901, which the round does not use, and its result was not looked at.

## 1. What is new, built and gated before this note (`brain/rl/buildEnv.mjs` `choice: "drawn"`, `tools/ship/buildEnv-selfcheck.mjs` section 3b)
The action is 36 numbers, one a column; the column is DRAWN, its chance proportional to exp(4 x its number), by the episode's own
stream. Everything else is round 1's environment: the plans, the 96 steps, the 40 observations, a block held up or refused.
**Measured on plans 1 to 200, with no network:** the same number for every column is the random builder (0.571 of a home, no
home); leaning to the columns the observation says are unfinished builds 0.919 and 128 homes of 200; leaning by how much each
still needs, 0.975 and 127. So what there is to learn is a lean that is nearly read off the observation.

## 2. The arms (round 1's, with 36 outputs)
| arm | units | recurrent edges | weights |
|---|---|---|---|
| FLY | 34 | the GFC's 313 | 40 x 34 + 34 + 313 + 34 x 36 + 36 = 2,967 |
| SHUF | 34 | 313, `shuffledEdges(34, 313, 7000 + s)` | 2,967 |
| PLAIN | 38 | none | 77 x 38 + 36 = 2,962 (5 fewer; 39 units would be 72 more) |
| FISH | 34 | the Fish1 core's 153 | 2,807 (described) |
| MLP | 16, 16 (tanh) | -- | 1,540 (described) |

The start of a draw is round 1's (every recurrent weight 0).

## 3. The recipe, the audit and the random builders: round 1's, unchanged
`trainDockES` with `BuildEnv({ maxSteps: 96, choice: "drawn" })`, `iters 150, pop 24, sigma 0.14, lr 0.05, trainEps 8, seed s`,
**s = 1 to 16 in every arm: 80 trainings, each once.** The audit: the 200 plans `700001 + 7919 k`; a draw's SCORE is its mean share
built, and beside it how many of the 200 are homes. **The 16 random builders are round 1's own** (columns from the generator
seeded `1000 + 7919 k`, on the named environment: a random builder is the same builder whichever way the choice is made).
Beside them, with no network: the lean to the unfinished columns, on the audit plans.

## 4. The three questions and the reading (round 1's tests and words; each read ONCE from the committed records; an exact two-sided rank-sum, 16 against 16, speaking at p <= 0.01, a tie counted against the claim)
* **T0: FLY against the 16 random builders.** `A FLY-WIRED BUILDER BUILDS MORE OF A HOME THAN A RANDOM ONE` / `...LESS...` /
  `...CANNOT BE TOLD APART FROM A RANDOM ONE`.
* **T1: FLY against SHUF.** `THE FLY'S WIRING BUILDS BETTER THAN A SHUFFLE OF IT` / `...WORSE...` / `...CANNOT BE TOLD APART...`.
* **T2: FLY against PLAIN.** The same words, `...A PLAIN NET OF ITS SIZE`.
* **Described beside them:** each arm's mean, sd, least and most; each arm's homes (summed over its draws, and its best draw's);
  FISH and MLP; the lean; each arm's untrained draw 1; round 1's arms from its own file.

## 5. Checks, made first; a failure is the first line and the reading is NOT WEIGHED
Round 1's: 80 records, each (arm, s) once, the recipe, each arm's weight count and wiring, FLY draw 1 the same twice, the 16 random
builders and the untrained draws there once; and the weights in a record give its score and homes again (the gate, two an arm).

## 6. Expectations, written before the tool (round 1's main guess was wrong, and these are lower for it)
T0: BUILDS MORE about 65 percent, CANNOT BE TOLD APART about 20, LESS about 15 (an untrained network's 36 numbers are not level,
so a draw may start below a random builder; whether 150 iterations find the lean is the question). T1: CANNOT BE TOLD APART about
75 percent. T2: FLY WORSE about 55 percent, CANNOT BE TOLD APART about 35. The best arm's mean above 0.75: about 40 percent. ANY
home among the 80 x 200 audit builds: about 50 percent. A FLY home: about 30 percent.

## 7. What a reading would and would not mean
With the choice drawn, under this trainer and budget: whether these networks learn to lean toward what the house still needs, how
much of a home that builds, and whether the fly's wiring is distinguishable from a shuffle or a plain net at it. NOT: that a fly
builds; anything about a longer training or another trainer; and a home built here is built by a lean plus chance -- the draw's
own stream decides each block.

## 8. The cost, measured on the probe
3 iterations took 0.74 s: about 37 s a training, 80 on four processes: about 13 minutes in the sandbox.

## 9. The run (to be written; the gate never runs it and never gives the command the word `run`)
`node tools/ship/takeVoxelHomeDrawn.mjs run` -> `brain/voxelHomeDrawnRound.jsonl`, committed byte for byte before it is read;
`node tools/ship/takeVoxelHomeDrawn.mjs read` prints the checks and the reading.
