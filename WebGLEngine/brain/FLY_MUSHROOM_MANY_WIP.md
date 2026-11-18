# Several meanings at once: does the teachers' pairing matter when eight odours must be kept apart? (registration)

**Registered 2026-11-18, before any code of this round exists.** Keith: "Let's do 1, 3 and 4, then once completed do
item 2". Twice now the pairing of dopamine teachers with output neurons has not mattered: with random odours (the
mushroom body round, `brain/FLY_MUSHROOM_BODY_WIP.md`) and with odours made through the real projection neurons (the
odour round, `brain/FLY_MUSHROOM_ODOURS_WIP.md`, read at aaef7be2, T2 CANNOT). The odour round's note said that did not
cover "a task with more than one meaning to keep apart". **This round gives the fly eight odours a life, half of them
bad, and asks whether the real pairing now beats a permuted one.**

**Said first: why the answer may well be no, and what the round still tests.** The fly's readout (a weight v_m for
each of its 91 output neurons) is trained afresh on every draw. Permuting the teachers among the output neurons hands
each neuron another's teacher, and a free readout can learn the new pairing as easily as the old: it is a relabelling.
What a permutation does change is **which Kenyon-cell inputs each teacher's neurons sample**, because the output neurons'
Kenyon-cell connections stay where they are. With two odours that did not matter. With eight memories crowding the same
connections, it is where the pairing could still matter in this fly. A fly whose readout is fixed by each output
neuron's own wiring would ask the question the animal answers, but the vendored file has no transmitter or downstream
partner for an output neuron, so this round does not build one.

## 1. What was measured before this note, and on what (scratch code; not committed)
The task below, scored on 200 scoping lives (seeds 6000001 + 7919 k, the odour round's), with the mushroom round's
recipe, draws 1 to 3:
| odours a life | PLASTIC (the real teachers) | PFAM (the teachers permuted) | the hand rule | the untrained fly |
|---|---|---|---|---|
| 4 (60 trials) | 0.8978, 0.8773, 0.8950 | 0.8788, 0.8935, 0.9068 | 0.6857 | -0.0363 |
| 8 (120 trials) | 0.8848, 0.8818, 0.8840 | 0.8995, 0.8965, 0.9133 | 0.6379 | -0.0042 |
With 2 odours of this kind (drawn independently) the hand rule scores 0.6867 on 20 of the lives. **At 8 odours PFAM was
ahead on all three draws**; the odour round's scoping was 3 of 3 the other way and did not hold, so this registration
leans on it only a little. A training at 8 odours takes about 10 minutes on a busy machine. Every trained fly scored
about 0 with its learning rate at 0: the fly learns within its life or not at all.

## 2. The task (`brain/rl/manyPnOdorEnv.mjs`, new: `brain/rl/pnOdorEnv.mjs`'s odours, not edited, eight at a time)
**Eight odours a life**, each drawn as the odour round drew odour A: each of the 72 glomeruli active **with probability
0.3** at a strength from 0.5 to 1, **each odour independently**. **Half of them, at random, are bad.** Each trial one
of the eight is presented, at random, with the odour round's noise (each active glomerulus at its strength times
(1 + 0.2 x a normal draw)), through the real projection neurons, **the 5 percent of Kenyon cells with the most input
firing**. **15 trials an odour: 120 trials a life.** Approaching a good odour scores +1/60, a bad one -1/60, staying
away 0; the outcome is told at the next trial. The meanings are fixed for the life.

## 3. The arms (12 draws each, **draws 1 to 12**; the mushroom round's fly, recipe and hand rule, on the real projection-neuron wiring)
| arm | the dopamine teachers |
|---|---|
| **PLASTIC** | the real ones |
| **PFAM** | the mushroom round's PFAM (permuted among the output neurons, seed 6000 + draw) |
**The recipe** is the mushroom round's (60 iterations, 16 flies tried, sigma 0.14, lr 0.05, 4 fresh lives each, the best
on the fixed 16). **The audit: 200 lives, seeds 14000001 + 7919 k**, none a life of any earlier round's or of the
scoping. **PLASTIC draw 1 is trained a second time.**

## 4. The readings (alpha 0.01, exact rank sums or sign tests, two-sided, ties against the claim; the checks first)
* **T2: PLASTIC against PFAM** (rank sum): with eight meanings, does the real pairing matter?
* **H: PLASTIC against the hand rule** (sign test), on the audit.
* **Counted: USES** in each arm (the score less the score with p_a at 0, above 0.01).
* **The checks include** that the vendored wiring and the mushroom and odour rounds' files are the ones committed and
  pass their own checks, that each arm's teachers are the mushroom round's, and that the untrained fly and the hand rule
  on the audit are flown here by the round's own task.
* Described: the learning rates, and the share of a life's odour pairs whose Kenyon-cell sets overlap.

## 5. What a reading would say
* T2 CANNOT: **with eight meanings to keep apart, the real pairing still does no better than a permuted one**; what a
  permutation changes, which Kenyon-cell inputs each teacher's neurons sample, does not matter here, and a free readout
  relearns the rest.
* T2 BETTER: the real pairing places each teacher's memories where they crowd each other less.
* T2 WORSE: a permuted pairing does better; the real one, in this fly, crowds its memories more.

## 6. Expectations, written before the code
T2: CANNOT about 55, WORSE 35, BETTER 10. H: **BETTER about 97 percent**. USES 12 of 12 in each arm, about 90.

## 7. What it would and would not mean
About **this fly**: a free readout trained for each draw, one kind of punishment and one of reward, and odours made at
random over the glomeruli. CANNOT would say the pairing does not matter to this fly at this load, not that it does not
matter to the animal, whose output neurons have fixed partners downstream. BETTER or WORSE would say where this fly's
memories crowd, not why the animal's are paired as they are.

## 8. The cost
24 trainings of about 10 minutes each, four at a time, and their audits: about 1 hour 15.

## 9. The run (the gate never runs it and never gives the command the word `run`)
`node tools/ship/takeFlyMushroomMany.mjs run` -> `brain/flyMushroomManyRound.jsonl`, committed byte for byte, whole,
before it is read; `node tools/ship/takeFlyMushroomMany.mjs read` prints the checks and the reading.

## 10. The result (the whole results file committed unread at b5aaccb2, then read once)
One start, 73.5 minutes on four processes, 26 records (24 draws, PLASTIC draw 1 trained a second time, the floors; sha256
c4b98dd773e749ef...). **The checks hold**: the vendored wiring and the mushroom and odour rounds' files as committed and
passing their own checks, each arm's teachers the mushroom round's, PLASTIC draw 1 the same twice. On the audit the
untrained fly scores 0.0118 and the hand rule 0.6566; on average an odour shares 0.1530 of its Kenyon cells with another
odour of its life.
* **T2: THE FLY TAUGHT BY ITS REAL TEACHERS CANNOT BE TOLD APART FROM ONE WHOSE TEACHERS ARE PERMUTED AT LEARNING EIGHT
  ODOURS** (PLASTIC's ranks 135, the middle 150, no ties, p 0.41).
* **H: THE FLY TAUGHT BY ITS REAL TEACHERS LEARNS EIGHT ODOURS BETTER THAN THE RULE SET BY HAND** (12 of 12 above 0.6566,
  p 0.00049).
* **USES: 12 of 12 in each arm.**

| arm | mean (least, most) | sd | with p_a at 0 | a |
|---|---|---|---|---|
| PLASTIC | 0.8908 (0.8750, 0.9055) | 0.0084 | 0.0122 | 1.0878 |
| PFAM | 0.8923 (0.8428, 0.9181) | 0.0185 | 0.0122 | 1.0111 |

**Every expectation came**: T2 CANNOT (55), H BETTER (97), USES 12 of 12 in each arm (90). So, as section 5 put it,
**with eight meanings to keep apart, the real pairing still does no better than a permuted one**. That is the third time,
after random odours and two odours through the projection neurons. The trained fly leaves the hand rule well behind
(0.89 against 0.66), and with its learning rate at 0 it scores about what the untrained fly does.

**Described after the reading, not registered (the gate recomputes it from the records):** draw for draw (the same
draw's trainer noise and lives), PLASTIC is above PFAM on 3 of 12 (draws 4, 10 and 11) and below on 9. As a sign test,
which was not registered, that is p 0.15. PFAM spreads about twice as wide (sd 0.0185 against 0.0084) and holds both the
round's best fly (0.9181, draw 3) and its worst (0.8428, draw 10). With the rate at 0, every fly of both arms scores
between 0.0098 and 0.0148.

**Measured after the reading, not registered (the gate recomputes two of the 24 audits):** the hand rule fixes the
readout by the teachers: v_m is +1/88 for each neuron PPL1 teaches and -1/88 for each PAM teaches.
- **Written for the real teachers and flown on each PFAM draw's fly, it scores 0.1090** on average, from -0.3119
  (draw 2) to 0.3363, and 0 of 12 reach 0.6566. A readout fixed to one pairing fails on another.
- **Written again for each draw's own permuted teachers, it scores 0.6474** on average, from 0.3553 to 0.8185 (draw 5).
  **8 of the 12 permutations score above the real pairing's 0.6566.**

So the question this round left open does have an answer for a readout set by hand: which Kenyon-cell inputs each
teacher's neurons sample moves its score from 0.36 to 0.82, and the real pairing is not among the better ones. It does
not matter to the trained fly. Its score does not follow its permutation's hand-rule score (Spearman -0.03 over PFAM's
12), and every trained fly, PLASTIC or PFAM, is above every one of these hand rules.

**What it does not mean.** Section 7 holds. CANNOT is not equal, and twelve draws a side would miss a small difference.
The hand rule's numbers are measured after the reading, on one formula whose bias and p_a were chosen with the real
teachers on the plain task; that 8 of 12 permutations beat it says this fly's real pairing is not where that formula does
best, not that the animal's pairing is poor. The animal's output neurons have fixed partners downstream, which this fly
does not.
