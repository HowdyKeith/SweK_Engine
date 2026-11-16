# Rig commands: the fly's STEERING circuit at the helm, against a random circuit (2026-11-15; UNNUMBERED)

Nothing below has been run on the rig. It is independent of the turret rounds 2 and 3: run it whenever the cores are free (each search uses every core).

**What it asks.** `brain/helmSteerPolicy.mjs` puts the central complex's steering output (PFL2, PFL3, DNa02, DNa03: 40 neurons, 523 connections) behind the rule that turns a capital ship. Can a search find a helm over it that beats the rule -- and does the FLY'S wiring matter, or does a random circuit of the same size do as well? Every search starts from the zero weights (which ARE the rule), and a child is kept only if it beats its parent by the paired test (z >= 2.5 over 300 pairs). Fresh pairs: train seeds 21001-21075, held-out 22001-22075, audit 23001-23150.

**Registered before any pair was flown** (the header of `tools/ship/trainHelmSteer.mjs`): H1 the fly's champion against the rule; H2 its synapses; H3 the fly's champion less the control's; H4 the fly's champion less the escape circuit's shipped helm. Forecast: H1 LEADS, the other three CANNOT BE TOLD.

**What the sandbox already did.** One search of 150 children over each wiring (seeds 9500 and 9520, records in `brain\rig-results\helmSteer` and `helmSteerControl`), and its own reading of the audit pairs (`brain\helmSteerWeightsDefault.reading.json`). The rig's searches are 1,000 children and four a wiring, in directories of their own, and its reading goes to a file of its own (`--out`): it is a second reading of the same 600 audit pairs for other champions, and it says so.

**What it costs.** NOT MEASURED on the rig. In the sandbox a child costs about 11 seconds on 3 cores (most are dropped after 60 pairs), so a search of 1,000 children is perhaps 8 to 12 core-hours; there are eight. Resumable: a search that is stopped goes on from its checkpoint when the same command is run again.

## 0. Get the branch, then a quarter of a minute first

```
git pull --ff-only origin claude/epic-cori-2hm1my
cd WebGLEngine
node tools\ship\trainHelmSteer-selfcheck.mjs
```

It must end `ALL PASS`.

## 1. Four searches over the fly's steering circuit

```
node tools\ship\trainHelmSteer.mjs search --seed 9510 --iters 1000 --record brain\rig-results\helmSteerRig\s9510.json
node tools\ship\trainHelmSteer.mjs search --seed 9511 --iters 1000 --record brain\rig-results\helmSteerRig\s9511.json
node tools\ship\trainHelmSteer.mjs search --seed 9512 --iters 1000 --record brain\rig-results\helmSteerRig\s9512.json
node tools\ship\trainHelmSteer.mjs search --seed 9513 --iters 1000 --record brain\rig-results\helmSteerRig\s9513.json
```

## 2. The same four over a RANDOM circuit of its size (the control)

```
node tools\ship\trainHelmSteer.mjs search --wiring control:4242 --seed 9530 --iters 1000 --record brain\rig-results\helmSteerRigControl\s9530.json
node tools\ship\trainHelmSteer.mjs search --wiring control:4242 --seed 9531 --iters 1000 --record brain\rig-results\helmSteerRigControl\s9531.json
node tools\ship\trainHelmSteer.mjs search --wiring control:4242 --seed 9532 --iters 1000 --record brain\rig-results\helmSteerRigControl\s9532.json
node tools\ship\trainHelmSteer.mjs search --wiring control:4242 --seed 9533 --iters 1000 --record brain\rig-results\helmSteerRigControl\s9533.json
```

Each first prints `THE WIRING IS A CONTROL (control:4242) ...`. A control's weights are never a brain file.

## 3. The choice and the audit -- ONCE, AFTER ALL EIGHT HAVE WRITTEN THEIR `s95xx.json`

```
node tools\ship\trainHelmSteer.mjs finish --records-dir brain\rig-results\helmSteerRig --control-records-dir brain\rig-results\helmSteerRigControl --out brain\helmSteerWeightsRig.json --write
```

It prints H1 to H4, each with its word, and `QUALIFIES` or `DOES NOT QUALIFY`. It writes `brain\helmSteerWeightsRig.reading.json` (its mark: a second run is refused) and, if the fly's champion leads the rule, `brain\helmSteerWeightsRig.json`.

**Do not run step 3 early.** If it is run by mistake, do not delete the reading file to run it again: send it as it is.

## 4. Send back

The console output of step 3, and the folders `brain\rig-results\helmSteerRig` and `brain\rig-results\helmSteerRigControl` with the two `helmSteerWeightsRig*` files.

## 5. The same again over the circuit WITH ITS INPUTS (added 2026-11-16; optional, after steps 1-4)

`brain/helmCompassPolicy.mjs` is the steering circuit with the compass and the goal cells: 220 neurons, 7,981 connections. Registered with pairs of its own (train 24001-, held-out 25001-, audit 26001-). The sandbox's one search a wiring (150 children) found the same thing as over the smaller circuit: a helm that leads the rule (+0.466) on three weights and no synapse. A fight costs more here (about three to four times a steering-circuit fight in the sandbox).

```
node tools\ship\trainHelmSteer.mjs search --circuit compass --seed 9610 --iters 1000 --record brain\rig-results\helmCompassRig\s9610.json
node tools\ship\trainHelmSteer.mjs search --circuit compass --seed 9611 --iters 1000 --record brain\rig-results\helmCompassRig\s9611.json
node tools\ship\trainHelmSteer.mjs search --circuit compass --wiring control:4242 --seed 9630 --iters 1000 --record brain\rig-results\helmCompassRigControl\s9630.json
node tools\ship\trainHelmSteer.mjs search --circuit compass --wiring control:4242 --seed 9631 --iters 1000 --record brain\rig-results\helmCompassRigControl\s9631.json
node tools\ship\trainHelmSteer.mjs finish --circuit compass --records-dir brain\rig-results\helmCompassRig --control-records-dir brain\rig-results\helmCompassRigControl --out brain\helmCompassWeightsRig.json --write
```

The last line ONCE, after the four searches. Send back its output, the two folders and the `helmCompassWeightsRig*` files.
