# The first probe of the tree under the win32 spelling (2026-11-06; UNNUMBERED; a candidate list, not a verdict)

`node tools/ship/winPathLint.mjs --probe <gate> ... --workers 4` runs each gate twice, plain and under `tools/ship/winPathShim.mjs`, and names the ones that answer differently. This is its first reading of the tree.

**What was probed.** 1,110 of the tree's 2,283 gates: those that call `path.join`, `path.resolve`, `path.relative` or `path.normalize` AND read, stat, list or test the existence of a file, with a recorded time of 8 s or less in `tools/ship/sweep-timings.json`. The other 1,173 were not probed: gates over 8 s, gates that do not use a path function, and `tools/ship/gateMutation-selfcheck.mjs`, which edits other gates (see below). A probe of every gate (`--all`) was started first and stopped after 53 minutes, having reached `render/`; it was never read.

**What it found.** 56 gates differed in the parallel pass (4 workers). Re-run alone, plain and shim one after the other, **51 of 1,110 are red only under the shim and green plain**: they are listed below. Five of the 56 are not counted: `ai-bridge/tools/roundhouseRoutes`, `tools/ship/exitBusy` and `ui/stageInfo` differed beside other gates and not alone, `ai-bridge/freshMachine` differed only when its two runs overlapped, and `gateMutation` was left out.

**How it went wrong the first time, and what the tool does now.** The parallel pass left **eleven gates with a line `ok("FORCED FAILURE (gateMutation probe)", false, ...)` appended to them**: `tools/ship/gateMutation-selfcheck.mjs` injects that line into a gate to see whether the gate goes red and puts the file back, and a gate it was editing when another process read the tree, or when the run was stopped, kept the line. They were restored with `git checkout` and none is in a commit. The command now leaves `gateMutation-selfcheck.mjs` out of `--all` (name it to run it, alone), runs a gate's plain and shim copies one after the other (two copies of a gate that watches for a scratch file read each other's), and, with more than one worker, counts a difference only if it repeats alone. Gate rows and 22 mutants (20 red by name, 2 threw) hold those three changes.

## The 51, and what is known about them

* **Not a verdict.** The shim is an over-approximation: `path.relative` always answers with backslashes, and `path.join` / `path.resolve` respell only paths whose first segment is not a directory of this box. A gate that mixes a `join`-built real path (posix here, backslashes on Windows) with a `relative()` result can differ under the shim and agree on Windows. **I do not know how many of the 51 are red on the rig.** The fixture gates of the two classes the lint was built from (the v4912 stub keyed by a posix path, the v4882 `path.relative` compared with a posix name) are reproduced exactly; that is the whole of the validation.
* **What the entries say about four of them.** `declaredCost` and `strandCensus` are the two reds the rig graded on v4910 (v4911's entry): they are on this list, but the entry's causes (no timing record on the rig, an untracked `ai-bridge/apks`) are not the path spelling, so their being here is not a match. `homography` and `registerResidue` are two of the seven gates v4880's entry named as "the rig-only non-zero exit in one of seven" (the others, `avatarServerViews`, `boundaryLint`, `canvasFill`, `proseAudit`, `wasmSupport`, are NOT red under the shim); only one of the seven was the rig's red, and which one is not recorded.
* **Ten of the 51 are named in `tools/ship/redCensus.mjs`** (rigRunner, budgetEvidence, frozenRecords, headlessGpu, homography, importPosition, playwrightResolve, recordReach, registerResidue, wgslSpec); I did not read each entry to see whether it is listed as a current red, a fixed one or an exemption.
* **What six of them fail on**, read under the shim: `bezierEasing` counts "exactly one file computes the bezier basis" and gets `tools\ship\bezierEasing-selfcheck.mjs, ui\bezierEasing.mjs` (a backslash-spelled path against a slash-spelled exclusion); `registerResidue` lists `tools\roundhouse\detectionMap.mjs` ... as having "NO DOOR" (a path keyed one way and looked up the other); `homography` "is the only homography in the tree" fails the same way; `gateWalk` reports `brain/cs/tools/cs-selfcheck.mjs *** rig.html cannot see it again ***`; `strandCensus` does not see `maze-walker` write `.maze-boot.mjs`; `declaredCost` reads a gate's declared range as rotted at every reading. Two (`frozenRecords`, `declaredCost`'s second row) die with a TypeError on a path the shim spelled with a backslash.

## What to do with the list

The rig's own verify answers which of the 51 are real: run `Clone -> verify` on the rig (brain/RIG_SESSION_OWED_WIP.md, step 2) and compare its reds with this list. A gate on both is a Windows bug the sandbox can now reproduce (`node --import tools/ship/winPathShim.mjs <gate>`); a gate on this list only is the shim's over-approximation, and the lint's rule is then to fix the shim, not the gate. Neither has been done.

## The 51 gates

* `ai-bridge/rigRunner-selfcheck.mjs`
* `render/renderNow-selfcheck.mjs`
* `render/shaderRound-selfcheck.mjs`
* `tools/export/glbConformance-selfcheck.mjs`
* `tools/mutate/shadowedDefaults-selfcheck.mjs`
* `tools/roundhouse/orientationStep-selfcheck.mjs`
* `tools/ship/afterVerdict-selfcheck.mjs`
* `tools/ship/bezierEasing-selfcheck.mjs`
* `tools/ship/budgetEvidence-selfcheck.mjs`
* `tools/ship/checkerCensus-selfcheck.mjs`
* `tools/ship/declaredCost-selfcheck.mjs`
* `tools/ship/deferralCensus-selfcheck.mjs`
* `tools/ship/deviceReach-selfcheck.mjs`
* `tools/ship/ensureDxc-selfcheck.mjs`
* `tools/ship/exactHash-selfcheck.mjs`
* `tools/ship/frozenRecords-selfcheck.mjs`
* `tools/ship/fsr2Coverage-selfcheck.mjs`
* `tools/ship/gateAxioms-selfcheck.mjs`
* `tools/ship/gateWalk-selfcheck.mjs`
* `tools/ship/gatesBridge-selfcheck.mjs`
* `tools/ship/glbTexture-selfcheck.mjs`
* `tools/ship/headlessGpu-selfcheck.mjs`
* `tools/ship/homography-selfcheck.mjs`
* `tools/ship/importClosure-selfcheck.mjs`
* `tools/ship/importPosition-selfcheck.mjs`
* `tools/ship/meshBVH-selfcheck.mjs`
* `tools/ship/mikktSpace-selfcheck.mjs`
* `tools/ship/namedNotChecked-selfcheck.mjs`
* `tools/ship/oceanSrcRebuild-selfcheck.mjs`
* `tools/ship/playwrightResolve-selfcheck.mjs`
* `tools/ship/publishHygiene-selfcheck.mjs`
* `tools/ship/recordReach-selfcheck.mjs`
* `tools/ship/recordTier-selfcheck.mjs`
* `tools/ship/registerResidue-selfcheck.mjs`
* `tools/ship/releaseWorkflow-selfcheck.mjs`
* `tools/ship/runnerCallers-selfcheck.mjs`
* `tools/ship/seamCensus-selfcheck.mjs`
* `tools/ship/shaderEmitters-selfcheck.mjs`
* `tools/ship/shaderPairs-selfcheck.mjs`
* `tools/ship/sharpBridge-selfcheck.mjs`
* `tools/ship/singleSource-selfcheck.mjs`
* `tools/ship/snowReadings-selfcheck.mjs`
* `tools/ship/snowflowVendor-selfcheck.mjs`
* `tools/ship/strandCensus-selfcheck.mjs`
* `tools/ship/subSensedDetSweep-selfcheck.mjs`
* `tools/ship/tournamentDogfight-selfcheck.mjs`
* `tools/ship/treeRead-selfcheck.mjs`
* `tools/ship/walkerParity-selfcheck.mjs`
* `tools/ship/wgslSpec-selfcheck.mjs`
* `tools/ship/zoomBlurExact-selfcheck.mjs`
* `ui/webgpuProbe-selfcheck.mjs`
