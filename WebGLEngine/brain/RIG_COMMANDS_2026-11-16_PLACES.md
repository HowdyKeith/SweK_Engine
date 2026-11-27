# Rig commands: is it the fly's OWN cell positions? The places control at four times the pairs (2026-11-16; UNNUMBERED)

Nothing below has been run on the rig. It is independent of every other sheet. Of everything waiting for the rig, this is the one to run first.

**What it asks.** The fly-wired gunner (`brain/flyTracking.mjs`) with each tracking cell at its own place in the eye leads the same circuit with no places by about 0.08 to 0.10: two studies agree. With 600 pairs the sandbox could not divide that between the fly's OWN places (about 0.05 over three scrambles of the places) and having places at all (about 0.03): each half is under two standard errors. This is the same study with 2,500 audit pairs, where a difference of 0.05 is about three standard errors, and one more control: three circuits in which every cell stays at its place and only the tracking cells' connections TO EACH OTHER are shuffled (a scramble of the places breaks that neighbourhood too).

**Registered before any pair was flown** (`tools/ship/takePlacesControl.mjs`, `STUDIES.rig`): train seeds 71001-71075 of each kind, held-out 72001-72075, audit 73001-73625. Readings: P1 `fly:medial` less the scrambled; P2 `fly:lateral` less the scrambled; P3 the scrambled less no places; N1 `fly:medial` less the unneighboured; N2 the unneighboured less the scrambled. Forecast: P1 and P2 LEAD by about 0.05; P3 cannot be told; N1 cannot be told; N2 leads by a little.

**What it costs.** NOT MEASURED on the rig. 30,600 pairs with no cannon and thirteen 281-neuron circuits a side; in the sandbox a pair costs a little over one core-second, so about 10 core-hours in all. It is ONE command. Every arm's leads are kept as it finishes (`brain\rig-results\placesControlRig`), so a run that is stopped goes on from there when the same command is run again.

## 0. Get the branch, then a few seconds first

```
git pull --ff-only origin claude/epic-cori-2hm1my
cd WebGLEngine
node tools\ship\takePlacesControl-selfcheck.mjs
```

It must end `ALL PASS`.

## 1. The study -- one command; it reads its audit pairs ONCE, at the end

```
node tools\ship\takePlacesControl.mjs --study rig
```

It first prints `study rig: 9 wirings at gains -3, -1; 2500 audit pairs from seed 73001`, then each wiring's train leads and its gain, then the audit readings P1, P2, P3, N1, N2, each with its word, and writes `brain\flyTrackingPlacesControlRig.reading.json`. A second run after that file exists is refused: send the file as it is.

## 2. Send back

The console output, the folder `brain\rig-results\placesControlRig` and `brain\flyTrackingPlacesControlRig.reading.json`:

```
git add brain\rig-results\placesControlRig brain\flyTrackingPlacesControlRig.reading.json
git commit -m "rig: the places control at 2,500 audit pairs"
git push origin claude/epic-cori-2hm1my
```

(Or a zip of the folder and the reading file.)
