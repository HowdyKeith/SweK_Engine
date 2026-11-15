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

## 8. The result (run 2026-11-14 in the sandbox, 81.1 minutes beside another round's run; `brain/voxelHomeBothRound.jsonl` committed at 248bae41 before it was read; read once)
**The checks hold, and the start was the lean** (every arm's untrained builder 0.9226, to the bit).

| arm | mean share built | sd | least | most | homes of 3,200 builds | round 4 (24 tried) | round 4's homes |
|---|---|---|---|---|---|---|---|
| SHUF | 0.9971 | 0.0006 | 0.9953 | 0.9978 | 2,991 | 0.9879 | 2,420 |
| FLY | 0.9973 | 0.0003 | 0.9969 | 0.9978 | 3,009 | 0.9894 | 2,491 |
| PLAIN | 0.9973 | 0.0004 | 0.9968 | 0.9980 | 3,010 | 0.9892 | 2,546 |
| FISH | 0.9973 | 0.0004 | 0.9962 | 0.9978 | 3,006 | 0.9887 | 2,495 |
| MLP | 0.9973 | 0.0004 | 0.9967 | 0.9980 | 3,007 | 0.9924 | 2,748 |
| the lean, no network | 0.9226 | | | | 123 of 200 | | |

* **P3: FROM THE LEAN, MORE BUILDERS TRIED BUILDS MORE OF A HOME** (79 of the 80 above their round 4 selves, 1 below -- SHUF
  draw 4; exact two-sided p 1.3e-22).
* **P0: A FLY-WIRED BUILDER, FROM THE LEAN, MORE BUILDERS TRIED BUILDS MORE OF A HOME** (all 16 above all 16 of round 4's; the
  ranks sum to 392; p 3.3e-9).
* **T0: A FLY-WIRED BUILDER STARTED AT THE LEAN BUILDS MORE THAN THE LEAN** (16 of 16) and
  **T3: A BUILDER STARTED AT THE LEAN BUILDS MORE THAN THE LEAN** (80 of 80).
* **T1: THE FLY'S WIRING CANNOT BE TOLD APART FROM A SHUFFLE OF IT** (the ranks sum to 287 with 2 ties, the middle 264; p 0.42).
* **T2: THE FLY'S WIRING CANNOT BE TOLD APART FROM A PLAIN NET OF ITS SIZE** (274.5 with 1 tie; p 0.72).

**The homes, which section 2 said would show more than the score: 15,023 in 16,000 builds** (round 4: 12,700). A builder
finishes 188 of the 200 plans on average, where round 4's finished 159 and the lean alone 123; the least 179, the best 192 (MLP
draw 4). 79 of the 80 finish more than their round 4 selves. No builder finishes all 200, as the rule does.

**The arms are now indistinguishable to four places:** the five means lie within two ten-thousandths. Whatever the wiring, the
size or the kind of network, the correction it learns is the same one.

**The history: almost all of it in the first 25 iterations.** The trainer's own battery, share of the plan missing:

| arm | iteration 0 | 25 | 50 | 75 | 100 | 125 | 149 |
|---|---|---|---|---|---|---|---|
| FLY | 0.1290 | 0.0039 | 0.0020 | 0.0018 | 0.0017 | 0.0020 | 0.0023 |
| SHUF | 0.1221 | 0.0036 | 0.0026 | 0.0024 | 0.0027 | 0.0029 | 0.0033 |
| PLAIN | 0.1313 | 0.0017 | 0.0019 | 0.0016 | 0.0019 | 0.0017 | 0.0015 |
| FISH | 0.1287 | 0.0040 | 0.0028 | 0.0021 | 0.0023 | 0.0030 | 0.0024 |
| MLP | 0.1369 | 0.0048 | 0.0035 | 0.0028 | 0.0036 | 0.0034 | 0.0026 |

Round 4 stood at 0.02 to 0.04 by iteration 25 and 0.009 to 0.014 at the end; here it is under 0.005 by 25 and level after.

**The expectations against what came.** P3 MORE (65) and P0 MORE (45): both came. T0, T3 MORE (97); T1, T2 CANNOT (80): all
came. The mean homes a builder finishes above 170 (50): yes -- and above 185, which I gave 12 percent: 188. A builder that
finishes all 200 (5): none; the best is 192.

**What this does and does not say** (section 5). The gain round 5 measured from a random start is there from a good start too,
and the two together leave about one plan in sixteen unfinished. It is still "the lean, which a person wrote, corrected"; and the
rule, three lines, finishes every plan.
