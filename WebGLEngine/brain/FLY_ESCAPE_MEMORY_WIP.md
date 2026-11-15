# The fly escapes, round 4: memory between ticks (UNNUMBERED; REGISTERED 2026-11-15 BEFORE ITS CODE IS WRITTEN, BEFORE ANY SUCH TRAINING IS RUN, AND BEFORE ROUND 3 IS RUN)

Keith, 2026-11-15: "Let's do Escape". This is the second of the open Escape items. Every fly so far forgets everything between
ticks: its network runs three internal steps on the 13 numbers of one tick and starts again from nothing on the next
(`brain/FLY_ESCAPE_WIP.md` section 2 (b)). So the 313 connections among the circuit's cells have only ever mixed one tick's
numbers; they have never carried anything through time, which is what such connections do in an animal. This round lets them.
Round 3 (`brain/FLY_ESCAPE_FRESH_WIP.md`) is registered and its tool is built and not yet run; nothing of this round exists.

## 1. What is the same and what changes
Round 3's, to the number: the environment, the reflex start (the fly is half the reflex plus its network, the output layer at
zero), the report "return", the trainer with fresh episodes each iteration and a battery of 200, draws s = 1 to 16,
`maxSteps 160, iters 150, pop 96, sigma 0.14, lr 0.05, trainEps 8`, the 200 audit episodes, the floors, the weight counts.

**Changed: a unit's activity at the end of a tick is carried into the next.** Each tick a unit's input is what the encoder gives
it from the 13 numbers **plus half its own activity at the end of the tick before** (held to at most 8, so nothing can run
away); then the same three steps along the circuit's connections. At the first tick of an episode nothing is carried. No weight
is added: the half is fixed, so every arm has the weight count it had.
* **FLY, SHUF, FISH:** what is carried is then spread along the arm's own connections at every tick -- the wiring routes memory.
* **PLAIN:** it has no connections among its units, so each unit carries only its own past (a slow average of its own input).
* **The MLP is not in this round:** it has nothing to carry without new weights. Round 3's MLP stands as the net with no memory.
So this round is 4 arms x 16 draws = 64 trainings.

**Said plainly:** this is the most favourable case for the wiring that this model can offer -- the only arms whose memory can
move from cell to cell are the ones with connections, and FLY and SHUF differ only in where those connections are.

## 2. The questions and the reading (each read ONCE from the committed records; alpha 0.01, two-sided, a tie counted against the claim)
* **M3, every fly against its round 3 self** (the same arm, the same draw, no memory) -- the exact sign test over the 64 pairs.
  Words: `MEMORY BETWEEN TICKS ESCAPES BETTER THAN NONE` / `MEMORY BETWEEN TICKS ESCAPES WORSE THAN NONE` /
  `MEMORY BETWEEN TICKS CANNOT BE TOLD APART FROM NONE`.
* **T1, THE WIRING, WITH MEMORY: FLY against SHUF** -- the exact rank-sum, 16 against 16, the earlier words. Whether it is asked
  of flies that do the task is decided as in round 2 (both arms' means at or above the reflex's).
* **T3 (all 64 against the reflex), T0 (FLY against the reflex), T2 (FLY against PLAIN)** -- the earlier tests and words. T2 is
  here also "memory that moves between cells against memory that stays in each".
* Described, not tested: each arm's mean beside its round 3 mean; lives, time fed, passes left for, strikes that catch; the gain
  on the battery beside the gain on the audit.

## 3. Checks, made first; a failure is the first line and the reading is NOT WEIGHED
Round 3's for 64 records (each once, this round's recipe, weight counts and wiring, FLY draw 1 the same twice, a history, the
registered floors, the untrained fly of every arm the reflex to the bit); round 3's file holds the 64 draws of these four arms;
and the gate re-audits two records an arm.

## 4. Expectations, written before the code
M3: BETTER about 35 percent, CANNOT about 45, WORSE about 20 (memory is also 64 more ways for a noisy trainer to go wrong).
**T1: CANNOT BE TOLD APART about 70 percent, BETTER about 15, WORSE about 15.** T2: CANNOT about 60, BETTER about 20 (memory
that moves might beat memory that stays), WORSE about 20. T3: BETTER about 70. Some arm's mean above 0.70: about 25 percent.

## 5. What a reading would and would not mean
T1 BETTER here would be the first sign that where the fly's connections are matters for anything in this model, on its own
circuit's job with memory to route, and would want a second round (another shuffle family) before it is believed. T1 CANNOT is
the ninth such reading, in the case most favourable to the wiring that this model has. Neither is about the animal: there are
still no visual cells feeding the circuit (the tree does not hold them; see the backlog), and a carried half is not a neuron.

## 6. The cost
64 trainings at round 3's cost each: about four fifths of round 3. Resumable.

## 7. The run (to be written; the gate never runs it and never gives the command the word `run`)
`node tools/ship/takeFlyEscapeMemory.mjs run` -> `brain/flyEscapeMemoryRound.jsonl`, committed byte for byte before it is read;
`node tools/ship/takeFlyEscapeMemory.mjs read` prints the checks and the reading.
