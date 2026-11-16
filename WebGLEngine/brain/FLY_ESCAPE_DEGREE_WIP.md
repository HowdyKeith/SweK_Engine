# The fly escapes, round 6: is it the convergence, or the wiring? (registration)

**Registered 2026-11-16, before any code of this round exists.** Keith: "Let's do the next round as you described."

Round 5 (`brain/FLY_ESCAPE_VISION_WIP.md` section 10) gave the registered word `THE REAL ESCAPE CIRCUIT'S WIRING ESCAPES BETTER
THAN A SHUFFLE OF IT` at p 0.0085, and said with it what it wanted before it is believed: the real wiring brings all 40 visual
cells onto the two cells that are read and a free shuffle brings 13 to 20, so the difference may be that convergence and nothing
finer. This is that second round.

## 1. What is the same
Round 5's task, cells, inputs (the looming rate into each LC4 cell, the size into each LPLC2 cell), read-out (the two Giant
Fibers), start (the reflex; a connection at 0.01 x its synapse count), trainer and recipe (round 3's: fresh episodes, a battery
of 200), audit (the same 200 episodes), floors, alpha 0.01, two-sided, ties against the claim.

## 2. What changes
**New draws: 17 to 48, 32 an arm** (round 5 used 1 to 16; a draw is the seed of the starting weights and of the trainer's
noise, and for a shuffled arm of its shuffle, so every shuffle here is new). Three arms, 96 trainings:
| arm | connections | starting strengths |
|---|---|---|
| **GF** | the 369 real ones | 0.01 x the synapse counts |
| **GDEG** | **a shuffle that keeps every cell's count of connections in and its count out**: starting from the real list, many swaps of two connections' sources (a->b, c->d becomes c->b, a->d), a swap refused if it would make a connection from a cell to itself or one that is already there; seeded by the draw | **each strength stays with its place in the list, that is with the cell it lands on** -- so every cell receives exactly the strengths it receives in the real circuit (each Giant Fiber its 21 connections and their synapses), from other cells |
| **GSHUF** | round 5's free shuffle (`shuffledEdges(42, 369, 7000 + s)`), with these draws | the same 369 strengths in its places' order, as in round 5 |

What GDEG keeps: how many connections and how much strength arrive at every cell (so the convergence onto the Giant Fibers),
and how many leave every cell. What it loses: WHICH cells they come from -- that each visual cell reaches its own side's fibre
exactly once, and that LC4 talks to LC4 and LPLC2 to LPLC2 within a side.

## 3. The questions and the reading (each read ONCE from the committed records)
* **D1, THE QUESTION: GF against GDEG** -- the exact rank-sum, 32 against 32. Words: `THE REAL ESCAPE CIRCUIT'S WIRING ESCAPES
  BETTER THAN A SHUFFLE THAT KEEPS EVERY CELL'S COUNTS` / `... ESCAPES WORSE THAN A SHUFFLE THAT KEEPS EVERY CELL'S COUNTS` /
  `... CANNOT BE TOLD APART FROM A SHUFFLE THAT KEEPS EVERY CELL'S COUNTS`.
* **D2, ROUND 5 AGAIN, ON NEW DRAWS AND NEW SHUFFLES: GF against GSHUF** -- the same test. Words: round 5's T1's (`THE REAL
  ESCAPE CIRCUIT'S WIRING ESCAPES BETTER THAN A SHUFFLE OF IT` / `... WORSE ...` / `... CANNOT BE TOLD APART FROM A SHUFFLE OF IT`).
* **D3: GDEG against GSHUF** -- the same test. Words: `KEEPING EVERY CELL'S COUNTS ESCAPES BETTER THAN A FREE SHUFFLE` /
  `KEEPING EVERY CELL'S COUNTS ESCAPES WORSE THAN A FREE SHUFFLE` / `KEEPING EVERY CELL'S COUNTS CANNOT BE TOLD APART FROM A FREE SHUFFLE`.
* T0 (the 32 GF flies against the reflex) and T3 (all 96 against it): the sign tests, with round 5's words.
* **Described, not tested: how many of an arm's 32 trainings FAIL, a failure being a score below 0.72** (round 5: GF 0 of 16,
  GSHUF 4 of 16; the line is set here, before the round, between round 5's two clusters); each arm's mean, sd, least and most.

**How the three readings go together, said before:**
* D2 BETTER and D1 CANNOT: round 5 holds up, and it was the convergence. Nothing finer was shown.
* D2 BETTER and D1 BETTER: round 5 holds up, and where the connections come from matters beyond their counts. That would be
  the first such result here, and it would still be one circuit, one task, one trainer.
* D2 CANNOT: round 5 did not replicate on new draws, whatever D1 says; its p of 0.0085 was the luck of 16 shuffles.

## 4. Checks, made first; a failure is the first line and the reading is NOT WEIGHED
Round 5's for 96 records (each once, the recipe, weight counts and wiring -- a GDEG draw's wiring its own shuffle, with every
cell's counts in and out the real ones --, GF draw 17 the same twice, a history, the registered floors, the untrained fly of
every arm the reflex to the bit); and the gate re-audits two records an arm.

## 5. Expectations, written before the code
D2: BETTER about 55 percent, CANNOT about 43. **D1: CANNOT BE TOLD APART about 62 percent, BETTER about 30, WORSE about 8.**
D3: BETTER about 40, CANNOT about 55. Failures: GF 0 or 1 of 32 (about 80 percent); GSHUF between 4 and 12 (about 65); GDEG
3 or fewer (about 60). T0 and T3 BETTER: about 90 each.

## 6. What a reading would and would not mean
Section 3 says how the words go together. None of it is about the animal: the cells are rectified sums, each visual cell is
given one number where the real one looks at its own patch of the eye, these 40 are a fifth of the visual input a Giant Fiber
has, and the strengths are learned from their starting counts by a trainer no fly has.

## 7. The cost
Round 5 measured 31 minutes for 64 trainings, eight at a time, alone. 96 trainings of the three connected arms: about an hour.
Resumable.

## 8. The run (to be written; the gate never runs it and never gives the command the word `run`)
`node tools/ship/takeFlyEscapeDegree.mjs run` -> `brain/flyEscapeDegreeRound.jsonl`, committed byte for byte, whole, before it
is read; `node tools/ship/takeFlyEscapeDegree.mjs read` prints the checks and the reading.
