# The plain control of the 963-weight tank networks: built, trained once, flown (UNNUMBERED; 2026-11-05; backlog `brains-head-to-head-round` H2, "a plain-net-shaped control trained on the 14 tank features")

Written after the fact; nothing here was registered before it ran, and nothing in it is a verdict. The head-to-head round (`brain/HEAD_TO_HEAD.md` on `claude/wizardly-einstein-wr30pd`) owns the question *does any brain beat a net of its size that has no connectome in it?*; this note is the control that round asks for, what it scored, and how to fly it.

## What it is

| piece | file |
|---|---|
| the pilot: the PD autopilot's 14 features, 50 relu units, four controls clamped to [-1, 1], NO wiring, 14 x 50 + 50 + 0 + 50 x 4 + 4 = **954 weights** (the fly's network has 963, the fish's 803); the hand weights ARE the autopilot | `brain/pilotSubPlain.mjs` (`createSubPolicy` of `brain/pilotSubPolicy.mjs` on a circuit with 50 neurons and no edge) |
| the trainer's circuit `plain14` (seed 6300) | `tools/ship/trainSubPilot.mjs`, entry point `tools/ship/trainPilotSub.mjs` |
| the tank kind and the switchboard-shaped arm (`plain14Kind`, `checkFile`, `entryOfFile`, `plain14Arm({ file })`, id `plain14-954`) | `render/subAquariumPlain14.mjs`, same shape as `render/subAquariumFish.mjs` |
| the champion | `brain/pilotSubPlain14Wip.json` (954 weights, policy `pilotSubPlain14`, seed 6301 of 6300-6303) |
| a consumer in this tree | `node tools/ship/takeTankDropout.mjs ... --plain14` |

## The training, exactly the fly's and the fish's recipe

`node tools/ship/trainPilotSub.mjs --circuit plain14 --workers 4 --write --out brain/pilotSubPlain14Wip.json`: 4 searches x 400 children, sigma 0.3, 1 to 4 weights a child, from the hand weights, pruned; the champion is the best held-out of the searches that end no dive early on the 500 safety dives; the 36 audit dives (seeds 7000..), the 500 safety dives and the reserve are read once for it. About 19 minutes on 4 cores (the searches ran 990 to 1,140 s each while other jobs shared the box). It QUALIFIED (better than the autopilot on the held-out, audit and safety audit; no dive ended early that the autopilot completes; tail and every kind of dive kept).

| score (higher is better) | audit (36 dives) | safety audit (500) | reserve |
|---|---|---|---|
| PD autopilot | -0.4956 | -0.5564 | -0.5146 |
| fruit fly, Giant Fiber Circuit (963 weights) | **-0.3090** | **-0.3340** | **-0.3147** |
| random circuit of the fish's size (803) | -0.3191 | -0.3501 | -0.3282 |
| zebrafish core (803) | -0.3236 | -0.3523 | -0.3426 |
| **plain 14-50-4 net, no wiring (954)** | **-0.3211** | **-0.3483** | **-0.3456** |

(The first four rows are `brain/SUBMARINE_WIP.md`'s, read once each on the same audits; the fifth is this run's.) **At the size it has:** the plain net sits between the random control and the fish on the audit and the safety audit, and last on the reserve; the fly is ahead of it by 0.012, 0.014 and 0.031. Each row is ONE champion of four searches, and the four searches of this circuit alone scored -0.3352, -0.3143, -0.3862 and -0.3371 on the held-out dives, a spread of 0.07 that is larger than every gap in the table. So this is not a ranking: it says a net with no wiring at all reaches the same gain over the autopilot (0.17 to 0.19) as the wired ones, which is the sentence the earlier notes already wrote about the random control, now with a dense net of the fly's size.

## What it does in the tank's dropout (UNREGISTERED, after the fact; ids `sb-9001`..`sb-9100`, 160 s)

`node tools/ship/takeTankDropout.mjs --from 9001 --ids 100 --plain P/B/mn:3,E/E/mn:0 --fish --plain14 --cost` (86 s). The settled dark heading error (rad, lower is better), arm minus the autopilot, paired over the 100 ids:

| arm | mean | against the autopilot (se) | dark cost (error under the event minus the same pilot lit, first dark window) |
|---|---|---|---|
| autopilot | 0.7300 | | +0.0293 |
| navigator (the tank's event) | 0.7034 | -0.0266 (0.0153) TIES | 0.0000 |
| leaky unit | 0.7073 | -0.0227 (0.0155) TIES | +0.0008 |
| `plainnet-P/B/mn:3` (589 weights, 4 tilt signals) | 0.6707 | -0.0593 (0.0227) BEATS | +0.0396 |
| `plainnet-E/E/mn:0` (85 weights, hazard-trained) | 0.5304 | -0.1996 (0.0336) BEATS | +0.0944 |
| `fish-803` | 0.6759 | -0.0541 (0.0174) BEATS | +0.0410 |
| **`plain14-954`** | **0.5720** | **-0.1580 (0.0307) BEATS** | **+0.0510** |

* The 14-feature plain net lowers the settled error by 0.158 rad, three times the fish's 0.054 (the means differ by 0.104; no paired se was computed for plain14 against the fish). **A residual net with no wiring moves this score further than the wired fish does.** The earlier note's reading of the score applies: it measures how fast a pilot turns onto a new target, and the trained residuals turn faster.
* **On the dark cost every trained residual pays MORE than the autopilot** (+0.012 fish, +0.022 plain14 over the autopilot's +0.029 total, i.e. +0.041 and +0.051 against the lit flight), and the navigator and the leaky unit pay none. The residual nets gain on the settled error and lose more when the compass goes out: they lean on the heading they are given. This is the same measurement that found the dropout score cannot read a memory.
* Nothing here says a memory beats a plain net on the dark cost's terms or the reverse for the 963-weight fly networks: they are not in this tree's command (the board holds them).

## How to fly it beside the 963-weight networks

```js
import fs from "node:fs";
import { plain14Arm } from "../render/subAquariumPlain14.mjs";
const file = JSON.parse(fs.readFileSync("brain/pilotSubPlain14Wip.json", "utf8"));
board.addArm(plain14Arm({ file, controls: ["autopilot"] }));   // id plain14-954, layer flying, register(tank) seats the kind
// and name it as a control of each 963-weight arm: controls: ["autopilot", "leaky-unit", "plain14-954"]
```

## What would make it a control rather than a draw (NOT DONE, rig-hours)

One training is one draw from a distribution with a 0.07 spread across searches. H2's question needs the plain net as a distribution, as the shuffled-wiring controls are. The recipe is the same command with another seed and a file name that does not match `brain/pilotSubWeights*Wip.json`:

`node tools/ship/trainPilotSub.mjs --circuit plain14 --seed 6310 --workers 4 --write --out brain/pilotSubPlain14Seed6310.json` (then 6320, 6330, ...), about 20 minutes on 4 cores each. Several champions can be seated at once as arms `plain14-954` with other ids (`plain14Arm({ file, id: "plain14-6310" })`).

## Not checked, said plainly

The gates (`brain/pilotSubPlain-selfcheck.mjs`, `render/subAquariumPlain14-selfcheck.mjs`, the trainer's `tools/ship/trainSubPilot-selfcheck.mjs` and `takeTankDropout-selfcheck.mjs`) hold the machinery on a fixture and on the committed champion's file; they do not hold that the champion flies well (the table above does, once). The tank has no current, no hazard and no tilt event. The 963-weight networks of H2 are not in this tree, so no statement is made here about any of them beyond the fly's audit scores copied from `brain/SUBMARINE_WIP.md`.
