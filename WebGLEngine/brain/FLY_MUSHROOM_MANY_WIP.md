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
