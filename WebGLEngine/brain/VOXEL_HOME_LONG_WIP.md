# The voxel home, round 3: round 2's builders trained for 1,000 iterations where it trained them for 150 (UNNUMBERED; REGISTERED 2026-11-14 BEFORE ITS TOOL IS WRITTEN AND BEFORE ANY SUCH TRAINING IS RUN)

Keith, 2026-11-14, offered the page or a longer training after round 2: "Run longer training". Round 2
(`brain/VOXEL_HOME_DRAWN_WIP.md` section 10): with the column drawn, every trained builder beat every random one (the best arm
0.69 of a home against 0.57), none built a home, and a lean that needs no network builds 0.92 and 123 homes of 200. Its note said
"nothing here says the curve had flattened". This round changes ONE number: the trainer's iterations. Nothing has been trained
longer than 150 iterations.

## 1. What is the same and what changes
The same: the drawn environment, the five arms and their weight counts (FLY and SHUF 2,967, PLAIN 2,962, FISH 2,807, MLP 1,540),
the start of a draw, draws s = 1 to 16, `pop 24, sigma 0.14, lr 0.05, trainEps 8`, 96 steps, the 200 audit plans `700001 + 7919 k`,
round 1's 16 random builders, the lean, the three tests and their words. **Changed: `iters 1000`** (round 2: `iters 150`). Because a
draw starts from the same weights with the same noise stream, its first 150 iterations ARE round 2's draw: this is that training,
gone on with. **Added to each record:** the trainer's own history (about seven readings of its 24-plan battery along the way), so
the shape of the learning can be described.

## 2. The four questions and the reading (each read ONCE from the committed records; an exact two-sided rank-sum, 16 against 16, speaking at p <= 0.01, a tie counted against the claim)
* **T0, T1, T2: round 2's**, word for word: FLY against the 16 random builders; FLY against SHUF; FLY against PLAIN.
* **T3 (does more training build more): this round's 16 FLY builders against round 2's 16 FLY builders** (from
  `brain/voxelHomeDrawnRound.jsonl` as committed). `A LONGER TRAINING BUILDS MORE OF A HOME` / `A LONGER TRAINING BUILDS LESS OF A
  HOME` / `A LONGER TRAINING CANNOT BE TOLD APART FROM THE SHORTER`.
* Four tests at 0.01: at most 0.04 that one speaks by chance.
* **Described beside them:** each arm's mean, sd, least and most; each arm's homes; the lean (0.9226, 123 homes); each arm's mean
  in round 2; each arm's history: the mean over its draws of the trainer's own battery reading (the share missing) at each point.

## 3. Checks, made first; a failure is the first line and the reading is NOT WEIGHED
Round 2's (80 records, each once, this round's recipe, each arm's weight count and wiring, FLY draw 1 the same twice, the floors);
every record carries a history whose last point is iteration 999; round 2's file holds its 16 FLY draws; and the gate re-audits
two records an arm.

## 4. Expectations, written before the tool
T3: BUILDS MORE about 80 percent (round 2's builders were a third of the way to the lean after 150). T0: MORE about 97. T1: CANNOT
BE TOLD APART about 75. T2: FLY WORSE about 55, CANNOT BE TOLD APART about 35. The best arm's mean above 0.80: about 35 percent;
above 0.90: about 8. ANY home among 80 x 200 builds: about 45 percent; a FLY home: about 30. The history still falling at the end
(the last reading below the one before it in the best arm): about 60 percent.

## 5. What a reading would and would not mean
Under this trainer, with 6.7 times the iterations: whether these builders go on learning the lean, how much of a home that
builds and whether any is finished, and whether the wiring finding holds with more training. NOT: what another trainer, a smaller
sigma or a start at the lean would do. A home built here is a lean plus chance.

## 6. The cost
Round 2 measured 10.2 minutes for 80 trainings of 150 iterations on four processes; at 1,000 iterations about 70 minutes in the
sandbox. The run is resumable.

## 7. The run (to be written; the gate never runs it and never gives the command the word `run`)
`node tools/ship/takeVoxelHomeLong.mjs run` -> `brain/voxelHomeLongRound.jsonl`, committed byte for byte before it is read;
`node tools/ship/takeVoxelHomeLong.mjs read` prints the checks and the reading.
