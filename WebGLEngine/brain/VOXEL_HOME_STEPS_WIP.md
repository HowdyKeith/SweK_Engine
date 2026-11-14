# The voxel home, round 5: why the learning levels -- the trainer's step and its samples (UNNUMBERED; REGISTERED 2026-11-14 BEFORE ITS TOOL IS WRITTEN AND BEFORE ANY SUCH TRAINING IS RUN, AND BEFORE ROUND 4'S RESULTS EXIST)

Keith, 2026-11-14: "Let's work through those. Let's do 1 and 2". This is 2 (backlog `voxel-home-trainer`, `smaller-steps` and
`more-samples`). Round 3 (`brain/VOXEL_HOME_LONG_WIP.md` section 8): on the trainer's own battery every arm's share missing falls
0.17 to 0.19 in the first 166 iterations and 0.016 to 0.033 in the 833 after; the best arm stands 0.375 of the way from a random
builder to the lean. This round asks which of two things about the TRAINER that is. No code of this round exists and nothing has
been trained with either setting; round 4 (`brain/VOXEL_HOME_LEAN_WIP.md`) is registered and not yet run as this is written.

## 1. What the trainer does, read from its source before this note (`brain/rl/dockPolicy.js` `trainDockES`), and it changes what "smaller steps" means
Each iteration it tries `pop` builders (the weights plus and minus `sigma` x noise, in pairs), scores each on `trainEps` plans,
**standardises the scores** (subtracts their mean, divides by their spread), and moves every weight by
`lr / (pop x sigma) x sum(standardised score x noise)`. Because the scores are standardised, **the size of the move does not
depend on how much the builders differed**: with no signal at all each weight still moves about `lr / (sigma x sqrt(pop))` an
iteration -- at round 2's `lr 0.05, sigma 0.14, pop 24` that is about 0.073, where a builder's starting weights are at most 0.16.
Over 150 iterations with no signal that is a random walk of about 0.9 a weight. **So a smaller `sigma` makes the steps LARGER,
not smaller**, and the backlog's "sigma 0.14 -> a smaller one" was the wrong knob: the step is `lr`.
It also keeps, and returns, the weights that scored best on a fixed battery of 24 plans (best of all iterations). Said so that
it is known; this round does not change it.

## 2. What is the same and what changes
The same as round 2: the drawn environment, a random start (round 2's builders, weight for weight), draws s = 1 to 16, 150
iterations, `sigma 0.14, trainEps 8`, 96 steps, the 200 audit plans. **Two arms only: FLY and PLAIN** (the wiring question is set
aside; PLAIN is kept so that a finding is not one arm's). Each record carries the trainer's history.

Two settings, each ONE number from round 2's `lr 0.05, pop 24`:
| setting | the change | the no-signal move a weight, an iteration | cost against round 2 |
|---|---|---|---|
| **SMALL** | `lr 0.0125` (a quarter) | about 0.018 (a quarter) | the same |
| **MANY** | `pop 96` (four times the builders tried an iteration) | about 0.036 (a half), from four times the evidence | four times |
| control | round 2's own records for FLY and PLAIN, from `brain/voxelHomeDrawnRound.jsonl` (not trained again) | 0.073 | none |

## 3. The four questions and the reading (each read ONCE from the committed records; an exact two-sided rank-sum, 16 against 16, speaking at p <= 0.01, a tie counted against the claim)
For each setting and each arm, this round's 16 builders against round 2's 16 of that arm:
* **S-FLY, S-PLAIN** (SMALL): `A SMALLER STEP BUILDS MORE OF A HOME` / `A SMALLER STEP BUILDS LESS OF A HOME` /
  `A SMALLER STEP CANNOT BE TOLD APART FROM ROUND 2'S`.
* **M-FLY, M-PLAIN** (MANY): `MORE BUILDERS TRIED BUILDS MORE OF A HOME` / `MORE BUILDERS TRIED BUILDS LESS OF A HOME` /
  `MORE BUILDERS TRIED CANNOT BE TOLD APART FROM ROUND 2'S`.
Four tests at 0.01 each, not corrected for being four; said here.
Described, not tested: each cell's mean and homes, the history (the share missing along the way) beside round 3's, how far each
cell stands from a random builder to the lean, SMALL against MANY.

## 4. Checks, made first; a failure is the first line and the reading is NOT WEIGHED
64 records (2 settings x 2 arms x 16 draws), each once; each setting's recipe; each arm's weight count and wiring; FLY draw 1 of
SMALL the same trained twice; a history to iteration 149 in every record; round 2's file holds its 16 FLY and 16 PLAIN draws;
and the gate re-audits two records a cell.

## 5. Expectations, written before the tool
MANY builds more than round 2 (either arm): about 70 percent; both arms: about 55. SMALL builds more: about 35 percent, LESS about
30 (a quarter of the step for the same 150 iterations may simply not get there), cannot tell about 35. The best cell's mean
above 0.75: about 35 percent; above 0.85: about 8. Any home: about 30 percent. If neither setting builds more: about 20 percent,
and then the plateau is not the step or the sample and the next suspect is the reward or the builder's 36-number action.

## 6. What a reading would and would not mean
Whether, for these builders on this task, round 2's trainer was held back by its step (SMALL) or by how little it tried each
iteration (MANY). NOT: the best setting (two points are not a search); nor anything about the fly's wiring (T1 is not asked);
nor what a longer run at either setting would do -- 150 iterations each, so SMALL is also "a quarter of the distance".

## 7. The cost
Round 2 measured 10.2 minutes for 80 trainings on four processes: SMALL's 32 trainings about 4 minutes, MANY's 32 about 16.
The run is resumable.

## 8. The run (to be written; the gate never runs it and never gives the command the word `run`)
`node tools/ship/takeVoxelHomeSteps.mjs run` -> `brain/voxelHomeStepsRound.jsonl`, committed byte for byte before it is read;
`node tools/ship/takeVoxelHomeSteps.mjs read` prints the checks and the reading.
