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
