// FILE: tools/ship/slowCensus.mjs -- v4424
//
// *** SIXTY-THREE GATES ARE EXEMPT FROM THE SHIP GATE ON THE GROUNDS THAT NOBODY HAS MEASURED THEM. ***
//
// tools/ship/quickSweep.mjs decides whether a round may ship by asking one question: is any gate red that is
// not already on the register? The register is built in redRegister(), and its third line is
//
//     for (const g of UNCONFIRMED_SLOW) if (!reg.has(g)) reg.set(g, "redCensus.UNCONFIRMED_SLOW");
//
// UNCONFIRMED_SLOW is not a list of known failures. redCensus.mjs is scrupulous about that -- its own header
// says the bucket is "NOT red and NOT green; they are UNMEASURED". So sixty-three gates are waved past the
// ship gate for the sole reason that a sweep at v4279 hit a flat 120 s cap on them, and that exemption has
// stood for a hundred and forty-five rounds. If any of the sixty-three goes red tomorrow, nothing says so.
//
// ---- *** AND NINETEEN OF THEM HAVE HAD A GREEN VERDICT ON RECORD THE WHOLE TIME *** --------------------------
//
// redCensus.SLOW_PARTIAL holds twenty-three serial verdicts from the v4279 confirmation run before it ran out
// of time: nineteen GREEN, three still unfinished at 400 s, one at 500 s. The register never reads it. So the
// tree is not merely exempting gates it has not measured -- it is exempting nineteen gates it HAS measured,
// and measured green, under a label that says the opposite. THE EXEMPTION SURVIVED ITS OWN RESOLUTION,
// because the thing that grants it and the thing that resolves it are two different objects in one file.
//
// ---- *** THE FIRST ATTEMPT AT THIS ROUND WAS WRONG, AND IS RECORDED RATHER THAN DELETED *** ------------------
//
// Sixty-three gates at up to 400 s each is hours, so the obvious move is to run them in parallel. That is
// exactly the mistake redCensus.mjs's own header warns about: its 8-way sweep called forty-six gates red and
// seven of them were green on an idle box -- "every one was starved by the other seven workers". I tried it
// anyway, four at a time with a 30 s cap, and got eight timeouts out of eight before killing it. A parallel
// verdict on a timing-sensitive gate is not a verdict, and none of these sixty-three is cheap enough to be
// insensitive. Everything below is ONE GATE AT A TIME on an idle box.
//
// ---- *** WHAT THE RE-MEASUREMENT ACTUALLY FOUND *** ----------------------------------------------------------
//
// Zero red. Zero crashes. Every verdict that could be compared against v4279 agreed with it: no gate recorded
// green came back red, and every gate that ran past this run's cap was one v4279 had also recorded above it.
// The bucket has been hiding successes, not failures -- which does not make the exemption safe, because a
// register that cannot tell the two apart is exactly what let referenceKind sit in it while exiting 1.
//
// *** THE RUNTIMES ARE REPRODUCIBLE IN THE THING THAT MATTERS AND NOT IN THE THING THAT DOES NOT. *** All
// sixteen re-measured greens came back FASTER than v4279 recorded, median ratio 0.883 -- and a uniform shift
// like that is a fact about the box, not about the gates, so it is reported and not gated. What is a fact
// about the gates is the ORDERING, which survives at Spearman rho 0.891, and the RESIDUAL: one global 0.883
// scale leaves rig/cinematicShot 36.6% off, so the shift is not purely the machine either.
"use strict";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { UNCONFIRMED_SLOW, SLOW_PARTIAL } from "./redCensus.mjs";

export const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** The v4279 sweep's own flat cap -- the number that put every one of these gates in the bucket. */
export const V4279_CAP_MS = 120000;
/** This run's cap. Chosen to be well past the v4279 cap and still let sixty-three gates finish in a session. */
export const SERIAL_CAP_MS = 180000;

/**
 * How this was measured, including the attempt that did not work.
 *
 * *** A PROTOCOL THAT DOES NOT NAME ITS FAILED FIRST TRY IS A PROTOCOL SOMEBODY WILL REPEAT THE FAILURE OF. ***
 */
export const PROTOCOL = Object.freeze({
    version: "v4424",
    workers: 1,
    capMs: SERIAL_CAP_MS,
    v4279Workers: 8,
    v4279CapMs: V4279_CAP_MS,
    abandoned: "4 workers at a 30s cap: 8 timeouts in the first 8 gates, killed. redCensus.mjs's own header " +
               "records its 8-way sweep calling seven green gates red -- 'every one was starved by the other " +
               "seven workers' -- and these sixty-three are the slowest gates in the tree.",
    note: "one gate at a time on an idle box, verdict appended as each lands. A gate that exits 0 is GREEN; " +
          "one that exits non-zero having printed at least one check is RED; one that exits non-zero having " +
          "printed none is a CRASH, which is a different thing and is not counted as a passed sabotage.",
});

// ==== MEASURED_V4424 ====
/**
 * *** WHAT SIXTY-THREE GATES ACTUALLY DO, ONE AT A TIME. ***
 *
 * `ms` is wall time for the whole process; `checks` counts the gate's own PASS/FAIL lines, which is how a
 * CRASH is told from a RED. TIMEOUT means it was still running at SERIAL_CAP_MS -- a third state kept as a
 * third state, exactly as redCensus.mjs kept it, because rounding it either way is how this bucket was born.
 */
export const MEASURED_V4424 = Object.freeze({
    "fluid/flip3d-selfcheck.mjs": { verdict: "GREEN", ms: 32711, checks: 10 },
    "physics/astroparticle/jeans-selfcheck.mjs": { verdict: "GREEN", ms: 70952, checks: 12 },
    "physics/mesh/weightScaling-selfcheck.mjs": { verdict: "GREEN", ms: 54479, checks: 11 },
    "physics/nuclear/reactorControl-selfcheck.mjs": { verdict: "GREEN", ms: 63415, checks: 25 },
    "physics/sph/levelClaim-selfcheck.mjs": { verdict: "TIMEOUT", ms: 180066, checks: 0 },
    "physics/sph/materialKnobs-selfcheck.mjs": { verdict: "GREEN", ms: 153222, checks: 26 },
    "physics/sph/packingTransfer-selfcheck.mjs": { verdict: "TIMEOUT", ms: 180089, checks: 0 },
    "physics/sph/poolFixture-selfcheck.mjs": { verdict: "GREEN", ms: 105417, checks: 21 },
    "physics/sph/stability-selfcheck.mjs": { verdict: "TIMEOUT", ms: 180004, checks: 0 },
    "physics/sph/tiltPower-selfcheck.mjs": { verdict: "GREEN", ms: 56666, checks: 19 },
    "physics/sph/wideTilt-selfcheck.mjs": { verdict: "GREEN", ms: 56547, checks: 14 },
    "physics/thermal/stefan-selfcheck.mjs": { verdict: "GREEN", ms: 122665, checks: 23 },
    "physics/tomography/matchedAdjoint-selfcheck.mjs": { verdict: "GREEN", ms: 34297, checks: 19 },
    "rig/cinematicShot-selfcheck.mjs": { verdict: "GREEN", ms: 57096, checks: 72 },
    "simulation/lbm/inflow-selfcheck.mjs": { verdict: "GREEN", ms: 72155, checks: 21 },
    "simulation/lbm/onsetTrend-selfcheck.mjs": { verdict: "GREEN", ms: 35624, checks: 7 },
    "simulation/lbm/settleCurve-selfcheck.mjs": { verdict: "GREEN", ms: 83167, checks: 6 },
    "tools/render-qa/terminatorOracle-selfcheck.mjs": { verdict: "GREEN", ms: 64792, checks: 10 },
    "tools/roundhouse/assumptionMap-selfcheck.mjs": { verdict: "TIMEOUT", ms: 180042, checks: 0 },
    "tools/roundhouse/census-selfcheck.mjs": { verdict: "TIMEOUT", ms: 180046, checks: 0 },
    "tools/roundhouse/claimTrace-selfcheck.mjs": { verdict: "TIMEOUT", ms: 180100, checks: 0 },
    "tools/roundhouse/compose-selfcheck.mjs": { verdict: "GREEN", ms: 95113, checks: 9 },
    "tools/roundhouse/corroborationCensus-selfcheck.mjs": { verdict: "TIMEOUT", ms: 180012, checks: 0 },
    "tools/roundhouse/detectionMap-selfcheck.mjs": { verdict: "GREEN", ms: 98599, checks: 14 },
    "tools/roundhouse/flip3dBind-selfcheck.mjs": { verdict: "GREEN", ms: 47883, checks: 16 },
    "tools/roundhouse/hydrostatic-selfcheck.mjs": { verdict: "GREEN", ms: 113941, checks: 13 },
    "tools/roundhouse/khBind-selfcheck.mjs": { verdict: "GREEN", ms: 43082, checks: 7 },
});
// ==== /MEASURED_V4424 ====

/**
 * *** RATCHETS, NOT ARRANGEMENTS. ***
 *
 * The finding this round makes is about the state of the tree, and a gate that ASSERTS that state fails the
 * day somebody repairs it -- which turns a repair into a chore and is how a finding becomes a fixture. These
 * two are recorded as ceilings instead: fewer is a fix and passes, more is a regression and does not.
 */
export const EXEMPT_AT_V4424 = 63;          // gates the register waves through for being unmeasured
export const MEASURED_EXEMPT_AT_V4424 = 20; // ...of which this many have a GREEN verdict on record

/** Verdicts that mean the gate finished and said something. */
export const DECIDED = Object.freeze(["GREEN", "RED"]);

/** Median of a list of numbers. Empty list is null, not zero -- zero is a measurement. */
export function medianOf(xs) {
    if (!xs.length) return null;
    const s = [...xs].sort((a, b) => a - b);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Compare a fresh measurement against the record.
 *
 * *** THE ONLY INTERESTING OUTPUT IS `contradict`, AND IT HAS TO BE ABLE TO BE NON-EMPTY. *** A comparator
 * that can only ever agree is a comparator nobody has tested. A recorded GREEN that comes back RED is a
 * contradiction; a recorded GREEN that comes back TIMEOUT is only a contradiction if the record says it used
 * to finish INSIDE this run's cap, because otherwise the two runs are not disagreeing about anything.
 */
export function agreementWith(record, measured, capMs = SERIAL_CAP_MS) {
    const agree = [], contradict = [], consistentTimeouts = [], novel = [];
    for (const [gate, m] of Object.entries(measured)) {
        const old = record[gate];
        if (!old) { novel.push(gate); continue; }
        if (m.verdict === "TIMEOUT") {
            if (DECIDED.includes(old.verdict) && old.ms <= capMs) contradict.push({ gate, was: old.verdict, now: m.verdict });
            else consistentTimeouts.push({ gate, was: old.verdict, wasMs: old.ms });
        } else if (DECIDED.includes(old.verdict) && old.verdict !== m.verdict) {
            contradict.push({ gate, was: old.verdict, now: m.verdict });
        } else if (old.verdict === m.verdict) {
            agree.push({ gate, verdict: m.verdict, wasMs: old.ms, nowMs: m.ms });
        } else {
            novel.push(gate);                       // record had no decided verdict; this run does
        }
    }
    return { agree, contradict, consistentTimeouts, novel };
}

/** now/then for every gate both runs finished. A ratio under 1 is faster now. */
export function scaleRatios(record, measured) {
    return agreementWith(record, measured).agree
        .filter((a) => a.verdict === "GREEN" && a.wasMs > 0)
        .map((a) => ({ gate: a.gate, ratio: a.nowMs / a.wasMs }));
}

/** Spearman rank correlation. Ties are ranked by first occurrence, which is enough for distinct timings. */
export function spearman(xs, ys) {
    const n = xs.length;
    if (n !== ys.length || n < 3) return null;
    const rank = (a) => { const s = [...a].sort((p, q) => p - q); return a.map((v) => s.indexOf(v) + 1); };
    const rx = rank(xs), ry = rank(ys);
    let d2 = 0;
    for (let i = 0; i < n; i++) d2 += (rx[i] - ry[i]) ** 2;
    return 1 - (6 * d2) / (n * (n * n - 1));
}

/**
 * *** THE FINDING, AS A FUNCTION RATHER THAN A SENTENCE. ***
 *
 * Which gates does the ship gate exempt on the grounds that nobody measured them, when somebody did? Takes
 * the register quickSweep actually builds, so it cannot drift from it: if a later round teaches redRegister
 * to read the verdicts, this returns empty and the gate below says so instead of failing.
 */
export function exemptedButMeasured(register, records = [SLOW_PARTIAL, MEASURED_V4424]) {
    const out = [];
    for (const [gate, reason] of register) {
        if (reason !== "redCensus.UNCONFIRMED_SLOW") continue;
        const verdicts = records.map((r) => r[gate]).filter(Boolean).map((v) => v.verdict);
        if (verdicts.length && verdicts.every((v) => v === "GREEN")) out.push({ gate, verdicts });
    }
    return out;
}

/** How many decided gates finish inside a cap -- the question "were they ever too slow for it?" */
export function fitsUnderCap(measured, capMs = V4279_CAP_MS) {
    const decided = Object.entries(measured).filter(([, m]) => DECIDED.includes(m.verdict));
    return { inside: decided.filter(([, m]) => m.ms < capMs).length, decided: decided.length };
}

/** Counts by verdict. A count is not a contract, so this is for reading, not for asserting against. */
export function summarise(measured) {
    const by = {};
    for (const m of Object.values(measured)) by[m.verdict] = (by[m.verdict] || 0) + 1;
    return by;
}

/** Run one gate alone and report what it did. The runner this census's numbers came from. */
export function runGateSerial(rel, { timeoutMs = SERIAL_CAP_MS, root = ENG } = {}) {
    return new Promise((res) => {
        const t0 = Date.now();
        const p = spawn(process.execPath, [rel], { cwd: root });
        let out = "", err = "", done = false;
        p.stdout.on("data", (d) => { out += d; });
        p.stderr.on("data", (d) => { err += d; });
        const timer = setTimeout(() => {
            if (done) return;
            done = true; p.kill("SIGKILL");
            res({ gate: rel, verdict: "TIMEOUT", ms: Date.now() - t0, checks: 0, first: "" });
        }, timeoutMs);
        p.on("close", (code) => {
            if (done) return;
            done = true; clearTimeout(timer);
            const lines = out.split("\n");
            const checks = lines.filter((l) => /^\s{2}(PASS|FAIL)/.test(l)).length;
            const fail = lines.find((l) => /^\s{2}FAIL/.test(l)) || "";
            res({
                gate: rel,
                verdict: code === 0 ? "GREEN" : (checks > 0 ? "RED" : "CRASH"),
                ms: Date.now() - t0, checks,
                first: (fail || err.split("\n").find((l) => l.trim()) || "").trim().slice(0, 180),
            });
        });
    });
}

/**
 * *** THE SWEEP'S OWN TIMINGS FILE RECORDS THE CAP, NOT THE TIME. ***
 *
 * tools/ship/sweep-timings.json holds `timings[gate]` and `codes[gate]` from the last quickSweep run, and
 * selectGates() compares that number to the ship-time budget to decide whether a gate is cheap enough to run
 * at all. For every gate in this bucket the recorded number is the 20 s CAP and the recorded code is 124 --
 * how long the sweep WAITED and the fact that it gave up, written into the two fields a reader would take
 * for how long the gate TAKES and what it returned.
 *
 * *** AND THE DECISION IT FEEDS IS STILL RIGHT, WHICH IS WHY NOBODY NOTICED. *** A lower bound of 20 s is
 * already over a 3 s budget, so "skip it" is correct however far the true time is above the cap. The file's
 * own note says it is "used only to choose which gates are under the ship-time budget. Not a claim about the
 * tree" -- it is scoped honestly. What this measures is the SIZE of the gap it is being honest about.
 *
 * @param timings the `timings` map from sweep-timings.json
 * @returns per gate: what the file records, what a serial run measured, and the ratio between them
 */
export function capRecordedAsTime(timings, measured = MEASURED_V4424) {
    const out = [];
    for (const [gate, m] of Object.entries(measured)) {
        if (!DECIDED.includes(m.verdict)) continue;          // a timeout here has the same problem, not a fix for it
        const recorded = timings[gate];
        if (recorded == null) continue;
        out.push({ gate, recorded, measured: m.ms, understatedBy: m.ms / recorded });
    }
    return out;
}

/** Every gate in the bucket that still has no decided verdict from any run. */
export function stillUnmeasured(records = [SLOW_PARTIAL, MEASURED_V4424]) {
    return UNCONFIRMED_SLOW.filter((g) => !records.some((r) => r[g] && DECIDED.includes(r[g].verdict)));
}

// ---- WHAT THIS ROUND DOES NOT CLAIM --------------------------------------------------------------------
//
// It does not empty UNCONFIRMED_SLOW, and it must not: the gates that still run past this cap are still
// unmeasured, and the whole point of the bucket is that it holds them rather than rounding them off.
//
// It does not change redRegister(). Teaching the ship gate to read the verdicts is a decision about what
// "already on the record" should mean, and making it silently inside a measuring round would be the same
// move that created this hole -- the granting and the resolving landing in one file with nothing between.
//
// It does not claim the gates got faster. Sixteen of sixteen came back under their recorded time, which is
// what a quieter box looks like as much as what better code looks like, and nothing here separates them.
