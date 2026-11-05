# What was picked up from the 2026-11-04 brains backlog, where it is, and how to join it to the board (2026-11-05; UNNUMBERED)

Keith, 2026-11-05: the switchboard chat keeps the board core, the head-to-head round, the decision-circuit comparison and the v4912 ship; this branch (`claude/sweet-lovelace-8leivh`) took the four items that need no shared file. The backlog itself (`brain/BACKLOG_2026-11-04_BRAINS.md`) lives on `claude/wizardly-einstein-wr30pd`; it was read there (`f4b55956`) and **not edited**. Nothing here touches `render/subAquariumSim.mjs`, `sub-aquarium.html`, `tools/ship/nextRounds.mjs`, `brain/NEEDS_AND_LIMITS.md`, `brain/surveySeat.mjs` or `tools/ship/planner*`. Each status line below is written so it can be pasted into the backlog's table.

| id | status line for the backlog | files |
|---|---|---|
| `leaky-unit-baseline` | **DONE 2026-11-05:** `brain/pilotLeakyHeading.mjs`: one leaky unit fed the exact heading rate behind the PD autopilot, a tank kind (circuit `leaky`, weights `[sigma, gain]` = `[0.9999, 1]`) and `leakyArm()`; gate with 162 mutants (130 red by name, 30 threw, 2 equivalent). Equals the registered rung 4a unit command for command at the simulator's tick; written in seconds so it works at the tank's tick lengths. Gain 0 is the no-memory lesion and flies the dropout autopilot exactly. **Its heading estimate in the dark is 0.03 to 0.04 rad rms off (the navigator's is 0.0003 to 0.001): it is a leaky navigator, not the navigator.** | `brain/pilotLeakyHeading.mjs`, `brain/pilotLeakyHeading-selfcheck.mjs` |
| `plain-net-tank-kind` | **DONE 2026-11-05** (the rung 4b plain net on its four tilt signals, not a 14-feature control: see below): `render/subAquariumPlainNet.mjs`: `plainNetKind`, `kindOfRecord`, `plainNetArm({ record })`, for the 48 committed champions of `brain/rig-results/plainNetStudy.jsonl` (MN 85 / 589 / 652 weights, MG 1,348). Gate with 108 mutants (78 red by name, 29 threw, 1 equivalent). No shared file: the kind is registered by the board's `register(tank)` hook or a page, as `render/subAquariumFlyCx.mjs` is. | `render/subAquariumPlainNet.mjs`, `render/subAquariumPlainNet-selfcheck.mjs` |
| (new) `tank-dropout-table` | **DONE 2026-11-05:** `node tools/ship/takeTankDropout.mjs [--ids 12] [--from 1] [--seconds 160] [--plain P/B/mn:3,E/E/mn:0|none]` flies the board's dropout loop (a copy of `dropoutTask` at `f4b55956`, not imported) over the autopilot, the navigator, the leaky unit, its lesion and any plain-net champions, and prints the paired readings in the board's words (BEATS / TIES / IS BELOW its control). Gate with 252 mutants (220 red by name, 21 more detected by a crash, 10 equivalent). It exists so that the two new modules above have a consumer on this branch (the orphan gate `tools/ship/orphanScan-selfcheck.mjs` goes red on a module nothing reaches) and so that the table below is reproducible; the board makes it redundant after the merge. | `tools/ship/takeTankDropout.mjs`, `tools/ship/takeTankDropout-selfcheck.mjs` |
| `demo-fish-escape` | **PRE-READ DONE 2026-11-05: NO ESCAPE OUTPUT.** The 803-weight fish pilot outputs the same four controls, its neurons are DMV inputs and its weights file says the Mauthner circuit is not in it; the rung 4b E arm has Mauthner-labelled cells but reads out through the same four-control readout and ties its plain-net control; the tank has no hazard event. As worded the demo cannot be built honestly; three honest replacements are in the note. | `brain/FISH_ESCAPE_PREREAD.md` |
| `decision-circuit-vs-twin` | **DRAFT REGISTRATION WRITTEN 2026-11-05, not registered:** `brain/DECISION_CIRCUIT_VS_TWIN_DRAFT.md`. Its main finding for the owner: there is no trained circuit to fly (Stage A's file holds only the references record) and the circuit starts from `GUARDED-OBS`, not the tuned rule, so as built the comparison has a known answer; the draft proposes re-basing the circuit on the seat's rule (D1b), lists six decisions with a recommendation each, and proposes a fresh audit block 16001-16300 (to be checked against the ledger). | `brain/DECISION_CIRCUIT_VS_TWIN_DRAFT.md` |

## How to join the board (the interface is the one in `brain/switchboard.mjs` at `f4b55956`, copied into the gates; neither module imports the board)

```js
import { leakyArm } from "./pilotLeakyHeading.mjs";
import { plainNetArm } from "../render/subAquariumPlainNet.mjs";
board.addArm(leakyArm());                                                              // controls: ["autopilot"]
board.addArm(leakyArm({ id: "leaky-unit-off", weights: [0.9999, 0], controls: [] })); // the no-memory lesion = the dropout autopilot, exactly
board.addArm(plainNetArm({ record }));                                                 // record = a line of brain/rig-results/plainNetStudy.jsonl (spec, widths, scales, weights)
// the arms the board should hold the fly against, so that "ties its control" can be said:
//   stateful fly:  controls: ["autopilot", "leaky-unit", "plainnet-P/B/mn:3"]
```
Both arms are `layer: "flying"` with `entry()` and `register(tank)`; `register` calls `tank.registerPilotKind(circuit, kind)`, which the board's dropout task calls on each fresh tank before `sync`.

## What the board's dropout task shows with them -- READ THIS BEFORE USING THE TASK AS A TEST OF MEMORY

`node tools/ship/takeTankDropout.mjs --from 9001 --ids 60 --plain P/B/mn:3,E/E/mn:0,P/whole/mn:0,E/whole/mn:1,P/B/mg:0` (21 s; ids `sb-9001`..`sb-9060`, 160 s, the settled dark heading error to the wandering target, paired arm minus control; an UNREGISTERED measurement, read after the fact, on ids chosen to be far from any a round might hold):

| arm | mean error (rad) | against the autopilot (paired, se) | reading |
|---|---|---|---|
| PD autopilot (dropout) | 0.7581 | | |
| dead-reckoning navigator (the tank's `navigator` event) | 0.7414 | -0.0167 (0.0204) | **TIES** |
| `leaky-unit` | 0.7441 | -0.0140 (0.0207) | **TIES** (against the navigator: +0.0026, se 0.0014) |
| `leaky-unit-off` | 0.7581 | 0 | the autopilot, exactly |
| `plainnet-P/B/mn:3` (589 weights) | 0.6953 | -0.0629 (0.0347) | TIES |
| `plainnet-P/whole/mn:0`, `plainnet-E/whole/mn:1` (652) | 0.7244, 0.7254 | -0.0337 (0.0385), -0.0327 (0.0497) | TIES |
| `plainnet-P/B/mg:0` (1,348) | 0.7070 | -0.0511 (0.0216) | BEATS (2.4 se) |
| `plainnet-E/E/mn:0` (85 weights) | 0.5400 | **-0.2181 (0.0444)** | **BEATS** (also BEATS the leaky unit by 0.2041, se 0.0450) |

**What that says, at the size it has.**
* **The dropout task, as built, cannot tell a heading memory from none.** The navigator, whose heading estimate is off by about a thousandth of a radian rms in a dark window, TIES the autopilot on the settled-error score (60 ids; on `sb-1`..`sb-12` it read -0.058, se 0.044, which looks like an effect and is not). `brain/TANK_PILOTS_WIP.md` said the dropout "barely hurts a settled sub" in this tank, and the reason is in the score: the tank's sub turns at about 0.06 rad/s, a half turn onto a new target takes 40 s, and a tick counts as settled 12 s after a retarget, so the error is mostly how fast the pilot turns onto the target and little of what it knows of its heading. A demo "the leaky unit holds the line in the dark" cannot be shown with this score; what separates the arms is the heading ESTIMATE in the dark (the leaky unit 0.03-0.04 rad rms, the navigator 0.0003-0.001, the autopilot's held heading drifting by the whole turn), which the board does not read and the tank's snapshot reports only for the navigator and the plain events.
* **The plain nets move the score, and a hazard-trained one moves it most.** `plainnet-E/E/mn:0` (9 hidden units, trained on the 4b-E hazard dodge) lowers the error by 0.22 rad against the autopilot (4.9 se) and by 0.20 against the navigator-like leaky unit; the memory-free MG net beats the autopilot by 0.05. This is the notes' "the gain of every residual pilot is generic" seen in the tank (rung 4a; `brain/RUNG_4A_CLOSEOUT.md`), at sizes that dwarf the compass effect. Nobody has looked at why a hazard net turns the sub better, and this note does not guess.
* **So for the head-to-head round:** the "ties its control" lines the board prints will be dominated by whichever arm has a residual that speeds the turn. A round that means to test MEMORY needs a score that isolates the dark window (the error of the heading the pilot believes, or the error in the dark relative to the same pilot's error in the light), or a longer settle. That is the other chat's registration to write; this note only says what the arms do on the score the board has.

## What was NOT done, and why
* **A plain-net control for the 963-weight networks** (a dense net on the 14 tank features at about 963 weights, the control `HEAD_TO_HEAD.md` H2 asks for): a different pilot (`pilotSubPlainNet.mjs` takes four tilt signals, not the 14 features) and a training round (4 searches x 400 children per control); not built. `plain-net-tank-kind` as done seats the rung 4b nets, which exist.
* **The fish circuit pilot as a kind** (`fish-pilot-tank-kind`, `brain/pilotSubVestibular.mjs`): not asked for here; the plain-net kind is its control and would be its pattern.
* **Anything on the board itself:** it is not in this tree. The gates apply a copy of the board's acceptance rules (`addArm`: an id and a layer; the dropout task: `entry()`) and fly a copy of its dropout loop; the first real `board.addArm` is the other chat's to try.
* **A tilt, gust or hazard event in the tank** (`demo-fish-righting`, `demo-fish-escape`): a shared file.
* **Gate census and the ship:** three new gates (`brain/pilotLeakyHeading-selfcheck.mjs`, `render/subAquariumPlainNet-selfcheck.mjs`, `tools/ship/takeTankDropout-selfcheck.mjs`) and nothing else that moves a count; the knowledge-index bake at ship time picks them up. `orphanScan-selfcheck` is green with them because the command imports both modules; **if the merge replaces the command with the board's, that row needs the board to import them, or the command stays.**
