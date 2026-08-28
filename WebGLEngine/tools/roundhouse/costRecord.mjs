// tools/roundhouse/costRecord.mjs -- v4041
//
// *** WHAT EACH BUILD ACTUALLY COST, MEASURED AND KEPT, BECAUSE THE PROXY DID NOT WORK. ***
//
// v4040 proposed deriving a cost model from rawCalls -- a number the census already reports, and whose use
// would have removed the one hand-calibrated constant in this lab's scheduling. It was measured first and
// refused: kuramoto makes 3.3x more libm calls than twof and takes 15x LESS time, and ms-per-Mcall spans
// 267x across the lab. A counter of one kind of work cannot price the others.
//
// *** SO THE RECORD IS THE MEASUREMENT ITSELF, WHICH IS THE THING A FITTED PROXY WAS ONLY EVER APPROXIMATING.
// *** corroborationCensus already produces (device, mode, ms) for all 484 builds on every full run. Keeping
// that costs nothing and is strictly better than any model of it: it needs no coefficients, it cannot be
// wrong about a device whose cost is unlike its neighbours', and it improves automatically every time the
// census is re-frozen.
//
// THREE THINGS IT IS NOT, STATED SO IT IS NOT MISTAKEN FOR THEM:
//
//   NOT PHYSICS. Nothing here can change a reported number. A cost record is consulted to decide whether to
//   ATTEMPT a build, never to decide what one means, and every consumer must behave identically with the file
//   absent -- which is the state of a fresh checkout on a machine nobody has frozen it on.
//
//   NOT PORTABLE. These are milliseconds on whoever ran the freeze, and kuramoto once read 1044 s in a
//   contended census log against 28 s measured directly, so `frozenOn` records the conditions and a reader is
//   entitled to distrust them.
//
//   *** AND THE DOMINANT VARIANCE IS NOT OTHER PROCESSES, WHICH TOOK A MEASUREMENT TO SEE. *** twof.inlet, at
//   one unchanging config, timed 115.7 s and 117.0 s and then 205.0, 207.7 and 212.5 s. The split is not
//   instrumented against bare -- 115.7 and 212.5 are BOTH instrumented -- and the freeze that produced 212.5
//   ran alone on an idle machine. The split is FIRST HEAVY BUILD IN A FRESH PROCESS against everything after
//   it: the eighty devices the census builds beforehand leave a heap that makes an LBM run take almost twice
//   as long.
//
//   *** THAT MAKES THIS A RECORD OF COST IN CENSUS POSITION, AND THAT IS THE RIGHT QUANTITY. *** A budget
//   needs to know what a device will cost WHEN THE SWEEP REACHES IT, not what it costs alone in a fresh
//   process. So the 212.5 s here is the useful number and the isolated 115.7 s is the misleading one -- which
//   is the opposite of the conclusion the isolated measurement invited, and the reason this paragraph exists.
//
//   *** AND THE REPEATABILITY WAS MEASURED TOO, BECAUSE "DISTRUST THEM" IS NOT A NUMBER. *** The paragraphs
//   above are all about how far a cost can move, and they are worth little without the other bound: how far
//   it moves when nothing changes. quantum's sweep cost was frozen at 100481 ms and then re-measured, alone
//   and in the same position, at 100264 ms -- 0.2 % apart. SO THE NOISE FLOOR AT FIXED POSITION IS TENTHS OF
//   A PERCENT AND EVERY LARGE DISCREPANCY IN THIS FILE'S HISTORY WAS POSITION OR CONTENTION, NEVER JITTER.
//   That is what makes the 1.9x and 15x readings above diagnosable instead of just noisy: a lab whose
//   repeat measurements disagreed by 50 % could not have told any of those stories.
//
//   NOT A RATCHET. corroboration-reach-baseline.json exists to catch a number FALLING and says so. This one
//   carries no assertion at all: a device getting slower is news about the device, not a regression in the
//   record, and pinning costs with === would fire on every machine that is not the one that froze it.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const COST_BASELINE = path.join(HERE, "device-cost-baseline.json");

/** The whole record, or an empty one. A MISSING FILE IS NORMAL and never an error. */
export function readCostRecord(file = COST_BASELINE) {
    try { return JSON.parse(fs.readFileSync(file, "utf8")); }
    catch { return { frozenOn: null, costs: {} }; }
}

/**
 * Measured milliseconds for one device/mode at its DEFAULT config, or null.
 * *** null MEANS UNKNOWN AND NEVER MEANS FREE. *** A caller that treated a missing entry as zero would
 * schedule the most expensive unmeasured device first, which is precisely backwards.
 */
export function costFor(device, mode, rec = null) {
    const r = rec || readCostRecord();
    const v = r && r.costs && r.costs[device + "." + mode];
    return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * Freeze a set of { device, mode, ms } observations. WRITTEN ONLY FROM AN EXPLICIT FREEZE, following
 * corroborationReach's convention (SWEK_FREEZE_CORROBORATION_REACH=1): a gate reads by default and records
 * only when asked, so it stays a gate rather than becoming a gate and a report at once.
 */
export function writeCostRecord(pairs, { file = COST_BASELINE, note = "" } = {}) {
    const costs = {};
    for (const p of pairs) {
        if (!p || typeof p.ms !== "number" || !Number.isFinite(p.ms)) continue;
        costs[p.device + "." + p.mode] = p.ms;
    }
    const body = {
        frozenOn: new Date().toISOString(),
        note: note || "milliseconds per build at DEFAULT config, on the machine that froze this. Scheduling only.",
        entries: Object.keys(costs).length,
        costs,
    };
    fs.writeFileSync(file, JSON.stringify(body, null, 1));
    return body;
}

/**
 * *** v4049 -- AND THE COST OF SWEEPING A DEVICE IS NOT DERIVABLE FROM THE COST OF BUILDING IT. ***
 *
 * The exhaustive sweep budgets each device by formula: sum(modeCosts) x 2 x (1 + 3K), being plant states, a
 * base build, and three ladder rungs per knob. v4048's echo confirmation broke that. Proving a TRUE echo
 * costs up to K-1 extra builds, so the worst case becomes 1 + 3K^2 -- for K=10 that is 31 -> 301, tenfold --
 * but only echo-heavy devices pay anything at all, and a FALSE echo usually breaks on the first knob tried.
 *
 * MEASURED, five devices with K between 6 and 9, as a multiple of sum(modeCosts):
 *
 *     invariants  K=7    2.5x        seismic     K=8    6.7x
 *     thermostat  K=6   19.5x        acoustics   K=7   23.1x
 *     centrifuge  K=9   82.3x
 *
 * *** A 33x SPREAD ACROSS NEARLY IDENTICAL KNOB COUNTS. *** The formula yields 38-56x over that range, so it
 * OVER-budgets invariants by fifteenfold and UNDER-budgets centrifuge by half -- wrong in both directions at
 * once, and the second direction is what produced 142 unanswered rows. What varies is how echo-heavy a device
 * is, which is exactly the thing a coefficient cannot know in advance.
 *
 * So sweep cost is MEASURED and kept, on the same terms as build cost and for the same reason v4040 refused
 * to model cost from rawCalls: when a proxy spans two orders of magnitude, the measurement is the model.
 */
export function sweepCostFor(device, rec = null) {
    const r = rec || readCostRecord();
    const v = r && r.sweepCosts && r.sweepCosts[device];
    return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * Freeze measured exhaustive-sweep costs. Separate from writeCostRecord because they are measured by a
 * different run -- build cost comes from corroborationCensus, sweep cost from knobLiveness --- and merging
 * them into one freeze would mean neither could be refreshed without paying for both.
 *
 * `atLeast` marks a device that did NOT complete inside the budget it was given: its true cost is unknown and
 * above this figure, which is a bound and must never be read as a measurement.
 */
export function writeSweepCosts(entries, { file = COST_BASELINE } = {}) {
    const rec = readCostRecord(file);
    rec.sweepCosts = rec.sweepCosts || {};
    rec.sweepAtLeast = rec.sweepAtLeast || {};
    for (const e of entries) {
        if (!e || typeof e.ms !== "number" || !Number.isFinite(e.ms)) continue;
        if (e.complete) { rec.sweepCosts[e.device] = e.ms; delete rec.sweepAtLeast[e.device]; }
        else { rec.sweepAtLeast[e.device] = e.ms; delete rec.sweepCosts[e.device]; }
    }
    rec.sweepFrozenOn = new Date().toISOString();
    fs.writeFileSync(file, JSON.stringify(rec, null, 1));
    return rec;
}

/** The devices worth knowing about: the ones a budget will trip over. */
export function dearest(rec = null, n = 10) {
    const r = rec || readCostRecord();
    return Object.entries((r && r.costs) || {})
        .sort((a, b) => b[1] - a[1]).slice(0, n)
        .map(([k, ms]) => k + " " + (ms / 1000).toFixed(1) + " s");
}
