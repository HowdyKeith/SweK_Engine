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

    // v4400 -- the FOURTEENTH closing, for the carve's compute pass (the round shipped as v4372 and renumbered
    // FORWARD at the merge; a closing's `at` names the round it belongs to, so it moves with the round). *** IT WAS WRITTEN AS since10 AND THAT
    // NUMBER WAS ALREADY TAKEN: *** the other line shipped v4365 and v4366 into since9 and since10 while this
    // one was building, and the merge left TWO since10 keys in one object literal -- where the later silently
    // overwrites the earlier, so v4366's closing would have vanished with no error anywhere. Caught by reading
    // the merged file rather than by anything running. That is the same hazard as a reused version number, one
    // level down, and it is why the accounting reads `closings` as a LIST rather than by name. Its round also fixed a defect in the transplant
    // machinery every earlier closing's gate ran through (render/tslSource.mjs read `==` as an assignment), so
    // tslPhysics, tslRace and tslRig were re-run to completion beside this one rather than left to the quick
    // sweep's cap -- machinery that changed is exactly what a 3 s cap cannot vouch for.
    since15: Object.freeze({
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
    since16: Object.freeze({
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
    since17: Object.freeze({
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
    since18: Object.freeze({
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
    since19: Object.freeze({
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
    since20: Object.freeze({
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
    since21: Object.freeze({
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
    since22: Object.freeze({
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
    since23: Object.freeze({
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
    since24: Object.freeze({
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
    since25: Object.freeze({
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
    since26: Object.freeze({
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
    since27: Object.freeze({
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
    since28: Object.freeze({
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
    since29: Object.freeze({
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
    since30: Object.freeze({
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
    since31: Object.freeze({
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
    since32: Object.freeze({
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
    since33: Object.freeze({
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
    since34: Object.freeze({
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
    since35: Object.freeze({
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
    since36: Object.freeze({
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
    since37: Object.freeze({
        at: "v4421", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/polyBrush-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly, seven sections and 17 checks in 4.0 s -- no device, no model. " +
                 "Driven RED by eight sabotages (5/2/2/1/1/1/3/1 by name) and restored, and TWO WENT 0 RED " +
                 "FIRST: the half-open crossing rule, which only 4 of 651 vertices ever exercise, and a " +
                 "mutator returning garbage, which fitStep simply rejects. Its own arrival reddened " +
                 "krbnPaint-selfcheck by changing a list that was answering two questions",
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
            else if (e.name.endsWith("-selfcheck.mjs")) out.push(path.relative(root, full));
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
