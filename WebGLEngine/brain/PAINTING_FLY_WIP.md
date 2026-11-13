# The painting fly, round 1: does the fly's wiring paint differently from a shuffle of it, or from a plain net of its size? (UNNUMBERED; REGISTERED 2026-11-13 BEFORE ANY OF ITS CODE IS WRITTEN AND BEFORE ANY PAINTER IS TRAINED)

Keith, 2026-11-12: "Could the fruit fly brain express itself by painting? We have ai painting code." and, 2026-11-13, of the backlog
`brain/BACKLOG_2026-11-12_BRAIN_PROJECTS.md` (`painting-fly`): "Start with the painting fly". This note is the registration of the
one comparison that topic can make; the engineering beside it (the policy, the trainer's hook, the self-portrait) is gated, not
registered. Nothing below has been run: no fly-wired painter exists yet, and none has been trained.

## 1. What exists, read from the files and not recalled
* **The environment** (`brain/rl/paintEnv.js`, `PaintEnv`): a 32 x 32 canvas, 20 steps, one rotated rectangle a step (5 action
  numbers), the colour solved exactly by `fx/primitiveFit.mjs`, a shape that makes the picture worse not drawn. The observation is
  20 numbers (a 4 x 4 grid of the residual, the distance, the step fraction, two noise draws from the episode's seed). Targets are
  `makeTarget`'s: four flat quadrants and a disc.
* **The trainer** (`brain/rl/dockPolicy.js`, `trainDockES`): a natural evolution strategy with antithetic pairs. It builds its own
  policy, `FlightPolicy` (a tanh MLP), and cannot be handed another: `tools/ship/primitiveFit-selfcheck.mjs` section 8 trains the
  20-16-16-5 MLP (693 weights) with `iters 150, pop 24, sigma 0.14, lr 0.05, trainEps 8, seed 3` and holds it to more than 3 sd
  above eight random painters, and to BELOW a random search given 90 evaluations a shape.
* **The fly's network, as the tree flies it** (`brain/pilot6dofPolicy.mjs`): features through a relu encoder into the 34 neurons of
  the male-CNS Giant Fiber Circuit (`brain/gfcTopology.mjs`), three weight-tied steps of `h <- relu((I + W) h)` where W has a weight
  only where a real synapse is (313 of them, none on the diagonal), a linear decoder, tanh.
* **The fish core** (`brain/zebrafishTopology.mjs`): 34 neurons, 153 synapses, none on the diagonal.

## 2. The arms (one form for the first four: 20 inputs -> relu encoder -> H units -> three weight-tied steps over the arm's edges -> linear -> tanh, 5 outputs)
| arm | units | recurrent edges | weights | what it is |
|---|---|---|---|---|
| FLY | 34 | the GFC's 313 | 20 x 34 + 34 + 313 + 34 x 5 + 5 = 1,202 | the fly's wiring |
| SHUF | 34 | 313, at places drawn anew for each draw | 1,202 | the same parts, the wiring shuffled: 313 distinct ordered pairs (to, from), to != from, the first 313 of a Fisher-Yates shuffle of the 1,122 off-diagonal pairs by `mulberry32(7000 + s)` |
| PLAIN | 46 | none | 20 x 46 + 46 + 46 x 5 + 5 = 1,201 | a plain net of the fly's weight count (one weight fewer: 26 H + 5 has no whole answer at 1,202) |
| FISH | 34 | the Fish1 core's 153 | 1,042 | described, not tested |
| MLP | 16, 16 (tanh) | -- | 693 | the tree's own painter (`FlightPolicy`), described, not tested |

**The start of every draw of the first four arms:** the encoder's weights uniform in +-sqrt(1/20) and the decoder's in +-sqrt(1/H)
(the rule `FlightPolicy` uses), every bias 0, EVERY RECURRENT WEIGHT 0 (the house's identity start), drawn in that order from
`mulberry32(s)`. The weights lie `[encoder][its bias][recurrent, in the edge list's order][decoder][its bias]`.

## 3. The recipe (the gate's own, chosen for the MLP before this round and tuned for no arm here)
`trainDockES` with `PaintEnv({ maxSteps: 20 })`, `iters 150, pop 24, sigma 0.14, lr 0.05, trainEps 8, seed s`, for **s = 1 to 16 in
every arm: 80 trainings, each once.** A draw's painter is what the trainer returns (its best on its own 24-picture battery, seeds
`5000 + 17 k`). The trainer gets ONE change, made and gated before the run: an optional policy factory, without which it is what it
was to the bit.

**The audit:** 200 pictures no trainer sees, seeds `700001 + 7919 k`, k = 0 to 199. A draw's SCORE is the mean over them of
(the distance at the start - the distance after 20 steps), the gate's "improvement".

## 4. The two questions and the reading (each read ONCE, from the committed records)
* **T1 (the wiring): FLY against SHUF.** The 16 FLY scores against the 16 SHUF scores, an exact two-sided rank-sum test.
  **`THE FLY'S WIRING PAINTS BETTER THAN A SHUFFLE OF IT`** iff p <= 0.01 with the fly's ranks the higher; **`...PAINTS WORSE
  THAN A SHUFFLE OF IT`** iff the mirror; otherwise **`THE FLY'S WIRING CANNOT BE TOLD APART FROM A SHUFFLE OF IT`**.
* **T2 (the recurrence at this size): FLY against PLAIN.** The same test, the words `...THAN A PLAIN NET OF ITS SIZE`.
* Two tests at 0.01 each: at most 0.02 that one speaks by chance. With 16 against 16 the test speaks when the lower arm's ranks sum to 196
  or less (the least possible is 136, the middle 264; exact two-sided p 0.00955 at 196, counted before this was committed; the gate
  holds the count).
* **A tie between arms** (two scores equal to the bit) is counted AGAINST the claim being tested, each way.
* **Described beside them, no test:** each arm's mean, sd, least and most; FISH and MLP; eight random painters on the audit
  pictures (the gate's generator and seeds); the random search at 90 evaluations a shape on the first 24 audit pictures; each
  arm's untrained draw 1.

## 5. Checks, made first; a failure is the first line of the report and the reading is NOT WEIGHED
80 records, every (arm, s) once; every record carries the recipe above and its arm's weight count; a SHUF record's edge list is
313 distinct off-diagonal pairs and is not the GFC's; the weights in a record give its score again (two records an arm, re-audited
by the gate); FLY draw 1 trained a second time by the run gives the same weights to the bit.

## 6. Expectations, written before any code
T1: CANNOT BE TOLD APART about 75 percent, BETTER about 10, WORSE about 15 (every earlier round here found a wiring an ordinary
one of its kind). T2: CANNOT BE TOLD APART about 55 percent, FLY WORSE about 30 (46 units against 34, and noise of sigma 0.14 on
313 recurrent weights applied three times is noise the plain net does not carry), BETTER about 15. Every trained arm above the
random painters: about 85 percent. No arm above the random search at 90 evaluations: about 90 percent. FISH between PLAIN and
FLY in the mean: about 40 percent (no reason to place it).

## 7. What a reading would and would not mean
It would mean: under THIS trainer and THIS budget (150 iterations: a difference in how fast an arm learns and in where it ends are
not separated), on `makeTarget`'s family of pictures, the fly's wiring is or is not distinguishable from a shuffle of it, and from
a plain net of its size. It would NOT mean anything about other pictures, a longer training, another trainer, or the fly: the
synapse strengths are trained and the units are rate units. And NO READING HERE IS ABOUT EXPRESSION: `PaintEnv` rewards matching a
target picture, so a painter trained on it copies.

## 8. The cost, said now and not yet measured
The gate's one MLP training takes about 15 s of its 20; the circuit arms cost more a step. A guess of 30 to 90 s a training, 80
trainings on four processes: 10 to 30 minutes in the sandbox. No rig is needed.

## 9. The run (to be written; the gate never runs it)
`node tools/ship/takePaintingFly.mjs run` -> `brain/paintingFlyRound.jsonl`, one record a training (resumable), committed byte for
byte before it is read; `node tools/ship/takePaintingFly.mjs read` prints the checks and the reading.

## 10. The result (run 2026-11-13 in the sandbox, 6.8 minutes; `brain/paintingFlyRound.jsonl` committed at 0abaffea before it was read; read once)
**The checks hold** (80 draws, each once; the recipe; each arm's weight count and wiring; FLY draw 1 the same twice).

| arm | mean | sd | least | most |
|---|---|---|---|---|
| FLY | 0.06919 | 0.00200 | 0.06370 | 0.07180 |
| SHUF | 0.06893 | 0.00168 | 0.06618 | 0.07098 |
| PLAIN | 0.07107 | 0.00059 | 0.06996 | 0.07203 |
| FISH | 0.06974 | 0.00125 | 0.06793 | 0.07213 |
| MLP | 0.07097 | 0.00078 | 0.06875 | 0.07222 |

* **T1: THE FLY'S WIRING CANNOT BE TOLD APART FROM A SHUFFLE OF IT** (the fly's ranks sum to 280, the middle 264; exact two-sided p 0.5641).
* **T2: THE FLY'S WIRING PAINTS WORSE THAN A PLAIN NET OF ITS SIZE** (the fly's ranks sum to 182, and 196 or less speaks; p 0.00144).
* **Beside the floors:** eight random painters close 0.06512 +- 0.00042, and the best arm's mean is 9 percent above that; 79 of the 80
  draws are above the random painters' mean (FLY draw 5 is below it). The random search at 90 evaluations a shape closes 0.13944,
  about twice the best draw. An untrained painter closes about 0.005.
* **Against the expectations:** T1 was the 75 percent guess. T2's WORSE was the 30 percent guess, not the favourite. Every arm above
  the random painters in the mean, none near the random search, and the FISH between the PLAIN and the FLY: as guessed.

**What it means, and no more:** under this trainer and this budget, on these pictures, WHERE the 313 synapses are makes no
difference that 16 draws can see, and HAVING them costs about 3 percent against a plain net of the same weight count. The two arms
with no recurrent weights (PLAIN, MLP) lead and vary about a third as much from draw to draw; the three with them (FLY, SHUF, FISH)
sit together below. That fits the reason written in section 6 before the run (noise of sigma 0.14 on recurrent weights applied three
times is noise a plain net does not carry), and this round did not test that reason: a smaller sigma on the synapses, or a longer
training, is a different round. NOT REGISTERED, so not a reading: the FLY against the MLP looks the same as against the PLAIN.
All of it is small beside the task: every trained painter here is within 11 percent of a random one, and half a random search.
The gate holds every number above from the file (`tools/ship/paintingFly-selfcheck.mjs` section 6).
