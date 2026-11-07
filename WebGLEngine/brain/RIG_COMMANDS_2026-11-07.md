# Rig commands, with a fresh clone of the branch (2026-11-07; UNNUMBERED)

Keith asked for the owed rig runs as commands he can paste, starting from a pull of the branch. **No Decider round is in this list** (held, 2026-11-07). Nothing below has been run on the rig; each run is resumable (run the same command again to go on) and each report prints its CHECK lines first: a failed check is the first line and the verdicts are then not read.

## 0. Get the branch (PowerShell or cmd; the repository is HowdyKeith/SweK_Engine)

A NEW clone (nothing of the rig's working files can collide):

```
git clone --branch claude/sweet-lovelace-8leivh https://github.com/HowdyKeith/SweK_Engine SweK_Engine_rig
cd SweK_Engine_rig\WebGLEngine
git log -1 --oneline
```

or, in the clone you already have:

```
git fetch origin claude/sweet-lovelace-8leivh
git checkout claude/sweet-lovelace-8leivh
git pull --ff-only origin claude/sweet-lovelace-8leivh
cd WebGLEngine
git log -1 --oneline
```

`git log -1` must name a commit at or after the one the sandbox last pushed (the final report of the session names it; any later commit on the branch also has everything below). Every command below is run from `WebGLEngine\`.

## 1. CPU work, one after another (no eyes needed; do not run beside a GPU look)

```
node tools\ship\plainNetVariantsCmd.mjs run --specs all --out brain\plainNetVariants.jsonl --workers 8
node tools\ship\plainNetVariantsCmd.mjs report --in brain\plainNetVariants.jsonl
```
`brain/PLAIN_NET_VARIANTS_WIP.md`. 10 of the 64 pilots are already in the file in the branch, so it resumes; about 9 of the 10.5 core-hours are left. It flies the first-order orientation step itself (Amendment A). Read once, when whole.

```
node tools\ship\trainSubVestibularCmd.mjs run --specs wiringShuffledFresh --out brain\fishVestibularGen6.jsonl --workers 4
node tools\ship\trainSubVestibularCmd.mjs report --in brain\fishVestibularGen6.jsonl
```
`brain/FISH_WIRING_FRESH_WIP.md` (Addendum 16 of rung 4b); about 10.6 core-hours.

```
node tools\ship\trainSubVestibularCmd.mjs run --specs wiringPermutations --out brain\rig-results\fishVestibularGen2.jsonl --workers 4
node tools\ship\trainSubVestibularCmd.mjs report --in brain\rig-results\fishVestibularGen2.jsonl
```
`brain/FISH_WIRING_RANK_WIP.md` (Addendum 17; resumes Addendum 12's own file); about 21 core-hours.

```
node tools\ship\trainPilotSub.mjs --circuit plain14 --seed 6310 --workers 4 --write --out brain\pilotSubPlain14Seed6310.json
```
About 20 minutes of 4 cores. Seeds 6320, 6330 ... (the same line with the seed and the file name changed) make a distribution of plain14 pilots.

## 2. Needs a language model on the phone or the rig (any OpenAI-compatible server, PrivateLM included)

Replace `<host:port>`, `<key>` (leave `--key` out if there is none) and `<model-id>`. The key goes into a request header and nowhere else. These two commands do NOT set the first-order step (the Sea OGRE numbers are the engine's default). Ask the dev set first (prompt development, not the registered read), then the registered set ONCE.

After-action analyzer (`brain/AFTER_ACTION_WIP.md`):

```
node tools\ship\takeAfterActionCmd.mjs ask --base <host:port> --key <key> --model <model-id> --set dev --out brain\afterAction-dev-<model-id>.jsonl
node tools\ship\takeAfterActionCmd.mjs report --in brain\afterAction-dev-<model-id>.jsonl
node tools\ship\takeAfterActionCmd.mjs ask --base <host:port> --key <key> --model <model-id> --set registered --out brain\afterAction-<model-id>.jsonl
node tools\ship\takeAfterActionCmd.mjs report --in brain\afterAction-<model-id>.jsonl
```

Counterfactual re-flights (`brain/COUNTERFACTUAL_WIP.md`; new this session): the model is shown a pair and asked for ONE re-flight request; the engine flies it.

```
node tools\ship\takeCounterfactualCmd.mjs propose --base <host:port> --key <key> --model <model-id> --set dev --out brain\counterfactual-dev-<model-id>.jsonl
node tools\ship\takeCounterfactualCmd.mjs report --in brain\counterfactual-dev-<model-id>.jsonl
node tools\ship\takeCounterfactualCmd.mjs propose --base <host:port> --key <key> --model <model-id> --set registered --out brain\counterfactual-<model-id>.jsonl
node tools\ship\takeCounterfactualCmd.mjs report --in brain\counterfactual-<model-id>.jsonl
```

Engine-only (no model; the sandbox ran these, they are here so the rig can reproduce them):

```
node tools\ship\takeCounterfactualCmd.mjs subsets --seed 105
node tools\ship\takeCounterfactualCmd.mjs fly --seed 105 --kit decoy
```

## 2b. Round 7, stage 1 (registered in `brain/PLAIN14_DISTRIBUTION_WIP.md`; the report tool is built, gated and swept): ten fly champions against ten plain 14-50-4 champions
About 6.5 hours on 4 cores; the loop alternates the arms so a partial run is balanced. Run it from `WebGLEngine\`:

```
New-Item -ItemType Directory -Force brain\rig-results\plain14 | Out-Null
foreach ($s in 6310,6320,6330,6340,6350,6360,6370,6380,6390,6400) {
  node tools\ship\trainPilotSub.mjs --circuit fly --seed $s --workers 4 --dump brain\rig-results\plain14\fly$s.json 2>&1 | Tee-Object brain\rig-results\plain14\flylog$s.txt
  node tools\ship\trainPilotSub.mjs --circuit plain14 --seed $s --workers 4 --dump brain\rig-results\plain14\plain$s.json 2>&1 | Tee-Object brain\rig-results\plain14\plainlog$s.txt
}
```

Then, ONCE, on the machine that made the dumps, when all twenty are in:

```
node tools\ship\plain14DistributionCmd.mjs report --dir brain\rig-results\plain14
```

It prints the four checks first (a failure is the first line and the reading is NOT WEIGHED), the twenty champions, the exact rank-sum readings (the safety audit marked READ ON) and the bottom line in the registration's words. With ten against ten, BEATS needs the fly's champions above the plain champions in at least 73 of the 100 pairs.

## 3. Not here

* **Matched controls for the other seven networks** (`#80`, about 20 searches each): no command is built yet; it needs a registration first.
* **The station-and-price round** (`brain/STATION_AND_PRICE_WIP.md`) was trained, audited and read in the sandbox (RESULT in its section 10); nothing of it is owed on the rig.
* **The one verify** (`Clone -> verify` of main's tip, `brain/RIG_SESSION_OWED_WIP.md` step 2) is the GitHub panel's button, not a command here.
* **Any Decider round:** held by the owner.

Send the results files back (or commit them under `brain/rig-results/` on this branch) and say which command made each; the registrations read each once.
