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
