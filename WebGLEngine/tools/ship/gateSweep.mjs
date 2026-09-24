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
import { toPosix } from "./posixAssumption.mjs";

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
/**
 * *** v4647i -- AN EXIT CODE THE OPERATING SYSTEM PRODUCED IS NOT A VERDICT THE GATE PRODUCED. ***
 *
 * Keith's gen-9 sweep filed three gates as NEW RED at `exit 3221226505`, in the same list as thirty-odd
 * gates that exited 1 because they had found something:
 *
 *     NEW    ai-bridge/tools/localModelResolve-selfcheck.mjs  exit 3221226505 in 872 ms
 *     NEW    ai-bridge/tools/range-selfcheck.mjs              exit 3221226505 in 724 ms
 *     NEW    physics/box3d/box3dConformance-selfcheck.mjs     exit 3221226505 in 509 ms
 *
 * 3221226505 is 0xC0000409, STATUS_STACK_BUFFER_OVERRUN -- Windows fail-fast. The process was KILLED before
 * it could print a thing. All three pass on this box in under 350 ms, so there is nothing here to read as a
 * finding, and `grep -c '^  FAIL'` over their output returns ZERO. TWELFTH crash-instead-of-a-finding this
 * session, and the first one that is not mine: it is in the gates, reported by a sweep that cannot tell the
 * two apart.
 *
 * *** AND THE TREE ALREADY HAD AN INSTRUMENT THAT COULD. *** tools/ship/failLines.mjs -- written five rounds
 * ago for exactly this -- classifies RED / CRASHED / TIMEOUT by whether any `^  FAIL` line was printed.
 * classify() below, in the same directory, returns RED for every non-zero code. Two modules reading one
 * convention in opposite senses, which is the species this session has now met in posixAssumption's
 * separators, the two ground-limit contracts, and --gate against --gates.
 *
 * THE VERDICT DOES NOT CHANGE. A crashed gate is still red and still fails the ship -- softening that would
 * be the opposite of the point. What changes is that the report no longer sends a reader hunting for a FAIL
 * line that was never printed.
 *
 * The table is Windows NTSTATUS values as Node surfaces them. They are decided by RANGE and not by a list of
 * three: any code above 255 is not something a harness in this tree chose, because POSIX masks an exit
 * status to 8 bits and every gate here exits 0 or 1. A name is offered where one is known.
 *
 * *** v4649 -- AND ONE OF THOSE NAMES SENDS A READER TO THE WRONG PLACE. *** STATUS_STACK_BUFFER_OVERRUN
 * is what Windows raises for __fastfail, and V8 calls __fastfail for an OOM abort and for a failed CHECK
 * as well as for a smashed stack cookie. Five gates on Keith's 7908 MB box die with it and the set is
 * different every run, which is not the shape of five buffer overruns. The name is kept because it is
 * what the OS said; what it MEANS is written down here so nobody spends a round reading those gates for
 * a memory bug that is not in them.
 */
export const OS_KILL_CODES = Object.freeze({
    3221225477: "STATUS_ACCESS_VIOLATION (0xC0000005)",
    3221225495: "STATUS_NO_MEMORY (0xC0000017)",
    3221225725: "STATUS_STACK_OVERFLOW (0xC00000FD)",
    3221225786: "STATUS_CONTROL_C_EXIT (0xC000013A)",
    3221225794: "STATUS_DLL_INIT_FAILED (0xC0000142)",
    3221226505: "STATUS_STACK_BUFFER_OVERRUN (0xC0000409)",
});

export const EXIT_KIND = Object.freeze({ PASS: "pass", FINDING: "finding", OS_KILL: "os-kill", TIMEOUT: "timeout" });

/**
 * What KIND of thing an exit code is. Never throws; an unrecognised code above 255 is still an os-kill,
 * because the alternative -- reading it as a finding -- is the conflation this exists to end.
 */
export function exitKind(code, { timedOut = false } = {}) {
    if (timedOut) return EXIT_KIND.TIMEOUT;
    if (code === 0) return EXIT_KIND.PASS;
    // 124 is this sweep's own stand-in for "killed by signal" (runOneAsync), so it is a timeout, not a kill.
    if (code === 124) return EXIT_KIND.TIMEOUT;
    return Number(code) > 255 ? EXIT_KIND.OS_KILL : EXIT_KIND.FINDING;
}

/** The human name for a code, or a hex rendering, or null when it is an ordinary exit status. */
export function exitName(code) {
    if (exitKind(code) !== EXIT_KIND.OS_KILL) return null;
    return OS_KILL_CODES[code] || `0x${(Number(code) >>> 0).toString(16).toUpperCase()}`;
}

export function classify(parallel, serial = null) {
    if (!parallel) throw new Error("classify: a phase-1 result is required");
    if (parallel.code === 0 && !parallel.timedOut)
        return { verdict: VERDICT.GREEN, from: "parallel", note: "passing under contention passes idle too" };
    if (!serial)
        return { verdict: VERDICT.UNCONFIRMED, from: "parallel",
                 note: parallel.timedOut ? "timed out under -P 8; not a verdict" : "parallel red is a hypothesis" };
    if (serial.timedOut)
        return { verdict: VERDICT.UNCONFIRMED, from: "serial", note: "timed out alone on an idle box; still unmeasured" };
    if (serial.code === 0) return { verdict: VERDICT.GREEN, from: "serial", note: "false red -- starved in phase 1" };
    // v4647i -- `kind` is ADDITIVE. The verdict stays RED for an os-kill: a gate the OS killed is still a
    // gate that did not pass, and every existing consumer reads `verdict` and is unaffected.
    const kind = exitKind(serial.code);
    return { verdict: VERDICT.RED, from: "serial", kind, name: exitName(serial.code),
             note: kind === EXIT_KIND.OS_KILL
                 ? `confirmed, but the OS killed it: ${exitName(serial.code)}. There is no FAIL line to read`
                 : "confirmed" };
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
        verdict: "green here, RIG-PENDING on the rig (and the record on disk is STALE -- taken against the 0.178 pin). three-probe.html " +
                 "fetches named three versions from the npm registry in the browser, walks the tarballs, blob-imports each build beside the " +
                 "vendored one and renders one TSL gradient with each; the gate probes BOTH SIDES of PROBE_BOUNDARY, not one version; " +
                 "render/threeProbe.mjs holds untar, pickBuild, rewriteImports and a grader that refuses eight lies. MEASURED at v4545 on this " +
                 "box: the control draws on both routes; BOTH sides draw on three's WebGL2 backend; on WebGPU 0.184.0 draws and 0.185.1 is " +
                 "refused by the browser's GPUTextureViewDescriptor lacking swizzle -- v4319's finding by name, so the pin is at least the " +
                 "build box's, and the swizzle is read on both sides so the line is a line and not an anecdote. The rig record on disk says " +
                 "0.185.1 DREW on a rig's WebGPU, and is STALE (taken against the 0.178 pin), which the gate now says in those words. " +
                 "The tarball cache went outside the tree after colourReach counted the cached build as an arrival. Sabotages red at " +
                 "1 / 3 / 1 / 1 (v4494) and 3 / 2 / 1 / 2 / 2 (v4545).",
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
    // v4622 -- the 231st closing: SIX gates this same long-unshipped branch had added without ever naming
    // here, found the same way since230 was -- diffing the current tree against ce5d9b22 (since230's own
    // commit) rather than by memory, so the set is exactly what is missing since the last closing and not a
    // guess at it. Two are this round's own (ffmpeg.wasm's export and its gate is one file, the other three
    // are pre-existing branch work: FBX ingest (task #44), the frame recorder (task #64), ocean population
    // dynamics (task #71), reach-IK (task #40) and the Trellis auto-rig (task #38/#39). Run one at a time on
    // this box, each to completion: 6 GREEN, 0 red -- including trellisAutoRig-selfcheck.mjs itself, whose
    // own exit code is unrelated to the Windows-path defect tools/ship/windowsImport-selfcheck.mjs finds IN
    // its source (registered separately in redCensus.mjs's RED_AT_V4622).
    since231: Object.freeze({
        at: "e6aaaa93", swept: 6, green: 6, red: 0,
        added: Object.freeze([
            "tools/ship/fbxIngest-selfcheck.mjs",
            "tools/ship/ffmpegWasmBridge-selfcheck.mjs",
            "tools/ship/frameRecorder-selfcheck.mjs",
            "tools/ship/oceanPopulation-selfcheck.mjs",
            "tools/ship/reachIK-selfcheck.mjs",
            "tools/ship/trellisAutoRig-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        verdict: "all 6 green, run singly on this box. None of these six exists on origin/main -- confirmed " +
                 "directly (git cat-file -e origin/main:... for each), not inferred -- so this surplus is " +
                 "this branch's own unswept backlog, not a merge's.",
    }),
    // the 230th closing: TWENTY-FIVE gates this branch had shipped without ever naming here -- the AI-presence
    // orb cluster, the boss/dungeon/CS-round managers, satellite fleet, space suit, F82 fresnel and split-sum
    // WGSL, draco encode, FXAA, pipboy wireframe, sprite-mesh blueprint and ui/guards -- found by diffing the
    // current tree against 58cdda44 (the v4297 commit) rather than by memory, so the set is exactly what is
    // missing and not a guess at it. Run one at a time on this box, each to completion: 25 GREEN, 0 red.
    since230: Object.freeze({
        at: "ce5d9b22", swept: 25, green: 25, red: 0,
        added: Object.freeze([
            "fx/spritemesh/blueprint-selfcheck.mjs",
            "physics/render/fresnelF82-selfcheck.mjs",
            "physics/render/fresnelF82Wgsl-selfcheck.mjs",
            "physics/render/specularIBLWgsl-selfcheck.mjs",
            "physics/render/specularProbeBake-selfcheck.mjs",
            "physics/render/specularProbeCapture-selfcheck.mjs",
            "physics/render/specularProbeLit-selfcheck.mjs",
            "physics/render/splitSumWgsl-selfcheck.mjs",
            "tools/ship/aiHuntBrain-selfcheck.mjs",
            "tools/ship/aiPresenceOrb-selfcheck.mjs",
            "tools/ship/aiPresenceOrbPresent-selfcheck.mjs",
            "tools/ship/aiPresenceOrbWidget-selfcheck.mjs",
            "tools/ship/bossPhaseManager-selfcheck.mjs",
            "tools/ship/csBomb-selfcheck.mjs",
            "tools/ship/csRoundManager-selfcheck.mjs",
            "tools/ship/dracoEncode-selfcheck.mjs",
            "tools/ship/dungeonAI-selfcheck.mjs",
            "tools/ship/fxaaPass-selfcheck.mjs",
            "tools/ship/hellgateManager-selfcheck.mjs",
            "tools/ship/kaiju-selfcheck.mjs",
            "tools/ship/liveCubeCapture-selfcheck.mjs",
            "tools/ship/pipboyWireframe-selfcheck.mjs",
            "tools/ship/satelliteFleet-selfcheck.mjs",
            "tools/ship/spaceSuit-selfcheck.mjs",
            "ui/guards-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        verdict: "all 25 green, run singly on this box (43 ms to 12.6 s; aiPresenceOrbWidget and " +
                 "liveCubeCapture are the two headless-Chromium gates in the set and account for most of " +
                 "that spread). None of these twenty-five came from the origin/main merge -- diffing the " +
                 "merge's two parents found twenty gates unique to origin/main, and all twenty were already " +
                 "named in earlier closings -- so this surplus is this branch's own unswept backlog, not the " +
                 "merge's.",
    }),

    // *** THE FIFTH ORDINAL COLLISION, AND THE FIRST BIG ENOUGH TO HAVE DESTROYED WORK SILENTLY. ***
    //
    // The merge-base of these two lines tops out at since205. EVERY ORDINAL FROM 206 UP WAS ALLOCATED
    // TWICE, independently, for entirely different closings -- 40 of them. This is an OBJECT LITERAL, so a
    // duplicate key does not error, IT SILENTLY WINS: taking both blocks as written would have deleted
    // 40 closings and left a green tree. Counted rather than assumed -- 40 entries on this line, 47 on the
    // temporal/FSR line, 87 after the merge.
    //
    // Resolved by this file's own recorded rule, from the v4537 note below: "the list shape exists exactly
    // so a round appends and nobody renegotiates a name, AND THE SIDE THAT MERGES SECOND IS THE SIDE THAT
    // MOVES." The temporal/FSR line is the incoming one, so its since206-since252 become since247-since293,
    // prose ordinals included. Nothing looks a closing up BY NAME -- closingCoverage reads the union of the
    // `added` lists as a SET, and the four live mentions of since230 are prose about an earlier collision --
    // which is what makes the renumber safe, and is worth stating because it is the property the next
    // collision will rest on too.
    //
    // *** AND FIVE COLLISIONS IN IS WHERE THE SHAPE STOPS BEING BAD LUCK. *** An ordinal-keyed object hands
    // two concurrent lines a shared namespace with no allocator and a silent failure mode; a LIST gives them
    // append-only entries that cannot collide at all -- which is the shape `closings` itself was given at
    // v4399 for this exact reason, four ordinals ago. Registered rather than done here: a merge is the wrong
    // commit in which to change the shape of the thing being merged.

    since323: Object.freeze({
        at: "v4641", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/fsrPageDevice-selfcheck.mjs"]),
        widened: Object.freeze(["fsr.html", "render/temporalRejectWgsl.mjs", "render/temporalRejectGPU.mjs",
                                "render/temporalRejectGPU-selfcheck.mjs", "tools/ship/fsrPage-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "*** THE REJECT CHAIN RUNS FROM A PAGE, AND THE GATE THAT SAYS SO HAD TO BE ITS OWN FILE TO " +
                 "KEEP RUNNING. *** fsr.html's dolly now calls render/temporalRejectGPU.mjs -- three dispatches " +
                 "on one encoder, the first time DISOCCLUSION_WGSL, FACTOR_WGSL and RECTIFY_WGSL have run " +
                 "anywhere but their own selfcheck. It could not be wired as it stood: the runner returned no " +
                 "tallies and its comment told callers to count them from the mask, which recovers `flagged` and " +
                 "CANNOT recover `noHistory`, because the kernel writes the same 1.0 for a disocclusion, an " +
                 "invalid motion vector and a reprojection that left the frame -- and `genuine = flagged - " +
                 "noHistory` is the number the page prints. Two mainCounted entry points later the device and the " +
                 "CPU agree on all eight counters as integers. THE GATE IS A SEPARATE FILE FOR A MEASURED " +
                 "REASON: as section 5 of fsrPage-selfcheck it put that file at 4,744 ms against the sweep's " +
                 "3,000 ms membership threshold, which would have dropped the page's only gate out of every " +
                 "ship -- 'over budget means skipped means never re-timed', the failure this file has counted " +
                 "twice. Split, both are under it: 2,749 / 2,818 / 2,755 ms and 2,230 / 2,201 / 2,191 ms, three " +
                 "serial runs each. The new one is about 200 ms under and is called a straddler here rather " +
                 "than left for a later round to find as drift.",
    }),
    since322: Object.freeze({
        at: "v4640", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/pipeTruncation-selfcheck.mjs"]),
        widened: Object.freeze(["tools/ship/statedRuntime-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "*** A GATE THAT CALLS process.exit() DELETES ITS OWN OUTPUT THROUGH A PIPE, AND THE SHIP " +
                 "RITUAL COUNTS REDS THROUGH A PIPE. *** Node does not flush pending async writes on exit(); a " +
                 "write to a file is synchronous and a write to a pipe is not. MEASURED on a real gate: " +
                 "statedRuntime-selfcheck emitted 70,608 bytes to a file and 65,861 through a pipe, twelve lines " +
                 "became one, and the line that vanished was its only `  FAIL`. The skill's own instruction is " +
                 "`node <gate> | grep -c '^  FAIL'`, so the prescribed count read ZERO for a failing gate -- IT " +
                 "READ ZERO FOR ME, and v4639's commit message went out calling that gate 'a crash, not a " +
                 "verdict'. It was never a crash. The exit CODE was always right, which is why no sweep verdict " +
                 "was ever wrong and why nothing noticed: what was lost is the evidence, not the judgement. " +
                 "1,717 of 1,738 gates call process.exit(), but the ones it BITES are those whose output exceeds " +
                 "the pipe buffer -- measured across a 20-gate sample, exactly one, and it is the one that " +
                 "misled me. The new gate DRIVES the mechanism rather than asserting it: two scripts identical " +
                 "but for the last line, 244,000 bytes each, and process.exit() loses 219,905 of them through a " +
                 "pipe while process.exitCode loses none. *** AND THE FIRST VERSION OF THE REPAIR MADE THE GATE " +
                 "CONTRADICT ITSELF: *** exitCode does not stop execution and exit() did, so a failing run " +
                 "printed `1 FAILURES` and then `all checks pass`, which is why the `else` is its own row. THE " +
                 "NEW GATE ALSO WALKED INTO THE TREE'S OLDEST TRAP ON ITS FIRST RUN -- it scanned its subject's " +
                 "raw text and found `process.exit(1)` inside the COMMENT explaining the repair, reporting the " +
                 "gate unrepaired; it reads comment-stripped now. Every record this round owed was named by " +
                 "v4639's own pre-flight in one command, before the verify, which is what that runner was for.",
    }),
    since321: Object.freeze({
        at: "v4638", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/fsrPage-selfcheck.mjs"]),
        widened: Object.freeze(["fsr.html", "render/jitter.mjs", "render/motionVectorsGPU.mjs",
                                "render/motionVectorsWgsl.mjs", "render/temporalAccumulate.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "*** THE TEMPORAL ARC GOT ITS FIRST CALLER, AND fsr.html HAD NO GATE AT ALL. *** Sixteen rounds " +
                 "built jitter, resolve, accumulate, motion vectors, disocclusion and rectify; every one is gated " +
                 "against a fixture and the one page a reader opens was graded by nothing. The page now carries a " +
                 "third camera -- a perspective dolly over two planes -- and it is the first thing in this tree to " +
                 "run the reject chain outside a gate: 106 genuine disocclusions, a one-pixel sliver down the slab's " +
                 "trailing edge, against exactly 0 for the two orthographic cameras. ALL FOUR CELLS WERE MEASURED " +
                 "BEFORE ANY OF IT WAS WRITTEN and the second one is the finding: an orthographic camera moving " +
                 "parallel to the image plane reveals nothing HOWEVER MUCH DEPTH THE SCENE HAS, because the image " +
                 "and the depth buffer translate together. Depth alone is not the condition and perspective alone " +
                 "is not; parallax is, and it needs both. *** AND THE PAGE IS THE FIRST CALLER OF jitterProjection " +
                 "AND resolveJitterAwareCPU TOGETHER, WHICH READ ONE OFFSET IN OPPOSITE SENSES. *** jitter.mjs's " +
                 "convention block fixes the units and the axes and never said which way the offset points; " +
                 "jitterProjection moves the IMAGE, the resolve assumes the SAMPLE moved. Paired without negating " +
                 "one, the zone plate scored 11.61 dB and the neighbourhood clamp fired on 34,191 of 36,864 pixels; " +
                 "negated, 16.27 dB and 466. Both modules are gated and both are right alone. Measured as a " +
                 "reconstruction: the resolve's own floor is 8.4187e-4 rms, same-sign 8.2060e-3, negated 1.0318e-3. " +
                 "NEITHER IS CHANGED -- both senses are in use and flipping one moves a fixture rather than fixing a " +
                 "defect; what was missing is the sentence, and the measurement now lives in a gate. FOUR STALE " +
                 "CONTRACT COPIES corrected alongside: temporalAccumulate.mjs and motionVectorsWgsl.mjs both " +
                 "documented the motion buffer as (du, dv, valid, 0) when the producer writes zPrev -- the WGSL " +
                 "header contradicted its own line 38 -- orthoPanVP's docstring said ndc.z = 0 where its z row is " +
                 "the identity, and fsr.html's note still told readers the temporal pane is CPU-only, which v4590 " +
                 "falsified and two rounds corrected in the comment beside the call and not in the prose. FIVE " +
                 "SABOTAGES, all red by name, and the sharpest is the mask fed straight in as the factor: 36,758 " +
                 "pixels discarded instead of 106, which is the polarity inversion the reject module's own header " +
                 "warns about.",
    }),
    since320: Object.freeze({
        at: "v4595", swept: 0, green: 0, red: 0,
        added: Object.freeze([]),
        widened: Object.freeze(["render/temporalRejectGPU-selfcheck.mjs", "render/temporalRejectGPU.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "no gate added; a CORRECTION, found by trying to build on a number this arc had already shipped. " +
                 "*** v4593 ASSERTED THAT fsr.html CANNOT DISOCCLUDE BECAUSE ITS SCENE IS FLAT, AND OFFERED '384 " +
                 "GENUINE WITH A NEAR SLAB' AS THE CONTROL PROVING THE DETECTOR FIRES. THE 384 WAS THE FIXTURE'S " +
                 "PREV-DEPTH SHIFTED AGAINST THE MOTION. *** du is +PAN/D, so last frame every feature sat at " +
                 "HIGHER x; the fixture put the slab at LOWER x -- a camera panning the other way -- and the " +
                 "reprojection landed across the slab's edge and reported disocclusion that never happened. " +
                 "Measured all three ways at v4595: wrong way 384, right way 0, slab not moving 192. The number " +
                 "had gone into a gate ROW, a runner header and this changelog, and the round that found it was " +
                 "the round that tried to USE it -- the next rung proposed was giving the page occluding " +
                 "geometry, which the corrected measurement says would have changed nothing. *** THE TRUE REASON " +
                 "IS STRONGER AND SIMPLER: AN ORTHOGRAPHIC PROJECTION HAS NO PARALLAX. *** Every pixel moves the " +
                 "same screen distance whatever its depth, so the depth at the reprojected position always " +
                 "matches and nothing is ever revealed -- with a flat scene or with an occluder, both 0. The " +
                 "page's CAMERA was the binding constraint, not its content. The valid control is a PERSPECTIVE " +
                 "camera whose slab band is PROJECTED from world space rather than nudged by a chosen pixel " +
                 "count -- the nudging is what produced 384 -- and it fires: 192 genuine. Both the corrected and " +
                 "the spurious measurement are rows now, because an erratum nobody can re-run is a claim about a " +
                 "claim. Sabotage: 4 mutations, 4 caught, one of them only after the gate STOPPED CRASHING -- " +
                 "putting the slab at the background's depth zeroes the threshold, disocclusionCPU refuses it, " +
                 "and the gate exited 1 with no FAIL line, which is no verdict. A degenerate fixture is a real " +
                 "thing to guard and has a row. Also recorded: this gate's runtime is NOISY at the " +
                 "few-hundred-millisecond scale (1671-2108 over five samples) and v4594's three-sample median " +
                 "of 2573 sat at the top of that spread -- three samples were too few to say so.",
    }),
    since319: Object.freeze({
        at: "v4594", swept: 0, green: 0, red: 0,
        added: Object.freeze([]),
        widened: Object.freeze(["render/temporalRejectWgsl.mjs", "render/temporalRejectGPU.mjs",
                                "render/temporalRejectGPU-selfcheck.mjs", "tools/ship/temporalCorpus.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "no gate added; the round closed the hole v4593 MEASURED AND REFUSED TO PAPER OVER. DISOCCLUSION " +
                 "writes a mask (1 = history wrong), RECTIFY reads a factor (1 = history trusted), and the " +
                 "inversion -- historyFactorCPU -- had no WGSL anywhere in the tree, so v4593 shipped its runner " +
                 "deliberately WITHOUT a rejectAndAccumulate() after its own first draft wrote one that bound an " +
                 "all-zero factor under a comment claiming otherwise. FACTOR_WGSL is that inversion and the chain " +
                 "is three dispatches on one encoder, asserted bit-identical to the standalone rectify. The " +
                 "kernel mirrors historyFactorCPU including the part that is a DECISION rather than arithmetic -- " +
                 "the three reasons MULTIPLY, because each is an independent probability and a max() would let " +
                 "the strongest hide the others. *** TWO SABOTAGES WENT 0-RED AND THEY FAILED DIFFERENTLY. *** " +
                 "Dropping the clamp was a MIS-AIMED MUTATION: it hit the disocclusion term, whose mask is 0 or 1 " +
                 "by construction, so that clamp is unobservable through that input -- a property of the producer, " +
                 "not a gap. Re-aimed at the reactive term, whose fixture carries 1.4 and -0.2, it takes two " +
                 "rows. *** THE OTHER WAS A REAL HOLE NOTHING COULD HAVE CAUGHT: *** the corpus hardcoded a 2D " +
                 "dispatch for every entry, which was right while every kernel in the arc was 8x8 over a picture; " +
                 "FACTOR_WGSL is the first 1D one, and putting the 2D shape back left half its output untouched " +
                 "ON BOTH BACKENDS, so crossBackend agreed. A COMPARISON OF TWO BACKENDS CANNOT SEE AN ERROR THEY " +
                 "SHARE. temporalCorpus now refuses at construction by name, and a pure invocation count would " +
                 "not have done it -- [2,2] over @workgroup_size(64,1,1) is 256 invocations, exactly the picture, " +
                 "with the y axis thrown away -- so the axes the SHADER USES decide.",
    }),
    since318: Object.freeze({
        at: "v4593", swept: 1, green: 1, red: 0,
        added: Object.freeze(["render/temporalRejectGPU-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze(["render/temporalRejectGPU.mjs", "tools/ship/kernelReach-selfcheck.mjs"]),
        verdict: "green, 1862 ms alone. FIVE of the seventeen: DISOCCLUSION_WGSL and RECTIFY_WGSL have a caller " +
                 "and the census reads 12, with five of the temporal arc's original ten left. *** AND THE PAGE IS " +
                 "DELIBERATELY NOT WIRED TO IT, WHICH IS A MEASUREMENT RATHER THAN A SHRUG: *** fsr.html's scene " +
                 "is a continuous function of (u, v) with no z, so nothing is hidden and nothing can be revealed. " +
                 "At the page's own size, pan and camera the test flags 192 of 36,864 and ALL 192 ARE THE " +
                 "OFFSCREEN COLUMN -- genuine disocclusion zero. The same frame with a near slab: 384. Wiring it " +
                 "would ship a pass whose output is provably the column the accumulate already rejected, on a " +
                 "page that exists to show things firing, after four rounds spent finding controls that cannot " +
                 "fail. What a caller needs is occluding geometry, which is a change to what the page IS. *** AND " +
                 "THE TWO KERNELS CANNOT BE CHAINED, WHICH THE FIRST DRAFT PRETENDED THEY COULD: *** DISOCCLUSION " +
                 "writes a MASK (1 = history wrong), RECTIFY reads a FACTOR (1 = history trusted), and the thing " +
                 "that inverts is historyFactorCPU, which has no WGSL anywhere in the tree. The draft dispatched " +
                 "both, bound an ALL-ZERO factor, and carried a comment claiming it fed the mask in -- code and " +
                 "comment disagreeing, with the code meaning DISCARD ALL HISTORY on every pixel. Removed, the " +
                 "reason recorded where the method would have been, and its absence asserted so it cannot come " +
                 "back quietly -- a sabotage putting it back goes red. Sabotage: 6 mutations, 6 caught, and TWO " +
                 "OF THEM DID NOT APPLY ON THE FIRST ATTEMPT AND SCORED FAIL=0 -- no-ops, not 0-REDs, which is " +
                 "v4587's distinction and would otherwise have recorded the threshold refusal and the kernel's " +
                 "own gap test as exercised while nothing had touched either.",
    }),
    since317: Object.freeze({
        at: "v4592", swept: 1, green: 1, red: 0,
        added: Object.freeze(["render/motionVectorsGPU-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze(["render/motionVectorsGPU.mjs", "fsr.html", "tools/ship/kernelReach-selfcheck.mjs"]),
        verdict: "green, 1618 ms alone. Three of the seventeen: MOTION_WGSL has a caller and the census reads 14. " +
                 "*** THE ROUND'S PREMISE WAS WRONG AND ITS OWN PRIOR-ART CHECK SAID SO -- THE SECOND HAND-OFF " +
                 "CLAIM IN FOUR ROUNDS TO DIE THAT WAY. *** v4591 closed by proposing that fsr.html's hand-written " +
                 "motion vectors were 'a second implementation of motionVectorsCPU'. They were not: that function " +
                 "takes a depth buffer and two 4x4 matrices, and the page had neither -- it panned a 2D scene and " +
                 "wrote a constant. What IS true is smaller and worth more: the constant was DECLARED, and it is " +
                 "DERIVED now. Measured before anything was built, at four frames over 36,864 pixels: an " +
                 "orthographic pan camera through motionVectorsCPU reproduces the hand-written du at 0.000e+0 with " +
                 "dv at 2.8e-17. The page's numbers after the change are identical to v4586's -- pan 17.61 dB, " +
                 "offscreen 192, clamped 914; static 21.56 dB -- which is the point: nothing moved, the number " +
                 "just stopped being a claim. It HAD been wrong once, the sign, caught by a counter rather than a " +
                 "check, and the gate now drives a reversed camera as a control so that exact mistake fails a row. " +
                 "*** SABOTAGE FOUND TWO 0-REDS AND BOTH WERE THIS GATE'S FIXTURES: *** packing dims as [h, w] " +
                 "moved nothing because every fixture was SQUARE, and forcing every pixel valid moved nothing " +
                 "because an orthographic pair over a flat scene is all-valid. The obvious repair for the second " +
                 "-- the eye position the neighbouring gate uses for its single-pixel invalid case -- put the " +
                 "WHOLE surface behind the camera and compared all-zeros to all-zeros at 0.000e+0: one vacuous " +
                 "fixture traded for another inside the row added to fix the first. Eight eye positions measured " +
                 "to find the straddle, and that one is pathological for NUMBERS (|du| to 57 UV units near the " +
                 "projection singularity), so parity moved to a third well-conditioned camera. Two fixtures, " +
                 "because one cannot answer both questions and a tolerance wide enough for both is a number " +
                 "chosen to fit the answer. Also repaired: the device row was written at 1e-9 straight after " +
                 "reading the CPU row's exact zero -- the same category error as v4590's copy-through row, one " +
                 "round later. The CPU's zero is f64 doing an exact translation; the kernel is f32 through two " +
                 "transforms and a divide and lands an ulp away, and the round MEASURED that the ulp does not " +
                 "move a pixel across the accumulate's offscreen bound rather than dismissing it.",
    }),
    since316: Object.freeze({
        at: "v4591", swept: 0, green: 0, red: 0,
        added: Object.freeze([]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze(["render/temporalAccumulateWgsl.mjs", "render/temporalGPU.mjs",
                                "render/temporalGPU-selfcheck.mjs", "render/wgslSpec.mjs", "gfx/device.js",
                                "tools/ship/temporalCorpus.mjs", "fsr.html"]),
        verdict: "no gate added; the round closed the gap v4590 SHIPPED AS A DECLARED ABSENCE. ACCUMULATE_WGSL " +
                 "counted nothing, so the temporal port returned stats: null and fsr.html printed \"CPU ONLY\" -- " +
                 "and those counters are the diagnostic that proved the motion-vector sign at v4586. The kernel " +
                 "now has a SECOND ENTRY POINT, mainCounted, recording four atomics, and the device's counts are " +
                 "asserted EQUAL to the CPU's rather than close: reused 8455, offscreen 89, invalid 672, clamped " +
                 "8410 on both. *** TWO ENTRY POINTS RATHER THAN A SECOND KERNEL, BECAUSE A COUNTER THAT COULD " +
                 "DISAGREE WITH THE PASS IT COUNTS IS WORSE THAN NO COUNTER: *** accumulateAt() decides once and " +
                 "returns what it did, and a sabotage that makes mainCounted write a slightly different blend is " +
                 "caught by the row asserting counting does not move a pixel. MEASURED BEFORE BUILDING, on this " +
                 "adapter: a module compiled for `main` does not demand the binding `main` never uses -- which is " +
                 "what keeps temporalAccumulate-selfcheck.mjs green UNCHANGED. *** AND THE PROBE WAS HALF A " +
                 "PROBE. *** It proved an unused binding need not be bound; it did not ask whether binding it " +
                 "anyway is refused. It is -- gfx/device.js's own v4466 note says so in as many words -- and " +
                 "tools/ship/temporalCorpus.mjs found out by being REFUSED BY THE DEVICE, because it builds an " +
                 "entry from every binding the SOURCE declares where the device binds by USE. The two agreed " +
                 "only while no kernel in that corpus had more than one entry point. usedNames() moved from " +
                 "gfx/device.js into render/wgslSpec.mjs so both can ask the same question; a sabotage that " +
                 "un-filters it takes the runner's device AND the corpus down together, which is what says the " +
                 "move was load-bearing. A first attempt papered over it with an inert four-zero fixture and the " +
                 "device refused that too. Sabotage: 6 mutations, 6 caught.",
    }),
    since315: Object.freeze({
        at: "v4590", swept: 1, green: 1, red: 0,
        added: Object.freeze(["render/temporalGPU-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze(["render/temporalGPU.mjs", "fsr.html", "tools/ship/kernelReach-selfcheck.mjs"]),
        verdict: "green, 2766 ms alone. *** TWO OF THE SEVENTEEN, AND THE FIRST TWO OF THE TEMPORAL ARC'S TEN. *** " +
                 "v4589 counted 17 dispatchable kernels reachable only from a gate; render/temporalGPU.mjs is the " +
                 "caller for RESOLVE_WGSL and ACCUMULATE_WGSL and the census now reads 15, with the ratchet " +
                 "LOWERED to match rather than left where it was convenient -- its own second half asks for that. " +
                 "fsr.html's temporal pane runs on the adapter, resolve and accumulate chained on one encoder, and " +
                 "the comment in that page saying the two modules 'have no WGSL at all' is gone: they have had it " +
                 "since v4552 and what they had none of was a caller. *** THE PORT LOSES A DIAGNOSTIC AND SAYS SO " +
                 "RATHER THAN DISCOVERING IT: *** temporalAccumulateCPU returns reused/rejectedOffscreen/" +
                 "rejectedInvalid/clamped and ACCUMULATE_WGSL counts NOTHING -- no atomics, every rejection an " +
                 "early return. Those counters are what proved the motion-vector sign at v4586 (rejectedOffscreen " +
                 "reading exactly one column of 192). So the runner returns stats: NULL with a reason, the page " +
                 "prints 'CPU ONLY -- not zero: uncounted', and the gate asserts null-rather-than-zeroes: a frame " +
                 "that reused nothing and a frame nobody counted must not print the same number. Atomics in a " +
                 "gated kernel are their own rung. Also asserted, and never asked before: resolve THEN accumulate " +
                 "on one device, which is the order every frame of a temporal upscaler uses and which each " +
                 "kernel's own gate cannot reach, driving each alone. *** ONE DEFECT IN THE ROUND'S OWN WORK: *** " +
                 "the no-history row asserted the copy-through path at 1e-6 against the CPU's first frame and went " +
                 "red at 1.73e-6. The tolerance was not the mistake, the REASONING was -- 'it copies' is exact " +
                 "only against the buffer it was handed, and comparing to a CPU run measured the RESOLVE's f32 " +
                 "error and called it the accumulate's. Split into an exact row and a parity row that says what " +
                 "it is made of. Sabotage: 7 mutations, 7 caught; S3 (stats as zeroes instead of null) is the one " +
                 "the round is about, and S7 breaks the KERNEL rather than the runner.",
    }),
    since314: Object.freeze({
        at: "v4589", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/kernelReach-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze(["tools/ship/kernelReach.mjs"]),
        verdict: "green, 25575 ms alone -- it imports 107 producer modules to hash the shader text each yields. " +
                 "*** v4588 FOUND ONE FILE'S KERNELS UNRUNNABLE OUTSIDE THEIR GATE AND WROTE IT UP AS A STORY. " +
                 "IT IS A POPULATION: 17 dispatchable kernels in 11 files, and TEN ARE THE TEMPORAL ARC *** -- " +
                 "MOTION_WGSL, RESOLVE_WGSL, ACCUMULATE_WGSL, RING_FLOOR_WGSL, DISOCCLUSION_WGSL, RECTIFY_WGSL " +
                 "and temporalLock's four. Nineteen rounds of kernels, v4552 to v4570, every one validated on a " +
                 "real device by its own gate, and nothing in the engine can dispatch any of them; fsr.html runs " +
                 "the CPU versions of two every frame. *** AND THE ROUND'S OWN HAND-OFF CLAIM WAS FALSE: *** v4588 " +
                 "closed by proposing 'the temporal half has no WGSL at all'. temporalResolveWgsl.mjs and " +
                 "temporalAccumulateWgsl.mjs have existed since v4552 -- the prior-art check refuted the round's " +
                 "premise in its first two commands, which is the check earning its place rather than a near miss. " +
                 "*** THE NUMBER WENT 67 -> 41 -> 34 -> 31 -> 17 UNDER ITS AUTHOR'S OWN SCRUTINY, *** and each " +
                 "step was a KIND of reachability the instrument could not see: probes exist to be dispatched BY a " +
                 "gate (18 of them); a module can dispatch its own kernel (gpuHaul, gpuOrbits, bloomFused); two " +
                 "exports can be one shader text (worleyWgsl() and WORLEY_WGSL = worleyWgsl(), one imported and " +
                 "one looking dead); and a kernel can travel BY DATA rather than by symbol (fleets.mjs puts " +
                 "HOLO_WGSL in a materials table and never dispatches). Reporting 67 would have been a bigger " +
                 "headline and a worse measurement. Population imported from wgslCorpus.census() rather than " +
                 "re-walked -- that walker has been wrong three times for three reasons and every fix lives " +
                 "there. Sabotage: 6 mutations, 6 caught; the instructive one is M4, counting `export { X }` as a " +
                 "use site, which would have driven the finding to ZERO because the whole arc re-exports at the " +
                 "foot of the file.",
    }),
    since313: Object.freeze({
        at: "v4588", swept: 1, green: 1, red: 0,
        added: Object.freeze(["fx/fsr/fsrGPU-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze(["fx/fsr/fsr.js", "fx/fsr/fsr-selfcheck.mjs", "fsr.html"]),
        verdict: "green, 3084 ms alone (median of 3132/3084/3017), just over the sweep budget because it spawns a " +
                 "browser origin and a real adapter and times 60 dispatches inside it. *** THE FSR KERNELS WERE " +
                 "WRITTEN, VALIDATED, RUN ON A REAL DEVICE AND HELD TO THE CPU REFERENCE TO 3e-7 -- AND NOTHING " +
                 "OUTSIDE A GATE COULD DISPATCH THEM. *** fx/fsr/fsr-selfcheck.mjs built the buffers, the pipeline " +
                 "and the dispatch inline, twice, inside a page it spawns itself, and that was the only code in " +
                 "the tree that ran the WGSL. A gate is not a caller: it proves a kernel and ships nothing. That " +
                 "gate's own closing named the gap in its own words -- 'no caller in this tree yet uses it' and " +
                 "'SPEED -- nobody has timed either kernel'. fx/fsr/fsrGPU.js is the caller, through gfx/device.js " +
                 "and NOT through a second raw-WebGPU dispatcher (fx/anime4k's Anime4KGPU is that, and carries the " +
                 "comment 'correct-by-construction; no WebGPU headless here' -- a driver nobody has run). *** THREE " +
                 "THINGS THE KERNEL GATE COULD NOT ASK BECAUSE IT HAD NO RUNNER: *** the two kernels had never been " +
                 "run BACK TO BACK on the device at all, so fsr1() chains them on one encoder and is asserted " +
                 "BIT-IDENTICAL to the same two passes with a readback between -- 0 of 49152 channels, and the " +
                 "sabotage that binds the second pass to the wrong buffer moves 48589 of them. SPEED: 4.6-6.9 ms " +
                 "chained against 28.8-35.1 ms for fsr1CPU at 64x64 -> 128x128 on this box's software adapter, and " +
                 "the chain saves 26-37% against the two-call form, which is one 256 KB readback and upload not " +
                 "taken. THE OVERSHOOT: RCAS_LIMIT keeps the resolve off the pole of 1/(4*lobe+1) and does NOT " +
                 "bound the range; the kernel gate measured 1.000 -> 1.166 on a synthetic peak and wrote 'no caller " +
                 "in this tree yet clamps it, because no caller in this tree yet uses it'. There is one now, so it " +
                 "is measured on an ordinary picture -- 344 channels above 1.0 and 399 below 0.0 of 49152, range " +
                 "[-0.573, 1.221] -- and the runner REPORTS the range rather than clamping, because clamping in " +
                 "the pass changes the algorithm for every caller. *** THREE DEFECTS IN THE ROUND'S OWN WORK, ALL " +
                 "CAUGHT BY THE GATE ON ITS FIRST RUN: *** the runner was written with an options object and " +
                 "denoise defaulting to TRUE while fsr.js declares positional arguments and FALSE -- a GPU path " +
                 "that answers a different question from the reference it mirrors, which surfaced as 'worst NaN' " +
                 "when an object reached fsr1CPU's positional sharpness. The gate's own source check for raw " +
                 "WebGPU calls went red on the runner's COMMENT explaining that it makes none -- the " +
                 "absence-check trap, fifth time in this arc, fixed with codeOnly(). And the row next to it then " +
                 "failed because codeOnly EMPTIES string literals, so `backend !== \"webgpu\"` read as " +
                 "`backend !== \"\"`: noComments() is the instrument for a quoted literal in live code. Also " +
                 "corrected next door: fsr-selfcheck's header and closing both said the temporal path was blocked " +
                 "because 'this tree has NO motion vectors and no previous-frame view-projection matrix anywhere " +
                 "in it'. All three prerequisites arrived after that was written and fsr.html has been running the " +
                 "whole chain since v4586 -- a stated limit that outlived the limit, describing a page that " +
                 "already existed as a rung nobody could reach.",
    }),
    since312: Object.freeze({
        at: "v4585", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/redAction-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze(["tools/ship/staleness.mjs", "tools/ship/staleness-selfcheck.mjs", "case-study.html"]),
        verdict: "green, 6925 ms at eight-wide and 6822 ms alone -- over the sweep budget because it RUNS three " +
                 "gates to classify their reds from what they print. *** A RED THAT NAMED ITS OWN ONE-COMMAND FIX " +
                 "WAS CARRIED AS FURNITURE FOR FIVE ROUNDS. *** staleness-selfcheck was red on a case-study page " +
                 "37 gates behind, and its failure text said in capitals: THE FIX IS ONE COMMAND: node " +
                 "tools/ship/staleness.mjs --fix. v3087 decided deliberately that --fix never runs during a check " +
                 "-- 'a ritual that auto-fixed before asserting would be a gate that agrees with whatever " +
                 "shipped' -- and v3922 added the sentence naming the command so the human step would be obvious. " +
                 "THE DESIGN WAS COMPLETE AND CORRECT. I read that red across v4580-v4584, wrote 'budgetExile, " +
                 "definitionGates and staleness, equally red at HEAD' into five round summaries, and never opened " +
                 "the message. One command closed it AND budgetExile with it -- that gate had only ever been " +
                 "reporting staleness's debt from another instrument. Nothing was built for this finding. *** AND " +
                 "THE THIRD RED WAS MISDESCRIBED: *** definitionGates' rows are frozen ratchets that may only move " +
                 "DOWN, which is design, but the REDNESS is unpaid debt its own file prescribes a repair for -- 55 " +
                 "exported symbols under physics/, 319 tree-wide, 617 of any shape, each owed a check that calls it " +
                 "and grades the answer. Calling debt 'deliberately immovable' five times is how it stops being " +
                 "paid. *** THREE DEFECTS IN THE ROUND'S OWN WORK, EACH CAUGHT BY THE TREE RATHER THAN BY CARE: *** " +
                 "a duplicate baker was written into staleness.mjs before checking, twenty lines above fixDerived(), " +
                 "which has done the same since v3087 -- a second copy of one rule, committed by the round three " +
                 "deep in finding second copies elsewhere. A draft proposed adding a ship stage that auto-fixed " +
                 "before verify, which is exactly what v3087's sentence refuses, and reading the file refused it. " +
                 "And the gate's first version called fixDerived({write:false}) to prove the row was closable: " +
                 "staleness-selfcheck asserts NO gate calls fixDerived and went red naming this file -- the red " +
                 "this round spent itself learning to read caught its author on the first run. write:false is a " +
                 "promise about an argument, not a property of a design. Also repaired: that detector scanned the " +
                 "RAW file, so a COMMENT recording the removed call kept it red -- the rule could only be satisfied " +
                 "by deleting the history of having broken it -- and this file already preaches the fix two rows up " +
                 "('ask the code, never the commentary'). It uses codeHas now. And staleness-selfcheck's " +
                 "falsifiability row was a second copy of the row it protected: headed 'the comparison is a real " +
                 "equality, not a tautology' under a section headed 'a control that cannot fail is decoration', its " +
                 "condition was claimed === actual -- WHAT SECTION 1 ALREADY ASSERTS -- while its own comment " +
                 "described the right design. ONE STALE NUMBER WAS REPORTING AS TWO REDS for five sweeps. " +
                 "stalenessRows is injectable now (recordDrift.checks()'s shape since v4482) and the control is " +
                 "driven with a page claiming 1 gate. 14 sabotages, 14/14 red, no 0-RED -- after eight 0-REDs and a " +
                 "crash, all of them here: the first baseline was itself red because ADDING THIS GATE RE-STALED THE " +
                 "PAGE, which is the documented cycle and is why the sweep is re-run after the command; the harness " +
                 "counted a red going GREEN as a catch; and three anchors were satisfied by a sibling line or a " +
                 "substring, including a consistency check on the frozen figures that a coherent rewrite satisfied " +
                 "while shrinking the finding from 37 gates to 1. Verify: the three reds this arc has been " +
                 "reporting are now one -- and a second one surfaced that had been hiding behind them. " +
                 "gateSelection-selfcheck is reproducibly red (twice alone) and its failure read \"first 123 " +
                 "selected are all reachable\", which describes the INTENT and reads like a pass: neither a command " +
                 "nor a count, the one unactionable class. It is growth, not staleness -- `reachable` now exceeds " +
                 "what a 180 s budget selects, so truncation is the normal case and 22 of the first 123 selected are " +
                 "not reachable from the change. Its message says how many, which, and what is OWED now. Also " +
                 "recorded: adding it to the DRIVEN list took this gate past seventy seconds and the sabotage sweep " +
                 "from four minutes to twenty, so the costly red is classified from the one named row of its source " +
                 "-- redCensus's own rule, that re-verifying a registered red belongs to its two minutes and not to " +
                 "a routine check -- and the first read arm classified the WHOLE file, which any of thirty rows " +
                 "satisfied. 16 sabotages, 16/16 red, no 0-RED. Verify: 37 green, 2 red, 1 load-only, 0 crash-only.",
    }),
    since311: Object.freeze({
        at: "v4584", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/walkerParity-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze(["ai-bridge/gateWalk.js", "tools/ship/selfchecks.mjs",
                                "tools/ship/gateWalk-selfcheck.mjs"]),
        verdict: "green, 3973 ms at eight-wide and 3901 ms alone -- OVER the 3000 ms sweep budget on purpose, " +
                 "because it runs selfchecks.mjs twice as a child to read the suite's own population, which is " +
                 "the only way to ask the one walker with no exported walk. *** THE SHIP'S SUITE RUNNER WAS " +
                 "DISCOVERING AND SCHEDULING TRANSIENT FIXTURES. *** Four gates plant a `__`-prefixed " +
                 "*-selfcheck.mjs while they run. v4409 found what that costs and closed it at ONE walker -- a " +
                 "discovered fixture gets RUN, rigProgress's is built to exit 1, 'a NEW RED outside every " +
                 "register... a race, so it fails a ship at random and never reproduces alone, which is the worst " +
                 "shape a ship-time check can have'. v4580 closed it at treeRead and wrote that the fix lands at " +
                 "the walker 'so all four censuses get it at once'. THAT WAS TRUE OF treeRead'S FOUR CONSUMERS " +
                 "AND I LET IT READ AS FOUR WALKERS. Measured at v4584 by planting one file: " +
                 "tools/ship/selfchecks.mjs went from 1,634 files to 1,635 AND its selection from 23 gates to 24, " +
                 "so the fixture was discovered and scheduled; ai-bridge/gateWalk.js -- the shared discovery for " +
                 "rig.html and gates.html -- returned it as a clickable gate. *** AND THE GATE COMPARING THE TWO " +
                 "TWINS COULD NOT SEE IT, BECAUSE THEY AGREED. *** gateWalk-selfcheck asserts the twin returns " +
                 "the same set as the suite's rules; both were missing v4409's rule, so it passed on a false " +
                 "answer -- the second-copy defect timingCoverage recorded at v3584 -- and it held a THIRD copy " +
                 "of the walk inline, also missing it. Three copies, one omission, unanimous. *** A FIFTH WALKER " +
                 "HAD THE RULE ALL ALONG, IN A SPELLING NOTHING GREPPED FOR: *** staleness.mjs's pattern is " +
                 "/^(?!__)[^/]*-selfcheck.mjs$/, a negative lookahead, and a row in the arriving gate that " +
                 "grepped for `!f.startsWith(\"__\")` would have failed it while it was CORRECT -- a string proxy " +
                 "for a property, written into the row built to catch string proxies. That row is gone; all six " +
                 "exported gate populations are DRIVEN against a planted file instead, and a seventh fails on " +
                 "arrival. *** AND THE ROUND'S PROPOSED RUNG WAS WRONG THREE TIMES OVER, WHICH IS RECORDED IN THE " +
                 "GATE. *** v4583 closed by proposing that rigRunner builds its gate list from a payload the rig " +
                 "sends: it discovers from disk through the shared walk (v4018). Nor is /rig/run unvalidated -- " +
                 "suffix, existence, no parent escape. Nor do those predicates diverge from the offered menu: " +
                 "1,641 against 1,641, zero either way. THE DEFECT WAS ONE LAYER PAST ALL THREE GUESSES and no " +
                 "amount of reading found it. 13 sabotages, 13/13 red, no 0-RED -- after FIVE 0-REDs, all of them " +
                 "here, two arriving by fixing an earlier row: the suite probe could return a constant and pass " +
                 "on 0 === 0; pinning `selected` to fix that was itself wrong, because it is the budget planner's " +
                 "output and read 27 then 26 with no fixture involved; and dropping that clause lost coverage it " +
                 "had been giving by accident, so three sabotages went 0-RED until each earned a row -- including " +
                 "one asserting the fixture ACTUALLY EXISTED while the walkers were asked, which is the same " +
                 "absence the defect hid behind for three rounds. *** AND THE PROBE ITSELF WAS REWRITING THE RECORD IT " +
                 "REPORTS ON. *** Asking the suite runner for its population meant `--budget 1`, and writeTimings " +
                 "only refuses for --affected -- so this gate wrote gate-timings.json twice per run, 116 entries " +
                 "before it was caught, which is v4580's unprotected-filter finding committed by the round that " +
                 "cited it. selfchecks.mjs gained --count-only: the population, no spawn, no write, and the gate " +
                 "dropped from 3901 ms to 1754. The 116 are kept rather than reverted -- each is a real exit-0 run " +
                 "labelled `complete`, which v4580 defined as one cold sample, so the record says what they are -- " +
                 "and statedRuntime-selfcheck found the one badly out, extrudePolygon at 229 ms against a 31 ms " +
                 "gate with the HEADER as the correct half. Three gates were then repaired for the same class of " +
                 "pin: timingSemantics and timingSurvivors held a 0.6x-1.7x band around a frozen alone reading, " +
                 "and a gate is allowed to outgrow one -- dockSystem costs 149 ms against 45, puppeteer-bridge 133 " +
                 "against 44, both measured. They require movement off the stale value and a KIND now, and report " +
                 "the ratio; that demand sent four unprovenanced entries to be re-measured rather than excused, " +
                 "taking the count 397 -> 394. Verify: 33 green, 3 red, 1 load-only, 0 crash-only.",
    }),
    since310: Object.freeze({
        at: "v4583", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/runnerReach-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze(["tools/ship/runnerBudget-selfcheck.mjs", "tools/ship/ship.mjs",
                                "tools/ship/verify.mjs", "ai-bridge/shipBridge.js", "ai-bridge/sourceChainBridge.js"]),
        verdict: "green, 3431 ms at eight-wide and 3414 ms alone -- OVER the 3000 ms sweep budget on purpose, " +
                 "because the row that matters runs runnerBudget-selfcheck and reads the population it prints. " +
                 "*** THE CHECK THAT ASKS WHO BUDGETS A GATE DEFINED ITS POPULATION BY THREE STRING " +
                 "COINCIDENCES, AND ALL THREE ARE WRONG. *** v4582 found the third by accident: adding a " +
                 "SKIP_LINE regex to quickSweep introduced the string `-selfcheck` and pulled a runner of eleven " +
                 "rounds' standing into the population for the first time. Asked what else the predicates hid: " +
                 "(1) THE SPAWN TEST wanted process.execPath as the literal first argument, so verify.mjs (which " +
                 "destructures execFileSync from a dynamic import) and ship.mjs (which passes it through a `run` " +
                 "helper) were both outside -- THE SHIP AND ITS OWN GATE RUNNER -- and so was shipBridge, which " +
                 "reaches gates only through ship.mjs. (2) THE TIME-LIMIT TEST admits any `timeout:`, so " +
                 "sourceChainBridge entered on a 1500 ms HTTP health probe and was excluded again for naming no " +
                 "selfcheck, while the verify.mjs it spawns over a cloned tree carries NO cap at all: admitted " +
                 "for one wrong reason, excluded for another, so the absence was never a decision. (3) THE " +
                 "`-selfcheck` MENTION misses one level of indirection and misses enumeration entirely. *** THE " +
                 "MEASURED CONSEQUENCE, AT ITS TRUE SIZE: *** shipBridge's dry-run total was 600,000 ms around a " +
                 "process whose own per-step cap is 900,000 -- AN OUTER TOTAL BELOW THE INNER PER-STEP LIMIT IT " +
                 "CONTAINS -- so a dry run could die while its slowest step sat well inside its budget, reporting " +
                 "timedOut with no text, which is exactly what ship.mjs's v3936 note records after a 923-second " +
                 "ritual. Fixed: the bridge now reads ship.mjs's --step-timeout out of its source and uses a " +
                 "named multiple of it. verify.mjs's flat 180 s is NOT a live problem and is declared as such: " +
                 "the three lockstep gates it guards cost 61, 127 and 112 ms. No ship limit can come from " +
                 "gateBudget.MEASURED at all -- three single gates each exceed 900 s and the tail sums to 267 " +
                 "minutes -- so these are declared rather than derived, and budgetIsOwn says why. *** THE " +
                 "POPULATION IS A CLOSURE NOW: *** a runner spawns a gate, or spawns a file that is itself a " +
                 "runner, to a fixed point. 5 modules became 14, and FOUR REFINEMENTS WERE EACH FORCED BY A WRONG " +
                 "RESULT rather than foreseen -- a gate spawning a gate as a fixture is not an authority (25 " +
                 "members), requiring a runner is not being one (15), accepting a caller's timeout is not " +
                 "choosing one (six silent), and a runner may ENUMERATE rather than name, which the import-line " +
                 "fix had just pushed quickSweep back out over. What remains is named: a target built entirely " +
                 "from run-time data stays invisible, and that hole was load-bearing within minutes of being " +
                 "written down. 15 sabotages, 15/15 red, no 0-RED -- after a first pass with SEVEN 0-REDs, all " +
                 "of them here: six rows tested that a declaration EXISTS while the sabotage changed the " +
                 "BEHAVIOUR it declares, now replaced by one row that runs the check and reads its number, and " +
                 "one was a substring -- renaming budgetIsOwn to budgetIsOwnX left `/budgetIsOwn/` matching, so " +
                 "three declarations could be removed invisibly. Verify: 30 green, 3 red, 0 crash-only.",
    }),
    since309: Object.freeze({
        at: "v4582", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/skipReading-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze(["tools/ship/quickSweep.mjs", "tools/ship/timingKind-selfcheck.mjs",
                                "tools/ship/sweep-timings.json"]),
        verdict: "green, 322 ms at eight-wide and 267 ms alone, under the 3000 ms budget. *** THREE ENTRIES IN " +
                 "THE SWEEP RECORD WERE A GATE SAYING 'I DID NOT RUN'. *** render/holoPicture, render/holoAgree " +
                 "and tools/ship/pageFxOverlay skip without a rasteriser, exit 0 well under the budget, and sat " +
                 "in sweep-timings.json at 234, 164 and 175 ms with a confident `loaded` kind -- 2.4x to 3.6x " +
                 "their bare skip cost, so they were LOADED measurements of a refusal. tools/ship/selfchecks.mjs " +
                 "has refused to record a skip since v3941, after placementRender was filed at its skip time " +
                 "THREE TIMES, and gateBudget.UNRESOLVED names two of these three saying 'its former 55ms entry " +
                 "was the SKIP time'. THE TREE KNEW, FOR THE OTHER FILE -- v4580's fixture race and v4581's prose " +
                 "rule wearing a third face. *** AND THE MECHANICAL REASON IS BETTER THAN FORGETFULNESS: THE " +
                 "SWEEP COULD NOT SEE. *** runOneAsync spawned with `stdio: \"ignore\"`, and a skip's only " +
                 "evidence is the gate's printed declaration, so from an exit code a skip is indistinguishable " +
                 "from a fast pass. MEASURED BEFORE PAYING FOR IT: piping and keeping a 4 KB tail costs 1.4 ms a " +
                 "gate over eight gates timed three times each -- inside the noise, with two of the eight coming " +
                 "out FASTER captured -- about 2 s across a full sweep. Eleven rounds of blindness for two " +
                 "seconds. A fourth KIND was added, and it answers a DIFFERENT question from the other three: " +
                 "loaded/alone/capped say under what conditions the number was taken, skipped says the gate never " +
                 "started, and the branch rule CANNOT produce it -- ms-and-code can only ever call a skipping " +
                 "gate loaded, which is why it needed a writer and why no entry may carry it by inference. *** " +
                 "AND DRIVING THE FIXED WRITER ERASED v4579'S OTHER RECORD. *** kindsInferred names the 1,620 " +
                 "entries whose kind was back-derived rather than watched, written because 'an inference dressed " +
                 "as an observation is the fault five rounds of this arc have been about' -- and the writer was " +
                 "never taught the field, so a five-gate run took the list to ZERO and left 1,637 inferred kinds " +
                 "presenting as observed. Found by RUNNING the writer, as v4580's `complete: true` was; reading " +
                 "it shows a field that is simply absent. Now carried forward minus what each run observes. The " +
                 "census was driven by running all 22 skippable gates rather than by matching the record: 4 " +
                 "decline here, 3 held a code-0 reading, and the fourth was already safe because v4574's CAPPED " +
                 "kind had it. 18 of 22 produced real measurements, which is why this is narrow and not a claim " +
                 "the record is untrustworthy -- and gateBudget-selfcheck's UNRESOLVED cross-check was green " +
                 "before and after, correctly, because it reads the guarded file. A GREEN ROW IS NOT EVIDENCE " +
                 "THAT A RULE IS APPLIED, ONLY THAT IT IS APPLIED HERE. 15 sabotages, 15/15 red, no 0-RED, after " +
                 "one 0-RED that was this gate's own: timingKind's member-count condition could be replaced by " +
                 "`true` with nothing noticing, so this gate vouches for that pin from outside. Also recorded: " +
                 "the absence-check trap fired a FOURTH time in three rounds, and the three instruments are now " +
                 "written down -- raw source finds the text in the comment recording its removal, codeOnly EMPTIES " +
                 "string literals and broke the clause brought in to fix it, and noComments is the one for a " +
                 "string literal in live code. AND THE SKIP GUARD REVEALED AN ELEVEN-ROUND SILENCE ON ITS " +
                 "WAY IN: runnerBudget-selfcheck admits a runner that mentions `-selfcheck` outside its own name, " +
                 "and quickSweep happened never to contain the string until the new SKIP_LINE regex introduced it. " +
                 "It has budgeted gates with its own two numbers since it was written and never declared them. " +
                 "budgetIsOwn now says what they are: budgetMs is a MEMBERSHIP THRESHOLD about the sweep's total " +
                 "cost, capMs is a SIGKILL ceiling whose readings are the cap's clock. Verify: 29 green, 3 red, 0 " +
                 "load-only, 0 crash-only; the three reds equally red at HEAD.",
        widenedLate: Object.freeze(["tools/ship/quickSweep.mjs"]),
    }),
    since308: Object.freeze({
        at: "v4581", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/budgetProvenance-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze(["tools/ship/gateBudget.mjs", "tools/ship/gateBudget-selfcheck.mjs",
                                "tools/ship/hostScale-selfcheck.mjs", "tools/ship/gate-timings.json"]),
        verdict: "green, 132 ms at eight-wide and 84 ms alone, under the 3000 ms budget. *** THE TABLE EVERY " +
                 "BUDGET IN THE TREE RESTS ON HAD FOUR KEYS WRITTEN TWICE, AND NOTHING PARSES IT. *** " +
                 "gateBudget.MEASURED is the curated slow tail and hostScale divides every rig budget by it. " +
                 "configContract, compose, assumptionMap and census each appeared twice in one object literal; a " +
                 "repeated key is not an error in JavaScript and the later one silently wins. Three re-stated the " +
                 "same number and were harmless -- WHICH IS WHY ALL FOUR SURVIVED. configContract re-stated a " +
                 "DIFFERENT one, 78000 at one site and 72509 three hundred lines later, so one typed budget was " +
                 "discarded with no trace and THE SMALLER READING WAS IN FORCE -- against the losing entry's own " +
                 "written rule, 'the larger of the two readings is used'. The language overruled the table quietly, " +
                 "because a rule stated in prose is enforced by whoever happens to read it. *** AND THE ENTRY WAS " +
                 "WRONG BY TWENTY-FOUR TIMES EITHER WAY: *** re-measured at 2997/2856/3473 ms, three runs alone, " +
                 "all exit 0. hostScale-selfcheck has REPORTED it as the table's worst under-record for rounds and " +
                 "reporting is where it stopped. So the conservative rule pointed the wrong way -- 'take the " +
                 "larger' protects against a fast sample when both readings are current and entrenches the staler " +
                 "one when they are not, and the accident was LESS wrong than the rule. Removed rather than " +
                 "corrected: the table is the slow tail and a 3 s gate is the population, so it falls to the " +
                 "default and its budget RISES from 145,018 to 329,697 ms; correcting in place to 3473 x 2 would " +
                 "have given 6,946 ms to a gate observed at 5,769 ms under load. Its own first sentence had always " +
                 "said 'IT NEVER NEEDED A BIGGER BUDGET AT ALL'. *** THE GATE GUARDING THE TABLE ASSERTED " +
                 "PROVENANCE AND CHECKED ARITHMETIC IT DEFINES ITSELF: *** gateBudget-selfcheck's row read " +
                 "`budgetFor(k) === MEASURED[k] * TAIL_HEADROOM` under the sentence 'every named budget is derived " +
                 "from a recorded completion, not a guess'. budgetFor's body IS that expression, so it could not " +
                 "fail for any entry -- including the 24x one -- and the sentence is false for 50 of 62 rows, which " +
                 "have no MEASURED_RUNS at all. The mechanism for provenance EXISTS here, is derived rather than " +
                 "typed, and covers a fifth of the table. Replaced by a branch check, an independent maximum, a " +
                 "spelling check and a ratchet. *** AND v4580'S OWN CLAIM IS WITHDRAWN WHERE I WROTE IT: *** " +
                 "'the denominator stays MEASURED because its numbers were all obtained the same way', written " +
                 "into hostScale-selfcheck one round ago without measuring it, in the very row that exists to name " +
                 "unprovenanced records. The conclusion survives on a smaller measured reason: 43 of 49 entries " +
                 "agree with the independent records within 1.5x and NONE is lower, which is the half that matters " +
                 "-- so the round's finding is the PROCESS, not the numbers, and a row says which. 17 sabotages, " +
                 "17/17 red, no 0-RED -- AFTER A FIRST PASS THAT PRODUCED FOUR 0-REDS, EVERY ONE A DEFECT IN THIS " +
                 "ROUND'S OWN WORK: the nested-row guard was unreachable behind a `^\\s*` anchor and two fixtures " +
                 "failed to drive it; the withdrawn-claim row used codeOnly, which empties string literals, so " +
                 "re-adding the claim to a detail string moved nothing; gateBudget-selfcheck's new ratchet baseline " +
                 "could be raised from 50 to 60 with nothing noticing, so the honesty check now lives in the other " +
                 "gate; and one was the HARNESS scoring each mutation against a single gate, which reported the " +
                 "restored tautology as invisible when the whole point is that only the other gate can see it.",
    }),
    since307: Object.freeze({
        at: "v4580", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/timingProvenance-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze(["tools/ship/selfchecks.mjs", "tools/ship/gateBudget.mjs", "tools/ship/hostScale.mjs",
                                "tools/ship/hostScale-selfcheck.mjs", "tools/ship/gate-timings.json",
                                "tools/ship/treeRead.mjs", "tools/ship/treeRead-selfcheck.mjs",
                                "tools/ship/timingCoverage-selfcheck.mjs", "tools/ship/timingLoad-selfcheck.mjs",
                                "tools/ship/timingSurvivors-selfcheck.mjs", "tools/ship/timingSemantics-selfcheck.mjs",
                                "tools/ship/timingRecords-selfcheck.mjs"]),
        verdict: "green, 197 ms at eight-wide and 133 ms alone, under the 3000 ms budget. *** THE ROUND'S OWN " +
                 "PREMISE WAS WRONG AND THE FIRST MEASUREMENT SAID SO. *** v4579's close proposed that " +
                 "gate-timings.json 'mixes a batch quantity with individual ones exactly as the sweep column " +
                 "did'. IT DOES NOT: the runner's loop is `for (const f of toRun)` around execFileSync, so a " +
                 "full-run entry and a hand-timed entry are the same physical quantity. Measured rather than " +
                 "read -- 89 gates summed 30,525 ms inside a 51,259 ms wall, 0.60x, where a five-worker pool " +
                 "would sit near 5x. The analogy had been carried across on the strength of two files looking " +
                 "alike. *** WHAT WAS ACTUALLY THERE IS A CLAIM THAT THE FIX COULD NOT BE DONE. *** " +
                 "hostScale-selfcheck has asserted since v3936 that 'an entry cannot say whether it is a TIME " +
                 "or a TRUNCATION' and concluded 'it cannot be detected from here'. True of a READER, false of " +
                 "the PRODUCER: tools/ship/selfchecks.mjs branches on completed / killed / declined-to-run BY " +
                 "NAME and then wrote a bare integer. 644 versions of the tree acted on the general version of " +
                 "that sentence, and v4579 had just made this exact repair on the other file. *** AND THE ROW " +
                 "PINNED A REPRESENTATION WHILE CLAIMING A PROPERTY, SO IT COULD NEVER HAVE NOTICED. *** Its " +
                 "condition was `entries.every(([, v]) => typeof v === 'number')`, which is TRUE of " +
                 "sweep-timings.json -- a file where every entry does say what it is, via a sibling map. It " +
                 "would have stayed green straight through the repair with its own sentence gone false; " +
                 "measured on both files to establish that it is a fact about the predicate, not about the " +
                 "data. Repaired to pin the unprovenanced COUNT, which goes red the day it reaches zero -- the " +
                 "day the reason expires. *** THE REPAIR: the runner stamps kinds, boxes and per-entry stamps " +
                 "at the point of decision, *** plus a boxLegend decoding each machine id and " +
                 "coverage.unprovenanced counting what carries none of it. 934 of 1,332 entries stamped by one " +
                 "bounded pass; the remaining 398 are UNRECOVERABLE, and the ratchet may only fall. The box id " +
                 "is derived from the machine and deliberately excludes the node version, which is not a new " +
                 "machine; its facts are asserted equal to androidRunner.mjs's existing fingerprint rather " +
                 "than defined a second time. *** RUNNING THE WRITER FOUND A SECOND FAULT THAT READING IT DID " +
                 "NOT. *** writeTimings was called with a literal `true`, so a --budget pass covering 953 of " +
                 "1,630 gates wrote coverage.complete: true -- exactly the 'partial measurement wearing a " +
                 "complete one's name' v3584's own note warned of, arriving through a filter added one round " +
                 "after the note. `complete` is now derived from the population; the true that pass wrote is " +
                 "corrected to false by hand in the record, with the reason beside it. *** AND THE HEADLINE " +
                 "THIS ROUND WANTED WAS REFUSED BY ITS OWN ARITHMETIC. *** The sixteen entries this arc " +
                 "re-timed by hand went 12 DOWN and 4 UP. A faster second machine predicts 16-0; staleness " +
                 "alone predicts a coin toss; 12-4 gives two-sided p 0.077 and the threshold on n=16 is 13. ONE " +
                 "MORE CORRECTION WOULD HAVE CARRIED IT, so whether this file mixes two boxes or is merely " +
                 "stale is left unsettled and is not claimed either way -- and v4578's 10-0 cohort is not the " +
                 "evidence it looked like, because the detector that found it SELECTS for entries that are too " +
                 "high. Also recorded: hostScale.mjs still cites assumptionMap at 47,729 ms as its reason for " +
                 "refusing this file, and the file holds 333,639 -- 7.0x -- which its own gate noticed at v3936 " +
                 "while the module's header was never re-read; and the 300 s truncation story does not describe " +
                 "today's file, which holds 13 entries above 300 s outright. 17 sabotages, 17/17 red, no 0-RED, " +
                 "nothing crashed. TWO OF THE SEVENTEEN EXIST BECAUSE THE FIRST DRAFT CARRIED A CLAUSE THAT " +
                 "COULD NOT FAIL: `pTwoSided > 0.05` alongside a pinned 12-4, where the counts determine p. " +
                 "Replaced by the threshold derivation, which can be wrong and is now checked. *** AND THE VERIFY SWEEP " +
                 "FLAPPED, WHICH TURNED OUT TO BE A RACE v4409 HAD ALREADY CLOSED SOMEWHERE ELSE. *** " +
                 "runtimeGap-selfcheck went red about half the time at eight-wide and green in three runs alone, " +
                 "reading 4081 files instead of 4080. Four gates plant a `__`-prefixed *-selfcheck.mjs on disk " +
                 "while they run; v4409 taught gateSweep's enumerateGates to skip them, because a discovered " +
                 "fixture got RUN, and the rule was never applied to tools/ship/treeRead.mjs -- the SHARED walker " +
                 "four censuses read. Caught by polling the tree during a sweep and finding " +
                 "tools/roundhouse/__routeProbe-selfcheck.mjs in the act, not by reasoning about the counts. " +
                 "Excluded at the walker so all four get it at once, with a driven control that plants a real " +
                 "fixture and a real ordinary file, because an exclusion that dropped every arrival would pass " +
                 "the first half and blind every census. gateQuality-selfcheck was ALSO red at HEAD, for a " +
                 "prose-debt site in timingRecords absent from its frozen baseline; converting it to proseHas " +
                 "made the row FAIL, which is the answer -- the phrase is a string literal, and gateQuality's own " +
                 "header measured at v3106 that 28 of 38 such conversions break because the regex was never " +
                 "hunting a comment. A substring test fixed it and that gate is green for the first time in this arc. " +
                 "Five downstream gates needed repair, all of them pinned to something this round moved: three " +
                 "pinned an exact millisecond and went red on a BETTER measurement, timingCoverage pinned a " +
                 "count of the record's top-level keys, and timingLoad recomputed a v4576 finding against a live " +
                 "file. Standing reds left in place: budgetExile, definitionGates' three immovable ratchets, and " +
                 "staleness, all equally red at HEAD -- staleness confirmed so by a probe run BEFORE this round's first " +
                 "edit, not assumed. *** AND THE VERIFY HARNESS ITSELF WAS WRONG ABOUT THREE GATES. *** At " +
                 "eight-wide it reported rigProgress, sweepBudget and shadowedHelper as reds; each is green alone, " +
                 "twice. They are load-sensitive, and a harness that calls a load failure a red is the harness " +
                 "being wrong about the tree -- the same shape as 'a crash is not a verdict', one level out. It " +
                 "now re-runs every red ALONE before naming it, and reports LOAD-ONLY apart from RED. Final: 26 " +
                 "green, 3 red, 1 load-only, 0 crash-only over 30 gates.",
    }),
    since306: Object.freeze({
        at: "v4579", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/timingKind-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze(["tools/ship/quickSweep.mjs", "tools/ship/recordDrift.mjs", "tools/ship/timingLoad-selfcheck.mjs"]),
        verdict: "green, 0.10 s at eight-wide, under the 3000 ms budget. *** v4578 NAMED THE REPAIR IT DID NOT " +
                 "DO AND THIS IS IT: THE COLUMN SAYS WHAT ITS NUMBERS ARE. *** quickSweep writes `kinds[gate]` " +
                 "-- loaded, alone or capped -- in the SAME STATEMENT that chooses the millisecond, so the " +
                 "label cannot drift from the branch that picked it. The 1,620 entries predating this round " +
                 "have the kind INFERRED from the branch rule and every one of them is named in " +
                 "`kindsInferred`, because an inference dressed as an observation is the fault five rounds of " +
                 "this arc have been about. Census: 1,167 loaded, 335 alone, 137 capped. *** AND WRITING THE " +
                 "FIELD FORCED THE QUESTION FOR EVERY ENTRY, WHICH FOUND EIGHT MORE WRONG ONES, ALL OF THEM " +
                 "THIS ARC'S. *** v4578 found nine and fixed nine because it looked only at what v4577 wrote. " +
                 "Asking of every entry this arc ever hand-wrote turns up eight more alone readings in " +
                 "under-budget slots, from v4575, v4576, v4577 AND v4578 -- one per round, INCLUDING the " +
                 "round that diagnosed the problem. *** FOUR OF THE EIGHT ARE THE ARC'S OWN GATES: *** " +
                 "timingRecords, timingLoad, timingSurvivors and timingSemantics, whose runtimes were filed " +
                 "as alone readings every single round while those same files argued about this defect. " +
                 "Seventeen wrong entries across five rounds. *** THE ENUMERATION ALSO HAD TWO FALSE MEMBERS " +
                 "AND THE MEASUREMENT REFUSED THEM. *** reskin and winPathGuard were listed as arc-written " +
                 "and are not -- v4577 corrected their gate-timings rows, not their sweep rows -- and reskin " +
                 "measured 0.56x of its recorded value at eight-wide, which is impossible for an alone " +
                 "reading and ordinary for a correct loaded one. Ten became eight because the numbers " +
                 "disagreed with the list. *** AND THE PRE-FLIGHT DEMANDS A KIND NOW, WHICH IS WHAT ENDS THE " +
                 "CLASS RATHER THAN THIS INSTANCE OF IT. *** recordDrift has asked for a runtime and a stamp " +
                 "since v4408; a new gate owes it a kind too. A reading whose quantity is unknown is not a " +
                 "reading anybody can compare, and seventeen entries are the evidence. THE NEW GATE'S OWN " +
                 "ENTRY IS A LOADED READING measured at exactly eight concurrent, because the gate that " +
                 "demands kinds cannot carry the wrong one. Eight sabotages, 8/8 red, no 0-RED. Two " +
                 "downstream reds along the way: timingLoad still asserted the ALONE reading for a repaired " +
                 "entry -- the third gate in this arc to carry that mistaken assertion -- and " +
                 "recordDrift-selfcheck was red on its own fixture because a new file had made the runtimeGap " +
                 "census stale, which the bookkeeping closed. The second one was NOT this round's edit: " +
                 "reverting the edit left it equally red, which is how that was established rather than " +
                 "assumed. The final verify also surfaced budgetExile-selfcheck red and it is equally red at " +
                 "HEAD: it reports a recorded REPAIR regressed in staleness-selfcheck and caseStudy-selfcheck, " +
                 "and staleness was already on v4571's list of tree-wide census gates red at HEAD. Same " +
                 "standing debt seen from another instrument, left where it was.",
    }),
    since305: Object.freeze({
        at: "v4578", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/timingSemantics-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze(["tools/ship/timingSurvivors-selfcheck.mjs", "tools/ship/timingRecords-selfcheck.mjs"]),
        verdict: "green, 0.06 s, under the 3000 ms budget. *** v4577 PROPOSED A SHARPER DETECTOR AND CHECKING " +
                 "ITS PREMISE FOUND SOMETHING BIGGER: THE SWEEP'S MS COLUMN HOLDS TWO DIFFERENT QUANTITIES. " +
                 "*** quickSweep writes `serialMs ?? parallelMs`, and a gate only gets a serialMs if it was " +
                 "red or crossed the budget. So UNDER the budget the number is a LOADED eight-wide reading " +
                 "and AT OR OVER it an ALONE one, in one column, with nothing marking which. MEASURED over " +
                 "the dated comparable gates: under the budget the column sits at 1.93x gate-timings, which " +
                 "IS the load factor, and at or over it at 0.98x, which is two alone readings agreeing. The " +
                 "boundary is exactly the budget, predicted from the source before it was measured. *** AND " +
                 "THIS ARC PUT THE WRONG QUANTITY IN NINE ENTRIES. *** v4577 wrote alone readings into " +
                 "sweep-timings reasoning that quickSweep `prefers the serial -- which is an alone reading " +
                 "too`; true only for a gate that GETS one, and nine of its fourteen sit under the budget " +
                 "and never do. Re-measured at exactly eight concurrent -- two batches of eight covering all " +
                 "nine, three rounds -- and replaced. Those numbers have now moved TWICE, once wrongly by " +
                 "this arc. *** THE DETECTOR ITSELF WORKS WHERE THE COLUMN'S MEANING IS KNOWN: TEN FOR TEN, " +
                 "NO FALSE POSITIVES. *** Eleven candidates, ten usable -- the eleventh dropped because this " +
                 "arc had corrupted its column -- all ten green, all ten with a gate-timings entry between " +
                 "2.0x and 6.3x too high. *** AND NOT ONE WAS VISIBLE TO v4577'S OWN CRITERION: *** their " +
                 "residuals run 0.66x to 2.73x, all under its 3x line, because an entry three times too high " +
                 "makes a SYMMETRIC ratio of about 1.4x, which reads as agreement. The old criterion " +
                 "conflates `gate-timings is wrong` with `gate-timings is right`. Its magnitude is not " +
                 "usable below about 100 ms -- esFlight3dMath predicted 12.63x and measured 5.34x, because a " +
                 "40 ms loaded reading is mostly process startup -- but the DIRECTION held for all ten. " +
                 "Nineteen entries corrected. *** AND TWO DOWNSTREAM GATES WENT RED ON CONCEPTUAL GROUNDS, " +
                 "NOT BOOKKEEPING. *** timingSurvivors asserted the repaired sweep entries hold the ALONE " +
                 "reading -- the very thing refuted here -- and timingRecords kept an invariant that every " +
                 "moved entry moves TOWARD the alone measurement, which is false for the sweep column by " +
                 "construction. Both now hold the per-file rule: gate-timings toward the alone reading, the " +
                 "sweep column toward the quantity its own branch records. Eight sabotages, seven red. The " +
                 "one zero is loosening a bar, the class v4576 proved inert and v4577 failed to fix with a " +
                 "second row; three rounds have met it, so this file pins the number it REPORTS instead of " +
                 "pretending to police its bar. That zero was also scored RED once by mistake when the " +
                 "sabotage harness itself was edited and crashed -- rc 1 with no FAIL line, which the " +
                 "crash-aware rule reads as red. Applied cleanly it is rc 0, and a crash is not a verdict.",
    }),
    since304: Object.freeze({
        at: "v4577", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/timingSurvivors-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze(["tools/ship/timingLoad-selfcheck.mjs", "tools/ship/timingRecords-selfcheck.mjs"]),
        verdict: "green, 0.06 s, under the 3000 ms budget. *** v4576 CLOSED SAYING THE SURVIVORS WERE A RATE " +
                 "AND NOT A LIST. THE LIST IS TWELVE AND ALL TWELVE WERE RUN. *** Three times alone, twice " +
                 "with all twelve at once, 60 runs. *** EVERY ONE IS GREEN *** -- whatever these numbers are " +
                 "wrong about, none hides a failing gate, which is a different answer from v4575's " +
                 "commentFalsePass because that was the CAP-READING population and none of these twelve was " +
                 "ever killed. *** AND THE STAMP PREDICTS WHICH FILE IS WRONG, BOTH WAYS, TWELVE FOR TWELVE. " +
                 "*** The step v4576 got half-right is that gate-timings records an ALONE run and the sweep " +
                 "records a LOADED one, so `which is closer to the measurement` is the wrong question -- the " +
                 "sweep entry is SUPPOSED to be higher. Judging each entry against what it claims to be: ALL " +
                 "EIGHT UNDATED entries have a stale SWEEP number, and ALL FOUR DATED entries have a stale " +
                 "GATE-TIMINGS number. No exceptions in either direction, which is what the stamp should " +
                 "mean -- an undated reading is pre-v4408 and therefore the sweep drifted, a dated one is " +
                 "recent so a disagreement surviving load belongs to the other file. v4576 saw one direction " +
                 "of this from four gates; twelve give both. *** THE CRITERION HAS NO FALSE POSITIVES: *** " +
                 "two of the twelve are stale in BOTH files and ten in exactly one, and NONE has two " +
                 "plausible entries -- a test costing no runs at all fired twelve times and was right twelve " +
                 "times. Twelve-wide costs 3.56x against 2.15x at eight, and even that MORE load falls short " +
                 "of all eight sweep entries that are too high, the worst by 45x, which is what rules load " +
                 "out rather than making it unlikely. One is stale the OTHER way -- dockSystem recorded BELOW " +
                 "its own loaded reading -- and a row claiming `falls short of every` could not hold both, " +
                 "which is how that came out. FOURTEEN ENTRIES CORRECTED, five in gate-timings and nine in " +
                 "the sweep, all from this round's alone readings, and entries judged SOUND were left alone. " +
                 "*** AND THE REPAIR BROKE TWO DOWNSTREAM GATES, WHICH IS THE THIRD AND FOURTH TIME IN THREE " +
                 "ROUNDS. *** timingLoad went red on three rows and timingRecords on two, because both " +
                 "derive findings from records this round repaired. The rule that settles it is now written " +
                 "in both: a gate reporting a MEASUREMENT OF A RECORD'S STATE must freeze that state, and " +
                 "only a row asserting a live INVARIANT may read the current file. timingLoad's survivor " +
                 "count became a RATCHET -- v4576's thirteen recorded, the live count may only fall, a rise " +
                 "means new drift -- and timingRecords' verdict row now derives from `gateWas` and " +
                 "`sweepWas` with a live row requiring that every moved entry moved TOWARD the measurement. " +
                 "Eight sabotages, seven red. The one zero is loosening the precision bar from `=== 0` to " +
                 "`<= 1`, which is the class v4576 proved inert: weakening an assertion moves no reading. " +
                 "This round added a second row carrying the claim as a partition, re-ran the mutation, and " +
                 "it was STILL invisible -- the row is kept for being the stronger statement, not for " +
                 "catching anything, and the gate says so rather than implying the repair worked.",
    }),
    since303: Object.freeze({
        at: "v4576", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/timingLoad-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze(["tools/ship/timingRecords-selfcheck.mjs"]),
        verdict: "green, 0.07 s, under the 3000 ms budget. *** v4575 NAMED THREE EXPLANATIONS FOR ITS 43% AND " +
                 "COULD NOT SEPARATE THEM. SIX RUNS SEPARATED THEM. *** Eight gates, three rounds with all " +
                 "eight dispatched at once exactly as quickSweep runs them, three rounds each alone. *** THE " +
                 "LOAD FACTOR IS 2.15x AND THE THRESHOLD WAS 2x -- which is most of v4575's finding, and this " +
                 "round is the correction. *** Across the 949 gates whose sweep reading carries a real capture " +
                 "stamp the median disagreement is 1.94x; divided by the measured load factor that is a " +
                 "residual of 0.90x. THE TWO RECORDS AGREE once the conditions each was taken under are " +
                 "accounted for, and 46% cross a 2x line only because the median sits just under it. A " +
                 "threshold artifact was reported as a defect, and timingRecords-selfcheck's headline now " +
                 "says so at the top of its own file. *** WHAT SURVIVES IS ABOUT THIRTEEN GATES, AND THE TWO " +
                 "FILES FAIL IN DIFFERENT COLUMNS. *** `sweepWas / 8-wide` asks whether the SWEEP entry is " +
                 "explained by load: seven of eight are, and the one that is not is hostScale at 5815 against " +
                 "160 measured eight-wide, a 36x residual. `alone / gate-timings` asks whether the " +
                 "GATE-TIMINGS entry is right: six of eight are within 30%, so that file is NOT broadly stale " +
                 "-- the age explanation is refuted for most of the sample -- and the two that fail go in " +
                 "OPPOSITE directions, rigJobs having grown 128x and dockSystem shrunk 20x. Three wrong " +
                 "numbers across two files, which is why v4575's spot-check split two and two: not noise, two " +
                 "failure modes in two records. *** AND THE CAPTURE STAMP PREDICTS ONE FILE'S STALENESS AND " +
                 "NOT THE OTHER'S. *** Every unexplained SWEEP reading in the sample is undated, and across " +
                 "the population undated readings carry a residual above 3x at 5.1% against 0.3% for dated " +
                 "ones -- SIXTEEN TIMES the rate. But dockSystem's bad number is in gate-timings while its " +
                 "sweep reading is dated and fine, so the stamp says nothing about the other file. *** THE " +
                 "ROUND THEN DELETED ITS OWN EVIDENCE AND HAD TO RESTRUCTURE. *** Re-taking the two stale " +
                 "sweep entries from this experiment's own alone-readings -- the right thing to do -- made the " +
                 "residual row read 0 unexplained and went red. The table now carries `sweepWas` and " +
                 "`datedWas`, the state as the experiment found it, and a second row checks the repair against " +
                 "the live file: v4476's shape, a row built to go red the day somebody fixes it, followed by " +
                 "the record of that day. AND IT HAPPENED TWICE: the same correction flipped a verdict in " +
                 "v4575's own four-gate spot-check one gate over, reddening timingRecords-selfcheck in the " +
                 "final verify. That table carries `sweepWas` now as well. Nine sabotages, 9/9 red, no 0-RED after one repair: the load " +
                 "factor's first row accepted anything between 1.5x and 3x, and lowering one table reading " +
                 "moved the median 2.15x -> 2.08x inside that band. A number everything downstream divides by " +
                 "cannot sit in a tolerance a single edit fits through, so it is pinned to the hundredth now. " +
                 "One row also went red on its own data first: it claimed all but the slowest gate slow down " +
                 "under load, and the slowest does too, by 1.01x -- monotone for eight of eight is the true " +
                 "and stronger property.",
    }),
    since302: Object.freeze({
        at: "v4575", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/timingRecords-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze(["tools/ship/commentFalsePass-selfcheck.mjs"]),
        verdict: "green, 0.06 s, under the 3000 ms budget. *** v4574 CLOSED ON GATE PROSE ABOUT COST AND THE " +
                 "INSTRUMENT ALREADY EXISTED. *** statedRuntime-selfcheck has compared stated runtimes against " +
                 "observed ones since v3213, and it was RED, naming four drifted headers. Not a rung to build " +
                 "-- a red to act on, and the second round running where the first finding was that the tree " +
                 "already knew. All four were corrected FROM A CLOCK: reconQualityBind ~0.4s against a " +
                 "measured 2.35s, commentFalsePass ~4.2s against 9.6s, shaderCensus ~0.5s against 1.5s, " +
                 "spacesimStart ~1.4s against 0.14s -- three under, one 10x over. *** AND ONE OF THE FOUR WAS " +
                 "HIDING A RED GATE. *** commentFalsePass EXITS NON-ZERO, and is recorded in sweep-timings at " +
                 "20,025 ms with exit 124 -- one of the 137 cap readings v4574 counted, which is exactly why " +
                 "nobody had looked. *** THAT FALSIFIES v4574'S OWN SENTENCE *** that 'not one of the gates " +
                 "the sweep has only ever killed is red'. Seventeen sampled were green; the population is " +
                 "not, and capReading-selfcheck's row now says so instead. Its red was a FALSE POSITIVE -- " +
                 "qrChannel asserts the vendored QR decoder carries the MIT copyright and permission notice " +
                 "in full, and a licence notice exists only as a comment, so reading it off raw source is the " +
                 "row working. Repaired with a DECIDABLE exemption on the asserted text, which is what that " +
                 "gate's own second row demands. *** AND FOLLOWING statedRuntime'S INSTRUCTION WOULD HAVE " +
                 "WRITTEN A WRONG NUMBER. *** It says to correct a drifted header 'FROM THE MEASUREMENT in " +
                 "gate-timings.json'. For shaderCensus that file held 239 ms against a measured 1501 -- the " +
                 "header was right to be flagged and THE RECORD WAS THE STALE HALF. Re-timed there, with the " +
                 "reason in the file's own captured note. *** SO THE ROUND'S SUBJECT BECAME THE PAIR OF " +
                 "RECORDS. *** gate-timings.json and sweep-timings.json both claim ms per gate. Where the " +
                 "sweep reading is real, 1143 gates appear in both and 496 of them -- 43% -- DISAGREE BY 2x " +
                 "OR MORE, the worst by 144x. A four-gate spot-check against a clock splits TWO AND TWO on " +
                 "which record is closer, so neither can correct the other. The disagreement is 487-to-9 " +
                 "one-directional, which growth and an eight-wide sweep both explain -- and the nine that run " +
                 "the other way, neither does. Eight sabotages: six red, and the two zeros are mutations that " +
                 "CHANGE NOTHING rather than rows that miss something. Dropping the cap clause from the filter " +
                 "selects the identical 1143 gates, VERIFIED -- every capped entry in the overlap carries exit " +
                 "124, so the code filter already removes it, which is the inertness the gate states outright. " +
                 "And loosening a threshold cannot redden the row it loosens. One row was repaired before " +
                 "that stood: the first version asserted the disagreement 'runs both ways, so it is not " +
                 "growth and not parallel load' while PRINTING 487 against 9 -- a label refuted by its own " +
                 "detail, and 98% in one direction is precisely what growth looks like.",
    }),
    since301: Object.freeze({
        at: "v4574", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/capReading-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green, 0.11 s, under the 3000 ms budget. *** v4573 LEFT THE BIMODALITY AS THE NEXT RUNG AND " +
                 "THIS ROUND FAILED TO REPRODUCE IT. *** Three hypotheses for headlessGpu-selfcheck's 181 s " +
                 "stall, each tested and REFUTED: the section that spawns a deliberately-crashing child (18 " +
                 "child runs, 55-73 ms, zero stalls); plain concurrency (2, 4 and 8 copies at once scale to " +
                 "2.6 s, not 180); a dirty working tree (green clean and dirty alike). Roughly twenty-five " +
                 "runs, no reproduction. It is real -- seen twice at ~181 s -- and it is NOT explained here, " +
                 "which is recorded rather than dressed up. *** SO THE ROUND TOOK THE MEASURABLE HALF, AND " +
                 "FOUND THE TREE ALREADY KNEW PART OF IT. *** sweepCoverage's notVerdicts has said since " +
                 "v4460 that a non-zero code beside a killed process is no verdict, and v4460 studied the " +
                 "OTHER class at length: 314 over-budget entries carrying a stale code 0, of which running " +
                 "them one at a time found TWENTY-TWO RED. *** THE 137 ARE THE CLASS NOBODY RAN. *** They " +
                 "carry code 124: killed in parallel AND in the serial re-run every phase-1 red gets, since " +
                 "quickSweep files serialMs ?? parallelMs. Their recorded millisecond is the cap plus a few " +
                 "-- the whole population spans 20,006 to 20,461, a 2.27% band, which is what a killer's " +
                 "clock looks like and not what runtimes look like. Only TWO of the 137 are named anywhere " +
                 "in sweepCoverage. *** SEVENTEEN WERE LET FINISH. ALL SEVENTEEN ARE GREEN. *** And SEVEN OF " +
                 "THE SEVENTEEN finish INSIDE the 20 s cap they were killed at, the fastest in 13,473 ms, " +
                 "while the rest run out to 549,048 -- a 41x spread filed under one indistinguishable " +
                 "number. *** THE CONSEQUENCE IS NOT THE ONE THE ROUND WENT LOOKING FOR, AND THE GATE SAYS " +
                 "SO. *** The hypothesis was that rotation() spends a cap reading as if it were a cost. It " +
                 "does not: rotation and doorCandidates draw from c.over, and classify() files a killed " +
                 "reading under c.killed -- ZERO of the 24 gates the rotation picks is a cap reading. An " +
                 "earlier draft of this gate asserted the opposite, from a scratch probe that had built its " +
                 "own coverage object with everything in `over`; the measurement was of a rotation that does " +
                 "not exist. What IS wrong is the other side of that exclusion: rotation is the mechanism by " +
                 "which an over-budget gate gets re-observed, and the killed bucket sits outside it, so " +
                 "nothing ever schedules these 137. Their absent verdict is a property of the machinery, and " +
                 "it shows -- 129 of the 137 still carry the pre-v4408 `unknown` stamp. Eight sabotages " +
                 "scored 2/1/1/1/2/1/2/6, no 0-RED, after one repair: the row counting how many finish under " +
                 "the cap said `>= 6` where the derived answer is 7, and moving a frozen table entry above " +
                 "the cap went 0-RED -- a threshold set one below the value it guards absorbs exactly one " +
                 "defect, and a frozen table needs no slack. ALSO CORRECTED: v4573 reported " +
                 "gateSelection-selfcheck red at HEAD. It is green in four subsequent runs, clean tree and " +
                 "dirty, at ~68 s. That gate is non-deterministic; the earlier report rested on one " +
                 "observation and does not hold. AND AN EIGHTEENTH GATE ARRIVED FROM THIS ROUND'S OWN " +
                 "VERIFY: tools/ship/redCensus-selfcheck.mjs, recorded at 20,021 ms with code 124 and the " +
                 "same pre-v4408 stamp, exceeded a 400-SECOND harness timeout without completing. It is kept " +
                 "OUT of the frozen table -- a timeout is a lower bound, not a measurement -- but it puts " +
                 "the population's upper end past 400 s, and that gate's own header describes it as taking " +
                 "two minutes.",
    }),
    since300: Object.freeze({
        at: "v4573", swept: 0, green: 0, red: 0,
        added: Object.freeze([]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze(["tools/ship/definitionGates-selfcheck.mjs",
                                "tools/ship/headlessGpu-selfcheck.mjs",
                                "render/temporalLock-selfcheck.mjs"]),
        verdict: "NO NEW GATE. Three existing ones widened, which is what the work was. *** v4572 LEFT SEVEN " +
                 "TREE-WIDE CENSUS GATES RED AND NAMED definitionGates FIRST: 618 EXPORTED SYMBOLS WITH NO " +
                 "GATE NAMING THEM, AND THE QUESTION WAS WHETHER THAT IS DEBT OR A DETECTOR MISCOUNTING. *** " +
                 "It is both, and the split is measurable. The census resolves a module to ONE gate, by " +
                 "filename. That was right when a module had one gate; the temporal arc alone put ELEVEN " +
                 "beside render/ringFloor.mjs, and EPS_F32 and ARITHMETIC_ULPS are driven hard by " +
                 "ringFloorPhase-selfcheck while ringFloor-selfcheck never names them -- so both counted as " +
                 "definitions nobody had looked at. MEASURED tree-wide over all shapes: 619 unmentioned under " +
                 "the name-matched rule, 480 once a gate that IMPORTS the module may also name it, the " +
                 "difference being 139 symbols named in an owning gate's BODY. *** BUT IT IS NOT A WAY OUT, " +
                 "AND THAT IS THE POINT: *** physics reads 55 -> 37 against a floor of 0 and tree-wide narrow " +
                 "321 -> 237 against 209, so TWO OF THE THREE FROZEN RATCHETS STAY RED under the wider rule. " +
                 "Only the all-shapes count falls under its pin, by 102, WITHOUT ONE SYMBOL BECOMING BETTER " +
                 "TESTED -- a count that drops because the instrument improved is not the tree improving, and " +
                 "reading it as progress would be the same error as lifting a baseline to meet the tree. *** " +
                 "SO IT IS A SECOND CENSUS, NOT AN EDIT TO THE FIRST *** -- the rule this file set for itself " +
                 "at v4535 -- and the three frozen numbers are untouched: `owners` defaults to null wherever " +
                 "they are computed, and they still read 55 / 321 / 613. The new rule gets its own floor at " +
                 "475. *** AND THE ROUND PAID FIVE, ALL OF THEM THIS ARC'S OWN DEBT. *** Of 21 unmentioned " +
                 "symbols in the arc's modules, 16 were the detector's blind spot and FIVE were genuinely " +
                 "unlooked-at: nearestTexel, which every ring fetch in temporalLock goes through and whose one " +
                 "interesting choice was explained only by a comment in the SHADER beside it (floor, not " +
                 "round, because round ties to even in WGSL and half-up in JavaScript); and BYTES_PER_TEXEL, " +
                 "paddedBytesPerRow, halfToDouble and ICD_ROOT -- the arithmetic that turns a read-back " +
                 "texture into numbers, which v4572's closing listed as the thing it could not check. All " +
                 "five are keyed now, not mentioned: the half decode is held to the format's OWN mantissa " +
                 "(worst 4.685e-4 against 2^-11 = 4.883e-4 over 2000 values), all three exponent branches are " +
                 "reached, and the unknown-format fallback is taken at a width where four and eight bytes " +
                 "DIFFER, because 64 is exactly the width where they do not. The arc now owes zero. *** A " +
                 "SABOTAGE ASKED FOR THE ROUND'S LAST ROW. *** Nine mutations scored 2/1/1/2/5/1/1/4 and then " +
                 "a ninth: leaking `owners` into a frozen ratchet moved it from 321 to 234 and NOTHING CAUGHT " +
                 "IT, because all three were already red and stayed red on a different number. `shapes` has " +
                 "had a negative control since v4535 for exactly this; `owners` now has one, tied to " +
                 "something exact rather than numeric -- `rescued` is populated only when owners is supplied, " +
                 "so an empty one on all three proves the frozen numbers were taken under the old rule. 9/9 " +
                 "red after. *** TIMINGS, AND TWO CORRECTIONS THIS ROUND MADE TO ITSELF. *** definitionGates " +
                 "502 -> 1841 ms, mine and inside budget. render/temporalLock-selfcheck read 3346 ms and " +
                 "looked like my doing -- it measures 4009 ms AT HEAD on the same code, so it was over the " +
                 "3000 ms budget before this round and its recorded 2160 ms was the low end of a wide spread " +
                 "(3911/2655/2464 across three runs); re-recorded at 2655. headlessGpu-selfcheck ran 180,857 " +
                 "ms and looked like a 200x regression -- run again back to back on the identical file it " +
                 "took 805 ms, against 870 at HEAD. IT IS BIMODAL, not regressed, and a gate that sometimes " +
                 "takes three minutes against quickSweep's 20 s SIGKILL cap is a concrete mechanism for the " +
                 "138 gates v4572 observed at or over that cap. NOT INVESTIGATED HERE. And the pre-flight " +
                 "earned its keep: a stray tools/ship/temporalLock-selfcheck.mjs, created by a bug in this " +
                 "round's own sabotage-restore loop where the first cp succeeded instead of falling through, " +
                 "was named by the gate-count check before the verify rather than found in the diff.",
    }),
    since299: Object.freeze({
        at: "v4572", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "tools/ship/harnessLiveness-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze(["tools/ship/crossBackend-selfcheck.mjs"]),
        verdict: "green, 2.44 s, under the 3000 ms budget. *** v4571 LEFT crossBackend NAMING THIRTEEN " +
                 "UNREGISTERED KERNELS AND ANSWERING THEM FOUND SOMETHING UNDERNEATH: THE CROSS-BACKEND " +
                 "HARNESS COULD NOT TELL AGREEMENT FROM SILENCE. *** MEASURED on a kernel that must write " +
                 "src + 7 at every lane: bound so the device REJECTS the bind group, both harnesses returned " +
                 "{ ok: true, errors: [] } and a field of zeros -- createBindGroup hands back an invalid " +
                 "object rather than throwing, the submit is dropped, and the read-back is the zeros it was " +
                 "created with. Bound VALIDLY but with the read-back where the kernel reads its INPUT, no " +
                 "error is raised on either side at all: a legal program writing to a buffer nobody reads. " +
                 "Either way wgslCorpus.compare scored { n: 8, same: 8, identical: true }. The corpus's " +
                 "headline claim, 'no divergence anywhere', was satisfiable by a kernel that never ran on " +
                 "either side -- and the whole temporal arc was one option away from that state, since its " +
                 "thirteen kernels put dst at bindings 1 to 4 and the uniform last while both harnesses " +
                 "hard-coded out-at-0 and uniform-at-1. Registering them without this would have added " +
                 "thirteen silent passes. *** THREE REPAIRS AND ONLY ONE IS AN ERROR CHECK. *** A validation " +
                 "error scope catches the rejected case. NOTHING catches the second -- no error exists -- so " +
                 "the read-back is filled with LIVENESS_SENTINEL and a run leaving every word intact reports " +
                 "`wroteNothing`, which compare() refuses. And the browser TEXTURE path already had a scope " +
                 "whose finding it pushed into a list and returned ok:true beside: gathering evidence and " +
                 "not acting on it is the same fault as never gathering it. `outBinding`/`uniformBinding` " +
                 "make the arc's convention runnable. MEASURED SAFE: the existing 70-entry corpus and all 20 " +
                 "harness-calling gates in the tree swept green with all of it in place. *** AND THE " +
                 "THIRTEEN ARE ANSWERED: crossBackend IS GREEN, a red that had stood since v4560. *** 101 " +
                 "corpus entries, 35 excluded, ZERO unaccounted. Eleven kernels dispatched -- 7,680 floats, " +
                 "0 untouched, all identical across backends -- and LUMA_WGSL and YCOCG_WGSL turned out not " +
                 "to be kernels at all but function fragments with no entry point, so they are compiled " +
                 "inside a shell that CALLS them, because a fragment is only covered where the splice site " +
                 "uses it. *** THE BINDINGS ARE PARSED OUT OF EACH KERNEL, NOT RESTATED. *** Thirteen " +
                 "hand-copied binding tables is thirteen chances to write 2 for 3, and this round measured " +
                 "what a wrong one costs. *** LIVENESS IS NOT EXERCISE, AND THIS ROUND'S OWN FIXTURE PROVED " +
                 "IT. *** DISOCCLUSION passed every check above while writing 256 identical zeros: the " +
                 "shared motion field's expected-depth channel sat 0.08 below the threshold at every pixel. " +
                 "Two backends agreeing on one constant is not evidence about a branch. A dedicated fixture " +
                 "straddles it, and a row now refuses any dispatched entry whose output has one distinct " +
                 "value. Eight sabotages scored 2/3/2/1/3/1/3/crash-only, no 0-RED -- after a repair: the " +
                 "FIRST run went 0-RED on giving the two harnesses DIFFERENT sentinels, because all three " +
                 "sentinel rows read the constant in THIS process and none watched either harness use it, a " +
                 "claim about a label rather than behaviour and the same fault v4571's window-form control " +
                 "made one round earlier. The separating case is a PARTIALLY written read-back, where two " +
                 "fills read as a DIVERGENCE -- a red pointing at the kernel for a defect in the harness. " +
                 "*** OBSERVED, NOT CLAIMED: *** 138 gates sit at or over quickSweep's 20 s SIGKILL cap, and " +
                 "the cluster at 20.2 s records code 124; crossBackend records code 0 at what was 20,487 ms " +
                 "and is now 25,772 ms with the thirteen, consistent with the serial re-run the timings note " +
                 "describes rather than with a killed verdict. This round did not investigate that and does " +
                 "not claim it. Of the eight tree-wide census gates v4571 found red at HEAD, this round " +
                 "answered ONE; frameDirtyCensus, gateSelection, referenceKind, definitionGates, staleness, " +
                 "statedRuntime and recordReach are exactly where they were. *** AND out-AT-0 / uniform-AT-1 " +
                 "WAS BAKED IN THREE PLACES. *** Both harnesses hard-coded it and so did computeRun.mjs's " +
                 "corpusSpec, the device path deviceCompute-selfcheck drives: every corpus entry until now " +
                 "happened to follow the convention, so nothing ever had to declare it, and adding the " +
                 "thirteen turned corpusSpec's at(0) into a demand for a buffer nobody supplies -- TWELVE " +
                 "REDS, found by the verify sweep and by none of the three harnesses. Repaired in the third " +
                 "place and in deviceCompute's packer, which dropped the two options crossing into the page: " +
                 "a field that exists is not a field that travels. The thirteen therefore run on THREE paths " +
                 "now, and deviceCompute reports 86,541 floats across 32 kernels.",
    }),
    since298: Object.freeze({
        at: "v4571", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "render/ringFloorPhase-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green, 1.03 s, under the 3000 ms budget. *** v4570 CLOSED BY NOTICING THAT THREE SEPARATE " +
                 "BLIND SPOTS SAT AT ONE FIXTURE CONSTANT, AND THIS ROUND MEASURED WHY. *** f = 1/2 is the " +
                 "unique fixed point of sigma: f -> 1-f. A pair {g, g . sigma} agrees exactly there; a " +
                 "sigma-symmetric g is STATIONARY there, so it meets its own maximum. MEASURED over a " +
                 "3999-phase sweep: SIX of the eight phase-expression pairs this arc uses agree at 1/2 and " +
                 "nowhere else in (0,1), and the two that do not are round-vs-floor, where 1/2 is not a " +
                 "meeting point but the BOUNDARY between the half-intervals each agrees on. Not three " +
                 "coincidences -- one fixed point, seen three times. *** AND THE COST IS AN ARC-WIDE 0-RED. " +
                 "*** Substituting 0.5*min(f,1-f) for f(1-f) -- an impostor agreeing with truth at f = 0 and " +
                 "f = 1/2, reading 0.667x of it at a quarter texel, UNSAFE in the direction a margin cares " +
                 "about -- into BOTH the mirror and the kernel scored ZERO RED across all eleven gates of " +
                 "this arc. 21 of 475 reported lines moved; no row failed. FOUR reasons, and only the last " +
                 "is a tolerance: STRUCTURAL (Light/Margin/Yaw and most of Step call only the window form, " +
                 "whose factor is the constant 0.25 and reads no phase); NUMERICAL (ringFloor and " +
                 "ringFloorDevice call the frame form only at f in {0, 1/2}, where the impostor EQUALS " +
                 "truth); DEGENERATE (Stat's frame-form calls are on zero and flat fields); UNASSERTED " +
                 "(Cost/Perspective/Control/kernelAudit DID move and every moved number was printed and " +
                 "asserted around -- ringFloorControl's headline row went from 21.5% to 32.7% of pixels " +
                 "below their own error and still PASSED, because it asserts the defect EXISTS and reports " +
                 "its size rather than pinning it). *** A PHASE CENSUS WAS TAKEN AND IT DOES NOT EXPLAIN THE " +
                 "ZERO, WHICH IS WHY IT IS RECORDED. *** Instrumenting ringFloorCPU to log every (fx, fy) it " +
                 "computes: three gates reach TWO distinct phases, {0, 1/2}; ringFloorYaw reaches 1986 and " +
                 "still reported not one moved number, because it calls only the window form. Breadth of " +
                 "fixture is not the same as reaching the quantity. *** THE REPAIR IS A SHAPE ROW, NOT A " +
                 "TIGHTER TOLERANCE. *** Every row that missed this was checking the bound's SAFETY or its " +
                 "DIRECTION, and the arc's headroom over observed error is only 1.10x-1.62x at the median, " +
                 "so tightening was never available. The phase factor is a multiplicative law and can be " +
                 "read off: a synthetic motion buffer puts every pixel at one chosen sub-texel phase, and " +
                 "the frame form's per-pixel floor then scales as f(1-f) to 9.43e-8 relative across eight " +
                 "phases and 5408 readings, where the closest impostor is 16.8% off. The same row runs on " +
                 "the DEVICE against the law rather than against the mirror -- 8.40e-8 over 2704 readings -- " +
                 "because v4570 established that a parity row is immune by construction to a mutation " +
                 "applied to both sides, and a phase edit is exactly that. *** AND v4570's \"ROUGHLY TWENTY " +
                 "GATES HARD-CODE IT\" WAS AN IMPRESSION, SO IT WAS COUNTED. *** 18 gates under render/ carry a " +
                 "half-texel fixture construct and 11 tree-wide NAME one -- five in this arc and six outside " +
                 "it (strengthField, badTvDevicePass, xrStereo, slugFill, deviceTexture, water2d), none of " +
                 "which this round looked at. The law's own limit is predicted " +
                 "too: which pixel leaves it, and at which phase, follows from the arithmetic floor alone, " +
                 "7 of 7 phases agreeing pixel-for-pixel. *** THE ROUND'S OWN 0-RED, AND IT IS THE ROUND'S " +
                 "OWN SUBJECT. *** Eight sabotages scored 1/1/1/1/1/1/0/2; the zero was moving the window " +
                 "form's constant from 0.25 to 0.24, invisible because the control asserted the window form " +
                 "is phase-INDEPENDENT -- a DIRECTION -- which 0.24 leaves perfectly true. Repaired by a row " +
                 "that names the constant the way the module earns it: the window form at any phase IS the " +
                 "frame form at the fixed point, bit for bit, 2704 readings at 0.00e+0, with 0.25 appearing " +
                 "nowhere in the row. 8/8 red after. Six of the eight score exactly ONE red, which is the " +
                 "thin margin v4570 named about kernels and is no better here. AND THE PHASE PROBE'S FIRST " +
                 "RUN REPORTED NO FLOOR CALL FOR ALL ELEVEN GATES -- a relative import resolving against the " +
                 "probe's own directory. An absence read as a measurement is v4402's fault, produced again " +
                 "in the round built to catch it, and recorded in the gate. *** THE VERIFY SWEEP WAS WIDENED " +
                 "AND IMMEDIATELY FOUND A RED THIS ROUND DID NOT CAUSE. *** render/colourReach-selfcheck has " +
                 "been red since ff463a60 on 2026-09-09: fx/fsr/fsr.js pushed its literal-colour census 86 -> " +
                 "87, and v4569 and v4570 both shipped over it because those rounds swept the arc they were " +
                 "working in rather than the directory. The arrival is a FALSE POSITIVE of a predicate that " +
                 "already calls itself crude -- EASU's tap accumulator `{ r: 0, g: 0, b: 0, w: 0 }`, four " +
                 "running sums whose `w` is the tell -- and the PREDICATE IS NOT CHANGED, because narrowing " +
                 "it moves that census and the hot one with it. The count is re-taken as a true count of what " +
                 "the detector detects, with the reason in the header. recordDrift's six pre-flight checks do " +
                 "not cover a per-module census like this one: that is a seventh obligation and nothing names " +
                 "it, which is the round's own subject arriving in the round's own bookkeeping. A second, " +
                 "smaller instance of the same shape: this pre-flight's assertionShape check compares FOUR of " +
                 "that census's nine rows, so nameFirst (1501 -> 1502) read clean there and red in the gate, " +
                 "which compares all nine and labels itself so. Designed behaviour, not a defect, and the " +
                 "same lesson -- a check covering part of a record reports on the part it covers. *** AND " +
                 "WIDENING THE SWEEP AGAIN, TO THE 37 GATES THAT PIN A TREE-WIDE CENSUS, FOUND EIGHT MORE RED " +
                 "AT HEAD: *** frameDirtyCensus, gateSelection, referenceKind, definitionGates, staleness, " +
                 "crossBackend, statedRuntime, recordReach. All predate this round and none is re-taken here " +
                 "-- re-taking a record without understanding what moved it is the fault this arc warns " +
                 "about, and eight is a round of its own; they are named so the next round starts from a list " +
                 "rather than a discovery. ONE IS THIS ARC'S OWN DEBT AND IS ANSWERED: crossBackend has named " +
                 "RING_FLOOR_WGSL as neither in the WGSL corpus nor excluded with a reason since v4560, and " +
                 "it could name only ONE of the arc's THIRTEEN kernels because wgslCorpus's census detector " +
                 "reads `export const X` while the whole temporal arc re-exports at the foot of the file as " +
                 "`export { A, B }`. MEASURED: 95 producers seen, TWELVE invisible -- 11% of the tree's WGSL " +
                 "outside a census whose purpose is to notice absences, and the THIRD distinct reason this " +
                 "census has failed to see a producer (v4464: a root outside the scan; v4472: a file type " +
                 "with no export to match; v4571: a spelling). The detector is widened so the red names all " +
                 "thirteen. The gate was already red on that line, so no verdict changes -- only whether the " +
                 "red tells the truth. Answering the thirteen is not done here.",
    }),
    since297: Object.freeze({
        at: "v4570", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "render/kernelAudit-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green, 0.30 s, under the 3000 ms budget. *** v4569 ASKED WHETHER ANYTHING WOULD NOTICE IF A " +
                 "KERNEL IN THIS ARC WERE WRONG, AND THIS ROUND MEASURED IT. *** One behaviour-changing " +
                 "mutation per kernel, twelve kernels, run against the arc's fourteen device-touching gates: " +
                 "ELEVEN OF THIRTEEN applied mutations caught. *** AND EIGHT OF THOSE ELEVEN ARE PINNED BY " +
                 "EXACTLY ONE ROW, IN THEIR OWN GATE *** -- LUMA, SHADING_SHIFT twice, RIDGE, YCOCG, " +
                 "DISOCCLUSION twice. One row weakened anywhere in that list and the kernel behind it is " +
                 "unpinned; that is not a defect today and it is the whole margin. THE TWO ZEROS WERE " +
                 "FIXTURES UNABLE TO REACH THE THING, NOT GATES BEING LAX. *** FIRST: LANCZOS2'S SUPPORT " +
                 "GUARD IS UNREACHABLE DEAD CODE. *** The resolve kernel's tap loop is 3x3 about round(s), so " +
                 "the offsets it evaluates span [-1.5, 1.5] and the guard at |x| >= 2 is never reached -- " +
                 "doubling it to 4.0 changed nothing anywhere. The module's own justification said a 3x3 " +
                 "footprint was ENOUGH because Lanczos2 is zero beyond 2, and the arithmetic refutes that " +
                 "flatly: Lanczos2 is NOT zero on [1.5, 2). MEASURED, the weight left unevaluated is 0.00% at " +
                 "an integer offset, 1.47% at a quarter texel and 5.00% at a half -- 9.75% of the separable " +
                 "2-D weight -- where a four-tap window leaves 0.00% at every phase. IN OUTPUT, resolving " +
                 "64x64 to 128x128, the two footprints differ by up to 1.0% of the range on a smooth " +
                 "sinusoid, 6.3% on a hard edge and 15.7% on a pixel-scale chequer. That is not a rounding " +
                 "detail. *** THE FOOTPRINT IS NOT WIDENED: *** that moves every number " +
                 "temporalResolve-selfcheck records and is a round of its own, and 3x3 is a legitimate choice " +
                 "described as one. What was not legitimate was the justification, and that sentence is now " +
                 "the measurement. Both mirrors take nine taps, so the device-parity row agrees on a " +
                 "truncated Lanczos2 and can see none of this. *** SECOND: A PHASE TERM INVISIBLE AT THE " +
                 "SPEED EVERY FIXTURE USES. *** v4569 pinned RING_FLOOR's window phase with a two-axis " +
                 "sabotage; a one-axis version scored nothing. Two reasons, and the second is the keeper: at " +
                 "a HALF-TEXEL speed f(1-f) is 0.2500 and the window form's constant is 0.25 -- the same " +
                 "number. Measured, the two forms separate 4.77x at a tenth of a texel, 2.32x at a quarter " +
                 "and 1.74x at a half, so a fixture running at half a texel cannot tell them apart however " +
                 "many axes a sabotage touches, and half a texel is what almost every fixture in this arc " +
                 "uses. The term also only appears on the RESOLVED branch, which v4569's separating edge has " +
                 "none of. Six sabotages of this round's own work red at 3/8/2/2/2/5, no 0-RED; TE is the " +
                 "one that matters, being exactly the mutation the audit found invisible, and it now scores " +
                 "two. The audit harness itself is scratch and not a gate: the census it produced is a " +
                 "snapshot and will rot like any record here that nothing re-takes.",
    }),
    since296: Object.freeze({
        at: "v4569", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "render/ringFloorDevice-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green, 1.45 s, under the 3000 ms budget. *** THE KERNEL AND THE MIRROR HAD BECOME DIFFERENT " +
                 "FUNCTIONS AND THE PARITY ROW COULD NOT TELL. *** RING_FLOOR_WGSL was written at v4562 and " +
                 "four rounds of corrections landed on the CPU mirror alone: v4564's WINDOW phase, v4565's " +
                 "RING TERM on the step branch, v4566's DISPLACEMENT GATE. (v4562's arithmetic floor DID " +
                 "reach the kernel -- this round's own closing said it had not, and the kernel says " +
                 "otherwise; v4568's quantiles are a reduction the kernel does not do at all.) " +
                 "ringFloorPerspective's parity row went on passing, and HONESTLY: it drives the FRAME form " +
                 "on both sides and the kernel implemented that correctly. What it could not say is that the " +
                 "window form -- the one v4563 onward actually spends per pixel -- had NO device coverage " +
                 "whatsoever. A parity row is only as wide as the configurations it runs. The kernel now " +
                 "carries all three, reading the ring from device memory where RING_PUSH_WGSL already wrote " +
                 "it, and is pinned on an EDGE that has swept past -- where the window form reads 3.2e+6x " +
                 "the frame form at its worst pixel, so a lagging kernel FAILS rather than passes. On a " +
                 "chequer the two forms are far closer, which is exactly the fixture that would have let it " +
                 "through. *** THE TOLERANCE IS ONE ULP OF WHAT IS BEING DIFFERENCED, DERIVED RATHER THAN " +
                 "PICKED: *** the ring term is |newer mean - older mean|, and on the flat side of an edge " +
                 "those are the SAME NUMBER -- measured as exactly 0.00e+0 in f64 across a run of pixels, " +
                 "whose floor is therefore the arithmetic floor. In f32 the difference leaves one epsilon of " +
                 "residue, so a RELATIVE comparison reads 8.3e-4 and means nothing; the absolute worst is " +
                 "5.96e-8 against f32's own 2.19e-7, half an ulp. Eight sabotages red at 4/2/3/2/3/3/3/5. SA " +
                 "restores exactly what the kernel was when the round started and scores four, where before " +
                 "this gate it scored nothing. *** SC AND SD BOTH WENT 0-RED AND BOTH WERE HOLES IN THIS " +
                 "GATE'S OWN FIXTURES -- the same shape as the defect the round is about. *** SC drops the " +
                 "displacement gate: the still case paired a still motion buffer with a ring built WITHOUT " +
                 "motion, so the difference was already zero and there was nothing to refuse; it now pairs a " +
                 "MOVING ring with a still buffer, the only combination where the gate is visible. SD applies " +
                 "the ring term on the resolved branch: an edge is 0% resolved-branch pixels and a chequer " +
                 "nearly so, so neither can show a term leaking onto a branch they do not have -- a smooth " +
                 "sinusoid is 96% resolved and shows it at once. Also: the kernel gained a fifth binding, and " +
                 "two older device gates had to bind the ring they do not read, since a declared binding must " +
                 "still be bound. And the nested-backtick trap bit for the THIRD time this session -- a " +
                 "backtick inside a WGSL comment closes the JS template literal the kernel lives in; the file " +
                 "now says so and a row counts them.",
    }),
    since295: Object.freeze({
        at: "v4568", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "render/ringFloorStat-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green, 0.42 s, under the 3000 ms budget. *** THE NUMBER THIS ARC HAS REPORTED SINCE v4560 IS " +
                 "AN ORDER STATISTIC, AND IT MOVES THE WRONG WAY WHEN THE PICTURE IMPROVES. *** ringFloorCPU's " +
                 "headline is `worst`, a MAX over the frame, and every floor published in this arc is one -- " +
                 "v4559's 8.6e-1, v4562's 24x, v4564's ladder, v4567's yaw comparison. A max over N samples " +
                 "grows with N whether or not the thing measured has changed: on ONE FIXED FRAME, the max over " +
                 "a random subset of its pixels reads 44% of the all-pixel max at N = 64, 77% at 256, 93% at " +
                 "1024 and 100% at 3673, while the MEDIAN over the same pixels does not move. *** AND IN A REAL " +
                 "RESOLUTION CHANGE THE TWO EFFECTS CANCEL: *** sampling the same scene three times finer cuts " +
                 "the typical pixel's floor 11x, 3.4e-3 to 3.1e-4, which is v4559's quadratic law doing exactly " +
                 "what it should -- and over the same four runs `worst` stays flat at 3.6e-2 to 4.4e-2, while " +
                 "the ESTIMATE's worst RISES 1.07 to 1.60. A caller watching the headline would conclude the " +
                 "frame got worse where it got eleven times better. `worst` is still the only one of these " +
                 "that is a BOUND and it is kept unchanged; what is added is the distribution underneath it, " +
                 "so a caller can tell \"this frame is bad\" from \"this frame has a horizon\". *** BY " +
                 "HISTOGRAM, NOT BY SORT, AND THE DIFFERENCE IS PRICED: *** a full sort of the per-pixel field " +
                 "costs 68-72% of the estimator's own run at 128x128 through 512x512 -- it would nearly double " +
                 "the floor's price -- where a 1024-bucket log-scale histogram costs 15.6-18.7%, about 1.2% of " +
                 "a frame against v4561's measurement of the estimator at 7.6% of the ring push. The bucket " +
                 "width BOUNDS the error rather than a tolerance being chosen: over a dynamic range R it is " +
                 "R^(1/1024) - 1, which reads 1.62% on this frame and is matched to within 0.83% by an exact " +
                 "sort at p50, p90 and p99. An empty field returns NULL quantiles rather than zeros, and a " +
                 "flat one returns the value its pixels hold with zero error. Eight sabotages red at " +
                 "1/1/2/2/1/1/1/1 against six gates. *** TWO WENT 0-RED AND BOTH WERE ROWS OF MINE CHECKING " +
                 "THE WRONG THING. *** RE hard-codes the stated error to 1.62% and passed, because the section " +
                 "measured exactly ONE field and 1.62% is its true answer -- a derived number and a constant " +
                 "are indistinguishable when there is only one case; it is now checked against the bucket " +
                 "formula applied to each field's own observed range, on two fields whose ranges differ. RH " +
                 "returns zero for a flat field and passed a row asserting `p50 !== null`, because zero is not " +
                 "null -- a check on the shape of the answer where the claim was about its value.",
    }),
    since294: Object.freeze({
        at: "v4567", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "render/ringFloorYaw-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green, 0.28 s, under the 3000 ms budget. *** THIS ARC HAS ONE CAMERA MOTION AND IT IS THE " +
                 "ONE THAT PROTECTS THE FLOOR. *** Every fixture from v4553 to v4566 TRANSLATES the camera -- " +
                 "along X for thirteen rounds, along Y since v4566 -- and v4558's roll was orthographic. " +
                 "Nothing has yawed one under perspective, which is what a camera actually does. IT IS A " +
                 "DIFFERENT KIND OF MOTION, NOT A FASTER ONE: translation moves a pixel by PARALLAX, " +
                 "measured varying 9.3x across the frame's depth bands, so the far field barely moves; yaw's " +
                 "displacement varies 1.0x across the same bands because it depends on where a pixel sits in " +
                 "the frame and NOT on how far away it is. So the far field -- where a foreshortened ground " +
                 "plane carries its highest spatial frequency -- loses the protection parallax was giving it. " +
                 "MEASURED AT MATCHED NEAR-FIELD SPEED, the floor is worse under yaw and the gap WIDENS with " +
                 "depth: 3.3x at p99 within depth 8, 7.2x within 15, 7.5x within 30. *** AND THE FRAME-WIDE " +
                 "MAX IS A HORIZON PIXEL, WHICH IS THE STATISTIC EVERY FLOOR THIS ARC HAS PUBLISHED SINCE " +
                 "v4560 USES: *** uncapped it reads 7.3x the within-depth-30 max under yaw and 3.3x under " +
                 "translation, while the MEDIAN moves 1.15x between the same two sets -- so the horizon moves " +
                 "the max and almost nothing else. Not wrong; unrepresentative, and nothing has replaced it. " +
                 "THE BOUND HOLDS under a motion it has never seen: 0 of 1314 step-branch pixels under their " +
                 "own error across four runs, which is a result rather than an assumption, since nothing in " +
                 "its derivation mentions the KIND of motion and this is the first fixture that separates " +
                 "kind from magnitude. Six sabotages red at 35/4/2/2/5/6 against seven gates. QA scores " +
                 "THIRTY-FIVE and is the round in one number: a reconstruction that ignores the previous " +
                 "frame's rotation is a perfect no-op on a translating camera, and until this fixture there " +
                 "was nothing in the arc it could fail against. *** QC WENT 0-RED AND FOUND A FIXTURE THAT " +
                 "CANNOT SEPARATE TWO NUMBERS: *** the motion buffer's fourth channel is the depth the " +
                 "surface had LAST frame, and replacing it with the depth it has NOW passed every gate -- " +
                 "including motionVectors-selfcheck's own device-parity row, which compared the two " +
                 "implementations to 3.33e-6 and passed, because the fixture sabotaged both in the same " +
                 "direction. Every fixture in this tree moves the camera sideways past a surface at constant " +
                 "distance, and under a lateral move a surface's depth does not change: the previous depth " +
                 "and the current one are literally the same number. A DOLLY separates them, and " +
                 "motionVectors-selfcheck now carries one, with the channel asserted against an independent " +
                 "projection and a third row recording that a lateral move makes the two agree -- which is " +
                 "why nothing caught it for fourteen rounds.",
    }),
    since293: Object.freeze({
        at: "v4566", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "render/ringFloorLight-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green, 0.41 s, under the 3000 ms budget. *** THE FLOOR AND THE SHADING DETECTOR HAVE BEEN " +
                 "READING THE SAME NUMBER AND CALLING IT OPPOSITE THINGS. *** v4553 built shadingShiftCPU on " +
                 "|newer period mean - older period mean| to DETECT a lighting change; v4565 spends that same " +
                 "quantity as REPROJECTION NOISE in the floor's step branch. Every fixture in this arc is " +
                 "statically lit, so nothing has ever had to tell them apart. Measured on a chequer with a " +
                 "still camera: |newer - older| is 0.000 under static light -- the jitter cancels over a whole " +
                 "period exactly, as v4553 built it to -- and 0.520 under an 8%-per-frame ramp, while the " +
                 "error actually present stays at 1e-7 because at zero displacement the reprojection is " +
                 "EXACT. shadingShiftCPU reads 0.578 of its [0,1] range on the same frames and calls it " +
                 "signal. *** AT ZERO DISPLACEMENT THE SEPARATION IS THEREFORE COMPLETE, AND THAT IS WHAT " +
                 "THIS ROUND FIXES: *** the ring term is now gated on a displacement having happened at all, " +
                 "which is a hard test with nothing to tune. On the edge fixture under that ramp it lowers " +
                 "92% of step-branch pixels by a median 9.5e+5x, and under static light it changes 0% of " +
                 "them, because there is nothing there to remove. It remains a bound on both albedos and all " +
                 "three lighting regimes, still and moving. *** UNDER MOTION THE TWO MIX AND THIS DOES NOT " +
                 "SEPARATE THEM: *** the same ramp still lifts the moving-camera floor 2.8x, and part of that " +
                 "lift is real -- the true floor rises 2.5x -- which is exactly why it cannot be gated away. " +
                 "Section 3 measures it rather than waving at it. Seven sabotages red at 3/8/1/1/4/1/3 " +
                 "against seven gates. *** TWO WENT 0-RED AND BOTH WERE FIXTURE BLINDNESS. *** PC reads only " +
                 "the u component of the motion vector, so a camera moving straight down reads as a still " +
                 "one -- invisible because EVERY FIXTURE IN THIS ARC, v4553 through v4565, translates the " +
                 "camera in X and nowhere else. Thirteen rounds, and a bound ignoring half the motion vector " +
                 "behaves identically on all of them; section 5 is a horizontal edge swept vertically, the " +
                 "smallest fixture that separates them. PD treats a null motion buffer as motion, unchecked " +
                 "because the callers that pass null use the frame form, which has no ring term -- so the one " +
                 "combination that matters, a per-pixel bound with no displacement information, had no " +
                 "reader. *** AND THE PROBE THAT OPENED THE ROUND READ ss[i] WHERE shadingShiftCPU RETURNS " +
                 "{ data, unknown }: *** every read undefined, every comparison false, and it reported the " +
                 "detector firing on 0% of pixels across three lighting regimes -- the exact number that " +
                 "would have made this collision look like it was not there. An absence read as a " +
                 "measurement, this arc's oldest fault, in the round that is about two readings of one " +
                 "quantity. Two rows of the new gate also had to be corrected: one asserted the floor itself " +
                 "would vanish where the gate only removes the ring term (the geometry stays, and a step " +
                 "scales with the light too), and one multiplied by zero and compared the result to nothing.",
    }),
    since292: Object.freeze({
        at: "v4565", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "render/ringFloorStep-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green, 0.41 s, under the 3000 ms budget. *** v4564 NAMED TIGHTENING THE STEP BOUND AS THIS " +
                 "RUNG. IT IS NOT TIGHTENED, BECAUSE IT WAS NOT A BOUND. *** max(f, 1-f) * step reads only " +
                 "THIS frame's neighbourhood, and where a high-contrast feature has SWEPT PAST a pixel is " +
                 "locally flat now and still carries that feature's reprojection error in the ring: the " +
                 "stencil is flat, the bound returns nearly nothing, the error is large. Measured on this " +
                 "arc's own EDGE fixture, the geometric step bound is BELOW the error actually present at " +
                 "70-86% of step-branch pixels, with a median of 0.00x of the error. v4564 shipped that form " +
                 "as a per-pixel bound on the strength of ONE fixture -- a perspective ground plane, where it " +
                 "reads 0.03%. *** AND THE CHEQUER IS CLEAN AT 0.00%, WHICH IS WHY NOTHING CAUGHT IT: *** the " +
                 "two contents fail the geometry in opposite ways and the arc has had both since v4553. THE " +
                 "MISSING HALF IS THE RING, which has been in the tree since v4553: |newer period mean - " +
                 "older period mean| is what the reprojection did over one period and the spread within the " +
                 "newer period is what it is still doing. It is safe on the edge and UNDER by 5-14% on the " +
                 "chequer, whose error is a persistent BIAS that a difference between two periods cannot see. " +
                 "*** NEITHER IS A BOUND ALONE AND NEITHER DOMINATES: *** on the two sinusoids the ring reads " +
                 "1200-2256x where the geometry reads 33-65x. Their MAX is under at 0.00% across ten " +
                 "content-and-phase combinations and 13,398 step-branch pixel-frames. IT TIGHTENS NOTHING -- " +
                 "the max can only be the looser of the two, so the 90x on a perspective plane stands " +
                 "untouched. What changed is that it is a bound at all. The window form now REFUSES to run " +
                 "without the ring rather than returning the half-bound v4564 shipped; the frame form is " +
                 "untouched, so every frame-wide number v4560 through v4562 recorded reads what it read. " +
                 "*** THE COMPOSITION SHIPPED IS THE SECOND ONE WRITTEN: *** the first added the ring term " +
                 "into BOTH axis terms, double-counting a quantity the ring holds once per pixel rather than " +
                 "once per direction -- safer than what replaced it, and arithmetic nobody could justify. " +
                 "What caught it was the row comparing this module's private ring readings against " +
                 "temporalLock's exported ones on a FLAT field, the one place the geometric term is zero and " +
                 "the ring term is visible alone. A second copy of three functions is allowed only because " +
                 "something compares it to the original, and that row earned its place on its first run. " +
                 "Eight sabotages red at 3/2/3/2/6/2/2/2 against six gates; NC and ND are a pair, each half " +
                 "of the ring term load-bearing for a different failure. Two rows of v4564's own gate needed " +
                 "correcting: its residue is now ONE pixel, all on the Taylor branch, the step half having " +
                 "been closed -- which confirms the reading v4564 gave, that what remains is the curvature " +
                 "surrogate. AND A DERIVED RECORD MOVED FOR THE FIRST TIME SINCE v4551: runtimeGap's " +
                 "closuresOverThreads, 3641 / 22, went 165 -> 166, and its own gate caught the stale value " +
                 "rather than a reader noticing.",
    }),
    since291: Object.freeze({
        at: "v4564", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "render/ringFloorControl-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green, 0.31 s, under the 3000 ms budget. *** v4563 REPORTED 28.9% CHURN AND HAD NOTHING TO " +
                 "COMPARE IT AGAINST. *** This round builds the ladder: the SCENE alone, with no ring in the " +
                 "picture, churns 8.3% because the camera is moving and features genuinely enter and leave; " +
                 "the ring at the fixed 0.05 churns 10.7%; a PERFECT per-pixel margin, derived from the error " +
                 "actually there, churns 14.8%; the estimator churns 27.7%. *** SO A PERFECT MARGIN CHURNS " +
                 "MORE THAN A CONSTANT ONE, AND PER-PIXEL CHURN IS INTRINSIC RATHER THAN ESTIMATOR ERROR. *** " +
                 "The oracle also finds MORE ridges than either (411 against 305), so its extra churn is the " +
                 "price of tracking, not of caution. v4563's number has a floor of 14.8% and not of zero. " +
                 "*** AND MEASURING THAT FOUND SOMETHING WORSE THAN THE CHURN: THE ESTIMATOR WAS NEVER A " +
                 "BOUND PER PIXEL, AND v4563 SPENT IT PER PIXEL. *** Every safety row from v4560 on compared " +
                 "the frame's WORST estimate against the frame's WORST error -- a frame-wide claim, and it " +
                 "holds on 14 of 14 frames. Per pixel the same numbers are BELOW the error actually present " +
                 "at 21.5% of pixels, 36.4% of those on the resolved branch. v4563's own safety row could " +
                 "not see it: it compared each ridge against the floor its margin was derived from, which " +
                 "can only ever return zero. THE REASON IS ONE v4562 WROTE DOWN ABOUT A DIFFERENT FORM AND " +
                 "NOBODY FOLLOWED THROUGH -- the ring's window spans P frames at P jitter phases, so THIS " +
                 "frame's f does not bound the window's worst; frame-wide it washes out because some pixel " +
                 "always has a large phase. The repair is to use the phase factor's MAXIMUM, 0.25, instead of " +
                 "this frame's: from 21.5% under to 0.03%, four pixels in 12,348, split across both branches " +
                 "-- so what is left is the curvature surrogate rather than the phase. It costs 19x on the " +
                 "resolved branch, which is what a bound that holds at every pixel costs over one that holds " +
                 "across a frame. ringFloorCPU takes a `phase` of \"frame\" (the default, so every number " +
                 "v4560-v4562 recorded is unchanged) or \"window\"; marginsFromFloor now REFUSES the frame " +
                 "form outright and the floor pool carries the form with the numbers, which caught this " +
                 "round's own gates twice while they were being corrected. *** AND CORRECTING v4563's TABLE " +
                 "CHANGED ITS HEADLINE: *** pooling was measured there as halving the churn, 51.8% to 28.9%. " +
                 "Most of what it removed was phase noise the frame-form bound should never have carried. On " +
                 "the window form the margin starts steady -- 15% p90 rather than 30% -- and pooling buys 15% " +
                 "of the churn, not 50%. The four-fold steadying of the margin itself survives. Section 2 " +
                 "locates the remaining gap to the oracle in ONE branch: the step bound runs 90x loose at " +
                 "the median where the Taylor bound runs 17x, on 41% of on-plane pixels, and no uniform " +
                 "scaling closes it -- dividing by 4 leaves the median 8.9x loose and already puts 2.13% of " +
                 "pixels under their own error. Seven sabotages red at 4/3/10/2/2/1/1 against five gates. MA " +
                 "restores exactly what v4563 shipped and now scores four; when v4563 did it nothing went " +
                 "red, and the difference is not better code but a measurement against the error actually " +
                 "there instead of against the estimate.",
    }),
    since290: Object.freeze({
        at: "v4563", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "render/ringFloorMargin-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green, 0.26 s, comfortably under the 3000 ms budget. *** v4562's CLOSING WAS WRONG TWICE AND " +
                 "THIS ROUND MEASURES WHY. *** It called a per-BAND floor worth 6x. The right unit is not a " +
                 "band -- ringFloor.mjs already produces a floor per PIXEL, and bands were an artefact of how " +
                 "I read it -- and the frame-wide alternative is not 6x worse: on this perspective scene the " +
                 "derived frame-wide margin is INFEASIBLE on all fourteen frames, so it locks NOTHING. The " +
                 "choice was never 6%, it was between a derived margin that works and one that does not " +
                 "exist. Per pixel, 66-71% of the ground IS lockable; the frame-wide number is set by the " +
                 "worst pixel in the frame and then spent everywhere. *** WHAT A PER-PIXEL MARGIN COSTS IS " +
                 "CHURN: 51.8% of held ridges change state between frames, against 10.7% for the arc's fixed " +
                 "0.05 -- 4.9x -- and a lock that blinks is worse than no lock, since blinking is the " +
                 "artefact the lock exists to suppress. *** The cause is the jitter, and v4553's insight " +
                 "applies unchanged: any P consecutive frames span a whole period. Pooling the floor over one " +
                 "period halves the churn to 28.9% and steadies the margin itself from 30% to 4% p90. *** AND " +
                 "THE POOL IS A MAX, NOT A MEAN, BECAUSE THE FLOOR IS A BOUND: *** the mean is just as steady " +
                 "and stops being one -- 5.9% of the locks it keeps stand UNDER the floor of the very frame " +
                 "they are in -- where the max includes the current frame and therefore cannot. It costs 22% " +
                 "of the ridges the instantaneous floor keeps, which is what a threshold holding still costs. " +
                 "*** AND 71% OF THE ARC'S FIXED-MARGIN RIDGES STAND ON PIXELS WHOSE OWN FLOOR EXCEEDS THE " +
                 "0.05 THAT FOUND THEM *** -- locks reading the ring's resampling error, which is what " +
                 "ridgeMarginBounds was built at v4557 to refuse. A TRUTH COMPARISON CANNOT SEE THIS, and " +
                 "that is worth stating plainly: scored against the noiseless field the fixed margin is 97.9% " +
                 "precise and 94.9% recalling, because the artefact and the feature are in the same PLACE -- " +
                 "a ridge placed on resampling error still lands where the truth has a ridge. Both statements " +
                 "are true at once. *** AND MY FIRST SCORING WAS RIGGED: *** it scored both detectors against " +
                 "truth ridges taken at 0.05, the fixed detector's own threshold, and produced 44.8% " +
                 "precision and 23.4% recall for the derived margin -- a strong negative result that " +
                 "evaporated once each detector was scored against truth at ITS OWN threshold (98.3% and " +
                 "97.8%). A margin DEFINES what counts as a feature; a target built with one detector's " +
                 "definition cannot judge the other. New here: ridgesCPU accepts a per-pixel margin field as " +
                 "well as a scalar, and ringFloor gains makeFloorPool/pushFloor/pooledFloor and " +
                 "marginsFromFloor, which takes ridgeMarginBounds as an argument so the interval has one " +
                 "definition and not a second copy. Eight sabotages red at 3/6/1/1/7/8/2/6 against six gates. " +
                 "*** ONE WENT 0-RED AND FOUND A COMMENT PRETENDING TO BE A DECISION: *** ridgesCPU reads the " +
                 "CENTRE pixel's margin and the comment calls that deliberate, but rewriting it to read each " +
                 "NEIGHBOUR's changed nothing -- the margin field is smooth almost everywhere, so the two " +
                 "readings agree. It has exactly one discontinuity and it is maximal: an INFEASIBLE pixel is " +
                 "Infinity beside a finite neighbour, and read at the neighbour that pixel gets a finite " +
                 "threshold and becomes lockable -- the one pixel the empty interval exists to refuse. The " +
                 "sabotage places 23 ridges on infeasible pixels where the kept form places 0 of 6094. A " +
                 "design decision written into a comment and held by nothing is indistinguishable from a " +
                 "decision nobody made, and this arc has now found two of them: v4561's stencil width and " +
                 "this one.",
    }),
    since289: Object.freeze({
        at: "v4562", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "render/ringFloorPerspective-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green, 0.83 s, under the 3000 ms budget. *** EVERY NUMBER THIS ARC HAS RECORDED SINCE v4553 " +
                 "WAS MEASURED UNDER AN ORTHOGRAPHIC PROJECTION, WHERE A CAMERA TRANSLATION MOVES EVERY PIXEL " +
                 "BY THE SAME AMOUNT. *** v4558 named perspective as unmeasured and v4559, v4560 and v4561 " +
                 "each repeated the note. It matters because the floor is gated by SUB-PIXEL PHASE and under " +
                 "perspective the phase varies across the frame with depth: measured, a 31x spread of " +
                 "displacement inside ONE frame against orthographic's exactly 1. THE ANSWER IS THAT ONE " +
                 "FRAME-WIDE FLOOR IS STILL SAFE AND MUCH LOOSER: 24x frame-wide where twelve orthographic " +
                 "readings ran 1.05x to 4.48x, with the loosest band at 77x. *** AND IT IS SET BY THE FAR " +
                 "FIELD, NOT THE NEAR ONE, WHICH IS BACKWARDS FROM THE OBVIOUS GUESS: *** parallax is largest " +
                 "near, but a ground plane is FORESHORTENED with distance, so the far field carries the " +
                 "highest spatial frequency per pixel -- and the floor is a content law (v4559) before it is " +
                 "a motion one. The far band's true floor is 3.72e-2 against the fastest band's 6.56e-3, so a " +
                 "single margin over-margins the fast band by 6x and a caller wanting that back needs a " +
                 "per-band floor, which this round does not build. *** A REAL DEFECT IN v4560's ESTIMATOR, " +
                 "FOUND BY THE PHASE SWEEP: it returned EXACTLY ZERO at an integer displacement. *** f(1-f) " +
                 "is exactly zero there, so on resolved content the estimate was 0 -- and v4561's own " +
                 "sampling section calls a zero floor the most dangerous answer there is, since " +
                 "ridgeMarginBounds turns noiseFloor 0 into margin 0 and a margin of zero makes every " +
                 "fluctuation a feature. The ring is not exact there; it is exact to within the ARITHMETIC. " +
                 "Measured on four contents over a 64x range of magnitude, the ring mean's error at an " +
                 "integer displacement is 1.05, 1.05, 1.05 and 0.54 ulps of the LOCAL MAGNITUDE -- so the " +
                 "floor is relative, not absolute, which is what an HDR caller needs. It is bounded at two " +
                 "ulps, which is the measurement rounded up to a power of two and is labelled as that rather " +
                 "than dressed as a derivation: the (P+1)/2-ulp argument predicts 4.5 and over-predicts by " +
                 "4x. *** THE REPAIR THE LOOSENESS SUGGESTS IS UNSAFE AND THE MEASUREMENT SAID SO BEFORE IT " +
                 "SHIPPED. *** max(f, 1-f) returns the whole step at f = 0 where v4558 proved the fetch is " +
                 "exact, and min(f, 1-f) is the obvious fix. Measured across phases it reads 0.37x, 0.79x and " +
                 "0.68x of truth -- UNDER, the direction that matters for a margin -- because the ring's " +
                 "window spans many frames at many jitter phases, so THIS frame's f does not bound the " +
                 "window's worst. The crude max form is kept. A first draft of that row asserted the two " +
                 "forms COINCIDE at a half-texel speed; they do not, and the fixture refutes it: only the " +
                 "moving axis sits at f = 0.5, while the still axis sits at f = 0 where max returns the whole " +
                 "step and min returns nothing. So it is a rejected alternative, not a blind spot -- what was " +
                 "missing was anyone writing the second form down. Seven sabotages red at 4/1/2/9/4/10/1 " +
                 "against four gates. *** KF IS THE ONE THIS ARC COULD NOT HAVE RUN BEFORE TODAY: *** " +
                 "dropping the perspective divide from the motion-vector reconstruction is a PERFECT no-op " +
                 "under orthographic, where w is 1 everywhere, so nine rounds left that path unpinned not for " +
                 "want of a row but for want of a fixture that could reach it. It scores ten. *** AND KG WENT " +
                 "0-RED: *** removing the arithmetic floor from the KERNEL while keeping it in the mirror " +
                 "moves every affected pixel by 2.3e-7, and the parity row's tolerance is 1e-5 -- fifty times " +
                 "coarser than the whole defect. An absolute tolerance is blind to anything smaller than " +
                 "itself, and this arc has now built two things that live below one. The repair is a RELATIVE " +
                 "comparison over the floored pixels, and it is a general lesson: every parity row in this " +
                 "arc carries an absolute tolerance chosen for values of order one. Adding the floor also " +
                 "broke v4561's sampling row, which asserted an exact zero: a sampled max on the edge now " +
                 "returns one arithmetic floor instead of 0.00e+0. Same severity -- a factor of two million " +
                 "-- worse signal, since a small plausible number reads like a measurement where a zero reads " +
                 "like a bug. That row is rewritten against the ratio and its runtime re-taken at 1.33 s.",
    }),
    since288: Object.freeze({
        at: "v4561", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "render/ringFloorCost-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green, 1.30 s (1280/1304/1284 over three serial runs), under the 3000 ms budget -- AFTER a " +
                 "first version that ran 17.4 s, which is the over-budget fault v4551, v4553, v4558 and v4559 " +
                 "each recorded, made a fifth time and worse than any of them. *** WHAT THE DERIVED FLOOR " +
                 "COSTS: 7.6% of the ring push it would run beside, at 128x128. *** v4560 left this as its " +
                 "own named gap. Nothing here asserts a duration -- meshPerf-selfcheck already says a speed " +
                 "threshold is a flaky gate, and sweep-timings' note records this box moving 12-36% between " +
                 "hours -- so the claim is a RATIO taken in one process with the two subjects INTERLEAVED " +
                 "A/B/A, and the ratio's own spread is measured before the ratio is used: 5-8% of median over " +
                 "five repeats. The assertion's threshold is derived from the claim it protects rather than " +
                 "picked, namely that the error bar does not reach the line being asserted against; it clears " +
                 "it by 69-95x. AND IT BEATS ITS OWN OP-COUNT PREDICTION BY 3.5x: 21 array touches per pixel " +
                 "against the push's 79 predicts 0.266 and it measures 0.076, because the push is " +
                 "BANDWIDTH-bound on 64 bytes of ring per pixel while the estimator's stencil stays in cache. " +
                 "Its per-pixel cost is flat with resolution (473 -> 475 ns) where the estimator's is not " +
                 "(34 -> 37 ns), the y-stencil starting to cross the row stride. *** THE OBVIOUS " +
                 "OPTIMISATION IS UNSAFE AND FAILS IN THE WORST POSSIBLE DIRECTION. *** The floor is a MAX, " +
                 "so a sampled max can only go DOWN, which is the direction that sets a margin below the " +
                 "noise. At 1-in-64 it is within 1% on the smooth, finer and chequer fixtures -- which is " +
                 "exactly why it looks free -- and reports EXACTLY ZERO on the edge, a 100% under-report " +
                 "saying there is no noise to clear. The three that survive have their worst pixel " +
                 "EVERYWHERE; the one that fails has it in a single column. Sampling is safe precisely when " +
                 "the feature is common, and a rare high-error feature is what a lock is for. *** AND THE " +
                 "DEVICE COST IS NOT MEASURABLE IN THIS CONTAINER, WHICH THIS ROUND FOUND BY NEARLY " +
                 "PUBLISHING IT. *** A dispatch ratio was measured -- 0.68 at 128x128, against 0.076 on the " +
                 "CPU, an inversion striking enough to be the headline -- and only then was the adapter " +
                 "asked: vendor google, architecture SWIFTSHADER, a software rasteriser. dev.backend reads " +
                 "\"webgpu\" and means a CPU running WGSL. Every device row this arc has written, all ten of " +
                 "them, ran there, and none of the 109 gates calling runInEngineOrigin had any way to know, " +
                 "because the harness never returned the adapter. It does now, for all of them, using " +
                 "ui/localModelProbe.js's SOFTWARE_HINTS rather than a second copy of that list. WHAT IS NOT " +
                 "RETRACTED: parity is parity whatever executes it -- the ten existing rows stand; it is the " +
                 "TIMING claim alone the adapter invalidates, and the 0.68 is recorded here as a software " +
                 "measurement and asserted nowhere. Seven sabotages red at 1/2/4/2/5/12/2 against three " +
                 "gates. *** ONE WENT 0-RED AND IT WAS THE ROUND'S BEST FINDING: *** narrowing the range " +
                 "stencil from five taps to three changed NOTHING any gate could see, because all four of " +
                 "v4560's contents classify identically under both -- the 47x gap that makes tau robust is " +
                 "far too wide for a stencil change to cross. v4560's own row noted its contents sit 39, 14, " +
                 "3.1 and 4.0 samples per period against tau's 7.9 and read that as a virtue: the threshold " +
                 "is not fitted to the data. It is ALSO A HOLE -- no fixture exercised the regime boundary, " +
                 "so anything mattering only there was invisible. Measured on content built AT the " +
                 "threshold, three taps read 2.92x of truth where five read 1.66x, and flip 79% of the frame " +
                 "to the step bound. Not wrong, since a smaller range only pushes the bound UP, but LOOSER, " +
                 "and the tightness is what v4560 spent a round earning. ringFloor-selfcheck now carries the " +
                 "threshold fixture and two rows that pin the width; its runtime is re-taken at 0.90 s.",
    }),
    since287: Object.freeze({
        at: "v4560", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "render/ringFloor-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green, 0.93 s (888/930/899 over three serial runs), comfortably under the 3000 ms budget. " +
                 "*** ridgeMarginBounds HAS DEMANDED A NUMBER NOBODY IN THIS TREE COULD PRODUCE SINCE v4557. " +
                 "*** It refuses an unmeasured noiseFloor, which is right, but v4558 and v4559 both measured " +
                 "that floor against the ANALYTIC SURFACE their fixtures were drawn from, and a renderer has " +
                 "no analytic surface. For three rounds it has been a control nobody could call. This round " +
                 "derives the floor from the frame and the motion vectors and nothing else. THE IDENTITY: " +
                 "interpolating g at x = n + f leaves exactly -1/2 f(1-f) g''(xi), and both factors are in " +
                 "the renderer's hands -- f is frac(hu*w) out of the motion vectors, g'' is the frame's own " +
                 "second difference. It reproduces, with no fitted constant, everything v4559 measured: " +
                 "exact at integer displacements because f(1-f) is zero there, quadratic in cycles per pixel " +
                 "because a sinusoid's second derivative is, saturating above Nyquist. *** THE ACCUMULATION " +
                 "DEPTH IS DERIVED TOO, AND IT IS NOT THE OBVIOUS (1+P)/2. *** pushLuma writes the current " +
                 "luma into the newest slot and reprojects the rest, so lumaMean averages resample depths " +
                 "0..P-1 and the mean depth is (P-1)/2 -- which at P = 1 is ZERO. Measured: a P = 1 ring's " +
                 "floor is exactly 0.00e+0 on the chequer, the content with the largest single-step error in " +
                 "the arc, where one step is worth 2.15e-1. The obvious guess would have predicted that step. " +
                 "*** AND TAYLOR IS VOID AT A STEP, WHICH IS HALF OF WHY THE MODULE IS NOT ONE LINE: *** the " +
                 "Taylor term alone under-predicts a chequer's floor by 4x, and for a margin the under " +
                 "direction is the dangerous one. Where the field is not resolved the bound is the step's " +
                 "own, max(f,1-f) * step size -- near-exact on a chequer and an edge, and 141x LOOSE on the " +
                 "arc's smooth fixture. Neither bound serves alone. FINAL: safe on all twelve readings, " +
                 "worst ratio 1.05x, and TIGHT where the field is resolved -- 1.43x at worst over six " +
                 "readings against 141x for the step bound alone. *** MY FIRST TWO REGIME TESTS WERE BOTH " +
                 "WRONG THE SAME WAY. *** |D2| < first difference reads every EXTREMUM of a smooth sinusoid " +
                 "as a step, because the slope vanishes there while the curvature is maximal; |D3| < |D2| " +
                 "moves the same degeneracy to the INFLECTIONS, where D2 passes through zero. Each " +
                 "mis-classifies up to 5.7% and 5.0% of the arc's own smooth fixture, and a worst-over-frame " +
                 "is a MAXIMUM, so a few false pixels own the answer: the smooth estimate went from 1.05x of " +
                 "truth to 9.93x and then 95x. Both compared against a quantity that VANISHES somewhere on a " +
                 "perfectly smooth field. The module's test is normalised by the local RANGE, which vanishes " +
                 "only on a flat field where every bound is zero anyway. tau NAMES A RESOLUTION rather than " +
                 "a preference: a sinusoid at n samples per period has |D3|/range = (2pi/n)^3/2, so 0.25 is " +
                 "7.9 samples per period -- above Nyquist's 2 and below v4559's measured 12-pixel margin " +
                 "crossing -- and the four contents measure 39, 14, 3.1 and 4.0, the nearest 1.81x away. The " +
                 "separation is 47x in the statistic, which is only 3.5x once expressed as a resolution, " +
                 "because the statistic goes as the cube. *** WHAT IT SAYS ABOUT THE ARC'S DECLARED 0.05: on " +
                 "the arc's OWN fixture the derived margin is 2.28e-3, so 0.05 is 22x too loose and pays " +
                 "5.8% of the range in blind window where 0.26% would do; on the chequer and the edge the " +
                 "interval is INFEASIBLE and 0.05 sits 26x BELOW the floor, so every lock placed there reads " +
                 "resampling error as a feature. One declared number, simultaneously 22x too loose and below " +
                 "the floor, on two contents in the same arc. *** THIS ROUND DOES NOT ADOPT IT. *** Moving " +
                 "the margin would move every number v4553 onward recorded and is a round of its own; and " +
                 "the finer sinusoid is the case against assuming the declared number is always wrong, since " +
                 "there it is 0.79x of derived. Nine sabotages red at 2/4/3/4/1/4/4/2/2. The lowest is the " +
                 "one that matters most: restoring the D2max-alone curvature surrogate scores ONE red, the " +
                 "safety row reading 0.98x, which is the exact 2% shortfall this round measured and fixed -- " +
                 "a bound that goes 2% under looks identical to one that does not unless something watches " +
                 "the direction. THE SET IS ONE GATE, weaker than v4559's four, because nothing else imports " +
                 "the module yet: the day a caller uses the derived margin the set has to be re-run against " +
                 "it. *** AND SECTION 4 ALMOST SHIPPED AS A WRONG CONSTANT: *** its first version built the " +
                 "field once with no jitter and no camera offset and measured 0.0% false-unresolved for a " +
                 "test that mis-classifies up to 5.7%, so the row went red looking like a bad number when it " +
                 "was a blind fixture -- v4559's 24x24 finding, made again one round later. The rate had to " +
                 "be swept over the jitter, because the jitter is what moves the sample grid relative to the " +
                 "extrema the degeneracy lives on, and it turns out to be INTERMITTENT (1.9%-5.7% on one " +
                 "fixed scene), which is worse than a constant error.",
    }),
    since286: Object.freeze({
        at: "v4559", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "render/temporalRingContent-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green, 2.77 s (2772/2671/2698 over three serial runs, under the 3000 ms sweep budget but " +
                 "only by 8% -- and the split is worth recording, since this arc has run over budget four " +
                 "times: the CPU sections cost 368 ms and the headless browser boot and 21 dispatches cost " +
                 "1,907 ms, so if the budget bites here the answer is the harness every device gate pays, " +
                 "not this fixture. *** THE RING'S FLOOR IS A CONTENT LAW WITH A PHASE GATE, AND v4558's " +
                 "PHASE LAW HOLDS ON ALL FOUR CONTENTS. *** v4558 established that integer displacements are " +
                 "exact on one smooth sinusoid; measured here on a smooth sinusoid, a finer one, a " +
                 "pixel-scale chequer and a hard edge, the EXACTNESS is content-independent -- a whole-pixel " +
                 "step lands the bilinear fetch on texel centres whatever the picture. The MAGNITUDE is the " +
                 "picture's: at a half-pixel phase the chequer's floor is 8.7x the arc's 0.05 margin where " +
                 "the smooth fixture is 300x under it. The floor is QUADRATIC in cycles per pixel below " +
                 "Nyquist -- e/f^2 holds within 8% at 7.1 and 6.6, which is what linear interpolation's " +
                 "residual does since it follows the second derivative -- crossing 0.05 at 0.084 cyc/px, a " +
                 "period of about TWELVE PIXELS, which is ordinary detail and not pixel-scale texture; above " +
                 "Nyquist it SATURATES at the signal's own range rather than growing. So the two claims are " +
                 "told apart by holding one thing still: across speeds on fixed content the floor spans " +
                 "2.1e-7, across content at fixed speed it spans 272x. The consequence is not abstract -- on " +
                 "that content the ring's ridges and the truth's agree on only 87% of their union, so a lock " +
                 "placed there is placed on the reprojection's artefacts as much as on the picture. *** AN " +
                 "OPEN DEFECT IS RECORDED RATHER THAN DRESSED. *** At a half-texel camera speed the CPU " +
                 "mirror and the WGSL kernel disagree on 192 of 576 pixels' BOUNDS TEST -- the same count on " +
                 "both contents, because what resets is decided by geometry, not by the picture -- and the " +
                 "COST is the content's: 8.60e-1 on the chequer, 100% of its contrast, against 2.07e-2 on " +
                 "the smooth surface. Four repairs were tried and none held (a half-texel guard and an " +
                 "integer tap test both made it WORSE; computing the mirror's uv in f32 moved which column " +
                 "straddles), so the code is left as it was and the failures are written into " +
                 "render/temporalLock.mjs so a fifth is not guessed at. It needs a hard threshold that a " +
                 "camera speed can land on exactly; the bilinear FETCH survives because a floor off by one " +
                 "carries a compensating weight. It appears at 24x24 and NOT at 16x16, which is most of why " +
                 "six rounds of device-parity rows never met it -- a defect a fixture can hide by accident. " +
                 "*** ONE THING WAS FIXED: the ring's fill index, round(u*w - 0.5) -> floor(u*w), a real tie " +
                 "bug since JavaScript rounds half UP and WGSL half to EVEN. *** advanceLocks held a SECOND " +
                 "copy of the same law in the condemned spelling; both now call one exported nearestTexel, " +
                 "and both call sites are pinned. Seven sabotages red at 7/5/4/3/3/1/17 against four gates, " +
                 "with v4557's crash rule applied. *** THE FIRST SWEEP READ THREE ZEROS AND ALL THREE WERE " +
                 "MINE. *** The tie row asserted Math.floor(22.5/24*24) === 22 -- a fact about JavaScript, " +
                 "not a call into the module; there was no device tie row at all, so the fix was pinned only " +
                 "on the mirror it was FOR; and the coverage rows live in temporalRidgeMargin-selfcheck, " +
                 "which was not in the sabotage SET. A hole in the set reads exactly like a hole in the " +
                 "gates. *** AND THE FIXTURE VALUE DECIDED WHETHER THE CONTROL COULD FAIL: *** at the tie " +
                 "22.5, WGSL's half-to-even gives 22 -- floor's own answer -- so a rounded kernel read the " +
                 "RIGHT texel and the new device row stayed green on a kernel with the defect in it. Moving " +
                 "the tie to 23.5, where both roundings give 24 and floor gives 23, took that sabotage from " +
                 "3 red to 4. On a defect whose whole subject is which way a tie breaks, the fixture had " +
                 "picked the one tie where it does not.",
    }),
    since285: Object.freeze({
        at: "v4558", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "render/temporalRingFloor-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green, 2.44 s (2438/2432/2445 over three serial runs, under the 3000 ms sweep budget -- after " +
                 "an optimisation; see below). *** v4557 MEASURED THE RING'S NOISE FLOOR AGAINST THE WRONG " +
                 "REFERENCE AND ITS HEADLINE IS WITHDRAWN. *** Its analytic average evaluated the surface at " +
                 "pixel i using EACH FRAME'S OWN camera position, which is a different world point once the " +
                 "camera moves -- so it measured HOW FAR THE SCENE SHIFTED across the window, not what the " +
                 "reprojection got wrong. At one pixel per frame it read 6.87e-2 where the ring's actual " +
                 "error is 1.19e-7: five orders of magnitude. WITHDRAWN with it: 'the floor climbs THROUGH " +
                 "the margin', 'every lock placed while the camera moves is partly reading resampling error', " +
                 "and three feasibility intervals reported EMPTY -- all artefacts. The worst TRUE floor over " +
                 "every speed measured is 3.68e-4, which is 136x BELOW the arc's 0.05 rather than 1.7x above " +
                 "it, so v4556's blind window is the only binding constraint on the margin and always was. " +
                 "*** WHY IT SURVIVED: at rest the two references AGREE, bit for bit, because a reference " +
                 "that moves with the camera does not move when the camera does not -- and every convergence " +
                 "fixture in this arc holds the camera still. *** WHAT SURVIVES v4557 UNTOUCHED: the ring's " +
                 "speed ceiling, which is a count of `filled` and never depended on the reference, and the " +
                 "SHAPE of the argument. Only the floor's value was wrong. THE LAW THE FLOOR ACTUALLY " +
                 "FOLLOWS is the reprojection's SUB-PIXEL PHASE, not its speed: integer displacements are " +
                 "EXACT (1.19e-7 at 0, 1 and 2) because a whole-pixel step lands the bilinear fetch on texel " +
                 "centres, and a half-pixel phase reads the same at every speed that has one. So a bound from " +
                 "THIS frame's phase is wrong next frame and the usable floor is the worst over phases. AND " +
                 "THE QUESTION v4557's CLOSING LEFT OPEN IS ANSWERED NO: under camera ROLL the displacement " +
                 "runs from zero at the centre to over a pixel at the corners, and the rotation CENTRE has " +
                 "the SMALLEST error in the frame (2.9e-5) -- the per-pixel structure is real but a hundred " +
                 "times too small to need its own bound, so one frame-wide number is safe under rotation too. " +
                 "Against v4557's reference that centre read 8.2e-3 and looked exactly like the anomaly a " +
                 "per-pixel bound would be for. Six sabotages red at 18/12/3/4/4/7. *** ONE WAS A NO-OP AND " +
                 "READ 0 RED: *** wrapping the ring fetch's already-integer indices in Math.round left the " +
                 "bilinear WEIGHTS untouched, so nothing changed -- second time this session (v4553's BS was " +
                 "the first), and it matters most here, because this round's whole subject is the error " +
                 "bilinear interpolation leaves behind. The real mutation replaces the four-tap sum with one " +
                 "nearest sample. The corrected reference gets a sabotage of its own, since the reference IS " +
                 "the finding. Also: the first draft ran seventeen 32-frame sweeps at 64x64 and came in at " +
                 "3,070 ms, OVER the budget -- the fault v4551 and v4553 both recorded; sharing one sweep per " +
                 "speed between two sections and dropping to the arc's 48x48 brought it to 2,438.",
    }),
    since284: Object.freeze({
        at: "v4557", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "render/temporalRidgeMargin-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green, 1.84 s (1835/1837/1816 over three serial runs, under the 3000 ms sweep budget). *** " +
                 "THE RIDGE MARGIN HAS BEEN 0.05 SINCE v4553 BECAUSE THAT IS WHAT THE FIXTURES WANTED, AND " +
                 "v4556 MADE IT LOAD-BEARING *** by showing the lock detector's blind window is " +
                 "margin/contrast wide. This round derives what it should be standing above, and the answer " +
                 "is that it is not a constant. THE RING MEAN'S OWN ERROR IS A FUNCTION OF CAMERA SPEED, " +
                 "MEASURED against the analytic average the ring is supposed to reproduce: 1.2e-7 at rest, " +
                 "2.3e-2 at a quarter pixel per frame, 4.6e-2 at a half, and 8.4e-2 at ONE -- which is 1.7x " +
                 "the 0.05 the arc uses. So at rest the margin sits 400,000x above the floor, pure blind " +
                 "window bought for nothing; and under ordinary camera motion every lock this arc places is " +
                 "partly reading its own resampling error. BOTH FAILURE MODES ARE SHOWN ON A PICTURE, not in " +
                 "arithmetic: a thin feature of contrast 0.06 with the camera still gives 0 ridges at 0.05 " +
                 "and 46 at a floor-derived margin; the same smooth surface at 1 px/frame gives 116 ridges " +
                 "-- on content that has none -- at a margin derived at REST. Wrong in both directions, by " +
                 "different amounts at different speeds. *** AND THE RING HAS A HARD SPEED CEILING NOBODY HAD " +
                 "MEASURED: *** its footprint is 2*period*speed pixels, so on a 48-pixel frame coverage falls " +
                 "100% -> 83% -> 67% -> 33% and reaches ZERO at 3 px/frame, where the entire lock and shading " +
                 "mechanism is off and reporting 'unknown' correctly to nobody who was asking. ringCoverage " +
                 "is what a caller asks to find that out. COMPOSING v4556's CEILING WITH THIS ROUND'S FLOOR " +
                 "gives an interval, and it is EMPTY more often than a fixed 0.05 suggests: a feature of " +
                 "contrast 0.2 is lockable at rest and not at one pixel per frame, where the floor alone " +
                 "(1.26e-1) exceeds the ceiling (2.0e-2) and the faintest lockable feature would need a " +
                 "contrast of 1.26, which does not exist in a [0,1] signal -- printed as an impossibility " +
                 "rather than as a threshold a reader could aim at. Eight sabotages red at 3/3/2/2/1/1/2/8. " +
                 "*** ONE READ 0 RED AND IT WAS A CRASH, NOT A PASS, WHICH IS WORTH MORE THAN THE SABOTAGE " +
                 "WAS. *** Hard-coding `feasible` true left an interval with a null margin, the report loop " +
                 "guarded on `feasible` and then read `margin`, and the TypeError produced a stack trace with " +
                 "no FAIL lines -- which a harness that counts FAIL lines reads as green. The harness now " +
                 "scores a non-zero exit with no verdict as red, the loop guards on the value it uses, and a " +
                 "row asserts that `feasible` and `margin` agree. This file's own blind budget of 0.1 is " +
                 "named in its closing as the constant IT does not derive, which is the same debt one level up.",
    }),
    since283: Object.freeze({
        at: "v4556", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "render/temporalRidgePhase-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green, 0.99 s (989/949/998 over three serial runs, under the 3000 ms sweep budget). *** " +
                 "v4555 CLOSED BY NAMING A WORRY THAT DOES NOT EXIST, AND CHECKING IT FOUND A REAL ONE " +
                 "UNDERNEATH. *** The worry was diagonals: every line the arc locks is axis aligned, the band " +
                 "is measured along an axis, and a diagonal ridge's band is wider by root two. MEASURED at " +
                 "seven angles, the band test keeps ONE HUNDRED PER CENT of the ridges it finds at every one " +
                 "-- 46/46, 50/50, 47/47, 45/45, 46/46, 49/49, 46/46 -- and the count barely moves with angle " +
                 "(spread 5). The band is min(bandX, bandY) and a straight line is one pixel across along at " +
                 "least ONE axis whatever its angle; a 45-degree line is the most favourable case, not the " +
                 "worst. The concern was arithmetic nobody had run. *** WHAT THE CHECK TURNED UP IS A BLIND " +
                 "SPOT IN EVERY LOCK DETECTOR THIS ARC HAS BUILT, SINCE v4553. *** A thin feature whose two " +
                 "covered pixels come out within `margin` of each other -- what happens whenever it straddles " +
                 "a pixel boundary evenly -- is a strict extremum in NEITHER: two equal columns give ZERO " +
                 "ridges where one column gives 14, at every scale and every band setting. AND IT IS NOT A " +
                 "KNIFE EDGE: the blind window is margin/contrast wide, so a 0.4 px line is invisible at 5.5% " +
                 "of sub-pixel positions at contrast 0.90 and 24.5% at contrast 0.20 -- and faint thin " +
                 "features are exactly what a lock exists to protect. THE REPAIR is one line of reasoning: the " +
                 "deciding neighbour is the first that differs by more than the margin, not the adjacent one. " +
                 "Two equal columns go 0 -> 28, a one-column feature is unchanged, and a FLAT field stays at " +
                 "0 because still-inside-a-plateau-at-the-bound is UNDECIDED rather than a ridge -- which is " +
                 "the whole thing stopping a tie-tolerant test calling everything an extremum. On a one-pixel " +
                 "alternation the walk changes nothing (196 either way) and v4555's band test still takes it " +
                 "to 0: the two compose. WHAT IT COST THE THREE GATES THAT ALREADY READ THIS PRIMITIVE, since " +
                 "the change was made to the default rather than hidden behind an opt-in: raw ridges on a " +
                 "chequer 1,873 -> 1,935, a 3% rise the band test absorbs; v4555's own two fixtures read the " +
                 "SAME 4.00x on the line and the SAME 0% on the bar, on FEWER locks (13 against 193), so the " +
                 "fix is free on the pictures the arc argues over. Its coherent count moved 93 -> 179 and its " +
                 "band moved 1 -> 2, because a plateau of p makes a band of at least p; a maxBand below " +
                 "maxPlateau is now refused by name rather than quietly disagreeing. All three WGSL kernels " +
                 "carry the walk too. Seven sabotages red at 30/5/8/1/2/1/22 -- DA at THIRTY is the widest " +
                 "this arc has recorded, and DC is worth reading twice: that sabotage IS v4555's shipped " +
                 "behaviour, and it goes red only because section 2 finally has a picture that asks the " +
                 "question. ONE 0-RED FIRST: the WGSL tie tolerance, because the device fixture held only 0.1 " +
                 "and 0.9 so every neighbour difference was 0 or 0.8 and NOTHING ever fell inside the margin " +
                 "-- the CPU's fixture had a 0.02 pair and caught it. Same shape as v4554's pair: a property " +
                 "one side's pictures exercise and the other's do not. The device field now carries 0.90 " +
                 "against 0.88.",
    }),
    since282: Object.freeze({
        at: "v4555", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "render/temporalCoherentLock-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green, 1.09 s (1089/1104/1075 over three serial runs, under the 3000 ms sweep budget). *** " +
                 "v4554 CLOSED BY NAMING THE WRONG NEXT STEP AND THIS ROUND IS THE CORRECTION. *** It said an " +
                 "object-ID or material channel was what separates a painted thin line from a pixel-scale " +
                 "texture, and that it would be a renderer change rather than a pass change. BOTH HALVES WERE " +
                 "WRONG. A painted line and a painted chequer are both albedo on ONE flat surface -- same " +
                 "depth, same normal, same material, same draw -- so every per-pixel buffer a renderer writes " +
                 "gives them the same answer, and the gate asserts that by showing their depth buffers " +
                 "identical pixel for pixel. What differs is not what they are made of but their SHAPE, and " +
                 "shape was already in the buffers this pipeline had. A ridge ONE PIXEL ACROSS is a thin " +
                 "feature; a texture at the pixel scale is ridges everywhere. MEASURED on the ring's " +
                 "jitter-free mean: the band test keeps 46 of the line's 46 ridges and cuts the chequer's " +
                 "1,873 to 93 -- 20x with the feature untouched -- and on a PURE one-pixel alternation it " +
                 "finds EXACTLY ZERO where the plain test finds 2,116. ON THE TWO FIXTURES THIS ARC HAS BEEN " +
                 "ARGUING OVER IT DOMINATES BOTH EARLIER GATES: on v4554's painted line it gives 4.00x where " +
                 "the depth gate gave 1.00x, matching the luma gate exactly; on v4553's bar-over-chequer it " +
                 "pays 0% where the luma gate paid 26%, on 193 locks rather than 1,990. The luma gate's " +
                 "benefit with the depth gate's protection, and neither buffer. IT DOES NOT MAKE DEPTH " +
                 "REDUNDANT and saying so would be the easy overclaim: a wire whose luma contrast is half the " +
                 "ridge margin is invisible to every luma test at every scale (0 ridges, 0 coherent) and " +
                 "depth finds 46, so v4554's gate is narrowed rather than replaced and gateLocks still " +
                 "composes them. THREE THINGS THIS ROUND GOT WRONG FIRST AND FIXED BY MEASUREMENT. The ridge's " +
                 "run length ALONG its direction was the obvious test and it fails, because a run in the MASK " +
                 "is not a run in the feature -- and the row asserting so was written with a threshold carried " +
                 "from a DIFFERENT scene (690 of 713) that read 342 of 1,873 here, which is v4549's mistake " +
                 "exactly; it now compares the two candidate tests on the SAME picture and the band test wins " +
                 "by 3.7x. Section 4's depth row read a single frame and reported 0, repeating the very " +
                 "single-frame fault v4554 established. And the device fixture's 'three-pixel band' was a " +
                 "solid bar, which produces ZERO ridges -- an interior pixel is not an extremum and its edges " +
                 "are steps -- so maxBand 3 read the same count as maxBand 1 and the parameter was never " +
                 "tested. ALSO CHECKED BEFORE BEING BUILT ON: every scene since v4552 jittered in X only, " +
                 "discarding j[1]. It did not distort anything -- 1,840 chequer ridges against 1,873 with the " +
                 "full 2-D sequence -- and could not have, since a +/-0.5 px shift cannot average away 1.13 px " +
                 "structure in either direction. Eight sabotages red at 7/5/4/1/7/2/2, ONE 0-RED FIRST: " +
                 "conflating the ridge axes was invisible across ALL THREE lock gates, because the band is " +
                 "min(bandX, bandY) and the min quietly takes whichever axis is still correct. Unlike v4554's " +
                 "pair that was not a missing picture but a MASKING OPERATOR, and the property is now asserted " +
                 "where it lives rather than through a consequence.",
    }),
    since281: Object.freeze({
        at: "v4554", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "render/temporalDepthLock-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green, 1.18 s (1180/1166/1178 over three serial runs, under the 3000 ms sweep budget). THE ONE " +
                 "THING v4553 SECTION 5 SAID LUMA CANNOT DO, DONE WITH DEPTH -- AND WHAT IT COSTS. That row " +
                 "measured a luma lock detector locking 1,340 of 2,304 pixels on a chequer at the pixel scale " +
                 "and making the ghost 26% worse, and concluded no luma-only test separates a thin bright " +
                 "feature from a texture at that scale because they are the same signal. THEY ARE NOT THE SAME " +
                 "SIGNAL IN DEPTH: a wire is nearer than both its neighbours, a painted texture is at its " +
                 "neighbours' depth. MEASURED: on a geometric line over a pixel-scale chequer the candidate " +
                 "set falls from 1,834 luma ridges to 46 depth ridges -- 40x fewer, and 46 is exactly the " +
                 "line's own pixels -- while the chequer contributes ZERO, so the same picture with the line " +
                 "PAINTED gives 1,834 luma ridges and 0 depth ridges. On v4553's OWN penalty fixture the luma " +
                 "gate reproduces its 26% exactly on 1,990 locks and the depth gate removes it ENTIRELY: 0%, " +
                 "on 26 locks, which are the bar's own pixels. *** AND THE RESULT IS TWO-SIDED, WHICH IS THE " +
                 "ROUND RATHER THAN A CAVEAT ON IT: *** on a 0.4 px line PAINTED on a flat wall the gate " +
                 "refuses everything, giving away the whole 4.00x a luma lock buys there. Depth separates " +
                 "GEOMETRY from TEXTURE, which is a different cut than THIN from NOT THIN, and v4553's limit " +
                 "has not gone away -- it has been LOCALISED: a painted thin line and a pixel-scale texture " +
                 "are the same thing to every buffer this pipeline carries. WHY THIS IS A RIDGE TEST AND NOT " +
                 "A DEPTH-DISCONTINUITY TEST, on four hand-built fields: a wire gives 14, a SLOT 14, a " +
                 "SILHOUETTE EDGE 0 and a TILTED SURFACE 0. Every object boundary is a depth discontinuity, " +
                 "and locking them all would relax the clamp along exactly the silhouettes ghosting lives on. " +
                 "TWO FINDINGS FOUND THE HARD WAY AND HELD AS ROWS. First, a single frame's depth finds ZERO " +
                 "ridges on a sub-pixel feature, for v4553's reason restated on a different buffer -- so the " +
                 "ridges are remembered over a period, and that memory is a LOCK with life = P rather than a " +
                 "second mechanism. Second, that memory needs the SAME KILL RULES as the lock: it is " +
                 "reprojected by motion vectors, this tree's describe the CAMERA, and with a still camera and " +
                 "a moving bar 26 real ridges became 312 stale ones and the whole penalty came back. AND " +
                 "v4552's WIDE-BOX FINDING REACHES THIS RUNG TOO: a lock only earns anything where the clamp " +
                 "is BINDING -- 4.00x on a flat ground, 0.97x on a chequer, where the box already admits the " +
                 "feature -- and those are the same pictures where the luma detector's false positives live. " +
                 "Eight sabotages red at 5/1/3/7/1/2/3/3, TWO 0-RED FIRST and they are a PAIR: dropping the " +
                 "vertical ridge axis was invisible on the CPU AND on the device, because every feature in " +
                 "every picture here was VERTICAL and ridgeY was never once exercised. Not a mirror agreeing " +
                 "with itself, which is the shape v4550, v4552 and v4553 each found -- BOTH sides implemented " +
                 "a property no picture ever asked for. A horizontal wire now sits in section 1 and in the " +
                 "device field. One earlier sabotage attempt did not apply at all (its anchor matched both " +
                 "kernels) and its zero was recorded as a failed edit rather than read as a measurement.",
    }),
    since280: Object.freeze({
        at: "v4553", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "render/temporalLock-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green, 2.14 s (2142/2124/2280 over three serial runs, under the 3000 ms sweep budget -- but " +
                 "only after an optimisation; see below). PER-PIXEL STATE ACROSS FRAMES, AND A RUNG THAT " +
                 "ANSWERS A REFUSAL RATHER THAN ADDING A FEATURE. v4552 wrote a shading-change detector three " +
                 "ways and refused all three, because on a high-contrast surface a ONE-PIXEL JITTER MOVES A " +
                 "PIXEL BY AS MUCH AS A LIGHTING CHANGE DOES. *** THAT REFUSAL STILL STANDS: a one-frame " +
                 "detector is still refused and v4552 section 5 still holds it. *** What is shown here is that " +
                 "a WINDOW can do what a frame cannot, and the reason is arithmetic. MEASURED FIRST, BEFORE " +
                 "ANYTHING WAS BUILT ON IT: on a static jittered scene the worst difference between adjacent " +
                 "window means is 2.365e-1 at one frame, 1.182e-1 at two, 1.577e-1 at THREE -- worse than two " +
                 "-- 5.912e-2 at four, and EXACTLY ZERO at eight, the jitter phase count, because the same " +
                 "phase offsets recur in both windows and cancel. Against a light-drop signal of 0.2331 that " +
                 "makes a one-frame detector's signal-to-residue 0.99, which is v4552's refusal restated as " +
                 "arithmetic. *** AND IT IS NOT MONOTONIC IN THE WINDOW LENGTH, WHICH IS THE DESIGN RULE: *** " +
                 "the ring is jitterPhaseCount(ratio), not a taste parameter, and FSR2's 4 leaves 5.912e-2 " +
                 "where the phase count leaves 0 -- a choice about memory, not accuracy. ON v4552's OWN TWO " +
                 "FIXTURES: at a period of 8 the detector costs EXACTLY NOTHING, 3.660e-8 against 3.660e-8 " +
                 "with no detection, THE SAME FLOAT TO THE BIT, where v4552's one-frame form cost 3.0e5x; a " +
                 "period of 2 or 4 still costs 2.0e6x and 8.8e5x. It still catches the light change, worth " +
                 "1.82x over the following 8 frames, and the price is ONE PERIOD OF LATENCY that is exact -- " +
                 "the first four frames after the change are BIT-IDENTICAL to no detection, because both " +
                 "windows still straddle it. THE LOCK is the other thing the ring buys: a single frame finds " +
                 "ZERO lock candidates on a line 0.4 px wide (most jitter phases miss a sub-pixel feature " +
                 "entirely) where the ring finds all 46, worth 3.14x on the feature while holding 2.0% of the " +
                 "frame open -- and once the detector finds the feature every frame the LIFETIME STOPS " +
                 "MATTERING, life 4/8/16 identical, so FSR2's lifetime is compensating for detection that " +
                 "misses. *** THE LIMIT IS STATED WITH A NUMBER RATHER THAN LEFT TO BE FOUND: *** on a chequer " +
                 "at the pixel scale the ring still locks 1,340 of 2,304 and the lock makes the ghost 26% " +
                 "WORSE. There is no luma-only test separating a thin feature from a texture at the pixel " +
                 "scale, because at that scale they are the same signal -- and v4552 established those are " +
                 "exactly the pictures that matter. Ten sabotages red at 3/3/2/5/3/1/3/3/1/1 with one " +
                 "deliberate 0-RED. *** THE 0-RED THAT MATTERED WAS THIS ROUND'S OWN OPTIMISATION. *** The " +
                 "gate first ran at 3,180 ms, OVER the 3,000 ms budget -- the same fault v4551 and v4552 both " +
                 "recorded, an over-budget gate being skipped and its control stopping. Profiling put 25.6% in " +
                 "the harness serialising 313,000 numbers and 10% in the garbage collector, so the device " +
                 "section moved to a quarter of the area and pushLuma began swapping a scratch pair instead of " +
                 "allocating 147 KB a frame. Aliasing that pair with the live ring then changed NOTHING " +
                 "anywhere in the gate: with zero motion the reprojection is the identity, so each pixel only " +
                 "shifts its own slots. An optimisation whose safety nothing asserts is a defect waiting for a " +
                 "different motion vector, and it now has two rows -- bit-identity against a fresh allocation " +
                 "every frame, and the buffers staying distinct. The tenth sabotage, swapping back to " +
                 "reallocation, is 0-RED BY RIGHT: it is behaviour-preserving and only slower, and performance " +
                 "is held by sweep-timings and the budget rather than by a correctness row.",
    }),
    since279: Object.freeze({
        at: "v4552", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "render/temporalReject-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green, 1.51 s (1509/1513/1492 over three serial runs, under the 3000 ms sweep budget). THE LAST " +
                 "FOUR TEMPORAL ITEMS -- disocclusion, reactive masks, shading-change detection and the YCoCg " +
                 "box. THREE SHIP AND THE FOURTH IS REFUSED BY MEASUREMENT, which is the round's result. *** THE " +
                 "FINDING THAT ORGANISES ALL OF THEM: A NEIGHBOURHOOD CLAMP FAILS BY BEING TOO WIDE, NOT TOO " +
                 "TIGHT. *** v4550 measured that from the other side without naming it -- its anti-ghosting row " +
                 "cleared 2,304 pixels to 322 and the 322 were the EDGE pixels, where the 3x3 spans the range. " +
                 "So every picture here is deliberately high contrast (mean 3x3 span 0.7549 of the range, " +
                 "measured not assumed), because on a flat picture the clamp already does the work and any of " +
                 "these would read as an improvement it is not. DISOCCLUSION is exact: 52 of 52 true positives " +
                 "and 52 flagged, so no false positives either, and the ghost it prevents is 0.4256 rms of what " +
                 "the clamp ALONE leaves. It needed a new input, and rather than re-derive the reprojection it " +
                 "took render/motionVectors.mjs's fourth channel, which was a HARD-CODED ZERO, and made it " +
                 "zPrev -- one line further down a reprojection that function already performed. THE REACTIVE " +
                 "MASK removes 0.14885 rms the clamp cannot, and the gate says plainly that the masked rms is 0 " +
                 "BY CONSTRUCTION and the informative number is what the clamp leaves. YCoCg IS THE FOLKLORE " +
                 "CLAIM CUT DOWN: measured over 200,000 two-material neighbourhoods it is only 1.07x tighter, " +
                 "not the decisive win, and neither box contains the other (RGB-only 4,745, YCoCg-only 4,257). " +
                 "What IS real is which errors get through -- what RGB uniquely admits sits 16% farther from " +
                 "any real neighbour. On a picture it buys 1.06x where a box can act and EXACTLY 1.00x, " +
                 "identical to 0e+0, where the 3x3 touches the occluder: no box in any space can reject a " +
                 "colour its own neighbours have. *** SHADING-CHANGE DETECTION IS REFUSED AND SECTION 5 IS THE " +
                 "ROW THAT KEEPS IT REFUSED. *** Three formulations were written and measured -- point-vs-" +
                 "history 2.3e5x, mean-vs-history 1.7e5x, mean-vs-previous-frame 2.5e5x -- and all three " +
                 "destroy convergence on a static jittered scene, because on a high-contrast surface a ONE-" +
                 "PIXEL JITTER MOVES A PIXEL BY AS MUCH AS A LIGHTING CHANGE DOES, and moving the sample point " +
                 "by a pixel is what jitter is FOR. At a strength weak enough not to be degenerate it buys 1.5x " +
                 "on the case it is sold for while still costing 3.0e5x on the case the arc is for; there is no " +
                 "setting where the trade is worth making. It is not exported, and the gate re-derives it " +
                 "inline so the refusal cannot be quietly undone. TWO CORRECTIONS TO CLAIMS THIS ROUND ITSELF " +
                 "WROTE: the YCoCg round trip is NOT bit exact (42.4% of colours exact, the rest one ulp -- " +
                 "which compounds to 1.8e-12 of an 8-bit LSB over 32 frames, so the concern was right and the " +
                 "assertion was wrong); and the static-convergence scene was PHASE-LOCKED, its chequer cell " +
                 "exactly one pixel and aligned to the grid, so 32 jittered frames came out bit-identical and " +
                 "every variant read rms 0 and looked like a pass -- a picture with nothing to average is not a " +
                 "test of an averaging pass. Nine sabotages red at 4/5/1/5/1/1/5/2/2, TWO 0-RED FIRST and both " +
                 "the same fault: a value produced on one side and consumed on the other with nothing between " +
                 "them asserting it. zPrev was blanked in the WGSL and NEITHER gate noticed -- the motion gate " +
                 "read channels 0, 1 and 2, and this gate uploads a CPU-built motion buffer and never runs that " +
                 "kernel; and the disocclusion THRESHOLD was decoration, because a 3-to-8 depth separation " +
                 "makes every gap either 0.556 or exactly 0 and no threshold between them is distinguishable. " +
                 "Both now have rows. A third sabotage was itself a no-op and is recorded as one.",
    }),
    since278: Object.freeze({
        at: "v4551", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "render/temporalResolve-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        // *** THE SECOND HALF OF THIS ROUND WAS NOT PLANNED AND IS THE MORE IMPORTANT HALF. ***
        // Re-taking the records after the resolve rung found FOUR of them stale, all naming the same five
        // gates: assertionShape's census (1605 -> 1610), runtimeGap's twelve rows (4031 -> 4045 files and
        // four rows moved), sweep-timings.json (no reading or stamp for any of the five), and redCensus,
        // which still parked tslSource-selfcheck as red EIGHT ROUNDS after v4543 turned it green. Every
        // round of the FSR arc ran gateSweep, instruments and sweepCoverage and called that the ritual;
        // none of those four is in that set. v4548 already shipped a round titled "the ship ritual does not
        // check half its own records" -- and its repair re-took the records instead of making the ritual
        // reach them, so the same fault recurred five rounds later at four times the size. THE REPAIR THIS
        // TIME IS THE RITUAL: recordDrift's pre-flight gained a sixth check, over the runtimeGap census,
        // whose obligation OWES.runtimeGap had DECLARED since v4482 with nothing behind it -- the one clause
        // of six that named a duty and never enforced it. Its stated obstacle ("the walker cannot leave its
        // gate without putting fs into a module with zero imports") did not hold: recordDrift.mjs imports fs
        // and exports the walker. Of the four stale records, that pre-flight now catches three; the fourth
        // is named in reportLines as a gap WITH ITS REASON rather than left out, because the only cheap
        // signal for a registered red is sweep-timings' codes table and that table said tslSource exited 1
        // while it had exited 0 since v4543 -- a check reading it would have confirmed the stale
        // registration instead of finding it. Sabotages BI/BJ/BK/BL/BM/BN red at 1/3/1/1/1/1, BN 0-RED
        // first: the memo that keeps the new check inside the sweep budget was documented as keyed on the
        // census function "so an injected fake is not served from cache", and nothing tested that -- a
        // constant key left every other row green. Two further findings fell out. The check's first draft
        // spelled the twelve capability labels in recordDrift.mjs and MOVED TWO OF THE ROWS IT CHECKS
        // (performance.now 220 -> 221, raf 116 -> 117), because the census greps file text: a drift detector
        // that changes the number it detects is not a detector, and the map moved to runtimeGap.mjs, which
        // owns both tables. That move then moved WebGL 141 -> 142 and exposed the second: runtimeGap.mjs's
        // own headline, "THE MODULE THAT DEFINES THE CENSUS MATCHES EVERY SINGLE ONE OF ITS OWN TWELVE
        // PATTERNS", was FALSE and had been since the WebGL lookbehind landed -- the module matched eleven,
        // the twelfth hit came from its gate, and the row passes because it derives over both files while
        // its headline names one. And the check nearly repeated the fault it was written to fix: eleven
        // checks() calls at 554 ms each took recordDrift-selfcheck from 1,799 ms to 6,813 ms, past the
        // 3,000 ms budget that is exactly why these detectors go unrun; the memo brought it to 2,647.
        verdict: "green, 1.04 s (1102/1040/1043 over three serial runs, under the 3000 ms sweep budget). THE PIECE " +
                 "THAT MAKES IT UPSCALING RATHER THAN ANTI-ALIASING: v4550 accumulated at ratio 1, where the samples " +
                 "and the output share a grid; this is the one place a render-resolution sample has to land BETWEEN " +
                 "display pixels, and the whole thing turns on subtracting the jitter from the source position -- " +
                 "srcPos = uv*renderSize - 0.5 - jitter. MEASURED against the same 256-sample analytic ground truth " +
                 "at ratio 2: temporal 0.05541 rms vs EASU's 0.09317, which is 1.68x better than the best SPATIAL " +
                 "upscaler in this tree, and better than one resolve (0.09582) or bilinear (0.09699). THE JITTER " +
                 "SUBTRACTION ALONE BUYS 28% OF IT: run jitter-BLIND -- same frames, same accumulation, same kernel, " +
                 "only the subtraction removed -- and the same pipeline reads 0.07102. WHAT UPSCALING COSTS, stated " +
                 "in the one number that can state it: v4550's ratio-1 accumulation reaches 0.01041 and this reaches " +
                 "0.05541, so 2x upscaling is 5.3x worse than not upscaling and the comparison worth making is " +
                 "against other upscalers, not against native. The kernel is checked at its own values (1 at 0, " +
                 "2.5e-17 at 1, -0.063684 at 1.5, 0 at 2 and 3) and the resolve is BIT EXACT at ratio 1 with zero " +
                 "jitter -- worst 0.00e+0 -- which is the row that covers weight normalisation and nothing else does. " +
                 "The dering clamp is asserted on BOTH sides independently: CPU undered [-0.0336, 1.0691] vs dered " +
                 "[0.0000, 1.0000], and the DEVICE's own output [0, 1] vs its own undered [-0.1478, 1.1478], so the " +
                 "property is measured on the device rather than inherited from the CPU. Confidence at 2x with zero " +
                 "jitter is 0.6464 on every pixel = 1 - hypot(0.25, 0.25), the distance to the base texel, derived " +
                 "and not declared. Period holds: frames 32 and 64 agree to 3.78e-10. Device parity worst 1.73e-5 = " +
                 "4.4e-3 of an 8-bit LSB, stated in LSBs because a nine-tap sin() kernel in f32 against f64 will not " +
                 "be bit-identical and what matters is whether a viewer could see it. Seven sabotages red at " +
                 "1/3/7/2/1/1/2, no 0-RED. One was deliberately WGSL-ONLY (the base texel floored instead of " +
                 "rounded) because v4550's two 0-REDs were both changes made to BOTH sides that left the mirror " +
                 "agreeing; it caught at 1.43e-1, 36 LSBs. The thin one is the weight normalisation at 1 red, which " +
                 "survives only because the identity row is bit-exact -- loosen that row and it stops being covered.",
    }),
    since277: Object.freeze({
        at: "v4550", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "render/temporalAccumulate-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green, 1.38 s (1387/1356/1389 over three serial runs, under the 3000 ms sweep budget). THE FIRST " +
                 "RUNG OF THIS ARC THAT MAKES A PICTURE, and the first that can test the claim the others rest on: " +
                 "render/jitter-selfcheck.mjs can say the Halton sequence is low-discrepancy, but that the " +
                 "accumulation CONVERGES TO A SUPER-SAMPLED RESULT is a claim about an image and nothing here blended " +
                 "a history buffer. MEASURED against a 256-sample-per-pixel analytic ground truth: rms falls 0.05819 " +
                 "-> 0.01653 (8 frames) -> 0.01041 (32), which is 5.4x better than the single point-sampled frame's " +
                 "0.05675 -- and with the JITTER OFF the same accumulation reads 0.05675 at every one of 64 frames, " +
                 "identical to one frame, so the jitter does the work and not the blend. The period is the phase " +
                 "count (frames 32 and 64 agree to 2.8e-7 of the error). The anti-ghosting clamp costs 1.2% of " +
                 "convergence on a static scene, and stops a ghost on 2,304 of 2,304 pixels down to 322 -- the edge " +
                 "pixels, where the current frame's own 3x3 spans the range and the ghost is a value that could " +
                 "legitimately be there. A HYPOTHESIS THAT DID NOT SURVIVE, recorded so it is not guessed again: the " +
                 "residual is NOT v4549's off-centre bias -- 63 phases reaches 0.00489 at an offset of 1.4e-2 while " +
                 "127 reaches 0.00553 at half that offset, so it is QMC sampling error on a hard edge and a phase " +
                 "count picked by the offset would be picked wrong. TEMPORAL ANTI-ALIASING, NOT UPSCALING, and said " +
                 "so: at ratio 1 the samples and the output share a grid; above 1 the jitter-aware Lanczos2 upsample " +
                 "is its own piece. Seven sabotages red at 2/3/2/1/2/6/1 -- TWO OF THEM 0-RED FIRST and recorded as " +
                 "findings: a nearest-instead-of-bilinear history fetch was invisible because every convergence row " +
                 "holds the camera still (so the reprojection lands on a texel centre) and a change made to both " +
                 "sides leaves the parity row agreeing; and a WGSL-only swap of the clamp's source was invisible " +
                 "because the parity history was nearly the current frame. Both gaps were the same shape -- a " +
                 "property that only shows under conditions no row arranged -- and both now have a row.",
    }),
    since276: Object.freeze({
        at: "v4549", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "render/jitter-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green, 0.06 s (63/57/62 over three serial runs -- CPU only, no browser). THE THIRD AND LAST " +
                 "PREREQUISITE the temporal path was missing: render/jitter.mjs holds the Halton(2,3) sub-pixel " +
                 "sequence FSR2/3 offsets each frame by, and the PAIR of matrices that offset produces -- jittered " +
                 "for rendering, unjittered for motion vectors. MEASURED: the radical inverse is exact against " +
                 "hand-checkable values; the phase count is FSR's own 8*ratio^2 (8/32/72/128 at 1x/2x/3x/4x); a " +
                 "(+0.5, +0.25) pixel jitter moves the projected point by exactly that at EVERY depth from 0.5 to 95 " +
                 "units, to 3.6e-15 of a pixel, because it is applied as a CLIP-space translation and so works on a " +
                 "view-projection and not only on a bare projection. *** THE PROPOSED PROPERTY 'the jitter cancels " +
                 "exactly over a full period' IS FALSE AND THE GATE SAYS SO: *** a centred Halton mean vanishes " +
                 "exactly at n = base^k - 1 (1,3,7,15,31,63,127,255 for base 2; 2,8,26,80,242 for base 3), those " +
                 "sets never meet, no n up to 300 zeroes both axes, and FSR's 8*ratio^2 is not one of them -- at 32 " +
                 "phases the sequence sits 1.5% of a pixel off-centre in x and 1.9% in y. Low discrepancy is measured " +
                 "against 2,000 random draws rather than one: Halton's 4x4 occupancy spread is 2, random's median 5, " +
                 "and random was better in 0 of 2,000. The coupling row is the point of the rung: with a STATIC " +
                 "camera the unjittered pair reports 1.3e-7 of a pixel and the jittered pair 0.083 of a pixel of " +
                 "motion that never happened, which is exactly the jitter difference between the two phases. Eight " +
                 "sabotages, seven red at 2/3/5/3/2/1/1 -- and one 0-RED recorded as a finding: the sequence's " +
                 "1-based start was asserted nowhere, because every row either called halton() directly or compared " +
                 "the sequence against itself, so a row was added that pins the first element and refuses the " +
                 "index-0 pixel corner, after which it goes red too.",
    }),
    since275: Object.freeze({
        at: "v4548", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "render/motionVectors-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green, 0.75 s (750/747/741 over three serial runs, well under the 3000 ms sweep budget). PER-PIXEL " +
                 "MOTION VECTORS and the previous-frame view-projection to make them from -- the prerequisite rung " +
                 "fx/fsr's gate named when it said the temporal path cannot start here, and useful without it, since " +
                 "a velocity buffer is what temporal AA, motion blur and any reprojection want. render/motionVectors.mjs " +
                 "holds the history and the CPU reference, render/motionVectorsWgsl.mjs the WGSL, and it runs on a real " +
                 "WebGPU device through gfx/device.js. MEASURED: a STATIC camera gives zero on every pixel to 8.1e-9 on " +
                 "the CPU and 2.4e-5 of a PIXEL on the device, under BOTH clip conventions (GL's z in [-1,1] and " +
                 "WebGPU's [0,1]), which is what makes the module's claim to be agnostic in z a measurement rather than " +
                 "prose; a known camera move gives what an INDEPENDENT projection of the same point computes, to six " +
                 "decimals, by a different path; PARALLAX goes as 1/distance with |velocity| * distance constant to " +
                 "9.8e-4% across a 64x range; and a surface behind the previous eye comes back INVALID rather than " +
                 "plausibly zero. The device parity bound is stated in PIXELS (2.4e-4 px) and not in fx/fsr's 1e-6: an " +
                 "unprojection through an inverse matrix followed by a difference of nearly-equal uv values is " +
                 "catastrophic cancellation by construction, and 1e-6 was a number copied from a better-conditioned " +
                 "problem. The first frame has NO history and says so -- advance() returns null, because zero velocity " +
                 "and no velocity are different answers and a temporal pass believes the first. Seven sabotages red at " +
                 "5/2/2/6/1/1/2, none 0-RED; ignoring depth leaves both static-camera rows GREEN and is caught only by " +
                 "the parallax row, which is why that row exists. Unchecked: a MOVING OBJECT (every row moves the camera " +
                 "and holds the world still, so a per-object previous model matrix is its own rung), reading the depth " +
                 "through dev.depthTexture() rather than handing it in, the JITTERED projection which is the third " +
                 "prerequisite, and DISOCCLUSION, which `valid` does not catch.",
    }),
    since274: Object.freeze({
        at: "v4546", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "fx/fsr/fsr-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([
            "fx/fsr/fsr-selfcheck.mjs (v4547: RCAS, FSR1's other half, and the device run graded on BOTH denoise settings)",
        ]),
        verdict: "green, 1.42 s (1422/1502/1426 over three serial runs at v4547, from 1.02 s at v4546; well under the " +
                 "3000 ms sweep budget). FSR1 -- EASU then RCAS -- as an ALGORITHM rather than a dependency: fx/fsr/fsr.js " +
                 "transcribes the f32 references FsrEasuF and FsrRcasF from ffx_fsr1.h (MIT), fx/fsr/fsrKernels.js mirrors " +
                 "them in WGSL statement by statement, and both run on a real WebGPU device through gfx/device.js. The " +
                 "vendor-or-implement question was MEASURED: @pmndrs/upscaler@0.2.0 carries 2,743 lines of WGSL that import " +
                 "no three at all and 3,331 lines of three.js DRIVER around them, and gfx/device.js already is that driver " +
                 "-- the same reading fx/anime4k wrote into its own header two upscalers ago. MEASURED: the GPU picture is " +
                 "the CPU reference's to 2.98e-7 (EASU) and 1.19e-7 (RCAS, both denoise settings) on every one of 12,288 " +
                 "channels; a constant field survives both passes to 2.4e-8; EASU rings 0 of 12,288 channels outside the " +
                 "four-nearest bounds and leaves 67 intermediate pixels on a pure diagonal where bilinear leaves 248; RCAS's " +
                 "sharpness knob is monotone in Laplacian energy (11.09 -> 11.36) and its denoise pulls back 44% on grain " +
                 "against 0.6% on a clean edge. TWO FINDINGS ABOUT RCAS's LIMITER, both recorded in the gate: its " +
                 "denominators are 0/0 on flat black and flat white, where WGSL's NaN-swallowing max() silently resolves a " +
                 "lone white pixel on black to 4.0 and JS's Math.max returns NaN -- both sides carry an epsilon now; and " +
                 "RCAS_LIMIT keeps the resolve off the POLE of 1/(4*lobe+1) rather than bounding the output, so RCAS " +
                 "overshoots a local peak (1.000 in, 1.166 out) and a caller writing 8 bits must clamp. SPATIAL ONLY and " +
                 "said so: the temporal path wants depth, per-pixel motion vectors and a jittered projection with history, " +
                 "and this tree has no motion vectors and no previous-frame view-projection matrix anywhere in it. Eleven " +
                 "sabotages red at 2/2/2/1/2 (EASU) and 5/1/3/1/4/1 (RCAS), none 0-RED; dropping RCAS_LIMIT reaches " +
                 "Infinity at the peak, which is that claim demonstrated.",
    }),

    // v4539 -- THE 233rd CLOSING, for the gate this round added.
    since260: Object.freeze({
        at: "v4539", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/groundProbe-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly: 6 pass, 77 ms. *** PIECE (3) OF terrain-controller CANNOT BE " +
                 "CLOSED WHILE PIECE (2) IS OPEN, AND THAT IS A PROOF. *** An overhang really does read as a " +
                 "wall -- the body stops at x=8.0000 on a covered walkway, refused by the STEP test and not " +
                 "the slope test the entry's wording points at. But casting from the body's own height opens " +
                 "the walkway to 20.0000 AND WALKS THROUGH A SOLID PILLAR to 20.0000, where the shipped " +
                 "oracle correctly stops at 8.0000. Build the pillar to the roof's height and every surface " +
                 "under a vertical ray is [5, 0] at both: BYTE-IDENTICAL, because a downward ray never " +
                 "touches a side face and the side faces are the whole difference between a doorway and a " +
                 "wall. The missing information is in the swept volume, which is piece (2). The entry also " +
                 "points at an adapter with NO shipping caller while the live instance -- surfaceProbe's " +
                 "standHeightAt, read by the bot manager and the pathfinder pool -- answers 21 for a body " +
                 "standing at y=1. Sabotages A/B/C/D red by name, and TWO of them went 0 RED first: B " +
                 "because deleting a side quad cannot move a number a downward ray produced (the row was " +
                 "checking the thesis with the instrument the thesis calls blind, and is a horizontal ray " +
                 "now), and C because I had the nudge backwards -- 0 works and 6 breaks it, the hazard being " +
                 "a nudge too LARGE to stay above the next surface rather than too small to leave the last.",
    }),
    // v4538 -- THE 232nd CLOSING, for the gate this round added.
    since259: Object.freeze({
        at: "v4538", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/pathCost-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze(["nav/navmesh.mjs"]),
        verdict: "green on this box, run singly: 6 pass, 362-376 ms. *** THE A* COST MODEL WAS FILED AS " +
                 "UNGUARDED FOR TWENTY ROUNDS AND WHEN IT WAS MEASURED IT WAS ALSO WRONG. *** The item asked " +
                 "for a fixture separating g + distance from a flat g + 1 and named a trap map that had " +
                 "failed to. That map punishes GREEDINESS, and both models are greedy once the heuristic " +
                 "dominates, so it could never have separated them. Ranking two routes OPPOSITELY by metres " +
                 "and by polygon count is the question, and asking it found the planner declining a route it " +
                 "can itself find: 193.13 m returned where the mesh holds 141.42, proved by splitting the " +
                 "query -- 70.71 m to the diagonal's midpoint and 70.71 m onward, both legs planned by the " +
                 "same planner on the same mesh. THE CAUSE IS ONE LINE, and not the one I predicted: I " +
                 "guessed the staircase over-priced the diagonal, and it is the reverse -- the diagonal reads " +
                 "140.71 against a walked 141.42 while the L accumulates 100.10 for a walked 193.13, " +
                 "UNDER-PRICED BY 48.2%, because g chained entry point to portal MIDPOINT and a long portal " +
                 "cuts a corner in proportion to POLYGON SIZE. Entering at the nearest point returns the " +
                 "witness exactly, at six geometries. It moves NOTHING already measured, which is why the " +
                 "round ships a fixture rather than a row: no gate the tree had would catch the repair being " +
                 "undone. Sabotages A/B/C/D all 2 RED by name, and B WENT 0 RED ON ITS FIRST DRAFT because it " +
                 "passed a third argument the callee never receives -- a sabotage that goes zero red is a " +
                 "finding about the sabotage until proven otherwise.",
    }),
    // v4537 -- BOTH LINES APPENDED CLOSINGS IN THE SAME WINDOW AND BOTH REACHED FOR 223 AND 224. Main got
    // there with seven of them, so these two are renumbered to 230 and 231 rather than main's renamed: the
    // list shape exists exactly so a round appends and nobody renegotiates a name, and the side that merges
    // second is the side that moves. FOURTH MERGE RUNNING where both lines re-took the same records.
    // v4536 -- THE 230th CLOSING, for the gate this round added. *** THE ORDINAL IS A KNOWN COLLISION AND IS
    // RECORDED RATHER THAN RENUMBERED: *** the entry below is stamped v4572 from the other line's counter,
    // which runs ahead of the one main.js keeps -- main carried v4535 when that entry landed. The list shape
    // is what makes that survivable; a round appends and nobody renegotiates a name.
    // v4537 -- THE 231st CLOSING, for the gate this round added.
    since258: Object.freeze({
        at: "v4537", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/backlogAbsence-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly: 6 pass, 1,855-1,986 ms over three readings. *** THE " +
                 "INSTRUMENT FOR GRADING ABSENCE CLAIMS HAD BEEN RUN ON ONE CLAIM IN ITS LIFE: ITS OWN. *** " +
                 "absenceScope.mjs (v4435) separates OUT OF SCOPE from IN SCOPE AND MISSED from A DENIAL " +
                 "COUNTED AS A PRESENCE, and gradeClaim() is called from one file -- absenceScope's own " +
                 "selfcheck, on absenceScope's own frozen record. nextRounds.mjs carries the live absence " +
                 "claims, NAMES the grader in its own prose, and imports node:url. Six live claims graded, " +
                 "six hold -- and the acquittals are the argument, not the convictions: one entry's token " +
                 "returns TWELVE code files tree-wide, every one outside the directory its author scoped the " +
                 "claim to, because the same word names a matrix layout in math/solverFit.mjs. The seventh " +
                 "row is a CONTROL that must convict, restating the off-branch entry's claim that this tree " +
                 "has nothing resembling a GPU path tracer as a rendering feature: SIXTEEN code files in " +
                 "scope and missed. Sabotages A 3 RED / B 1 / C 1 / D 2, and D is the thesis driven -- drop " +
                 "the scope and a TRUE claim reads as false. *** AND THE FIRST DRAFT LANDED IN ALL SIX OF " +
                 "ITS OWN CENSUSES, *** spelling its needles as string literals and quoting them again in " +
                 "prose, moving two of them from one denial to two before it had graded anything: v4409's " +
                 "rule for the sixth time this session, inside the check written to apply it. The gate also " +
                 "first came in at 3,011 ms against the 3,000 ms budget because it cleared absenceScope's " +
                 "read cache out of tidiness -- eleven milliseconds is not a failed gate, it is an EXILED " +
                 "one.",
    }),
    // v4540 -- RENUMBERED 230 -> 234 AT THE MERGE. Main's v4584 reached for 230 while this branch's v4536
    // already held it, which gateSweep's own duplicate-ordinal row caught -- a runtime read cannot see two
    // object keys of the same name, the later one wins silently and the earlier round's swept count vanishes
    // from the surplus arithmetic. FIFTH ORDINAL COLLISION between the two lines this session; the side that
    // merges second is the side that moves.
    since273: Object.freeze({
        at: "v4554", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/kaijuGround-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly: 19 checks in six sections, 708-721 ms over three runs. "
               + "*** THE KAIJU'S HEIGHT IS WRITTEN TWICE EVERY FRAME BY TWO RULES, AND THE ONE THAT WINS IS "
               + "THE ONE NOBODY DESIGNED TO WIN. *** main.js calls camera.update() at :29660 and "
               + "kaijuManager.tick(dt) at :29931, same frame, camera first. _moveKaijuDrive integrates a "
               + "fall through fallBody.fallStep and writes k.position.y; KaijuManager.js:280 then assigns "
               + "`k.position.y = gy` outright, guarded on k.state ALONE. Measured: the clamp overwrote the "
               + "drive's answer on 300 of 300 frames. So v4548's work removing the fourth copy of 'fall "
               + "until you land' from this path is correct and DEAD in the shipping frame order. "
               + "*** AND THE OBVIOUS ONE-LINE FIX IS A CATASTROPHE, WHICH IS THE ROUND: *** guarding the "
               + "clamp with _isPlayerDriven -- exactly what two writers for one quantity usually deserve -- "
               + "drops 56 of 60 driven kaiju below y = -20 over five seconds of walking, against 0 of 60 "
               + "with the clamp left alone. The drive cannot hold a body up: its probe is _fallSurface() at "
               + "reach 0 so it has never once gained height, and its horizontal move is unguarded because "
               + "_canStandAt has exactly ONE call site in the tree and it is the other controller in the "
               + "same class. The redundant write is load-bearing by accident. FIVE SABOTAGES: K1 the naive "
               + "guard 1 RED, K2 _terrainTop drops its +1 1, K3 the drive stops writing y 5, K4 the drive "
               + "given a step-up 4, K5 the false comment restored 2. *** K2 WENT ZERO RED FIRST BECAUSE "
               + "SECTIONS 2-4 DRIVE A TRANSCRIPTION OF _terrainTop *** -- a check grading its own copy, for "
               + "the third time in five rounds; the copy is pinned to the source's text now. ALSO MEASURED "
               + "AND DECLINED: _heightAt is the FIRST AIR index in 2,240 of 2,240 non-water samples, so "
               + "_terrainTop's `return h + 1` is one voxel too high by the model's own convention and reads "
               + "above the voxel stand height in every sample. NOT FIXED: gy feeds the flyers' cruise "
               + "altitude, the swimmers' water line and the wake test, so a one-voxel correction moves every "
               + "kaiju in the game -- a gameplay decision, not a census's. AND THE FALSE COMMENT IS "
               + "CORRECTED: camera.js said the drive flag is set 'so AI tick skips'; the flag has exactly "
               + "ONE use in the manager and it picks an animation clip.",
    }),
    since272: Object.freeze({
        at: "v4552", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/walkGround-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly: 35 checks in eleven sections, 840-922 ms over three runs. "
               + "*** THE WALK STOOD THE BODY INSIDE SOLID ROCK AND HAD DONE SINCE v404 MADE THE GROUND "
               + "BILINEAR. *** _terrainTopAtBilinear blends up to four columns and so answers heights "
               + "NEITHER has; _moveFP assigned one to position.y and nothing asked _canStandAt whether a "
               + "body fits there -- that predicate has one shipping call site and it is the HORIZONTAL "
               + "move. Measured on the generated world with an instrument sharing no code with the fix: "
               + "56.56% of grounded frames and 36.13% of distinct standing positions buried, 67 of 128 "
               + "ordinary walks frozen inside rock. After: 1.51%, 2.77%, 2 of 128. *** THE FINDING THAT "
               + "DECIDED THE SHAPE IS THAT NO GROUND RULE IS BOTH LEGAL AND SMOOTH: *** a sub-voxel height "
               + "on a unit lattice is by construction a height no column has, so the blend's smoothness IS "
               + "its illegality, and the smoothness has to come from TIME instead. The body stands on real "
               + "surfaces and the EYE eases toward it at 12/s, bounded by a snap guard between STEP_UP_MAX "
               + "and CLIFF_DROP. *** THE HYBRID max(blend, legal) LOOKED LIKE A FREE LUNCH AND IS A STENCIL "
               + "BUG: *** the blend samples the body's own cell and the three in +x/+z ONLY, so it leads "
               + "the terrain by half a cell and that shift cancels the footprint lookahead one way and "
               + "doubles it the other -- 0.4167 max |dy| on +x/+z ramps against 1.0000 on -x/-z. A hill "
               + "that glides walking north and stairs walking south is a new defect; the four-direction row "
               + "that catches it is new and no prior round had one. ELEVEN SABOTAGES: S1 18 RED, S2 10, S3 "
               + "6, S4 2, S5 15, S6 15, S7 6, S8 3, S9 1, S10 4, S11 2. *** S8 AND S9 WENT ZERO RED FIRST "
               + "AND BOTH WERE THE GATE'S OWN FAULT -- IT WAS GRADING A COPY OF THE SMOOTHER because "
               + "update() wants a canvas, which is v4541's sabotage B in the round that keeps naming the "
               + "species; camera.js grew _stepRenderEye so the gate drives what ships. S9 then still read 0 "
               + "because a natural fall never trips the snap guard: MEASURED, gravity 18 at 60 Hz moves a "
               + "body at most 0.45 in a frame, so the guard is for the ten external writers of position.y "
               + "and the fixture teleports instead. *** S6 CARRIED A DECLARED STOP CONDITION AND SHARPENED "
               + "THE ANSWER RATHER THAN TRIPPING IT: with BODY_RADIUS = 0 the residual burial goes to "
               + "0.00%, so the clamp's entire residual is the RADIUS meeting the step-up reach limit. AND "
               + "S11 FALSIFIED THE ROUND'S OWN PREDICTION: the design expected taking the walk off the "
               + "blend to ORPHAN its stencil defect at 0 RED; it goes 2, because playerSlope and cameraFall "
               + "drive the blend directly. Filed, not unguarded. NOT CLOSED AND SAID PLAINLY: whether a "
               + "1.0-voxel step eased at 12/s LOOKS smooth -- no frame has been rendered at any rate by "
               + "anyone in this round or its four measurement probes, so every smoothness number here is a "
               + "trace and the perceptual question is a human's.",
    }),
    since271: Object.freeze({
        at: "v4551", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/voxelAvatarDevice-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly: 6 checks, 2,796-2,928 ms over three runs -- OVER the 3,000 "
               + "ms budget on purpose, which is the round. *** A GATE THAT BOOTS A BROWSER CANNOT FIT IN A "
               + "SHIP-TIME BUDGET, AND THE CPU ROWS SHARING ITS FILE ARE EXILED WITH IT. *** "
               + "tools/ship/voxelAvatar-selfcheck read 3,063 ms against 3,000, so the quick sweep skipped "
               + "the WHOLE file -- including the rows that had actually caught a camera regression, v4545's "
               + "repair being red there and green at HEAD. Timed by section: the walk 40 ms, the matrix "
               + "twin 2 ms, both-backends ~2,800 ms. 42 MS OF 2,850 WAS CPU. The device half is a Chromium "
               + "launch plus two GPU device initialisations already reduced to one origin call looping over "
               + "both backends, so there is nothing to compress and 'make the gate faster' has one "
               + "available meaning: make the SHIP-TIME gate cheap. Split here; voxelAvatar-selfcheck now "
               + "runs in 102-138 ms, a 22-30x drop, with margin enough that it is no longer a straddler. "
               + "*** NO COVERAGE MOVED DOWN AND THE COUNTS SAY SO: *** the whole file was over budget "
               + "before, so both halves were covered only by the sweep rotation; 21 ok() sites became 17 + "
               + "4 and 23 PASS rows became 17 + 6. AND THE v4522 BATTERY WAS RE-RUN ACROSS BOTH HALVES "
               + "RATHER THAN THE NEW FILE MERELY PASSING: A 5 RED, B 12, C 13, D 4 -- every count IDENTICAL "
               + "to v4522's, every sabotage caught by BOTH halves, and all four now caught at ship time "
               + "where none of them was. A fifth sabotage deletes this file and reddens "
               + "instruments-selfcheck by name, because physics/instruments.mjs carries a voxel-avatar-"
               + "device entry: the device half cannot evaporate and leave a register claiming coverage "
               + "nobody runs. *** AND voxelAvatar WAS ONE OF FIFTY-TWO: *** 95 gates call "
               + "runInEngineOrigin and 52 were over the budget; the remaining 50 carry 698 ok() sites "
               + "BEFORE their first harness call. That 698 is a CANDIDATE COUNT BY ROW POSITION AND NOT A "
               + "MEASUREMENT OF TIME -- said plainly because only voxelAvatar was timed by section, and "
               + "turning a candidate into a split means timing that gate the same way first.",
    }),
    since270: Object.freeze({
        at: "v4550", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/playerWater-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly: 44 checks in twelve sections, 370-388 ms over three runs. "
               + "*** camera/camera.js DECIDED 'IS THIS VOXEL SOLID' IN THREE PLACES AND ONE OF THEM SAID "
               + "SOMETHING ELSE. *** _canStandAt's clearance loop carried `&& v !== 10 && v !== 11` -- "
               + "water passable -- while _standYAt's surfaceProbe shim and _terrainTopAt's legacy scan "
               + "both stood the body ON water. *** THE FILED ITEM SAID WATER WAS 'PASSABLE TO THE PLAYER "
               + "AND SOLID TO EVERY BOT' AND HALF OF THAT IS WRONG: *** on a world generated from "
               + "world/world.js, 3,721 columns of which 146 hold water, the player's own ground query and "
               + "the bots' agree in 146 OF 146. The disagreement was between two functions in one file. "
               + "*** WHAT IT COST, DRIVEN: THE PLAYER FELL OUT OF THE WORLD. *** Against a wall of stone "
               + "from y=2 to y=9 the body stops at x = 9.583; against a wall of WATER of identical shape "
               + "it walks IN to 13.333, finds no ground -- the probe needs two cells of AIR and water is "
               + "not air -- and falls to feet -92.505 after 240 frames with vy -59.4, still accelerating. "
               + "The bot oracle answers null for that column in BOTH worlds and never enters either, so "
               + "the repair moves the player TOWARD the bots. One predicate now, Camera.isSolidToBody, "
               + "which is world.isAir's rule: not air is solid. *** AND IT WAS ASKED ON ZERO REACHABLE "
               + "SITES, WHICH IS WHY NOTHING SHIPPING MOVES: *** over every standable column, the "
               + "four-neighbour cells holding water inside the body's own two-cell span number NONE -- a "
               + "lake surface is level, so the land beside it stands above the water. The walk across a "
               + "lake is byte-identical before and after, 300 frames grounded at feet 8. Section 8 holds "
               + "that 0 and goes RED the day somebody floods a room, which is the row working. FIVE "
               + "SABOTAGES: A 8 RED, B 12, C 3, D 16, E 4. *** THE FIRST BATTERY PUT EVERY RED IN THIS "
               + "GATE ALONE -- six other camera gates green through all five, none of their fixtures "
               + "holding a water voxel -- so a second keeper was written into controllerAgreement, the "
               + "gate about the two controllers agreeing. *** AND THE FIRST COUNT WAS WRONG IN MY FAVOUR: "
               + "*** it read one extra red per sabotage from playerGround, which was that gate's .js "
               + "record-census pin going from six to seven under this round's own new record, firing with "
               + "or without a sabotage. The pin is raised and the claim deleted. Three gate rows also "
               + "went red against correct code because their regexes matched the very PROSE camera.js now "
               + "carries about the removed exclusion -- 'a wiring row anchored on prose' for the third "
               + "time this session; they read tools/ship/sourceScan.mjs's noComments now, which is the "
               + "tree's own answer and has been since v4418. NOT CLAIMED: swimming. There is no buoyancy, "
               + "no water drag and no swim state for the player anywhere in this tree, and the bots' only "
               + "water rule is a speed multiplier off a ROOM record. A lake is a walkable floor here; "
               + "this round makes the tree say so in one place instead of contradicting itself in three.",
    }),
    since269: Object.freeze({
        at: "v4549", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/playerBody-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly: 12 checks in six sections, 145-152 ms over three runs. " +
                 "*** THE THING THE PLAYER DROVE WAS A VERTICAL LINE. *** _canStandAt tested ONE lattice " +
                 "cell -- floor(x), floor(z) -- so the body had no width, and none of v4541's capsuleMove " +
                 "findings or v4543's capsuleGround ones could reach it. Driven diagonally between two " +
                 "pillars that share a single corner and nothing else, the line body goes STRAIGHT " +
                 "THROUGH to (15.80, 14.80): a slit of zero width admits a body of zero width. It has a " +
                 "radius now, 0.4, which is capsuleGround's own, and stops at (11.56, 10.56); against a " +
                 "wall face its centre stops 0.417 away rather than 0.083, which was one frame's travel " +
                 "and not a body. *** A RADIUS ALONE MAKES THE PLAYER UNABLE TO CLIMB ANYTHING AND THE " +
                 "FIRST DRAFT SHIPPED THAT: *** approaching a lip means the disc overlaps the column being " +
                 "climbed at a height it is still solid at, so every ramp from 14 degrees up stopped dead " +
                 "and the sandbox's one-voxel auto-step stopped being climbed. The footprint and the " +
                 "step-up are ONE question; _stepTargetAt asks it. LIVE CENSUS over 14,641 standable cells " +
                 "at 256 sub-cell positions each: at r = 0.4 NOT ONE CELL is fully lost, at 0.48 five " +
                 "hundred and eighty-seven are, and the cliff is structural -- a disc of r >= 0.5 cannot " +
                 "fit in a cell. *** THE CENSUS WAS WRONG TWICE BEFORE IT SAID ANYTHING, BOTH VACUOUSLY: " +
                 "*** the first sampled CELL CENTRES and read 0 at every radius, which a disc of r <= 0.5 " +
                 "cannot do otherwise; the second used offsets whose only distances to a cell edge were " +
                 "0.125 and 0.375, so r=0.2 read identically to r=0.3 -- a grid coarser than the thing " +
                 "measured. Seven sabotages: A 6 RED, B 1, C 12, D 0, E 16, F 2, G 5. D IS ZERO AND THAT " +
                 "IS THE ANSWER: `support from any cell` and `from all` cannot differ, because the target " +
                 "is only used to RAISE the body and a null falls back to the current height -- the code " +
                 "comment claimed a distinction the driving does not support and was corrected. F CRASHED " +
                 "camera.js rather than failing a row, an `out[0]` read on a seed that sabotage removes. " +
                 "NOT CLOSED: the walk's bilinear ground can stand the body INSIDE SOLID ROCK, and could " +
                 "before this round gave it a radius to notice with -- driven at v4548 with no radius at " +
                 "all, feet at 3.000 in a cell solid to y=3. Clamping that brings back the stairs v404 " +
                 "removed, so it is filed rather than chosen.",
    }),
    since268: Object.freeze({
        at: "v4548", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/cameraFall-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly: 11 checks in seven sections, 67-72 ms over three runs. " +
                 "*** THE TREE HAD FOUR IMPLEMENTATIONS OF 'FALL UNTIL YOU LAND' AND TWO OF THEM WERE SIX " +
                 "LINES INSIDE A CAMERA. *** camera/camera.js integrates no gravity of its own now: " +
                 "_moveFP's airborne branch and _moveKaijuDrive's vertical block are both calls to " +
                 "physics/character/fallBody.mjs. *** AND THE TWO COPIES DID NOT AGREE WITH EACH OTHER " +
                 "ABOUT THE ORDER OF THE TWO STEPS: *** _moveFP probed at the body's CURRENT height then " +
                 "moved; _moveKaijuDrive moved then probed where it arrived. Driven on one fixture, one " +
                 "body, one release height of 19.8, they answer ELEVEN VOXELS APART -- 21 against 10 -- " +
                 "and nothing in the tree noticed one rule had two implementations that disagreed about " +
                 "its central step. THREE DEFECTS CAME OUT WITH THE COPIES. (1) Both handed the WALKING " +
                 "reach to a falling body, which is v4544's defect arriving via v4545's repair: a body " +
                 "1.2 below a ledge was YANKED ONTO IT and one 1.3 below fell eleven voxels, the cut " +
                 "sitting exactly at STEP_UP_MAX. (2) The kaiju's order TUNNELS THROUGH EVERYTHING the " +
                 "moment the reach is honest -- with reach 0 every release from 19.7 to 25.0 falls past " +
                 "both decks to the floor -- so its six lines only looked like they worked because the " +
                 "walking reach let the probe see above where the body landed. One defect was concealing " +
                 "the other and removing either alone makes it worse. (3) *** _kaijuDriveOnGround WAS A " +
                 "LATCH: *** only landing set it, only jumping cleared it, so walking off a 38-voxel " +
                 "cliff left it TRUE for the whole descent -- at frame 89, 34 units up and falling at " +
                 "14.4 m/s, Space still gave a free jump. It is read off fallBody's own `airborne` now. " +
                 "A THIRD DRAFT FED THE FALL THE CAMERA'S BILINEAR GROUND and landed a body with its feet " +
                 "INSIDE SOLID ROCK: a walk crosses a boundary and wants two columns averaged, a LANDING " +
                 "happens on ONE COLUMN, which is why fallBody ships voxelSurface over the integer probe. " +
                 "Seven sabotages, none crashing: A 2 RED, B 2, C 1, D 7, E 5, F 3, G 3, every one caught " +
                 "by this file too. B went ZERO here first -- section 5 compared two probes and never " +
                 "dropped a body through either, so it asserted a property of the probes rather than " +
                 "which one the fall asks. NOT UNIFIED: the camera's gravity of 18 and its absent terminal " +
                 "are passed through explicitly, because v4547 measured both as gameplay decisions and " +
                 "removing a duplicate must not smuggle one in.",
    }),
    since267: Object.freeze({
        at: "v4547", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/controllerAgreement-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly: 12 checks in seven sections, 81-82 ms over three runs. " +
                 "*** SIX CHARACTER-PHYSICS QUANTITIES, EIGHTEEN SITES, AND NOT ONE LINE IN THE TREE " +
                 "COMPARED ANY TWO OF THEM. *** The player falls at 18 and every bot at 20; the player has " +
                 "NO terminal velocity and a falling bot clamps at 55; the player refuses ground at 45 and " +
                 "the shipping bots at 55. *** BUT THE CENTRAL RESULT IS THAT MOST OF THE DISAGREEMENTS DO " +
                 "NOTHING: *** driven over every slope a voxel lattice can express, the bot numbers " +
                 "(1.2/1.2/55) and the player numbers (1.2/1.5/45) give BYTE-IDENTICAL walks -- same x, y, " +
                 "blocked and airborne on 45.0 up, 63.4 up, 45.0 down and 63.4 down -- so each row carries " +
                 "a measured verdict, LIVE or LATENT, rather than a count. The two LIVE ones point OPPOSITE " +
                 "WAYS and cross at about 150 units: from 100 a bot lands first, 189 frames against 198, " +
                 "and from 2,000 the PLAYER lands first, 894 against 2,262, arriving at 267.9 m/s against " +
                 "the bot's clamped 55 -- 4.87 times as fast. *** IT DOES NOT TUNNEL, WHICH WAS THE " +
                 "HYPOTHESIS AND IS NOT THE ANSWER, *** so nothing is unified: changing either number is a " +
                 "gameplay decision and a census does not make one. ALSO A CORRECTION TO v4546, the round " +
                 "before and also mine: it set Camera.MAX_SLOPE_DEG to 45 saying that 'matches the bots', " +
                 "and the bots ship 55 -- the 45 came from terrainWalk's module DEFAULT, which no shipping " +
                 "caller reads. That is why every site here carries a `ships` flag. Eight sabotages, none " +
                 "crashing: A 3 RED, B 5, C 5, D 3, E 3, F 2, G 1, H 1. TWO ROWS EXIST BECAUSE THE BATTERY " +
                 "FOUND THEM MISSING: the first draft read `terminal` as AGREED, because an ABSENCE is not " +
                 "a site and one value has nothing to differ from -- a check that cannot fail, on the " +
                 "quantity with the largest gap in the file; and moving a NON-shipping default left every " +
                 "row green, so the record now pins each site's VALUE and not only the counts.",
    }),
    since266: Object.freeze({
        at: "v4546", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/playerSlope-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly: 13 checks in eight sections, 125-130 ms over three runs. " +
                 "*** THE PLAYER HAD NO SLOPE LIMIT, AND WHAT IT HAD INSTEAD WAS A FRAME-RATE SWITCH. *** " +
                 "_moveFP never computed a normal and decided `is this a cliff` by comparing ONE FRAME\'S " +
                 "drop against 1.5 -- which is the exact anti-pattern physics/character/terrainWalk.mjs is " +
                 "shaped around and names in its own header. Driven: one body, one speed, one 63.4-degree " +
                 "slope, only the frame rate changing, it FELL AT 6 fps and WALKED DOWN IT GROUNDED at " +
                 "10, 15, 20, 30, 60, 120, 144 and 240, covering 8.247 units per second along the ground " +
                 "against a walk speed of 5. Measured in a real boot: 254 of 6,279 adjacent walkable " +
                 "column pairs (4.05%) are steeper than terrainWalk\'s own 45-degree default, worst 88.1. " +
                 "*** AND THE LATTICE EXPRESSES NOTHING BETWEEN 45.0 AND 60, MEASURED RATHER THAN " +
                 "REASONED: *** all 1,826 pairs in the [45, 60) bucket are exactly 45.0, a one-voxel lip, " +
                 "and every steep pair is 60 or more -- so 45, 50 and 60 refuse identical ground here and " +
                 "45 is chosen to match the bots. The repair is a SECANT over a fixed one-column run, not " +
                 "a normal: terrainWalk tests its limit on the normal and RECORDS IN THAT FILE that a " +
                 "lattice defeats it (65.9 degrees over a one-unit lip, a fix written, measured and " +
                 "reverted). *** THE FIRST DRAFT HAD THE SAME BUG IN A RATIO *** -- it took the run from " +
                 "the frame\'s own travel, and a run that shrinks with dt shrinks INTO a lip whose rise " +
                 "does not, so a 26.6-degree hill fell 76 frames of 240. Seven sabotages, none crashing " +
                 "after a repair: A 5 RED, B 2, C 2, D 8, E 7, F 3, G 1. F and G went ZERO on this file " +
                 "first while two other gates caught them, which added section 6; and three sabotages " +
                 "CRASHED the gate instead of failing it, an eager detail string reading off a null -- " +
                 "the FIFTH instance of that species this session, written one round after a header that " +
                 "names it. WHAT DOES NOT CHANGE: the climb, because STEP_UP_MAX already admitted " +
                 "1-per-column and refused 2-per-column and the lattice has nothing in between, so this " +
                 "round changes the DESCENT and nothing else; and the speed convention, which is " +
                 "HORIZONTAL where every bot is SURFACE -- named here rather than changed, because which " +
                 "one the player uses is a gameplay decision and not a correctness one.",
    }),
    since265: Object.freeze({
        at: "v4545", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/playerGround-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly: 15 checks in nine sections, 693-758 ms over three runs. " +
                 "*** THE LAST FIVE ROUNDS GAVE THE BOTS A BODY-AWARE GROUND AND THE PLAYER READ NONE OF " +
                 "THEM. *** camera/camera.js is a separate controller with its own gravity, its own " +
                 "step-up, its own cliff rule and its own ground query, and _terrainTopAt scanned down from " +
                 "y=80 and returned the first solid it met. Measured in a real boot over 1,681 columns: 921 " +
                 "(54.8%) hold more than one place a body can stand, giving 2,687 such places, and the " +
                 "topmost answer is right in 1,681 of them -- EXACTLY THE COLUMN COUNT, which is the " +
                 "finding and not a coincidence. Worst gap 42 voxels. *** AND THE SYMPTOM IS NOT THE " +
                 "TELEPORT IT LOOKS LIKE: *** the `dy > STEP_UP_MAX` guard holds, so the body is never " +
                 "lifted -- vertical tracking DIES instead. Driven east into a cave whose floor rises one " +
                 "voxel every four units, 260 frames: HEAD stops at x=13.92, y=2.70 AND STAYS, onGround " +
                 "stuck true, no fall even with the floor removed; the repair tracks 2.70 -> 3.70 -> 4.70 " +
                 "-> 5.70 -> 6.70 and reaches x=27.17. A frozen body in a cave is a STUCK PLAYER. *** THE " +
                 "REPAIR\'S FIRST DRAFT DID NOT APPLY AT ALL: *** it gated on hasVoxels(this.world) and " +
                 "the camera\'s world interface has always been `voxelAt` while surfaceProbe\'s is `isAir` " +
                 "plus `chunkHeight`, so the branch was never entered and every fixture went on showing " +
                 "the defect -- \'a check nothing reaches\', in code. A four-line shim adapts the one to " +
                 "the other so the GATED rule runs rather than a third copy of it being written. Six " +
                 "sabotages, none crashing: A 4 RED, B 8, C 5, D 4, E 2, F 1 -- and E and F went ZERO on " +
                 "the first battery, which is what added two rows. E (the not-found fallback) was " +
                 "invisible because the only fixture for it was an EMPTY world, where the topmost scan " +
                 "also answers 0 and both arms agree by accident; the discriminating fixture is a body " +
                 "under a floating slab, which a fallback would teleport six voxels up through solid " +
                 "stone. F is not a defect and is recorded as one: replacing Camera.STEP_UP_MAX with the " +
                 "literal 1.2 inside _moveFP changes no behaviour, because *** THE WALL BRANCH CANNOT FIRE " +
                 "-- dy <= STEP_UP_MAX BY ARITHMETIC once the probe is given the feet *** (0.083333 max " +
                 "over a 260-frame four-voxel climb, 0 firings), so the load-bearing use of that constant " +
                 "is the PROBE\'S REACH and the row for it is a wiring row anchored on the functions\' own " +
                 "text. That branch\'s comment claimed _canStandAt had already blocked such moves; section " +
                 "3 drives _canStandAt at a cave floor and gets TRUE, so the reason was false and has been " +
                 "replaced by the arithmetic one. *** AND THE PRE-FLIGHT STAYED GREEN THROUGH A ROUND THAT " +
                 "ADDED A RECORD, WHICH IS THE ONE THING IT EXISTS TO NOTICE: *** frozenRecords.census() " +
                 "narrows to `.mjs` one line before the record search, so PLAYER_GROUND_AT_V4545 in " +
                 "camera/camera.js is invisible to it, along with ADDED_AT_V4403 and MEASURED_AT_V4463, " +
                 "which have been outside every headline that module ever published. Section 9 pins the " +
                 "hole at three records and is written to GO RED the day somebody widens the walk -- not " +
                 "repaired here because the widening also reddens a REPLAY of commit 75f0c033 that was " +
                 "taken with the same narrow ruler.",
    }),
    since264: Object.freeze({
        at: "v4544", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/fallBody-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly: 12 pass, 59-64 ms. Backlog terrain-controller piece (1), " +
                 "the vertical half nothing in this tree played -- and the round found the entry names the " +
                 "WRONG STATE. *** AT A CLIFF, EVERY ADAPTER A LIVE WORLD USES REPORTS blocked AND NEVER " +
                 "airborne *** (lattice 165 blocked / 0 airborne over 200 frames, functionGround the same, " +
                 "meshGround the opposite at 153 airborne), because the drop reads as a steep slope and the " +
                 "slope test runs before the step test. What DOES reach airborne is a body ABOVE the ground " +
                 "-- 1.2 up is grounded and 1.3 up is airborne at snapDown 1.2 -- and simulation/" +
                 "BotManager.js branched on `grounded || blocked`, so every such body fell to a line that " +
                 "wrote world._heightAt(x, z) + BOT_EYE: the terrain MODEL, in ONE frame, with no fall and " +
                 "no voxel check. MEASURED IN A REAL BOOT over 441 columns, that write disagrees with where " +
                 "a falling body lands in 167 of them (37.9%), by up to 44 voxels, and lands INSIDE SOLID " +
                 "ROCK in 39 (8.8%) -- the defect v4542 repaired, on the branch v4542 did not touch, and " +
                 "the standing-still line undid v4540 the same way by writing the model every frame. Both " +
                 "fall now: at column (-57,-60), standable at 12 and 23, a bot from y=43 falls 81 frames " +
                 "and lands at 24, and one starting BETWEEN the surfaces at 17.5 falls 35 frames to 13 " +
                 "where the old line snapped it to 24, eleven voxels UP. *** THE PROBE TAKES NO REACH AND " +
                 "THE FIRST DRAFT LIFTED A FALLING BODY: *** stepUp is how far a body may CLIMB, and with " +
                 "1.2 a body falling from 20.5 was put at 21 in one frame instead of falling to 9 in 64. " +
                 "AND THE FALL CANNOT TUNNEL, structurally rather than by substepping -- the oracle is " +
                 "re-asked at the body's current height and returns the first surface below it, so a drop " +
                 "onto a thin ledge lands on it at initial speeds from 1 to ten million, where capsuleMove " +
                 "must substep because its query is local and this one is a column. Six sabotages, none " +
                 "crashing: A 2 RED, B 5, C 1, D 1, E 6, F 1. Two of the file's OWN rows failed first: one " +
                 "called a record method that does not exist and CRASHED instead of failing, the fourth " +
                 "instance of that species this session; the other anchored on the comment 'standing still' " +
                 "and went red when this same round rewrote that comment in capitals.",
    }),
    since263: Object.freeze({
        at: "v4543", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/capsuleGround-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly: 13 pass, 327-351 ms over three runs. Backlog " +
                 "terrain-controller piece (3), the ground that is not a function of (x, z). *** THE " +
                 "SHIPPED ADAPTER ANSWERS x = 8.000 FOR FIVE DIFFERENT WORLDS *** -- a bridge you fit " +
                 "under, a pillar you do not, a roof at 1.8 that clears a 1.8 body, a roof at 1.7 that does " +
                 "not, and a solid wall -- and on a sixth, a doorway whose jamb the body clips, it walks the " +
                 "body THROUGH to x = 20. One number for five worlds is not caution. The body-aware oracle " +
                 "gives five different answers and the sixth is 7.583. *** SIX FORMULATIONS WERE BUILT AND " +
                 "FIVE DIED TO A FIXTURE THE ONE BEFORE IT DID NOT HAVE, *** which is the round's real " +
                 "content and is written into the module header: cast-from-the-body walks through the " +
                 "pillar because the ray STARTS INSIDE the stone; refuse-on-any-contact refuses every ramp, " +
                 "because a capsule placed at a surface point cuts any slope; refuse-on-sideways-push and " +
                 "refuse-on-depth both fail because the ranges OVERLAP (a 45-degree ramp displaces 0.0828 " +
                 "and penetrates 0.1172, a wall displaces 0.1 to 0.3 and a roof 0.1 too low penetrates " +
                 "0.1000); and falling back to the sky when obstructed walks a body through a DOORFRAME, " +
                 "because a refusal answered by the oracle it just refused is not a refusal. The sixth " +
                 "classified every contact and a 26.6-degree ramp then refused ITSELF at x = 13.597, at its " +
                 "own tessellation seam -- v4541's internal-edge artefact arriving from the other side, and " +
                 "its conclusion, deepest-first, holds for CLASSIFYING as it did for RESOLVING. What ships " +
                 "classifies the deepest contact by DIRECTION against stepTerrain's own slope limit. Seven " +
                 "sabotages, none crashing: A 8 RED, B 8, C 3, D 8, E 1, F 1, G 2 -- and TWO PREDICTIONS " +
                 "WERE WRONG IN THE SAME DIRECTION, B and D predicted at 2 and 1 and measured at 8 apiece, " +
                 "because neither defect fails narrowly once the descend loop is load-bearing. NOT CLAIMED: " +
                 "step-up, which neither this nor capsuleMove does -- both stop a 0.4 body at x = 7.6 " +
                 "before a 0.4 riser, independently, and a riser of 0.2 IS mounted by capsuleMove's bottom " +
                 "sphere; and containment, because `contacts` is a SURFACE query and a body fits inside a " +
                 "wall thicker than its own diameter (0.79 blocked, 0.80 clear, and 0.80 is 2r).",
    }),
    since262: Object.freeze({
        at: "v4541", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/capsuleMove-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly: 15 pass, 242-275 ms over three runs. Backlog " +
                 "terrain-controller piece (2), capsule against triangles, which v4539 proved is the blocker " +
                 "under piece (3). *** THE SEPARATION IS THE ROUND: *** a bridge and a pillar of the same " +
                 "height give byte-identical columns to any downward ray -- [5,0] and [5,0] -- and one " +
                 "capsule rule with no ground oracle at all walks under the first to x=20 and is stopped by " +
                 "the second at x=7.6, which is x0 minus the RADIUS at four different radii. FOUR THINGS " +
                 "MEASURED BEFORE BUILDING AND THREE CHANGED THE DESIGN: the closest-point direction is the " +
                 "zero vector for EVERY depth past the axis crossing and the depth saturates at the radius, " +
                 "so the formulation has a domain rather than a tolerance; that domain's boundary is the " +
                 "radius EXACTLY, bisected to twelve decimals -- 0.2 per frame stops, 0.4 walks through four " +
                 "square metres of stone, with 0 dropped degenerate contacts on one side and 2 on the other, " +
                 "so the dropped contact IS the tunnel; summing every contact drifts a body 0.63 m sideways " +
                 "and costs 2.55 m of progress on a PERFECTLY FLAT tessellated floor, while deepest-first " +
                 "drifts exact zero and handles an inside corner identically; and every floor triangle in " +
                 "this tree's own fixtures is wound INWARD (n.y = -1), so nothing here may read a cross " +
                 "product -- reversing the winding of both fixtures gives bit-identical walks. AND THE GATE " +
                 "CONVICTED THE MODULE'S OWN JUSTIFICATION: the header claimed five boundary sub-problems " +
                 "were complete because 'a segment that crosses the triangle reports zero in all five'. It " +
                 "does not. A body with a thin ledge through its chest reads 0.400000 -- exactly the radius, " +
                 "so depth 0, so NO CONTACT AT ALL. The sixth sub-problem is meshBVH's own rayTriangle. Five " +
                 "sabotages, A 2 RED, B 2 RED, C 2 RED, D 8 RED, E 2 RED -- and TWO WENT 0 RED FIRST, " +
                 "neither the module's fault: A and E crashed the gate instead of failing it (an eager " +
                 "detail string reading degenerate[0] under the sabotage that empties it, inside a run " +
                 "already red elsewhere), and B found section 5 grading a hand-rolled COPY of depenetrate " +
                 "rather than the shipped one.",
    }),
    since261: Object.freeze({
        at: "v4536", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/partitionScore-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        verdict: "green on this box, run singly: 9 pass, 483 ms. *** THE ROUND REFUSED THE BACKLOG ITEM IT WAS " +
                 "STARTED TO BUILD, AND THE REFUSAL IS ARITHMETIC RATHER THAN OPINION: *** navmesh-recast piece " +
                 "(1) says a 45-degree wall becomes 737 thin rectangles where a contour mesh would give a " +
                 "handful. Lipski/Ohtsuki gives the minimum rectangle partition as N - L + 1 - H = 738 reflex " +
                 "- 0 chords + 1 - 2 holes = 737, exactly what the sweep emits, and a union of axis-aligned " +
                 "unit cells is convex only when it is a rectangle -- so the sweep is OPTIMAL and nothing on " +
                 "the lattice can beat it. Seven sabotages: A vertical mutual test deleted RED, B horizontal " +
                 "RED, C max-matching term dropped RED, D hole term dropped RED, E inRing made total RED, " +
                 "G mutualViolations Z clause RED -- and F, its X clause, WENT 0 RED, because the conviction " +
                 "fixture built its wrong label on one axis only. That is the same defect the gate exists to " +
                 "report, reproduced inside it on the first try; it convicts on both axes now and F is red. " +
                 "The finding the round shipped for: deleting the row sweep's VERTICAL mutual-step test left " +
                 "navmesh, navWiring, navWiringLive and funnel ALL GREEN while returning a 110 m path UP a " +
                 "cliff on a z-oriented ledge, one axis of a two-axis correctness property ungraded in the " +
                 "gate whose own section 7 exists BECAUSE A SABOTAGE DID NOT FIRE.",
    }),
    // v4576 -- the 225th closing: a tier for the guardians the sweep cannot afford, and it caught two on sight.
    since229: Object.freeze({
        at: "v4582", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/zipWriter-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze(["ai-bridge/packagerBridge.js", "ui/githubPanel.js"]),
        verdict: "green, 72/71/69 ms over three serial runs. *** NOT THIS ROUND'S GATE. *** It arrived on main " +
                 "in commit c3f1fecb -- the release zip's Compress-Archive subprocess replaced with a pure-Node " +
                 "writer and real percentage progress -- while v4582 was in flight, and the two merged cleanly " +
                 "with no overlapping file. It is closed here because a gate the sweep has never swept leaves " +
                 "the surplus identity one short and tools/ship/recordDrift.mjs reads that as a stale record, " +
                 "so whichever commit lands second owes the re-take. Recorded as its own round's work with the " +
                 "commit named, rather than absorbed into this one's verdict.",
    }),
    since228: Object.freeze({
        at: "v4580", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/skyStars-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze(["render/skyRenderer.js", "render/exactHash.mjs",
                                "tools/ship/assertionShape.mjs", "vba/runtimeGap.mjs"]),
        verdict: "green, 333/336/373 ms over three serial runs. THE ENGINE'S OWN NIGHT SKY, WHICH main.js " +
                 "DRAWS AND NOTHING HAD A REFERENCE FOR. render/skyRenderer.js's starfield was GLSL-only, and " +
                 "it carried two defects a reference would have caught on the first run. *** ONE: THE DENSITY " +
                 "KNOB WAS DIMMING EVERY STAR. *** It read `bright = (h - threshold) / 0.005` while " +
                 "`1.0 - threshold` IS uStarDensity * 0.005, so the divisor was only correct at density 1 and " +
                 "the brightest possible star was 0.60 at density 0.6 and 0.40 at 0.4. main.js sets density " +
                 "0.4 with brightness 0.7 and density 0.6 with brightness 0.5, so the city-sky preset topped " +
                 "out at 0.28 while asking for 0.7, and two knobs the API documents as independent were " +
                 "multiplied together. THE SAME FILE HAS THE CORRECT FORM TWELVE LINES LOWER: the day-mode " +
                 "night stars divide by 0.003, which really is their 1 - threshold. One file, both forms, " +
                 "nothing comparing them. *** TWO: THE SIN-HASH DEFICIT DEEPENS WITH THE CUT, AND THIS SITE " +
                 "CUTS DEEPEST IN THE TREE. *** v4579 measured 12.4 sd low at a cut of 0.986; over a 100^3 " +
                 "cube the ratio of stars delivered to stars asked for runs 0.987 at cut 0.900, 0.914 at " +
                 "0.986, 0.854 at 0.995, 0.437 at 0.997 and 0.243 at 0.999 -- so AT THE ENGINE'S OWN density " +
                 "0.6 THE SKY GOT 44% OF THE STARS IT ASKED FOR. Both sin-hash variants in the tree show the " +
                 "same curve, so it is the idiom and not the constants. THE MECHANISM IS COUNTED RATHER THAN " +
                 "DESCRIBED: over 216,000 integer cells the sin-hash yields 7,112 DISTINCT VALUES against " +
                 "exact_hash3's 216,000, and above 0.997 it has NINETEEN against 656 -- float32 loses the low " +
                 "bits of sin(x) * 43758.5453 before fract() runs, so a threshold slicing 0.003 off the top " +
                 "chooses between a handful of levels. An fbm averages that away; a threshold cannot. " +
                 "*** FOUR OF MY OWN ROWS COULD NOT FAIL, AND THE CAUSE WAS v4579'S LESSON UNLEARNED. *** The " +
                 "emulation held the shader's avalanche CONSTANTS but not its FORMULA, so reverting sky_star " +
                 "to the bare 0.005 divisor, changing its seed 0u -> 9u, and drifting CELL_SCALE away from " +
                 "the shader's own floor(ray * 240.0) all passed green. The text is read for its formula, its " +
                 "seed and its three cell scales now -- and the row naming those scales first said TWO and " +
                 "forgot the Milky Way's floor(ray * 6.0). A fifth row went red on THIS ROUND'S OWN COMMENT, " +
                 "which quotes the old arithmetic to explain it: prose counted as code, in a gate written the " +
                 "day after two rounds about exactly that. *** AND I PUT A BACKTICK IN A SHADER TEMPLATE " +
                 "LITERAL FOR THE SECOND ROUND RUNNING, *** in render/skyRenderer.js's FS after doing it in " +
                 "wormhole.html at v4579. I drafted a tree-wide scan for it and THREW THE SCAN AWAY: it " +
                 "reported render/tslSource.mjs and text/slugShaderWgsl.js as truncated, and both are fine -- " +
                 "their bodies hold NESTED template literals inside ${...}, so the first backtick is not the " +
                 "terminator, and finding the real one needs the lexer tools/ship/pageParse.mjs uses behind " +
                 "--experimental-vm-modules. The gap it was built for does not exist either: MEASURED, " +
                 "breaking this file reddens tools/ship/backendParity-selfcheck.mjs because that gate IMPORTS " +
                 "skyRenderer rather than only reading it, and wormhole.html's was caught by three page " +
                 "gates. Both mistakes were caught by instruments that already existed; what I skipped was " +
                 "running them before saying done. THE THRESHOLD CLASS OF SHADER_SINHASH_V4578 IS NOW EMPTY. " +
                 "THE TRADE IS THE SAME ONE v4579 STATED: a different sky, and a brighter one.",
    }),
    since227: Object.freeze({
        at: "v4579", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/starField-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze(["render/exactHash.mjs", "tools/ship/exactHash-selfcheck.mjs",
                                "blackhole.html", "flight-gpu.html", "wormhole.html",
                                "tools/ship/assertionShape.mjs", "vba/runtimeGap.mjs"]),
        verdict: "green, 177/175/187 ms over three serial runs. ONE SKY, THREE PAGES, AND EACH HAD ITS OWN " +
                 "COPY. blackhole.html, flight-gpu.html and wormhole.html carried a byte-identical `n3` (md5 " +
                 "a8bec00ebc4c on all three), the same three octaves, the same cell and the same falloff -- " +
                 "and v4578's own record said their CUT was identical too, three times over, once in prose " +
                 "and once on each of the three per-line comments. IT NEVER WAS: 0.986, 0.987, 0.985. I " +
                 "checked the function on all three files and the caller on one, then repeated the wrong " +
                 "number on each line, which made a copied claim look like a checked one. " +
                 "*** THE HASH CHANGED FOR A MEASURED REASON, NOT BECAUSE A DIFFERENT PATTERN IS NICER. *** " +
                 "fract(sin(dot(p,K))*43758.5453) is uniform by DECILE -- both hashes sit inside 0.2 points " +
                 "of 10% in every tenth -- and a starfield never reads deciles, it reads the extreme tail. " +
                 "Pooled over 1,572,864 integer cells in six 64^3 cubes, against a cut of 0.986 that should " +
                 "admit 1.400%: the sin-hash reads 1.2837%, TWELVE POINT FOUR SD LOW, and its per-cube " +
                 "readings scatter 0.077% against exact_hash3's 0.031%. So the density knob did not mean what " +
                 "it said (a page asking for 1.4% of its sky got about 1.28%) and how much it got depended on " +
                 "WHICH WAY IT WAS LOOKING, which is the one thing a starfield must not do. THE TRADE IS " +
                 "STATED: it is a completely different sky -- blackhole drew 2,133 stars over the sampled " +
                 "sphere and now draws 2,316, with 26 in the same cell, which is chance. No saved screenshot " +
                 "of these pages still matches. render/exactHash.mjs gains exactHash3 plus its WGSL and GLSL, " +
                 "tied to the 2-D form by a stated relation rather than a claim of containment: " +
                 "exactHash3(x, y, 0, seed) === exactHash2(x, y, umix(seed)). " +
                 "*** THREE OF MY OWN DEFECTS, ALL FOUND BY SABOTAGE OR BY OTHER GATES. *** The gate's " +
                 "'float32 emulation of the WGSL' never read the WGSL -- it rebuilt exact_hash3 from the JS " +
                 "constants, so it was a THIRD implementation agreeing with the second. Three sabotages " +
                 "passed green, including 0x27d4eb2f -> 0x27d4eb2d inside the shipped shader text, a real " +
                 "divergence between a shader and its reference in the gate whose headline row says they draw " +
                 "the same stars; the text is held to the JS by its twelve constants now. The tail row first " +
                 "asserted region-to-region spread over THREE 48^3 cubes and read 1.5 sd, which is not a " +
                 "result -- six cubes at 64^3 pool to 12 sd, and a row that needed a lucky sample would have " +
                 "been a row about the sample. And a comment I added inside wormhole.html's WGSL TEMPLATE " +
                 "LITERAL wrapped a word in BACKTICKS, which ends the template: the page stopped parsing, and " +
                 "this gate stayed GREEN throughout because it does the splice itself on the extracted " +
                 "literal. crossArchDoor, qaAssert and tunnelSpawn all caught it, wgslAutoLayout saw the " +
                 "knock-on binding drop, and the gate now checks that the page it edits still parses. " +
                 "ALSO CORRECTED: two of v4578's twelve census sites are files NO RUNTIME CODE LOADS -- " +
                 "shaders/biome.frag.glsl (a three-way biome threshold, which is why it looked like a round " +
                 "worth doing) and gpu/waterScreen.frag.glsl. TEN of this tree's 26 standalone shader files " +
                 "are unreachable and no census here can see it, because tools/ship/orphanScan.mjs walks .js " +
                 "and .mjs only. That is round #31's finding in a second extension and is FILED, not fixed.",
    }),
    since226: Object.freeze({
        at: "v4577", swept: 1, green: 1, red: 0,
        added: Object.freeze(["physics/raceKnob-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze(["tools/ship/frozenRecords.mjs", "tools/ship/recordReach.mjs",
                                "physics/render/pathTracerGpu-selfcheck.mjs", "tools/ship/reportDoors.mjs",
                                "physics/instruments.mjs"]),
        verdict: "green, 87/85/98 ms over three serial runs -- comfortably inside the 3,000 ms sweep budget, " +
                 "which is the point of it. *** TWELVE RECORDS READ AS GUARDED BY NOTHING AND NOT ONE WAS WHAT " +
                 "THE WORD IMPLIED. *** Asked the decidable question instead -- does anything READ it -- with " +
                 "comments AND every record's own declaration blanked, because before the blanking every one of " +
                 "the twelve scored a hit on its own `export const` line: NINE are named by no code anywhere and " +
                 "are documentary; ONE was reached through a DEFAULT ARGUMENT the name search cannot see; TWO " +
                 "were read by rows that could not fail. *** THE DEFAULT-ARGUMENT CASE WAS PROVEN BY CORRUPTION, " +
                 "NOT ARGUED: *** shadowedDefaults.mjs writes `agreement(rows, frozen = ERASED_AT_V4394)` and its " +
                 "gate calls it with one argument, and changing one frozen value takes that gate from exit 0 with " +
                 "zero FAIL lines to exit 1 with three. *** AND THE FIRST FIX FOR IT WAS WRONG IN THIS TREE'S " +
                 "OLDEST WAY: *** matching `\\bagreement\\s*\\(` across gate sources gave that record FOUR " +
                 "guardians of which THREE were false -- two gates calling their own `agreement`, one where the " +
                 "word is English in a test label. The edge follows the import BINDING now, and the fixture in " +
                 "frozenRecords-selfcheck section 1b carries an impostor gate that declares its own function of " +
                 "the same name, which is the row that holds it there. The v4576 derivation edge had shipped " +
                 "with NO ROW AT ALL and is gated in the same section. *** THIS GATE ITSELF EXISTS BECAUSE " +
                 "MEASURED_V4527's ONLY READER PRINTED IT: *** physics/raceKnob.mjs's reportLines(), while the " +
                 "thorough gate -- 33,306 ms, over the budget AND over the 20,000 ms cap -- carries the round's " +
                 "numbers in its HEADER as prose. It runs no simulation and says so: what it holds is that every " +
                 "verdict in the record is a FUNCTION of the record's own laps, lap times and off-asphalt counts " +
                 "applied to LAP_BOUND, OFF_BOUND and samples as the module exports them today. Nine sabotages, " +
                 "eight caught on the first pass -- and the NINTH IS THE FINDING: `keySeconds === KEY_SECONDS` " +
                 "compared the constant to itself, because the record REFERENCES it rather than freezing a " +
                 "number. KEY_SECONDS 90 -> 60 left the gate at exit 0 with zero FAIL lines while every other " +
                 "sabotage reddened it -- a row that could not fail, written by me inside the gate built to " +
                 "repair rows that cannot fail, and found by sabotage rather than by reading. The replacement " +
                 "asserts the field stays a reference, and freezing it to a literal reddens it. TWO MORE OF MY " +
                 "OWN DEFECTS WERE CAUGHT BY THE TREE MID-ROUND: an evidence STRING in a fixture row named a " +
                 "real record, and since the guardian search strips comments and deliberately NOT strings, it " +
                 "promoted that record from over-budget to CHECKED on prose, in the round about prose being " +
                 "counted as code; and the first import-table walk cost 800 ms on the gate whose crossing of " +
                 "the budget at v4536 let a stale census ship nine ALL GREEN rounds, because it re-resolved " +
                 "every gate's specifiers once per (function, record) pair -- memoised per gate, 115 ms. " +
                 "AFTER: unguarded 12 -> 9, which is a fact about the tree with no clock in it. THE OTHER HALF " +
                 "OF THE READING IS NOT A FACT AND THE FIRST DRAFT OF THE GATE ASSERTED IT ANYWAY -- and this " +
                 "round's own closing sweep reddened it: 73 checked / 22 over-budget / 1 unmeasured before that " +
                 "sweep, 69 / 27 / 0 after, ON CODE THAT HAD NOT CHANGED. All five that moved are guarded by " +
                 "tools/ship/reportDoors-selfcheck.mjs, which reads 2877 / 2872 / 2939 / 3001 / 3025 ms over " +
                 "five SERIAL runs against a 3,000 ms budget: it straddles the line by itself, so those five " +
                 "records' class is a coin toss and is now REPORTED rather than frozen. Two of the three that " +
                 "left the unguarded set went to OVER-BUDGET (guardians 14,464 ms and ~3,500 ms), so " +
                 "tools/ship/recordTier.mjs runs them and the sweep still does not; the third's new guardian is " +
                 "87 ms and is genuinely checked. NO LONGER UNGUARDED IS NOT NOW CHECKED, and the record says " +
                 "which. AND ONE RED THIS ROUND WAS MINE FROM TWO ROUNDS BACK: tools/ship/gateReach-selfcheck " +
                 "has been red since v4575, when physics/render/conductorFresnel.mjs was added without " +
                 "re-recording tools/ship/population-census.json -- 520 expected, 521 found. It shipped ALL " +
                 "GREEN because that gate is 11,491 ms and outside the sweep, which is the same failure the " +
                 "record tier was built for, one level up on a gate that guards no record. Re-recorded here " +
                 "with compare() read first, in the order that file's own note requires. NOT CLAIMED: that the nine documentary records are " +
                 "fine, or that the path property repairs them -- 1,117 tree paths across 47 record bodies " +
                 "resolve with 0 dangling, but only ONE of the nine names a path at all, so a path ratchet " +
                 "would have been a smaller number that looked like progress and was not built.",
    }),
    since225: Object.freeze({
        at: "v4576", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/recordTier-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze(["tools/ship/frozenRecords.mjs", "tools/ship/budgetExile-selfcheck.mjs",
                                "tools/ship/shipRitual.mjs"]),
        verdict: "green, 0.6 s, one new module, one new gate and one new ship step. THE FILED NUMBER WAS WRONG " +
                 "IN BOTH DIRECTIONS AGAIN -- 43 of 94 filed against 38 of 104 live -- and the gap had two " +
                 "causes. *** SEVEN RECORDS READ AS UNGUARDED AND WERE NOT. *** frozenRecords asks which gates " +
                 "NAME a record; redCensus.mjs defines RED_AT_V4531 from RED_AT_V4531_GATES, so the ARRAY is " +
                 "consumed only through the derived constant and gates name the derived one. Corrupting the " +
                 "array -- filing a GREEN gate as a known red -- does redden registerDrift-selfcheck, measured. " +
                 "The census follows one level of derivation within the defining file now: unguarded 20 -> 12, " +
                 "checked 66 -> 72. One level and one file on purpose, because a transitive closure would start " +
                 "crediting records with guardians that never touch their value. *** AND I REPORTED THAT " +
                 "CORRUPTION AS UNCAUGHT FIRST, ON A BROKEN HARNESS OF MY OWN: *** `echo \"$(basename $g) " +
                 "exit=$?\"` reports BASENAME's exit code, because the command substitution runs before $? is " +
                 "expanded. Every gate read as 0. The re-take checks run that way in three earlier rounds were " +
                 "independently confirmed by their full sweeps, so no shipped claim rests on it. *** THE OTHER " +
                 "TWENTY HAVE A GUARDIAN THAT WORKS AND COSTS TOO MUCH, AND v4548'S MEDICINE DOES NOT APPLY: " +
                 "*** counting fs calls against unique paths gives 1.0x, 1.1x, and samplerCheck-selfcheck does " +
                 "NO file I/O at all -- 9 s of pure arithmetic. There is no redundancy to remove, so the tier " +
                 "is the answer. tools/ship/recordTier.mjs runs the nine, serially and capped, 93 s, wired as a " +
                 "ship step; its list is DERIVED from recordReach and its gate asserts not one of the nine " +
                 "names appears in its source. *** IT FOUND TWO RED GUARDIANS ON ITS FIRST RUN, COVERING EIGHT " +
                 "RECORDS, NEITHER ON ANY REGISTER. *** orreryFleet-selfcheck: orrery-fleet.json's baked file " +
                 "sizes had drifted on three files THIS SESSION EDITED THREE ROUNDS EARLIER, under sweeps that " +
                 "all reported ALL GREEN -- which is the argument for the tier, made by the tier, within a " +
                 "minute of it existing. budgetExile-selfcheck: two rows gating on the defect still being as " +
                 "bad as when found -- gates ARE still exiled at the cap (v4568 fixed that) and the inflation " +
                 "is STILL above 1.5x (it has fallen to 1.48). That file's own section 3 diagnosed the shape at " +
                 "v4535 and wrote the fix down and never applied it here. IT CANNOT BE APPLIED IN FULL: " +
                 "MEASURED_V4425 froze { verdict, ms } where ms is the SERIAL time, so the INFLATED reading " +
                 "that did the exiling was never written down and the historical half is unassertable. Recorded " +
                 "rather than faked. Sabotages SS and TT red by name. STILL OPEN: 12 records with no guardian " +
                 "at all, which no tier can help with.",
    }),
    // v4575 -- the 224th closing: the engine had no conductor Fresnel, and every metal was one fitted point.
    since224: Object.freeze({
        at: "v4575", swept: 1, green: 1, red: 0,
        added: Object.freeze(["physics/render/conductorFresnel-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green, 0.6 s, one new module and one new gate. *** THIS TREE HAD NO CONDUCTOR FRESNEL. EVERY " +
                 "METAL IN IT WAS SCHLICK WITH A THREE-CHANNEL F0 -- a curve fitted through ONE point. *** " +
                 "pathTracer.mjs calls it 'F0 as a TRIPLE', microsurfaceWalk.mjs spells the Schlick line and " +
                 "labels it 'conductor' in the comment beside it, and fresnel.mjs is exact and DIELECTRIC. The " +
                 "backlog asked for the F82-tint model to be graded 'against a number the tree already holds by " +
                 "another route' and there was no such number, so the exact conductor curve is built here first " +
                 "-- AND THEN THE ROUTE EXISTS AFTER ALL: a conductor with kappa = 0 IS a dielectric, and the " +
                 "new closed form reproduces physics/render/fresnel.mjs, derived independently from Snell's law " +
                 "and gated since v3491 on Brewster and total internal reflection, to 2.22e-16 over 306 " +
                 "(index, angle) pairs. Sabotage QQ drops the p-polarised branch and that row goes to 3.52e-1, " +
                 "which matters because a conductor has NO Brewster angle and nothing local catches a " +
                 "polarisation swap. *** WHAT SCHLICK GETS WRONG ON A METAL IS THE SIGN OF THE SLOPE, NOT THE " +
                 "SIZE OF THE ERROR: *** aluminium's green channel FALLS 0.914 -> 0.862 over the range where " +
                 "Schlick RISES 0.914 -> 0.954, because a conductor's reflectance dips below F0 before climbing " +
                 "and Schlick is monotonic by construction. 0.0931 against F82-tint's 0.0065, 14.4x. The 82 " +
                 "degrees are DERIVED and not named -- mu(1-mu)^6 is maximised at mu = 1/7, found by searching " +
                 "100,001 points -- and sabotage RR nudges the constant to a plausible 0.15 and is caught. *** " +
                 "THE COMPARISON IS A 4,800-POINT (eta, kappa) SWEEP RATHER THAN FOUR HAND-COPIED TRIPLES, " +
                 "BECAUSE THE METAL CONSTANTS ARE RGB SAMPLES OF SPECTRA AND THIS ROUND DOES NOT VOUCH FOR " +
                 "THEM -- and the result is NOT universal: 4,691 better, 105 WORSE, 4 level, with every one of " +
                 "the 105 at kappa <= 2.4 on a grid running to 8.0. Gold's blue channel sits in that band and " +
                 "gains 1.02x, because its exact curve happens to agree with Schlick AT 82 degrees so the " +
                 "fitted correction is near zero. AND I REPORTED THAT LOSING GAP WRONG FIRST: 0.0009, taken by " +
                 "subtracting the maximum of one column from the maximum of another when the two maxima are at " +
                 "different pairs. The worst single pair is 0.0058 and the gate's own row caught it. NOTHING IN " +
                 "THE ENGINE USES THIS YET, stated rather than implied, and the safe default is proven: " +
                 "tint = 1 IS Schlick, identically, over 404 (F0, angle) pairs.",
    }),
    // v4574 -- the 223rd closing: armed, at the command line only, after arming it everywhere first.
    since223: Object.freeze({
        // NO NEW GATE this round -- three rows added to an existing one, so the swept/green/red triple is
        // zero rather than one. closingCoverage-selfcheck sums these against the named gates and said so.
        at: "v4574", swept: 0, green: 0, red: 0,
        added: Object.freeze([]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze(["tools/ship/quickSweep.mjs", "tools/ship/quickSweep-selfcheck.mjs",
                                "tools/ship/inputSets.mjs", "tools/ship/verify.mjs"]),
        verdict: "green, three rows, no new gate. THE INCREMENTAL SWEEP IS ARMED: typing the command now skips " +
                 "gates whose recorded inputs did not move. 926 of 1,258 skipped -- 73.6% of gates but 54.1% " +
                 "of recorded gate time, and 409 s of wall clock becomes 233 s, 43%. THE GAP BETWEEN 73.6 AND " +
                 "43 IS THE POINT AND IS RECORDED RATHER THAN ROUNDED AWAY: the gates that always run are also " +
                 "the slow ones. What still runs, by reason and by cost -- 104 gates / 174 s spawn a child the " +
                 "probe cannot follow, 133 / 132 s reach a module their recorded set does not carry (v4573's " +
                 "bound, and that is its price in seconds), 73 / 93 s had an input change, 22 / 17 s open a " +
                 "socket. *** AND THE FIRST WAY I ARMED IT WAS WRONG, WHICH A GATE SAID WITHIN THE MINUTE. *** " +
                 "Flipping runQuickSweep's own default to true armed it for EVERY caller at once -- nine " +
                 "besides the command line, almost all fixtures that drive the sweep to watch what it does -- " +
                 "and sweepCoverage-selfcheck reported '0 gates run at a 1 ms budget, 0 confirmed alone', " +
                 "because the sweep it was testing had skipped everything. A FIXTURE THAT SKIPS ITS OWN " +
                 "SUBJECT IS VACUOUS, and it would have passed silently had it asserted a little less. The " +
                 "default lives in the CLI block now and not in the function: typing the command skips, " +
                 "calling the function does not, and the caller nobody has written yet inherits the safe one. " +
                 "verify.mjs passes skipUnchanged:false EXPLICITLY anyway, because the saving buys iteration " +
                 "speed and spends a small measured chance that a gate which should have run did not, and the " +
                 "one run this tree must not spend that on is the one whose output is ALL GREEN. *** THE " +
                 "RECORD'S OWN FORMAT IS CHECKED NOW AND NEVER WAS: *** FORMAT has been written into every " +
                 "record since v4566 and nothing read it. While the mechanism only COUNTED that cost nothing. " +
                 "Armed, it is the difference between a stale record and a wrong one -- the encoding is " +
                 "INDEXED, so a record written under a different layout does not fail to decode, it decodes to " +
                 "THE WRONG PATHS, hashes them, finds them unchanged, and skips. One line covers the missing " +
                 "record too, and the histogram says it once rather than 1,257 times. Sabotages OO and PP red " +
                 "by name: the dangerous default put back on the function, and verify allowed to inherit it.",
    }),
    // v4573 -- the 222nd closing: the blocker was a sentence, and it is now two properties and a price.
    since222: Object.freeze({
        at: "v4573", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/importClosure-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze(["tools/ship/inputSets.mjs", "tools/ship/recordInputs.mjs"]),
        verdict: "green, 2.4 s, one new gate and one new disqualifier. *** THE INCREMENTAL SWEEP HAS BEEN " +
                 "DISARMED SINCE v4566 FOR A REASON WRITTEN DOWN IN ONE SENTENCE: an input set is what a gate " +
                 "read on ONE RUN -- a sample, not a specification. *** tools/ship/importClosure.mjs answers " +
                 "the half a static reader can answer, at RECORD time, as a flag the rule reads rather than a " +
                 "graph walked on every partition. A STATIC import is unconditional, so the whole closure must " +
                 "be in the recorded set or the record is simply WRONG: over all 1,258 recorded gates, ZERO " +
                 "miss one. A DYNAMIC import is precisely the conditional the worry names -- 152 carry one to " +
                 "a file outside their set -- and ONE gate statically imports a module ABOVE the engine root, " +
                 "which no engine-relative record can hash, so nothing in this tree could ever invalidate it. " +
                 "All of those stop being skippable: 1,098 -> 975 of 1,257, still 77.6%. *** THE FIRST " +
                 "INSTRUMENT WAS WRONG BY 75x AND IS RECORDED RATHER THAN QUIETLY FIXED. *** Following static " +
                 "and dynamic imports together it reported 135 gates violating the closure property; checking " +
                 "ONE case instead of believing it found populationCensus-selfcheck credited with 379 " +
                 "reachable files against a probe's NINE. The chain was real -- populationCensus, gateReach, " +
                 "staleness, claimsGate -- but staleness reaches claimsGate through an await import() inside a " +
                 "function that never ran, and its true static closure is FIVE. The 135 were the instrument. " +
                 "*** AND THE DYNAMIC HALF IS A BOUND ON A RISK NOBODY DEMONSTRATED, WHICH IS SAID RATHER " +
                 "THAN IMPLIED: *** physics/orbits/kepler.js was made to throw on import and all three gates " +
                 "that reach it only dynamically still exited 0. The exclusion stays on a structural argument " +
                 "and not a measured catch, priced at 133 gates, because a branch that did not run today is " +
                 "not a branch that cannot run -- but a rule kept that way should say so, or the next round " +
                 "reads 133 gates of cost as 133 gates of proven danger. BESIDE THE STRUCTURE, THE SAMPLING: " +
                 "two independent probe passes agreed on 1,246 of 1,258 read sets, 99.0%, and the twelve that " +
                 "differed did so by their OWN random temp directory or by ANOTHER gate's scratch file racing " +
                 "in an eight-wide probe -- pollution that errs SAFE, since a stranger's path makes a gate run " +
                 "more and never less. Two gates changed EXIT CODE between passes on identical sets and are " +
                 "not flaky: run alone, five times each, both green 5/5, which is SWEEP_CONTENTION_V4562 " +
                 "again. And the differential test, twice: break render/exactHash.mjs and run all 1,055 gates " +
                 "an incremental sweep would have skipped -- ZERO verdicts moved; break sourceScan.mjs's " +
                 "codeOnly, the most-read shared helper in the tree at 272 gates, 882 skipped -- ZERO moved. " +
                 "Two mutations is a sample and is offered as one. Sabotages MM and NN red by name, NN " +
                 "reproducing the 75x error exactly. THE DEFAULT IS UNCHANGED: quickSweep still skips nothing " +
                 "without --incremental, and what remains is a judgement about a silent failure mode with a " +
                 "standing measurement behind it instead of an argument.",
    }),
    // v4572b -- the 221st closing: the name list was still doing the property's job, and nobody could see it.
    since221: Object.freeze({
        at: "v4572b", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/recordProvenance-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze(["tools/ship/orphanScan.mjs", "tools/ship/gateQuality-selfcheck.mjs"]),
        verdict: "green, 204 ms, one new gate. *** THE ROUND WAS FILED AS 29 UNSTAMPED RECORDS AND THE REAL " +
                 "DEFECT WAS IN THE CHECK. *** Filed premise wrong in both directions: 28 of 36, not 29 of 35, " +
                 "and it implied 28 latent instances of the v4567 collapse. MEASURED FIRST, by stamping every " +
                 "unstamped record in place and re-running the scan: the candidate set did not move. ZERO " +
                 "orphans were hidden. So the stamps are PREVENTION and the round says so, rather than " +
                 "reporting a rescue it did not perform. *** THEN THE THING WORTH THE ROUND: " +
                 "orphan-baseline.json CARRIES `captured` AT BYTE 6,940, *** because its note runs six and a " +
                 "half kilobytes first, and isGeneratedRecord read text.slice(0, 4096). The property returned " +
                 "FALSE for the one file it was written for, and that file stayed out of the corpus solely " +
                 "because its NAME was still in the SKIP regex -- the list v3900 replaced with the property, " +
                 "quietly propping up the property that replaced it. Three rounds looked at this file and none " +
                 "saw it, because the name and the property agreed about the OUTCOME and disagreed about the " +
                 "REASON. v4571 walked closest: it put generatedFrom FIRST in input-sets.json and wrote a " +
                 "comment explaining that the note runs ~700 characters so the key must land inside the " +
                 "window -- a defect in the CHECK, written down as a placement rule for every future writer. A " +
                 "record is JSON and its top-level keys are exactly knowable by parsing it, at no window at " +
                 "all. It parses now, the name is out of SKIP, and the proof is the sabotage: stripping that " +
                 "one `captured` key takes the candidate set from 7 to ZERO, the exact v4571 collapse, from " +
                 "the file the name had been protecting. Parsing also removed FALSE POSITIVES the slice had " +
                 "been granting -- artifact-history.json and install-history.json matched a provenance word " +
                 "NESTED inside their first 4 KB and were being excluded on it. The vocabulary gained " +
                 "`producedBy` and REFUSED `producedAt` and `refreshedAt`: a timestamp says when a file was " +
                 "written and nothing about who wrote it, and widening this set makes the scanner blinder, " +
                 "which is the direction that costs orphans. 19 records stamped AT THE WRITER as well as in " +
                 "the file, because a key added to a file a tool rewrites is erased on the next run. " +
                 "prose-debt-baseline.json was a bare ARRAY that could carry no key at all; it names 27 " +
                 "modules and has exactly ONE reader, so it was converted rather than given a permanent " +
                 "exception. The judgement the entry said it needed never arose: `generatedFrom` for a tool " +
                 "and `captured` for the five read-only three.js fixtures, and calling a hand-maintained " +
                 "baseline `captured` is not a lie about provenance. Sabotages KK and LL red by name. AND ONE " +
                 "COST WAS NEARLY MISATTRIBUTED: orphanScan takes 31 s, and after the parse landed I measured " +
                 "31,239 ms against 31,267 ms on the stashed original -- the cost is its O(code x corpus) " +
                 "substring loop and always was, and the JSON parse of all 200 corpus records is 277 ms of it.",
    }),
    // v4572 -- the 220th closing: the hand-spelled writer, and the check it asked for was not reachable.
    since220: Object.freeze({
        at: "v4572", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/recordShape-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze(["tools/ship/shipRitual.mjs"]),
        verdict: "green, 751 ms, one new gate and one new ship step. *** A WRITER THAT SPELLS ITS FIELDS BY " +
                 "HAND DROPS ONE AND THE RECORD GETS SMALLER WITHOUT LOOKING WRONG. *** Three times in one " +
                 "session: tslRace's section-1 wholesale write deleted `atlas` and wgslCorpus quietly lost a " +
                 "case, while crossBackend asserted results.length === corpus().length -- a corpus measured " +
                 "against itself, which holds at ANY size; inputSets.encode kept writing the pre-rename flag " +
                 "and every spawning gate became skippable, the count rising 956 to 1,121; quickSweep computed " +
                 "`finished` and left it out of the object it writes, erasing 140 rows. EACH LOOKED LIKE A " +
                 "SMALLER SET OR A BETTER NUMBER, and each was found by somebody reading a git status line. " +
                 "*** THE ROUND AS FILED WAS A STATIC WRITER-TO-READER COMPARISON AND IT IS NOT REACHABLE, " +
                 "WHICH WAS MEASURED RATHER THAN ASSUMED: *** 584 writeFileSync call sites, 85 handing " +
                 "JSON.stringify an object literal, 15 whose path a static reader can resolve -- and " +
                 "quickSweep, the writer of the third case, is one of the misses, because its path arrives " +
                 "through DEFAULTS.timingsFile and a destructured argument. A check covering 15 of 584 while " +
                 "carrying the word WRITERS in its name is a proxy reported as a fact, which is the defect " +
                 "class the round is about, so it was not built and the number is recorded in its place. " +
                 "tools/ship/recordShape.mjs reads the RECORD instead: two levels of key set -- the record's " +
                 "own, and the UNION one level down, because the spawn flag lives there -- ratcheted so a " +
                 "record may GAIN a field and losing one fails. The population is DERIVED from " +
                 "input-sets.json rather than listed, 201 records with a shape to hold. *** AND THE " +
                 "REPRODUCTION CORRECTED MY OWN ROW. *** I modelled case 2 as a loss plus a gain and said so " +
                 "in the row's own message; restoring the old FLAGS name and re-recording all 1,255 gates " +
                 "reported `1 LOST field(s), 0 gained`, because encode copies by out[g][f] = e[f], the new " +
                 "name is assigned undefined, and JSON.stringify DROPS AN UNDEFINED VALUE. The record gains " +
                 "nothing. It just gets one field smaller on every entry, silently, which is worse than a " +
                 "rename and is why 1,121 read as success. The ratchet carries a DOOR from the first line -- " +
                 "v4571 spent half a round on rows that forbade the repair they existed to prompt -- and the " +
                 "door is shown OPENING rather than described, and is empty today.",
    }),
    // v4571 -- the 219th closing: the five reds the killed bucket was hiding, and four of them were the check.
    since219: Object.freeze({
        at: "v4571", swept: 0, green: 0, red: 0,
        added: Object.freeze([]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze(["tools/ship/commentFalsePass-selfcheck.mjs", "tools/ship/gateReach-selfcheck.mjs",
                                "tools/ship/baselineHygiene-selfcheck.mjs", "tools/ship/gateSelection-selfcheck.mjs",
                                "tools/ship/orphanDisposition-selfcheck.mjs"]),
        verdict: "green, five gates repaired and RED_AT_V4568 emptied by repair rather than by deletion. *** NOT " +
                 "ONE OF THE FIVE WAS A NEW FAILURE. *** They cost 9.6 s, 11.0 s, 31 s, 71 s and 88 s against a " +
                 "3,000 ms sweep budget, so no ship-time step had ever run them; v4568 opened the killed bucket " +
                 "and found five reds sitting in it, ages unknown. FOUR OF THE FIVE WERE THE CHECK BEING WRONG " +
                 "RATHER THAN THE SUBJECT, which is the number worth carrying out of this round: a gate nothing " +
                 "runs does not merely stop protecting, it rots. commentFalsePass's one GENUINE false pass was a " +
                 "COPYRIGHT NOTICE -- a claim no arrangement of code could satisfy, so a comment is the only " +
                 "place it can live. gateSelection's band expression asserted the first twenty while reachable " +
                 "was under the plan size and THE ENTIRE PLAN once it went over, two different claims from one " +
                 "line depending on the tree's size. orphanDisposition's guarantee was stated one clause too " +
                 "wide and the tree found the gap at 28 of 30. Only gateReach's population pin was doing exactly " +
                 "its job -- 472 against 520, counted per its own protocol at 48 ADDED, 0 REMOVED, reconciles " +
                 "true -- and even that row read its record with a RELATIVE PATH, so from any other cwd it " +
                 "reported 'expected null'. *** AND baselineHygiene WAS A LOOP: *** it reported all seven orphan " +
                 "suppressions stale with none adopted, because orphanScan returned ZERO candidates over 4,058 " +
                 "files -- input-sets.json shipped at v4567 with no provenance stamp (3.5 MB of every path every " +
                 "gate reads), and redCensus and register-audit had recorded THIS GATE'S OWN FAILING LINE, which " +
                 "names the seven paths, as string data. RECORDING THE RED IS WHAT KEPT IT RED. Fixed at the " +
                 "source, and then guarded where it generalises: an EMPTY candidate set is refused the way v3222 " +
                 "made a MISSING one refused, because that guard fixed the symptom it had seen and not the " +
                 "property, and an empty array walked past it for 1,349 versions. Sabotages BB/CC/DD/EE/FF/GG " +
                 "red by name, and FF only on its third take -- the first two proved my own new row could not " +
                 "fail. *** AND REPAIRING FIVE REDS TOOK FIVE MORE ROWS RED, EVERY ONE OF THEM FOR THE SAME " +
                 "REASON: THEY FORBADE THE REPAIR THEY EXIST TO PROMPT. *** sweepCoverage held 'the pass found " +
                 "five reds and at least four must still be red'; its register cross-check demanded " +
                 "RED_AT_V4568 still hold all five; slowCensus required its frozen three-gate measurement to " +
                 "equal what the live register holds; gateSweep-selfcheck tested 'was in the unmeasured bucket " +
                 "at v4297' against that bucket AS IT STANDS TODAY. redCensus.mjs wrote this down at v4313 -- " +
                 "'the census's arithmetic punished the pruning the census demands' -- and the fix there is " +
                 "the fix in all four: a repair is a TERM, and the property is the UNION of still-failing and " +
                 "recorded-as-repaired. THE FIRST ATTEMPT AT THE FOURTH WAS WRONG AND TWO ROWS SAID SO WITHIN " +
                 "THE MINUTE: I reached for the FIXED_* lists as a stand-in for 'has left the unmeasured " +
                 "bucket', and those record repairs to the RED REGISTERS -- a different exit from a different " +
                 "place -- so real regressions started reading as never-measured. Two exits need two records, " +
                 "and MEASURED_OUT_OF_SLOW is the second one.",
    }),
    // v4570 -- the 218th closing: the third twin, and the one a viewer could actually see.
    since218: Object.freeze({
        at: "v4570", swept: 0, green: 0, red: 0,
        added: Object.freeze([]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze(["tools/ship/exactHash-selfcheck.mjs"]),
        verdict: "green, twenty-three rows, no new gate. *** THE NEBULA'S CPU FALLBACK AND ITS GPU PATH DREW " +
                 "DIFFERENT STARS, AND nebula.html USES BOTH. *** hash2 was fract(sin(p.x*127.1 + " +
                 "p.y*311.7)*43758.5453) in float64 in fx/nebula/nebula.js and, transcribed, in float32 in " +
                 "both the WGSL and the GLSL of fx/nebula/nebulaShaders.js. THE GAS SURVIVED IT AND THE " +
                 "STARS DID NOT, which is why nobody saw it: fbm AVERAGES its noise, so a wisp drawn from a " +
                 "different random field is still a wisp -- the shader file's header said so and was right " +
                 "(\"f32 vs f64 differences are imperceptible for gas\"). But the same header claimed the " +
                 "transcription keeps \"same hash/vnoise/fbm/palette/parallax/STARS\", and nebulaColorAt " +
                 "draws a star with `if (sv > 0.994)`. A THRESHOLD DOES NOT AVERAGE. Measured over 518,400 " +
                 "sampled pixels of a 1920x1080 frame: the CPU drew 3,006 stars, the GPU drew 2,509, and 378 " +
                 "were in the same place -- 12.6%. Which sky a viewer saw depended on whether their browser " +
                 "had WebGPU. All three halves now use render/exactHash.mjs's integer hash: noise worst " +
                 "delta 0, and every star in the same place, 100.0%. *** AND THAT BEFORE-PAIR IS RE-DERIVED " +
                 "RATHER THAN QUOTED: the gate computes the old idiom beside the new one over THE SAME " +
                 "PIXELS every run, because a first reading of it under a different sampling said 3,070 " +
                 "against 2,576, and two readings of one sampled quantity written down as a fixed fact is " +
                 "the defect this session keeps finding in other people's records. *** AND FIXING IT MADE AN INSTRUMENT'S " +
                 "PROSE STALE, WHICH IS THIS SESSION'S OWN RECURRING FAULT. *** fx/paintFields.mjs's " +
                 "hashPrecisionGap said it measured \"the same construction in the shipped nebula\" -- true " +
                 "when written and false now. It is KEPT, because it is an instrument that computes both " +
                 "precisions on purpose and rewriting it would delete a measurement, and its subject is " +
                 "recorded as historical. THE TWIN CENSUS IS NOW EMPTY of real twins: what matches the " +
                 "pattern is two deliberate instruments, this gate's own control, and four CPU-only files " +
                 "with no shader counterpart. Sabotages Y and Z red by name.",
    }),
    // v4569 -- the 217th closing, and the first ENGINE round after five on the sweep itself.
    since217: Object.freeze({
        at: "v4569", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/exactHash-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze(["tools/ship/grassField-selfcheck.mjs"]),
        verdict: "green, seventeen rows. *** fract(sin(dot(p,K))*43758.5453) IS NOT AN APPROXIMATION OF A " +
                 "RANDOM NUMBER, IT IS A DIFFERENT ONE IN float32 THAN IN float64 *** -- sin(x)*43758 " +
                 "amplifies the last bits of x by four orders of magnitude. The backlog filed this as 29 " +
                 "files; the real population is 16 shipped ones, and the census that found them was itself " +
                 "wrong twice first (codeOnly said 2, because a shader in a template literal is not " +
                 "JavaScript to a JS comment stripper -- the exemption commentFalsePass documents). *** AND " +
                 "10 OF THE 16 HAVE NO GATE AT ALL, so replacing the hash there would change what they draw " +
                 "with nothing to verify it. *** The round is therefore NOT the filed one: it is the files " +
                 "where BOTH halves exist and disagree. TWO FIXED. render/grassField.js against " +
                 "render/grassModel.mjs, whose bladeHash decides `if (bladeHash < slopeSuppress) drawn = " +
                 "false` -- 65.0% of 32,000 blade origins differed by more than 0.1, worst 1.0000, and THE " +
                 "DRAWN DECISION FLIPPED ON 65.4%: a model wrong about two thirds of the grass, unnoticed " +
                 "because its gate checked a different hash. fx/wormhole/wormholeNebula.js carried h2 THREE " +
                 "TIMES in one file -- JS, GLSL and WGSL, two of them float32 -- at 70.0% of 14,400 lattice " +
                 "points. Both read 0.0% after, worst delta exactly 0. THREE MORE ARE CPU-ONLY (no shader " +
                 "counterpart, so no divergence) and TWO ARE INSTRUMENTS that compute both precisions ON " +
                 "PURPOSE to measure the gap -- fx/paintFields.mjs and physics/kernelVerdict-selfcheck.mjs " +
                 "-- and rewriting those would have deleted the measurement. The grass fix reuses windHash, " +
                 "already in scope and already twinned, rather than adding a hash; render/exactHash.mjs is " +
                 "the shared home for the rest and is tied to v4558's proven bcsHash by a row (seed 0 is " +
                 "bit-identical on 6,000 points). FOUR OF MY OWN ROWS COULD NOT FAIL AND SABOTAGE FOUND " +
                 "EACH: one compared windHash to windHash instead of going through bladeVisibility, so " +
                 "reverting the model left it green; one claimed exactness for ANY input when the honest " +
                 "claim is exact on the lattice and 0.95% at quantise boundaries; one demanded three " +
                 "languages share a constant ORDER; and one would have passed VACUOUSLY through codeOnly, " +
                 "which deletes shader text. Sabotages U/V/W/X and R/S/T red by name.",
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
    // v4622-merge -- RENUMBERED since240-since248, from since230-since238: origin/main built its own closings
    // on the SAME shared ancestor this branch did, both reaching for "the next ordinal" independently, and the
    // merge did not conflict on it (the two blocks sit at different byte offsets in the file, so git saw no
    // overlap) -- exactly the collision this file's own "no two closings share an ordinal" check exists to
    // catch, and it did: DUPLICATE since231, since230 on the first post-merge run. Renumbered rather than
    // reordered, so the "at" commit/version beside each stays exactly what that round recorded.
    since248: Object.freeze({
        at: "v4592", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "physics/spellAmmo-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green in 3 s: the book pure, then box3d headless for the hits, the race and the duels. THE SPELLBOOK AS AMMUNITION " +
                 "(task 81): physics/spellAmmo.mjs reads world/spellBook.mjs by reference -- AMMO_NAMES is SPELL_NAMES itself, a " +
                 "shell's landing is the spell's own row (damage, radius with the dungeon grenade's 1 - d / R, ignite as a Doom Fire " +
                 "under the target, slow as half throttle for the book's seconds, pool as a caustic patch of the book's dps) -- and " +
                 "the pickups on the track load a magazine of ENERGY_POOL / manaFor(spell) shells, the book's measured cost turned " +
                 "around (cataclysm 1, spark 10, novaBurst 100). A spark hit is v4588's 0.743 m/s to the thousandth, a cataclysm hit " +
                 "9.92; the race on seed 1 has the leader take four pickups and land causticSpray and cataclysm shells, replays from " +
                 "its log, and the duel without pickups scores 14.558 as at v4590. The gate's first run was red on the plain-shell " +
                 "pickup (the endless magazine swallowed it); a pickup of spark is a finite one now.",
    }),
    since247: Object.freeze({
        at: "v4591", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "world/buildingTopple-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green in 18 s: pure rows, box3d headless, seed 1's city rammed building by building, and race-crash.html in its own " +
                 "browser. BUILDINGS THAT FALL (task 80): world/buildingTopple.mjs. A building stands while its centre of mass is over " +
                 "what is left of its ground floor: at the topple the block above the ground floor (fracture.js's largest anchored " +
                 "component) is ONE dynamic box3d body on the remaining ground-floor voxels as static stubs over a slab at the road, and " +
                 "gravity decides -- no impulse is invented. A 4 x 10 x 4 block on a far-quarter stub lies flat in 3.7 s and shatters into " +
                 "rubble through its final pose; over a middle stub it stands and stays a body; with no ground floor it drops and " +
                 "pancakes; over seed 1's 34 buildings with a lane the outcome after 6 s follows the support-polygon prediction on every " +
                 "one. Seven sabotages A..G; F (the smallest anchored component) went 0 red because every case had one tower, so a " +
                 "split-tower row was added and holds it. The page rams on load with a demolition charge and names the body.",
    }),
    since246: Object.freeze({
        at: "v4590", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "physics/slick-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green in under a second, pure: a flat surface and a pose, no box3d. THE OIL SLICK AND THE DOOM FIRE ON IT (task 79): " +
                 "physics/slick.mjs drops a 1.8 x 3.4 m patch 2.6 m behind the car along its yaw and WRAPS the surface (slickSurface asks " +
                 "the track and then the patches: under oil grip x 0.3 and rolling x 0.5, a burning patch is hot road with the road's grip), " +
                 "so raceCar's carForces takes the oil as any surface and not a line of it changed; ignite lights the owner's newest unlit " +
                 "patch into render/doomFire.mjs's byte automaton -- the Slug fill's fire -- one per patch, fed for 6 s, burning out on " +
                 "its own schedule (394 ticks), a burn event a tick for a car standing in it. The gunner grew to 11 -> 8 -> 5 (two facts: " +
                 "a pursuer inside 14 m behind, a car on my oil; two outputs: drop, ignite) and its gate, the turret's and the windows' " +
                 "were re-pinned; the shell-speed key runs a chase leg AND a pursued leg because turning the duel around made 8 m/s " +
                 "hittable. Sabotages A..H, three of them findings fixed in the gate (an axis-aligned patch cannot see the frame's " +
                 "handedness; a hash of the count alone; a hash without the heat) and six more on the gunner F..K, all red by name.",
    }),
    since245: Object.freeze({
        at: "v4589", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "tools/ship/carViews-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green in 15 s: the pure cameras headless, then race-brain.html twice in the harness. A VIEW WINDOW PER CAR (task 78): " +
                 "render/carViews.mjs draws the same scene into a 240 x 160 render target with the car's first-person camera (the " +
                 "driver's seat, a point 12 m ahead at the window's exact centre) or the turret's sight (along the barrel, turning with " +
                 "it), reads it back and puts it into a 2D canvas beside the main one -- no second viewport, no new shader -- or draws " +
                 "the car's two policies' activations (9-8-2 and 9-8-3 through the kernel's twin) as bars: the brain view. A click " +
                 "cycles the three and the label says which and what it costs. Sabotages red at A..E. Found, measured: on this harness " +
                 "a presented WebGPU canvas device is lost at its first frame (device.lost, every mapAsync after it fails) while an " +
                 "offscreen device and a presented WebGL2 canvas read back indefinitely -- so the windows' pixels are held on ?webgl=1 " +
                 "here (first-person 15 % lit, brain 12 %), the WebGPU boot on what survives the loss, and the page caps its readback " +
                 "failures at three, says so in the labels and keeps the brain windows live (the first draft stopped those too).",
    }),
    since244: Object.freeze({
        at: "v4588", swept: 3, green: 3, red: 0,
        added: Object.freeze([
            "brain/gunnerPolicy-selfcheck.mjs",
            "physics/turret-selfcheck.mjs",
            "tools/ship/raceTurret-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green in 0.3 s, 9 s and 11 s: one headless and pure, one on box3d's wasm headless, one in two harness browsers. " +
                 "THE TURRET COPILOT (task 77): physics/turret.mjs mounts a turret on the race car's chassis with its own contract " +
                 "{ yaw, pitch, fire }, vacuum shells and a swept hit test, and an aim solution that is one quartic for a moving gun " +
                 "and a moving target (iterated to the muzzle's fixed point: two passes left 0.03 deg against ballistics.launchAngles " +
                 "at 20 m, found by the gate); brain/gunnerPolicy.mjs is a 9 -> 8 -> 3 relu MLP on the turret's aim errors, the " +
                 "hand gunner as weights (15 of 15 and 16 of 17 hits in 20 s duels, the zero gunner never fires), drivePolicy's ES " +
                 "on the duel (from zero to a positive score in 10 candidates, deterministic per seed), the race with turrets in " +
                 "the same lockstep (replayed from a log of both contracts to the same fingerprint and hits), and the shell-speed " +
                 "knob registered as gunner-shell on the turret-gunner instrument (score 1 / speed, the greedy 8 m/s refused with 0 " +
                 "hits of 0 shots, 12 and up pass); render/raceTurret.mjs draws domes, barrels and shells as kit fleets and " +
                 "race-brain.html races with a turret on every car, hits in the standings, and a gunner trainer in idle time. " +
                 "The browser's race with gunners is node's fingerprint on both backends, and the page boots in half a second in a " +
                 "browser of its own (inside the harness page that had just drawn the frames it froze past 300 s twice: the " +
                 "split is the fix). Sabotages red at A..E on the turret, A..E on the gunner, A..D on the page gate; C on the turret " +
                 "was a 0-red sabotage until the moving-gun row was added, and the gunner's impulse row stepped a world with no " +
                 "ground until it stood the cars on their suspension. brainTrail's fifty-round row (no brain page in the registry) " +
                 "re-founded on registryPages: turret-gunner is the first, and the link is derived.",
    }),
    since243: Object.freeze({
        at: "v4587", swept: 3, green: 3, red: 0,
        added: Object.freeze([
            "physics/apsidalKnob-selfcheck.mjs",
            "physics/hologramKnob-selfcheck.mjs",
            "physics/impactKnob-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green in 6 s, headless. The three v4586 knob modules got the sibling gate reportDoors asks of a reportLines() " +
                 "provider (each holds its two routes to each other, the refusal on its own subject, and the derived tolerance), " +
                 "and physics-lab.html's four status lines were rewritten to what the adjudicators measured: the black hole says " +
                 "unbound or bound by the energy rather than 'below the ISCO', the neutron star says nothing on its slider plunges, " +
                 "plasma names the mirror-point estimate's 5-11 % miss and that there is no loss cone, impact prints the capture " +
                 "radius from the start point (1.703, not 1.732) -- verified in the page. Found: the first draft of apsidalKnob's " +
                 "gate called the dt-sweep residual a floor and pinned it under 2e-5; it is a slope (5.4e-5, 1.7e-5, 2.6e-6) and " +
                 "each reading is held under the tolerance derived for its step instead. Found: reportDoors' no-sibling row had been " +
                 "red since v4584 on fleetRouting and labHome (both gated from tools/ship/), unrecorded by three notes; dated into " +
                 "NO_GATE_V4587. Sabotages red at A / B / C / D on each of the three, none crashing, none 0-red.",
    }),
    since250: Object.freeze({
        at: "v4626", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "tools/ship/murmurSpecies-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green in 2.4 s, real WebGPU. SPLIT OUT of murmurKit-selfcheck rather than newly written: every " +
                 "species row needs a real render and a render needs a Chromium, so folding four species into the " +
                 "kit's gate put it at 2,806 ms against a 3,000 ms budget -- 194 ms of margin on a box this tree " +
                 "measures running ~10% slower under a contended sweep, which is OVER. Fifteen species are still " +
                 "unported, so that pressure only grows: a single gate rendering all eighteen crosses the budget " +
                 "no matter how it is tuned, and a gate over budget does not run at ship time at all. The split " +
                 "is also better attribution -- a red here says a species is wrong, a red next door says the kit " +
                 "is. murmurKit-selfcheck came back to 894 ms; this gate is 2,440 ms. Carries droplet, the fourth " +
                 "species and the first whose SILHOUETTE moves. TWENTY-EIGHT SABOTAGES ACROSS BOTH GATES, ALL RED " +
                 "-- and FOUR were green on the first sweep: the amplitude-clip row asked mhRadiusAt, which does " +
                 "its own clamp, so deleting the clamp inside the SOLVE left it green; droplet's silhouette row " +
                 "ran at voice 0.3, where the breath scales the whole body between frames, so freezing the " +
                 "deformation still moved the outline 0.36% and passed -- it runs at voice 0 now, where a frozen " +
                 "body reads EXACTLY 0.000%; deleting droplet's solved heart passed every row, because the peak " +
                 "saturates at 765 with or without it and what the heart actually does is light the fog around " +
                 "it (interior mean 441 against 254); and one sabotage's anchor had gone stale against a " +
                 "multi-line ternary and was reported as green rather than as missing.",
    }),
    // v4630 -- THE 242nd CLOSING, and a note on why it is a NEW key rather than an edit to since250. The first
    // attempt overwrote since250's `added` list with this gate's name, which kept the total at 290 and silently
    // dropped tools/ship/murmurSpecies-selfcheck.mjs from the tally -- the equality below went red by exactly
    // one and said so. A closing is a dated FACT about a round, not a slot to reuse.
    since251: Object.freeze({
        at: "v4630", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "tools/ship/murmurSpecies2-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green in 2.2 s, real WebGPU, 9 rows. SPLIT OUT of tools/ship/murmurSpecies-selfcheck.mjs and " +
                 "made BEFORE the species that forced it rather than after -- which is the whole point. That " +
                 "gate stood at 2,780 ms against a 3,000 ms ceiling with FOUR of murmur's eighteen species " +
                 "ported, and a species costs about 195 ms (one WGSL compile plus one render), so the fifth " +
                 "crossed it. reuseInstances was already spent: ten frames built five shaders. A gate over " +
                 "budget does not run at ship time AT ALL, so the round that adds the species that crosses the " +
                 "line is the round whose red nobody sees. THE CUT IS BY SUBJECT, NOT ALPHABET: what needs " +
                 "SEVERAL HEROES IN ONE FRAME SET (the rim ranking, the ring's evenness, the contact glow, the " +
                 "paper ground) stays next door; what needs ONE HERO AT SEVERAL TIMES (comet's point going " +
                 "round its orbit, droplet's body wobbling) is here. Those are different frame budgets -- three " +
                 "shaders at one time each against two shaders at four times and two -- and keeping them apart " +
                 "is what stops either gate paying for the other's frames. 19 rows before the split and 19 " +
                 "after, counted: 10 there and 9 here, nothing dropped in the move. The MEASUREMENTS both gates " +
                 "use live in tools/ship/murmurSpeciesFrames.mjs rather than being copied into each, because " +
                 "two gates with their own idea of what the light at a point IS eventually disagree about what " +
                 "they measured -- the defect this tree has repaired in its own census records three times. " +
                 "Timings after: 1,937 ms there, 2,194 ms here, roughly 800 ms of headroom apiece.",
    }),
    // v4632 -- THE 243rd AND 244th CLOSINGS. New keys, not edits to since251: a closing is a dated fact
    // about a round.
    since252: Object.freeze({
        at: "v4632", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "tools/ship/murmurSpecies3-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green in 2,357 ms on the rotation, real WebGPU, 9 rows. Carries OPAL and ABYSS, the fifth and sixth " +
                 "of murmur's eighteen, and it is a third gate rather than more rows next door because these " +
                 "two need a THIRD frame budget: gate one wants several heroes at one time, gate two one hero " +
                 "over a SHORT span, and these two one hero over TWENTY SECONDS -- abyss's slot at these " +
                 "knobs is 16.48 s and opal's four lives run at 14.3 to 22.4, so sampling them in a " +
                 "2.2-second window would measure nothing. THIRTEEN FRAMES AND TWO SHADERS, and all three " +
                 "numbers are budget decisions: a first cut at six times and fifteen frames measured 3,097 " +
                 "ms; four abyss lane frames later took it to 2,956, which is green and is NOT enough margin " +
                 "when the run-to-run spread is about 100 ms and eviction needs two consecutive crossings; so " +
                 "the neutral third SPECIES went, costing a WGSL compile as well as a render. What that cost " +
                 "is named in the file rather than glossed: two rows that read against `still` now read " +
                 "against opal, the numbers got STRONGER (abyss's edge outruns opal's by 112x where it " +
                 "outran still's by 10x) and the CLAIM GOT NARROWER -- 'the highest rim in the roster' is a " +
                 "ranking over eighteen and neither version of that row ever measured it. THE FOUR SAMPLE " +
                 "TIMES ARE CHOSEN BY THE CPU HALF, not spaced evenly: mhFlourish is the same envelope the " +
                 "shader runs, so it says which of abyss's three lanes is passing when -- two nights, one " +
                 "third-lane pass and one first-lane pass -- and that is what lets the hue row name a LANE " +
                 "instead of a moment. ONE ROW WAS REBALANCED BEFORE SHIPPING: the rarity swing reads 31.8x " +
                 "at six sample times and 8.8x at four, because the PEAK depends on whether a sample lands on " +
                 "a pass while the FLOOR is in every frame -- so the limit sits at 4x and the floor plus the " +
                 "count on it carry the row, rather than a bound set at a lucky maximum.",
    }),
    // swept is 1 and not 2, and the gate that would have taken it to 2 is named in the verdict instead:
    // tools/ship/murmurSpecies2-selfcheck.mjs was RE-swept in this round, not added by it, and `added` is the
    // list of new gates. gateSweep-selfcheck asserts added.length === swept on every closing precisely so a
    // re-sweep cannot be counted as coverage of a gate the surplus arithmetic already owns.
    since253: Object.freeze({
        at: "v4632", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "tools/ship/murmurSpecies4-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green in 2,095 ms on the rotation, real WebGPU, 5 rows -- and the gate it was split " +
                 "OUT of, tools/ship/murmurSpecies2-selfcheck.mjs, re-swept green at 2,000 ms from a " +
                 "recorded 2,260 and a measured ~2,740 on this box. " +
                 "*** THE TRIGGER WAS A PAIRED MEASUREMENT, WHICH IS THE ONLY KIND THIS BOX CAN SUPPORT. *** " +
                 "droplet's swell pair cost 206, 264, 216 and 287 ms over four INTERLEAVED runs of the two " +
                 "versions of gate two, taking it from about 2,740 to about 2,980 against the 3,000 ms " +
                 "ceiling. Interleaved because the box is not the box the timings file was written on: gate " +
                 "one, UNCHANGED this round, reads 2,776 ms against a recorded 2,016, and murmurKit 1,754 " +
                 "against 1,633 -- so a single before-and-after pair would have blamed the box's drift on the " +
                 "change or the change on the box. An earlier unpaired attempt did exactly that and read the " +
                 "four frames as free. THE TWO HEROES NEVER SHARED A FRAME: comet needs four phases of a " +
                 "2.2-second lap, droplet two times eight seconds apart on 76-to-134-second periods. This is " +
                 "the third split in the murmur tree and all three were made BEFORE the addition that would " +
                 "have crossed the line -- v4626 between the kit and the species, v4630 between gate one and " +
                 "gate two, this one between comet and droplet. TWO ROWS WERE FOUND STATING FIGURES THAT DO " +
                 "NOT REPRODUCE while moving them: comet's hotspot row claimed still's catchlight travels " +
                 "0.067 radii at 48 px and 0.071 at 64 and that it 'must not be asserted as zero' -- it reads " +
                 "0.000 and 0.050, and zero is CORRECT, because the key turns 0.35 degrees across comet's lap " +
                 "and a hotspot is an integer pixel. Its ratio clause was therefore satisfied by anything and " +
                 "printed '1150352337x less' out of its own divide-by-zero guard; the two sides are bounded " +
                 "separately now. droplet's silhouette row quoted 71.3/31.3% against 9.5/3.8% and 'roughly " +
                 "EIGHT HUNDRED TIMES apart'; on the frames that run it is 74.09/71.03% against " +
                 "10.977/11.437%, a 6.7x and 6.2x ratio, because still stopped being drawn as a sphere.",
    }),
    // v4633 -- THE 245th CLOSING: a gate that was RED for nine rounds because it was 27 ms over budget.
    // swept is ZERO and that is the honest count, not a formality: this closing ADDED no gate, so it owes
    // the surplus arithmetic nothing. gateSweep-selfcheck asserts added.length === swept on every closing
    // precisely so a re-sweep cannot be counted as coverage of a gate the population already owns -- the
    // same rule that corrected v4632's since253 a round earlier. What this entry records is a VERDICT.
    since254: Object.freeze({
        at: "v4633", swept: 0, green: 0, red: 0,
        added: Object.freeze([]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "*** NO GATE WAS ADDED AND THAT IS THE POINT: tools/ship/inputSets-selfcheck.mjs ALREADY " +
                 "EXISTED, WAS ALREADY RED, AND HAD BEEN SINCE THE v4622 MERGE. *** It was recorded at 3,027 " +
                 "ms against the 3,000 ms quick-sweep budget -- 27 milliseconds over -- so the sweep skipped " +
                 "it every round and its red was seen by nobody until v4632 ran the cascade by hand. That is " +
                 "backlog item #14's own shape, arriving on a gate rather than on a population. Both halves " +
                 "are repaired: the red is fixed and the gate is 2,052 ms on the rotation, 948 ms of margin. " +
                 "WHAT THE RED WAS: its own record carried 130 conflicting paths, and a conflicting path is " +
                 "refused for EVERY gate that touches it -- 283 of 1,293 gates, against 23 refused by a hash " +
                 "that genuinely differed. The conflicts were not a race in the recording pass, which is " +
                 "what the code's own note had claimed for six rounds; they were tools/ship/recordInputs.mjs " +
                 "seeding each pass with the PREVIOUS record, so a carried entry's T0 hashes folded with a " +
                 "fresh pass's T1 hashes. *** AND THE RACE THE SENTINEL WAS NAMED FOR CANNOT FIRE AT ALL: *** " +
                 "hashFile is memoised for the life of a pass, so a gate that rewrites a file another gate " +
                 "already read hands the late reader the EARLY hash -- driven on a real file in the gate, " +
                 "which reports zero conflicts for a write that demonstrably happened. So the recorder now " +
                 "VALIDATES its prior instead of blending it, and the real hazard got a reading that can see " +
                 "it: re-hash every recorded path AFTER the pass with the memo cleared, 630 ms over 13,073 " +
                 "paths, which finds two gitignored outputs that gates write on every single run. NINE " +
                 "SABOTAGES, ALL RED. The gate came down from 7,439 ms by measurement rather than by " +
                 "deletion: a transitive-closure fixture that cost 3,016 ms became one that costs 167 and " +
                 "names the file it proves (brain/flowfieldCpu.js, reached only through dispatch.js); three " +
                 "probes of one gate became one; and a section that cloned the 1,302-entry record three " +
                 "times stopped doing that. Every row it had is still there.",
    }),
    // v4634 -- THE 246th CLOSING: nebula and tempest, the pair murmur's own source names.
    since255: Object.freeze({
        at: "v4634", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "tools/ship/murmurSpecies5-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green in 2,663 ms on the rotation, real WebGPU, 9 rows, carrying NEBULA and TEMPEST -- the " +
                 "seventh and eighth of murmur's eighteen and the only two with NO OBJECT INSIDE THE GLASS AT " +
                 "ALL. They ship together because the source pairs them: tempest.ts opens \"NEBULA'S SIBLING " +
                 "AND ITS OPPOSITE TEMPERAMENT ... Nebula is lit evenly from within and its business is " +
                 "DEPTH. This one is lit from INSIDE ITS OWN FLASHES ... and its business is ENERGY.\" They " +
                 "call a BYTE-IDENTICAL kit set (diffed) and are the only two of the eighteen that never " +
                 "call mh_medium, so the pair needed no new kit. MEASURED: tempest holds its lightning to " +
                 "the inner two thirds and its rings at 0.62 and 0.78 of the radius move EXACTLY 0.00% under " +
                 "its own brightness knob, where nebula -- which has no depth mask -- moves 20.08% at the " +
                 "same radius off the same knob, and tempest's own 0.25 ring moves 246%; its interior runs " +
                 "12.5x from tenth to ninetieth percentile against nebula's 6.3x. THIRTEEN SABOTAGES, ALL " +
                 "RED, and FOUR survived the first cut. Three were constants inline in the species file -- " +
                 "tempest's absorption at 3.60 against nebula's 3.10 (the coefficient nebula.ts calls \"THE " +
                 "LINE\"), its density curve, its specular -- all changeable with every row green, so they " +
                 "moved into the kit as MH_MIST and MH_TEMPEST_BOLT and are graded there. *** THE FOURTH WAS " +
                 "A ROW MEASURING THE TONE CURVE AND REPORTING IT AS THE PHYSICS. *** The density-saturation " +
                 "row ran at the default glow where nebula peaks at 646 of 765: it read 0.680 on the correct " +
                 "shader and 0.558 with the absorption DELETED -- passing HARDER on the broken one. At glow " +
                 "0.15, peak 247, it reads 0.581 against 1.012, and 1.00 is not a threshold anybody chose, " +
                 "it is what linear-in-emission means. A FIFTH GATE rather than rows next door because gate " +
                 "one had 494 ms of margin and a species costs about 375. AND THE ROUND LEFT A BLOCKER IT " +
                 "MEASURED: this file builds every species' block into every species' shader, so the two new " +
                 "heroes cost gate one a PAIRED 213-288 ms although it renders neither. Logged as " +
                 "orb-species-block-per-shader; the next orb round starts there.",
    }),
    // v4643 -- THE 254th CLOSING: mh_present's tail, and a second tone curve a gate refused.
    since329: Object.freeze({
        at: "v4643", swept: 0, green: 0, red: 0,
        added: Object.freeze([]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "NO GATE ADDED -- rows added to three that existed, which is why swept is 0. *** mh_present's " +
                 "TAIL: THE CATCHLIGHT, THE CONTACT SHADOW AND THE KNEE. *** v4627 took mh_present's " +
                 "arrangement (railE = body + (spec + contact) * dark, the rail, the containment) and stopped " +
                 "there. ON INK THAT COST ONE TERM, THE KNEE. ON PAPER IT COST THREE, and two of them are what " +
                 "make paper a different GROUND rather than a lighter one: `dark` SUBTRACTS the specular from " +
                 "the energy on a light ground and murmur adds it back as a mix toward a warm white, so this " +
                 "port did the subtracting and not the adding -- a paper orb LOST its highlight instead of " +
                 "gaining a white one -- and without the contact shadow the object floats. " +
                 "*** THE PAIR IS BIT-EXACT ON THREE GROUNDS: *** worst |gpu - cpu| is 0 of 255 over 16 " +
                 "speculars x 16 heights x 3 channels on paper, on ink and on a light grey, against 127 / 0 / " +
                 "94 for the unflipped reading. THE THREE TERMS ARE THEN SEPARATED, because an agreement bound " +
                 "does not say which one is present: across a specular sweep of 0 to 1.2 the paper ground " +
                 "climbs 69 counts of 255 and the ink ground moves 0; at a specular of ZERO the page darkens " +
                 "60 counts from the top of the frame to the bottom while ink moves 0; and the knee compresses " +
                 "1.5 to 0.9998 at ink's 0.90 against 1.0000 at paper's 0.96 while 0.5 passes untouched at both. " +
                 "*** THE SIGN OF THE SHADOW WAS MEASURED, NOT COPIED. *** murmur reads gl_FragCoord, where y " +
                 "runs DOWN; this port takes its quad from three's uv(). The direction came off the contact " +
                 "GLOW instead -- the only term outside the silhouette, which murmur already weights downward " +
                 "-- at 128 px over the annulus past the body: limn 1.426 bottom-over-top, still 1.074, abyss " +
                 "1.015, all above 1. v4638 is what reading that from the source costs. " +
                 "*** AND A GATE CAUGHT A SECOND TONE CURVE, WHICH IS THE FINDING OF THE ROUND. *** The first " +
                 "cut applied the whole finish in the fragment shader. render/aiPresenceOrbPresent.mjs -- this " +
                 "tree's port of murmur-web's OWN present.wgsl -- already applies knee(x, 0.90), quoting that " +
                 "file's header verbatim: \"exposure, bloom, THE TONE CURVE, the dither and the sRGB encode " +
                 "are WRITTEN ONCE\". Two knees compressed the peak twice and " +
                 "tools/ship/aiPresenceOrbPresent-selfcheck.mjs's Y-FLIP harness went red: the direct render's " +
                 "brightest pixel held at (12,12) and the pipeline's slid to (17,15), because flattening an " +
                 "already-flattened lobe reordered the peaks. THE LOCATION MOVING WAS A SECOND-ORDER SYMPTOM, " +
                 "so the first-order fact is now its own row -- the two paths must agree about how BRIGHT the " +
                 "brightest pixel is, measured 672 against 674, bound 12 of 765 -- because a double tone curve " +
                 "that happened not to move an argmax would have left that harness green and the picture wrong. " +
                 "THE REPAIR IS A SPLIT: mhPresentPaper (the two ground-dependent terms, which read `paper` " +
                 "and must run in the species shader on BOTH paths) and mhPresentKnee (which goes in the same " +
                 "`linear ?` bracket the sRGB encode has been in since the HDR pass was built). " +
                 "*** TWELVE SABOTAGES, ALL TWELVE CAUGHT, AND THREE OF THEM ONLY AFTER THE PROBE GREW A THIRD " +
                 "GROUND. *** Two of mh_present's constants are INVISIBLE on the two grounds that ship, " +
                 "measured rather than assumed: the catchlight's 1.06 gain is DEAD on house paper (s0.L is " +
                 "0.9701, so 0.9701 * 1.06 + 0.05 = 1.0782 and the 1.02 cap takes it -- the gain could be 1.5 " +
                 "and the frame would not move), and the shadow's 0.55 tint multiplies the INK colour, which " +
                 "is 0.00304 in linear light, so 0.55 of it against 0.75 of it differ by 0.00061 where one " +
                 "8-bit step is 0.00392. A light-grey ground with a mid-grey page makes both bite, and the " +
                 "probe carries it. A THIRTEENTH was added for the direction the pixels cannot see at all: " +
                 "deleting the knee from the direct path too moves 20 bytes on arc and 4 on sol -- the only " +
                 "species whose linear light passes 0.90 at 0.9647 and 0.9387 -- and every species gate stayed " +
                 "GREEN through it, so where the knee is CALLED is held by a source census that says so. " +
                 "*** AND TWO RECORDS THAT HAD OUTLIVED THEIR OWN REPAIR. *** murmurKit-selfcheck's closing " +
                 "still said the HUE channel \"reaches no pixel and every species passes 0\" -- closed at " +
                 "v4631, and murmurSpecies4 measures droplet turning 1.57 degrees of hue against 0.0008 of " +
                 "lightness. render/aiPresenceOrbTsl.mjs carried BOTH the stale note and the one that replaced " +
                 "it, three lines apart, for twelve rounds: the round that closed the gap added its paragraph " +
                 "without deleting the one it contradicted. A closing that UNDER-claims sends the next reader " +
                 "to build what is already there. " +
                 "MEASURED IN PIXELS: on ink the whole round touches 24 bytes across the eighteen species at " +
                 "the gates' glow of 0.15, and at the DEFAULT glow of 1 it moves 50 of 54 baseline frames by " +
                 "at most 4 counts of 255 -- the knee, compressing bright output, which is its whole job. On " +
                 "paper all 18 frames move. WHAT IS STILL NOT PORTED: mh_out's triangular-PDF dither, which is " +
                 "why the kit function is mhPresentFinish and not mhPresent; and present.wgsl's knee is a " +
                 "fixed 0.90 where mh_present's moves to 0.96 on paper, so the HDR path compresses a paper " +
                 "ground at the wrong constant. Both named in the kit, neither closed here.",
    }),
    // v4644 -- THE 255th CLOSING: the SUCCESS flash, from a constant table to a ring that travels in pixels.
    // *** since331 -- SIX GATES ARRIVED ACROSS SIX ROUNDS AND NOT ONE ROUND CLOSED THEM. ***
    // Every one was written, sabotaged and run singly in the round that added it; what none of those rounds
    // did was run the censuses that COUNT gates. This surplus was found only when a full verify was finally
    // run -- on Keith's gen-9 box and then here -- and it was red on BOTH, alongside assertionShape's
    // 1751 -> 1757 and runtimeGap's 4275 -> 4286, which are the same six arrivals seen from two other
    // instruments. The surplus mechanism worked exactly as designed; nobody looked at it for six rounds.
    // v4673 -- THE 353rd CLOSING: three orphan ratchets stored a number where they needed a set, so every
    // breach for two hundred rounds could say THAT it moved and never WHAT moved.
    since352: Object.freeze({
        at: "v4673", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/orphanSets-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze(["tools/ship/graveyard-selfcheck.mjs (ORPHAN_UTIL_BASELINE retired for a recorded set; its literalness row retargeted onto the set)",
                                "tools/ship/referenceKind-selfcheck.mjs (RESCUED_CEILING and RITUAL_CEILING retired; the slack tolerance DELETED, not ported; a stale two-module prose list removed)"]),
        verdict: "green in 0.9 s over six sections, and it CLOSED TWO OF THE SIX STANDING REDS -- graveyard " +
                 "all pass, referenceKind all pass -- by recording membership instead of raising a number. " +
                 "*** A COUNT SAYS IT MOVED AND CAN NEVER SAY WHAT MOVED. *** ORPHAN_UTIL_BASELINE 159, " +
                 "RESCUED_CEILING 288 and RITUAL_CEILING 39 were all breached, and each failure line was of " +
                 "the form '167 now vs 159 recorded': true, unarguable, and actionable by nobody. Recovering " +
                 "the arrivals took a detached worktree at fc12eef (2026-09-14, the commit that set two of " +
                 "the three), four census runs at 90-105 s each, and a check that the census LOGIC was " +
                 "byte-identical across those ten days first -- because a set difference taken across two " +
                 "scanners is a reading of the scanner. MEASURED: orphaned utilities 157 -> 167 (+12, -2, " +
                 "against a ceiling of 159 that was therefore holding TWO OPEN SLOTS), prose-rescued " +
                 "289 -> 302 (+18, -5), ritual-hidden 39 -> 47 (+11, -3). 26 distinct arrivals, 5 departures. " +
                 "*** THE FIVE DEPARTURES ARE REAL PAYDOWN NOTHING COULD SHOW. *** anim/ik.mjs, " +
                 "absenceScope, recordDrift, wgslCorpus and vendor/three/jsm/loaders/FBXLoader.js -- the last " +
                 "being the exact entry referenceKind's own v4535 note named as 'round 2 of the FBX work the " +
                 "vendoring commit already deferred'. Somebody finished it; the count netted it against " +
                 "eighteen arrivals into a single '+14'. " +
                 "*** TWO ARRIVALS ARE THE SHIP RITUAL'S OWN DRIVERS. *** tools/ship/ship.mjs and " +
                 "tools/ship/verify.mjs, neither new nor unused -- shipBridge execFiles one, " +
                 "sourceChainBridge spawns the other -- unresolvable only because both are invoked through a " +
                 "COMPOSED path, path.join(\"ship\", \"ship.mjs\"). They entered the census the day a sweep " +
                 "closing named them, and nextRounds.mjs (the backlog) arrived the same way. " +
                 "*** THE SLACK TOLERANCE IS DELETED RATHER THAN PORTED, AND THAT IS A TIGHTENING. *** " +
                 "Both count ratchets carried 'ceiling - actual <= 8' because A COUNT HAS FUNGIBLE SLOTS: pay " +
                 "two down and two fresh orphans fill the vacancy unseen, which graveyard was doing at " +
                 "157-under-159 the day this round started. A SET HAS NO SLOTS. Section 2 drives the " +
                 "substitution -- one paydown, one arrival, identical length -- and shows the retired rule " +
                 "passing where the set names both. " +
                 "*** AND THE ROUND'S OWN FILE COMMITTED THE ROUND'S OWN DEFECT. *** orphanSets.mjs records " +
                 "516 names; the moment it existed referenceKind read them as MENTIONS and rescued TWENTY " +
                 "modules nothing had named before (302 -> 322 on a round that wired nothing) -- v3223's " +
                 "law, 'A REGISTER OF ORPHANS IS NOT A CONSUMER OF THEM', broken on first run by the file " +
                 "written to enforce it. Excluded now in BOTH censuses identically, because referenceKind's " +
                 "own comment is right that the two numbers stop being comparable otherwise. " +
                 "*** AND THEN THE ROUND DID IT A THIRD TIME, TO ITSELF, WRITING THESE RECORDS. *** With " +
                 "both censuses green, the round wrote this closing and a backlog entry -- and the next full " +
                 "census came back red: proseRescued 304 against 302 (ARRIVED adapterRecord and orphanSets), " +
                 "ritualHidden 48 against 47. THE CLOSING NAMES THE MODULE IT GUARDS, " +
                 "and the ritual requires it, so writing this paragraph put orphanSets.mjs into the very " +
                 "population it was built to record; the backlog entry about shared gate helpers named " +
                 "adapterRecord.mjs and put that one in beside it. Nothing was wired or deleted -- two " +
                 "sentences moved them. RECORDED RATHER THAN ARGUED AWAY: deleting the closing to keep a " +
                 "number down would be gaming the instrument, and both are true memberships. This is exactly " +
                 "the job v4386 set for the row -- 'the next round to leave a gate-only module behind is told " +
                 "so BY ITS OWN SHIP RUN' -- and it told this one, by name, within the round. Every " +
                 "gate-adding round will do the same, which IS the 39 -> 47 drift seen from the inside. RECORDING " +
                 "THAT created a FOURTH: the closing above names adapterRecord, so it joined ritualHidden too, " +
                 "49 against 48. It terminates because only prose in files NOT excluded from the mention scan " +
                 "can move these populations, and the record itself is excluded. Final: 167 / 304 / 49. " +
                 "THIRTEEN SABOTAGES, THIRTEEN CAUGHT -- and one had to be rebuilt: the subset sabotage " +
                 "planted render/panini.js, which was ALREADY in ritualHidden, so it reddened as a duplicate " +
                 "and section 4's containment row was never exercised. Re-run with render/murmurKit.mjs, in " +
                 "none of the three sets, it reddens on STRAYS as intended, and the in-set variant stays " +
                 "green as its control.",
    }),
    // v4672 -- THE 352nd CLOSING: the ship-time budget is an absolute wall in front of readings that are not
    // absolute, so a gate can be exiled for how fast the box was rather than for how slow the gate is.
    since351: Object.freeze({
        at: "v4672", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/relativeBudget-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze(["tools/ship/budgetExile-selfcheck.mjs (its section 2 read the UNNORMALISED decision and called it \"the exiled set\"; it now passes the scale, so it grades the rule the ship uses)"]),
        verdict: "green in 438-462 ms over three runs, 17 rows in nine sections. *** THE COMPARISON, NOT THE " +
                 "COST. *** selectGates decides membership with timings[g] <= 3000: a constant on the right, " +
                 "and on the left a millisecond count taken on whatever box at whatever load filed it. " +
                 "sweep-timings.json's own note has said since v4536 that this box moves 12-36% between " +
                 "hours on unchanged code, so a gate whose honest cost is 2,800 ms measured in a 26% hour is " +
                 "filed at 3,528 and stops running -- and nothing about the exile says whether the gate or " +
                 "the hour was slow. MEASURED ON THE LIVE FILE: a box 10% slow wrongly evicts 26 gates, 26% " +
                 "slow 86, 50% slow 170, 100% slow 299. " +
                 "*** THE SCALE IS MEASURED, NOT ASSUMED, AND 21 OF 22 PASSES CANNOT SUPPLY ONE. *** " +
                 "serialRing (v4648) holds three uncontended readings per gate, so a pass that re-ran gates " +
                 "which already had history carries paired observations of the same work on the same code: " +
                 "the median of new/prior is a reading of the BOX, because the gate cancels. The dominant " +
                 "pass measures 0.9853 over n=185 (p10 0.941, p90 1.031) -- 1.5% FASTER than its own " +
                 "history. A second pass measures 1.0009 over n=36. The other 20 have zero usable pairs " +
                 "between them and get NO ENTRY, which reads `measured: false` rather than a 1.0 dressed as " +
                 "an observation; 339 of 1,780 gates are in that state and select identically to the " +
                 "pre-v4672 rule. " +
                 "*** THE CLAMP AT 1 IS A MEASURED DECISION AND NOT TIDINESS. *** Symmetric division by " +
                 "0.9853 makes the wall STRICTER and would evict five gates today -- fresnelJoin 2970, " +
                 "pathStrat 2969, magmapDevice 2966, carveJudged 2962, domToTexture 2962, every one of them " +
                 "four to ten ms under the wall, thrown out to correct for a box that was never slow. " +
                 "Asymmetric admits 0 and evicts 0 on today's file and still recovers 26/26, 86/86, 170/170 " +
                 "and 299/299 of the harm above. " +
                 "*** WHAT IS NOT CLAIMED, AND HOW IT IS BOUNDED INSTEAD. *** The scale is measured on " +
                 "UNCONTENDED readings and applied to timings[g], which is usually CONTENDED (v4556), so it " +
                 "assumes a slow box slows both alike -- and nothing in the record can test that, because " +
                 "there is no parallel ring. So it is capped at SCALE_MAX = 2: a gate readmitted this way " +
                 "had a raw reading of at most 6,000 ms, and at a 2.5x box the rule declines 84 of 370 " +
                 "rather than pretending. " +
                 "TWELVE SABOTAGES ON THE FIRST BATTERY, TWELVE CAUGHT -- and then two more that the first " +
                 "battery could not have caught, both the round's own defect inside its own gate. Lowering " +
                 "SCALE_MIN_N to 1 left the headline row GREEN, because the fixture was sized as " +
                 "`SCALE_MIN_N - 1` and therefore SLID WITH THE CONSTANT: a check whose expectation is " +
                 "derived from the thing it checks, which grades nothing, and it survived only because a " +
                 "hardcoded 29 in the row beneath happened to notice. The floor is now LOCATED by walking " +
                 "1..200 and asking where the answer changes. Raising SCALE_MAX from 2 to 3 made " +
                 "`rows.find((r) => r.f > SCALE_MAX)` undefined and the row's own detail string dereferenced " +
                 "it, so THE GATE DIED instead of failing -- a death reports nothing at all, which is " +
                 "strictly worse than a red. Both repaired, both re-sabotaged, both now red on the change.",
    }),
    // v4671 -- THE 351st CLOSING: the backlog's own integrity. The file that decides what to build next
    // could not be asked a question, and asking it one found three things -- including a gate this session
    // left red a round earlier.
    since350: Object.freeze({
        at: "v4671", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/backlogIntegrity-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green in 59 ms, 6 rows in four sections and no render at all -- it reads " +
                 "tools/ship/nextRounds.mjs as a DATA STRUCTURE. *** THE ROUND STARTED AS A QUESTION AND THE " +
                 "QUESTION WAS THE FINDING. *** Asked what was still open, and the answer verified rather " +
                 "than believed, the backlog turned out to answer that in THREE vocabularies: blocker:OPEN " +
                 "(61 entries), state:OPEN (23, zero overlap), and blocker:HARDWARE/UPSTREAM (16 -- not a " +
                 "status at all but the KIND of thing blocking). A reader who knew the first returned 26 of " +
                 "44. Not a wrong answer: a confident incomplete one, and nothing about its shape said it " +
                 "was short. entryStatus/entryBlockedBy/openEntries are the accessor that was missing; the " +
                 "82 entries are NOT rewritten, because no entry was wrong. " +
                 "*** TWO ENTRIES WERE IN THE FILE TWICE, WITH DIVERGENT NOTES, AND CROSSED. *** " +
                 "ibl-specular-half and terrain-controller each appeared at two sites -- one holding the " +
                 "fresh ibl beside the stale terrain, the other the reverse, which is why neither looked " +
                 "wrong alone. ibl's dropped note was a strict PREFIX of the one kept. terrain's kept note " +
                 "opens 'CLOSED AT v4544, AND THE SENTENCE THAT FOLLOWED THIS ONE NAMED THE WRONG STATE' -- " +
                 "and that sentence was still in the copy twenty-five lines away. The backlog was holding a " +
                 "correction and the text it corrected, and a reader got whichever they reached first. " +
                 "*** ONE ENTRY'S HEADLINE CONTRADICTED ITS OWN FIFTEEN NOTES FOR THIRTY ROUNDS. *** " +
                 "orb-state-terms-wiring's `what` said 'NOTHING CALLS IT' about mh_state, which v4653 " +
                 "started calling and which now has 72 readers; its `how` said stateTau 'will need' adding " +
                 "twenty-seven rounds after v4644 added it. The notes were never wrong -- fifteen accurate " +
                 "paragraphs under a headline that contradicted them, and a reader stops at the headline. " +
                 "The old text is PRESERVED as quoted history rather than deleted, and section 3 tests only " +
                 "what an entry LEADS with. " +
                 "*** AND THE ROUND CAUGHT THIS SESSION LEAVING A GATE RED A ROUND EARLIER. *** v4670 wrote " +
                 "blocker: 'OPEN -- for connecting and shaping ONLY. ...' -- a verdict with its reason " +
                 "attached, which is better writing and unmatchable by the === byBlocker() used. The entry " +
                 "fell out of all three report sections and printed NOWHERE, and " +
                 "tools/ship/shipRitual-selfcheck.mjs asserts exactly that ('a backlog item nobody can see " +
                 "is worse than none'). It was red at v4670 and found here, a round late, because v4670 did " +
                 "not run it. byBlocker and reachable PARSE the verdict now. " +
                 "TWELVE SABOTAGES, NINE CAUGHT ON THE FIRST PASS, and all three that walked were this " +
                 "round's own defect reappearing inside its own gate: classifying HARDWARE as CLOSED and " +
                 "reverting openEntries() to a blocker-only match both left every row green, because every " +
                 "row asked entryStatus() what it thought and then agreed with it -- so the expected open " +
                 "set is now built by reading the raw fields independently. The third put 'NOTHING CALLS " +
                 "IT' back at the FRONT of the repaired entry and walked, because the preserved-history " +
                 "escape hatch excused the whole field; only the first 220 characters are examined now, and " +
                 "widening that window back reddens the row.",
    }),
    // v4670 -- THE 350th CLOSING: phase 2 of the orb -- two behaviour states, and the forty-round blocker
    // that turned out to be one `res.write()` away from gone.
    since349: Object.freeze({
        at: "v4670", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/orbBehaviorStates-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green in about 1.2 s, 11 rows in five sections, driving a BRIDGE rather than a shader -- " +
                 "the first orb gate that does. *** THE BLOCKER WAS NEVER WHAT ITS FIRST WORDING SAID. *** " +
                 "nextRounds reserved four thinking-orbs behaviour names and refused to wire any of them on " +
                 "the rule this tree's own orb work earned: an unwired state is decoration, not signal. The " +
                 "first wording blamed 'no two-stage AI work exists'; v4628 sharpened it to the true one, " +
                 "that ai-bridge/ragBridge.js HAS retrieved-then-generated all along but sent both stages " +
                 "in one response, so no page could see stage 1 finish -- 'there is nothing for `searching` " +
                 "to be lit DURING'. That is a res.write() and a chunked header. " +
                 "MEASURED: with a 250 ms model, the retrieval line is on the wire 250 ms before the " +
                 "answer. The gate asserts THE GAP and not the line count, because a handler that built " +
                 "both objects and wrote them back to back at the end emits the identical two lines and " +
                 "reads a gap of 0 -- which is the defect, and is invisible from any other angle. " +
                 "*** THE STREAM IS OPT-IN AND THE OLD SHAPE IS BYTE-FOR-BYTE UNCHANGED, *** because " +
                 "ev.html's previous path did fetch(...).then(x => x.json()) and NDJSON would have thrown " +
                 "a syntax error in it. " +
                 "*** AND THE TWO STATES RENDER THROUGH murmur's WINDOWS RATHER THAN BESIDE THEM. *** " +
                 "kit.ts cuts mh_live and mh_state on the state NUMBER -- listening (0.5,1.5), working " +
                 "(1.5,3.5), drive (2.5,3.5), ignition (3.5,4.5) -- so a seventh state appended at index 6 " +
                 "is outside every one of them. MEASURED: at activity 0.8, searching rendered as thinking " +
                 "reads a cadence of 0.8272; at its own raw index it reads 0.4963, which is IDLE's number. " +
                 "A state whose name means the assistant is working, rendering at the resting cadence, is " +
                 "the thing the mapping exists to prevent. Widening murmur's windows was the other option " +
                 "and was rejected: a port that edits its source has stopped being a port. So each host " +
                 "state names the murmur state it PRESENTS AS, murmur's six render as themselves, and " +
                 "STATE_INDEX 0-5 never moved. " +
                 "*** FOUR NUMBERS IN THAT TABLE ARE THIS TREE'S OWN AND ARE MARKED AS SUCH, *** which is " +
                 "the only such admission in the file: every other multiplier is transcribed from murmur's " +
                 "src/state.ts, and murmur has six states and no opinion about these two. " +
                 "FOURTEEN SABOTAGES, THIRTEEN CAUGHT ON THE FIRST PASS. The one that walked is the " +
                 "instructive one: removing `stream: true` from ev.html's request body leaves the bridge " +
                 "still able to stage, the widget still listening, and the whole battery green while the " +
                 "orb behaves exactly as it did before the round -- the opt-in that makes the change safe " +
                 "is also where it can be silently switched off. AND THE FIRST FIX FOR IT WAS ITSELF A " +
                 "PROXY: /stream: true/ over the file matched TextDecoder's decode(value, { stream: true }) " +
                 "on the next screen of the same function, and stayed green under the very sabotage it was " +
                 "written for. It reads the fetch's BODY now. " +
                 "*** TWO OF THE FOUR RESERVED NAMES ARE STILL RESERVED AND A ROW GUARDS THEM: *** " +
                 "connecting and shaping have nothing observable in this engine to attach to, and section 5 " +
                 "goes red the day either appears in the table.",
    }),
    // v4669 -- THE 349th CLOSING: the last three items of the port's backlog, and two were not what the
    // record said they were.
    since348: Object.freeze({
        at: "v4669", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/murmurPortTail-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green in 1,406 ms, 8 rows in four sections over two renders. THE BACKLOG IS EMPTY: every " +
                 "one of kit.ts's 41 functions is ported and no recorded murmur item is outstanding. " +
                 "*** TWO OF THE THREE WERE NOT WHAT nextRounds SAID. *** (1) tempest's bolt slots were " +
                 "recorded as 'missing murmur's `small` mix'. They were not: this shader compiles for ONE " +
                 "badge size and says so where the size dial is declared -- 'mh_small is a function of the " +
                 "frame size and the pixel scale, both of which this file compiles for rather than varies' " +
                 "-- so small is 0, murmur's mix(2.9, 5.2, small) evaluates to 2.9, and 2.9 is what the " +
                 "table always held. What was missing was the OTHER END: 5.2 and 7.4 were nowhere in the " +
                 "tree. Recording them and folding through the kit's own mhSmall carries all four of " +
                 "murmur's numbers and moves not one byte -- the fold is exact, since multiplying the gap " +
                 "by a small of exactly 0 returns the big end to the bit. A `size` uniform was considered " +
                 "and REJECTED: it would have to make KIT_AA and droplet's tremGate live too and would " +
                 "move nothing at the default, which is a mechanism added for its own sake. " +
                 "(2) prism's hue question, open since v4661, is answered by two adjacent lines of " +
                 "prism.ts -- beams carries (1 + pulse) and hueW does not -- in favour of what already " +
                 "shipped. The row that pins it asserts the NEGATIVE, because the positives would stay " +
                 "green through exactly the tidying that would break it. " +
                 "(3) mh_out was a real absence and is the last of the 41. " +
                 "*** THE ROUND'S OWN WORST DEFECT WAS IN ITS OWN GATE AND THE SABOTAGE PASS FOUND IT. *** " +
                 "The first cut of section 4 reconstructed the undithered byte as round(b - ditherAt(x,y)) " +
                 "and reported how often that differed -- a statement about ditherAt and about NOTHING " +
                 "ELSE. Making the shader's dither uniform, or twice as large, or one-sided changed the " +
                 "picture and did not move that row by a single count. It is a regression now: the render's " +
                 "discrete Laplacian against the model's, which kills any locally linear field and leaves " +
                 "the noise, and the SLOPE is the statistic because everything else in that Laplacian is " +
                 "uncorrelated with the model and so widens the scatter without biasing the answer. It " +
                 "reads 1.0082 +/- 0.0534 against a predicted 1; a doubled dither reads 1.62 and a " +
                 "one-sided one 0.20. " +
                 "*** AND BUILDING A REAL INSTRUMENT FOUND A REAL BUG IN WHAT THIS ROUND HAD ALREADY " +
                 "SHIPPED. *** TSL's screenCoordinate is the fragment CENTRE, and the frame helper's " +
                 "ditherAt hashed the integer index. Measured, that recovers 0.690 of the amplitude -- it " +
                 "removes two thirds of the dither and injects a third of a new one. The y-flip was checked " +
                 "at the same time and is NOT present (-0.019 +/- 0.055, consistent with zero), which " +
                 "mattered because three's uv() has v at the bottom and the readback is top-down. " +
                 "FOURTEEN SABOTAGES, NINE CAUGHT ON THE FIRST PASS; all five that walked were the dither " +
                 "ones and all five walked through that same self-referential row. " +
                 "*** AND THE DITHER MOVED TWO SPECIES GATES THE HOUR IT LANDED, NEITHER OF WHICH WAS " +
                 "WRONG ABOUT ITS SPECIES. *** murmurSpecies13 counted chorus's voices as strict local " +
                 "maxima over four neighbours -- a pixel that got +1 beside neighbours that got -1 IS one. " +
                 "murmurSpecies12 located duet's two bodies by argmax, and its far body is dim and broad " +
                 "enough that one code value moved the reading 2 px and the ratio from x1.67 to x1.35 " +
                 "against a bound of 1.40. The frame helper removes the dither exactly before any " +
                 "measurement, which fixed the first; the second needed a real estimator, and the far " +
                 "body's position is the light-weighted centroid of everything beyond a cut from the near " +
                 "body's centre -- x1.61 with the dither and x1.61 without, and x1.61/x1.65 at cuts of 6 " +
                 "and 7. NEITHER BOUND WAS WIDENED.",
    }),
    // v4668 -- THE 348th CLOSING: the drive-squared integral, and a gate that had not parsed for two rounds.
    //
    // *** THIS ROUND WAS WRITTEN AS v4665 AND RENUMBERED FORWARD AT THE FETCH, which is the rule this tree
    // already has rather than a new one. *** main shipped v4650-v4667 from the code-review line while this
    // branch was on v4664, and e90cd84 is already called v4665. The changelog's own note on v4333-v4335 says
    // why reuse is not an option: two builds wearing one number with different bytes is what jams the peer
    // auto-update fleet-wide. main's highest is v4667, so this is v4668. NOTHING ELSE ABOUT THE ROUND MOVED.
    since347: Object.freeze({
        at: "v4668", swept: 2, green: 2, red: 0,
        added: Object.freeze(["tools/ship/murmurSpMix-selfcheck.mjs", "tools/ship/gateParses-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "both green on this box -- murmurSpMix in 2,183 ms with 9 rows over seven sections and two " +
                 "render launches, gateParses in 1,101 ms compiling 1,776 gate files and 380 helpers. " +
                 "*** THE ROUND'S SUBJECT: *** three of murmur's clocks are a MIX of two arms that both " +
                 "carry the species' speed factor sp = (1 + q*pace + s*drive), mixed by st.drive*0.70 -- " +
                 "geode's spin and fathom's second and third shells. A mix of two rates is ONE rate, " +
                 "A + B*drive, and sp makes it quadratic, so the exact phase needs the integral of drive " +
                 "SQUARED. v4663 recorded that expansion rather than approximating it; one host accumulator " +
                 "closed all three. MEASURED: DD is off (driveInt^2)/t by up to 44.2% across the ramp and " +
                 "DD/driveInt varies 5.67x, so it is neither the square of an integral this host had nor a " +
                 "multiple of one. " +
                 "*** AND THE MISSING CROSS TERMS WERE THE SMALLER HALF. *** fathom's a1 and a2 were plain " +
                 "mh_drift at murmur's bare rates -- no sp, no mix, no drive at all -- so the nest never " +
                 "closed up under RESPONDING. At a held pace of 0.30 murmur runs a1 at -0.077810 rad/s at " +
                 "rest and +0.096320 at full drive: THE SHELL REVERSES, because it is being pulled onto the " +
                 "first shell's turn and the first shell turns the other way. This port ran it at a flat " +
                 "-0.062 -- the wrong direction at full drive, at 64% of the right speed. geode had the mix " +
                 "since v4662 and no sp, which left it the LAST builder in the roster with no cadence and " +
                 "its stone spinning at 44.6% of murmur's under drive (0.2364 against 0.529536 rad/s). " +
                 "*** AND A SECOND geode SITE NOBODY HAD LOOKED FOR: *** ax = mix(0.34 + 0.22*sin(t*0.041), " +
                 "0.30, st.drive*0.7) -- the stone stops NODDING as well as wobbling, its swing falling " +
                 "0.220 -> 0.066 rad. v4664's st.drive audit passed that site because it counts " +
                 "COEFFICIENTS and 0.70 was already in the table for the spin, which is exactly the " +
                 "weakness that audit states about itself. " +
                 "*** THE ROUND'S LARGEST FINDING IS NOT ABOUT murmur AT ALL: *** " +
                 "tools/ship/murmurDrive-selfcheck.mjs HAS NOT PARSED SINCE v4663. That round dropped a " +
                 "' + ' between two template literals inside a 900-character prose string and raised a " +
                 "count in the same row from 2 to 3 for the site it had just wired. Neither change was ever " +
                 "evaluated. v4663 and v4664 both shipped over it. Repaired and re-run, the instrument it " +
                 "had read 2 -- the same 2 it read before v4663 touched it -- because a token match cannot " +
                 "see a drive that arrives through a local, and fathom's sp is one. It resolves one level " +
                 "through the nearest preceding declaration now, names the local and the builder each of " +
                 "its EIGHT sites resolves through, and its containment test for the drive integral is a " +
                 "balanced-paren walk rather than a closing bracket. tools/ship/gateParses-selfcheck.mjs " +
                 "exists so the class cannot repeat: a parse is the cheapest possible proof that a check is " +
                 "still a check, and 1,776 files cost 792 ms. " +
                 "TWENTY-SEVEN SABOTAGES, TWENTY-ONE CAUGHT ON THE FIRST PASS. The six that walked: " +
                 "deleting the mix of the two WOBBLE halves (every pixel row holds drive fixed or holds the " +
                 "integrals fixed, and the wobble moves with neither); deleting driveSqInt from the host's " +
                 "returned params (caught, but as a CRASH on .toFixed rather than a red row -- a worse " +
                 "diagnosis, and the row reads the field defensively now); making the shared frame helper " +
                 "send drive*time for the square (no row pinned the helper's own value, which is v4654's " +
                 "impossible-history trap one signal further on); removing the property-strip from " +
                 "murmurDrive's resolver AND making it resolve file-wide instead of nearest-preceding (the " +
                 "COUNT stayed 8 under both, so only naming the local and the BUILDER each site resolves " +
                 "through catches them); and deleting driveSqInt from murmurClock3's integral pattern, which " +
                 "is the sharpest of the six -- a census that narrows its own pattern narrows BOTH sides of " +
                 "its equality and stays green, 54 of 55 becoming 52 of 53. That list is read from " +
                 "render/aiPresenceOrbState.mjs's own getParams() return now, so the HOST decides which " +
                 "integrals exist and an eighth accumulator reddens the row on the day it is added. " +
                 "*** AND ONE CORRECT CHANGE EXPOSED A CONFOUNDED INSTRUMENT. *** murmurSpecies6's layers " +
                 "row predicts the ridge ratio as (base+rk)/base and read it 1.0% off at v4664 and 3.8% off " +
                 "at v4668 -- because the ridge sits at R*(1 + (foldAmp/R0)*foldOf(dir)) and R0 is shell " +
                 "0's radius, which layers moves the OTHER way, so the fold does not cancel between the " +
                 "pair. Its 2% tolerance was a property of where the fold phase happened to be at t = 11 s " +
                 "with the wrong shell rates. It reads the mean of three times spread across the fold's own " +
                 "period now, and asserts the spread (0.0475) under the 0.10 margin it identifies the " +
                 "shells by. The bound was NOT widened.",
    }),
    // v4664 -- THE 347th CLOSING: RESPONDING's THIRD thing. v4653 ported the heading and the narrowing;
    // read against murmur's own sources, st.drive does one more thing at eight sites and it is FORMATION.
    since346: Object.freeze({
        at: "v4664", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/murmurFormation-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green in 2,032 ms on this box, 11 rows in six sections over three rendered species. " +
                 "*** THE ROUND STARTED AS AN AUDIT AND THE AUDIT IS THE FINDING. *** Keith asked whether " +
                 "the port was complete. With the upstream cloned at v4663 that is answerable by " +
                 "measurement rather than from this tree's notes: counted against murmur's eighteen " +
                 "sources, st.drive has seven sites this port simply did not have, across six species. " +
                 "*** AND THEY ARE ALL ONE IDEA. *** aura: \"responding pulls the tilts halfway toward a " +
                 "common one ... make them travel together and faster, IN FORMATION\". opal: \"Responding " +
                 "brightens them in sequence along the procession axis\" and \"under drive they all lean " +
                 "the same way: a procession, not a swarm\". chorus: the lean pushes the sync knob at 0.85, " +
                 "LARGER than the flash's 0.55 that v4661 took alone. flux: \"responding stills the turn " +
                 "and leans it\". Plus three brightnesses -- arc's shimmer, flux's and prism's gains. " +
                 "v4653 ported the HEADING and the NARROWING and stopped; the third thing is what the " +
                 "other eight sites are. " +
                 "*** TWO SPECIES DID NOT RESPOND TO RESPONDING AT ALL: *** chorus and flux each moved 0 of " +
                 "9,216 bytes between drive 0 and drive 1 -- measured on a worktree of v4663 -- because " +
                 "neither had any other st.drive site. They move 16.6% and 19.1% now. " +
                 "*** AND aura's ROLLS ARE EXEMPT, WHICH aura.ts STATES IN THE SAME BREATH AS THE RULE: *** " +
                 "\"The rolls -- which are what keeps the sheets in visibly different planes -- do not " +
                 "align at all.\" Measured: at full drive the yaw spread closes 4.5640 -> 2.2820 and the " +
                 "tilt 1.3691 -> 0.6846, EXACTLY half in both, while the roll spread is 3.4274 either way " +
                 "to the bit. Three sheets agreeing on all three angles are one sheet drawn three times. " +
                 "FOURTEEN SABOTAGES, TWELVE CAUGHT ON THE FIRST PASS. The two that walked were flux's " +
                 "turn mix and opal's common lean, and both walked for the same reason: section 3 asks " +
                 "whether a species MOVES under the lean, and flux still did through its brightness gain " +
                 "while opal has no pixel row at all. \"It moves\" is not \"it stills\". Both have rows now. " +
                 "*** AND ONE OF THOSE ROWS WAS SELF-REFERENTIAL ON ITS FIRST CUT: *** it asserted flux's " +
                 "measured swing ratio equalled one minus the TABLE'S OWN weight, which is true for every " +
                 "weight including zero -- so deleting the mix set both sides to 1 and the row passed. The " +
                 "bound is murmur's 0.40 written out now, with the identity asserted beside it. " +
                 "AND THE ARC'S OWN PROXY NARROWED A THIRD TIME: murmurClock3's \"no signal times elapsed " +
                 "time\" rule flagged opal's procession, whose uniforms.time is multiplied by a CONSTANT " +
                 "angular frequency inside a sine while the signal on that line is the mix weight. It " +
                 "reads the MULTIPLICAND now instead of the line -- v4657 found it firing on limn, v4662 " +
                 "on two swell lines, v4664 on this. A line is the wrong unit for that question and it " +
                 "took three correct sites to say so.",
    }),
    // v4663 -- THE 346th CLOSING: the cadence, in four of the five builders that had none -- and tempest's
    // core signal, which was the wrong signal entirely for as long as this port has had a tempest.
    since345: Object.freeze({
        at: "v4663", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/murmurCadence-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green in 2,714 ms on this box, 12 rows in six sections over four rendered species. " +
                 "*** THE ROUND WENT AND READ murmur. *** Every previous round of this arc transcribed from " +
                 "this tree's own recorded notes, which carry the coefficients for the sites earlier rounds " +
                 "had read. For these five builders the record held the per-species COUNTS and no " +
                 "coefficients at all, so the choice was to invent seven numbers or fetch the source. " +
                 "krispuckett/murmur-web is public and MIT and it is this port's upstream; it was cloned " +
                 "and the seven sites read off it. IT ALSO CONFIRMED v4662's opal COEFFICIENTS EXACTLY, " +
                 "which is the first independent check this arc's recorded numbers have had. " +
                 "*** AND IT SHOWED THE PORT HAD tempest's CORE SIGNAL WRONG. *** tempest.ts: energy = " +
                 "clamp(0.85*live.pace + 0.65*think + 0.55*st.drive, 0, 1.6), with `think` read DIRECTLY " +
                 "off the state index because \"THINKING IS THIS SPECIES' HOME STATE ... a storm that rises " +
                 "while the assistant thinks is the whole concept\". This port spelled clamp(0.85*voice, 0, " +
                 "1.6): the coefficient right, the INPUT wrong. MEASURED, between IDLE and THINKING on a " +
                 "worktree of v4662: tempest moved 0 of 9,216 bytes. Its home state reached no pixel of it. " +
                 "It now moves 21.5%, worst channel 221. " +
                 "energy is four sites -- fold, drift, both bolt slot divisors, flicker -- so all four had " +
                 "been driven by the microphone. The repair needs a FOURTH host accumulator, thinkInt, " +
                 "because the drift and the slots are secular; the fold and the flicker are amplitudes and " +
                 "read the signal itself, which is v4654's split applied to a new signal. " +
                 "THE OTHER FOUR SITES: droplet's tremor (0.012 * live.pace * tremGate -- THE THIRD " +
                 "MECHANISM THIS KIT HAS CARRIED WITH EVERY CALL SITE PASSING ZERO, after mhDeform's flow " +
                 "at v4653 and mh_live's conditioning at v4641), nebula's fold and drift, and fathom's " +
                 "speed factor. In pixels, on identical frames: nebula 0.0% -> 19.7%, tempest 0.0% -> " +
                 "21.4%, fathom 0.0% -> 17.2%, droplet 0.0% -> 7.0%. " +
                 "*** AND ONE v4662 DEFECT THE SOURCE CONTRADICTED: *** both clouds spell their warp lookup " +
                 "with HALF the advection and their density lookup with all of it; v4662 wired both at " +
                 "full, and the advection's own gate could not tell because it measures that the field " +
                 "moves and the body does not, which is true either way. " +
                 "FIFTEEN SABOTAGES, ELEVEN CAUGHT ON THE FIRST PASS AND FOUR ONLY AFTER ROWS WERE ADDED " +
                 "FOR THEM: widening the THINK window to catch RESPONDING as well (every row asks whether " +
                 "the term moves, none asked WHEN); putting fathom's sp on its two MIX shells, which is one " +
                 "character and makes fathom answer the cadence MORE and wrongly at every partial drive; " +
                 "zeroing the host's thinkInt accumulation, which left the gate green because its frames " +
                 "set the uniform directly; and the warp's half. " +
                 "*** AND THE ROUND COMMITTED THIS ARC'S OWN DEFECT ON ITS WAY THROUGH: *** it built an " +
                 "`energyInt` node, needed it nowhere, and left it as dead code -- a mechanism nobody " +
                 "invokes, in the round whose subject is mechanisms nobody invokes. v4662's integral census " +
                 "counted three reads outside a phase call instead of one and named it. " +
                 "SIX ROWS IN THREE OTHER GATES WENT RED AND EACH WAS RESTATED RATHER THAN BUDGETED: " +
                 "murmurClock2's and murmurGesture's tempest POSITIVE and NEGATIVE swapped places, because " +
                 "the signal the species answered and the signal it was deaf to were exactly the wrong way " +
                 "round; murmurClock2's clamp proof was a correct proof about an expression that should not " +
                 "have existed, which is the most expensive kind of green row there is; and murmurLive's " +
                 "cadence census NARROWED to the instantaneous readers it can answer exactly, because " +
                 "widening it would have put a second copy of murmurCadence's census in a second file.",
    }),
    // v4662 -- THE 345th CLOSING: the last three places a moving signal multiplies elapsed time -- and a
    // FOURTH that four rounds of censuses had missed, found by this round's own new rule on its first run.
    since344: Object.freeze({
        at: "v4662", swept: 2, green: 2, red: 0,
        added: Object.freeze(["tools/ship/murmurClock3-selfcheck.mjs", "tools/ship/murmurClock4-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green in 147 ms and 2,837 ms on this box, 13 rows over two files. THE SPLIT IS BY " +
                 "INSTRUMENT AND THE CLOCK IS WHY: one file held the arithmetic and the pixels and measured " +
                 "3,605 ms against a 3,000 ms ceiling once sol's frames joined it. " +
                 "*** THE CLOCK ARC THAT BEGAN AT v4654 IS CLOSED. *** Its last three sites were ABSENCES " +
                 "rather than teleports -- murmur's rate moves at each and this port's did not move at all " +
                 "-- so no census of moving rates could ever have found them, and all three came out of " +
                 "reading the species' own source against this file. opal's flash drift took murmur's " +
                 "(1 + 0.75*live.pace + 0.95*st.drive); geode's spin took the mix(mh_drift, t*0.30*sp, " +
                 "0.70*st.drive) it had carried only one arm of; and nebula's and tempest's ADVECTION was " +
                 "wired, the last two `wired: false` entries in MH_DRIVE_HEADING, nine rounds after v4653 " +
                 "set a census row to go red the day anybody did. It fired, and the answer is that the jump " +
                 "is not being shipped: k * driveInt, not k * drive * t. " +
                 "*** AND THE ROUND'S OWN NEW RULE FOUND A FOURTH SITE THAT WAS LIVE. *** Section 5 of " +
                 "Clock3 asks for a signal multiplied by uniforms.time ANYWHERE, rather than inside a " +
                 "particular function's arguments, and on its first run it flagged sol's granulation: " +
                 "uniforms.time * (0.35 + 0.75*live.pace), a bare product inside a noise lookup. Every " +
                 "census from v4654 to v4657 inspected mh_drift call sites and this is not one, so four " +
                 "rounds printed clean results, correctly. MEASURED, entering RESPONDING after half an " +
                 "hour: 270.0 units of noise space in ONE 1/60 s frame against 0.0121 integrated -- " +
                 "22,346x, and granScale is 8.5, so thirty-two body radii crossed between two frames. The " +
                 "largest single jump this arc has found. " +
                 "IN PIXELS: opal, geode, nebula and tempest each moved 0 of 9,216 bytes between drive 0 " +
                 "and drive 1 -- the whole of murmur's RESPONDING lean -- and now move 22.0%, 10.6%, 20.4% " +
                 "and 21.7%. " +
                 "FOURTEEN SABOTAGES, ALL CAUGHT, ONE ONLY AFTER A ROW WAS ADDED FOR IT: putting the " +
                 "advection on mhInside as well as on the noise lookups -- moving the BODY instead of the " +
                 "field -- went through the whole battery green, on a claim the kit note made in words and " +
                 "nothing measured. Clock4 now reads nebula's lit set at driveInt 0 and 14: 740 pixels, " +
                 "same centroid to nine decimals, same outer radius, while 20.9% of the interior moves. " +
                 "*** AND THE ROUND NEARLY SHIPPED A GAP THAT WAS NOT THERE. *** It measured sol's " +
                 "granulation with a byte count, read 0.0% and worst 1 of 255 at 48 px and at 128 px, ruled " +
                 "out the moire gate, and was one edit from recording \"it cannot be seen at all\". " +
                 "tools/ship/murmurSpecies9-selfcheck.mjs had been measuring it all along with a TEXTURE " +
                 "statistic -- x1.488 on the simmer knob -- because a zero-mean noise on a bright disc " +
                 "moves almost no bytes and a great deal of texture. The absence was the instrument's. The " +
                 "pace-integral row went into that gate, where the instrument that can see it already was.",
    }),
    // v4661 -- THE 344th CLOSING: the last nine st.complete sites, which finishes that signal's port -- and
    // the second consecutive round in which finishing something broke a gate that rested on it being unfinished.
    since343: Object.freeze({
        at: "v4661", swept: 2, green: 2, red: 0,
        added: Object.freeze(["tools/ship/murmurSingles-selfcheck.mjs", "tools/ship/murmurSingles2-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green in 2,539 ms and 2,490 ms on this box, 13 rows in eight sections over six rendered " +
                 "species between them. TWO FILES FOR NINE CONSTANTS AND THE SPLIT IS THE CLOCK'S: seven " +
                 "species is seven WGSL compiles and four measure 2,539 ms against a 3,000 ms ceiling. " +
                 "*** st.complete IS FULLY PORTED AS OF THIS ROUND -- all 47 of murmur's sites -- and every " +
                 "species in the roster now flashes. *** The nine are still's glint 0.85, comet's head 2.20, " +
                 "droplet's core 0.26, limn's ring 1.20 AND its interior hint 0.90, duet's flare 1.15 AND " +
                 "its shrink 0.62, chorus's sync 0.55 and prism's beams 1.10: nine numbers across SEVEN " +
                 "species, because limn and duet carry two each. v4660's own record said eight and is " +
                 "corrected in place. " +
                 "*** FOUR OF THE NINE ARE NOT THE FAMILY'S (1 + k * complete) SHAPE, WHICH IS WHY THE TABLE " +
                 "IS KEYED BY SITE AND NOT BY SPECIES: *** droplet's ADDS to a brightness beside the voice " +
                 "and the settle, limn's ring ADDS gated by the band so the flash lands on the arc and " +
                 "nowhere else, chorus's ADDS to the SYNC KNOB -- the only site in eighteen species where " +
                 "complete moves a parameter rather than an intensity, and chorus.ts says alignment IS the " +
                 "species -- and duet's SUBTRACTS, the only subtraction anywhere in the roster, on the " +
                 "separation duet.ts names four terms on in one line. " +
                 "MEASURED: comet x1.14 -> x1.88 of interior light at its own complete peak, droplet x2.11 " +
                 "-> x2.25, limn x3.74 -> x6.85 (the largest in the roster, and it still puts 0 counts of " +
                 "light outside its silhouette), prism x2.08 -> x4.73. duet's radius of gyration falls " +
                 "0.3781 -> 0.2767 as its separation goes to 38% -- past its own shell travelling outward " +
                 "over the same window, so the fall is a lower bound. chorus's flash takes its sync to 0.925 " +
                 "against a KNOB CEILING of 0.750, and 0.375 of sync is worth 17.9% of its bytes. " +
                 "*** AND THE ROUND FOUND A FRAME IN WHICH ITS OWN SUBJECT DID NOT EXIST. *** still's glint " +
                 "fires once per slot of about 10.55 s, and every species gate in this tree renders at " +
                 "t = 7.0 s, where still's gesture envelope is EXACTLY ZERO -- so wiring the 0.85 moved 0 " +
                 "bytes and read as a dead term. The gate solves its own frame times off the kit's clock " +
                 "now: x4.470 with the glint running against x3.191 without it, at the same tau. " +
                 "SEVENTEEN SABOTAGES, ALL CAUGHT, ACROSS THREE GATES -- the nine constants one at a time, " +
                 "the shrink spelled as a growth, chorus's term moved outside its clamp, limn's ring scaled " +
                 "instead of band-gated, prism's gain moved off brightP so the hue is left behind, duet's " +
                 "flare folded into the balance, still's term lifted outside its gesture's select, a tenth " +
                 "table entry with no shape recorded for it, and geode given a sweep. " +
                 "*** AND TWO OF THIS ROUND'S OWN ROWS WERE WRONG BEFORE THEY SHIPPED: *** one asserted " +
                 "limn's added light sits FURTHER OUT than limn's own, on the reasoning that a band-gated " +
                 "term lands on the edge -- it reads 0.5048 against 0.5174, because limn has THREE complete " +
                 "sites and two of them are interiors, so the sum cannot weigh the gated one. That gating is " +
                 "graded in the arithmetic instead, where it is exact, and the pixel gap is stated. The " +
                 "other indexed two frames by counting back from the end of a list that had grown, and " +
                 "reported the isolated settle as x1.000 because it was comparing two THINKING frames.",
    }),
    // v4660 -- THE 343rd CLOSING: the other four ignition figures, which really were four shapes -- and the
    // control species another gate had been resting on for fifteen rounds without ever checking it.
    since342: Object.freeze({
        at: "v4660", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/murmurIgniteFour-selfcheck.mjs"]),
        // EMPTY, AND THE FIRST DRAFT PUT tools/ship/murmurIgnite-selfcheck.mjs HERE. It is not an arrival:
        // it shipped at v4644 and this round turned it red by taking its control species away. Naming it
        // here put a gate in the ledger twice -- closingCoverage-selfcheck read 388 names over 387 distinct
        // and went red on the duplicate, because one duplicate buys one credit and one credit hides one
        // future unswept gate. The repair belongs in the verdict, which is where it is.
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green in 2,690 ms on this box, 9 rows in five sections over four rendered species, plus a " +
                 "new section 17 and a new probe mode (igniteRound) in tools/ship/murmurKit-selfcheck.mjs, " +
                 "which goes 2,260 -> 2,285 ms for it. " +
                 "*** THE OTHER FOUR FIGURES ARE FOUR SHAPES AND NOT A FIFTH TABLE ENTRY. *** aura's is a " +
                 "von MISES on the angle -- the only figure in the roster that spends sweep going ROUND " +
                 "something -- fathom's is a triangular window per shell so the nest lights innermost " +
                 "first, geode's is a flat lift with no sweep in it at all, and comet's adds NO LIGHT: it " +
                 "lengthens the trail, decay = mix(decay, 9.0, sweep), and decay is in the denominator. " +
                 "*** fathom AND geode WERE STILL NOT FLASHING AT ALL: *** both moved 0.0% of their bytes " +
                 "and x1.000 of interior light at the peak of their own SUCCESS state. They now read x4.03 " +
                 "and x4.90; aura goes x2.45 -> x3.59 and comet x1.00 -> x1.14, which is small BECAUSE its " +
                 "flash adds no light. comet's decay also took murmur's drive and small factors, which this " +
                 "port never had. " +
                 "*** AND WIRING geode's FIGURE TURNED ANOTHER GATE RED, WHICH IS THE ROUND'S REAL FINDING. " +
                 "*** tools/ship/murmurIgnite-selfcheck.mjs is built around a PAIR -- one species that " +
                 "flashes and one whose SUCCESS is a settle and NOTHING else -- and geode had been the " +
                 "second since v4644 on the strength of a sentence nothing ever checked. Giving geode an " +
                 "ignition made its SUCCESS rise and fall, and three settle rows went red about a settle " +
                 "when the defect was in the control. The control is comet now, which after this round is " +
                 "the LAST species with no complete term anywhere, and that gate's new section 4 measures " +
                 "that property over the whole roster -- reading the builder DISPATCH, because nebula and " +
                 "tempest share buildMist and a name match reports both unflashed. The first cut of that " +
                 "census read 16 entries for 18 species and its own size assertion said so. " +
                 "*** A GAIN CAME OUT OF THE REPAIR: *** comet's sweep saturates at tau 0.95 and it has no " +
                 "complete, so frames at tau 0.95 and 1.40 differ in `settled` and in nothing else -- the " +
                 "first isolated settle in pixels this tree has had. It reads x1.278 with its centroid " +
                 "moving 0.0011. " +
                 "SIXTEEN SABOTAGES ACROSS THREE GATES, ALL CAUGHT -- including two aimed at the repair " +
                 "itself: giving comet a complete term reddens the control census BY NAME, and stretching " +
                 "mh_state's sweep so it no longer saturates before tau 1.40 reddens the isolated-settle " +
                 "row, whose whole claim is that those two frames differ in one signal. FOUR OF THEM NAMED " +
                 "THE WRONG ROW at first: the geode " +
                 "census carried its own control as a conjunct, so unwiring fathom or comet reddened a row " +
                 "titled for geode. The control is its own row now. " +
                 "AND TWO OF THIS ROUND'S OWN ROWS WERE WRONG BEFORE THEY SHIPPED: one asserted aura's lap " +
                 "is EXACTLY equal at -pi and +pi and measured 4.44e-16, which is two ulp of the 2*pi that " +
                 "binary cannot hold, not a seam; and one mapped five sweeps through an arrow that never " +
                 "read its argument, then asserted the five results were equal -- a row that could not " +
                 "fail, under a title claiming a sweep had been tried. Both replaced by measurements: the " +
                 "gaussian in the lap's place tears by 0.80 at the same join, and geode's WHOLE builder is " +
                 "counted for the word SWEEP with the other three as the control.",
    }),
    // v4659 -- THE 342nd CLOSING: four figures that turned out to be one shape, and the two species that
    // were STILL not flashing after the round before.
    since341: Object.freeze({
        at: "v4659", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/murmurIgniteAxis-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green in 2,621 ms on this box, 8 rows in four sections over four rendered species, plus a " +
                 "new section 16 and a new probe mode in tools/ship/murmurKit-selfcheck.mjs. " +
                 "*** MH_IGNITE's OWN NOTE CALLED THE REMAINING EIGHT FIGURES \"per-species transcriptions " +
                 "rather than this one shape\". FOUR OF THEM ARE ONE SHAPE. *** r = (coord - mix(lo, hi, " +
                 "st.sweep)) / width, figure += st.complete * (flat + gain * exp(-r*r)) -- arc along the " +
                 "angle round its arc, flux along the length of its stream, prism along the distance out its " +
                 "beams, helix along the height of its strands. The SHELL's coordinate is |p| for all seven " +
                 "species that run it; these four are four different quantities, which is why it is a second " +
                 "table and not four more rows in the first. " +
                 "*** AND EACH IS THAT SPECIES' OWN GESTURE FIGURE, RUN ON sweep AND DRAWN TIGHTER: *** arc " +
                 "0.34 against 0.30, flux 0.42 against 0.38, prism 0.28 against 0.26. The success is the " +
                 "thing the species already does, once, travelling the whole length. " +
                 "*** prism AND helix WERE STILL NOT FLASHING AT ALL AFTER v4658: *** both moved 0.0% of " +
                 "their bytes and x1.000 of interior light at the peak of their own SUCCESS state, because " +
                 "neither has an interior factor and this figure IS their whole flash. They now read x2.08 " +
                 "and x2.93; arc goes x1.81 -> x2.18 and flux x4.33 -> x5.92 on top of what v4658 gave them. " +
                 "*** WHERE THE FRONT TRAVELS IS GRADED IN THE KIT AND THE REASON IS MEASURED: *** isolating " +
                 "sweep in a rendered frame needs two taus with equal complete and different sweep, and " +
                 "mh_state's settled turns on at EXACTLY the complete peak (tau 0.3600) -- searched, and " +
                 "there is no such pair. So a new probe mode grades the front against the CPU twin on a real " +
                 "GPU at 0/255 over three different axes, and its peak sits at mix(lo, hi, sweep) to 0.0010 " +
                 "of the axis at every sweep. " +
                 "THIRTEEN SABOTAGES, ALL CAUGHT, ONE ONLY AFTER REPAIR: moving helix's FLAT term outside " +
                 "the complete multiply -- which would lift every strand in every state -- read identically " +
                 "on the probe's alpha channel, because that channel ran FLUX's constants and flux has no " +
                 "flat term. It runs helix's now. " +
                 "AND THE ROUND's OWN BASELINE LIED ONCE: the neutralisation that measures what the port did " +
                 "BEFORE a change is a regex over the table, and prism's entry has two spaces after `lo:` " +
                 "where the others have one -- so prism was never neutralised and its \"before\" reading was " +
                 "the wired version, which read as though the change did nothing. The script asserts the " +
                 "count of entries it neutralised now.",
    }),
    // v4658 -- THE 341st CLOSING: the half of the SUCCESS flash that is not the shell, and the six species
    // that reached the peak of their own success state without moving a byte.
    since340: Object.freeze({
        at: "v4658", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/murmurComplete-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green in 2,969 ms on this box, 11 rows in four sections over four rendered species. " +
                 "*** kit.ts: \"The light in a success is NOT an overlay: every species multiplies its own " +
                 "interior energy by (1 + complete), which brightens exactly what is already there and " +
                 "leaves the dark dark.\" v4644 PORTED THE SHELL AND NOT THAT SENTENCE. *** Measured on real " +
                 "pixels at stateTau 0.360, where mh_state's complete is exactly 1.0 and settled exactly 0: " +
                 "limn, arc, aura, flux, sol and chorus each moved 0 of 9,216 bytes between the start of " +
                 "their own SUCCESS state and its brightest instant. The flash was computed, sent to the " +
                 "shader as a uniform, and spent by nobody. " +
                 "AFTER: limn x3.74 of interior light, flux x4.33, chorus x3.88, sol x2.22 -- all four read " +
                 "x1.000 at HEAD on the same frames. " +
                 "*** THE FOUR ON THE SHARED INTERIOR LINE ARE FOUND BY A RULE AND NOT BY A LIST: *** every " +
                 "one of murmur's eighteen species ends its interior with (1 + S * st.settled), and exactly " +
                 "four of those eighteen lines also carry a complete factor -- limn 1.60, arc 0.90, aura " +
                 "0.45, flux 0.75. A site belongs in MH_COMPLETE_INTERIOR if and only if its complete factor " +
                 "sits on the same source line as its settled factor, which a census can check. The table is " +
                 "a strict SUBSET of MH_SETTLED_INTERIOR and the gate asserts that. " +
                 "*** AND THREE SPECIES SATURATE WHERE FOUR SCALE, WHICH IS THE OPPOSITE OPERATION. *** " +
                 "opal's flashes, sol's prominences and chorus's voices are pulled toward a target -- " +
                 "mix(life, target, complete * k) -- so the differences between them CLOSE: two figures " +
                 "4.00x apart come out 1.09x apart, where a gain leaves the ratio at exactly 4.00. chorus " +
                 "alone overshoots, toward 1 + 0.45*complete, because its subject is an ensemble arriving " +
                 "together and going past full is how that reads as louder than its parts. " +
                 "THIRTEEN SABOTAGES, ALL CAUGHT, THREE ONLY AFTER REPAIR. *** A PIXEL ROW ABOUT THE DARK " +
                 "STAYING DARK WAS WRITTEN AND DELETED: *** it read a worst rise of 0.0 counts on all four " +
                 "species and the population it read that from was ZERO -- every pixel at or below 6 of 255 " +
                 "was OUTSIDE the silhouette, and it would have passed forever while measuring the paper " +
                 "behind the orb. The claim is arithmetic and is graded as arithmetic. sol's 0.55 core gain " +
                 "was invisible because at the roster's default glow its disc is SATURATED (2.0937 against " +
                 "2.0916 across the flash, a ratio of 0.999); sol is rendered at glow 0.25 now, where the " +
                 "same core reads x2.56, and has its own row. And the shader twin of the saturation, " +
                 "rewritten as a GAIN, walked through every pixel row in the round -- because a gain " +
                 "brightens too -- until mh_complete_lift went into the kit probe's alpha channel on " +
                 "chorus's overshooting pair, which is where a saturation and a gain part company.",
    }),
    // v4657 -- THE 340th CLOSING: the two rates this tree recorded as out of reach, one of them because a
    // record said the host could not see a signal it had been keeping all along.
    since339: Object.freeze({
        at: "v4657", swept: 0, green: 0, red: 0,
        // NO NEW GATE FILE. The subject is two more clocks of a kind tools/ship/murmurClock-selfcheck.mjs
        // already owns, so the round added a section and four rows to it rather than a seventh murmur gate,
        // and paid for them by replacing a 438,000-tick settle with the closed form it computes (3,345 ms
        // to 3,042 on this box). A gate file per round is a habit, not a rule.
        added: Object.freeze([]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "no gate added; murmurClock-selfcheck.mjs green at 3,042 ms on this box against a " +
                 "murmurKit measuring 2,861 here and RECORDED at 2,035 -- a drift of 1.41, so about 2,160 " +
                 "recorded, up from 1,611 for six new rows and two more rendered species. " +
                 "*** THE RATE FAMILY IS FINISHED, AND THE LAST TWO WERE THE ONES THIS TREE HAD WRITTEN " +
                 "OFF. *** duet's rate was recorded in murmurClock-selfcheck.mjs for three rounds as " +
                 "structurally unreachable: \"its rate reads the species' OWN FLOURISH envelope, which is " +
                 "computed inside the shader from a hash and cannot be integrated by a host that has never " +
                 "seen it. A signal the host does not know has no integral to send.\" THE HOST DOES KNOW " +
                 "IT. mh_flourish is a pure function of shader time, a lane and a slot LENGTH, and duet's " +
                 "lane and slot are style constants out of MH_DUET -- so the envelope is a deterministic " +
                 "function of the very clock render/aiPresenceOrbState.mjs already integrates. The sentence " +
                 "was true of a signal the host does not know; duet's was never one of those, and it read " +
                 "as a property of the mechanism. " +
                 "MEASURED: duet's orbital phase advanced 1.8152 rad in ONE 1/60 s frame after half an hour " +
                 "-- 29% of a whole turn of the pair's shared orbit -- against a flat 0.006244, and the " +
                 "trigger was the species' own gesture rather than anything the user did. limn's, which " +
                 "v4654 priced correctly at two more accumulators, reached 68.3121 rad in a frame: nearly " +
                 "eleven whole turns. Both reduce to murmur's own expression at a held signal, limn's " +
                 "product to 3.6e-12 over 180 operating points. " +
                 "THREE NEW HOST INTEGRALS, and the cross ones are the interesting pair: the integral of " +
                 "pace*drive is NOT the product of the two integrals -- 8.20 against 68.35 after twenty " +
                 "seconds idle and six busy -- because a product of integrals carries t SQUARED. " +
                 "*** AND THREE INSTRUMENTS WERE REPAIRED, EACH OF WHICH HAD STOPPED MEANING WHAT IT " +
                 "SAID. *** murmurSpecies12 divided its fourteen orbit samples out of duet's BASE rate; " +
                 "with murmur's three modulated terms in, that covers 86% of a turn and every row still " +
                 "passed, saying \"across one full orbit\" about something that was not one -- the times " +
                 "are SOLVED from the phase now and the gate asserts its own coverage at 1.0004 turns. " +
                 "murmurDrive tested \"no line reads both DRIVE and uniforms.time\" as a proxy for \"no " +
                 "expression multiplies drive by elapsed time\", and fired on limn's flattening wobble -- a " +
                 "bounded amplitude, which is the arrangement the row exists to bless. murmurDrive2 bounded " +
                 "helix's contraction as `pct < 10 * limn.pct` with both numbers NEGATIVE, so limn moving " +
                 "more made helix's claim HARDER: a ratio of magnitudes now. " +
                 "FIFTEEN SABOTAGES, ALL CAUGHT, FOUR ONLY AFTER REPAIR: the gesture-integral row graded a " +
                 "sum this GATE kept beside the module's rather than the module's own, so accumulating " +
                 "against wall dt and reading the wrong lane both walked through; the frame helper deriving " +
                 "the cross terms as a product of integrals walked through everything; and nothing noticed " +
                 "duet's orbit samples silently covering less than they claimed.",
    }),
    // v4656 -- THE 339th CLOSING: the gesture clock, where a slot that changes length does not advance the
    // gesture, it replaces it.
    since338: Object.freeze({
        at: "v4656", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/murmurGesture-selfcheck.mjs"]),
        // EMPTY because the new gate arrived GREEN. murmurSpecies3 went red on this round's CHANGE, which is
        // a recorded bound moving under a repaired mechanism and not a gate arriving broken -- this field is
        // for the second. What happened to it is in the verdict, where it can be read rather than counted.
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green in 3,135 ms on this box against a murmurKit measuring 2,861 here and RECORDED at " +
                 "2,035 -- a drift of 1.41, so about 2,230 recorded. 12 rows in five sections over three " +
                 "species. *** mh_flourish's SLOT INDEX IS NOT A PHASE: every number in the gesture is a " +
                 "hash of floor(t / SLOT) -- where it starts, how long it lasts, and the per-gesture random " +
                 "its species spends as a DIRECTION. *** Three of murmur's species make the slot length a " +
                 "function of the live signals, and a divisor that moves makes that index JUMP, which " +
                 "re-rolls every hash at once. The bolt in the air becomes a different bolt between one " +
                 "frame and the next. " +
                 "MEASURED across three species and seven session lengths: the index moves up to 21 SLOTS " +
                 "in a single 16.7 ms frame and the envelope steps 0.9996 of its 0..1 range -- and sin^2 " +
                 "has ZERO SLOPE at both ends by design, so it cannot legitimately arrive there from 0 in " +
                 "one frame. The per-gesture random changed MID-GESTURE on 14 frames, envelope up on both " +
                 "sides: the same creature's direction redrawn while it is on screen. " +
                 "*** AND IT IS NOT THE PHASE TELEPORT'S SHAPE, which is a distinction worth having. *** " +
                 "The envelope step is already 0.9950 after thirty seconds; one re-index ruins one gesture " +
                 "completely at any t. What grows with the session is the FREQUENCY -- 0 re-rolls at 30 s " +
                 "and 7 at half an hour -- because d(floor(t/SLOT))/dSLOT is -t/SLOT^2, so at large t an " +
                 "arbitrarily small change of slot length flips the index and the gesture flickers. " +
                 "*** tempest's TWO LIGHTNING LANES WERE DOING THIS TODAY. *** It is the one of the three " +
                 "whose divisor was already wired; still's was absent entirely and abyss's carried one of " +
                 "murmur's three terms, so those two are an ABSENCE filled and tempest's is a defect fixed. " +
                 "THE REPAIR IS v4654's FACTORING ON A DIFFERENT STRUCTURE AND COSTS NO NEW UNIFORM: a " +
                 "boundary falls where the accumulated slot COUNT crosses an integer, and that count is " +
                 "(t + a*P + b*V + c*D)/B -- mhRatePhase with a base of 1/B. S is continuous and strictly " +
                 "increasing, so floor(S) steps by one: ZERO jumps, ZERO reversals and ZERO mid-gesture " +
                 "re-seeds over 5,019 frames, against a held-signal reduction of 1.5e-12 across all four " +
                 "outputs and 62,400 points. " +
                 "*** A SHADER TWIN HAD BEEN MISSING TWO OF ITS FOUR SIGNAL TERMS AND THE PROBE COULD NOT " +
                 "SEE IT: *** mhAbyssSlot divided by (1 + 0.55*voice) where abyss.ts and this tree's own " +
                 "CPU abyssSlot divide by all four, and the kit probe swept rarity and voice ONLY -- the " +
                 "pair that was missing sat at zero in every pixel. Repaired, the probe now sweeps pace " +
                 "against drive in a second channel and catches the old twin at 101/255. Two arguments " +
                 "pinned at zero grade nothing, for the third round running. " +
                 "*** murmurSpecies3 WENT RED ON ARRIVAL AND ITS CONSTANTS WERE DROPPED RATHER THAN " +
                 "RE-FITTED. *** Its four frame times were hand-written [2.0, 9.0, 16.0, 22.5], fitted to " +
                 "a slot of 16.48 s -- which was abyss's slot only while the cadence term was missing. With " +
                 "it the slot is 15.12 s, the lanes moved, and the row about two lanes turning opposite " +
                 "ways read 15.25 degrees against 0.00 because the first lane was no longer passing at all. " +
                 "The times are SEARCHED FOR now, at the gate's own operating point against its own clock, " +
                 "and the numbers got stronger: +17.80 and -11.93 degrees, genuinely opposite, and the " +
                 "interior swing went from 4.7x to 10.9x. " +
                 "THIRTEEN SABOTAGES, ALL CAUGHT, TWO ONLY AFTER REPAIR: handing abyss its BASE slot length " +
                 "where the instantaneous one belongs walked through both pixel rows and every species gate " +
                 "(it is worth 1.3% of a slot), and dropping the 1.30 from tempest's folded coefficient " +
                 "walked through everything because every pixel row asked only whether the frame MOVED. " +
                 "Closed by a structural census -- the count must integrate against a base with no live " +
                 "signal and the length must carry one -- and by reading tempest's 1.30 and 0.85 out of the " +
                 "shader and multiplying them. The census's own first cut took a 240-character declaration " +
                 "window that spilled into the next statement and scored every correct site as wrong.",
    }),
    // v4655 -- THE 338th CLOSING: the clocks whose OUTPUT is multiplied, which last round's census could
    // not see, and a row that had outlived its own repair two gates away.
    since337: Object.freeze({
        at: "v4655", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/murmurClock2-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green in 3,005 ms on this box against a murmurKit that measures 2,705 here and is " +
                 "RECORDED at 2,035 -- a box drift of 1.33, so about 2,260 recorded, under the 2,772 at " +
                 "which this tree splits. 12 rows in five sections over three species. " +
                 "*** LAST ROUND'S CENSUS PRINTED \"modulated rates still on murmur's rate * t: (none)\" " +
                 "WHILE TWO CLOCKS WERE TELEPORTING. *** It inspected mh_drift's RATE ARGUMENT, and only " +
                 "when that argument was a bare identifier it could chase back to a const. The shape it " +
                 "could not see is a drift with a CONSTANT rate whose whole RESULT is multiplied by a live " +
                 "signal afterwards -- nebula's and tempest's cloud drift and flux's stream both carried " +
                 "it. A census that reports a clean result about a subset it never names is this tree's " +
                 "oldest defect and this one shipped it ONE ROUND AGO. " +
                 "MEASURED, at a 1/60 s frame: tempest's cloud drift advances 0.0199 rad after 5 s of " +
                 "running and 6.8535 after 1800 -- 7,791x the integrated frame's 0.000880 -- and helix's " +
                 "strand climb 0.0849 against 29.5654, which is 1,344x. Both grow within 4.1% of linear " +
                 "for 360x the wait, because the error IS t * dF and it has no ceiling. The integrated " +
                 "form reaches EXACTLY 100.0% of its derived bound base * (1 + k*sup) * speed * dt at " +
                 "every session length and varies by 7e-14 across five spanning 5 s to half an hour. " +
                 "*** THE REPAIR PUTS THE INTEGRALS IN THE SECULAR TERM AND LEAVES THE WOBBLE READING THE " +
                 "INSTANTANEOUS FACTOR, *** because murmur's product expands to base*F*t + " +
                 "(k*base*F/w2)*sin and only the first summand has a t in it. The two agree to 4.6e-13 " +
                 "across 480 operating points out to an hour and part by 405 rad where the signal has just " +
                 "moved -- the second number is what stops the first being two spellings of one thing. " +
                 "*** helix's CLIMB WAS AN ABSENCE, NOT A TELEPORT: *** helix.ts scales it by 0.75*live.pace " +
                 "and 0.85*st.drive and this port carried the bare drift, so the strands rose at one speed " +
                 "whatever the exchange was doing. No signal-hunting census could ever have found it; it " +
                 "came out of reading helix.ts against the file line for line, and it moves this tree's " +
                 "cadence count from eight species to nine. " +
                 "*** AND A ROW TWO GATES AWAY HAD OUTLIVED ITS OWN REPAIR. *** murmurDrive's " +
                 "\"NOTHING THIS ROUND WIRED MULTIPLIES A CLOCK\" tested that no line reads both DRIVE and " +
                 "uniforms.time. v4654 and v4655 UNDEFERRED the rate family, helix's climb now reads both " +
                 "-- and the test KEPT PASSING because the two reads sit on two source lines. A condition " +
                 "outliving its sentence is worse than a red one: it reads like a live guarantee. Rewritten " +
                 "to what is true now, that instantaneous drive reaches a clock at exactly one place, as " +
                 "the BOUNDED wobble amplitude, while every secular term reads the integral. " +
                 "FIFTEEN SABOTAGES, ALL CAUGHT, and one of them found a real gap first: deleting the drive " +
                 "term from the CPU mhRatePhase left murmurKit green -- correctly, its section 15 grades " +
                 "the SHADER twin against a hand-written reference -- and left murmurClock green too, " +
                 "because every row there passed 0 for three of the four coefficients. A COEFFICIENT OF " +
                 "ZERO GRADES NOTHING, for the second round running. Closed by grading mhRatePhase against " +
                 "a 4,096-step quadrature of the moving rate it claims to integrate, over three signals at " +
                 "unrelated frequencies: 1.0e-12 rad over 46.8 rad of accumulated phase, and the reference " +
                 "is the DEFINITION rather than a second spelling of the implementation.",
    }),
    // v4654 -- THE 337th CLOSING: the species' own clocks, and this port's one deliberate divergence.
    since336: Object.freeze({
        at: "v4654", swept: 1, green: 1, red: 0,
        added: Object.freeze(["tools/ship/murmurClock-selfcheck.mjs"]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green in 1,611 ms on real WebGPU, 10 rows in four sections, plus a new section 15 in " +
                 "tools/ship/murmurKit-selfcheck.mjs. *** v4653 DEFERRED THE RATE FAMILY AND NAMED THE " +
                 "DECISION; THE OWNER CHOSE TO DIVERGE FROM murmur RATHER THAN INHERIT ITS JUMP. *** A " +
                 "species builds a rate from the live signals and hands it to mh_drift, whose phase is " +
                 "rate * t; a moving rate makes that jump by t * dRate, with no ceiling. MEASURED on comet's " +
                 "orbit as the cadence rises: 0.1676 rad in one frame after 5 s of running and 57.7341 " +
                 "after 1800 -- NINE FULL TURNS OF THE ORBIT IN 16.7 ms -- growing 344x for 360x the wait. " +
                 "The integrated form advances 0.00793 rad and varies by 4e-16 across the same five " +
                 "sessions: it does not depend on the session at all. " +
                 "*** THE REPAIR IS EXACT AND COSTS THREE NUMBERS, BECAUSE THE INTEGRAL FACTORS: *** base " +
                 "and the coefficients come from style knobs and do not move, so integral(base * (1 + " +
                 "a*pace + b*voice + c*drive)) is base * (t + a*P + b*V + c*D). The host accumulates the " +
                 "three in SHADER time -- against the tempo integral, not wall seconds -- and it reduces to " +
                 "murmur's own expression wherever a signal is held, to 9.1e-13 out to an hour. THAT ROW IS " +
                 "WHAT MADE THE DIVERGENCE SAFE and it is not theory: HEAD read limn's hue turn at 26.84 " +
                 "degrees and the integrated clock with no other change read 26.84, identical. " +
                 "*** AND THE ROUND FOUND THREE SIGNAL-ROUTING DEFECTS IT HAD TO FIX FIRST. *** comet's " +
                 "orbital rate read VOICE where comet.ts reads live.pace, and its whole closure never " +
                 "touched the cadence; limn carried the SMALLER of murmur's two rate terms and not the " +
                 "larger; aura carried the voice term alone where aura.ts has voice, pace and drive. Adding " +
                 "a cadence term to rate * t would have shipped three NEW teleports, so the mechanism was " +
                 "not a refinement on top of the fix -- it is what made the fix safe to make. " +
                 "*** A GATE ROW WAS ASSERTING SOMETHING FALSE ABOUT murmur FOR THIRTEEN ROUNDS: *** " +
                 "\"THE SIX SPECIES WITH A CADENCE ARE murmur's SIX ... a port that routed the cadence to " +
                 "every species would draw a shimmer on eleven bodies murmur leaves still.\" Counted in " +
                 "murmur's own sources, live.pace appears in ALL EIGHTEEN. The six were never murmur's -- " +
                 "they were the six this port happened to reach at v4641 -- and the row now counts how many " +
                 "of the eighteen are reached (eight) and NAMES THE TEN THAT ARE NOT. " +
                 "TWELVE SABOTAGES, ALL CAUGHT, THREE AFTER REPAIR: the kit probe passed 0 for two of " +
                 "mhRatePhase's four coefficients, so deleting a term from the TSL twin moved no pixel (a " +
                 "coefficient of zero grades nothing); aura's per-lane scale on the secular phase was " +
                 "ungraded because no section renders aura; and nothing checked that the shared frame " +
                 "helper DERIVES the three integrals rather than defaulting them -- which is not " +
                 "hypothetical, it went red on limn at 26.45 the moment the clock landed. " +
                 "ONE RECORDED BOUND WAS DROPPED RATHER THAN RE-FITTED: limn's hue centre moved 26.84 -> " +
                 "25.12 because murmur's missing pace term runs its arc 28.5% faster, so the row now asserts " +
                 "the PHYSICS -- a saturating share approaches MH_SPREAD from below -- instead of a centre " +
                 "fitted to wherever the arc happened to be.",
    }),
    // v4653 -- THE 336th CLOSING: st.drive, the last of mh_state's four, and the half of it that is safe.
    since335: Object.freeze({
        at: "v4653", swept: 2, green: 2, red: 0,
        added: Object.freeze([
            "tools/ship/murmurDrive-selfcheck.mjs",
            "tools/ship/murmurDrive2-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green in 2,225 and 2,260 ms on real WebGPU, 11 rows between them, plus a new section 14 " +
                 "in tools/ship/murmurKit-selfcheck.mjs. *** st.drive IS THE LAST OF mh_state's FOUR AND " +
                 "THE ONLY ONE WHOSE SUBJECT IS A DIRECTION. *** Its 45 references across murmur's eighteen " +
                 "sources do THREE things -- they point a wander at a heading, they collapse the scatter " +
                 "around it, and they run sixteen local clocks faster -- and this round took the first two " +
                 "and left the third. THE LINE IS NOT WHERE THE WORK GOT TIRING: every term wired here is a " +
                 "DIRECTION or a SIZE, and the deferral is a CHECKED RULE (no line in the shader reads both " +
                 "DRIVE and uniforms.time) rather than an intention. The rate family hands rate * (1 + k * " +
                 "st.drive) to mh_drift, whose phase is rate * t, so a drive ramping at large t teleports " +
                 "it -- the same shape v4650 repaired on this orb's HOST clock, and it needs a decision " +
                 "about faithfulness rather than a transcription. " +
                 "*** THE HEADING'S CLAIM IS GEOMETRY AND THE GATE SAYS SO INSTEAD OF DRESSING IT UP: *** " +
                 "still's twelve gesture directions sit 86.82 degrees apart at rest (worst pair 177.3, very " +
                 "nearly opposite) and collapse to EXACTLY one axis at full drive, while abyss -- same call, " +
                 "k 0.80 instead of 1.00 -- keeps a 12.02 degree residual and stays a current rather than a " +
                 "ray. AND IT DOES NOT CONVERGE IN A STRAIGHT LINE: the quarter point reads 87.34, HIGHER " +
                 "than the 86.82 it started at, because normalize(mix(a, b, t)) is not a rotation. A port " +
                 "that slerped would read 65.11 there. " +
                 "*** THE NARROWING IS WHAT A FRAME CAN SHOW: *** helix's light draws in 3.51% (duet 7.21%, " +
                 "prism 4.05%, arc 2.98%, measured this round and not rendered by the shipped gate for " +
                 "budget) while limn -- the one species in MH_DRIVE_FORM whose lean is NOT a contraction -- " +
                 "moves 0.21% and still shifts 8.1% of its bytes. droplet's lean goes into the SILHOUETTE " +
                 "and still's does not: 539.7% against 1.2% on the same 0.62 ring, and droplet's route is " +
                 "the kit's flow deformation, a term BOTH HALVES HAVE CARRIED SINCE THE PORT AND NO CALL " +
                 "SITE HAD EVER SET -- every one passed (0,0,1), 0, 0. " +
                 "FOURTEEN SABOTAGES, ALL CAUGHT, AND SIX OF THEM WALKED THROUGH FIRST. The largest hole: " +
                 "mhDriveHeading's CPU/GPU pair was graded NOWHERE, so deleting the mix -- or the normalize " +
                 "-- from the TSL twin left every pixel gate green, because the species carrying a heading " +
                 "also carry a narrowing and their frames still moved. Closed by kit section 14, which also " +
                 "reads the LENGTH back out of the frame: without the normalize it reads 0.30 at mid-ramp. " +
                 "Two more were bounds loosened on a correct subject (v4650's lesson, twice): the angular " +
                 "epsilon is now DERIVED from Number.EPSILON through acos's square-root amplification, and " +
                 "the unit-vector bound carries its own negative control -- the row builds a tidied vector " +
                 "and requires it to FAIL. One row was DELETED rather than repaired: a helix inference that " +
                 "survived its own negation, replaced by a source census that says what altitude it answers " +
                 "at. AND ONE SABOTAGE WAS WRONG, NOT THE GATE: a needle matched MH_IGNITE before " +
                 "MH_DRIVE_HEADING and tested the wrong table.",
    }),
    // v4650 -- THE 335th CLOSING: the orb's clock was an integral that reached no shader.
    since334: Object.freeze({
        at: "v4650", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "tools/ship/murmurTempo-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green in 2,213 ms on real WebGPU, 10 rows in four sections. *** render/aiPresenceOrbState" +
                 ".mjs HAS INTEGRATED SPEED EVERY TICK SINCE THE PORT'S FIRST ROUND AND BOTH CALL SITES THAT " +
                 "FEED A SHADER MULTIPLIED INSTEAD. *** That module's own header names the defect in as many " +
                 "words -- \"multiplying elapsed time by the CURRENT speed would then jump the animation's " +
                 "PHASE too (a visible pop)\" -- and ui/aiPresenceOrbWidget.js and ai-presence-orb.html both " +
                 "wrote time: (now - t0) / 1000 * p.speed, the expression that sentence forbids. The " +
                 "integral was computed, accumulated, returned by getParams() as `phase`, and dropped. " +
                 "*** \"A VISIBLE POP\" UNDERSELLS IT AND THE ROUND'S WORK IS SAYING BY HOW MUCH. *** The " +
                 "error is t * (speedNew - speedOld), so it is set by how long the orb has been on screen " +
                 "and has no ceiling: entering RESPONDING after 60 s of idle advanced the shader's clock " +
                 "2.902 SECONDS IN ONE 16.7 ms FRAME; after 1800 s, 86.191 s. Measured across five session " +
                 "lengths the old jump tracks the wait to within 11% (360x the wait, 320x the jump) while " +
                 "phase's worst frame varies by 3.6e-14 s -- it does not depend on the session at all. AND " +
                 "IT IS NOT A TRANSIENT: once the crossfade settles the old clock is permanently 69.355 s " +
                 "displaced, and every later state change displaces it again. " +
                 "*** THE ROW THAT MAKES THE REPAIR SAFE IS THE ONE SAYING THE TWO ARE THE SAME EXPRESSION: " +
                 "*** the integral of a constant from zero IS elapsed-time-times-that-constant, so in a " +
                 "steady state they agree to 1.6e-12 over 3,600 ticks. That is why eighteen species' byte " +
                 "baselines did not move and why \"just use phase\" is measured here rather than asserted. " +
                 "*** AND SECONDS ARE NOT A PICTURE, SO SECTION 4 RENDERS THEM: *** the jumped frame moves " +
                 "73x (limn) and 99x (still) the light of one honest frame, worst channel 239 and 30 of 255 " +
                 "against 18 and 1. The two fail differently on purpose -- limn's arc is a POSITION, still " +
                 "is the quietest species in the roster and has nothing for a jump to hide behind. " +
                 "TWELVE SABOTAGES, ALL CAUGHT, AND TWO OF THEM CHANGED THE GATE: the ceiling row asked " +
                 "only that phase stay UNDER maxSpeed * dt, and widening that ceiling to a flat second " +
                 "walked through -- a bound nothing approaches is a comment, so the row now brackets it " +
                 "from both sides and reports 100.00% of it. A row demanding ZERO readers of `speed` also " +
                 "went red on the demo's own speed READOUT, a bound set where it was easy to state rather " +
                 "than where the invariant is; it now names where each reader is instead of counting to " +
                 "zero. WHAT IS NOT CLAIMED: the SHADER's own rate multipliers. murmur's species multiply " +
                 "local rates by (1 + k * live.pace) and (1 + k * st.drive) and hand the product to " +
                 "mh_drift, whose phase is rate * t -- the same shape one level down, where no host-side " +
                 "integrator can reach it. That is murmur's design as shipped and it is recorded against " +
                 "the st.drive entry in tools/ship/nextRounds.mjs rather than quietly corrected here.",
    }),
    since333: Object.freeze({
        at: "v4647p", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "tools/ship/sweepRotation-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green, 84 ms alone -- inside the 3,000 ms ship-time budget. It gates the module that " +
                 "WRITES sweep-timings.json, which had no gate at all: definitionGates counts exports no " +
                 "gate names and all SEVEN of sweepRotation's were on that list, three of them added by me " +
                 "two rounds after I noticed the absence out loud. Writing it found a defect on the first " +
                 "run: classifyRows put a gate that exited 1 in 800 ms into `returnees`, because the filter " +
                 "asked the clock and never the exit code -- the same defect, in the same words, that " +
                 "sweepCoverage's measuredUnder had two rounds earlier.",
    }),
    since332: Object.freeze({
        at: "v4647g", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "tools/ship/cliArgs-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green, 574 ms run alone on this box -- under the 3,000 ms membership threshold, so it arrives " +
                 "INSIDE the ship-time sweep rather than outside it. It gates tools/ship/cliArgs.mjs, the " +
                 "argument parser written because an option seven tools did not recognise was IGNORED and the " +
                 "run proceeded for 1,914 s. Eight sabotages red by name (7/3/1/2/1/5/3/1). Two of its rows " +
                 "drive REAL command lines through spawnSync, bounded at 20,000 ms: a refusal is 81 ms, so " +
                 "anything slower is the tool failing to refuse -- and the first, unbounded, draft HUNG when " +
                 "the sabotage sent it into a genuine 32-minute sweep. A hang is not a verdict.",
    }),
    since331: Object.freeze({
        at: "v4647", swept: 6, green: 6, red: 0,
        added: Object.freeze([
            "tools/ship/adapterRecord-selfcheck.mjs",
            "tools/ship/capsuleSettle-selfcheck.mjs",
            "tools/ship/colliderFromGLB-selfcheck.mjs",
            "tools/ship/dxcResolve-selfcheck.mjs",
            "tools/ship/ensureDxc-selfcheck.mjs",
            "tools/ship/failLines-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "all 6 green, run singly on this box (47 ms to 117 ms -- none launches a browser). " +
                 "capsuleSettle and colliderFromGLB are the Murmur-Orb physics port; adapterRecord is the " +
                 "HELD/OWED record that let a second adapter's readings be written BY the gate ON that box; " +
                 "dxcResolve and ensureDxc are the dxil.dll work, where the PATH route was falsified on real " +
                 "hardware and the file-beside-the-binary route measured to work; failLines turns another " +
                 "machine's exit codes into assertion lines, which is what found this surplus.",
    }),

    since330: Object.freeze({
        at: "v4644", swept: 2, green: 2, red: 0,
        added: Object.freeze([
            "tools/ship/murmurIgnite-selfcheck.mjs",
            "tools/ship/murmurIgnite2-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green in 2,106 and 2,278 ms on real WebGPU, 9 rows between them. *** mh_state WAS PORTED AT " +
                 "v4641 AND GRADED IN THE KIT AND REACHED NO PIXEL FOR THREE ROUNDS. *** This round wires " +
                 "THREE of its four outputs: `settled` on all eighteen interiors and the pair (complete, " +
                 "sweep) that murmur's SUCCESS shell travels on, in the seven marched heroes. The fourth, " +
                 "st.drive, is still unported and still named. " +
                 "*** THE SHELL IS ONE FORMULA murmur WRITES OUT SEVEN TIMES WITH FOUR NUMBERS CHANGED: *** " +
                 "sr = (length(p) - mix(lo, hi, sweep)) / width; e += complete * gain * exp(-sr*sr). The kit " +
                 "owns the profile (mhIgnite) and MH_IGNITE owns the four numbers, so the orb spells it ONCE " +
                 "and calls it from six sites covering seven species. Bit-exact against a real GPU at " +
                 "murmurKit section 13: worst |gpu - cpu| 0 of 255 over 16 radii x 16 rows x 3 species, " +
                 "against 255 unflipped, and the ring's measured centre lands within 0.0013 body radii of " +
                 "mix(lo, hi, sweep) at every sweep. " +
                 "*** AND THE PIXEL GATES ASK THE QUESTION A BRIGHTNESS BOUND CANNOT: WHERE IS THE ADDED " +
                 "LIGHT. *** still's flash centroid climbs 0.1947 -> 0.3981 monotonically while its amplitude " +
                 "goes 23% -> 187% -> 335% -> 113% of the whole idle frame, so the centroid is tracking " +
                 "position and not brightness; geode, which has NO shell, grows 5.7x over the same taus and " +
                 "its centroid moves 0.0041 -- fifty times less. abyss travels 0.2870 and tempest's " +
                 "pre-multiplied cloud gains 135.5% at tau 0.20 within 0.0344 of its own centroid, which is " +
                 "the term a port can drop while still drawing a perfectly good ring. " +
                 "*** ALL 72 BASELINE FRAMES ARE BYTE-IDENTICAL: *** eighteen species x four cases, 0 bytes " +
                 "differ, because complete and settled are EXACTLY zero outside SUCCESS -- which is what lets " +
                 "eighteen shaders add the shell without a branch, and is its own row on both sides. " +
                 "*** TWO SABOTAGES WALKED THROUGH AND BOTH WERE TABLE-VERSUS-WIRING DRIFT NO RENDER CAN " +
                 "SEE. *** A dead MH_IGNITE entry draws nothing; droplet's settle doubled needs droplet " +
                 "rendered in SUCCESS, which no gate does. The first is closed by a census asserting set " +
                 "EQUALITY between MH_IGNITE's keys and the closures that call the shell; the second by " +
                 "making droplet's exclusion a MISSING KEY in MH_SETTLED_INTERIOR rather than a ternary a " +
                 "tidying pass can delete. A THIRD was caught by the gate itself: the quiet-state control " +
                 "compared LISTENING at tau 0.60 against IDLE at tau 0 and read 1,934 moved bytes, which is " +
                 "mh_live's voice window opening and not a leak -- each state is now held against ITSELF.",
    }),
    // v4641 -- THE 253rd CLOSING: mh_live, the function all eighteen species read and none of them had.
    since328: Object.freeze({
        at: "v4641", swept: 2, green: 2, red: 0,
        added: Object.freeze([
            "tools/ship/murmurLive-selfcheck.mjs",
            "tools/ship/murmurLive2-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green in 1,932 and 1,606 ms on real WebGPU, 10 rows between them, and a correctness fix " +
                 "rather than a new species. *** EVERY ONE OF murmur's EIGHTEEN SHADERS READS live.voice AND " +
                 "NOT ONE READS A RAW LEVEL; THIS PORT READ THE RAW UNIFORM AT 44 SITES AND STILL's OWN STYLE " +
                 "DIAL glintRate AT 8 MORE. *** kit.ts conditions both signals once -- voice^0.65 weighted " +
                 "1.00 in LISTENING and 0.55 elsewhere, cadence^0.85 weighted 1.00 in THINKING and RESPONDING " +
                 "and 0.60 elsewhere -- \"so 'loud' and 'busy' mean the same thing across the family\". The " +
                 "error was not uniform and that is the worst of it: at the species gates' own 0.3 the true " +
                 "signal is 0.2504 against 0.3000, 20% hot; at 1.0 it is 0.5500 against 1.0000, 45% hot. IT " +
                 "GROWS WITH THE KNOB, so every species was loudest exactly where it was least faithful and " +
                 "no single scale factor anywhere could have absorbed it. Measured in the pixels over all " +
                 "eighteen: at a raw voice of 0 the frames are byte-identical (mean byte change 0.0000), at " +
                 "0.3 the mean byte falls 51.062 -> 50.837, at 1.0 it falls 56.547 -> 54.479. " +
                 "*** THE INSTRUMENT IS AN EQUIVALENCE AND NOT A DIFFERENCE, WHICH IS WHY IT COULD BE TIGHT " +
                 "ENOUGH TO PIN FOUR CONSTANTS. *** A level of 0.30 in LISTENING and 0.752598 in IDLE are the " +
                 "same conditioned voice, so the two frames must come back BYTE-IDENTICAL -- 0 of 9,216 bytes " +
                 "differ on arc, still and droplet -- while the 0.991722 a square-root port would need " +
                 "disagrees by 2,443. Same construction on the cadence (0.729556 against 0.40) and 0 bytes " +
                 "again on arc and chorus. THINKING and RESPONDING at identical knobs give 0 differing bytes " +
                 "and LISTENING differs from THINKING by 5,728, which is the two windows being two windows. " +
                 "still, which murmur gives no cadence, moves EXACTLY 0 bytes across activity 0 to 1 where " +
                 "arc moves 5,236 and chorus 2,016. *** AND ONE SPECIES' SILHOUETTE WAS WRONG, NOT ITS " +
                 "EXPOSURE: *** droplet's voice drives mh_shape's swell, which scales the whole body, so its " +
                 "footprint reads 229 px at the conditioned voice against 221 at the raw one. " +
                 "*** THE ROUND SPLIT INTO TWO GATES ON A MEASUREMENT AND NOT A PREFERENCE: *** all four " +
                 "species in one file came back ALL GREEN at 2,772 ms against a 3,000 ms ceiling, 8% of " +
                 "margin on a box the tree measures 10% slower under a contended sweep. A species costs about " +
                 "280 ms (one WGSL compile) and a frame about 25, so dropping frames would have bought " +
                 "nothing. Rendering all eighteen costs 6,439 ms, measured, which is why the all-eighteen row " +
                 "is a SOURCE CENSUS that says so in its own title -- the v4640 lesson, applied on purpose " +
                 "this time rather than found by sabotage. *** EIGHTEEN SABOTAGES, ALL EIGHTEEN CAUGHT, *** " +
                 "including both exponents, both weights, both windows, the state gating of all four mh_state " +
                 "outputs, the CPU f64 twin, a single species re-routed to the raw knob, the cadence sprayed " +
                 "onto a species that has none, still's own glintRate dial deleted, and the state table " +
                 "REORDERED -- which is load-bearing now that a float index picks the window, and which " +
                 "nothing asserted until this round. *** AND THE SPECIES GATES DID NOT MOVE A BYTE. *** " +
                 "murmurSpeciesFrames.mjs states its operating point as the CONDITIONED pair and inverts " +
                 "mh_live for the raw knobs, so all eighteen species render byte-identically to v4640 at " +
                 "their gates' own point: the alternative was holding the raw knob, which put four gates " +
                 "below their bounds (abyss's creature, droplet's swell, sol's granulation, and flux, which " +
                 "stopped finding a half-height at all and CRASHED) and repairing that by lowering four " +
                 "bounds is indistinguishable from budgeting a red down to green. THE FIRST CUT OF THAT " +
                 "INVERSION WAS ITSELF WRONG -- it used the RATIO formula that belongs to the equivalence " +
                 "rows, put the conditioned voice at 0.457 instead of 0.300 and moved all eighteen species -- " +
                 "and a sabotage then showed droplet's and tempest's gates tolerate a 17% shift in silence, " +
                 "so the round-trip is now its own f64 row that also requires the two numbers to DIFFER. " +
                 "*** WHAT IS NOT DONE, DELIBERATELY: *** mh_state is ported, given a TSL twin and graded " +
                 "bit-exactly against the GPU (worst 0 of 255 over 1,024 samples), and CALLED BY NOTHING. Its " +
                 "four outputs are 128 transcribed references across murmur's eighteen sources and they are " +
                 "their own round; the orb therefore gained `activity` and `stateIndex` and NOT `stateTau`, " +
                 "because a uniform nothing reads is a row that cannot fail. Logged as " +
                 "orb-state-terms-wiring; the next orb round starts there. " +
                 "*** AND THE TIMINGS FILE CARRIES TWO HAND-WRITTEN ENTRIES THIS ROUND, WHICH IS THE ESCAPE " +
                 "budgetExile.mjs NAMES AND NOT A SHORTCUT TAKEN QUIETLY. *** Four full quickSweep passes in " +
                 "one session left this container about 26% slower than it started, and it did not recover: " +
                 "tools/ship/murmurKit-selfcheck ran 1,679-1,784 ms early in the session against its recorded " +
                 "1,710, and 2,124-2,172 ms afterwards at a load average of 0.29. Every sweep taken in that " +
                 "state wrote inflated costs, and each one evicted a different set of ten to twelve gates -- " +
                 "including murmurSpecies8 and murmurSpecies13, which had run at 2,382 and 2,438 ms an hour " +
                 "earlier. budgetExile.mjs's own header is the reason that was refused rather than shipped: " +
                 "\"ONCE A GATE'S TIME CROSSES THE BUDGET, IT STAYS ACROSS FOREVER. A single slow " +
                 "observation -- eight-way contention, a cold cache, one unlucky minute -- exiles a gate from " +
                 "every future ship sweep, permanently.\" So sweep-timings.json was restored to v4640 and the " +
                 "two new gates alone were added, at the uncontended readings taken BEFORE the box degraded " +
                 "(1,932 and 1,606 ms, the slowest of three and two runs respectively) -- on the same scale " +
                 "as the other 1,685 entries, which is the only scale on which a shared budget means " +
                 "anything. The alternative was to permanently exile ten gates as a side effect of a round " +
                 "about a voice curve. Logged as sweep-timings-box-drift.",
    }),
    // v4635 -- THE 247th CLOSING. No gate added: a row added to one that existed, and a 3,561 ms refund.
    // v4640 -- THE 252nd CLOSING: prism and helix, the last two -- and four rows, two of which grade tables.
    since327: Object.freeze({
        at: "v4640", swept: 2, green: 2, red: 0,
        added: Object.freeze([
            "tools/ship/murmurSpecies14-selfcheck.mjs",
            "tools/ship/murmurSpecies15-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green in 1,094 and 1,955 ms on the rotation, real WebGPU, 4 rows, carrying PRISM and HELIX " +
                 "-- and WITH THEM ALL EIGHTEEN OF murmur-web's SPECIES ARE PORTED, across fifteen species " +
                 "gates and one kit gate. still, limn, comet, droplet, opal, abyss, nebula, tempest, fathom, " +
                 "geode, arc, sol, aura, flux, duet, chorus, prism, helix. *** AND THE HONEST HEADLINE OF " +
                 "THIS ROUND IS THAT HALF ITS ROWS DO NOT GRADE THEIR SHADERS, WHICH TEN SABOTAGES ESTABLISHED " +
                 "AND WHICH THE ROWS NOW SAY IN THEIR OWN TITLES. *** FIVE OF THE TEN ESCAPED. prism's " +
                 "perpendicular-fan row and helix's antipodal-strands row are both computed in the gates' own " +
                 "JS from MH_PRISM and MH_HELIX; they never render. So swapping u1 and u2 in the shader -- " +
                 "the fan opening INTO the screen, which is the failure prism.ts names by name -- left the " +
                 "row green, as did replacing the mh_key entry with a fixed direction, as did giving helix's " +
                 "second strand its own phase instead of the negation. That is the v4579 defect in a new " +
                 "costume: a check that re-derives the answer rather than reading the subject. BOTH ROWS WERE " +
                 "RE-TITLED RATHER THAN DELETED OR WEAKENED -- they now say \"the TABLE, not the shader\" and " +
                 "\"the constants, not the shader that reads them\" -- because what they do assert is true, " +
                 "exact and worth holding (the worst departure from perpendicular across 1,623 time-and-swing " +
                 "samples is 5.65e-5, which is the shader's own 1e-4 guard; helix's strand midpoint is 0.000 " +
                 "from the axis across 9,288 samples). *** AND FIVE PIXEL INSTRUMENTS WERE BUILT TO CLOSE THE " +
                 "GAP AND ALL FIVE WERE REJECTED, WITH THEIR NUMBERS, so nobody repeats the search. *** " +
                 "helix's per-row strand midpoint at 128 px scatters 6.10 px at baseline and 2.43 px with the " +
                 "strands deliberately NOT antipodal -- THE SABOTAGE SCORES BETTER, because two strands at a " +
                 "fixed offset track each other more steadily than two that cross; an instrument that prefers " +
                 "the broken shader is not weak, it is wrong. prism's fan width resisted three: the lit " +
                 "region's principal axis moved the wrong way (3.96 to 4.80 as the fan opened), its x and y " +
                 "spreads moved the wrong way (sx 2.88 to 2.32) because neither axis aligns with a diagonal " +
                 "fan, and a profile across the CPU-computed fan direction came back identical at split 0.0, " +
                 "0.5 and 1.0 -- a registration failure in the probe, since those frames differ by 18% of " +
                 "total light. And helix's tap count: setting MH_TAPS_HI from MH_TAPS * 4 back to MH_TAPS " +
                 "makes the strands BRIGHTER (13.12 against 11.72) rather than the \"empty bead\" helix.ts " +
                 "describes, because a larger ds accumulates more per tap that lands. WHAT THE TWO SURVIVING " +
                 "SHADER ROWS DO MEASURE: prism's `split` takes the frame's light DOWN 18% while `beams` " +
                 "takes it UP 49% -- opposite SIGNS, so neither knob is the other, which no single-frame " +
                 "brightness bound could show; and helix's strands pinch 5 times up the figure at 1.75 turns " +
                 "and 8 at 2.85, the crossing rhythm counted rather than left to fall out. *** THIS GATE " +
                 "RENDERS AT 128 PIXELS AND THAT IS A FINDING. *** At 48 a helix strand is about one pixel " +
                 "across and no row has two peaks to separate -- the same wall chorus's countability hit at " +
                 "v4639. renderSpecies gained an optional size for it, and the cost is small because the " +
                 "LAUNCH is the cost: the same two-frame render is 888 ms at 48 and 1,229 ms at 128, a 7.1x " +
                 "increase in pixels for 1.38x the time. Callers that pass nothing are byte-for-byte " +
                 "unaffected. VERIFIED BY BYTES across all EIGHTEEN species and three time-and-knob cases: " +
                 "54 frames, 0 bytes different.",
    }),
    // v4639 -- THE 251st CLOSING: duet and chorus, and a headline that measurement would not support.
    since326: Object.freeze({
        at: "v4639", swept: 2, green: 2, red: 0,
        added: Object.freeze([
            "tools/ship/murmurSpecies12-selfcheck.mjs",
            "tools/ship/murmurSpecies13-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green in 1,736 and 2,344 ms on the rotation, real WebGPU, 5 rows, carrying DUET and CHORUS " +
                 "-- the fifteenth and sixteenth of murmur's eighteen, and the pair that solves its lights at " +
                 "the ray's CLOSEST APPROACH rather than marching them: duet two of them, chorus seven on a " +
                 "Fibonacci shell. *** THE ROUND'S FINDING IS THAT CHORUS'S HEADLINE IS NOT WHAT ITS " +
                 "ARITHMETIC DOES, AND THE GATE REPORTS IT RATHER THAN ASSERTING IT. *** chorus.ts: \"As sync " +
                 "rises they gather, and at one they breathe as a single body. That transition from many " +
                 "rhythms to one is the whole species.\" The line that implements it is phase = " +
                 "mix(fk * 0.897, 0.0, sync) * 2pi -- WHICH SCALES A MODULAR QUANTITY LINEARLY. Phase lives " +
                 "on a circle, so multiplying the ladder by (1 - sync) does not gather the seven, it " +
                 "RE-SPACES them, and whether the new spacing clusters them depends on its fractional part. " +
                 "Computed off the shader's own constants over three breath periods, the ensemble's " +
                 "modulation runs 9.89%, 6.63%, 14.65%, 2.61%, 8.17%, 42.43% at sync 0, 0.25, 0.50, 0.75, " +
                 "0.90 and 1.00: NOT MONOTONIC, and the gather is an endpoint effect that happens only AT " +
                 "1.00. AND THIS PORT CANNOT REACH THAT ENDPOINT: the shader computes sync = " +
                 "clamp(syncK * 0.75 + 0.85 * drive + 0.55 * complete) and neither drive nor complete is " +
                 "wired here, so the knob tops out at 0.75 -- the LEAST modulated setting of any sampled. " +
                 "The first cut of the gate trusted the prose and wrote the row anyway: it read 4.32% at " +
                 "sync 0 against 3.52% at sync 1, backwards and small enough to pass for noise. The port is " +
                 "faithful, the constant is murmur's, the clamp is murmur's, and what is reported is a " +
                 "property of murmur's SOURCE -- reported rather than repaired, because repairing it means " +
                 "diverging from the source on this port's own authority. TEN SABOTAGES, NINE RED BY NAME. " +
                 "*** AND ONE OF THEM CAUGHT AN INSTRUMENT THAT WAS NOT MEASURING WHAT ITS ROW CLAIMED. *** " +
                 "chorus's level row asserts the ensemble gets more UNEQUAL, \"which a uniform gain cannot " +
                 "do\" -- and the first instrument, brightest-over-dimmest above an 88th-percentile " +
                 "threshold, was not blind to one: the voices sit on a background that does not scale with " +
                 "level, so a uniform lift changes WHICH pixels clear the threshold and the ratio grows " +
                 "anyway. An equal-average uniform lift read 5.00x to 13.11x, indistinguishable from the " +
                 "real thing. Replaced by local maxima with the frame's median subtracted, which is " +
                 "genuinely gain-invariant: the real front-weighting now reads x3.828 and the uniform lift " +
                 "x0.858. WHAT ELSE THE ROWS MEASURE: duet's level multiplies the louder body x4.18 and the " +
                 "quieter one x0.85 -- it goes DOWN -- taking the pair's ratio 2.384x to 11.686x, because " +
                 "the weights are 2*bal and 2*(1-bal) and sum to two at every balance; sep moves them 6.1 px " +
                 "to 10.4 while voice moves them 0.3; and across one full orbit read off the species' own " +
                 "0.675 rad/s the depth ordering swings 1.07x to 4.77x while the pair never closes under " +
                 "6 px, which rejects face-on and edge-on at once. chorus's ensemble never falls below 0.375 " +
                 "of its own peak at the deepest breath. THREE MECHANISMS ARE TRANSCRIBED AND EXPLICITLY NOT " +
                 "GRADED, each with its number: duet's occlusion (worth 3.9% -- the two bodies are 0.60 of " +
                 "the body apart and 0.15 wide, so they almost never overlap on screen), chorus's shell " +
                 "arrangement, and chorus's countability (a voice is about 1.5 px across at this frame size, " +
                 "so a flood fill finds two or three blobs and not seven -- the FRAME's limit, not the " +
                 "shader's). VERIFIED BY BYTES across all SIXTEEN species and three cases: 48 frames, 0 " +
                 "bytes different.",
    }),
    // v4638 -- THE 250th CLOSING: aura and flux, the two sheet heroes, and a frame convention that bit.
    since325: Object.freeze({
        at: "v4638", swept: 2, green: 2, red: 0,
        added: Object.freeze([
            "tools/ship/murmurSpecies10-selfcheck.mjs",
            "tools/ship/murmurSpecies11-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green in 1,442 and 1,741 ms on the rotation, real WebGPU, 6 rows, carrying AURA and FLUX -- " +
                 "the thirteenth and fourteenth of murmur's eighteen and the pair that WANTS the march the " +
                 "four heroes before them were built to escape. aura.ts: the crossings \"resolve as OCCLUSION " +
                 "rather than as ADDITION\" because \"a tap that lands in a near sheet attenuates what the far " +
                 "ones contribute behind it\" -- which a closed form would have to sort for and a march gets " +
                 "from the marching. *** THE FLAGSHIP ROW IS BRACKETED BY THE SOURCE'S OWN TWO NAMED " +
                 "FAILURES, which makes it a measurement rather than a threshold: *** aura.ts says of its " +
                 "occlusion coefficient that \"at 9 the far ribbon vanishes entirely and the body loses its " +
                 "sense of fullness, at 1.5 nothing occludes anything and it is smoke again\". Both were " +
                 "rendered. The knob that buys the third sheet multiplies the frame's light x1.886 at 1.5 " +
                 "(very nearly the x2 of pure addition, which is what \"nothing occludes\" IS when measured), " +
                 "x1.104 at 9.0 (a ribbon that is not there), and x1.307 at the shipped 4.50. The interior " +
                 "spread brackets the same way: 10.06x, 1.94x, 3.92x. *** AND THE ROUND'S FINDING IS THAT " +
                 "THIS PORT GOT flux UPSIDE DOWN BY TRANSCRIBING THE SOURCE CORRECTLY. *** flux.ts negates " +
                 "its height because \"a colorEffect's y runs DOWN the screen, so the body frame's +y is the " +
                 "bottom of the picture\", and it names the failure: \"An upside-down aurora is not a subtle " +
                 "mistake; it reads as light pouring in from above rather than as curtains standing on " +
                 "something.\" THIS PORT'S FRAME IS NOT A colorEffect'S -- the quad comes from three's uv(), " +
                 "whose v is 0 at the BOTTOM -- so copying the negation reproduced exactly the bug the " +
                 "comment is about. Measured row by row, the profile peaked at y = -0.396, the upper third, " +
                 "and read 0.443 as a lower-to-upper ratio. Dropping the negation gives 2.523, against " +
                 "nebula's 1.073 and aura's 1.623. A PORT THAT COPIES A FRAME CONVENTION IT DOES NOT SHARE " +
                 "HAS TRANSCRIBED THE LETTER AND LOST THE THING, and only a pixel measurement says which. " +
                 "TEN SABOTAGES, EIGHT RED BY NAME. One bound was tightened because a sabotage showed it was " +
                 "a coincidence rather than a bound: the asymmetry row measured 1.601 against a 1.5 " +
                 "threshold, seven per cent of headroom, and a plain gaussian of the same scale -- the " +
                 "literal symmetric profile flux.ts rejects -- reads 0.877, the asymmetry INVERTED, so the " +
                 "bound moved to 1.25, the middle of the gap rather than one edge. TWO MECHANISMS ARE " +
                 "TRANSCRIBED AND EXPLICITLY NOT GRADED, each with its number: aura's three depth offsets " +
                 "(collapsing them moves the frame total 24.21 to 24.76, because aura's own sentence says " +
                 "the rolls and tilts carry the separation WITH them, and those are untouched) and flux's " +
                 "three x offsets (moving two together reads 2.523 to 2.438, because every row in that gate " +
                 "is a VERTICAL measurement and the stacking is horizontal). VERIFIED BY BYTES across all " +
                 "FOURTEEN species and three time-and-knob cases: 42 frames, 0 bytes different.",
    }),
    // v4637 -- THE 249th CLOSING: arc and sol, the two heroes that draw a LINE.
    // *** v4645 -- SEVEN ORDINALS COLLIDED AT THE main MERGE, AND v4535 SAW IT COMING IN THIS FILE. ***
    // That round wrote, of exactly this key space: "An ordinal-keyed object hands two concurrent lines a
    // shared namespace with no allocator and a silent failure mode; a LIST gives them append-only entries
    // that cannot collide at all -- which is the shape `closings` itself was given at v4399 for this exact
    // reason." It then declined to change the shape mid-merge, for the same reason this round declines to:
    // "a merge is the wrong commit in which to change the shape of the thing being merged."
    //
    // The failure mode arrived as predicted. This line used since258-264 at v4537-v4545; main's Murmur Orb
    // rounds independently used since258-264 at v4637-v4644. The later declaration wins, JS says nothing,
    // and SEVEN of this line's rounds lost their swept counts -- which surfaced two screens away as "7 STILL
    // UNSWEPT", a number that looked like missing gates and was actually missing CLOSINGS. Renumbered
    // FORWARD, which is the rule the changelog header states for version ordinals and applies here too: the
    // arrivals move, the incumbents keep the keys anything older might name. THE SHAPE IS STILL WRONG and
    // this is now the SIXTH collision; a list is still the answer and is still owed its own round.
    since324: Object.freeze({
        at: "v4637", swept: 2, green: 2, red: 0,
        added: Object.freeze([
            "tools/ship/murmurSpecies8-selfcheck.mjs",
            "tools/ship/murmurSpecies9-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green in 2,396 and 2,016 ms on the rotation, real WebGPU, 10 rows, carrying ARC and SOL -- " +
                 "the eleventh and twelfth of murmur's eighteen and the two that draw a LINE. arc.ts opens " +
                 "with the hardest sentence in the collection: \"THE SPECIES IS A LINE ... Everything else is " +
                 "either compact enough to solve at the ray's closest approach or broad enough that five " +
                 "samples average it honestly. A FILAMENT IS NEITHER.\" They ship together because sol.ts " +
                 "says so in six words -- \"THE PROMINENCES, solved the way arc's filament is\" -- so the " +
                 "closed-form tube, w * sqrt(pi) / sin(alpha) * exp(-perp^2 / w^2), moved into " +
                 "render/murmurKit.mjs as mhTube rather than being written twice, alongside mhRoll (the third " +
                 "rotation, without which every curve's projected ellipse keeps its long axis horizontal) and " +
                 "mhAa (the moire gate, COMPUTED at this port's one mount rather than baked as the 1 it " +
                 "returns there). *** AND THE CONSTRAINT THE SPECIES ESCAPES IS ARITHMETIC THAT DIFFERS FROM " +
                 "murmur's, WHICH IS THE ROUND'S FIRST CORRECTION. *** arc.ts states it at ten taps -- \"the " +
                 "interval is 0.2, so a tube narrower than that is caught by whichever tap lands in it and " +
                 "missed otherwise\" -- but this tree marches at MH_TAPS = 24, kit.ts's own demo value, so " +
                 "the interval here is 0.0833 and the 0.0530 thread is 0.636 of a step rather than 0.265 of " +
                 "one. Every row computes the step from MH_TAPS instead of quoting 0.2, and the bound is " +
                 "two-sided so neither inheriting murmur's tap count nor widening the thread until a march " +
                 "could see it would pass. FIFTEEN SABOTAGES, TWELVE RED BY NAME. *** AND THE SECOND " +
                 "CORRECTION WAS THE INSTRUMENT, NOT THE SHADER: the first flicker row measured the " +
                 "FLOURISH. *** At evenly spaced times arc's frame total moved up to 67.85% and averaged " +
                 "23.36% -- exactly the \"dim, uneven and flickering\" a marched filament gives -- and it was " +
                 "mh_flourish firing on its own schedule, multiplying brightness by (1 + 0.45 * env) and " +
                 "adding a travelling pulse. Driving the CPU kit's own mhFlourish finds where it is silent on " +
                 "BOTH species' lanes, t = 45.0 to 51.1, and in that window arc reads 6.45% max and 3.32% " +
                 "mean against nebula's 5.55% and 1.44%: a solved filament is as steady as the marched cloud " +
                 "that cannot flicker. THE OTHER MEASURED RESULTS: half of arc's light lands in 2.16% of the " +
                 "lit disc against nebula's 17.28%, x8; its centroid never moves a whole pixel between " +
                 "frames, which is what the parabolic refinement buys over twenty discrete places; `pin` " +
                 "takes the centre-to-annulus ratio from 0.404 to 21.997, moving light rather than making " +
                 "it; sol's half-max outline is 4.12% out of round against nebula's 23.13%, one square root " +
                 "against five samples; `simmer` multiplies the interior's neighbour-to-neighbour difference " +
                 "by 1.68 while moving its mean 1.1%, which is what a zero-mean noise does and a brightness " +
                 "cannot; and a tongue appears only when the knob is up AND its own sin-squared phase is up " +
                 "-- 3.76% to 38.69% of angular asymmetry with one tongue lifted, 2.02% to 1.85% with all " +
                 "three flat, the corona being unable to fake either because it is a function of radius " +
                 "alone. *** A SABOTAGE ALSO CAUGHT A FALSE SENTENCE IN A ROW'S OWN TEXT, which is a first " +
                 "for this session: *** the simmer row claimed it would catch the granulation weighting being " +
                 "removed, and it does not -- moving it to cover the limb, sol.ts's own named first-build " +
                 "bug, changes the interior texture response by nothing to three decimals and the outline by " +
                 "0.01 percentage points, because the term it perturbs carries almost no light out where the " +
                 "disc is small. That claim is retracted in place. THREE CONSTANTS ARE TRANSCRIBED AND " +
                 "EXPLICITLY NOT GRADED, each with the measurement that decided it: the granulation " +
                 "weighting above, arc's grazing floor (3.8% of frame total), and sol's core occlusion (9.0% " +
                 "of the tongues' contribution at the most favourable moment in 400 s of the species' own " +
                 "clock, because a lifted tongue arches OUT of the disc where `hidden` is zero). A sabotage " +
                 "also forced a third conjunct into the bow row: zeroing the span terms so the knob drives " +
                 "WIDTH alone left the total light and the concentration both up by half, since a closed-form " +
                 "integral scales with w -- only the stroke's end-to-end reach separates longer from fatter, " +
                 "and under that sabotage it went the wrong way, x0.901 against the real x1.202. VERIFIED BY " +
                 "BYTES across all TWELVE species and three time-and-knob cases: 36 frames, 0 bytes different.",
    }),
    // v4636 -- THE 248th CLOSING: fathom and geode, the two heroes whose interiors are SOLVED, not marched.
    since257: Object.freeze({
        at: "v4636", swept: 2, green: 2, red: 0,
        added: Object.freeze([
            "tools/ship/murmurSpecies6-selfcheck.mjs",
            "tools/ship/murmurSpecies7-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green in 2,435 and 2,146 ms on the rotation, real WebGPU, 8 rows, carrying FATHOM and " +
                 "GEODE -- the ninth and tenth of murmur's eighteen and the only two that do not build " +
                 "their interiors out of the five taps of a ray march. fathom intersects three spheres " +
                 "analytically; geode intersects eight planes by the slab method. geode.ts opens by " +
                 "rejecting its own first build in terms this port has now met three times: \"A FACET IS A " +
                 "PLANE, AND THE FIRST BUILD'S WASN'T ... integrating a hard-edged structure through five " +
                 "samples averages exactly the angularity that was the point.\" *** TWO GATES FOR TWO " +
                 "SPECIES WHERE THE ROUND BEFORE MANAGED ONE FOR TWO, AND THE SPLIT WAS FORCED BY A " +
                 "MEASUREMENT RATHER THAN CHOSEN: *** written as one gate the pair came in at 5,064 ms " +
                 "against a 3,000 ms budget -- 69% over, which is the hazard the file's own header was " +
                 "about, met by the file itself on its first run. The cost is compiles, priced rather than " +
                 "guessed: one species and one frame is 931 ms and each additional species about 280. " +
                 "Trimming the shared ridge control from ten species to five landed at 3,499 and to four at " +
                 "3,161 -- both still over. FOURTEEN SABOTAGES, THIRTEEN RED BY NAME and the fourteenth " +
                 "green BY DESIGN (halting one of geode's two rotation angles leaves the stone turning, so " +
                 "the row must pass). *** TWO OF THE THIRTEEN WERE GREEN ON THE FIRST PASS AND ARE WHY TWO " +
                 "ROWS CHANGED SHAPE. *** Zeroing fathom's rk constants walked through the layers row " +
                 "because the row computed its prediction FROM the same table the shader reads -- the " +
                 "v4579 defect, a gate re-stating the formula it grades -- so the two ratios are now " +
                 "literals (x0.9600 and x0.8000) with the table checked against them, and the row's result " +
                 "is that the two visible ridges are the MIDDLE and SMALLEST shells, shell 0 predicting " +
                 "x1.0857 and missing by 13%. And halting geode's spin drift walked through the faces row, " +
                 "because mhKey turns with time for every species in this engine: a RIGID stone under a " +
                 "MOVING KEY gives exactly \"brightness swings, hotspot pinned\". That row now also reads " +
                 "the FOOTPRINT -- the pixels above the frame's own p90, a set the chord decides and the " +
                 "key cannot touch -- whose smallest step-to-step change is 0.409 live, 0.167 with the " +
                 "drift halted and 0.149 with both angles halted. THREE INSTRUMENTS WERE BUILT AND " +
                 "REJECTED, kept in the source with their numbers: gradient concentration measured " +
                 "SPARSENESS (still 75.1% and comet 72.1% beat geode's 27.0%), edge width measured the murk " +
                 "HALO (geode widest of ten at 12.96 px), and hue turn was too small to grade at 2.1 " +
                 "degrees. AND ONE CLAIM WAS RETRACTED RATHER THAN GRADED: fathom's composite order is its " +
                 "headline -- outer-in, inner-out, no sort -- and reversing it moves 361 bytes of 248,832 " +
                 "across 27 frames, every one by exactly 1 of 255, because the leading order-sensitive term " +
                 "is a SYMMETRIC pair sum. A row for it could only have asserted the frames are nearly the " +
                 "same either way, which is a row that cannot fail. VERIFIED BY BYTES across all TEN " +
                 "species and three time-and-knob cases: 30 frames, 0 bytes different -- and the baseline " +
                 "now carries its own case list, after capture and verify each held a private copy and a " +
                 "fresh capture failed its own verify on 2 of 30 frames the moment one was edited.",
    }),
    since256: Object.freeze({
        at: "v4635", swept: 0, green: 0, red: 0,
        added: Object.freeze([]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "*** NO GATE WAS ADDED AND FIVE GOT FASTER: render/aiPresenceOrbTsl.mjs STOPPED BUILDING " +
                 "EVERY SPECIES' BLOCK INTO EVERY SPECIES' SHADER. *** still's compiled fragment carried " +
                 "abyss's three-lane march, opal's four flashes, droplet's solve and both mist marches; only " +
                 "the density selector at the bottom picked one. THE EVIDENCE IS THE EMITTED WGSL RATHER " +
                 "THAN THE CLOCK: before, the eight species' shaders spanned 159,447 to 160,185 characters " +
                 "-- a spread of 738, 0.5%, which is the selector line and nothing else, because they were " +
                 "the same shader eight times. After: 41,231 to 56,776, a spread of 38%, and 1,277,983 -> " +
                 "394,231 in total, a 69% cut. On the rotation: gate one 2,834 -> 1,971 ms, two 2,256 -> " +
                 "1,515, three 2,565 -> 1,828, four 2,244 -> 1,607, five 2,663 -> 2,080, and " +
                 "aiPresenceOrb 2,440 -> 2,234 DESPITE gaining a second WGSL emission. Gate one went from " +
                 "166 ms of margin to 1,029, which is what unblocks the remaining ten species. VERIFIED BY " +
                 "BYTES, all eight species across three time-and-knob cases: 24 frames, 0 bytes different -- " +
                 "and all eight rather than the two touched, which is v4634's lesson wired in, since that " +
                 "round verified two species and took four gates red on the six it had not rendered. GATED " +
                 "IN tools/ship/aiPresenceOrb-selfcheck.mjs on a second emission that costs nothing, and the " +
                 "bound is on STILL because its shader cannot grow when species are added -- a first cut " +
                 "bounded the larger of two at 120,000 and a sabotage building two extra blocks slipped " +
                 "under it, since both shaders grew together and the spread never moved.",
    }),
    since249: Object.freeze({
        at: "v4623", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "tools/ship/murmurKit-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green in 1.1 s, real WebGPU in headless Chromium. Gates the shared kit all eighteen murmur-web species " +
                 "are built from -- render/murmurKit.mjs (CPU reference) and render/murmurKitTsl.mjs (TSL graph) -- which " +
                 "the ai-presence-orb-widget entry claimed the first orb round had ported and which, measured, was absent: " +
                 "mh_exit, mh_flourish, mh_medium, mh_scatter, mh_transmit, the march, MH_EXT and MH_SPREAD occurred ZERO " +
                 "times across both halves of that port. The integer avalanche is compared BIT-EXACTLY between f64 JS and a " +
                 "compiled WGSL shader on a GPU: 256 of 256 uint32s equal, packed one byte per channel so an 8-bit UNORM " +
                 "round-trips it losslessly; the gradient noise agrees on all 256 samples to the byte. TEN SABOTAGES, ALL " +
                 "RED BY NAME -- and FOUR of them were GREEN on the first sweep and are why the gate grew: the gradient " +
                 "lattice offset and the quintic fade both survive every CPU-only row, caught only once the NOISE render " +
                 "was moved INTO the gate from a note pleading browser-launch cost; the 2.2 exit cap row tested a ray whose " +
                 "true exit was 1.9, so deleting the clamp left it green, and now aims at one whose far root is 4.0; and " +
                 "sin^2 vs a plain sine passed the peak row (both peak at 1) until the row asked kit.ts's own stated " +
                 "property, zero slope at both ends. Provenance: murmur's avalanche is murmur3's fmix32 constants with a " +
                 "different FIRST shift, 15 against 16, and 63,999 of 64,000 lattice cells disagree -- run against this " +
                 "tree's own canonical copy in ev/esAuthority.js rather than argued. One row was wrong the other way and " +
                 "is kept: it held MH_SCATTER_K to 1/3.2^2 because kit.ts's PROSE says 3.2, when its CODE says 0.098.",
    }),
    since242: Object.freeze({
        at: "v4586", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "physics/labKnobs-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green in 0.5 s, headless. The twelve lab scenes the triage never saw: labScenes-selfcheck's page parser matched " +
                 "only two-space unquoted keys, so 'every scene has a triage row' held over 13 of 25; widened, re-pinned, and twelve " +
                 "rows written. Four registered with adjudicators that refuse on their own subject (apsidalKnob's black-hole and " +
                 "neutron-star: the apsidal advance, integration against quadrature, modulo a turn; impactKnob: the capture boundary " +
                 "from the start point with the pericentre and speed laws either side; hologramKnob: the separation read back from " +
                 "the fringes), eight refused, plasma and pendulum-wave on a measurement. Three of the page's status lines found wrong. " +
                 "Sabotages red at A / B / C / D / E; B and D crashed the first draft and report now.",
    }),
    since241: Object.freeze({
        at: "v4585", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "tools/ship/labHome-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green in 1.6 s, headless plus one page load in the harness browser. The Physics Lab's front door: lab-home.html is " +
                 "one Initiate button, a 2D live strip (scene, proposer and its pick, the adjudicator's verdicts newest first) with " +
                 "brain-3d.html a click away, and the curated presets as buttons, each with a line naming the instrument, its key and " +
                 "where it runs; physics/labHome.mjs derives every one of them from labPresets, labScenes.joinRegistered, " +
                 "proposers.listProposers, instruments.mjs and the v4584 routing ledger, and the gate grades the derivation against " +
                 "the live registry. Found: 12 of 25 curated presets name scenes the triage never assessed (their buttons say so), " +
                 "and no gate had ever held the presets to the triage. Sabotages red at A / B / C / D / E, the gate finishing each time.",
    }),
    since240: Object.freeze({
        at: "v4584", swept: 1, green: 1, red: 0,
        added: Object.freeze([
            "tools/ship/fleetRouting-selfcheck.mjs",
        ]),
        redOnArrival: Object.freeze([]),
        widened: Object.freeze([]),
        verdict: "green headless on box3d's wasm, 0.9 s; no GPU in it. Fleet brain routing, named: brain/fleetRouting.mjs makes a " +
                 "request { kind, scene, policy, ticks } and a routed row that names the peer that took it, over fleet.js's learned " +
                 "scheduler fed by the bridge's live registry; POST /ai/brain/route and GET /ai/brain/routed keep the ledger that " +
                 "server.html's gauge card, report.html's fleet rows and brain-fleet.html's cards read; the trainer's episodes and " +
                 "the race's lockstep tick ranges are routed the same way and run here, the ranges chaining to the record's " +
                 "fingerprint. Three corrections found by the gate: an ineligible peer was only slowed, not excluded; the " +
                 "scheduler's prior ignored the telemetry; the routed row dropped the request's payload. Sabotages red at " +
                 "A / B / C / D / E, and A crashed the gate's first draft on a null peer before it reported. Built on the branch " +
                 "as v4531 and relabelled at the merge: main had shipped v4531 to v4583 meanwhile.",
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
// v4613 -- *** THE ONE CALLER OF path.relative THAT posixAssumption.mjs'S OWN COUNT MISSED, AND THE ONE THAT
// MATTERED MOST. *** posixAssumption.mjs found 90 unnormalised path.relative call sites and explicitly
// declined to call them all defects -- "a relative path that is only ever printed is fine on any platform,
// and the ones that bite are those compared against a stored '/' form." This is exactly that case, and this
// file is the ONE population every red-register comparison in the tree is keyed against. On Windows,
// path.relative returns backslashes; redCensus.mjs's registers are literal "a/b.mjs" strings; Map.has() does
// exact string comparison. So EVERY gate already known red -- not a new regression, just already on record --
// came back as a "NEW RED" the first time this sweep ran end to end on a real Windows box, because
// "tools\\ship\\x.mjs" never equals "tools/ship/x.mjs" no matter how long it has been registered. Confirmed by
// running two of the reported "new" reds (boundaryLint, wiringClaims) here, on Linux, on the same commit --
// both are real, pre-existing, ALREADY-REGISTERED reds, misreported only by the separator. toPosix() is the
// exact helper this tree already uses in 30+ other files for this exact reason; the fix is that this file
// join(s the convention instead of being the one population-defining exception to it.
/**
 * *** v4639 -- THE NAMES THAT LOOK LIKE GATES, ARE NOT, AND CANNOT BE SPELLED OUT OF THE POPULATION. ***
 *
 * Two gates plant a file named `*-selfcheck.mjs` at an ordinary path and delete it in a `finally`:
 *
 *   tools/ship/zz-temp-fixture-selfcheck.mjs      gatesBridge-selfcheck.mjs, whose body is `process.exit(3)`
 *   tools/ship/zz-treeread-fixture-selfcheck.mjs  treeRead-selfcheck.mjs's DECOY
 *
 * `finally` does not run under SIGKILL, and quickSweep SIGKILLs a gate at a 20 s cap. MEASURED: with the
 * first one on disk enumerateGates returns 1738 instead of 1737 AND INCLUDES IT, so the next sweep reports
 * `zz-temp-fixture-selfcheck.mjs exit 3` as a NEW RED for a gate that is in no commit, and the count moves
 * four hand-maintained censuses with it.
 *
 * *** AND THE OBVIOUS FIX IS WRONG, WHICH IS WHY THIS IS A LIST AND NOT A PREFIX RULE. *** Renaming them to
 * the `__` convention this enumerator already excludes would break both callers: gatesBridge only runs a name
 * that appears in its DISCOVERED list ("ONLY a discovered gate may run", gatesBridge.js:107), so an excluded
 * fixture returns not-a-gate and section 5 stops testing anything; and treeRead's `zz-` file is a DECOY whose
 * entire job is to be an ORDINARY name, proving the exclusion turns on `__` and not on fixtures generally.
 * Both must look like real gates WHILE THEY LIVE. So the population is not narrowed -- a LEFTOVER is named.
 */
export const TRANSIENT_FIXTURES = Object.freeze([
    "tools/ship/zz-temp-fixture-selfcheck.mjs",
    "tools/ship/zz-treeread-fixture-selfcheck.mjs",
]);

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
            else if (e.name.endsWith("-selfcheck.mjs") && !e.name.startsWith("__")) out.push(toPosix(path.relative(root, full)));
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
