# The mushroom body learns: does each output neuron's own dopamine teacher matter? (registration)

**Registered 2026-11-18, before any code of this round exists.** Keith asked for this round among four ("do all 4
items"). The backlog's `fly-mushroom-body-learns`: the fly's associative learning, a cue paired with being punished or
fed, learned through the dopamine neurons onto the Kenyon-cell-to-output connections, in a world where which cue means
danger changes between lives. The data is vendored (`vendor/male-cns/mushroom-body-circuit.json`, the male-cns v1.0
mushroom body, gated by `tools/ship/maleCnsMushroomBody-selfcheck.mjs`), and nothing in the tree uses it yet.

## 1. What was measured before this note, and on what (scratch code; not committed)
**The circuit.** 4,064 Kenyon cells; 97 output neurons (MBONs), **91 of them with Kenyon-cell input**; 340 dopamine
neurons (DANs). Both sides are used together: a third of the Kenyon-cell-to-output connections cross sides by soma
label, so an odour is given to both. **The compartment map is clean**: of the 91, 52 get their dopamine input mostly from
the PPL1 family (punishment) and 36 mostly from the PAM family (reward), and 3 from neither. Over the 90 with dopamine input, the
share of each neuron's dopamine synapses from its dominant family averages 0.985. A shuffle of the dopamine-to-output
connections averages 0.80.
**There are no projection neurons in the file**, so an odour here is a random set of Kenyon cells.

**The task, by hand** (100 scoping lives, seeds 3000001 + 7919 k): a life is 30 trials with two odours drawn for that
life, one of them bad. The rule below with each output neuron's valence set from its teacher (PPL1-taught: approach;
PAM-taught: avoid; the known pairing) scores 0.65 to 0.87 on the plain task, depending on its gain, bias and rate, and
0.10 to 0.21 when the meanings swap half way. Approaching everything scores about 0.

**Short trainings** (the recipe below, draws 2 to 5, not this round's audit; 200 scoping lives 6000001 + 7919 k):
| arm | plain task | the meanings swap half way |
|---|---|---|
| PLASTIC (the real teachers) | 0.855, 0.676, 0.811, 0.848 | 0.299, 0.214, 0.250, 0.249 |
| PFAM (pure teachers, given to other neurons) | 0.862, 0.749, 0.805, 0.798 | 0.257, 0.259, 0.304, 0.273 |
| PSHUF (each dopamine connection onto a random neuron) | 0.641, 0.701, 0.761, 0.638 | 0.029, -0.006, 0.065, 0.016 |
| FROZEN (no learning) | -0.016, 0.063, -0.016, 0.019 | 0.007, 0.014, 0.002, -0.006 |
**Mixing the teachers costs most when what was learned must be undone**: after the swap, punishment and reward must
move different output neurons, and with mixed teachers they move the same ones. A training takes about 0.3 minutes.

## 2. The task (`brain/rl/odorEnv.mjs`, new)
A life is **30 trials**. Two odours are drawn for the life: each Kenyon cell is in an odour with probability **0.05**,
the two odours independently; **one of the two is bad**, at random. Each trial one odour is presented, at random: each of
its cells fires with probability **0.8** and every other cell with probability **0.01**. The fly approaches if its
action is above 0. **Approaching the good odour scores +1/15, the bad one -1/15**, and staying away scores 0. The fly is
told the outcome of its last trial: punished, fed, or nothing. **Two tasks**: ONE, the meanings fixed for the life; and
**REV, the meanings swapped from trial 16 on**. The randomness is the life's seed's own.

## 3. The fly (`brain/rl/mushroomFly.mjs`, new; pure: the circuit is given to it)
Each output neuron m's response to a trial is its Kenyon-cell input, sum over firing cells k of w_mk, over what an
untrained fly expects from a random presentation (its summed synapses times 0.05 x 0.8 + 0.95 x 0.01). w starts at the
synapse counts at each life's start. **The drive is bias + sum over m of v_m (response_m - 1); the fly approaches if it
is above 0.** **The teaching**: after an approach, every Kenyon cell that fired in that trial has its connection onto
neuron m multiplied by **1 - min(1, a T_m)**. Here T_m is m's share of dopamine synapses from PPL1 after a punishment,
or from PAM after a feeding. The rate is **a = 0.5 max(0, p_a)**. **Its weights are [v_1..v_91, bias, p_a]**: it learns
which neurons to read offline, and its learning rate. A frozen fly's are [v_1..v_91, bias]. **The start is v 0, bias
0.05, p_a 1.**

## 4. The arms (12 draws each, **draws 1 to 12**, on each task)
| arm | the dopamine-to-output connections the teaching comes from | weights |
|---|---|---|
| FROZEN | none (a 0) | 92 |
| **PLASTIC** | the real ones | 93 |
| **PFAM** | the real ones with the 91 neurons' teacher sets permuted among them (seed **6000 + draw**): each neuron's teachers as pure as before, but another neuron's | 93 |
| **PSHUF** | each real connection, with its synapses, onto a neuron drawn at random among the 91 (seed **5000 + draw**) | 93 |
**The recipe** (the compass round's): `brain/rl/dockPolicy.js` `trainDockES` as it is, 60 iterations, 16 flies tried,
sigma 0.14, lr 0.05, 4 fresh lives each, a battery of 16, the trainer seeded with the draw. **The audit: 200 lives,
seeds 9000001 + 7919 k**, none a training life or a scoping life. **The hand rule**: v_m +1/88 for each PPL1-taught
neuron and -1/88 for each PAM-taught one (by dominant family; 0 for the 3 with neither), bias 0.1, p_a 2. It was the best
of a grid on the scoping lives, on the plain task. **PLASTIC draw 1 of ONE is trained a second time.**

## 5. The readings (alpha 0.01, exact rank sums or sign tests, two-sided, ties against the claim; on each task; the checks first, and a failed check means nothing is weighed)
* **P: PLASTIC against FROZEN** (rank sum): does the fly learn within its life?
* **T1: PLASTIC against PSHUF** (rank sum): does each neuron's own pure teacher matter, against mixed ones?
* **T2: PLASTIC against PFAM** (rank sum): does it matter which neuron gets which pure teacher?
* **H: PLASTIC against the hand rule** (sign test, 12 flies against its audit score).
* **Counted: USES** in each plastic arm: the score less the score with p_a at 0, the rest kept, above 0.01.
* Described: the learning rates, each arm's history, the start's score.

## 6. What a reading would say
* T1 BETTER and T2 CANNOT: **the pure compartment map pays, and in this model what pays is the purity**. Each output
  neuron learning from one family lets punishment and reward move different neurons; which neuron is which is not shown
  to matter.
* T1 BETTER on REV only: the purity pays when learning must be undone, not when it is first made.
* T2 BETTER: the real pairing of teachers with neurons pays beyond its purity. This would be surprising here, since the
  odours are random.

## 7. Expectations, written before the code
ONE: P **BETTER about 95 percent**; T1 BETTER about 60, CANNOT 40; T2 **CANNOT about 80**; H WORSE about 50, CANNOT 40.
REV: P **BETTER about 90**; T1 **BETTER about 90**; T2 **CANNOT about 75**; H BETTER about 55, CANNOT 40. USES 12 of 12
for PLASTIC and PFAM on both tasks (about 90), and for PSHUF on ONE (85); at least 8 of 12 for PSHUF on REV (60).

## 8. What it would and would not mean
About **this model**: an odour is a random 5 percent of the Kenyon cells, with no projection neurons, no APL inhibition
and no KC-to-KC connections. A dopamine family fires whole on an outcome. A synapse count is taken as a strength, and
the teaching as each family's share of a neuron's dopamine synapses. The readout is learned offline, as every fly's
weights in this tree are. A result says what **this** fly needs, not how the animal does it.

## 9. The cost
96 trainings of about 0.3 minutes each, plus their audits (a score, and a score with p_a at 0): about 40 minutes on
one process, under 15 at four.

## 10. The run (the gate never runs it and never gives the command the word `run`)
`node tools/ship/takeFlyMushroom.mjs run` -> `brain/flyMushroomRound.jsonl`, committed byte for byte, whole, before it
is read; `node tools/ship/takeFlyMushroom.mjs read` prints the checks and the reading.
