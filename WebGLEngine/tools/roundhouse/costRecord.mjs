// tools/roundhouse/costRecord.mjs -- v4080
//
// *** WHAT EACH BUILD ACTUALLY COST, MEASURED AND KEPT, BECAUSE A RAW-CALL COUNT IS NOT A COST MODEL. ***
//
// corroborationCensus.mjs's decline logic (v4037) already asks a device what it costs before starting it, via
// the OPTIONAL `costHint` a device may declare -- but as of v4038a only one device in the lab (twof) declares
// one, so the decline check does nothing for the other 128. The obvious next move is to derive a hint from a
// number the census already counts for every device: `rawCalls`, the libm-call tripwire corroborationCensus.mjs
// carries for a completely different reason (portability). It was proposed, measured, and refused. MEASURED ON
// THIS MACHINE, one build of each device's named mode, timed directly (not read from a census log -- see the
// contention warning below for why that distinction matters):
//
//     kuramoto.curve       19396 ms   353,976,576 calls      54.8 ms/Mcall
//     twof.inlet           92078 ms   108,192,309 calls     851.1 ms/Mcall
//     stability.response   16355 ms     3,430,000 calls    4768.2 ms/Mcall
//
// kuramoto makes 3.3x MORE libm calls than twof and costs 4.75x LESS wall time -- and stability, with the
// FEWEST calls of the three by two orders of magnitude, is the MOST expensive per build. Not a weak predictor
// -- an ANTI-predictor at the extremes: ms-per-Mcall spans 87x between kuramoto and stability alone in this
// sample (4768.2 / 54.8), and a scheduler that ranked these three by rawCalls would put kuramoto LAST when it
// is in fact the cheapest of the three by a wide margin. A call counter cannot price the work a build does
// BETWEEN calls -- SPH neighbour search and an energy-conservation sweep (stability), an LBM lattice update
// (twof) -- which is exactly what those two devices spend most of their time on and kuramoto barely touches.
// rawCalls is blind to that by construction, so a fitted proxy built on it would be precise and wrong.
//
// *** SO THE RECORD IS THE MEASUREMENT ITSELF, WHICH IS THE THING A FITTED PROXY WAS ONLY EVER APPROXIMATING.
// *** corroborationCensus already produces (device, mode, ms) for every build a complete run makes. Keeping
// that costs nothing extra and is strictly better than any model of it: it needs no coefficients, it cannot be
// wrong about a device whose cost is unlike its neighbours', and it improves automatically every time the
// census is re-frozen.
//
// THREE THINGS IT IS NOT, STATED SO IT IS NOT MISTAKEN FOR THEM:
//
//   NOT PHYSICS. Nothing here can change a reported number. A cost record is consulted to decide whether to
//   ATTEMPT a build, never to decide what one means, and every consumer must behave identically with the file
//   absent -- which is the state of a fresh checkout on a machine nobody has frozen it on.
//
//   NOT PORTABLE. These are milliseconds on whoever ran the freeze, on whatever else that machine was doing at
//   the time -- so `frozenOn` records when, and a reader is entitled to distrust the absolute numbers across
//   machines while still trusting their RELATIVE order, which is the only thing a scheduling decline needs.
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
 * only when asked, so it stays a gate rather than becoming a gate and a report at once (capabilityCard-
 * selfcheck's rule). This file's own convention is SWEK_FREEZE_DEVICE_COST=1, checked in
 * corroborationCensus-selfcheck.mjs beside the sweep that already produces the numbers to freeze.
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
