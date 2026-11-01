# Rung 4a close-out: the fly's central-complex heading loop is an ordinary reservoir under every design we tried (2026-11-01; UNNUMBERED; writing only -- no code was run for this note, every number is copied from the notes named beside it)

Keith, 2026-11-01: "a close-out note for the fly work (rung 4a): one page saying the central-complex heading loop behaves as a generic reservoir under every design we tried, with no more variants."

## The question rung 4a asked

Does the real fly heading loop (`vendor/hemibrain/hemibrain-cx-heading-loop.json`: 148 cells, 7,080 synapses, hemibrain central complex) give a submarine a use of memory -- an integrated heading through a compass dropout -- that the same machinery on other wirings (random, degree-matched, type-block, sign-shuffled, count-shuffled, and NO STATE) does not? The rule, written before anything was run (`brain/SUBMARINE_WIP.md`, "Rung 4a ... design and the rule"): the real wiring has to beat the strongest control family on the audits, not just the autopilot.

## What every design returned (all in `brain/SUBMARINE_WIP.md`; audits read once per circuit)

| design | what was changed | cx (the real wiring) | the controls | verdict |
|---|---|---|---|---|
| **Stage A** (27 of 28 circuits, `brain/flyCxStageA.jsonl`) | a residual pilot read from the reservoir, tuned by the search recipe | -0.4994 / -0.5071 / -0.5034, below EVERY family's mean on every audit (by 0.014 to 0.036); worse than NO STATE | ER -0.4653, TYPE-BLOCK -0.4763, DEGREE -0.4853, NO STATE -0.4844 | **FAIL**; no use of memory |
| **v2 estimator** (40 circuits) | a regression readout of the accumulated heading change | skill **-0.01** (RMSE 0.2266 against 0.2238 for saying zero) | ER 0.12 to 0.18; TYPE-BLOCK, DEGREE, COUNT -0.01; **one leaky unit 0.89 to 0.92** | **FAIL**; no family integrates |
| **v3 matched gain** (120 records) | every wiring tuned to its own edge of stability, relu and tanh, readout from the output cells or from all | skill 0.01 to 0.15 (relu, the audits and the reserve), 0.06 to 0.07 (tanh) | TYPE-BLOCK and COUNT 0.2 to 0.35 once matched; ER 0.11 to 0.24 | **FAIL in all three arms**; the real wiring is below most of its controls |
| **v4 ring map and fine edge** (80 records) | a closer approach to the edge; the heading rate fed through a ring-like input map | fine edge 0.12 / 0.05 / 0.12; ring map 0.00 | fine edge: TYPE-BLOCK 0.28; ring map: no family above 0.02 | **FAIL in both**; the ring map's flag step swamps the dark ticks |
| **v5 ring map without the flag** (80 records) | the compass flag removed; a side-coded rate; an unsigned control | side-coded: **no signal in any wiring** (0.024 against the 0.05 needed); unsigned: 0.31 / 0.27 / 0.38 | unsigned: ER, TYPE-BLOCK, COUNT 0.31 / 0.27 / 0.38 -- **cx IS their mean** | **NO SIGNAL / FAIL**; cx beats only DEGREE (whose controls blow up) |

Five designs, five registrations written before each run, each run read once, each verdict the same: **on none of them is the real wiring better than the controls it was set against, and on the one design with a readable signal (v5 unsigned) it is exactly as good as three of them.**

## What was learned beyond the verdict

* **A single leaky unit integrates (skill 0.89 to 0.92); no reservoir of any wiring does (best family means 0.12 to 0.35).** If a vehicle needs an integrated heading through a dropout, the cheapest memory there is does it; a 148-cell reservoir does not, and the navigator (`tools/subNavigator.mjs`, dead reckoning) holds the line (heading error in the dark 0.047 against the autopilot's 0.161).
* **The gain the residual pilots show is generic.** Every circuit of Stage A gained 0.14 to 0.18 over the plain autopilot through the dropout (cx 0.143, the lowest), including random wirings and NO STATE. The rung 4b plain-net control (`brain/PLAIN_NET_CONTROL_WIP.md`) found the same for the fish circuit: a plain relu net with the same signals and weight count kept 100 to 116% of the real wiring's gain.
* **Why a reservoir cannot hold a signed angle (post hoc diagnostics, not gated, in the v2 and v5 notes):** 90 to 96% of the output cells' variance is in one common direction (v2); and read as signed synapse counts the PEN-to-EPG graph lights the output cells almost equally for a left and a right turn (total activity 2,266 against 2,610), so the readout sees about |rate| (v5). The fly's sign lives in a one-glomerulus SHIFT that the count graph holds only in the instance names.
* **In the Sub Aquarium's tank** (`brain/TANK_PILOTS_WIP.md`, 24 ids, 240 s): the stateful pilot holds its line better than the plain autopilot by 0.131 rad in the dark windows and by 0.125 with the compass lit -- the dropout adds nothing to it: the same generic gain, not a compass skill. A paired test on fresh ids (`brain/TANK_PILOTS_WIP.md`, 24 ids, exact sign-flip p) then found that wiping the champion's memory costs it 0.055 rad lit (p 0.005) and 0.137 rad dark (p 0.0002), and could not call the dark effect larger than the lit one (p 0.083); the comparator there is the trained weights with the memory switched off, not a pilot retrained without memory, so it does not contradict the retrained NO STATE results above.

## What this does NOT say

It is not a statement about the fly's compass: the fly's circuit is a ring with a particular input and gain, and every design above fed a signed rate through a seeded map onto relu or tanh cells with a linear ridge readout. It is not a statement that no reservoir of this wiring could integrate. **Untested, and left untested on purpose:** a map that uses each PEN and EPG cell's glomerulus number so that a right turn drives a shifted subset (the one design the notes call the natural next step); a sign-sensitive readout; a bump-position decoder; an initial heading cue; an approach to the edge closer than 0.9999. Any of them is a new registration with its own pass/fail written first, not an edit of the five above.

## Status: CLOSED

Rung 4a is closed as a negative result under every design tried, **with no further reservoir variants planned.** The claim the tree may make is the one in the title; the claim it may not make is anything about how the fly's own compass works. The stateful fly pilot stays in the Sub Aquarium as a pilot with a learned residual and a short memory (its weights file says so in its `limits` text), the navigator stays the reference for holding a heading through a dropout, and the one cheap thing that integrates -- a leaky unit -- is available to anything that needs it. If the glomerulus-shift map is ever wanted, it opens as a new registration with its own pass/fail.
