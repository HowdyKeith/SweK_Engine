# The fly finds home: does the compass it learned carry it back to its door? (registration)

**Registered 2026-11-18, before any code of this round exists.** Keith asked for this round among four ("do all 4
items"). The backlog's `fly-finds-home`: the fly wanders off to forage and steers back to its door by its heading. The
backlog named the heading circuit in `brain/pilotSub*`, whose answer so far was mostly negative, and which another chat
owns. **This round uses the compass round's fly instead** (`brain/FLY_COMPASS_LEARNS_WIP.md`): ring neurons onto compass
neurons, a believed heading phi, and a ring-to-compass map that it learns within a life.

**Said first: no fly is trained here.** The flies are the ones the compass round and the balanced round trained to hold
a course, used as committed (`brain/flyCompassRound.jsonl`, sha256 363cdbf5147d4137...;
`brain/flyCompassBalancedRound.jsonl`, sha256 24a6bb78dfd9a39d...). Both rounds were read before this note, and their
course scores are known. **The question is whether what they learned for one use serves another**: finding home with a
home vector kept in the fly's own heading.

## 1. What was measured before this note, and on what (scratch code; not committed)
**Why the two uses differ.** The compass task scores the true heading against a goal given in the world's frame, so
any error in phi costs. A fly that keeps its home vector in its own phi, and steers home in that same frame, cancels any
constant error in phi. Only the error that changes along the path costs.

**Scoping** (100 lives, seeds 30000001 + 7919 k; draws 1 to 4; the score defined in section 2):
| fly | home | its course score (committed) |
|---|---|---|
| told the true heading | 0.996 (30 lives) | -- |
| PLASTIC (the real wiring) | 0.5644, 0.5649, 0.5655, 0.5605 | 0.6433, 0.6362, 0.6402, 0.6275 |
| PSHUF (a shuffle of it) | 0.5700, 0.5697, 0.5737, 0.5743 | 0.6764, 0.6687, 0.6813, 0.6789 |
| PEVEN (the real partners, even sums) | 0.5729, 0.5722, 0.5737, 0.5658 | 0.6795, 0.6679, 0.6694, 0.6651 |
| PSUM (random partners, the real sums) | 0.5722, 0.5668, 0.5698, 0.5674 | 0.6423, 0.6331, 0.6465, 0.6373 |
| the hand rule | 0.5557 | 0.6674 |
| vision off (path integration alone) | 0.4604 | 0.5041 |
FROZEN draws 1 to 3 scored 0.454, 0.450 and 0.455 on 30 lives. **PSUM holds a course no better than the real wiring,
but in scoping it homes as well as the shuffle.** The differences are small: a few thousandths, against a spread of
about 0.003 within an arm.

## 2. The task (`brain/rl/homeEnv.mjs`, new: the compass life with a position)
**The compass round's life unchanged** (1,500 ticks, two landmarks, a new goal every 50 ticks, gusts from tick 500, the
ring neurons' activity), with **a position**: the fly moves 1 a tick along its true heading, from its door at 0. **From
tick 1,000 it goes home.** Its score for a life is **1 less the closest it comes to its door after tick 1,000, over how
far it was at tick 1,000, held at 0 and above**. A fly that reaches its door scores 1; one that never closes on it
scores 0.

## 3. The fly (`brain/rl/homingFly.mjs`, new: a wrapper round any compass fly)
**Its home vector is the sum of (cos phi, sin phi) over every tick, after each tick's turn.** Until tick 1,000 the fly
steers to the life's goals, as in the compass round. **From tick 1,000 its goal is the direction home in its own frame**,
the angle of minus its home vector. Nothing else about the compass fly changes.

## 4. The arms (12 flies each, **draws 1 to 12**, as committed; nothing trained)
| arm | the fly |
|---|---|
| **PLASTIC** | the compass round's, on the real wiring |
| FROZEN | the compass round's, its map not learning (vision on) |
| PSHUF | the compass round's, on a shuffle |
| PSUM | the balanced round's, random partners given the real sums |
| PEVEN | the balanced round's, the real partners given even sums |
**The floors**: vision off (path integration alone), the start, the hand rule, and the start told the true heading.
**The audit: 200 lives, seeds 50000001 + 7919 k**, none a life of either round's training, audit or scoping.

## 5. The readings (alpha 0.01, exact rank sums or sign tests, two-sided, ties against the claim; the checks first, and a failed check means nothing is weighed)
* **V: PLASTIC against vision off** (sign test): does the compass it learned carry it home better than path
  integration alone?
* **P2: PLASTIC against FROZEN** (rank sum).
* **T1: PLASTIC against PSHUF** (rank sum): does the real wiring's handicap at holding a course carry over to finding
  home?
* **A: PSUM against PLASTIC** (rank sum): with the pull kept, do random partners home better?
* **B: PEVEN against PLASTIC** (rank sum): with the pull taken away, do the real partners home better?
* **H: PLASTIC against the hand rule** (sign test).
* **The checks include** that both committed files are the ones committed and pass their own checks, and that every
  fly's weights are its committed record's.
* Described: the told ceiling, and within each arm whether the flies that held a course best home best (Spearman).

## 6. What a reading would say
* V BETTER: the compass the fly learned for one use carries it home. With the told ceiling at about 1, the rest of
  the shortfall is the heading's error along the path.
* T1 WORSE with A BETTER: in homing, the real wiring's handicap is its partners, not its pull. That is the other way
  round from holding a course, where the pull was all of it.
* T1 CANNOT: the handicap at holding a course does not carry over to finding home.

## 7. Expectations, written before the code
V: **BETTER about 95 percent**. P2: **BETTER about 95**. T1: **WORSE about 70**, CANNOT 30. A: BETTER about 55, CANNOT
45. B: BETTER about 55, CANNOT 45. H: BETTER about 55, CANNOT 40. PLASTIC's mean between 0.55 and 0.58, about 70.

## 8. What it would and would not mean
About **this model**: a home vector kept perfectly in the fly's own frame, by a sum and not by neurons. The animal keeps
its home vector in the fan-shaped body, by circuits this model does not have. The flies were trained to hold a course
and are asked to do something else: a result says what that training gave, not what training for homing would give.
The landmarks are distant: they give heading, not position.

## 9. The cost
No training: 60 flies and 4 floors, each over 200 lives of 1,500 ticks. About 25 minutes on one process, under 10 at
four.

## 10. The run (the gate never runs it and never gives the command the word `run`)
`node tools/ship/takeFlyHome.mjs run` -> `brain/flyHomeRound.jsonl`, committed byte for byte, whole, before it is
read; `node tools/ship/takeFlyHome.mjs read` prints the checks and the reading.
