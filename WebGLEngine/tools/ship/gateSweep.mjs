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
    // *** v4476 MERGE -- RENUMBERED A THIRD TIME, since78-110 -> since80-112. *** main took since78 and
    // since79 for v4457 and v4460 while this branch was using them, which is the same collision the first
    // pass hit at since40 and the second at since73. THREE TIMES IN ONE ARC IS NOT BAD LUCK, IT IS THE
    // SHAPE: the ordinal is picked by hand, two branches shipping in parallel both reach for the next free
    // one, and Object.freeze sees one key where the reader sees two. main's v4456 wrote down the same
    // hazard from its own side -- "the sweep ledger counts gates and never names them, so a duplicate
    // closing is a credit" -- and gateSweep-selfcheck's duplicate-ordinal check is what catches it each time.

    // *** v4470 MERGE, SECOND PASS -- RENUMBERED AGAIN, since73-100 -> since78-105. *** main took since73-77 for
    // its own rounds in the eleven commits after the first pass, and one of them is v4456: "the sweep ledger
    // counts gates and never names them, so a duplicate closing is a credit". BOTH BRANCHES HIT THIS HAZARD IN
    // THE SAME WEEK AND BOTH WROTE IT DOWN -- this side found it by the arithmetic reporting 25 unswept gates,
    // main found it by reading the ledger. That is the third convergent discovery this merge has turned up.

    // *** v4470 MERGE -- RENUMBERED since40-42 -> since73-75, WHICH IS THE HAZARD THIS OBJECT ALREADY KNEW ABOUT.
    // *** Both branches appended closings in the same weeks and both reached since40, 41 and 42: main's are
    // v4414-v4416 and this branch's are v4424, v4425 and v4470. The since15 comment above records the last time
    // that happened -- "the merge left TWO since10 keys in one object literal, where the later silently
    // overwrites the earlier, so v4366's closing would have vanished with no error anywhere". A duplicate key
    // is not a syntax error and the derived closings list in gateSweep-selfcheck.mjs reads keys, so nothing
    // would have said a word. Caught by reading the merged file, again.
    since80: Object.freeze({
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
    since81: Object.freeze({
        at: "v4425", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/budgetExile-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly, five sections and 23 checks. It runs ONE cheap real gate as a " +
                 "fixture, through the actual runQuickSweep, to demonstrate the absorbing state in both " +
                 "directions rather than read it off the source. Driven RED by ten sabotages and restored, " +
                 "with NO 0 REDS. The round it gates re-timed all 378 finished exiles and found TEN reds on " +
                 "no register, every one recorded as passing; four were this session's and are repaired",
    }),
    since82: Object.freeze({
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

    // *** v4470 MERGE -- TWENTY-FIVE MORE OF THIS BRANCH'S CLOSINGS, CARRIED FORWARD AND RENUMBERED. ***
    // Taking main's gateSweep.mjs wholesale (its derived closings list is the better machinery) dropped this
    // branch's since15-since39, which are DIFFERENT ROUNDS from main's keys of the same name. Nothing said so:
    // the file still parsed, the list still derived, and the only thing that noticed was the arithmetic --
    // "1505 in the tree = ... 25 STILL UNSWEPT". THAT ROW IS THE WHOLE REASON THIS OBJECT COUNTS RATHER THAN
    // LISTS, and it earned its keep on the third merge in a row that hit this same collision.
    since83: Object.freeze({
        at: "v4400", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/carveGpu-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly, three sections and 13 checks in 18.8 s. Driven RED by four " +
                 "sabotages (2/3/4/4 by name) and restored; two of them differ by a factor of eight in voxels " +
                 "and the SMALLER one is the worse, because it breaks the containment bound the larger leaves " +
                 "intact. Sections 1 and 2 need no device and stay green where WebGPU is unavailable",
    }),
    // v4401 -- the FIFTEENTH closing. Its round began as a four-section gate and shipped as a two-section one,
    // because main's v4372 landed mid-build and had already done three of them, better; what survived is the one
    // parameter that round did not vary. It has been numbered three times -- since13 in a draft that went into a
    // dropped stash, then since13, then since15, and since16 here once main's own since13 landed. The number is
    // bookkeeping and moves freely; the `at` is the round and does not.
    since84: Object.freeze({
        at: "v4401", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/carveJudged-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly, four sections and 10 checks in 22 s. Driven RED by three " +
                 "sabotages (3/3/1 by name) and restored -- and the 1-red one is the thesis rather than a weak " +
                 "check: making the hulls worse does not move a verdict that depends on the grid",
    }),
    // v4402 -- the SIXTEENTH closing, for the arc's first PURE-INTEGER transplant. Its round also widened
    // render/tslSource.mjs's uniform vocabulary (ivec/uvec), which every earlier closing's gate runs through, so
    // tslPhysics, tslRace, tslRig and carveGpu were re-run to completion beside this one rather than left to the
    // quick sweep's cap -- machinery that changed is what a 3 s cap cannot vouch for.
    since85: Object.freeze({
        at: "v4402", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/tslIsing-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly, four sections and 8 checks in 0.9 s -- fast because node-webgpu " +
                 "serves it in-process rather than through a browser. Driven RED by three sabotages (4/3/3 by " +
                 "name) and restored; the first is the round's own argument, a completely wrong RNG that moves " +
                 "13% of the spins and leaves the physics looking healthy",
    }),
    // v4403 -- the SEVENTEENTH closing, and the first for a module the triage had written off. Its round moved
    // simulation/euler/eulerShader.js from HARDWARE to GATEABLE by running it, so tools/ship/coverageTriage.mjs
    // changed too and coverageTriage-selfcheck was run beside this one.
    since86: Object.freeze({
        at: "v4403", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/eulerGpu-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly, four sections and 8 checks in 20 s. Driven RED by three " +
                 "sabotages (1/2/1 by name) and restored; the FIRST is the round's argument -- a broken HLLC " +
                 "wave speed that the page's own 2% tolerance would have passed on both of its rows",
    }),
    // v4404 -- the EIGHTEENTH closing, and the second in two rounds for a kernel the tree had never run. This one
    // did not merely go ungated: it did not COMPILE. Its round also changed gfx/device.js (multi-entry-point
    // binding sets), so every gate that builds a compute pipeline -- tslPhysics, tslRace, tslRig, tslIsing,
    // carveGpu, eulerGpu and the four device* gates -- was run to completion beside this one.
    since87: Object.freeze({
        at: "v4404", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/lbmGpu-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly, four sections and 8 checks in 7.8 s. Driven RED by three " +
                 "sabotages (2/3/1 by name) and restored; the first is a RE-ENACTMENT of the state the shader " +
                 "actually shipped in, since `macro` is a WGSL reserved keyword and the module never compiled",
    }),
    // v4404 -- the NINETEENTH closing, and it is in the same round as the eighteenth because the round produced
    // two gates: one for a kernel that never compiled, and one for the merge hazard that shipped a conflicted
    // file into a commit WHILE that kernel was being fixed.
    since88: Object.freeze({
        at: "v4404", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/conflictMarkers-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly, two sections and 6 checks, scanning 5,427 tracked text files. " +
                 "Driven RED by two sabotages (1/2 by name) and restored -- and the first attempt at the first " +
                 "one went 0 red because the sabotage itself was wrong, which is logged in the gate",
    }),
    // v4405 -- the TWENTIETH closing, and the fourth round running for a kernel nothing had ever given a device.
    // This one also corrected a CONSTANT that two gates agreed on because both computed it the same wrong way,
    // so tools/roundhouse's magmap family (magmap, magmapAndroid, magmapVariants, magmapDefault, magmapEvidence,
    // magmapFastPath, magmapBenchVerdict, magmapTaichi, androidPeer, iosPeer, fmaAssumption) was run to
    // completion beside it -- eleven gates read F32_FLOOR.
    since89: Object.freeze({
        at: "v4405", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/roundhouse/magmapDevice-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly, two sections and 9 checks in 1.2 s. Driven RED by three " +
                 "sabotages (2/3/1 by name, and the first also reddens magmap-selfcheck) and restored; the first " +
                 "is the constant the tree actually shipped, which now costs a red in two gates instead of none",
    }),
    // v4406 -- the TWENTY-FIRST closing, and the fifth round running for a kernel nothing had ever given a
    // device. This one found the CHECK PAGE itself broken, so mpm-gpu-check.html changed too and the MPM family
    // (gpuKernel, gpuKernelInterp and the step/transfer/plasticity gates behind them) was run beside it.
    since90: Object.freeze({
        at: "v4406", swept: 1, green: 1, red: 0,
        added: Object.freeze(["physics/mpm/mpmDevice-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly, three sections and 10 checks in 0.8 s. Driven RED by three " +
                 "sabotages (1/3/3 by name) and restored; the first is the state the tree shipped in, and the " +
                 "third leaves the determinism row GREEN while destroying the scatter, which is that row's " +
                 "declared limit arriving as a measurement",
    }),
    // v4407 -- the TWENTY-SECOND closing, and the first in six rounds that did NOT find a kernel broken: this
    // one is graded against six analytic constants rather than against another renderer, so there was no
    // comparison to be wrong about. Its round touched no shipped module, only added two files.
    since91: Object.freeze({
        at: "v4407", swept: 1, green: 1, red: 0,
        added: Object.freeze(["physics/render/furnaceWgsl-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly, three sections and 8 checks in 6.3 s. Driven RED by three " +
                 "sabotages (2/3/2 by name) and restored -- and a FOURTH went 0 red, which the gate keeps as a " +
                 "property: the furnace key is azimuthally blind, so no tangent frame can move it",
    }),

    // v4408 -- the twenty-third closing, and the first gate whose WGSL is GENERATED from a shipped GLSL file
    // rather than written beside it. It scores v3494's Math.fround prediction on a device (right, to four
    // figures), finds where a fround model cannot follow (WGSL bounds sin and cos by 2^-11 ABSOLUTE, and the
    // NDF identity then reads 0.837 at roughness 0.02), and pins the cause by handing the same kernel the
    // host's trig. Two of its six sabotages went 0 red and earned a section that MEASURES the two guards this
    // quadrature never reaches, rather than letting dead branches look covered.
    since92: Object.freeze({
        at: "v4408", swept: 1, green: 1, red: 0,
        added: Object.freeze(["physics/render/microfacetWgsl-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly, six sections and 26 checks in 1.4 s -- inside the quick sweep's " +
                 "3 s budget, which no other device gate in this arc is. Driven RED by four sabotages " +
                 "(19/4/3/6 by name) and restored; two more went 0 red and are recorded as unreachable branches " +
                 "with the clearance measured, five and six orders",
    }),

    // v4409 -- the twenty-fourth closing, and the first gate in this arc whose kernel COMPOSES another gate's
    // shader instead of translating or copying one. It ports microfacet.mjs's sampling half, holds it to three
    // analytic keys (an algebraic identity with no statistics, the zero-variance mirror limit, and a measured
    // blindness to D), and finds that v4408's quadrature is 49% wrong at the roughness where this estimator is
    // exact -- so the two rounds together say which instrument to believe where.
    since93: Object.freeze({
        at: "v4409", swept: 1, green: 1, red: 0,
        added: Object.freeze(["physics/render/microfacetSampleWgsl-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly, seven sections and 28 checks in 2.1 s -- inside the quick " +
                 "sweep's 3 s budget, as v4408 is. Driven RED by five sabotages (6/5/2/3 by name, one of them " +
                 "caught by a single key and by nothing else) and restored; a sixth went 0 red and earned a " +
                 "section proving the blindness is the FIXTURE's and measuring what would move it",
    }),

    // v4410 -- the twenty-fifth closing, for the sampler a modern tracer actually uses. It is the first gate in
    // this arc to carry a capability the tree did not have rather than to port one it did, and it repays two
    // earlier rounds: it reaches the frame error v4409's section 7 proved that fixture could not see, and it
    // finds that v4409's stratified sample pattern -- chosen to keep an unportable RNG out of the comparison --
    // does not converge for a sampler that maps its two numbers onto a disk.
    since94: Object.freeze({
        at: "v4410", swept: 1, green: 1, red: 0,
        added: Object.freeze(["physics/render/microfacetVndf-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly, seven sections and 30 checks in 3.7 s. Driven RED by five " +
                 "sabotages (8/5/1/4/1 by name) and restored; none went 0 red, and the 4 went 2 RED FIRST and " +
                 "widened the gate -- the shipped CPU sampler had been resting on one section, which the " +
                 "sabotage is what found",
    }),

    // v4411 -- the twenty-sixth closing, and the first in this arc whose subject is a gate that was already
    // green. energyCompensation-selfcheck.mjs has closed E + INT f_ms cos dw = 1 since v3492 and could not see
    // that the E it was handed was 85% wrong, because the closure is algebra in whatever table it gets. This
    // gate reads the TABLE against something external, ports the lobe, and finds the device's whole f32
    // residual is its sin and cos -- the third round in a row to land there.
    since95: Object.freeze({
        at: "v4411", swept: 1, green: 1, red: 0,
        added: Object.freeze(["physics/render/energyCompWgsl-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly, five sections and 19 checks in 6.8 s. Driven RED by five " +
                 "sabotages (6/4/1/6/2 by name) and restored -- and the 6 went 1 RED FIRST, which built the " +
                 "check that now catches it: a real integral moves when its grid is refined and a closed form " +
                 "does not. energyCompensation-selfcheck.mjs's section 2 was rewritten in the same round, " +
                 "because its second-order measurement turned out to be its instrument's",
    }),

    // v4412 -- the twenty-seventh closing, and the one that closes v4409's section 7. That round proved its
    // fixture could not see a tangent-frame error at all and called handedness untested rather than harmless;
    // anisotropy makes the frame a physical parameter, so the same class of error is now visible. It also
    // carries a key with no isotropic counterpart -- the swap identity, bit-exact at f32 -- and that
    // exactness was earned by the gate going red on its own first draft.
    since96: Object.freeze({
        at: "v4412", swept: 1, green: 1, red: 0,
        added: Object.freeze(["physics/render/microfacetAnisoWgsl-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly, six sections and 16 checks in 2.6 s. Driven RED by six " +
                 "sabotages (1/1/1/1/3/1 by name) and restored -- and FOUR GOING ONE RED IS A PARTITION, not a " +
                 "thin gate, which the 3 demonstrates. Its own first draft overclaimed exactness FOUR TIMES " +
                 "and each correction is recorded where the claim is",
    }),

    // v4413 -- the twenty-eighth closing. It uses the balance-heuristic weights v4409 computed and left idle,
    // and its most useful result came from a sabotage that went 0 red: MIS is unbiased for ANY partition of
    // unity, so a wrong pdf inside the heuristic cannot move the mean and every mean-based check is blind to
    // it by construction. The gate now compares the two routes to the pdf directly, on the device as well as
    // on the CPU, because the WGSL is a separate transcription.
    since97: Object.freeze({
        at: "v4413", swept: 1, green: 1, red: 0,
        added: Object.freeze(["physics/render/misWgsl-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly, five sections and 15 checks in 4.1 s. Driven RED by four " +
                 "sabotages (3/1/2/4 by name) and restored -- and the 1 WENT 0 RED FIRST, which bought the " +
                 "device pdf check. Three of its thresholds were set from measurement after a first draft " +
                 "overshot, including one where a strategy returns exactly zero rather than a finite variance",
    }),

    // v4414 -- the twenty-ninth closing, and the first in this arc whose subject is a DECISION rather than a
    // measurement. It settles the IR question v3274 posed and v4380 deferred, by finding that the trigger
    // counted co-occurrence where the decision needed duplication -- and that the population included the
    // emitter that would BE the IR, so building it raised the number the trigger read. A ~200-round standing
    // red is repaired by replacing the instrument, and shaderCensus leaves the register.
    since98: Object.freeze({
        at: "v4414", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/shaderPairs-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly, five sections and 13 checks in 0.5 s -- the cheapest gate this " +
                 "arc has added. Driven RED by five sabotages (1/1/1/1/1 by name) and restored, and TWO WENT " +
                 "0 RED FIRST: a check comparing a list against its own length, and a fixture whose planted " +
                 "leak collided with a name already present. Both were this gate's defects, not properties",
    }),

    // v4415 -- the thirtieth closing, and the last two CANDIDATE keys on the coverage triage. One was real and
    // the module's own header named a sharper version of it; the other was already gated, and the key the
    // triage imagined is structurally unavailable because that coupling is deliberately one-way. Both entries
    // are corrected rather than left standing, which is the point of a list somebody reads.
    since99: Object.freeze({
        at: "v4415", swept: 1, green: 1, red: 0,
        added: Object.freeze(["physics/voxel/fracture-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly, five sections and 14 checks in 0.08 s -- cheaper than v4414's, " +
                 "and no device. Driven RED by five sabotages (2/2/1/3/3 by name) and restored; the 1 went 0 " +
                 "RED FIRST because every fixture was a box and a box's products of inertia are zero, so an " +
                 "L was added with an independent two-box reference. Its FIXTURE also had to be built twice: " +
                 "the sphere carves it started with never detached anything",
    }),

    // v4416 -- the thirty-first closing, and the one that closes the F = 1 six rounds of this arc named as
    // unchecked. Its headline is a COLLISION rather than a discrepancy: a model failure and correct physics
    // made to return the same furnace number bit for bit, so that the thing which separates them has to be
    // found somewhere other than in a tolerance. It also corrects its own first draft, which borrowed a
    // sentence about one interface for a lobe where it does not hold -- and a 0-red sabotage now keeps that
    // correction from drifting back.
    since100: Object.freeze({
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

    // v4417 -- the thirty-second closing, and the first in this arc whose headline is a NULL. Keith asked what
    // would happen if the AI scene composer made a scene and the learned painter painted it; the round found
    // that the painter's shape budget cannot see the composition's declared prop count at all, and proved the
    // null with a control rather than reporting an absence of signal. It also found that the painter's target
    // has always been inside its own model class, and that this turns out not to be what governs it.
    since101: Object.freeze({
        at: "v4417", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/paintFloor-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly, seven sections and 18 checks in 3.1 s -- no device, no model, " +
                 "no network. Driven RED by eight sabotages (6/1/5/1/4/1/2/2 by name) and restored, and TWO " +
                 "WENT 0 RED FIRST: a boundary convention that five seeds of bit-identity could not reach at " +
                 "any number of seeds, and an exponent check that compared three numbers to each other and " +
                 "never to zero. The round's own premise was wrong and the gate says so where the number is",
    }),

    // v4418 -- the thirty-third closing, and the one that connects two halves that were each already gated
    // and had no caller in common. The painter is 2D; Krbn's projection and back-projection are the exact,
    // settled bridge to a surface. Wiring them splits the painter's single distance into "on the object" and
    // "the empty space around it" -- a third to a half of what it reports -- and shows that telling the same
    // search which pixels are the object buys 16% to 34% at no cost.
    since102: Object.freeze({
        at: "v4418", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/krbnPaint-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly, seven sections and 14 checks in 1.7 s -- no device, no model. " +
                 "Driven RED by nine sabotages (4/4/2/1/1/1/1/1/1 by name) and restored; ONE OF THEM DRIVES A " +
                 "SECOND GATE RED TOO, which is what makes its 'a second independent caller holds this " +
                 "invariant' claim a measurement rather than a sentence. One went 0 RED FIRST: a promise of a " +
                 "CLOSED boundary that lived in a comment and nowhere else",
    }),

    // v4419 -- the thirty-fourth closing, and the first fixture in this arc that MOVES. Its strongest piece is
    // a control rather than a result: on a still target, warm-starting and refitting are the same computation
    // to the last bit, so on a moving one the whole gap between them is the motion. It also corrects v4418's
    // "a fourth generator lands in the same band" with a fifth that does not, one round later.
    since103: Object.freeze({
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

    // v4420 -- the thirty-fifth closing. v4220's "held-out pictures" were held-out SEEDS of one generator,
    // and one generator over the sign flips: seven of eight off-diagonal cells in a two-row transfer matrix
    // are BELOW uniformly random placement, the worst at -12 sd. The earlier claim is reproduced rather than
    // contradicted -- what changes is what it was ever evidence about.
    since104: Object.freeze({
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

    // v4421 -- the thirty-sixth closing, and the first ADDED PRIMITIVE since the fitter was built. Its fill
    // rule turned out to be a convex assumption nothing had stated; its arrival silently changed the search
    // distribution for every existing caller, which an unrelated gate caught; and the brush loses to a
    // rectangle on a picture made entirely of glyphs, with both obvious excuses ruled out by measurement.
    since105: Object.freeze({
        at: "v4421", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/polyBrush-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly, seven sections and 17 checks in 4.0 s -- no device, no model. " +
                 "Driven RED by eight sabotages (5/2/2/1/1/1/3/1 by name) and restored, and TWO WENT 0 RED " +
                 "FIRST: the half-open crossing rule, which only 4 of 651 vertices ever exercise, and a " +
                 "mutator returning garbage, which fitStep simply rejects. Its own arrival reddened " +
                 "krbnPaint-selfcheck by changing a list that was answering two questions",
    }),

    // v4422 -- the thirty-seventh closing, and the finest-grained transfer question available: the SAME
    // pictures, re-rendered. A scanline mask inverts the learned policy where a 13-pixel warp does not, and
    // the mechanism is measured -- the CRT's energy sits above the Nyquist of the policy's own 4x4
    // observation grid, so the grid goes flat. Its null control shares the code path with the real ones.
    since106: Object.freeze({
        at: "v4422", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/paintTransforms-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly, six sections and 13 checks in 12.2 s -- one training, no " +
                 "device. Driven RED by seven sabotages (3/1/5/5/6/1/1 by name) and restored, and ONE WENT " +
                 "0 RED AGAINST A COMMENT THAT NAMED IT: freezing the displacement field, which the module's " +
                 "own header calls v4420's defect one level down. Spreading the transformed generator would " +
                 "not have caught it -- the cure is one fixed picture through six transform seeds",
    }),

    // v4423 -- the thirty-eighth closing, and the one that corrects two earlier rounds with their own
    // instruments. Eleven transfer columns show v4420's "worse than random on everything else" was drawn from
    // four, and the tempting reading of v4422's mechanism as a variable that ORDERS targets does not survive
    // (r = 0.34). It also adds the first target that is not a picture: a scalar radiance field.
    since107: Object.freeze({
        at: "v4423", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/paintFields-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly, seven sections and 15 checks in 13.2 s -- one training, no " +
                 "device. Driven RED by eight sabotages (2/3/1/2/1/1/1/1 by name) and restored, with NO 0 " +
                 "REDS. Its nebula generator had to be built twice -- a flight-view parallax of 0.00035 per " +
                 "world unit made a +/-20 camera invisible -- and seedSpread caught it, the third generator " +
                 "in three rounds that check has caught",
    }),

    // v4471 -- the hundred-and-sixth closing, and it ADDS NO GATE. Three gates arrived red from a main merge,
    // two were defects and the third was a fixture that named the other two; all three are repaired rather
    // than registered. A closing with an empty `added` is honest about that: the sweep's population did not
    // move, and what changed is that three of its members tell the truth again.
    since108: Object.freeze({
        at: "v4471", swept: 0, green: 0, red: 0,
        added: Object.freeze([]),
        redOnArrival: Object.freeze([]),
        repaired: Object.freeze([
            "tools/ship/windowsImport-selfcheck.mjs (three raw-path dynamic imports converted; one of them in a file whose line 30 already did it right)",
            "tools/ship/citedSources-selfcheck.mjs (debt 51 -> 49 by RECORDING two sources main took, not by raising the baseline)",
            "tools/ship/quickSweep-selfcheck.mjs (its fixture asserted three named gates were green; it asserts AGREEMENT now)",
            "tools/ship/budgetEvidence-selfcheck.mjs (four gates with no runtime evidence, MEASURED from twelve real runs rather than admitted as non-finishing -- all twelve exit 0, so the admission the gate permits would have been a false record about four working gates)",
            "tools/ship/gateBudget-selfcheck.mjs (MEASURED_RUNS: the individual runs as data, the basis DERIVED from them, and the maximum re-derived in the check rather than borrowed from the derivation)",
            "tools/ship/shaderPairs-selfcheck.mjs (it pinned all three class sizes; main's v4383 detector fix took the population 14 -> 10 and the two decision-bearing classes did not move by one file)",
        ]),
        verdict: "green on this box, all three run singly, plus pageFxOverlay, pageRequirements and " +
                 "backendParity which the same edits touch. Seven sabotages by name, five red and TWO EARNED " +
                 "ZEROS of one shape -- replacing a computed value with the literal it currently equals. The " +
                 "repair contained the defect it was repairing TWICE, both found by sabotage: a control that " +
                 "re-implemented the comparison it controlled, and a second control that ran its own copy of " +
                 "the re-runner. One disagreementsIn() and one runVerdict(file, cwd) serve both sides now. " +
                 "The gateBudget half was sabotaged in three passes: the first found that a bare number with " +
                 "its measurement in a COMMENT survives having the measurement contradicted (1 ms for a 29 s " +
                 "gate, and fastest-of-three where the rule says slowest -- both 0 RED); the second found the " +
                 "repair's own refusal was UNREACHABLE, because slowestRun threw at module load and took the " +
                 "tree down before the check that reports a bad run could execute; the third confirmed both " +
                 "replays now go red once deriving and refusing were separated. shaderPairs took five more " +
                 "passes and every one found something: the ratio that failed on the boundary was REPLACED " +
                 "rather than widened, the GENERIC filter turned out to be unproven on tree data, the fixture " +
                 "built to prove it was generated FROM ITS OWN SUBJECT, its expectations were all alike so a " +
                 "constant satisfied them, and the literal-versus-derived claim survived only in the source. " +
                 "AND THE FIXTURE MADE THIS GATE A SHADER PAIR: written as literals its shader text put " +
                 "shaderPairs-selfcheck into backendParity's census twice over, first as dual-language and " +
                 "then as GLSL-bearing. Neither was caught here -- both by the gate next door",
    }),
    since109: Object.freeze({
        // *** swept IS 0 AND THAT IS NOT MODESTY. *** This ledger's `swept` counts gates a closing takes OUT
        // OF THE SURPLUS -- gates the tree had never run -- and the arithmetic above depends on it meaning
        // exactly that. v4472 added no gate: it RE-RAN ten that were already in the tree and already exiled,
        // which is a different fact and belongs in the verdict rather than in a column that feeds a total.
        // The first draft wrote swept: 10 and gateSweep-selfcheck caught it on `added.length === swept`.
        at: "v4472", swept: 0, green: 0, red: 0,
        added: Object.freeze([]),
        redOnArrival: Object.freeze([]),
        repaired: Object.freeze([
            "tools/ship/crossBackend-selfcheck.mjs (traceWgsl and pipelineWgsl into wgslCorpus, compile-only, on v4425's own recorded rule)",
            "tools/ship/orreryEjecta-selfcheck.mjs (a SCANNER counted as a dependant -- the fifth instance that file logs -- plus two genuine importers recorded)",
            "tools/ship/orreryFleet-selfcheck.mjs (the belt keeps HASHES now; COMMIT_BELT_V4418 was wrong on `three` the day it was written)",
            "tools/ship/meshLine-selfcheck.mjs (one assertion carrying two claims, reporting the wrong one as false)",
            "tools/ship/orreryFleetScan.mjs (lastCommits could not see a file whose latest touch was a MERGE, and called that untracked)",
            "tools/ship/budgetExile-selfcheck.mjs (the ledger derives its states by running the gates instead of reading typed prose)",
        ]),
        verdict: "No gate added, ten re-run, six repaired. THE TEN EXILED GATES WERE RUN FOR THE FIRST TIME SINCE v4425 and the debt ledger was wrong " +
                 "in both directions: one entry typed REPAIRED was red again, one typed OWED had been green " +
                 "for an unknown time, and a third stayed OWED while its debt grew from 36 of 136 to 49 of " +
                 "151 -- which a two-state field cannot express. Five of the six owed are paid; physicsReach " +
                 "and wgslSpec are named as rounds rather than patches. Sixteen sabotages, twelve red, and " +
                 "FOUR of the zeros were this round's own defects: a pinned count of 2 that its own repairs " +
                 "moved to 4, a counter reading the expectation table instead of the tree, a live re-run " +
                 "replaced by a read of the record (0 RED past every control until a FRESH CLOCK was " +
                 "asserted), and a runner reading only stdout -- invisible because the one gate that prints " +
                 "its verdict to stderr is too slow to re-run every time",
    }),
    since110: Object.freeze({
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
    since111: Object.freeze({
        at: "v4474", swept: 0, green: 0, red: 0,
        added: Object.freeze([]),
        redOnArrival: Object.freeze([]),
        repaired: Object.freeze([]),
        verdict: "No gate added and none red: gpu/glbTexture.mjs gains STREAMED and its gate gains a fourth " +
                 "section. THE STREAMED NUMBER OVERTURNS v4473's VERDICT -- one Khronos model costs 71.7 to " +
                 "91.6 MB of VRAM as PNG against 8.5 to 22.5 MB transcoded, where this whole repository's " +
                 "own textures come to 4.25 MB. The saving is exactly 32/bpp, asserted with no tolerance " +
                 "because the mip chain cancels. Eleven sabotages, nine red; the first run of the " +
                 "measurement was FICTION -- a cache keyed on the first thirty characters of the URL made " +
                 "three models report identical assets, caught by reading the numbers rather than by a check",
    }),
    since112: Object.freeze({
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
    since113: Object.freeze({
        at: "v4476", swept: 0, green: 0, red: 0,
        added: Object.freeze([]),
        redOnArrival: Object.freeze([]),
        repaired: Object.freeze([
            "tools/roundhouse/sweepBudget-selfcheck.mjs (every row read zero; device-cost-baseline.json had been re-frozen to {} at v4420, losing 4.79 hours -- restored from 740dd6f^)",
            "tools/ship/corpusFilters-selfcheck.mjs (it grepped for a spelling only the top-twelve table emits, so it asserted a RANKING rather than a shortfall)",
            "tools/ship/sweepCoverage-selfcheck.mjs (its returnable row was built to go red when fixed; the payment is recorded and eleven of twelve are re-timed)",
            "tools/ship/bakeShrinkGuard.mjs (keyMaps: its identities() read VALUES, and the one bake that lost data has its identities in KEYS -- an empty set that could never refuse)",
        ]),
        verdict: "No gate added. THE STALE GREEN AND THE STALE TIME ARE ONE DEFECT, found by main from the " +
                 "verdict side and by this branch from the timing side, and the merge let them meet. Putting " +
                 "the true numbers back exposed four reds a stale green was covering; two were repaired here " +
                 "and two were already owed by name. Eight sabotages, four red -- AND ALL FOUR ZEROS WERE ONE " +
                 "SPECIES, the component tested and the connection not: guardWrite accepting keyMaps and " +
                 "dropping them, costRecord skipping the guard, and two checks of my own that could not fail " +
                 "-- one with the label passed where the condition goes, one inserted below the exit line",
    }),
    since114: Object.freeze({
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

    // *** v4477 -- THE FOURTH ORDINAL COLLISION ON THIS PAIR OF BRANCHES, AND MAIN SAW IT COMING. ***
    // The closing below arrived from main as `since80`, which this branch has held for v4424 since then. Main's
    // own verdict text says it was built as v4451, lost that number to a concurrent session, and moved its
    // ledger ordinal forward past ten concurrent closings -- and it STILL landed on one this branch was using.
    // Moving forward by a guess is not a fix for a shared counter; it buys a round. Renumbered to since115, the
    // next free seat here, with main's round note untouched: what moves is the seat, never the record.

    // v4462 -- the eightieth closing on main, the HUNDRED AND FIFTEENTH here. #129's premise measured, and inverted.
    since115: Object.freeze({
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
    // v4463 -- the eighty-first closing. The spherical member of a family the tree only had the cylinder of.
        // *** v4477 -- THE FIFTH ORDINAL COLLISION, AND THE FIRST ONE GIT DID NOT FLAG. *** v4463's closing
    // arrived as `since81`, a seat this branch has held for v4425, and the merge took BOTH SIDES CLEANLY --
    // no conflict, no marker, a duplicate key in an object literal where the later declaration silently
    // wins and the earlier round's swept count vanishes from the surplus arithmetic. Nothing in git could
    // see it; gateSweep-selfcheck's own duplicate-ordinal row did, on the next run. That row exists
    // because a runtime read of this object CANNOT see a duplicate -- the earlier entry is already gone by
    // the time anything imports it -- so it is parsed from the SOURCE, which is the only place both
    // declarations still exist. Renumbered to since116, main's round note untouched.
since116: Object.freeze({
        at: "v4463", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/stereographic-selfcheck.mjs"]),
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
    since117: Object.freeze({
        at: "v4478", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/zoomBlur-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        repaired: Object.freeze([]),
        verdict: "THE NEAR MISS, BUILT. bloomPass.js's GODRAYS_FS is the tree's only radial-march-from-a-" +
                 "point shader and every contract around that loop is inverted -- read out of its source, " +
                 "not described. A zoom blur is an AVERAGE, so it has properties that hold exactly: a flat " +
                 "image comes back bit-identical, strength 0 is the identity, the centre is a fixed point, " +
                 "a radial ramp strictly shrinks. *** AND THE FIRST IS THE DESIGN, NOT A FREEBIE: *** the " +
                 "obvious `acc += sample` kernel fails it -- 32 copies of 0.1 sum to 0.09999997 -- so the " +
                 "reduction is a pairwise tree over a power-of-two count, refused otherwise. One reduceTree " +
                 "call serves the oracle, the GLSL and the WGSL, so the parenthesisation in the shader IS " +
                 "the evaluation order the oracle took. The WGSL is RUN on a real GPU: flat is bit-exact at " +
                 "every strength, strength 0 is bit-exact for every image, varying images agree to 3 ulp " +
                 "against a budget of 8 derived from the reduction depth. NINETEEN SABOTAGES, NINETEEN RED " +
                 "-- four only after repair, and all four were one species: an oracle MORE ACCURATE than the " +
                 "shader passes every comparison with it",
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
