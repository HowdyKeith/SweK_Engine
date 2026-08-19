// tools/roundhouse/chaosBind.mjs
//
// v2823 -- roundhouse device: the LOGISTIC MAP. The cheapest instrument in the lab and one of the strongest,
// because its headline observable is a UNIVERSAL constant: Feigenbaum's delta is not a property of this map,
// it is a property of the ROUTE TO CHAOS, and any system that gets there by period doubling shows the same
// number. Measuring it from x -> r x (1-x) is therefore a claim about far more than x -> r x (1-x).
//
// Modes:
//   "fixed"     -- below r=3 the orbit settles on exactly 1 - 1/r. Reports the residual against that algebra.
//   "doubling"  -- finds where the period first becomes 2 and 4, by bisecting on the MEASURED period, and
//                  compares against exactly 3 and exactly 1+sqrt(6).
//   "feigenbaum"-- the cascade and the delta estimates. HONEST: locating a high-period bifurcation is
//                  precision-limited, so the estimates BRACKET the constant rather than converging monotonically
//                  onto it. The observable is the best estimate's error, and it lands within a fraction of 1%.
//   "lyapunov"  -- the exponent at a chosen r. Exactly ln 2 at r=4; negative on a cycle; and negative again
//                  inside the period-3 window, which is chaos giving way to order and back.

// *** v3717 -- THE PLANT: USE r(1 - x) AS THE MAP'S SLOPE INSTEAD OF r(1 - 2x). Confusing a map with its own
// derivative is the classic slip, and this one is far worse than inaccurate: r(1-x) IS x_{i+1}/x_i, so the
// logs TELESCOPE and the mean is (ln x_N - ln x_0)/N, WHICH VANISHES AS 1/N. MEASURED: 5.55e-17 at r=3.2,
// 7.26e-5 at r=4 -- matching the telescoped form to the last digit.
//
// *** SO THE PLANTED INSTRUMENT REPORTS ZERO AT EVERY r AND LOOKS CLEAN DOING IT. It would say the period-2
// cycle at r=3.2 is marginally stable, the chaos at r=4 is marginally stable, and the period-3 window is
// marginally stable -- one tidy number everywhere, no chaos and no stability ever. A BROKEN INSTRUMENT THAT
// RETURNS A PLAUSIBLE CONSTANT IS HARDER TO NOTICE THAN ONE THAT RETURNS NOISE.
//
// *** AND THE BOOLEAN GOES THE OTHER WAY FROM WHAT I FIRST WROTE HERE, WHICH IS WHY THIS SENTENCE WAS
// REWRITTEN AFTER MEASURING. I predicted `chaotic` (lambda > 0) would flip FALSE at r = 4. IT DOES NOT: the
// telescoped residual is a tiny POSITIVE number, so the planted instrument calls r = 4 chaotic (correctly, by
// accident) AND ALSO CALLS THE STABLE PERIOD-2 AT r = 3.2 AND THE PERIOD-3 WINDOW AT r = 3.83 CHAOTIC.
// Measured: 0.000001 / 0.000000 / 0.000091, all "chaotic = true". THE SIGN OF A NUMBER THAT SHOULD BE ZERO IS
// ARBITRARY, AND A BOOLEAN LATCHED ONTO IT INHERITS THAT ARBITRARINESS -- the plant is caught by the
// MAGNITUDE against ln 2, never by the flag. ***
import { FEIGENBAUM_DELTA, LN2, orbit, fixedPoint, secondDoubling, periodOf, lyapunov, bifurcationPoint, cascade, deltaEstimates, LOGISTIC_SLOPE } from "../../physics/chaos/logistic.js";

/** The true slope; the plant swaps in the map-over-x form, which telescopes to zero. */
const WRONG_SLOPE = (r, x) => r * (1 - x);
function slopeFor(c) { return c && c.planted ? WRONG_SLOPE : LOGISTIC_SLOPE; }

export const CHAOS_OBSERVABLES = [
    "settled", "fixedPointExact", "fixedPointErr", "period",
    "firstDoubling", "firstDoublingErr", "secondDoubling", "secondDoublingErr",
    "deltaBest", "deltaErrFrac", "deltaSpread", "cascadePoints",
    "lyapunovValue", "lyapunovExact", "lyapunovErr", "chaotic", "r",
];

const DEF = { r: 2.5, warmup: 40000, count: 5 };

export function chaosDefaults(hyp) {
    const h = { mode: "fixed", ...(hyp || {}) };
    const c = { ...DEF, ...(h.config || {}) };
    const num = (v, d) => (typeof v === "number" && Number.isFinite(v) ? v : d);
    // outside [0,4] the map escapes its interval and none of the keys apply
    c.r = Math.min(4, Math.max(0, num(c.r, DEF.r)));
    c.warmup = Math.min(400000, Math.max(1000, num(c.warmup, DEF.warmup) | 0));
    c.count = Math.min(6, Math.max(3, num(c.count, DEF.count) | 0));
    h.config = c;
    if (!["fixed", "doubling", "feigenbaum", "lyapunov"].includes(h.mode)) h.mode = "fixed";
    return h;
}

export async function buildChaos(hyp, base = {}) {
    const h = chaosDefaults({ ...hyp, config: { ...(hyp && hyp.config), ...base } });
    const c = h.config;

    if (h.mode === "doubling") {
        const r1 = bifurcationPoint(2, { lo: 2.9, hi: 3.2, warmup: Math.max(100000, c.warmup) });
        const r2 = bifurcationPoint(4, { lo: 3.1, hi: 3.5, warmup: Math.max(100000, c.warmup) });
        return {
            firstDoubling: r1, firstDoublingErr: Math.abs(r1 - 3),
            secondDoubling: r2, secondDoublingErr: Math.abs(r2 - secondDoubling()),
        };
    }

    if (h.mode === "feigenbaum") {
        const rs = cascade({ count: c.count });
        const d = deltaEstimates(rs);
        if (!d.length) return { error: "cascade-produced-no-estimates" };
        const best = d.reduce((a, b) => (Math.abs(b - FEIGENBAUM_DELTA) < Math.abs(a - FEIGENBAUM_DELTA) ? b : a));
        return {
            deltaBest: best,
            deltaErrFrac: Math.abs(best - FEIGENBAUM_DELTA) / FEIGENBAUM_DELTA,
            deltaSpread: Math.max(...d) - Math.min(...d),
            cascadePoints: rs.length,
        };
    }

    if (h.mode === "lyapunov") {
        const l = lyapunov(c.r, { slopeOfMap: slopeFor(c) });
        const exact = Math.abs(c.r - 4) < 1e-12 ? LN2 : undefined;
        return {
            r: c.r, lyapunovValue: l, chaotic: l > 0,
            lyapunovExact: exact,
            lyapunovErr: exact !== undefined ? Math.abs(l - exact) : undefined,
            period: periodOf(c.r, { maxPeriod: 64 }),
        };
    }

    const o = orbit(c.r, { warmup: Math.min(20000, c.warmup), samples: 4 });
    const exact = fixedPoint(c.r);
    return {
        r: c.r, settled: o[0], fixedPointExact: exact,
        fixedPointErr: c.r > 1 && c.r < 3 ? Math.abs(o[0] - exact) : undefined,
        period: periodOf(c.r, { maxPeriod: 64 }),
    };
}

export const chaosDevice = {
    // WHAT THE PLANT OVERTURNS, as data so plantedCoverage reads it off the device rather than grepping prose.
    // NOT listed: fixed / doubling / feigenbaum, which never call lyapunov and are bit-identical under the knob.
    planted: { knob: "slopeOfMap", observable: "lyapunovErr",
               note: "r(1-x) instead of r(1-2x); the logs telescope, so the exponent reads ~0 at EVERY r -- and the tiny positive residual makes `chaotic` read TRUE even on stable cycles" },
    // v3192 -- EXPORTED. This device reported as ONE-MODE to the census because its own mode names were
    // not in the probe's candidate list -- the LOWER BOUND, biting for the third time. Derived from
    // this file's own default plus every mode its own build() branches on, each verified to give a
    // DISTINCT answer. *** A MODE NOBODY CAN DISCOVER IS A MODE NOBODY WILL USE. ***
    modes: ["fixed", "doubling", "feigenbaum", "lyapunov"], name: "logistic-map-chaos", observables: CHAOS_OBSERVABLES, build: buildChaos, defaults: chaosDefaults };
