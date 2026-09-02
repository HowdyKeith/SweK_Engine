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
