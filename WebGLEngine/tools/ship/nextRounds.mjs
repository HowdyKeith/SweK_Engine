// WebGLEngine/tools/ship/nextRounds.mjs — v3340
// ---------------------------------------------------------------------------------------------------------------
// THE STANDING LIST OF WHAT IS DEFERRED AND WHY — because a backlog that lives in a conversation is not a backlog.
//
// v3314 audited the tree's fifteen "its own round" notes and found that SEVEN WERE ALREADY SETTLED, FOUR WERE
// NEVER DEFERRALS AT ALL, and one was a refusal recorded as an omission. The failure mode is not forgetting to
// write things down; it is writing them down in prose that nothing ever re-reads, so a finished item keeps
// advertising itself as open and the next reader spends a round rediscovering that.
//
// So each entry here carries a BLOCKER rather than a priority, and the blocker is the thing that can be checked.
// "Needs a rig" is a fact about the world. "High priority" is a fact about somebody's mood last Tuesday.
//
// THE THREE BLOCKER KINDS, and only the first is anyone's to schedule:
//   OPEN      -- doable in the sandbox now. Nothing is stopping it but the work.
//   HARDWARE  -- needs a GPU, a browser, a second machine, or a WASM build that does not exist here.
//   UPSTREAM  -- doable, but worth nothing until something else lands first, and the entry says which.
// ---------------------------------------------------------------------------------------------------------------
"use strict";

import { pathToFileURL } from "node:url";
export const NEXT_ROUNDS = [
    { id: "population-autopin", state: "CLOSED", note: "DONE at v3553. populationCensus.mjs records the population at ship time and diffs it, and gateReach-selfcheck now reads that record instead of a typed number. The verdicts distinguish routine growth from the thing that should stop a ship: GREW names every addition and reconciles the totals; REMOVALS is treated harder than a gain, because adding physics is routine and physics quietly disappearing is how a deletion ships unnoticed, and the old pin fired identically for both. NO-RECORD is its own verdict rather than a pass. And the gate does NOT rewrite the record it compares against -- writing is a ship step, comparing is the gate, deliberately different programs, because a check that repairs its own expectation can never fail twice." },
    { id: "flip3d-gate", state: "CLOSED", note: "DONE at v3427. Free fall to 1.4e-7, 9216 particles conserved exactly, divergence down 2.1e+4 and -- unlike 2D -- MONOTONICALLY. Two differences from the 2D sibling recorded: the monotone convergence, and that step() is synchronous here while 2D's is async, despite the header calling the pipeline identical." },
    { id: "beer-lambert", state: "CLOSED", note: "DONE at v3426. The exact half holds to 5.6e-17 and optical depths add bit-exactly, which is what makes a line integral the right object for CT. The failing half is measured: with a real spectrum the effective attenuation falls 4.4x with depth and a uniform cylinder cups by 30%. The cost to ct.js is now a number -- 12.0562 against a true line integral of 35.3854 for the same slab." },
    // ---- *** v4479 -- THE FIRST ENTRIES ADDED SINCE THIS FILE WAS WRITTEN AT v3340, 925 VERSIONS AGO. ***
    // Measured by tools/ship/deferralCensus.mjs: the newest version any entry below named was v3553, against
    // an ENGINE_VERSION of v4478, and NOT ONE of the tree's 118 undecided prose deferrals was named by any
    // entry here -- reach 0 of 118. This file's own header states the failure mode it then suffered: "writing
    // them down in prose that nothing ever re-reads, so a finished item keeps advertising itself as open."
    // The design was never wrong; nothing enumerated the prose, so nothing ever prompted an entry. That half
    // exists now, and these are what it turned up that this session can vouch for first-hand.
    {
        id: "c4-is-a-conditioning-test",
        blocker: "OPEN",
        what: "corroborateFully's criterion 4 is named PORTABILITY and measures CONDITIONING. Rename it, or give it the second machine it claims.",
        how: "c4 builds the device, builds it again under withPerturbedLibm, diffs the two and grades `relMove <= tol` -- all in one process. That is a real and useful number (how much would this quantity move IF a libm differed) and it is not the question the criterion's name asks (does a second machine reproduce the bits). v4484 spent the measurement where it is not circular -- gradeSubmission's WITHIN/BEYOND_PREDICTION axis -- and deliberately did NOT rename c4, because renaming a criterion touches every corroboration record and every frozen verdict in the lab.",
        why: "v4480 wrote 'earn a portability tolerance for each of the seven refinement knobs' as the next round. v4484 attempted it and found the task cannot be done as specified: a tolerance taken from relMove is compared against the number it came from, so the pass stops being contingent and the evidence string does not change. THE TOLERANCE IS NOT MISSING, THE CHECK IS MISNAMED. Closing this means either renaming c4 to what it measures, or wiring it to the submission ledger so it grades a real second machine -- and that second option is blocked on the same thing everything else here is: nothing has submitted.",
    },
    {
        id: "libm-sensitivity-runtime",
        blocker: "OPEN",
        what: "libmSensitivity-selfcheck states ~150s and does not finish in 31 minutes, and the timing record holds a kill rather than a runtime.",
        how: "Its header reads \"~150s: three builds of the whole lab\". Run on an idle box at v4487 it passed two checks and then sat in libmSensitivitySweep for 31 minutes without returning. tools/ship/sweep-timings.json records 20,022 ms for it -- the quick sweep's cap, so that number is a KILL and not a measurement, which is the shape v4485 found in the register audit. Closing this means timing it to completion once, or giving the sweep a per-mode child-process budget the way wideSweep.mjs got at v4486.",
        why: "v4487 added five checks to the end of that file and could not see them run in-gate; they were driven directly instead and all five pass. A gate nobody can afford to run is a gate whose new checks are unverified in place, and a stated runtime twelve times under the truth is exactly what statedRuntime-selfcheck exists to catch -- it cannot, because a gate that never returns leaves no reading to compare.",
    },
    {
        id: "act-on-the-floor",
        blocker: "OPEN",
        what: "Two observables carry NO significant digit under a one-ulp libm shift and are still in the corroboration population with bounds that grade nothing.",
        how: "v4487 built libmSensitivity.significantDigits and measured every eligible observable: quantum.bands.edgeRhsWorst and quantum.stencil.edgeRhsWorst keep 0.24 digits (base 1.554e-15, moved 8.882e-16). Their v4484 predicted bounds are 0.5714, which would admit a second machine reporting a 57% different value as WITHIN_PREDICTION. Acting means excluding an AT_THE_FLOOR observable from corroboration -- which changes what `keyless` means and moves corroborationCensus's headline population, exactly the blast radius v4486 declined to take on a name rule.",
        why: "v4486 proposed catching these by widening KEYED_RE's vocabulary and v4487 measured that it would have been wrong in both directions -- reclassifying 11 well-resolved quantities (insideGapWorst keeps 15.68 digits and is named identically) while catching 0 of the 2 at the floor. The criterion now exists and is gated; what does not exist is the decision to let it change the population. That is a judgement about what the lab corroborates, not a repair.",
    },
    {
        id: "optics-converge-cost",
        blocker: "OPEN",
        what: "optics.converge is the only mode in the lab the corroboration battery cannot measure, and it is now the only gap in a complete sweep.",
        how: "v4485 measured it at 12m38s of CPU without returning; v4486 killed it at a 60s cap and swept the other 38 modes in 158.9s total. Its adaptive quadrature needs a step or evaluation budget of its own -- the mode itself has to become bounded, because an external cap can only ever report it as absent.",
        why: "One mode out of 39, and the sweep is otherwise complete for the first time. It is worth naming rather than living with, because an OVER CAP row is an absent reading and this tree separates those from measurements everywhere else.",
    },
    {
        id: "rig-only-reds",
        blocker: "OPEN",
        what: "Seven gates are GREEN in this sandbox and RED on Keith's Windows rig, and FOUR of them pass every check they print before the teardown decides the verdict.",
        how: "contactOverlay, ai-bridge/tools/range and localModelResolve each print their own all-pass line and then abort with `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), file src\\win\\async.c, line 94`, exit 3221226505 -- a libuv double-close at teardown, so the EXIT CODE decides a verdict the checks did not. serverShutdown-selfcheck, the module built for exactly this, is itself red there: its budget drain returns in 78ms against 300ms and names nothing that outlasted it, against 304ms and a named ChildProcess here. The other two are ntfsMounter (its shell-quoting sabotage) and stepperMeter (a bit-identity hash over shmRun, which recomputes IDENTICAL here). rigJobs is an eighth and is environmental: no headless shell at the path it names, which exists here. AND A FOURTH GATE FAILS THE SAME WAY IN A DIFFERENT MECHANISM: sharpBridge-selfcheck passes every check in all six sections and then dies at its own cleanup with `EPERM, Permission denied` from rmSync on a temp directory it made -- a spawned pip still holding a handle, which Windows refuses to unlink and POSIX does not. FOUR GATES, ONE SHAPE: THE CHECKS ALL PASS AND THE PROCESS DECIDES OTHERWISE ON ITS WAY OUT. ONE CONCRETE DIFFERENCE IS ON THE TABLE AND IS THE FIRST THING TO TRY: the rig runs node v24.17.0 and this sandbox runs v22.22.2, so the libuv in question is not the same libuv, and the rig tree is SweK_Engine_v4477 rather than the branch head. Neither is proof and both are checkable.",
        why: "Needs the rig. Every one of these was measured green here at v4482 before being written down, so the disagreement is established rather than assumed -- but nothing in this tree can reproduce a Windows libuv teardown, and guessing at a fix for a crash this box cannot raise is the shape v4478 already paid for. THE STRUCTURAL FINDING IS FREE AND IS THE POINT: redCensus calls its list a claim about a MOMENT and it is also a claim about a BOX, and a gate whose checks all pass can still be recorded as failing because a verdict is scraped from an exit status.",
    },
    {
        id: "grown-ratchets",
        blocker: "OPEN",
        what: "Seven ratchets in the standing red set have GROWN past their baselines and are reporting real debt nobody has priced.",
        how: "physicsReach 14 doorless graded modules against a baseline of 7 (nine of the fourteen are physics/render/*Wgsl.mjs, this session's own path-tracer work); definitionGates 44 unmentioned physics definitions and 289 tree-wide, both risen; registerResidue 45 pages linked from server.html but neither placed nor excused, against a ceiling of 41 (and that gate's OTHER half correctly passes, because a ratchet with slack holds nothing); boundaryLint 91 boundary tells against a baseline of 88, the three NEW ones all KILL_NOT_VERIFIED in ai-bridge/vbaArchiveBridge.js, tools/ship/quickSweep.mjs and tools/ship/slowCensus.mjs, plus four UNCHECKED_ERROR_BODY sites in main.js, song-globe.html and brainTsl-page.js; wiringClaims a THIRD contrast line, which is exactly what its own row predicted would show up; statedRuntime 4 NEW gate headers drifted from their measured runtime; pageReflow 4 layout-reads-after-a-DOM-write inside a loop (crtToggle:58, domToTexture:137 twice, textMorph:152).",
        why: "Each is its own round and each wants a decision rather than a scripted pass -- moving a baseline is naming a debt as acceptable, which is Keith's call, and the v3202 shape that deleted 61 live modules is what a one-pass fix across four unrelated subjects looks like. They are separated from the ARRANGEMENT-pinned reds v4482 repaired precisely because these four are the gates being RIGHT.",
    },
    {
        id: "refinement-knob-per-mode",
        blocker: "OPEN",
        what: "The canonical refinement table is ONE MODE PER DEVICE, and that shape cost optics.slit its convergence grading at v4483.",
        how: "REFINEMENT_KNOBS[device] carries a single {mode, param, why, values}. optics already holds airy, so slit -- which genuinely refines, slitFirstMinErrFrac 5.04e-5 -> 1.25e-5 -> 4.00e-6 over nSamples 512/1024/2048 -- has nowhere to live. Widening the entry to a list of knobs per device touches runRefinement, refinementSweep, refinementLines, the census's `refinable` flag and eleven importers, and every one of them currently assumes `knob.mode` is a string.",
        why: "v4483 deleted the census's second table and named this as the one thing that migration lost. It is a SHAPE LIMIT and not a judgement about slit -- the measurement exists and is quoted above -- so the loss is knowingly taken rather than argued for, and this entry is what stops it being forgotten. ct.fan is in the same position for the same reason.",
    },
    {
        id: "zoom-blur-wiring",
        blocker: "OPEN",
        what: "Wire render/zoomBlur.mjs's generated GLSL into bloomPass.js's post chain as a real pass.",
        how: "A framebuffer, three uniforms (uScene, uCentre, uStrength) and a slot in the composite. The shader is already generated and its summation order is graded; what is missing is the plumbing.",
        why: "v4478 built and graded the kernel and deliberately did not wire it: no WebGL context has compiled the GLSL here, because this box has headless WebGPU and no headless GL. The claim a wiring round rests on is already measured -- strength 0 is a BIT-EXACT identity on real hardware, so the pass cannot move a pixel until somebody turns it on.",
    },
    {
        id: "zero-range-second-control",
        blocker: "OPEN",
        what: "Plant a second positive control for the zero-range sweep, in a device that is not splat.",
        how: "Find an observable whose exact zero is derivable from the arithmetic rather than observed, the way splat.integral.isoRollDeviation's is, and drive zeroRangeSweep over it in both directions. The prose deferral this entry answers is in tools/roundhouse/zeroControl-selfcheck.mjs -- an entry NAMES THE FILE CARRYING THE NOTE, which is the link deferralCensus.backlogReach() measures and the reason it read 0 of 118 before this round.",
        why: "v4477 gave the sweep its first control since v3313 and said plainly what it does not establish: one control, one device, one knob. The sweep's detection power over the other 85 device/modes is still unproven.",
    },
    {
        id: "deferral-adjudication",
        blocker: "OPEN",
        what: "Adjudicate the 118 prose deferrals that no instrument has ever decided.",
        how: "tools/ship/deferralCensus.mjs enumerates them. Deciding one means reading the file and checking the claim against an EXPORT rather than a sentence; a settled one gets a `SETTLED at vNNNN` marker on the line adjacent to the claim, which is the adjacency the census reads and the one a person gets for free.",
        why: "v3313 audited four and found three settled; v3314 audited fifteen and found seven settled and four that were never deferrals. v4479 audited two files and found THREE stale notes, two of them in one paragraph, settled within four rounds of being written and still advertising themselves 66 versions later. The rate at which these go stale is high and nothing has been watching.",
    },
    {
        id: "release-publish-backlog",
        blocker: "HARDWARE",
        what: "Publish the unreleased versions so the fleet stops running v4460.",
        how: "On the rig: GitHub panel -> Releases, step 3 (Clone -> verify) then step 4 (Publish the verified clone), per the ship skill's step 7. The zip is not byte-reproducible, so it has to be the rig.",
        why: "releaseLedger reads 11 against a budget of 3 and the fleet is 18 versions behind. It is the one gate blocking v4478 from main, and it is right to: the rule is publish before shipping again. Nothing in the sandbox can clear it -- publishing from here would replace the artifact the rig built with different bytes for the same commit.",
    },
    {
        id: "browser-screenshot-floor",
        blocker: "HARDWARE",
        what: "Measure the perceptual floor for browser screenshots, so render-QA's SSIM/pHash/IoU signals can gate instead of merely being recorded.",
        how: "On the rig: run render-qa twice with no code change between runs. The spread between two identical runs IS the floor -- antialiasing, font hinting, compositor timing. Two commands.",
        why: "v3339 wired the signals into all 54 pages as RECORDED, NOT GATING, because the headless floor is exactly zero (Jolt is deterministic) and a browser is not. Gating on an unmeasured number is the failure the whole perceptual line of work exists to avoid.",
    },
    {
        id: "cross-backend-envelope",
        blocker: "HARDWARE",
        what: "Record the box3d-vs-Jolt drift, pixel and perceptual envelope.",
        how: "On a rig where box3d's WASM builds: `node physics/backend-qa-check.mjs --update`. One command.",
        why: "backend-baseline.json has carried \"pairs\": {} since 2026-07-13 because box3d has never loaded wherever --update was run. v3338 made a missing envelope fail as UNMEASURED instead of passing silently, so the first run where box3d loads goes RED and names the command rather than measuring the pair and discarding it.",
    },
    {
        id: "device-verdicts",
        blocker: "HARDWARE",
        what: "Four pages owe a report from real hardware: hmc-bench, ising-bench, magmap-bench, consistency-fleet.",
        how: "Open each page on a machine with a GPU and press submit. They are parked in Arriving Pages with the reason attached, and `node tools/render-qa/deviceOwed.mjs` prints who still owes what.",
        why: "Received kinds: NONE. The ising kernel in particular is graded at ZERO tolerance -- bit-exact or rejected -- so there is no partial credit and no way to infer the answer from here.",
    },
    {
        id: "sys-lag-reading",
        blocker: "HARDWARE",
        what: "One `GET /sys/lag` on Keith's rig after a few minutes of uptime.",
        how: "curl it. The response names each blocking callback by its REGISTRATION site, not its fire site.",
        why: "v3317 re-read the v3278 samples and found the duty cycle FALLS to ~22% and plateaus rather than growing without bound -- so there are two problems, a startup burst and a steady periodic cost, and only a reading tells us which callback owns the second.",
    },
    {
        id: "image-pair-second-side",
        blocker: "UPSTREAM",
        what: "A second, independent renderer for the image-based consistency pair.",
        how: "The render-qa Playwright rig can capture a real render; wiring it to frame the same scene as the headless rasteriser would give two mechanisms.",
        why: "physics/imagePair.mjs declares the pair INCOMPLETE because only one side exists. A pair assembled from one mechanism twice is reproducibility wearing the costume of corroboration, and the board's admission rule does not bend for a pair that would be convenient.",
        upstream: "browser-screenshot-floor -- without a floor there is nothing to gate the pair against",
    },
    {
        id: "ensemble-weighting",
        blocker: "UPSTREAM",
        what: "Weight the soft signals rather than averaging them equally.",
        how: "Fit weights against cases where the right answer is known.",
        why: "Deferred twice for the same reason: there was nothing to tune against. v3340 changed that -- the CT sweep gives labelled degradation against exact ground truth, and it already showed edge overlap is worth far more than pHash there (0.223 vs 4 bits of 63 at 8 angles). An equal average is currently wrong in a measurable direction.",
        upstream: "reconQuality gives the first labelled data; more would come from the browser floor",
    },
    { id: "fbp-gain-normalisation", state: "CLOSED", note: "ANSWERED NO at v3378, and the measurement is in reconQuality.mjs. The gain is NOT a filter constant: it runs 0.4319 to 0.9340 across fixtures, nearly invariant in ANGLE COUNT but tracking N and nDet -- and gain*nDet/N collapses to 0.9456 with a spread of 0.0185. IT IS A SAMPLING RATIO. Correcting 0.649 in the filter would be right at N=96/nDet=140, this gate's own fixture, and wrong everywhere else." },
];

export const byBlocker = (kind) => NEXT_ROUNDS.filter((r) => r.blocker === kind);

export function lines() {
    // *** v3941 -- IT NAMES ITSELF, BECAUSE A REPORT WITH NO NAME ON IT IS UNATTRIBUTABLE THE MOMENT TWO OF
    // THEM SHARE A TERMINAL. *** That is toolFrontDoor's rule, and the reason this tool could not be added to
    // the REPORTING registry until now: it printed a bare "UPSTREAM (2):" and nothing said whose it was.
    const out = ["[nextRounds] what the next rounds are, and what is blocking each"];
    for (const kind of ["OPEN", "UPSTREAM", "HARDWARE"]) {
        const rows = byBlocker(kind);
        if (!rows.length) continue;
        out.push(`${kind} (${rows.length}):`);
        for (const r of rows) out.push(`  ${r.id} -- ${r.what}`);
    }
    out.push("");
    out.push("A blocker is a fact about the world. A priority is a fact about somebody's mood last Tuesday.");
    return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) for (const l of lines()) console.log(l);
