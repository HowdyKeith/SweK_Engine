# The fly escapes, round 9: does a fly that habituates beat one that cannot? (registration)

**Registered 2026-11-17, before any code of this round exists.** Keith: "Let's pull in The mushroom body, and do the
habitation round and if that shows anything, then lets also do the compass circuit", and after the scoping below: "go ahead
with the decoy habituation round".

**Said first: no fly in this tree has ever learned during its life.** Every fly's weights are found offline and then
frozen. Round 4 found memory between ticks did not help, because every episode comes from one unchanging world. A fly that
learns while it lives can only beat a frozen one where the world changes from one life to the next. This round is the
first in which the fly's connections change while it flies.

## 1. What was measured before this note, and on what (scratch code; not committed)
**A world that differs in its share of strikes: nothing to learn.** On 300 held-out episodes a world (4000001 + 13 k),
the real Giant Fiber circuit fly of rounds 5 and 6 (round 3's recipe), trained on its own world or on all three mixed:
| world: share of strikes | trained on the mix (2 draws) | trained for that world (best of 2) |
|---|---|---|
| 0.1 | 0.9473 | 0.9309 |
| 0.5 | 0.7573 | 0.7564 |
| 0.9 | 0.5867 | 0.5920 |
A trained fly tells a strike from a pass well enough that one fly is about the best in every world. **Not run.**

**A world with decoys: much to learn.** In a **decoy life** every mover is drawn as a strike and flies as one -- it comes
straight at the fly -- but cannot catch it: it is gone when it reaches the fly. In an **ordinary life** the movers are the
escape task's (half strikes, half passes). A decoy looks exactly like a strike. On the same held-out episodes:
| fly | in decoy lives | in ordinary lives | the two, evenly |
|---|---|---|---|
| never flees (written by hand) | 1.0000 | 0.2925 | 0.646 |
| the reflex (written by hand) | 0.5809 | 0.6671 | 0.624 |
| trained for ordinary lives (2 draws, alike) | 0.5702 | 0.7561 | **0.663** |
| trained for decoy lives (2 draws) | 1.0000 | 0.2925 | 0.646 -- it never flees |
| **trained on the two mixed (4 draws)** | 1.0000 | 0.2925 | **0.646 -- every one never flees** |
| each kind's own specialist, told the kind | 1.0000 | 0.7561 | 0.878 |
A fly with fixed weights cannot tell the kinds of life apart, and the trainer, given both, settles every time on never
fleeing. Knowing the kind of life would be worth about 0.2 -- against the thousandths that separated arms in rounds 6 to 8.

**Habituation can find much of it.** A hand-written habituating reflex: the reflex, whose drive g falls by a share alpha at
the start of each collision-course looming it sees, recovers beta a tick toward 1, and flees only while g is above theta;
g starts at 1 at the start of a life and is carried through it. A decoy life brings about twice the collision-course
loomers of an ordinary one. On 60 held-out lives (5000001 + 29 k; a life's episodes are its seed x 16 + 0, 1, 2, ...), in
lives of four episodes:
| fly | decoy lives | ordinary lives | evenly |
|---|---|---|---|
| reflex | 0.5848 | 0.6639 | 0.6244 |
| never flees | 1.0000 | 0.2721 | 0.6361 |
| **habituating reflex (alpha 0.1, beta 0.002, theta 0.5)** | 0.8757 | 0.6169 | **0.7463** |
| told the kind (never flees in decoy lives, the reflex in ordinary) | 1.0000 | 0.6639 | 0.8320 |
The habituating reflex is the best of 60 settings on those 60 lives, so its number is flattered; lives of six episodes gave
0.7493. It is fixed now as this round's hand floor, with those three numbers, before any training.

## 2. The task (`brain/rl/lifeEnv.mjs`, to be built)
* **A life** is four episodes of the escape task (`brain/rl/escapeEnv.mjs`, unchanged), 640 ticks. Its kind -- decoy or
  ordinary -- is drawn once from the life's seed (evenly); its episodes are the seeds `life x 16 + 0..3`. Being caught ends
  an episode, not the life. **A life's return is the mean of its four episodes' returns.**
* The decoy life's env is EscapeEnv with every mover drawn as a strike (the same draws in the same order: only the one draw
  that chooses the kind is answered "strike") and a strike that reaches the fly gone and the fly not caught. **With the kind
  "ordinary" an episode is EscapeEnv's own, to the bit** (the gate holds it).
* The observation is EscapeEnv's, but for its eleventh number (the clock), which is the tick of the LIFE over 640: it reads
  0 at a life's first tick and only there. No fly of these rounds reads that number with its network; a habituating fly
  starts its life afresh when it reads 0.

## 3. The arms (12 draws each, draws 1 to 12; a draw seeds the starting weights and the trainer)
| arm | the fly | weights |
|---|---|---|
| **FROZEN** | round 5's real Giant Fiber circuit fly: the 42 real cells, looming into LC4, size into LPLC2, read from the two Giant Fibers, a connection at 0.01 x its synapse count, inside the reflex wrapper | 454 |
| **HAB** | the same, and **the connections onto the two Giant Fibers habituate**: each has an efficacy g, 1 at the start of a life; every tick g <- g - a g h + b (1 - g), clamped to 0..1, h the connection's source cell's activity; the connection's weight is multiplied by g. a = 0.5 max(0, p_a) and b = 0.01 max(0, p_b), two more weights the trainer moves, first in the list. They start at 0, so **at the start HAB is FROZEN to the bit** (and both are the reflex) | 456 |
| **HSHUF** | HAB with round 5's free shuffle of the connections (`shuffledEdges(42, 369, 7000 + draw)`); what habituates is the connections the shuffle puts onto the two Giant Fibers | 456 |
**The recipe is round 3's** (150 iterations, 96 flies tried, sigma 0.14, lr 0.05, fresh episodes, a battery of 200), a
trainer's episode being a LIFE: 8 lives an iteration, 200 in the battery, the best battery return kept. **Audit: 200
lives**, life seeds 900001 + 7919 k (the escape rounds' audit seeds, as life seeds); each arm's 12 flies on the same lives.

## 4. The readings (alpha 0.01, exact, two-sided, ties against the claim; the checks first, and a failed check means nothing is weighed)
* **P: HAB against FROZEN**, a rank sum of 12 against 12: does a fly whose connections habituate do better over a life than
  one whose cannot?
* **T1: HAB against HSHUF**, a rank sum: does the real wiring habituate to better use than a shuffle of it?
* **H: HAB against the hand-written habituating reflex**, a sign test of the 12 against its audit score.
* Described: each arm's score in decoy and in ordinary lives; **the signature of learning** -- in decoy lives, the fourth
  episode's mean return less the first's (a fly that learns does better later in its life; a frozen fly cannot); a and b as
  trained; how many flies of each arm never flee (an ordinary-life score under 0.35); the floors -- the reflex, never
  fleeing, the hand habituating reflex, and told the kind.

## 5. What a reading would say
* P BETTER, with the signature: a circuit whose connections onto the Giant Fibers habituate learns, within a life, that
  the looming in a decoy life is harmless -- the first thing in this tree that learns while it lives.
* P CANNOT BE TOLD APART, with both arms never fleeing: the trainer found never fleeing first and plasticity did not lead
  it off; the scoping says the gain is there, so that is about the trainer, not the habituation.
* T1 and H are about which wiring and how near the hand rule; nothing about the animal.

## 6. Expectations, written before the code
P: **CANNOT BE TOLD APART about 55 percent, BETTER about 40, WORSE about 5.** FROZEN: at least 10 of 12 never flee, about
85. HAB: at least 3 of 12 learn (an ordinary-life score above 0.5 and a decoy-life fourth episode above its first), about
45. T1: CANNOT about 75. H: WORSE about 65.

## 7. What it would and would not mean
About this task, these 42 cells given one number each, one habituation rule with two numbers, and this trainer. The decoy
world is made for habituation to pay; that it pays here would say a fly CAN learn this, not that the fly does. Habituation
of the escape response is real in the animal; where it sits and how it is ruled are not modelled from data here.

## 8. The cost
A training scores lives of four episodes: about four times an escape training, about 8 to 9 minutes. 36 trainings, four at
a time: about 80 minutes. Resumable.

## 9. The run (the gate never runs it and never gives the command the word `run`)
`node tools/ship/takeFlyEscapeHabituate.mjs run` -> `brain/flyEscapeHabituateRound.jsonl`, committed byte for byte, whole,
before it is read; `node tools/ship/takeFlyEscapeHabituate.mjs read` prints the checks and the reading.
