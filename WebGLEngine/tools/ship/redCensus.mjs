// FILE: tools/ship/redCensus.mjs -- v4279
//
// *** WHAT IS ACTUALLY RED. NOBODY KNEW, AND THREE DIFFERENT ANSWERS WERE ON RECORD, ALL WRONG. ***
//
// Backlog #134 said FIVE gates were red at HEAD and that rounds kept shipping ALL GREEN over them.
// tools/ship/gate-timings.json's `failingAt` said NINETEEN, captured somewhere around v3211.
// A full sweep at v4278 -- every one of the 1,348 runnable gates, actually executed -- found THIRTY-NINE.
//
// The record was wrong in BOTH directions, which is the part worth keeping. Thirteen of the nineteen it
// listed are now GREEN: somebody fixed them and nobody removed the entry, so the register kept accusing
// working code. And thirty-three of the thirty-nine were absent from it entirely: they went red after the
// snapshot and nothing has looked since. A register that is only ever appended to becomes a list of
// grievances; one that is never appended to becomes a list of fiction. That one had managed both.
//
// ---- *** WHY NOBODY HAD LOOKED, AND WHY THAT EXCUSE IS GONE *** ----------------------------------------------
//
// The honest reason this item slid for round after round is that the suite runner buffers its output and the
// full run was believed to take about ninety minutes, so every attempt looked like an hour of silence with an
// unknown payoff. That belief was never tested either. Running the gate files DIRECTLY, eight at a time, with
// each verdict appended to a file as it lands, finished in about twenty-five minutes with progress visible
// throughout. The obstacle was the runner, not the work.
//
// ---- *** BUT A PARALLEL SWEEP LIES ABOUT TIMING-SENSITIVE GATES, AND IT LIED ABOUT SEVEN *** -----------------
//
// The 8-way sweep reported FORTY-SIX red. Re-running those forty-six ONE AT A TIME on an idle box turned
// SEVEN of them green: a battle sim whose gate asserts its clock passed 0.5 s after 2.5 s of wall time, a
// frame-budget check, a sort benchmark, three browser-driven gates and a fast-path timing check. Every one is
// a gate that measures something against the clock, and every one was starved by the other seven workers.
//
// So the method is TWO PHASES and the second is not optional: sweep wide in parallel to find candidates, then
// CONFIRM EVERY CANDIDATE SERIALLY. A parallel red is a hypothesis. 15% of them were false.
//
// ---- *** AND ATTRIBUTING A RED BY CHECKING OUT AN OLD COMMIT HAS ITS OWN TRAP *** -----------------------------
//
// To separate "this session broke it" from "this was already broken", the thirty-nine were re-run in a
// worktree at v4266, before this session's rounds. Thirty-six were already red there. Three were not, and two
// of those really were mine: gateQuality (four prose-matching regexes in gates I wrote at v4270-71) and
// orreryEjecta (a real new three.js importer, tools/ship/webgpuHarness.mjs, so its baseline moved 67 -> 68).
//
// The third, duplicateFiles, was a FALSE ATTRIBUTION. It walks the filesystem, and the working tree has two
// git-ignored agent worktrees under .claude/ that a clean checkout does not -- hundreds of phantom duplicate
// groups, present on this box and in no commit. A CLEAN CHECKOUT IS A DIFFERENT WORLD from a working tree,
// and any gate that scans files rather than reading git's index will be compared across that gap. It is fixed
// at its cause (the walk skips .claude now) rather than by moving a baseline.
"use strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** How the v4279 measurement was taken, so a later round can repeat it rather than trust it. */
export const METHOD = Object.freeze({
    version: "v4279",
    totalGates: 1348,
    sweptInParallel: 46,
    confirmedSerially: 39,
    falseRedsFromParallelism: 7,
    recoveredFromTimeoutBucket: 1,   // referenceKind: filed as a timeout, confirmed RED serially afterwards
    // TWO gates left the timeout bucket once they were run one at a time, in opposite directions:
    // referenceKind at 73.7s exits 1 (red), twoF at 120.5s exits 0 (green). Both had been "unmeasured", and
    // a bucket that holds a red and a green with equal confidence is exactly why it may not be waved through.
    resolvedOutOfTimeoutBucket: 2,
    preExistingAtV4266: 36,
    introducedThisSession: 2,
    falseAttribution: 1,
    note: "phase 1: xargs -P 8 over every gate file, appending verdicts as they land (~25 min). phase 2: " +
          "re-run every candidate ONE AT A TIME (~9 min). Phase 2 is what makes the number real.",
});

/**
 * *** THE RED SET, MEASURED AND RE-CONFIRMED SERIALLY AT v4279. ***
 *
 * `ms` is that gate's own measured runtime, which is why this census can afford to re-run ALL of them rather
 * than sampling: the whole list costs about 68 seconds. A census that only spot-checks is a census that can
 * be wrong about the entries it skipped, and this tree has enough of those already.
 */
export const RED_AT_V4279 = Object.freeze([
    { gate: "engine/frameDirtyCensus-selfcheck.mjs", ms: 775,
      fails: "*** every covers list belongs to an addSource call -- none has drifted onto a constructor that would ignore it *" },
    { gate: "tools/roundhouse/swekWebviewApk-selfcheck.mjs", ms: 914,
      fails: "...and a failed load offers the prompt, since that is when the address is usually wrong" },
    { gate: "tools/ship/avatarServerViews-selfcheck.mjs", ms: 6352,
      fails: "!! every framed surface the server.html switch mounts carries ?embed=1 rigged, stickwoman, robotexpressive2, b" },
    { gate: "tools/ship/bfcache-selfcheck.mjs", ms: 993,
      fails: "!! NO PAGE TEARS THINGS DOWN ON pagehide WITHOUT CHECKING event.persisted camera-effects.html" },
    { gate: "tools/ship/boundaryLint-selfcheck.mjs", ms: 5714,
      fails: "!! no NEW reported boundary tell has appeared 89 sites against a baseline of 88; NEW (1): ai-bridge/vbaArchive" },
    { gate: "tools/ship/budgetEvidence-selfcheck.mjs", ms: 80,
      fails: "!! *** every gate carries evidence about its own runtime, or admits that it does not finish *** 67 with none -" },
    { gate: "tools/ship/canvasFill-selfcheck.mjs", ms: 4908,
      fails: "!! NO PAGE IN THE TREE SHIPS A FIXED, UNGROWABLE CANVAS POSTAGE STAMPS: tools/ship/atmosphereHarness.html#c, t" },
    { gate: "tools/ship/definitionGates-selfcheck.mjs", ms: 226,
      fails: "!! no NEW exported symbol under physics/ has appeared without its gate naming it GREW to 6: physics/crypto/sec" },
    { gate: "tools/ship/gateBudget-selfcheck.mjs", ms: 84,
      fails: "!! *** the recorded slowest gate is still the slowest one anybody has SEEN *** observed worst in the general p" },
    { gate: "tools/ship/gateReach-selfcheck.mjs", ms: 9808,
      fails: "!! the default population is ACCOUNTED FOR -- it may grow, but not silently expected 472 (from the recorded ce" },
    { gate: "tools/ship/homography-selfcheck.mjs", ms: 1444,
      fails: "!! it is the only homography in the tree" },
    { gate: "tools/ship/mutationTable-selfcheck.mjs", ms: 58,
      fails: "!! EVERY MUTATION'S FIND-STRING IS STILL PRESENT STALE, MUTATES NOTHING, WOULD REPORT A PHANTOM SURVIVOR: the" },
    { gate: "tools/ship/orrery-selfcheck.mjs", ms: 4705,
      fails: "and they are named rather than counted:" },
    { gate: "tools/ship/orrerySeed-selfcheck.mjs", ms: 9034,
      fails: "*** orrery.json is current -- run: node tools/ship/orreryBake.mjs --write ***" },
    { gate: "tools/ship/orreryView-selfcheck.mjs", ms: 10802,
      fails: "*** the bake and the scan agree on how many bodies are CAPTURED (12 vs 14) -- reading only b.paths made the brow" },
    { gate: "tools/ship/pagePlacement-selfcheck.mjs", ms: 88,
      fails: "!! ...and the silent bucket is the large one, which is the finding 210 silent against 211 placed. pageSections" },
    { gate: "tools/ship/pagePlacements-selfcheck.mjs", ms: 106,
      fails: "...and the packing rule has ONE implementation, on the server side the browser renders what it is handed. A se" },
    { gate: "tools/ship/pageReflow-selfcheck.mjs", ms: 87,
      fails: "!! *** nothing reads layout after a DOM write inside a loop *** ui/crtToggle.js:58 getBoundingClientRect, ui/d" },
    { gate: "tools/ship/pageSectionsReport-selfcheck.mjs", ms: 1483,
      fails: "!! and no alarm span is drawn at all when nothing is actually wrong \u2014 1 already linked in another part of t" },
    { gate: "tools/ship/pairlaneBridge-selfcheck.mjs", ms: 90,
      fails: "!! *** the panel's label is RENAMED to what Keith actually asked for, id/tab left untouched *** renaming the i" },
    { gate: "tools/ship/proseAudit-selfcheck.mjs", ms: 2001,
      fails: "the audit actually resolved most of its subjects (an audit that cannot see its subjects is not an audit) 44 so" },
    // *** THIS ENTRY IS THE ONE THE FIRST DRAFT GOT WRONG, AND IT EXPOSED A HOLE IN THE METHOD. ***
    // The parallel sweep TIMED IT OUT at 120s and the census then filed it under RECORDED_BUT_GREEN, on the
    // strength of it appearing in gate-timings.json's stale list and not in the confirmed-red list. It runs
    // in 73.7s on an idle box and EXITS 1. It was never green; it was starved, mis-bucketed, and then read
    // as exonerated. Found only because the control in section 3 re-runs a sample rather than trusting the
    // set difference -- which is the entire argument for having that control.
    { gate: "tools/ship/referenceKind-selfcheck.mjs", ms: 73680,
      fails: "(confirmed red serially at 73.7s -- mis-bucketed as a timeout by the parallel sweep)" },
    { gate: "tools/ship/registerResidue-selfcheck.mjs", ms: 1321,
      fails: "!! *** the residue may only SHRINK -- a page linked but neither placed nor excused fails on arrival *** 45 aga" },
    { gate: "tools/ship/rigJobs-selfcheck.mjs", ms: 53,
      fails: "the page renders title, why and how for each" },
    { gate: "tools/ship/shaderCensus-selfcheck.mjs", ms: 279,
      fails: "!! *** only 4 files author a shader in BOTH languages *** fx/nebula/nebulaShaders.js, fx/wormhole/wormholeNebu" },
    // v4318 -- RECOVERED FROM THE TIMEOUT BUCKET, the second gate to make that journey after referenceKind.
    { gate: "tools/ship/shaderRefs-selfcheck.mjs", ms: 379838,
      fails: "!! the hand-spelled corpus filters are COUNTED, not swept 16 callers still spell /\\.(js|mjs|html)$/ by ha" },
    { gate: "tools/ship/statedRuntime-selfcheck.mjs", ms: 129,
      fails: "!! *** no NEW header has drifted from what its gate actually does *** NEW: tools/roundhouse/assumptions-selfch" },
    { gate: "tools/ship/sunshineHost-selfcheck.mjs", ms: 101,
      fails: "every route the bridge lists is reachable through its own handler" },
    { gate: "tools/ship/supersededFlag-selfcheck.mjs", ms: 69,
      fails: "...and an UNINVITED launch still refuses, which was always correct two launchers that both start a server take" },
    { gate: "tools/ship/unattendedHold-selfcheck.mjs", ms: 54,
      fails: "!! the port-owner refusal still REFUSES -- the fix was to the hold, not the verdict it must still decline to f" },
    { gate: "tools/ship/updatePause-selfcheck.mjs", ms: 284,
      fails: "...and an errored check is counted as its own thing, not silently dropped" },
    { gate: "tools/ship/wasmSupport-selfcheck.mjs", ms: 2968,
      fails: "!! 82 files mention .wasm or the WebAssembly API -- the item's number, and it is the loose one 89 mention it" },
    { gate: "tools/ship/winPathGuard-selfcheck.mjs", ms: 672,
      fails: "!! no source file uses the Windows-fragile path idioms 17 offending occurrence(s): engine/frameDirtyCensus-sel" },
    { gate: "tools/ship/wiringClaims-selfcheck.mjs", ms: 1731,
      fails: "!! *** every remaining hit is a CONTRAST LINE, adjudicated by name *** a sentence that says 'A is unwired whil" },]);

/**
 * The thirteen gate-timings.json listed as failing that are GREEN now.
 *
 * *** THESE ARE NOT A BACKLOG. THEY ARE THE REGISTER'S OWN FALSE ACCUSATIONS, *** kept visible because
 * deleting them silently would repeat the mistake that produced them. Each was fixed by some round that did
 * not know it was listed, which is exactly what happens when a register is written once and never read.
 */
export const RECORDED_BUT_GREEN = Object.freeze([
    "ai-bridge/tools/lab-scene-run-selfcheck.mjs", "tools/roundhouse/strictConfig-selfcheck.mjs",
    "tools/roundhouse/twoF-selfcheck.mjs", "tools/ship/hookupState-selfcheck.mjs",
    "tools/ship/moduleHistory-selfcheck.mjs", "tools/ship/physicsReach-selfcheck.mjs",
    "tools/ship/registryOrphans-selfcheck.mjs",
    "tools/ship/rootLayout-selfcheck.mjs", "tools/ship/singleSource-selfcheck.mjs",
    "tools/ship/timingCoverage-selfcheck.mjs", "tools/ship/updateIntegrity-selfcheck.mjs",
    "ui/stageInfo-selfcheck.mjs",
]);

/** Fixed at v4279, with who broke them -- the two that were this session's doing, and the one that was not. */
export const FIXED_AT_V4279 = Object.freeze([
    { gate: "tools/ship/gateQuality-selfcheck.mjs", cause: "this session",
      why: "four prose-matching regexes in gates written at v4270-71. Fixed by making them whitespace-" +
           "insensitive: one is an ABSENCE check on a retracted claim, and a literal there would have gone " +
           "quietly green if the sentence were re-wrapped -- the failure direction that hides a false claim." },
    { gate: "tools/ship/orreryEjecta-selfcheck.mjs", cause: "this session",
      why: "tools/ship/webgpuHarness.mjs (v4270) really does import three, so the importer count moved " +
           "67 -> 68. Established by diffing the importer list at v4266 against HEAD: exactly one path added. " +
           "The baseline moved, with the reason recorded beside it." },
    { gate: "tools/ship/duplicateFiles-selfcheck.mjs", cause: "NOT this session -- the measurement lied",
      why: "it walks the filesystem and found two git-ignored agent worktrees under .claude/ that exist on " +
           "this box and in no commit. It looked session-caused only because the v4266 comparison was a " +
           "clean checkout. Fixed at the cause: the walk skips .claude." },
]);

//
// *** THE LIST SHRANK FOR THE FIRST TIME, AND THE CENSUS'S OWN ARITHMETIC COULD NOT EXPRESS IT. ***
//
// redCensus-selfcheck section 2 says, in its own words: "a gate turning green is GOOD NEWS that must be
// recorded by hand... The list may only shrink, and only on purpose." *** THAT PATH HAD NEVER BEEN WALKED. ***
// RECHECK at v4295 measured nowGreen: 0, so in sixteen rounds nothing had ever left, and the identity the
// gate asserts -- confirmedSerially + recoveredFromTimeoutBucket - FIXED_AT_V4279 === RED_AT_V4279.length --
// was written when the right-hand side could only stay still. Delete one line for a gate somebody FIXED and
// that identity goes red. *** SO THE CENSUS'S ARITHMETIC PUNISHED THE PRUNING THE CENSUS DEMANDS *** -- the
// same shape as the Arriving cap that made hiding a page cheaper than linking it (server.html, v4155), and as
// corroborateFully's "two rejections" that went red when a defect was repaired. A ledger needs a column for
// good news or it will only ever record bad.
//
// The fix is a term, not a looser check: FIXED_SINCE_V4279 is subtracted alongside FIXED_AT_V4279, so the
// reconciliation still has to balance and pruning is now the way to balance it.
//
// *** AND ONE OF THE THREE WAS GREEN BEFORE THIS ROUND TOUCHED ANYTHING, WHICH IS THE INTERESTING ONE. ***
// deviceModes was fixed by commit 9695918, whose own diff says so in the file: it removed "nuclear" from
// UNGUARDED_BASELINE because nuclear was THE LAST PROBED DEVICE and now derives its modes from one
// NUCLEAR_MODES const. That commit fixed the gate and did not prune the census, so the census kept accusing
// it -- which is precisely the failure the header of this file describes ("thirteen of the nineteen it listed
// are now GREEN: somebody fixed them and nobody removed the entry"). *** THE MECHANISM WRITTEN TO STOP THAT
// HAD ALREADY LET IT HAPPEN ONCE MORE, and it took until now to notice because nothing re-ran the list.
// *** GATES THAT LEFT THE TIMEOUT BUCKET AND ENTERED THE RED SET, WHICH IS THE OTHER DIRECTION ENTIRELY. ***
//
// FIXED_SINCE_V4279 records the register SHRINKING because somebody repaired a gate. This records it GROWING
// because somebody finally measured one. v4279 had exactly one of these -- referenceKind, filed as a timeout
// and confirmed RED serially -- and METHOD.recoveredFromTimeoutBucket counts it. *** THAT FIELD MUST NOT BE
// INCREMENTED FOR A LATER ONE. *** METHOD is "how the v4279 measurement was taken"; bumping it to 2 would
// make a frozen snapshot describe an instant it does not, which is the defect v4315 corrected in
// RECHECK_V4313 and v4297 corrected in RECHECK. A later recovery is a later term.
export const RECOVERED_SINCE_V4279 = Object.freeze([
    { gate: "tools/ship/shaderRefs-selfcheck.mjs", round: "v4318", verdict: "RED", ms: 379838,
      method: "serial, alone on an idle box, after the v4317 sweep had finished rather than while it ran",
      why: "IT WAS NEVER A TIMEOUT. It runs in 379.8 s and exits 1 -- the v4279 sweep capped candidates at " +
           "120 s under eight workers, so it was cut off before it could fail and read as unmeasured. Third " +
           "confirmation of the verdict (exit 1 at ~380 s, ~450 s and 379.8 s across three runs); the " +
           "timing is the one taken with nothing else on the box. Its failure names 16 callers that spell " +
           "/\\.(js|mjs|html)$/ by hand instead of using the corpus filter, and none of them is anything " +
           "this branch has touched -- it was red before this session and is red for its own reason." },
]);

/**
 * *** THE REGISTER'S SIZE AT THE MOMENT THE LAST FULL SWEEP RAN, DERIVED IN ONE PLACE. ***
 *
 * Five assertions across three gate files reconcile a frozen v4296/v4297 figure against RED_AT_V4279, and at
 * v4315 all five needed the same missing term when the list first SHRANK. They now need a second one, because
 * it has GROWN as well -- and five copies of a two-term correction is five chances to update four of them.
 * THE SECOND COPY IS NEVER THE ONE THAT GETS UPDATED, so there is one copy, here, and every consumer calls it.
 *
 *     33 standing today + 4 fixed and pruned since - 1 recovered into it since = 37 when the sweep ran
 */
export const registerAtSweep = () =>
    RED_AT_V4279.length + FIXED_SINCE_V4279.length - RECOVERED_SINCE_V4279.length;

export const FIXED_SINCE_V4279 = Object.freeze([
    { gate: "tools/roundhouse/deviceModes-selfcheck.mjs", round: "9695918 (before this round)",
      why: "nuclear declared no modes at all, so modesOf() fell back to the candidate list and its echoing " +
           "defaults() accepted all 29 -- the last device the census could only PROBE, which is what made " +
           "'nothing is probed any more' false. It now reads a single NUCLEAR_MODES const from both `modes:` " +
           "and defaults(). Census 127 exported / 1 probed; today 128 exported / 0 probed / 1 with no " +
           "defaults() to declare from (lbm). NOT fixed by this round -- found by it." },
    { gate: "tools/ship/launchIndex-selfcheck.mjs", round: "v4313",
      why: "the SHIPPED launch-index.json was sixteen entries stale -- 507 against the 523 the builder " +
           "computes -- missing fifteen pages plus this round's own. Fixed by running the builder that " +
           "writes it (node tools/ship/launchIndex.mjs --write), not by moving a number." },
    { gate: "tools/ship/shipRitual-selfcheck.mjs", round: "v4313",
      why: "THE SAME STALE ARTEFACT, SECOND READER. Its failing line quoted the same 507 launchables and 424 " +
           "pages, because shipRitual reads launch-index.json too. One stale generated file was carried as " +
           "two independent red gates in the census, which is worth knowing about a census: entries are not " +
           "independent, and a count of red gates over-counts the number of causes." },
    { gate: "tools/pageReach-selfcheck.mjs", round: "v4314",
      why: "TWELVE PAGES BORN INVISIBLE between v4176 and v4235 -- aquarelle, camera-effects, destructible, " +
           "doom-fire, drive-brain, mesh-line, odometer, primitive-paint, proc-brush, scene-view, sfx and " +
           "spellbook -- in the tree, working, and reachable from nothing. All twelve were opened in headless " +
           "Chromium over a real server first (twelve for twelve loaded clean, no page errors, no failed " +
           "requests), then linked from server.html and FILED: drive-brain into the GPU Brain drawer, the " +
           "other eleven into UNPLACED with the reason each is still there. Invisible 96 -> 84 against a " +
           "baseline of 100; Arriving 47 -> 58 of 440, 13.2% against a 15% cap. Fixed by linking pages, not " +
           "by touching the ratchet." },
]);

/**
 * *** THE HOLE THIS CENSUS DOES NOT CLOSE, NAMED RATHER THAN OMITTED. ***
 *
 * The parallel sweep hit a flat 120s cap on 66 gates -- an arbitrary number I chose, not a budget the tree
 * records -- and a gate that does not finish leaves no verdict. They are NOT red and they are NOT green;
 * they are UNMEASURED, and the distinction is the whole reason this list exists instead of a rounded-up
 * count.
 *
 * *** THAT BUCKET IS NOT SAFE TO WAVE THROUGH, AND ONE OF ITS MEMBERS PROVES IT. ***
 * tools/ship/referenceKind-selfcheck.mjs sat here. It runs in 73.7s on an idle box and EXITS 1 -- red the
 * whole time, starved past the cap by the seven other workers, and then read as exonerated because it was
 * not in the confirmed-red list. It is in RED_AT_V4279 now. Any of the remaining entries could be the same.
 *
 * Confirming them serially is roughly three hours (measured: 20 of the 64 done, all green so far), which is a round of its own and is recorded here as the next step rather than guessed at now.
 */
export const UNCONFIRMED_SLOW = Object.freeze([
    "fluid/flip3d-selfcheck.mjs",
    "physics/astroparticle/jeans-selfcheck.mjs",
    "physics/mesh/weightScaling-selfcheck.mjs",
    "physics/nuclear/reactorControl-selfcheck.mjs",
    "physics/sph/levelClaim-selfcheck.mjs",
    "physics/sph/materialKnobs-selfcheck.mjs",
    "physics/sph/packingTransfer-selfcheck.mjs",
    "physics/sph/poolFixture-selfcheck.mjs",
    "physics/sph/stability-selfcheck.mjs",
    "physics/sph/tiltPower-selfcheck.mjs",
    "physics/sph/wideTilt-selfcheck.mjs",
    "physics/thermal/stefan-selfcheck.mjs",
    "physics/tomography/matchedAdjoint-selfcheck.mjs",
    "rig/cinematicShot-selfcheck.mjs",
    "simulation/lbm/inflow-selfcheck.mjs",
    "simulation/lbm/onsetTrend-selfcheck.mjs",
    "simulation/lbm/settleCurve-selfcheck.mjs",
    "tools/render-qa/terminatorOracle-selfcheck.mjs",
    "tools/roundhouse/assumptionMap-selfcheck.mjs",
    "tools/roundhouse/census-selfcheck.mjs",
    "tools/roundhouse/claimTrace-selfcheck.mjs",
    "tools/roundhouse/compose-selfcheck.mjs",
    "tools/roundhouse/corroborationCensus-selfcheck.mjs",
    "tools/roundhouse/detectionMap-selfcheck.mjs",
    "tools/roundhouse/flip3dBind-selfcheck.mjs",
    "tools/roundhouse/hydrostatic-selfcheck.mjs",
    "tools/roundhouse/khBind-selfcheck.mjs",
    "tools/roundhouse/khConvergence-selfcheck.mjs",
    "tools/roundhouse/khGrowthKey-selfcheck.mjs",
    "tools/roundhouse/khMichalke-selfcheck.mjs",
    "tools/roundhouse/knobLiveness-selfcheck.mjs",
    "tools/roundhouse/labExport-selfcheck.mjs",
    "tools/roundhouse/labResults-selfcheck.mjs",
    "tools/roundhouse/libmSensitivity-selfcheck.mjs",
    "tools/roundhouse/menuScope-selfcheck.mjs",
    "tools/roundhouse/observableFinite-selfcheck.mjs",
    "tools/roundhouse/observableUnits-selfcheck.mjs",
    "tools/roundhouse/opticsBind-selfcheck.mjs",
    "tools/roundhouse/pipeFlowKey-selfcheck.mjs",
    "tools/roundhouse/plantDirection-selfcheck.mjs",
    "tools/roundhouse/plantedCoverage-selfcheck.mjs",
    "tools/roundhouse/rayleighOnset-selfcheck.mjs",
    "tools/roundhouse/responseCensus-selfcheck.mjs",
    "tools/roundhouse/sensitivity-selfcheck.mjs",
    "tools/roundhouse/stabilityBind-selfcheck.mjs",
    "tools/roundhouse/thermalScaling-selfcheck.mjs",
    "tools/roundhouse/twoFBind-selfcheck.mjs",
    "tools/roundhouse/valueMatch-selfcheck.mjs",
    "tools/roundhouse/zeroRangeSweep-selfcheck.mjs",
    "tools/ship/ddaPrecisionReport-selfcheck.mjs",
    "tools/ship/deterministicRaf-selfcheck.mjs",
    "tools/ship/domScope-selfcheck.mjs",
    "tools/ship/doorKinds-selfcheck.mjs",
    "tools/ship/driveEnv-selfcheck.mjs",
    "tools/ship/floors-selfcheck.mjs",
    "tools/ship/gateSelection-selfcheck.mjs",
    "tools/ship/graveyard-selfcheck.mjs",
    "tools/ship/labDevices-selfcheck.mjs",
    "tools/ship/loopSearch-selfcheck.mjs",
    "tools/ship/moduleRefs-selfcheck.mjs",
    "tools/ship/orphanDisposition-selfcheck.mjs",
    "tools/ship/orphanTriage-selfcheck.mjs",
    "tools/ship/toolFrontDoor-selfcheck.mjs"
]);

/** Partial serial verdicts for the above, as far as the v4279 confirmation run got. */
export const SLOW_PARTIAL = Object.freeze({
    "fluid/flip3d-selfcheck.mjs": {
        "verdict": "GREEN",
        "ms": 47838
    },
    "physics/astroparticle/jeans-selfcheck.mjs": {
        "verdict": "GREEN",
        "ms": 71575
    },
    "physics/mesh/weightScaling-selfcheck.mjs": {
        "verdict": "GREEN",
        "ms": 69849
    },
    "physics/nuclear/reactorControl-selfcheck.mjs": {
        "verdict": "GREEN",
        "ms": 95991
    },
    "physics/sph/levelClaim-selfcheck.mjs": {
        "verdict": "SLOW400",
        "ms": 400016
    },
    "physics/sph/materialKnobs-selfcheck.mjs": {
        "verdict": "GREEN",
        "ms": 174696
    },
    "physics/sph/packingTransfer-selfcheck.mjs": {
        "verdict": "GREEN",
        "ms": 252860
    },
    "physics/sph/poolFixture-selfcheck.mjs": {
        "verdict": "GREEN",
        "ms": 117857
    },
    "physics/sph/stability-selfcheck.mjs": {
        "verdict": "GREEN",
        "ms": 347035
    },
    "physics/sph/tiltPower-selfcheck.mjs": {
        "verdict": "GREEN",
        "ms": 64197
    },
    "physics/sph/wideTilt-selfcheck.mjs": {
        "verdict": "GREEN",
        "ms": 63598
    },
    "physics/thermal/stefan-selfcheck.mjs": {
        "verdict": "GREEN",
        "ms": 148121
    },
    "physics/tomography/matchedAdjoint-selfcheck.mjs": {
        "verdict": "GREEN",
        "ms": 38816
    },
    "rig/cinematicShot-selfcheck.mjs": {
        "verdict": "GREEN",
        "ms": 101948
    },
    "simulation/lbm/inflow-selfcheck.mjs": {
        "verdict": "GREEN",
        "ms": 76586
    },
    "simulation/lbm/onsetTrend-selfcheck.mjs": {
        "verdict": "GREEN",
        "ms": 39123
    },
    "simulation/lbm/settleCurve-selfcheck.mjs": {
        "verdict": "GREEN",
        "ms": 93133
    },
    "tools/render-qa/terminatorOracle-selfcheck.mjs": {
        "verdict": "GREEN",
        "ms": 95656
    },
    "tools/roundhouse/assumptionMap-selfcheck.mjs": {
        "verdict": "GREEN",
        "ms": 308924
    },
    "tools/roundhouse/census-selfcheck.mjs": {
        "verdict": "SLOW400",
        "ms": 400025
    },
    "tools/roundhouse/claimTrace-selfcheck.mjs": {
        "verdict": "SLOW400",
        "ms": 400022
    },
    "tools/roundhouse/compose-selfcheck.mjs": {
        "verdict": "GREEN",
        "ms": 111202
    },
    // v4318 -- MEASURED SERIALLY AND STILL WITHOUT A VERDICT, which is a fact about the gate rather than
    // about the sweep. The v4279 run capped at 120 s; a serial run alone on an idle box does not finish it
    // at 500 s either, and it produces ZERO BYTES of output before the cap because it buffers. It stays in
    // UNCONFIRMED_SLOW: unmeasured is a third state and this is what one actually looks like.
    "tools/ship/toolFrontDoor-selfcheck.mjs": {
        "verdict": "SLOW500",
        "ms": 500000
    }
});

/** Run one gate and report whether it is red. Nothing here interprets WHY -- only the exit code. */
export function runGate(rel, { timeoutMs = 120000 } = {}) {
    try {
        execFileSync(process.execPath, [rel], { cwd: ENG, timeout: timeoutMs, stdio: "ignore" });
        return { red: false, code: 0 };
    } catch (e) {
        return { red: true, code: e.status == null ? "timeout/signal" : e.status };
    }
}

/** Total cost of re-verifying the whole census, in ms, from the recorded per-gate times. */
export const censusCostMs = (list = RED_AT_V4279) => list.reduce((a, e) => a + e.ms, 0);

// ================================================================================================
// v4295 -- THE RE-CHECK, SIXTEEN ROUNDS LATER
// ================================================================================================
//
// *** ALL 37 ARE STILL RED. NOT ONE HAS BEEN FIXED. ***
//
// The census was taken at v4279 and then nobody looked again. Sixteen rounds shipped ALL GREEN over it --
// which was true, because verify.mjs runs a different and much smaller set, and the selfcheck sweep is not
// what a ship gate executes. So the tree's "ALL GREEN" was never lying; it was answering a narrower question
// than anybody reading it assumed.
//
// Re-run serially at v4295, one gate at a time, with the same runGate the census itself provides:
//
//     recorded red at v4279 : 37
//     STILL red now         : 37
//     now green             :  0
//
// A 37-of-37 result is the shape of a broken measurement, so the runner was controlled first: it reports GREEN
// for frameGraph-selfcheck (83 ms), crossBackend-selfcheck (7480 ms) and claimCheck-selfcheck (516 ms), and
// the 37 reds take between 89 ms and 7.5 s with the spread you would expect from real work. They are running
// and they are failing.
//
// WHAT DID NOT HAPPEN IS AS IMPORTANT: nothing among the 37 was fixed. The register is not rotting in the
// direction it rotted last time -- at v4279 THIRTEEN of the nineteen previously recorded were found already
// fixed with nobody removing the entry. This time the list is exactly true and exactly stalled, which is a
// different failure and needs a different fix: not a correction, a RATCHET.
//
// *** CORRECTED AT v4297: THIS RECORD ORIGINALLY CARRIED `regressed: 0`, AND IT HAD NO RIGHT TO. ***
//
// A regression is a gate that was GREEN and is now red. All 37 gates this re-check ran were already red, so
// not one of them was eligible; the zero was a claim about the 1,329 gates the method never executed. The
// prose shipped in the same round said the honest state of that question was UNKNOWN -- so the caveat and the
// field contradicted each other inside one commit, and the field is the half a reader greps.
//
// The rule that catches it is gateSweep.coversRegressions(): a method may report on regressions only if the
// gates it ran include gates that were not already red. The two figures are split below so that the measured
// one and the unmeasured one cannot be read as the same kind of thing. The full sweep that IS entitled to the
// answer ran at v4297; see gateSweep.SWEEP_V4297.
export const RECHECK = Object.freeze({
    at: "v4296", roundsSince: 16, method: "serial, one gate at a time, via runGate", // ran in the round that shipped as v4296; the header said v4295 then
    checked: 37, stillRed: 37, nowGreen: 0,
    // MEASURED: of the 37 re-run, none had gone from red to red-for-a-new-reason or otherwise moved.
    regressedAmongChecked: 0,
    // NOT MEASURED, and originally shipped as a bare `regressed: 0`. See the correction above.
    regressedOverall: "unmeasurable by this method -- all 37 gates it ran were already red, so no gate " +
                      "eligible to regress was executed; answered by the full sweep at v4297",
    controlled: Object.freeze(["tools/ship/frameGraph-selfcheck.mjs", "tools/ship/crossBackend-selfcheck.mjs",
                               "tools/ship/claimCheck-selfcheck.mjs"]),
    controlVerdict: "all three report GREEN, so 37-of-37 is not a runner that reports red for everything",
    whyShipsWereHonest: "verify.mjs runs a smaller, different set; the selfcheck sweep is not what a ship gate executes",
});

/**
 * *** THE TWO NUMBERS DESCRIBE TWO MOMENTS, AND NOTHING SAID SO. ***
 *
 * METHOD.confirmedSerially is 39. RED_AT_V4279 held 37. A reader comparing them finds a contradiction, and
 * there is none: 39 is what the sweep FOUND, 37 is what remained after v4279 fixed the two it had itself
 * introduced (gateQuality and orreryEjecta, both absent from the standing list, correctly).
 *
 *     37 standing + 2 introduced-and-fixed = 39 confirmed
 *
 * *** AND THERE IS NOW A THIRD INSTANT, WHICH IS WHY standingToday IS DERIVED AND NOT TYPED. *** v4313 pruned
 * three gates that had been fixed, so the list holds 34. Writing "34" beside "37" here would have made this
 * block the very thing it was written to warn about -- two snapshots in one object with nothing saying which
 * is when -- so the live count comes from RED_AT_V4279 itself and can never go stale, while the two frozen
 * numbers keep saying what they always said about v4279.
 *
 * Same shape as v4293's ROUND_TRIPS, which described two different draw spans in one frozen object. A record
 * whose fields are snapshots of different instants has to say which instant, or its own reader will treat the
 * difference as an error.
 */
export const MOMENTS = Object.freeze({
    confirmedBySweep: 39, standingAfterFixes: 37, introducedAndFixedInRound: 2,
    reconciles: "37 + 2 = 39",
    fixedInRound: Object.freeze(["tools/ship/gateQuality-selfcheck.mjs", "tools/ship/orreryEjecta-selfcheck.mjs"]),
    // DERIVED. The moment this file's own doc-comment says a typed copy would misrepresent.
    get standingToday() { return RED_AT_V4279.length; },
    fixedSince: "see FIXED_SINCE_V4279 -- 37 standing at v4279 minus what has been fixed since",
});

// v4314, one round later, and the list moved AGAIN -- which is the answer to whether v4313's three were a
// one-off backlog or the register genuinely lagging the tree. It is the second: pageReach had been naming the
// same twelve pages every round, so the work it was asking for was legible the whole time and nothing had
// done it. A census whose entries are actionable and unactioned is a to-do list nobody reads, and the only
// way to find that out was to act on one.
// *** MERGED FROM main AT v4315 AND IMMEDIATELY CORRECTED BY IT. *** This record shipped `regressed: 0`, and
// main's v4297 had just deleted that exact field from RECHECK for the exact reason: a section-2 re-run executes
// ONLY the gates already known red, so no gate eligible to regress is ever run and the zero is a claim about
// the ~1,330 the method never touched. gateSweep.coversRegressions() is the rule, and it refuses this method.
//
// v4314 DID have a method entitled to the answer, and it was a different one -- so it is recorded as a
// different one rather than folded into the same object. Two methods, two coverages, two verdicts.
export const RECHECK_V4314 = Object.freeze({
    at: "v4314", method: "the gate's own section-2 re-run, serial, via runGate",
    checked: 34, stillRed: 33, nowGreen: 1,
    // MEASURED: none of the 34 had moved except the one that went green.
    regressedAmongChecked: 0,
    // NOT MEASURED BY THIS METHOD, and it shipped as a bare `regressed: 0` for one round.
    regressedOverall: "unmeasurable by the section-2 re-run -- every gate it runs is already red, so no gate " +
                      "eligible to regress was executed. ANSWERED SEPARATELY BY sweptOutsideTheCensus below, " +
                      "which is a different method with real coverage and which found one",
    nowGreenGates: Object.freeze(["tools/pageReach-selfcheck.mjs"]),
    causes: "twelve pages linked and filed; the gate was asking for exactly that and had been for rounds",
    stillRedNearby: "registerResidue-selfcheck went 46 -> 45 in the same edit and stays RED against its " +
                    "ceiling of 41. THE CEILING WAS NOT MOVED. Lowering it to 45 would have turned the gate " +
                    "green by rewriting the ratchet, which is the one thing this file exists to refuse",
    // *** THE METHOD THAT IS ENTITLED TO THE REGRESSION ANSWER. *** All 89 gates that read server.html, swept
    // six-way then confirmed serially -- 87 returned, and the great majority were NOT in the census, so a
    // green-gone-red was visible to it. It found one, which is why the split above is not pedantry: the
    // entitled method's answer is 1 and the unentitled method's would have been 0.
    sweptOutsideTheCensus: Object.freeze({
        population: "the 89 gates whose source reads server.html", returned: 87, red: 8, inCensusAlready: 7,
        regressedFound: 1,
        found: Object.freeze([
            { gate: "tools/ship/instruments-selfcheck.mjs", wentRed: "v4313", fixed: "v4314",
              why: "a page carrying an EXACT KEY (ln 2 off the GPU) was linked and indexed nowhere. Fixed by " +
                   "registering it in physics/instruments.mjs with a verifier that calls the CPU port -- NOT " +
                   "by adding it to that gate's EXEMPT list beside krbn.html, which the identical import made " +
                   "available and which would have filed an answer as a decoration." },
        ]),
        didNotReturn: Object.freeze([
            { gate: "tools/ship/shaderRefs-selfcheck.mjs", verdict: "RED serially, first verdict it has ever had",
              note: "in UNCONFIRMED_SLOW, so the census had no verdict either way. Fails on \"16 callers still " +
                    "spell /\\.(js|mjs|html)$/ by hand\" and names none of v4314's pages. Promoting it into " +
                    "RED_AT_V4279 is the documented next step and needs a RECOVERED_SINCE_V4279 term rather " +
                    "than a bump to METHOD.recoveredFromTimeoutBucket, which is a v4279 snapshot" },
            { gate: "tools/ship/toolFrontDoor-selfcheck.mjs", verdict: "UNMEASURED -- exit 124 at 500s, zero output",
              note: "also UNCONFIRMED_SLOW. The v4279 sweep capped at 120s; a serial run on an idle box does " +
                    "not finish it at 500s either, which is a fact about the gate and not about the sweep" },
        ]),
    }),
});

// The first re-check after the list actually MOVED. v4295 found 37 of 37 still red and called it "exactly true
// and exactly stalled"; that was accurate then and it stopped being accurate three commits later, without
// anything noticing, because a stalled list gives nobody a reason to re-run it.
//
// *** AND nowGreenGates WAS WRONG WITHIN ONE ROUND OF BEING WRITTEN, IN THE EXACT SHAPE THIS FILE WARNS
// ABOUT. *** It read `FIXED_SINCE_V4279.map(e => e.gate)` -- the WHOLE list -- which was three gates when
// v4313 wrote it and four the moment v4314 pruned pageReach, so a record of what happened at v4313 silently
// started reporting v4314's work as its own. Deriving a value is only safe when the source cannot span more
// instants than the record does; MOMENTS.standingToday is derived correctly because it deliberately means
// "now", and this one meant "then". Filtered by round, so it can only ever describe v4313.
export const RECHECK_V4313 = Object.freeze({
    at: "v4313", method: "the gate's own section-2 re-run, serial, via runGate",
    checked: 37, stillRed: 34, nowGreen: 3,
    // Corrected at v4315 by main's v4297 rule, same as RECHECK and RECHECK_V4314 above. This round has NO
    // entitled method to offer in its place: it ran the red set and nothing else, so the honest answer is that
    // it does not know -- and the regression it did not see was its own, found one round later.
    regressedAmongChecked: 0,
    regressedOverall: "unmeasurable by this method -- every gate it ran was already red. AND THERE WAS ONE: " +
                      "instruments-selfcheck went green-to-red in this very round, found at v4314 by a sweep " +
                      "with actual coverage. The zero this record used to carry would have been read as its " +
                      "denial",
    nowGreenGates: Object.freeze(FIXED_SINCE_V4279.filter((e) => !/^v43(1[4-9]|[2-9])/.test(e.round)).map((e) => e.gate)),
    causes: "one stale generated file (launch-index.json, 507 against 523) accounted for TWO of the three; the " +
            "third had been green since commit 9695918 and nobody pruned the entry",
    lesson: "a census entry is not a cause. Two of these three were one artefact read by two gates, so the red " +
            "COUNT overstated the number of things wrong -- in the file whose whole subject is that every " +
            "number in circulation about redness was somebody's memory",
});

/**
 * The cheapest gates whose recorded times fit a budget -- so a gate can re-check a real subset every sweep
 * without paying the 142 s the full list costs.
 *
 * Sorted by cost and taken greedily, which makes the selection DETERMINISTIC. A random sample would make the
 * gate flap: a run that happened to pick a slow gate would time out, and one that happened to pick a fixed
 * gate would go red on a different day than its neighbour.
 */
export function cheapSubset(budgetMs = 4000, list = RED_AT_V4279) {
    const out = [];
    let acc = 0;
    for (const e of list.slice().sort((a, b) => a.ms - b.ms || a.gate.localeCompare(b.gate))) {
        if (acc + e.ms > budgetMs) break;
        acc += e.ms; out.push(e);
    }
    return { gates: out, costMs: acc };
}
