// tools/roundhouse/observableRange.mjs
//
// v3543 -- VERDICT INTEGRITY, THE RANGE OF A BOUNDED OBSERVABLE. errorSign proved every error is >= 0, because
// `err < tol` passes silently for a negative err. The same silent hole is wider than sign: a BOUNDED observable
// out of its range sails through every gate that reads it. A survival probability of 1.3 still satisfies
// `p <= 1 + tol` if the tolerance was meant for rounding; a direction cosine of 1.4 still feeds acos() (which
// clamps or returns NaN) and a shadow test downstream reads a real angle from an impossible one. A number that
// has escaped its physical interval is a measurement the physics disowns, and nothing in the lab was checking.
//
// *** THIS IS DECLARATION WITH CONSERVATIVE INFERENCE, THE observableUnits SHAPE. *** A range is a physical fact
// about a quantity, not something to guess from a value that merely happens to sit in [0, 1] on the runs sampled.
// So:
//   DECLARED beats inferred   an explicit entry pins the range and its reason; devices can be made exact one at
//                             a time without waiting for the rest.
//   INFER ONLY THE UNAMBIGUOUS a cosine is in [-1, 1] and a probability is in [0, 1] by DEFINITION -- those two
//                             name patterns are safe to infer. Everything else is UNKNOWN and never checked, so a
//                             wrong inference can never manufacture a fault.
//   THE -1 SENTINEL is respected   a mode that does not compute a key returns -1; it is never a range fault.
//
// Like observableUnits, this can only move an observable from UNCHECKED to CHECKED -- it removes a blind spot, it
// cannot invent one.

export const NA_SENTINEL = -1;

// Explicit ranges: "device/mode.field" or "device.field" -> { lo, hi, why }. DECLARED overrides inference.
export const DECLARED = {
    "em/cherenkov.cosThetaMax":      { lo: -1, hi: 1, why: "the cosine of the maximum Cherenkov angle; a cosine is in [-1, 1] by definition" },
    "em/cherenkov.cosThetaMaxExact": { lo: -1, hi: 1, why: "the closed-form maximum-angle cosine; in [-1, 1] by definition" },
    "em/cherenkov.cosThetaAtThreshold": { lo: -1, hi: 1, why: "the cosine at the Cherenkov threshold (beta = 1/n), exactly 1 there; a cosine is in [-1, 1]" },
    "em/cherenkov.machCosAtThreshold":  { lo: -1, hi: 1, why: "the Mach-cone cosine at threshold; a cosine is in [-1, 1] by definition" },
    "percolation/crossing.prob":     { lo: 0, hi: 1, why: "a spanning-cluster crossing probability; a probability is in [0, 1] by definition" },
};

// Conservative inference from the name. Returns { lo, hi } only for the two unambiguous categories, else null.
const COSINE = /(^|[^a-z])[Cc]os($|[A-Z])/;          // cosThetaMax, machCosAtThreshold -- NOT cost, NOT icosahedron
const PROBABILITY = /([Pp]rob($|[A-Z]|abilit))|surviv(al|es|ing)/;   // prob, probability, survival -- NOT probe/probed
export function inferRange(name) {
    if (COSINE.test(name)) return { lo: -1, hi: 1, why: "inferred: a cosine is in [-1, 1] by definition", inferred: true };
    if (PROBABILITY.test(name)) return { lo: 0, hi: 1, why: "inferred: a probability is in [0, 1] by definition", inferred: true };
    return null;
}

// Resolve the range for one observable key ("device/mode.field"): DECLARED first, then inference, else null.
export function rangeFor(fullKey, name) {
    if (DECLARED[fullKey]) return DECLARED[fullKey];
    // a DECLARED entry may be keyed by device.field (mode-independent); accept that form too
    const devField = fullKey.replace(/\/[^.]*\./, ".");
    if (DECLARED[devField]) return DECLARED[devField];
    return inferRange(name);
}

// Return the observables in one outputs bag that fall OUTSIDE their resolved range (with a small tolerance for
// rounding at the endpoints). The -1 sentinel, booleans, strings and non-finite values are not range faults here
// (finiteness is errorSign/other gates' concern); only a finite, in-scope number outside [lo, hi] is a fault.
export function outOfRange(outputs, prefix = "", tol = 1e-9) {
    const hits = [];
    for (const [k, v] of Object.entries(outputs || {})) {
        if (typeof v !== "number" || !Number.isFinite(v)) continue;
        if (v === NA_SENTINEL) continue;
        const r = rangeFor(prefix + k, k);
        if (!r) continue;
        if (v < r.lo - tol || v > r.hi + tol) hits.push({ key: prefix + k, value: v, lo: r.lo, hi: r.hi, inferred: !!r.inferred });
    }
    return hits;
}
