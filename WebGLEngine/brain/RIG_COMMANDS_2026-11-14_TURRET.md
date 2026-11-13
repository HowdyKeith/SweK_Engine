# Rig commands: the turret seat's search on many more pairs (2026-11-14; UNNUMBERED)

Keith: "i will run on my rig". Nothing below has been run on the rig. Every search is RESUMABLE (it keeps a `.ckpt` beside its record after every child; the same command goes on from it), and the last step reads the audit ONCE and then refuses to read it again.

**What this is for.** The first trainer judged each child on 8 pairs and its results did not survive 300 (`tools/ship/takeTurretAudit.mjs`): the training bought nothing that could be told and the one hint did not replicate. `tools/ship/trainTurretSeatBig.mjs` is the same search with a child kept only if it beats its parent by a paired test of z >= 2.5 over 300 train pairs. In the sandbox (4 cores) its first search has tried 100 children and kept none. The rig's job is breadth: four searches of 1,000 children each.

**What it costs.** A child is about 80 pairs on average (most are dropped at 60) and a pair about 0.46 s of one core: roughly 10 core-hours a search, 40 for the four, NOT MEASURED ON THE RIG. Each search uses every core of the machine through `tools/ship/pairPool.mjs` (`--workers N` to use fewer), so run them one after another.

## 0. Get the branch (PowerShell or cmd)

```
git fetch origin claude/epic-cori-2hm1my
git checkout claude/epic-cori-2hm1my
git pull --ff-only origin claude/epic-cori-2hm1my
cd WebGLEngine
git log -1 --oneline
```

Every command below is run from `WebGLEngine\`.

## 1. One minute first: does the pool work on this machine

```
node tools\ship\trainTurretSeatBig-selfcheck.mjs
```

It must end `ALL PASS`. Its first section flies ten real pairs on one, two and three worker threads and compares them with the same pairs flown serially, to the bit. THIS GATE HAS ONLY EVER RUN ON LINUX: if a row is red on the rig, stop and send the output; do not run the searches.

## 2. The four searches (one after another; stop and restart any of them freely)

```
node tools\ship\trainTurretSeatBig.mjs search --seed 9100 --iters 1000 --record brain\rig-results\turretBig\s9100.json
node tools\ship\trainTurretSeatBig.mjs search --seed 9101 --iters 1000 --record brain\rig-results\turretBig\s9101.json
node tools\ship\trainTurretSeatBig.mjs search --seed 9102 --iters 1000 --record brain\rig-results\turretBig\s9102.json
node tools\ship\trainTurretSeatBig.mjs search --seed 9103 --iters 1000 --record brain\rig-results\turretBig\s9103.json
```

Each prints a line every 20 children and a line for every child it keeps (`ACCEPTED`). Its last line says how many it kept, where the others were dropped, what the prune left and how many synapses carry a weight. A search that keeps nothing is a result, and its record is the start.

## 3. The choice and the audit (ONCE; about 2,400 to 3,000 pairs, some minutes)

First pull, so that the sandbox's own two records (`s9000.json`, `s9001.json`, 200 children each) are in the same directory if they have been pushed by then:

```
git pull --ff-only origin claude/epic-cori-2hm1my
node tools\ship\trainTurretSeatBig.mjs finish --records-dir brain\rig-results\turretBig --write
```

It reads every record on the 300 held-out pairs, takes the best, and flies the 600 audit pairs once for the champion, the start (the car's untrained hand weights) and the champion with its synapses at zero. It prints four readings with their words (LEADS / TRAILS / CANNOT BE TOLD at z 2) and writes `brain\seatTurretGunnerWeightsBig.reading.json` whatever the verdict. The weights file `brain\seatTurretGunnerWeightsBig.json` is written ONLY if the champion LEADS the hand gunner AND LEADS the start. `brain\seatTurretGunnerWeightsDefault.json` is not touched.

**Do not run step 3 twice.** It refuses when the reading file is there; deleting that file to run it again is a second read of the audit.

## 4. Send it back

```
git add brain\rig-results\turretBig brain\seatTurretGunnerWeightsBig.reading.json
git add brain\seatTurretGunnerWeightsBig.json
git commit -m "rig: the turret seat's big searches (seeds 9100-9103) and the audit's reading"
git push origin claude/epic-cori-2hm1my
```

(The second `git add` fails harmlessly if no weights file was written. The `.ckpt` files can be left out or in.) Then say so in the chat, with the last lines step 3 printed: the gate's shipped-file section and the backlog entry are written from the reading, not before it.

## What is NOT in this list

A control wiring (whether the FLY's synapses do better than any others'), the helm, the correcting seat gunners, and anything on the GPU. If step 2 keeps nothing in 4,000 children, the next question is the search's children (their size, `sigma` 0.5), not more pairs.
