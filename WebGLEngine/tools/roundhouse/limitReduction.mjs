// tools/roundhouse/limitReduction.mjs
//
// v3435 -- THE CHECK I WROTE SIX TIMES BY HAND AND GOT WRONG TWICE.
//
// A general formula with a knob that, at one value, must reproduce a simpler known one. It is everywhere:
//
//     Kerr circular L at a = 0        must give the Schwarzschild circularL
//     seismic Vp at mu = 0            must give the acoustic sound speed
//     Bateman at lambda1 = lambda2    must give the degenerate limit form
//     FDTD at Courant 1               must give d'Alembert exactly
//
// convergenceOrder already owns the OTHER kind of limit -- the one that is APPROACHED, where the answer is the
// rate: halve the step and a second-order error falls by four. This is the kind that is ATTAINED, where the
// limit value is reachable and the question is whether the two forms agree AT it. The two are complementary
// and this delegates rather than reimplementing.
//
// *** AND THE FAILURE MODE IS OVERCLAIMING, NOT MISSING. *** Twice I asserted BIT-IDENTITY from a handful of
// sample points:
//
//   the Kerr reduction is bit-identical at r = 6, 10 and 20 and ONE ULP OFF at r = 50, because the two
//   expressions group their multiplications differently. The gate failed, and the claim was the wrong one --
//   the arithmetic never supported it.
//
// So this measures agreement in ULP across a RANGE and reports the worst, and it will only say "identical" when
// that holds at every point tested. A reduction that is exact at three convenient values and not at the fourth
// is a reduction that agrees to an ULP, and saying so costs nothing.

import { fitOrder } from "./convergenceOrder.mjs";

/** Units in the last place between two doubles -- the honest unit for "how close is exact". */
export function ulpsApart(a, b) {
    if (a === b) return 0;
    if (!Number.isFinite(a) || !Number.isFinite(b)) return Infinity;
    const buf = new DataView(new ArrayBuffer(8));
    const bits = (x) => { buf.setFloat64(0, x); return buf.getBigInt64(0); };
    let ia = bits(a), ib = bits(b);
    if (ia < 0n) ia = (1n << 63n) - ia;
    if (ib < 0n) ib = (1n << 63n) - ib;
    const d = ia > ib ? ia - ib : ib - ia;
    return d > BigInt(Number.MAX_SAFE_INTEGER) ? Infinity : Number(d);
}

/**
 * ATTAINED limit: evaluate the general form at the limiting knob value and compare against the simple form,
 * across a range of the OTHER parameter. The range is the point -- three convenient values prove nothing.
 */
export function attainedLimit(general, simple, points, { identicalIf = 0, closeIf = 4 } = {}) {
    const rows = points.map((p) => {
        const g = general(p), s = simple(p);
        return { p, general: g, simple: s, ulps: ulpsApart(g, s),
                 rel: s !== 0 ? Math.abs(g - s) / Math.abs(s) : Math.abs(g - s) };
    });
    const worst = rows.reduce((m, r) => (r.ulps > m.ulps ? r : m), rows[0]);
    const allIdentical = rows.every((r) => r.ulps <= identicalIf);
    const verdict = allIdentical ? "identical"
                  : worst.ulps <= closeIf ? "within-ulps"
                  : "disagrees";
    return {
        verdict, rows, worstUlps: worst.ulps, worstAt: worst.p,
        worstRel: rows.reduce((m, r) => Math.max(m, r.rel), 0),
        reason: allIdentical
            ? `bit-identical at all ${rows.length} points tested`
            : verdict === "within-ulps"
                ? `agrees to ${worst.ulps} ULP, worst at ${JSON.stringify(worst.p)} -- the two expressions group ` +
                  "their operations differently, so the last bit can land either way. NOT bit-identical, and " +
                  "claiming so would be a stronger statement than the arithmetic supports"
                : `differs by ${worst.ulps} ULP (relative ${worst.rel.toExponential(2)}) at ${JSON.stringify(worst.p)}`,
    };
}

/**
 * APPROACHED limit: the general form tends to the simple one as a knob goes to zero.
 * The VALUE at small knob is the weak check; the ORDER is the strong one -- a wrong linear term still agrees
 * acceptably at small knob while converging at the wrong rate. Delegates the fit to convergenceOrder.
 */
export function approachedLimit(errorAt, knobValues, { expectOrder = null, tol = 0.35 } = {}) {
    const errs = knobValues.map(errorAt);
    const fit = fitOrder(knobValues, errs);
    // fitOrder returns the exponent as `p`, not `order` -- read from its output rather than assumed. Guessing
    // that key returned null and would have reported "could not fit an order" for a clean 2.006 fit with an
    // r-squared of 0.99998, which is a silent null dressed as a refusal.
    const order = fit && fit.ok && typeof fit.p === "number" ? fit.p : null;
    return {
        knobValues, errors: errs, order, fit,
        matchesExpected: expectOrder != null && order != null ? Math.abs(order - expectOrder) <= tol : null,
        reason: order == null
            ? "could not fit an order -- too few usable points or a noise floor reached"
            : expectOrder != null
                ? `fitted order ${order.toFixed(2)} against an expected ${expectOrder}. A wrong LINEAR term would ` +
                  "still agree acceptably at small knob while converging at the wrong rate, which is why the " +
                  "order is the check and the value is not"
                : `fitted order ${order.toFixed(2)}`,
    };
}
