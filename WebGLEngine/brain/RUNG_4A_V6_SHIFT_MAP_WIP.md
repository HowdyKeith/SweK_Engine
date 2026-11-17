# RUNG 4a VERSION 6 -- "THE GLOMERULUS-SHIFT MAP" -- REGISTERED 2026-11-17 BEFORE ANY CODE FOR IT IS WRITTEN AND BEFORE ANY v6 CIRCUIT IS SCORED (UNNUMBERED; branch `ccr-ca830954-770ho4`)

Keith, 2026-11-17: "Let's also do the fly-glomerulus-shift-map". `tools/ship/nextRounds.mjs` lists it as `fly-glomerulus-shift-map`, UPSTREAM on "a decision of Keith's to reopen rung 4a", and says it may only come "as a NEW registration with its own pass/fail written first". This is that registration. Rung 4a's five earlier versions (`brain/SUBMARINE_WIP.md`, closed in `brain/RUNG_4A_CLOSEOUT.md`) are not edited. This file, not `brain/SUBMARINE_WIP.md`, holds v6, because another chat owns that file.

## 1. Why a version 6, and what was checked while designing it (the circuit file only: `vendor/hemibrain/hemibrain-cx-heading-loop.json`, read by throwaway scripts, NOT gated, no audit or fitting dive read)

v5's post-hoc diagnostic found that, read as signed synapse counts, the PEN-to-EPG graph lights the output cells almost equally for a left and a right turn, and that the fly carries the turn's sign in a one-glomerulus SHIFT that the graph holds only in the instance names. It also left the hemispheres' numbering unresolved. Two checks, made now:

* **The mirror numbering, read off the Delta7 names.** Each Delta7 instance names the protocerebral-bridge glomeruli it spans on both sides: L6R3, L5R4, L4R5, L3R6, L7R2, L2R7, L1L9R8, L8R1R9 (the left and right numbers sum to 9), and L4R6, L6R4, L7R3 (they sum to 10). So **glomerulus L_k represents the same heading as R_(9-k)**. With 8 headings 45 degrees apart: angle(R_k) = 45 x ((k - 1) mod 8) degrees, angle(L_k) = angle(R_(9-k)). L9 and L1 then share an angle, as do R9 and R1, which the names L1L9 and R1R9 say.
* **The shift, measured under that numbering** (the angle of each edge's target glomerulus minus its source's, weighted by synapse count): **PEN_a_L to EPG: +45 degrees 44 percent, +90 degrees 43 percent; PEN_a_R to EPG: -45 degrees 45 percent, -90 degrees 44 percent; PEN_b_L: +45 53 percent, +90 46 percent; PEN_b_R: -45 52 percent, -90 46 percent.** EPG to EPG is 0 degrees for 63-64 percent, and EPG to PEG 0 degrees for 75-88 percent. **The left and right PEN populations project to EPG cells shifted in OPPOSITE directions around the ring.** The sign v5 could not find in the counts is in the wiring once the glomeruli are given angles.

What v5's ring map lacked, then, is a bump to shift: every earlier version started the reservoir at zero, so a side-coded turn signal had no heading representation to move, and the readout saw something like |rate|.

## 2. THE QUESTION

When the reservoir starts each dive with a BUMP of activity placed by glomerulus angle (a heading cue at the dive's start), and the heading rate drives the PEN cells side-coded as in v5, is the real wiring (cx) a better reservoir than its controls for estimating the cumulative heading change? The controls rewire the edges and keep every neuron's record (type, side, instance), so they receive the same bump on the same cells and the same input; only the real wiring has the shift.

## 3. THE ARMS, ALL OF THEM (all 40 circuits of v2's list each: `cx,er:0-9,layer:0-9,degree:0-9,sign:0-3,count:0-3,nostate:0`)

* **SB -- the shift map with a bump.** At the start of every dive the state is 0 except each EPG cell, which starts at A x max(0, cos(angle of its glomerulus)): a bump centred on 0 degrees, from the mirror numbering above. The input is v5's RMF map exactly (only the heading rate, slot 5: +w on each PEN input cell of side R, -w on side L, nothing else connected, w by v5's matched-drive rule).
* **SF -- the flat start (the control for the bump).** As SB, except that every EPG cell starts at the same value: the mean over EPG cells of SB's start, so the total starting activity is equal. SF says whether a heading-shaped start matters.
* **The amplitude A** is set per circuit as a multiple of r, the rms drive of the v3 random map over the fitting dives for that circuit (v4's `rmsDrive`, the scale every arm's input is matched to): **A in {1, 4} x r**, chosen with the gain on the held-out dives.
* **The gain.** g* is found by v4's edge procedure (16 steps of geometric bisection, the same bounds and blow-up rule) under the arm's own input AND its own start at the larger amplitude (4r). The settings are the seven FACTORS of v4 x g* crossed with the two amplitudes: 14 settings. `fitModel` chooses (gain, A) and lambda by the dark-tick RMSE on the held-out dives (ties to the earlier setting in the order factor-major, amplitude-minor). NO STATE has no recurrence: one gain, both amplitudes.
* Everything else as v5: relu, the cap, the ridge grid, the readout from the 64 output cells and a constant, the target, the dives, the scoring, the closed loop.

## 4. THE SHARED PARTS

**A FRESH AUDIT BASE, 131000** (seeds 131000 to 131511; the bases 8000 and 20000 to 95000 are spent; no file in the tree uses these seeds for the submarine task, checked by grep). The references (NONE, ORACLE, LEAKY1, the autopilots) are run again at that base, one record `refs`.

## 5. THE READINGS, written now

* (a) **LEAK CHECK** as v2 to v5 (NO STATE with an audit skill above 0.2 is not read).
* (b) **THE SIGNAL CHECK** as v5: an arm has SIGNAL iff the mean in-sample skill (the fitting dives) over the ER, TYPE-BLOCK and DEGREE circuits is at least 0.05. Otherwise it is NO SIGNAL: the verdict is computed and printed but not weighed.
* (c) **Each arm's verdict** by v2's rule (`verdictOf`): PASS, IN BETWEEN or FAIL of cx against the verdict families ER, TYPE-BLOCK and DEGREE on the three audits. SIGN and COUNT are reported, not in the verdict.
* (d) **THE BOTTOM LINE:**
  * SB NO SIGNAL: "the bump and the side-coded rate carry no readable signal in any wiring; this arm says nothing about the wiring."
  * SB PASS with SIGNAL and SF not PASS: "**the bump the glomerulus numbers place, driven by the side-coded rate, lets the real wiring beat its controls: the first PASS of rung 4a**, and it needs the heading-shaped start."
  * SB PASS and SF PASS: "the real wiring beats its controls under this drive whatever the start."
  * SB FAIL with SIGNAL: "**the shift is in the wiring (section 1) but a linear readout of this reservoir does not use it better than rewired controls do**: rung 4a's conclusion survives the glomerulus-shift map."
  * Anything else is reported as it is.
* (e) **SB against SF:** for each family, the mean audit skill of each arm, and the number of families in which SB's exceeds SF's by more than 0.05.
* (f) **THE MECHANISM CHECK (reported, not in the verdict; gated):** for cx and for each ER circuit at its chosen SB setting, start from the bump and drive a constant rate of +1 (slot 5) for 60 ticks, then separately -1 for 60 ticks, and read the angle of the EPG population vector (each EPG cell's activity times the unit vector of its glomerulus angle). Report the two angles. The bump is said to MOVE WITH THE TURN in a circuit iff the two angles have opposite signs and each is at least 10 degrees from 0. Report cx's angles and the number of ER circuits in which it moves.
* (g) The top-factor count, the amplitude chosen, cap ticks, the target range and the skill reading (0.9 integrates, 0.5 some memory, below 0.2 none), as v4 and v5.

## 6. EXPECTATION, recorded before the run

I do not know. What argues for a PASS: only cx has the opposite shifts, so only in cx can a side-coded rate move a bump in a signed way, and a linear readout of the EPG and PEG cells can read a bump's angle near 0 (the target never exceeded 2.1 rad on earlier audits). What argues against: a relu reservoir below its edge has no attractor, so the bump decays and must be held up by the recurrence near g*, with nothing to keep it a bump (Delta7 is the only inhibition, and v3 to v5 found every wiring at its edge an ordinary slow mode). The readout is fitted over every tick from the dive's start, when the bump is fresh. I put SB PASS with SIGNAL at about one in three, SB FAIL with SIGNAL at about one in two, and NO SIGNAL at about one in six. I expect the mechanism check to show cx's bump moving with the turn (about two in three) whatever the verdict, since the shift is measured in section 1.

## 7. NOT TESTED BY v6, said now

An anchor during the run (the compass flag on EPG cells by heading while it is valid); a decoder of the bump's position (a nonlinear readout); a readout from all cells; tanh cells; a ring-attractor model of the fly; the PEN cells' own heading input in the protocerebral bridge beyond what the circuit's EPG-to-PEN edges carry. A v6 FAIL with SIGNAL closes the glomerulus-shift question for a linear readout of this reservoir; it does not say a fly-like network cannot integrate.

## 8. WHAT WILL BE BUILT, each gated and sabotaged before the run (v2 to v5 files are not edited)

* `tools/subReservoirV6.mjs`: the angle numbering, the bump and flat starts, the model with a start, the edge under a start, the settings, the population-vector angle and the mechanism check, reusing v4's model and v5's map and matched weight.
* `tools/ship/subEstimatorStudyV6.mjs` and `tools/ship/subEstimatorStudyV6Cmd.mjs`: the two arms, the records with the chosen gain and amplitude, the in-sample skill, the signal check, the bottom line, the SB-against-SF line and the mechanism lines.
* The gate `tools/subReservoirV6-selfcheck.mjs`.
* Results to `brain/flyEstimatorStudyV6.jsonl`, committed unread, then read once.

Gate rows owed:
* the angle of every EPG glomerulus under the numbering (L_k = R_(9-k));
* the bump has its maximum on the 0-degree glomeruli and is 0 on cells that are not EPG;
* SF's start has the same total as SB's and is equal on every EPG cell;
* the model with a start differs from v4's only in `init`;
* the edge under a start uses that start;
* the settings are 14 in the registered order;
* the population-vector angle of a hand-made bump is its centre;
* the mechanism check's rule on hand-made angles;
* every branch of the bottom line;
* the audit base 131000;
* the input map is v5's RMF bit for bit.

## 9. BUILT AND GATED (2026-11-17, before the run on the registered dives)

**Files.**
* `tools/subReservoirV6.mjs`, `tools/ship/subEstimatorStudyV6.mjs` and `tools/ship/subEstimatorStudyV6Cmd.mjs`.
* The gate `tools/subReservoirV6-selfcheck.mjs`: about 35 rows in about 7 s, with every row section 8 owes.
* One field was added to each record before any registered dive was read: `settingsTried`, the number of distinct (gain, amplitude) settings `fitModel` tried. It lets the gate see that all 14 were tried.

**Corrections to rows, made while gating (the library was right in each case).**
* The population vector is the registered raw sum (each EPG cell's activity times its glomerulus direction). The circuit's glomeruli hold 2 to 4 EPG cells each, so a centred cosine bump reads up to **2.49 degrees** off-centre on the real circuit. The row now holds the measure exact on an evenly populated ring and pins the circuit's bias under 3 degrees, well inside the mechanism rule's 10.

**SABOTAGE.** 36 mutants of the library and the study, each alone in a scratch copy. On the first pass 31 went red and 5 stayed green:
* **one declared EQUIVALENT:** "the amplitude scale read from the RMF map instead of the random map". v5's matched-drive rule sets RMF's weight so that its rms drive EQUALS the random map's, so the two scales are the same number by construction;
* **four that got rows:** the start shared between dives (the row had mutated the array it compared against); negative activities voting in the population vector; the study's edge found at the small amplitude instead of 4r; the settings cut to one amplitude.

After that: **35 of 36 red, 1 equivalent.**

**TWO DISCLOSURES, made before the run.** Neither touched the audit dives or the registered fitting set's full run.
1. While building `mechanism()`, I ran it by hand on cx's circuit alone (no dives) at four hand-picked gains of the unscaled RMF map. At gain 0.5 the bump moved +62 / -28 degrees; at 0.9 and above it did not pass the rule (+41 / -9, +31 / -3, +15 / +22).
2. The command's smoke mode (`--smoke`: 4 of the fitting dives, 2 held-out, the fitting dives standing in for the audits) on cx, er:0 and nostate:0 gave SB and SF the same scores, with cx's in-sample skill 0.00. A diagnostic on 4 fitting dives with no input followed. At g* the bump persists but drifts from any start to about 18 degrees: the circuit's dominant mode, not a ring that holds any angle. Just below g* it decays within 30 to 100 ticks.

This is the failure section 6 put at about one in two ("a relu reservoir below its edge has no attractor"). **The design is run as registered, not changed after seeing it.**

The run: `subEstimatorStudyV6Cmd.mjs run --specs <part> --out brain/flyEstimatorStudyV6.<part>.jsonl` over four processes, with the registered list split as cx,er:0-9 / layer:0-9,nostate:0 / degree:0-9 / sign:0-3,count:0-3. The references are computed in each part (they are the same) and kept once by `report`. The four files are committed unread, then read once.
