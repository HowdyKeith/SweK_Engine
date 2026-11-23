# SweK peer jobs: a git branch as the queue for long runs

Status: second slice (2026-11-23). The SweK server drives it (below). Library, queue operations, command and gate exist (`WebGLEngine/tools/ship/peerJobs*.mjs`, gate `peerJobs-selfcheck.mjs`, 276 mutants, 7 declared equivalent). A job was run end to end by hand on one machine: submitted, claimed, run in a worktree of its commit, result pushed. **Not built yet:** a second real machine; results larger than a few MB.

## The idea
Keith: push a job file to a git folder; whichever SweK peer is free picks it up, queues it if busy, checks it is still wanted when free, runs it on the box the job asked for (the GPU box, the Intel CPU box), and pushes the result back.

## The folder (branch `peer-jobs`, never the working branch)
| path | what |
|---|---|
| `jobs/<id>.json` | a signed job |
| `claims/<id>.json` | who is running it, with a heartbeat |
| `cancel/<id>.json` | a request to stop wanting it |
| `results/<id>/` | `done.json` and the result files (`rig-out/*.zip`, `peerjob.log`); a file above 90 MB is left out and named under `skipped` |
| `state/<id>/` | the job's data files (`head-to-head<round>-state-<seed>.json`, `-search.jsonl`, results), shared at every beat so ANY peer can resume it; removed when the job finishes |
| `attempts/<id>.json` | how many times a run failed, by whom, and when |
| `peers/<name>.json` | what each peer is doing now (idle, or the job, round and phase) and when it was last seen |

## A job is not a command
Anyone who can push to the branch could otherwise run anything on every peer. So:
- a job names a **kind** from a closed list (`rounds`, `selftest`), round numbers (digits only), a target and a commit; **the peer builds the command line itself** (`argvFor`) and nothing else from the file reaches it;
- an unknown field is refused;
- the job carries an HMAC-SHA256 signature under a secret every peer holds (`~/.swek/peerjobs.key` or `SWEK_PEERJOBS_KEY`); one that does not verify is listed and never run;
- the job runs in a clean `git worktree` of the commit it names, so the code is the code that was reviewed.

## Who runs what
Target: `gpu` any / required / forbidden (forbidden is the CPU-only box), `minCores`, `peers` (names), `cpuMatch` (substring of the CPU model, e.g. `Intel`). Priority -9..9, then oldest first. `after` lists jobs that must have finished ok; one that failed skips the job. `expires` drops a job nobody got to.

## The claim is the push
A peer writes `claims/<id>.json` and pushes. Two peers cannot both succeed; the refused one syncs, sees the other's claim and moves on (a refusal caused by an unrelated push is retried, 4 times). A claim carries a heartbeat (every 10 min); after 3 missed beats (30 min) it is stale and another peer may take it over. **When a busy peer becomes free it asks again from the top:** done, cancelled, expired, not for it, a predecessor failed, someone else's live claim: all of these are checked before it asks whether it is free, so a job that is no longer needed is never run.

## Commands (from `WebGLEngine/`)
```
node tools/ship/peerJobsCmd.mjs init   --url <repo>                    # once per peer
node tools/ship/peerJobsCmd.mjs submit --id h69-search --rounds 69 --gpu any
node tools/ship/peerJobsCmd.mjs submit --id h70-gpu --rounds 70 --gpu required
node tools/ship/peerJobsCmd.mjs submit --id h71-intel --rounds 71 --gpu forbidden --cpu-match Intel
node tools/ship/peerJobsCmd.mjs plan --file tools/ship/rigOrder.json --dry-run   # the whole ordered plan; without --dry-run it submits it
node tools/ship/peerJobsCmd.mjs status                                  # jobs, WHAT RUNS ON WHICH PEER, every peer's state, attempts, results
node tools/ship/peerJobsCmd.mjs watch                                  # on each peer; --once, --dry-run, --interval 120
node tools/ship/peerJobsCmd.mjs cancel --id h69-search
```
`submit` pins the job to the current `HEAD` (or `--commit`); push that commit first.

## Interruptions, retries and order (2026-11-23)
- **Resume.** A run starts from the furthest copy of each data file of its rounds (a state by its `iter`, a search file by its lines), taken from the queue branch and from this peer's own mirror (`~/.swek/peerjobs/state/<id>/`); it shares them again at every beat (10 min) and when the runner exits. A peer that stops and restarts, or a different peer taking over a claim that missed three beats, therefore loses at most the iterations since the last beat (the searches also save their own state every 50 iterations).
- **Retries.** A failed run counts an attempt and releases its claim; the job is tried again after 10 minutes, from the saved state, up to 3 times; the third failure is the result (`status: failed`).
- **What is running, and where.** `status` (and the Queue button in the SweK server's panel) lists every claimed job with its peer and host and last beat, and every peer: idle, running which job at which round and phase, or not seen for N minutes.
- **Order.** The highest priority is taken first, then the oldest, then the smaller id. `plan` turns a plan file into one job per round with the plan's priorities, so free peers take different rounds at once and a single peer takes them in the plan's order. The order in the repository is `tools/ship/rigOrder.json`; its gate row fails if the order a lone peer takes differs from the one written.

## Known limits
- One job at a time per peer; a cancel does not kill a run that has begun.
- Results go back into git: fine for zips of a few MB, not for gigabytes (large files would need LFS or a different store).
- The queue checkout is the peer's own and is reset to the remote at every step; do not keep anything in it.
- A rig that is not allowed to reach the git remote cannot take part.

## In the SweK server (Brain Job Repo Report Runner)
- **Boot Options checkbox** "Brain Job Repo Report Runner", **default off**. Ticked: the server starts the watcher (`peerJobsCmd.mjs watch`) as a child process, now and at every boot (a few seconds after the port is bound). Unticked: no process, no network, nothing fetched.
- **Panel** (chip "Brain Job Runner", filed under System Tools): status, the queue repo address, this peer's name, GPU yes/no/detect, how often to look, an engine repo address (only when this engine is a zip install and not a git checkout, so a job can run at its commit), the **write-only signing key**, Start / Stop, the queue as the command prints it, a submit form and a cancel button, and the watcher's log.
- **Bridge** `ai-bridge/peerJobsBridge.js` (`/peerjobs/*`, **trusted requests only**, every route): config in `~/.voxelbridge/peerjobs.json`, key in `~/.voxelbridge/peerjobs.key` (mode 600; no route returns it), queue checkout in `~/.voxelbridge/peerjobs/queue`. Every command is run with an argument list (no shell) after each field is validated. A watcher that dies is restarted after 30 s; one that keeps dying within 10 s is not restarted after the fifth time. Stopping kills the watcher's whole process tree, so a job in progress goes with it.
- Gates: `peerJobs-selfcheck.mjs` (the queue and the rules), `peerJobsBridge-selfcheck.mjs` (the bridge, its wiring in `server.js` and the checkbox and panel in `server.html`).
