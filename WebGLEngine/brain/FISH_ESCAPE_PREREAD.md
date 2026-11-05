# Pre-read: does the fish pilot have an escape output? (2026-11-05; UNNUMBERED; reading only -- nothing was run, nothing trained, no file other than this one was written)

Keith, 2026-11-05, answering the backlog entry `demo-fish-escape` of `brain/BACKLOG_2026-11-04_BRAINS.md` (on the switchboard branch): "A pre-read of whether the fish pilot has an escape output at all. I don't know that it does." The entry says the demo claims "a latency, and only if the pilot has an escape output (not checked)". This note is the check.

## The answer, in one line

**No. The 803-weight fish pilot has no escape output, and its own weights file says so. The one place in the tree where a Mauthner-labelled cell exists is the rung 4b "E" arm, and it has no escape output either: its cells feed the same four controls through a shared readout. The tank has no hazard or collision event for a latency to be measured on. As worded, `demo-fish-escape` cannot be built honestly.**

## What "the fish pilot" is, and what it outputs

* **The 803-weight pilot** (`brain/pilotSubFish.mjs`, weights `brain/pilotSubWeightsFishWip.json`, `policy: pilotSubFish`, `hidden: 34`, `outputs: 4`) is `createSubPolicy` (`brain/pilotSubPolicy.mjs`) on the Fish1 TEN-analysis core (`brain/zebrafishTopology.mjs`): 34 neurons, 153 edges, 14 x 34 + 34 + 153 + 34 x 4 + 4 = 803 weights. `OUTPUTS = 4`: **pitch, yaw, thrust, ballast**, each clamped to [-1, 1] (`brain/pilotSubPolicy.mjs:26`). There is no fifth channel, no event input and no separate reflex path.
* **The neurons are not escape neurons.** `vendor/zebrafish/PROVENANCE.md`: 22 of the 34 are labelled inputs to the dorsal motor nucleus of the vagus, 7 are DMV (visceral motor) neurons, 1 is a TEN class II, 1 a TEN class IV, 3 carry no label; "**The Mauthner (escape) circuit, the fish's true counterpart of the giant fiber, is in the CAVE tables and is not here.**" The weights file's own `by` text says it again: "the Mauthner escape circuit is not in it."
* **It cannot even see a cue.** The pilot reads the autopilot's 14 features. Per `brain/FISH_VESTIBULAR_HELPER_WIP.md` (Addendum 3, the cue measurement) those carry bank and sideslip but **not** the roll rate, and a level of bank or sideslip is not separable from the autopilot's own turn (ratios 0.34 and 0.20); the roll rate is (3.1) and lasts about 0.2 s.
* **The second fish circuit** (`vendor/zebrafish/fish1-hmi-spn.json`, 99 neurons, the 885-weight records of `brain/fishCircuitStageA.jsonl`) is the hindbrain motion integrator and its spinal projection neurons for turning and forward swimming. A turning and swimming route, not an escape route; the stage A record is the same four controls.

## Where a Mauthner cell does exist, and what that is

* `brain/pilotSubVestibular.mjs` (rung 4b; the Liu et al. 2022 vestibular tables, `tools/fishVestibularCircuit.mjs`) has the arm **E**: the Mauthner cell and 4 vestibular commissural cells, 25 inputs, 31 edges, 81 synapses. Its gate row (`brain/pilotSubVestibular-selfcheck.mjs:77`) holds that E's cells are those five.
* Its **outputs are the same four controls**: `OUTPUTS` is imported from `pilotSubPolicy.mjs` and the readout is "ALL the central cells of the arm (dense, trainable, from zero) plus four biases", added to the autopilot's laws as a residual (header of the file). The Mauthner cell has no output of its own; whatever it contributes is one column of a 4 x 5 matrix that training sets.
* **The label is an inference.** The helper note's own list of what is unchecked ends with "the Mauthner identification" (`brain/FISH_VESTIBULAR_HELPER_WIP.md`, line 205).
* The escape TASK exists: 4b-E, one unguided straight-runner launched from one side with a pressure pulse ahead of it (`tools/subVestibularTasks.mjs`, a header that says UNGATED). It runs in the `brain/subTask.mjs` runner, **not in the tank**. The pilots registered for it are trained (1+1)-ES residuals; **no 4b-E champion weights are in this tree** (the `brain/rig-results/fishVestibular*.jsonl` records are; I read their summary in the notes, not the records).
* What 4b-E found, from the notes: the cue is dodgeable only by a pilot with a memory (the stateless hand reflex "wins back 0.00 at every rung and is hit 38 of 40 at rung 0"); on the plain-net round the extracted E wiring **ties a plain net** (E/E: -1.219 against -1.178, 100 to 103 percent of the gain kept; E/whole 101 to 107 percent; registered test OVERALL NOT SUPPORTED, 0 of 4 cells); with a state, the registered start (lambda 0.99) is **behind** NO STATE on all three audits in both cells (Addendum 13). So even where an escape-shaped task exists, the notes do not show that the Mauthner-wired pilot responds to it better than the circuit-free control.

## The tank has nothing for a latency to be measured on

* `render/subAquariumSim.mjs` `EVENTS` = flood, sink, surface, dropout, navigator, fly-estimator, er-estimator, needs. **No hazard, no collision.** (A grep of the sim and of `ai-bridge/subAquariumCore.js` for hazard and collision finds nothing.)
* The nearest thing is **flood**: a 6 percent leak. Its response is `brain/emergencyPilot.mjs`: a hand-written wrapper (blow, full thrust, planes up; then the drop weight) that "wraps any pilot" and speaks only when the boat is more than 5 m (in the tank, 2 m) below its target and still sinking. It is a rule around a pilot, not an output of one, and it acts on a sink, which is slow, not on a cue.

## What "against the PD autopilot's latency" would have to mean

The PD autopilot has no escape response to time: it has no roll-rate feature, so it does not react to the cue at all; it reacts to the displacement afterwards, through its sideslip and heading terms. A latency is defined for a pilot that reacts to the cue; for the autopilot the honest entry is "no response to the cue" (a hit, mostly: 4b-E costs the autopilot 3.112 of dive score on the training dives), not a number to set beside the fish's.

## What the entry can honestly become (the facts above; the choice is Keith's)

1. **Strike `demo-fish-escape`** and say why in the backlog: no output, no event, no champion, and the closest task ties its plain-net control.
2. **Replace it with the flood demo** the tank already has, labelled for what it is: the emergency wrapper rescuing a leaking boat, with no brain in the claim. This needs nothing new and says nothing about a connectome.
3. **If a hazard demo is wanted anyway**, it is a new tank event (a shared file), a trained 4b-E pilot (a training round of its own; the tree holds none), and a latency definition written first (for example, ticks from launch to the first yaw command that differs from the same dive without the hazard by more than a registered threshold). The headline it could carry is "ties its plain-net control"; the switchboard's own line exists to say that.

## Not checked

The CAVE tables (the Mauthner cell of Fish1 itself, not the Liu et al. vestibular tables) were not fetched or read; nothing here says anything about the real Mauthner circuit. The `fishVestibular*.jsonl` records were not re-read; the 4b-E figures are copied from `brain/PLAIN_NET_CONTROL_WIP.md` and `brain/FISH_VESTIBULAR_HELPER_WIP.md`. No pilot was run.
