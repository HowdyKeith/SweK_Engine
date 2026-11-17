# The fly escapes, round 10: a fly whose escape runs through habituating fibres (registration)

**Registered 2026-11-17, before any code of this round exists.** Keith, after round 9's verdict: "run
fly-escape-habituates-start first" (the backlog row `fly-escape-habituates-start`: round 9 again with the trainer started
where never fleeing is not the nearest hill).

**Said first: round 9's habituation could not reach the fly's action at the start.** Round 9's fly was
`0.5 x the reflex + the network's output`, the output layer starting at zero. Its habituating connections were inside the
network, so at the start weakening them changed nothing the fly did: the trainer felt no pull toward using them, and 9 of
12 times went to never fleeing. **This round puts the reflex through the fibres**, and the scoping below found that WHAT
drives the weakening decides everything. Both are new; the task, the lives, the audit, the floors and the recipe are round
9's unchanged.

## 1. What was measured before this note, and on what (scratch code; not committed)
All on the first 100 of round 9's audit lives (900001 + 7919 k), where never fleeing scores 0.6413 and the hand
habituating reflex 0.7323; the round's own floors are on all 200.

**The reflex gated by the connections' mean efficacy, the weakening driven by source activity alone (round 9's rule): no
hill.** The fly flees on a collision course only while the mean efficacy of the connections onto the Giant Fibers is above
0.5; the network silent. Over a grid of 9 values of a and 5 of b, on the real wiring and a shuffle, the best was 0.633 and
0.638 -- never above never fleeing.

**Why: the drive, not the timing.** The hand rule weakens once a mover; done every tick while the reflex fires instead, it
still pays (0.7125 at 0.008 a tick and beta 0.002), with or without the decision held from the mover's onset. Driven every
tick by any mover in view, or by the looming's size, it never passes never fleeing (best 0.6306). The source cells of the
connections onto the fibres are silent with nothing in view (0.0000 mean activity) and about 0.4 with any mover -- so
round 9's rule weakened them for every mover, which is the "any mover" case.

**Weakening by co-activity: a hill.** A connection weakens while its source cell is active AND the fibre fires (the reflex
goes through): g <- g - a g |h_source| [fired] + b (1 - g). The network silent, draw 1:
| wiring | best a, b | score | decoy lives | ordinary lives | decoy lives, episodes 1 to 4 |
|---|---|---|---|---|---|
| real | 0.08, 0 | **0.6981** | 0.863 | 0.534 | 0.57 0.88 1.00 1.00 |
| shuffle | 0.02, 0 | **0.6885** | 0.796 | 0.581 | 0.57 0.65 0.96 1.00 |

**The trainer climbs it.** Short trainings (40 iterations of the recipe's 150; draws 901 to 904, which the round does not
use), on all 200 audit lives:
| fly | draws | score | decoy lives, episodes 1 to 4 | rates set to 0 |
|---|---|---|---|---|
| co-activity, real wiring | 4 | 0.6638, 0.6826, 0.6834, 0.6891 | 0.58-0.64 to 1.00, all four | 0.6057 (the reflex), all four |
| co-activity, shuffle | 2 | 0.6635, 0.6862 | 0.58-0.62 to 1.00 | 0.6057 |
| frozen | 2 | 0.6348 (never flees), 0.6640 | flat | -- |
None of the six habituating flies went to never fleeing; every one learns across its life, and loses all of it with its
rates at 0. All six are below the hand floor (0.7276).

## 2. The task
Round 9's (`brain/rl/lifeEnv.mjs`, unchanged): lives of four episodes, 640 ticks, decoy or ordinary from the life's seed;
a life's return the mean of its episodes'.

## 3. The fly (`brain/rl/coactReflex.mjs`, to be built)
Round 9's network (`MaskedCircuitPolicy`, the 42 real cells, looming into LC4, size into LPLC2, read from the two Giant
Fibers, a connection at 0.01 x its synapse count, the output layer starting at zero). Every connection onto a Giant Fiber
has an efficacy g, 1 at the start of a life (the life clock reads 0), and acts with its weight times g. Each tick:
* m, the mean efficacy over those connections, is taken BEFORE the tick's change;
* **the fly fires** when the reflex says flee and m is above **0.5**; the action is `0.5 x (+1 if it fires, else -1) + the
  network's output`;
* then every such connection: **g <- g - a g |h| [fired] + b (1 - g)**, held to 0..1, h its source cell's activity that tick;
* a = 0.5 max(0, p_a), b = 0.01 max(0, p_b), two weights the trainer moves, first in the list, starting at 0.
**With both rates at 0 the fly is round 9's FROZEN fly to the bit** (the reflex wrapper round the same network): g stays 1,
m is 1, and it fires exactly when the reflex does.

## 4. The arms (12 draws each, **draws 13 to 24**, new; a draw seeds the starting weights and the trainer)
| arm | the fly | weights |
|---|---|---|
| **FROZEN** | round 9's FROZEN, its code unchanged | 454 |
| **COACT** | the fly of section 3 on the real wiring | 456 |
| **CSHUF** | COACT on round 5's free shuffle (`shuffledEdges(42, 369, 7000 + draw)`); what habituates is what the shuffle puts onto the fibres | 456 |
**The recipe and the audit are round 9's**: 150 iterations, 96 flies tried, sigma 0.14, lr 0.05, fresh lives, a battery
of 200, the best battery return kept; 200 audit lives (900001 + 7919 k), 100 decoy.

## 5. The readings (alpha 0.01, exact, two-sided, ties against the claim; the checks first, and a failed check means nothing is weighed)
* **P: COACT against FROZEN**, a rank sum of 12 against 12.
* **T1: COACT against CSHUF**, a rank sum.
* **H: COACT against the hand habituating reflex**, a sign test of the 12 against its audit score (0.7276).
* **Two counts, registered as round 9's "learn" count is withdrawn** (the plain reflex passed it):
  - **USES**: the fly's score less its score with its two rates set to 0 (every other weight kept) is above **0.01**.
  - **ACROSS**: in decoy lives, the fourth episode's mean return less the first's is at least **0.1**. The reflex (0.012),
    never fleeing (0) and round 9's best fly (0) fail it; the hand habituating reflex (0.42) passes.
* Described: each arm's score in decoy and ordinary lives, a and b, the flies that never flee (an ordinary-life score under
  0.35), the trainer's own history, and the floors.

## 6. What a reading would say
* P BETTER, with COACT mostly USES and ACROSS: **a fly whose escape runs through connections that weaken with use learns,
  within each life, to ignore the decoys, and does better than a fly that cannot** -- the first fly in this tree that
  learns while it lives, by a reading registered before it was run.
* P CANNOT: the hill the scoping found is not where 150 iterations end, or the frozen flies did not all go to never fleeing.
* T1 and H are about which wiring and how near the hand rule.

## 7. Expectations, written before the code
P: **BETTER about 75 percent, CANNOT about 25.** COACT at least 9 of 12 USES, about 75; at least 9 of 12 ACROSS, about 70;
COACT's mean between 0.66 and 0.71, about 65. FROZEN at least 8 of 12 never flee, about 70. T1: CANNOT about 75. H: WORSE
about 85.

## 8. What it would and would not mean
About this task, these 42 cells, one rule with two numbers, and this trainer. **The rule was chosen by scoping on the audit's
first 100 lives**, three rules tried, and is the one that paid; that is said here and is why the readings are against a
frozen fly and a shuffle trained the same way, not against a number. Habituation of the escape response is real in the
animal; that it is co-activity at the inputs of the Giant Fibers is a modelling choice, not data.

## 9. The cost
The scoping's 40-iteration trainings took 3.5 minutes four at a time: about 13 minutes a COACT or CSHUF training; FROZEN
about 7 (round 9). 36 trainings, four at a time: about 100 minutes. Resumable.

## 10. The run (the gate never runs it and never gives the command the word `run`)
`node tools/ship/takeFlyEscapeCoact.mjs run` -> `brain/flyEscapeCoactRound.jsonl`, committed byte for byte, whole,
before it is read; `node tools/ship/takeFlyEscapeCoact.mjs read` prints the checks and the reading.

## 11. The result (the run: one start, 107.1 minutes, no restart; the whole file committed unread at dd9f5c2f, then read once)
The checks hold, and the untrained fly of all three arms scored the reflex's 0.6057 to the bit.

**P: A FLY WHOSE ESCAPE RUNS THROUGH FIBRES WHOSE INPUTS WEAKEN WITH CO-ACTIVITY CANNOT BE TOLD APART FROM ONE WHOSE CANNOT**
(COACT's ranks 204 on a middle of 150, 36 ties, exact two-sided p 0.0387). It leans toward COACT, but 0.0387 is not under
0.01, and a lean is not a reading.

**T1: THE REAL WIRING CANNOT BE TOLD APART FROM A SHUFFLE OF IT** (ranks 116, no ties, p 0.0519) -- leaning the other way,
toward the shuffle.

**H: A FLY WHOSE ESCAPE RUNS THROUGH FIBRES WHOSE INPUTS WEAKEN WITH CO-ACTIVITY DOES WORSE THAN THE HABITUATING REFLEX
WRITTEN BY HAND** (0 of 12 above its 0.7276, p 0.00049).

| arm | mean | sd | decoy lives | ordinary lives | decoy, 4th episode less 1st | never flee | USES | ACROSS | with rates at 0 |
|---|---|---|---|---|---|---|---|---|---|
| FROZEN | 0.6348 | 0 | 1.0000 | 0.2695 | 0 | 12 | -- | -- | -- |
| COACT | 0.6613 | 0.0218 | 0.9199 | 0.4027 | 0.2653 | 4 | 9 | 9 | 0.5880 |
| CSHUF | 0.6806 | 0.0064 | 0.8575 | 0.5036 | 0.4121 | 0 | 12 | 12 | 0.6057 |

**What happened.** Every FROZEN fly went to never fleeing, as in round 9. Nine of the twelve COACT flies learned within their
lives (decoy lives about 0.6 in the first episode, 1.00 by the fourth) and use their plasticity. **The other three, draws 16,
19 and 24, never flee to the bit -- and not through the fibres.** Re-audited after the reading (not registered): in the audit's
first two lives draw 16's fibres fire on 53 ticks, but its network's output is under -0.5 on every tick, so no firing ever
moves it. The trainer found round 9's hill again, through the **output layer**, which sits downstream of the fibres and is not
plastic. Those three are what took P from a reading to a lean.

**The shuffle never did that.** With its rates set to 0, **every CSHUF fly is the reflex to the bit** (0.6057): its network
never moved far enough to change a single action, and all its learning is in the two rates. The COACT flies' networks did
move (rates at 0: mean 0.5880, under the reflex; four at never fleeing). Why the real wiring's network moves and the shuffle's
does not is not measured here. **NOT registered, and said as such:** every CSHUF fly scores above every FROZEN fly (least
0.6641 against 0.6348) -- the shuffle did what P asked of the real wiring.

The trainer's own lives: COACT 0.632 to 0.670, CSHUF 0.682 to 0.686, FROZEN 0.636 to 0.661 by iteration 25 and no further.

**Expectations against what came:** P BETTER (75) did not come -- CANNOT, leaning toward COACT. COACT at least 9 of 12 USES
(75) and ACROSS (70) came, with 9 each. Its mean between 0.66 and 0.71 (65) came, at 0.6613. FROZEN at least 8 of 12 never flee
(70) came, with 12. T1 CANNOT (75) and H WORSE (85) came.

**What it means.** The rule this round chose works when the trainer leaves it alone: the shuffled flies are the clean case
of it, and all twelve learn within a life. On the real wiring the trainer has a second way out, quieting the network's
output, and three times in twelve it took it. The next round would close that door (an output layer that cannot veto the
fibres, or no output layer) rather than change the rule. That is a suggestion, not a registration.
