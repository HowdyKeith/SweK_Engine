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
import { REGISTER_AUDIT } from "./register-audit.mjs";
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
/*
 * v4430 -- *** THE AUDIT IS THE SOURCE NOW, AND THIS LIST IS THE ONLY THING THE AUDIT CANNOT KNOW. ***
 *
 * docs/EXPLAIN-ITSELF.md item 1, and the step three rounds declined. This array used to carry a QUOTED FAILING
 * LINE and a MILLISECOND COUNT per entry -- a projection of a gate run, frozen at the moment somebody typed it.
 * v4380 found shaderCensus filed at 4 saying 14; v4383 found the 14 was itself false; v4386 found
 * referenceKind's line describing sweep BUCKETING rather than the gate; v4426 found budgetEvidence saying 67
 * when the answer was 3, a 22x drift, and had to retype EIGHT lines from the audit to make the register true.
 * One shape, five sightings: THE STORED PROJECTION WENT STALE BECAUSE THE CANONICAL THING WAS ELSEWHERE.
 *
 * MEASURED BEFORE INVERTING: of the 25 entries, 24 had a line the audit could re-derive -- 7 matching exactly,
 * 16 a whitespace truncation of one, 1 drifted -- and exactly ONE could not, tools/ship/shaderRefs-selfcheck.mjs,
 * whose 379-second run the audit's cap ends before it prints. So all but one of these fields was a hand-typed
 * copy of something the tree already had, and the one is not a stale reading, it is an UNVERIFIED one, which
 * is a different fact and now says so in its own field rather than by looking like the other twenty-four.
 *
 * WHAT REMAINS CANONICAL HERE IS THE NAME LIST: which gates were red at v4279 is a claim about a MOMENT, and no
 * later run can establish it. The reading -- what the gate says, and how long it takes -- belongs to the run,
 * and the run is tools/ship/register-audit.mjs. Re-freeze that and this register updates itself; there is
 * nothing left to retype and nothing left to drift.
 *
 * `ms` and `fails` are still on every entry, so every reader keeps working. They are GETTERS over the audit.
 */
const RED_AT_V4279_GATES = Object.freeze([
    "engine/frameDirtyCensus-selfcheck.mjs",
    "tools/roundhouse/swekWebviewApk-selfcheck.mjs",
    "tools/ship/avatarServerViews-selfcheck.mjs",
    "tools/ship/bfcache-selfcheck.mjs",
    "tools/ship/boundaryLint-selfcheck.mjs",
    "tools/ship/canvasFill-selfcheck.mjs",
    "tools/ship/definitionGates-selfcheck.mjs",
    "tools/ship/gateReach-selfcheck.mjs",
    "tools/ship/homography-selfcheck.mjs",
    "tools/ship/pagePlacement-selfcheck.mjs",
    "tools/ship/pagePlacements-selfcheck.mjs",
    "tools/ship/pageReflow-selfcheck.mjs",
    "tools/ship/pageSectionsReport-selfcheck.mjs",
    "tools/ship/pairlaneBridge-selfcheck.mjs",
    "tools/ship/proseAudit-selfcheck.mjs",
    "tools/ship/referenceKind-selfcheck.mjs",
    "tools/ship/registerResidue-selfcheck.mjs",
    "tools/ship/shaderRefs-selfcheck.mjs",
    "tools/ship/statedRuntime-selfcheck.mjs",
    "tools/ship/sunshineHost-selfcheck.mjs",
    "tools/ship/supersededFlag-selfcheck.mjs",
    "tools/ship/unattendedHold-selfcheck.mjs",
    "tools/ship/updatePause-selfcheck.mjs",
    "tools/ship/wasmSupport-selfcheck.mjs",
    "tools/ship/wiringClaims-selfcheck.mjs",
]);

// What the audit cannot supply, said explicitly rather than by a typed line standing in for a reading.
export const UNVERIFIED_LINE = Object.freeze({
    // v4424 -- measured on the serial run of all 63 of UNCONFIRMED_SLOW; the audit's cap does not reach them.
    "tools/ship/doorKinds-selfcheck.mjs":
        "!! EVERY MEMBER IS EXPLAINED: a door, a declared refusal, or named as owed -- UNEXPLAINED: " +
        "tools/ship/verifyLicenceTexts.mjs, tools/ship/wgslDeviceLimits.mjs; and !! NO PROSE DOOR STANDS " +
        "UNEXPLAINED -- orreryBake.mjs. 151.0 s, 2 of 20 failed.",
    "tools/ship/graveyard-selfcheck.mjs":
        "!! ORPHANED UTILITIES HAVE NOT INCREASED -- 145 now vs 93 recorded. These export functions and " +
        "NOTHING calls them -- wire it, or delete it. 75.4 s, 1 of 11 failed.",
    "tools/ship/orphanDisposition-selfcheck.mjs":
        "!! 'imported by a gate named for something else' holds for EVERY member -- 24 of 26; !! ...so it " +
        "discriminates NOTHING and is not used as a signal. 80.1 s, 2 of 24 failed.",
    "tools/ship/shaderRefs-selfcheck.mjs":
        "379,838 ms: the audit's cap ends the run before it prints a failing line. NOT a stale reading -- an " +
        "absent one. Measuring it needs a cap raised past six minutes, which is a decision about the audit.",
});

const auditRow = (gate) => ((REGISTER_AUDIT && REGISTER_AUDIT.rows) || []).find((r) => r.gate === gate) || null;

export const RED_AT_V4279 = Object.freeze(RED_AT_V4279_GATES.map((gate) => Object.freeze({
    gate,
    get ms() { const r = auditRow(gate); return r ? r.ms : null; },
    get fails() {
        const r = auditRow(gate);
        if (r && r.first) return r.first;
        return UNVERIFIED_LINE[gate] || null;
    },
    /** true when the line above is the audit's own; false when it is the admission from UNVERIFIED_LINE. */
    get derived() { const r = auditRow(gate); return !!(r && r.first); },
})));

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
    { gate: "tools/ship/budgetEvidence-selfcheck.mjs", round: "v4426",
      why: "RED SINCE v4279, ASKING FOR THREE MEASUREMENTS NOBODY HAD TAKEN. Its own register line said SIXTY-" +
           "SEVEN gates carried no evidence about their own runtime; run today the figure was THREE, so the " +
           "stored reading had drifted by 22x while the entry sat there -- and the gate that watches for that " +
           "reported it as `drifted` and PASSED, because a count is not a verdict. tools/roundhouse/" +
           "modeDistinct, tools/ship/divineEye and tools/ship/traderPolicy were timed with date +%s%N around a " +
           "real run: 379,689 ms, 68,395 ms and 38,648 ms, ALL THREE EXIT 0. None was slow because it was " +
           "broken; they were slow, therefore never swept, and never swept is why they had no evidence -- the " +
           "population was a property of the RECORD, which is the finding budgetEvidence exists to make and " +
           "which it was making about itself for 147 rounds." },
    { gate: "tools/ship/winPathGuard-selfcheck.mjs", round: "v4423",
      why: "RED SINCE v4279 AND REPAIRED BY DOING THE WORK, which is what a register entry is for and what none " +
           "of this session's other twenty-six have had. 28 occurrences of `new URL(<x>).pathname` across 16 " +
           "files, all replaced with fileURLToPath, which is the idiom this gate's own header names and which " +
           "the gate file itself has used since it was written. THE FIX IS NOT A WIDENING: no pattern was " +
           "relaxed, no file exempted, and the gate's assertion is the one it always made. v4404 found a " +
           "SETTLED claim resting on this red -- 'the selfchecks and the server survive Windows path semantics' " +
           "-- and marked it broken with the measurement; the claim is re-stated here with the gate actually " +
           "passing, which is the only honest way a broken prediction comes back. AND 16 OF THE 22 HITS HAD " +
           "BEEN INVISIBLE: the report showed hits.slice(0, 6), so a reader saw six files and the other ten " +
           "were reachable only by editing the gate. A list nobody can see is a list nobody acts on, which is " +
           "v4379's finding and is the best available explanation for 144 rounds of standing still." },
    { gate: "tools/ship/mutationTable-selfcheck.mjs", round: "v4386",
      why: "RED FROM v4279 TO v4385 OVER A MUTATION THAT HAD BEEN MUTATING NOTHING SINCE v4162 -- 223 versions " +
           "dead, 106 of them with this gate naming it. tools/mutate/mutate.mjs's table looks for each " +
           "mutation's find-string VERBATIM, and v4162 rewrote physics/sph/sph.js's shadow amplitude from " +
           "Math.pow(o.h, 3) to (h * h * h): same arithmetic, different text, so the mutation applied nothing. " +
           "The harness was honest about it -- a STALE branch excludes a dead mutation from the score -- and " +
           "the gate was right; what failed is that nothing read either. Meanwhile tools/mutate/scan.mjs " +
           "opened by stating a perfect score for the ten as a bare literal: nine experiments and one " +
           "abstention, reported as ten results. Fixed at the cause (the find-string), then MEASURED -- the " +
           "full suite was run and scores 10/10, the restored mutation CAUGHT on its first real run, so no " +
           "hole in the net was ever hidden and only the measurement of it was broken. The number now lives " +
           "in tools/mutate/mutationScore.mjs with a table fingerprint and the commit it was taken at, and " +
           "tools/ship/mutationScore-selfcheck.mjs asks git whether any file the score is ABOUT has moved " +
           "since. That is the check that would have fired at v4162." },
    { gate: "tools/ship/shaderCensus-selfcheck.mjs", round: "v4383",
      why: "FILED AT 14 AT v4380 AGAINST A LINE THAT SAID 4, AND THE JUDGEMENT IT DEFERRED CAME BACK NO. The gate " +
           "has held since v3274 that a hand-written shader pair is cheaper than an IR while few files carry both " +
           "languages, and that at TWENTY the arithmetic inverts. The count was measured by testing RAW SOURCE for " +
           "six tokens, two of which -- GLSL's storage qualifiers -- are ordinary English: render/bloomFused.mjs " +
           "was a shader pair on the sentence 'attribute any difference to the SAMPLING'. Four of the fourteen " +
           "carry no GLSL, seventy-two of the hundred and sixty-nine called GLSL-only carry no shader at all " +
           "(main.js and brain/brain.js among them), and TWO REAL GLSL PASSES WERE MISSING because three.js " +
           "prepends their version directive. The census now delegates to render/backendParity.mjs classify(), " +
           "which has read this tree's shader languages correctly since v4269 one directory over. 10 both, 23 " +
           "WGSL-only, 99 GLSL-only; the trigger is twenty and has not fired. Third standing red in this " +
           "neighbourhood to turn out to be unopened mail, after vendoredLicences at v4371 and rigJobs at v4379 " +
           "-- and the first whose recorded LINE was the defect rather than its symptom." },
    { gate: "tools/ship/rigJobs-selfcheck.mjs", round: "v4379",
      why: "RED SINCE v4129 AND IT WAS A MESSAGE, NOT A FACT ABOUT A DELETED PANEL. The failing line was 'the page " +
           "renders title, why and how for each', and it named rig.html -- from which the rig-only panel was removed " +
           "at v4129, at Keith's request. Filed here, it read as a check outliving its surface. Read instead, it said " +
           "something else: ai-bridge/rigRunner.js RIG_ONLY was still SERVED on /rig/list and rendered by no page at " +
           "all, fifteen entries of recorded reasoning about what each chore unblocks, unreachable for 250 rounds -- " +
           "which is the exact failure that gate's own header exists to name. Fixed three ways: server.html carries " +
           "the panel now (the front door, not the page he cleared), the check asks whether ANY page renders the list " +
           "rather than naming one, and it LOADS the page against a stub bridge instead of scanning its source, " +
           "because two sabotages of the renderer both cost 0 red against a scan. The second standing red in this " +
           "neighbourhood to turn out to be unopened mail, after vendoredLicences at v4371." },
    { gate: "tools/ship/gateBudget-selfcheck.mjs", round: "v4329 -- pruned here; the REPAIR was v4304's",
      why: "NOT FIXED BY v4329; FOUND STALE BY IT. The failing line this census recorded is 'the recorded " +
           "slowest gate is still the slowest one anybody has SEEN', and v4304 repaired exactly that by raising " +
           "SLOWEST_GENERAL to the rig's own opticsBind figure (109,899 ms), where it still stands. The gate has " +
           "been green since and the red entry outlived it. *** A CENSUS THAT IS ONLY APPENDED TO BECOMES A LIST " +
           "OF GRIEVANCES *** -- this file's own words about the register it replaced, now true of itself. " +
           "The round recorded above is the one that PRUNED the entry, not the one that fixed the gate, and " +
           "the distinction is load-bearing: RECHECK_V4313.nowGreenGates derives itself from this list by " +
           "excluding later rounds, so an entry stamped with its repair round would have been swept into a " +
           "record of a moment it was never part of -- the exact defect the comment above that field describes." },
    { gate: "tools/ship/orrery-selfcheck.mjs", round: "v4329",
      why: "It asserted that box3d and htmx have no licence provenance, which was true when written and is not " +
           "now. The gate reads the live SCAN rather than the bake, so it saw the repair immediately and went " +
           "red saying so, while orrery.html -- reading the forty-five-round-old bake -- kept printing the " +
           "opposite. Fixed by dropping UNPAPERED_BASELINE to 0, inverting the two claims about #61's pair, and " +
           "making the comparison EQUALITY rather than `<=` so the next unlicensed body cannot slip under it." },
    { gate: "tools/ship/orrerySeed-selfcheck.mjs", round: "v4329",
      why: "ONE STALE GENERATED FILE, TWO RED GATES -- the launchIndex/shipRitual shape below, a second time. " +
           "orrery.json was baked at v4189 and never again, so both gates spent forty-five rounds saying 'run " +
           "orreryBake.mjs --write' and nobody did. Fixed by running it. What the refresh then showed is the " +
           "part worth keeping: a fifteenth dependency (vendor/three-webgpu) the orrery had never drawn, and " +
           "box3d and htmx PAPERED, so the unpapered ratchet went 2 -> 0 while the page still printed 2." },
    { gate: "tools/ship/orreryView-selfcheck.mjs", round: "v4329",
      why: "THE SAME STALE ARTEFACT, SECOND READER, and its four red lines named the drift precisely (bake 12 " +
           "captured against the scan's 15, and box3d/htmx wrongly unpapered). Re-baking cost four OTHER gates " +
           "their green -- every one of them a number typed against a quantity derived from the body count, " +
           "held true by a snapshot that had stopped moving. All four were fixed by deriving." },
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
/*
 * v4408 -- *** WHAT THE FIRST ROTATION FOUND WHEN THE DOOR WAS OPENED. ***
 *
 * A NEW LIST AND NOT AN APPEND TO RED_AT_V4279, for the reason MOMENTS states below in its own words: a record
 * whose fields are snapshots of different instants has to say which instant. These gates were not red at v4279;
 * nobody knows when they went red, because until v4408 nothing at ship time ran them. They spent that time in
 * the over-budget population -- 502 of 1,439 gates -- which the quick sweep skips and which the file's single
 * `captured` date presented as freshly measured.
 *
 * THEY ARE NOT REGISTERED TO EXCUSE THEM. Two are open items in docs/EXPLAIN-ITSELF.md with the work named, and
 * every entry says what is actually failing so the next round can pick one up. Registering a red the round did
 * not cause is what the register is for; widening it to hide one the round DID cause is the thing forbidden.
 */
// v4430 -- the same inversion as RED_AT_V4279 above: the NAMES are the claim, the reading comes from the run.
// This list held the file's last typed `fails:` literal, with no recorded run behind it at all.
export const RED_AT_V4408_GATES = Object.freeze([
    "tools/ship/box3dFilter-selfcheck.mjs",
]);

const WHY_V4408 = Object.freeze({
    "tools/ship/box3dFilter-selfcheck.mjs":
        "TWO BUILD SCRIPTS DISAGREE ABOUT THE EXPORT SET, and nothing at ship time has ever said so. Not " +
               "this round's and not this round's to fix -- it is a WASM build question that needs the rig. Named " +
               "here with its reading so the next round can start from a number rather than a rumour.",
});

export const RED_AT_V4408 = Object.freeze(RED_AT_V4408_GATES.map((gate) => Object.freeze({
    gate,
    why: WHY_V4408[gate] || null,
    get ms() { const r = auditRow(gate); return r ? r.ms : null; },
    get fails() { const r = auditRow(gate); return r && r.first ? r.first : (UNVERIFIED_LINE[gate] || null); },
    get derived() { const r = auditRow(gate); return !!(r && r.first); },
})));

// *** ONE OF THE TWO IS ALREADY GONE, AND THE REPAIR BELONGS TO ITS OWN MOMENT. ***
// FIXED_SINCE_V4279 is the record of what the v4279 REGISTER held; orreryEjecta-selfcheck was never in it, so
// filing the repair there inflated registerAtSweep() by one and took three arithmetic rows in
// gateSweep-selfcheck red within the minute. A list is a claim about an instant, and a repair to a different
// instant needs a different list -- which is the same rule RED_AT_V4408 was created under one round ago.
// ================================================================================================
// v4424 -- THREE MORE, OUT OF THE SAME BUCKET, FOUND BY MEASURING ALL SIXTY-THREE
// ================================================================================================
//
// *** UNCONFIRMED_SLOW WAS NOT ONLY HIDING SUCCESSES. *** All 63 were run one at a time at a 180 s cap
// (tools/ship/slowCensus.mjs holds the protocol and every verdict): 39 GREEN, 21 still unfinished, THREE RED.
// They had been red and exempt from the ship gate for a hundred and forty-five rounds, because
// quickSweep.redRegister() waves the whole bucket through on the grounds that nobody measured it.
//
// *** AND THE FIRST FORTY-THREE MEASURED WERE ALL GREEN, WHICH IS WHY THIS IS A RED SET AND NOT A REASSURANCE.
// *** Partway through, the honest summary was "zero red -- the bucket has been hiding successes". Finishing the
// measurement refuted it: an unmeasured gate is not a green one, however many of its neighbours turn out green.
// Same shape as referenceKind at v4279, one bucket later.
//
// Written in v4430's idiom: THE NAMES ARE THE CLAIM and the reading comes from the audit run. The lines below
// are what each gate printed on the v4424 serial run, kept in UNVERIFIED_LINE until the audit reaches them --
// these three are over the audit's own budget, which is the reason they were unmeasured in the first place.
export const RED_AT_V4424_GATES = Object.freeze([
    "tools/ship/doorKinds-selfcheck.mjs",
    "tools/ship/graveyard-selfcheck.mjs",
    "tools/ship/orphanDisposition-selfcheck.mjs",
]);

const WHY_V4424 = Object.freeze({
    "tools/ship/doorKinds-selfcheck.mjs":
        "a partition over gate-only modules with three members in no part. NOT a timing failure: it exits 1 in " +
        "151 s alone on an idle box, and would exit 1 at any cap that let it finish.",
    "tools/ship/graveyard-selfcheck.mjs":
        "*** A RATCHET THIS SESSION HAS BEEN BREAKING WHILE SHIPPING ALL GREEN OVER IT. *** Baseline 93 set at " +
        "v4153; the count is 145. Twenty-seven of those were first committed in September, SIXTEEN on the day " +
        "of v4408-v4426 -- fresnelWgsl, polyBrush, paintGenerators, paintTransforms, paintFields and the five " +
        "microfacet WGSL modules among them, every one imported only by its own gate. The instrument that " +
        "would have said so was in this bucket.",
    "tools/ship/orphanDisposition-selfcheck.mjs":
        "its own section 4 is titled 'A QUESTION WHOSE ANSWER IS STRUCTURALLY GUARANTEED, DRIVEN' and it is now " +
        "24 of 26 rather than 26 of 26 -- the guarantee has two exceptions and the gate says so. Filed, not " +
        "repaired: which way that check should read is the owning round's call.",
});

export const RED_AT_V4424 = Object.freeze(RED_AT_V4424_GATES.map((gate) => Object.freeze({
    gate,
    why: WHY_V4424[gate] || null,
    get ms() { const r = auditRow(gate); return r ? r.ms : null; },
    get fails() { const r = auditRow(gate); return r && r.first ? r.first : (UNVERIFIED_LINE[gate] || null); },
    get derived() { const r = auditRow(gate); return !!(r && r.first); },
})));

export const FIXED_SINCE_V4408 = Object.freeze([
    { gate: "tools/ship/orreryEjecta-selfcheck.mjs", round: "v4410",
      why: "REGISTERED AT v4408 AND REPAIRED BY RE-DERIVING, NOT BY RAISING A NUMBER. It compared the fleet " +
           "against a frozen count and the count had drifted -- but the two readings were not even taken by " +
           "the same rule, so raising the baseline would have moved the gate from one wrong number to another. " +
           "tools/ship/importPosition.mjs asks the question POSITIONALLY: is the quoted string the path, or a " +
           "sentence containing one? The old substring rule was wrong in BOTH directions -- 12 of its 138 " +
           "entries are records, and it never saw 17 files that reach a body through path.join. The baseline " +
           "is now a FROZEN LIST OF NAMES with the counts derived from it, so the next arrival is reported by " +
           "name; that ratchet caught this round's own new gate joining box3d's fleet within the hour." },
]);

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
