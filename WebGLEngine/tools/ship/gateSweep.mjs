// FILE: tools/ship/gateSweep.mjs -- v4297
//
// *** THE SWEEP HAS ALWAYS BEEN A SHELL INCANTATION, AND ITS SECOND PHASE IS THE ONE THAT CAN BE SKIPPED. ***
//
// redCensus.METHOD writes the procedure down in prose: "phase 1: xargs -P 8 over every gate file... phase 2:
// re-run every candidate ONE AT A TIME. Phase 2 is what makes the number real." That sentence is correct and
// it is also unenforceable. Nothing in the tree can tell a number that came out of phase 2 from a number that
// came out of phase 1 and was typed into a field called `confirmedSerially`. The v4279 sweep did do both
// phases -- and the difference was SEVEN gates out of forty-six, 15% of the answer.
//
// This file makes the distinction structural instead of clerical. A phase-1 result is a CANDIDATE and carries
// no verdict. A candidate becomes RED only by being handed a serial re-run. `finalize()` refuses to produce a
// red set at all while any candidate is missing one, so the shape of the data cannot express the mistake.
//
// ---- *** AND THE RE-CHECK RECORDED A FIELD ITS OWN METHOD COULD NOT MEASURE *** ------------------------------
//
// v4296 shipped redCensus.RECHECK with `regressed: 0` beside `checked: 37`. Those two fields cannot both be
// about the same population. The 37 gates it re-ran were the 37 already recorded RED; a regression is by
// definition a gate that was GREEN and is now red, so not one of them was eligible. The method re-ran 37 of
// 1,366 gates and reported a zero over the other 1,329 it never executed.
//
// The prose in the same round said so outright -- "whether any gate GREEN at v4279 has since gone red needs
// the full sweep this file does not attempt -- that question's honest state is UNKNOWN rather than fine." So
// the caveat and the field disagreed with each other inside one commit, and the field is the half a reader
// greps. `coversRegressions()` below is the rule that would have caught it: a method can report on
// regressions only if the gates it ran include gates that were not already red.
//
// Same family as v4293's ROUND_TRIPS (one object, two draw spans) and v4295's MOMENTS (one record, two
// instants). A frozen record is read field by field, and every field carries the authority of the whole
// object whether or not it earned it.
"use strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * The two phases, and what each one is ALLOWED to conclude.
 *
 * The asymmetry is the point: phase 1 can rule a gate OUT (a gate that passes while eight workers fight over
 * the box passes on an idle one too), and it cannot rule one IN. Starvation only ever manufactures failures.
 */
export const PHASES = Object.freeze({
    parallel: Object.freeze({
        n: 1, jobs: 8, concludes: "GREEN is final; anything else is a CANDIDATE",
        why: "eight workers starve a gate that measures against the clock, so its red may be the box, not the code",
        evidence: "v4279: 46 parallel reds, 39 confirmed, 7 false -- a battle sim's 0.5 s clock assertion, a " +
                  "frame-budget check, a sort benchmark, three browser-driven gates, one fast-path timing check",
    }),
    serial: Object.freeze({
        n: 2, jobs: 1, concludes: "RED and GREEN are both final",
        why: "one gate at a time on an idle box is the only condition under which a timing assertion means what it says",
        optional: false,
    }),
});

/** A parallel timeout is the one outcome that is neither a pass nor a failure. */
export const TIMEOUT = Object.freeze({
    isVerdict: false,
    why: "a gate killed at the budget did not fail; it did not finish, and under -P 8 it may not have run",
    evidence: "v4279: two gates left the timeout bucket serially IN OPPOSITE DIRECTIONS -- referenceKind red " +
              "at 73.7 s, twoF green at 120.5 s. A bucket holding a red and a green with equal confidence is " +
              "not a bucket that may be waved through in either direction.",
});

export const VERDICT = Object.freeze({
    GREEN: "green", RED: "red", UNCONFIRMED: "unconfirmed",
});

/**
 * *** THE VERDICT FUNCTION. A CANDIDATE WITHOUT A SERIAL RE-RUN IS `unconfirmed`, NEVER `red`. ***
 *
 * `parallel` and `serial` are each {code, ms, timedOut} or null. The whole discipline of the two-phase method
 * lives in the four lines below, which is the reason it is a function and not a comment.
 */
export function classify(parallel, serial = null) {
    if (!parallel) throw new Error("classify: a phase-1 result is required");
    if (parallel.code === 0 && !parallel.timedOut)
        return { verdict: VERDICT.GREEN, from: "parallel", note: "passing under contention passes idle too" };
    if (!serial)
        return { verdict: VERDICT.UNCONFIRMED, from: "parallel",
                 note: parallel.timedOut ? "timed out under -P 8; not a verdict" : "parallel red is a hypothesis" };
    if (serial.timedOut)
        return { verdict: VERDICT.UNCONFIRMED, from: "serial", note: "timed out alone on an idle box; still unmeasured" };
    return serial.code === 0
        ? { verdict: VERDICT.GREEN, from: "serial", note: "false red -- starved in phase 1" }
        : { verdict: VERDICT.RED, from: "serial", note: "confirmed" };
}

/**
 * *** REFUSES TO PRODUCE A RED SET WHILE ANY CANDIDATE HAS NEVER BEEN RE-RUN. ***
 *
 * Not a warning and not a flag. The failure mode being prevented is a human reading a plausible number and
 * writing it down, and a plausible number is exactly what a warning still hands them.
 *
 * *** BUT `UNCONFIRMED` IS TWO DIFFERENT THINGS, AND THE FIRST VERSION OF THIS FUNCTION CONFLATED THEM. ***
 *
 * It refused on any unconfirmed candidate at all. Then the v4297 sweep produced two gates -- twoFBind and
 * toolFrontDoor -- that were re-run ALONE on an idle box and still did not finish inside 300 s. Those have
 * been all the way through phase 2. Their verdict is UNMEASURED, and that is a measured fact about the gate
 * rather than a procedural failure by whoever ran the sweep.
 *
 * Refusing over them would have made the method unusable on this tree, and the pressure that creates is
 * exactly wrong: the cheapest way to get an answer back would have been to delete the entry. So the two are
 * separated. `notRun` (phase 2 skipped it) still refuses. `unmeasured` (phase 2 ran it and it did not finish)
 * is reported, named and counted -- never folded into red, never folded into green. That is the same rule
 * TIMEOUT states for phase 1, applied to a bucket that survives phase 2.
 */
export function finalize(rows) {
    const out = { green: [], red: [], falseReds: [], notRun: [], unmeasured: [] };
    for (const r of rows) {
        const c = classify(r.parallel, r.serial);
        const rec = { gate: r.gate, ...c, ms: (r.serial || r.parallel).ms };
        if (c.verdict === VERDICT.GREEN && c.from === "serial") out.falseReds.push(rec);
        if (c.verdict === VERDICT.GREEN) out.green.push(rec);
        else if (c.verdict === VERDICT.RED) out.red.push(rec);
        else if (c.from === "serial") out.unmeasured.push(rec);   // ran alone, still did not finish
        else out.notRun.push(rec);                                // phase 2 never touched it
    }
    if (out.notRun.length)
        throw new Error("gateSweep.finalize: " + out.notRun.length + " candidate(s) never re-run serially: " +
                        out.notRun.map((u) => u.gate).join(", ") +
                        " -- phase 2 is not optional, see PHASES.serial");
    return out;
}

/**
 * *** WHETHER A METHOD IS ENTITLED TO REPORT ON REGRESSIONS AT ALL. ***
 *
 * A regression is a gate that was green and is now red. A sweep that ran only gates already known red has no
 * eligible population and must report `unmeasurable`, not zero. This is the check v4296's RECHECK failed.
 */
/**
 * *** THE FOURTEEN GATES ADDED SINCE THE v4297 SWEEP, RUN AT LAST -- AND ALL FOURTEEN ARE GREEN. ***
 *
 * gateSweep-selfcheck stopped pinning `swept === enumerateGates().length - 1` at v4315 and started NAMING the
 * surplus instead, because a frozen count went red the moment anybody added a gate. The number it named was
 * the honest staleness of SWEEP_V4297: fourteen gate files in the tree that the sweep had never executed,
 * thirteen from main's v4297-v4300 rounds and one from this branch. NAMING IT IS NOT THE SAME AS CLOSING IT,
 * so this is the closing.
 *
 * *** AND THE TWO-PHASE METHOD EARNED ITS KEEP ON A POPULATION OF FOURTEEN. *** Phase 1, five workers:
 * twelve green, ONE RED (gitEconomy, 38.4 s) and ONE that never finished (modeDistinct, killed at a 200 s
 * cap). Phase 2, serially, one at a time:
 *
 *     gitEconomy      RED at 38.4 s in parallel  ->  GREEN at 7.35 s alone, reproduced twice (7.347 s, 7.358 s)
 *     modeDistinct    unmeasured at the 200 s cap ->  GREEN, and it needs about NINE MINUTES to run
 *
 * gitEconomy is a FALSE RED FROM STARVATION -- the phenomenon v4279 measured at a 15% rate, here at 1 of 1.
 * It ran five times slower under contention than alone. Had phase 2 been skipped, this round would have
 * reported a regression that does not exist, in the file whose subject is that every number in circulation
 * about redness was somebody's memory.
 *
 * modeDistinct is the other half of the same asymmetry: a 200 s cap on a gate that takes nine minutes says
 * something about the cap. UNMEASURED IS A THIRD STATE, and it resolved green.
 *
 * *** WHY GREEN-UNDER-CONTENTION IS STILL SOUND, WHICH IS WHAT MAKES THIS AFFORDABLE. *** The clean pass was
 * itself briefly contended -- two of my own runs of modeDistinct overlapped, so its 519 s and 547 s timings
 * are inflated and are NOT recorded as clean. The VERDICTS are, because the asymmetry PHASES.phase1 already
 * states runs one way: starvation manufactures failures and never passes. A green measured while the box was
 * busy is a green on an idle one. Only the reds needed the second pass, and only the timings needed quiet.
 */
export const SWEEP_SINCE_V4297 = Object.freeze({
    at: "v4317", population: "every gate file present now and absent from the tree at the v4297 sweep",
    swept: 14, green: 14, red: 0, falseReds: 1, unmeasuredAtCap: 1, regressions: 0,
    parallelWorkers: 5, phase1CapMs: 200000, phase2CapMs: 900000,
    added: Object.freeze([
        "tools/roundhouse/modeDistinct-selfcheck.mjs", "tools/ship/deviceTexture-selfcheck.mjs",
        "tools/ship/gitEconomy-selfcheck.mjs", "tools/ship/gpuDriven-selfcheck.mjs",
        "tools/ship/gpuOrbits-selfcheck.mjs", "tools/ship/gpuPick-selfcheck.mjs",
        "tools/ship/gpuTerrain-selfcheck.mjs", "tools/ship/gpuUniverse-selfcheck.mjs",
        "tools/ship/hiZ-selfcheck.mjs", "tools/ship/qualityTiers-selfcheck.mjs",
        "tools/ship/rigCanvas-selfcheck.mjs", "tools/ship/shaderComplexity-selfcheck.mjs",
        "tools/ship/songButton-selfcheck.mjs", "tools/ship/strengthField-selfcheck.mjs",
    ]),
    resolvedByPhase2: Object.freeze([
        { gate: "tools/ship/gitEconomy-selfcheck.mjs", phase1: "RED", phase1Ms: 38404,
          phase2: "GREEN", phase2Ms: 7358, reproducedMs: 7347,
          why: "five times slower under five workers than alone -- the starvation signature. A FALSE RED." },
        { gate: "tools/roundhouse/modeDistinct-selfcheck.mjs", phase1: "UNMEASURED", phase1Ms: 200037,
          phase2: "GREEN", phase2Ms: null,
          why: "it needs roughly nine minutes; the phase-1 cap was 200 s. The timings taken were contended " +
               "(519 s and 547 s across two overlapping runs of my own) so no clean figure is recorded here -- " +
               "a number measured under contention is not a number about the gate." },
    ]),
    // *** THE ANSWER TO THE QUESTION THE SURPLUS COUNT WAS ASKING. ***
    verdict: "nothing added since v4297 is red. The fourteen include all seven of main's GPU-driven gates, " +
             "which pass on a box with NO WebGPU adapter -- they take the CPU-twin route and grade THAT, " +
             "rather than skipping, which is why they had a verdict to give at all",
    // v4322 -- THE SECOND CLOSING: the 26 gates present now and absent from both the v4297 tree and the list above,
    // swept serially on this box after the merge of origin/main (v4301-v4305) and the sweep branch. 25 green; ONE red:
    // avatarZWander-selfcheck.mjs, main's own thirty-second observation of the avatar's z, red on this box AND red on
    // origin/main's own tree run here (a worktree, the same shell) -- red on arrival, not a regression of this branch.
    // songGlobe-selfcheck.mjs was red on the first pass because the merge had taken this branch's main.js wholesale and
    // dropped main's songTerrain.globe(); main.js was rebuilt from main's with this tree's marker, and it is green.
    since2: Object.freeze({
        at: "v4322", swept: 26, green: 25, red: 1,
        added: Object.freeze([
            "tools/ship/avatarZWander-selfcheck.mjs", "tools/ship/dockFraming-selfcheck.mjs", "tools/ship/economyLockstep-selfcheck.mjs",
            "tools/ship/fleetMask-selfcheck.mjs", "tools/ship/fleets-selfcheck.mjs", "tools/ship/gpuGitTime-selfcheck.mjs",
            "tools/ship/landing-selfcheck.mjs", "tools/ship/phoneFrontDoor-selfcheck.mjs", "tools/ship/physicsShaders-selfcheck.mjs",
            "tools/ship/playerShip-selfcheck.mjs", "tools/ship/populationPolicy-selfcheck.mjs", "tools/ship/qrChannel-selfcheck.mjs",
            "tools/ship/quickSweep-selfcheck.mjs", "tools/ship/racesAct-selfcheck.mjs", "tools/ship/rangefinder-selfcheck.mjs",
            "tools/ship/rigTiming-selfcheck.mjs", "tools/ship/songGlobe-selfcheck.mjs", "tools/ship/stealthRace-selfcheck.mjs",
            "tools/ship/traderPolicy-selfcheck.mjs", "tools/ship/tsl-selfcheck.mjs", "tools/ship/tslPhysics-selfcheck.mjs",
            "tools/ship/tslRace-selfcheck.mjs", "tools/ship/tslRig-selfcheck.mjs", "tools/ship/tslSource-selfcheck.mjs",
            "tools/ship/universeJournal-selfcheck.mjs", "tools/ship/universeWire-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([{ gate: "tools/ship/avatarZWander-selfcheck.mjs", why: "z from 0.35 to 0.35 over thirty seconds here, and the same on origin/main's tree in the same shell" }]),
    }),
    // v4329 -- THE THIRD CLOSING, and it is one gate because that is how many this round added. #68's fleet
    // gate was run repeatedly while it was written and four sabotages were driven through it; the sweep entry
    // records the state it SHIPS in. The shape is deliberately the same as since2 so the accounting below can
    // sum a list rather than grow another named term every round -- which is what the equality this replaced
    // could not survive.
    since3: Object.freeze({
        at: "v4329", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/orreryFleet-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
    }),
    // v4332 -- the fourth closing, and the summing above is why adding it costs one entry rather than an
    // edit to the arithmetic. #48's gate was driven through four sabotages before it shipped; two of them
    // went red in the GATE rather than the code, and it ships in the state that survived them.
    since4: Object.freeze({
        at: "v4332", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/orreryReached-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
    }),
    // v4335 -- A FIFTH CLOSING, and the SECOND time this exact collision happened in one merge sequence: main
    // added a fourth for its own gate while this branch's fourth was in flight, so mine moves again. That is the
    // argument for the list shape twice over -- a round appends an entry and nobody has to renegotiate a name.
    // v4331 -- (was A FOURTH CLOSING.) Both sides of this merge invented a third one in the same week -- main's for
    // its fleet gate, mine for the two this branch added -- which is the clearest possible argument for main's
    // shape: `closings` is a LIST, so a round adds an entry instead of another named term. Mine becomes since4
    // rather than being folded into main's since3, for the same reason since3 was not folded into since2: that
    // record reports a sweep that ran on a day, and a sweep cannot have run a file that did not exist yet.
    since5: Object.freeze({
        at: "v4335", swept: 2, green: 2, red: 0,
        added: Object.freeze([
            "render/cubeBake-selfcheck.mjs", "render/valueNoise-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        verdict: "both green on this box, run singly: cubeBake-selfcheck 16 pass, valueNoise-selfcheck 23 pass. " +
                 "Each was also driven RED by three sabotages of the module it guards and restored, which is a " +
                 "stronger statement than a green run alone -- a gate that has never been seen to fail is a gate " +
                 "whose green means nothing yet",
    }),
    // v4336 -- A SIXTH CLOSING, for the gate this round added. Same one-line shape as the five before it, which
    // is the whole benefit of main's list: five rounds have now appended an entry and none has had to touch the
    // accounting. bakeShrinkGuard-selfcheck was run alone on this box and sabotaged four times against the
    // module it guards -- three caught, and the fourth recorded in its own header as a no-op rather than
    // counted as a pass.
    since6: Object.freeze({
        at: "v4336", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/bakeShrinkGuard-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly: 22 pass. Driven against the REAL v4335 accident -- it refuses " +
                 "the exact orreryBake write that dropped four files, names them, and exits 1",
    }),
    // v4350 -- A SEVENTH CLOSING, for the version preflight. Seven entries appended in seven rounds and the
    // accounting below has never been edited once: that is what the list shape bought, and it is why this
    // branch's fourth and fifth closings survived two merges with main adding its own in between.
    since7: Object.freeze({
        at: "v4350", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/versionPreflight-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly: 24 pass. All four of the session's real version collisions are " +
                 "replayed in it and refused; three sabotages caught, one of them the ENOBUFS fault the guard's " +
                 "own first draft shipped",
    }),
    // v4361 -- the eighth closing, and the list shape has now absorbed a THIRD name collision without an edit
    // to the arithmetic, which is what it was for. #40's gate is one file; the round it belongs to also
    // rewired seven of knobLiveness-selfcheck's own budgets from typed round numbers to reads of the measured
    // cost record, so THAT gate was run to completion beside this one rather than left to the quick sweep's
    // cap -- a gate whose budgets changed is exactly the gate a 3 s cap cannot vouch for.
    since8: Object.freeze({
        at: "v4361", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/roundhouse/sweepBudget-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly, seven sections. Driven RED by four sabotages of the module it " +
                 "guards (1/2/2/1 by name) and restored md5-identical; one of the four is red only on a box " +
                 "whose hostScale is not 1, which is said in the log rather than left as a silent pass",
    }),
    // v4365 -- the ninth closing, and the first for a gate that reaches OUTSIDE this tree. img2three-selfcheck
    // guards render/img2three.mjs, the bridge from a generated three.js object tree to one SweK mesh, so its
    // third section depends on a file that is deliberately not in the mirror (.img2threejs/model.js, gitignored
    // because img2threejs-showcase carries no licence). That section PASSES with the file absent and says the
    // numbers are unsigned -- the BACKLOG.md shape -- so the gate is deterministic here and richer on the rig.
    since9: Object.freeze({
        at: "v4365", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/img2three-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly, three sections. Driven RED by three sabotages of the module it " +
                 "guards (1/3/4 by name) and restored. Its second section renders on BOTH backends at TWO cameras " +
                 "and one of the two is where they part by a single boundary pixel, which is measured rather than " +
                 "left at the camera where they agree",
    }),
    // v4366 -- the tenth closing. divineEye-selfcheck guards render/divineEye.mjs, a PORT of another project's
    // deterministic review signals, so what it protects is fidelity to someone else's arithmetic rather than to
    // this tree's: its first section pins their constants by value, because a port that drifts stops measuring
    // the thing it was written to measure and starts measuring itself.
    since10: Object.freeze({
        at: "v4366", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/divineEye-selfcheck.mjs"]),
        verdict: "green on this box, run singly, two sections. Driven RED by three sabotages of the module it " +
                 "guards (1/4/1 by name) and restored -- one of the three went 0 red first and needed a new input " +
                 "before it could bite. Both of the round's own first runs were wrong and both are logged in it",
        redOnArrival: Object.freeze([]),
    }),
    // v4371 -- the ELEVENTH closing HERE and the ninth on the line that wrote it: two branches each added a
    // ninth, and the merge renames rather than renumbers, because `at` says which round a closing belongs to
    // and that does not move. Their note, unchanged:
    // v4371 -- the first closing whose round also cleared a red the sweep could never have found:
    // vendor/three-webgpu went undeclared from v4319, and tools/ship/vendoredLicences-selfcheck.mjs takes 15 s,
    // which puts it outside the 3 s quick sweep. It was red on every verify for fifty rounds and reported by
    // none of them. Recorded here because it is exactly the blind spot this accounting exists to measure.
    since11: Object.freeze({
        at: "v4371", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/carve-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly, nine sections and 19 checks in 5.1 s. Driven RED by four " +
                 "sabotages of mesh/carve.mjs (1/6/1/6 by name) and restored; one of the four went 0 red first " +
                 "and turned out to be the FIX rather than the sabotage -- the module's out-of-frame policy was " +
                 "backwards and no fixture reached the branch. The round ALSO cleared vendoredLicences-selfcheck, " +
                 "red since v4319, but that gate is not counted here: it was not ADDED, it was found",
    }),
    // v4373 -- the twelfth closing, and the first for a gate that drives render/gpuDriven.mjs with a compute pass
    // gpuDriven does not contain: the new `cull` hook means a scene's decision can come from outside the module,
    // so this gate is what stands between that hook and a caller binding it wrongly in silence.
    since12: Object.freeze({
        at: "v4373", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/generatedLadder-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly, four sections. Driven RED by two sabotages (2/2 by name) and " +
                 "restored; a third attempt was MALFORMED and crashed the gate instead of failing a check, which is " +
                 "logged in it as a crash rather than counted as a catch",
    }),
    // v4375 -- the thirteenth closing. shippedLadder-selfcheck reads two SHIPPED PAGES and prices what they draw,
    // so what it guards is a claim about the tree's own product rather than about a module: that the LOD ladders in
    // orrery-gpu.html and universe-gpu.html are tells and not approximations. A page edit that made one of them a
    // real approximation should turn this red, and that is the point of it.
    since13: Object.freeze({
        at: "v4375", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/shippedLadder-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly, two sections. Driven RED by two sabotages of render/lodBudget.mjs " +
                 "(2/2 by name) and restored. Its own first run was wrong three ways and all three are logged in it",
    }),
    // v4380 -- the fourteenth closing, and the first gate whose subject is the RED REGISTER itself. registerDrift
    // compares what the census says each standing red fails on against what that gate actually prints, which is the
    // question that would have caught vendoredLicences (52 rounds) and rigJobs (250) before somebody stumbled on
    // them. It reads a frozen audit rather than running 29 gates, so it stays inside the quick sweep.
    since14: Object.freeze({
        at: "v4380", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/registerDrift-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly, four sections over all 29 standing reds. Driven RED by two " +
                 "sabotages (1/1 by name) and restored; its own first draft reported drift on two gates that had " +
                 "not drifted, which is logged in it",
    }),
    // v4381 -- the FIFTEENTH closing. #148's gate drives a REAL WebGPU device, so it is one of the twenty
    // gateAxioms's register names, and it was run alone here rather than left to the quick sweep -- a 3 s cap
    // kills a browser gate before it reaches a device and would have vouched for nothing.
    since15: Object.freeze({
        at: "v4381", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/brainTsl-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly, seven sections, on a device. Driven RED by four sabotages of " +
                 "the module it guards (3/4/3/3 by name) and restored md5-identical; one of the four found a " +
                 "defect in the GATE -- typed detail strings that printed 0 beside their own FAIL",
    }),
    // v4382 -- the 16th closing. #149's gate COMPILES AND RUNS the shim natively, so it is one of the six
    // that spawn a process and it needs cc on the box; it skips loudly rather than failing where there is none.
    // Run alone here, and its two shim sabotages were rebuilt before each run so what went red is the compiled
    // physics rather than a regex over C.
    since16: Object.freeze({
        at: "v4382", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/box3dRay-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly, five sections against a natively built shim. Driven RED by " +
                 "four sabotages (2/2/2/1 by name) and restored md5-identical; the first of them was the " +
                 "round's own winding bug put back, which only one of eleven rays could see",
    }),
    since17: Object.freeze({
        at: "v4384", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/songLathe-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly, nine sections. TWO of them were written as claims and came " +
                 "back RED before they came back green: mesh/lathe.mjs's asymmetry() reporting 0.590698 on a " +
                 "solid symmetric by construction (a real defect, fixed there), and an end-to-end IoU of " +
                 "0.433447 that was a wrong frequency in this gate's own fixture. Driven RED by four " +
                 "sabotages (2/10/3/2 by name) and restored md5-identical",
    }),
    since18: Object.freeze({
        at: "v4385", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/jointDrive-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly, seven sections against a natively rebuilt shim. TWO checks " +
                 "were written as claims and came back RED first: a clean below/above split on the torque cap " +
                 "(the measurement made it three -- a cap of exactly m*g*d holds MARGINALLY, 62x the sag of one " +
                 "6% larger), and a fixed-size limit overshoot (it is SIGNED -- the knee stops 0.0153 deg SHORT " +
                 "while three tighter stops overshoot). Also swept tools/ship/box3dFilter-selfcheck.mjs, which " +
                 "was RED AT HEAD -- v4382 shipped a raycast that never reached build-box3d-wasm.sh's hand-typed " +
                 "export list -- and is green now. Driven RED by five sabotages (3/5/1/1/3 by name), both files " +
                 "md5-identical after, the three shim ones rebuilt natively so what went red is compiled physics",
    }),
    since19: Object.freeze({
        at: "v4386", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/mutationScore-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly, five sections. This round also re-ran every entry in " +
                 "redCensus's RED_AT_V4279 -- all 28, serially, 597 s -- to test whether the register held " +
                 "gates somebody had since fixed. It did not: 28 of 28 genuinely red. And the check ITSELF " +
                 "was redundant, which is the finding: registerDrift-selfcheck already compares the register " +
                 "against a frozen audit on every ship, and the audit was last re-frozen at v4380. One of them is red no longer: " +
                 "mutationTable-selfcheck is pruned to FIXED_SINCE_V4279 with its cause. Driven RED by four " +
                 "sabotages (3/3/1/1 by name), md5-identical after; sabotage B restores the actual v4162 " +
                 "defect and TWO independent detectors catch it, which is why both are there",
    }),
    since20: Object.freeze({
        at: "v4388", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/shipyard-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly, six sections, most of the time the live page. It gates " +
                 "voxel/shipyard.mjs, Valkyrien Skies 2's indirection ported as arithmetic: a body's voxels stay " +
                 "on the integer grid in a claim and the RAY is transformed instead of the data. THE ROUND SET " +
                 "OUT TO CONFIRM A PRECISION ARGUMENT AND THE MEASUREMENT REFUSED IT -- in float64 the baked " +
                 "alternative is 1.9e-12 of a voxel out after 10,000 motions, so the check asserts the argument's " +
                 "FAILURE. It holds in float32 at distance instead: 2.0 VOXELS out at a million, and exactly zero " +
                 "claim-local at every distance. Driven RED by three sabotages (2/3/1 by name), md5-identical " +
                 "after. *** AND THIS CLOSING NAMES A MODULE THAT ALREADY HAS A NON-GATE IMPORTER, which is " +
                 "v4386's finding taking effect on the very next round to add one: ray-march-demo.html casts the " +
                 "ship's rays, so the sentence below cannot hide it ***",
    }),
    since21: Object.freeze({
        at: "v4389", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/mechanical-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly, eight sections. The round RAN the mechanical scanner for the " +
                 "first time: 19 constants over 5 files, 6/7/6 caught/survived/unmeasured, and two survivors " +
                 "confirmed against the FULL 934-gate verify. Two claims were corrected by measuring -- the " +
                 "gate set had to be ordered cheapest-first (a name-ordered draft burned 27 minutes without a " +
                 "verdict) and the lockstep timestep survives because the gates are DIFFERENTIAL, not because " +
                 "the default is unexercised. Driven RED by four sabotages (2/2/3/1 by name), three files " +
                 "md5-identical after",
    }),
    since22: Object.freeze({
        at: "v4390", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/operators-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly, eight sections. The mutation operator is now chosen by the " +
                 "constant's ROLE, and the same eleven constants re-swept go from 4 checked / 7 survivors to " +
                 "6 checked / 4 survivors / 1 correctly skipped. The CONTROL had a known answer beforehand: " +
                 "mutate.mjs sets redundancy to 0 by hand and is caught, and the role operator chose zero on " +
                 "its own and was caught too. The classifier shipped a bug in its first draft (it read the " +
                 "role off the TRIMMED excerpt while col indexes the untrimmed line) and that fix is section " +
                 "1. Driven RED by four sabotages (2/4/1/1 by name), three files md5-identical after",
    }),
    since23: Object.freeze({
        at: "v4392", swept: 1, green: 1, red: 0,
        added: Object.freeze(["physics/lockstepConstants-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly, five sections. It writes the checks v4390 said were missing, " +
                 "and MEASURES the effect by re-sweeping the same twelve mutants: 3/12 caught -> 9/12, all " +
                 "four named survivors now caught. THREE claims of v4390's and this round's own were " +
                 "corrected by measuring -- shipHalf was a no-op mutation absorbed by a duplicated default, " +
                 "the history offset needs a direction check rather than none, and the gate's first draft " +
                 "passed both constants EXPLICITLY so the defaults went untested, which is the very blindness " +
                 "it was written to fix. Driven RED by four sabotages (4/1/2/1 by name), three files " +
                 "md5-identical after",
    }),
    since24: Object.freeze({
        at: "v4394", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/mutate/shadowedDefaults-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly in 6s, seven sections. It censuses the pattern v4392 proved " +
                 "for one pair -- a default written into an object literal and defaulted AGAIN by the " +
                 "imported callee -- and finds 18 edges tree-wide, against 25,657 if you pair by option name " +
                 "with no import edge. TWO of the round's own conclusions were refuted, neither by reading: " +
                 "executing the third row showed a `||` FORWARDER never emits a zero, so the caller's zero " +
                 "dies at the NEAR end and there are two questions here answered by two operators in two " +
                 "files; and the tree's own mechanicalSweep record shows the ERASED zero mutant CAUGHT on the " +
                 "exact row the draft called uncatchable, because v4392 wrote a SOURCE check where no " +
                 "behavioural one could work. The fix generalises that one hand-written pair to a frozen list " +
                 "of all five ERASED edges; four of the five had nothing before, and no gate in the tree " +
                 "named voxelizePage at all. Driven RED by four sabotages (1/3/2/1 by name), five subject " +
                 "files md5-identical after",
    }),
    since25: Object.freeze({
        at: "v4395", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/gateReport-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly, five sections. It gates tools/ship/gateReport.mjs, the answer to " +
                 "the census that opened the round: 1429 gates, 67 print a table of numbers, ZERO wrote anything " +
                 "a second reader could open -- and artefactWriters, the register that exists to answer that, " +
                 "could not see one of them because its walk skips -selfcheck.mjs by construction, so its zero " +
                 "read clean. Driven RED by four sabotages (2/3/3/1 by name), md5-identical after; the first " +
                 "left a stale artefact behind within one run of turning the dry-run rule off, which is the rule " +
                 "demonstrating itself. Two of its own drafts were wrong and both are logged in the gate: " +
                 "reports() returned index.json as a report (a register counting its own listing), and the " +
                 "value check looked in rendered text the page had rounded -- THE PAGE WAS THE THING THAT NEEDED " +
                 "FIXING, and every cell now carries its exact value in a title",
    }),
    since26: Object.freeze({
        at: "v4396", swept: 1, green: 1, red: 0,
        added: Object.freeze(["physics/box3d/sensorsCcd-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly in 0.3s, five sections, all of it compiled and RUN against " +
                 "the real box3d rather than asserted. Sensors: a body falls through one and ends at the SAME " +
                 "six decimals as through empty space, while a solid box in the same place stops it -- and " +
                 "with the VISITOR's sensor events off, a live sensor reports nothing at all. CCD: eight " +
                 "combinations, one predicate reproducing all of them, and the measured fact that the bullet " +
                 "flag is a second gate BEHIND the world switch rather than an alternative to it. THREE of " +
                 "the round's own conclusions were refuted by measurement: two bisections of one experiment " +
                 "disagreed (22.58 vs 30.08), which proved the predicate non-monotonic; a dense scan showed " +
                 "pass-through ALTERNATES IN BANDS, so there is no threshold and the quantity is a rate " +
                 "(64/96 without continuous, 1/96 with); and that one is a HOLE at 34 m/s where continuous is " +
                 "on and the body goes through anyway, which makes the rule necessary and not sufficient. " +
                 "Plus the finding nobody went looking for: b3WorldDef.maximumLinearSpeed defaults to 400 m/s, " +
                 "the vendored headers state it nowhere, and the SHIPPED wasm already enforces it on " +
                 "ev/tools/es-arena.mjs's Fighter at 430. Driven RED by five sabotages (2/4/4/2/2 by name), " +
                 "three files md5-identical after, and sabotage D caught a check that required its own " +
                 "finding to stay broken",
    }),
    since27: Object.freeze({
        at: "v4397", swept: 1, green: 1, red: 0,
        added: Object.freeze(["physics/backendLimits-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly in 0.9s, six sections, BOTH ENGINES re-measured in the run. It " +
                 "answers the question v4396's footer said it could not: the aliasing non-monotonicity is " +
                 "SHARED (Jolt passes at 52 and stops at 100, the same inversion box3d showed at 13 and 90) " +
                 "while the 34 m/s CCD hole is BOX3D'S ALONE (Jolt's LinearCast stops all 96). Both engines " +
                 "silently cap linear speed and the caps are 100 m/s apart -- 400 and 500, both measured and " +
                 "neither quotable -- so es-arena's Fighter at 430 flies at two speeds depending on the " +
                 "router, which is v2468's damping finding in a second place. Jolt routes sensor overlaps " +
                 "through the ORDINARY contact listener, so a portable reader must call Body.IsSensor() or it " +
                 "reports the floor as a trigger. Driven RED by five sabotages (4/1/2/3/1 by name), both files " +
                 "md5-identical after, and B reproduces v2468's mistake on demand: dropping the damping match " +
                 "reads 25/96 onset 45 against the matched 19/96 onset 52",
    }),
    since28: Object.freeze({
        at: "v4398", swept: 1, green: 1, red: 0,
        added: Object.freeze(["physics/wheelJoint-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly in 0.24s, seven sections, the last of which RE-MEASURES the " +
                 "record natively in its own run rather than grading a receipt. It binds box3d's wheel joint " +
                 "-- 36 functions, never once called from this tree -- and tests the claim physics/vehicle.mjs " +
                 "has used to justify its whole design since v4217: that constrained wheels are why toy car " +
                 "physics jitters at a 50:1 mass ratio. THE ANSWER IS YES IN KIND AND NO IN DEGREE. The " +
                 "mechanism is real and scales with both things the claim names -- 1.5e-06 at 10:1 to 9.2e-03 " +
                 "at 1000:1, 3.79 orders, and three more orders from four substeps down to one -- while at the " +
                 "50:1 the claim itself names it is 4.6 MICRONS on a 0.65 m ride height. The rig had to be " +
                 "fixed THREE times and every failure read as a physics result: the strut was resting on its " +
                 "limit stop, then the wheels were CUBES because every constructor in the shim called " +
                 "b3MakeBoxHull, then the settled car was ASLEEP and reported full motor torque at zero speed. " +
                 "Driven RED by five sabotages (4/3/2/2/2 by name), four files md5-identical after",
    }),
    since29: Object.freeze({
        at: "v4400", swept: 1, green: 1, red: 0,
        added: Object.freeze(["physics/backendRouting-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly in 0.27s, five sections, both engines LOADED in the run. One " +
                 "line was behind three findings: box3dLoader imports \"/vendor/box3d/box3d.js\", a " +
                 "browser-absolute URL that cannot resolve in Node, and reported it as \"WASM not built " +
                 "yet\" -- while the artifact was committed and box3dNode had been loading it for hundreds " +
                 "of versions. So the facade gave Node callers Jolt even for prefer:box3d, backend-qa-check " +
                 "recorded a two-engine envelope holding one engine, and CAPS routed constraint-needers to " +
                 "the backend whose portable joint interface refuses them. All three fixed; the cross-backend " +
                 "envelope is recorded for the first time (drift 3.718u, IoU 0.588, box3d deterministic), " +
                 "which v3337 had designed the UNMEASURED failure to force. AND THE OTHER BRANCH'S v4399 " +
                 "ARRIVALS RATCHET WENT RED ON THIS GATE BY PATH AT THE MERGE, one round after they installed " +
                 "it, so it emits three tables now -- and wiring it found instruments.html building report " +
                 "cell titles by raw concatenation, where the first value holding a double quote closed the " +
                 "attribute (153 values, 4 missing, exactly the four routing requests with quotes). Driven " +
                 "RED by seven sabotages (6/2/1/1/1 then 1/6 by name), six files md5-identical after, and " +
                 "sabotage A found two defects in the new gate: it THREW instead of reporting, and one check " +
                 "passed vacuously by naming a route that had just failed",
    }),
    since30: Object.freeze({
        at: "v4403", swept: 1, green: 1, red: 0,
        added: Object.freeze(["physics/xpbd/rigidCouple-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly in 1.7s including a browser probe, eight sections. THE FIRST " +
                 "COUPLING THAT LEAVES XPBD: four solvers in this tree and until this round none of them " +
                 "touched -- xpbd collided against a plane and particles, sph against analytic box walls, " +
                 "box3d and Jolt against their own bodies, and the registry's only two-way coupling had both " +
                 "sides inside xpbd. One formula had to be written, the generalized inverse mass " +
                 "w = 1/m + (r x n)^T I^-1 (r x n), exactly 1/m at a face centre and 4.0907x at a corner. " +
                 "Mass and inertia are derived from the box and PROBED against box3d, which exports neither: " +
                 "3.80160022 kg against 3.8016 (5.7e-8) and omega to 3.1e-4. The ledger is bit-identically " +
                 "zero and momentum only reaches 4.8e-14, reported apart on purpose. An 11x11 pinned sheet " +
                 "holds a 3.8 kg box at y=+0.032 after 4 s against a free fall of -79.89, and does it again " +
                 "with box3d integrating the body through swk_body_impulse. One-way, p_x reverses. Driven RED " +
                 "by six sabotages (1/3/1/1/2/2 by name), two files md5-identical after -- and sabotage C read " +
                 "ZERO RED at first because every scene caught the body before the bug could show, so the gate " +
                 "could not see the exact defect the round exists to have fixed",
    }),
    since31: Object.freeze({
        at: "v4404", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/claimEvidence-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly in ~1s, four checks. It gates tools/ship/claimEvidence.mjs, which " +
                 "asks what each of predictions.html's 241 claims rests on: kill: and where: are SENTENCES, and " +
                 "nothing had ever resolved the path or run the gate. ONE SETTLED CLAIM WAS RESTING ON A RED " +
                 "GATE -- 'the selfchecks and the server survive Windows path semantics', whose own killer " +
                 "reports twenty offending occurrences -- and it is marked BROKEN with the measurement rather " +
                 "than exempted. 182 gated, 52 prose, 7 dangling, 0 contradicted. Driven RED by three sabotages " +
                 "(1/1/1 by name). The dangling list was frozen TWICE: the first counted a citation of this very " +
                 "gate, written one command before the file existed",
    }),
    since32: Object.freeze({
        at: "v4405", swept: 1, green: 1, red: 0,
        added: Object.freeze(["physics/sph/rigidFloat-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly in 8.4s, six sections. #160 SHIPS AS A REFUSAL WITH A CAUSE. " +
                 "The SPH-to-rigid coupling is built on v4403's seam -- the formula IMPORTED across from " +
                 "physics/xpbd/ rather than copied -- and its ledger is bit-exact. The hull integral is " +
                 "verified against an EXACT hydrostatic field and returns rho*g*V to 0.017% over a 2.5x range " +
                 "of resolution, with the summed quadrature area equal to the hull area IDENTICALLY. Against " +
                 "the live fluid it reads 5x to 13x, and the cause is measured: dp/d(depth) is 7778 Pa/m " +
                 "against the 1179 Pa/m hydrostatics requires (6.6x), and the top 44% of the column carries " +
                 "NO pressure because clampPressure zeroes everything under rest density. SO THE ONE GATED " +
                 "FLUID CHECK MEASURES THE QUANTITY BUOYANCY DOES NOT DEPEND ON: physicsSuite reads the MEAN " +
                 "floor pressure and gets it right to 15.5%, while buoyancy needs the GRADIENT, which nothing " +
                 "had ever asked for. Driven RED by six sabotages (3/3/1/2/0/1 by name), one file " +
                 "md5-identical after; sabotage E is recorded as UNREACHABLE rather than undetected, and " +
                 "sabotage F rewrote a check that had asserted a defect existed instead of pinning its value",
    }),
    since33: Object.freeze({
        at: "v4406", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/shipVerdict-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly in ~2s, five sections. It gates tools/ship/shipVerdict.mjs, the " +
                 "repair for the worst mistake of the session: v4404 was committed, pushed and fast-forwarded " +
                 "onto main WITH THREE CONFLICT MARKERS IN IT, past a verify that had printed DO NOT SHIP and " +
                 "exited 1, because the git steps were chained behind a read of the log tail rather than of the " +
                 "exit status. Two conditions, held apart: no tracked file carries a conflict marker (5,505 read " +
                 "in full, no allowance list, and the ref checked as well as the tree because a clean tree is " +
                 "not evidence about what shipped), and a (status, tail) pair that DISAGREES IN EITHER " +
                 "DIRECTION is no verdict rather than a pass -- proven against a live child that prints ALL " +
                 "GREEN and exits 1. Driven RED by three sabotages (MEASURED 1/3/1 by name)",
    }),
    since34: Object.freeze({
        at: "v4407", swept: 1, green: 1, red: 0,
        added: Object.freeze(["gfx/frontDoor-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly in 3.5s including three browser launches, six sections. THE " +
                 "FRONT DOOR REACHED NO WEBGPU AND NO TSL AND ADVERTISED WEBGPU ANYWAY: walked forward from " +
                 "main.js with the tree's own resolver, 692 modules reached and NOT ONE of gfx/device.js, " +
                 "render/tslSource.mjs, the six TSL modules, ui/orreryPost.mjs or ui/webrtxBrowser.js -- while " +
                 "main.js printed 'this browser HAS WebGPU' and offered nothing using it. A lazily-imported " +
                 "door closes ONE of the ten (692 -> 695) and the ratchet is on the DIFFERENCE, so the nine " +
                 "still outside are named rather than implied. AND THE MEASUREMENT FOUND THREE REASONS A " +
                 "WEBGPU DEVICE DOES NOT ARRIVE ON ONE MACHINE, none of which detectBackends() can name: the " +
                 "LAN address WITHHOLDS navigator.gpu; loopback on a plain launch has the API and " +
                 "requestAdapter() returns NULL; loopback with --enable-unsafe-webgpu gets an adapter and the " +
                 "webgpu backend. Driven RED by six sabotages (1/4/2/5/2/10 by name), two files md5-identical " +
                 "after -- and F took three attempts because it found two defects in the gate first: a purity " +
                 "check that COULD NOT FAIL (it scanned specifiers() output for node: specs, which " +
                 "specifiers() never emits) and a gate that THREW on a null live read before reaching the " +
                 "section that check lived in",
    }),
    since35: Object.freeze({
        at: "v4408", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/sweepCoverage-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly in ~2s, six sections. It gates tools/ship/sweepCoverage.mjs and " +
                 "tools/ship/sweepRotation.mjs, which answer the thing quickSweep-selfcheck's own closing line " +
                 "said was unchecked: THE GATES OVER THE BUDGET, RUN BY NOTHING AT SHIP TIME. v4406 measured 502 " +
                 "of 1,439. THE MECHANISM IS WORSE THAN THE GAP: sweep-timings.json stamped ONE date on all " +
                 "1,440 entries while rewriting only the 937 it ran, the budget decision is made FROM those " +
                 "readings, and the reading a green gate is evicted on is its PARALLEL one -- quickSweep files " +
                 "`serialMs ?? parallelMs` and a green gate never gets a serial re-run. So the sweep closes the " +
                 "door with a starved number of its own making and never reopens it. MEASURED BY RUNNING 140 OF " +
                 "THEM SERIALLY: 138 came back under budget, median 2.85x faster than the reading that evicted " +
                 "them and 7.2x at the worst, and SIX WERE RED IN THE DARK -- two now in redCensus.RED_AT_V4407, " +
                 "two fixed by the ritual's own staleness step, two already registered. The pool fell 372 -> 234",
    }),
    since36: Object.freeze({
        at: "v4410", swept: 1, green: 1, red: 0,
        added: Object.freeze(["render/doomFireField-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly in 0.2s, thirteen checks in five sections. It gates " +
                 "render/doomFireField.mjs, which makes the DOOM fire's flow a PER-CELL DIRECTION FIELD rather " +
                 "than the constant -width of v4178, and its spine is a control that costs nothing: a uniform " +
                 "upward field reproduces render/doomFire.mjs BYTE FOR BYTE over five grid shapes and 1,000 " +
                 "frames with stoke() and damp() interleaved, because the rule's TWO directional constants -- " +
                 "the flow +w and the lean -1 -- are DERIVED from the field rather than re-typed beside it. " +
                 "Four of the round's own claims were refuted by its own instruments and each is a row here: " +
                 "quantise's comment asserted the property its code lacked, the header claimed a zero " +
                 "direction meant nothing burns there while 154 of 1,542 off-water cells burned, the river's " +
                 "downstream never advanced downstream, and the waterfall's 'narrow column' comment sat over " +
                 "code making a sheet. It also pins a boundary behaviour of v4178 that v4178 could not " +
                 "exhibit: a fuel cell with no perpendicular upstream neighbour is only ever written " +
                 "undecayed, so the curtain's leading column reads 36 at all 20 rows.",
    }),
    since37: Object.freeze({
        at: "v4411", swept: 1, green: 1, red: 0,
        added: Object.freeze(["render/shipExhaust-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly in 0.3s, twelve checks in six sections. It gates " +
                 "render/shipExhaust.mjs -- v4178's DOOM fire on v4410's direction field, hung off every EV " +
                 "ship's stern -- and its last section is the REACH, which is what #162 was filed for: the " +
                 "automaton's only consumer in three hundred versions was doom-fire.html, a standalone 2D " +
                 "canvas demo. The reach rows ask more than whether an import string is present: the " +
                 "specifier must RESOLVE through the tree's own resolver, the plume must be pushed from the " +
                 "same `thrust` the flight model consumed for both player and NPC, and a plume must be " +
                 "dropped when its ship goes. v4165's rule, that an import is not a consumer. Written into " +
                 "the ledger IN the round, after v4410 shipped a gate without an entry and gateSweep-" +
                 "selfcheck went red on the surplus by exactly one.",
    }),
    since38: Object.freeze({
        at: "v4412", swept: 1, green: 1, red: 0,
        added: Object.freeze(["render/fireColour-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly in under a second, thirteen checks in four sections. It gates " +
                 "render/fireColour.mjs, the census of everything in this tree that turns heat into a colour, " +
                 "and its first section COMPUTES the premise every other row rests on -- Planck's law " +
                 "monotone in T at 700/550/450 nm, from the constants in physics/thermal/blackbody.mjs -- " +
                 "because a check resting on an unverified premise is a check resting on nothing. It found a " +
                 "naming trap of v4144's species: two functions called fireRamp, one a blackbody " +
                 "approximation and one an Inferno colormap that is PURPLE where the other is dark red, " +
                 "living in demos_code/ which staleness.mjs's SKIP regex has excluded from gateFiles() for " +
                 "4,412 versions.",
    }),
    since39: Object.freeze({
        at: "v4413", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/importPosition-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly in ~3s, five sections. docs/EXPLAIN-ITSELF.md item 5. It gates " +
                 "tools/ship/importPosition.mjs, which asks POSITIONALLY whether a vendor path is a dependency: " +
                 "not is it quoted, but IS THE QUOTED STRING THE PATH. world/orreryEjecta.mjs's own header " +
                 "records deleting that guard at v4329 because it was measured INERT -- true then, and " +
                 "inertness is a property of the tree on the day it is measured. THE OLD RULE IS WRONG IN BOTH " +
                 "DIRECTIONS: of 138 entries 12 are records, and it never saw 17 files reaching a body through " +
                 "path.join, so the population is 143. The baseline is now a FROZEN LIST OF NAMES with counts " +
                 "derived, and that ratchet caught this round's own gate joining box3d's fleet within the hour " +
                 "-- the scanner counting the scanner, third instance. It clears orreryEjecta-selfcheck from " +
                 "the register by RE-DERIVING rather than raising a number, and retires an orrery claim that " +
                 "was true only because the old rule could not see path.join: two of the three planets drawn " +
                 "as pure paperwork are reached by real gates. FOUR SABOTAGES LANDED AND THREE MORE COST ZERO " +
                 "RED, which rewrote a section: a two-line fixture has too few quotes to break",
    }),
    since40: Object.freeze({
        at: "v4414", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/avatarDock-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box; it drives a real browser twice so it is a SLOW gate by design, and what " +
                 "it checks is a LAYOUT -- a layout claim with no browser behind it is a claim about source " +
                 "text. Eight checks: three on the sizing rule against a fake host, five on a live " +
                 "server.html measured at TWO widths, because the defect it repairs was a typed constant and " +
                 "a typed constant is right at exactly one width by luck. It closed its own named gap in " +
                 "draft: it first reported the staged-panel contract UNCHECKED because it reached for " +
                 "gi.show(), which is called showInfo()/showGauges(). *** AND ITS ORDINAL IS 40 BECAUSE 39 " +
                 "WAS TAKEN WHILE THIS ROUND WAS BEING BUILT -- the collision gateSweep-selfcheck warns " +
                 "about, arriving in the round that added the warning's own next entry.",
    }),
    since41: Object.freeze({
        at: "v4415", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/orreryAuthor-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly in ~6s, five sections including a live browser render. " +
                 "docs/EXPLAIN-ITSELF.md item 8, the inversion Keith asked for: the author as the sun. THE " +
                 "OPENING MEASUREMENT IS THAT THE FIELD DID NOT EXIST -- orrery.json's fifteen bodies carry " +
                 "name, date, sha, bytes and files, and no owner, url or repo on any of them; world/orrery.mjs " +
                 "has split them CAPTURED vs UNPAPERED since v4185 and never asked WHOSE they are. PAPERED IS " +
                 "NOT ATTRIBUTED: htmx ships 0BSD, whose text says THE AUTHOR and names nobody. SIX KINDS -- " +
                 "9 person, 4 collective, 1 disclaimed, 1 prose, 0 none, 0 unread -- giving 12 authors over 13 " +
                 "bodies with 2 carried as unattributed rather than dropped or guessed. ONLY 3 OF 15 RECORD " +
                 "WHERE THEY CAME FROM, so this is the field a GitHub universe needs and not that universe. " +
                 "Driven RED by four sabotages (MEASURED 1/2/2/1 by name), one of which cost only ONE red " +
                 "until a second independent reader was added -- the first draft falsely accused vendor/fonts " +
                 "of having no licence, reproducing a bug orrery.mjs had already been fixed for three times",
    }),
    since42: Object.freeze({
        at: "v4416", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/provenanceRecord-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly in ~2s, four sections. docs/EXPLAIN-ITSELF.md item 8's next " +
                 "step, and mostly a correction of the round that named it. v4415 measured 'only 3 of 15 " +
                 "bodies record where they came from'; the true figure was 5, and it is 11 now. THE SCAN " +
                 "CARRIED FIVE SEPARATE TOO-NARROW PATTERNS AND EACH WAS FOUND ONLY BY WIDENING THE ONE " +
                 "BEFORE: the record must be .md (missed gifenc and slug), the URL must be http (missed " +
                 "gifenc's git://), the file must be called PROVENANCE (missed htmx/VERSIONS.txt, a full " +
                 "record), the host must be github.com (missed raw.githubusercontent.com), and my own fix " +
                 "for the third capped depth at 2 and LOST vendor/wasm, which the rule it replaced had " +
                 "found -- a widening that narrows is a narrowing. v4415 wrote a paragraph about replacing " +
                 "its own licence regex with orrery.mjs's isLicenceFile TWO LINES ABOVE the first of them. " +
                 "The rule is structural now rather than a list of guessed filenames. SIX RECORDS WRITTEN " +
                 "from evidence in the tree, four bodies frozen BY NAME as genuinely unrecorded. AND THE " +
                 "SCRAPE IS PROVED WRONG WHERE IT MATTERS MOST: the commonest GitHub URL inside vendor/three " +
                 "is KhronosGroup/glTF at 59 against mrdoob/three.js at 9, because the glTF loader cites the " +
                 "specification it implements. Driven RED by four sabotages (MEASURED 6/3/3/3 by name)",
    }),
    since43: Object.freeze({
        at: "v4417", swept: 1, green: 1, red: 0,
        added: Object.freeze(["physics/render/pathTracerGpu-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, ~3.6s singly -- OVER the 3000 ms quick-sweep budget and correctly so: " +
                 "it launches a real browser and runs eleven GPU dispatches. #164, the path tracer on a GPU. " +
                 "v4290 REFUSED THE TRANSPLANT WITH A REASON AND THE REASON IS FALSE ON THE FURNACE: with a " +
                 "dyadic albedo and a power-of-two spp the f64 render is EXACTLY REPRESENTABLE IN f32, so " +
                 "the comparison is bit-exact rather than tolerance-bound -- 11,072 pixels over seven " +
                 "configurations, zero differing. BOTH PRECONDITIONS ARE MEASURED NECESSARY (a non-dyadic " +
                 "albedo costs 163 non-exact pixels of 576, a non-power-of-two spp costs 26 to 39). AND THE " +
                 "CONVEXITY ARGUMENT IS A THEOREM ABOUT REALS THAT f32 BREAKS: the first run differed on 152 " +
                 "pixels, 120 of them INTERIOR, reading rho mixed with rho^2 because an eps chosen for f64 " +
                 "sits below the f32 noise floor and the bounce re-hit its own surface. Two repairs were " +
                 "wrong first -- a tuned absolute eps that failed at the next frame size, and a 'relative' " +
                 "eps that was a NO-OP because length(P - centre) is exactly the radius at every bounce " +
                 "origin -- before the origin was moved off the surface, which is insensitive to eps over " +
                 "three decades. SECTION 4 IS A CHECK ON THE OTHER CHECKS: it plants a broken cosine sampler " +
                 "and measures that the furnace CERTIFIES IT bit-exactly, because what makes the comparison " +
                 "decidable is what makes it blind; the gradient sky catches the same plant at 18,660x the " +
                 "clean f32 floor. Four sabotages, 2/2/1/1 red by name. ORDINAL 43 BECAUSE 42 WAS TAKEN BY A " +
                 "CONCURRENT v4416 WHILE THIS WAS VERIFYING -- in a JavaScript object literal the later key " +
                 "silently wins and one round's swept count vanishes from the surplus arithmetic. The round " +
                 "renumbered from v4416 to v4417 for the same collision, one level up.",
    }),
    since44: Object.freeze({
        at: "v4418", swept: 1, green: 1, red: 0,
        added: Object.freeze(["physics/render/rtPipeline-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, ~6s singly -- OVER the 3000 ms quick-sweep budget and correctly so: it " +
                 "launches a real browser and runs eighteen GPU dispatches. #164's other road, WebRTX's hit " +
                 "shaders, WITHOUT building or vendoring webrtx (measured again this round: cargo and node " +
                 "are here, wasm-pack is NOT, vendor/webrtx does not exist). FOUR OF VULKAN'S FIVE RT STAGES " +
                 "WERE ALREADY IN v4417'S LOOP, INLINED AND UNNAMED -- the monolith was missing the seams, " +
                 "not the stages. Splitting them behind a shader binding table is bit-exact against both " +
                 "v4417 and the CPU (0 of 576 each way), and the capability the seams buy is TWO GEOMETRIES " +
                 "WITH TWO MATERIALS IN ONE DISPATCH, which v4417 has nowhere to put -- graded by the same " +
                 "instrument, because a product of dyadic albedos is dyadic so interreflection stays exactly " +
                 "representable. THE ORACLE HAS A BOUNDARY AND THE GATE ASSERTS ITS SHAPE RATHER THAN ITS " +
                 "ABSENCE: one geometry is bit-exact by an argument, two survives everywhere tested, three " +
                 "breaks at 1 pixel of 1024 whose delta times spp is 1.578 -- a whole flipped sample, not a " +
                 "rounding drift. AND THE FURNACE IS BLIND TO THE MATERIAL TOO: a mirror and a diffuse differ " +
                 "on 15 pixels under a constant sky and 70 under a gradient, the same blindness found after " +
                 "the sampler (v4417) and the seeding scheme (v3487). Five sabotages, 3/2/1/2/2 red by name.",
    }),
    since45: Object.freeze({
        at: "v4419", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/patternWidth-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly in ~4s, four sections. v4416 closed with a claim it could " +
                 "not check -- that it could not prove there was no SIXTH narrow pattern -- and this is the " +
                 "detector for the species, VALIDATED AGAINST v4416's OWN FIVE, which is what none of the " +
                 "five original scanners ever was. The shape: a pattern that NAMES A KIND of file and rejects " +
                 "a file in this tree plainly of that kind. IT FOUND THE SIXTH -- world/orreryEjecta.mjs's " +
                 "isPaperFile, anchored at the filename start, made shaders/ASHIMA-LICENSE.txt and " +
                 "vendor/fonts/IBMPlexSerif-OFL.txt into CODE MASS while world/orrery.mjs's isLicenceFile, " +
                 "in the same tree, called them licences: THE SAME FILE PAPERWORK TO ONE FUNCTION AND PAYLOAD " +
                 "TO ANOTHER, and 4,456 bytes of licence drawing a planet's radius. AND THE DETECTOR " +
                 "COMMITTED THE SPECIES TWICE WHILE BEING WRITTEN: it counted world/gpuProvenance.mjs, a " +
                 "MODULE, as a provenance record; and its kind matcher searched for literal words, so " +
                 "LICEN[CS]E did not read as naming the licence kind and the very instance that motivated " +
                 "the round was invisible to it. Sixth and seventh sightings, inside the detector for the " +
                 "species. Driven RED by four sabotages (MEASURED 3/2/1/2 by name)",
    }),
    since46: Object.freeze({
        at: "v4420", swept: 1, green: 1, red: 0,
        added: Object.freeze(["ui/stageFlags-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, well under the quick-sweep budget -- it tests a RULE as arithmetic and " +
                 "walks the tree for a caller census, with no browser. Keith asked for the full avatar, llama " +
                 "and 3D gauges view before the WebGPU gauges scene. IT WAS ALREADY BUILT AND THE DOCK COULD " +
                 "NOT REACH IT: face/avatarStage.js's diorama scene puts 'the avatar + 3 gauges + llama all " +
                 "sit together as one group', and every rigged slot asks for scene=focus and pet=0. AND pet=1 " +
                 "WAS UNREACHABLE RATHER THAN UNUSED -- avatarstage.html forced the pet off for any embed=1 " +
                 "caller, so the flag did nothing. v3656's stated reason was 'a 143x210 box', and v4414 " +
                 "retired that box (host/row 0.263 -> 1.000, 676 px). The veto outlived its reason by five " +
                 "versions. Loosened to a DEFAULT only after counting who relied on it: exactly two embed " +
                 "callers, both already passing pet=0, so nothing that ships moved. The rule moved to NEW " +
                 "ui/stageFlags.mjs because a gate cannot test a line inside a page's inline module without " +
                 "restating it, and a restated rule is a second declaration. Rotation: stage3d before " +
                 "gauges3000, blobgpu last -- which overrules v4033's stated preference on purpose, and the " +
                 "ASSERTION MOVED RATHER THAN BEING DELETED, now pinning the whole three-mode tail (stronger " +
                 "than 'one named mode is last', which could not have caught a mode inserted in the wrong " +
                 "place). The first draft of the census check accepted N or N+1 with an ||; a ratchet " +
                 "satisfiable by two numbers cannot do its job, and it is an equality now. Four sabotages, " +
                 "1/2/5/3 red by name.",
    }),
    since47: Object.freeze({
        at: "v4421", swept: 1, green: 1, red: 0,
        added: Object.freeze(["ev/shipDebris-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, well under the quick-sweep budget -- ballistics as arithmetic and a " +
                 "comment-stripped read of flightView, no browser. #167: a ship's death was ONE additive " +
                 "point sprite and `grep -n debris ev/flightView.js` returned nothing. AND ITS COLOUR WAS THE " +
                 "FIFTH FIRE v4412'S CENSUS COULD NOT SEE: SOURCES is a table of {file, symbol, sample} and " +
                 "walks NAMED RAMP FUNCTIONS, while this colour was three expressions inside an argument " +
                 "list -- no symbol, so no row was possible. Measured across the twelve additive-blending " +
                 "files: flightView has 3 inline colour writes, avatarStage 1, the other ten none, so the " +
                 "population is small and named rather than guessed. THE FIX WAS A NAME: explosionSample IS " +
                 "the expression the draw call computed, extracted bit-identically at 201 sample points, so " +
                 "the picture did not move and the census gained a row. The hull leaves now -- 7 " +
                 "deterministic fragments inheriting the ship's velocity, reach 17.3 to 44.3 px over 80 " +
                 "frames, monotone, none inward. AND SABOTAGE D COST ZERO RED: the check tested for " +
                 "explosionSample(f) against RAW SOURCE and MY OWN COMMENT contained that string, so prose " +
                 "about the code satisfied a check about the code -- commentFalsePass's own species, inside " +
                 "a gate asserting a rewrite had happened. Comments are stripped before any idiom is " +
                 "asserted now. Five sabotages, 1/3/1/1/2 red by name.",
    }),
    since48: Object.freeze({
        at: "v4422", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/predicatePairs-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly in ~8s, four sections. v4419 named the half nothing did -- " +
                 "that nothing DISCOVERS two functions answering the same question -- and it is where v4418's " +
                 "own finding lived, since that pair was compared BY HAND. The signature is mechanical: run " +
                 "every predicate over one corpus and compare the sets. identical is a duplicate, CONTAINMENT " +
                 "is a designed hierarchy, CROSSING is two functions answering one question and disagreeing. " +
                 "v4418's fix turned that pair from crossing to containment, which is the fixture. IT THEN " +
                 "FOUND A DEFECT IN THE WIDEST RULE IN THE TREE: v4263 widened isLicenceFile three times to " +
                 "stop false accusations and nobody asked the other direction -- TWO OF THE SIX FILES IT " +
                 "MATCHED WERE .mjs MODULES, brain/rl/attribution.mjs and its gate. A licence is a DOCUMENT, and " +
                 "the constraint costs nothing: all 17 vendored licences stay matched. AND THE DETECTOR " +
                 "NARROWED ITSELF FOUR TIMES before it could see its own motivating case -- a 700-character " +
                 "body cap shorter than isPaperFile's comment, comments scanned for calls, a probe corpus of " +
                 "400 names holding no licence, and raw agreement as the measure. Driven RED by four " +
                 "sabotages (MEASURED 3/1/2/1 by name)",
    }),
    since49: Object.freeze({
        at: "v4423", swept: 1, green: 1, red: 0,
        added: Object.freeze(["render/fireSpread-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, well under the quick-sweep budget -- two automata stepped as arithmetic " +
                 "against a stub world, no browser. #171, what was left of #163: v4412 compared the fires on " +
                 "COLOUR and wrote down that the spread rules were still uncompared. THE AXIS IS whether a " +
                 "fire consumes what it burns and what its front does. MEASURED: world/fireSystem.js travels " +
                 "1 cell per step, chars 40 of 40 cells to ASH and GOES OUT BY ITSELF at t=5.9s; " +
                 "render/doomFire.mjs held lit has a source row summing 288 at step 0 and 288 at step 1200 -- " +
                 "IT CONSUMES NOTHING and never goes out, and extinguishing ends it in 48 steps by DECAY. One " +
                 "is a steady-state intensity field, the other a travelling front that eats its substrate, " +
                 "and they cannot be swapped. AND THE FIRST READING OF THE PLATEAU WAS THE GRID CEILING: 34-40 " +
                 "rows on 8x40 looked like a steady state and was the top of the array; run taller the mean " +
                 "goes 38.6 / 38.8 / 39.1 at heights 100 / 200 / 400 and CONVERGES, so ~39 rows belongs to " +
                 "the decay rate. The gate asserts the 40-row case IS ceiling-limited so the trap stays " +
                 "visible. THIS IS ALSO THE FIRST GATE world/fireSystem.js HAS EVER HAD -- it needed a world " +
                 "and nobody had stubbed one; lineWorld is that stub, checked to contain no fire logic of its " +
                 "own so the harness cannot agree with itself. Four sabotages, 1/1/4/1 red by name.",
    }),
    since50: Object.freeze({
        at: "v4424", swept: 1, green: 1, red: 0,
        added: Object.freeze(["render/colourReach-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, a tree walk and three predicates, no browser. Keith named fireworks, " +
                 "plasma and lightning, and ALL THREE ARE INVISIBLE TO THE DETECTOR v4421 USED TO DECLARE THE " +
                 "POPULATION SMALL: that detector looked for gl.blendFunc(gl.ONE) -- files that own their " +
                 "draw call -- and an effect handing a colour to a shared particle system never calls it. " +
                 "Re-taken: 5 named ramps, 13 draw-site files, 75 literal-colour files, ZERO IN BOTH. The two " +
                 "mechanisms share no file at all, which is why one reported the other as absent rather than " +
                 "as small -- v4413's substring rule a third time, and the third round running where the " +
                 "instrument's REACH was what was wrong. HOT_UNREGISTERED freezes the 29 hot effects the " +
                 "census does not reach, as NAMES rather than a count. Two of my own errors are recorded: the " +
                 "header's headline numbers came from shell greps (12/87) and disagreed with the module's own " +
                 "predicates (13/75), and the frozen list was pasted from a terminal head -16. AND WRITING THE " +
                 "ROUND CHANGED THE CENSUS'S ANSWER: the version comment, this ledger entry and the module " +
                 "header all QUOTE the blendFunc pattern, so a raw reader counted 17 draw sites and put two " +
                 "files into the overlap the finding rests on being empty. commentFalsePass a third time in " +
                 "one session. Comments are stripped now; 20 hot effects unregistered, not 29. Five " +
                 "sabotages, 3/3/1/4/1 red by name.",
    }),
    since51: Object.freeze({
        at: "v4426", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/demosReach-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, a directory walk plus SHA-256 known-answer tests, no browser. #170: " +
                 "demos_code/ is 56 files and 19,110 lines and is excluded from BOTH staleness.mjs and " +
                 "buildKnowledgeIndex, so a gate living there would exist, pass by hand and NEVER RUN ON A " +
                 "SHIP -- the exact defect staleness.mjs's own header records for the old vendor pattern. " +
                 "FIRST THING CHECKED: it has not happened, ZERO gates inside, so the exclusion costs " +
                 "COVERAGE and not correctness, and the check makes that a standing fact rather than luck. " +
                 "242 function names there, 7 colliding with exported symbols, AND EVERY COLLISION WITH AN " +
                 "ORACLE AGREES: the demo's hand-rolled SHA-256 passes 3 of 3 FIPS 180-4 vectors and matches " +
                 "node crypto on 200 of 200 random inputs, and mat4Identity is the same matrix in a different " +
                 "container. Its header's claim of 'real double-SHA-256' was TRUE and had never been checked " +
                 "in 4,412 versions. v4412's fireRamp was a trap because two colour ramps shared a name and " +
                 "differed; these share a STANDARD, which has a known answer to test against. Names are read " +
                 "from code and not prose by default -- v4424's lesson applied on arrival, 245 raw vs 242 " +
                 "stripped. Four sabotages, 2/2/1/1 red by name.",
    }),
    since52: Object.freeze({
        at: "v4427", swept: 1, green: 1, red: 0,
        added: Object.freeze(["render/blobField-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, field arithmetic and two source reads, no browser. #169 asked to compare " +
                 "two blobulators' ONE SDF and THERE IS NO SHARED SDF: blobulator.html thresholds a DENSITY " +
                 "(1 - SUM r^2/(d^2+0.35), marched at 0) and blobulator-gpu.html marches a DISTANCE " +
                 "(smin of sphere SDFs). AND r IS NOT THE SAME QUANTITY -- the CPU surface is sqrt(r^2-0.35), " +
                 "a closed form matched to bisection at four decimals, so a blob of r=1 renders 19.4% " +
                 "smaller, and below r=0.5916 it is INVISIBLE on one page and solid on the other. At the " +
                 "waist of two unit blobs the pages disagree about whether the shape is CONNECTED. SECOND " +
                 "FINDING: v2438 deduplicated fireRamp on blobulator.html and MISSED the WGSL copy next " +
                 "door, which had drifted at one stop of six -- c4 (1.0,0.85,0.35) against the shared " +
                 "(1.0,0.82,0.32), widest divergence 0.0200 at heat 0.90 and 0.0000 below 0.68. Corrected, " +
                 "and both are read from source now. AND A SABOTAGE READ ZERO RED: dropping smin's " +
                 "-k*h*(1-h) term tripped nothing, because the gate checked the WGSL ramp and left the WGSL " +
                 "SMIN unchecked -- a transcription is a second declaration, committed inside the round " +
                 "reporting one. Drift in either direction goes red now. Five sabotages, 1/3/1/1/1 by name.",
    }),
    // v4429 -- the fifty-third closing. #168's gate, driven through eleven sabotages before it shipped; three
    // of the eleven read ZERO RED on the first pass and each one named a real gap, which is why the entry
    // below records the sabotage count rather than only the colour.
    since53: Object.freeze({
        at: "v4429", swept: 1, green: 1, red: 0,
        added: Object.freeze(["render/blobFire-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, field arithmetic and two source reads, no browser. #168 said the " +
                 "blobulator paints heat with the blackbody ramp and has no fire; measured, what it handed " +
                 "the ramp was heat = 1 - py/worldH*1.05 plus two sines of (px, t) -- no blob in scope and " +
                 "no memory, the same 0.582477 for clustered blobs, distant blobs and none at all. THE ROUND " +
                 "THEN CORRECTED ITS OWN SELECTION CRITERION: it chose doomFire's rule over fireSystem's on " +
                 "v4423's measurement that doomFire consumes nothing, and an interior source went out in ten " +
                 "frames -- 218 cells at MAX at step 0, total 0 by step 60. The persistence belongs to the " +
                 "BOTTOM ROW, whose back index i+w is off-grid so step() never writes it; an interior cell's " +
                 "is on-grid and the cold cell below overwrites it. Maintained, it settles: 19458 at step 60 " +
                 "and 19605 at 1200. SECOND FINDING: the unclamped write wraps -- 50 cells of heat right of " +
                 "a source no transport can carry heat rightward from -- and the gutter that stops it is " +
                 "MAX_DECAY wide, DERIVED, where a guessed 1 still leaves 47. THIRD: v4410 made the flow a " +
                 "field and left the LEAN welded to it; |perp| over the eight directions is 1, 63, 64 or 65 " +
                 "and never 0, so no field can make this fire rise straight -- the plume shears 0.95 columns " +
                 "per row, which is E[decay] = 1. AND THREE SABOTAGES READ ZERO RED: transposing heatAt's " +
                 "bilinear weights, flipping worldToCell's y, and clamping out-of-rect reads instead of " +
                 "returning 0. heatAt IS THE PIPE THE PAGE DRAWS THROUGH and nothing graded it; an " +
                 "upside-down fire would have shipped green. Section 6 exists because of them. Eleven " +
                 "sabotages, all RED by name, three files md5-identical.",
    }),
    // v4431 -- the fifty-fourth closing. #69's gate, driven through sixteen sabotages; THREE read ZERO RED on
    // their first pass and all three named the same hole, which is why the entry records the shape and not
    // just the colour.
    since54: Object.freeze({
        at: "v4431", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/explosionRecipe-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, arithmetic and three source reads, no browser. #69 asked whether the " +
                 "space explosions are a recipe or a port, and the answer is that the recipe CANNOT express " +
                 "the port, categorically rather than approximately. Gap 1: the recipe's only velocity term " +
                 "is gravity, and speed under it is sqrt(v0^2 + (g t)^2) -- non-decreasing for every g, over " +
                 "96,200 (g, t) pairs with 0 violations -- while the port's drag only decreases; the best-fit " +
                 "gravity against the port's speed curve is EXACTLY 0, the identity, leaving 64.0% of the " +
                 "launch speed unexplained. A best fit that picks 'do nothing' says the family is wrong. " +
                 "Gap 2: colour and sprite are constants in the recipe and curves in the port (1.000,0.600," +
                 "0.250 to 0.007,0.004,0.002; 8 px to 35.8 px; a fireball 26 to 150 with its own life). " +
                 "Gap 3: shatter's comment that the pieces 'cannot all leave in one direction by luck' is " +
                 "EXACTLY TRUE against a bound nobody had derived -- 0 of 20,000 seeds exceed 2*(TAU/7) and " +
                 "the worst sits 0.0029 under it -- while an independent draw, the recipe's family, breaks it " +
                 "80.1% of the time. AND ONE NEGATIVE RESULT MADE THE PORT POSSIBLE: the port's per-frame " +
                 "drag agrees with dv/dt = -drag*v to 0.4% at 60 fps and spreads 2.4% over a sixteenfold " +
                 "frame-rate range, so drag is expressible as a number. novaBurst is added to the book with " +
                 "every field an expression over ev/shipDebris.mjs at the scale spellbook.html states in its " +
                 "own draw (16 px/unit -- at which the port's 3.2 px debris is EXACTLY quake's 0.2 particle). " +
                 "The six pre-existing spells are byte-identical, 30 hashes of 30. AND THREE SABOTAGES READ " +
                 "ZERO RED, all the same hole: the gate checked the BOOK against novaFromPort and never " +
                 "novaFromPort against the PORT -- a two-link chain with one link checked. The third round " +
                 "running whose zero-red found an unchecked link in a transcription chain (v4427's WGSL " +
                 "smin, v4429's heatAt). The repair perturbs the port and requires every derived field to " +
                 "follow, which a correct literal cannot do. Sixteen sabotages, all RED by name.",
    }),
    // v4432 -- the fifty-fifth closing. The Disney BSDF gate, driven RED by four sabotages; one of them
    // found a real defect in my own work, which is why the entry names the reciprocity row.
    since55: Object.freeze({
        at: "v4432", swept: 1, green: 1, red: 0,
        added: Object.freeze(["physics/render/principled-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly in ~4s, four sections. docs/EXPLAIN-ITSELF.md item 9, from " +
                 "reading knightcrawler25/GLSL-PathTracer (MIT, C++/OpenGL, Disney BSDF). The tree had every " +
                 "PIECE of a principled model -- GGX, Fresnel, the multi-scatter table, Oren-Nayar -- and no " +
                 "composition at all. *** ITEM 9 PREDICTED THE LOBES WOULD DOUBLE-COUNT AT THE SEAMS AND THE " +
                 "FURNACE SAYS BY HOW MUCH: 1.0796, EIGHT PER CENT MORE LIGHT THAN ARRIVED *** at metallic 0, " +
                 "roughness 1, cosO 0.15, because Disney scales the diffuse lobe only by (1 - metallic) and " +
                 "Schlick's grazing term rides on top. That is Disney's stated trade, not a porting error, so " +
                 "BOTH weightings ship and each is held to what it is: the coupled one conserves at 0.99813. " +
                 "The composed model IS roughDiffuse at its diffuse limit to 9.6e-15, which is the rule " +
                 "pathTracer.mjs states -- assembled FROM the graded modules, not beside them -- made " +
                 "falsifiable. THREE INSTRUMENT FINDINGS: `specular: 0` does not remove the specular lobe " +
                 "(Schlick keeps its grazing term at F0 = 0); albedoSplit isolated a lobe by zeroing " +
                 "baseColour, which also zeroes a metal's F0; and the mirror limit reads ZERO at roughness " +
                 "0.001 because a near-delta lobe steps through a fixed grid -- the collapse MOVES from " +
                 "roughness 0.15 to 0.05 when N goes 192 to 768, and a limit that moves when you refine the " +
                 "instrument is the instrument. Driven RED by four sabotages (MEASURED 1/1/1/3 by name), one " +
                 "of which found that my own coupled weighting was NOT RECIPROCAL and put a row in to say so",
    }),
    // v4433 -- the fifty-sixth closing. #139's gate. Two sabotages read ZERO RED and both were found by
    // hunting for them deliberately after the first thirteen all went red -- which is the only reason the
    // round has a corroboration check at all.
    since56: Object.freeze({
        at: "v4433", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/orreryUniverse-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, JSON and directory reads, no network and no browser. #139 asked for " +
                 "country, default language and contributor count as orrery axes. MEASURED BY CALLING THEM: " +
                 "search endpoints are not repo-scoped and per-repo endpoints are, so default language is " +
                 "reachable (search_repositories returns it) while contributor count is refused (both routes " +
                 "are per-repo; list_commits AND list_repository_collaborators on mrdoob/three.js returned " +
                 "the identical refusal) and country is refused (search_users returns five keys and none is " +
                 "a location). Both refusals are recorded WITH the local proxy that would have been a " +
                 "different quantity wearing the right name. *** AND THE FIRST TIME ANYTHING ASKED GITHUB " +
                 "ABOUT THESE OWNERS, ONE WAS NOT THERE: *** justjakel/quickjs-emscripten does not exist, " +
                 "justjake/quickjs-emscripten has 1,702 stars, and the tree attributed 810,948 vendored " +
                 "bytes to the first. The file the scanner reads names the owner 42 times -- 41 right, 1 " +
                 "wrong -- and the wrong one is line 5, the identity line, THE ONLY LINE ANYTHING READ. " +
                 "upstreamFrom() took the FIRST GitHub URL; it now votes on the owner of the repo that URL " +
                 "names and reports the vote. Its header records four earlier widenings; this defect was not " +
                 "narrowness at all. SECOND FINDING: GitHub's language against the tree's own LANGUAGE_BIOME " +
                 "gives 6 agree, 2 built, 2 transpiled, 1 paperwork, 0 UNEXPLAINED -- and the three " +
                 "mechanisms are genuinely distinct, since box3d and wasm DO vendor their source (7 .c + 8 " +
                 ".h, 7 .ts) under a 1.45 MB .a and 511 KB of .wasm, while jolt and taichi-js vendor NOT ONE " +
                 "file of their upstream language. taichi-js was invisible until the absence test was moved " +
                 "BEFORE the biome test, because TypeScript and JavaScript are one biome and a bundled .js " +
                 "therefore agreed with a TypeScript upstream. ZERO RED TWICE: flipping three.js's stored " +
                 "language to TypeScript passed everything (the gate has no network, and both map to " +
                 "forest) until agreement was required to be corroborated by the vendored bytes; and adding " +
                 "'js' to the build-artifact set went inert the moment the ordering was fixed, until the set " +
                 "was held against the tree's own legend. Fifteen sabotages, all RED by name, six files " +
                 "md5-identical.",
    }),
    // v4434 -- the fifty-seventh closing. The FIRST gate ui/pageFxOverlay.js has ever had, and the first thing
    // driving it produced was a listener leak. Three instruments measured themselves before one measured it.
    since57: Object.freeze({
        at: "v4434", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/pageFxOverlay-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, jsdom and the real voxel module, no browser. ui/pageFxOverlay.js was " +
                 "named as ungated at v4424 and stayed ungated for ten rounds. Driven for the first time, it " +
                 "LEAKED ONE WINDOW LISTENER PER OPEN: `pointerup` was registered as an anonymous arrow, so " +
                 "closePageFx had nothing to pass to removeEventListener, and the count read 1, 2, 3, 5 over " +
                 "cumulative loads of 1, 2, 3, 5 -- exactly one per cycle, unbounded. Each orphan closes over " +
                 "the same scope as `state`, retaining the whole voxel grid (2,120 voxels of 8 numbers for a " +
                 "240x320 page, about 136 KB) and, under shatter, a live physics backend. A SECOND leak was " +
                 "latent on the throw path: host._resize was assigned on openPageFx's LAST line, so anything " +
                 "throwing before it left the resize listener up with nothing holding a reference to remove " +
                 "it by. Both handlers are stashed at registration now and both removed on close; measured 0 " +
                 "of every type after 5 cycles and after a throwing open. *** THREE INSTRUMENTS MEASURED " +
                 "THEMSELVES BEFORE ONE MEASURED THE OVERLAY: *** counting calls to removeEventListener (a " +
                 "no-op call still counts), dispatching probes through a wrapped addEventListener (the probe " +
                 "could not remove its own wrapper, so the reading counted leaked probes), and injecting " +
                 "window's globals BEFORE wrapping (the overlay calls the BARE global, so every reading was " +
                 "0). AND TWO SABOTAGES READ ZERO RED: giving plasma ripple's exact body passed, because " +
                 "ripple calls Math.random and two identical filters still differ by noise -- and passed " +
                 "AGAIN after the random was pinned, because one shared stream let plasma continue where " +
                 "ripple left off. The seed restarts per filter now. Un-exporting FILTERS crashed the gate " +
                 "rather than failing it by name, which is not a red anybody can read; it fails by name now. " +
                 "Eleven sabotages, all RED by name, two files md5-identical.",
    }),
    // v4435 -- the fifty-eighth closing. The gate that grades an absence claim, and the claim it grades is
    // mine from two rounds ago. Four sabotages; the one that read ZERO RED found a check that could not fail.
    since58: Object.freeze({
        at: "v4435", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/absenceScope-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly, six sections. docs/EXPLAIN-ITSELF.md item 10 said at v4432 " +
                 "that the tree has NO BVH, citing a grep over physics/, render/ and world/. THE TREE HOLDS " +
                 "TWELVE FILES OF REAL BVH CODE AND THE CLAIM NAMED TWO, and it failed three separate ways: " +
                 "mesh/meshBVH.mjs -- a binned-SAH ray-triangle BVH with a green gate since v4221 -- sits in " +
                 "a directory the grep never searched; physics/sph/bvhNeighbours.mjs WAS searched and got " +
                 "summarised away; and physics/render/rtPipeline.mjs matched only because it SAYS 'NO BVH', " +
                 "a denial counted as a presence, which is item 5's defect in the last place anybody would " +
                 "look for it. The narrow claim survives (the tracer really has no BVH) and the sentence " +
                 "supporting it does not. *** AND THE ROUND'S OWN DETECTOR COMMITTED THE ROUND'S OWN DEFECT " +
                 "ON THE FIRST TRY: *** `\\bbvh\\b` missed mesh/meshBVH.mjs, because its code carries the " +
                 "term in exactly one identifier -- MeshBVH -- and there is no word boundary between Mesh " +
                 "and BVH. A regex word boundary is a rule about punctuation and a programmer's word " +
                 "includes the camel hump. tokenMatch grades humps instead. Item 10 is rewritten: not " +
                 "'build a BVH' but 'two-level the SAH BVH the tree already ships and point rtPipeline at " +
                 "it', and its stated hard part -- the value key -- ALREADY HAS ITS INSTRUMENT, since " +
                 "neighbourBakeoff-selfcheck measured a BVH against a grid once and concluded the GRID " +
                 "wins. Four sabotages, MEASURED 10/2/0-then-1/6 by name. THE ZERO IS THE INTERESTING ONE: " +
                 "dropping the path check cost nothing, because once tokenMatch understood humps the path " +
                 "check rescued 0 of 14 files -- unfalsifiable rather than wrong -- so it is now graded " +
                 "against a fixture tree and the sabotage costs one row.",
    }),
    // v4436 -- the fifty-ninth closing. Specular transmission, and most of the file is EXACT rather than
    // measured. Four sabotages; the zero found unfalsifiable code for the second round running.
    since59: Object.freeze({
        at: "v4436", swept: 1, green: 1, red: 0,
        added: Object.freeze(["physics/render/transmission-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, 27 checks in five sections. docs/EXPLAIN-ITSELF.md item 9's next round, " +
                 "closing the fourth of the five gaps v4432 named in writing. Design read from " +
                 "mmacklin/tinsel (Zlib) and NO code taken; the maths is Walter et al. 2007, a paper rather " +
                 "than a repository. *** WHAT MAKES THIS GRADEABLE WHERE v4432 WAS ONLY MEASURABLE IS THAT A " +
                 "DIELECTRIC HAS LAWS RATHER THAN LIMITS. *** Snell holds to 1e-12 relative; R + T = 1 " +
                 "across 164 samples to 1e-14; the smooth interface transmits EXACTLY zero past the " +
                 "critical angle by branch; and the non-reciprocity is itself exact -- " +
                 "f(i->o)/etaO^2 == f(o->i)/etaI^2 to 4.7e-16, while PLAIN reciprocity fails by exactly " +
                 "2.25x ON A CORRECT LOBE, so a row copied from the reflection side would red the right " +
                 "answer. *** THE FIRST DRAFT PARAMETERISED BY ROLE AND THAT WAS THE BUG. *** n1/n2 name " +
                 "the incident and transmitted media, and A ROLE FLIPS WITH THE DIRECTION OF TRANSPORT " +
                 "while a SIDE DOES NOT: the energy integral came back a converged 0.477 against Fresnel's " +
                 "0.95, a deficit of almost exactly 1.5^2 -- the eta-squared factor from the file's own " +
                 "header, arriving as a bug in the file describing it. nAbove/nBelow cannot be swapped by " +
                 "accident. AND REFINING THE INSTRUMENT IS WHAT SORTED IT: the total held at 0.47700 from " +
                 "N=128 to N=1024, and a wrong number that does not move is the MODEL where one that moves " +
                 "is the GRID -- the same rule that said the opposite about v4432's mirror limit. *** TWO " +
                 "PREDICTIONS IN THE HEADER CAME BACK BACKWARDS. *** It predicted the rough dielectric " +
                 "would LOSE energy like single-scatter GGX; it GAINS, worst 1.28276 at alpha 1 cos 0.25, " +
                 "more than triple v4432's opaque 1.0796 -- and the reflection half is CLEARED rather than " +
                 "argued, agreeing with microfacet.mjs's graded directionalAlbedo to 1.6e-6 including the " +
                 "0.37889 v4432 reported. It also predicted the rough lobe would transmit zero past the " +
                 "critical angle; it does not and should not, because a tilted facet can present a local " +
                 "incidence inside it -- leakage runs 3.1e-6 at alpha 0.001 to 0.435 at alpha 0.8, monotone, " +
                 "so the falsifier is the monotonicity and not a zero. AND THE SWEEP FOUND A NaN IN A GATED " +
                 "MODULE: physics/render/fresnel.mjs returned T = NaN at EXACTLY grazing incidence, because " +
                 "the projected-solid-angle ratio is Infinity times zero there. Its own gate tests cos 1e-3, " +
                 "1e-5 and 1e-7 -- APPROACHING A BOUNDARY IS NOT EVALUATING IT -- and a NaN in T propagates " +
                 "silently through every R + T downstream. Repaired as a branch beside the TIR branch. Four " +
                 "sabotages, MEASURED 5/4/10/0-then-1 by name; the zero found the half-vector flip " +
                 "unreachable behind Math.abs, a real postcondition nothing asserted, which is v4435's path " +
                 "check one round later in a different file.",
    }),
    // v4437 -- the sixtieth closing. A second estimator for the composed BSDF, and it convicted the sampler,
    // the pdf, the tree's own quadrature and the plan item that asked for it -- four for one.
    since60: Object.freeze({
        at: "v4437", swept: 1, green: 1, red: 0,
        added: Object.freeze(["physics/render/samplerCheck-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, 19 checks in five sections. *** ITEM 11 WAS WRONG AND IT IS THE THIRD " +
                 "ABSENCE CLAIM OF MINE IN THREE ROUNDS TO BE WRONG. *** It said the tracer had never " +
                 "rendered an image and asked for a WGSL raygen pass; pathTracerWgsl.mjs has graded WGSL " +
                 "against a real device since v4290 and pathTracerGpu.mjs ported the TRANSPORT at v4415, " +
                 "agreeing with the CPU BIT FOR BIT on 576 furnace pixels. AND v4415 HAD ALREADY WRITTEN " +
                 "DOWN WHY THAT COULD NOT HELP: its gate carries a row reading 'the furnace CERTIFIES a " +
                 "broken cosine sampler, bit-exactly'. GPU-versus-CPU is not two independent paths when " +
                 "both run the SAME sampler. What was missing was never a device -- it was an estimator " +
                 "sharing no code with the one it checks. *** AND IT CONVICTED FOUR THINGS ON ITS FIRST " +
                 "OUTING. *** ONE: principled.sample() returned NaN on EVERY specular draw from v4432 to " +
                 "v4437, reading h.cosTheta from a function that returns a three-vector with Y up, falling " +
                 "through to Math.cos(h.theta) which is undefined too -- a ternary guarding two GUESSED " +
                 "shapes, and five rounds of 'ungraded' carrying 'broken'. TWO: the pdf was the CHOSEN " +
                 "lobe's rather than the MIXTURE's, worth exactly 2x on a dielectric and INVISIBLE ON A " +
                 "METAL where pSpec is 1 -- the obvious material to test a specular sampler on is the one " +
                 "that hides the bug. THREE: the tree's own quadrature is wrong BY HALF at its default " +
                 "grid for a tight lobe at an oblique angle -- directionalAlbedo defaults to N=96 M=48 and " +
                 "reads 0.334246 where the converged value is 0.991341, and the Monte Carlo had it right " +
                 "from fifty thousand samples. The rule is a PRODUCT and both halves are asserted: a tight " +
                 "lobe alone reads correctly, an oblique angle alone reads correctly. FOUR: the record's " +
                 "own atDefaultGrid was hand-copied from the N=128 rung rather than the default, and the " +
                 "row that re-derives it from the tree caught that within the hour. v4432's headline 1.0796 " +
                 "SURVIVES, checked rather than assumed -- it holds N=96 to N=2048 because roughness 1 is a " +
                 "broad lobe, and the second estimator confirms it independently. The Monte Carlo bound is " +
                 "MEASURED rather than picked: eight seeds give a relative sd of 5.04e-3 and the bound is " +
                 "three of those, after a hand-picked 'half a per cent' went red on ordinary noise. Four " +
                 "sabotages, MEASURED 6/3/3/4 by name, none zero.",
    }),
    // v4438 -- the sixty-first closing. The loose end v4437 wrote down and did not act on: the tree's baked
    // energy table was a quarter wrong at an alpha its own gates build at.
    since61: Object.freeze({
        at: "v4438", swept: 1, green: 1, red: 0,
        added: Object.freeze(["physics/render/albedoEstimator-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, 24 checks in six sections. v4437 ended with a sentence saying every " +
                 "furnace number at low roughness and grazing angles should be re-checked, AND THEN DID NOT " +
                 "CHECK THEM -- leaving the tree standing on an instrument already known to be broken. This " +
                 "is that check, and it is worse than the round predicting it guessed. " +
                 "physics/render/energyCompensation.mjs BAKES A TABLE other modules consume, its first mu row " +
                 "is (0 + 0.5)/K = 0.0208 -- THE MOST OBLIQUE ANGLE THERE IS -- and at alpha 0.05, which is " +
                 "ALPHAS[0] in its own gate, the grid reads 0.705 where the truth is 0.927. TWENTY-FOUR PER " +
                 "CENT WRONG AND SHIPPED; msDirect-selfcheck's coarser N=120 is forty. *** AND THE FIX IS NOT " +
                 "A BIGGER GRID, WHICH THE TIMING SETTLES RATHER THAN TASTE. *** Converging the worst cell " +
                 "needs N > 4800 and 3456 ms for ONE POINT, against a three-second sweep budget for a whole " +
                 "gate. THE TREE ALREADY OWNED THE RIGHT ESTIMATOR AND WAS USING IT ONLY TO CHECK THE WRONG " +
                 "ONE: sampleHalfVector draws from the GGX lobe and bounceWeight cancels the pdf " +
                 "analytically, and together they read 0.8925 at n=60k, 0.8921 at n=2M -- FLAT -- in 18 ms, " +
                 "while the grid climbs 0.686, 0.845, 0.889 and is still moving. A HUNDRED TIMES CHEAPER AND " +
                 "RIGHT: a sampler cannot miss the lobe it is drawing from. buildTable now routes by a RULE " +
                 "(narrow lobe AND oblique view, both halves asserted) rather than by whatever N somebody " +
                 "typed. THE REPAIR MOVES ONLY THE GRAZING ROWS -- 20 of 24 rows unchanged, alpha 0.8 " +
                 "bit-identical -- and the grid path is kept reachable, because energyCompensation-selfcheck's " +
                 "CONVERGENCE-ORDER STUDY genuinely needs a deterministic integrand and now says " +
                 "estimator: 'grid' OUT LOUD. The default and the study want different things and both are " +
                 "right. TWO FINDINGS AGAINST MY OWN WORK: the record conflated the alphas THE RULE FLAGS " +
                 "{0.05, 0.2} with the ones MATERIALLY wrong {0.05}, and a conservative rule flagging more " +
                 "than it must is the rule working, not a mismatch to tune away. And SABOTAGE D READ ZERO " +
                 "RED -- the third zero in four rounds and the sharpest: the row asserted a planted table " +
                 "DIFFERS from the grid table, and with plants routed through the sampler it still differed, " +
                 "because the ESTIMATOR had changed rather than the plant being applied. A check satisfiable " +
                 "by the wrong cause would have left every planting gate in the tree passing for free. " +
                 "Repaired by asserting the mechanism: a planted table must BE the grid with the plant " +
                 "applied, row for row. Four sabotages, MEASURED 4/4/1/0-then-1 by name.",
    }),
    // v4440 -- the sixty-second closing. Vorticity confinement, and a comparative claim that had been sitting
    // in the tree unmeasured with both of its halves already present.
    since62: Object.freeze({
        at: "v4440", swept: 1, green: 1, red: 0,
        added: Object.freeze(["fluid/vorticity-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, 13 checks in five sections. *** THE ROUND SET OUT TO ADD A SMOKE SOLVER " +
                 "AND FOUND THE TREE HAS TWO FLUID SOLVERS -- THE FOURTH ABSENCE CLAIM OF MINE IN FOUR " +
                 "ROUNDS TO BE WRONG, AND THE FIRST CAUGHT BEFORE A LINE WAS WRITTEN. *** fluid/flip2d.mjs " +
                 "and flip3d.mjs are FLIP/PIC solvers on a staggered MAC grid, and fx/vorton/vorton.js is a " +
                 "VORTEX-PARTICLE method, which is the exact technique I had told Keith was absent. Only " +
                 "`vorticity` and `confinement` really were zero. *** AND THE TREE ALREADY HELD THE CLAIM " +
                 "THE TECHNIQUE EXISTS TO ADDRESS: *** vorton.js's header says its method keeps 'the " +
                 "beautiful filamentary wisps A GRID SOLVER SMEARS AWAY' -- a comparative claim written in a " +
                 "file that is not one, with both halves in this tree and nobody having put them in the same " +
                 "room. MEASURED: semi-Lagrangian advection retains 45.4% of its enstrophy over sixty steps, " +
                 "monotonically. Two things are EXACT: the discrete curl converges at second order against " +
                 "an analytic Taylor-Green field (ratios 3.84, 3.96, 3.99, 4.00) and the confinement force " +
                 "is perpendicular to its own gradient to 1.4e-17 over 3844 cells, because a cross product " +
                 "is a cross product. *** AND THE HEADLINE IS THAT CONFINEMENT IS NOT A RESTORATION. *** " +
                 "Bisected, the eps that returns enstrophy to exactly 100% is 15.546, AT WHICH KINETIC " +
                 "ENERGY IS 109.6% OF INITIAL -- a dissipative scheme left with more energy than it started " +
                 "with. There is no ceiling either: eps 40 reaches 286% enstrophy and 160 reaches 6837%. The " +
                 "parameter that makes the vorticity number right is chosen BY the vorticity number being " +
                 "right, which is circular, and that is what a hack with a free parameter looks like when " +
                 "somebody finally measures it. AND vorton's OWN claim is checked for the first time: its " +
                 "induced field is divergence-free to 1.3e-6 relative, with the residual shown to be THE " +
                 "PROBE rather than the field by coarsening the finite difference and watching it worsen. " +
                 "*** THE ANALYTIC REFERENCE HAD THE WRONG SIGN AND THE CODE DID NOT: *** the curl error sat " +
                 "FLAT at 25.1 across four resolutions, exactly twice the amplitude of 4pi, and an error " +
                 "that does not fall with h is not truncation while one equal to twice the signal is the " +
                 "signal negated. Four sabotages, MEASURED 7/2/4/3 by name, none zero.",
    }),
    // v4441 -- the sixty-third closing. The Small Steps claim, tested against this tree's own solver, and it
    // turns out to be CONDITIONAL with the condition located.
    since63: Object.freeze({
        at: "v4441", swept: 1, green: 1, red: 0,
        added: Object.freeze(["physics/xpbd/smallSteps-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, 17 checks in five sections. *** THE PLAN ITEM NAMED A MODULE THAT NO " +
                 "LONGER EXISTS: warp.sim was deprecated in Warp 1.8 and REMOVED in Warp 1.10, its successor " +
                 "being newton-physics/newton (Apache 2.0). *** Fifth round running in which checking a " +
                 "premise before building changed the round. It matters less than it looks, because the " +
                 "reference was never the source: warp, newton and Omniverse all implement Macklin et al. " +
                 "2019, and a paper's claim can be tested against this solver directly. NOTHING IS VENDORED " +
                 "AND NOTHING WAS READ -- the GitHub source was not reachable from this session, which is " +
                 "said plainly rather than implied away. *** TWO RIGS COULD NOT SEE THE CLAIM AND THAT IS " +
                 "WORTH MORE THAN THE THIRD ONE WORKING. *** The tree's OWN hangingLink rig has ONE " +
                 "constraint, and at fixed budget its error falls MONOTONICALLY toward iterations, 4.0e-4 to " +
                 "2.3e-14 -- the exact opposite of Small Steps, and not a refutation, because with one " +
                 "constraint THERE IS NO NETWORK for information to propagate through. A chain of 32 " +
                 "measured at its quasi-static tail still says iterations by under 2x -- also not a " +
                 "refutation, because the steady stretch is what compliance makes iteration-independent, so " +
                 "it asks the 2016 claim rather than the 2019 one. SWEEPING STIFFNESS MAKES IT APPEAR AT " +
                 "ONCE, WITH A SIGN CHANGE: at compliance 1e-3 iterations win 1.38e-2 to 8.17e-3, and at " +
                 "1e-5 SUBSTEPS win 9.80e-4 to 3.08e-2 -- THIRTY-ONE TIMES, at identical total work, " +
                 "monotone in the iteration share. *** THE CROSSOVER IS AT COMPLIANCE 3.487e-4 AND THIS TREE " +
                 "USES COMPLIANCES ON BOTH SIDES OF IT *** -- 0, 1e-6, 5e-6 and 1e-4 below; 5e-4, 8e-4, 1e-3 " +
                 "and 2e-2 above. xpbd.js defaults to `iterations ?? 1`, which is what warp and newton do " +
                 "and is right for the stiff half; modules passing 2, 4, 5 or 8 are right only above the " +
                 "line. AND THE CROSSOVER IS NOT A CONSTANT: it moves 38x with the budget, monotonically, " +
                 "and 620x with chain length, so quoting it as a property of the method would be quoting the " +
                 "test setup. A BISECTION THAT RETURNED ITS OWN FLOOR was caught: at N = 2 substeps never " +
                 "win anywhere in the range, and the search reported the lower bound 1.000e-6 as a crossover " +
                 "a thousand times stiffer than its neighbours -- THE ABSENCE OF A CROSSOVER WEARING A " +
                 "NUMBER. It reports saturation now. Four sabotages, MEASURED 3/6/4/8 by name, none zero.",
    }),
    // v4442 -- the sixty-fourth closing. The two PlayStation artefacts that have exact answers, and the two
    // that do not, separated on purpose rather than by what was easy.
    since64: Object.freeze({
        at: "v4442", swept: 1, green: 1, red: 0,
        added: Object.freeze(["render/retroRaster-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, 16 checks in five sections. From DaveFace/UnrealRetroShaders (MIT), " +
                 "which is NOT PORTABLE AT THE FILE LEVEL at all -- UE4.27 Blueprint materials in binary " +
                 ".uasset, with UE5 unsupported by its author's own statement, so a dead-ended asset pack " +
                 "for one engine version. The techniques are 1994 console constraints and are not the " +
                 "author's to license. *** THE ROUND'S REAL DECISION WAS WHAT NOT TO TAKE. *** Bayer " +
                 "dithering is ALREADY HERE with its own gate. YUV and posterise are absent and AESTHETIC " +
                 "ONLY -- there is no wrong answer for a check to catch -- so they are DELIBERATELY NOT " +
                 "TAKEN, because shipping an aesthetic behind a gate that cannot fail is the problem v4435, " +
                 "v4439 and v4441 each found in a different costume. What is taken is the half with exact " +
                 "answers. AFFINE WARPING IS EXACTLY 'interpolate UV without dividing by w', so it has two " +
                 "EXACT agreements: at equal w the affine answer IS the correct one over 612 samples (an " +
                 "exact zero, not a tolerance, because the division cancels when barycentrics sum to one), " +
                 "and the error is exactly zero AT ALL THREE VERTICES for wildly unequal w -- which is what " +
                 "makes the artefact SWIM rather than shift, pinned at the corners and wrong in between. The " +
                 "warp grows monotonically with depth ratio to 0.848 of a texture width at 16:1, and its " +
                 "maximum always lies on the edge spanning the depth range rather than at a corner, which is " +
                 "the mechanism and not a coincidence. VERTEX WOBBLE IS EXACTLY A LATTICE QUANTISER and owes " +
                 "two things, both asserted exactly: idempotence over 20000 samples, and nothing moving " +
                 "further than half a step. Its site count has a CLOSED FORM, n*2^bits + 1, so a wobble " +
                 "subtler than it should be is countable where an eyeball sees 'about right'. Four " +
                 "sabotages, MEASURED 3/3/1/1 by name. *** AND THE FIRST ATTEMPT AT ONE READ ZERO RED " +
                 "BECAUSE THE SABOTAGE WAS INVALID, NOT THE GATE BLIND: *** it replaced affine()'s body with " +
                 "perspectiveCorrect at equal w, which is ALGEBRAICALLY THE SAME FUNCTION. A substitution " +
                 "that preserves the mathematics cannot break anything, and calling its zero evidence of a " +
                 "weak gate would be the OPPOSITE mistake to the ones this session keeps finding. A third " +
                 "kind of zero, and named as one.",
    }),
    // v4443 -- the sixty-fifth closing. The fifth and last gap v4432 named, and the round's best finding was
    // a zero-red against this gate's own headline row.
    since65: Object.freeze({
        at: "v4443", swept: 1, green: 1, red: 0,
        added: Object.freeze(["physics/render/subsurface-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, 22 checks in six sections. v4432 shipped the principled BSDF naming five " +
                 "absent parameters -- sheen, clearcoat, anisotropy, transmission, subsurface. v4436 closed " +
                 "the fourth; THIS CLOSES THE FIFTH. Christensen and Burley's normalised diffusion, which is " +
                 "NORMALISED BY CONSTRUCTION where the classical dipole is not, so more can be ASSERTED here " +
                 "than in any of the other four. Measured absent first: subsurface, burley, " +
                 "diffusionProfile, translucency, meanFreePath and albedoInversion are all ZERO in code, and " +
                 "the four `subsurface` hits are DENIALS -- v4432's and v4436's own notes saying so. Two " +
                 "false friends named rather than counted: physics/em/currentLoop.mjs has a MAGNETIC dipole, " +
                 "and render/atmosphere.mjs scatters Rayleigh and Mie through a medium rather than diffusing " +
                 "under a surface. EXACT: the integral is 1 and independent of d; CDF(0) = 0 and " +
                 "CDF(inf) = 1; E[r] = 2.5d; the profile is self-similar at the SECOND power. *** THE " +
                 "SELF-SIMILARITY POWER WAS WRONG IN THE FIRST DRAFT AND THE MEASUREMENT CAUGHT IT: *** d R " +
                 "had an IDENTICAL MANTISSA to twelve digits across three decades while the exponent stepped " +
                 "by two, which is the signature of a missed power rather than a wrong formula -- R is a " +
                 "density per unit AREA. A dimensional slip that leaves every digit right is invisible to " +
                 "anything but the exponent, and the gate now asserts that d^1 does NOT collapse. *** AND " +
                 "THE ROUND'S BEST FINDING WAS A ZERO-RED AGAINST ITS OWN HEADLINE ROW. *** normalisation() " +
                 "integrated a HAND-SUBSTITUTED copy of the integrand, with d cancelled analytically -- so " +
                 "it was bit-identical across seven decades and read as the strongest assertion in the file " +
                 "-- and IT NEVER CALLED profile(), so replacing 8 pi with 4 pi cost NOTHING. A " +
                 "normalisation that re-derives its own integrand grades the copy. It integrates the real " +
                 "profile now: the bit-identity is gone, d-independence becomes MEASURED at 4.4e-16 rather " +
                 "than tautological, and the sabotage bites. A SECOND NEAR-MISS: the E[r] quadrature used " +
                 "1/2 where the measure needs 1/4, and was hand-checked AT d = 2, where a factor-of-two " +
                 "error returns 5.000 because 2.5 x 2 and 2 x 2.5 are the same number -- a constant that " +
                 "scales with the parameter you tested at is invisible at that parameter. Four sabotages, " +
                 "MEASURED 0-then-1/2/2/1 by name.",
    }),
    // v4444 -- the sixty-sixth closing. The integration v4443 closed as a model and left open, and the
    // demonstration is a variance ratio that spans nine orders.
    since66: Object.freeze({
        at: "v4444", swept: 1, green: 1, red: 0,
        added: Object.freeze(["physics/render/bssrdfSample-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, 18 checks in five sections. v4443 shipped the diffusion profile and said " +
                 "in its own honest scope that the gap was CLOSED AS A MODEL AND LEFT OPEN AS AN " +
                 "INTEGRATION: a BSSRDF needs a SURFACE and principled.mjs is a BRDF at a single point. This " +
                 "is that surface, and it is the one the tree already renders on -- pathTracer.mjs's furnace " +
                 "sphere. With constant irradiance the surface integral collapses to one dimension in the " +
                 "GEODESIC radius, whose area element is 2 pi a sin(r/a) dr. *** THE FLAT LIMIT IS A NUMBER " +
                 "PROVED IN ANOTHER ROUND BY A DIFFERENT ARGUMENT: *** I(a) runs 0.529916, 0.834307, " +
                 "0.977815, 0.999767, 0.999997 at a = 1, 3, 10, 100, 1000, ARRIVING AT THE PLANE " +
                 "NORMALISATION v4443 PROVED ANALYTICALLY, from a spherical integral that knows nothing " +
                 "about that proof. *** THE PAIR OF CHECKS IS THE DESIGN. *** Two estimators must AGREE IN " +
                 "THE MEAN, because both are unbiased -- that is where a wrong Jacobian shows and it catches " +
                 "WRONGNESS -- and DIFFER IN VARIANCE, which is the benefit and MEASURES it. Neither can be " +
                 "faked by the other. Unbiasedness is judged against each estimator's OWN standard error " +
                 "(v4437's lesson: a hand-picked tolerance went red on ordinary noise), and every case lands " +
                 "inside 2.1 se. *** AND THE IMPORTANCE WEIGHT COLLAPSES TO THE JACOBIAN AND NOTHING ELSE: " +
                 "a sin(r/a)/r, exactly, *** because every factor of the profile cancels between its own pdf " +
                 "and the integrand -- which is what importance sampling MEANS when the sampler matches the " +
                 "integrand. So as the sphere flattens the weight goes to 1 and THE ESTIMATOR BECOMES EXACT: " +
                 "sd 4.07e-1, 2.56e-1, 5.19e-2, 6.03e-4 against uniform's 1.54e0, 4.28e0, 1.21e1, 5.49e1, a " +
                 "VARIANCE RATIO RUNNING 14x TO 8.29e9. THE COMPANION MEASURES WHY v4443 CHOSE BURLEY: the " +
                 "classical dipole's radial integral is 0.080, 0.226, 0.476 at reduced albedos 0.5, 0.8, " +
                 "0.95 -- neither one NOR the albedo it was handed -- so ALBEDO IS NOT A FREE MULTIPLIER and " +
                 "hitting a target reflectance means inverting a function of three parameters numerically. " +
                 "Burley's integrates to 1 on the same quadrature, same limits, same shape. Four sabotages, " +
                 "MEASURED 2/4/1/2 by name. The 1 is the interesting one: sampling the uniform estimator's " +
                 "wrong density leaves the VARIANCE comparison looking entirely reasonable and only the MEAN " +
                 "knows, so a round measuring only the benefit would have shipped it.",
    }),
    // v4445 -- the sixty-seventh closing. The ceiling v4432 and v4436 both named, turned into an answer --
    // and a framing this round wrote an hour earlier and had backwards.
    since67: Object.freeze({
        at: "v4445", swept: 1, green: 1, red: 0,
        added: Object.freeze(["physics/render/multiScatter-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, 17 checks in five sections. v4432 shipped the specular lobe as " +
                 "SINGLE-SCATTER GGX and said so: 'a white metal at roughness 1 returns 0.379 of what it " +
                 "receives, and this tree's own energyCompensation.mjs IS NOT WIRED IN. That makes every " +
                 "furnace number above a CEILING rather than an answer.' v4436 repeated it. THIS IS THE " +
                 "WIRING: 0.378889 becomes 0.999817, and the white metal conserves at EVERY roughness. THE " +
                 "TWO MODULES AGREED ABOUT THE LOBE BEFORE THEY WERE CONNECTED -- principled's " +
                 "specular-only albedo is 0.378889 where the table's E(mu) is 0.378981, two independent " +
                 "descriptions of single-scatter GGX matching to five decimals, which is what made the " +
                 "wiring a connection rather than a fit. IT IS OPT-IN AND OMITTING THE TABLE IS " +
                 "BIT-IDENTICAL to the pre-v4445 model across 27 configurations, so every furnace number " +
                 "the earlier rounds reported is still reproducible. *** THE SCALING IS KULLA-CONTY'S " +
                 "COLOURED FACTOR AND NOT F0, AND THE FRAMING FOR WHY WAS WRITTEN BACKWARDS FIRST. *** The " +
                 "header called F0 scaling 'short' of F_avg as though reaching F_avg were the goal. IT IS " +
                 "NOT: F_avg is what a material returns if every bounce is FREE, and light scattering twice " +
                 "on a rough conductor is attenuated TWICE, so the recovered energy is a geometric series " +
                 "landing WELL BELOW it -- 0.2912 at F0 = 0.5, not 0.5238. The cheap scaling is too HIGH " +
                 "for a dark metal, the opposite sign to what was first written. F_avg = F0 + (1-F0)/21 is " +
                 "a CLOSED FORM verified against quadrature to eight decimals, because the integral of " +
                 "(1-mu)^5 2mu is exactly 1/21. TWO EXACT BOUNDS are asserted and the value between them is " +
                 "MEASURED rather than claimed: compensation can never REMOVE energy, and can never exceed " +
                 "F_avg. Pinning the value would need a random-walk ground truth on a GGX microsurface, " +
                 "which is NOT here and is named as the next step. RECIPROCITY DECOMPOSED HONESTLY: the " +
                 "first version asserted the COMPOSITION was bit-exact and went red at 5.6e-17 -- the BASE " +
                 "model is already 2.8e-17 asymmetric because the specular lobe divides by 4 cosO cosI, so " +
                 "the added lobe is asserted bit-exact (it is) and the composition to one ulp (it is), " +
                 "rather than blaming this round for inherited arithmetic. Four sabotages, MEASURED " +
                 "0-then-3/1/1/5 by name. THE ZERO: section 4 compared the two scalings ARITHMETICALLY, " +
                 "which is true whatever the module does, so swapping it back cost nothing -- v4443's " +
                 "defect again, a check that re-derives both candidates and grades the copy. Repaired to " +
                 "test behaviour.",
    }),
    // v4446 -- the sixty-eighth closing. The ground truth v4445 said it needed, validated twice before it
    // was believed, and the bound it was built for became a number with a sign change in it.
    since68: Object.freeze({
        at: "v4446", swept: 1, green: 1, red: 0,
        added: Object.freeze(["physics/render/microsurfaceWalk-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, 16 checks in four sections. v4445 wired the multi-scatter term in and " +
                 "could only BOUND the coloured case, saying in its own honest scope that pinning it would " +
                 "need a random-walk ground truth on a GGX microsurface. This is that walk -- Heitz et al. " +
                 "2016, uniform-height Smith, a paper rather than a repository -- and it is INDEPENDENT by " +
                 "construction: it simulates bounces and never consults a table, a fit, or any of the " +
                 "machinery it checks. *** A GROUND TRUTH NOBODY CHECKED IS WORSE THAN NO GROUND TRUTH, SO " +
                 "IT IS VALIDATED TWICE BEFORE ANYTHING IS CLAIMED FROM IT. *** With Fresnel identically " +
                 "one it returns EXACTLY 1.000000 at every roughness -- a LAW, no parameter tuned -- and " +
                 "its single-scatter component reproduces microfacet.directionalAlbedo, graded rounds ago " +
                 "by an unrelated quadrature, to 3.4e-5 at roughness 1. *** AND THE SECOND VALIDATION " +
                 "FAILED FIRST, FOR A REASON WORTH KEEPING: *** capping the walk at one bounce read " +
                 "0.587860 against the table's 0.378889, FIFTY PER CENT HIGH, because a cap truncates " +
                 "BEFORE THE ESCAPE TEST and a shadowed ray is counted as having left. SINGLE SCATTER IS " +
                 "NOT 'ONE BOUNCE', IT IS 'ONE BOUNCE AND THEN ESCAPES', and the gap between those two " +
                 "numbers IS the shadowing term. The walk was right and the way of asking it was wrong. " +
                 "*** THE BOUND BECOMES A NUMBER AND THE ERROR CHANGES SIGN. *** Kulla-Conty against " +
                 "truth at roughness 1: exact at F0 = 1, then -3.7%, -7.3%, -3.5%, -0.6% and +4.0% at " +
                 "F0 = 0.04. It UNDER-compensates in the middle and OVER-compensates at the dark end, so " +
                 "IT CANNOT BE REPAIRED BY ONE SCALE FACTOR and a claim that it is 'within a few per cent' " +
                 "owes the reader a WHERE. The fair reading is also asserted: 7% off is not 62% off, and " +
                 "the uncompensated model was the second one. AND THE WALK RETURNED ZERO AT EVERY " +
                 "ROUGHNESS ON ITS FIRST RUN, because SMITH'S LAMBDA IS SIGNED and microfacet.mjs's is " +
                 "not -- correct there, since that module only asks about directions above the horizon, " +
                 "and wrong here, where a walk goes below it on its FIRST STEP. Four sabotages, MEASURED " +
                 "4/10/5/1 by name, none zero.",
    }),
    // v4447 -- the sixty-ninth closing. The trial v4436's excess never got, and the innocent explanation is
    // ruled out rather than assumed.
    since69: Object.freeze({
        at: "v4447", swept: 1, green: 1, red: 0,
        added: Object.freeze(["physics/render/dielectricWalk-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, 18 checks in five sections. v4436 measured its own rough dielectric " +
                 "creating TWENTY-EIGHT PER CENT more light than arrived and said plainly it could not say " +
                 "why: 'WHY the single-scatter BTDF gains where the BRDF loses is NOT DERIVED here, only " +
                 "measured and localised.' v4446 built the conductor walk and noted it was CONDUCTOR-ONLY. " +
                 "This extends it to refraction and tries the accusation. VALIDATED TWICE FIRST, as v4446 " +
                 "insisted: at alpha 0.002 the walk gives R 0.050833 and T 0.949167 against the exact " +
                 "Fresnel equations' 0.050917 and 0.949083 -- a bounce simulation arriving at a closed form " +
                 "graded rounds ago -- and R + T is EXACTLY 1.000000 at every roughness with ZERO stuck " +
                 "paths, which is what makes the split a measurement rather than a normalisation. *** THE " +
                 "VERDICT IS SHARPER THAN THE ACCUSATION: THE BTDF OVER-COUNTS ITS OWN SINGLE-SCATTER LOBE, " +
                 "BY A FACTOR OF FOUR. *** At alpha 1, cosO 0.25 Walter's BTDF says T = 1.244351; the " +
                 "walk's SINGLE-BOUNCE transmission is 0.306750 and its FULL multiple-scattering total is " +
                 "0.953675. The innocent explanation -- that the excess was absent multiple scattering -- " +
                 "is RULED OUT, because a missing term cannot make the complete answer smaller. And all " +
                 "three agree within 0.003 at alpha 0.05, which is what licenses reading them apart where " +
                 "the physics is hard. A SECOND FINDING ALONG THE WAY: a rougher dielectric transmits MORE " +
                 "and reflects LESS -- T rises 0.9475 to 0.9791, R falls 0.0509 to 0.0199 -- because light " +
                 "trapped in the microfacet valleys eventually gets through, which is the opposite of the " +
                 "conductor's story and is asserted rather than remarked. Four sabotages, MEASURED " +
                 "6/4/3/0-then-1 by name. THE ZERO: the stuck-path branch was UNREACHABLE, because nothing " +
                 "gets stuck on any configuration in the file, so counting stuck paths as transmitted cost " +
                 "nothing -- v4435's unfalsifiable path check in a new file. A bounce cap of one makes " +
                 "every path stick and the branch has to be right. NO FIX IS OFFERED for the BTDF: the lobe " +
                 "is convicted and left convicted, which is smaller and more honest than a repair nobody " +
                 "has validated.",
    }),
    // v4448 -- NO new gate file: v4434's pageFxOverlay-selfcheck grew from twelve checks to nineteen, to cover
    // the three paths v4434 named as undriven. Recorded because a sweep entry that only ever counts NEW files
    // cannot see a gate widening, and widening is what closed this one.
    since70: Object.freeze({
        // swept 0 because the ledger's invariant is added.length === swept: a closing accounts for the gates
        // it ADDED, and this round added none. The gate it widened is recorded beside that, in a field the
        // accounting does not read -- *** SO THE LEDGER CANNOT SEE A GATE GROW, only a gate appear. *** Said
        // here rather than forced into the count, because a malformed entry to make a point is worse than
        // the point.
        at: "v4448", swept: 0, green: 0, red: 0,
        added: Object.freeze([]),
        widened: Object.freeze(["tools/ship/pageFxOverlay-selfcheck.mjs (12 checks -> 19)"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, jsdom with a clock the test owns. v4434 shipped the overlay's first gate " +
                 "and named three paths it did not drive: shatterTransition, the WebGL renderer path and the " +
                 "recorder button. Driven now: THE RECORDER BUTTON LEAKED A 20,200 ms TIMEOUT -- click Rec, " +
                 "close the overlay, and 0 of 1 timers were cleared. It fired refreshBar() against a DETACHED " +
                 "bar with NO THROW, rebuilding the toolbar on a dead node and holding state, cv, bar and the " +
                 "voxel grid alive for twenty seconds after the overlay was gone. Same family as v4434's " +
                 "listener: registered with no handle to cancel it by. closePageFx clears every armed timer " +
                 "now and the callback refuses to touch a torn-down overlay. THE OTHER TWO ARE NEGATIVE " +
                 "RESULTS: shatterTransition removes its own canvas in 136 frames (2.1 s at 16 ms), two " +
                 "overlapping transitions both finish and both clean up, and an onDone that throws neither " +
                 "escapes nor strands a canvas -- it has no cancel handle, which is a fact about the design " +
                 "and not a leak. initVoxelGL is asked FIRST and returns null on a missing webgl2 context, so " +
                 "the 2D renderer is a genuine fallback rather than the default. AND THE FIRST READING OF " +
                 "shatterTransition SAID THE CANVAS IS NEVER REMOVED, which was the harness: its loop takes " +
                 "dt from performance.now(), so rAF driven synchronously leaves dt ~ 0 and the 2.1 s cutoff " +
                 "is unreachable. A negative result is worth nothing until the instrument can move. ONE " +
                 "SABOTAGE READ ZERO RED and it repeated the bug inside the check for the bug: the guard " +
                 "check fired the timers and passed if none THREW -- but running against a detached bar " +
                 "throws nothing, which is exactly why the leak was invisible. It measures MUTATION now. " +
                 "WHAT IS STILL NOT CLAIMED: that GL resources are released; nothing in voxelRender.js " +
                 "disposes anything, and this harness has no GL and cannot measure context lifetime, so that " +
                 "is recorded as a fact about the file rather than asserted as a leak. Twenty sabotages, all " +
                 "RED by name, three files md5-identical.",
    }),
    // v4449 -- the seventy-first closing. The ship ritual had eight steps and none of them said PUBLISH.
    since71: Object.freeze({
        at: "v4449", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/releaseLedger-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly, five sections, no network. *** THE FLEET DOWNLOADS " +
                 "releases/latest AND FOR 261 SHIPPED VERSIONS IT HAS DOWNLOADED THREE OF THEM. *** " +
                 "Measured from the API before a line was written: tree at v4448, newest published release " +
                 "v4438 -- ten behind -- and 3 of the 261 versions in docs/CHANGELOG.md were ever published, " +
                 "which is 1.1%. THE DOWNLOAD CHAIN WAS NEVER BROKEN: fetchEngineBuild, scanDownloads and the " +
                 "installer have been complete and gated since v3907, and v3907's own header already said the " +
                 "remaining work was on the publishing side. It pulled v4438 because v4438 was the newest " +
                 "thing anybody published. The gate asserts the RATCHET -- you may not ship a new version " +
                 "while the LAST one is unreleased -- and only REPORTS the ten-version lag, because checked " +
                 "the naive way (ENGINE_VERSION must have a release) it would be red throughout every correct " +
                 "ship, verify running before the commit and the release being published after the tag. A " +
                 "gate red for the whole of every correct ship is one people learn to ignore. Four sabotages, " +
                 "MEASURED 2/0-then-2/1/1 by name. *** THE ZERO WAS THE MOST USEFUL OF THE FOUR: *** deleting " +
                 "the newest release row moved the reported lag from 10 to 148 and turned NOTHING red, " +
                 "because the lag is reported rather than asserted -- a release the fleet was already running " +
                 "could vanish to an upstream delete or a bad merge and this gate would have shrugged. Closed " +
                 "with a two-number ratchet (minReleases, minLatest) that the refresh raises and nothing " +
                 "lowers; the same sabotage is now exit=1 with both lines red by name. I also PREDICTED " +
                 "sabotage 1 would name 144 owed versions and wrote that into the log before running it -- " +
                 "the gate said 117, because I did the arithmetic in my head over a changelog with gaps in " +
                 "it. Both corrections are in the gate's header rather than quietly fixed. WHAT IS NOT " +
                 "CLAIMED: that any release carries a usable asset (the ledger records TAGS; release.yml is " +
                 "what unzips and verifies the published archive on three platforms), or that the FETCH half " +
                 "of refreshReleases works -- this sandbox's proxy answers the releases API with HTTP 401, so " +
                 "only the pure rowsFrom parse could be exercised, which is why it was split out.",
    }),
    // v4450 -- the seventy-second closing. Seven controls ordered by their commit dates.
    since72: Object.freeze({
        at: "v4450", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/releasePanelRoute-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze(["tools/ship/avatarDock-selfcheck.mjs (8 checks -> 11, the staged growth AXIS)"]),
        verdict: "green on this box, three sections, the third in a real browser with every /github/* and " +
                 "/source-chain/* call stubbed. Keith: 'I can't tell which functions overlap, and which I need " +
                 "to get our release all merged and on main for fleet runs.' The Releases tab grew one button " +
                 "per round -- v1129, v3941, v3964, v4014, v4133 -- each appended under the last, SO THE " +
                 "READING ORDER WAS THE WRITING ORDER: the two-press safe route read last and the unverified " +
                 "shortcut read first. Two pairs nearly duplicate: 'Get newer source' is the first half of " +
                 "'Clone -> verify', and 'Release current engine' is 'Publish the verified clone' with the " +
                 "verify taken out. Numbered 1..6 now, shortcuts moved below under a heading naming which step " +
                 "each skips, and the step numbers are GENERATED BY A COUNTER rather than typed -- the same " +
                 "collision this file's own ordinals are checked for, one level down. *** THE FINDING THE " +
                 "PANEL COULD NOT HAVE FIXED: *** createRelease passes `target_commitish: target || undefined` " +
                 "and publishVersion never passes one, so GITHUB PUTS THE TAG ON THE DEFAULT BRANCH'S HEAD " +
                 "while the zip is packed from a local folder -- the same commit only if you pushed. That is " +
                 "step 1, and it is deliberately not a button. Four sabotages, MEASURED 1/1/1/0-then-1 by " +
                 "name. *** THE ZERO FOUND A DEFECT IN THIS GATE, NOT IN THE CODE: *** section 2 asked whether " +
                 "'up.gone.length' appeared BEFORE 'fs.writeFileSync' in the source text, and `if (false && " +
                 "up.gone.length)` satisfies that with the guard switched off -- AN ASSERTION ABOUT WHERE TEXT " +
                 "SITS IS SATISFIED BY A BRANCH THAT IS PRESENT AND DEAD. ledgerRefresh takes an injectable " +
                 "fetchRaw and writeFile now and the section CALLS it three times (clean writes once, vanished " +
                 "refuses and writes nothing, dry run writes nothing even in the refusing case). I ALSO " +
                 "PREDICTED SABOTAGE 1 WOULD GO 2 RED and wrote that into the log before running it; it went " +
                 "1, because STEP() is still called so the medallion still renders. Corrected in the header " +
                 "rather than quietly fixed.",
    }),
    // v4451 -- the seventy-third closing. A gate that could not load, and the budget that hid it.
    since73: Object.freeze({
        at: "v4451", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/importHealth-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([
            "tools/ship/updatePause-selfcheck.mjs (23 checks -> 31, the GitHub work the deferral could not see)",
            "tools/ship/redCensus-selfcheck.mjs (revived: dead at import since v4430, then 3 real reds fixed)",
        ]),
        verdict: "green on this box, ~200 ms, no browser, 9,410 named bindings across 1,478 gates. Keith asked " +
                 "that an auto-update not restart the server during the GitHub chain; _testRunActive() had " +
                 "deferred updates since v3075 and named THREE runners, so the clone, the verify, the pack and " +
                 "the upload were invisible to it -- and sourceChainBridge set R.phase all through start() and " +
                 "NEVER IN publish(), so the blind window was exactly the one holding the action this tree " +
                 "calls hardest to take back. *** THE REPAIR OF ITS GATE THEN EXPOSED A GATE THAT HAD BEEN DEAD " +
                 "AT IMPORT FOR TWENTY-ONE ROUNDS: *** v4430 deleted RECORDED_BUT_GREEN from redCensus.mjs " +
                 "(rightly -- a frozen copy of a derivable set) and left its one importer naming it, so " +
                 "redCensus-selfcheck threw before its first check while this very session repaired entries on " +
                 "the register it guards. IT WENT UNSEEN BECAUSE IT IS BUDGETED AT 140,941 ms and the quick " +
                 "sweep runs everything under 3,000 -- THE NUMBER THAT DESCRIBES A GATE IS WHAT HIDES IT, and " +
                 "fifty-one gates sit above that cap. Reviving it surfaced three reds, all one family: a " +
                 "regex over round strings that stopped excluding anything at v44xx, an equality between a " +
                 "typed measurement and a getter whose audit caps below it, and a claim about v4279 measured " +
                 "against a register that repairs shrink -- so the claim went false BECAUSE THE WORK THE " +
                 "CENSUS ASKS FOR WAS DONE. It also found winPathGuard red again after its v4423 repair: one " +
                 "new gate reintroduced `new URL(import.meta.url).pathname`, which yields '/C:/...' on the " +
                 "box this engine is developed on. This gate asks the load question STATICALLY, which is what " +
                 "makes it cheap enough to ask of all 1,478 rather than only the 51. Five sabotages, MEASURED " +
                 "1/1/1/0-then-1/2 by name. *** THE ZERO WAS ITS OWN UNREACHED BRANCH: *** nothing in this " +
                 "tree imports from a module that re-exports, so the `export * from` guard never ran and its " +
                 "own report line said so while I read past it; closed with temp-directory fixtures rather " +
                 "than planted files, because a gate that leaves a gate behind grows its own population. AND " +
                 "THE GATE WAS WRONG TWICE BEFORE IT WAS RIGHT, both times accusing correct code: 36 false " +
                 "reds from reading one name out of `export const A = 1, B = 2;` and none out of CommonJS, " +
                 "then ~110 more from anchoring a declaration on a semicolon at end of line in a tree that " +
                 "writes `export const MU0 = 1.25e-6;   // CODATA`. Running one of the accused was the whole " +
                 "cost of learning each.",
    }),
    // v4452 -- NO new gate file: three existing gates widened, and one non-gate module added.
    since74: Object.freeze({
        // swept 0 because the ledger's invariant is added.length === swept, and this round added no gate.
        // ui/originNotice.js is a page module, not a -selfcheck, so enumerateGates does not see it.
        at: "v4452", swept: 0, green: 0, red: 0,
        added: Object.freeze([]),
        widened: Object.freeze([
            "ui/webgpuOrigin-selfcheck.mjs (sections 8 and 9: the derived population, and the silent fallback)",
            "tools/ship/pageRequirements-selfcheck.mjs (--have reachable from the panel; the import tell)",
        ]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box. Keith: 'I don't know why the swek engine locally runs with an ip, and " +
                 "then all the gpu pages have to be re opened with localhost. all the machines run webgpu " +
                 "pages fully.' THE MACHINES ARE FINE AND SO IS THE CODE: navigator.gpu is exposed only in a " +
                 "SECURE CONTEXT, a browser treats localhost and 127.0.0.1 as secure over plain http, and a " +
                 "LAN address is not one -- so on http://192.168.50.57:8787 the property is simply absent. " +
                 "ui/webgpuProbe.mjs has said exactly that since v3981, and MEASURED at v4452 only 16 of the " +
                 "31 pages that acquire a device ever asked it. Now 31 of 31, by three routes, and the " +
                 "population is DERIVED from source rather than listed. *** THE REASON THE SYMPTOM WAS " +
                 "UNREADABLE IS THAT gfx/device.js FELL BACK IN SILENCE: *** requestDevice took webgl2 -- or " +
                 "the null backend -- and returned a WORKING device with no throw and no console line, so the " +
                 "page loaded, did less than it should, and the only clue was that localhost fixed it. It " +
                 "explains now, before the fallback runs, once per page. SEPARATELY, RENDER QA: --have has " +
                 "existed since v3171 so a box can state what it HAS and every unjudgeable page is NAMED " +
                 "rather than failed (v3120's law) -- and renderQaBridge.run() never accepted it, so the " +
                 "mechanism was terminal-only. That is v3563's own sentence, one flag along: 'A FRONT DOOR " +
                 "THAT CANNOT REACH A FLAG THE TOOL DOCUMENTS IS HALF A DOOR', written while fixing --all and " +
                 "leaving this. Threaded, with blank still meaning skip nothing. The webgpu detector also " +
                 "learned the IMPORT tell it already used for webgl2, fixing two pages that hold their WGSL " +
                 "in a string and get the device from gfx/device.js. Five sabotages, MEASURED " +
                 "1/1/0-then-1/1/0-then-1 by name. *** BOTH ZEROS WERE DEFECTS IN THE GATES, NOT THE CODE: *** " +
                 "one case was short-circuited by the once-per-page flag so it passed whatever the guard did, " +
                 "and the detector widening had no assertion at all and could have been undone in silence.",
    }),
    // v4453 -- NO new gate file: releaseLedger-selfcheck widened, and the rule it enforces replaced.
    since75: Object.freeze({
        at: "v4453", swept: 0, green: 0, red: 0,
        added: Object.freeze([]),
        widened: Object.freeze(["tools/ship/releaseLedger-selfcheck.mjs (the hard ratchet becomes a lag budget, asked about MAIN)"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box. Keith: 'fix the structure before v4453.' v4449's ratchet -- you may not " +
                 "ship a new version while the last one is unreleased -- is right when the ship and the " +
                 "publish happen on ONE machine and UNSATISFIABLE when they do not: rounds are built where " +
                 "there are no credentials to publish, so the previous version is unreleased at every ship BY " +
                 "CONSTRUCTION. It went red at v4450, v4451 and v4452, and each time the only reachable answer " +
                 "was to raise the baseline. THREE RAISES IN THREE ROUNDS IS A GATE COLLECTING SIGNATURES, and " +
                 "the escape hatch being sanctioned is what hid it -- every write-off was reasonable and the " +
                 "sequence was not. Now: the question is asked about MAIN (v4449's own words said main and it " +
                 "read the working tree, so an unmerged branch counted as debt nobody could download), with a " +
                 "fallback to the working tree that is a SUPERSET and therefore stricter; and the hard zero " +
                 "becomes a stated LAG BUDGET of 3, against a failure of 3 releases in 261 versions -- 87x the " +
                 "budget. An unstated budget FAILS rather than passing, and it lives outside baseline because " +
                 "one edit doing both jobs is the escape hatch eating the rule one level up. Six sabotages, " +
                 "MEASURED 3/3/1/0-then-0-then-1/1/0-then-1. *** BOTH ZEROS WERE THE SAME BLINDNESS: *** a " +
                 "module reading the working tree while reporting 'origin/main' passed a check that restated " +
                 "its own label, and then passed a COUNT comparison too, because at that moment the branch and " +
                 "main were IDENTICAL and no count separates two identical lists. Closed with an injectable " +
                 "reader and a fixture ledger whose floor is low enough for owed to come back NON-EMPTY -- an " +
                 "empty owed-set proves nothing about which list built it. AND A NOTE ON METHOD: two reported " +
                 "zeros were counted by grepping '^  FAIL', which A CRASHING GATE PRINTS NONE OF; one was a " +
                 "syntax error in the sabotage read as a gate failing to notice. Graded on exit codes now.",
    }),
    since76: Object.freeze({
        at: "v4455", swept: 1, green: 1, red: 0,
        added: Object.freeze(["physics/render/btdfDomain-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green, eight sections. *** THE SAME QUESTION WENT TO TWO BRANCHES AT ONCE AND THEY CONVICTED " +
                 "THE SAME chi+ FROM DIFFERENT INSTRUMENTS -- 0.661386 there from an energy bound, 0.663694 " +
                 "here from a Monte Carlo walk, sharing no code but the D and Fresnel under test. *** Walter " +
                 "eq. 21 needs the half-vector to be a facet that EXISTS (h.n > 0) and is LIT (h.wi > 0); " +
                 "transmission.mjs evaluated outside both, through halfVectorT's `h[2] < 0 ? -h : h` and " +
                 "Math.abs(iDotH). TWO ABS()ES, AND AN ABS IS THE MOST INNOCENT-LOOKING THING IN A SHADER. " +
                 "Proved on a bound: with masking alone eq. 21 times |wo.n| IS the (1-F)-weighted VNDF, a " +
                 "probability density -- 0.917790 enforced against a 0.916252 ceiling, 1.878929 as written. " +
                 "The walk gives EXACTLY ZERO single-scatter paths in both bins the abs()es pay out in, 0 of " +
                 "300000 twice, while multiple scattering fills both. WHAT THIS ROUND GOT WRONG AND CORRECTED " +
                 "BEFORE SHIPPING: its first draft headlined 'G is not the culprit', which its own section 6 " +
                 "contradicted by measuring the enforced lobe still 2.17x truth. The measurement supports only " +
                 "that the domain error is INDEPENDENT of G; G2 is guilty separately, and the other branch's " +
                 "beta form settles it -- section 8 holds `chiPlus` and `g2: \"beta\"` against this file's walk " +
                 "at three configurations and lands 0.305984 on 0.306083. SIX SABOTAGES, 8/4/9/9/6/1-then-2 by " +
                 "name, none zero-red. THE ONE THAT READ 1 FOUND A SECOND COPY OF THE OPTION OBJECT inside the " +
                 "section, so half of it graded a configuration the sabotage never reached; one frozen FIXED " +
                 "object now. NOT CLAIMED: that btdfDomain fixes anything -- transmission.mjs is deliberately " +
                 "unpatched by this round, and defaults on both branches are unchanged so no pixel moved.",
    }),
    since77: Object.freeze({
        at: "v4456", swept: 2, green: 2, red: 0,
        added: Object.freeze([
            "tools/ship/closingCoverage-selfcheck.mjs",     // this round's own
            "tools/ship/reportDoors-selfcheck.mjs",         // ANOTHER round's gate, swept here -- see the verdict
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green, both. *** THE SECOND NAME IS NOT THIS ROUND'S GATE AND SAYING SO IS THE POINT. *** " +
                 "tools/ship/reportDoors-selfcheck.mjs arrived on main from an in-flight round on the other " +
                 "branch, with no closing, so the trunk read '1 STILL UNSWEPT' for three unnumbered commits. " +
                 "This round RAN it -- exit 0 -- and accounts for it here; it did not write it, and the round " +
                 "that did will describe it. WRITING THIS ENTRY WAS REFUSED ONCE, DELIBERATELY, AND THAT " +
                 "REFUSAL IS WHAT PRODUCED THE ROUND: when the other branch ships it will close the same gate, " +
                 "two closings will claim one name, and the coverage line summed COUNTS rather than reading " +
                 "the NAMES the ledger already holds -- so the duplicate would have cancelled the very red it " +
                 "was meant to clear. MEASURED, on a fixture with exactly one uncovered gate: as it stands " +
                 "uncovered 1 (FAIL); two branches closing the same gate, uncovered 0 (PASS). Not a future " +
                 "risk, this week's red going green. A duplicate buys a CREDIT of exactly one against every " +
                 "future unswept gate, permanently, because `<= 0` can never red no matter how far the sum " +
                 "over-runs. NEW closingCoverage.mjs reads the union of every `added` list as a SET -- " +
                 "duplicates attributed to both claimants by name, names checked against the filesystem rather " +
                 "than the caller's list, and the credit reported as its own number. v4399's rule, freeze by " +
                 "NAME not by COUNT, reaching the one line in the ledger that had never followed it. Six " +
                 "sabotages, 4/1/0-then-2/1/1/9 by name. *** THE ZERO WAS AN UNREACHABLE CHECK INSIDE A ROUND " +
                 "ABOUT UNREACHABLE CHECKS *** -- the filesystem clause never ran, because both fixtures named " +
                 "a gate missing from the enumeration too; an empty population drives it now. NOT CLAIMED: " +
                 "that the v4297 baseline is covered by name (it is a count, and rebuilding its membership " +
                 "would be fabrication -- `baselineByName: false` is a graded value, not a sentence), or that " +
                 "a gate a closing names was actually run by that round.",
    }),
    since78: Object.freeze({
        at: "v4457", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "tools/ship/slugWgsl-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green. The WGSL twin of the Slug shader (text/slugShaderWgsl.js), graded on the headless Dawn " +
                 "device against text/slugEval.js on the same packed bytes: 22,045 + 61,092 sharp samples exact " +
                 "against slugEval AND the flattened-segment winding number, worst |gpu - cpu| 3.1e-6 at 28 px/em " +
                 "against an a-priori 1/512, the row-wrap plant 9,477 of 27,957 wrong at the wrong width, three " +
                 "transliteration plants red at 12,148 / 2,205 / 1,462 of 22,045, and SlugDilate half a pixel per " +
                 "axis to 3.8e-6 px under an orthographic matrix. *** THE FIRST DRAFT OF ITS SECTION 5 HAD AN " +
                 "UNREACHABLE PLANT *** -- six small glyphs at width 64 never leave row one, so the wrong-width " +
                 "probe went 0 of 10,016 wrong -- caught on the first run and rebuilt over the 66 Plex label " +
                 "glyphs at width 128, where 432 of 965 band headers point past their own row. Five runs 5,235 to " +
                 "5,412 ms, all exit 0; the slowest is the MEASURED budget.",
    }),
    since79: Object.freeze({
        at: "v4458", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "tools/ship/deviceBlend-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green. gfx/device.js gains blend state by name (none, premultiplied, alpha, additive), and the gate " +
                 "draws an opaque quad and a translucent one through the SHIPPING module on both backends for each " +
                 "mode: every byte within 1 of the blend equation in f64, the two backends identical (pair worst 0 " +
                 "on all four), the control half untouched, an unknown word refused before either backend builds " +
                 "anything. Three sabotages red at 6 / 8 / 4 -- the third caught by the f64 equation alone, since " +
                 "both backends agreed with each other on the wrong factor. 1.0 s.",
    }),
    since80: Object.freeze({
        at: "v4459", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "tools/ship/deviceFormats-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green. gfx/device.js gains texture formats by name (rgba8unorm, rgba16float, rg16uint), nearest " +
                 "forced on the integer format, depthWrite and depthCompare honoured on WebGL2 at last; the gate " +
                 "uploads half-float and uint patterns through the SHIPPING module on both backends and reads " +
                 "their BITS back through render/texelProbe.mjs: 2048 half-float bytes and 1024 uint bytes exact " +
                 "on each backend, update() exact, depthWrite false lets the far quad through on both, and the two " +
                 "backends agree byte for byte once WebGL2's rows are turned over (722 bytes differ without the " +
                 "turn -- the v4272 mirror, at the fetch). Four sabotages red at 5 / 2 / 2 / 4. 1.9 s.",
    }),
    since81: Object.freeze({
        at: "v4460", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "tools/ship/slugDevice-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green. Slug text through gfx/device.js (render/slugDevice.mjs) drawn on both real backends: 23,040 of " +
                 "23,040 pixels EXACT against text/slugEval.js through a rasteriser model whose sub-pixel precision is " +
                 "FITTED from the fragment's own captured texcoords (four bits on this SwiftShader; the exact-centre " +
                 "model missed by 1.06e-3 em and 43 of 255 at the worst pixel), the device's WebGL2 picture equal to " +
                 "the shipped raw-WebGL2 batch byte for byte, the two backends identical. *** THE FIRST DRAFT OF THE " +
                 "KEY WAS WRONG ABOUT PIXEL CENTRES AND THE FRAME SAID SO *** -- recorded in the header. Four " +
                 "sabotages red at 4 / 11 / 6 / 6. Five runs 6,063 to 6,507 ms; the slowest is the MEASURED budget.",
    }),
    since82: Object.freeze({
        at: "v4461", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "tools/ship/deviceUnused-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green. gfx/device.js marks every declared binding `used` from the shader text (the auto layout's own " +
                 "question), leaves unused ones out of the bind group so the frame draws, and runs createBindGroup " +
                 "inside a validation error scope whose message a READ frame rejects with and the next use() refuses " +
                 "with. The gate draws a two-texture probe reading one texture with both bound (texA's texels exact " +
                 "on both backends), and binds a uint texture under a texture_2d<f32> (the read frame rejects by " +
                 "name, the next use() refuses). *** THE FIRST DRAFT WAITED 50 ms FOR THE ERROR SCOPE AND WENT " +
                 "RED *** -- the contract is now the read path awaiting the check, not a timing. Under 1 s.",
    }),
    since83: Object.freeze({
        at: "v4462", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "tools/ship/devicePresent-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green. render/devicePresent.mjs draws a known pattern through gfx/device.js on a PRESENTED canvas and " +
                 "reads it back three ways (the device's canvas readback, an offscreen frame, a 2D drawImage of the " +
                 "canvas -- the compositor's copy); the gate holds WebGL2 to all three at 0 of 2,048 differing and " +
                 "names WebGPU's outcome on this box -- the device lost on the presented pass, with the browser's " +
                 "own message -- as the rig-pending state rather than a red nobody here can clear. Three sabotages " +
                 "red at 1 / 2 / 1. Under 1 s.",
    }),
    since84: Object.freeze({
        at: "v4463", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "tools/ship/esShipLabelsDevice-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green. ev/esShipLabels.js is the first consumer of render/slugDevice.mjs: the device path by default " +
                 "(WebGPU where the page has it) with the v3831 raw batch as an automatic fallback on a fresh canvas " +
                 "when the WebGPU device is lost. The gate WATCHES that happen on this box (device:webgpu, lost on " +
                 "the first presented frame, raw afterwards with the labels drawn), holds the device's WebGL2 labels " +
                 "to the raw picture (106 of 921,600 pixels differ, the raw canvas's MSAA on quad edges), and prints " +
                 "the rig line. Two sabotages red at 1 / 2. One second, after a 66-second first draft that " +
                 "shipped three pictures through the harness as JSON.",
    }),
    since85: Object.freeze({
        at: "v4464", swept: 0, green: 0, red: 0,
        added: Object.freeze([]),
        widened: Object.freeze(["tools/ship/crossBackend-selfcheck.mjs (111 checks -> 114)"]),
        redOnArrival: Object.freeze([]),
        verdict: "green, and a standing red cleared by ANSWERING it rather than registering it. The WGSL census had " +
                 "named physics/render's traceWgsl (v4417) and pipelineWgsl (v4418) as producers with no corpus entry " +
                 "and no exclusion for a hundred and seventy rounds; both fit the corpus's one-buffer signature and now " +
                 "run on both backends, 576/576 identical each, the pipeline entry carrying a MIRROR hit shader the CPU " +
                 "oracle cannot express. The census roots include text/: the Slug twin's three runnable modules " +
                 "(v4457) were outside the scan altogether, which is the quieter failure -- a producer the census " +
                 "cannot see is one it cannot name -- and the roots are now asserted by what they FIND. The coverage " +
                 "probe is the corpus's first entry with read-only storage INPUTS (2313/2313 identical through five " +
                 "bindings, on a width-16 atlas whose lists wrap); the dilation probe 32/32; the render module compiles " +
                 "on both. Sabotage E (text dropped from the roots) goes 1 red on the roots line while the accounting " +
                 "line stays green, which is exactly the hole it closes. colourReach's literal-colour count re-taken " +
                 "75 -> 76 for slug-device.html's legend.",
    }),
    since86: Object.freeze({
        at: "v4464", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "tools/ship/deviceMipmaps-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green on both real backends. `mipmaps: true` on device.texture(): gl.generateMipmap on WebGL2 with a " +
                 "MIPMAP min filter, and on WebGPU -- which has no such call -- a per-level blit pipeline the backend owns. " +
                 "Every level of a 32x32 rgba8unorm chain and two levels of an rgba16float chain read back within a byte of " +
                 "a CPU box filter on both backends, worst difference 0; the sampled draw at a quarter size lands on level " +
                 "2 where an unchained control aliases; update() rebuilds the chain; the backends agree on every level " +
                 "once the rows are turned over. Three sabotages red at 10 / 11 / 5 -- and the third is the finding: an " +
                 "UNFLIPPED blit corrupts only the ODD levels (two flips cancel), so the level a minified draw reads " +
                 "stayed green while levels 1 and 3 were upside down. The gate reads every level for that reason.",
    }),
    since87: Object.freeze({
        at: "v4465", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "tools/ship/xpbdDevice-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze(["tools/ship/crossBackend-selfcheck.mjs (three XPBD entries; census root physics/xpbd)"]),
        verdict: "green on the headless Dawn device, on the browser's WebGPU through gfx/device.js, and on the null backend. " +
                 "THE CLOTH PILLAR'S GPU LOOP WAS FOUR SHADER FILES NOTHING LOADED, for eighteen hundred rounds; " +
                 "physics/xpbd/xpbdWgsl.mjs is the same three passes as clothLoop.js as compute kernels the device runs, " +
                 "the first physics/ module on gfx/device.js. A flat mirror with one rounding knob is pinned to clothLoop " +
                 "byte for byte at f64; at f32 it is 6.0e-6 from f64 after 40 frames; each kernel returns the mirror's " +
                 "bytes on the headless device (100 of 100 words), the solve in place through the harnesses' new outInit; " +
                 "40 frames in the browser are bit-identical to the mirror on all 75 coordinates, deterministic across " +
                 "runs and a within-color shuffle, 1,920 contact pairs found and solved at radius 0.4. Sabotages red at " +
                 "2 / 1 / 5, and A is the finding: a single-pass identity check cannot see Eq (18)'s term because a first " +
                 "pass has lambda = 0, so a second native pass now carries the multiplier in. Two errors in the old " +
                 "files found by writing the mirror: contact did not accumulate lambda where the twin does, and the " +
                 "predict/finalize passes were WebGL2 transform feedback no WebGPU context could run.",
    }),
    since88: Object.freeze({
        at: "v4466", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "tools/ship/mpmDevice-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze(["tools/roundhouse/hmcGpu-selfcheck.mjs (8 checks -> 14: the kernel on the headless device, adjudicated)",
                                "tools/ship/crossBackend-selfcheck.mjs (the HMC probe layout, 16384 floats identical; the MPM module compiled on both)",
                                "physics/mpm/gpuKernel-selfcheck.mjs (the atan2-guard check becomes the no-trigonometry check)"]),
        verdict: "green on the headless Dawn device and on the browser's WebGPU through gfx/device.js. Two gates had said " +
                 "there is no GPU in the sandbox since v3282 and v3809; there has been one since v4292. HMC: the kernel's " +
                 "step text in a harness layout runs the seeded 4096-chain batch on Dawn and the CPU adjudicator passes it " +
                 "(worst 3.1e-6 against 5e-5), the shipped string byte-identical to before. MPM: the four stages on the " +
                 "browser's WebGPU with contended atomics -- and THE INTERPRETER'S f64 HAD BEEN HIDING THE RETURN MAP: " +
                 "free fall came back 1.55e-4 relative off the graded loop because F = U Sc V was rebuilt through this " +
                 "rasteriser's cos (4.5e-5 off at pi/4), dilating every resting particle by 1.000126 per step. svd2 is " +
                 "trig-free now and skips the unclamped round trip: 2.9e-8 / 7.4e-8 / 7.4e-8 relative in the three " +
                 "scenes, the key at 2.9e-7, drift exactly zero, reruns bit-identical. gfx/device.js answers `used` per " +
                 "entry point (a multi-entry module's auto layouts differ), which also found mpm-gpu-check.html binding " +
                 "five entries to every stage -- a validation error on any real device. Sabotages red at 7 / 2 / 6; B " +
                 "went 0 red the first time and earned a section over 2,007 matrices.",
    }),
    since89: Object.freeze({
        at: "v4467", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "tools/ship/deviceCompute-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green on the browser's WebGPU through gfx/device.js, held to the headless Dawn harness. " +
                 "render/computeRun.mjs is the one way a compute kernel runs through the device -- buffers bound by the " +
                 "names the WGSL declares, one dispatch in a frame, readback through the device, unknown and missing " +
                 "names refused by name -- and corpusSpec() maps the harnesses' one-buffer signature onto it, so every " +
                 "runnable corpus entry (18 kernels, 69,517 floats) runs through the device and returns THE SAME BYTES " +
                 "as the harness: a third path to the same numbers, and every future corpus entry covered for free. " +
                 "hmc-bench.html and mpm-gpu-check.html no longer build adapters, pipelines, bind groups or staging " +
                 "buffers by hand. Sabotages red at 2 / 12 / 1, and C is a finding about the check rather than the " +
                 "code: the API accepted every unpadded uniform in the corpus, so the 16-byte floor is the harnesses' " +
                 "convention, kept for byte-identical inputs, and the gate header says so.",
    }),
    since90: Object.freeze({
        at: "v4468", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "tools/ship/probeConvention-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green on the headless Dawn device in half a second. The probe convention is lab-wide: " +
                 "docs/GPU-KERNEL-CONTRACT.md writes it down with render/lyapunovWgsl.mjs as the template, and the nine " +
                 "physics kernel modules each export PROBES -- id, code, pack, cpu, key, tol | rel | graded, device -- " +
                 "pointing at what they already had, so nothing was renamed. The gate is the census: every runnable " +
                 "physics corpus entry needs a manifest entry and every manifest id must be a corpus id; all 13 entries " +
                 "run on Dawn, nine held to their own tolerance (five at zero, HMC 3.10e-6 against its earned 5e-5, " +
                 "Heidler 2.98e-7, Planck 1.76e-6 relative, the LCG at the f32 neighbour gap) and four graded by the " +
                 "gate they name. Sabotages red at 1 / 1 / 1: an entry deleted, a tolerance tightened past the floor, " +
                 "a twin rendered wrong.",
    }),
    since91: Object.freeze({
        at: "v4469", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "tools/ship/stepLoop-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green on the browser's WebGPU through the device. render/stepLoop.mjs is the ping-pong once: one state, two " +
                 "buffers bound alternately under the kernel's own names, N dispatches in one frame, one readback, and a " +
                 "per-step uniform that makes each step its own frame because a buffer written N times before one submit " +
                 "shows every step the last value. First consumer physics/chaos/logisticWgsl.mjs, chosen because the map " +
                 "is chaotic and a ping-pong mistake is an unrelated orbit: 1,024 orbits over 200 steps bit-identical to the " +
                 "f32 twin, odd and even step counts, two runs, and a schedule touching step 197 only matched bit for bit " +
                 "against the control a last-value-only uniform gives. The kernel is in the corpus (identical across " +
                 "backends and through the device) and carries a manifest. Sabotages red at 5 / 3 / 7, and B is the bug " +
                 "the helper exists to know about.",
    }),
    since92: Object.freeze({
        at: "v4470", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "tools/ship/brainKernels-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green on Dawn and on the browser's WebGPU through the device. The GPU Brain's kernels are exported: " +
                 "brain/mlp.js renders one body in two binding layouts (the brain's, uniform first; the harnesses', Y at 0) " +
                 "and carries a probe manifest against render/brainTsl.mjs's f32 twin; brain/flowfield.js exports its " +
                 "four-entry module; brain/ is a census root; the corpus runs the layer across both backends and through the " +
                 "device (128 of 128 exact everywhere) and compiles the flow-field module; tools/ship/brainTsl-page.js " +
                 "imports the kernel it used to regex out of the module's source; initGPU takes allowSoftware with the " +
                 "refusal still the default, exercised both ways on a stubbed adapter. The harnesses take [x, y, z] " +
                 "workgroups, and the first edit that added it commented out the pass end on the same line -- caught by " +
                 "the gate's own run before anything shipped. Sabotages red at 4 / 2 / 1, and B first crashed the gate " +
                 "with no red line, so the check catches now.",
    }),
    since93: Object.freeze({
        at: "v4471", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "tools/ship/tslLoopBound-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green on the browser's WebGPU through three 0.178, render/tslSource.mjs and gfx/device.js. Step 6 said for " +
                 "140 rounds that a TSL Loop wants a JavaScript bound; three's LoopNode builds a node `end`, and the sentence " +
                 "was an assumption. render/physicsTsl.mjs makeLogisticStepperTsl steps the logistic map `bound` times with " +
                 "the bound a vec4 uniform in one variant and a storage buffer's element in the other; each variant emitted " +
                 "once, transplanted, and run at 1, 2, 3, 50 and 200 steps with only the buffer changed -- 1,024 orbits " +
                 "bit-identical to the f32 twin at every count, the loop's bound read from the emitted text as the uniform " +
                 "or the element, the two passes in the corpus from tools/ship/tsl-emitted-loop.json. Sabotages red at " +
                 "7 / 14 / 14, and A is the finding: a baked bound leaves the storage variant's buffer unread, three emits " +
                 "no buffer the body does not touch, and the transplant refuses the graph by name.",
    }),
    // v4472 -- the ninety-fourth closing. The census widened, and the first thing it found had never compiled.
    since94: Object.freeze({
        // swept 0: the ledger's invariant is added.length === swept, and this round added no gate -- it widened two.
        at: "v4472", swept: 0, green: 0, red: 0,
        added: Object.freeze([]),
        widened: Object.freeze([
            "tools/ship/crossBackend-selfcheck.mjs (physics/mpm, tools/roundhouse and brain/ asserted by what they find; .wgsl files as candidates; a tree-wide walk for strays)",
            "tools/ship/wgslSpec-selfcheck.mjs (a reserved word declared as a name is refused, with the twin's name as the control)",
        ]),
        redOnArrival: Object.freeze([]),
        verdict: "green on Dawn and the browser's WebGPU. tools/ship/wgslCorpus.mjs census() walks physics/mpm, " +
                 "tools/roundhouse and brain/ and lists every .wgsl FILE under its roots as a candidate keyed by path; " +
                 "81 candidates, 70 in the corpus, 27 excluded, none unaccounted. The nineteen new ones were adjudicated " +
                 "by name: nine compile-only corpus entries (the HMC bench layout, Ising, the magnification map's base and " +
                 "shipped variant, eight transport passes -- all multi-buffer layouts the one-buffer harness cannot drive, " +
                 "each graded for arithmetic by its own gate) and five exclusions (the HMC step fragment and its renderer, " +
                 "the variant transformer, the two v2661 cloth solvers nothing loads). THE FINDING: scatter.wgsl declared " +
                 "`let target`, a WGSL reserved word, and both real backends refused it -- the three-pass transport route's " +
                 "scatter had never compiled on any device, while render/wgslSpec.mjs called the file clean because it did " +
                 "not know the reserved list. Renamed to the twin's `slot`; the validator carries the list with a control " +
                 "in its gate. Sabotage: a root dropped and a stray .wgsl planted in one run, 2 red by name. Pre-existing " +
                 "and not this round's: wgslSpec-selfcheck's 'requiredLimits appears 0 times' claim is red on trunk at 5 " +
                 "(main.js, brain/transport/scanTwin.mjs and vendored three all say the word); it sits above the quick " +
                 "sweep's budget, which is why no sweep named it.",
    }),
    // v4473 -- the ninety-fifth closing. The 3D orrery's first step: a sphere, lit, held to arithmetic.
    since95: Object.freeze({
        at: "v4473", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "tools/ship/litSphere-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([
            "tools/ship/shippedLadder-selfcheck.mjs (section 1 and 4 read the orrery's ladder as spheres through the lit pipeline; the universe stays discs)",
        ]),
        verdict: "green on WebGPU and WebGL2 through gfx/device.js, 2.3-2.9 s. render/litSphere.mjs: sphereMesh " +
                 "(world/spaceStructures.js's icosphere with normals, Euler's 2 at 42, 162 and 642 vertices) packed in the " +
                 "LAYOUTS.lit layout gpuDriven declared at v4301 and nothing used; a lit render pair in both languages with a " +
                 "point light in the uniform and an emissive word in the extras; shadeAt as the fragment stage's arithmetic. " +
                 "The key is a sphere the GPU never drew: for the gate's camera and light, each pixel inside the silhouette " +
                 "is held to the shade of the ray's first hit -- 316 pixels, mean 0.30/255, worst 1, on both backends, and " +
                 "25,600 pixels identical between them; the silhouette covers 1.0000 of a 64-gon disc; the flat pipeline and " +
                 "the emissive word are one-level controls. orrery-gpu.html draws lit spheres with the light at SweK and the " +
                 "centre body emissive; makeGpuDrivenScene takes `layout` in its one-fleet form. Sabotages red at 4 / 2 / 5, " +
                 "and C is the point: the picture right and the twin wrong reads red too, which a backend diff cannot say. " +
                 "Pre-existing and not this round's: tools/ship/gitEconomy-selfcheck.mjs is red on trunk (2 broke of 15 at " +
                 "the default upkeep; one departure off the best margin), above the quick sweep's budget and in no register.",
    }),
    // v4474 -- the ninety-sixth closing. The third orbital element, derived: opacity tilts a body out of the readable plane.
    since96: Object.freeze({
        // swept 0: this round added no gate -- it widened three.
        at: "v4474", swept: 0, green: 0, red: 0,
        added: Object.freeze([]),
        widened: Object.freeze([
            "tools/ship/gpuOrbits-selfcheck.mjs (eight-float elements, the twin positionAt3, the bound in three axes, z by tilt)",
            "tools/ship/orreryView-selfcheck.mjs (positionAt3: rigid, on the node at day 0, a sin i at a quarter period, positionAt when flat)",
            "tools/ship/orrery-selfcheck.mjs (opacityOf, inclinationFor, and the scanned tree's tilted bodies by name)",
        ]),
        redOnArrival: Object.freeze([]),
        verdict: "green on Dawn and the browser's WebGPU. world/orrery.mjs derives a body's inclination from its OPACITY " +
                 "-- the byte fraction in files nobody can read, times a 40-degree ceiling -- the way the axis comes from age " +
                 "and the size from bytes; the node is the body's phase, so at day 0 the 3D picture is the 2D one. Three of " +
                 "fifteen bodies tilt (fonts, box3d, wasm), twelve stay in the plane. positionAt3 is the classical rotated " +
                 "circle; render/gpuOrbits.mjs carries cos/sin of tilt and node precomputed in f64 in a second vec4 and keeps " +
                 "its one trig call; the GPU is within 6.1e-5 of the axis in three axes and z is exactly 0 for the untilted. " +
                 "positionAt is untouched and the 2D page draws what it drew. Sabotages red at 3 / 3 by name. Pre-existing " +
                 "and not this round's: orreryView-selfcheck's bake-drift check is red on trunk (orrery.json's arrivals and " +
                 "shas against git after v4414's commit); the bake is the rig's to rewrite.",
    }),
    // v4475 -- the ninety-seventh closing. The orbit camera: three gestures as arithmetic.
    since97: Object.freeze({
        at: "v4475", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "tools/ship/orbitCamera-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green headless, ~0.2 s, no browser. render/orbitCamera.mjs: a frozen state and pure functions -- a drag " +
                 "turns the yaw by exactly dx times radiansPerPixel and tips the pitch, clamped short of the poles; a wheel " +
                 "dollies geometrically, clamped to the state's limits; eyeOf is on the sphere about the target through " +
                 "fifty drags; the target projects to (0, 0) through gpuDriven's own lookAt and perspective; following " +
                 "moves the eye rigidly. The pole clamp is for something measured: lookAt at the pole has a zero x axis. " +
                 "orrery-gpu.html wires drag, wheel, click-to-follow (retargeted to positionAt3 each frame) and the tilt " +
                 "slider as the initial pitch; gpuOrbits-selfcheck still loads the page and sees it move. Sabotages red " +
                 "at 4 / 4 / 1 by name. Found while building: a dolly overflowing to Infinity was defaulting to 10 rather " +
                 "than clamping to the limit; an infinite request now clamps and only a NaN defaults.",
    }),
    // v4476 -- the ninety-eighth closing. Fleets and flybys as records of the orbit kernel; a blind sabotage found and removed.
    since98: Object.freeze({
        // swept 0: no gate added -- gpuOrbits widened by a section.
        at: "v4476", swept: 0, green: 0, red: 0,
        added: Object.freeze([]),
        widened: Object.freeze([
            "tools/ship/gpuOrbits-selfcheck.mjs (section 2b: 388 records of three kinds against satelliteAt and flybyAt; the page's full count derived)",
        ]),
        redOnArrival: Object.freeze([]),
        verdict: "green on Dawn and the browser's WebGPU. render/gpuOrbits.mjs places three kinds of record in one kernel: " +
                 "bodies as before, satellites as circles in the ecliptic about a parent recomputed from its elements, flybys " +
                 "by Barker's equation in f32 with the cube roots in the stable form D = u - 1/u. The twins are the 2D page's " +
                 "satelliteAt and flybyAt; satellites within 3e-4 (the parent's 2e-4 and their own), flybys within 2e-4, a " +
                 "flyby at its epoch at q, the GPU's count within a radius equal to passingWithin's (39 of 189). orrery-gpu.html " +
                 "draws 388 records -- 16 bodies, 148 importers, 35 paperwork, 189 passing -- naming each on a pick, following " +
                 "and landing on bodies only. Sabotages red at 3 / 3 / 2. THE FINDING IS ABOUT SABOTAGE: the first B dropped " +
                 "the cube root's sign guard and nothing went red, because the stable form's argument is positive for every " +
                 "W and the guard was dead code -- a sabotage that goes 0 red is a finding, per the ship skill, and the code " +
                 "it guarded is gone.",
    }),
    // v4477 -- the ninety-ninth closing. Labels through the device, by the cull's own rule.
    since99: Object.freeze({
        at: "v4477", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "tools/ship/sceneLabels-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green headless, ~0.2 s, no browser. render/sceneLabels.mjs labelsFor picks the records to label by the " +
                 "cull's own angular metric at the scene's near threshold, so the label count equals cullLodCpu's near-rung " +
                 "count on the same camera (12 of 36 on the gate's grid, the same records); the picked one is labelled " +
                 "however small; the projection is ev/esShipLabelsCore.js's, a record behind the camera or off the box gets " +
                 "none; the limit is measured (a sphere 2% past the edge is drawn and not labelled). orrery-gpu.html packs " +
                 "one SlugFontDevice atlas from the vendored IBM Plex Serif and draws the labels in a begin() frame over the " +
                 "scene through render/slugDevice.mjs; gpuOrbits-selfcheck loads the page and it throws nothing. Sabotages " +
                 "red at 7 / 4 / 1 by name.",
    }),
    // v4478 -- the hundredth closing. Promotion by table: six of ten rows held, four open, the button where the table says.
    since100: Object.freeze({
        at: "v4478", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "tools/ship/orreryPromotion-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([
            "tools/ship/litSphere-selfcheck.mjs (a baked tint palette on extra.y, painted flat on both backends; nine tints refused)",
        ]),
        verdict: "green headless (~0.5 s) and on both backends for the tints. The 3D orrery is NOT promoted, and the reason " +
                 "is a table rather than a preference: ten picture facts the 2D page holds, each measured from the modules and " +
                 "the pages; six held by the 3D page, four open by name (the planet zoom level, the author view, the post stage, " +
                 "the flyby trails); the panel's orrery button must agree with the verdict both ways, so a promotion on a good " +
                 "day and a closed table with a stale button are both red. Closed this round: the colours -- render/litSphere.mjs " +
                 "bakes a palette into both shaders as an if-chain on extra.y (WGSL cannot index a const array by a runtime " +
                 "value), and orrery-gpu.html tints every record with ui/orreryDraw.js's own STATE_COLOUR and REACHED_COLOUR, " +
                 "so a captured body is one green and a flyby SweK may not take one purple on both pages. Each page links the " +
                 "other. Sabotages red at 1 / 2 by name.",
    }),
    // v4479 -- the hundred-and-first closing. The treemap on the device terrain, and a pick picture that was never the terrain.
    since101: Object.freeze({
        at: "v4479", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "tools/ship/repoLanding-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([
            "tools/ship/landing-selfcheck.mjs (the terrain's own pick pipeline; every peak must name its file, 4 of 4 where 3 of 4 was tolerated)",
            "tools/ship/gpuTerrain-selfcheck.mjs (the pick pipeline's vertex stage is the terrain's; its uniform list matches its struct)",
        ]),
        verdict: "green on Dawn and the browser's WebGPU, and on WebGL2. render/bodyTerrain.mjs repoTerrainOf puts world/" +
                 "repoHeightfield.js's treemap -- the GitHub Terrain of v4149 -- into the RGBA8 field gpuTerrain lifts on both " +
                 "backends; a line is 80 bytes, measured; fileAt is the leaf whose rectangle contains the point; landingFor is one " +
                 "door and orrery-gpu.html offers both grounds by a select. Every texel within half a byte of repoHeightfield's " +
                 "height, 233 of 233 rectangle centres naming their file, 12 lakes below their landmasses. THE FINDING: picks at " +
                 "the six largest leaves missed 6 of 6 from 45 degrees and 5 of 6 from above, and the cause was the pick picture " +
                 "-- gpuDriven's default pick pipeline draws flat quads scaled by the cull radius, so the terrain's identity " +
                 "picture was a sheet of oversized overlapping squares since v4317; the hills gate's one-miss tolerance hid it " +
                 "for 162 rounds. gpuTerrain.terrainPickPipelineDesc picks with the terrain's own vertex stage: 6 of 6 and 4 of 4 " +
                 "on both backends, the tolerance gone. Sabotages red at 1 / 2 / 1 / 3 by name, D reproducing the old fault.",
    }),
    // v4480 -- the hundred-and-second closing. The Worley biome field on the device, held to its twin to the bit.
    since102: Object.freeze({
        at: "v4480", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "tools/ship/worleyDevice-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([
            "tools/ship/probeConvention-selfcheck.mjs (render/worleyWgsl.mjs in the kernel list: its PROBES run on Dawn under the contract)",
        ]),
        verdict: "green on Dawn (~2 s) and through gfx/device.js in the browser on both backends. render/worleyWgsl.mjs " +
                 "evaluates world/worleyBiomes.js's biome per texel of a terrain field in a compute pass: u32 hashing exact on " +
                 "both sides by construction, a 3x3 feature-point search, value noise, the Whittaker if-chain, a packed " +
                 "(primary, secondary, blend byte) element beside the raw blend. biomeFlat is one implementation with one " +
                 "rounding knob: the identity knob IS biomeAt to the bit over 4,096 random points and seeds; the fround knob is " +
                 "the device, the packed element identical on every one of 4,096 texels and the raw blend within 5.4e-7, one " +
                 "f32 ulp, the tolerance stated from that floor; 0 biome disagreements between the knobs, counted. The seed " +
                 "is the body's commit. paintBiomes paints a landing's green, blue and alpha through the device or the twin, " +
                 "byte-identical either way, and orrery-gpu.html paints every landing. Sabotages red at 2 / 5 / 3 by name; " +
                 "B (a hash multiplier off by one) parts every side at once, which is what a twin pinned both ways is for.",
    }),
    // v4481 -- the hundred-and-third closing. Biome looks and water on the device terrain; a plane measured wrong and replaced.
    since103: Object.freeze({
        at: "v4481", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "tools/ship/terrainLook-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([
            "tools/ship/worleyDevice-selfcheck.mjs (the green byte carries both biome ids, alpha the language layer + 1)",
        ]),
        verdict: "green on WebGPU and WebGL2 through gfx/device.js. render/gpuTerrain.mjs colours a fragment by a `look`: 0 the " +
                 "v4300 readout to the byte, 1 the fragment's own texel's Worley biomes lerped by the blend times the chunk's " +
                 "shade, 2 the treemap's language biome -- both palettes baked into both shaders from the shipped tables, " +
                 "terrainColourAt the twin, every chunk's pixel at worst 0 of 255 against it on both backends under all three " +
                 "looks. THE FINDING WAS THE PLANE: the first draft drew one translucent sheet at the level covering every lake " +
                 "bed, and the gate measured it at 0.80 with 39 of 64 dry chunks under water -- a treemap's lakes lie at their " +
                 "own landmass's height, so one level floods the rest. Each bed is flat at its own level already, so a lake " +
                 "texel is WATER_COLOUR over the Worley colour in the fragment and the plane is gone. Sabotages red at 5 / 7 / 1; " +
                 "B leaves the picture right and the twin wrong and reads red on both backends, which is the point of a twin.",
    }),
    since104: Object.freeze({
        at: "v4482", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "tools/ship/erosionMeasure-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green, headless. The last step of the git terrain asked whether world/erosion.js's hydraulic and thermal passes " +
                 "are a render/stepLoop.mjs candidate, and the answer is a measured won't-do-yet with the measurement as the gate: " +
                 "a 160x160 tile costs 1.9 / 3.0 / 2.4 ms (fill / hydraulic / thermal), 12.3 ms on the engine's generator in " +
                 "JavaScript and 8.3 ms in the WASM crate (built here for wasm32 by cargo alone, driven raw with stub imports), " +
                 "once per 128 voxels and already sliced under a 3 ms prewarm budget; the passes are sequential -- the thermal " +
                 "pass is Gauss-Seidel and a Jacobi dispatch differs on 2,678 cells, the 1,500 droplets write 6,485 cells two or " +
                 "more times and reversed move 12,393 cells by up to 2.4 voxels -- so a device pass is another algorithm that no " +
                 "tolerance short of voxels holds to the CPU, and a twin off by voxels is a third generator under the one-per-tile " +
                 "rule; the JavaScript and the crate already differ on 1,207 of 16,384 columns of one tile (max 2 voxels). " +
                 "Deterministic 25,600 of 25,600; one cell moved an f32 ulp changes one cell beside it, every cell moved an f32 " +
                 "ulp changes 25,120, an f64 ulp changes nothing because the field is a Float32Array. The decision is " +
                 "todo.mjs's erosion-device-port and the gate holds it to the numbers. Sabotages red at 1 / 1 / 1.",
    }),
    since105: Object.freeze({
        at: "v4483", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "tools/ship/tslWide-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green on WebGPU and WebGL2. render/tslSource.mjs's shell transplant carries COMPUTED varyings now -- the statements " +
                 "three writes in its vertex stage, taken by dependency with the temporaries they read -- into a shell that says where " +
                 "({{VARYINGS}}, {{ASSIGN}}), flat interpolation preserved, and the camera's projection matrix in the fragment by the " +
                 "shell's own name; computeShell folds a uniformArray into the struct as a fixed-size array field. render/tslWide.mjs " +
                 "is the consumer: on both backends the generated quad (three computed varyings, one flat, the camera in the fragment) " +
                 "is the hand twin on 16,384 of 16,384 pixels AND the shell-blind CPU twin at 1,024 pixel centres to a byte; the planes " +
                 "pass bit for bit through one uniform binding. THE FINDING: a flat varying whose vertices disagree is backend-dependent " +
                 "(first vertex on WebGPU, last on OpenGL ES): 0 pixels apart when the band is the cell's, 8,704 of 16,384 when it is " +
                 "the vertex's. Two first drafts caught by measurement: a positional window shipped an unwritten temporary (0 of " +
                 "16,384 on WebGPU), and nameless attributes bound nothing on WebGL2 while both halves agreed -- the CPU twin saw it.",
    }),
    since106: Object.freeze({
        at: "v4484", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "tools/ship/slugTsl-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green on WebGPU and WebGL2. Slug's fragment as TSL nodes (render/slugTsl.mjs), emitted by three's two builders and " +
                 "carried by the widened transplant into the SHIPPED Slug pipeline's own shell: 'Sphinx 42% AV' at 28 px drawn by " +
                 "the generated fragment is the shipped pipeline's picture on 23,040 of 23,040 pixels, worst 0, on both backends. " +
                 "The decision the measurement was for: NO TSL Slug material for the 0.178 pages (only orrery-gpu.html draws text, " +
                 "on the device already; three uploads the band atlas only at 32 bits and, here, not at all with data). Four rules " +
                 "found by emitting: no float-to-uint bitcast in three 0.178, a dropped parameter conversion, the uv-transform on " +
                 "a uv-less texture node, and a shell must name its varying struct (VSOut). The v4457 sentence 'the device shell " +
                 "is not its route' is withdrawn with the picture as the evidence.",
    }),
    since107: Object.freeze({
        at: "v4485", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "tools/ship/gposKern-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([
            "tools/ship/slugDevice-selfcheck.mjs (the rasteriser model takes the LAST triangle under a pixel, as the capture does)",
        ]),
        verdict: "green, headless. text/slugFont.js reads GPOS pair kerning (the default script's 'kern' feature, LookupType 2 directly " +
                 "or by extension, PairPos formats 1 and 2, both coverage and class-definition formats, the first glyph's xAdvance " +
                 "from the first subtable that applies) with the legacy kern table as the fallback, and layoutText reports GPOS | " +
                 "kern | none. THE FINDING: the vendored IBM Plex Serif has no kern table, so every label this tree drew was unkerned " +
                 "and the layout said so on every call. The gate holds the reader to a 326-byte table written from the specification " +
                 "(a foreign-language kern lookup not read, a ligature lookup not touched, placement fields stepped over, an " +
                 "extension at a 32-bit offset) and to the shipped font (A/V -50 and symmetric, f/) +95, n/n 0, 1,112 kerned pairs " +
                 "over the label alphabet, the test phrase 1.54 px narrower). Kerning reached a model: slugDevice's rasteriser took " +
                 "the first triangle under a pixel where the device keeps the last drawn; kerned A and V overlap, and it read the " +
                 "wrong glyph's texcoord by 0.636 em on both backends until the walk was reversed. Sabotages red at 5 / 2 / 1 / 1.",
    }),
    since108: Object.freeze({
        at: "v4486", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "tools/ship/vendoredFonts-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green, headless. Three OFL families vendored as static glyf instances under vendor/fonts/<family>/ with their own " +
                 "<Family>-OFL.txt (Cinzel, JetBrains Mono, Source Sans 3), registered in text/fontRegistry.mjs with source, fetch " +
                 "date, sha256, Reserved Font Name and what slugFont reads; the gate holds disk and registry to each other both " +
                 "ways, every file to glyf and static (a variable font refused by its fvar, shown on the real Orbitron[wght].ttf), " +
                 "every digest, glyph count, kerning source and one pair, every licence to OFL-1.1 by the tree's own identifier. " +
                 "Inter and Orbitron not vendored: variable-only on every host this box reaches. JetBrains Mono kerns by zero and " +
                 "says so (a monospaced GPOS with no pair kerning). Sabotages red at 1 / 1 / 1 / 2.",
    }),
    since109: Object.freeze({
        at: "v4487", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "tools/ship/fontPacks-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green on WebGPU and WebGL2. Measured first: parse + outline + pack of the 67-glyph label alphabet in the browser " +
                 "is 29 / 20 ms for Plex (cold / warm), 16 / 11 Cinzel, 8 / 8 JetBrains Mono, 10 / 13 Source Sans 3 -- about a frame, " +
                 "once, so the worker is a won't-do and the build step is the ticket. text/slugPack.mjs packs an alphabet into one " +
                 "byte-reproducible file (atlas texels, glyph records, the subset's cmap, advances, kern pairs, metrics); " +
                 "tools/ship/packFonts.mjs bakes every registered family's alphabets to vendor/fonts and writes the digests into " +
                 "text/fontRegistry.mjs; fromPack on both font classes goes from bytes to textures with no parse. The gate holds " +
                 "each pack to a fresh pack byte for byte, to its digest, its decoded layout and atlas to the parse path's, and the " +
                 "phrase drawn from the pack to the parse path's picture on 23,040 of 23,040 pixels for all four families on both " +
                 "backends -- 3 to 6 ms against 15 to 52. Sabotages red at 5 / 13 / 9 / 8 -- one flipped texel moved 3 pixels, and the picture rows saw it.",
    }),
    since110: Object.freeze({
        at: "v4488", swept: 0, green: 0, red: 0,
        added: Object.freeze([]),
        widened: Object.freeze([
            "text/slug-selfcheck.mjs (section 9: maxWidth word wrap -- the dropped break space, centred symmetry, exact fit, kerning reset, the long-word fallback, newline composition, the unwrapped default)",
        ]),
        redOnArrival: Object.freeze([]),
        verdict: "green, headless. text/slugText.js layoutText takes opts.maxWidth: a break at the last space that fits with the " +
                 "break's space dropped from the line (a centred wrapped line is placed by its glyphs' width alone), an exact fit " +
                 "not wrapped, kerning reset across a soft break, a word wider than the width broken at the glyph that would " +
                 "overflow and never before a line's first glyph, newlines composing with soft breaks, and the unwrapped default " +
                 "unchanged; the result names lineWidths and softBreaks. Held on the constructed font in font units, where every " +
                 "expected width is a sum somebody can check by hand. Sabotages red at 3 / 5 / 2 / 1 -- the break space kept, kerning carried across a break, the long-word fallback removed, an exact fit wrapped.",
    }),
    since111: Object.freeze({
        at: "v4489", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "tools/ship/deviceFeatures-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green on WebGPU, WebGL2 and the null backend. gfx/device.js requestDevice negotiates the optional features the " +
                 "adapter offers (timestamp-query, subgroups, shader-f16 by default), refuses a required-but-absent one by name " +
                 "before WebGPU would throw, and reports the granted set on device.features and device.capabilities; a frame with " +
                 "timing: true brackets every compute pass and the render pass with GPU timestamps and returns gpuMs, WebGL2 " +
                 "refuses it by name, the null backend records it; the transplant keeps enable subgroups; when a shell's device " +
                 "has it. MEASURED here: SwiftShader grants timestamp-query and subgroups; a timed frame reads compute 0.101 ms " +
                 "and render 6.558 ms, held above zero because a first draft spelled the write indices wrong and read zeros " +
                 "that looked like a coarse clock. Sabotages red at 1 / 1 / 1 / 1 -- B went 0 red first (a lying report hid behind an unasked entry) and the entry-for-entry row was added for it.",
    }),
    since112: Object.freeze({
        at: "v4490", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "tools/ship/slugRig-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green here, RIG-PENDING on the rig. slug-rig.html draws a wall of glyphs per vendored face (Sawarabi Gothic " +
                 "vendored as the dense CJK case) at five sizes and three squashes, timed by GPU timestamps where granted and " +
                 "labelled cpu otherwise, beside the atlas's own curves-per-band statistics; render/slugRig.mjs holds the plan, " +
                 "atlasStats and a grader that refuses eight lies and reports a quick run as quick. MEASURED: the kanji wall walks " +
                 "1.22x the curves per band of Plex's (8.00 against 6.55; 19 against 17 at most), 39 curves a glyph against 32 -- " +
                 "the header's a-priori 2x and 3x were wrong and were corrected to the measurement. Sabotages red at 1 / 1 / 1 / 1 " +
                 "-- A went 0 red first (the OFFSET field read as the count passed every ratio hold at 76 a band) and the " +
                 "no-band-counts-more-than-its-glyph row was added for it.",
    }),
    since113: Object.freeze({
        at: "v4491", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "tools/ship/slugCurve-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green on both backends. text/slugCurve.mjs bends Slug text along a curve by strips, each with its midpoint " +
                 "frame's Jacobian and edges at their own normals (no crack, no double-dilated seam); SlugDeviceBatch.setBuilt " +
                 "takes the stream; slug-curved.html draws four arcs. MEASURED: one bent quad is wrong by 0.84 px, eight strips " +
                 "by 0.08, halving per doubling (first order: a strip is a trapezoid); the rasteriser model reproduces the " +
                 "device to 5.6e-7 em once it pushed half a pixel per component of aPos.zw rather than along its unit vector; " +
                 "the strips cost 5.0 of 255 on average against the exact resample, and the worst pixel is a coverage step in " +
                 "slugEval itself. Sabotages red at 3 / 7 / 8 / 6 -- A went red first only on the cost rows (the model read the " +
                 "same wrong Jacobian and the headless hold was a property the flat one shares) and the hold became the frame itself.",
    }),
    since114: Object.freeze({
        at: "v4492", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "tools/ship/slugShaping-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green, headless. The reviewed plan's bidi shaping and CJK fillText fallback recorded as wont in tools/ship/todo.mjs " +
                 "with the reasons measured: every vendored face maps 0 Hebrew, Arabic or Devanagari codepoints (a Hebrew string on Plex " +
                 "is .notdef throughout), a whole-string reverse is held apart from UAX #9's visual order by name, and Sawarabi Gothic " +
                 "lays out and packs the rig's kanji text with no .notdef (4,469 ideographs, 188 kana in its cmap). Sabotages red at " +
                 "1 / 2 / 2 / 3 -- D went 0 red first (a predicate loosened to admit .notdef never met one on fully-mapped text) and the " +
                 "control row plus the input-side sabotage were added for it.",
    }),
    since115: Object.freeze({
        at: "v4493", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "tools/ship/slugReupload-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green on both backends. The per-frame Slug vertex reupload measured (24 labels: 343 quads, 115 KiB a frame, 1,920 buffer " +
                 "creations over 40 frames on the old path) and the cheap fix built: SlugDeviceBatch and SlugTextBatch write into the " +
                 "buffers they have when the stream fits (queue-ordered, no fence needed), reallocating on growth, and skip the index " +
                 "write entirely because the index stream is structural (quad k is 4k + (0,1,2, 0,2,3)) -- found when sabotage D's " +
                 "skipped index write was invisible. Reuse allocates nothing once warm and draws the same pixels; recreate 9.6 / 0.9 ms, " +
                 "reuse 8.7 / 0.6, draw-only 8.4 / 0.2 (WebGPU / WebGL2, CPU-timed on SwiftShader). The ring buffer is a won't-do. " +
                 "Sabotages red at 4 / 4 / 1 / 3.",
    }),
    since116: Object.freeze({
        at: "v4494", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "tools/ship/threeProbe-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green here, RIG-PENDING on the rig. three-probe.html fetches a named three version from the npm registry in the " +
                 "browser, walks the tarball, blob-imports the build beside the vendored 0.178 and renders one TSL gradient with each; " +
                 "render/threeProbe.mjs holds untar, pickBuild, rewriteImports and a grader that refuses eight lies. MEASURED on this " +
                 "box: the control draws on both routes; three@0.185.1 draws on three's WebGL2 backend and is refused on WebGPU by the " +
                 "browser's GPUTextureViewDescriptor lacking swizzle -- v4319's finding by name, so the pin is at least the build box's. " +
                 "The tarball cache went outside the tree after colourReach counted the cached build as an arrival. Sabotages red at " +
                 "1 / 3 / 1 / 1.",
    }),
    since117: Object.freeze({
        at: "v4495", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "tools/ship/textureBytes-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green here, RIG-PENDING for the asset library. tools/ship/textureBytes.mjs counts raster texture bytes on disk and " +
                 "on the GPU from the PNG and JPEG headers and derives the KTX2 / Basis verdict from the totals. The tree: 16 files, " +
                 "378 KiB on disk, 18.05 MiB on the GPU (13.8 MiB one JPEG), 70 procedural texture sources against 16 loaders -- " +
                 "not-yet, recorded as wont (ktx2-basis). The header readers are held against a full PNG decoder and the browser's " +
                 "JPEG decode; the census against an independent walk. Sabotages red at 2 / 6 / 3 / 1.",
    }),
    since118: Object.freeze({
        at: "v4496", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "tools/ship/slugProjective-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green on both backends. render/slugProjective.mjs: SlugDilate on the CPU, rotation and perspective rows, a " +
                 "perspective-correct rasteriser model (tex/w and 1/w affine, divided per pixel). Rotated text: the model matches the " +
                 "fragment's texcoord to 1.27e-7 em and the frame is exact; in perspective (w ratio 2.11): 2.11e-7 em, the frame exact " +
                 "on WebGPU and within 2 of 255 on WebGL2; an affine model is 0.635 em off. The dilation under perspective is half a " +
                 "pixel per axis ON SCREEN from a (0.522, -0.522) push in vertex space. slug-projective.html draws both with sliders. " +
                 "Sabotages red at 4 / 5 / 1 / 4 -- C (the rows builder) is headless-only by design, since the page draws the rows the " +
                 "builder made.",
    }),
    since119: Object.freeze({
        at: "v4497", swept: 2, green: 2, red: 0,
        added: Object.freeze([
            "tools/ship/slugTicker-selfcheck.mjs",
            "tools/ship/deviceUniformsPerDraw-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green on both backends. render/slugTicker.mjs: one box3d box per glyph on a conveyor with a wrap, each drawn " +
                 "through the projective path with rows = P * V * B; 900 ticks hash the same twice, bodies at rest in the lane, the " +
                 "tick-300 snapshot within 1 of 255 of slugEval on both backends. FOUND AND FIXED IN THE DEVICE: the WebGPU pass " +
                 "applied only the last uniform write of a frame to every draw (queue.writeBuffer precedes the command buffer); a " +
                 "per-pipeline pool of uniform buffers with a CPU shadow, reset per frame, now gives each draw its own -- " +
                 "deviceUniformsPerDraw holds four quads at four offsets in four colours in one pass, a colour set once reaching " +
                 "four draws, and the pool at four buffers over three frames. Sabotages: ticker 3 / 6 / 1 / 6 (A first blind on " +
                 "the quarter-turn row; an orthonormality hold added), device 3 / 1 / 1 (B and C first 0 red: a shadow copy no draw " +
                 "relied on, a leak no pixel shows; a frame and a pool-length row added).",
    }),
    since120: Object.freeze({
        at: "v4498", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "tools/ship/slugMorph-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green on both backends. vendor/morphicons (the core, MIT, papered) arrived as strokeMorph's written refusal " +
                 "expired; render/slugMorph.mjs morphs one glyph outline into another through it and packs one glyph a frame " +
                 "for Slug (SlugFontDevice.fromAtlas, one shared pipeline). Endpoints are the plan's samples to 1e-16, a frame " +
                 "costs 1.9 ms, the t = 0.5 frame is within 2 of 255 of slugEval on both backends. FOUND: morphicons duplicates a " +
                 "subpath to pair 2 contours with 3, and under non-zero winding two coincident holes read as ink -- duplicates " +
                 "are dropped at the endpoints, the splitting overlap recorded. Sabotages red at 5 / 4 / 7 / 2; A went 0 red first " +
                 "(a closing re-pin that pinned nothing) and was removed rather than held.",
    }),
    since121: Object.freeze({
        at: "v4499", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "tools/ship/stereographic-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green on both backends. render/stereographic.mjs: the little-planet projection as a pure function, a fragment " +
                 "pass in both languages sampling procPlanet's bake with nearest sampling, and a CPU twin; the pass is the twin texel " +
                 "for texel on 99.5% of pixels and the rest are texel-boundary neighbours that are bake colours. The bake's own texel " +
                 "directions round-trip to their texels. A 14th dual-language module: parity and census baselines raised by name, the " +
                 "WGSL in the corpus. little-planet.html is the view. Sabotages red at 6 / 2 / 4 / 5 -- B (the seam's fract) changed no " +
                 "pixel and its text hold was dropped for a roll sabotage.",
    }),
    since122: Object.freeze({
        at: "v4500", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "tools/ship/slugFill-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green on both backends. The Slug fragment's optional fill in both twins (a sampler, a texture and fillRect under " +
                 "defines.fill; the plain text byte-identical without it) and render/slugFill.mjs (fillUv, sampleFill, the Doom Fire " +
                 "as rgba8). The filled 8 is slugEval's coverage times the fill's nearest texel on 9,216 of 9,216 pixels on both " +
                 "backends, 0 apart -- after the fragments were made to clamp the uv themselves, because the first run had WebGPU's " +
                 "sampler wrapping the dilated top edge to the fire's white source row where WebGL2's clamped. slug-fire.html is the " +
                 "view. Sabotages red at 2 / 3 / 2 / 2.",
    }),
    since123: Object.freeze({
        at: "v4501", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "tools/ship/slugMelt-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green on both backends, after a CORRECTION to v4500's fill: the clamped uv still put the flipped sample coordinate at " +
                 "exactly 1.0 below the rectangle's floor, where WebGPU wraps and WebGL2 clamps (69 pixels at t = 0.5, hidden in the fill " +
                 "gate by zero coverage); both fragments now clamp the sample to the texel centres. render/slugMelt.mjs: the morph's " +
                 "target a puddle on the floor plus a pinhole per hole -- without pinholes the 0's winding sums to zero at t = 1 and it " +
                 "melts into nothing. The three frames are coverage x the fire's nearest texel on 9,216 of 9,216 pixels on both backends, " +
                 "0 apart, through one shared fill pipeline. slug-morph.html gained the melt mode. Sabotages red at 1 / 5 / 1 / 1.",
    }),
    since124: Object.freeze({
        at: "v4502", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "tools/ship/slugNapalm-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green on both backends. render/slugNapalm.mjs: the ticker's glyph bodies through the fire fill and a trail of puddles " +
                 "laid flat on the floor, one stream with a colour per quad (buildVertices takes a glyph's own colour now, opts.color the " +
                 "default). The tick-300 snapshot: bodies alone exact, trail alone and together the composited key with 0 unexplained " +
                 "pixels -- after the key learned to round per layer as the rgba8 target does, to count pixel centres on shared quad " +
                 "edges as the fill rule's, and to widen a clipped quad's tie band to a snap unit. slug-ticker.html gained the napalm " +
                 "mode. Sabotages red at 5 / 1 / 2 / 1.",
    }),
    since125: Object.freeze({
        at: "v4503", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "tools/ship/slugShatter-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green on both backends. render/slugShatter.mjs: a ticker glyph cut into nine box3d shards each carrying its sub-rectangle " +
                 "of the glyph (a quad with the cell's texcoords and the glyph's atlas words; the shader never learns the glyph was cut), " +
                 "bursting from a seeded generator, pooled and parked at life with the glyph returning at its spawn. The tick-312 frame " +
                 "fits the model per quad to 3.3e-6 em and is slugEval's coverage on 48,000 of 48,000 pixels on WebGPU. slug-ticker.html " +
                 "gained the shatter button. Sabotages red at 1 / 2 / 5 / 4.",
    }),
    since126: Object.freeze({
        at: "v4504", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "tools/ship/zoomBlur-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green on both backends. render/zoomBlur.mjs: a radial march toward an arbitrary centre in both languages, 32 bilinear " +
                 "samples averaged and replacing the scene, clamped to the texel-centre range in the shader; within 1 of 255 of the CPU " +
                 "twin on every pixel at three settings, the backends 0 apart. GODRAYS_FS run raw beside it on the same scene: black under " +
                 "its luminance gate and its depth gate where the zoom blur is unchanged, and 31 for a grey of 128 where the zoom blur " +
                 "returns 128. The 15th dual-language module: parity and census baselines raised by name, the WGSL in the corpus. " +
                 "zoom-blur.html is the view. Sabotages red at 5 / 5 / 5 / 3 -- the clamp sabotage was blind twice (the bake's seam, then " +
                 "one sample in 32) before the edges were painted and a strength-0 setting added.",
    }),
    since127: Object.freeze({
        at: "v4505", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "tools/ship/asciiShape-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green on both backends. render/asciiShape.mjs, after edoardolunardi/ascii-logo (MIT, read and hand-written): 95 glyph " +
                 "shape vectors of six disc averages DERIVED from Plex through slugRender and normalised per column, a cell pass in both " +
                 "languages taking the same six samples of the scene and picking the nearest by squared distance, a CPU twin. The " +
                 "fragment's argmin is the twin's on 504 of 504 cells with 0 near-ties on both backends. Three cells of one mean pick " +
                 "three glyphs by shape where asciiLut's scalar picks one. ascii-shape.html prints the picks through Slug. Sabotages " +
                 "red at 6 / 2 / 3 / 2 -- C showed the cell-for-cell holds cannot see the table's content; the derivation holds do.",
    }),
    since128: Object.freeze({
        at: "v4506", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "tools/ship/water2d-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green on both backends. render/water2d.mjs, after StefanJo3107/2D-Water-Shader (MIT, read and hand-written): two seeded " +
                 "displacement maps scrolled and parallaxed, their sum displacing the scene sample, a tint curved by greyness, foam by " +
                 "threshold, every read an integer texel in both languages with a CPU twin. On a ramp whose colour is its texel index the " +
                 "fragment reads the twin's texel on every non-boundary pixel and the foam mask is the twin's pixel for pixel; a camera " +
                 "shift of three map texels moves the mask exactly eight pixels on 14,592 of 14,592. Three corrections to the gate's own " +
                 "arithmetic first (a .5 the two precisions round apart, grid sizes on texel boundaries, a shift compared backwards). " +
                 "water-2d.html is the view. Sabotages red at 7 / 7 / 6 / 7.",
    }),
    since129: Object.freeze({
        at: "v4507", swept: 0, green: 0, red: 0,
        added: Object.freeze([]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "no gate: a record round. edoardolunardi/kugiri (MIT) read and not taken -- a DOM wrap-point splitter with no DOM " +
                 "text to find on the Slug and WGSL path and no wrap point to read on the one-line ticker, a real gap only for " +
                 "multi-line HTML copy revealed line by line, which nothing named. docs/SHADER-REPO-SWEEP.md carries the entry " +
                 "beside the two built this pass; world/reachedLicences.mjs records it (reachedLicences-selfcheck green). Checked " +
                 "by grep: getClientRects and extractContents appear nowhere in the tree.",
    }),
    since130: Object.freeze({
        at: "v4508", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "tools/ship/cityGenSeed-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green, headless. world/CityGen.js drew every decision from Math.random since round 253; generate() takes a seed now " +
                 "and draws from procPlanet's mulberry32, with the damage rolls on a second stream seeded from the same number. One " +
                 "seed stamps the same voxel list byte for byte twice and topples the same building the same way twice; a different " +
                 "seed differs; regenerating after any damage stamps the first city again; the default seed is fixed. The first of the " +
                 "four building rounds after VladimirKobranov/configurator-unreal-building. Sabotages red at (see the gate header).",
    }),
    since131: Object.freeze({
        at: "v4509", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "tools/ship/buildingGrammar-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green, headless. world/buildingGrammar.mjs: the configurator's rules as data -- cells on three axes, a role per cell " +
                 "by position, seeded variants, stairs by column on one facade, a party-wall flag per side that blanks the face and " +
                 "removes the stairs, accessories by percentage, every roll drawn before its branch. One seed one hash; five sizes " +
                 "match the closed-form counts; a party wall on any side moves zero placements on the others; the accessory rate is " +
                 "inside four sigmas at 25 and 60. Recorded in world/reachedLicences.mjs and the sweep document. Sabotages red at " +
                 "3 / 2 / 1 / 6 -- A showed the party-wall property holds trivially on the last side the loop visits, so all four are held.",
    }),
    since132: Object.freeze({
        at: "v4510", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "tools/ship/buildingFacade-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green, headless. world/buildingFacade.mjs on CityGen: the grammar run per building (a cell per voxel column, floors of " +
                 "three), windows as glass, the stairs column's door as an opening, and the party-wall flags DERIVED from which rects " +
                 "share a wall; hit points are the voxels that exist. Seed 7 stamps the same list twice and a different one from the " +
                 "solid stamp; two buildings wall to wall get a blank shared face on both; a city at minGap 0 has five touching pairs, " +
                 "all blank on both sides. A first draft's two-voxel cells left small buildings all corners and windowless. Sabotages " +
                 "red at (see the gate header).",
    }),
    since133: Object.freeze({
        at: "v4511", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "tools/ship/splatMesh-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green, headless. physics/splat/splatMesh.mjs, after isaac-mason/splatmesh (MIT, read and hand-written): splat opacity " +
                 "rasterised into a sparse voxel volume by centre or by footprint, max-accumulated, and naive surface nets out -- the " +
                 "first collision surface the splat stack has had. Held watertight by edge count (Euler 2 on a ball, 4 on a thick shell), " +
                 "vertex for vertex and triangle for triangle against a second mesher written the other way round, and raycast through " +
                 "mesh/meshBVH.mjs. Both meshers' first drafts shared an off-by-one the watertight hold caught; sabotage C was blind " +
                 "until a density sat exactly on the iso. Sabotages red at 5 / 4 / 1 / 2.",
    }),
    since134: Object.freeze({
        at: "v4512", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "tools/ship/buildingLab-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green on both backends. render/buildingLab.mjs: every grammar placement as an instanced unit cube through gpuDriven's " +
                 "records and the lit pipeline, tinted by kind; the cull twin sees every placement and the frame's coverage is a CPU " +
                 "ray-versus-boxes silhouette on 19,186 of 19,200 pixels with the rest at edges. building-lab.html: a seed, cell counts, " +
                 "party walls, the stairs side and accessory percentages live, the counts and hash in the HUD. Sabotage A was blind on " +
                 "the symmetric default building until the gate's building was made asymmetric. Sabotages red at 1 / 1 / 3 / 3.",
    }),
    since135: Object.freeze({
        at: "v4513", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "tools/ship/splatProbes-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green, headless. render/splatProbes.mjs: an order-2 SH irradiance probe volume from six cube faces per probe, from the " +
                 "technique of isaac-mason/three-spark-light-probes and not its source (no LICENSE file; recorded UNPAPERED in " +
                 "world/reachedLicences.mjs). The projection is held to the closed forms -- a constant radiance, one lit face " +
                 "against the reduced integrals of z and z^2, a gradient -- at 1e-6; the irradiance of a constant is pi L; the " +
                 "trilinear sample reads a probe's own coefficients at its position and the linear interpolation between; the " +
                 "seven-plane packing round-trips exactly in Float32; a nearest-hit splat source bakes a two-tone shell into probes " +
                 "that read its tones. Sabotages red at 20 / 1 / 4 / 5; the sign sabotage was caught only by the x and y ramps.",
    }),
    since136: Object.freeze({
        at: "v4514", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "tools/ship/probeLit-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green on both backends. render/probeLit.mjs: the v4513 probe volume on gfx/device.js -- the seven packed planes as one " +
                 "rgba16float atlas read by integer texel, trilinear between eight probes and the nine-term SH irradiance in both shader " +
                 "languages on litSphere's vertex stage and tint chain. A 0.9 sphere under four bakes (position, two-tone sky, splat " +
                 "shell, quadrupole) matches splatProbes.shadeAt on the same halves to a mean of 0.2 of 255 with a worst of 1, the two " +
                 "backends 0 pixels apart. Sabotages red at 9 / 4 / 3 / 7; the lobe-factor sabotage was blind on the pixels until the " +
                 "quadrupole bake was added. backendParity 154 / 137 / 73 / 21 and the census dual baseline 18 carry the new module.",
    }),
    since137: Object.freeze({
        at: "v4515", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "tools/ship/probeFit-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green, headless. render/probeFit.mjs: the probe box fitted to occupancy through splatMesh's rasterised volume -- per " +
                 "axis the trim quantiles of the occupied voxels plus an apron, so one outlier splat among thousands cannot stretch it " +
                 "(cloudBounds does: 1,944 probes against the fit's 512 on the same shell); probes inside solid voxels flagged, left " +
                 "unrendered and filled from the nearest open probe by world distance. The first hand grid had zero height and " +
                 "probeGrid's two-probe minimum put an open probe AT each solid one; the gate's line is a 5 x 2 x 2 box now. " +
                 "Sabotages red at 4 / 2 / 2 / 1.",
    }),
    since138: Object.freeze({
        at: "v4516", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "tools/ship/probeLab-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green on both backends. splat-probes.html and render/probeLab.mjs: the v4513 volume fitted by probeFit, baked from the " +
                 "two-tone shell and drawn from INSIDE it through two gpuDriven fleets -- the splats as emissive tone markers by the " +
                 "lit chain, the probes and a centre mesh by the probe-lit pipeline, so each probe sphere is lit by its own coefficients. " +
                 "The lab is data (records, extras, fleet map, HUD) and held headless; the frame's mesh pixels read warm above the horizon " +
                 "and cool below on both backends, 1 pixel apart. Three gate-side corrections (a Float32 tone compare, a cull hold that " +
                 "cannot be every record from inside a shell, a mirrored ray key) and one blind sabotage (the mesh dropped, the backdrop " +
                 "carrying the same split) closed by a hold that every keyed mesh pixel is lit. Sabotages red at 1 / 3 / 3 / 1.",
    }),
    since139: Object.freeze({
        at: "v4517", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "tools/ship/voxelDevice-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green on both backends. The sandbox on the device, round 1: render/voxelDevice.mjs draws world/world.js's VoxelWorld " +
                 "with CityGen's facade city through gfx/device.js -- the sandbox's own greedy mesher per chunk with its eight " +
                 "neighbours, flat normals from the winding, the registry's colours with the corner AO folded in, one lit mesh, one " +
                 "record, litSphere's pipeline under a sun. sandbox-gpu.html is the page. Held on hand worlds (a seam draws no face, " +
                 "the floor is omitted as the renderer omits it), on the 225-chunk world (the same hash in node and Chromium), and on " +
                 "a frame keyed by the browser's own DDA through the world it drew. The raycaster's first draft left the slab when a " +
                 "ray started above it, so every camera ray missed. Sabotages red at 4 / 6 / 2 / 2.",
    }),
    since140: Object.freeze({
        at: "v4518", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "tools/ship/voxelEdit-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green on both backends. The sandbox on the device, round 2: render/voxelDeviceEdit.mjs gives every chunk a slot in the one " +
                 "world mesh (its count with a quarter headroom, a multiple of 3, the tail zeroed so the draw's index count never moves); " +
                 "an edit re-meshes the touched chunk and the neighbours within a voxel, interleaves them in packMeshes' own layout (held " +
                 "float for float) and writes the slots through the scene's vertex buffer (gpuDriven now exposes vbuf, ibuf and stride per " +
                 "fleet); a chunk that outgrows its slot repacks the world with that slot doubled. pickVoxel, digAt and buildAt are the " +
                 "sandbox's two edits through a pixel; sandbox-gpu.html clicks to dig and shift-clicks to build. The dug and built frames are " +
                 "0 pixels from full rebuilds on both backends. Sabotage D (the tail uncleared) was blind until an edit that SHRINKS a chunk " +
                 "was added. Sabotages red at 8 / 3 / 1 / 3.",
    }),
    since141: Object.freeze({
        at: "v4519", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "tools/ship/voxelBodies-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green on both backends and headless on the wasm. The sandbox on the device, round 3: render/voxelBodies.mjs runs the " +
                 "sandbox's crates on box3d and reaches them the voxels through a COLLISION WINDOW -- runs of solid voxels along x " +
                 "around each body become static boxes from a pool per run width, parked when unused -- so a crate rests on the slab " +
                 "at exactly the surface plus its half, falls where there is nothing, and falls when round 2 digs the voxel under it. " +
                 "The bodies draw as a second gpuDriven fleet through a lit pipeline that reads the quaternion from the record's " +
                 "extras. THE FINDING: box3d sleeps a resting body and a static box moved away by setTransform does not wake it, so " +
                 "the first crate sat over its hole; the window now wakes every body with a zero impulse when its runs change. " +
                 "Sabotages red at 1 / 4 / 1 / 3.",
    }),
    since142: Object.freeze({
        at: "v4520", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "tools/ship/voxelDamage-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green on both backends. The sandbox on the device, round 4: render/voxelDamage.mjs carries the sandbox's own damage -- " +
                 "CityGen's hit points, crumble passes and topple, the debris system's bursts -- onto the device world through syncDirty, " +
                 "which re-meshes every chunk the world marked dirty plus its neighbours, so any writer reaches the slots; blastAt carves a " +
                 "sphere, bursts debris for every voxel it removes, charges each building the voxels it lost, and syncs; shootAt is a ray " +
                 "and a blast; the debris draws as a third fleet whose colour rides in the extras. THE FINDING, which reached round 3 too: " +
                 "on WebGPU a { count, cpu } record source is uploaded once, so moving records need the scene's own storage buffer -- the " +
                 "debris never appeared on WebGPU and the crate had only appeared to move; both scenes carry the buffer now and the bodies " +
                 "gate moves a crate after its scene is made. And the twentieth dual-language shader module was one lit variant away: the body and " +
                 "debris pipelines are litSphere's own shader in two new MODES (extra: quat, extra: colour) now, the two modules author no " +
                 "shader text, and the parity and census baselines stand where v4514 left them. Sabotages red at 1 / 3 / 2 / 3.",
    }),
    since143: Object.freeze({
        at: "v4521", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "tools/ship/voxelSave-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green on both backends and headless. The sandbox on the device, round 5: world/WorldPersistence.js's payload and its " +
                 "application became methods (buildPayload, validatePayload, applyPayload) that save() and load() call, so the device " +
                 "page saves what index.html saves and a gate holds the format with no IndexedDB in the room; render/voxelSave.mjs adds " +
                 "the device side -- load then round 4's syncDirty (a restored chunk is dirty), export and import through JSON with " +
                 "base64 voxels (the legacy v1 spelling load() still reads), the page's orbit as the sandbox's camera pose. In the " +
                 "browser an edited world saved to IndexedDB and a fresh world loaded from it draw 0 pixels apart. Sabotage C threw " +
                 "instead of failing by name until the export's version became a hold. Sabotages red at 5 / 5 / 4 / 1.",
    }),
    since144: Object.freeze({
        at: "v4522", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "tools/ship/voxelAvatar-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green on both backends and headless. The sandbox on the device, round 6 of 6: render/voxelAvatar.mjs carries " +
                 "camera/camera.js's own first-person camera -- WASD at 5, Shift 9, Space 7.5 under 18, eye 1.7 over a bilinear " +
                 "ground, auto-step, wall slide, world.voxelAt -- onto the device page; it constructs with no canvas and steps with " +
                 "_move(dt), so the gate walks it headless on a hand world and holds avatarViewProj to camera/buildViewProj.js element " +
                 "for element. sandbox-gpu.html's Walk drops the avatar at the last picked voxel. THE FINDING, recorded and not fixed: " +
                 "the camera's ground sample blends only toward +x and +z, so a two-voxel wall is climbable one way and a wall the " +
                 "other, and a two-voxel ledge walked off toward +z sticks at its lip. Sabotages red at 5 / 12 / 13 / 4.",
    }),
    since145: Object.freeze({
        at: "v4523", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "tools/ship/kenneyKit-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green on both backends and headless. Racing city 0: Kenney's Starter-Kit-Racing and Starter-Kit-City-Builder vendored " +
                 "as models and colormaps only (vendor/kenney-racing, vendor/kenney-city; MIT, (c) Kenney, the licence files read and hashed, " +
                 "each PROVENANCE.md pinning the upstream commit and recording that each README's year is not the file's), registered in " +
                 "world/vendoredLicences.mjs; world/kenneyKit.mjs the manifest of 28 models with bytes, sha256, counts and spans, the parse " +
                 "through gpu/glbLoad.js and GLBParser, vertex colours baked from the kit's colormap at each uv, packMeshes' lit layout, one " +
                 "fleet per model in litSphere's quat mode; kenney-kit.html the grid on both backends. THE FINDING: GLBParser resolved a " +
                 "binary GLB's external image against the page (only the .gltf path set _baseUrl), one 404 per model; fixed. Sabotages " +
                 "red at A / B / C / D (see the gate's header).",
    }),
    since146: Object.freeze({
        at: "v4524", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "tools/ship/raceTrack-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green on both backends and headless. Racing city 1, phase 1 on the flat: world/raceTrack.mjs lays a seeded simple cycle of " +
                 "cells on a 12 x 12 grid (a rectangle ring grown by seeded bumps) and turns every cell into one of Kenney's tiles by a grammar " +
                 "MEASURED on the vendored models (which edges the asphalt leaves through) and a turn derived through the shader's own rotateQ; " +
                 "the centreline, kerbs, checkpoints and CityGen's blocks derive from the same cells; race-track.html draws tiles and the " +
                 "greedy-meshed world in one gpuDriven scene on both backends (kitScene took extraFleets). THE CORRECTION: the first invariant, " +
                 "no two cells adjacent unless consecutive, refused twenty of twenty seeds -- a bump leaves its two cells side by side, which is " +
                 "a hairpin and a fact of the generator; and the first frame key sampled cell centres, which on a corner tile land among " +
                 "Kenney's trackside props, so the centreline is what the frame is held to. Sabotages red at A / B / C / D (the gate's header).",
    }),
    since147: Object.freeze({
        at: "v4525", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "tools/ship/raceCar-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green headless on the wasm and in the browser on both backends. Racing city 2: physics/raceCar.mjs is one box3d chassis body " +
                 "on four raycast wheels from physics/vehicle.mjs over an analytic surface of the flat track (asphalt, the raised kerb band, " +
                 "grass, void), the buildings static boxes, the controller contract { throttle, steer, brake }, a pursuit driver that laps " +
                 "seed 1, and a lockstep fingerprint folded from box3d's state hash that the browser reproduces; race-car.html drives it live " +
                 "through kitScene's new dynamic record. THE DECLINE, SAID FIRST: the wheel joints the plan named are not in the vendored wasm " +
                 "(native-only since v4398, no emsdk here), so the raycast model is the car. THE CORRECTIONS: rolling resistance fed as a " +
                 "tyre slip cost a factor of thirty in acceleration; tyre forces at the attach point rolled the car onto its roof; the " +
                 "pursuit driver slowed only with the steer it was using and left the grid; and on WebGPU the dynamic record's buffer was " +
                 "written from the records' cpu(), which the GPU path never calls. Sabotages red at A / B / C / D / E (the gate's header).",
    }),
    since148: Object.freeze({
        at: "v4526", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "tools/ship/drivePolicy-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green headless on the wasm and in the browser on both backends. Racing city 3: brain/drivePolicy.mjs is a 9 -> 8 -> 2 " +
                 "relu MLP in brain/mlp.js's layer shape (forward through render/brainTsl.mjs's f32 twin) driving physics/raceCar.mjs, a " +
                 "(1+1)-ES on metres + 200 per lap - 0.2 per off-asphalt wheel sample, blobAutoTrain's judgement (a held-out seed votes, " +
                 "an audit seed never does, regret is a number), and race(): N policies in one box3d world in lockstep with the fleet " +
                 "fingerprint folded into the tie-break, replayed from the input log alone. MEASURED: from the hand rule 40 candidates at " +
                 "sigma 0.05 cut seed 1's lap from 57.6 to 30.6 s and lap the held-out seed in 31.0; from zero 60 candidates climb and " +
                 "do not lap; 60 s of three cars in 0.7 s; the browser's 20 s race is node's fingerprint. THE CORRECTIONS: the first hand " +
                 "rule stalled at the first corner; sigma 0.5 from a lapping policy accepted nothing; an off-track penalty of 0.05 made " +
                 "the grass profitable; one training seed overfit (2 m on the held-out track); the gate's zero car 'never moves' hold was " +
                 "red because the trained car shoves it coming round; blobTrainer's mulberry import carried node:url into the browser. " +
                 "Sabotages red at A / B / C / D / E (the gate's header).",
    }),
    // *** v4526 MERGE -- RENUMBERED A FOURTH TIME, AND THIS TIME THE COLLISION IS THE WHOLE RANGE. *** main's since80 through
    // since126 and this branch's since80 through since148 are two different ledgers under one set of keys: after the v4476
    // merge each side went on appending, and main's merge of that round renumbered ITS entries into the same range this
    // branch was using. So main's closings are taken whole -- every entry from since80 up whose gates this ledger does not
    // already claim, in main's order -- and renumbered to follow since148. Their `at` labels are main's and stay as written;
    // where an `at` also appears above it names DIFFERENT WORK (v4459 through v4487 here are the sidebar rounds, on main they
    // are the fires, the vulkan stages, the record sweep, the refusal stack). The one gate both sides shipped under one path,
    // tools/ship/stereographic-selfcheck.mjs, is this branch's v4499 little-planet gate; main's v4463 Panini gate is
    // tools/ship/stereoPanini-selfcheck.mjs now and its closing below names it so. gateSweep-selfcheck's duplicate-ordinal
    // check and closingCoverage's double-claim check are what this note is for.
    since149: Object.freeze({
        at: "v4459", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "tools/ship/vacuity-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green, five runs of five, 0.043 s -- the cheapest gate this ledger has ever closed, because " +
                 "its subject is a SHAPE rather than a device. vacuity.mjs names the 0-RED sabotage as ONE " +
                 "SYMPTOM WITH FOUR CAUSES -- an empty collection under every(), an unreachable branch, a guard " +
                 "sitting downstream of the classification it depends on, and a harness that damaged what it was " +
                 "measuring -- and supplies overNonEmpty and emptyOfNonEmpty so the empty case cannot be " +
                 "forgotten at the call site. *** THE TREE-WIDE SCAN FOR THE FIRST CAUSE WAS REFUSED RATHER THAN " +
                 "SHIPPED: *** 948 of 1,482 gates use the shape, and a census that flags 64% of the tree is one " +
                 "nobody reads, so the refusal is recorded with its number instead of a report nobody would act " +
                 "on. NOT CLAIMED: that the four causes are exhaustive -- they are the four this session " +
                 "actually met, and the record says so.",
    }),
    since150: Object.freeze({
        at: "v4424", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/slowCensus-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly, ten sections and 58 checks, pure -- it runs no gate at gate " +
                 "time, only reads the frozen verdicts of the 63 it ran once. Driven RED by twenty-three " +
                 "sabotages and restored, with TWO EARNED 0 REDS: ranking both arrays descending inside " +
                 "spearman is the same statistic, and REMOVING the exemption from redRegister passes because " +
                 "a ratchet that fails on its own repair is a broken ratchet. The round it gates found THREE " +
                 "standing reds inside redCensus.UNCONFIRMED_SLOW, filed as redCensus.RED_AT_V4424, and a " +
                 "FOURTH outside it -- redCensus-selfcheck, broken by v4414 and repaired here",
    }),
    since151: Object.freeze({
        at: "v4425", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/budgetExile-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly, five sections and 23 checks. It runs ONE cheap real gate as a " +
                 "fixture, through the actual runQuickSweep, to demonstrate the absorbing state in both " +
                 "directions rather than read it off the source. Driven RED by ten sabotages and restored, " +
                 "with NO 0 REDS. The round it gates re-timed all 378 finished exiles and found TEN reds on " +
                 "no register, every one recorded as passing; four were this session's and are repaired",
    }),
    since152: Object.freeze({
        at: "v4470", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/roundhouse/zeroRangeFull-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly, four sections and 24 checks, pure -- it reads the frozen sweep " +
                 "and builds no device at gate time. Driven RED by ten sabotages and restored; THREE GAPS THEY " +
                 "FOUND AND CLOSED (an optics-only control fixture that passed vacuously because the real " +
                 "optics set is empty, vacuousDevices checked on the wrong field, and a boundary sample with " +
                 "no minimum span) and ONE EARNED 0. The round it gates settled a prediction frozen at v2912 " +
                 "and found the sweep has had no positive control since v3313",
    }),
    since153: Object.freeze({
        at: "v4400", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/carveGpu-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly, three sections and 13 checks in 18.8 s. Driven RED by four " +
                 "sabotages (2/3/4/4 by name) and restored; two of them differ by a factor of eight in voxels " +
                 "and the SMALLER one is the worse, because it breaks the containment bound the larger leaves " +
                 "intact. Sections 1 and 2 need no device and stay green where WebGPU is unavailable",
    }),
    since154: Object.freeze({
        at: "v4401", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/carveJudged-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly, four sections and 10 checks in 22 s. Driven RED by three " +
                 "sabotages (3/3/1 by name) and restored -- and the 1-red one is the thesis rather than a weak " +
                 "check: making the hulls worse does not move a verdict that depends on the grid",
    }),
    since155: Object.freeze({
        at: "v4402", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/tslIsing-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly, four sections and 8 checks in 0.9 s -- fast because node-webgpu " +
                 "serves it in-process rather than through a browser. Driven RED by three sabotages (4/3/3 by " +
                 "name) and restored; the first is the round's own argument, a completely wrong RNG that moves " +
                 "13% of the spins and leaves the physics looking healthy",
    }),
    since156: Object.freeze({
        at: "v4403", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/eulerGpu-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly, four sections and 8 checks in 20 s. Driven RED by three " +
                 "sabotages (1/2/1 by name) and restored; the FIRST is the round's argument -- a broken HLLC " +
                 "wave speed that the page's own 2% tolerance would have passed on both of its rows",
    }),
    since157: Object.freeze({
        at: "v4404", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/lbmGpu-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly, four sections and 8 checks in 7.8 s. Driven RED by three " +
                 "sabotages (2/3/1 by name) and restored; the first is a RE-ENACTMENT of the state the shader " +
                 "actually shipped in, since `macro` is a WGSL reserved keyword and the module never compiled",
    }),
    since158: Object.freeze({
        at: "v4404", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/conflictMarkers-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly, two sections and 6 checks, scanning 5,427 tracked text files. " +
                 "Driven RED by two sabotages (1/2 by name) and restored -- and the first attempt at the first " +
                 "one went 0 red because the sabotage itself was wrong, which is logged in the gate",
    }),
    since159: Object.freeze({
        at: "v4405", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/roundhouse/magmapDevice-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly, two sections and 9 checks in 1.2 s. Driven RED by three " +
                 "sabotages (2/3/1 by name, and the first also reddens magmap-selfcheck) and restored; the first " +
                 "is the constant the tree actually shipped, which now costs a red in two gates instead of none",
    }),
    since160: Object.freeze({
        at: "v4406", swept: 1, green: 1, red: 0,
        added: Object.freeze(["physics/mpm/mpmDevice-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly, three sections and 10 checks in 0.8 s. Driven RED by three " +
                 "sabotages (1/3/3 by name) and restored; the first is the state the tree shipped in, and the " +
                 "third leaves the determinism row GREEN while destroying the scatter, which is that row's " +
                 "declared limit arriving as a measurement",
    }),
    since161: Object.freeze({
        at: "v4407", swept: 1, green: 1, red: 0,
        added: Object.freeze(["physics/render/furnaceWgsl-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly, three sections and 8 checks in 6.3 s. Driven RED by three " +
                 "sabotages (2/3/2 by name) and restored -- and a FOURTH went 0 red, which the gate keeps as a " +
                 "property: the furnace key is azimuthally blind, so no tangent frame can move it",
    }),
    since162: Object.freeze({
        at: "v4408", swept: 1, green: 1, red: 0,
        added: Object.freeze(["physics/render/microfacetWgsl-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly, six sections and 26 checks in 1.4 s -- inside the quick sweep's " +
                 "3 s budget, which no other device gate in this arc is. Driven RED by four sabotages " +
                 "(19/4/3/6 by name) and restored; two more went 0 red and are recorded as unreachable branches " +
                 "with the clearance measured, five and six orders",
    }),
    since163: Object.freeze({
        at: "v4409", swept: 1, green: 1, red: 0,
        added: Object.freeze(["physics/render/microfacetSampleWgsl-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly, seven sections and 28 checks in 2.1 s -- inside the quick " +
                 "sweep's 3 s budget, as v4408 is. Driven RED by five sabotages (6/5/2/3 by name, one of them " +
                 "caught by a single key and by nothing else) and restored; a sixth went 0 red and earned a " +
                 "section proving the blindness is the FIXTURE's and measuring what would move it",
    }),
    since164: Object.freeze({
        at: "v4410", swept: 1, green: 1, red: 0,
        added: Object.freeze(["physics/render/microfacetVndf-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly, seven sections and 30 checks in 3.7 s. Driven RED by five " +
                 "sabotages (8/5/1/4/1 by name) and restored; none went 0 red, and the 4 went 2 RED FIRST and " +
                 "widened the gate -- the shipped CPU sampler had been resting on one section, which the " +
                 "sabotage is what found",
    }),
    since165: Object.freeze({
        at: "v4411", swept: 1, green: 1, red: 0,
        added: Object.freeze(["physics/render/energyCompWgsl-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly, five sections and 19 checks in 6.8 s. Driven RED by five " +
                 "sabotages (6/4/1/6/2 by name) and restored -- and the 6 went 1 RED FIRST, which built the " +
                 "check that now catches it: a real integral moves when its grid is refined and a closed form " +
                 "does not. energyCompensation-selfcheck.mjs's section 2 was rewritten in the same round, " +
                 "because its second-order measurement turned out to be its instrument's",
    }),
    since166: Object.freeze({
        at: "v4412", swept: 1, green: 1, red: 0,
        added: Object.freeze(["physics/render/microfacetAnisoWgsl-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly, six sections and 16 checks in 2.6 s. Driven RED by six " +
                 "sabotages (1/1/1/1/3/1 by name) and restored -- and FOUR GOING ONE RED IS A PARTITION, not a " +
                 "thin gate, which the 3 demonstrates. Its own first draft overclaimed exactness FOUR TIMES " +
                 "and each correction is recorded where the claim is",
    }),
    since167: Object.freeze({
        at: "v4413", swept: 1, green: 1, red: 0,
        added: Object.freeze(["physics/render/misWgsl-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly, five sections and 15 checks in 4.1 s. Driven RED by four " +
                 "sabotages (3/1/2/4 by name) and restored -- and the 1 WENT 0 RED FIRST, which bought the " +
                 "device pdf check. Three of its thresholds were set from measurement after a first draft " +
                 "overshot, including one where a strategy returns exactly zero rather than a finite variance",
    }),
    since168: Object.freeze({
        at: "v4414", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/shaderPairs-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly, five sections and 13 checks in 0.5 s -- the cheapest gate this " +
                 "arc has added. Driven RED by five sabotages (1/1/1/1/1 by name) and restored, and TWO WENT " +
                 "0 RED FIRST: a check comparing a list against its own length, and a fixture whose planted " +
                 "leak collided with a name already present. Both were this gate's defects, not properties",
    }),
    since169: Object.freeze({
        at: "v4415", swept: 1, green: 1, red: 0,
        added: Object.freeze(["physics/voxel/fracture-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly, five sections and 14 checks in 0.08 s -- cheaper than v4414's, " +
                 "and no device. Driven RED by five sabotages (2/2/1/3/3 by name) and restored; the 1 went 0 " +
                 "RED FIRST because every fixture was a box and a box's products of inertia are zero, so an " +
                 "L was added with an independent two-box reference. Its FIXTURE also had to be built twice: " +
                 "the sphere carves it started with never detached anything",
    }),
    since170: Object.freeze({
        at: "v4416", swept: 1, green: 1, red: 0,
        added: Object.freeze(["physics/render/fresnelWgsl-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly, seven sections and 25 checks in 3.3 s. Driven RED by nine " +
                 "sabotages (0/2/2/7/2/1/3/2/1 by name) and restored -- THE 0 IS DELIBERATE AND IS THE ONE " +
                 "WORTH READING, because the quantity it changes is the same quantity by linearity and no " +
                 "check may claim otherwise. One of the 2s went 1 RED FIRST: the collision check read only " +
                 "the side that is supposed to be empty, which cannot tell empty from broken. It also " +
                 "corrects a sentence in fresnel-selfcheck.mjs by measurement",
    }),
    since171: Object.freeze({
        at: "v4417", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/paintFloor-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly, seven sections and 18 checks in 3.1 s -- no device, no model, " +
                 "no network. Driven RED by eight sabotages (6/1/5/1/4/1/2/2 by name) and restored, and TWO " +
                 "WENT 0 RED FIRST: a boundary convention that five seeds of bit-identity could not reach at " +
                 "any number of seeds, and an exponent check that compared three numbers to each other and " +
                 "never to zero. The round's own premise was wrong and the gate says so where the number is",
    }),
    since172: Object.freeze({
        at: "v4418", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/krbnPaint-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly, seven sections and 14 checks in 1.7 s -- no device, no model. " +
                 "Driven RED by nine sabotages (4/4/2/1/1/1/1/1/1 by name) and restored; ONE OF THEM DRIVES A " +
                 "SECOND GATE RED TOO, which is what makes its 'a second independent caller holds this " +
                 "invariant' claim a measurement rather than a sentence. One went 0 RED FIRST: a promise of a " +
                 "CLOSED boundary that lived in a comment and nowhere else",
    }),
    since173: Object.freeze({
        at: "v4419", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/firePaint-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly, seven sections and 14 checks in 6.7 s -- no device, no model. " +
                 "Driven RED by nine sabotages (2/0/5/5/3/1/1/1/1 by name) and restored. ONE 0 IS EARNED and " +
                 "measured so: the discard rule it removes never fires in 250 fitStep calls and is gated in " +
                 "primitiveFit-selfcheck anyway. The other 0 bought a check -- a channel-blind pixel " +
                 "comparison survived because every consumer read a ratio or a zero. Its own first draft " +
                 "overclaimed a plateau and the claim is now about the rate, which is what is true",
    }),
    since174: Object.freeze({
        at: "v4420", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/paintTransfer-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly, seven sections and 10 checks in 17.4 s -- it TRAINS TWICE, " +
                 "which is why. Driven RED by nine sabotages (5/3/1/1/1/1/1/3/5 by name) and restored, and " +
                 "one went 1 RED FOR THE WRONG REASON: the check written to catch a generator that does not " +
                 "vary was measuring the raw generators while every episode is fed the memoised wrappers. " +
                 "Its Krbn generator had to be built twice, and the sabotage harness itself had to be fixed " +
                 "after a timed-out run destroyed its own backup",
    }),
    since175: Object.freeze({
        at: "v4421", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/polyBrush-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly, seven sections and 17 checks in 4.0 s -- no device, no model. " +
                 "Driven RED by eight sabotages (5/2/2/1/1/1/3/1 by name) and restored, and TWO WENT 0 RED " +
                 "FIRST: the half-open crossing rule, which only 4 of 651 vertices ever exercise, and a " +
                 "mutator returning garbage, which fitStep simply rejects. Its own arrival reddened " +
                 "krbnPaint-selfcheck by changing a list that was answering two questions",
    }),
    since176: Object.freeze({
        at: "v4422", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/paintTransforms-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly, six sections and 13 checks in 12.2 s -- one training, no " +
                 "device. Driven RED by seven sabotages (3/1/5/5/6/1/1 by name) and restored, and ONE WENT " +
                 "0 RED AGAINST A COMMENT THAT NAMED IT: freezing the displacement field, which the module's " +
                 "own header calls v4420's defect one level down. Spreading the transformed generator would " +
                 "not have caught it -- the cure is one fixed picture through six transform seeds",
    }),
    since177: Object.freeze({
        at: "v4423", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/paintFields-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly, seven sections and 15 checks in 13.2 s -- one training, no " +
                 "device. Driven RED by eight sabotages (2/3/1/2/1/1/1/1 by name) and restored, with NO 0 " +
                 "REDS. Its nebula generator had to be built twice -- a flight-view parallax of 0.00035 per " +
                 "world unit made a +/-20 camera invisible -- and seedSpread caught it, the third generator " +
                 "in three rounds that check has caught",
    }),
    since178: Object.freeze({
        at: "v4473", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/glbTexture-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        repaired: Object.freeze([
            "tools/ship/reachedLicences-selfcheck.mjs (v4471 put one path in both takenPaths and citedPaths; the gate says those are opposite claims and nothing ran it for two rounds)",
            "tools/ship/sweep-timings.json (21 rows re-timed; every one had an over-cap number stamped before v4408 and every one clears the cap today)",
            "tools/ship/orreryFleetScan.mjs (glbTexture-selfcheck joined three's fleet by READING GLTFLoader.js -- the sixth instance, caught in the same session that recorded the fifth)",
        ]),
        verdict: "THE TEXTURE HALF OF THE DRACO QUESTION, ANSWERED NOT YET. gpu/glbTexture.mjs predicts, from " +
                 "a GLB header alone, which of three outcomes a KHR_texture_basisu asset reaches in this tree " +
                 "-- including the one the vendored loader's own comment assumes away, where an optional " +
                 "basisu texture with no fallback dies on json.images[undefined].uri with an error naming " +
                 "neither Basis nor KTX2. The adoption is refused on a measurement: everything this engine " +
                 "loads decodes to 0.60 MB and ETC1S would save under a megabyte. Six licences read " +
                 "first-hand, three with surprises -- thirteen licences inside one 'Apache-2.0' repository " +
                 "and an Ericsson SLA scoped to OpenGL, OpenGL ES and WebGL with WebGPU unnamed; four licence " +
                 "classes in glTF, one of them stating its own terms are unknown; and an Apache appendix that " +
                 "names no copyright holder. AND THE ABSORBING STATE WAS CAUGHT HIDING THIS SESSION'S OWN " +
                 "DEFECT: 503 gates carry an over-cap timing stamped before v4408, 360 were green when " +
                 "exiled, and all 21 re-timed here clear the cap -- among them the two gates v4471 could only " +
                 "find by hand. THE NEW GATE COST THREE CORRECTIONS OF ITS OWN, every one found by a " +
                 "neighbour: it joined a vendor fleet by reading GLTFLoader.js (orreryEjecta), it was born at " +
                 "9.7 s and would have been exiled on arrival by the state it documents (re-timed to 833 ms " +
                 "by filtering before stripping), and it asserted the loader's COMMENT TEXT rather than the " +
                 "unguarded dereference underneath it (gateQuality's prose-matching ratchet). Eight sabotages " +
                 "by name, eight red",
    }),
    since179: Object.freeze({
        at: "v4475", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/gltfKtx2-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        repaired: Object.freeze([
            "gpu/glbTexture.mjs (peekGltf: it read GLB magic only, and every real KTX2 asset is a .gltf)",
            "glb_viewer.html (parsed with an empty base path, so a .gltf could never find its siblings)",
            "tools/ship/orreryFleetScan.mjs (gltfKtx2-selfcheck joined three's fleet by reading KTX2Loader.js -- the seventh instance)",
        ]),
        verdict: "THE WIRING. Six files vendored from three.js r160, byte-identical and hashed in the gate; " +
                 "gpu/gltfKtx2.js fetches the 562 KB transcoder only for files whose header carries KTX2, " +
                 "which is gltfDraco's rule applied to textures. Not one vendored file carries a licence " +
                 "header and the record says so, citing the Apache-2.0 this tree read first-hand at v4473. " +
                 "Eight sabotages, eight red; orreryEjecta and gateQuality each caught a mistake of this " +
                 "round's own making",
    }),
    since180: Object.freeze({
        at: "v4477", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/roundhouse/zeroControl-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        repaired: Object.freeze([
            "tools/roundhouse/sweepDevice.mjs (a point recorded the value it was ASKED FOR: 5612 of 17759 swept points were labelled with a configuration that was never built)",
            "tools/roundhouse/exactZeroRegister.mjs (the isoRollDeviation sentence named one of two conditions, and its 'sigma 2' measurement is the sigma 1 row wearing the clamp's label)",
            "tools/roundhouse/zeroRangeSweep-selfcheck.mjs (its mechanism evidence counted five dyadic sigmas where the device built four)",
            "tools/roundhouse/zeroRangeFull.mjs (the 'sigma >= 1 OR dyadic' reading corrected: the second disjunct is the clamp, not the arithmetic)",
        ]),
        verdict: "THE POSITIVE CONTROL THE SWEEP HAS LACKED SINCE v3313, PLANTED. Both conditions derived -- " +
                 "dyadic sigma^2 AND fl(cos^2+sin^2)===1 at every roll angle, the second silent since v2912 -- " +
                 "and claimed in ONE direction, because sigma 0.13 reads exactly zero outside the derivation. " +
                 "The arms run zeroRangeSweep itself over a range carrying a derived zero and one carrying " +
                 "none, matching its verdict to the device point for point. Thirty-one sabotages, four zeros, " +
                 "every one the same species: a component asserted and its ability to give the OTHER answer " +
                 "never asserted -- including my own power-of-two predicate, which Math.log2 made wrong at 252 " +
                 "of 2002 cells and which a hand-written list of literals would have passed",
    }),
    since181: Object.freeze({
        at: "v4462", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/runtimeGap-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, twelve checks in four sections. *** THE NUMBER COLLIDED: *** this round was built as v4451 and a concurrent session shipped a different v4451 to main first, so it ships as v4462 with its ledger ordinal moved forward past ten concurrent closings -- the same collision this file's own ordinals are checked for.  #129 asks what is missing besides threads " +
                 "if the VBA transmitter were the runtime instead of Node/Bun. MEASURED OVER 3,814 " +
                 "COMMENT-STRIPPED RUNTIME SOURCE FILES, THE QUESTION HAS ITS SCALE INVERTED: threads are 22 " +
                 "files, 0.6%, RANK 11 OF 12 -- the second-smallest gap -- while ES modules are 3,523 and " +
                 "first-class functions 3,404, which is 155 TIMES MORE OF THIS TREE THAN THREADS. And the gap " +
                 "is inverted the other way too: a network stack and a GPU renderer are what anyone would " +
                 "guess is hardest outside a browser, and they are the two the VBA side already has. THREE " +
                 "EVIDENCE CLASSES ARE HELD APART BY A CHECK RATHER THAN A HEADING -- measured / language / " +
                 "archive -- because the failure mode of a capability table is one where 'VBA has no closures' " +
                 "and 'the transmitter's HTTP server works' look equally established. *** THE SABOTAGE PASS " +
                 "FOUND THE HOLE THAT MATTERED: *** flipping `closures as values` to has:true -- crediting VBA " +
                 "with the single capability the whole finding is about -- WAS A SILENT PASS, because the " +
                 "check only asked whether a row declared an evidence CLASS, and a flipped row keeps the class " +
                 "it had. A label is not a check. Every has:true row now names a `via` corroborator that must " +
                 "be FOUND: a token in this tree's own .bas files, or a marker vba/archiveManifest.mjs really " +
                 "holds. *** POINTING THE ROWS AT BYTES IMMEDIATELY CORRECTED TWO OF THEM: *** performance.now " +
                 "claimed QueryPerformanceCounter, which appears in NO VBA in this tree (it is kernel32 " +
                 "GetTickCount, ~15.6 ms, a whole frame at 60fps); and fetch/XHR was filed as an ARCHIVE claim " +
                 "when modGPUBrain.bas drives WinHttp.WinHttpRequest.5.1 right here, so ONLY WebGL STILL RESTS " +
                 "ON THE ARCHIVE -- there is no GL of any kind in the in-tree VBA. *** AND THE INSTRUMENT IS A " +
                 "MAXIMAL FALSE POSITIVE FOR ITSELF: *** runtimeGap.mjs holds the PATTERNS table, so every " +
                 "regex's literal text is in it, and a regex source is a string, which is prose the comment " +
                 "strip cannot reach -- this round's two files match ALL TWELVE of their own patterns. Derived " +
                 "by recounting with them excluded, not argued: threads 21 against WebAssembly 20 without " +
                 "them, tied at 22 with them, so the rank-11 tie is my own note strings and is said rather " +
                 "than hidden. Two more frozen numbers were wrong and unchecked (languageRowsAbsent read 8 " +
                 "against nine rows; only 3 of 12 census rows were compared at all) -- all twelve are compared " +
                 "now. Thirteen sabotages, ALL RED BY NAME, both files md5-identical. WHAT IS NOT CLAIMED: " +
                 "that any of this RUNS. No Excel has ever run against SweK_VBA_v3499 from this box, the pages " +
                 "still say so, and no VBA row is tagged `measured`.",
    }),
    since182: Object.freeze({
        at: "v4463", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/stereoPanini-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, fifteen checks in five sections. render/panini.js has quoted its own " +
                 "primary source since v2571 -- Panini is 'THE CYLINDRICAL ANALOG OF THE STEREOGRAPHIC " +
                 "PROJECTION OF A SPHERE' -- and this tree has held the cylindrical member of that family for " +
                 "1,892 versions and never the spherical one. Nothing is ported: the projection is four " +
                 "hundred years old and the construction is three lines of similar triangles, u = 2x/(1-z). " +
                 "*** THE GATE'S PRIMARY CHECK IS AN IDENTITY AGAINST THE MODULE THAT NAMED IT, NOT SELF- " +
                 "CONSISTENCY: *** on the horizon, where a cylinder and a sphere ARE the same surface, " +
                 "paniniProject at d=1 and stereoProject are the same function to 4.18e-11 over 180 azimuths " +
                 "-- and at d = 0.5, 2 and 4 they miss by 14 to 23 whole units, which is what stops the " +
                 "identity being a tautology. *** AND 'ANALOG' IS EXACT ON ONE CURVE AND WRONG BY 88 DEGREES " +
                 "OFF IT: *** stereographic is CONFORMAL, asserted through the ANALYTIC Jacobian (right angle " +
                 "preserved to 1.4e-14 deg, isotropy to 4.4e-16), while Panini at d=1 flattens a right angle " +
                 "to two degrees at the NADIR -- which is exactly where a little planet points, because " +
                 "Panini's height term y/hypot(x,z) diverges at the poles. THE FIRST DRAFT SAID 35 DEGREES: " +
                 "that number was measured over six directions and the gate runs seven, a frozen number taken " +
                 "over a different sample than the check runs -- v4462's own defect, one round later, left " +
                 "visible. Two more corrections the build produced: a finite-difference version of the " +
                 "conformality check reads 4.5e-5 deg against the analytic 1.4e-14 and would hide a real " +
                 "defect of that size, so the blunt instrument is RECORDED and the sharp one is what the gate " +
                 "stands on; and the horizon landmark is EXACTLY 2 through stereoProject and ONE ULP SHORT " +
                 "through stereoRadiusFor, because Math.PI/2 is not pi/2 -- which is why the construction has " +
                 "no trigonometry in it and why the gate asserts landmarks through the exact path. Thirteen " +
                 "sabotages, all RED BY NAME, two files md5-identical. *** TWO OF THEM COST ZERO RED FIRST " +
                 "AND BOTH WERE FINDINGS ABOUT THE CHECK. *** Turning the nadir map into a REFLECTION changed " +
                 "nothing, because the handedness check computed a determinant from a HARD-CODED COPY of the " +
                 "rotation written out again inside the gate -- a second copy of a function cannot disagree " +
                 "with the first -- and both landmarks are blind to a mirror by construction, since both have " +
                 "y = 0 after the rotation, exactly as that check's own comment predicted and then failed to " +
                 "test for. It probes littlePlanetDir itself now, by signed volume. And changing a constant in " +
                 "the GLSL cost zero red because the shader check was a handful of regexes that happened not " +
                 "to cover it: a regex over shader text tests the regexes. #118 settled that idiom for this " +
                 "tree -- 'no gate has ever compared their VALUES' -- so the shader is now mechanically " +
                 "rewritten into JS and compared numerically, 0.00e+0 over 240 directions and 240 plane " +
                 "points. WHAT IS NOT CLAIMED: that a GPU agrees. The rewrite is textual, a real driver may " +
                 "differ in precision or in normalize(), and the shader's actual output still needs a " +
                 "screenshot on the rig -- the same limit panini.js declared and this inherits rather than " +
                 "pretending past.",
    }),
    since183: Object.freeze({
        at: "v4478", swept: 1, green: 1, red: 0,
        added: Object.freeze(["physics/render/wgslArc-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze(["tools/ship/gateSweep-selfcheck.mjs (the duplicate-ordinal scan was anchored to a four-space indent and a merge had put since116 at column zero)"]),
        verdict: "green. *** SEVEN WGSL PRODUCERS SHIPPED WITH NO FRONT DOOR AND THEY ARRIVED AS ONE SPECIES " +
                 "RATHER THAN SEVEN OVERSIGHTS. *** physicsReach's baseline was corrected to 7 at v4461 and " +
                 "read 14; the difference is exactly energyComp, fresnel, furnace, microfacetAniso, " +
                 "microfacetSample, microfacet and mis, every one landed between v4407 and v4416. They were " +
                 "thoroughly CHECKED -- wgslCorpus and backendParity read them, two gates grade them -- and " +
                 "there was no way for a PERSON to see the shader a module emits. NEW wgslArc.mjs is that " +
                 "door: a census exported through reportLines so instrument-bench.html serves it, backed by " +
                 "one instruments row whose `modules` list is what physicsReach reads. The ratchet is back to " +
                 "7 of 152. *** THE ARC HAS TWO SHAPES AND A CENSUS ASSUMING ONE SEES FIVE OF SEVEN: *** five " +
                 "export the shader as a constant, two BUILD it, and this round's own first probe read for a " +
                 "`*_WGSL` export and reported two producers as having no shader at all -- v4453's rule one " +
                 "step earlier, the shape of an EXPORT is not the shape of the thing. All seven yield source; " +
                 "20 declared faults, every one consulted by the shader declaring it, a clean bill stated as " +
                 "one. Five sabotages, 5/1/2/0-then-2/4 by name; the zero could not tell rows.length from " +
                 "rows-that-worked on an arc where nothing fails, so a three-producer fixture with one " +
                 "emitting nothing now separates them. *** AND THE ROUND FOUND A LIVE DEFECT IN THIS FILE'S " +
                 "OWN COLLISION DETECTOR. *** v4394 built a SOURCE-TEXT scan for duplicate ordinals because a " +
                 "runtime read cannot see one; it anchored to a four-space indent, and v4463's collision was " +
                 "renumbered to since116 by hand with the indent lost. The scan saw 114 of 115 declared " +
                 "ordinals and the invisible one was the entry a merge had just touched -- the population " +
                 "most likely to collide next. A second since116 at column zero would have been invisible to " +
                 "the check built to catch it. Re-indented, and the scan no longer depends on indentation. " +
                 "v4456's runtime instrument had been reporting 115 all along: two routes, disagreeing by " +
                 "exactly the mangled entry. NOT CLAIMED: that the shaders are correct, or that a door proves " +
                 "a working page -- the row is only honest because reportLines renders all seven on the bench.",
    }),
    since184: Object.freeze({
        at: "v4479", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/roundhouse/observableTaint-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green, six sections, 22 checks. *** corroborationCensus TAKES ITS PORTABILITY VERDICT PER " +
                 "BUILD AND APPLIES IT PER OBSERVABLE, SAID SO IN WRITING, AND LEFT IT OPEN: *** 'the libm " +
                 "tripwire instruments the CALL, not the value... a build flagged non-portable may well " +
                 "contain individually portable numbers. Narrowing it means instrumenting per observable, " +
                 "which is a real round and not this one.' This is that round. A call count is an UPPER bound " +
                 "on taint and cannot be a lower one; PERTURBING one unspecified function by 1e-9 and " +
                 "rebuilding gives the other side, per observable, by name. MEASURED over 40 deterministic " +
                 "builds the census calls non-portable: 334 observables, 109 provably downstream, 32.6%. IN " +
                 "SIX OF THE FORTY NOT ONE OBSERVABLE MOVED -- the build touches an unspecified function so " +
                 "every number it reports is condemned, and no number can be shown to depend on the answer. " +
                 "reconQuality.blindspot is 1 of 19. *** THE ONE THING THIS METHOD CANNOT DO IS THE THING IT " +
                 "MUST NOT CLAIM: *** perturbation demonstrates dependence, never independence, so an unmoved " +
                 "observable is NOT portable -- section 4 builds one that is downstream by construction and " +
                 "moves at no epsilon, and sabotage E confirms the returned shape refuses the word. The two " +
                 "bounds are of opposite kinds and are never combined. Determinism is checked first and a " +
                 "drifting build is REFUSED attribution rather than attributed badly. Six sabotages, " +
                 "6/8/1/2/1/3 by name, none zero-red. *** AND TWO CHECKS IN THIS GATE COULD NOT FAIL, BOTH " +
                 "MINE, MAKING THREE THIS SESSION: *** `ok(name, (() => true)())` and `ok(name, async () => " +
                 "{...}())`, the second handing `ok` a PROMISE, which is truthy however the run went. v4478's " +
                 "gate had the same shape. The cause is that `ok(name, condition)` accepts any value; both are " +
                 "deleted, and the general repair -- a signature that refuses a function -- belongs to " +
                 "whichever round owns the helper.",
    }),
    since185: Object.freeze({
        at: "v4480", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/assertionShape-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green, four sections, 20 checks. *** v4479 SAID ITS REPAIR BELONGED TO WHICHEVER ROUND OWNS " +
                 "THE ASSERTION HELPER. NOTHING OWNS IT. *** 1,498 of 1,519 gates call ok(); 1,490 DEFINE it in " +
                 "their own file; ZERO import one; 38 distinct definitions. `ok(name, condition)` takes any " +
                 "value, and a function, a promise and a non-empty string are all truthy, so a check written " +
                 "in any of those shapes prints PASS with the code under it broken -- which this session wrote " +
                 "THREE TIMES in three rounds, all caught by reading and none by running. TWO SIGNATURES " +
                 "COEXIST: 1,404 gates spell it ok(name, cond), 78 spell it ok(cond, message), and a line " +
                 "pasted from the majority into one of those 78 always passes because the message is a string. " +
                 "16 more are reported `unknown` rather than assigned to whichever camp would have tidied the " +
                 "sweep. THE SWEEP FINDS ZERO TODAY, and that is why the positive controls are the round: each " +
                 "of the three finders is driven against a fixture built to trip it BEFORE the tree is called " +
                 "clean, because a detector that has only ever returned zero cannot be told from one that " +
                 "cannot return anything else -- a shape this session has caught five times. Six sabotages, " +
                 "5/3/1/2/1/3 by name, none zero-red. *** AND TWO DEFECTS IN THIS ROUND'S OWN WORK WERE FOUND " +
                 "BY ITS OWN CHECKS RATHER THAN BY READING, THE FIRST TIME THIS SESSION. *** The record check " +
                 "went red because a probe for asyncIife classified as arrowNotInvoked -- invoked-or-not was " +
                 "decided by two hopeful regexes and `}()` matched neither; it BALANCES the arrow body now. " +
                 "And section 3 reported five suspects, every one in this gate: the fixtures were literal " +
                 "source, so they sat in code the comment strip cannot reach and the detector found itself. " +
                 "Built by concatenation now -- v4409's 'a fixture is not a gate' through a STRING, and the " +
                 "second time this session after v4478's literal @compute inflated backendParity's census. " +
                 "NOT CLAIMED: that the three shapes are all of them (ok(name, helper()) returning a promise " +
                 "is invisible to a source reader), or that the 1,490 copies should be consolidated -- that is " +
                 "a change to fifteen hundred files whose only test is the gates themselves, and this round " +
                 "leaves the number for whoever wants to argue it.",
    }),
    since186: Object.freeze({
        at: "v4481", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/budgetMargin-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green, four sections, 23 checks. *** v4479 ASKED WHETHER TWO GATES 2-4% OVER THE 3000 ms " +
                 "BUDGET HAD DRIFTED OR WHETHER THE BOX WAS SLOWER, AND SAID IT HAD NOT ESTABLISHED WHICH. IT " +
                 "IS NEITHER -- IT IS THE MEASUREMENT. *** NOT DRIFT: meshBVH-selfcheck has ONE commit, from " +
                 "v4248, and does fixed-size CPU work (literal 60,000 and 4,000 loop counts), so it cannot " +
                 "have moved. NOT THE BOX: twelve rotation gates re-timed here against the ledger's own " +
                 "readings give a median now/ledger of 1.007. WHAT IS TRUE IS THAT THE CAP FALLS INSIDE THE " +
                 "READING'S OWN RANGE: seven consecutive runs on an idle box give 2829, 2880, 2939, 2965, " +
                 "2998, 3026, 3062 -- two over, five under -- so whether the gate is 'over budget' depends on " +
                 "which of its own runs you take, and whichever you take is written to a tracked file and " +
                 "acted on. AND THE NEAR-CAP POPULATION IS LARGELY MANUFACTURED: twenty gates recorded within " +
                 "10% of the cap, run alone three times each, give a median recorded/actual of 1.5x, ten of " +
                 "twenty at 1.5x or more, worst 2.3x (artifactWeight 2933 recorded, 1277 actual). *** THE " +
                 "ERROR IS ONE-DIRECTIONAL: *** one of three recorded-over are really under; ZERO of " +
                 "seventeen recorded-under are really over. Contention pushes a reading up and never down, so " +
                 "the band fills from below with gates that do not belong in it. Six sabotages, 3/3/1/1/1/1 " +
                 "by name, none zero-red. *** AND THE RECORD CHECK CAUGHT A MISCOUNT IN THE ROUND'S OWN " +
                 "HEADLINE: *** the first draft said three over and four under and called it a coin flip; it " +
                 "is two and five, and 29% is not 50%. The straddle is unaffected and the claim is now what " +
                 "the numbers say. NOT CLAIMED: that the cap is wrong (a cap is a policy; this measures the " +
                 "reading it is applied to, and moving the cap moves the band rather than removing it); that " +
                 "best-of-three alone is the true cost (it is a floor, chosen to be generous to the recorded " +
                 "figure, and half the band is still 1.5x it); or that the parallel sweep is a defect -- it " +
                 "is why a ship takes five minutes instead of an hour, and the contention is the price. What " +
                 "is worth naming is that the price is paid in a number the tree then treats as a measurement.",
    }),
    since187: Object.freeze({
        at: "v4482", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/recordDrift-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze(["tools/ship/runtimeGap-selfcheck.mjs (its private file walker moved to recordDrift.mjs and is imported, so there is one definition)"]),
        verdict: "green, four sections. *** FOUR ROUNDS RUNNING, ADDING A MODULE INVALIDATED HAND-MAINTAINED " +
                 "RECORDS IN OTHER FILES, AND EVERY ONE WAS FOUND BY A FIVE-MINUTE SHIP VERIFY. *** Read off " +
                 "the commits: v4478 three records, v4479 two, v4480 four, v4481 four. THE SET IS NOT FIXED -- " +
                 "which records depends on what the round added, so it cannot be memorised, and v4481 proved " +
                 "that knowing the pattern is not enough. Each is derivable in milliseconds: assertionShape " +
                 "195, closingCoverage 19, registryOrphans 24, gate enumeration 12 -- 250 ms against a five- " +
                 "minute verify. NEW recordDrift.mjs asks those questions BEFORE the verify. IT REPORTS AND " +
                 "DOES NOT WRITE, per v3698's refusal that a loop writing and grading the same record can " +
                 "mark its own work passed. *** IT FOUND ITS OWN ROUND'S THREE COSTS IN 250 ms, WHICH IS THE " +
                 "DEMONSTRATION: *** the assertion census at 1520 vs 1521, one gate no closing named, and one " +
                 "gate with no timing. THE FOURTH RECORD IS NOT CHECKED AND THE REASON IS RECORDED: " +
                 "vba/runtimeGap.mjs has ZERO imports and is pure by design, so its walker cannot live there; " +
                 "moving it in was tried and REVERTED, and it lives in recordDrift.mjs instead with " +
                 "runtimeGap-selfcheck importing it -- one definition, and the pure module stays pure. Six " +
                 "sabotages by name. *** AND THIS ROUND CORRECTED A WRONG EXPLANATION IT SHIPPED LAST ROUND: " +
                 "*** v4481 said budgetMargin's two files sat outside the walked population, which is why the " +
                 "file total had not moved. Both are in the walked set -- checked directly -- so that reason " +
                 "does not hold, and I cannot reconstruct the earlier reading. What survives is the rule it " +
                 "was reaching for: the number is MEASURED every round, never incremented, and a reason " +
                 "invented to explain a count is worth less than re-taking it.",
    }),
    since188: Object.freeze({
        at: "v4483", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/refusalStack-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze(["tools/ship/traderGraph-selfcheck.mjs (its section 2 assertion was pointing the wrong way and is reversed; it now imports stack() instead of pinning a status code)"]),
        verdict: "green, five sections. *** A GATE WAS REWRITTEN TO ASSERT A READING OF THE BOX IT RUNS IN, " +
                 "AND THE READING HAD ALREADY REVERTED BY THE NEXT ROUND. *** v4481 found, correctly, that " +
                 "the three GitHub refusals this runner meets are the RUNNER'S and not GitHub's -- the " +
                 "evidence being that the bound repository answered 200 while every unbound path was refused. " +
                 "It then wrote that 200 into traderGraph-selfcheck as an assertion. The path is 403 again at " +
                 "v4483, with the message world/traderGraph.mjs had recorded for it WORD FOR WORD before the " +
                 "200 was ever seen, so the gate went red when the world returned to what the module says the " +
                 "world is, on a tree where nothing about the repository had changed. IT ALSO INVERTED THE " +
                 "FILE'S OWN STATED DESIGN, written eighty lines above the assertion: 'if an axis OPENS, this " +
                 "goes red, and that red means go and use the thing you said you could not use.' An assertion " +
                 "that a path ANSWERS goes red when the path CLOSES. *** AND PROBING ALL FOUR PATHS AGAIN " +
                 "SHOWED THE REFUSALS ARE NOT ONE FACT BUT THREE INDEPENDENT GATES: *** the path class is " +
                 "refused with no remedy from here; the repository is not attached, which THIS SESSION can " +
                 "clear with add_repo; and the org has not connected the app, which only an org admin can " +
                 "clear. Three messages, three remedies, three different people, and clearing one clears " +
                 "nothing about the other two -- all of it hidden inside 'the API is shut'. NEW " +
                 "tools/ship/refusalStack.mjs names the gates and classifies a refusal by its own words, with " +
                 "an unrecognised body returning null rather than falling through, because a classifier that " +
                 "always answers cannot say the record is stale. SIX SABOTAGES: A 3, B 3, C 0-then-2, D " +
                 "1-then-2, E 2, F 1. C WENT ZERO BECAUSE EVERY FIXTURE WAS A 200 OR A 403 and the openness " +
                 "rule was never driven off its two known values -- a 301 fixture now separates 'not an " +
                 "error' from 'the data arrived'. The traderGraph assertion is reversed to the direction its " +
                 "header states: the axes are still shut, every refusal is nameable, and an axis OPENING is " +
                 "the red.",
    }),
    since189: Object.freeze({
        at: "v4484", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/playwrightResolve-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([
            "ui/stageInfo-selfcheck.mjs (both hand-copied paths replaced by imports; its live section now RUNS and is red -- registered as RED_AT_V4484)",
            "physics/blobarium-selfcheck.mjs, render/blobRecorder-selfcheck.mjs, render/holoAgree-selfcheck.mjs (hand-copied shell path replaced by the import)",
            "tools/ship/traderGraph-selfcheck.mjs (a probe that never reached the network is reported apart from a refusal)",
        ]),
        verdict: "green, five sections. *** tools/ship/playwrightResolve.mjs EXISTS BECAUSE THREE GATES EACH " +
                 "GREW THEIR OWN GUESS AT WHERE CHROMIUM LIVES, AND IT THEN HELD ONE HARDCODED GUESS OF ITS " +
                 "OWN, ONE LINE BELOW THE LIST IT WAS WRITTEN TO REPLACE. *** PLAYWRIGHT_PATHS is a list " +
                 "tried in order; HEADLESS_SHELL was a single string naming a Linux root, a Linux directory " +
                 "layout and a PINNED BUILD NUMBER. 96 GATES DEPEND ON IT, so on any box that is not this " +
                 "container -- Keith's Windows rig, which is the only machine in this project with a real " +
                 "GPU -- every one of them reports 'no headless shell' and counts the skip as a failure. THE " +
                 "DEVICE HALF OF THIS TREE HAS NEVER BEEN RUNNABLE ON THE MACHINE IT EXISTS FOR. It is " +
                 "resolved now the way playwright already was: roots tried in order with " +
                 "PLAYWRIGHT_BROWSERS_PATH first (which headlessGpu.mjs was ALREADY honouring for the Vulkan " +
                 "ICD in the same tree while this line was not), any build number, and the three platforms' " +
                 "layouts. *** AND FIVE FILES RE-SPELLED THE PATH BY HAND, UNDER A HEADER THAT WARNS IN SO " +
                 "MANY WORDS THAT 'a fourth gate that copies the list instead of importing it is the same " +
                 "defect happening a fourth time'. *** Section 4 counts them, so a sixth is a red. *** THE " +
                 "REPAIR IMMEDIATELY EXPOSED A RED A SKIP HAD BEEN HIDING: *** ui/stageInfo-selfcheck.mjs " +
                 "also hand-copied a PLAYWRIGHT path -- one this box does not have, while the resolver's " +
                 "list holds one it does -- so its live browser section had been skipping silently and the " +
                 "gate read green on 29 checks it could run and one it could not. Made to import, it runs, " +
                 "and server.html's panel measures offsetWidth 460 at 1280 AND at 1920: Keith's third ask, " +
                 "recorded as satisfied and never once measured. Registered as RED_AT_V4484 with that " +
                 "reason, because re-skipping it is how it was green. SIX SABOTAGES: A 3, B 3, C 2, D 2, E " +
                 "4, F 1. AND THE GATE'S OWN CENSUS CAUGHT THIS FILE'S FIXTURES SPELLING THE PATH AS " +
                 "LITERALS -- v4409's rule (a fixture is not a gate) arriving through a string for the third " +
                 "time this session; the fixtures are built by concatenation now.",
    }),
    since190: Object.freeze({
        at: "v4485", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/posixAssumption-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([
            "tools/ship/verify.mjs (its feature-marker grep and its unzip -l are Node walks now)",
            "tools/ship/copiedOutsideVendor-selfcheck.mjs (find and grep -rl replaced by walks)",
            "tools/ship/songHeightfield-selfcheck.mjs (pathToFileURL where a path was an import specifier)",
            "tools/ship/absenceScope.mjs (toPosix at the record boundary)",
            "tools/ship/changedPaths-selfcheck.mjs (asks for a repository, refuses by name)",
            "tools/ship/moduleHistory.mjs (entryNames exported so a zip can be listed without unzip)",
            "render/holoAgree-selfcheck.mjs (pkill behind a platform branch)",
        ]),
        verdict: "green, five sections. *** KEITH RAN THE SUITE ON THE RIG AND FOUR GATES FAILED FOR FOUR " +
                 "DIFFERENT REASONS THAT ARE ONE REASON. *** copiedOutsideVendor met FIND.exe answering " +
                 "`find`; songHeightfield handed node a Windows path where an import specifier belongs and " +
                 "got ERR_UNSUPPORTED_ESM_URL_SCHEME; absenceScope compared accel\\sceneBvh.mjs against a " +
                 "recorded accel/sceneBvh.mjs, ten checks, one separator; changedPaths ran git diff HEAD~1 " +
                 "in an unzipped archive and CRASHED rather than refusing. A GATE WRITTEN ON A POSIX BOX " +
                 "ENCODES THE BOX -- v4484's finding one layer out, where a single Linux path made 96 " +
                 "device gates unrunnable on the rig. *** AND THE DETECTOR FOUND THE BIGGEST ONE, WHICH THE " +
                 "RIG NEVER REACHED: verify.mjs's feature-marker check shelled out to grep, and its failure " +
                 "fell the WRONG WAY -- a throw set hit = false and hit feeds check(), so with no POSIX grep " +
                 "EVERY MARKER READS AS ABSENT AND THE SHIP VERIFY CANNOT PASS AT ALL. The rig could not " +
                 "report it because the only thing that would have is that gate. *** WHAT IS ASSERTED IS " +
                 "SMALL AND WHAT IS COUNTED IS SAID TO BE COUNTED: *** the shell-tool and " +
                 "path-as-specifier classes are defect lists a detector's zero can be driven against; the " +
                 "separator population -- 128 files calling path.relative, 90 never normalising -- is a " +
                 "DENOMINATOR, because three static rules for 'compared against a stored form' gave 53, 74 " +
                 "and 90 in one sitting and referenceKind-selfcheck's own words are that a number moving " +
                 "that far under one author is not a measurement. SIX SABOTAGES: A 3, B 2, C 2, D 1, E 1, " +
                 "F 0-THEN-1. *** F WENT ZERO BECAUSE THE GATE CRASHED INSTEAD OF FAILING: *** its detail " +
                 "string read the deleted field eagerly, which is the very defect section 3 checks " +
                 "changedPaths for, in the gate written to catch it.",
    }),
    since191: Object.freeze({
        at: "v4487", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/frozenRecords-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([
            "tools/ship/assertionShape-selfcheck.mjs (all nine census rows compared, where four were)",
            "tools/roundhouse/observableTaint-selfcheck.mjs (the build counts are consistency-checked)",
        ]),
        verdict: "green, four sections. *** THIS TREE FREEZES NUMBERS INTO VERSION-STAMPED RECORDS SO A " +
                 "ROUND'S CLAIMS STAY CHECKABLE, AND NOBODY HAD EVER ASKED WHICH OF THOSE NUMBERS ANYTHING " +
                 "CHECKS. *** v4482's pre-flight covered FIVE hand-listed records and said so -- 'known is a " +
                 "LIST rather than a DISCOVERY' -- and v4486's merge produced a sixth and a seventh, both " +
                 "found by the verify. So it was RUN rather than reasoned: every numeric field of every " +
                 "version-stamped frozen record bumped by seven, in place, with every gate that NAMES that " +
                 "record executed, restored after each. 74 records, 36 carrying numbers, 135 fields: 83 " +
                 "NOTICED, 52 NOT -- 38.5% -- with 14 records no gate names at all and 9 where nothing " +
                 "notices anything. *** THE FIRST SWEEP MEASURED AGAINST THE SIBLING GATE, WHICH IS A GUESS. " +
                 "*** 29 of the 74 are not named by their sibling and 31 of the 83 catches come from a gate " +
                 "elsewhere; the headline moved 37.0% to 38.5% and the ATTRIBUTION moved enormously -- a " +
                 "defensible number resting on a guess about who guards what. TWO REPAIRS: " +
                 "assertionShape-selfcheck compared four of its census's nine rows and now compares all " +
                 "nine, which is the SAME defect vba/runtimeGap.mjs found in itself at v4462 shipped again " +
                 "eighteen rounds later; and observableTaint's build counts get a consistency check that " +
                 "SAYS it is not a re-derivation. SIX SABOTAGES: A 2, B 2, C 3, D 2, E 1, F 0-THEN-2. *** F " +
                 "WENT ZERO BECAUSE THE GATE CRASHED INSTEAD OF FAILING -- an eager detail string, the " +
                 "FOURTH instance this session -- AND THE FIXTURES INFLATED THE CENSUS THEY TEST, the FIFTH. " +
                 "*** Both in the file built to count the things it is an instance of, which also carries " +
                 "its own record and moved the count by exactly one.",
    }),
    since192: Object.freeze({
        at: "v4527", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "tools/ship/raceKnob-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green headless on the wasm, through the bridge's own handler, and in the browser. Racing city 4: physics/raceKnob.mjs " +
                 "registers the race as a lab scene in the lab's own contract -- the hand policy's speed gain is the knob, the score is " +
                 "metres on the training track, the key is a lap inside 80 s with the wheels on the asphalt on two tracks the score " +
                 "never sees -- and the score's favourite (0.3) is the key's first refusal for cutting the grass, the slow end is " +
                 "refused for the clock, 0.5 is accepted at rank 2. registerProposer takes an optional replay() and ready(); the " +
                 "lab-scene-run route stores the accepted driver's log where SWEK_LAB_REPLAY_DIR points (git-ignored by default), " +
                 "lab-replay serves it, race-brain.html plays it back, and physics-lab.html's thirteenth scene steps the car as a " +
                 "schematic that says NOT REAL TIME. The record replays to the same fingerprint in node and in the page's wasm. " +
                 "Sabotages red at A / B / C / D / E / F (the gate's header).",
    }),
    since193: Object.freeze({
        at: "v4528", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "tools/ship/raceReplayBake-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green headless and in the browser on both backends. Racing city 5: world/raceReplayBake.mjs bakes a race record to " +
                 "voxels (the loop cells stamped from the surface the car drives on: ASH asphalt, a STONE / SNOW kerb, grass), keyframes " +
                 "it from its own log through drivePolicy.replay's new observing onTick to the record's fingerprint, draws the world and " +
                 "the cars through gpuDriven on both backends and reads every keyframe back; tools/ship/pngWrite.mjs writes them as PNGs " +
                 "that decodePNG reads back byte for byte, with a JSON schematic naming each file's pixel hash; race-replay.html plays the " +
                 "slideshow, records a WebM off the canvas and says NOT REAL TIME. MEASURED: the WebM is VP9 (43 KB for 3 s) and the " +
                 "H.264 MP4 a TV plays is refused by MediaRecorder here, so it is rig-pending by measurement. Sabotage A found the " +
                 "asphalt check reading the sabotaged constant and the dark-pixel check counting the background, and sabotage D " +
                 "found a PNG that does not decode crashing the gate instead of failing it; both re-aimed. The page's iframe " +
                 "froze the recorder's renderer 4 times in 16 runs and got its own browser (~26 s -> ~6.8 s), and the harness " +
                 "races page.evaluate against its timeout now. Sabotages red at A / B / C / D / E / F / G (the gate's header).",
    }),
    since194: Object.freeze({
        at: "v4529", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "tools/ship/ribbonRoad-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green headless and in the browser on both backends. Racing city 6: world/ribbonRoad.mjs drapes the grid track's " +
                 "centreline over the treemap terrain of this repository's own files (orrery-fleet.json's importers through " +
                 "bodyTerrain.repoTerrainOf), resampled a metre apart by sweptSpine, smoothed, graded to 12%, banked for 12 m/s " +
                 "with the inside edge low; cuts and fills the field to the road's plane one texel past the kerbs, taking the " +
                 "lower road where the loop folds over itself; draws the road as a swept ribbon with striped kerbs; and drives " +
                 "raceCar's unchanged car on the ribbon's plane. race-terrain.html puts terrain, ribbon and car in one gpuDriven " +
                 "scene. Sabotages red at A / B / C / D / E / F / G (the gate's header).",
    }),
    since195: Object.freeze({
        at: "v4530", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "tools/ship/crashDamage-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green headless and in the browser on both backends. Racing city 7: world/crashDamage.mjs turns the car's speed lost in " +
                 "one step against a building into the sandbox's own blast (voxelDamage, v4520) at the first solid voxel along its " +
                 "heading; CityGen is charged every voxel the footprint lost, so the hit points stay the standing voxels; rebar.mjs's " +
                 "cage is revealed on the cut as material 8; a building whose ground floor falls under 30% support is charged the " +
                 "rest, CityGen topples it and its static box is parked. race-crash.html laps or rams. The gate found the whole " +
                 "world culled when the camera's frustum lost the origin (the world was one unit-radius record there), which " +
                 "crashScene fixes for itself and the roadmap names for the other scenes. Sabotages red at A / B / C / D / E / F / G.",
    }),
    since196: Object.freeze({
        at: "v4536", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "physics/mesh/uvUnwrap-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green, 51 ms, and graded on the output of the caller that is blocked rather than on a square. physics/mesh/" +
                 "uvUnwrap.mjs unwraps planar polygons -- meshCSG's booleans emit exactly those, already carrying their plane, and " +
                 "meshCSG's own header says they \"ha[ve] no texture coordinates, because nothing unwrapped a surface that had not " +
                 "been made yet\". Projection into a polygon's OWN plane is an ISOMETRY, so this round owes no stretch minimiser: " +
                 "worst edge-length change 0.00e+0 over 24 edges. On real subtract() output -- 15 polygons, 3 tagged CUT -- every " +
                 "polygon unwrapped exactly once, every UV inside [0,1], 0 of 105 chart pairs overlapping, and TEXEL DENSITY IS ONE " +
                 "NUMBER: spread 1.7e-15 across 60 edges. The basis seeds on n's SMALLEST component, because crossing with a fixed " +
                 "up-vector dies on every floor and ceiling in the tree; 206 normals including all six axes read worst |dot| 1.1e-16. " +
                 "*** THE ROUND'S FINDING CAME FROM A SABOTAGE THAT WOULD NOT FIRE. *** Scaling u and v apart should be the loudest " +
                 "break here and it changed nothing, TWICE: scale is 1/max(w,h), so whichever axis IS the max has 1/dimension and " +
                 "1/span equal by arithmetic. Chasing that found the packer produced a TALLER-THAN-WIDE atlas on every input from 2 " +
                 "charts to 21 -- so Math.max(width, height) never took its first arm, a fifth of the texture was empty, and the " +
                 "occupancy being reported measured the strip rather than the square the UVs address. Searching the strip width for " +
                 "the smallest square lifted texture occupancy 48.7% -> 62.0% on the real fixture and 50.0% -> 61.5% on 13 unit " +
                 "squares. Sabotages red at A 4 / B 1 / C 2 / D 1 / E 1 / F 1 / G 2, E only after the sort row was made STRICT: " +
                 "`sorted >= unsorted` passes when the sort is a no-op, so it verified that sorting helps and never that it happened. " +
                 "The limit is stated in the same number it is measured by -- lift one corner of a quad off its plane and the spread " +
                 "goes 0 -> 1.1e-1, which is the input dualContour's quads will actually bring.",
    }),
    // v4567 -- the 216th closing, and it adds NO gate: it widens the one v4566 added, so the register grows
    // by a verdict rather than by a name. Kept as its own entry because the round is a separate measurement.
    since216: Object.freeze({
        at: "v4567", swept: 0, green: 0, red: 0,
        added: Object.freeze([]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze(["tools/ship/inputSets-selfcheck.mjs"]),
        verdict: "green, thirty rows, no new gate. *** v4566 SHIPPED TWO DISQUALIFIERS THAT COST 30% OF THE " +
                 "SWEEP AND BOTH WERE THE SAME HOLE. *** 121 gates spawned a child (124 s, 23%) and 102 took " +
                 "fs by a NAMED import (38 s, 7%); a named ESM import of a builtin does not route through a " +
                 "patched exports object, MEASURED here rather than assumed -- such a gate recorded an EMPTY " +
                 "set, not a partial one. A module.register() resolve hook changes what the NAME is bound to, " +
                 "which is the only lever that reaches it, and NODE_OPTIONS carries the probe into every node " +
                 "CHILD that inherits the environment so the child records itself into a shared directory. " +
                 "1,254 gates re-probed: SKIPPABLE 956 -> 1,102 (59% -> 72% of gate time), 94 of the 102 " +
                 "named-import gates now skippable against 0 before. *** AND THE ROUND'S OWN " +
                 "RECOMMENDATION WAS WRONG, WHICH IS THE FINDING. *** The child-process block was ranked " +
                 "first at 23% and delivered 17 gates; the named-import block was ranked second at 7% and " +
                 "delivered 94. Sampling the 136 that still refused showed NINETEEN OF TWENTY-FIVE spawning " +
                 "nothing at all -- flagged for merely REQUIRING child_process, which is measuring the " +
                 "import graph rather than the run. Patching the required object instead of flagging the " +
                 "require freed about a hundred more. What is left is real: of 24 sampled, 16 launch " +
                 "Playwright's headless_shell, the rest git, python3, cargo, tar and a shell. TWO DEFECTS " +
                 "OF MY OWN, both the shape this session keeps finding: registering the loader hook moved " +
                 "module reading off the patched fs and SILENTLY COST THE TRANSITIVE CLOSURE (zero reads for " +
                 "a gate whose whole input set is two modules -- it looks like a smaller set, not an error), " +
                 "fixed with a `load` hook that names the module outright; and `encode` spelled its fields " +
                 "by hand, so renaming the spawn flag dropped it on write and EVERY SPAWNING GATE BECAME " +
                 "SKIPPABLE, the count going 956 -> 1,121 and looking like success. FLAGS is now one list " +
                 "and a row asserts the round trip loses nothing. Sabotages L/M/N/O/P red by name -- O went " +
                 "ZERO red first time and exposed a mechanism (merging NODE_OPTIONS into an explicit env) " +
                 "that nothing tested, which is the 'fix that exists only in its own comment' shape.",
    }),
    // v4566 -- the 215th closing, for a gate whose subject is the SWEEP THIS REGISTER IS PART OF.
    since215: Object.freeze({
        at: "v4566", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "tools/ship/inputSets-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green, twenty-four rows. *** THE SWEEP RE-ANSWERS 1,255 QUESTIONS EVERY RUN AND A ROUND " +
                 "MOVES FIVE TO FIFTEEN FILES. *** v4548 measured where the 500 s goes and ruled out the " +
                 "obvious levers -- the shared walk is 42 ms, process startup across 1,141 spawns is 5% -- " +
                 "so the only remaining saving is not doing the work when nothing a gate reads has moved. " +
                 "tools/ship/inputProbe.mjs patches the fs default-export object and records the PATHS a " +
                 "gate touches (v4548 counted the same calls to find its own subject); the closure comes " +
                 "out TRANSITIVE, because a module load routes through it too. One pass over the sweep's " +
                 "own population, 1,253 gates in 181 s at eight workers, and 1,017 came back with a usable " +
                 "set: MEDIAN SIX PATHS, and 932 of 1,253 skippable on an unchanged tree. Changing a file " +
                 "268 gates read still leaves 803 skippable. *** THE MECHANISM SHIPS DISARMED. *** A gate " +
                 "that should have run and did not is the one failure here that is SILENT, so quickSweep " +
                 "counts what it would have skipped and runs everything anyway until --incremental is " +
                 "passed; the rule refuses on every unknown (no set, empty set, spawned, socket, named fs " +
                 "import, own source missing, any hash moved) and each refusal is driven on a fixture. " +
                 "FOUR DEFECTS FOUND IN MY OWN CODE BY RUNNING IT: the 'parallel' pass was serial because " +
                 "spawnSync blocks the event loop -- a claim in a comment the code did not do; the record " +
                 "was 42 MB and the decision 8.4 s because 443,405 path references over 4,072 distinct " +
                 "files were stored and hashed one per gate rather than one per path (3.1 MB and 464 ms " +
                 "indexed); the hash memoisation answered a second question from before a write, which is " +
                 "the exact silent false green arriving through the optimisation; and the conflict sentinel " +
                 "was null, which equals the live reading of any absent file, so a conflicting path that " +
                 "had been deleted came back skippable. Sabotages red by name at H/I/J/K, including arming " +
                 "the sweep without its flag. THE LIMIT IS STATED: an input set is what a gate read on ONE " +
                 "RUN -- a sample, not a specification -- and the defence is that it ships off while the " +
                 "number it would have skipped is printed every sweep.",
    }),
    // v4564 -- the 214th closing, and the round found the hole in the tree's own syntax guard rather than
    // in the census it was filed against.
    since214: Object.freeze({
        at: "v4564", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "tools/ship/sourceExtensions-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green, seven rows. *** TWO OF THIS TREE'S WALKS DISAGREED ABOUT WHAT A SOURCE FILE IS AND " +
                 "BOTH WERE WRONG. *** tools/ship/treeRead.mjs matched .mjs and .js, and \".cjs\" matches " +
                 "NEITHER -- the dot is part of the pattern, so it is not \".js\" with a c in front -- so " +
                 "six CommonJS modules in ai-bridge/, 1,477 lines, every one required by server.js at " +
                 "startup, were outside every census built on that walk. v4556 knew and wrote AROUND it: " +
                 "versionMarker is \".js RATHER THAN .cjs on purpose\" because its first draft was " +
                 "invisible. *** AND THE BIGGER HALF WAS THE SYNTAX GUARD. *** tools/check.mjs walked " +
                 "`extname(p) === \".js\"`, so of 4,143 source files it checked 1,527 and reported that " +
                 "as \"files checked\": the 2,608 .mjs files -- every module written since this project " +
                 "moved to ES modules -- had never been parsed by the thing whose job is parsing them. Its " +
                 "CommonJS split was by DIRECTORY, which was harmless only while the walk could not see the " +
                 "56 .mjs files under ai-bridge/; widening the walk without fixing the split would have " +
                 "handed real ES modules to a script parser. One rule now, in tools/ship/sourceKind.mjs, " +
                 "and the guard takes both its walk and its split from it: 1,527 files checked before, " +
                 "4,155 after, ALL GREEN -- a null result whose value is not the zero but that the number " +
                 "it reports is the number it means, at 11 s to 31 s. The gate's own fixture then caught " +
                 "the shared rule's default predicate reading a RELATIVE \"ai-bridge/...\" path as a " +
                 "module, which no caller in the tree would have shown. FOUR SABOTAGES RED BY NAME. THE " +
                 "ROUND'S LIMIT IS STATED IN THE GATE: a dozen other gates own PRIVATE walks with their " +
                 "own extension rules, and a .cjs file is still invisible to most of them.",
    }),
    // v4563 -- the 213th closing, and the first for a gate whose subject is a system that has never run a
    // single particle in the engine and still does not.
    since213: Object.freeze({
        at: "v4563", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "world/fluidSystem-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green, 112 ms, eight rows. *** world/fluidSystem.js WAS A BREADTH-FIRST FILL WEARING THE " +
                 "WORD FLUID, AND THE DEFECT WAS THAT IT CREATED WATER. *** A settled particle handed each " +
                 "of up to FOUR air neighbours a whole new particle, every one of which placed its own " +
                 "voxel: one drop became four, then sixteen, and nothing removed anything behind the " +
                 "frontier -- MAX_PARTICLES bounded the FRONTIER and not the wetted area, which is why the " +
                 "cap that file's own v2 header added did not stop it. On a flat floor, ONE drop: 13 wet " +
                 "cells by tick 10, 313 by 20, 2,113 by 40, 10,513 by 80 and 74,113 by 200, still " +
                 "accelerating. TWO THINGS WERE MISSING AND THEY BOUND DIFFERENT QUANTITIES. Conservation " +
                 "bounds ONE DROP: a particle carries a volume, a placed cell costs one unit of it, and " +
                 "what is left is RATIONED to as many neighbours as it can fill rather than divided among " +
                 "all of them -- cells wet <= volume, tight at 1, 2, 4 and 5 and slack above (8->5, 16->12, " +
                 "32->20) because water blocks its own neighbours. A sink bounds THE SYSTEM: cells this " +
                 "system placed are remembered and returned to AIR after dryTicks, which conservation alone " +
                 "does not give -- rain adds cells for as long as it falls. Rain at one drop per tick went " +
                 "160,684 cells by tick 200 and climbing BEFORE; AFTER it oscillates around 512 at dryTicks " +
                 "600 and 143 at 50, against the 4,800 that 1,200 drops would leave with no sink. SIX " +
                 "SABOTAGES RED BY NAME, and TWO OF THEM FOUND HOLES IN THIS ROUND'S OWN GATE FIRST: the " +
                 "\"removes only what it placed\" row seeded its water in a far chunk, so a sink drying a " +
                 "NEIGHBOURING cell went 0 RED until the seed moved to where the rain lands; and nothing " +
                 "drove the sink's \"is it still water?\" guard until a fixture built STONE on a puddle. " +
                 "*** AND THE ROW THAT ASKED FOR THE ROUND DID ITS JOB: *** world/chunk-selfcheck.mjs " +
                 "asserted the defect was still present and said in its own text that it would go red when " +
                 "somebody gave the system a sink. It did, on the day it landed. The wetting flag is STILL " +
                 "OFF, for a new reason: not because it floods, but because no particle of this system has " +
                 "ever run in the engine.",
    }),
    // v4560 -- the 212th closing, and the first for a gate whose reference half is a C++ program compiled from
    // a vendored source tree. The gate never compiles it: the cold build is 5,166 ms against a 3,000 ms
    // sweep budget, so the reference is a hash-pinned record and the binary is used only when it is already
    // there.
    since212: Object.freeze({
        at: "v4560", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "tools/mesh/xatlasRef-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green, 2,486 ms cold and 2,580 ms with the binary present, ten rows. *** physics/mesh/" +
                 "uvLscm.mjs HAD BEEN GRADED ONLY AGAINST ITSELF FOR SIX ROUNDS: *** every property its gate " +
                 "held it to was a property it asserted about its own output, and none of them could say " +
                 "whether the segmentation was any GOOD, because good is a comparison. vendor/xatlas is the " +
                 "reference implementation of the same weld-segment-LSCM-pack pipeline; it is C++ and there " +
                 "is no emscripten here, so it can never ship to a browser -- but g++ is here, so it can be " +
                 "RUN. *** THE METRIC IS COMPUTED ONCE AND APPLIED TO BOTH OUTPUTS, *** because asking each " +
                 "tool for its own quality number would compare two definitions rather than two unwrappers. " +
                 "THE FINDING: maxConformal, not maxNormalDeg, is the parameter that binds -- sweeping the " +
                 "angle 40 -> 6 does not change the chart count at all -- and its 2.0 default was about " +
                 "twice as loose as it should have been. At 1.05 this tree's stretchP90 matches or beats the " +
                 "reference on all four fixtures (torus 1.112 vs 1.189, spheres 1.100 vs 1.170 and 1.117 vs " +
                 "1.131). *** AND THE SECOND METRIC IS WHY THAT IS NOT A WIN. *** stretchP90 divides by its " +
                 "own median, so it grades uniformity and cannot see an atlas that shrank -- asserted, by " +
                 "halving every UV and watching it not move while densityP10 falls exactly 4x. Measured " +
                 "ABSOLUTELY, xatlas is ahead on every fixture, 1.31x to 2.01x, and the CYLINDER is the " +
                 "control that says where: developable, both tools exact at stretch 1.000, and xatlas still " +
                 "gets 2.01x the texture because it CUTS the strip into 3 charts that tile a rectangle at " +
                 "85.7% while this tree keeps 1 chart over 42.2% of the square. Filed as its own round. *** " +
                 "AND THE COMPARISON FOUND A LIVE DEFECT ON THE WAY: *** rasterPack seeded its atlas side " +
                 "at the widest chart's own span, at which that chart needs every column and its pad needs " +
                 "two more, `x0 + padW <= gridW` admits no position at all, and the not-finite fallback " +
                 "placed it OUTSIDE the atlas -- 1.002604, one pad cell of 384 past the edge, on 7 of the " +
                 "cylinder's 238 coordinates. Three of three synthetic packs reproduced it. It survived six " +
                 "rounds because the robot has enough charts that the seed never binds, and the robot is " +
                 "what every check measured. Four sabotages red by name: the seed floor, the merge bound, " +
                 "one byte of a recorded mesh hash, and a 1e-9 scale in the repack path.",
    }),
    since211: Object.freeze({
        at: "v4559", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "ui/pipboyItems-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green, 185 ms, ten rows. *** THE ONE THING A PIP-BOY INVENTORY SCREEN IS RECOGNISED BY WAS " +
                 "THE ONE THING THE INV PAGE DID NOT HAVE. *** ui/pipboyWireframe.js drew six item names and " +
                 "a blinking cursor; the panel beside the list, where the selected item turns in green " +
                 "wireframe, did not exist. ui/pipboyItems.mjs is six procedural models -- stimpak, RadAway, " +
                 "Nuka-Cola, bobblehead, fusion core and the engine itself as a voxel cluster -- built by " +
                 "joining boxes and tubes, plus a yaw/pitch projection that returns line segments in panel " +
                 "pixels. *** IT IS PURE ON PURPOSE: no canvas, no DOM, no THREE. *** The failure this code " +
                 "really has is a silhouette that fits at 0 degrees and crosses the bezel at 137, which is " +
                 "invisible to anything that renders one frame -- a screenshot test included. Kept pure, the " +
                 "question is arithmetic: every model at every degree of a full turn, 2,160 projections, " +
                 "worst overflow -9.5 px (i.e. 9.5 px INSIDE the panel). *** AND THE FLOOR IS ASSERTED " +
                 "BESIDE THE CEILING, which is what caught the plant. *** Scaling by a radius measured once " +
                 "at angle 0 -- the classic version of this bug -- does not overflow, it SHRINKS: the " +
                 "sabotage took the smallest long-axis fill from 0.900 to 0.512 and the containment row " +
                 "stayed green while the fill row went red. A fit that passes containment by drawing a dot " +
                 "is useless. The INV list is PARSED OUT OF THE PAGE rather than restated in the gate, so " +
                 "renaming an entry goes red instead of quietly showing an empty panel; an unknown name " +
                 "returns null and the page draws NO MODEL rather than the last model that worked, because " +
                 "a stimpak under the word BOBBLEHEAD looks correct and is worse. Five sabotages red by " +
                 "name. Rendered headlessly and LOOKED AT before shipping, which is the only way the " +
                 "remaining question -- whether a barrel, a flange, a plunger and a needle read as a " +
                 "stimpak at 190 pixels of green line -- can be answered at all; the gate does not claim to.",
    }),
    since210: Object.freeze({
        at: "v4557", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "tools/ship/ritualCoherence-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green, 61 ms, seven rows. *** THE BACKLOG ITEM THIS CAME FROM WAS WRONG AND THE MEASUREMENT " +
                 "IS THE FINDING. *** It read: every ship-ritual step that WRITES a record is ungated, every " +
                 "step that only READS one has a gate. NINE of the ten steps write -- two of them rebuild a " +
                 "JSON file, which the first pass of this census itself misread as reading -- and nine of the " +
                 "ten carry a verify() or a named gate. The real gaps were two and neither was the filed one: " +
                 "ONE step with neither check (`package`, now named so a second goes red), and ONE step whose " +
                 "command could not do what its description claimed. *** `derived-counts` SAID \"Refresh every " +
                 "derived count\" AND RAN THE CHECKER: *** its command was staleness-selfcheck.mjs, which " +
                 "contains no writeFileSync anywhere, so a ritual followed exactly reported the drift and " +
                 "refreshed nothing -- and it named that same file as its GATE, so one run reported both a " +
                 "step performed and a check passed for an action that did nothing. The writer is staleness.mjs " +
                 "--fix, deliberately separate (that file's header: --fix \"is never part of a check run\"). " +
                 "MEASURED CONSEQUENCE: case-study.html claimed 1,606 gates against 1,609 on disk, three " +
                 "rounds of drift in a number a reader sees. *** AND THE GATE THAT WOULD HAVE SAID SO HAD BEEN " +
                 "EXILED BY A STALE TIMING. *** staleness-selfcheck was recorded at 3,316 ms against a 3,000 ms " +
                 "budget, so the sweep skipped it and its recorded exit code sat at a 0 frozen from before it " +
                 "went red; re-timed through sweepRotation --gate it is 558 ms alone and 1,462 under eight-way " +
                 "load. Its reading was stamped \"unknown -- before v4408\", and budget exile is a ONE-WAY " +
                 "DOOR: over budget means skipped means never re-timed. 398 OF THE 465 OVER-BUDGET GATES CARRY " +
                 "THAT STAMP and 164 sit under 8 s; sixteen sampled across the range were re-timed alone and " +
                 "FOURTEEN came in under budget (asciify 4,257 -> 339, dracoWeld 5,443 -> 76). That is filed " +
                 "against backlog #14 rather than fixed here, because a bulk re-time surfaces reds that need " +
                 "triage. Four sabotages red by name, including restoring the original defect, which trips " +
                 "both the write-claim row and the self-gate row. One exemption is named and EARNED: `verify` " +
                 "may be its own gate because running a gate is its action, and the row requires it to be the " +
                 "one step that does not write -- if it ever gains one the exemption expires with it.",
    }),
    since209: Object.freeze({
        at: "v4556", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "tools/ship/versionMarker-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green, thirteen rows. *** THIRTY-ONE FILES READ THE ENGINE'S VERSION MARKER WITH THEIR OWN " +
                 "PATTERN AND GOT A COMMENTED-OUT LINE. *** The ship ritual PREPENDS a changelog block above " +
                 "main.js's constant and each block opens with a commented copy of the previous one, so the " +
                 "live declaration sits BELOW its own history and an unanchored reader takes the oldest " +
                 "comment -- v4487, eight rounds stale. *** THE FILED COUNT WAS ITSELF INFLATED BY PROSE, " +
                 "WHICH IS THE ROUND'S FIRST FINDING: *** the register said 44 readers and 35 files, and a " +
                 "raw re-take agreed at 87/44/35 -- until COMMENTS WERE STRIPPED, giving 51/32/31, because " +
                 "main.js's changelog QUOTES these patterns and the scan counted the narration. A second " +
                 "over-count in the same pass compared captures as raw strings and called a digits-only " +
                 "capture wrong when it is only a different convention. *** AND THE CENSUS STILL MISSED " +
                 "THREE, BECAUSE IT ONLY EVER ASKED main.js: *** brain/brain.js has the same shape with " +
                 "commented copies on BOTH sides of its live line, and three files read that marker " +
                 "unanchored. Only the tree-wide ratchet found them. The fix is one definition, " +
                 "tools/ship/versionMarker.js, shared by 43 call sites in 40 files -- CommonJS so the nine " +
                 "bridge readers can require it and the thirty-one ESM ones can default-import it, and .js " +
                 "rather than .cjs BECAUSE THIS TREE'S CENSUSES CANNOT SEE .cjs: the first draft was " +
                 "invisible to its own file count. *** THE CONVERSION BROKE TWO THINGS AND BOTH ARE GATED. " +
                 "*** Three call sites consume the NUMBER, so the shared capture's letter turned parseInt " +
                 "into NaN silently; and releaseLedger-selfcheck EXISTS to contrast an anchored read with an " +
                 "unanchored one, so pointing both at the shared pattern made its own row vacuous -- it is " +
                 "the one named exemption and the ratchet proves the exemption EARNED by running its two " +
                 "literals and requiring different answers. *** AND FIXING THE READERS EXPOSED A FRESHNESS " +
                 "CHECK THAT COULD NOT FIRE: *** registerDrift-selfcheck holds the register's audit to 12 " +
                 "rounds and was GREEN because its reader said v4487 and the audit was frozen at v4487 -- a " +
                 "stale record against a stale clock reads as no drift. Corrected it said 48 rounds, which " +
                 "had been true for months; the audit is re-frozen at v4535, 30 rows, and the gate passes " +
                 "honestly. status.mjs, which writes the project's LIVE state page, now stamps v4535 where " +
                 "that page said v3940. NOT DONE: artefacts already emitted under the wrong reading are not " +
                 "retro-corrected -- they record what the tree said at the time.",
    }),
    since208: Object.freeze({
        at: "v4555", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "world/chunk-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green, 52 ms, thirteen rows. *** Chunk.index() HAD NO RANGE CHECK AND 36,754 OF 100,982 " +
                 "VOXEL READS IN A NINE-SECOND BOOT WERE OUT OF RANGE -- 36.4%. *** Every one on Y and every " +
                 "one off the end of the array, where a typed array answers `undefined`; x and z were in " +
                 "range on all 100,982, so the aliasing case (x is the fastest axis, so an out-of-range x " +
                 "lands on a NEIGHBOURING voxel INSIDE the array) is real in the arithmetic and does not " +
                 "arise here. *** THE SAME undefined MET TWO COMPARISONS AND ONLY ONE WAS SAFE, WHICH IS WHY " +
                 "IT SURVIVED: *** _proximityScan asks `v === VOXEL.WATER` and undefined fails it, so 34,722 " +
                 "of the bad reads went somewhere harmless; getCaveFactor asks `v !== VOXEL.AIR` and " +
                 "undefined PASSES, so every sample above the ceiling counted as SOLID. In an open-sky " +
                 "column topping out at y=24 that read 0 / 0.286 / 0.571 / 0.857 at y = 54 / 59 / 62 / 64 -- " +
                 "A LISTENER IN CLEAR AIR TOLD IT IS IN A CAVE, on a ramp that is exactly the fraction of " +
                 "its 9x9x9 box past the ceiling -- and reads 0 at all four now, with the control at y=27 " +
                 "over real terrain holding at 0.331 both ways. isAir also answered SOLID above the world, " +
                 "so rain landed the instant it spawned: 335 spawned and 335 landed with none in flight " +
                 "before, 345 spawned and 261 IN FLIGHT after. *** AND THE FIX WOKE A SYSTEM THAT HAD NEVER " +
                 "RUN A SINGLE PARTICLE. *** FluidSystem's active count was 0 on every sample and the water " +
                 "voxel count sat at exactly 46,223 forever; bounded, it went 46,223 -> 325,344 in thirty " +
                 "seconds, linear, with simulate() at 0.03 ms becoming 0.7. Two separable faults: the " +
                 "descent trail (water placed BEFORE testing whether the particle could fall, leaving a " +
                 "five-voxel pillar in open air) is fixed and was worth only 23%; the flood is the LATERAL " +
                 "SPREAD, a breadth-first fill where one drop wets 41 cells by tick 10 and 11,101 by tick " +
                 "80, MAX_PARTICLES bounding the frontier and not the wetted area. The wetting path SHIPS " +
                 "OFF with the numbers beside the flag, restoring exactly the behaviour this engine has " +
                 "always had while the two real defects stay fixed; filed as fluid-has-no-sink. EIGHT " +
                 "SABOTAGES RED BY NAME, and a NINTH went zero-red first -- guarding index() itself instead " +
                 "of get/set broke nothing, because the gate asserted in PROSE that index() stays pure " +
                 "arithmetic and checked it nowhere; the aliasing is proved on index() now. One claim was " +
                 "dropped rather than softened: the out-of-range writes do NOT force a re-mesh, 0 dirty " +
                 "transitions across all 1,891 of them. *** AND THE ROUND'S OWN SWEEP THEN FOUND A TENTH " +
                 "THING, WHICH IS WHY THE SWEEP IS RUN: *** recordDrift-selfcheck went NEW RED inside it and " +
                 "passed every time it was run alone -- recordDrift.mjs parsed sweep-timings.json bare, the " +
                 "SAME torn read recordReach.mjs was repaired for at v4550, in a module that had its own " +
                 "second reader and never used the shared readTimings(). That is the rule this very gate's " +
                 "section 3 asserts about `sources` -- one walk, one definition -- turned on itself. It now " +
                 "retries and reports UNREADABLE by name instead of crashing, and BOTH cases are driven: a " +
                 "torn-then-restored file heals, a permanently truncated one goes stale. The first retry " +
                 "spun on Date.now(), which blocks the event loop, so a restore scheduled 50 ms out could " +
                 "never be dispatched and all three attempts failed -- caught by the test written to prove " +
                 "the heal, and the row goes red again if the spin comes back.",
    }),
    since207: Object.freeze({
        at: "v4554", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "world/surfaceProbe-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green, 110 ms, seventeen rows. *** THE TERRAIN MODEL AND THE VOXELS ARE TWO INDEPENDENTLY " +
                 "DERIVED ANSWERS AND NOTHING HAD PUT THEM SIDE BY SIDE. *** world._heightAt is an " +
                 "ErosionCache projection over noise; world.voxelAt is what a chunk actually holds. Six boots " +
                 "of index.html, 1,681 columns on a 3-unit lattice: the model reports a stand height INSIDE " +
                 "SOLID ROCK in 101 to 158 of them (6.0% to 9.4%), error running +17 one way and -13 the " +
                 "other with its median at 0, in a box x -54..30 z -60..24 -- the middle of the map. A column " +
                 "at (-40, -38) is SOLID 0..1 / air 2..4 / SOLID 5..13 / air 14 / SOLID 15..21 / air 22..63 " +
                 "and the model answers 9, thirteen voxels under the real surface, with three neighbours the " +
                 "same. *** THE GAP CANNOT BE CLOSED BY FIXING GENERATION, which is what decided the shape " +
                 "of the fix: *** generateChunk(0,0) twice in one boot gives 0 of 16,384 voxels different, " +
                 "but across six boots from the same seed the MODEL sums to 35708 every time while the " +
                 "VOXELS sum to SIX DISTINCT VALUES, because fluid and erosion write into chunks all run " +
                 "long at rain sites chosen at random. A pure function of the seed cannot track a grid the " +
                 "simulation is rewriting, so the answer is to ask the voxels -- as a HYBRID, because the " +
                 "scan is not affordable: 0.4 ms for the model, 7.6 for a full column scan (19x), 1.8 for " +
                 "trusting the model and verifying it (4.5x). *** AND WIRING IT IN FOUND THE LARGER DEFECT " +
                 "UNDERNEATH THE ONE IT WAS BUILT FOR. *** The line it replaced in BotPathfinderPool was " +
                 "`this.world?._heightAt || ((x, z) => 5)`, and _heightAt is a METHOD reading " +
                 "this._heightOverride; detached from its object it THREW ON EVERY CALL into an empty catch, " +
                 "so the snapshot was 121 zeros of 121 -- A FLAT PLANE AT y=0 for both the navmesh route and " +
                 "the grid fallback, since the pool was written. No fixture could see it: every fake world " +
                 "in this tree supplies _heightAt as a plain function with no receiver to lose. Measured " +
                 "through the pool's own shipped method after the fix: 7,921 cells, ZERO zeros, heights 2 to " +
                 "52. Eight sabotages red by name, including restoring that spelling. *** THE FIRST TAKE OF " +
                 "THE RECORD PUBLISHED ONE BOOT'S NUMBERS AS CONSTANTS *** and a row now goes red if the " +
                 "interval is collapsed back to a single number. Spun out and NOT fixed: Chunk.index() has " +
                 "no range check, so the world calls everything above its own ceiling SOLID -- which is why " +
                 "rain never falls (210 spawned, 210 landed at spawn height, 0 in flight) and hydraulic " +
                 "erosion made 1,674 discarded carves at y=65 in one boot. Filed as chunk-index-unbounded.",
    }),
    since206: Object.freeze({
        at: "v4552", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "nav/detourScale-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green, 242 ms. *** THE NUMBER nextRounds SAID NOBODY HAD TAKEN, TAKEN -- AND IT INVERTS THE " +
                 "QUESTION. *** pathfinder-snapshot-window has been open on the premise that HM_PADDING = 24 " +
                 "might be too NARROW: v4547 measured a detour wider than the window getting NO path rather " +
                 "than a long one, built an escalating ladder to 60 and 144, and filed the rest saying " +
                 "\"choosing between them still needs the number nobody has taken, which is what real detours " +
                 "in real worlds look like\". Measured on 320x320 of main.js's own world._heightAt from a real " +
                 "boot, walked with the worker's own rule and planned by Dijkstra over the WHOLE slab so the " +
                 "route is the one a planner with no window would return: 240 routes, ZERO unreachable of 332 " +
                 "tried, and the excursion outside the start/goal box reads median 0, p90 0, p99 1, MAX 3. A " +
                 "pad of 4 covers 100%. *** 24 IS EIGHT TIMES THE WORST CASE AND THE LADDER IS INSURANCE " +
                 "AGAINST A WORLD THIS TREE DOES NOT HAVE. *** The reason is the second measurement: at the " +
                 "worker's own step rule the shipped heightfield is 0.18% blocked into ONE component covering " +
                 "100.0% of the map -- an open field. Nothing to go round means nothing to detour for, and the " +
                 "two unbuilt shapes (a window derived from obstacle scale, a persistent per-region navmesh) " +
                 "answer a question this world does not pose. THE CONSTANT IS NOT CHANGED and the round says " +
                 "why: it is generous, it costs little, and what it was missing was anything able to say so. " +
                 "*** THE INSTRUMENT IS GRADED ON A WORLD THAT DOES HAVE AN OBSTACLE, WHICH IS WHAT STOPS " +
                 "THIS BEING A COMFORTABLE STORY: *** a wall with one gap returns an excursion of 58 where the " +
                 "geometry says 58, and moving the gap moves the answer to 28 and then 0 -- three gaps, three " +
                 "answers, none typed into the gate -- and a census of that world asks for a pad of 184, well " +
                 "over the shipped 24. nav/fixtures/engineTerrain96.json is 26 KB of the REAL terrain so the " +
                 "claim re-derives without a browser. TWO DEFECTS IN THE GATE'S OWN FIRST DRAFT, both caught " +
                 "by running it: a fragmentation row asserting >98% that failed at 97.7 (my threshold, not the " +
                 "terrain -- the honest claim is the RATIO, blocked edges x19 against 2.2 points of component " +
                 "loss), and a one-in-a-hundred fixture that put its outlier exactly AT p99, so the row " +
                 "contrasting a percentile with a maximum had the two agreeing. Sabotages red at four of four, " +
                 "including windowing the reference planner to the bounding box, which makes it measure its " +
                 "own cap and reddens four rows.",
    }),
    since205: Object.freeze({
        at: "v4550", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "tools/export/glbConformance-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green. *** THE CONTAINER WAS CHECKED IN THIS TREE AND THE SPEC WAS NOT, AND THOSE ARE " +
                 "DIFFERENT FAILURE MODES. *** voxelGlb-selfcheck already asserted the magic is 0x46546C67, " +
                 "the version is 2, and that a FLOAT bufferView never lands at an odd offset; nothing asked " +
                 "whether the bytes MEAN anything legal. tools/export/glbConformance.mjs implements the " +
                 "subset of glTF 2.0 that applies to what this tree writes and reads, each finding carrying " +
                 "the spec's own error code. NOT VENDORED: KhronosGroup/glTF-Validator is the reference " +
                 "implementation and is named as such, but it is Dart compiled to JavaScript and would be " +
                 "the only build-output dependency in a tree of hand-written checkable modules. *** THE " +
                 "RESULT ON REAL FILES IS A NULL RESULT AND IS REPORTED AS ONE: *** all 31 GLBs on disk -- 29 " +
                 "Kenney kit models, RobotExpressive, two header-only fixtures -- and both of this tree's " +
                 "writers come back with zero errors and zero warnings. So the number that matters is not 31 " +
                 "clean, it is that FIFTEEN of the spec's MUSTs are broken one at a time against a real " +
                 "export and every one is caught by its own error code, with the unmutated file firing none. " +
                 "THREE OF THE CHECKS NEED THE BUFFER AND NOT THE JSON, which is the difference between a " +
                 "check and a restatement of the writer: POSITION min/max are RECOMPUTED from the vertices, " +
                 "every index is range-tested against the real vertex count, and a NaN written into the BIN " +
                 "with the JSON untouched is found. *** THE FIRST RUN BLURRED A DISTINCTION AND THE FIX IS " +
                 "NOT AN EXEMPTION BY FILENAME: *** gpu/fixtures/ holds two GLBs that are a real Khronos " +
                 "asset's JSON with the payload stripped, and reporting them as \"declares 42945692, BIN " +
                 "chunk holds 0\" reads the tree's own PROVENANCE.md discipline as a defect. NO BIN CHUNK AT " +
                 "ALL is header-only; a BIN chunk that EXISTS and is short is still an error, and a fixture " +
                 "proves the second. WIRED, and the wiring proved by breaking the WRITERS rather than the " +
                 "checker: a min off by one in voxelGlb and an index set to 60000 in sceneGlb each redden " +
                 "that writer's OWN gate. The 28-entry kit manifest is validated HERE and not in " +
                 "kenneyKit-selfcheck.mjs, because that gate is 11,003 ms against a 3,000 ms budget and does " +
                 "not run at ship time -- the check would have been parked exactly where the previous round " +
                 "found 43 of 94 records sitting. TWO WEAK ROWS IN THE GATE'S OWN FIRST DRAFT, both fixed: a " +
                 "warning-channel row whose condition was true of every possible tree, and a coverage row " +
                 "that tested for absent strings in a six-vertex export's stats -- it now measures the limit " +
                 "on RobotExpressive, which has 2 skins and 14 animations across 283 accessors that this " +
                 "module contains no rule for, so its clean result is narrower than it looks. And one lying " +
                 "detail: the sceneGlb summary printed \"0 errors, 0 warnings\" as a constant, directly " +
                 "under a FAIL row, until it was derived. *** AND THE ROUND'S SWEEP EXPOSED A RANDOM RED IN " +
                 "LAST ROUND'S OWN GATE, WHICH IS THE WORST SHAPE A SHIP-TIME CHECK CAN HAVE. *** " +
                 "recordReach-selfcheck went red inside two full sweeps and passed all 68 runs under 16-way " +
                 "CPU load afterwards -- so the load was never the trigger. quickSweep REWRITES " +
                 "sweep-timings.json at the end of a run, and a read landing mid-write parses to nothing: " +
                 "readTimings then returned an EMPTY map, every guardian looked unmeasured, and `unchecked` " +
                 "jumped from 43 to about 74, which the ratchet read as a catastrophic regression. Two real " +
                 "defects behind one symptom: an absent timing was conflated with a slow one (quickSweep has " +
                 "kept `unmeasured` apart from `skippedOverBudget` since it was written; this was the only " +
                 "place in the tree that blurred them), and a ratchet judged on an absence of evidence. " +
                 "There is an UNMEASURED class now, and reach() reports `judgeable` so a caller can refuse " +
                 "to judge. THE FIRST FIX ALSO CRASHED: the gate's own detail string did a second raw " +
                 "JSON.parse of the very file the fixture tears, so it died with an unhandled SyntaxError " +
                 "BEFORE reaching the row written to detect that -- a guard that only works on well-formed " +
                 "input is not a guard -- and the completeness row summed three classes where there are now " +
                 "four, so the torn-read fixture failed on arithmetic rather than on the thing it tests.",
    }),
    since204: Object.freeze({
        at: "v4548", swept: 2, green: 2, red: 0,
        added: Object.freeze([
            "tools/ship/treeRead-selfcheck.mjs",
            "tools/ship/recordReach-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green, 1.4 s and 0.5 s. The round set out to bring two gates back under the ship-time " +
                 "budget and found that the ritual does not check HALF ITS OWN RECORDS. *** THE STARTING " +
                 "POINT: *** frozenRecords-selfcheck at 3,446 ms and recordDrift-selfcheck at 3,026 ms " +
                 "against a 3,000 ms budget, so the tree's only two stale-record detectors never ran at ship " +
                 "time -- which is how BUDGET_DRIFT_V4536 went unre-taken through nine ALL GREEN rounds. " +
                 "*** THE CAUSE WAS NOT EXPENSIVE WORK, IT WAS THE SAME WORK DONE SIX TIMES. *** Wrapping " +
                 "fs.readFileSync and fs.readdirSync and counting: recordDrift issued 23,429 reads and " +
                 "12,397 readdirs over 4,025 files -- every file read SIX times, every directory walked " +
                 "EIGHTEEN times -- for 606 ms of actual work. tools/ship/treeRead.mjs memoises one read per " +
                 "process and four censuses share it. *** AND THE HEADLINE MOVED TWICE UNDER MEASUREMENT. *** " +
                 "The walk turned out to be 42 ms, so eighteen walks is 750 ms and NOT the 2.5-3.5 s the " +
                 "gates cost; the real weight was frozenRecords' guardian search, ~95 record names tested " +
                 "against 1,602 gate sources, ~152,000 substring searches, recomputed on all six census() " +
                 "calls. Memoising that took the gate 2,966 -> 1,384 ms and recordDrift 2,428 -> 1,766, and " +
                 "the memoised census was proved byte-identical to the old one across three different " +
                 "excludes before it was kept. *** THEN THE GENERAL QUESTION. *** Joining the record census " +
                 "to the sweep timings -- two tables this tree already had and had never put side by side -- " +
                 "says 43 of 94 frozen records are NOT checked at ship time: 23 guarded only by gates over " +
                 "the budget, 20 guarded by nothing, and THREE guardians recorded AT the 20,000 ms cap, " +
                 "meaning they do not finish at all. recordReach.mjs is a RATCHET on that number, not a " +
                 "claim it is acceptable. *** THREE SELF-INFLICTED FINDINGS. *** (1) treeRead was written " +
                 "with eager text and made assertionShape-selfcheck WORSE, 3,204 reads -> 4,026 and 392 -> " +
                 "569 ms; the probe meant to confirm the win showed the loss, and the text is lazy now. (2) " +
                 "The guardian search ran on RAW source, so a gate that merely MENTIONS a record in its " +
                 "header counted as guarding it -- found when this round's own new gate narrated " +
                 "BUDGET_DRIFT_V4536 and the census promoted it from unguarded to guarded. Stripping " +
                 "comments first moves 11 records and demotes 2 to unguarded. (3) The strip does not reach " +
                 "STRINGS, and the same gate's detail text then re-promoted a record the same way; the names " +
                 "are now spelt out of the record rather than typed. Strings are deliberately NOT stripped, " +
                 "because a real check reads r.name === \"SOME_RECORD\" and a regex-level stripper cannot " +
                 "tell that from narration -- 2 records tree-wide rest on a string mention, and that is " +
                 "stated as a limit. *** AND ONE OPTIMISATION DECLINED ON PURPOSE: *** enumerateGates is " +
                 "still called 8 times per recordDrift run, ~320 ms, because gateSweep-selfcheck PLANTS a " +
                 "transient fixture and re-enumerates to prove it is excluded -- a memo would have answered " +
                 "from the pre-plant list and made that row green without the code under test doing anything.",
    }),
    since203: Object.freeze({
        at: "v4547", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "tools/ship/engineSceneBot-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green, 7.8 s -- AND THAT NUMBER IS OVER THE 3,000 ms SWEEP BUDGET, so this gate does not run " +
                 "at ship time and is registered saying so. Three consecutive rounds recorded booting the " +
                 "engine's own scene as \"a much larger surface than one gate should own\"; it is index.html in " +
                 "headless Chromium, 7,168 ms, ZERO page errors, 15 canvases, and the real BotManager reachable " +
                 "at window.fpsShooter.botManager with NOTHING published to get it there. *** AND IT FOUND A " +
                 "REGRESSION v4545 SHIPPED THAT EVERY OTHER GATE IN THE TREE STRUCTURALLY COULD NOT. *** That " +
                 "round wired terrainWalk into BotManager through functionGround, which probes at x +/- eps, and " +
                 "main.js's world._heightAt ANSWERS ONLY AT INTEGERS -- sampled at quarter-unit spacing it reads " +
                 "25, null, null, null, 26, null, null, null, 27, six of nine null. Every probe came back null " +
                 "and every bot in the real engine was frozen at 0.00 movement. No fixture could see it because " +
                 "every fake world in every gate answers at any float. autoGround ASKS the world which kind it " +
                 "is, once, and a real spawned bot now walks 6.28 units. *** THE ROUND'S OWN SABOTAGE PASS FOUND " +
                 "TWO PROXIES IN THIS GATE'S FIRST DRAFT. *** (1) The standing claim was scored over FRAMES, so " +
                 "it stayed GREEN under the sabotage that froze the bot: 600 identical samples of the one height " +
                 "it was placed at read as 600 confirmations. Scored over ground COVERED it reads 6 distinct " +
                 "cells at 146 distinct heights, worst |y - (ground+1)| = 0, and goes red at 1 cell. (2) It " +
                 "scored bot.y against terrainWalk's OWN ground function, which only proves BotManager and the " +
                 "gate call the same code; against a bilinear of the world's four integer corners written out in " +
                 "the page, breaking latticeGround's interpolation moves it 0 -> 0.999. (3) The offLattice row " +
                 "asserted the DETECTION and not that anything HONOURED it -- forcing the functionGround branch " +
                 "while leaving the flag alone left it green -- so it now probes the chosen ground at (0.5, 0.5), " +
                 "where the world itself returns null, and reads 25.25 between corners 25 and 26. *** AND THE " +
                 "SWEEP ITSELF PRODUCED TWO FINDINGS THE ROUND DID NOT GO LOOKING FOR. *** (1) The ladder work " +
                 "pushed tools/ship/navWiringLive-selfcheck.mjs from 0.76 s to 3,454 ms, over budget -- the " +
                 "round measuring what over-budget costs had evicted the gate that grades the WORKER PLUMBING. " +
                 "Trimmed to 2,829 ms by dropping four redundant sample offsets and halving a per-request cost " +
                 "measurement, NOT by weakening a claim, and the counts that were pinned at 8 and 16 are now " +
                 "derived from the plan count and the schedule's own length so the trim could not silently " +
                 "turn a measurement into a wrong constant. v4536's `crossings` probation rule then did " +
                 "exactly what it was built for: one crossing is probation, not eviction, so the gate is " +
                 "re-run next sweep rather than gone. FIRST REAL CASE THAT RULE HAS CAUGHT. (2) 0 NEW RED " +
                 "across 1,136 gates, 17 known red, 4 false red, 466 over budget skipped.",
    }),
    since202: Object.freeze({
        at: "v4546", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "tools/ship/navWiringLive-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green, 0.76 s. Closes what navWiring-selfcheck's own closing line said it could not reach: it " +
                 "drives tools/ship/navWiringHarness.html in headless Chromium, building a REAL BotPathfinderPool " +
                 "that plans through REAL module Workers. *** THAT WAS WHERE v4545'S ACTUAL RISK SAT: *** the round " +
                 "gave the worker a static import of ../nav/navmesh.mjs and BotManager one of terrainWalk.mjs, and " +
                 "in Node those prove syntax while in a browser they must RESOLVE OVER HTTP inside a module Worker. " +
                 "*** THREE FINDINGS THE NODE GATE COULD NOT HAVE MADE. *** (1) The pool SWALLOWED `route`: " +
                 "_onWorkerMessage destructured { id, path, found, expanded } and dropped the field v4545 had just " +
                 "added, so no caller could tell a navmesh path from a grid one. (2) plan() had NO REJECT AND NO " +
                 "TIMEOUT, and BotManager gates new requests on !pathRequestPending -- so one unanswered job " +
                 "stranded that bot for the life of the page. Round 216 shipped that and nothing could reach it " +
                 "because a worker either answered or was never spawned; v4545 made a third state reachable, a " +
                 "module Worker whose import fails to resolve, which constructs and then dies. Mistyping the import " +
                 "hung the harness until the driving gate gave up. jobTimeoutMs resolves as not-found now, the " +
                 "shape every caller already handles. (3) A route detouring more than HM_PADDING = 24 off the " +
                 "straight line is NOT IN THE SNAPSHOT the pool samples, so both planners correctly returned " +
                 "found:false on the first harness -- a property of the pool rather than of either planner. THE " +
                 "COST AT REAL BOT COUNTS, which was the other thing left unmeasured: a 48-bot burst is 44.1 ms of " +
                 "worker time against the grid's 10.4, across 2 workers, off the main thread, with 48/48 answered " +
                 "-- and the PER-JOB cost FALLS from 3.8 ms at one bot to 0.92 at forty-eight as warm-up amortises.",
    }),
    since201: Object.freeze({
        at: "v4545", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "tools/ship/navWiring-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green, 0.17 s. Gates the WIRING of three capabilities that each shipped with a gate, a " +
                 "measurement and no caller: nav/funnel.mjs (v4254), nav/navmesh.mjs (v4543) and " +
                 "physics/character/terrainWalk.mjs (v4544). It drives the REAL worker's onmessage and the REAL " +
                 "BotManager against a fake world, the way v4187's dungeonWalls-selfcheck drives DungeonAI. *** AND " +
                 "WIRING FOUND THREE DEFECTS THAT THREE GATES OF DESIGNED FIXTURES HAD NOT. *** (1) The first " +
                 "realistic snapshot the navmesh was ever handed returned 147.35 m against a taut 96.61, running to " +
                 "the far edge of the map: its portals were oriented from polygon CENTRES, right only while a " +
                 "centre lies near the path through it, and every fixture in its own gate walked its corridor " +
                 "monotonically. Now oriented from the crossing axis and sign, which is what Detour gets free from " +
                 "the winding. (2) A stride of 0 made hm.length/stride Infinity and HUNG the worker forever -- worse " +
                 "than throwing, since the worker's fallback recovers from a throw and nothing recovers from a hang. " +
                 "(3) Flipping the worker's default to the navmesh route turned funnel-selfcheck red within the " +
                 "minute, because that gate measures the octile constant of an EIGHT-CONNECTED GRID and a navmesh " +
                 "returns the straight line: it asks for route \"grid\" by name now. The payoff is measured on the " +
                 "snapshot shape BotPathfinderPool actually builds: shorter (96.61 vs 99.88), further from the walls " +
                 "(2.000 vs 0.850) and 4 waypoints against 21. BotManager follows the ground through terrainWalk " +
                 "instead of writing bot.y = _heightAt + 1, so a bot moves at 5*cos(theta) horizontally rather than " +
                 "sec(theta) along the ground, and stops at a wall it used to walk up.",
    }),
    since200: Object.freeze({
        at: "v4544", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "physics/character/terrainWalk-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green, 0.21 s (237/201/191 ms over three serial runs). A slope-aware ground controller, built " +
                 "because physics/character/kinematic.js is an AABB against axis-aligned unit voxels and a voxel " +
                 "world has no slopes. MEASURED FIRST, which is what said a new file was owed rather than a patch: " +
                 "on voxelised ramps that controller either cannot climb (0.31x the requested speed at 14 degrees, " +
                 "0.01x and stuck at 45) or, with a step allowance, climbs while moving along the surface at exactly " +
                 "sec(theta) -- 1.020x, 1.118x, 1.414x. *** THE ROUND'S CENTRAL CLAIM IS THAT A SLOPE LIMIT MUST BE " +
                 "A PROPERTY OF THE GROUND AND NOT OF THE FRAME RATE, AND THE CONTROL IS IN THE GATE: *** the " +
                 "tempting per-step height-difference test climbs a 76-degree wall at 60 and 240 fps and refuses the " +
                 "SAME WALL at 15 and 30, and climbs 26 units up a 63-degree face at every timestep against a " +
                 "45-degree limit. The normal-based limit refuses both at all four timesteps. Two oracles are " +
                 "cross-checked rather than each trusted: a bilinear heightfield gradient and a meshBVH raycast plus " +
                 "cross product agree to 4.8e-14 in height and EXACTLY in normal over 200 samples. *** TWO DEFECTS " +
                 "IN MY OWN FIRST DRAFT, BOTH FOUND BY MEASURING RATHER THAN READING: *** an exact 45-degree plane " +
                 "has n.y one ulp below Math.cos(45 * PI / 180), so a 45-degree ramp was refused to a character " +
                 "whose limit is 45 degrees; and the airborne branch kept advancing horizontally at the old height, " +
                 "which is a ground controller FLYING -- 143 substeps sailing over a deck 10 units below. Six " +
                 "sabotages, all red by name, including a normal taken from a central difference of the samples " +
                 "instead of the bilinear patch the height comes from.",
    }),
    since199: Object.freeze({
        at: "v4543", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "tools/ship/navmesh-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green, 1.59 s (1670/1587/1637 over three serial runs, so it is under the 3000 ms sweep budget " +
                 "and a ship-time step actually runs it). A Recast-style convex-polygon navmesh, built because " +
                 "tools/ship/funnel-selfcheck.mjs ended with 'unchecked here: a NAVMESH' and its section 4 said why " +
                 "it mattered: on a wall with one gap, string-pulling a GRID corridor is 302.20 m and enters a wall at " +
                 "18 of 616 samples, and insetting it until it is as safe as the 318.39 m staircase costs 319.59 m -- " +
                 "LONGER than what it improved, because the whole saving was a safety margin the grid held by " +
                 "accident. Eroding by the agent radius BEFORE the polygons exist puts the clearance in the mesh: " +
                 "297.42 m on the same wall at the same radius, 0 of 605 in a wall, 0.27% off an optimum derived from " +
                 "the fixture's own inequalities rather than from this code. *** THE ROUND'S REAL DEFECT WAS FOUND BY " +
                 "CHANGING THE INSTRUMENT, NOT THE FIXTURE: *** eroding with Recast's chamfer 2/3 field passed 'in a " +
                 "wall: 0 of 599' while DELIVERING 0.708 clearance where 1 was asked and 2.829 where 3 was -- both " +
                 "exactly the diagonal a chamfer misprices at 3 against 2.828. Not entering a wall is a far weaker " +
                 "property than standing clear of one. An exact Euclidean transform replaced it. *** AND TWO OF NINE " +
                 "SABOTAGES WENT 0 RED FOR THE SAME REASON -- NO FIXTURE COULD SEE THEM -- ONE OF WHICH FOUND A REAL " +
                 "BUG: *** deleting the maxStepDown test changed nothing because every fixture was flat, and building " +
                 "a ledge showed the row sweep putting both sides of a one-way cliff in ONE rectangle, so the mesh " +
                 "returned a 110.00 m path UP a 5-unit drop it cannot climb. Rectangles now break where the step is " +
                 "not mutual and portals carry a direction each way. A third, replacing the A* cost with a flat g+1, " +
                 "STILL will not fire: f = g + D(midpoint, goal) adds a polygon count to metres, so the heuristic " +
                 "dominates and both models return identical paths on every fixture including a purpose-built trap " +
                 "map. That is recorded in the gate as unguarded rather than papered over.",
    }),
    since198: Object.freeze({
        at: "v4539", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "physics/render/splitSum-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green, 1.14 s. The SPECULAR half of image-based lighting: render/splatProbes.mjs and probeLit.mjs " +
                 "shipped the diffuse half at v4513/v4514, leaving physics/render's VNDF sampling, multi-scatter " +
                 "compensation and dielectric walk lit by a diffuse environment and nothing that reflects. " +
                 "*** THE TABLE IS GRADED AGAINST A NUMBER THE TREE ALREADY HAD RATHER THAN A TOLERANCE: *** at F0 = 1 " +
                 "Schlick's Fresnel is identically 1, so the split sum's second integral IS the directional albedo, and " +
                 "energyCompensation.mjs computes that by a different route (marched grid or VNDF sampler, chosen by " +
                 "albedoEstimator) for a different purpose. Median disagreement 4e-5 over alpha 0.1-1.0; the worst, " +
                 "6.4e-3, sits at alpha 0.1 / mu 0.2 -- precisely where that reference's own header says it is weakest. " +
                 "A cross-check whose largest disagreement lands on the reference's stated weak spot is telling you " +
                 "something. *** AND THE FACTORISATION'S COST IS A NUMBER: *** exactly 0% on a constant environment (an " +
                 "identity, since the two integrals coincide when L is constant over the lobe), 2.1-4.6% on a gradient, " +
                 "13.8-32.8% on a small bright light, growing with both lobe width and contrast as a covariance does. " +
                 "Energy: a LUT baked at 256 samples reads A+B = 1.00016 -- ABOVE ONE -- and at 16,384 reads 0.99889; " +
                 "the excess shrinks with samples so it is noise and not bias, but an unclamped renderer would return " +
                 "more light than it received from a table that looks fine. Sabotages A-E all exit 1. *** E'S LOG ENTRY " +
                 "WAS WRITTEN BEFORE IT WAS RUN AND WAS WRONG: *** it claimed a second sample set would make the uniform " +
                 "case read ~2%, and it does not -- a constant returns 1 whichever directions you sample. What a second " +
                 "sample set actually destroys is the MONOTONICITY (spot 13.8 -> 32.8% shared, 15.9 -> 9.8% inverted), " +
                 "which is why the row asserts an ordering rather than a value.",
    }),
    since197: Object.freeze({
        at: "v4537", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "physics/mesh/uvLscm-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green, 1.34 s. The curved half of UV unwrapping, graded on GPU_Assets/RobotExpressive.glb -- the asset " +
                 "tools/export/reskin.js has long recorded as having no TEXCOORD_0 and no texture at all. physics/mesh/" +
                 "uvLscm.mjs welds, segments into disk charts by normal deviation, flattens each with least-squares " +
                 "conformal maps (Levy et al. 2002) and packs them: 3,234 of 3,234 triangles across 735 charts, 0 flipped, " +
                 "0 UVs outside [0,1], 0 of 269,745 chart pairs overlapping, worst conformal 1.18, in 100 ms. " +
                 "*** MEASURING THE ASSET FIRST IS WHAT SHAPED THE ROUND: three quarters of its shipped vertex buffer is " +
                 "duplication (7,214 -> 1,759 vertices across 19 primitives, valence 1.35 -> 5.52), and 71% of the welded " +
                 "mesh is CLOSED surface -- so LSCM without the weld would flatten every triangle alone and report a " +
                 "perfect map that means nothing, and 'unwrap the disks, report the rest' would have left most of the robot " +
                 "untextured. *** TWO NUMBERS CARRY THE GATE AND THEIR DIFFERENCE IS A THEOREM: conformal distortion " +
                 "reaches 1 at MACHINE PRECISION (4.7e-14) on a cylinder and a cone, because a developable surface really " +
                 "unrolls; on a sphere cap it stays near 1 while AREA distortion grows 1.15 -> 1.90 -> 4.61 as the cap " +
                 "widens, which is Gauss's Theorema Egregium rather than a defect, and a gate measuring only the first " +
                 "would call a sphere perfectly unwrapped. Sabotages A-G all exit 1. *** THREE WENT 0 RED FIRST AND NONE " +
                 "WAS THE GATE BEING RIGHT: *** two had no fixture that could see them (the disk guard's failure needs an " +
                 "annulus, which the robot has none of; the fixed 400-iteration budget's failure needs thousands of " +
                 "triangles, and the largest fixture was 741), and the third was the INSTRUMENT -- counting FAIL lines " +
                 "scores a module broken enough to THROW as zero, the same shape as reading $? after a command " +
                 "substitution has reset it. Both fixtures were added and the grading moved to exit codes.",
    }),

});

export function coversRegressions(sweptGates, knownRedGates) {
    const known = new Set(knownRedGates);
    const eligible = sweptGates.filter((g) => !known.has(g));
    return {
        covers: eligible.length > 0,
        eligible: eligible.length,
        swept: sweptGates.length,
        reason: eligible.length
            ? "ran " + eligible.length + " gate(s) that were not already red, so a regression could have been seen"
            : "every gate run was already red; a regression could not have been seen, so the answer is unmeasurable",
    };
}

/** Gates green in the baseline and red now. Only meaningful when coversRegressions().covers is true. */
export function regressionsAgainst(baselineRed, confirmedRed) {
    const was = new Set(baselineRed);
    return confirmedRed.filter((g) => !was.has(g)).sort();
}

/** Gates red in the baseline and green now -- the direction that rots a register into fiction. */
export function repairsAgainst(baselineRed, confirmedRed) {
    const now = new Set(confirmedRed);
    return baselineRed.filter((g) => !now.has(g)).sort();
}

/** Every runnable gate file in the tree, sorted, so two boxes sweep the same population in the same order. */
export function enumerateGates(root = ENG) {
    const out = [];
    const skip = new Set(["node_modules", ".git", ".claude", "vendor"]);
    (function walk(dir) {
        let ents;
        try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const e of ents.sort((a, b) => a.name.localeCompare(b.name))) {
            if (e.name.startsWith(".") && e.name !== ".claude") continue;
            const full = path.join(dir, e.name);
            if (e.isDirectory()) { if (!skip.has(e.name)) walk(full); }
            // *** v4409 -- A FIXTURE IS NOT A GATE, AND THE SWEEP HAS BEEN RUNNING FOUR OF THEM. ***
            // Four gates plant a transient `*-selfcheck.mjs` on disk while they run and delete it after:
            // rigProgress's __rigprogress-fixture, gateActivity's __routeProbe, and gateMutation's
            // __mutation-decoy and __mutation-crash. This walk had no notion of "transient", so an
            // enumeration that overlapped one of those runs returned it AS A GATE and the sweep ran it --
            // and a fixture built to exit 1 (rigProgress's is) then reports as a NEW RED outside every
            // register. MEASURED: with rigProgress-selfcheck running, enumerateGates returned 1442 rather
            // than 1441, the extra entry being tools/ship/__rigprogress-fixture-selfcheck.mjs. It is a
            // race, so it fails a ship at random and never reproduces alone, which is the worst shape a
            // ship-time check can have. gateActivity's own comment already states the rule -- "a gate that
            // leaves a gate behind would grow the population it measures" -- and no caller needs a fixture
            // to be DISCOVERED: gateActivity passes its own path in explicitly.
            else if (e.name.endsWith("-selfcheck.mjs") && !e.name.startsWith("__")) out.push(path.relative(root, full));
        }
    })(root);
    return out.sort();
}

/** One gate, once, with the wall time -- the same shape phase 1 and phase 2 both record. */
export function runOnce(rel, { timeoutMs = 180000, root = ENG } = {}) {
    const t0 = Date.now();
    try {
        execFileSync(process.execPath, [rel], { cwd: root, timeout: timeoutMs, stdio: "ignore" });
        return { code: 0, ms: Date.now() - t0, timedOut: false };
    } catch (e) {
        const ms = Date.now() - t0;
        const timedOut = e.killed === true || e.signal === "SIGTERM" || ms >= timeoutMs;
        return { code: e.status == null ? null : e.status, ms, timedOut };
    }
}

/** Parse the `<code>\t<ms>\t<gate>` lines a phase-1 run appends, so the record can be rebuilt from the log. */
export function parseSweepTsv(text, { timeoutMs = 180000 } = {}) {
    const rows = [];
    for (const line of text.split("\n")) {
        if (!line.trim()) continue;
        const [code, ms, ...rest] = line.split("\t");
        const gate = rest.join("\t").trim();
        if (!gate) continue;
        const n = Number(ms);
        rows.push({ gate, code: Number(code), ms: n, timedOut: Number(code) === 124 || n >= timeoutMs });
    }
    return rows;
}


// ---------------------------------------------------------------------------------------------------------
// THE v4297 SWEEP, FROZEN. This is the record redCensus.METHOD's prose could not be: every number below was
// produced by finalize() over the two phase logs, and gateSweep-selfcheck.mjs section 7 re-derives the
// arithmetic and refuses if the parts stop summing to the whole. The question v4296 recorded as UNKNOWN --
// has any gate green at v4279 since gone red -- is answered here, and the answer is SIX.
//
// Read it as three moments, not one number. 37 were red at v4279 and are still red. 5 were in the v4279
// slow bucket, never run serially then, and are red now that they have been given 300 s alone. 6 were GREEN
// at v4279 and are red now: those are the regressions, and they are the only entries a fix should be aimed
// at first, because each one is a thing that WORKED and was broken by a round that shipped ALL GREEN.
// ---------------------------------------------------------------------------------------------------------
/**
 * v4303: every regression SWEEP_V4297 named is green again, and this says which round did what. Kept as data
 * beside the record it answers, so "next: the six regressions, cheapest first" has a closing line. Three were
 * repaired by rounds that never said so (a repair that is not recorded is the register rotting in the good
 * direction, v4279's failure mode); the other three were repaired by the round that wrote this.
 */
export const REGRESSIONS_REPAIRED = Object.freeze({
    at: "v4303",
    gates: Object.freeze({
        "tools/ship/backendParity-selfcheck.mjs": "green by v4300 (v4299 rewrote the WGSL/GLSL marker set it counts); unrecorded until v4303",
        "tools/ship/copiedOutsideVendor-selfcheck.mjs": "v4301: the permission-notice census excludes quoters by name and lets a registered copy carry its notice in-file",
        "tools/ship/gateQuality-selfcheck.mjs": "green by v4300; unrecorded until v4303",
        "tools/ship/postChain-selfcheck.mjs": "v4303: the SSAO draw line is derived from the on/off diff and confirmed in bloomPass.js's source, never typed (750 until v4288, 754 since)",
        "tools/ship/staleness-selfcheck.mjs": "green by v4300 once the derived files were regenerated; red mid-round by design",
        "tools/ship/windowsImport-selfcheck.mjs": "v4303: roughDiffuseWired-selfcheck imports its scratch module by pathToFileURL, not a raw path",
    }),
});

export const SWEEP_V4297 = Object.freeze({
    at: "v4297",
    baseline: "v4279",
    swept: 1366,
    // v4303: the tree's size WHEN THE SWEEP RAN. gateSweep-selfcheck compared `swept` with enumerateGates() - 1
    // live, which was true for exactly one round; v4298 added a gate and the check went red for five rounds --
    // my own regression, in the gate written to catch regressions. A frozen record compares against a frozen
    // count; the live tree is only asserted to have grown.
    enumeratedAt: 1367,
    candidates: 107,
    parallelTimeouts: 56,
    confirmedRed: 48,
    falseReds: 38,
    unmeasuredCount: 21,
    green: 1297,
    // confirmedRed splits three ways, and the split must reconcile: stillRed + fromSlowBucket + regressions.
    stillRed: 37,
    repaired: Object.freeze([]),        // of the 37 in RED_AT_V4279, none has been fixed. Eighteen rounds.
    fromSlowBucket: Object.freeze([
        "tools/roundhouse/detectionMap-selfcheck.mjs",
        "tools/roundhouse/sensitivity-selfcheck.mjs",
        "tools/ship/doorKinds-selfcheck.mjs",
        "tools/ship/graveyard-selfcheck.mjs",
        "tools/ship/orphanDisposition-selfcheck.mjs",
    ]),
    regressions: Object.freeze([
        "tools/ship/backendParity-selfcheck.mjs",
        "tools/ship/copiedOutsideVendor-selfcheck.mjs",
        "tools/ship/gateQuality-selfcheck.mjs",
        "tools/ship/postChain-selfcheck.mjs",
        "tools/ship/staleness-selfcheck.mjs",
        "tools/ship/windowsImport-selfcheck.mjs",
    ]),
    // Ran alone for 300 s and still did not finish. NOT red, NOT green, and never to be folded into either:
    // a gate that cannot be measured on this box is a cost problem, not a correctness verdict.
    unmeasured: Object.freeze([
        "physics/sph/levelClaim-selfcheck.mjs",
        "physics/sph/packingTransfer-selfcheck.mjs",
        "physics/sph/stability-selfcheck.mjs",
        "tools/roundhouse/assumptionMap-selfcheck.mjs",
        "tools/roundhouse/census-selfcheck.mjs",
        "tools/roundhouse/claimTrace-selfcheck.mjs",
        "tools/roundhouse/corroborationCensus-selfcheck.mjs",
        "tools/roundhouse/khConvergence-selfcheck.mjs",
        "tools/roundhouse/khGrowthKey-selfcheck.mjs",
        "tools/roundhouse/khMichalke-selfcheck.mjs",
        "tools/roundhouse/knobLiveness-selfcheck.mjs",
        "tools/roundhouse/labResults-selfcheck.mjs",
        "tools/roundhouse/libmSensitivity-selfcheck.mjs",
        "tools/roundhouse/plantDirection-selfcheck.mjs",
        "tools/roundhouse/plantedCoverage-selfcheck.mjs",
        "tools/roundhouse/responseCensus-selfcheck.mjs",
        "tools/roundhouse/twoFBind-selfcheck.mjs",
        "tools/roundhouse/valueMatch-selfcheck.mjs",
        "tools/ship/orphanTriage-selfcheck.mjs",
        "tools/ship/shaderRefs-selfcheck.mjs",
        "tools/ship/toolFrontDoor-selfcheck.mjs",
    ]),
    // Went red under -P 8 and green alone. 38 of 107 candidates -- more than a third of what phase 1 called
    // red was starvation. This is the figure that makes phase 2 non-optional.
    falseRedList: Object.freeze([
        { gate: "ev/esFleetSize-selfcheck.mjs", parallelMs: 16391, serialMs: 11236 },
        { gate: "physics/astroparticle/jeans-selfcheck.mjs", parallelMs: 180031, serialMs: 105348 },
        { gate: "physics/mesh/weightScaling-selfcheck.mjs", parallelMs: 180116, serialMs: 84426 },
        { gate: "physics/nuclear/reactorControl-selfcheck.mjs", parallelMs: 180036, serialMs: 107964 },
        { gate: "physics/sph/materialKnobs-selfcheck.mjs", parallelMs: 180044, serialMs: 218702 },
        { gate: "physics/sph/poolFixture-selfcheck.mjs", parallelMs: 180031, serialMs: 149013 },
        { gate: "physics/sph/tiltPower-selfcheck.mjs", parallelMs: 180633, serialMs: 89205 },
        { gate: "physics/sph/wideTilt-selfcheck.mjs", parallelMs: 180098, serialMs: 86278 },
        { gate: "simulation/carrySpawn-selfcheck.mjs", parallelMs: 18300, serialMs: 17638 },
        { gate: "physics/thermal/stefan-selfcheck.mjs", parallelMs: 180055, serialMs: 200460 },
        { gate: "physics/tomography/matchedAdjoint-selfcheck.mjs", parallelMs: 180052, serialMs: 52023 },
        { gate: "rig/cinematicShot-selfcheck.mjs", parallelMs: 163718, serialMs: 78456 },
        { gate: "simulation/lbm/inflow-selfcheck.mjs", parallelMs: 180024, serialMs: 114343 },
        { gate: "simulation/lbm/onsetTrend-selfcheck.mjs", parallelMs: 180046, serialMs: 59738 },
        { gate: "simulation/lbm/settleCurve-selfcheck.mjs", parallelMs: 180032, serialMs: 133885 },
        { gate: "tools/render-qa/terminatorOracle-selfcheck.mjs", parallelMs: 180043, serialMs: 102484 },
        { gate: "tools/roundhouse/compose-selfcheck.mjs", parallelMs: 180072, serialMs: 143967 },
        { gate: "tools/roundhouse/flip3dBind-selfcheck.mjs", parallelMs: 180046, serialMs: 84944 },
        { gate: "tools/roundhouse/hydrostatic-selfcheck.mjs", parallelMs: 180038, serialMs: 161659 },
        { gate: "tools/roundhouse/labExport-selfcheck.mjs", parallelMs: 180036, serialMs: 122891 },
        { gate: "tools/roundhouse/menuScope-selfcheck.mjs", parallelMs: 180039, serialMs: 110685 },
        { gate: "tools/roundhouse/observableUnits-selfcheck.mjs", parallelMs: 180060, serialMs: 221029 },
        { gate: "tools/roundhouse/opticsBind-selfcheck.mjs", parallelMs: 180027, serialMs: 120053 },
        { gate: "tools/roundhouse/pipeFlowKey-selfcheck.mjs", parallelMs: 180032, serialMs: 95323 },
        { gate: "tools/roundhouse/rayleighOnset-selfcheck.mjs", parallelMs: 180041, serialMs: 127852 },
        { gate: "tools/roundhouse/stabilityBind-selfcheck.mjs", parallelMs: 180031, serialMs: 86996 },
        { gate: "tools/roundhouse/twoF-selfcheck.mjs", parallelMs: 180032, serialMs: 180429 },
        { gate: "tools/ship/crtToggle-selfcheck.mjs", parallelMs: 5204, serialMs: 3174 },
        { gate: "tools/ship/ddaPrecisionReport-selfcheck.mjs", parallelMs: 180559, serialMs: 121123 },
        { gate: "tools/ship/deterministicRaf-selfcheck.mjs", parallelMs: 180288, serialMs: 71825 },
        { gate: "tools/ship/domScope-selfcheck.mjs", parallelMs: 180246, serialMs: 143947 },
        { gate: "tools/ship/driveEnv-selfcheck.mjs", parallelMs: 180030, serialMs: 78274 },
        { gate: "tools/ship/loopTarget-selfcheck.mjs", parallelMs: 51680, serialMs: 26830 },
        { gate: "tools/ship/labDevices-selfcheck.mjs", parallelMs: 180064, serialMs: 213217 },
        { gate: "tools/ship/loopSearch-selfcheck.mjs", parallelMs: 180060, serialMs: 107415 },
        { gate: "tools/ship/spellBook-selfcheck.mjs", parallelMs: 1012, serialMs: 332 },
        { gate: "tools/ship/splatSort-selfcheck.mjs", parallelMs: 5310, serialMs: 1656 },
        { gate: "tools/ship/redCensus-selfcheck.mjs", parallelMs: 180104, serialMs: 163172 },
    ]),
    cover: Object.freeze({ covers: true, eligible: 1329, swept: 1366 }),
});
// ---------------------------------------------------------------------------------------------------------
// CLI -- so phase 2 is a command rather than a thing somebody remembers to do.
//
//   node tools/ship/gateSweep.mjs --phase2 <phase1.tsv> [--out <phase2.tsv>] [--timeout 300000]
//
// Reads the phase-1 log, re-runs EVERY candidate one at a time, and appends `<code>\t<ms>\t<gate>` as each
// lands so progress is visible and a killed run loses nothing. It prints the finalize() verdict, or the
// refusal, which is the only thing that makes the number real.
// ---------------------------------------------------------------------------------------------------------
if (process.argv[1] && import.meta.url === new URL("file://" + path.resolve(process.argv[1])).href) {
    const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
    const p1 = arg("--phase2");
    if (!p1) { console.log("usage: node tools/ship/gateSweep.mjs --phase2 <phase1.tsv> [--out f] [--timeout ms]"); process.exit(2); }
    const timeoutMs = Number(arg("--timeout", 300000));
    const out = arg("--out", p1.replace(/\.tsv$/, "") + ".phase2.tsv");
    const par = parseSweepTsv(fs.readFileSync(p1, "utf8"));
    // Cheapest first, by the phase-1 runtime. Deterministic (ties broken by name), and it means a phase 2
    // that is killed part-way has resolved the MOST candidates it could have, rather than an arbitrary set.
    const cands = par.filter((r) => classify(r).verdict !== VERDICT.GREEN)
                     .sort((a, b) => a.ms - b.ms || a.gate.localeCompare(b.gate));
    const already = fs.existsSync(out) ? new Set(parseSweepTsv(fs.readFileSync(out, "utf8")).map((r) => r.gate)) : new Set();
    console.log(`phase 1: ${par.length} gates, ${cands.length} candidate(s); phase 2 budget ${timeoutMs} ms each`);
    const serial = new Map(fs.existsSync(out) ? parseSweepTsv(fs.readFileSync(out, "utf8")).map((r) => [r.gate, r]) : []);
    for (const c of cands) {
        if (already.has(c.gate)) continue;
        const r = runOnce(c.gate, { timeoutMs });
        const rr = { ...r, timedOut: r.timedOut || r.ms >= timeoutMs };
        serial.set(c.gate, rr);
        fs.appendFileSync(out, `${rr.code == null ? 124 : rr.code}\t${rr.ms}\t${c.gate}\n`);
        console.log(`  ${rr.code === 0 ? "GREEN (false red)" : rr.timedOut ? "TIMEOUT" : "RED  "}  ${rr.ms} ms  ${c.gate}`);
    }
    const rows = par.map((r) => ({ gate: r.gate, parallel: r, serial: serial.get(r.gate) || null }));
    try {
        const f = finalize(rows);
        console.log(`\nCONFIRMED RED ${f.red.length}   FALSE REDS ${f.falseReds.length}   ` +
                    `UNMEASURED ${f.unmeasured.length}   GREEN ${f.green.length}`);
        for (const r of f.red) console.log("  RED    " + r.gate);
        for (const r of f.falseReds) console.log("  FALSE  " + r.gate);
        for (const r of f.unmeasured) console.log("  UNMEAS " + r.gate + "   ran alone and still did not finish");
    } catch (e) { console.log("\n" + e.message); process.exit(1); }
}
