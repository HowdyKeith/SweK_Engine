# Rig commands: the fly's TARGET-TRACKING circuit in the gun seats, against a random circuit (2026-11-16; UNNUMBERED)

Nothing below has been run on the rig. It is independent of every other sheet: run it whenever the cores are free (each search uses every core).

**What it asks.** `brain/seatTrackGunner.mjs` seats the turret gunner over the fly's visual pursuit pathway (LC10a, AOTU019, AOTU025, DNa02: 281 neurons, 6,589 connections), starting from the race car's hand rule. Can a search find a better gunner over it, and does the FLY'S wiring matter or does a random circuit of the same size do as well? The fight is the one in which a trigger is worth learning: NO CANNON on either side and an EIGHTH of the magazines, so the gunner is told how much it has spent. A child is kept only if it beats its parent by the paired test (z >= 2.5 over 300 pairs). Fresh pairs: train seeds 34001-34075, held-out 35001-35075, audit 36001-36150.

**Registered before any pair was flown** (the header of `tools/ship/trainTrackSeat.mjs`): T1 the fly's champion against the hand gunner; T2 what the training bought (champion less the start); T3 its synapses; T4 the fly's champion less the control's. It ships only if T1 and T2 both lead.

**What the sandbox did.** One search of 100 children over each wiring (seeds 9800 and 9820, in `brain\rig-results\trackSeat` and `trackSeatControl`) and its own reading. The rig's searches are 1,000 children and four a wiring, in directories of their own, with a reading file of its own (`--out`): a second reading of the same audit pairs for other champions.

**What it costs.** NOT MEASURED on the rig. A fight here has no cannon (two to three times longer) and thirteen 281-neuron networks a side; in the sandbox a pair costs about one and a half core-seconds. A search of 1,000 children is perhaps 30 to 50 core-hours; there are eight. Resumable: run the same command again.

## 0. Get the branch, then half a minute first

```
git pull --ff-only origin claude/epic-cori-2hm1my
cd WebGLEngine
node tools\ship\trainTrackSeat-selfcheck.mjs
```

It must end `ALL PASS`.

## 1. Four searches over the fly's tracking circuit

```
node tools\ship\trainTrackSeat.mjs search --seed 9810 --iters 1000 --record brain\rig-results\trackSeatRig\s9810.json
node tools\ship\trainTrackSeat.mjs search --seed 9811 --iters 1000 --record brain\rig-results\trackSeatRig\s9811.json
node tools\ship\trainTrackSeat.mjs search --seed 9812 --iters 1000 --record brain\rig-results\trackSeatRig\s9812.json
node tools\ship\trainTrackSeat.mjs search --seed 9813 --iters 1000 --record brain\rig-results\trackSeatRig\s9813.json
```

## 2. The same four over a RANDOM circuit of its size (the control)

```
node tools\ship\trainTrackSeat.mjs search --wiring control:4242 --seed 9830 --iters 1000 --record brain\rig-results\trackSeatRigControl\s9830.json
node tools\ship\trainTrackSeat.mjs search --wiring control:4242 --seed 9831 --iters 1000 --record brain\rig-results\trackSeatRigControl\s9831.json
node tools\ship\trainTrackSeat.mjs search --wiring control:4242 --seed 9832 --iters 1000 --record brain\rig-results\trackSeatRigControl\s9832.json
node tools\ship\trainTrackSeat.mjs search --wiring control:4242 --seed 9833 --iters 1000 --record brain\rig-results\trackSeatRigControl\s9833.json
```

## 3. The choice and the audit -- ONCE, AFTER ALL EIGHT HAVE WRITTEN THEIR `s98xx.json`

```
node tools\ship\trainTrackSeat.mjs finish --records-dir brain\rig-results\trackSeatRig --control-records-dir brain\rig-results\trackSeatRigControl --out brain\seatTrackGunnerWeightsRig.json --write
```

It prints T1 to T4, each with its word, and `QUALIFIES` or `DOES NOT QUALIFY`. **Do not run it early**; if it is run by mistake, send the reading file as it is.

## 4. Send back

The console output of step 3, the two folders, and the `seatTrackGunnerWeightsRig*` files.
