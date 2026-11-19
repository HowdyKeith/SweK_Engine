# The steering readout: does reading the fly's heading loop out through its P-FL cells change rung 4a's answer? (registered 2026-11-19; UNNUMBERED)

Keith, 2026-11-19: "Let's do the steering readout round." The circuit is `vendor/hemibrain/hemibrain-cx-steering.json` (commit `3ca013f5d`, made by `tools/flyCx.mjs --circuit steering`): the heading loop's 148 cells plus the 50 P-FL cells (PFL1 14, PFL2 12, PFL3 24) that carry the heading out of the central complex towards the steering cells; 198 cells, 8,007 edges, 147,729 synapses. **Its outputs are the 50 P-FL cells**, where the heading loop's were its 64 E-PG and P-EG cells.

This section is written, and committed, before any registered dive is flown. Rung 4a was closed with "no further reservoir variants planned" (`brain/RUNG_4A_CLOSEOUT.md`). This round is not a variant of the reservoir: the model, the maps and the study are v5's unchanged, and only the CIRCUIT is new. It is run because Keith asked for it.

## 1. THE QUESTION

When the reservoir is the heading loop plus its P-FL readout cells, and the linear readout reads the P-FL cells, is the real wiring (cx) a better reservoir than its rewired controls for estimating the cumulative heading change through a compass dropout?

## 2. WHAT IS RUN: rung 4a version 5's study, unchanged, on the new circuit

* **The study is `tools/ship/subEstimatorStudyV5Cmd.mjs`, unchanged**, run with `--circuit-file vendor/hemibrain/hemibrain-cx-steering.json`. No library file of v2 to v5 is edited. Its report names itself "RUNG 4a v5"; in this round those lines mean this round.
* **The two arms are v5's**, on the new circuit:
  * **RMU, the unsigned map**: the heading rate (slot 5), w on every P-EN input cell. This is the one design of rung 4a with a readable signal (v5: skill 0.31 / 0.27 / 0.38 for cx, equal to three control families).
  * **RMF, the side-coded map**: +w on the right P-EN cells and -w on the left. v5 read NO SIGNAL here. It is run again because the P-FL cells are split left and right by bridge glomerulus, so the sign has a second place it could show.
* **The rest is v5's**: relu, the matched-drive weight, g* by v4's edge procedure under each arm's own map, the seven factors, the ridge grid, the readout (now from the 50 P-FL cells and a constant), the target, the scoring and the closed loop.
* **The circuits are v2's list**, made from the NEW circuit by the same rules (`trainSubState.circuitFor`): `cx,er:0-9,layer:0-9,degree:0-9,sign:0-3,count:0-3,nostate:0`. The controls keep every neuron's record and rewire the edges, so every control has the same 50 P-FL output cells, reached by different wiring.
* **A fresh audit base, 147000** (seeds 147000 to 147511). No file in the tree uses a seed from 145000 to 147999 for the submarine task (checked by grep, 2026-11-19: the only matches are hex ids, timings and gate-ledger durations). The references (NONE, ORACLE, LEAKY1, the autopilots) are run again at that base.
* **One comparison record: the heading loop's cx at the same base.** `--specs cx --arms RMU` with the heading-loop file, so that reading (e) compares the two readouts on the same dives.

## 3. THE READINGS, written now

* **(a) LEAK CHECK**, as v2 to v5: NO STATE with an audit skill above 0.2 is not read.
* **(b) THE SIGNAL CHECK**, as v5: an arm has SIGNAL iff the mean in-sample skill over the ER, TYPE-BLOCK and DEGREE circuits is at least 0.05. Otherwise it is NO SIGNAL, and its verdict is printed but not weighed.
* **(c) Each arm's verdict** by v2's rule (`verdictOf`): PASS, IN BETWEEN or FAIL of cx against the verdict families ER, TYPE-BLOCK and DEGREE on the three audits. SIGN and COUNT are reported, not in the verdict.
* **(d) THE BOTTOM LINE**, read from RMU first:
  * RMU PASS with SIGNAL: "**reading the heading loop out through its P-FL cells lets the real wiring beat its controls**: the first PASS of the fly circuit in this task."
  * RMU FAIL with SIGNAL: "**the P-FL readout does not change rung 4a's answer**: a linear readout of the P-FL cells is no better on the real wiring than on rewired controls."
  * RMU IN BETWEEN: reported as it is, with the families cx beats.
  * RMU NO SIGNAL: "the P-FL cells carry no readable signal of the heading change under this drive; this round says nothing about the wiring."
  * RMF is read the same way. An RMF PASS with SIGNAL would be the round's strongest result: the side-coded rate made readable by the P-FL cells' sides.
* **(e) THE TWO READOUTS ON THE SAME DIVES (reported, not in the verdict):** cx's audit skill under RMU with the P-FL readout against the heading loop's cx under RMU, at base 147000. The difference is printed per audit. The P-FL readout is said to READ MORE than the heading loop's outputs iff it is higher on all three audits by at least 0.05.
* **(f)** As v5: the top-factor count, cap ticks, the target range and the skill reading (0.9 integrates, 0.5 some memory, below 0.2 none).

## 4. EXPECTATION, recorded before the run

The P-FL cells take their input from E-PG (195 edges) and Delta7 (559 edges) and send almost nothing back (3 edges). So they are a read-only layer on top of the same reservoir: whatever the 64 old outputs carry, the P-FL cells carry a mixture of it, through Delta7's broad inhibition.

* **RMU**: FAIL with SIGNAL about 60 percent (cx again about its controls' mean, as in v5); NO SIGNAL about 25 percent (the P-FL mixture loses what the E-PG cells carried); PASS about 15 percent.
* **RMF**: NO SIGNAL about 75 percent.
* **(e)**: the P-FL readout reads LESS than the heading loop's outputs, about 60 percent.

## 5. NOT TESTED, said now

The P-FL cells' other inputs (the fan-shaped-body cells that carry a goal direction) are not in the circuit, so no goal-directed steering is tested. Also not tested: a readout from the left-minus-right difference of the P-FL cells (a fixed, sign-sensitive readout rather than a fitted one); tanh cells; any change to the model. A FAIL closes the readout question for v5's model on this circuit; it says nothing about how the fly steers.

## 6. A DISCLOSURE, made before the registration was written

Before writing this, I ran v5's study in smoke mode on the new circuit to time it and to see that it ran: `--smoke`, circuits cx, er:0 and nostate:0. Smoke mode uses 4 of the fitting dives and 2 held-out dives, and the fitting dives stand in for the audits; no registered audit dive was flown. It ran in 17 s. On those fitting dives cx and er:0 gave the same scores to two places in both arms (RMU skill -0.00 / 0.18 / 0.39 for cx and for er:0; RMF 0.00), and nostate:0 gave 0.00. Three circuits on six dives say nothing about the result; they are recorded because they were seen.

## 7. THE RUN

`node tools/ship/subEstimatorStudyV5Cmd.mjs run --specs <part> --circuit-file vendor/hemibrain/hemibrain-cx-steering.json --audit-base 147000 --out brain/flySteeringStudy.<part>.jsonl` over four processes, with the list split as v6 split it: (a) `cx,er:0-9`, (b) `layer:0-9,nostate:0`, (c) `degree:0-9`, (d) `sign:0-3,count:0-3`. Then the comparison: `run --specs cx --arms RMU --audit-base 147000 --out brain/flySteeringHeadingLoopCx.jsonl` (the heading-loop file is the study's default). The five files are committed unread, then read ONCE with `report --in` over the four, and `report --in` on the fifth.
