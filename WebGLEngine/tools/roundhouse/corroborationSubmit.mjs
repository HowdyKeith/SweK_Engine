// tools/roundhouse/corroborationSubmit.mjs
//
// v4481 -- CRITERION 4 HAS AN UNANSWERABLE MAJORITY, AND THE MAILBOX CANNOT CARRY THE ANSWER.
//
// v2891's fourth criterion is PORTABILITY: re-measure on another architecture and get the same bits. v2889
// established the single-machine half of it, and the argument is sound -- a measurement whose code path touches
// only IEEE-specified operations (+ - * / sqrt fma) CANNOT differ across conforming machines, because there is
// nothing left for two libms to disagree about. So a quantity with zero raw transcendental calls is PORTABLE BY
// CONSTRUCTION and needs no second machine at all.
//
// MEASURED OVER v4480'S SCOPED SET -- 27 keyless observables across seven device/modes:
//
//     lens.deflect        7 observables, rawCalls 0        -- portable by construction, settled
//     splat.compose       1 observable,  rawCalls 1
//     chaos.feigenbaum    1 observable,  rawCalls 5
//     splat.perspective   3 observables, rawCalls 13
//     splat.integral      2 observables, rawCalls 65,542
//     kepler.conserve     8 observables, rawCalls 80,002
//     kepler.compare      5 observables, rawCalls 160,004
//
// SEVEN ARE SETTLED BY THE ARGUMENT AND TWENTY ARE NOT. For those twenty -- 74% of the population -- the only
// thing that answers criterion 4 is another machine running the same code and reporting the same bits. v4480
// substituted a SIMULATED one-ulp libm shift, which measures conditioning rather than portability: it says how
// far a quantity WOULD move if a libm differed, not whether any real libm does.
//
// ------------------------------------------------------------------------------------------------------------
// *** THE TREE HAS A FLEET AND A MAILBOX AND THE MAILBOX CANNOT CARRY A MEASUREMENT. ***
//
// ai-bridge/androidPeerBridge.js has accepted device submissions since v2949 through the narrowest endpoint in
// the tree: a device supplies CONTENT and never a destination, and six kinds map to six fixed filenames. All
// six are GPU benches or transcripts. Not one carries the value of an observable, so the fleet -- Android
// phones, the Steam Deck peer machinery of v4140, any desktop that can open a page -- has never been able to
// answer the one question criterion 4 asks.
//
// This file is that kind, and it keeps every rule the surface already earned:
//
//   1. THE DEVICE MEASURES, THE HUB ADJUDICATES. A submission carries values and nothing else. gradeSubmission
//      runs HERE. deviceLedger.mjs's third rule, unchanged: "a device can never write its own verdict into the
//      fleet record".
//   2. APPEND, NEVER OVERWRITE, keyed by content. deviceKey() is IMPORTED from deviceLedger rather than
//      re-derived -- a second hash of the same three fields is the second copy nobody updates.
//   3. BITS, NOT NUMBERS. Agreement is asked of the f64 bit pattern. "The same value" through a float32 path,
//      or through a formatter that rounds at 15 digits, is not the same value, and criterion 4's whole subject
//      is the last bit. The report carries both so a reader sees the number and the comparison sees the bits.
//
// *** AND NOTHING HAS SUBMITTED. *** No second machine has posted a corroboration report, so the fleet count in
// any real ledger is zero and not one of the twenty is settled by this round. What exists now is the path and
// its grader, exercised by fixture; what does not exist is a measurement. Saying that plainly is the difference
// between building a road and claiming a journey.

import crypto from "node:crypto";
import { deviceKey } from "./deviceLedger.mjs";

/** The submission kind. Must also appear in androidPeerBridge.js's KINDS allow-list to be accepted. */
export const CORROBORATION_KIND = "swek-corroboration-observables";
export const CORROBORATION_FILE = "corroboration-observables.json";
export const LEDGER_KIND = "swek-corroboration-ledger";

const BITS = new DataView(new ArrayBuffer(8));
/** The f64 bit pattern, as 16 hex characters. This is what agreement is asked of. */
export function bitsOf(x) {
    BITS.setFloat64(0, x);
    return BITS.getBigUint64(0).toString(16).padStart(16, "0");
}
export function fromBits(hex) {
    BITS.setBigUint64(0, BigInt("0x" + hex));
    return BITS.getFloat64(0);
}

/**
 * What a device SENDS. Values plus their bits, the engine version, and enough about the machine to key it --
 * and NO VERDICT FIELD AT ALL, so a device cannot express one even by accident.
 */
export function buildSubmission({ adapter = {}, ua = "", platform = "unknown", engineVersion = null, observables = {} }) {
    const values = {};
    for (const [q, v] of Object.entries(observables)) {
        if (typeof v !== "number" || !Number.isFinite(v)) continue;
        values[q] = { value: v, bits: bitsOf(v) };
    }
    return {
        kind: CORROBORATION_KIND,
        version: 1,
        engineVersion,
        platform,
        adapter: { vendor: adapter.vendor || null, architecture: adapter.architecture || null },
        ua,
        at: new Date().toISOString(),
        values,
    };
}

export function emptyLedger() { return { kind: LEDGER_KIND, version: 1, devices: {} }; }

/**
 * Append one submission. Keyed by deviceKey (imported, not re-derived). A re-run is a NEW RUN under the same
 * device, never a replacement -- a device changing its answer is the interesting event, and overwriting would
 * erase the only evidence of it. An identical re-upload is recognised and not duplicated, because a double
 * upload must not look like two machines agreeing.
 */
export function foldSubmission(ledger, sub) {
    const out = { ...ledger, devices: { ...(ledger.devices || {}) } };
    const key = deviceKey({ adapter: sub.adapter || {}, ua: sub.ua || "" });
    const runHash = crypto.createHash("sha256")
        .update(JSON.stringify({ v: sub.values, e: sub.engineVersion })).digest("hex").slice(0, 16);
    const prev = out.devices[key] || { platform: sub.platform, adapter: sub.adapter, ua: sub.ua, runs: [] };
    if (prev.runs.some((r) => r.runHash === runHash)) return out;
    out.devices[key] = {
        ...prev,
        runs: [...prev.runs, { at: sub.at, engineVersion: sub.engineVersion, runHash, values: sub.values }],
    };
    return out;
}

export const AGREE = Object.freeze({
    IDENTICAL: "bit-identical",
    DIFFERS: "differs",
    ABSENT: "absent-here",
    NOT_SUBMITTED: "not-submitted",
});

/**
 * *** THE HUB ADJUDICATES. *** For every observable this machine measured, say what the fleet reported.
 * `local` is a plain { quantity: number } from this machine. Comparison is on BITS.
 */
export function gradeSubmission(ledger, local) {
    const rows = [];
    const devices = Object.entries(ledger.devices || {});
    for (const [q, v] of Object.entries(local)) {
        const localBits = bitsOf(v);
        const seen = [];
        for (const [key, dev] of devices) {
            for (const run of dev.runs || []) {
                const got = run.values && run.values[q];
                if (!got) { seen.push({ key, platform: dev.platform, verdict: AGREE.ABSENT }); continue; }
                seen.push({
                    key, platform: dev.platform,
                    verdict: got.bits === localBits ? AGREE.IDENTICAL : AGREE.DIFFERS,
                    theirBits: got.bits, theirValue: got.value,
                });
            }
        }
        rows.push({
            quantity: q, localValue: v, localBits,
            reports: seen,
            verdict: seen.length === 0 ? AGREE.NOT_SUBMITTED
                : seen.some((s) => s.verdict === AGREE.DIFFERS) ? AGREE.DIFFERS
                : seen.every((s) => s.verdict === AGREE.IDENTICAL) ? AGREE.IDENTICAL
                : AGREE.ABSENT,
        });
    }
    return {
        rows,
        devices: devices.length,
        runs: devices.reduce((n, [, d]) => n + (d.runs || []).length, 0),
        settled: rows.filter((r) => r.verdict === AGREE.IDENTICAL).length,
        disagreeing: rows.filter((r) => r.verdict === AGREE.DIFFERS).length,
        // The honest majority until a machine posts: nothing to compare against.
        unanswered: rows.filter((r) => r.verdict === AGREE.NOT_SUBMITTED).length,
    };
}

/**
 * v2889's argument, applied. An observable measured by a code path with ZERO raw transcendental calls is
 * portable by construction and needs no submission. `rawCalls` comes from corroborate.measurePortability.
 */
export function settledByConstruction(rawCallsByDeviceMode, keylessCountByDeviceMode) {
    let byConstruction = 0, needMachine = 0;
    for (const [dm, calls] of Object.entries(rawCallsByDeviceMode)) {
        const n = keylessCountByDeviceMode[dm] || 0;
        if (calls === 0) byConstruction += n; else needMachine += n;
    }
    return { byConstruction, needMachine, total: byConstruction + needMachine };
}

/** FROZEN AT v4481. The population this surface exists for, measured over v4480's SCOPE. */
export const PORTABILITY_AT_V4481 = Object.freeze({
    at: "v4481",
    keylessObservables: 27,
    settledByConstruction: 7,          // lens.deflect: rawCalls 0
    needARealSecondMachine: 20,
    rawCalls: Object.freeze({
        "lens.deflect": 0,
        "splat.compose": 1,
        "chaos.feigenbaum": 5,
        "splat.perspective": 13,
        "splat.integral": 65542,
        "kepler.conserve": 80002,
        "kepler.compare": 160004,
    }),
    // *** THE NUMBER THAT MATTERS AND THE ONE THIS ROUND CANNOT MOVE. ***
    submissionsReceived: 0,
    kindsBeforeThisRound: 6,
});
