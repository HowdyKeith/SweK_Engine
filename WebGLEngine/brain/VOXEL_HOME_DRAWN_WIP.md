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

## 10. The result (run 2026-11-14 in the sandbox, 10.2 minutes; `brain/voxelHomeDrawnRound.jsonl` committed at 1f5e0ec3 before it was read; read once)
**The checks hold.**

| arm | mean share built | sd | least | most | homes (16 x 200 builds) | round 1 (named) |
|---|---|---|---|---|---|---|
| SHUF | 0.6612 | 0.0213 | 0.6069 | 0.6811 | 0 | 0.4339 |
| FLY | 0.6664 | 0.0174 | 0.6351 | 0.6874 | 0 | 0.4295 |
| FISH | 0.6741 | 0.0206 | 0.6228 | 0.7074 | 0 | 0.4965 |
| MLP | 0.6892 | 0.0139 | 0.6655 | 0.7153 | 0 | 0.5624 |
| PLAIN | 0.6905 | 0.0143 | 0.6649 | 0.7088 | 0 | 0.5536 |
| 16 random builders | 0.5722 | 0.0028 | | 0.5774 | 0 | |
| the lean to the unfinished columns, no network | 0.9226 | | | | 123 of 200 | |
| the rule | 1 | | | | every plan | |

* **T0: A FLY-WIRED BUILDER BUILDS MORE OF A HOME THAN A RANDOM ONE** (all 16 above all 16; exact two-sided p 3.3e-9). Round 1's
  reading, turned over by the one change.
* **T1: THE FLY'S WIRING CANNOT BE TOLD APART FROM A SHUFFLE OF IT** (p 0.47).
* **T2: THE FLY'S WIRING BUILDS WORSE THAN A PLAIN NET OF ITS SIZE** (p 0.00027; 0.666 against 0.691).
* **Against the expectations:** the three tests came as guessed (65, 75 and 55 percent). The best arm's mean above 0.75 (40 percent)
  did not come: 0.69. A home (50 percent; a FLY home 30) did not come: none in 16,000 audit builds.

**The answer to Keith's question, said plainly: it learns to build about two thirds of a house, and never finishes one.** Every one
of the 80 trained builders beats every random builder, the fly-wired ones included, so round 1's failure was the way the choice was
made and not the networks. But the trained builders closed only about a third of the way from a random builder (0.57) to a lean
that needs no network at all (0.92, 123 homes): what there is to learn is nearly written in the observation, and 150 iterations
of this trainer found a part of it. The wiring finding is the third of its kind: where the 313 synapses are makes no difference,
and the arms that have recurrent synapses sit below the two that have none.

**Not tested, each a round of its own:** a longer training (the obvious next: nothing here says the curve had flattened); a smaller
sigma on the synapses; starting a builder AT the lean and asking what training adds. The gate holds every number above from the
two results files (`tools/ship/voxelHomeDrawn-selfcheck.mjs` section 5).
