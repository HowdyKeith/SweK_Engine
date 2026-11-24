# Rig commands: the turret seat's THIRD round -- no cannon, rationed rounds, a gunner that knows what it has left (2026-11-14; UNNUMBERED)

Nothing below has been run on the rig. Run it AFTER round 2 has finished (the two rounds do not depend on each other, but each search uses every core).

**Why this arena.** Round 1's champion learned to hold the trigger, which is right only because the guns never run dry. `tools/ship/takeAmmoStudy.mjs` then showed, and confirmed on fresh pairs, that with NO CANNON and an EIGHTH of the magazines the gunner that always fires TRAILS the one that fires when the sight says to (-0.324, z -3.5), while with the whole magazines it leads by more than 1. Neither rule is right for a whole rationed fight.

**What round 3 asks.** Can a gunner that is told how much of its magazine it has spent learn when to hold the trigger and when to keep its rounds? Every search starts from the car's untrained hand weights (the better gunner in this arena); the children may read the new rounds-left sense; the same paired test (z >= 2.5 over 300 pairs); fresh pairs throughout (train seeds 13001-13075, held-out 14001-14075, audit 15001-15150). A champion ships (`brain/seatTurretGunnerWeightsBig3.json`) only if on the audit it leads the hand gunner AND leads its start.

**What it costs.** MORE than rounds 1 and 2: without the cannon a fight runs two to three times longer. Perhaps 20 to 30 core-hours a search, NOT MEASURED, and there are EIGHT searches (four over the fly's wiring, four over a control). Resumable as before; steps 1 and 1b can be run in either order or interleaved.

## 0. Get the branch, then one minute first

```
git pull --ff-only origin claude/epic-cori-2hm1my
cd WebGLEngine
node tools\ship\trainTurretSeatBig-selfcheck.mjs
```

It must end `ALL PASS`.

## 1. The four searches (note `--round 3` and the directory `turretBig3`)

```
node tools\ship\trainTurretSeatBig.mjs search --round 3 --seed 9310 --iters 1000 --record brain\rig-results\turretBig3\s9310.json
node tools\ship\trainTurretSeatBig.mjs search --round 3 --seed 9311 --iters 1000 --record brain\rig-results\turretBig3\s9311.json
node tools\ship\trainTurretSeatBig.mjs search --round 3 --seed 9312 --iters 1000 --record brain\rig-results\turretBig3\s9312.json
node tools\ship\trainTurretSeatBig.mjs search --round 3 --seed 9313 --iters 1000 --record brain\rig-results\turretBig3\s9313.json
```

Each first prints `round 3: fights with NO CANNON on either side and an EIGHTH of the magazines ...`.

## 1b. The same four searches over a RANDOM wiring (the control), into a directory of their own

This is what lets a round-3 result say whether the FLY'S wiring did anything: the same search, the same arena, the same number of children, over a random circuit of the fly's size (`brain/seatTurretCircuit.mjs`, seed 4242). Same cost again as step 1.

```
node tools\ship\trainTurretSeatBig.mjs search --round 3 --wiring control:4242 --seed 9320 --iters 1000 --record brain\rig-results\turretBig3control\s9320.json
node tools\ship\trainTurretSeatBig.mjs search --round 3 --wiring control:4242 --seed 9321 --iters 1000 --record brain\rig-results\turretBig3control\s9321.json
node tools\ship\trainTurretSeatBig.mjs search --round 3 --wiring control:4242 --seed 9322 --iters 1000 --record brain\rig-results\turretBig3control\s9322.json
node tools\ship\trainTurretSeatBig.mjs search --round 3 --wiring control:4242 --seed 9323 --iters 1000 --record brain\rig-results\turretBig3control\s9323.json
```

Each first prints `THE WIRING IS A CONTROL (control:4242) ...`. A control never gets a weights file.

## 2. The choice and the audit -- ONCE, AFTER ALL FOUR HAVE WRITTEN THEIR `s93xx.json`

```
git pull --ff-only origin claude/epic-cori-2hm1my
node tools\ship\trainTurretSeatBig.mjs finish --round 3 --records-dir brain\rig-results\turretBig3 --write
```

## 2b. The control's own reading, and the two wirings side by side -- ONCE EACH, after steps 1b and 2

```
node tools\ship\trainTurretSeatBig.mjs finish --round 3 --wiring control:4242 --records-dir brain\rig-results\turretBig3control
node tools\ship\trainTurretSeatBig.mjs wiring --round 3 --wiring control:4242 --records-dir brain\rig-results\turretBig3 --control-records-dir brain\rig-results\turretBig3control
```

The second prints `W THE FLY'S WIRING AGAINST THE CONTROL'S` with its word and writes `brain\seatTurretGunnerWeightsBig3.wiring-control4242.reading.json`. It was registered before any control pair was flown, with a forecast of CANNOT BE TOLD.

## 3. Send it back

```
git add brain\rig-results\turretBig3 brain\rig-results\turretBig3control brain\seatTurretGunnerWeightsBig3.reading.json brain\seatTurretGunnerWeightsBig3.control4242.reading.json brain\seatTurretGunnerWeightsBig3.wiring-control4242.reading.json
git add brain\seatTurretGunnerWeightsBig3.json
git commit -m "rig: the turret seat's round 3 (seeds 9310-9313) and the audit's reading"
git push origin claude/epic-cori-2hm1my
```

(Or a zip of the directory and the two `brain\seatTurretGunnerWeightsBig3*` files.)
