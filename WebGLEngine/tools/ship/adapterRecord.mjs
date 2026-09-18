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
