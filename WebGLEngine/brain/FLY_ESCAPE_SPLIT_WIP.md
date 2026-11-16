# The fly escapes, round 7: which part of the counts? (registration)

**Registered 2026-11-16, before any code of this round exists.** Keith: "Let's do Escape round 7."

Round 6 (`brain/FLY_ESCAPE_DEGREE_WIP.md` section 9) said round 5's result is the convergence: a shuffle that keeps every
cell's count of connections in and out (GDEG) escapes better than a free shuffle (GSHUF; p 0.0046) and cannot be told from
the real wiring (p 0.98). "The counts" is three things at once. This round takes them apart.

## 1. What was measured before this note, and on what
Nothing was trained. From the wiring file alone (`brain/gfVisualTopology.mjs`, another chat's, used unmodified): 42 cells,
369 connections, 3,894 synapses. **42 of the 369 connections land on the two Giant Fibers, 21 on each, and carry 2,357 of
the synapses -- 61 percent.** Every other cell receives 4 to 13 connections and 8 to 85 synapses. Over the 32 free shuffles
this round will draw (seeds 7049 to 7080), the two fibres receive 9 to 28 connections (mean 16.8) carrying 49 to 360
synapses (mean 159): a fifteenth of the real drive. So the first suspect is the drive onto the two cells that are read.

## 2. What is the same
Round 6's task, cells, inputs, read-out, start (the reflex; a connection at 0.01 x a synapse count), trainer, recipe, audit,
floors, the line for a failed training (a score below 0.72), alpha 0.01, two-sided, exact, ties against the claim.

## 3. What changes
**New draws: 49 to 80, 32 an arm.** Five arms, 160 trainings. In every arm the 369 strengths are the real ones, in the
list's order; a shuffle changes where a connection's ends are.
| arm | what a connection keeps | so each cell keeps |
|---|---|---|
| **GDEG** | round 6's: its target; sources swapped between connections (seed 9000 + s) | its count in, its count out, the strengths it receives |
| **GIN** | its target; its source is drawn anew from the other cells (seed 11000 + s) | its count in and the strengths it receives -- so the fibres' 21 and their 61 percent -- and not its count out |
| **GOUT** | its source; its target is drawn anew (seed 12000 + s) | its count out and the strengths it sends, and not its count in |
| **GGF** | the 42 connections onto the fibres are the real ones, whole; the other 327 are placed freely among the places not onto a fibre (seed 13000 + s) | nothing, except the two fibres, which keep exactly their real inputs |
| **GSHUF** | nothing: round 5's free shuffle (seed 7000 + s) | nothing |
No connection is from a cell to itself and none is in a list twice. The real wiring is not an arm: round 6 could not tell it
from GDEG, and GDEG here is the control that says whether round 6's difference comes again.

## 4. The readings (rank sums of 32 against 32)
- **R0: GDEG against GSHUF** -- round 6's D3 on new draws. **If R0 is CANNOT BE TOLD APART, the split is asked of a
  difference that did not come again, and the result section says that first.**
- **K1: GIN against GSHUF. K2: GOUT against GSHUF. K3: GGF against GSHUF.**
- T0 (the 32 GDEG flies against the reflex) and T3 (all 160 against it), as in every round.
- Described, not tested: each of GIN, GOUT and GGF beside GDEG (the rank sum and its p, printed and given no word); the
  failed trainings an arm; the means, medians and spreads.

Four tests at 0.01 each: one of them speaking by chance alone is about 4 in 100, and is said with any single BETTER.

## 5. What the readings would say together
| R0 | K1 (in) | K2 (out) | K3 (fibres) | said |
|---|---|---|---|---|
| BETTER | BETTER | CANNOT | BETTER | it is what the fibres receive; the counts elsewhere were not shown to matter |
| BETTER | BETTER | CANNOT | CANNOT | it is the counts in over the whole circuit, more than the fibres' own inputs |
| BETTER | CANNOT | CANNOT | BETTER | it is WHICH cells reach the fibres (GGF keeps them, GIN redraws them) |
| BETTER | CANNOT | BETTER | CANNOT | it is the counts out -- not what section 1 expects |
| BETTER | CANNOT | CANNOT | CANNOT | the difference needs both counts together; no one part carries it |
| CANNOT | any | any | any | round 6's difference did not come again on new draws; a K that speaks alone is weighed as one of four |
Any other pattern is reported as it is and given no sentence from this table.

## 6. Expectations, written before the code
R0: **BETTER about 50 percent** (round 6's p was 0.0046 on a difference of a thousandth; an exact repeat is a coin).
K3: BETTER about 40. K1: BETTER about 40. K2: CANNOT about 85. T0 and T3: BETTER about 90 each. The first row of section
5's table: about 20. R0 CANNOT: about 50. Failed trainings: GDEG, GIN and GGF 0 or 1 each (about 70); GSHUF and GOUT each
between 1 and 6 (about 60).

## 7. What it would and would not mean
It is about this task, these 42 cells given one number each, and this trainer. The differences round 6 found are small (a
thousandth at the median, and fewer failed trainings); a part that "carries" the difference carries that much. None of it
is about the animal.

## 8. The cost
Round 6: 64.7 minutes for 96 trainings. 160 trainings: under two hours. Resumable.

## 9. The run (the gate never runs it and never gives the command the word `run`)
`node tools/ship/takeFlyEscapeSplit.mjs run` -> `brain/flyEscapeSplitRound.jsonl`, committed byte for byte, whole, before
it is read; `node tools/ship/takeFlyEscapeSplit.mjs read` prints the checks and the reading.

## 10. The result
The run took 96.1 minutes. `brain/flyEscapeSplitRound.jsonl` (162 records, sha256 `66fd20977af8fd27...`) was committed
whole at 89684b4a before it was read, and read once. The checks hold: 160 draws each once, the registered recipe, each
arm's own shuffle of the draw, GDEG draw 49 the same twice, and the untrained fly of every arm scoring the reflex's 0.6465.

- **R0: KEEPING EVERY CELL'S COUNTS ESCAPES BETTER THAN A FREE SHUFFLE** -- ranks 1245.5, the middle 1040, p 0.0057.
  Round 6's difference came again, on new draws and new shuffles. The split was asked of a difference that is there.
- **K1: KEEPING EVERY CELL'S COUNT IN CANNOT BE TOLD APART FROM A FREE SHUFFLE** -- ranks 1145.5, p 0.16.
- **K2: KEEPING EVERY CELL'S COUNT OUT CANNOT BE TOLD APART FROM A FREE SHUFFLE** -- ranks 1075, p 0.67.
- **K3: KEEPING ONLY WHAT THE TWO GIANT FIBERS RECEIVE CANNOT BE TOLD APART FROM A FREE SHUFFLE** -- ranks 1225.5,
  p 0.013.
- **T0: A FLY WHOSE WIRING KEEPS EVERY CELL'S COUNTS, STARTED AT THE REFLEX, ESCAPES BETTER THAN THE REFLEX** -- 32 of 32.
- **T3: A FLY STARTED AT THE REFLEX ESCAPES BETTER THAN THE REFLEX** -- 158 of 160 above, 2 equal.

BETTER, CANNOT, CANNOT, CANNOT is the fifth row of section 5's table: **the difference needs both counts together; no one
part carries it.** That is the registered sentence and it stands as registered.

What it is worth, said with it. K3 missed the line by little (p 0.013 against 0.01), and the fibres' arm is the one that
looks like GDEG: the same mean and median (0.7494 and 0.7495 against 0.7496 and 0.7493), no failed training, the smallest
spread of the five, and beside GDEG a rank sum of 1067.5 on a middle of 1040 (p 0.72). The count out alone is the free
shuffle's twin (means 0.7444 and 0.7444, one failed training each) and is the lowest beside GDEG (863, p 0.018). So this
round cannot tell "it needs both counts" from "it is what the fibres receive, and 32 draws were too few to show it". The
three arms in which the fibres keep their 42 connections have no failed training; the two in which they do not have one
each.

| arm | mean | median | sd | failed of 32 | beside GDEG (ranks, p) |
|---|---|---|---|---|---|
| GDEG (both counts) | 0.7496 | 0.7493 | 0.0039 | 0 | |
| GIN (count in) | 0.7480 | 0.7490 | 0.0039 | 0 | 980.5, 0.43 |
| GOUT (count out) | 0.7444 | 0.7483 | 0.0181 | 1 | 863, 0.018 |
| GGF (the fibres' inputs) | 0.7494 | 0.7495 | 0.0024 | 0 | 1067.5, 0.72 |
| GSHUF (nothing) | 0.7444 | 0.7479 | 0.0179 | 1 | |

Against section 6: R0 BETTER (50) came; K3 BETTER (40) and K1 BETTER (40) did not; K2 CANNOT (85) came; T0 and T3 came;
the table's first row (20) did not; the failures came as guessed. The difference is still small: a thousandth and a half
at the median, and one failed training in 32. A round that could settle K3 would be GGF against GSHUF alone on many more
draws; it is not registered.
