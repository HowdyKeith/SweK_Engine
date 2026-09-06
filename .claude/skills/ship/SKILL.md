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
    node tools/ship/observedGates.mjs --write          # v4485 -- merges the LAST sweep's completions into the
                                                       # monotone evidence ledger. Only ever grows; a gate the
                                                       # sweep killed at the cap keeps the time it was seen to
                                                       # take. Without it budgetEvidence goes red about how busy
                                                       # the box was rather than about the tree.
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

## 3b. Rotate the over-budget pool

    node tools/ship/sweepRotation.mjs --slots 80 --budget-s 300 --write

The quick sweep runs every gate under 3,000 ms and skips the rest. **The rest is 313 gates and no ship-time
step touches them**, so a gate that goes red up there is invisible until somebody looks -- v4460 looked and
found 22, eighteen of them in no register.

The rotation re-times a staleness-ordered slice SERIALLY and writes back what it sees, which is how a gate
that was evicted by a starved 8-way reading gets back in. *** IT IS WORTH RUNNING BECAUSE IT KEEPS PAYING:
the 2026-09-03 run brought 146 of 150 back under budget, median 2.80x faster than the reading that had
evicted them; the v4461 run brought 72 of 80. *** At 80 slots it covers the pool in about 5 rounds.

Two things it will do that are correct and look alarming:

- **It returns RED gates.** Five came back under budget red at v4461, so the next quick sweep reports them as
  NEW reds and the ship goes red. They were red the whole time and nothing could see them. Fix them, or say
  in the round why not -- *do not* register them to get green, and do not budget them back out. Both are
  named in the Never list below.
- **It changes `sweep-timings.json`.** That file ships with the round.

*** AND THE ONE RUN BEFORE v4461 WAS UNDONE INSIDE ITS OWN VERSION. *** All 146 returnees were back at exactly
their pre-rotation readings in the next commit to touch the timings, carrying the pre-v4408 stamp -- a file
read that did not contain the rotation's work. Nothing noticed for 49 versions. `sweepCoverage-selfcheck`
section 10 compares the rotation's own ledger against the timings every run and goes red if that happens
again; it costs a file read.

A step nobody is asked for happens when somebody remembers -- step 7 is the tree's measurement of what
remembering is worth, at 1.1% over 261 rounds. This step is written down for that reason.

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

### 4b. Fold the sweep's timings into the monotone ledger -- AFTER verify, not only before

    node tools/ship/observedGates.mjs --write          # again; step 3 ran it against the PREVIOUS sweep

*** THE ROUND'S OWN NEW GATES ARE NEVER IN THE LEDGER WHEN VERIFY FIRST RUNS. *** Step 3's call merges the
LAST sweep's completions, which by definition predate the gates this round added, so budgetEvidence-selfcheck
reports them as carrying no evidence and the ship goes red. That is v4485's cause (a) -- correct, and
self-resolving -- and it cost a red first-run on v4486, v4487 and v4488 before anybody wrote this line.

Run it again once verify's sweep has timed them and the red clears without touching a register: at v4488 the
second call read `+3 new` and budgetEvidence went green. Do it BEFORE restoring `sweep-timings.json` if the
rotation left that file dirty -- the ledger reads the scratch file, and reverting first throws away the only
record that this round's gates ever finished.

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

Since v4450 the whole of this step is on the rig, in the GitHub panel's Releases tab, as a numbered route --
steps 1..6 on screen, with the two shortcuts moved below it under a heading naming which step each one skips.
Press them in order; the CLI below is the same thing without a browser.

    node tools/ship/refreshReleases.mjs            # dry run: what the releases page says right now
    # publish from the RIG: GitHub panel -> Releases. The SAFE route is step 3 then step 4 --
    #   "Clone -> verify" (clones the pushed branch and runs THE CLONE's gates, publishes nothing), then
    #   "Publish the verified clone" (packs the tree that just passed, uploads it, pushes the tag).
    # "Release current engine" is step 4 with step 3 taken out: it zips THIS folder unverified. Faster, and
    # it is the one that can put a tag on a commit the asset was not built from -- see below.
    node tools/ship/refreshReleases.mjs --write    # or the panel's step 5 button, which uses the rig's token
    node tools/ship/releaseLedger-selfcheck.mjs    # or step 6. Must read "THE FLEET RUNS WHAT IS BUILT"
    git add -A WebGLEngine/tools/ship/releases.json && git commit -m "vNNNN: record the release" && git push

*** PUSH BEFORE YOU PUBLISH, AND THE REASON IS IN githubBridge. *** createRelease passes
`target_commitish: target || undefined`, and publishVersion never passes a target -- so GITHUB PUTS THE TAG ON
THE DEFAULT BRANCH'S HEAD while the zip is packed from a LOCAL folder. Those are the same commit only if step 6
of this ritual has already run. Publish from an unpushed tree and the releases page carries a tag naming a
commit that does not contain the code in the asset beside it, and nothing in the panel will say a word.

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

`releaseLedger-selfcheck.mjs` enforces a LAG BUDGET: *** main may run at most `lagBudget.maxVersionsBehind`
versions ahead of the releases page. *** It counts versions that reached MAIN (read from `origin/main`'s
changelog), not ones sitting on an unmerged branch, and it excludes the version being shipped -- verify runs
before the commit and the release is published after the tag, so "ENGINE_VERSION has a release" would be red
throughout every correct ship.

*** v4453 REPLACED A HARD ZERO WITH THAT BUDGET, AND THE REASON IS STRUCTURAL. *** v4449's rule was "you may
not ship a new version while the last one is unreleased" -- correct when the ship and the publish happen on
one machine, and unsatisfiable here, because rounds are built where there are no credentials to publish and
the rig publishes afterwards by hand. The previous version was therefore unreleased at EVERY ship, the gate
went red three rounds running, and each time the answer was to raise the baseline. THREE RAISES IN THREE
ROUNDS IS A GATE COLLECTING SIGNATURES. The budget is what the rule actually protected: not zero lag, but a
fleet that does not fall behind.

*** AND THE BUDGET DOES NOT BIND ON A REPUBLISH, WHICH IS A FIX FOR A DEADLOCK THIS SKILL CAUSED. *** The
publish route runs verify -- `Clone -> verify` grades a clone of main, and `Publish the verified clone` refuses
on a red verdict. So once the lag passed the budget, THE GATE THAT EXISTS TO FORCE A PUBLISH LOCKED THE PUBLISH
THAT WOULD CLEAR IT. Found at 7 of 3 with the fleet fourteen versions back. The budget now binds only on a tree
whose ENGINE_VERSION is NOT yet on main -- one that would push main further. A clone republishing what main
already holds can only reduce the lag, so it is let through, and the gate PRINTS the count and the reason it
declined to assert rather than going quiet.

Two floors, and they are deliberately separate. `baseline.throughVersion` forgives versions already gone by
and cannot be back-filled (a zip built today for v4301 would carry bytes v4301 never had); `lagBudget` bounds
how far the NEXT ones may drift. A baseline raise cannot widen the budget -- if one edit did both, the escape
hatch would swallow the rule one level up. Raising either owes a written paragraph the gate checks for.

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
