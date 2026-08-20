// tools/roundhouse/observableFinite.mjs
//
// v3544 -- VERDICT INTEGRITY, THE THIRD DOMAIN CHECK: FINITE. errorSign proved every error is >= 0; observableRange
// proved every bounded observable stays in its interval. Both leave one hole: a number that is not a number at all.
// A NaN or an Infinity is a measurement the physics never produced -- a 0/0 in a normalisation, a sqrt of a
// negative, a divide by a gap that closed -- and it corrupts every gate that reads it in a DIFFERENT way each
// time: `err < tol` is false for NaN (looks like a failure), a conservation SUM with one NaN term is NaN (poisons
// the whole ledger), and NaN !== NaN makes an equality check quietly pass. A single non-finite observable is a
// verdict with no defined value.
//
// *** THIS ONE CANNOT BE CHECKED FROM THE FROZEN BASELINE, AND THAT IS THE POINT. *** JSON has no NaN and no
// Infinity: JSON.stringify(NaN) is the string "null", so the instant a NaN observable is frozen into
// lab-results-baseline.json it becomes null -- indistinguishable from a key a mode did not compute. The baseline,
// the one comprehensive record the other two domain checks lean on, is BLIND to this fault by construction. So
// finiteness has to be read live, off the build, before the value can be laundered through JSON. The gate
// spot-checks a representative cross-section live and states, as a demonstrated fact, why it cannot do more from
// the frozen record.
//
// The -1 not-applicable sentinel is finite and never a fault. Booleans, strings and null are not numbers and are
// left alone; only a numeric value that fails Number.isFinite is caught.

// Return the non-finite numeric observables (NaN, +Infinity, -Infinity) in one outputs bag, with an optional prefix.
export function nonFinite(outputs, prefix = "") {
    const hits = [];
    for (const [k, v] of Object.entries(outputs || {})) {
        if (typeof v === "number" && !Number.isFinite(v)) hits.push({ key: prefix + k, value: v });
    }
    return hits;
}

// Demonstration helper: what the freeze does to a non-finite value. Returns the value after a JSON round-trip.
// NaN and +/-Infinity all come back as null -- the reason the baseline cannot witness this fault.
export function afterFreeze(v) {
    return JSON.parse(JSON.stringify({ v })).v;
}
