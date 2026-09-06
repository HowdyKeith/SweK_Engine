// tools/roundhouse/observableTaint.mjs -- v4479
//
// *** THE PORTABILITY VERDICT IS TAKEN PER BUILD AND APPLIED PER OBSERVABLE, AND corroborationCensus SAID SO
// IN WRITING AND LEFT IT OPEN. *** Its header: "the libm tripwire instruments the CALL, not the value: it can
// say that a build made 1,800 unspecified Math.cos calls, but not which of that build's eleven reported
// numbers were downstream of them. So portability here is measured PER DEVICE/MODE and applied to every
// observable that build reports. That is deliberately conservative -- one raw Math.hypot taints the whole
// build's outputs -- and a build flagged non-portable may well contain individually portable numbers.
// Narrowing it means instrumenting per observable, which is a real round and not this one."
//
// This is that round, and the conservatism costs more than anybody had measured.
//
// ---- *** THE SECOND BOUND, AND WHY A CALL COUNT CANNOT BE ONE *** -------------------------------------------
//
// A call count is an UPPER bound on taint: if a build made no unspecified call, nothing it reports can differ
// on another libm. It cannot be a lower bound, because knowing `cos` was called 1,800 times says nothing about
// which of eleven numbers the answers reached. Nothing in the tree measured from the other side.
//
// So measure it: PERTURB one unspecified function, rebuild, and see which observables move. An observable that
// moves when `Math.atan2` returns a value one part in 1e9 different IS downstream of atan2 -- not by argument,
// by demonstration. Run it once per function the build actually calls and the union is a LOWER bound on the
// build's taint, per observable, by name.
//
// *** MEASURED OVER 40 DETERMINISTIC BUILDS THAT THE CENSUS CALLS NON-PORTABLE: 334 OBSERVABLES, OF WHICH 109
// PROVABLY MOVE. 32.6%. *** And in SIX of the forty, not one observable moved at all -- the build touches an
// unspecified function, so every number it reports is condemned, and no number it reports can be shown to
// depend on the answer. Examples, all deterministic across two unperturbed builds:
//
//     reconQuality.blindspot     19 observables, 3 functions called,  1 moved   ( 5%)
//     blackhole.orbit             6 observables, 1 function  called,  1 moved   (17%)
//     strokeMorph.morph          19 observables, 1 function  called,  4 moved   (21%)
//     fragmentRotation.fragments  9 observables, 3 functions called,  2 moved   (22%)
//     powder.friedel             14 observables, 4 functions called,  4 moved   (29%)
//     structureFactor.absences    9 observables, 3 functions called,  4 moved   (44%)
//     renderBounce.series        12 observables, 5 functions called,  6 moved   (50%)
//
// ---- *** WHAT A NON-MOVING OBSERVABLE IS NOT *** -------------------------------------------------------------
//
// *** IT IS NOT PROVEN PORTABLE, AND EVERYTHING HERE DEPENDS ON NOT SAYING OTHERWISE. *** Perturbation can
// demonstrate dependence and cannot demonstrate independence. An observable may sit downstream of `cos` and
// still not move because the perturbation fell below its own rounding, because a branch swallowed it, because
// it is an integer count derived from a comparison, or because this particular input happened to be
// insensitive. So the two numbers this file reports are bounds of OPPOSITE kinds and are never combined into
// one verdict:
//
//     rawCalls > 0        -- an UPPER bound: at most these observables could differ elsewhere   (the census's)
//     moved by name       -- a LOWER bound: at least these observables do                       (this file's)
//
// The gap between them is not a correction to the census. It is the region nobody has measured, and naming its
// size is the whole deliverable. A round that reported "109 of 334 are portable" would be claiming exactly the
// thing this method cannot establish, and would be worse than the conservatism it replaced.
//
// ---- *** DETERMINISM IS CHECKED FIRST, BECAUSE OTHERWISE EVERY NUMBER BELOW IS NOISE *** ---------------------
//
// A device whose two unperturbed builds disagree cannot be attributed at all: a moved observable would mean
// nothing. Every build is therefore run twice with the tripwire armed and NOTHING perturbed, and one that
// fails that is reported as `nondeterministic` and attributed NOT AT ALL rather than attributed badly. That is
// v4402's rule -- an absence read as a skip is an absence read as a pass -- applied to the one place where a
// wrong answer here would look exactly like a clean one.

/** The unspecified-result functions, as corroborationCensus lists them. Kept in sync by that gate, not by hope. */
export const UNSPEC = Object.freeze([
    "sin", "cos", "tan", "asin", "acos", "atan", "atan2", "exp", "log", "log2", "log10",
    "log1p", "expm1", "pow", "hypot", "cbrt", "sinh", "cosh", "tanh", "asinh", "acosh", "atanh",
]);

/**
 * One part in 1e9. Large enough to survive a few arithmetic steps, small enough that a device's own guards and
 * convergence tests do not notice -- and REPORTED, because the size of the nudge bounds what "did not move"
 * can mean. A smaller epsilon finds less; this one is not tuned per device, which would be fitting.
 */
export const EPS = 1e-9;

/** Run `build`, counting every unspecified call, optionally perturbing ONE function's result. */
export async function runInstrumented(build, { perturb = null, eps = EPS } = {}) {
    const originals = {}, calls = Object.create(null);
    for (const name of UNSPEC) {
        const orig = Math[name];
        originals[name] = orig;
        calls[name] = 0;
        Math[name] = perturb === name
            ? (...a) => { calls[name]++; return orig(...a) * (1 + eps); }
            : (...a) => { calls[name]++; return orig(...a); };
    }
    let pending, err = null;
    try { pending = build(); } catch (e) { err = e; }
    for (const name of UNSPEC) Math[name] = originals[name];      // disarm BEFORE awaiting, as v2893 established
    if (err) throw err;
    const value = await pending;
    const used = UNSPEC.filter((n) => calls[n] > 0);
    return { value, calls, used, rawCalls: used.reduce((s, n) => s + calls[n], 0) };
}

export const numericKeys = (obs) =>
    (obs && typeof obs === "object")
        ? Object.keys(obs).filter((k) => typeof obs[k] === "number" && Number.isFinite(obs[k]))
        : [];

/**
 * Attribute one build's observables. Returns `nondeterministic` rather than an attribution when two unperturbed
 * builds disagree, and `clean` when the build makes no unspecified call at all -- the census already clears
 * those and this file has nothing to add about them.
 */
export async function attribute(build, { eps = EPS } = {}) {
    const a = await runInstrumented(build, { eps });
    const keys = numericKeys(a.value);
    if (!keys.length) return { status: "no-observables", keys: [], used: a.used, rawCalls: a.rawCalls };
    const b = await runInstrumented(build, { eps });
    const drifted = keys.filter((k) => !Object.is(a.value[k], b.value[k]));
    if (drifted.length) return { status: "nondeterministic", keys, drifted, used: a.used, rawCalls: a.rawCalls };
    if (!a.used.length) return { status: "clean", keys, used: [], rawCalls: 0, moved: [], byFn: {} };

    const byFn = {}, moved = new Set();
    for (const fn of a.used) {
        const p = await runInstrumented(build, { perturb: fn, eps });
        const m = keys.filter((k) => !Object.is(a.value[k], p.value[k]));
        byFn[fn] = m;
        for (const k of m) moved.add(k);
    }
    return {
        status: "attributed",
        keys, used: a.used, rawCalls: a.rawCalls,
        moved: [...moved],                    // the LOWER bound, by name
        unmoved: keys.filter((k) => !moved.has(k)),   // NOT a portability claim -- see the header
        byFn,
    };
}

/** Roll a set of attributions into the two bounds and the gap between them. Members, never a bare total. */
export function bounds(rows) {
    const att = rows.filter((r) => r.status === "attributed");
    const observables = att.reduce((n, r) => n + r.keys.length, 0);
    const proven = att.reduce((n, r) => n + r.moved.length, 0);
    return {
        builds: att.length,
        nondeterministic: rows.filter((r) => r.status === "nondeterministic").length,
        clean: rows.filter((r) => r.status === "clean").length,
        observables,
        condemnedByCallCount: observables,        // the census taints every observable of a build that called
        provenDownstream: proven,                 // this file's lower bound
        unattributed: observables - proven,       // the region nobody has measured -- NOT "portable"
        buildsWhereNothingMoved: att.filter((r) => r.moved.length === 0).map((r) => r.label).filter(Boolean),
    };
}

export const TAINT_AT_V4479 = Object.freeze({
    eps: EPS,
    builds: 40, observables: 334, provenDownstream: 109, sharePct: 32.6,
    buildsWhereNothingMoved: 6,
    examples: Object.freeze([
        Object.freeze({ build: "reconQuality.blindspot", observables: 19, fns: 3, moved: 1 }),
        Object.freeze({ build: "blackhole.orbit", observables: 6, fns: 1, moved: 1 }),
        Object.freeze({ build: "strokeMorph.morph", observables: 19, fns: 1, moved: 4 }),
        Object.freeze({ build: "renderBounce.series", observables: 12, fns: 5, moved: 6 }),
    ]),
});
