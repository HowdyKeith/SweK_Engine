# The voxel home, round 7: more builders tried again, and the smaller step given its time (UNNUMBERED; REGISTERED 2026-11-15 BEFORE ITS TOOL IS WRITTEN AND BEFORE ANY SUCH TRAINING IS RUN)

Keith, 2026-11-15, of three open items (the escape round started at the reflex; a page for the escape task; more house rounds):
"Let's do all 3". The third was written as "more than 96 builders, a longer run with the smaller step, or a different trainer".
**This round is the first two of those; a different trainer is NOT in it** (it needs the tree's other trainers read and one
chosen, and is left open in the backlog). Round 5 (`brain/VOXEL_HOME_STEPS_WIP.md` section 9), from a random start on FLY and
PLAIN: 96 builders tried an iteration builds 0.714 and 0.745 of a home where 24 built 0.666 and 0.690, and had not levelled at
150 iterations; a quarter of the step could not be told apart from round 2's at 150, and its note said that was also "a quarter
of the distance". Nothing has been trained with either setting below; no code of this round exists.

## 1. What is the same and what changes
Round 5's shape: the drawn environment, a random start (round 2's builders, weight for weight), FLY and PLAIN only, draws s = 1
to 16, `sigma 0.14, trainEps 8`, 96 steps, the 200 audit plans, the trainer's history in each record.

| setting | the recipe | against | cost against round 2 |
|---|---|---|---|
| **HUGE** | `pop 384` (round 5's MANY: 96), `lr 0.05, iters 150` | round 5's MANY cell of the same arm, from `brain/voxelHomeStepsRound.jsonl` | sixteen times |
| **SLOW** | `lr 0.0125, iters 600` (round 5's SMALL: 150 iterations), `pop 24` | round 2's own arm, from `brain/voxelHomeDrawnRound.jsonl` -- the same no-signal distance (600 x a quarter) as round 2's 150 | four times |

## 2. The four questions and the reading (each read ONCE from the committed records; an exact two-sided rank-sum, 16 against 16, speaking at p <= 0.01, a tie counted against the claim)
* **H-FLY, H-PLAIN** (HUGE against round 5's MANY): `FOUR TIMES THE BUILDERS AGAIN BUILDS MORE OF A HOME` /
  `FOUR TIMES THE BUILDERS AGAIN BUILDS LESS OF A HOME` / `FOUR TIMES THE BUILDERS AGAIN CANNOT BE TOLD APART FROM 96`.
* **L-FLY, L-PLAIN** (SLOW against round 2): `A SMALLER STEP FOR FOUR TIMES AS LONG BUILDS MORE OF A HOME` /
  `A SMALLER STEP FOR FOUR TIMES AS LONG BUILDS LESS OF A HOME` / `A SMALLER STEP FOR FOUR TIMES AS LONG CANNOT BE TOLD APART FROM ROUND 2'S`.
Four tests at 0.01 each, not corrected for being four.
Described, not tested: each cell's mean and homes; SLOW beside round 5's SMALL (the same step, a quarter of the time) and beside
round 3 (round 2's step for 1,000 iterations); HUGE beside round 6 (the lean start); how far each stands from a random builder
to the lean; the history.

## 3. Checks, made first; a failure is the first line and the reading is NOT WEIGHED
64 records (2 settings x 2 arms x 16 draws), each once; each setting's recipe; each arm's weight count and wiring; HUGE... no:
SLOW FLY draw 1 the same trained twice (the cheaper cell); a history to each setting's last iteration in every record; round
5's file holds its 16 MANY FLY and 16 MANY PLAIN draws and round 2's its 16 FLY and 16 PLAIN; and the gate re-audits two records
a cell.

## 4. Expectations, written before the tool
HUGE builds more than 96 did, either arm: about 75 percent; both: about 60. SLOW builds more than round 2, either arm: about 60
percent; both: about 45. The best cell's mean above 0.80: about 40 percent; above 0.90 (near the lean's 0.92): about 8. Any
home: about 60 percent; more than ten homes in a cell's 3,200 builds: about 15. **And said before the result: round 6 reached
0.997 by being GIVEN the lean; I do not expect either setting here to come near it.**

## 5. What a reading would and would not mean
Whether the two trainer findings of round 5 go on in the direction they pointed. NOT the best setting; NOT what another trainer
would do; nothing about the fly's wiring.

## 6. The cost
From round 5's measured 24.9 minutes (SMALL about 5, MANY about 20, on four processes): HUGE about 80 minutes, SLOW about 20.
The run is resumable.

## 7. The run (to be written; the gate never runs it and never gives the command the word `run`)
`node tools/ship/takeVoxelHomeMore.mjs run` -> `brain/voxelHomeMoreRound.jsonl`, committed byte for byte before it is read;
`node tools/ship/takeVoxelHomeMore.mjs read` prints the checks and the reading.

## 8. The result (run 2026-11-15 in the sandbox, 90.0 minutes; `brain/voxelHomeMoreRound.jsonl` committed at 19040f8e before it was read; read once)
**The checks hold.**

| cell | mean share built | sd | least | most | homes (16 x 200 builds) | read against | gain |
|---|---|---|---|---|---|---|---|
| HUGE FLY | 0.7327 | 0.0148 | 0.7101 | 0.7575 | 4 | round 5's MANY FLY 0.7140 | +0.019 |
| HUGE PLAIN | 0.7608 | 0.0122 | 0.7387 | 0.7819 | 4 | round 5's MANY PLAIN 0.7452 | +0.016 |
| SLOW FLY | 0.7141 | 0.0112 | 0.6929 | 0.7326 | 1 | round 2's FLY 0.6664 | +0.048 |
| SLOW PLAIN | 0.7450 | 0.0140 | 0.7198 | 0.7667 | 8 | round 2's PLAIN 0.6905 | +0.055 |
| 16 random builders | 0.5722 | | | | 0 | | |
| the lean, no network | 0.9226 | | | | 123 of 200 | | |

* **H-FLY: FOUR TIMES THE BUILDERS AGAIN BUILDS MORE OF A HOME** (the ranks sum to 343, the middle 264; exact two-sided p 0.0022)
  and **H-PLAIN: FOUR TIMES THE BUILDERS AGAIN BUILDS MORE OF A HOME** (340; p 0.0034).
* **L-FLY: A SMALLER STEP FOR FOUR TIMES AS LONG BUILDS MORE OF A HOME** and
  **L-PLAIN: A SMALLER STEP FOR FOUR TIMES AS LONG BUILDS MORE OF A HOME** (all 16 above all 16 of round 2's; 392; p 3.3e-9).

**More builders still helps, and by less.** 24 to 96 gave 0.048 and 0.055 (round 5); 96 to 384 gives 0.019 and 0.016, at four
times the cost again.

**The smaller step was "a quarter of the distance", as round 5's note said it might be.** Given four times the iterations it
builds 0.048 and 0.055 more than round 2 -- **and lands where 96 builders for 150 iterations did, to four places** (FLY 0.7141
beside 0.7140, PLAIN 0.7450 beside 0.7452), at the same cost (each tries four times round 2's builders in all). That agreement
is described, not tested, and may be chance; what it suggests is that this trainer's result on this task is set by how many
builders it has tried and how finely it steps, not by which of the two it spends the budget on. Both are well above round 2's
step run for 1,000 iterations (round 3: 0.687 and 0.701 at 6.7 times the cost): a large step for a long time is the poor way to
spend it.

**It is still half way, and seventeen homes.** The best cell stands 0.54 of the way from a random builder to the lean. 17 homes
in 12,800 builds, the most by one builder 4. Round 6's builders, given the lean, finish 188 of 200.

**The history: all four still falling at every reading, each last step under a hundredth.**

| cell | 1st reading | 2nd | 3rd | 4th | 5th | 6th | last |
|---|---|---|---|---|---|---|---|
| HUGE FLY (iterations 0 to 149) | 0.4091 | 0.3220 | 0.2740 | 0.2549 | 0.2386 | 0.2291 | 0.2233 |
| HUGE PLAIN | 0.4096 | 0.3168 | 0.2651 | 0.2300 | 0.2092 | 0.1950 | 0.1900 |
| SLOW FLY (iterations 0 to 599) | 0.4358 | 0.3202 | 0.2766 | 0.2642 | 0.2562 | 0.2470 | 0.2425 |
| SLOW PLAIN | 0.4443 | 0.3091 | 0.2584 | 0.2316 | 0.2182 | 0.2074 | 0.2037 |

**The expectations against what came.** HUGE more, either arm (75) and both (60); SLOW more, either (60) and both (45): all
came. The best cell above 0.80 (40): no, 0.76. Any home (60): 17. More than ten in a cell (15): the most is 8.

**What this does not say** (section 5): the best setting; what another trainer would do (not in this round, and still open);
anything about the fly's wiring. **What the seven rounds say together:** from nothing, this trainer climbs slowly toward a rule
a person can write in a line, and more budget buys less each time; given that rule, it improves on it within 25 iterations.
