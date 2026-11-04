# Head-to-head rounds on the switchboard (UNNUMBERED; this file is mine, new, so no other chat is writing in it)

# Round H1 -- the repo's 963-weight networks against the PD autopilot and against their own untrained start, on the tank's compass dropout (REGISTERED 2026-11-04, before any code and before any of its seeds was flown)

## 1. Why
The switchboard (`brain/switchboard.mjs`) can fly any 963-weight network against the PD autopilot on the tank's compass dropout. Its first smoke run (3 ids) said one network beat the autopilot by +0.125 and another tied it; nothing says which of the eight networks in the tree does what, or whether the training is what pays. The fish and fly notes found, again and again, that the structure and the optimizer pay and the connectome does not (`brain/RUNG_4A_CLOSEOUT.md`, `brain/PLAIN_NET_CONTROL_WIP.md` on `claude/sweet-lovelace-8leivh`). This round asks the one question those notes leave for the networks this tree HAS:

> On the tank's compass dropout, does each trained 963-weight network beat the PD autopilot, does it beat the hand-wired weights it was trained from, and is its gain specific to the dark?

It says nothing about the fish pilot (803 weights, not flown by this tank), the stateful fly (not in this tree) or the plain-net control (not in this tree); those arms are not on the board yet and a result here is not about them.

## 2. The arms and the measure
**Arms (ten):** `autopilot` (the PD autopilot); `hand` (the untrained network: `brain/pilotSubPolicy.mjs` handWeights, the weights the training started from); and the eight trained networks in `brain/pilotSubWeights*Wip.json` with 963 weights, by file: **Wip, Actuators, Robust, RobustLong, RobustTail, RobustTail2, RobustWide, RobustNoisy**. The fish file (803 weights) is not flown. **Controls:** every trained network is read against `autopilot` and against `hand`; `hand` against `autopilot`.
**Task:** the switchboard's `dropout`: one-sub tanks, 160 s, the same spawn for every arm (ids sb-<n>), the compass dropout event on; score = 1 - (mean SETTLED dark heading error)/pi (settled = 12 s after a new target). **Lit control:** the same ids with no event; score from all ticks. **Seeds (fresh; the gate and the smoke run used ids 0-3):** ids **2000-2199 (200 ids)**, read once, dark and lit.
**Readings (the series' conventions):** pooled paired differences, BETTER iff mean > 2 se and positive, WORSE iff mean < -2 se, TIES otherwise. **DARK-SPECIFIC** for a network n: (n minus autopilot in the dark) minus (n minus autopilot lit), paired per id, BETTER iff above 2 se.

## 3. The checks
(a failure and the verdicts are NOT WEIGHED): every arm flew 200 ids in both conditions; the ids are the same in every arm; no arm has a score outside (0, 1); the autopilot's dark and lit scores differ on at least one id (the event reaches the flight); the networks are pairwise different on at least one id (ten distinct arms).

## 4. The verdicts and bottom lines
1. `<n> OF 8 NETWORKS BEAT THE AUTOPILOT IN THE DARK (<names>)`, with `; <names> ARE BELOW IT` appended when any is WORSE.
2. `<n> OF 8 NETWORKS BEAT THEIR UNTRAINED START IN THE DARK (<names>)`, with `; <names> ARE BELOW IT` appended.
3. `THE UNTRAINED HAND WEIGHTS <BEAT | TIE | ARE BELOW> THE AUTOPILOT IN THE DARK`.
4. `THE GAIN IS DARK-SPECIFIC IN <n> OF 8 (<names>)`.
5. `LOST SUBS: autopilot <a>, hand <h>, networks <total over all eight> (<max> in the worst)`.
**REPORTED, NOT IN THE VERDICT:** every arm's dark and lit mean; every network's paired difference from the autopilot and from `hand`, dark and lit, with se and the better/worse/same counts; the spread of the eight gains.

## 5. Expectations, recorded BEFORE any seed is flown
At least 5 of 8 networks beat the autopilot in the dark: about 70 percent; all 8: about 25; none: about 10. At least 5 of 8 beat the hand weights: about 60; the hand weights TIE the autopilot (they are the weights the autopilot's own network form starts from): about 55, BEAT it: 15, BELOW: 30. The gain is dark-specific in at least one network: about 35 (the networks were trained to track targets, not to hold through a dropout). The best network by dark gain is RobustNoisy: about 35 (it was trained under sensor noise, which a dark window resembles). No lost sub in any arm: about 85.

## 6. What will be built
`tools/ship/headToHead.mjs` (the arms from a weights map, the paired readings, the dark-specific difference, the checks and the bottom lines; reads nothing from disk), `tools/ship/headToHeadCmd.mjs` (export-free: reads the weight files, flies, prints, writes `brain/rig-results/head-to-head.json`) and `tools/ship/headToHead-selfcheck.mjs` with a mutation pass; then the run (one process, a few minutes) and the result as section 7 here. **NOT IN THIS ROUND:** the fish pilot, the stateful fly, the plain net, the leaky unit, the survey task, the lesion toggle; more than one boat hull; a task other than the compass dropout; any claim about wiring.
