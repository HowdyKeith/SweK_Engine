# What was picked up from the 2026-11-04 brains backlog, where it is, and how to join it to the board (2026-11-05; UNNUMBERED)

Keith, 2026-11-05: the switchboard chat keeps the board core, the head-to-head round, the decision-circuit comparison and the v4912 ship; this branch (`claude/sweet-lovelace-8leivh`) took the four items that need no shared file. The backlog itself (`brain/BACKLOG_2026-11-04_BRAINS.md`) lives on `claude/wizardly-einstein-wr30pd`; it was read there (`f4b55956`) and **not edited**. Nothing here touches `render/subAquariumSim.mjs`, `sub-aquarium.html`, `tools/ship/nextRounds.mjs`, `brain/NEEDS_AND_LIMITS.md`, `brain/surveySeat.mjs` or `tools/ship/planner*`. Each status line below is written so it can be pasted into the backlog's table.

| id | status line for the backlog | files |
|---|---|---|
| `leaky-unit-baseline` | **DONE 2026-11-05:** `brain/pilotLeakyHeading.mjs`: one leaky unit fed the exact heading rate behind the PD autopilot, a tank kind (circuit `leaky`, weights `[sigma, gain]` = `[0.9999, 1]`) and `leakyArm()`; gate with 162 mutants (130 red by name, 30 threw, 2 equivalent). Equals the registered rung 4a unit command for command at the simulator's tick; in seconds, so it works at the tank's tick lengths. Gain 0 is the no-memory lesion and flies the dropout autopilot exactly. | `brain/pilotLeakyHeading.mjs`, `brain/pilotLeakyHeading-selfcheck.mjs` |
| `plain-net-tank-kind` | **DONE 2026-11-05** (the rung 4b plain net, not the 14-feature control: see below): `render/subAquariumPlainNet.mjs`: `plainNetKind`, `kindOfRecord`, `plainNetArm({ record })`, for the 48 committed champions of `brain/rig-results/plainNetStudy.jsonl` (MN 85 / 589 / 652 weights, MG 1,348). Gate with 108 mutants (78 red by name, 29 threw, 1 equivalent). No shared file: the kind is registered by the board's `register(tank)` hook or a page, as `render/subAquariumFlyCx.mjs` is. | `render/subAquariumPlainNet.mjs`, `render/subAquariumPlainNet-selfcheck.mjs` |
| `demo-fish-escape` | **PRE-READ DONE 2026-11-05: NO ESCAPE OUTPUT.** The 803-weight fish pilot outputs the same four controls, its neurons are DMV inputs and its weights file says the Mauthner circuit is not in it; the rung 4b E arm has Mauthner-labelled cells but reads out through the same four-control readout and ties its plain-net control; the tank has no hazard event. As worded the demo cannot be built honestly; three honest replacements are in the note. | `brain/FISH_ESCAPE_PREREAD.md` |
| `decision-circuit-vs-twin` | **DRAFT REGISTRATION WRITTEN 2026-11-05, not registered:** `brain/DECISION_CIRCUIT_VS_TWIN_DRAFT.md`. Its main finding for the owner: there is no trained circuit to fly (Stage A's file holds only the references record) and the circuit starts from `GUARDED-OBS`, not the tuned rule, so as built the comparison has a known answer; the draft proposes re-basing the circuit on the seat's rule (D1b), lists six decisions with a recommendation each, and proposes a fresh audit block 16001-16300 (to be checked against the ledger). | `brain/DECISION_CIRCUIT_VS_TWIN_DRAFT.md` |

## How to join the board (the interface is the one in `brain/switchboard.mjs` at `f4b55956`, copied into both gates; neither module imports the board)

```js
import { leakyArm } from "./pilotLeakyHeading.mjs";
import { plainNetArm } from "../render/subAquariumPlainNet.mjs";
board.addArm(leakyArm());                                                              // controls: ["autopilot"]
board.addArm(leakyArm({ id: "leaky-unit-off", weights: [0.9999, 0], controls: [] })); // the no-memory lesion = the dropout autopilot, exactly
board.addArm(plainNetArm({ record }));                                                 // record = a line of brain/rig-results/plainNetStudy.jsonl (spec, widths, scales, weights)
// the arms the board should hold the fly against, so that "ties its control" can be said:
//   stateful fly:  controls: ["autopilot", "leaky-unit", "plainnet-P/B/mn:3"]
```
Both arms are `layer: "flying"` with `entry()` and `register(tank)`; `register` calls `tank.registerPilotKind(circuit, kind)`, the board's dropout task calls it on each fresh tank before `sync`.

## What was measured while gating (dropout event, the board's own loop, ids `sb-1`..`sb-12`, 160 s, the settled dark heading error to the wandering target; NOT paired-tested, NOT findings)

| arm | settled dark heading error (rad) | note |
|---|---|---|
| PD autopilot | 0.702 | |
| dead-reckoning navigator (event `navigator`) | 0.644 | the reference |
| `leaky-unit` (sigma 0.9999, gain 1) | 0.647 | within 0.014 of the navigator on every id; its heading estimate is 0.03 to 0.04 rad rms off against the navigator's 0.0003 to 0.001 |
| `leaky-unit-off` (gain 0) | 0.702 | equal to the autopilot on every id |
| `plainnet-P/B/mn:3` (589 weights, trained on the 4b-P pitch disturbance) | 0.638 | in the gate |
| other plain-net champions (scratch run, **not gated**): P/whole/mn:0, E/whole/mn:1, P/B/mg:0 | 0.635, 0.637, 0.679 | |
| `plainnet-E/E/mn:0` (85 weights, trained on the 4b-E hazard) | 0.507 | scratch, **not gated**: the largest gain of the five |

The notes' tank table (`brain/TANK_PILOTS_WIP.md`, ids `bench-0`..`bench-23`) had the stateful fly 0.131 below the autopilot in the dark; different ids, so not comparable to the numbers above without a paired run. **What these numbers are good for is the head-to-head round's registration:** a 85-weight plain net with no memory and no heading sense, trained on a disturbance the tank does not have, lowers the tank's dark heading error by about as much as the stateful fly, and the leaky unit does it by integrating; that is rung 4a's "the gain is generic, not a compass skill" seen once more, and it is exactly the line the board is built to be able to print. Reading it as a result needs the paired round.

## What was NOT done, and why
* **A plain-net control for the 963-weight networks** (a dense net on the 14 tank features at about 963 weights, the control `HEAD_TO_HEAD.md` H2 asks for): a different pilot (`pilotSubPlainNet.mjs` takes four tilt signals, not the 14 features) and a training round (4 searches x 400 children per control); not built. `plain-net-tank-kind` as done seats the rung 4b nets, which exist.
* **The fish circuit pilot as a kind** (`fish-pilot-tank-kind`, `brain/pilotSubVestibular.mjs`): not asked for here; the plain-net kind is its control and would be its pattern.
* **Anything on the board itself:** it is not in this tree. The gates apply a copy of the board's acceptance rules (`addArm`: an id and a layer; the dropout task: `entry()`) and fly the board's dropout loop; the first real `board.addArm` is the other chat's to try.
* **A tilt, gust or hazard event in the tank** (`demo-fish-righting`, `demo-fish-escape`): a shared file.
* **Gate census and the ship:** two new gates (`brain/pilotLeakyHeading-selfcheck.mjs`, `render/subAquariumPlainNet-selfcheck.mjs`) and nothing else that moves a count; the knowledge-index bake at ship time picks them up.
