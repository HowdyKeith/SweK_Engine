// WebGLEngine/tools/roundhouse/convergenceOrder.mjs -- v3414
//
// *** THE ORDER IS THE ANSWER KEY, AND THE REFUSAL IS THE LOAD-BEARING HALF. ***
//
// Halve the step and a second-order scheme's error falls by four; a fourth-order scheme's by sixteen. That is the
// standard check in computational physics and this lab did it in exactly two places (gyroscope's 4.002 ratio,
// twobody's residual floor) out of sixty-three devices. AN ORDER IS A STRONGER KEY THAN A MAGNITUDE: a wrong
// constant fails one number, a wrong ORDER says the scheme is not what its author thinks it is.
//
// BUT THE FIRST TWO CANDIDATES COULD NOT BE USED, AND THAT IS WHY THE REFUSAL CAME FIRST:
//
//   twobody.periodErrFrac    7.89e-4 / 1.97e-4 / 6.58e-5 / 1.64e-5 / EXACTLY ZERO
//                            ratios 4.00, 3.00, 4.00, infinity
//   figureeight.energyDriftFrac   1.0 at 2000, 4000, 8000 and 16000 steps
//
// The first is A QUANTISATION OFFSET, not a truncation error: the period is measured by COUNTING STEPS, so it
// lands exactly on a step boundary at 3200 and reads zero. The second is SATURATED. *** A LEAST-SQUARES FIT
// THROUGH EITHER RETURNS A CONFIDENT, MEANINGLESS EXPONENT, and "a quantisation offset as accumulated drift" is
// already in this tree's own list of failures. A TOOL THAT REPORTED p FOR THOSE WOULD BE WORSE THAN NO TOOL. ***
//
// So every sequence must pass four tests before a number is offered, and each refusal NAMES ITSELF rather than
// returning a p with a caveat -- a caveat beside a number is read as the number.
"use strict";

/** The refinement knobs a device might expose. Matched by NAME because a resolution knob is a naming convention,
 *  not a type -- and the alternative, guessing from the value, would call every integer a step count. */
export const KNOB_NAMES = /^(stepsPerOrbit|steps|substeps|nx|ny|nz|n|grid|cells|dt|res|resolution|samples|iters)$/;

/**
 * Where a device keeps its knobs. TWO SHAPES, AND MY FIRST CENSUS ONLY KNEW ONE: figureeight returns
 * { mode, steps } FLAT while twobody returns { mode, config: { stepsPerOrbit, ... } } NESTED. Reading the top
 * level alone reported ONE device of sixty-three; reading both reports TWENTY-SIX. THE IMPLAUSIBLE NUMBER IS
 * WHAT CAUGHT IT -- one of sixty-three is not a census, it is a bug with a value.
 */
export function resolutionKnobs(defaults) {
    if (!defaults || typeof defaults !== "object") return [];
    const flat = Object.keys(defaults).filter((k) => KNOB_NAMES.test(k));
    const nested = defaults.config && typeof defaults.config === "object"
        ? Object.keys(defaults.config).filter((k) => KNOB_NAMES.test(k)) : [];
    return [...new Set([...flat, ...nested])];
}

/** Does this device put its knobs under `config`? The caller has to know to pass them the same way. */
export function knobsAreNested(defaults, knob) {
    return !!(defaults && defaults.config && knob in defaults.config);
}

export const MIN_POINTS = 3;
// *** MEASURED, NOT CHOSEN -- AND THE FIRST VALUE I PICKED LET THE ADVERSARIAL CASE THROUGH. *** At 0.35 the
// real twobody sequence FIT CLEANLY: p = 1.834 with r-squared 0.9979, which is exactly the confident meaningless
// number this tool exists to refuse. ITS PER-STEP EXPONENTS ARE 2.000, 1.585, 2.000 -- a spread of 0.232 -- and
// the 1.585 is log2(3), the tell that the period jumped THREE step-widths instead of four.
//
// AND r-SQUARED DOES NOT CATCH IT, WHICH IS THE POINT WORTH KEEPING: a quantised sequence is still very nearly a
// straight line in log-log, so goodness-of-fit says nothing about whether the thing being fitted is a truncation
// error. ONLY THE AGREEMENT BETWEEN CONSECUTIVE HALVINGS SEPARATES THEM.
//
// Measured spreads: an exact h^2 sequence 0.000, h^4 0.000, h^1 0.000; twobody's quantised period 0.232. The bar
// sits between them at 0.15 -- a real scheme's halvings agree to a few percent, and anything that disagrees by a
// sixth is not one number.
export const RATIO_SPREAD = 0.15;

/**
 * Fit err ~ C h^p over a refinement sequence, or REFUSE and say why.
 *
 * `hs` are step SIZES (so halving h halves the entry). Errors are absolute.
 * Returns { ok, p, r2, ratios } or { ok:false, refused, why }.
 */
export function fitOrder(hs, errs) {
    if (!Array.isArray(hs) || hs.length < MIN_POINTS || hs.length !== errs.length) {
        return { ok: false, refused: "too-few-points", why: `need at least ${MIN_POINTS} refinements, got ${hs.length}` };
    }
    // (1) AN EXACT ZERO IS NOT CONVERGENCE, IT IS A COINCIDENCE. log(0) is -Infinity and a fit would swallow it.
    const zeroAt = errs.findIndex((e) => !(Math.abs(e) > 0));
    if (zeroAt >= 0) {
        return { ok: false, refused: "exact-zero",
            why: `error is EXACTLY ZERO at h=${hs[zeroAt]} -- a discretised measurement landing on a grid line, ` +
                 `not a scheme converging. twobody.periodErrFrac does this at 3200 steps` };
    }
    const a = errs.map(Math.abs);
    // (2) SATURATION: the error does not move at all. figureeight.energyDriftFrac reads 1.0 at every step count.
    const spread = Math.max(...a) / Math.min(...a);
    if (spread < 1.05) {
        return { ok: false, refused: "saturated",
            why: `error is ${a[0].toExponential(3)} at every refinement (spread ${spread.toFixed(4)}x) -- ` +
                 `nothing is converging, so there is no order to report` };
    }
    // (3) IT MUST FALL. An error that grows or wanders is measuring something other than truncation.
    for (let i = 1; i < a.length; i++) {
        if (!(a[i] < a[i - 1])) {
            return { ok: false, refused: "not-monotone",
                why: `error rose from ${a[i - 1].toExponential(3)} to ${a[i].toExponential(3)} between h=${hs[i - 1]} ` +
                     `and h=${hs[i]} -- a truncation error cannot do that, so something else dominates (a floor, a plant, or noise)` };
        }
    }
    // (4) THE RATIOS MUST AGREE. This is what separates a real order from a fit that merely has a slope: p is
    // only meaningful if EVERY halving gives the same factor. twobody's 4.00 / 3.00 / 4.00 fails here and the
    // failure IS the quantisation showing.
    const ratios = [];
    for (let i = 1; i < a.length; i++) ratios.push(Math.log(a[i - 1] / a[i]) / Math.log(hs[i - 1] / hs[i]));
    const pMin = Math.min(...ratios), pMax = Math.max(...ratios), pMid = (pMin + pMax) / 2;
    if (pMid > 0 && (pMax - pMin) / pMid > RATIO_SPREAD) {
        return { ok: false, refused: "inconsistent-ratio",
            why: `per-step exponents ${ratios.map((r) => r.toFixed(2)).join(", ")} disagree by ` +
                 `${(100 * (pMax - pMin) / pMid).toFixed(0)}% -- A SINGLE FITTED p WOULD AVERAGE A REAL ORDER ` +
                 `TOGETHER WITH WHATEVER ELSE IS IN THE SEQUENCE` };
    }
    // Least squares on log h against log err. THE SLOPE IS p.
    const x = hs.map(Math.log), y = a.map(Math.log), n = x.length;
    const mx = x.reduce((s, v) => s + v, 0) / n, my = y.reduce((s, v) => s + v, 0) / n;
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; }
    const p = sxy / sxx;
    const r2 = syy > 0 ? (sxy * sxy) / (sxx * syy) : 1;
    return { ok: true, p, r2, ratios };
}

/** Sweep one observable of one device over a refinement sequence. */
export async function sweep(device, { mode, knob, values, observable, config = {}, nested = false }) {
    const hs = [], errs = [];
    for (const v of values) {
        const cfg = nested ? { ...config, [knob]: v } : { [knob]: v };
        const built = await device.build(nested ? { mode, config: cfg } : { mode, ...cfg, config });
        const e = built && built[observable];
        if (typeof e !== "number" || !Number.isFinite(e)) {
            return { ok: false, refused: "not-a-number", why: `${observable} is ${e} at ${knob}=${v}` };
        }
        hs.push(1 / v);          // more steps = smaller h
        errs.push(e);
    }
    const fit = fitOrder(hs, errs);
    return { ...fit, knob, observable, values, errs };
}
