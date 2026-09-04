---
name: ship
description: Ship a numbered SweK_Engine version (vNNNN) -- version bumps, changelog, knowledge index, staleness, claim check, verify, commit, push, fast-forward main. Use when the user says "ship it as vNNNN" or "ship the round".
---

# Ship a SweK_Engine round as vNNNN

The ritual is a fixed sequence. Every step has bitten at least once; the notes beside each one say how.
Run everything from `WebGLEngine/` unless a step says otherwise -- `verify.mjs` resolves paths from cwd
and reports a spurious ENOENT from the repo root.

## 0. Before touching version numbers

- The working tree must contain only this round's work. `git status --short` -- read it, do not skim it.
- Every gate this round added or touched is green: `node tools/ship/<name>-selfcheck.mjs`. Count reds with
  `grep -c '^  FAIL'`, never `grep -c FAIL` -- a PASS line whose detail contains the word FAILURE counts
  as a red under the loose pattern and once made a clean baseline read as 1.
- Every new gate has been SABOTAGED: break the thing it guards, watch it go red BY NAME, restore. A sabotage
  that goes 0 red is a finding, not a pass -- it means the input never reached the guarded branch (v4290's
  eps, v4297's `124\t180031` row and the empty node_modules skip-list). Fix the check, re-sabotage, and log
  each sabotage with its result in the gate's header comment.
- No long-running gate is still in flight: `pgrep -fa "node .*-selfcheck.mjs"`. Gates rewrite
  `knowledge-index.json` and `cloud/swek-rendezvous/rendezvous-state.json` as side effects; a gate finishing
  mid-ritual dirties the tree after you staged it.

## 1. Version bumps (two files, same note)

The round note is one long paragraph -- what was found, what was measured, what was corrected (including
anything YOU said earlier in the round that turned out wrong), what is unchecked and said plainly, and
`The tree stands at NNNN gates.` as the closing sentence. Lead with the correction if there is one.

- `main.js` ~line 6527: `const ENGINE_VERSION = "vNNNN";   // vNNNN -- <note>`
- `brain/brain.js` ~line 2881: `const BRAIN_BUILD = "vNNNN";   // vNNNN -- <note> Full changelog on docs/CHANGELOG.md.`

Both must agree; verify.mjs checks "brain build vs engine version".

## 2. Changelog entry

Write the entry to a scratch file, ASCII ONLY (`LC_ALL=C grep -nP '[^\x00-\x7F]'` must print nothing;
use `--` not an em dash), with the heading form `## vNNNN -- <title>` and the same paragraph as the note.
It MUST contain the gate count as `NNNN gates` -- claimCheck-selfcheck requires `\b(\d{3,5})\s+gates\b`
in the newest entry and the count must equal the real one (`enumerateGates` in `tools/ship/gateSweep.mjs`,
or the `[knowledge]` line from step 3).

    node tools/ship/changelog.mjs --backlog <scratch>/backlog.md
    rm -f ../docs/CHANGELOG.md.bak          # the tool leaves a backup beside the real file; never commit it

## 3. Derived files

    node tools/ship/orreryFleetScan.mjs --write        # AFTER the version bump, not before -- see below
    node tools/ship/orreryReachedScan.mjs --write     # same rule, same reason
    node tools/ship/buildKnowledgeIndex.mjs --write    # prints "[knowledge] NNNN gates" -- this is the count
    node tools/ship/staleness.mjs --fix                # rewrites case-study.html's gate count
    node tools/ship/claimCheck-selfcheck.mjs           # must end "all checks pass"

`orrery-fleet.json` (v4329, #68) holds each vendored body's importers with their sizes and last commits, and
main.js is an importer of three. So its byte size changes the moment the version note is written, and baking
it BEFORE the bump leaves orreryFleet-selfcheck red on a size that moved by six hundred bytes. Bake it after
the bump and before the commit: sizes then match at HEAD, and the only thing left behind is each satellite's
commit hash, which the gate reports rather than fails because the commit that ships a round cannot know its
own hash. Re-bake `orrery.json` too (`node tools/ship/orreryBake.mjs --write`) if `vendor/` changed -- it was
left forty-five rounds at v4189 and two gates sat red on the register the whole time saying so.

`orrery-reached.json` (v4332, #48) is the same shape for what SweK read and did NOT take: it holds which
Khronos sample models this tree asks for by name, plus the wide count that measurement rejected. It carries
no byte sizes, so the version bump does not move it -- but it carries the head commit, and its drift check
demands POPULATION currency the same way, so bake it in the same step rather than remembering which of the
two is sensitive to what.

## 4. Verify

    node tools/ship/shipVerdict.mjs --version vNNNN --markers "SweK Dictate,/dictate/type"; echo "exit=$?"

`shipVerdict.mjs` (v4405) runs verify, reads its EXIT STATUS, scans every tracked file for conflict markers,
and prints one last line -- `[ship] SHIP` or `[ship] DO NOT SHIP -- <reason>` -- that is GENERATED FROM the
exit status rather than restated beside it. Ship only on `SHIP`, and never chain the git steps behind a grep
of the log: v4404 was pushed with three conflict markers in it because the chain read a tail that said ALL
GREEN from an earlier run while verify itself had exited 1. A tail that disagrees with the exit status in
EITHER direction is NO VERDICT -- not a pass. If you run verify directly instead, read `$?` and nothing else.

The PASS count is environment-conditional (SwiftShader, Playwright, WASM
availability) and is NOT a number to assert or compare between boxes.

Since v4303 verify runs the QUICK SWEEP (`tools/ship/quickSweep.mjs`): every gate under the budget in
`tools/ship/sweep-timings.json` (default 3000 ms), 8-way parallel with reds re-run alone, reconciled against
the red register. A KNOWN red is listed; a NEW red -- one no register names -- fails the ship. Expect it to
add a few minutes. Fix the new red or, if it is a real standing red, record it in `tools/ship/redCensus.mjs`
with a reason; never widen the register to get green. `SWEK_QUICKSWEEP=0` skips it while iterating and is
not a way to ship. The timings file is rewritten by the run and ships with the round (`git add -A WebGLEngine`
covers it). Gates OVER the budget are still only covered by the full two-phase sweep.

## 5. Commit and push (from the REPO ROOT, one level above WebGLEngine)

    git add -A WebGLEngine docs/CHANGELOG.md
    git status --short         # only this round's files; no .bak, no stray scratch
    git commit -F <message-file>
    git push -u origin <branch>

The commit subject is `vNNNN: <title>`; the body is three to eight lines of what changed and what it
measured. No model identifiers anywhere in the message or in any file committed. Retry a failed push at
2 s, 4 s, 8 s, 16 s -- and only for network errors.

## 6. Fast-forward main

    git fetch origin main
    git checkout -B main origin/main
    git merge --ff-only <branch>
    git push origin main
    git checkout <branch>

`--ff-only` is not optional. If it refuses, main has moved: stop and say so rather than merge.

## 7. Publish the release -- THE FLEET RUNS releases/latest, NOT main

    node tools/ship/refreshReleases.mjs            # dry run: what the releases page says right now
    # publish from the RIG: GitHub panel -> "Release current engine". It packs the installable zip,
    # creates the release, uploads the asset AND pushes the tag vNNNN, which starts release.yml.
    node tools/ship/refreshReleases.mjs --write    # record it
    node tools/ship/releaseLedger-selfcheck.mjs    # must read "THE FLEET RUNS WHAT IS BUILT"
    git add -A WebGLEngine/tools/ship/releases.json && git commit -m "vNNNN: record the release" && git push

*** THIS STEP IS WHY THE RITUAL EXISTS AND IT WAS MISSING FOR 261 ROUNDS. *** Measured at v4449 against the
API: 3 of the 261 versions in the changelog were ever published -- 1.1% -- and the fleet's releases/latest sat
at v4438 while the tree built v4448. THE DOWNLOAD CHAIN WAS NEVER BROKEN. fetchEngineBuild, scanDownloads and
the installer have all been complete and gated since v3907; they pulled v4438 because v4438 was the newest
thing anybody published. A step nobody is asked for happens when somebody remembers, and 1.1% is what
remembering looks like over 261 rounds.

*** PUBLISH FROM THE RIG, NOT FROM CI, AND THE REASON IS MEASURED. *** The zip is not byte-reproducible: the
packer walks a live tree, so commit dbc0855 (v4067) produced 26,775,683 bytes on the CI runner, 27,424,068 on
the rig and 27,766,762 in a third checkout. A CI publisher would silently replace the artifact the rig built
and verified with different bytes assembled elsewhere -- see the v4068 note in .github/workflows/release.yml,
which stopped trying after ten red runs. CI verifies the PUBLISHED archive on three platforms; it does not
make one.

`releaseLedger-selfcheck.mjs` enforces the ratchet: *** you may not ship a new version while the last one is
unreleased. *** It is checked about the PREVIOUS version, not the current one, because verify runs before the
commit and the release is published after the tag -- so "ENGINE_VERSION has a release" would be red
throughout every correct ship. Versions at or below the v4448 baseline are written-off debt and cannot be
back-filled: a zip built today for v4301 would carry bytes v4301 never had.

## Never

- Push to any branch other than the designated feature branch and `main` by fast-forward.
- Ship a version and leave the previous one unpublished. The fleet downloads releases/latest; a version that
  reaches main and never reaches the releases page is a version nobody outside this repo will ever run.
- Publish the release from CI or from this sandbox. The rig is the publisher because its zip is the one that
  was verified; a second machine's zip is different bytes for the same commit.
- Open a pull request unless asked in so many words.
- Skip, budget-down, or comment out a red gate to get to ALL GREEN. Record it in redCensus.mjs.
- Run a long sweep as a plain background Bash: it is killed at 10 minutes. Use `setsid nohup <script> &`
  and poll the log; Monitors expire at 30 minutes regardless of `persistent`.
- Ship a number the tree cannot check. "37 red" beside a list of 36 is the v4296 mistake; every count
  in a note should be derivable from a frozen record or the tool output that produced it.
