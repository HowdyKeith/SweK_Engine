// tools/roundhouse/libmSensitivity.mjs
//
// v2905 -- NARROWING THE TAINT FROM A BUILD TO A NUMBER.
//
// v2904's census reported 184 unkeyed observables "at risk" and said in the same breath that the figure
// overstates: portability was measured per BUILD, because the tripwire instruments the CALL and not the value.
// kerr.spin reports eleven unkeyed observables on twenty libm calls; twenty calls cannot have reached eleven
// outputs. The census could not prove which, so it condemned all eleven and said so.
//
// THE MOVE. Stop asking "did this build call sin?" and start asking "would this number MOVE if sin moved?" --
// which is the question the fleet actually cares about, and which is answerable. Replace every unspecified libm
// function with one that returns its correctly-rounded result perturbed by ONE ULP, rebuild the device, and diff
// the observables. Anything that shifts is downstream of unspecified libm. Anything bit-identical is not,
// whatever the call counter said.
//
// One ulp is the honest perturbation size. IEEE pins + - * / sqrt fma to correct rounding and says nothing about
// the transcendentals; a conforming libm is typically within 0.5-1 ulp of the true value, and two conforming
// libms may therefore differ in the last bit. Perturbing by one ulp models the worst legal disagreement between
// two machines that are both behaving correctly. It is not a bug injection -- both answers are defensible.
//
// WHAT THIS BUYS THAT CALL-COUNTING CANNOT: a MAGNITUDE. "This observable calls sin" is a boolean. "This
// observable moves by 3e-16 when the whole libm shifts by an ulp" says it is portable in every practical sense,
// while "this one moves by 4e-3" says the quantity amplifies its inputs and no two machines will ever agree on
// it. Those are different findings about different physics and the census could not tell them apart.
//
// AMPLIFICATION IS THE OBSERVABLE. relMove / ulpRel, roughly "how many ulps of output per ulp of input". Near 1
// is a well-conditioned measurement. Large is a conditioning statement about the quantity itself -- for a
// chaotic map it is not a defect but the signature of the physics, and it should show up here.
//
// THIS IS THE PORTABILITY ANALOGUE OF v2893'S PLANTED ERROR. That round asked what each gate would catch by
// mutating the physics a known amount. This one asks what each observable would notice by mutating the libm a
// known amount. Same discipline: a property you have not tried to break is a property you are assuming.

import { getDevice, DEVICE_NAMES } from "./devices.mjs";
import { deviceModeTable } from "./deviceModes.mjs";   // v3211: DERIVED. MODES never existed here -- see deviceModes.mjs
import { preRegister } from "./corroborate.mjs";
import { KEYED_RE } from "./corroborationCensus.mjs";

const UNSPEC = [
    "sin", "cos", "tan", "asin", "acos", "atan", "atan2", "exp", "log", "log2", "log10",
    "log1p", "expm1", "pow", "hypot", "cbrt", "sinh", "cosh", "tanh", "asinh", "acosh", "atanh",
];

const _dv = new DataView(new ArrayBuffer(8));

/** Next representable double above x (toward +Infinity). Bit manipulation, not arithmetic -- no rounding of its own. */
export function nextUp(x) {
    if (Number.isNaN(x) || x === Infinity) return x;
    if (x === 0) return Number.MIN_VALUE;
    _dv.setFloat64(0, x);
    let bits = _dv.getBigUint64(0);
    bits += (x > 0) ? 1n : -1n;
    _dv.setBigUint64(0, bits);
    return _dv.getFloat64(0);
}

/** Relative size of one ulp at x -- the scale of the perturbation being applied, for computing amplification. */
export function ulpRel(x) {
    if (!Number.isFinite(x) || x === 0) return Number.EPSILON;
    return Math.abs((nextUp(x) - x) / x);
}

/**
 * Run fn with some or all unspecified libm functions perturbed by one ulp.
 *
 * `only` restricts the perturbation to named functions, which is what makes ATTRIBUTION possible: perturb sin
 * alone and the observables that move are the ones downstream of sin specifically.
 *
 * The perturbation is applied to the RESULT, deterministically and always in the same direction. A random or
 * alternating perturbation would be a better model of a real libm but would make the diff irreproducible, and an
 * irreproducible portability verdict is worse than a slightly pessimistic one.
 */
export async function withPerturbedLibm(fn, { only = null } = {}) {
    const targets = only ? UNSPEC.filter((n) => only.includes(n)) : UNSPEC;
    const originals = {};
    for (const name of targets) {
        originals[name] = Math[name].bind(Math);
        Math[name] = (...a) => nextUp(originals[name](...a));
    }
    let pending, err = null;
    try { pending = fn(); } catch (e) { err = e; }
    for (const name of targets) Math[name] = originals[name];   // disarm before awaiting, per v2893
    if (err) throw err;
    return await pending;
}

const isNum = (x) => typeof x === "number" && Number.isFinite(x);
const bitsOf = (x) => { _dv.setFloat64(0, x); return _dv.getBigUint64(0).toString(16).padStart(16, "0"); };

/**
 * Compare two observable objects field by field. Returns per-field movement, using BIT equality for the verdict
 * and relative difference for the magnitude -- because "bit-identical" is the promise the fleet makes, and
 * "moved by 3e-16" is the thing a physicist needs to know about the promise being broken.
 */
/**
 * *** HOW MANY SIGNIFICANT DIGITS OF A QUANTITY SURVIVE THE PERTURBATION. *** log10(|base| / |absolute move|).
 *
 * amplification is a RELATIVE move divided by an ulp, so it divides by the base value, and it therefore says
 * nothing useful about a quantity whose base sits at the round-off floor. This is the column that separates
 * the two cases, and it is a MEASUREMENT rather than a rule about names:
 *
 *   quantum.bands.edgeRhsWorst    base 1.554e-15, moved 8.882e-16  ->  0.24 digits. Nothing survives. Its
 *                                 amplification of 4.5e15 is a near-zero denominator, not conditioning.
 *   quantum.bands.insideGapWorst  base 1.075e+0,  moved 2.220e-16  -> 15.68 digits. Fully resolved, and it is
 *                                 named "Worst" exactly like the one above.
 *
 * *** v4486 PROPOSED CATCHING THESE BY WIDENING A NAME VOCABULARY AND v4487 MEASURED THAT IT WOULD BE WRONG IN
 * BOTH DIRECTIONS. *** Adding drift|worst|mismatch|violation to KEYED_RE reclassifies 13 of the 117 keyless
 * observables; MEASURED, only 2 of those 13 carry no significant digit, and the other eleven retain between
 * 2.18 and 15.68. Meanwhile the two that ARE at the floor spell none of the vocabulary's words, so the rule
 * catches 0 of the 2 it was proposed for. A name is a guess about a quantity; this is the quantity.
 */
export function significantDigits(base, pert) {
    if (!isNum(base) || !isNum(pert)) return null;
    const move = Math.abs(pert - base);
    if (move === 0) return Infinity;              // bit-identical: every digit survives
    if (base === 0) return -Infinity;             // no scale at all to have digits in
    return Math.log10(Math.abs(base) / move);
}

/** Below one surviving digit the quantity carries no information after the shift, so amplification is undefined. */
export const FLOOR_DIGITS = 1;

/**
 * The verdict amplification needs beside it. AT_THE_FLOOR means the number is round-off moved by round-off and
 * any bound derived from it grades nothing -- v4484's WITHIN_PREDICTION on such a quantity would admit a second
 * machine reporting anything at all.
 */
export function conditioningClass(base, pert) {
    const d = significantDigits(base, pert);
    if (d === null) return "NON-NUMERIC";
    if (d === Infinity) return "BIT-IDENTICAL";
    return d < FLOOR_DIGITS ? "AT_THE_FLOOR" : "RESOLVED";
}

export function diffObservables(base, pert) {
    const out = [];
    for (const [k, v] of Object.entries(base)) {
        if (!isNum(v)) continue;
        const w = pert[k];
        if (!isNum(w)) { out.push({ field: k, moved: true, note: "became non-finite under perturbation" }); continue; }
        const same = Object.is(v, w);
        const rel = v === 0 ? (w === 0 ? 0 : Infinity) : Math.abs(w - v) / Math.abs(v);
        out.push({
            field: k, moved: !same, base: v, pert: w, relMove: rel,
            // how many output ulps per input ulp -- the conditioning of this quantity with respect to its libm
            amplification: same ? 0 : rel / ulpRel(v),
        });
    }
    return out;
}

/**
 * Sweep the lab. For each device/mode: build clean, build perturbed, diff.
 *
 * `attribute` additionally perturbs one function at a time for the modes that moved, naming WHICH transcendental
 * each sensitive observable depends on. That costs one extra build per candidate function, so it is opt-in.
 */
export async function libmSensitivitySweep({ modes = null, attribute = false, verbose = false } = {}) {
    // v3211 -- BUILT, NOT LISTED, AND IT REFUSES AN EMPTY TABLE. A caller may still pass its own.
    if (!modes) modes = await deviceModeTable();
    const rows = [];
    let determinismFailures = 0;

    for (const name of DEVICE_NAMES) {
        const ms = modes[name];
        if (!ms) continue;
        let dev;
        try { dev = await getDevice(name); } catch { continue; }

        for (const mode of ms) {
            let base, base2, pert, rawCalls = 0;
            try {
                // Count unspecified libm calls on the SAME build we diff, with a bare counter and no stack
                // capture. v2904's census computed this separately; doing it here means the at-risk
                // classification and the movement verdict come from one pass over the lab instead of two.
                // That is not just tidiness: instrumenting Math deoptimises those callsites for the rest of the
                // process, so two sweeps in one process cost far more than twice one sweep.
                const orig = {};
                for (const n of UNSPEC) { orig[n] = Math[n].bind(Math); Math[n] = (...a) => { rawCalls++; return orig[n](...a); }; }
                try { base = await dev.build({ mode }); } finally { for (const n of UNSPEC) Math[n] = orig[n]; }
                // CONTROL: build twice unperturbed. v2902's census found the lab has no stochastic input, so any
                // difference here means the device is not deterministic and every sensitivity verdict for it is
                // meaningless -- movement could not be attributed to the perturbation. This check is why the
                // sweep can claim a moved field was moved BY the libm shift.
                base2 = await dev.build({ mode });
                pert = await withPerturbedLibm(() => dev.build({ mode }));
            } catch { continue; }
            if (!base || !pert) continue;

            const control = diffObservables(base, base2);
            const nondet = control.filter((d) => d.moved);
            if (nondet.length) { determinismFailures++; }

            const diffs = diffObservables(base, pert);
            // AT RISK is v2904's verdict reproduced exactly: an unkeyed observable from a build that touched
            // unspecified libm. The point of this sweep is to ask, of that set, which ones actually move.
            const buildPortable = rawCalls === 0;
            const fields = diffs.map((d) => {
                const keyed = KEYED_RE.test(d.field);
                return { ...d, keyed, atRisk: !keyed && !buildPortable };
            });

            let attribution = null;
            if (attribute && fields.some((f) => f.moved)) {
                attribution = {};
                for (const fn of UNSPEC) {
                    let p;
                    try { p = await withPerturbedLibm(() => dev.build({ mode }), { only: [fn] }); } catch { continue; }
                    const moved = diffObservables(base, p).filter((d) => d.moved).map((d) => d.field);
                    if (moved.length) attribution[fn] = moved;
                }
            }

            rows.push({
                device: name, mode, fields, attribution, rawCalls, portable: rawCalls === 0,
                nondeterministic: nondet.map((d) => d.field),
                movedCount: fields.filter((f) => f.moved).length,
                totalCount: fields.length,
                worst: fields.reduce((a, f) => (f.moved && f.relMove > (a?.relMove ?? -1) ? f : a), null),
            });
            if (verbose) console.log(`    ${name}.${mode}: ${fields.filter((f) => f.moved).length}/${fields.length} moved`);
        }
    }

    const all = rows.flatMap((r) => r.fields.map((f) => ({ ...f, device: r.device, mode: r.mode })));
    const unkeyed = all.filter((f) => !f.keyed);
    return {
        rows, determinismFailures,
        summary: {
            deviceModes: rows.length,
            observables: all.length,
            moved: all.filter((f) => f.moved).length,
            unkeyedTotal: unkeyed.length,
            unkeyedMoved: unkeyed.filter((f) => f.moved).length,
            unkeyedStable: unkeyed.filter((f) => !f.moved).length,
            worstAmplification: all.reduce((a, f) => Math.max(a, f.amplification || 0), 0),
            nonPortableModes: rows.filter((r) => !r.portable).length,
            // THE NUMBER THIS ROUND EXISTS TO REPLACE. v2904 reported atRiskTotal as the damage and said in the
            // same breath that it overstated; atRiskMoved is what the perturbation says the damage actually is.
            atRiskTotal: all.filter((f) => f.atRisk).length,
            atRiskMoved: all.filter((f) => f.atRisk && f.moved).length,
            atRiskStable: all.filter((f) => f.atRisk && !f.moved).length,
        },
    };
}

/**
 * PRE-REGISTERED, before the sweep was run, because v2904 measured that this lab has exactly one pre-registered
 * quantity and complaining about that while adding another unregistered round would be absurd.
 *
 * Two predictions, both able to fail:
 *
 *  1. A SUBSTANTIAL MINORITY OF THE 184 ARE INNOCENT. The census's own kerr argument implies false positives, so
 *     at least a fifth of unkeyed observables in non-portable builds should come back bit-identical under a
 *     full-libm ulp shift. If nearly all of them move, the census was not overstating and I was wrong to say so
 *     in the v2904 write-up.
 *
 *  2. THE CHAOTIC QUANTITIES AMPLIFY THE HARDEST. chaos and ising near criticality should show the largest
 *     amplification, because that is what those systems DO to small perturbations. If a well-conditioned device
 *     tops the table instead, something is wrong with the measurement rather than interesting about the physics.
 */
export const SENSITIVITY_REGISTRATION = preRegister({
    quantity: "fraction of at-risk unkeyed observables that are bit-stable under a 1-ulp libm shift",
    claim: { observable: "unkeyedStableFraction", min: 0.2 },
    rationale: "v2904 condemned 184 unkeyed observables on build-level evidence and argued the figure overstates, " +
        "citing kerr: 11 observables tainted by 20 libm calls. If that argument is right, a meaningful fraction " +
        "must survive an actual perturbation. Registering the threshold before measuring so the claim cannot be " +
        "retrofitted to whatever the sweep returns.",
});

export function sensitivityLines(s) {
    const L = [];
    L.push(`libm sensitivity -- ${s.summary.deviceModes} device/modes, ${s.summary.observables} numeric observables`);
    L.push(`  perturbation: every unspecified libm result shifted by ONE ULP, deterministically`);
    L.push(`  moved: ${s.summary.moved} of ${s.summary.observables} observables`);
    L.push(`  unkeyed: ${s.summary.unkeyedMoved} moved, ${s.summary.unkeyedStable} BIT-IDENTICAL under the shift`);
    L.push(`  at-risk (v2904 verdict): ${s.summary.atRiskTotal} -> ${s.summary.atRiskMoved} move, ${s.summary.atRiskStable} BIT-IDENTICAL`);
  L.push(`  worst amplification: ${s.summary.worstAmplification.toExponential(2)} output ulps per input ulp`);
    L.push(`  determinism control: ${s.determinismFailures} device/modes failed to reproduce themselves`);
    return L;
}
