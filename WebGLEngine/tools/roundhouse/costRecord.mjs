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
//   NOT PORTABLE. These are milliseconds on whoever ran the freeze. The same twof build in this session was
//   timed at 115.7 s idle and 205.0 s under load, a 1.8x spread from contention alone, and kuramoto once read
//   1044 s in a contended census log against 28 s measured directly. A record frozen on a busy machine
//   over-states, which is the direction that DECLINES work that would have fitted -- the wrong direction --
//   so `frozenOn` records the conditions and a reader is entitled to distrust it.
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

/** The devices worth knowing about: the ones a budget will trip over. */
export function dearest(rec = null, n = 10) {
    const r = rec || readCostRecord();
    return Object.entries((r && r.costs) || {})
        .sort((a, b) => b[1] - a[1]).slice(0, n)
        .map(([k, ms]) => k + " " + (ms / 1000).toFixed(1) + " s");
}
