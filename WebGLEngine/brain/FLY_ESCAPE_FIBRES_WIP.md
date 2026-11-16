# The fly escapes, round 8: are the Giant Fibers' own inputs enough? (registration)

**Registered 2026-11-16, before any code of this round exists.** Keith: "Lets do many-draw round next."

Round 7 (`brain/FLY_ESCAPE_SPLIT_WIP.md` section 10) set a shuffle that keeps ONLY the 42 real connections onto the two
Giant Fibers (GGF) against a free shuffle (GSHUF) on 32 trainings an arm and got p 0.013 on a line of 0.01: the registered
word was CANNOT BE TOLD APART, and the note said the round could not tell "the difference needs both counts" from "it is
what the fibres receive, on too few draws". This round asks that one question again with enough draws to answer it.

## 1. How many draws, and why, said before the run
In round 7, K3's rank sum was 1225.5 on a middle of 1040: a GGF fly beat a GSHUF fly in 68 of 100 pairs. Rounds 6 and 7
found 70 in 100 for the shuffle that keeps every count. A number that was picked because it nearly crossed a line is
likely an overestimate, so the round is sized for less. By the normal approximation to the rank sum at alpha 0.01, two-sided:
| if the true share of pairs is | 32 an arm speaks | **128 an arm speaks** |
|---|---|---|
| 68 in 100 | about 46 times in 100 | about 99 |
| 65 in 100 | about 30 | about 94 |
| 60 in 100 | about 11 | about 58 |
| 50 in 100 (no difference) | 1 | 1 |
**128 draws an arm, 256 trainings, fixed before the run: no look at the scores before all 256 are in, and no draws added
after.** Round 7's 32 draws an arm are not pooled into the test.

## 2. What is the same
Round 7's task, cells, inputs, read-out, start (the reflex; a connection at 0.01 x a synapse count), trainer, recipe, audit,
floors, the line for a failed training (a score below 0.72), alpha 0.01, two-sided, exact, ties against the claim. The two
arms are round 7's own, built by its code:
| arm | connections |
|---|---|
| **GGF** | the 42 real connections onto the two fibres, whole; the other 327 placed freely among the places not onto a fibre (`keepOnto`, seed 13000 + s) |
| **GSHUF** | all 369 placed freely (seed 7000 + s) |
In both the 369 real strengths are in the list's order.

## 3. What changes
**New draws: 81 to 208.**

## 4. The readings
- **F1: GGF against GSHUF**, a rank sum of 128 against 128. Its three words are round 7's K3's, to the letter.
- T0 (the 128 GGF flies against the reflex) and T3 (all 256 against it).
- Described, not tested: the failed trainings an arm; the means, medians and spreads; the share of pairs a GGF fly wins;
  and, for the record, round 7's 64 flies beside these (no test is made of them together).

## 5. What a reading would say
- **BETTER**: keeping what the two fibres receive is enough to escape better than a free shuffle. With round 7's K1 and K2
  it would say the "counts" of rounds 6 and 7 are the fibres' inputs. It would NOT say the fibres' inputs are ALL of it:
  GGF is not set against GDEG here.
- **CANNOT BE TOLD APART**: at 128 an arm a difference of 65 in 100 would have spoken 94 times in 100. Round 7's sentence
  ("it needs both counts together") then stands with far better grounds than it had.
- **WORSE**: reported as it is; nothing predicts it.

## 6. Expectations, written before the code
F1: **BETTER about 60 percent**, CANNOT about 40, WORSE under 1. The share of pairs a GGF fly wins: between 58 and 68 in
100 (about 60 percent). Failed trainings: GGF 0 to 2 of 128 (about 75); GSHUF between 2 and 10 (about 70). T0 and T3:
BETTER about 95 each.

## 7. What it would and would not mean
About this task, these 42 cells given one number each, this trainer. The difference in question is a thousandth and a half
of the score at the median and a failed training in thirty; a BETTER here is a sure small thing, not a big one. None of it
is about the animal.

## 8. The cost
Round 7: 96 minutes for 160 trainings, four at a time. 256 trainings: about two and a half hours. Resumable; the command
may be started more than once, and a start after a stop trains only what the file does not hold.

## 9. The run (the gate never runs it and never gives the command the word `run`)
`node tools/ship/takeFlyEscapeFibres.mjs run` -> `brain/flyEscapeFibresRound.jsonl`, committed byte for byte, whole,
before it is read; `node tools/ship/takeFlyEscapeFibres.mjs read` prints the checks and the reading.
