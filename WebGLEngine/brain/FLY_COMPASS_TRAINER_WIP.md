# The compass trainer: is the shortfall below the hand rule the trainer's choice of point? (registration)

**Registered 2026-11-18, before any code of this round exists.** Keith asked for this round among four ("do all 4
items"). The compass round (`brain/FLY_COMPASS_LEARNS_WIP.md`, read at 47e46680) found every trained plastic fly
**below the same rule set by hand** (H: 0 of 12 above the hand rule's 0.6674 on the 200 audit lives). The trainer
had pushed both rates past the hand point (a 0.0136 to 0.0195 against the hand's 0.01, c 1.34 to 1.76e-5 against
1e-5), and the further it took c, the lower the score (Spearman -0.90). Round 11 and the balanced round showed the
same pattern. **This round asks whether that shortfall is the trainer's choice of which point to keep, rather than
where its walk goes.**

**Said first: the arm this round is weighed against was run and read in the compass round.** KEEP16 is that round's
PLASTIC arm, with its records used as committed (`brain/flyCompassRound.jsonl`, sha256 363cdbf5147d4137...). This
registration is written knowing its numbers and the scoping below. Only the two new arms are run.

## 1. What was measured before this note, and on what (scratch code; not committed)
**The trainer** (`brain/rl/dockPolicy.js` `trainDockES`, with fresh episodes) moves its weights on fresh lives at every
iteration. After each iteration it scores the new point on **a fixed battery**: the same 16 lives (seeds 5000 + 17 k)
for every training of every round. It hands back the point that scored best there. **The battery never steers the
walk.** It draws no random numbers and changes no weight, so it only chooses which point of the walk is returned.

**On the trainer's own battery, all 12 PLASTIC flies beat the hand rule** (0.6527 to 0.6653 against 0.6351). **On
the 200 audit lives, none do.** The order turns over: the battery's best fly (draw 4) is the audit's worst, and the
battery's worst (draw 7) is the audit's best.

**Along the line from the hand rule to the trained flies** (a = 0.01 (1 + 0.6 t), c = 1e-5 (1 + 0.63 t), b 0):
| t | -0.5 | 0 (the hand rule) | 0.25 | 1 (about the trained flies) | 1.5 |
|---|---|---|---|---|---|
| the trainer's battery (16 lives) | 0.6049 | 0.6351 | -- | 0.6601 | 0.6638 |
| 400 scoping lives (20000001 + 7919 k) | 0.6618 | 0.6805 | 0.6807 | 0.6608 | 0.6390 |
The battery rises all the way to 1.5; the 400 lives peak near 0 to 0.25. **Eight other random 16-life batteries put
their tops at t = 1.5, 0.5, 1, 0.5, 0.25, 0, 0, 1.5.** A battery of 16 lives cannot place this peak.

**Three trainings replayed** (PLASTIC draws 1, 4, 7) with the trainer's arithmetic copied into scratch code, each
reproducing its committed weights exactly, logging the weights at every iteration. **The walk reaches its plateau by
iteration 5 and then wanders**: p_a from 0.30 to 2.00 and p_c from 0.19 to 1.76, and one point (draw 7, iteration 49,
p_c 0.19) scores 0.568 on 100 of the scoping lives. The trainer keeps whichever wander its 16 lives liked best: draw 4's
iteration 55, with p_a 1.95.

**Four ways of choosing the point of the same walk**, scored on the 400 scoping lives (the hand rule 0.6805):
| draw | KEEP16 (the trainer as it is) | BAT64 (the best on 64 lives of the draw's own) | LAST (the walk's last point) | AVG20 (the mean of its last 20) |
|---|---|---|---|---|
| 1 | 0.6580 (iteration 27) | **0.6808** (iteration 4) | 0.6684 | 0.6805 |
| 4 | 0.6456 (iteration 55) | **0.6813** (iteration 4) | 0.6738 | 0.6745 |
| 7 | 0.6743 (iteration 26) | **0.6816** (iteration 39) | 0.6757 | 0.6793 |
**BAT64 lands at the hand rule in all three; KEEP16 lands below it in all three; LAST lands between them.** AVG20 is
not run: it is a choice no trainer in this tree makes, and LAST is the plainer control.

## 2. The arms (12 draws each, **draws 1 to 12**: the compass round's PLASTIC fly, task, recipe, seed and audit)
| arm | the trainer's choice of point | trainings |
|---|---|---|
| KEEP16 | the best on the fixed 16 lives (the trainer as it is) | the compass round's PLASTIC, as committed |
| **BAT64** | **the best on 64 lives of the draw's own** (seeds 40000000 + 10007 s + 17 k): none a training life, none an audit life, none the fixed battery's | new |
| **LAST** | **the walk's last point** (iteration 59) | new |
**The walk is the same in all three arms**: the same recipe (60 iterations, 16 flies tried, sigma 0.14, lr 0.05, 4 fresh
lives each), the same seed (the draw), and a battery that does not steer it. So the arms differ only in the point kept,
and **they are compared draw for draw.** Two options are added to `trainDockES`, and **without them nothing changes**:
`batteryBase` (the battery's first seed; 5000 unless given) and `keep: "last"` (return the walk's last point). **LAST
draw 1 is trained a second time.**

## 3. The readings (alpha 0.01, exact two-sided sign tests, ties against the claim; the checks first, and a failed check means nothing is weighed)
* **K: BAT64 against KEEP16**, draw for draw: the sign of BAT64's score less KEEP16's, over the 12 draws.
* **L: LAST against KEEP16**, draw for draw.
* **H64: BAT64 against the hand rule** (the compass round's committed 0.6674 on the same 200 audit lives): 12 flies
  above or below it.
* **HL: LAST against the hand rule.**
* **The checks include** that the compass round's file is the committed one and passes its own checks, that the hand
  rule's score, vision off and the start equal the compass round's to the bit (the same fly, task and audit), and that
  LAST draw 1 is the same twice.
* Described: each arm's rates, the iteration BAT64 keeps, the trainer's history.

## 4. What a reading would say
* K BETTER and H64 CANNOT: **the compass round's shortfall below the hand rule was the trainer's choice of point**. Its
  walk reaches the hand rule's level, its 16-life battery then picks a wander that luck favoured, and 64 lives of the
  draw's own pick a point at the hand rule's level.
* K BETTER and H64 WORSE: the choice costs, but it is not all of the shortfall.
* K CANNOT: at 12 draws, the choice of point is not shown to matter.
* L: whether keeping the best on 16 lives is worse than keeping nothing at all.

## 5. Expectations, written before the code
K: **BETTER about 65 percent**, CANNOT about 35 (the sign test needs 11 of 12; draw 7's margin in scoping was 0.007).
L: CANNOT about 60, BETTER about 35. H64: **CANNOT about 75**, WORSE about 20. HL: WORSE about 50, CANNOT about 50.
BAT64's mean between 0.660 and 0.672, about 65 (the audit lives ran about 0.013 below the scoping lives for both the
hand rule and KEEP16).

## 6. What it would and would not mean
About **this trainer on this task**: an antithetic natural-ES trainer, 60 iterations, a walk that levels within a few.
A better choice of point is not a better walk. If BAT64 matches the hand rule, the trainer has found what the hand rule
already gave; it says nothing about rates no walk visited. Every other round in this tree that kept the best on the
fixed battery may share the bias, but this round tests only this one.

## 7. The cost
LAST is one training, about 14 minutes four at a time, plus its audit. BAT64 scores 64 battery lives at every iteration
instead of 16: about 1.6 times the lives, about 23 minutes. 24 trainings four at a time, the recheck and the floors:
about 2 hours 10. Resumable, so the 2-hour limit only means a second start.

## 8. The run (the gate never runs it and never gives the command the word `run`)
`node tools/ship/takeFlyCompassTrainer.mjs run` -> `brain/flyCompassTrainerRound.jsonl`, committed byte for byte, whole,
before it is read; `node tools/ship/takeFlyCompassTrainer.mjs read` prints the checks and the reading.

## 9. The result (the whole results file committed unread at bc153e21, then read once)
The run started twice: the first start stopped at the 2-hour limit with 16 whole lines, and the second trained the 8
missing, LAST draw 1 a second time and the floors (26 records; sha256 dd6b4646158c4d0e...). **The checks hold**:
vision off, the start and the hand rule (0.6674) are the compass round's to the bit, and LAST draw 1 came out the same
twice.
* **K: KEEPING THE BEST ON 64 LIVES OF THE DRAW'S OWN DOES BETTER THAN KEEPING THE BEST ON THE FIXED 16 LIVES** -- on
  every one of the 12 draws, by 0.0071 to 0.0429 (p 0.00049).
* **L: KEEPING THE WALK'S LAST POINT CANNOT BE TOLD APART FROM KEEPING THE BEST ON THE FIXED 16 LIVES** -- 10 above,
  2 below (p 0.039).
* **H64: KEEPING THE BEST ON 64 LIVES OF THE DRAW'S OWN CANNOT BE TOLD APART FROM THE RULE SET BY HAND** -- 9 above
  0.6674, 3 below (p 0.146).
* **HL: KEEPING THE WALK'S LAST POINT DOES WORSE THAN THE RULE SET BY HAND** -- 0 of 12 above (p 0.00049).

| arm | mean | sd | least | most | a (mean) | c (mean) | the iteration kept |
|---|---|---|---|---|---|---|---|
| BAT64 | 0.6688 | 0.0027 | 0.6627 | 0.6713 | 0.0090 | 1.18e-5 | 4 4 5 4 5 36 39 33 7 23 20 3 |
| LAST | 0.6575 | 0.0087 | 0.6343 | 0.6666 | 0.0123 | 1.62e-5 | 59 |
| KEEP16 (the compass round's PLASTIC) | 0.6464 | 0.0095 | 0.6275 | 0.6630 | 0.0160 | 1.63e-5 | -- |

**Every expectation came**: K BETTER (about 65), L CANNOT (60), H64 CANNOT (75), HL WORSE (50), and BAT64's mean in
0.660 to 0.672 (65). So, as section 4 put it, **the compass round's shortfall below the hand rule was the trainer's choice
of point**. Its walk reaches the hand rule's level; the 16 fixed lives pick a wander that luck favoured, and 64 lives of
the draw's own pick a point at the hand rule's level. **The walk was the same in every arm**: each LAST record's history
on the fixed 16 lives is its draw's committed PLASTIC record's, to the bit. Described, not registered: BAT64's rates sit
round the hand rule's (a 0.0067 to 0.0113 against its 0.01, c 0.88 to 1.44e-5 against its 1e-5), where KEEP16's went
past it (a 0.0136 to 0.0195). Seven of the twelve BAT64 flies kept a point from the first 10 iterations.

Measured after the reading (not registered; the gate recomputes it): **the scoping saw it coming.** For draws 1, 4 and 7,
the run's BAT64 kept iterations 4, 4 and 39, the iterations section 1's table names for the best on 64 lives.

**What it does not mean.** Section 6 holds. A better choice of point is not a better walk: BAT64 found what the hand rule
already gave, not a rule better than it (H64 CANNOT). Every other round in this tree that kept the best on the fixed
battery may share the bias, but this round tested only the compass fly. The bias is the trainer's, so a round that
weighed arms trained alike compared them fairly. But a round that weighed a trained fly against a fixed one was weighed
against a trainer that leaves points on the table. That applies to the H readings of the compass, balanced, mushroom body
and homing rounds.
