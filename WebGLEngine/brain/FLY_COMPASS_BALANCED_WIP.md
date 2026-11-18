# The compass, balanced: is the real wiring's handicap its uneven summed inputs? (registration)

**Registered 2026-11-18, before any code of this round exists.** Keith: "Let's do fly-compass-input-balanced next". The
compass round (`brain/FLY_COMPASS_LEARNS_WIP.md`, read at 47e46680) found **the real wiring WORSE than a shuffle of it**
(T1: every PLASTIC fly below every PSHUF one). Measured after that reading, not registered: on the real wiring the 46
compass neurons' summed ring inputs are uneven (coefficient of variation 0.153; the shuffles' 0.061), unevenly enough round
the ring that whatever the scene the drive pulls the believed heading toward about 65 degrees, at 536 in the drive's units
(the twelve shuffles 21 to 127). **This round asks whether that pull is the handicap**, from both sides: random partners
given the real sums, and the real partners given even sums.

**Said first: the two arms this round is weighed against were run and read in the compass round.** Their records are used
as committed (`brain/flyCompassRound.jsonl`, sha256 363cdbf5147d4137..., PLASTIC mean 0.6464, PSHUF 0.6765), and this
registration is written knowing those numbers. Only the two new arms are run here, with the same recipe, draws, audit,
fly and task.

## 1. What was measured before this note, and on what (scratch code; not committed)
**A shuffle by swaps failed.** Swapping the compass partners of two connections with the same synapse count keeps every
neuron's summed input and output exactly, but the real wiring fills 68 percent of the possible pairs, so 3 percent of swaps
find both new pairs free; after 20 sweeps 12.5 percent of connections sat on a pair the real wiring lacks, and **its weights
correlated 0.933 with the real wiring's** (a plain shuffle: 0.017). It would have been the real wiring under another name.
**22 of the 282 ring neurons have no connection onto a core compass neuron**; most of the other 260 reach 41 of the 46.

**The two constructions that work**, and the untrained flies (vision on, the frozen map, the 200 audit lives):
| wiring | partners | summed inputs | its weights' correlation with the real | pull | untrained |
|---|---|---|---|---|---|
| the real wiring | real | real | 1 | 536 | 0.4430 |
| **PSUM** (draws 1, 2, 3) | random, over the 260 | real, to 1e-15 | 0.521 | 536 | **0.4357, 0.4413, 0.4450** |
| **PEVEN** | real | even | 0.979 | 0 | **0.5019** |
| the plain shuffle (draw 1) | random, over the 282 | uneven at random | 0.017 | 67 | 0.5029 |
Vision off scores 0.5041. **Untrained, the pull accounts for the whole difference, both ways.** PSUM's 0.521 is what the
summed inputs and outputs carry by themselves on a wiring this close to all-to-all.

**Short trainings** (40 iterations of this round's 60; draws 901 and 902, not used here; the first 40 audit lives), beside
the compass round's scoping on the same lives: PSUM **0.6761 and 0.6756**, PEVEN **0.7266 and 0.7140**; PLASTIC 0.6828
and 0.6835, the plain shuffle 0.7300. Every one of the four kept b at 0.

## 2. The arms (12 draws each, **draws 1 to 12**, the compass round's recipe, fly and task unchanged)
| arm | the fly's connections | weights |
|---|---|---|
| **PSUM** | 8,836 connections, the real synapse counts in the real order, onto pairs drawn without repeats from **the 260 ring neurons with a real connection** x 46 (seed **9000 + draw**); then **3,000 sweeps** of: every ring neuron's strengths scaled to its real summed synapses, then every compass neuron's | 3 |
| **PEVEN** | the real connections, **each strength times the mean summed input over the 46 compass neurons, over its own compass neuron's**: every compass neuron's summed input the same, the pull 0 | 3 |
| PLASTIC | the compass round's, as committed | -- |
| PSHUF | the compass round's, as committed | -- |
A draw seeds the trainer (and PSUM's shuffle). **The recipe**: 60 iterations, 16 flies tried, sigma 0.14, lr 0.05, 4 fresh
lives each, a battery of 16. **The audit**: the compass round's 200 lives. **PSUM draw 1 is trained a second time.**

## 3. The readings (alpha 0.01, exact rank sums, two-sided, ties against the claim; the checks first, and a failed check means nothing is weighed)
* **A: PSUM against PSHUF** -- the pull given to random partners.
* **B: PEVEN against PLASTIC** -- the pull taken from the real partners. **B is the cleaner of the two**: PEVEN and PLASTIC
  differ only in each compass neuron's scale, while PSUM and PSHUF also differ in which ring neurons connect (PSHUF uses
  all 282) and in how spread the strengths are (PSUM's run from 0.04 to 268, the real 5 to 75).
* **C: PSUM against PLASTIC** and **D: PEVEN against PSHUF** -- whether, with the pull matched, the partners still matter.
* **Counted: USES** in each new arm (the score less the score with a and b at 0, c kept, above 0.01).
* **The checks include** that the compass round's file is the committed one and passes its own checks, and that this
  round's start and vision-off floors equal the compass round's to the bit (the same fly, task and audit).
* Described: the weights each arm ends at, the trainer's history, the untrained PSUM (draw 1) and PEVEN flies.

## 4. What a reading would say
* A WORSE and B BETTER: **the real wiring's uneven summed inputs onto the compass neurons are a handicap in this model,
  shown from both sides**: given to random partners they cost, taken from the real partners they pay.
* C and D CANNOT: with the pull matched, the real partners can be told neither better nor worse than random ones -- the pull
  would be all of T1, as far as 12 draws can tell. C or D WORSE or BETTER: the partners matter too.

## 5. Expectations, written before the code
A: **WORSE about 85 percent.** B: **BETTER about 85.** C: CANNOT about 55, WORSE about 35. D: CANNOT about 55, WORSE
about 35. USES 12 of 12 in each new arm, about 85. PSUM's mean between 0.62 and 0.66, about 65; PEVEN's between 0.65 and
0.70, about 65 (the compass round's full trainings scored about 0.93 to 0.95 of its short ones).

## 6. What it would and would not mean
About this model: the bump is an angle, not the compass neurons' own ring attractor (with the P-EN and Delta7 neurons the
animal has, which may hold the bump against such a pull); the ring neurons' receptive fields are drawn; a synapse count is
taken as a strength. A handicap here says the uneven inputs cost **this** fly, not that they cost the animal.

## 7. The cost
The short trainings took 7.4 to 8.9 minutes four at a time; at 60 iterations with the audit, about 12 to 15 minutes each.
24 trainings four at a time, the recheck and the floors: about 1 hour 50. Resumable.

## 8. The run (the gate never runs it and never gives the command the word `run`)
`node tools/ship/takeFlyCompassBalanced.mjs run` -> `brain/flyCompassBalancedRound.jsonl`, committed byte for byte, whole,
before it is read; `node tools/ship/takeFlyCompassBalanced.mjs read` prints the checks and the reading.

## 9. The result (the whole results file committed unread at e8245294, then read once)
The run started twice: the first start was lost to a container restart before it wrote a line, and the second wrote all 26
records (24 draws, PSUM draw 1 trained a second time, the floors; sha256 24a6bb78dfd9a39d...). **The checks hold**: the
compass round's file is the committed one and passes its own checks, PSUM draw 1 came out the same twice, and vision off
(0.5041) and the start (0.4430) are the compass round's to the bit.
* **A: A SHUFFLE GIVEN THE REAL WIRING'S SUMMED INPUTS DOES WORSE THAN A PLAIN SHUFFLE** -- ranks 78, the fewest there can
  be: every PSUM fly below every PSHUF one, p 7.4e-7.
* **B: THE REAL WIRING WITH ITS SUMMED INPUTS EVENED DOES BETTER THAN THE REAL WIRING** -- ranks 222, the most there can
  be: every PEVEN fly above every PLASTIC one, p 7.4e-7.
* **C: A SHUFFLE GIVEN THE REAL WIRING'S SUMMED INPUTS CANNOT BE TOLD APART FROM THE REAL WIRING** -- ranks 135, p 0.41.
* **D: THE REAL WIRING WITH ITS SUMMED INPUTS EVENED CANNOT BE TOLD APART FROM A PLAIN SHUFFLE** -- ranks 125, p 0.16.
* USES 12 of 12 in each new arm.

| arm | mean | sd | least | most | a | c | with a and b at 0 |
|---|---|---|---|---|---|---|---|
| PSUM (random partners, the real sums) | 0.6434 | 0.0061 | 0.6331 | 0.6553 | 0.0165 | 1.62e-5 | 0.3645 |
| PLASTIC (the compass round's) | 0.6464 | 0.0095 | 0.6275 | 0.6630 | 0.0160 | 1.63e-5 | 0.3688 |
| PEVEN (the real partners, even sums) | 0.6719 | 0.0061 | 0.6642 | 0.6836 | 0.0115 | 2.10e-5 | 0.4963 |
| PSHUF (the compass round's) | 0.6765 | 0.0075 | 0.6664 | 0.6908 | 0.0114 | 1.97e-5 | 0.4866 |

**Every expectation came**: A WORSE and B BETTER (each about 85), C and D CANNOT (each about 55), USES 12 of 12 in both
arms (about 85), PSUM's mean in 0.62 to 0.66 and PEVEN's in 0.65 to 0.70 (each about 65). So, as section 4 put it, **the
real wiring's uneven summed inputs onto the compass neurons are a handicap in this model, shown from both sides**: given
to random partners they cost, and taken from the real partners they pay. With the pull matched, the real partners can be
told neither better nor worse than random ones: the pull is all of T1, as far as 12 draws can tell.

Described, not registered: **the trained rates follow the sums, not the partners.** PSUM's a and c (means 0.0165 and
1.62e-5) are PLASTIC's (0.0160 and 1.63e-5); PEVEN's (0.0115 and 2.10e-5) are near PSHUF's (0.0114 and 1.97e-5). With a and
b at 0, PSUM falls to PLASTIC's level and PEVEN to PSHUF's. The recovery rate went to 0 in all 24, as it did in all 24
plastic flies of the compass round. Within each arm, the further the trainer took c the lower the score (Spearman -0.40 in
PSUM, -0.72 in PEVEN; PLASTIC's was -0.90): the trainer's overshoot shows here too. It is the next round's question.

Measured after the reading (not registered; the gate recomputes it): **every PEVEN fly is above every PSUM fly** (the
least PEVEN fly 0.6642, the most PSUM fly 0.6553). Of the compass round's gap of PSHUF over PLASTIC (0.0301), evening the
real wiring's sums closes 0.0255 of it (85 percent), and giving the real sums to random partners opens 0.0332 (110 percent).
All 12 PSUM wirings carry the real wiring's pull (536.31) to within 1e-9; PEVEN's pull is under 1e-9. Whether PEVEN's
shortfall of 0.0046 under PSHUF (D, p 0.16) is the real partners or noise is not tested; 12 draws cannot tell a difference
of a few thousandths.

**What it does not mean.** Section 6 holds: the bump here is an angle, not the compass neurons' own ring attractor (with the
P-EN and Delta7 neurons the animal has, which may hold the bump against such a pull); the ring neurons' receptive fields are
drawn; a synapse count is taken as a strength. The uneven inputs cost **this** fly, not that they cost the animal. CANNOT
is not "the same": C and D say only that no difference was found at this size. And the uneven sums may be real anatomy
for a reason this task does not ask about: a heading the fly prefers, or an input this model leaves out.
