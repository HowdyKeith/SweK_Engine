# Real odours through the projection neurons: does the real wiring code them better, and does the teachers' pairing matter now? (registration)

**Registered 2026-11-18, before any code of this round exists.** Keith: "Let's do all 5". The mushroom body round
(`brain/FLY_MUSHROOM_BODY_WIP.md`, read at 5f64c614) made each odour a random set of Kenyon cells, because the file had
no projection neurons; it found that **which output neuron gets which pure dopamine teacher did not matter (T2
CANNOT)**, and said why that was no surprise with random odours. The projection neurons onto the Kenyon cells are now
vendored (`vendor/male-cns/pn-kc-circuit.json`, gated by `tools/ship/maleCnsPnKc-selfcheck.mjs`, committed at 9a4adaec).
**This round makes the odours the way the fly does and asks two things**: does the real projection-neuron wiring code
them better than a shuffle of it, and does the teachers' pairing matter now?

## 1. What was measured before this note, and on what (scratch code; not committed)
**The odours** (the task below): with two odours a life sharing about half their active glomeruli (a Jaccard of 0.478
on 100 scoping lives, seeds 3000001 + 7919 k), the two odours' Kenyon-cell sets overlap by 0.393 on the real wiring, and
by 0.393 and 0.398 on two degree-keeping shuffles of it. **The hand rule** (the mushroom round's) scores 0.532 on ONE
on the real wiring and 0.521 on a shuffle (200 scoping lives); 0.141 and 0.140 on REV.

**Short trainings** (the mushroom round's recipe, ONE; draws 1 to 3; 200 scoping lives, seeds 6000001 + 7919 k):
| arm | draw 1 | draw 2 | draw 3 |
|---|---|---|---|
| PLASTIC (the real wiring, the real teachers) | 0.8027 | 0.7923 | 0.8053 |
| SHUFPN (a shuffle of the projection-neuron wiring) | 0.7603 | 0.7600 | 0.7883 |
| PFAM (the real wiring, the teachers permuted among the output neurons) | 0.6760 | 0.7627 | 0.7960 |
A training takes about 2.7 minutes. **The trained flies beat the hand rule by about 0.27**: here the readout is worth
learning.

## 2. The task (`brain/rl/pnOdorEnv.mjs`, new; pure: the wiring is given to it)
The mushroom round's task (30 trials, two odours, one bad, +1/15 and -1/15, the outcome told at the next trial), with
**the odours made through the projection neurons**. An odour is a pattern over **the 72 glomeruli**: odour A has each
glomerulus active **with probability 0.3** at a strength from 0.5 to 1; **odour B is A with each glomerulus drawn again
with probability 0.5**. Each trial one odour is presented: each active glomerulus at its strength times (1 + 0.2 x a
normal draw), held at 0 and above. The projection neurons of a glomerulus fire at its strength (multiglomerular ones not
at all). Each Kenyon cell sums strength x synapses over its projection neurons, and **the 5 percent with the most input
fire** (203 cells: the APL neuron's global inhibition, as a rule). **Task ONE only** (the meanings fixed for the life):
the question is how odours are coded and taught, and ONE costs half of two tasks.

## 3. The arms (12 draws each, **draws 1 to 12**; the mushroom round's fly, recipe and hand rule)
| arm | the projection-neuron wiring | the dopamine teachers |
|---|---|---|
| **PLASTIC** | the real one | the real ones |
| **SHUFPN** | **the real connections with their projection-neuron ends permuted among them** (seed **4000 + draw**): every Kenyon cell keeps its claws and their synapse counts, every projection neuron its number of connections | the real ones |
| **PFAM** | the real one | the mushroom round's PFAM (permuted among the output neurons, seed 6000 + draw) |
**The audit: 200 lives, seeds 11000001 + 7919 k**, none a life of any earlier round's or of the scoping. **PLASTIC draw 1
is trained a second time.**

## 4. The readings (alpha 0.01, exact rank sums or sign tests, two-sided, ties against the claim; the checks first)
* **T1: PLASTIC against SHUFPN** (rank sum): does the real projection-neuron wiring code these odours better?
* **T2: PLASTIC against PFAM** (rank sum): with real odours, does the pairing of teachers with output neurons matter?
* **H: PLASTIC against the hand rule** on this task (sign test).
* **Counted: USES** in each arm (the score less the score with p_a at 0, above 0.01).
* **The checks include** that the vendored wiring is the committed file, and that the mushroom fly and teachers are the
  mushroom round's.
* Described: the rates; the Kenyon-cell overlap of the life's two odours on each wiring.

## 5. What a reading would say
* T1 CANNOT: as the literature has it, the wiring is close to random for coding odours like these.
* T1 BETTER: the real wiring's structure codes these random glomerular odours better than a shuffle keeping every
  degree -- worth a closer look, since the odours here are not natural ones.
* T2 BETTER: **with odours made the fly's way, which output neuron learns from which teacher matters**, where with
  random odours it did not.

## 6. Expectations, written before the code
T1: CANNOT about 50, BETTER 45. T2: CANNOT about 60, BETTER 35. H: **BETTER about 95 percent**. USES 12 of 12 in each arm,
about 85.

## 7. What it would and would not mean
About **these odours**: random glomerular patterns, not natural ones, with the projection neurons firing at the
glomerulus's strength and multiglomerular ones silent. Kenyon cells fire by a global rank, not by APL dynamics. A
synapse count is taken as a strength. A result says how this fly codes these odours, not how the animal codes real ones.

## 8. The cost
36 trainings of about 2.7 minutes, with their audits: about 30 minutes four at a time.

## 9. The run (the gate never runs it and never gives the command the word `run`)
`node tools/ship/takeFlyMushroomOdours.mjs run` -> `brain/flyMushroomOdoursRound.jsonl`, committed byte for byte, whole,
before it is read; `node tools/ship/takeFlyMushroomOdours.mjs read` prints the checks and the reading.

## 10. The result (the whole results file committed at 62dd5be5 before it was read; read once, here)
The run: 38 records (sha256 d45d35df2f7ccbbf...), one start of 49.3 minutes on four processes. **The checks hold**: the
vendored wiring and the mushroom round's file as committed, 36 draws each once with the registered recipe, each arm's
wiring and the mushroom round's teachers, PLASTIC draw 1 the same twice. The floors on the real wiring: the untrained fly
0.0260, the hand rule 0.5003.

* **T1: THE FLY ON THE REAL PROJECTION-NEURON WIRING, TAUGHT BY ITS REAL TEACHERS, CANNOT BE TOLD APART FROM ONE ON A SHUFFLE OF THAT WIRING AT LEARNING THE ODOURS** -- ranks 144 (the middle 150), p 0.76.
* **T2: THE FLY ON THE REAL PROJECTION-NEURON WIRING, TAUGHT BY ITS REAL TEACHERS, CANNOT BE TOLD APART FROM ONE WHOSE PURE TEACHERS ARE OTHER NEURONS' AT LEARNING THE ODOURS** -- ranks 146, p 0.84.
* **H: THE FLY ON THE REAL PROJECTION-NEURON WIRING, TAUGHT BY ITS REAL TEACHERS, LEARNS THE ODOURS BETTER THAN THE RULE SET BY HAND** -- 11 of 12 above its 0.5003, 1 below (p 0.0063).
* **USES: 12 of 12 in every arm** (with p_a at 0 every arm falls to about 0.03).

| arm | mean | sd | least | most | a | the odours' Kenyon-cell overlap |
|---|---|---|---|---|---|---|
| PLASTIC | 0.7509 | 0.1977 | 0.1093 | 0.8550 | 1.04 | 0.4162 |
| SHUFPN | 0.8137 | 0.0405 | 0.7480 | 0.8803 | 1.17 | 0.4221 |
| PFAM | 0.8060 | 0.0445 | 0.7313 | 0.8760 | 1.09 | 0.4162 |

**Every expectation came**: T1 CANNOT (50), T2 CANNOT (60), H BETTER (95), USES 12 of 12 in each arm (85). What section 5
said such a reading would say: **with odours made the fly's way, through the real projection neurons, the real wiring codes
them no better than a shuffle that keeps every degree, and which output neuron learns from which teacher still does not
matter** -- as with the random odours of the mushroom round. The trained flies beat the hand rule by about 0.3, as the
scoping found: here the readout is worth learning.

**Described after the reading, not registered (the gate recomputes it):** PLASTIC draw 10's training never took off -- the
trainer's battery returned between -0.075 and 0.04 for its first 50 iterations and 0.19 at the last -- and the fly scores
0.1093; the rest of PLASTIC lie from 0.7050 to 0.8550. The rank sums weigh it as one low fly, and without it the arms'
medians are 0.8095, 0.8118 and 0.8132. **The scoping's 3 of 3 for the real wiring was the luck of three draws**: on draws 1
to 3, the scoping's, PLASTIC is ahead of SHUFPN again here (0.8550, 0.8513, 0.8503 against 0.7867, 0.8100, 0.8137), and on
draws 4 to 12 it is not; the expectation of BETTER at 45 leaned on those three. The two odours' Kenyon-cell sets overlap a
little more on the shuffles (0.4221) than on the real wiring (0.4162), the opposite of what better coding would need.

**What it does not mean.** About these odours only: random glomerular patterns, the projection neurons firing at their
glomerulus's strength and the multiglomerular ones silent, the Kenyon cells chosen by a global rank. It does not say the
real wiring carries no structure that matters for natural odours, whose glomerular patterns are not random; nor that the
teachers' pairing does not matter for a task with more than one meaning to keep apart.
