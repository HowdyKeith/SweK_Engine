// WebGLEngine/tools/ship/adapterRecord.mjs -- v4646
//
// *** A DEVICE READING IS A READING OF ONE ADAPTER, AND ABOUT FIFTEEN GATES HAD FORGOTTEN THAT. ***
//
// Every WGSL gate in this tree froze its numbers on the only adapter it had ever met: SwiftShader, which is
// what the Playwright bundle ships and what the sandbox runs. Measured at v4646 on Keith's Windows rig, an
// NVIDIA Pascal through D3D12, those gates went red in a body -- microfacetWgsl's own header records "36 of
// 64 lanes bit-identical" and Pascal gives 18 of 64; magmapDevice records 4.385e-6 and Pascal gives 3.753e-6.
//
// NONE OF THOSE IS A WRONG RECORD. It is an ABSENT one, and the gates had no way to say so, because a frozen
// number admits exactly two verdicts and "I have never been measured here" is neither of them. Printing that
// as FAIL is the conflation tools/render-qa/deviceOwed.mjs (v3339) was built to prevent, running backwards:
// that file's three states are RENDERED / VERDICT-OWED / VERDICT-IN, and its header's warning holds in this
// direction too -- a verdict that means one thing while READING as another "would be worse than the current
// silence because it would look like an answer".
//
// So: HELD when a record exists for the adapter in hand, and the gate is held to it strictly. OWED when none
// does -- the measurement is printed so a later round can enter it, and the row does NOT fail, because a new
// GPU is not a regression. The risk in that, stated because it is the obvious way this goes wrong: an OWED
// row nobody reads is a row that measures nothing. owedCount() exists so the population is a number somebody
// can put in front of a person, rather than a green tick per gate.
"use strict";

/** "unknown" is a KEY, not a null. An adapter that will not say what it is still gets one record slot rather
 *  than silently sharing everyone else's -- two unidentified adapters are not evidence about each other. */
export function adapterKey(adapter) {
    if (!adapter) return "unknown/unknown";
    const v = String(adapter.vendor || "unknown").trim().toLowerCase().replace(/\s+/g, "-");
    const a = String(adapter.architecture || "unknown").trim().toLowerCase().replace(/\s+/g, "-");
    return `${v}/${a}`;
}

/**
 * The verdict for one measurement against a per-adapter record.
 *
 * `record` is { "<key>": <reading> }. `compare(have, measured)` returns true when the measurement agrees with
 * the stored reading -- the gate's own tolerance, not this file's, because only the gate knows what its
 * number means.
 *
 * Returns { state, key, have, measured, ok }. `ok` is what an assertion should read: true for a HELD reading
 * that agrees, true for OWED, false ONLY for a HELD reading that disagrees. OWED is deliberately not a
 * failure and deliberately not silent.
 */
export function verdict(record, adapter, measured, compare) {
    const key = adapterKey(adapter);
    const has = !!record && Object.prototype.hasOwnProperty.call(record, key);
    if (!has) return { state: "OWED", key, have: null, measured, ok: true };
    const have = record[key];
    return { state: "HELD", key, have, measured, ok: !!compare(have, measured) };
}

/** What a row should print, so an OWED reading can be entered into the record from the output alone. */
export function describe(v) {
    return v.state === "OWED"
        ? `OWED: no reading on file for ${v.key} -- measured ${JSON.stringify(v.measured)}. ` +
          `This adapter has never been recorded, so nothing is asserted about it; add the reading to promote ` +
          `it to HELD rather than widening anybody's tolerance.`
        : `HELD against ${v.key}: on file ${JSON.stringify(v.have)}, measured ${JSON.stringify(v.measured)}`;
}

/** How many adapters a record covers, and which -- so "we only ever measured one" is a number, not a vibe. */
export function coverage(record) {
    const keys = record ? Object.keys(record) : [];
    return { count: keys.length, keys: keys.slice().sort() };
}

/** The OWED population across many verdicts. A register of the unmeasured has to shrink when things get
 *  measured, and it cannot do that if nobody ever counts it. */
export function owedCount(verdicts) {
    const owed = verdicts.filter((v) => v.state === "OWED");
    return { owed: owed.length, of: verdicts.length, keys: [...new Set(owed.map((v) => v.key))].sort() };
}

// *** v4647 -- A READING TYPED IN FROM A TERMINAL IS NOT A READING THE GATE TOOK. ***
//
// microfacetWgsl's own record says so in as many words: Keith's Pascal numbers were left OWED on purpose
// because they arrived as a paste. That rule was right and it left no way to ever pay the debt, because the
// only person who can run the gate on that box is not the person editing the file. The whole point of OWED is
// that it shrinks.
//
// So the gate writes its own reading, on the box that took it, into tools/ship/adapter-readings.json -- the
// same shape sweep-timings.json has and for the same reason: a number written by the thing that measured it,
// carrying a stamp it earned. What lands in a commit is then a machine-written file from that machine, not a
// transcription.
//
// *** THE FROZEN IN-FILE RECORD WINS, ALWAYS, AND THAT DIRECTION IS THE SAFETY. *** If the JSON could override
// a frozen bound then `--record` would be a way to make a red gate green by running it, which is the one thing
// this must not be. recordReading REFUSES an adapter the frozen record already names and says so. The JSON can
// only ever cover an adapter that had NO reading -- it turns OWED into HELD and can never turn HELD into
// something laxer.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const READINGS_PATH = path.join(HERE, "adapter-readings.json");

/**
 * *** THE SLACK IS A CONVENTION AND IS LABELLED ONE, BUT IT IS NOT A GUESS ABOUT NOISE. ***
 * microfacetWgsl was run four times on one adapter and all EIGHT of its recorded readings came back
 * BIT-IDENTICAL, to the last digit of a double (coarseFall 0.8415621515000709 on every run) -- these are
 * deterministic f32 reductions over a fixed grid, so there is no run-to-run jitter for a slack to absorb.
 *
 * NOT EVERY NUMBER IN THAT GATE IS LIKE THAT, and the distinction is the point rather than a footnote: its
 * strong-test curve moved between runs in the same session (0.9994199 then 0.9994505 at alpha 0.02), which is
 * why those rows carry tolerances and are NOT recorded here. What is recorded is the subset measured to be
 * reproducible; a jittering quantity does not belong behind a per-adapter bound at all.
 *
 * What the slack absorbs is therefore a DRIVER UPDATE on the same silicon, which nobody here can measure, so
 * 2 is a chosen number for a thing that cannot be derived. It is stated rather than buried: wide enough that a
 * recompiled shader does not go red, narrow enough that an order of magnitude does. Measured against the nine
 * bounds a person hand-picked for SwiftShader, it is mostly TIGHTER -- cosAbsMin 2.99e-5 where the hand-picked
 * bound was 1e-7, hostRatio 3256 against 1000 -- and looser on exactly one, worstGap 3.07e-7 against 2e-7.
 */
export const SLACK = 2;

/** "max": the measurement must stay AT OR BELOW the bound. "min": at or above. */
export function compareFor(name, dir) {
    if (dir !== "max" && dir !== "min") throw new Error(`adapterRecord: direction must be "max" or "min", got ${JSON.stringify(dir)}`);
    return (have, measured) => (dir === "max" ? measured <= have[name] : measured >= have[name]);
}

/** The bound a fresh reading becomes, with the slack applied in the direction the row is asserted in. */
export function boundFrom(dir, measured) {
    if (!Number.isFinite(measured)) return measured;
    return dir === "max" ? measured * SLACK : measured / SLACK;
}

/**
 * *** THE ONE PLACE THE PRECEDENCE LIVES, BECAUSE A SPREAD WRITTEN THE WRONG WAY ROUND IN A GATE IS INVISIBLE. ***
 * The frozen in-file record WINS. A reading written by --record can only ever cover an adapter the frozen
 * record does not name -- it turns OWED into HELD and can never turn HELD into something laxer. Written as a
 * named function rather than an inline `{ ...recorded, ...frozen }` so a fixture can drive it: inverted in
 * place, the spread is a one-character difference that no live run on a box with an empty readings file can
 * tell apart, which is exactly how it was caught here.
 */
export function mergeRecords(frozen, recorded) {
    return { ...(recorded || {}), ...(frozen || {}) };
}

/** Everything on file for one gate, or {} -- a missing or broken file is NO readings, never a throw: a gate
 *  whose record file is absent must behave exactly like a gate whose adapter is unrecorded. */
export function readReadings(gate, { file = READINGS_PATH, read = fs.readFileSync } = {}) {
    try { return (JSON.parse(read(file, "utf8")).gates || {})[gate] || {}; } catch { return {}; }
}

/**
 * Write one adapter's readings for one gate. Returns { wrote, why } -- it refuses rather than throws, because
 * this runs at the end of a gate that has already said everything it has to say.
 * `frozen` is the gate's in-file record; an adapter it names is refused.
 */
export function recordReading(gate, key, values, { file = READINGS_PATH, frozen = null, stamp = null,
                                                   read = fs.readFileSync, write = fs.writeFileSync } = {}) {
    if (!key || key === "unknown/unknown") {
        return { wrote: false, why: "the adapter would not say what it is, so the reading has no owner -- " +
                                    "an unnamed key would be shared by every future unidentified adapter" };
    }
    if (frozen && Object.prototype.hasOwnProperty.call(frozen, key)) {
        return { wrote: false, why: `${key} is already in the gate's own frozen record, which wins -- ` +
                                    "recording here could only ever loosen it, so it is refused" };
    }
    let doc = { gates: {} };
    try { doc = JSON.parse(read(file, "utf8")); } catch { /* first write */ }
    if (!doc.gates) doc.gates = {};
    if (!doc.gates[gate]) doc.gates[gate] = {};
    doc.gates[gate][key] = { ...values, at: stamp || new Date().toISOString() };
    write(file, JSON.stringify(doc, null, 1) + "\n");
    return { wrote: true, why: `${gate} / ${key}: ${Object.keys(values).length} reading(s)`, doc };
}
