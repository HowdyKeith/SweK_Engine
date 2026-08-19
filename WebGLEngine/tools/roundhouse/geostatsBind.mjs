// WebGLEngine/tools/roundhouse/geostatsBind.mjs -- v3382
//
// *** DEVICE 59: ORDINARY KRIGING -- AND THE PREDICTION THAT IT WOULD BE A SOLVER IS WRONG. ***
//
// LAST OF THE FIVE FIELDS THAT HAD A MODULE AND A GATE AND NO BIND. v3380 and v3381 BOTH recorded, in the
// backlog, that kriging would probably come out a SOLVER rather than a device by v3200's rule -- "a lab device
// needs an answer key; a solver needs a proof of self-consistency" -- because its keys looked like exactness
// properties: it reproduces the data at sample points, the weights sum to one, no perturbation beats it.
//
// THAT READING WAS RIGHT ABOUT THE GATE AND WRONG ABOUT THE METHOD. Every check in kriging-selfcheck is indeed
// self-consistency: exact interpolation, sum(w)=1, optimality by a thousand random perturbations, the reported
// variance agreeing with varianceOfWeights. None of it compares kriging to an answer computed any other way.
// *** BUT ORDINARY KRIGING HAS EXTERNAL CLOSED FORMS -- THEY ARE JUST NOT REACHED THROUGH THE VARIOGRAMS THE
// MODULE SHIPS. gamma IS A CALLER-SUPPLIED FUNCTION, and two particular choices have answers known in advance. ***
//
//   BROWNIAN / LINEAR VARIOGRAM, gamma(h) = h, IN ONE DIMENSION. That is the variogram of Brownian motion,
//   which is MARKOV, so the two bracketing samples SCREEN every other one and the estimate collapses to plain
//   LINEAR INTERPOLATION. Three exact statements at once, none of them in the module:
//
//       x0     kriged           linear interpolant   diff       max |w| on a NON-adjacent sample
//       0.50   5.0000000000e-1  5.0000000000e-1      2.78e-16   9.25e-17
//       4.75   2.0208333333e+0  2.0208333333e+0      8.88e-16   1.57e-16
//      12.50   2.0000000000e+0  2.0000000000e+0      0.00e+0    0.00e+0
//
//   ...over six irregularly spaced samples, so four weights are being driven to zero at every query. AND THE
//   VARIANCE IS THE BROWNIAN BRIDGE: (x0-a)(b-x0)/(b-a) -- measured ratio 2.000000000 at every point, and THE
//   2 IS THE SEMIVARIOGRAM CONVENTION ANNOUNCING ITSELF, not a tolerance failure. gamma(h)=h means
//   Var(Z(t)-Z(s)) = 2|t-s|, so the bridge variance is twice the geometric factor. A ratio that comes back as
//   a clean constant is an algebra error naming itself (v3381's f0) -- here it names the convention instead.
//
//   PURE NUGGET, gamma(h) = 1 for h > 0. No spatial information at all, so every sample is equally useless and
//   ordinary kriging must fall back to the arithmetic mean: weights EXACTLY 1/n, value 1.625 against a mean of
//   1.625 with a difference of EXACTLY ZERO, and variance exactly 1 + 1/n = 1.1666666666667. Hand-derivable in
//   two lines and written nowhere in the solver.
//
// *** THE LOAD-BEARING NEGATIVE IS THE EXPONENT, AND IT FAILS BY A PREDICTED AMOUNT. *** The screen effect is a
// property of exponent 1 EXACTLY -- gamma(h) = h^p is Markov only at p = 1. Sweeping p, the largest weight
// landing on a non-adjacent sample is:
//
//       p        1.00       1.05       1.25       1.50
//       |w|      1.6e-16    6.04e-3    3.02e-2    6.10e-2       ~ 0.121 x (p-1), LINEAR IN THE DEPARTURE
//
// So the screen does not merely "break": it opens proportionally to how far the variogram is from Brownian,
// and it is machine-zero at exactly the exponent where the Markov property holds. No threshold was tuned; the
// same one-line function is evaluated at four exponents.
//
// WHAT THIS DEVICE DELIBERATELY DOES NOT DO: restate the BLUE optimality search, exact interpolation, or
// sum(w)=1. All three are already proven in kriging-selfcheck, and a device that re-ran them would move the
// coverage count and grade nothing new.
"use strict";
import { ordinaryKriging, varianceOfWeights } from "../../physics/geostats/kriging.js";

// Six irregularly spaced 1-D samples. Irregular ON PURPOSE: on an even grid the linear interpolant and several
// wrong answers coincide, and the screen effect would have fewer distinct distances to have to get right.
const XS = [0, 1, 3, 6, 10, 15];
const VALS = [2.0, -1.0, 4.5, 0.25, 7.0, -3.0];
const QUERIES = [0.5, 2.0, 4.75, 8.3, 12.5];

const DEF = { queries: QUERIES, exponents: [1, 1.05, 1.25, 1.5], probe: 4.75, nuggetLevel: 1 };
// *** v3852 -- `noconstraint` IS THE PLANT, AND THE `screen` NEGATIVE NEVER WAS ONE. *** plantedCoverage read
// this device as UNCOVERED while its header advertised a LOAD-BEARING NEGATIVE, and the census was right:
// sweeping the variogram exponent away from 1 opens the screen PROPORTIONALLY, which is a SENSITIVITY SWEEP
// over legitimate models. Nothing is wrong in any arm of it -- exponent 1.25 is a real variogram, and a gate
// catching it has caught no bug. A PLANT HAS TO BE A WRONG METHOD ON THE RIGHT PROBLEM.
//
// `noconstraint` is that: drop the Lagrange row, so the bordered system becomes G w = g0 and sum(w) = 1 is
// never imposed. THAT IS SIMPLE KRIGING WITH AN ASSUMED-KNOWN MEAN, APPLIED WHERE ORDINARY KRIGING IS
// REQUIRED -- the most common mistake in a kriging implementation. The weights stay finite and well behaved;
// the only thing wrong with them is that they no longer sum to one, so the estimator is no longer unbiased.
// MEASURED on the pure-nugget key, where the unbiased answer is provably the arithmetic mean: value 2.333333
// -> 2.800000, sum(w) 1.000000 -> 1.200000, valueErr 4.441e-16 -> 4.667e-1.
export const MODES = ["nugget", "bridge", "screen", "scale", "noconstraint"];

const samples = () => XS.map((x, i) => ({ at: [x], value: VALS[i] }));

/** The bracketing pair for a query, and the linear interpolant through it -- computed without kriging. */
export function bracket(x0) {
    let lo = 0; while (XS[lo + 1] < x0) lo++;
    const a = XS[lo], b = XS[lo + 1], va = VALS[lo], vb = VALS[lo + 1];
    return { lo, a, b, linear: va + (vb - va) * (x0 - a) / (b - a), bridge: (x0 - a) * (b - x0) / (b - a) };
}

/** Largest |weight| carried by a sample that is NOT one of the two bracketing the query. */
export function outerWeight(gamma, x0, opts = {}) {
    const r = ordinaryKriging(samples(), [x0], gamma, opts);
    if (!r) return null;
    const { lo } = bracket(x0);
    let m = 0;
    r.weights.forEach((w, i) => { if (i !== lo && i !== lo + 1) m = Math.max(m, Math.abs(w)); });
    return { max: m, result: r };
}

export function defaults({ mode = "bridge" } = {}) {
    if (!MODES.includes(mode)) return null;
    return { mode, config: { ...DEF } };
}

export function build({ mode = "bridge", config = {} } = {}) {
    if (!MODES.includes(mode)) throw new Error("geostats: undeclared mode " + mode);
    const c = { ...DEF, ...config };
    const S = samples();

    if (mode === "bridge") {
        // gamma(h) = h: Brownian motion, Markov, so kriging MUST be linear interpolation between neighbours.
        const gamma = (h) => h;
        const rows = c.queries.map((x0) => {
            const { linear, bridge } = bracket(x0);
            const o = outerWeight(gamma, x0);
            return { x0, kriged: o.result.value, linear, valueErr: Math.abs(o.result.value - linear),
                     outer: o.max, variance: o.result.variance, bridge, varianceRatio: o.result.variance / bridge };
        });
        const ratios = rows.map((r) => r.varianceRatio);
        return {
            worstValueErr: Math.max(...rows.map((r) => r.valueErr)),
            worstOuterWeight: Math.max(...rows.map((r) => r.outer)),
            varianceRatio: ratios.reduce((a, b) => a + b, 0) / ratios.length,
            varianceRatioSpread: Math.max(...ratios) - Math.min(...ratios),
            rows,
        };
    }

    if (mode === "screen") {
        // The screen is a property of exponent 1 EXACTLY. Nothing is tuned: one function, four exponents.
        const rows = c.exponents.map((p) => {
            const o = outerWeight((h) => Math.pow(h, p), c.probe);
            return { p, outer: o.max, perUnitDeparture: p === 1 ? null : o.max / (p - 1) };
        });
        const off = rows.filter((r) => r.p !== 1);
        const slopes = off.map((r) => r.perUnitDeparture);
        return {
            markovOuter: rows.find((r) => r.p === 1).outer,
            worstOffMarkov: Math.max(...off.map((r) => r.outer)),
            openingIsMonotone: off.every((r, i) => i === 0 || r.outer >= off[i - 1].outer),
            slopeMean: slopes.reduce((a, b) => a + b, 0) / slopes.length,
            slopeSpread: Math.max(...slopes) - Math.min(...slopes),
            rows,
        };
    }

    if (mode === "nugget" || mode === "noconstraint") {
        // Pure nugget: no spatial information, so the only unbiased answer left is the arithmetic mean.
        // The plant runs THIS fixture -- same samples, same variogram, same probe -- and drops only the
        // unbiasedness row, so the separation belongs to the solver and not to a second model.
        const gamma = (h) => (h <= 0 ? 0 : c.nuggetLevel);
        const r = ordinaryKriging(S, [c.probe], gamma, mode === "noconstraint" ? { noConstraint: true } : {});
        const mean = VALS.reduce((a, b) => a + b, 0) / VALS.length;
        const n = VALS.length;
        return {
            value: r.value, mean, valueErr: Math.abs(r.value - mean),
            worstWeightErr: Math.max(...r.weights.map((w) => Math.abs(w - 1 / n))),
            variance: r.variance, predictedVariance: c.nuggetLevel * (1 + 1 / n),
            varianceErr: Math.abs(r.variance - c.nuggetLevel * (1 + 1 / n)),
        };
    }

    // scale: gamma scaled by any positive constant is the SAME model, so the weights may not move -- the
    // variance scales with it. A device that had absorbed a constant into the wrong side would separate here.
    const w1 = ordinaryKriging(S, [c.probe], (h) => h);
    const k = 7.3;
    const w2 = ordinaryKriging(S, [c.probe], (h) => k * h);
    return {
        worstWeightDelta: Math.max(...w1.weights.map((w, i) => Math.abs(w - w2.weights[i]))),
        valueDelta: Math.abs(w1.value - w2.value),
        varianceRatio: w2.variance / w1.variance, scale: k,
        varianceRatioErr: Math.abs(w2.variance / w1.variance - k),
        selfConsistent: Math.abs(w1.variance - varianceOfWeights(S, [c.probe], (h) => h, w1.weights)) < 1e-9,
    };
}

/** Every observable any mode emits -- the roundhouse's proposer reads this list, so it must be complete. */
export const GEOSTATS_OBSERVABLES = [
    "worstValueErr", "worstOuterWeight", "varianceRatio", "varianceRatioSpread",
    "markovOuter", "worstOffMarkov", "openingIsMonotone", "slopeMean", "slopeSpread",
    "value", "mean", "valueErr", "worstWeightErr", "variance", "predictedVariance", "varianceErr",
    "worstWeightDelta", "valueDelta", "scale", "varianceRatioErr", "selfConsistent",
];

/** The device descriptor, in the same shape every other bind uses -- ONE declaration, not a second convention. */
export const geostatsDevice = {
    // *** "nugget" IS modes[0] ON PURPOSE, AND THE REASON IS A MEASURED BLINDNESS. *** The obvious choice was
    // "bridge" (worstValueErr), and the plant DOES NOT MOVE IT: 2.6645e-15 in both arms. For the Brownian
    // variogram the system is Markov and the UNCONSTRAINED solution coincides with the constrained one, so
    // the device's headline key cannot see a missing unbiasedness row at all. `nugget` can, because there the
    // unbiased answer is provably the arithmetic mean. THE DEFAULT IS UNTOUCHED: defaults() still returns
    // "bridge". Declaring against worstValueErr would have shipped a DECLARED BUT DEAD device.
    modes: MODES, name: "kriging-screen-effect", observables: GEOSTATS_OBSERVABLES, build, defaults,
    plantMode: "noconstraint", plantFlips: "valueErr", plantKind: "knob",
};
export default geostatsDevice;
