# The fly escapes to its home: a round on the one task the Giant Fiber Circuit is for (UNNUMBERED; REGISTERED 2026-11-14 BEFORE ITS TOOL IS WRITTEN AND BEFORE ANY TRAINING ON THE ENVIRONMENT IS RUN)

Keith, 2026-11-14, of three open items: "Let's do all 3". This is the first of them (backlog `fly-escapes-home`). Five rounds of
painting and building found the fly's wiring indistinguishable from a shuffle of itself; I wrote that if it ever beats one, it
would be on the task its circuit does in the animal. This is that round. **Nothing has been trained on the environment** but the
two iterations its gate uses to see that the trainer drives it.

## 1. What is built and gated before this note (`brain/rl/escapeEnv.mjs`, `tools/ship/escapeEnv-selfcheck.mjs`, commit baf1c59f)
A fly feeds in the yard of its voxel house. Movers come one at a time: a **strike** flies at the fly (pure pursuit, faster than
the fly walks) and catches it unless it is in its room; a **pass** flies a straight line that misses by 3 to 6 cells and harms
nothing. The policy's action is ONE number -- home, or food -- and the body walks the shortest way, through the door. It sees the
mover's angular size, its looming rate, its bearing rate (which includes the fly's own walking), the bearing, how far home and
food are, and where it is: 13 numbers. An episode's return is half the share of the time it fed plus half for living.

Floors on the 200 audit episodes (seeds `900001 + 7919 k`), each a fly written by hand: freeze 0.2840, hide 0.5000, **fleeAll
0.5395** (home for everything; lives in 198 of 200, feeds 0.09 of the time), **reflex 0.6465** (home when the mover looms on a
steady bearing; lives in 156, feeds 0.51). A fly that is TOLD each mover's kind, which no observation carries: 0.8351.

## 2. What is real here and what is not, said before the result
**Real:** the Giant Fiber Circuit is the fly's escape circuit; in the animal it fires on a looming object and triggers take-off.
The decision this task asks for -- escape now, or not, from looming -- is that decision.
**Not real:** (a) in the animal the looming signal reaches the Giant Fiber through specific visual neurons (LC4, LPLC2); this
model has none of them -- the 13 numbers reach all 34 units through a trained encoder, so the wiring under test is only the 313
connections AMONG the circuit's own cells. (b) The policy has no memory between ticks (three internal steps a tick, then it
starts again), so nothing here is the circuit integrating over time. (c) The fly walks home; a real one takes off. (d) The body
finds the way; the network only chooses when.
So a result for the wiring would be a result about those 313 connections as a mask on a small rate network, as in every earlier
round -- on a task that suits it.

## 3. The arms (the earlier rounds', with 13 inputs and 1 output)
| arm | what it is | weights |
|---|---|---|
| FLY | 34 units, the Giant Fiber Circuit's 313 connections | 824 |
| SHUF | 34 units, 313 connections placed by the draw's own shuffle (`shuffledEdges(34, 313, 7000 + s)`) | 824 |
| PLAIN | 55 units, no connections among them (the nearest count to FLY's) | 826 |
| FISH | 34 units, the zebrafish circuit's 153 connections | 664 |
| MLP | 16-16 tanh | 513 |
Draws s = 1 to 16; a draw's start is `brain/rl/paintCircuitPolicy.mjs`'s for its seed (the MLP's is `FlightPolicy`'s).

## 4. The recipe and the audit
`trainDockES`: `maxSteps 160, iters 150, pop 96, sigma 0.14, lr 0.05, trainEps 8` -- round 5 of the voxel home measured that 96
builders tried an iteration learns what 24 does not, so 96 is used from the start. A random start (no rule is given to the
network). The audit: the 200 episodes of the floors; a fly's score is its mean return.

## 5. The four questions and the reading (each read ONCE from the committed records; alpha 0.01, two-sided, a tie counted against the claim)
* **T3, did training learn to tell a strike from a pass** -- a SIGN test: of all 80 trained flies, how many score strictly above
  fleeAll's score on the same episodes, how many below. Words: `A TRAINED FLY ESCAPES BETTER THAN FLEEING FROM EVERYTHING` /
  `... ESCAPES WORSE THAN FLEEING FROM EVERYTHING` / `... CANNOT BE TOLD APART FROM FLEEING FROM EVERYTHING`.
* **T0, the fly against the reflex** -- the same sign test for the 16 FLY flies against the reflex's score. Words:
  `A FLY-WIRED FLY ESCAPES BETTER THAN THE REFLEX WRITTEN BY HAND` / `... ESCAPES WORSE THAN THE REFLEX WRITTEN BY HAND` /
  `... CANNOT BE TOLD APART FROM THE REFLEX WRITTEN BY HAND`.
* **T1, THE WIRING: FLY against SHUF** -- the exact rank-sum, 16 against 16. Words: `THE FLY'S WIRING ESCAPES BETTER THAN A
  SHUFFLE OF IT` / `THE FLY'S WIRING ESCAPES WORSE THAN A SHUFFLE OF IT` / `THE FLY'S WIRING CANNOT BE TOLD APART FROM A SHUFFLE OF IT`.
* **T2, FLY against PLAIN** -- the same test. Words: `THE FLY'S WIRING ESCAPES BETTER THAN A PLAIN NET OF ITS SIZE` /
  `... ESCAPES WORSE THAN A PLAIN NET OF ITS SIZE` / `... CANNOT BE TOLD APART FROM A PLAIN NET OF ITS SIZE`.
* Described, not tested: each arm's mean; how many of its 200 episodes a fly lives; the share of the time it feeds; how many
  passes it leaves its food for (the false alarms) and how many strikes catch it; each beside the reflex and the fly told the kind.

## 6. Checks, made first; a failure is the first line and the reading is NOT WEIGHED
80 records (5 arms x 16 draws), each once; the registered recipe; each arm's weight count and wiring (a SHUF draw's 313 distinct
off-diagonal pairs, not the fly's own); FLY draw 1 the same trained twice; a history in every record; the floors in the file are
the five numbers of section 1; and the gate re-audits two records an arm.

## 7. Expectations, written before the tool
T3: BETTER about 85 percent. T0: BETTER about 55, CANNOT about 30, WORSE about 15. **T1: CANNOT BE TOLD APART about 70 percent,
BETTER about 15, WORSE about 15** -- I said this is where I would expect the wiring to show if it ever does, and 15 percent is
what that expectation is worth after five rounds and section 2. T2: CANNOT about 60, WORSE about 25, BETTER about 15. The best
arm's mean above 0.75: about 35 percent. A trained fly above the fly told the kind (0.8351): about 3 percent.

## 8. What a reading would and would not mean
T1 BETTER would be the first sign in six rounds that these 313 connections help on anything, and would want a second round before
it is believed (another shuffle family, another seed set). T1 CANNOT is the sixth such reading and says the mask does not matter
here either. Neither says anything about the animal's circuit, for the reasons in section 2.

## 9. The cost
Not measured: no training has been run. About 115,000 episodes a training (150 x 96 x 8) at a fraction of a millisecond to a
millisecond each; perhaps 30 to 60 minutes for the 80 on four processes. The run is resumable.

## 10. The run (to be written; the gate never runs it and never gives the command the word `run`)
`node tools/ship/takeFlyEscape.mjs run` -> `brain/flyEscapeRound.jsonl`, committed byte for byte before it is read;
`node tools/ship/takeFlyEscape.mjs read` prints the checks and the reading.

## 11. The result (run 2026-11-14 in the sandbox, 54.1 minutes beside another round's run; `brain/flyEscapeRound.jsonl` committed at 2af0cdf3 before it was read; read once)
**The checks hold.**

| | mean score | sd | lives (of 200 episodes) | feeds (share of the time) | off its food for a pass | caught by a strike |
|---|---|---|---|---|---|---|
| PLAIN | 0.5173 | 0.0083 | 193.2 | 0.069 | 0.999 | 0.012 |
| SHUF | 0.5176 | 0.0104 | 193.3 | 0.069 | 1.000 | 0.012 |
| FISH | 0.5178 | 0.0077 | 192.9 | 0.071 | 1.000 | 0.013 |
| MLP | 0.5189 | 0.0116 | 192.8 | 0.074 | 0.998 | 0.013 |
| FLY | 0.5208 | 0.0084 | 190.0 | 0.092 | 0.996 | 0.019 |
| *written by hand:* freeze | 0.2840 | | 23 | 0.453 | 0.000 | 1.000 |
| hide | 0.5000 | | 200 | 0.000 | 1.000 | 0.000 |
| fleeAll | 0.5395 | | 198 | 0.089 | 1.000 | 0.004 |
| reflex | 0.6465 | | 156 | 0.513 | 0.247 | 0.107 |
| told each mover's kind | 0.8351 | | 198 | 0.680 | 0.296 | 0.004 |

* **T3: A TRAINED FLY ESCAPES WORSE THAN FLEEING FROM EVERYTHING** (79 of the 80 below fleeAll's 0.5395, 1 above -- MLP draw 9,
  0.5453; exact two-sided p 1.3e-22).
* **T0: A FLY-WIRED FLY ESCAPES WORSE THAN THE REFLEX WRITTEN BY HAND** (all 16 below 0.6465; p 2 / 65536).
* **T1: THE FLY'S WIRING CANNOT BE TOLD APART FROM A SHUFFLE OF IT** (the ranks sum to 284, the middle 264; p 0.47).
* **T2: THE FLY'S WIRING CANNOT BE TOLD APART FROM A PLAIN NET OF ITS SIZE** (297; p 0.22).

**Training did not learn the task.** The trained flies go home for everything: they are off their food for 32,963 of the 33,009
passes they meet, feed 0.07 to 0.09 of the time, and live. None of the five arms tells a strike from a pass; all five means lie
within four thousandths of each other, just above hiding all day (0.5). The trainer's own battery says the same of its running
weights: every arm's mean return is 0.44 to 0.48 at iteration 0 and 0.47 to 0.49 at iteration 149, never above 0.52.

**So T1 does not answer the question this round was run for.** It is the sixth round in which the fly's wiring cannot be told
from a shuffle of it, and the first on the task its circuit is for -- but it compares flies none of which learned to escape
selectively. Whether the wiring helps a fly that DOES learn this task is still not known.

**Said after the reading, and it is mine: the trainer keeps the weights that lived most.** `trainDockES` hands back the iteration
that scored best by `dockRate x 1000 - avgDist`, and I had the environment report `docked` as "lived". So of its 150 iterations it
kept the one whose flies survived most on 24 episodes -- the one that hid most. The registration did not see this. It is not the
whole of the result (the running weights do not learn either), but it is a thumb on the scale toward hiding, and a second round
should remove it.

**Why it probably stuck, not tested:** from a random start a fly that leaves home less often dies sooner (it loses 0.5) long
before it has learned which movers to stay out for (it gains a few hundredths), so every small step away from hiding is punished.
The voxel home's rounds 2 to 4 are the same shape: these trainers did not find the lean from nothing, and did well when given it.

**The expectations against what came.** T3 BETTER (85): came WORSE -- the guess most wrong of any round here. T0: WORSE came (15),
not BETTER (55). T1 CANNOT (70) and T2 CANNOT (60): both came. The best arm above 0.75 (35): 0.52.

**What would answer the question (none registered):** start each fly at the reflex and train a correction, as round 4 did with
the lean; have the trainer keep the best RETURN; then ask T1 again of flies that do the task.
