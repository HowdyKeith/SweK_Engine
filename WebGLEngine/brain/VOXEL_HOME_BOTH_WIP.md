# The voxel home, round 6: the two together -- started at the lean, with four times the builders tried (UNNUMBERED; REGISTERED 2026-11-14 BEFORE ITS TOOL IS WRITTEN AND BEFORE ANY SUCH TRAINING IS RUN)

Keith, 2026-11-14, of three open items (the fly escapes; the page plays round 4's builders; both improvements together):
"Let's do all 3". This is the third. Round 4 (`brain/VOXEL_HOME_LEAN_WIP.md` section 8): a builder that is the lean plus its
network, the network's output layer started at zero, builds 0.988 to 0.992 of a home by arm and finishes 151 to 172 of the 200
audit plans (the lean alone: 0.9226 and 123). Round 5 (`brain/VOXEL_HOME_STEPS_WIP.md` section 9): from a random start, 96
builders tried an iteration for 24 builds 0.048 to 0.055 more. Nothing has been trained with both; no code of this round exists.

## 1. What is the same and what changes
Round 4's, to the number: the drawn environment, the lean start (`brain/rl/leanStart.mjs`), the five arms and their weight
counts, draws s = 1 to 16, `iters 150, sigma 0.14, lr 0.05, trainEps 8`, 96 steps, the 200 audit plans, the history in each
record. **Changed: `pop 96`** (round 4: `pop 24`). A draw starts from the same weights; its noise stream is the same generator
drawn four times as far each iteration.

## 2. The questions and the reading (each read ONCE from the committed records; alpha 0.01, two-sided, a tie counted against the claim)
* **P3, every builder against its round 4 self** -- a SIGN test over the 80 pairs (the same arm, the same draw): how many score
  strictly above their round 4 builder on the same 200 plans, how many strictly below; the exact two-sided binomial (n = 80). It
  speaks at 52 or more on one side. Words: `FROM THE LEAN, MORE BUILDERS TRIED BUILDS MORE OF A HOME` /
  `FROM THE LEAN, MORE BUILDERS TRIED BUILDS LESS OF A HOME` / `FROM THE LEAN, MORE BUILDERS TRIED CANNOT BE TOLD APART FROM ROUND 4'S`.
* **P0, the fly-wired builders against round 4's** -- the exact rank-sum, 16 against 16; the same three words with
  `A FLY-WIRED BUILDER, ` before them.
* **T0 and T3 against the lean, T1 (FLY against SHUF), T2 (FLY against PLAIN)** -- round 4's four, with round 4's words, kept so
  the record is complete.
* Described, not tested: each arm's mean and its homes beside round 4's; how many builders finish more of the 200 plans than
  their round 4 selves; the history.

**Said before the run: the score has little room left.** Round 4's builders stand at 0.99 of 1, so a real gain can be at most a
hundredth of a home; the homes finished (156 of 200 on average, room to 200) will show more than the score does, and they are
described, not tested, because the score is the measure every round has registered.

## 3. Checks, made first; a failure is the first line and the reading is NOT WEIGHED
Round 4's (80 records, each once, this round's recipe, each arm's weight count and wiring, FLY draw 1 the same twice, the floors,
a history to iteration 149, the untrained builder of every arm scoring the lean's number to the bit); round 4's file holds its 80
draws, each once; and the gate re-audits two records an arm.

## 4. Expectations, written before the tool
P3: MORE about 65 percent, CANNOT BE TOLD APART about 30, LESS about 5. P0: MORE about 45, CANNOT about 50. T0 and T3 against
the lean: MORE about 97. T1 and T2: CANNOT about 80 each. The mean homes a builder finishes, over all 80, above 170 of 200
(round 4: 159): about 50 percent; above 185: about 12. A builder that finishes all 200: about 5.

## 5. What a reading would and would not mean
Whether the gain round 5 measured from a random start is also there when the start is good. NOT: that this is the best a builder
can do (the rule finishes every plan); nor anything about the fly's wiring.

## 6. The cost
Round 4 measured 14.3 minutes for 80 trainings on four processes; four times the builders is about an hour. The run is
resumable.

## 7. The run (to be written; the gate never runs it and never gives the command the word `run`)
`node tools/ship/takeVoxelHomeBoth.mjs run` -> `brain/voxelHomeBothRound.jsonl`, committed byte for byte before it is read;
`node tools/ship/takeVoxelHomeBoth.mjs read` prints the checks and the reading.
