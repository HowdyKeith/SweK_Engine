# Hand-off for whoever publishes the head-to-head work (2026-11-06; UNNUMBERED; branch claude/wizardly-einstein-wr30pd)

Written for the chat that publishes this branch. Nothing here is on main and nothing is shipped; v4912 (the needs rounds, the survey seat, the switchboard, H1 and H3) shipped and was published earlier today, and everything below came after it.

## What is new on the branch since v4912 (all in WebGLEngine/)
| round | what it asks | files | result |
|---|---|---|---|
| H2 | the networks, plain nets and leaky unit on the compass dropout | `tools/ship/headToHead2.mjs`, `headToHead2Cmd.mjs`, `headToHead2-selfcheck.mjs`, `brain/rig-results/head-to-head2.json` | every network beats every plain net but every plain net beats the autopilot lit and dark (generic gain); the leaky unit beats the autopilot in the dark by +0.0116 |
| H4 | the heading each pilot BELIEVES through the dropout | `headToHead4.mjs`, `headToHead4Cmd.mjs`, `headToHead4-selfcheck.mjs`, `brain/rig-results/head-to-head4.json` | leaky unit 0.065 rad vs held 0.564, navigator exact, the fly heading loop does not integrate, a random wiring explains a third; knowing the heading is worth +0.015 on flight |
| H5 | the connectome network vs 10 random wirings and 10 dense nets, same recipe | `headToHead5.mjs`, `headToHead5Cmd.mjs`, `headToHead5-selfcheck.mjs`, `brain/rig-results/head-to-head5-training.jsonl` (80 searches, 360 KB), `head-to-head5.json` (519 KB) | NOT SUPPORTED: rank 12 of 21; the spread between identically trained controls (+0.013 to +0.097) is the larger fact |
| tool | an export-free command for the tank fly bench (it was an orphan) | `tools/takeTankFlyCxBench.mjs` | none |
The registrations and results are in `brain/HEAD_TO_HEAD.md` (H2, H4, H5; H1 and H3 are older). `brain/BACKLOG_2026-11-04_BRAINS.md` is updated.

## Ship housekeeping still owed (the new gates are not yet in the ritual's records)
* Every new gate needs a reading in the shared timing record: `node tools/ship/sweepRotation.mjs --gate tools/ship/headToHead2-selfcheck.mjs --cap-s 300 --write` (and `headToHead4`, `headToHead5`) on the box that owns the record, and `node tools/ship/boxTimings.mjs --record <gates>` for a per-box ring. Measured here: about 3 s, 0.8 s and 9 s.
* Rebuild the knowledge index (`node tools/ship/buildKnowledgeIndex.mjs --write`), run `definitionGates`, `declaredCost`, `orphanScan`, `instruments`, `reportDoors`, `runtimeGap`, `recordDrift` and `frozenRecords` after adding the files and restate any census count they name (the last ship moved `runtimeGap`'s file and ES-module counts by one for the new command; expect the same for the H2, H4 and H5 commands).
* The record's box identity moved twice (46f962 -> 420793 -> 142c0d): the next ship from this sandbox will need a new dated `RECORD_HANDOVERS` row, which is Keith's decision.
* The H5 result depends on `tools/ship/headToHead5.mjs` (`searchOne`, `RECIPE`, `topologyOf`, `searchSeed`) staying as it is: the training records were made by that code.

## Open from the last ship (not mine to fix here)
* `orreryPost-selfcheck` times out on Keith's rig (its first screenshot waits 30 s); it passes on the sandbox. Re-run it when the rig is idle.
* The rig has no timing readings of its own for 9 gates added in v4912; `node tools/ship/declaredCost-selfcheck.mjs` on the rig names them.
* The sub-circuits chat's battleship gates were red at its tip; recheck them at the merge.

## Open science (from the backlog)
A memory score with a noisy gyro (every integrator here is fed the exact heading rate); a matched control for the other seven networks (each has its own recipe); `decision-circuit-vs-twin` (no trained circuit exists yet); the fish pilot as a tank kind; the lesion toggle.

## Added after H6 (2026-11-06)
- New files: `tools/ship/headToHead6.mjs` (library), `headToHead6Cmd.mjs` (train / fly / --one), `headToHead6-selfcheck.mjs` (gate; mutation log in its header: 133 mutants, 119 red first pass, 9 rows added, 5 declared equivalent). Data: `brain/rig-results/head-to-head6-training.jsonl` (20 records) and `head-to-head6.json`. Result and expectations scored in `brain/HEAD_TO_HEAD.md` (Round H6, RESULT).
- Owed at ship, as for H2/H4/H5: timings for the new gate (boxTimings), knowledge index rebuild, census restatements for the new files, the handover row.
- H6 verdict: NOT ASSESSED (tuning gained +0.0104 against the networks' +0.0904) and every champion sits on the search bounds; wider-box and dropout-objective tuning are untried.
- H7 (recipe vs luck, heavy training) and H8 (memory with a noisy gyro) are NOT started. H8 needs a design step first: the tank has no gyro-noise model and the leaky unit and navigator read the exact body rate, so a noisy-gyro round needs a rate-noise wrapper on those two pilots (and its own gate) before it can be registered.

## Added after H7 build (2026-11-06)
- New files: `tools/ship/headToHead7.mjs`, `headToHead7Cmd.mjs`, `headToHead7-selfcheck.mjs` (gate, ~16 s; mutation log in its header: 144 mutants, 128 red first pass, 14 rows added, 2 declared equivalent). H7 is REGISTERED in `brain/HEAD_TO_HEAD.md`; the training (80 searches, about 17 hours of one core) and the flight are NOT run: run them on the rig (`node tools/ship/headToHead7Cmd.mjs train --workers 12`, then `fly`).
- Owed at ship, as for H2 to H6: timings for the new gate, knowledge index rebuild, census restatements, the handover row.

## H7 result (2026-11-06)
Trained and flown on the rig; result written in `brain/HEAD_TO_HEAD.md` (Round H7, RESULT): LUCK (robust -0.0206 against base, 1.6 se; sd inside a recipe 0.027 and 0.030). Data: `brain/rig-results/head-to-head7-training.jsonl` (80 records) and `head-to-head7.json`. H8 (noisy gyro) is still not designed.

## H8 (2026-11-06)
New files: `tools/ship/headToHead8.mjs`, `headToHead8Cmd.mjs`, `headToHead8-selfcheck.mjs` (gate under 1 s; mutation log in its header: 153 mutants, 134 red first pass, 14 rows added, 5 declared equivalent). Registered, flown here (17 cells, ids 8000-8199, about 10 minutes) and written up in `brain/HEAD_TO_HEAD.md` (Round H8, RESULT): THE MEMORY SURVIVES THE GYRO. Data: `brain/rig-results/head-to-head8.json`. Owed at ship as for H2 to H7: gate timings, knowledge index, census restatements, handover row. H6 to H8 are all done; parked: decision-circuit-vs-twin, fish righting/tank kind, lesion toggle, matched controls for the other seven networks.

## H9 (2026-11-06)
New files: `tools/ship/headToHead9.mjs`, `headToHead9Cmd.mjs`, `headToHead9-selfcheck.mjs` (gate about 7 s; mutation log in its header: 95 mutants, 82 red first pass, 5 rows added, 7 declared equivalent). Registered, flown here (59 arms, ids 9000-9199, about 40 minutes) and written up in `brain/HEAD_TO_HEAD.md` (Round H9, RESULT): THE GAIN LIVES IN THE RECURRENT CORE (f = 0.14), with the caveat that a lesioned trained network is an untrained third pilot. Data: `brain/rig-results/head-to-head9.json`. definitionGates: the three failures at 01037cc7 are the other branch's `ai-bridge` exports, not these files (counts identical with H2 to H9 merged in). Next suggested: H10, the 14-34-4 map trained with the core frozen at zero (rig).

## H10 build (2026-11-06)
New files: `tools/ship/headToHead10.mjs`, `headToHead10Cmd.mjs`, `headToHead10-selfcheck.mjs` (gate about 36 s: it runs several real 40-iteration searches, so it is OVER the quick sweep's 3 s line and wants a timing and a stated-runtime header; mutation log in its header: 132 mutants, 120 red first pass, 7 rows added, 5 declared equivalent). REGISTERED in `brain/HEAD_TO_HEAD.md`; training (40 searches) and the flight are NOT run: rig commands in the session; training writes `brain/rig-results/head-to-head10-training.jsonl`, fly writes `head-to-head10.json` and needs `head-to-head7-training.jsonl`.
