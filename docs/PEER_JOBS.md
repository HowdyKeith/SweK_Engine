# SweK peer jobs: a git branch as the queue for long runs

Status: first slice (2026-11-23). Library, queue operations, command and gate exist (`WebGLEngine/tools/ship/peerJobs*.mjs`, gate `peerJobs-selfcheck.mjs`, 276 mutants, 7 declared equivalent). A job was run end to end by hand on one machine: submitted, claimed, run in a worktree of its commit, result pushed. **Not built yet:** running the watcher as a service inside the SweK server, a server.html panel, a second real machine.

## The idea
Keith: push a job file to a git folder; whichever SweK peer is free picks it up, queues it if busy, checks it is still wanted when free, runs it on the box the job asked for (the GPU box, the Intel CPU box), and pushes the result back.

## The folder (branch `peer-jobs`, never the working branch)
| path | what |
|---|---|
| `jobs/<id>.json` | a signed job |
| `claims/<id>.json` | who is running it, with a heartbeat |
| `cancel/<id>.json` | a request to stop wanting it |
| `results/<id>/` | `done.json` and the result files (`rig-out/*.zip`, `peerjob.log`) |

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
node tools/ship/peerJobsCmd.mjs status
node tools/ship/peerJobsCmd.mjs watch                                  # on each peer; --once, --dry-run, --interval 120
node tools/ship/peerJobsCmd.mjs cancel --id h69-search
```
`submit` pins the job to the current `HEAD` (or `--commit`); push that commit first.

## Known limits
- One job at a time per peer; a cancel does not kill a run that has begun.
- Results go back into git: fine for zips of a few MB, not for gigabytes (large files would need LFS or a different store).
- The queue checkout is the peer's own and is reset to the remote at every step; do not keep anything in it.
- A rig that is not allowed to reach the git remote cannot take part.
