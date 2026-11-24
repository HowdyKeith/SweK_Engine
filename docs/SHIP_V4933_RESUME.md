# Resume: shipping v4933 (paused 2026-11-22, waiting out a 24-hour timing hold)

Branch `claude/epic-cori-2hm1my`, commit `ca358ce1` and later. **Not on main, not released.** Keith chose to wait out the hold
rather than loosen a ratchet or edit the timing record. Read this, then follow `.claude/skills/ship/SKILL.md` from step 4.

## Where it stands

- `main.js` and `brain/brain.js` already say **v4933**. `docs/CHANGELOG.md` has the `## v4933 --` entry, which states
  **2530 gates**. `tools/ship/versionPreflight.mjs` named v4933 and ledger closing `since641`; the `since641` entry is
  already written in `tools/ship/gateSweep.mjs`. Re-run `node tools/ship/versionPreflight.mjs v4933` first, in case
  another branch has taken the number since. If it has, take the number `--next` names and re-bump the three places.
- The first verdict was DO NOT SHIP on 35 new reds, and every one is fixed, not registered (see the v4933 note).
- Two of this round's files had overwritten main's; main's are restored, and this round's carry new names:
  - `tools/ship/takeEvadeSeat.mjs` and its gate (main's are the submarine evade seat): this round's is now `tools/ship/takeSpaceEvadeSeat.mjs`.
  - `tools/ship/gpuTimer-selfcheck.mjs` (main's grades `gfx/gpuTimer.mjs`): this round's is now `tools/ship/gpuTimerOverlay-selfcheck.mjs`.
- **The shared timing record was handed to box `linux-x64-4c-16gb-142c0d`.** This was Keith's decision; the row is in
  `RECORD_HANDOVERS` in `tools/ship/quickSweep.mjs`. If the sandbox now reports another `boxId()`, the record question
  comes up again: ask Keith, do not decide it.
- The last (fourth) verdict had exactly **one red: `tools/ship/recordReach-selfcheck.mjs`**, 79 unchecked records
  against its ceiling of 70. Nine of the 79 are guarded only by `tools/ship/reportDoors-selfcheck.mjs`:
  - This round slowed that gate to 7.1 s: `brain/battleshipDuel.mjs`'s fight-flying report had entered its bounded sample.
  - It is fixed (that module is now in `CALL_COST_V4459.slow`), and the gate runs in about 2.4 s.
  - But `tools/ship/sweepRotation.mjs` HOLDS a reading that far from the gate's ring median (`[1652, 5624, 7108]`) until
    same-side readings span 24 hours. The first fast reading was held at **2026-11-22T23:49:38Z**.
  - Do NOT edit the ring or the record by hand, and do NOT raise the recordReach ceiling: Keith chose to wait.

## Steps, after 2026-11-23T23:50Z (run from `WebGLEngine/`)

1. Check the box first: `node -e 'import("./tools/ship/hostScale.mjs").then(m=>console.log(m.boxId()))'`
   should print `linux-x64-4c-16gb-142c0d`.
2. Write the held reading:
   ```
   node tools/ship/sweepRotation.mjs --gate tools/ship/reportDoors-selfcheck.mjs --cap-s 300 --write
   ```
   It must print `wrote 1 entries`. If it still says HELD, the 24 hours have not passed.
3. Check the count: `node -e 'import("./tools/ship/recordReach.mjs").then(m=>console.log(m.reach().unchecked))'`
   should print 70 or less.
4. Re-derive (step 3 of the skill): run `orreryFleetScan --write`, `orreryReachedScan --write`, `buildKnowledgeIndex --write`,
   `observedGates --write`, `staleness --fix`, `buildPageIndex`, `launchIndex --write`, then `claimCheck-selfcheck`.
5. The verdict, run detached (it takes about 40 min):
   ```
   node tools/ship/shipVerdict.mjs --version v4933 --markers "SweK Dictate,/dictate/type"
   ```
   Ship only on `[ship] SHIP`. Then `node tools/ship/observedGates.mjs --write` and `node tools/ship/afterVerdict.mjs`.
6. Commit from the repo root, with subject `v4933: Space duels, five fly pathways, and the PlayCanvas rendering line through to a lit game page`.
   Push the branch, then fast-forward main (`--ff-only`; if it refuses, stop and say so).
7. Give Keith the DOS commands below. He publishes from the rig; the sandbox never publishes.

## Keith's DOS commands (the rig: clone, verify, publish, record)

```
cd /d C:\Users\howdy
git clone --branch main https://github.com/HowdyKeith/SweK_Engine.git swek-v4933
cd /d C:\Users\howdy\swek-v4933\WebGLEngine
git log -1 --oneline
```

`git log` must show `v4933: ...`. Then bring the rig's own timing records over from the last verified clone. Set
`LAST` to that clone's `WebGLEngine` folder:

```
set LAST=C:\Users\howdy\swek-r88b2\WebGLEngine
copy /Y "%LAST%\tools\ship\sweep-timings.local.json" tools\ship\
copy /Y "%LAST%\tools\ship\sweep-rotation.local.json" tools\ship\
cd tools\render-qa && npm install --no-audit --no-fund && cd ..\..
node tools/ship/ensureBrowserGatesCmd.mjs
node tools/ship/ensureDxc.mjs --write
node tools/ship/shipVerdict.mjs --version v4933 --markers "SweK Dictate,/dictate/type"
echo %ERRORLEVEL%
node tools/ship/afterVerdict.mjs
echo %ERRORLEVEL%
```

Publish only if the verdict printed `[ship] SHIP` and both levels read 0. Then restore anything the verdict rewrote, so
the zip equals the commit:

```
git status -s
git checkout -- .
```

Publish. This packs this verified folder and uploads it with the rig's GitHub token from
`%USERPROFILE%\.voxelbridge\github.json`; it is the panel's "Release current engine" without the panel:

```
node -e "require('./ai-bridge/githubBridge.js').publishEngineBuild({ repo: 'HowdyKeith/SweK_Engine' }).then(r => { console.log(JSON.stringify(r, null, 1)); process.exit(r.ok ? 0 : 1); })"
```

Record the release:

```
node -e "require('./ai-bridge/githubBridge.js').ledgerRefresh({ repo: 'HowdyKeith/SweK_Engine', write: true }).then(r => { console.log(JSON.stringify(r).slice(0, 400)); process.exit(r.ok ? 0 : 1); })"
node tools/ship/releaseLedger-selfcheck.mjs
cd ..
git add WebGLEngine/tools/ship/releases.json
git commit -m "v4933: record the release"
git push origin main
```

`releaseLedger-selfcheck` must read "THE FLEET RUNS WHAT IS BUILT". Do not delete this file until v4933 is released; the
round after it can remove it.
