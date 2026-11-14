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

## 8. The result (run 2026-11-14 in the sandbox, 80.7 minutes; `brain/voxelHomeLongRound.jsonl` committed at 257d2d8c before it was read; read once)
**The checks hold.**

| arm | mean share built | sd | least | most | homes (16 x 200 builds) | round 2 (150 iterations) | gain | draws that built more |
|---|---|---|---|---|---|---|---|---|
| SHUF | 0.6848 | 0.0210 | 0.6240 | 0.7282 | 0 | 0.6612 | +0.024 | 16 of 16 |
| FLY | 0.6869 | 0.0198 | 0.6413 | 0.7173 | 1 | 0.6664 | +0.021 | 13 |
| FISH | 0.6888 | 0.0195 | 0.6339 | 0.7222 | 1 | 0.6741 | +0.015 | 15 |
| PLAIN | 0.7010 | 0.0178 | 0.6715 | 0.7327 | 0 | 0.6905 | +0.011 | 12 |
| MLP | 0.7037 | 0.0152 | 0.6754 | 0.7335 | 0 | 0.6892 | +0.015 | 13 |
| 16 random builders | 0.5722 | 0.0028 | | 0.5774 | 0 | | | |
| the lean to the unfinished columns, no network | 0.9226 | | | | 123 of 200 | | | |

* **T3: A LONGER TRAINING BUILDS MORE OF A HOME** (the ranks sum to 333, where 332 or more speaks; exact two-sided p 0.0085).
  It speaks, and only just, and what it speaks of is small: two hundredths of a home for 6.7 times the training.
* **T0: A FLY-WIRED BUILDER BUILDS MORE OF A HOME THAN A RANDOM ONE** (all 16 above all 16; p 3.3e-9), as in round 2.
* **T1: THE FLY'S WIRING CANNOT BE TOLD APART FROM A SHUFFLE OF IT** (the ranks sum to 272, the middle 264; p 0.78). The fourth
  round to say so.
* **T2: THE FLY'S WIRING CANNOT BE TOLD APART FROM A PLAIN NET OF ITS SIZE** (the ranks sum to 220; p 0.10). Round 2 said WORSE
  (p 0.00027). The fly's mean is still the lower, and the three arms with recurrent synapses are still below the two without;
  the gap between FLY and PLAIN went from 0.024 to 0.014 and the test no longer speaks. That is not a reading that they are alike.

**Two homes, the first any trained builder has finished:** FLY draw 1 and FISH draw 13, one each of their 200 plans, in 16,000
builds. As section 5 said before the run, a home here is a lean plus chance; the lean alone finishes 123 of 200.

**The learning had levelled.** The trainer's own battery, share of the plan missing, mean of an arm's 16 draws:

| arm | iteration 0 | 166 | 332 | 498 | 664 | 830 | 996 | 999 |
|---|---|---|---|---|---|---|---|---|
| FLY | 0.4818 | 0.2931 | 0.2797 | 0.2723 | 0.2674 | 0.2617 | 0.2652 | 0.2664 |
| SHUF | 0.4704 | 0.2967 | 0.2844 | 0.2723 | 0.2720 | 0.2690 | 0.2700 | 0.2687 |
| PLAIN | 0.4588 | 0.2712 | 0.2657 | 0.2579 | 0.2628 | 0.2522 | 0.2535 | 0.2548 |
| FISH | 0.4721 | 0.2921 | 0.2719 | 0.2648 | 0.2610 | 0.2634 | 0.2568 | 0.2591 |
| MLP | 0.4435 | 0.2724 | 0.2558 | 0.2509 | 0.2510 | 0.2531 | 0.2432 | 0.2440 |

Every arm drops 0.17 to 0.19 in the first 166 iterations and 0.016 to 0.033 in the 833 after. The best arm is 0.375 of the way
from a random builder to the lean (round 2's: a third). More iterations of this trainer are not what stands between these
builders and a home.

**The expectations against what came.** T3 MORE (80), T0 MORE (97), T1 CANNOT BE TOLD APART (75): all came. T2 came as the 35
(CANNOT), not the 55 (WORSE). The best arm above 0.80 (35): no, 0.70. Any home (45) and a FLY home (30): both came, one home
each. The history still falling at the end (60): no -- the best arm's last reading is above the one before it. The guess that
was most wrong was the size: I gave 35 percent to a best arm above 0.80, and the whole gain was 0.01 to 0.02.

**What this does not say** (section 5): what another trainer, a smaller sigma, or a start at the lean would do.
