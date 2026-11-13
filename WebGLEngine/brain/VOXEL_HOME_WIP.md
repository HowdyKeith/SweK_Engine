# The voxel home, round 1: how much of a home does a fly-wired builder build, and does its wiring matter? (UNNUMBERED; REGISTERED 2026-11-13 BEFORE ITS TOOL IS WRITTEN AND BEFORE ANY BUILDER IS TRAINED)

Keith, 2026-11-12: "Could it build a home in a vowel [voxel] world?" and, 2026-11-13: "Let's do voxel home." (backlog `voxel-home`,
`brain/BACKLOG_2026-11-12_BRAIN_PROJECTS.md`). The environment is built and gated (`brain/rl/buildEnv.mjs`,
`tools/ship/buildEnv-selfcheck.mjs`, commit before this note); this note registers the training round on it. No builder has been
trained: one timing probe ran 3 iterations of the trainer on draw 901, which the round does not use, and its result was not looked at.

## 1. What exists, read from the files and not recalled
* **The environment** (`BuildEnv`): a 6 x 6 site in the voxel world; the plan is a hollow house of the tree's building grammar (50 to
  94 blocks: walls three high, a roof, glass windows, a door); 96 steps; the policy chooses a COLUMN (2 action numbers) and the block
  and its height are the plan's; a block must be held up; the observation is 40 numbers (each column's missing share, the plan's
  missing share, the step, two noise draws). **Measured by its gate on plans 1 to 200:** the rule "the first column whose next block
  can be placed" builds a home every time, in exactly the plan's number of steps; choosing columns at random builds a mean share
  of 0.573 of the plan and never a home.
* **The trainer and the networks** are the painting round's (`brain/PAINTING_FLY_WIP.md`): `trainDockES` with its policy factory,
  `brain/rl/paintCircuitPolicy.mjs`'s `CircuitPolicy` and `shuffledEdges`. That round found the fly's wiring indistinguishable from a
  shuffle of it and about 3 percent WORSE than a plain net of its size, on a task where every trained net was within 11 percent of
  a random one. This task has more room: 0.573 at random, 1 by rule.

## 2. The arms (the first four one form: 40 inputs -> relu encoder -> H units -> three weight-tied steps over the arm's edges -> linear -> tanh, 2 outputs)
| arm | units | recurrent edges | weights | what it is |
|---|---|---|---|---|
| FLY | 34 | the GFC's 313 | 40 x 34 + 34 + 313 + 34 x 2 + 2 = 1,777 | the fly's wiring |
| SHUF | 34 | 313 at places drawn for the draw: `shuffledEdges(34, 313, 7000 + s)` | 1,777 | the same parts, the wiring shuffled |
| PLAIN | 41 | none | 43 x 41 + 2 = 1,765 | a plain net of about the fly's weight count (12 fewer; 42 units would be 31 more) |
| FISH | 34 | the Fish1 core's 153 | 1,617 | described, not tested |
| MLP | 16, 16 (tanh) | -- | 962 | the tree's `FlightPolicy`, described, not tested |

The start of a draw is the painting round's: encoder and decoder uniform by `FlightPolicy`'s rule from `mulberry32(s)`, every bias
and EVERY RECURRENT WEIGHT 0.

## 3. The recipe (the painting round's, tuned for no arm and not for this task)
`trainDockES` with `BuildEnv({ maxSteps: 96 })`, `iters 150, pop 24, sigma 0.14, lr 0.05, trainEps 8, seed s`, **s = 1 to 16 in
every arm: 80 trainings, each once.** A draw's builder is what the trainer returns (its best on its own 24 plans, seeds
`5000 + 17 k`). **The audit:** 200 plans no trainer sees, seeds `700001 + 7919 k`. A draw's SCORE is the mean share of the plan
built in 96 steps; beside it, HOW MANY OF THE 200 ARE HOMES (`homeCheck`: every block, roofed, a door, the room closed but for it).
**The random builders:** 16 of them, columns from the gate's generator seeded `1000 + 7919 k`, k = 0 to 15, on the audit plans.

## 4. The three questions and the reading (each read ONCE, from the committed records; an exact two-sided rank-sum, 16 against 16, speaking at p <= 0.01, a tie counted against the claim -- the painting round's test)
* **T0 (does it learn to build): FLY against the 16 random builders.** `A FLY-WIRED BUILDER BUILDS MORE OF A HOME THAN A RANDOM ONE`
  / `...BUILDS LESS...` / `...CANNOT BE TOLD APART FROM A RANDOM ONE`.
* **T1 (the wiring): FLY against SHUF.** `THE FLY'S WIRING BUILDS BETTER THAN A SHUFFLE OF IT` / `...WORSE...` / `...CANNOT BE TOLD
  APART FROM A SHUFFLE OF IT`.
* **T2 (the recurrence at this size): FLY against PLAIN.** The same words, `...A PLAIN NET OF ITS SIZE`.
* Three tests at 0.01: at most 0.03 that one speaks by chance.
* **Described beside them, no test:** each arm's mean, sd, least and most share; each arm's homes (the sum over its 16 draws of
  homes among 200, and its best draw's); FISH and MLP; the rule (200 homes of 200 by the gate); each arm's untrained draw 1.

## 5. Checks, made first; a failure is the first line of the report and the reading is NOT WEIGHED
80 records, every (arm, s) once; each carries the recipe and its arm's weight count and wiring (a SHUF draw's 313 distinct
off-diagonal pairs, not the GFC's); the weights in a record give its score again (two records an arm, re-audited by the gate);
FLY draw 1 trained a second time gives the same weights; the 16 random builders and the untrained draws are there once.

## 6. Expectations, written before the tool
T0: BUILDS MORE about 85 percent (0.573 leaves room and the column shares are in the observation). T1: CANNOT BE TOLD APART about
80 percent. T2: FLY WORSE about 50 percent, CANNOT BE TOLD APART about 40 (the painting round's reason: sigma 0.14 on 313 synapses,
three times over). The best arm's mean share between 0.65 and 0.85: about 60 percent; above 0.85: about 15. ANY home at all among
the 80 x 200 audit builds: about 35 percent -- a home needs every block, and 96 steps leave 2 to 46 to waste. So the likeliest
answer to Keith's question is: it learns to build most of a house and does not finish one.

## 7. What a reading would and would not mean
Under this trainer and budget, on this family of plans, with the block and its height given by the plan: how much a net wired as the
fly's escape circuit learns of an order of building, and whether where its synapses are matters. NOT: that a fly builds, plans or
knows a house; anything about a builder that must choose its material or its height; a longer training or another trainer. A
three-line rule builds every home, so nothing here is hard for a program -- the question is only what these networks learn.

## 8. The cost, measured on the probe
3 iterations took 0.5 s: about 25 s a training, 80 trainings on four processes: about 10 minutes in the sandbox.

## 9. The run (to be written; the gate never runs it and never gives the command the word `run`)
`node tools/ship/takeVoxelHome.mjs run` -> `brain/voxelHomeRound.jsonl`, committed byte for byte before it is read;
`node tools/ship/takeVoxelHome.mjs read` prints the checks and the reading.

## 10. The result (run 2026-11-13 in the sandbox, 6.6 minutes; `brain/voxelHomeRound.jsonl` committed at 108df706 before it was read; read once)
**The checks hold.**

| arm | mean share built | sd | least | most | homes (16 x 200 builds) |
|---|---|---|---|---|---|
| FLY | 0.4295 | 0.0386 | 0.3729 | 0.5067 | 0 |
| SHUF | 0.4339 | 0.0362 | 0.3964 | 0.5323 | 0 |
| FISH | 0.4965 | 0.0507 | 0.3784 | 0.5836 | 0 |
| PLAIN | 0.5536 | 0.0408 | 0.4498 | 0.6181 | 0 |
| MLP | 0.5624 | 0.0335 | 0.4767 | 0.6032 | 0 |
| 16 random builders | 0.5722 | 0.0028 | 0.5681 | 0.5774 | 0 |
| the rule | 1 | | | | every plan |

* **T0: A FLY-WIRED BUILDER BUILDS LESS OF A HOME THAN A RANDOM ONE** (all 16 below all 16 random builders; exact two-sided p 3.3e-9).
* **T1: THE FLY'S WIRING CANNOT BE TOLD APART FROM A SHUFFLE OF IT** (p 0.78).
* **T2: THE FLY'S WIRING BUILDS WORSE THAN A PLAIN NET OF ITS SIZE** (p 6.3e-8).
* **Against the expectations: THE MAIN ONE WAS WRONG.** T0 was guessed BUILDS MORE at 85 percent. T1 and T2 came as guessed. The best
  arm's mean was guessed 0.65 to 0.85 and is 0.56. No home was built (guessed: 35 percent that one would be).

**The answer to Keith's question, said plainly: no, not with this training.** No arm's mean reaches what choosing columns at random
builds. Of the 80 trained builders 9 are above every random builder (5 MLP, 3 PLAIN, 1 FISH; the best 0.618) and 66 are below every
one. Nobody built a home; a three-line rule builds every one. The training did move the networks -- an untrained one names nearly
the same column every step and builds about 0.011 of a home -- so what each learned is to SPREAD its choices, toward what random
choice does and not past it. The order of the arms is the painting round's, larger: the more recurrent synapses, the less built
(FLY and SHUF 313, FISH 153, PLAIN and MLP none), and where the synapses are makes no difference.

**What this does not say:** that such a network cannot learn to build. Not tested here, each a round of its own: a builder whose
choice is DRAWN (a network that names one column for one observation can only vary through the two noise inputs, and a random
builder is all variation); a longer training; a smaller sigma on the synapses; an action that names a block's neighbour and not
a column. The gate holds every number above from the file (`tools/ship/voxelHome-selfcheck.mjs` section 5).
