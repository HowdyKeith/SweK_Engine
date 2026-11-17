# The compass learns: a fly whose ring-to-compass connections tie the scene to its heading (registration)

**Registered 2026-11-17, before any code of this round exists.** Keith: "Let's continue and do (fly-compass-learns)", after
escape round 11 read P BETTER -- the condition he set for this round ("if that shows anything, then lets also do the compass
circuit"). The data is vendored first and separately: `vendor/male-cns/ring-compass-circuit.json` (282 ring neurons, the 50
compass neurons, 8,847 ring-to-compass connections of at least 5 synapses; `tools/maleCnsCompassRing.py`).

**What the animal does.** The compass (E-PG) neurons carry a bump of activity whose position is the fly's heading. Turning
moves the bump (path integration), which drifts when the fly is pushed without turning itself. The ring neurons see the
scene, and their connections onto the compass neurons are plastic: where a ring neuron and a compass neuron are active
together, the ring neuron's inhibition weakens (Fisher et al. 2019, Kim et al. 2019). Over a few turns this writes a map
from what is seen to where the bump is, and the map then holds the bump to the scene. **A scene new in each life can only
be used by a fly that learns its map in that life** -- that is this round's question.

## 1. What was measured before this note, and on what (scratch code; not committed)
**Three designs failed, and why is in the task.** (a) A fly holding one heading learns a map at one bump position only:
the map tied every view to the same place (every setting scored the same to four places). (b) Gusts from the start
corrupt the map before it is learned: plasticity was worse than none (0.10 against 0.56). (c) The 46 real compass neurons
sit unevenly round the ring (2 to 4 a position), and reading the bump back from them dragged it every tick until path
integration alone scored 0; the bump is therefore kept as an angle, and the compass neurons' visual drive only nudges it.
**What works**: a calm first third of the life in which the fly turns to new goals (the map is learned), then gusts.

**A hill, by hand** (the real wiring, the first 16 audit lives; vision gain c, depression rate a, no recovery):
| c | frozen map | a 0.001 | 0.003 | 0.01 | 0.03 |
|---|---|---|---|---|---|
| 0.00001 | 0.458 | 0.566 | 0.654 | **0.700** | 0.676 |
| 0.00003 | 0.196 | 0.428 | 0.587 | 0.638 | 0.602 |
| 0.0001 | -0.028 | 0.190 | 0.364 | 0.288 | 0.206 |
Path integration alone (c 0) 0.519 on those lives. **A frozen map is worse than not looking**: it is the anatomy's, not
the scene's.

**The trainer climbs it.** Short trainings (40 iterations of this round's 60; draws 901 and 902, not used here; first 40
audit lives): plastic, real wiring 0.6828 and 0.6835 (a 0.014 and 0.016, b 0, c 1.6 and 1.4 x 10^-5); plastic on a shuffle
0.7300; frozen 0.4956, its vision gain falling (1 to 0.31) toward not looking.

**The floors on all 200 audit lives**: told the true heading 0.9085; the plastic fly by hand (a 0.01, b 0, c 0.00001)
0.6674; path integration alone (vision off) 0.5041; the start (vision on, frozen map) 0.4430.

## 2. The task (`brain/rl/compassEnv.mjs`, to be built)
A life of **1,500 ticks**. The fly's true heading starts at 0 and turns by the fly's action each tick, held to 0.2 radians
either way. **Its goal heading** starts at 0 and is drawn anew (uniform) every 50 ticks. **Two landmarks** per life, each at
an azimuth drawn uniform and with a strength drawn from 0.5 to 1.5: the scene is new in every life. **From tick 500, gusts**:
every 40 to 79 ticks the heading is pushed by a normal draw of standard deviation 0.4 radians, which the fly does not feel
except through what it sees. **The reward** is the cosine of the true heading less the goal, from tick 500, over 1,000: a
life's return is the mean alignment in the wind (1 perfect, 0 at random). The observation: each ring neuron's activity, the
goal, and the clock (the tick). A ring neuron's activity is the sum over landmarks of strength x exp(3 (cos(landmark
azimuth less heading less its preferred azimuth) - 1)); **each ring neuron's preferred azimuth is drawn once, uniform, from
seed 4242** -- the connectome gives no receptive fields, and this is a modelling choice.

## 3. The fly (`brain/rl/compassFly.mjs`, to be built)
**The 282 ring neurons onto the 46 core compass neurons** (the 4 EPGt are left out), the arm's connections, each at its
synapses over the mean synapses of the arm's connections. A compass neuron's angle is its glomerulus's: R n at (n - 1) x 45
degrees, L n at (n - 1) x 45 + 22.5. The fly keeps an angle phi, its heading as it believes it, 0 at a life's start. Each tick:
* each compass neuron's visual drive v_k = - (sum over ring neurons of w x activity), and phi moves to the angle of
  **e^(i phi) + c sum_k (v_k - mean v) e^(i angle_k)**;
* every connection **w <- w - a w r_j B_k + b (w0 - w)**, held at 0 and above, with r_j the ring neuron's activity and
  B_k = exp(3 (cos(angle_k - phi) - 1)) the bump at the compass neuron;
* it steers **u = -0.5 sin(phi - goal)**, held to 0.2 either way, and phi moves by u too (it knows its own turns).
At a life's start every w is w0 again. **a = 0.01 max(0, p_a), b = 0.01 max(0, p_b), c = 0.00001 max(0, p_c)**, the trainer's
weights; **the start is p = (0, 0, 1): vision on, the map the anatomy's, no plasticity** (0.4430).

## 4. The arms (12 draws each, **draws 1 to 12**; a draw seeds the trainer and, for PSHUF, the shuffle)
| arm | the fly | weights |
|---|---|---|
| **FROZEN** | the fly with a and b held at 0; its one weight p_c, starting at 1 | 1 |
| **PLASTIC** | the fly of section 3 on the real connections | 3 |
| **PSHUF** | PLASTIC with the connections shuffled: as many, with the same synapse counts, onto pairs drawn without repeats from all 282 x 46 (seed 7000 + draw) | 3 |
**The recipe**: 60 iterations, 16 flies tried, sigma 0.14, lr 0.05, 4 fresh lives each, the best return on a battery of 16
lives kept (brain/rl/dockPolicy.js's trainDockES). **The audit**: 200 lives, 900001 + 7919 k.

## 5. The readings (alpha 0.01, exact, two-sided, ties against the claim; the checks first, and a failed check means nothing is weighed)
* **P: PLASTIC against path integration alone** (the fly with vision off, 0.5041), a sign test of the 12.
* **P2: PLASTIC against FROZEN**, a rank sum.
* **T1: PLASTIC against PSHUF**, a rank sum.
* **H: PLASTIC against the plastic fly by hand** (0.6674), a sign test.
* **Counted: USES** -- the score less the score with a and b set to 0 (c kept) is above **0.01**.
* Described: the weights each arm ends at, the trainer's own history, the floors (with told the true heading).

## 6. What a reading would say
* P BETTER: **a fly whose ring-to-compass connections weaken with co-activity learns, in each life, a map of a scene it has
  never seen, and holds its course in the wind better than one that steers by its turns alone** -- by a reading registered
  before it was run.
* P2 is the same against flies trained the same way without the plasticity. T1 says whether the real wiring matters (the
  wiring is close to all-to-all, so likely not). H says how near the trainer comes to the hand-set rule.

## 7. Expectations, written before the code
P: **BETTER about 85 percent.** P2: BETTER about 85. PLASTIC at least 10 of 12 USES, about 85; PLASTIC's mean between 0.64
and 0.72, about 65. FROZEN's mean under path integration's 0.5041, about 70 (its vision gain still falling at 60
iterations). T1: CANNOT about 50, WORSE about 40. H: CANNOT about 50, BETTER about 35.

## 8. What it would and would not mean
About this task, these 282 ring and 46 compass neurons, one rule with three numbers, and this trainer. **The task was shaped
by scoping** -- three designs failed and are said above -- and the ring neurons' receptive fields are drawn, not measured.
The bump is an angle, not a ring attractor of the compass neurons' own connections. The animal's ring neurons are of many
kinds (some see the sky's polarisation, some respond to self-motion); here every one sees the landmarks alike.

## 9. The cost
The scoping's 40-iteration trainings took about 9.5 minutes (plastic) and 4.6 (frozen), four at a time. At 60 iterations
with the audit: about 15 minutes a plastic training and 8 a frozen one; 36 trainings four at a time, about 2 hours.
Resumable.

## 10. The run (the gate never runs it and never gives the command the word `run`)
`node tools/ship/takeFlyCompass.mjs run` -> `brain/flyCompassRound.jsonl`, committed byte for byte, whole, before it is
read; `node tools/ship/takeFlyCompass.mjs read` prints the checks and the reading.
