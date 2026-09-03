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
