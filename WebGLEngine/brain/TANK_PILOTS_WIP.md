# The Sub Aquarium's pilot kinds: the stateful fly pilot in the tank (round 2 of the 2026-10-31 list; UNNUMBERED; this file is the design, written BEFORE the code, and then the record)

Keith, 2026-10-31: "do the stateful fly pilot in the tank next, and then flow-field waypoints, and the GPU batch-size crossover". This is the first of the three. Rounds 3 and 4 have their own notes.

## What stood in the way, found by reading the tree

`brain/SUBMARINE_WIP.md` (the TODO of 2026-10-25, item 4) said the stateful fly pilot was "blocked twice": the tank validates 963 weights and the pilot has 1,729, and there was no champion to show. The second block is gone: rung 4a stage A (`brain/flyCxStageA.jsonl`) holds a `cx` record, champion seed 31003, `qualifies: true`, with its 1,729 weights. The first is two places:
* **The wire** (`ai-bridge/subAquariumCore.js`) already knows circuits by name: `WEIGHTS = { gfc: 963 }` and `validateSub` checks a sub's weights against `WEIGHTS[circuit]`. A second circuit is one entry and a recipe.
* **The tank** (`render/subAquariumSim.mjs`) flies a sub's network only if `weights.length === PS.WEIGHT_COUNT` (963) and otherwise flies the PD autopilot, ignoring the circuit name. That is the wall.
The stateful pilot (`brain/pilotSubCircuitState.mjs`, `createStatePolicy(circuit).pilotFor(weights)`) also needs the fly's heading-loop circuit (`vendor/hemibrain/hemibrain-cx-heading-loop.json`, which the page already loads for the dropout view) and carries a state from tick to tick that it RESETS whenever the target OBJECT changes. The tank hands every pilot a fresh target object each tick while a sub is outside its steering box, and the event wrappers make a new one each tick too, so the pilot cannot be handed the tank's target as it is.

## The design

1. **The wire gets a second circuit, `flycx`** (stateful network: the fly's central-complex heading loop as a reservoir with memory, exactly 1,729 finite weights, each |w| <= 1000, the same rules as `gfc`). A sub's list label is `autopilot`, `network` (gfc) or `stateful` (flycx). The weights file is `brain/pilotSubFlyCxWip.json` (NOT named `pilotSubWeights*Wip.json`: the bridge's chips count those as pilots wired to the Giant Fiber Circuit, which this is not). It carries its provenance (source file, spec, champion seed, qualifies, the audit scores, a sha256 of the weights) and is written by a gated tool, `tools/ship/flyCxPilotFile.mjs`, from the `cx` record, never by hand. `SEED_RECIPES` gains "Fly heading-loop pilot (rung 4a)".
2. **The tank gets a registry of pilot kinds.** `tank.registerPilotKind(circuit, kind)`, `kind = { weightCount, build(weights, ctx) -> pilot(state, target, current, aux) }`, `ctx = { sub }`. A sub whose `circuit` names a registered kind and whose weights have the kind's count is flown by `kind.build`; `gfc` keeps its built-in path; anything else (no weights, a wrong count, an unregistered circuit) flies the autopilot as before. A page registers a kind after it has loaded what the kind needs (as it registers the estimators), so **registering re-seats the subs already in the tank** that were waiting for it. A kind that throws when building leaves the sub on the autopilot and says so. `setSteer` still refuses a sub that is not the 963-weight network.
3. **The kind of the stateful fly pilot** (`render/subAquariumFlyCx.mjs`, pure): `flyCxKind(circuit)` builds `createStatePolicy(circuit)` and wraps each sub's pilot so that (a) the policy is handed ONE target object per dive, rewritten each tick from the three fields the features read (depth, heading, speed) and replaced by a new object **when the sub's wandering target changes** (the tank's `sub.target` identity: a retarget, a wall turn or a respawn), which is the "new dive" that the policy resets its memory on; (b) the policy's 4th argument (`compassValid`) is passed through, so the compass events work on it as they do on the others. **Said plainly: in the tank the memory restarts at every new wandering target, as it does at the start of each of the 40 training dives; between retargets (20 to 45 s) it carries, where the training dives were 60 s.**
4. **The brain panel** gets the kind (`flycx`: "fly heading-loop circuit with memory (148 cells)", flown): its rows are the autopilot's laws that the pilot adds its residual to (the pilot IS those laws plus a readout of the circuit's 64 output cells), the note says so, and **the circuit's own activity is not drawn** (said on the panel, not left to be inferred). The policy map is the laws', labelled.
5. **The page** loads the kind once it has the circuit and registers it; "Offer my subs" then puts the stateful pilot in the tank beside the others.

## What it will and will not show (the result of rung 4a, restated so the tank is not read as a claim)

Rung 4a's RESULT (`brain/SUBMARINE_WIP.md`): the `cx` champion gains 0.143 over the plain autopilot through the compass dropout on the audit (the recipe's generic gain: every circuit gained 0.14 to 0.18), and **its heading error in the dark windows is 0.142 against the autopilot's 0.161 and the navigator's 0.047: it does not integrate**. So in the tank, a stateful sub put through the `dropout` event will lose its line like the plain autopilot, give or take; the tank shows that honestly (a measurement in the tank is recorded below). It is a pilot with a learned residual and a short memory, not a compass.

## PASS / FAIL (each a row of a gate; every new gate SABOTAGED and red by name)

1. The tool writes `brain/pilotSubFlyCxWip.json` from the `cx` record only if the record qualifies, has 1,729 finite weights, and the circuit's own count agrees; the file's sha256 matches its weights; the tool refuses a record that does not qualify, has the wrong count, a non-finite weight or a sigma outside [0, 1].
2. The wire accepts `flycx` with exactly 1,729 finite weights and refuses 963, 1,728, 1,730 and non-finite ones under that name; `gfc` still takes exactly 963; the list label is right; the seed recipe is offered when its file is present and skipped, by name, when it is not; `subId` differs between the same weights under the two circuits.
3. The tank flies a `flycx` sub with the registered kind: its commands equal `kind.build`'s pilot's on the same states; before registration it flies the autopilot and after registering it is re-seated without losing its place; a wrong count, an unregistered circuit and a throwing builder fly the autopilot; two subs with the same weights do not share a memory; a bad `registerPilotKind` call throws and changes nothing.
4. The stateful pilot's memory: it is carried between ticks on the same wandering target (the readout differs from a memoryless run), restarts exactly when the target changes (a retarget, a wall turn, a respawn) and **not** on the fresh target object the tank makes every tick outside the steering box, nor on the wrapped target of an event; it passes `compassValid` through; NO STATE (a pilot built with the memory switched off) differs from it.
5. The events work on it: `dropout` and `navigator` run on a stateful sub, `flood`/`surface`/`needs` run on it, an event ending leaves it flying; `setSteer` refuses it, naming the 963.
6. The panel: the `flycx` kind is flown and says what it shows and what it does not; the page registers the kind and a stateful sub appears and flies (a live-browser row).

## NOT in this round, said now

The fish pilot (803 weights, `brain/pilotSubFish.mjs`) is one more kind of the same shape and is not built here. The 3D view draws every sub alike. A peer needs the same page code to fly a stateful sub it is sent (the wire is data; a peer without the kind flies the autopilot, which is the existing rule). The circuit's activity is not drawn.

## BUILT (2026-10-31, same day; UNNUMBERED; what is in the tree, each piece gated and sabotaged)

* `tools/ship/flyCxPilotFile.mjs` (+ gate, 79 mutants all red) writes `brain/pilotSubFlyCxWip.json` from the `cx` record of `brain/flyCxStageA.jsonl` (champion seed 31003, 1,729 weights, memory gain checked in [0, 1], sha256 of the weights, the audit scores and a `limits` paragraph that says the gain is the recipe's generic gain and not a compass skill). `--check` goes red if the source moves and the file does not.
* `ai-bridge/subAquariumCore.js` (gate: 32 more mutants, 29 red on the first run, the rest closed or said): `WEIGHTS = { gfc: 963, flycx: 1729 }`, the list says `stateful` for a flycx sub, a seed recipe that names its circuit needs a file that declares it, `SEED_RECIPES` offers "Fly heading-loop pilot (rung 4a)". The bridge gate counts seven offered subs.
* `render/subAquariumFlyCx.mjs` (gate: 38 mutants, all red): the kind. One target object per dive; the memory restarts when `sub.target` changes (retarget, wall turn, respawn) and **not** on the fresh target objects the tank hands the pilot every tick. Said plainly in the file: in the tank the memory restarts at every new wandering target.
* `render/subAquariumSim.mjs` (gate section 12: 54 mutants, 49 red by name, 4 red by a thrown error, 1 equivalent): `registerPilotKind(circuit, kind)`, re-seating subs that were waiting, a throwing builder leaves the sub on the autopilot and says so (`kindError`), the snapshot carries `circuit`, `kind`, `kindError`.
* `render/brainPanel.mjs` (gate: 14 mutants, all red by name): the `flycx` kind is flown, shows the autopilot's laws it adds a residual to, and says on the panel that the circuit's activity is **not** drawn.
* `sub-aquarium.html` (page gate: 9 mutants, all red by name): imports the kind after the circuit loads and registers it; the list reads `stateful` only for a sub the tank really flies with the kind (a module that fails to load leaves the sub on the autopilot, the list reads `PD autopilot`, and a row of the page gate refuses the module in a real browser to prove it).
* `tools/tankFlyCxBench.mjs` (+ gate, 56 mutants, all red by name): the measurement below.

## MEASURED: what the stateful pilot does in the tank (`node tools/tankFlyCxBench.mjs --ids 24 --seconds 240`, 21 s)

Four arms in four one-sub tanks, the same 24 sub ids in every arm (so the same spawn and the same first targets), 240 s each, once with no event and once through the tank's own compass dropout (16 s dark in every 40). The number is the angle between the sub's heading and its wandering target's, in radians, mean +- sd over the 24 ids. Two readings: SETTLED (at least 12 s after the target last changed, "does it hold its line") and ALL ticks (includes the slow turn onto each new target; the vessel turns at about 0.06 rad/s at full rudder, so a half-turn takes 40 s and the target changes every 20 to 45 s).

SETTLED ticks:

| arm | no event, lit | dropout, lit | dropout, DARK | dark - autopilot (paired) | dark - lit |
|---|---|---|---|---|---|
| autopilot | 0.639 +- 0.235 | 0.691 +- 0.272 | 0.709 +- 0.274 | 0 | +0.018 +- 0.268 |
| network (gfc, 963) | 0.418 +- 0.218 | 0.410 +- 0.184 | 0.342 +- 0.153 | -0.367 +- 0.207 | -0.068 +- 0.192 |
| stateful (flycx, 1,729) | 0.558 +- 0.243 | 0.566 +- 0.242 | 0.579 +- 0.220 | -0.131 +- 0.175 | +0.012 +- 0.210 |
| stateless (same weights, memory off) | 0.611 +- 0.242 | 0.631 +- 0.267 | 0.638 +- 0.231 | -0.071 +- 0.113 | +0.007 +- 0.256 |

(ALL ticks reads the same way: dark - autopilot -0.251 network, -0.106 stateful, -0.064 stateless; nothing was lost in any run. Full tables: the command above.)

**What it says.**
* The stateful sub holds its line better than the plain autopilot in the tank (dark minus autopilot -0.131 with a spread of 0.175 over 24 ids, a standard error near 0.036), **and it does so with the compass lit too** (0.558 against 0.639 with no event at all). Its advantage in the dark (-0.131) is the same size as in the light (dropout lit 0.566 against 0.691, -0.125). The dropout adds nothing to it: its dark minus lit is +0.012, the autopilot's +0.018. **This is rung 4a's finding again, in a different place: the gain is generic and it is not a compass skill.** A pilot that integrated a heading through the dark would show a dark advantage larger than its lit one; this one does not.
* The memory is worth something in the tank but not much and not shown to be more than that: the stateless arm (same weights, memory wiped every tick) sits between the autopilot and the stateful one in every column (dark minus autopilot -0.071 against -0.131). The difference between the two arms is NOT paired-tested here (each paired sd is against the autopilot), so it is read off the table and not claimed.
* The 963-weight network (the noisy-senses champion, trained on a different task) holds its line better than either, lit and dark. That is the tank's order of pilots, not a statement about circuits: it is a different training, a different run length and a different network.
* **The dropout barely hurts a settled sub in this tank.** Dark minus lit is within 0.07 of zero for every arm (spreads 0.19 to 0.27): a sub on a settled target flies straight whether or not it can read the compass, so the settled reading cannot separate a compass skill. The tank is a poor place to test the thing the dropout was built to test (the study's 60 s dives with a current are the place); it is a fine place to see the pilots fly.

**What it does not say.** One champion (seed 31003), one hull (nominal), no current in the tank (`[0, 0, 0]`), 24 ids of 240 s, a heading-error reading that is not the study's score. It does not say the stateful pilot is better than the autopilot at anything the study scored beyond what rung 4a already said. It does not show the circuit's activity: the panel says so.

## Left for later, said

The fish pilot (803 weights) is one more kind of the same shape and is not built. A peer needs the page's registration to fly a stateful sub it is sent (the wire is data; a page without the kind flies the autopilot, the rule that already stood). The 3D view draws every sub alike. A paired test of stateful against stateless on the same ids is one more column in the bench, not run.
