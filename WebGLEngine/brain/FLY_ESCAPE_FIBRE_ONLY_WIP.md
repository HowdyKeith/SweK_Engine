# The fly escapes, round 11: a fly whose network cannot overrule its habituating fibres (registration)

**Registered 2026-11-17, before any code of this round exists.** Keith, after round 10's verdict: "Let's keep going and do
the next suggested item" -- the backlog row `fly-escape-through-fibres`: round 10 again with the output layer unable to veto
the fibres, so that the only way to stop fleeing is the plastic connections.

**Said first: this round closes a door that round 10's result showed.** In round 10, 9 of 12 real-wiring flies learned
within their lives. The other three never fled, because the network's output sat under -0.5 on every tick and overruled
every firing of the fibres. The output layer is downstream of the fibres and is not plastic. Round 10's frozen flies (12 of
12) and round 9's (12 of 12) found the same never-fleeing hill. **This round's fly flees exactly when its fibres fire.** The
rule, the task, the lives, the audit, the floors and the recipe are round 10's unchanged; the door was chosen after seeing
round 10's result, and that is why the readings below are against fixed floors and a shuffle trained the same way.

## 1. What was measured before this note, and on what (scratch code; not committed)
**In this task only the action's sign counts** (`brain/rl/escapeEnv.mjs`: the fly heads home when the action is above 0). So
the network's output does nothing to the fly except veto or force the reflex; without it, the network's weights act only
through the source cells' activity, which drives the weakening.

**A grid of the depression rate** (b at 0, the network untrained, draw 1, all 200 audit lives):
| a | 0 | 0.02 | 0.05 | 0.08 | 0.15 | 0.5 | 2 |
|---|---|---|---|---|---|---|---|
| real wiring | 0.6057 | 0.6145 | **0.6828** | 0.6632 | 0.6452 | 0.6363 | 0.6300 |
| shuffle | 0.6057 | **0.6825** (0.02) | 0.6536 | 0.6446 | 0.6437 | 0.6282 | 0.6321 |
A hill above never fleeing (0.6348); and weakening very fast (one firing and the fibres are shut for the life) sinks to
about 0.63, **under** never fleeing, so it is not a way out.

**Short trainings** (40 iterations of the recipe's 150; draws 901 to 904, which the round does not use; all 200 audit lives):
| fly | score | decoy lives, episode 1 to 4 | a |
|---|---|---|---|
| real wiring | 0.6653, 0.6798, 0.6855, 0.6778 | 0.58-0.60 to 1.00, all four | 0.07 to 0.31 |
| shuffle | 0.6753, 0.6900, 0.6803, 0.6763 | 0.58-0.59 to 1.00, all four | 0.04 to 0.18 |
All eight above never fleeing; all eight below the hand floor (0.7276). b went to 0 in all eight.

## 2. The task
Round 9's (`brain/rl/lifeEnv.mjs`, unchanged): lives of four episodes, 640 ticks, decoy or ordinary from the life's seed; a
life's return the mean of its episodes'.

## 3. The fly (`brain/rl/fibreOnlyReflex.mjs`, to be built)
Round 10's fly (`brain/rl/coactReflex.mjs`, used as it is: the 42 real cells, the efficacies, m taken before the tick's
change, firing when the reflex says flee and m is above 0.5, g <- g - a g |h| [fired] + b (1 - g), a = 0.5 max(0, p_a),
b = 0.01 max(0, p_b)) **with its action `0.5 x (+1 if it fires, else -1)` and nothing added.** The network still runs every
tick, and its weights still set the source cells' activity h; its output layer's weights are in the list and do nothing.
456 weights. **With both rates at 0 the fly is the reflex to the bit** (0.6057), whatever its other weights: the round
checks this of every record (section 5), so a record's score with its rates at 0 is no longer a count but a check.

## 4. The arms (12 draws each, **draws 25 to 36**, new)
| arm | the fly | weights |
|---|---|---|
| **FIBRE** | the fly of section 3 on the real wiring | 456 |
| **FSHUF** | FIBRE on round 5's free shuffle (`shuffledEdges(42, 369, 7000 + draw)`) | 456 |
**There is no frozen arm, and the reason is arithmetic:** a frozen fly that cannot veto is the reflex whatever it is
trained to (0.6057, a floor). The frozen fly that CAN veto is round 9's and round 10's FROZEN arm: 24 of 24 trained to
never fleeing, 0.6348 to the bit -- the floor P is weighed against.
**The recipe and the audit are round 9's**: 150 iterations, 96 flies tried, sigma 0.14, lr 0.05, fresh lives, a battery
of 200, the best battery return kept; 200 audit lives (900001 + 7919 k), 100 decoy.

## 5. The readings (alpha 0.01, exact, two-sided, ties against the claim; the checks first, and a failed check means nothing is weighed)
* **The checks** are round 10's (draws, recipe, weights, wiring, FIBRE draw 25 trained twice the same, the floors, every
  untrained fly the reflex) **and one more: every record's score with its two rates at 0 is the reflex's, to the bit.**
* **P: FIBRE against never fleeing**, a sign test of the 12 against its audit score (0.6348).
* **T1: FIBRE against FSHUF**, a rank sum.
* **H: FIBRE against the hand habituating reflex**, a sign test against its audit score (0.7276).
* **Counted: ACROSS**, as round 10 registered it (in decoy lives the fourth episode's mean return less the first's is at
  least **0.1**); and the flies that never flee (an ordinary-life score under 0.35).
* Described: each arm's score in decoy and ordinary lives, a and b, the trainer's own history, and the floors.

## 6. What a reading would say
* P BETTER, with FIBRE mostly ACROSS: **a fly whose escape runs through connections that weaken with co-activity, and that
  nothing downstream can overrule, learns within each life to ignore the decoys and does better than any fly this trainer
  has made that cannot** -- by a reading registered before it was run.
* P CANNOT or WORSE: the hill the scoping found is not where 150 iterations end, or it ends under never fleeing.
* T1 and H are about which wiring and how near the hand rule.

## 7. Expectations, written before the code
P: **BETTER about 85 percent, CANNOT about 15.** FIBRE at least 11 of 12 ACROSS, about 80; FIBRE's mean between 0.67 and
0.70, about 65; at most 1 of 12 FIBRE flies never flee, about 80. T1: CANNOT about 70. H: WORSE about 90.

## 8. What it would and would not mean
About this task, these 42 cells, one rule with two numbers, and this trainer. **The rule was chosen in round 10 by scoping on
the audit's first 100 lives, and the door this round closes was chosen after round 10's result**; both are said here, and
are why P is weighed against a floor every frozen fly reached and T1 against a shuffle trained the same way. A fly with no
veto downstream of its escape fibres is a modelling choice: the Giant Fiber pathway in the animal is fast and direct, but
not free of other influence.

## 9. The cost
The scoping's 40-iteration trainings took 2.5 to 3.6 minutes four at a time: about 13 minutes a training at 150
iterations. 24 trainings and the recheck, four at a time: about 85 minutes. Resumable.

## 10. The run (the gate never runs it and never gives the command the word `run`)
`node tools/ship/takeFlyEscapeFibreOnly.mjs run` -> `brain/flyEscapeFibreOnlyRound.jsonl`, committed byte for byte, whole,
before it is read; `node tools/ship/takeFlyEscapeFibreOnly.mjs read` prints the checks and the reading.

## 11. The result (the run: one start, 79.6 minutes, no restart; the whole file committed unread at c43b6fb9, then read once)
The checks hold: every untrained fly scored the reflex's 0.6057, and **every trained fly, with its rates at 0, is the reflex
to the bit** -- nothing downstream overrules the fibres.

**P: A FLY WHOSE NETWORK CANNOT OVERRULE ITS HABITUATING FIBRES DOES BETTER THAN A FLY THAT NEVER FLEES** (12 of 12 above
0.6348, exact two-sided p 0.00049).

**T1: THE REAL WIRING CANNOT BE TOLD APART FROM A SHUFFLE OF IT** (ranks 159 on a middle of 150, p 0.63).

**H: A FLY WHOSE NETWORK CANNOT OVERRULE ITS HABITUATING FIBRES DOES WORSE THAN THE HABITUATING REFLEX WRITTEN BY HAND**
(0 of 12 above 0.7276, p 0.00049).

| arm | mean | sd | least | most | decoy lives | ordinary lives | decoy, 4th episode less 1st | never flee | ACROSS | a |
|---|---|---|---|---|---|---|---|---|---|---|
| FIBRE | 0.6864 | 0.0028 | 0.6813 | 0.6906 | 0.8454 | 0.5275 | 0.4220 | 0 | 12 | 0.2046 |
| FSHUF | 0.6817 | 0.0096 | 0.6613 | 0.6930 | 0.8595 | 0.5038 | 0.4117 | 0 | 12 | 0.1844 |

**All 24 flies of both arms learn within their lives**: in decoy lives every FIBRE fly scores 0.58 in its first episode,
fleeing the decoys, and 1.00 by its fourth, ignoring them; none stops fleeing for good. The rise across a life (0.42)
is the hand habituating reflex's (0.42); what the hand reflex has that these flies lack is in ordinary lives (0.59 against
0.53). **The recovery rate went to 0 in all 24**: what a fly's fibres lose in a life stays lost until the next life. The
trainer's own mean return started above never fleeing at iteration 0 (FIBRE 0.690, FSHUF 0.676; round 10's COACT 0.632),
which I read as the hill being close to the start once the veto is gone; that is not measured here.

**Expectations against what came: all seven came.** P BETTER (85); at least 11 of 12 ACROSS (80), with 12; FIBRE's mean
between 0.67 and 0.70 (65), 0.6864; at most 1 of 12 never flee (80), with 0; T1 CANNOT (70); H WORSE (90).

**What it means.** Across rounds 9, 10 and 11 the trainer, given a fly that could stop fleeing, made it stop: 24 of 24 frozen
flies and 3 of 12 round-10 flies. Given a fly whose only way to stop fleeing is connections that weaken with co-activity,
it used them, 24 of 24, and every one beat never fleeing. **This is the first fly in this tree that learns while it lives,
by a reading registered before it was run.**

**What it does not mean.** The real wiring is no better at it than a shuffle (T1), so this says nothing yet about the fly's
own connections onto its Giant Fibers; the rule was chosen by scoping in round 10 and the door closed after round 10's
result; P is against a fixed floor, not against flies trained alongside; and the flies are still below the hand-written rule.
