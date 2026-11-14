# Rig commands: the turret seat's SECOND round, from the champion that always fires (2026-11-14; UNNUMBERED)

Keith: "lets do option 2 first". Nothing below has been run on the rig.

**What round 1 found.** Four searches of 1,000 children on the rig all kept one weight: the gunner holds the trigger whenever it has a target. On 600 audit pairs that champion leads the hand gunner by +0.850 and its untrained start by +0.642 (`brain/seatTurretGunnerWeightsBig.json`). A plain trigger bias does the same, so nothing about the fly's wiring was learned.

**What round 2 asks.** Is there anything else? Every search STARTS from the round-1 champion, so always firing is the baseline: a child is kept only if it beats THAT by the same paired test (z >= 2.5 over 300 pairs), and the prune goes back to the champion, not to the car's weights. The pairs are all fresh: train seeds 6101-6175, held-out 7001-7075, audit 8001-8150. A champion ships (`brain/seatTurretGunnerWeightsBig2.json`) only if on the audit it leads the hand gunner AND leads the round-1 champion.

**What it costs.** About what round 1 cost a search, perhaps a little more (a ship that always fires has more rounds in flight): on the order of 10 core-hours a search, NOT MEASURED. Every search is resumable (`.ckpt` beside its record); run them one after another.

## 0. Get the branch

```
git fetch origin claude/epic-cori-2hm1my
git checkout claude/epic-cori-2hm1my
git pull --ff-only origin claude/epic-cori-2hm1my
cd WebGLEngine
git log -1 --oneline
```

`brain\seatTurretGunnerWeightsBig.json` must be there after the pull (round 2 starts from it; the command refuses without it).

## 1. One minute first

```
node tools\ship\trainTurretSeatBig-selfcheck.mjs
```

It must end `ALL PASS`.

## 2. The four searches (note `--round 2` and the directory `turretBig2`)

```
node tools\ship\trainTurretSeatBig.mjs search --round 2 --seed 9210 --iters 1000 --record brain\rig-results\turretBig2\s9210.json
node tools\ship\trainTurretSeatBig.mjs search --round 2 --seed 9211 --iters 1000 --record brain\rig-results\turretBig2\s9211.json
node tools\ship\trainTurretSeatBig.mjs search --round 2 --seed 9212 --iters 1000 --record brain\rig-results\turretBig2\s9212.json
node tools\ship\trainTurretSeatBig.mjs search --round 2 --seed 9213 --iters 1000 --record brain\rig-results\turretBig2\s9213.json
```

Each first prints `round 2: from the round-1 champion ...` and then the start's score on the 300 train pairs. A search that keeps nothing is a result.

## 3. The choice and the audit -- ONCE, AFTER ALL FOUR HAVE WRITTEN THEIR `s92xx.json`

```
git pull --ff-only origin claude/epic-cori-2hm1my
node tools\ship\trainTurretSeatBig.mjs finish --round 2 --records-dir brain\rig-results\turretBig2 --write
```

(The pull brings the sandbox's own round-2 record, `s9200.json`, if it has been pushed by then.) It writes `brain\seatTurretGunnerWeightsBig2.reading.json` whatever the verdict, and `brain\seatTurretGunnerWeightsBig2.json` only if the champion qualifies. It refuses to run again while the reading file is there. In round 1 this step was run early by mistake; nothing was chosen on it and the numbers were the same each time, but wait for all four this time.

## 4. Send it back

```
git add brain\rig-results\turretBig2 brain\seatTurretGunnerWeightsBig2.reading.json
git add brain\seatTurretGunnerWeightsBig2.json
git commit -m "rig: the turret seat's round 2 (seeds 9210-9213) and the audit's reading"
git push origin claude/epic-cori-2hm1my
```

(The second `git add` fails harmlessly if no weights file was written.) A zip of the directory and the two `brain\seatTurretGunnerWeightsBig2*` files in the chat does as well.
